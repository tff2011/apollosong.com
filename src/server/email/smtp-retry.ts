type SmtpErrorLike = {
  code?: string;
  responseCode?: number;
  response?: string;
  command?: string;
  message?: string;
};

type ExecuteWithSmtpRetryOptions<T> = {
  operation: () => Promise<T>;
  operationName: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNECTION",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ESOCKET",
  "EPIPE",
  "EAI_AGAIN",
]);

const SMTP_CODE_REGEX = /\b([245]\d\d)\b/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSmtpErrorLike(error: unknown): SmtpErrorLike {
  if (!error || typeof error !== "object") return {};

  const candidate = error as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    responseCode: typeof candidate.responseCode === "number" ? candidate.responseCode : undefined,
    response: typeof candidate.response === "string" ? candidate.response : undefined,
    command: typeof candidate.command === "string" ? candidate.command : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
  };
}

function extractSmtpCode(details: SmtpErrorLike): number | null {
  if (typeof details.responseCode === "number") return details.responseCode;

  const haystacks = [details.response, details.message];
  for (const value of haystacks) {
    if (!value) continue;
    const match = value.match(SMTP_CODE_REGEX);
    if (!match) continue;
    const code = match[1];
    if (!code) continue;
    const parsed = Number.parseInt(code, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function computeBackoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(exponentialDelay * 0.25 * Math.random());
  return exponentialDelay + jitter;
}

function summarizeError(error: unknown): string {
  const details = toSmtpErrorLike(error);
  const smtpCode = extractSmtpCode(details);
  const segments = [
    details.code ? `code=${details.code}` : null,
    smtpCode ? `smtpCode=${smtpCode}` : null,
    details.command ? `command=${details.command}` : null,
  ].filter(Boolean);

  return segments.length > 0 ? segments.join(", ") : "no error metadata";
}

export function isRetryableSmtpError(error: unknown): boolean {
  const details = toSmtpErrorLike(error);
  const smtpCode = extractSmtpCode(details);
  if (smtpCode !== null) return smtpCode >= 400 && smtpCode < 500;

  if (details.code && RETRYABLE_NETWORK_CODES.has(details.code)) return true;

  const message = `${details.response ?? ""} ${details.message ?? ""}`.toLowerCase();
  if (message.includes("unexpected failure, please try later")) return true;
  if (message.includes("temporary")) return true;
  if (message.includes("timed out") || message.includes("timeout")) return true;
  if (message.includes("connection reset") || message.includes("connection closed")) return true;

  return false;
}

export async function executeWithSmtpRetry<T>({
  operation,
  operationName,
  maxAttempts = 4,
  baseDelayMs = 1200,
  maxDelayMs = 15000,
}: ExecuteWithSmtpRetryOptions<T>): Promise<T> {
  const safeMaxAttempts = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= safeMaxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable = isRetryableSmtpError(error);
      const hasAttemptsRemaining = attempt < safeMaxAttempts;
      if (!retryable || !hasAttemptsRemaining) {
        throw error;
      }

      const delayMs = computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[SMTP Retry] ${operationName} failed (${summarizeError(error)}), attempt ${attempt}/${safeMaxAttempts}. Retrying in ${delayMs}ms.`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`[SMTP Retry] Unexpected exit for operation ${operationName}.`);
}
