const KIE_BASE_URL = (process.env.KIE_BASE_URL || "https://api.kie.ai/api/v1").replace(/\/$/, "");
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const DEFAULT_HTTP_TIMEOUT_MS = 60 * 1000;
const DEFAULT_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com").replace(/\/$/, "");
const DEFAULT_KIE_CALLBACK_PATH = "/api/suno/callback";

const FAILED_STATUSES = new Set([
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "FAILED",
  "FAILURE",
  "ERROR",
]);

export interface VocalSeparationResult {
  vocalUrl: string;
  instrumentalUrl: string;
}

type KieResponse<T> = {
  code: number;
  msg: string;
  data: T;
};

type VocalRemovalData = {
  taskId: string;
};

type VocalRemovalRecordInfo = {
  taskId: string;
  status: string;
  successFlag?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  response?: {
    vocalUrl?: string;
    instrumentalUrl?: string;
    accompanyUrl?: string;
    accompanimentUrl?: string;
    bgmUrl?: string;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCallBackUrl(explicitUrl?: string): string | undefined {
  const fromParam = explicitUrl?.trim();
  if (fromParam) return fromParam;

  const fromEnv = process.env.KIE_CALLBACK_URL?.trim();
  if (fromEnv) return fromEnv;

  return `${DEFAULT_SITE_URL}${DEFAULT_KIE_CALLBACK_PATH}`;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }
    const json = parsedBody as { msg?: string } | null;

    if (!response.ok) {
      const message = json?.msg || `HTTP ${response.status}`;
      throw new Error(message);
    }

    if (parsedBody == null) {
      throw new Error("Kie vocal-removal returned invalid JSON response");
    }

    return parsedBody as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Create a vocal separation task using Kie.ai API
 * POST /vocal-removal/generate with type: "separate_vocal"
 */
export async function createVocalSeparationTask(params: {
  apiKey: string;
  kieTaskId: string;
  kieAudioId: string;
  callBackUrl?: string;
}): Promise<string> {
  const callBackUrl = resolveCallBackUrl(params.callBackUrl);

  const payload = {
    taskId: params.kieTaskId,
    audioId: params.kieAudioId,
    type: "separate_vocal",
    ...(callBackUrl ? { callBackUrl } : {}),
  };

  const json = await fetchJsonWithTimeout<KieResponse<VocalRemovalData>>(
    `${KIE_BASE_URL}/vocal-removal/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(json.msg || "Failed to create vocal separation task");
  }

  return json.data.taskId;
}

/**
 * Get vocal separation task status
 * GET /vocal-removal/record-info?taskId=...
 */
export async function getVocalSeparationStatus(
  apiKey: string,
  taskId: string,
): Promise<{ status: string; vocalUrl?: string; instrumentalUrl?: string }> {
  const url = new URL(`${KIE_BASE_URL}/vocal-removal/record-info`);
  url.searchParams.set("taskId", taskId);

  const json = await fetchJsonWithTimeout<KieResponse<VocalRemovalRecordInfo>>(
    url.toString(),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    },
  );

  if (json.code !== 200 || !json.data) {
    throw new Error(json.msg || "Failed to get vocal separation status");
  }

  const normalizedStatus = String(
    json.data.successFlag ||
    json.data.status ||
    "PENDING"
  ).toUpperCase();

  const response = json.data.response || {};
  const instrumentalUrl =
    response.instrumentalUrl ||
    response.accompanyUrl ||
    response.accompanimentUrl ||
    response.bgmUrl;

  return {
    status: normalizedStatus,
    vocalUrl: response.vocalUrl,
    instrumentalUrl,
  };
}

/**
 * Poll until vocal separation completes or fails
 */
export async function waitForVocalSeparation(
  apiKey: string,
  taskId: string,
): Promise<VocalSeparationResult> {
  const startedAt = Date.now();
  const expiresAt = startedAt + DEFAULT_POLL_TIMEOUT_MS;
  let lastStatus = "";

  while (Date.now() < expiresAt) {
    const result = await getVocalSeparationStatus(apiKey, taskId);

    if (result.status !== lastStatus) {
      console.log(`[Karaoke] Vocal separation ${taskId} status: ${result.status}`);
      lastStatus = result.status;
    }

    if (result.status === "SUCCESS" || result.status === "COMPLETED") {
      if (!result.instrumentalUrl || !result.vocalUrl) {
        // Some newer responses can omit vocalUrl while still returning a valid instrumental URL.
        if (!result.instrumentalUrl) {
          throw new Error("Vocal separation completed but missing instrumental URL");
        }
        return {
          vocalUrl: result.vocalUrl || "",
          instrumentalUrl: result.instrumentalUrl,
        };
      }
      return {
        vocalUrl: result.vocalUrl,
        instrumentalUrl: result.instrumentalUrl,
      };
    }

    if (FAILED_STATUSES.has(result.status)) {
      throw new Error(`Vocal separation failed (status=${result.status})`);
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error(`Vocal separation timeout after ${Math.round(DEFAULT_POLL_TIMEOUT_MS / 1000)}s (${taskId})`);
}

/**
 * Download instrumental MP3 as Buffer
 */
export async function downloadInstrumentalBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_HTTP_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to download instrumental (HTTP ${res.status})`);
    }
    const bytes = await res.arrayBuffer();
    return Buffer.from(bytes);
  } finally {
    clearTimeout(timeout);
  }
}
