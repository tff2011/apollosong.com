import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";
import { NextResponse } from "next/server";
import { StorageService } from "~/lib/storage";

export const runtime = "nodejs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_TRANSCRIPTION_MODEL =
    process.env.OPENROUTER_TRANSCRIBE_MODEL
    || "google/gemini-3-flash-preview";
const OPENROUTER_HTTP_REFERER = "https://apollosong.com";
const OPENROUTER_X_TITLE = "Apollo Song Revision Audio Transcription";
const FFMPEG_BINARY = (typeof ffmpegStaticPath === "string" && ffmpegStaticPath.trim())
    ? ffmpegStaticPath
    : "ffmpeg";

const AUDIO_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/wav": "wav",
};

const inferAudioExtension = (file: File): string => {
    const mimeType = file.type.trim().toLowerCase();
    if (mimeType && AUDIO_EXTENSION_BY_MIME_TYPE[mimeType]) {
        return AUDIO_EXTENSION_BY_MIME_TYPE[mimeType]!;
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".m4a")) return "m4a";
    if (fileName.endsWith(".mp3")) return "mp3";
    if (fileName.endsWith(".wav")) return "wav";
    if (fileName.endsWith(".ogg")) return "ogg";
    return "webm";
};

const sanitizeOrderId = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return /^c[a-z0-9]{24,}$/i.test(trimmed) ? trimmed : null;
};

const normalizeGeminiAudioFormat = (extension: string): string => {
    const ext = extension.trim().toLowerCase();
    if (ext === "m4a") return "mp4";
    return ext || "webm";
};

type OpenRouterMessageContent =
    | string
    | Array<{
        type?: string;
        text?: string;
    }>
    | undefined;

const extractTextFromMessageContent = (content: OpenRouterMessageContent): string | null => {
    if (!content) return null;
    if (typeof content === "string") {
        const trimmed = content.trim();
        return trimmed || null;
    }

    const joined = content
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join(" ")
        .trim();

    return joined || null;
};

async function transcribeWithGemini3Flash(params: {
    audioBuffer: Buffer;
    audioFormat: string;
}): Promise<string | null> {
    if (!OPENROUTER_API_KEY) return null;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": OPENROUTER_HTTP_REFERER,
            "X-Title": OPENROUTER_X_TITLE,
        },
        body: JSON.stringify({
            model: GEMINI_TRANSCRIPTION_MODEL,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Transcreva este audio exatamente como falado. Retorne apenas a transcricao, sem comentarios, sem formatacao e sem traducoes.",
                        },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: params.audioBuffer.toString("base64"),
                                format: params.audioFormat,
                            },
                        },
                    ],
                },
            ],
            temperature: 0,
            max_tokens: 2500,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[Transcribe] Gemini transcription failed:", response.status, errorText);
        return null;
    }

    const data = await response.json() as {
        choices?: Array<{
            message?: {
                content?: OpenRouterMessageContent;
            };
        }>;
    };
    return extractTextFromMessageContent(data.choices?.[0]?.message?.content);
}

async function convertAudioToMp3(params: {
    audioBuffer: Buffer;
    inputExtension: string;
}): Promise<Buffer | null> {
    const id = randomUUID();
    const inputExtension = params.inputExtension || "bin";
    const inputPath = path.join("/tmp", `revision-audio-${id}.${inputExtension}`);
    const outputPath = path.join("/tmp", `revision-audio-${id}.mp3`);

    await writeFile(inputPath, params.audioBuffer);

    try {
        await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn(FFMPEG_BINARY, [
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                inputPath,
                "-vn",
                "-map_metadata",
                "-1",
                "-acodec",
                "libmp3lame",
                "-ar",
                "16000",
                "-ac",
                "1",
                "-b:a",
                "64k",
                outputPath,
            ]);

            let stderr = "";
            ffmpeg.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            ffmpeg.on("error", reject);
            ffmpeg.on("close", (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(stderr || `ffmpeg exited with code ${code}`));
            });
        });

        return await readFile(outputPath);
    } catch (error) {
        console.error("[Transcribe] MP3 conversion fallback failed:", error);
        return null;
    } finally {
        await Promise.allSettled([
            unlink(inputPath),
            unlink(outputPath),
        ]);
    }
}

async function tryUploadRevisionAudioToR2(params: {
    orderId: string;
    bytes: Buffer;
    file: File;
}): Promise<{ audioUrl: string; audioKey: string } | null> {
    try {
        const extension = inferAudioExtension(params.file);
        const key = `revisions/${params.orderId}/audio/${Date.now()}-${randomUUID()}.${extension}`;
        const contentType = params.file.type.trim() || "audio/webm";
        const audioUrl = await StorageService.uploadBuffer(key, params.bytes, contentType);
        return { audioUrl, audioKey: key };
    } catch (error) {
        console.error("[Transcribe] Failed to upload revision audio to R2:", error);
        return null;
    }
}

export async function POST(req: Request) {
    try {
        if (!OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: "OPENROUTER_API_KEY not configured" },
                { status: 500 }
            );
        }

        const form = await req.formData();
        const file = form.get("file");
        const storeInR2 = String(form.get("storeInR2") ?? "").toLowerCase() === "true";
        const orderIdRaw = form.get("orderId");
        const orderId = typeof orderIdRaw === "string" ? sanitizeOrderId(orderIdRaw) : null;

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "Envie um arquivo no campo 'file'." },
                { status: 400 }
            );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        let revisionAudioUpload: { audioUrl: string; audioKey: string } | null = null;

        if (storeInR2) {
            if (orderId) {
                revisionAudioUpload = await tryUploadRevisionAudioToR2({
                    orderId,
                    bytes,
                    file,
                });
            } else {
                console.warn("[Transcribe] storeInR2=true but orderId was not provided or invalid.");
            }
        }

        const originalExtension = inferAudioExtension(file);
        const originalFormat = normalizeGeminiAudioFormat(originalExtension);

        let text = await transcribeWithGemini3Flash({
            audioBuffer: bytes,
            audioFormat: originalFormat,
        });

        // Gemini multimodal can reject some browser formats (e.g. webm in some providers).
        // Retry with mp3 conversion for compatibility.
        if (!text && originalFormat !== "mp3") {
            const mp3Buffer = await convertAudioToMp3({
                audioBuffer: bytes,
                inputExtension: originalExtension,
            });
            if (mp3Buffer) {
                text = await transcribeWithGemini3Flash({
                    audioBuffer: mp3Buffer,
                    audioFormat: "mp3",
                });
            }
        }

        if (!text) {
            return NextResponse.json(
                {
                    error: "Falha ao transcrever o áudio com Gemini 3 Flash.",
                    audioUrl: revisionAudioUpload?.audioUrl ?? null,
                    audioKey: revisionAudioUpload?.audioKey ?? null,
                },
                { status: 502 }
            );
        }

        return NextResponse.json(
            {
                transcriptId: null,
                status: "completed",
                text,
                audioUrl: revisionAudioUpload?.audioUrl ?? null,
                audioKey: revisionAudioUpload?.audioKey ?? null,
            },
            { status: 200 }
        );
    } catch (e) {
        console.error("[Transcribe] Unexpected error:", e);
        return NextResponse.json(
            { error: "Erro inesperado no servidor.", details: e instanceof Error ? e.message : String(e) },
            { status: 500 }
        );
    }
}
