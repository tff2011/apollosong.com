import { getSunoStylePrompt } from "./genre-mapping";
import type { SunoGenerationParams, SunoGenerationResult, SunoGeneratedSong } from "./types";

const KIE_BASE_URL = (process.env.KIE_BASE_URL || "https://api.kie.ai/api/v1").replace(/\/$/, "");
const DEFAULT_MODEL = process.env.KIE_SUNO_MODEL || "V4_5";
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_HTTP_TIMEOUT_MS = 60 * 1000;
const MAX_TRACKS = 2;

const FAILED_STATUSES = new Set([
    "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED",
    "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR",
]);

type KieResponse<T> = {
    code: number;
    msg: string;
    data: T;
};

type KieGenerateData = {
    taskId: string;
};

type KieTrack = {
    id?: string;
    audioUrl?: string;
    streamAudioUrl?: string;
    title?: string;
    duration?: number;
};

type KieTaskDetails = {
    taskId: string;
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    response?: {
        taskId?: string;
        sunoData?: KieTrack[];
    };
};

export class KieRateLimitError extends Error {
    retryAfterMs?: number;
    status: number;

    constructor(message: string, status: number, retryAfterMs?: number) {
        super(message);
        this.name = "KieRateLimitError";
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

function parseBooleanEnv(value: string | undefined): boolean | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
}

export function isKieSunoEnabled(): boolean {
    const envFlag = parseBooleanEnv(process.env.SUNO_KIE_ENABLED);
    if (envFlag === false) return false;
    return Boolean(process.env.KIE_API_KEY);
}

function getKieApiKey(): string {
    const key = process.env.KIE_API_KEY;
    if (!key) {
        throw new Error("KIE_API_KEY nao configurada");
    }
    return key;
}

function getPollIntervalMs(): number {
    const parsed = Number.parseInt(process.env.KIE_SUNO_POLL_INTERVAL_MS || "", 10);
    if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_POLL_INTERVAL_MS;
    return parsed;
}

function getPollTimeoutMs(): number {
    const parsed = Number.parseInt(process.env.KIE_SUNO_POLL_TIMEOUT_MS || "", 10);
    if (!Number.isFinite(parsed) || parsed < 30_000) return DEFAULT_POLL_TIMEOUT_MS;
    return parsed;
}

function getHttpTimeoutMs(): number {
    const parsed = Number.parseInt(process.env.KIE_SUNO_HTTP_TIMEOUT_MS || "", 10);
    if (!Number.isFinite(parsed) || parsed < 5_000) return DEFAULT_HTTP_TIMEOUT_MS;
    return parsed;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeTitle(recipientName: string): string {
    const base = String(recipientName || "Custom Song").trim() || "Custom Song";
    const cleaned = base.replace(/\s+/g, " ").trim();
    return cleaned.slice(0, 80);
}

function getTrackAudioUrl(track: KieTrack): string | null {
    if (track.audioUrl) return track.audioUrl;
    if (track.streamAudioUrl) return track.streamAudioUrl;
    return null;
}

function getTaskErrorMessage(task: KieTaskDetails): string {
    const parts = [task.errorCode, task.errorMessage].filter(Boolean);
    if (parts.length > 0) return parts.join(" - ");
    return `status=${task.status}`;
}

function isLyricsReferencePolicyErrorMessage(message: string): boolean {
    const text = message.toLowerCase();
    return (
        text.includes("producer tag") ||
        text.includes("specific artist") ||
        text.includes("specific artists") ||
        text.includes("don't reference") ||
        text.includes("do not reference") ||
        text.includes("nao referenc") ||
        text.includes("não referenc")
    );
}

function sanitizeLyricsForReferencePolicy(lyrics: string): { prompt: string; changed: boolean } {
    const original = lyrics;
    let sanitized = lyrics;

    // Known producer-tag phrase frequently rejected by Kie/Suno moderation.
    sanitized = sanitized.replace(/\bque\s+deli[cç]ia\b/gi, "que maravilha");

    // Remove direct producer-tag fragments inline.
    sanitized = sanitized
        .replace(/\bproducer\s*tag\b[^,\n)]*/gi, "")
        .replace(/\btag\s+do\s+produtor\b[^,\n)]*/gi, "")
        .replace(/\b(?:prod\.?|prod by|produced by)\s+[^,\n)]*/gi, "");

    // Remove explicit artist-mention patterns commonly used as tags.
    sanitized = sanitized
        .replace(/\b(?:feat\.?|ft\.?)\s+[@\wÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ .&'-]{0,40}/gi, "")
        .replace(/\b(?:mc|dj)\s+[@\wÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ .&'-]{0,40}/gi, "");

    const lines = sanitized.split(/\r?\n/);
    const filteredLines = lines.filter((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return true;

        const lineLower = line.toLowerCase();
        const isBracketed = /^\[.*\]$/.test(line) || /^\(.*\)$/.test(line);
        const shortLine = line.split(/\s+/).length <= 5;
        const looksLikeTag = (
            lineLower.includes("producer tag") ||
            lineLower.includes("tag do produtor") ||
            /\b(?:prod\.?|produtor(?:a)?|dj|mc|feat\.?|ft\.?)\b/i.test(line)
        );

        // Drop likely tag/adlib lines especially when they appear at intro.
        if (looksLikeTag && (isBracketed || shortLine || index <= 2)) {
            return false;
        }

        return true;
    });

    sanitized = filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!sanitized) {
        return { prompt: original, changed: false };
    }

    return { prompt: sanitized, changed: sanitized !== original };
}

function parseRetryAfterMs(response: Response): number | undefined {
    const retryAfter = response.headers.get("retry-after");
    if (!retryAfter) return undefined;

    const asSeconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
        return asSeconds * 1000;
    }

    const asDateMs = Date.parse(retryAfter);
    if (Number.isFinite(asDateMs)) {
        return Math.max(0, asDateMs - Date.now());
    }

    return undefined;
}

function tryParseJson(input: string): unknown {
    try {
        return JSON.parse(input);
    } catch {
        return null;
    }
}

async function fetchJsonWithTimeout<T>(
    url: string,
    init: RequestInit,
    timeoutMs = getHttpTimeoutMs()
): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...init,
            signal: controller.signal,
        });

        const rawBody = await response.text();
        const parsedBody = tryParseJson(rawBody);
        const json = parsedBody as { msg?: string } | null;

        if (!response.ok) {
            const message = json?.msg || `HTTP ${response.status}`;
            if (response.status === 429) {
                const retryAfterMs = parseRetryAfterMs(response);
                const retryHint = retryAfterMs ? ` Retry after ${Math.ceil(retryAfterMs / 1000)}s.` : "";
                throw new KieRateLimitError(`${message}${retryHint}`, response.status, retryAfterMs);
            }
            throw new Error(message);
        }

        if (parsedBody == null) {
            throw new Error("Kie returned invalid JSON response");
        }

        return parsedBody as T;
    } finally {
        clearTimeout(timeout);
    }
}

async function createTask(params: {
    apiKey: string;
    prompt: string;
    style: string;
    title: string;
}): Promise<string> {
    const payload = {
        prompt: params.prompt,
        customMode: true,
        instrumental: false,
        model: DEFAULT_MODEL,
        style: params.style,
        title: params.title,
        ...(process.env.KIE_CALLBACK_URL ? { callBackUrl: process.env.KIE_CALLBACK_URL } : {}),
    };

    const json = await fetchJsonWithTimeout<KieResponse<KieGenerateData>>(
        `${KIE_BASE_URL}/generate`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${params.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );

    if (json.code !== 200 || !json.data?.taskId) {
        throw new Error(json.msg || "Falha ao criar task na Kie");
    }

    return json.data.taskId;
}

async function getTaskDetails(apiKey: string, taskId: string): Promise<KieTaskDetails> {
    const url = new URL(`${KIE_BASE_URL}/generate/record-info`);
    url.searchParams.set("taskId", taskId);

    const json = await fetchJsonWithTimeout<KieResponse<KieTaskDetails>>(
        url.toString(),
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            cache: "no-store",
        }
    );

    if (json.code !== 200 || !json.data) {
        throw new Error(json.msg || "Falha ao consultar task na Kie");
    }

    return json.data;
}

async function waitForTaskCompletion(apiKey: string, taskId: string): Promise<KieTaskDetails> {
    const pollIntervalMs = getPollIntervalMs();
    const timeoutMs = getPollTimeoutMs();
    const startedAt = Date.now();
    const expiresAt = startedAt + timeoutMs;
    let lastStatus = "";

    while (Date.now() < expiresAt) {
        const task = await getTaskDetails(apiKey, taskId);

        if (task.status !== lastStatus) {
            console.log(`[Suno/Kie] Task ${taskId} status: ${task.status}`);
            lastStatus = task.status;
        }

        if (task.status === "SUCCESS") {
            return task;
        }

        if (FAILED_STATUSES.has(task.status)) {
            throw new Error(`Kie task failed (${getTaskErrorMessage(task)})`);
        }

        await sleep(pollIntervalMs);
    }

    throw new Error(`Kie task timeout after ${Math.round(timeoutMs / 1000)}s (${taskId})`);
}

async function downloadTrackAsBuffer(url: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getHttpTimeoutMs());

    try {
        const res = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
        });
        if (!res.ok) {
            throw new Error(`Falha no download do audio (HTTP ${res.status})`);
        }
        const bytes = await res.arrayBuffer();
        return Buffer.from(bytes);
    } finally {
        clearTimeout(timeout);
    }
}

function toGeneratedSong(track: KieTrack, fallbackTitle: string, mp3Buffer: Buffer): SunoGeneratedSong {
    const title = (track.title || "").trim() || fallbackTitle;
    const durationSeconds = Number.isFinite(track.duration) ? Math.max(0, Math.round(track.duration as number)) : 0;
    return {
        title,
        durationSeconds,
        mp3Buffer,
        kieAudioId: track.id,
    };
}

export async function generateSongsViaKieApi(params: SunoGenerationParams): Promise<SunoGenerationResult> {
    const apiKey = getKieApiKey();

    const stylePrompt = await getSunoStylePrompt(params.genre, params.locale, params.vocals);
    const title = safeTitle(params.recipientName);
    const originalPrompt = params.lyrics;
    const existingTaskId = (params.existingTaskId || "").trim();

    const runGenerationAttempt = async (
        prompt: string,
        allowExistingTaskReuse: boolean
    ): Promise<KieTaskDetails> => {
        let taskId = allowExistingTaskReuse ? existingTaskId : "";
        const createAndPersistTask = async (): Promise<string> => {
            const newTaskId = await createTask({
                apiKey,
                prompt,
                style: stylePrompt,
                title,
            });

            console.log(`[Suno/Kie] Task criada para order ${params.orderId}: ${newTaskId} (${DEFAULT_MODEL})`);

            if (params.onTaskCreated) {
                try {
                    await params.onTaskCreated(newTaskId);
                } catch (error) {
                    console.warn(`[Suno/Kie] Falha ao persistir taskId ${newTaskId} para order ${params.orderId}:`, error);
                }
            }

            return newTaskId;
        };

        if (taskId) {
            console.log(`[Suno/Kie] Reutilizando task existente para order ${params.orderId}: ${taskId}`);

            try {
                const existingTask = await getTaskDetails(apiKey, taskId);
                if (FAILED_STATUSES.has(existingTask.status)) {
                    console.warn(
                        `[Suno/Kie] Task reutilizada ${taskId} ja falhou (${existingTask.status}). Criando nova task para order ${params.orderId}.`
                    );
                    taskId = await createAndPersistTask();
                }
            } catch (error) {
                console.warn(
                    `[Suno/Kie] Falha ao validar task reutilizada ${taskId} para order ${params.orderId}. Criando nova task.`,
                    error
                );
                taskId = await createAndPersistTask();
            }
        } else {
            taskId = await createAndPersistTask();
        }

        let task: KieTaskDetails;
        try {
            task = await waitForTaskCompletion(apiKey, taskId);
        } catch (error) {
            // If an old persisted task fails while polling, do one immediate recovery by creating a fresh task.
            if (
                allowExistingTaskReuse &&
                existingTaskId &&
                taskId === existingTaskId &&
                error instanceof Error &&
                error.message.startsWith("Kie task failed")
            ) {
                console.warn(
                    `[Suno/Kie] Task reutilizada ${taskId} falhou durante polling. Criando nova task para order ${params.orderId}.`
                );
                taskId = await createAndPersistTask();
                task = await waitForTaskCompletion(apiKey, taskId);
            } else {
                throw error;
            }
        }

        return task;
    };

    let task: KieTaskDetails;
    try {
        task = await runGenerationAttempt(originalPrompt, true);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isLyricsReferencePolicyErrorMessage(message)) {
            throw error;
        }

        const sanitized = sanitizeLyricsForReferencePolicy(originalPrompt);
        if (!sanitized.changed) {
            throw error;
        }

        console.warn(
            `[Suno/Kie] Order ${params.orderId} rejeitado por policy de lyrics (${message}). Retentando com letra sanitizada.`
        );
        task = await runGenerationAttempt(sanitized.prompt, false);
    }

    const tracks = task.response?.sunoData || [];
    if (tracks.length === 0) {
        throw new Error("Kie task concluida sem faixas em response.sunoData");
    }

    const songs: SunoGeneratedSong[] = [];
    for (const track of tracks) {
        if (songs.length >= MAX_TRACKS) break;
        const audioUrl = getTrackAudioUrl(track);
        if (!audioUrl) continue;

        const mp3Buffer = await downloadTrackAsBuffer(audioUrl);
        const fallbackTitle = `${params.recipientName} Song ${songs.length + 1}`;
        songs.push(toGeneratedSong(track, fallbackTitle, mp3Buffer));
    }

    if (songs.length === 0) {
        throw new Error("Kie task concluida sem audioUrl/streamAudioUrl valido");
    }

    return {
        success: true,
        songs,
        kieTaskId: task.taskId || task.response?.taskId,
    };
}
