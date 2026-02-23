/**
 * WhatsApp Cloud API client
 * Follows the pattern of src/lib/telegram.ts
 */

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
const WHATSAPP_MEDIA_TTL_MINUTES_MIN = 60;
const WHATSAPP_MEDIA_TTL_MINUTES_MAX = 43_200;
const WHATSAPP_MEDIA_TTL_DEFAULT_MINUTES = 43_200;
const WHATSAPP_MEDIA_TTL_MINUTES = resolveWhatsAppMediaTtlMinutes(process.env.WHATSAPP_MEDIA_TTL_MINUTES);
const WHATSAPP_ENABLE_AUDIO_LINK_FALLBACK = parseBooleanEnv(
  process.env.WHATSAPP_ENABLE_AUDIO_LINK_FALLBACK,
  false
);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_MULTIMODAL_MODEL = process.env.OPENROUTER_MULTIMODAL_MODEL || "google/gemini-2.5-flash";
const WHATSAPP_HTTP_TIMEOUT_MS = resolveTimeoutMs(process.env.WHATSAPP_HTTP_TIMEOUT_MS, 20_000);
const WHATSAPP_AI_TIMEOUT_MS = resolveTimeoutMs(process.env.WHATSAPP_AI_TIMEOUT_MS, 35_000);

function getBaseUrl(): string {
  return `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}`;
}

function getGraphBaseUrl(): string {
  return `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`;
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function resolveTimeoutMs(rawValue: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt((rawValue ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) return defaultValue;
  return parsed;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveWhatsAppMediaTtlMinutes(rawValue: string | undefined): number | undefined {
  const normalized = rawValue?.trim();
  if (!normalized) return WHATSAPP_MEDIA_TTL_DEFAULT_MINUTES;
  if (normalized === "0" || normalized.toLowerCase() === "off") {
    return undefined;
  }

  if (!/^\d+$/.test(normalized)) {
    console.warn(
      `[WhatsApp] Invalid WHATSAPP_MEDIA_TTL_MINUTES="${normalized}". Using default ${WHATSAPP_MEDIA_TTL_DEFAULT_MINUTES}.`
    );
    return WHATSAPP_MEDIA_TTL_DEFAULT_MINUTES;
  }

  const parsed = Number.parseInt(normalized, 10);
  const clamped = Math.min(
    WHATSAPP_MEDIA_TTL_MINUTES_MAX,
    Math.max(WHATSAPP_MEDIA_TTL_MINUTES_MIN, parsed)
  );
  if (clamped !== parsed) {
    console.warn(
      `[WhatsApp] WHATSAPP_MEDIA_TTL_MINUTES clamped from ${parsed} to ${clamped}.`
    );
  }
  return clamped;
}

/**
 * Normalize a phone number to WhatsApp ID format (digits only, no +)
 */
export function normalizePhoneToWaId(phone: string): string {
  return phone.replace(/\D/g, "");
}

type WhatsAppApiErrorMeta = {
  code?: number;
  title?: string;
  message?: string;
  details?: string;
  raw: string;
  status?: number;
};

function parseWhatsAppApiError(raw: string, status?: number): WhatsAppApiErrorMeta {
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // ignore parse error
  }

  const err = parsed?.error;
  const code = typeof err?.code === "number" ? err.code : undefined;
  const title = typeof err?.error_user_title === "string"
    ? err.error_user_title
    : (typeof err?.title === "string" ? err.title : undefined);
  const message = typeof err?.error_user_msg === "string"
    ? err.error_user_msg
    : (typeof err?.message === "string" ? err.message : undefined);
  const details = typeof err?.error_data?.details === "string"
    ? err.error_data.details
    : undefined;

  return { code, title, message, details, raw, status };
}

function normalizeOutboundAudioMimeType(mimeType: string | null | undefined): string | null {
  const base = (mimeType ?? "").split(";")[0]!.trim().toLowerCase();
  if (!base) return null;

  const aliases: Record<string, string> = {
    "audio/mp3": "audio/mpeg",
    "audio/x-mp3": "audio/mpeg",
    "audio/m4a": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/x-aac": "audio/aac",
    "audio/x-mpeg": "audio/mpeg",
  };

  const normalized = aliases[base] ?? base;
  return normalized.startsWith("audio/") ? normalized : null;
}

function getAudioUploadMimeType(mimeType: string | null | undefined): string {
  const normalized = normalizeOutboundAudioMimeType(mimeType) ?? "audio/mpeg";
  if (normalized === "audio/ogg") {
    // Upload endpoint expects base MIME; WhatsApp validates the actual codec in file payload.
    return "audio/ogg";
  }
  return normalized;
}

function inferAudioMimeTypeFromUrl(audioUrl: string): string | null {
  try {
    const url = new URL(audioUrl);
    const path = url.pathname.toLowerCase();
    if (path.endsWith(".mp3")) return "audio/mpeg";
    if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "audio/mp4";
    if (path.endsWith(".aac")) return "audio/aac";
    if (path.endsWith(".amr")) return "audio/amr";
    if (path.endsWith(".ogg") || path.endsWith(".opus")) return "audio/ogg";
  } catch {
    // ignore invalid URL
  }
  return null;
}

function inferAudioFileNameFromUrl(audioUrl: string): string | null {
  try {
    const url = new URL(audioUrl);
    const lastSegment = url.pathname.split("/").filter(Boolean).pop();
    if (!lastSegment) return null;
    const decoded = decodeURIComponent(lastSegment);
    return decoded.trim() || null;
  } catch {
    return null;
  }
}

function createAudioUploadFormData(params: {
  audioBuffer: Buffer;
  uploadMimeType: string;
  fileName: string;
  ttlMinutes?: number;
}): FormData {
  const formData = new FormData();
  const blobMimeType = params.uploadMimeType.split(";")[0]!.trim();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", params.uploadMimeType);
  const blob = new Blob([new Uint8Array(params.audioBuffer)], { type: blobMimeType });
  formData.append("file", blob, params.fileName);
  if (typeof params.ttlMinutes === "number") {
    formData.append("ttl_minutes", String(params.ttlMinutes));
  }
  return formData;
}

function shouldRetryUploadWithoutTtl(error: WhatsAppApiErrorMeta): boolean {
  const combinedErrorText = [
    error.title,
    error.message,
    error.details,
    error.raw,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (combinedErrorText.includes("ttl")) {
    return true;
  }

  // Some WhatsApp accounts return only a generic "(#100) Invalid parameter"
  // when ttl_minutes is not accepted for that phone number setup.
  const isGenericInvalidParameter = error.code === 100
    && (
      combinedErrorText.includes("invalid parameter")
      || combinedErrorText.includes("parâmetro inválido")
      || combinedErrorText.includes("parametro invalido")
    );

  return isGenericInvalidParameter;
}

async function sendAudioMessageByLink(
  toWaId: string,
  audioUrl: string,
  voice?: boolean
): Promise<{
  messageId?: string;
  error?: WhatsAppApiErrorMeta;
}> {
  const response = await fetch(`${getBaseUrl()}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "audio",
      audio: {
        link: audioUrl,
        ...(voice ? { voice: true } : {}),
      },
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    return { error: parseWhatsAppApiError(raw, response.status) };
  }

  const data = await response.json();
  return { messageId: data.messages?.[0]?.id as string | undefined };
}

async function uploadAudioMediaToWhatsApp(params: {
  audioBuffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{
  mediaId?: string;
  error?: WhatsAppApiErrorMeta;
}> {
  const uploadMimeType = getAudioUploadMimeType(params.mimeType);

  const uploadAttempt = async (ttlMinutes: number | undefined): Promise<{ mediaId?: string; error?: WhatsAppApiErrorMeta }> => {
    const formData = createAudioUploadFormData({
      audioBuffer: params.audioBuffer,
      uploadMimeType,
      fileName: params.fileName,
      ttlMinutes,
    });

    const response = await fetch(`${getBaseUrl()}/media`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const raw = await response.text();
      return { error: parseWhatsAppApiError(raw, response.status) };
    }

    const data = await response.json() as { id?: string };
    return { mediaId: data.id };
  };

  const firstAttempt = await uploadAttempt(WHATSAPP_MEDIA_TTL_MINUTES);
  if (firstAttempt.mediaId) {
    return firstAttempt;
  }

  if (
    WHATSAPP_MEDIA_TTL_MINUTES !== undefined
    && firstAttempt.error
    && shouldRetryUploadWithoutTtl(firstAttempt.error)
  ) {
    console.warn("[WhatsApp] Audio upload rejected ttl_minutes; retrying without ttl_minutes.", {
      fileName: params.fileName,
      mimeType: uploadMimeType,
      ttlMinutes: WHATSAPP_MEDIA_TTL_MINUTES,
      error: firstAttempt.error,
    });
    return uploadAttempt(undefined);
  }

  return firstAttempt;
}

async function sendAudioMessageByMediaId(
  toWaId: string,
  mediaId: string,
  voice?: boolean
): Promise<{
  messageId?: string;
  error?: WhatsAppApiErrorMeta;
}> {
  const response = await fetch(`${getBaseUrl()}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "audio",
      audio: {
        id: mediaId,
        ...(voice ? { voice: true } : {}),
      },
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    return { error: parseWhatsAppApiError(raw, response.status) };
  }

  const data = await response.json();
  return { messageId: data.messages?.[0]?.id as string | undefined };
}

/**
 * Send a text message via WhatsApp Cloud API
 */
export type SendTextMessageOptions = {
  replyToMessageId?: string;
};

export async function sendTextMessage(
  to: string,
  body: string,
  options?: SendTextMessageOptions
): Promise<{ messageId?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("[WhatsApp] Credentials not configured, skipping send");
    return {};
  }

  try {
    const toWaId = normalizePhoneToWaId(to);
    const replyToMessageId = options?.replyToMessageId?.trim();
    const response = await fetch(`${getBaseUrl()}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        type: "text",
        text: { body },
        ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      const meta = parseWhatsAppApiError(raw, response.status);

      console.error("[WhatsApp] Failed to send message:", {
        to: toWaId,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        replyToMessageId,
        error: meta,
      });
      return {};
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id as string | undefined;
    console.log(
      `[WhatsApp] Message sent to ${toWaId}, id: ${messageId}, phoneNumberId: ${WHATSAPP_PHONE_NUMBER_ID}, replyTo=${replyToMessageId ?? "-"}, full response:`,
      JSON.stringify(data)
    );
    return { messageId };
  } catch (error) {
    console.error("[WhatsApp] Error sending message:", error);
    return {};
  }
}

/**
 * Send an emoji reaction to a specific WhatsApp message.
 */
export async function sendReactionMessage(
  to: string,
  targetMessageId: string,
  emoji: string
): Promise<{ messageId?: string; errorCode?: number; errorMessage?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("[WhatsApp] Credentials not configured, skipping reaction");
    return {};
  }

  const normalizedTargetId = targetMessageId.trim();
  const normalizedEmoji = emoji.trim();
  if (!normalizedTargetId || !normalizedEmoji) {
    console.warn("[WhatsApp] Invalid reaction payload, skipping send", {
      targetMessageId,
      emoji,
    });
    return {};
  }

  try {
    const toWaId = normalizePhoneToWaId(to);
    const response = await fetch(`${getBaseUrl()}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        type: "reaction",
        reaction: {
          message_id: normalizedTargetId,
          emoji: normalizedEmoji,
        },
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      const parsedError = parseWhatsAppApiError(raw, response.status);
      console.error("[WhatsApp] Failed to send reaction:", {
        to: toWaId,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        targetMessageId: normalizedTargetId,
        emoji: normalizedEmoji,
        error: parsedError,
      });
      return {
        errorCode: parsedError.code,
        errorMessage: parsedError.message ?? parsedError.details,
      };
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id as string | undefined;
    console.log(
      `[WhatsApp] Reaction sent to ${toWaId}, id: ${messageId}, target=${normalizedTargetId}, emoji=${normalizedEmoji}`
    );
    return { messageId };
  } catch (error) {
    console.error("[WhatsApp] Error sending reaction:", {
      to,
      targetMessageId: normalizedTargetId,
      emoji: normalizedEmoji,
      error,
    });
    return {};
  }
}

/**
 * Send an audio file via WhatsApp Cloud API.
 * Prefers `/media` upload + `audio.id` so WhatsApp stores media directly.
 * Falls back to `audio.link` if upload/send-by-id fails.
 */
export async function sendAudioMessage(
  to: string,
  audioUrl: string,
  options?: { mimeType?: string; fileName?: string; voice?: boolean }
): Promise<{
  messageId?: string;
  errorCode?: number;
  errorTitle?: string;
  errorMessage?: string;
}> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("[WhatsApp] Credentials not configured, skipping send");
    return {};
  }

  try {
    const toWaId = normalizePhoneToWaId(to);
    const isVoiceMessage = options?.voice === true;
    let shouldSendAsVoice = isVoiceMessage;
    let mediaPathError:
      | {
          code?: number;
          title?: string;
          message?: string;
        }
      | undefined;

    // Prefer media upload so WhatsApp hosts/stores the media reliably.
    try {
      const downloadResponse = await fetch(audioUrl);
      if (!downloadResponse.ok) {
        const downloadError = await downloadResponse.text();
        console.error("[WhatsApp] Audio pre-upload download failed:", {
          status: downloadResponse.status,
          to: toWaId,
          audioUrl,
          error: downloadError,
        });
      } else {
        const audioArrayBuffer = await downloadResponse.arrayBuffer();
        const audioBuffer = Buffer.from(audioArrayBuffer);
        const headerMime = downloadResponse.headers.get("content-type");
        const mimeType = normalizeOutboundAudioMimeType(options?.mimeType)
          ?? normalizeOutboundAudioMimeType(headerMime)
          ?? inferAudioMimeTypeFromUrl(audioUrl)
          ?? "audio/mpeg";
        shouldSendAsVoice = isVoiceMessage && mimeType === "audio/ogg";
        if (isVoiceMessage && !shouldSendAsVoice) {
          console.warn("[WhatsApp] Downgrading voice send to regular audio for non-OGG mime type.", {
            to: toWaId,
            mimeType,
            audioUrl,
          });
        }
        const fileName = options?.fileName?.trim()
          || inferAudioFileNameFromUrl(audioUrl)
          || `audio.${mimeToExtension(mimeType)}`;

        const mediaUpload = await uploadAudioMediaToWhatsApp({
          audioBuffer,
          mimeType,
          fileName,
        });

        if (mediaUpload.mediaId) {
          const mediaSend = await sendAudioMessageByMediaId(toWaId, mediaUpload.mediaId, shouldSendAsVoice);
          if (mediaSend.messageId) {
            console.log(`[WhatsApp] Audio sent to ${toWaId}, id: ${mediaSend.messageId} (mode=media-id, voice=${shouldSendAsVoice})`);
            return { messageId: mediaSend.messageId };
          }

          mediaPathError = {
            code: mediaSend.error?.code,
            title: mediaSend.error?.title,
            message: mediaSend.error?.message ?? mediaSend.error?.details,
          };
          console.error("[WhatsApp] Failed to send audio via media-id:", {
            to: toWaId,
            phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
            error: mediaSend.error,
          });
        } else {
          mediaPathError = {
            code: mediaUpload.error?.code,
            title: mediaUpload.error?.title,
            message: mediaUpload.error?.message ?? mediaUpload.error?.details,
          };
          console.error("[WhatsApp] Failed to upload audio media:", {
            to: toWaId,
            phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
            error: mediaUpload.error,
          });
        }
      }
    } catch (mediaError) {
      console.error("[WhatsApp] Audio media-id path failed:", {
        to: toWaId,
        audioUrl,
        error: mediaError,
      });
    }

    if (!WHATSAPP_ENABLE_AUDIO_LINK_FALLBACK) {
      console.error("[WhatsApp] Audio send aborted after media-id path failure (link fallback disabled):", {
        to: toWaId,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        mediaPathError,
      });
      return {
        errorCode: mediaPathError?.code,
        errorTitle: mediaPathError?.title,
        errorMessage: mediaPathError?.message,
      };
    }

    // Optional fallback path for unexpected media upload/send errors.
    const linkAttempt = await sendAudioMessageByLink(toWaId, audioUrl, shouldSendAsVoice);
    if (linkAttempt.messageId) {
      console.warn(`[WhatsApp] Audio sent to ${toWaId}, id: ${linkAttempt.messageId} (mode=link-fallback, voice=${shouldSendAsVoice})`);
      return { messageId: linkAttempt.messageId };
    }

    const linkError = linkAttempt.error;
    console.error("[WhatsApp] Failed to send audio (both media-id and link paths):", {
      to: toWaId,
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
      mediaPathError,
      linkError,
    });
    return {
      errorCode: linkError?.code ?? mediaPathError?.code,
      errorTitle: linkError?.title ?? mediaPathError?.title,
      errorMessage: linkError?.message ?? mediaPathError?.message,
    };
  } catch (error) {
    console.error("[WhatsApp] Error sending audio:", error);
    return {};
  }
}

/**
 * Send an audio message by uploading the media buffer first, then sending by media ID.
 * This avoids WhatsApp remote-fetch/link scrutiny failures for some hosts/files.
 */
export async function sendAudioMessageFromBuffer(
  to: string,
  audioBuffer: Buffer,
  options?: { mimeType?: string; fileName?: string; voice?: boolean }
): Promise<{
  messageId?: string;
  errorCode?: number;
  errorTitle?: string;
  errorMessage?: string;
}> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("[WhatsApp] Credentials not configured, skipping send");
    return {};
  }

  try {
    const toWaId = normalizePhoneToWaId(to);
    const isVoiceMessage = options?.voice === true;
    const normalizedMime = normalizeOutboundAudioMimeType(options?.mimeType) ?? "audio/ogg";
    const shouldSendAsVoice = isVoiceMessage && normalizedMime === "audio/ogg";
    if (isVoiceMessage && !shouldSendAsVoice) {
      console.warn("[WhatsApp] Downgrading voice send to regular audio for non-OGG mime type.", {
        to: toWaId,
        mimeType: normalizedMime,
      });
    }
    const uploadMime = getAudioUploadMimeType(normalizedMime);
    const ext = mimeToExtension(normalizedMime);
    const fileName = options?.fileName?.trim() || `audio.${ext}`;

    const mediaUpload = await uploadAudioMediaToWhatsApp({
      audioBuffer,
      mimeType: uploadMime,
      fileName,
    });

    if (!mediaUpload.mediaId) {
      console.error("[WhatsApp] Failed to upload audio buffer media:", {
        to: toWaId,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        mimeType: uploadMime,
        fileName,
        error: mediaUpload.error,
      });
      return {
        errorCode: mediaUpload.error?.code,
        errorTitle: mediaUpload.error?.title,
        errorMessage: mediaUpload.error?.message ?? mediaUpload.error?.details,
      };
    }

    const mediaSend = await sendAudioMessageByMediaId(toWaId, mediaUpload.mediaId, shouldSendAsVoice);
    if (!mediaSend.messageId) {
      console.error("[WhatsApp] Failed to send audio buffer via media-id:", {
        to: toWaId,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        mimeType: normalizedMime,
        fileName,
        error: mediaSend.error,
      });
      return {
        errorCode: mediaSend.error?.code,
        errorTitle: mediaSend.error?.title,
        errorMessage: mediaSend.error?.message ?? mediaSend.error?.details,
      };
    }

    console.log(`[WhatsApp] Audio sent to ${toWaId}, id: ${mediaSend.messageId} (mode=media-id-buffer, voice=${shouldSendAsVoice})`);
    return { messageId: mediaSend.messageId };
  } catch (error) {
    console.error("[WhatsApp] Error sending audio buffer:", error);
    return {};
  }
}

/**
 * Send an image via WhatsApp Cloud API using a public URL
 */
export async function sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<{ messageId?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("[WhatsApp] Credentials not configured, skipping send");
    return {};
  }

  try {
    const toWaId = normalizePhoneToWaId(to);
    const response = await fetch(`${getBaseUrl()}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        type: "image",
        image: {
          link: imageUrl,
          ...(caption ? { caption } : {}),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[WhatsApp] Failed to send image:", { status: response.status, to: toWaId, error });
      return {};
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id as string | undefined;
    console.log(`[WhatsApp] Image sent to ${toWaId}, id: ${messageId}`);
    return { messageId };
  } catch (error) {
    console.error("[WhatsApp] Error sending image:", error);
    return {};
  }
}

/**
 * Send a video via WhatsApp Cloud API using a public URL
 */
export async function sendVideoMessage(to: string, videoUrl: string, caption?: string): Promise<{ messageId?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("[WhatsApp] Credentials not configured, skipping send");
    return {};
  }

  try {
    const toWaId = normalizePhoneToWaId(to);
    const response = await fetch(`${getBaseUrl()}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        type: "video",
        video: {
          link: videoUrl,
          ...(caption ? { caption } : {}),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[WhatsApp] Failed to send video:", { status: response.status, to: toWaId, error });
      return {};
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id as string | undefined;
    console.log(`[WhatsApp] Video sent to ${toWaId}, id: ${messageId}`);
    return { messageId };
  } catch (error) {
    console.error("[WhatsApp] Error sending video:", error);
    return {};
  }
}

/**
 * Send a document file via WhatsApp Cloud API using a public URL
 */
export async function sendDocumentMessage(to: string, documentUrl: string, filename: string, caption?: string): Promise<{ messageId?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("[WhatsApp] Credentials not configured, skipping send");
    return {};
  }

  try {
    const toWaId = normalizePhoneToWaId(to);
    const response = await fetch(`${getBaseUrl()}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        type: "document",
        document: {
          link: documentUrl,
          filename,
          ...(caption ? { caption } : {}),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[WhatsApp] Failed to send document:", { status: response.status, to: toWaId, error });
      return {};
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id as string | undefined;
    console.log(`[WhatsApp] Document sent to ${toWaId}, id: ${messageId}`);
    return { messageId };
  } catch (error) {
    console.error("[WhatsApp] Error sending document:", error);
    return {};
  }
}

/**
 * Mark a message as read via WhatsApp Cloud API
 */
export async function markAsRead(messageId: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return;
  }

  try {
    const response = await fetch(`${getBaseUrl()}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[WhatsApp] Failed to mark as read:", error);
    }
  } catch (error) {
    console.error("[WhatsApp] Error marking as read:", error);
  }
}

/**
 * Download media from WhatsApp Cloud API
 * Step 1: GET media URL from Graph API, Step 2: download the binary
 */
export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    console.warn("[WhatsApp] Credentials not configured, cannot download media");
    return null;
  }

  try {
    // Step 1: Get the media URL
    const metaResponse = await fetchWithTimeout(`${getGraphBaseUrl()}/${mediaId}`, {
      headers: { "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    }, WHATSAPP_HTTP_TIMEOUT_MS);

    if (!metaResponse.ok) {
      const error = await metaResponse.text();
      console.error("[WhatsApp] Failed to get media URL:", error);
      return null;
    }

    const metaData = await metaResponse.json() as { url: string; mime_type: string };
    const { url, mime_type } = metaData;

    // Step 2: Download the actual media binary
    const mediaResponse = await fetchWithTimeout(url, {
      headers: { "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    }, WHATSAPP_HTTP_TIMEOUT_MS);

    if (!mediaResponse.ok) {
      const error = await mediaResponse.text();
      console.error("[WhatsApp] Failed to download media:", error);
      return null;
    }

    const arrayBuffer = await mediaResponse.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType: mime_type };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      console.error(`[WhatsApp] Media download timed out after ${WHATSAPP_HTTP_TIMEOUT_MS}ms (mediaId=${mediaId})`);
      return null;
    }
    console.error("[WhatsApp] Error downloading media:", error);
    return null;
  }
}

/**
 * Get file extension from MIME type
 */
export function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/opus": "ogg",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "text/plain": "txt",
  };
  // Strip codec info (e.g., "audio/ogg; codecs=opus" → "audio/ogg")
  const base = mimeType.split(";")[0]!.trim();
  return map[base] ?? base.split("/")[1] ?? "bin";
}

/**
 * Convert audio buffer to MP3 using ffmpeg
 */
function convertToMp3(audioBuffer: Buffer): Buffer {
  const { execSync } = require("child_process") as typeof import("child_process");
  const { writeFileSync, readFileSync, unlinkSync } = require("fs") as typeof import("fs");
  const { tmpdir } = require("os") as typeof import("os");
  const { join } = require("path") as typeof import("path");
  const { randomUUID } = require("crypto") as typeof import("crypto");

  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}.ogg`);
  const outputPath = join(tmpdir(), `${id}.mp3`);

  writeFileSync(inputPath, audioBuffer);

  try {
    execSync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -b:a 64k "${outputPath}" -y`, {
      stdio: "pipe",
      timeout: 30000,
    });
    const mp3Buffer = readFileSync(outputPath);
    return mp3Buffer;
  } finally {
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
  }
}

/**
 * Transcribe audio using OpenAI Whisper via OpenRouter
 * Accepts OGG natively (no conversion needed for most formats)
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    console.warn("[WhatsApp] Neither OPENAI_API_KEY nor OPENROUTER_API_KEY is set, cannot transcribe audio");
    return null;
  }

  const baseMime = mimeType.split(";")[0]!.trim() || "audio/ogg";
  const originalExt = mimeToExtension(baseMime);

  try {
    console.log(`[WhatsApp] Transcribing audio (${baseMime}, ${audioBuffer.length} bytes)...`);

    // 1) OpenAI Whisper directly (if key exists)
    if (OPENAI_API_KEY) {
      const openAiResult = await transcribeWithWhisperEndpoint({
        url: "https://api.openai.com/v1/audio/transcriptions",
        apiKey: OPENAI_API_KEY,
        model: "whisper-1",
        audioBuffer,
        mimeType: baseMime,
        fileExt: originalExt,
      });
      if (openAiResult) {
        console.log(`[WhatsApp] OpenAI Whisper transcribed (${openAiResult.length} chars): ${openAiResult.substring(0, 80)}...`);
        return openAiResult;
      }
      console.warn("[WhatsApp] OpenAI Whisper returned no transcription, trying OpenRouter strategies...");
    }

    // 2) OpenRouter Whisper endpoint (if key exists)
    if (OPENROUTER_API_KEY) {
      const openRouterWhisperResult = await transcribeWithWhisperEndpoint({
        url: "https://openrouter.ai/api/v1/audio/transcriptions",
        apiKey: OPENROUTER_API_KEY,
        model: "openai/whisper-1",
        audioBuffer,
        mimeType: baseMime,
        fileExt: originalExt,
        isOpenRouter: true,
      });
      if (openRouterWhisperResult) {
        console.log(`[WhatsApp] OpenRouter Whisper transcribed (${openRouterWhisperResult.length} chars): ${openRouterWhisperResult.substring(0, 80)}...`);
        return openRouterWhisperResult;
      }
      console.warn("[WhatsApp] OpenRouter Whisper returned no transcription, trying Gemini fallback...");
    }

    // 3) OpenRouter Gemini fallback with raw audio format
    if (OPENROUTER_API_KEY) {
      const allowedFormats = new Set(["wav", "mp3", "ogg", "m4a", "aac"]);
      const preferredFormat = allowedFormats.has(originalExt) ? originalExt : "ogg";
      const geminiRaw = await transcribeWithGemini(audioBuffer, preferredFormat);
      if (geminiRaw) return geminiRaw;
    }
  } catch (error) {
    console.error("[WhatsApp] Error transcribing audio:", error);
  }

  // 4) Last fallback: convert to MP3 and retry Gemini (helps when raw format is rejected)
  if (OPENROUTER_API_KEY) {
    try {
      const mp3Buffer = convertToMp3(audioBuffer);
      console.log(`[WhatsApp] Gemini fallback with converted MP3 (${mp3Buffer.length} bytes)`);
      return await transcribeWithGemini(mp3Buffer, "mp3");
    } catch (error) {
      console.error("[WhatsApp] MP3 conversion fallback failed:", error);
    }
  }

  return null;
}

/**
 * OpenAI-compatible audio transcription endpoint (OpenAI or OpenRouter proxy)
 */
async function transcribeWithWhisperEndpoint(params: {
  url: string;
  apiKey: string;
  model: string;
  audioBuffer: Buffer;
  mimeType: string;
  fileExt: string;
  isOpenRouter?: boolean;
}): Promise<string | null> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(params.audioBuffer)], { type: params.mimeType });
    formData.append("file", blob, `audio.${params.fileExt}`);
    formData.append("model", params.model);
    formData.append("response_format", "text");

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${params.apiKey}`,
    };

    if (params.isOpenRouter) {
      headers["HTTP-Referer"] = "https://apollosong.com";
      headers["X-Title"] = "Apollo Song WhatsApp Audio Transcription";
    }

    const response = await fetchWithTimeout(params.url, {
      method: "POST",
      headers,
      body: formData,
    }, WHATSAPP_AI_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WhatsApp] Whisper endpoint failed:", response.status, errorText);
      return null;
    }

    const text = (await response.text()).trim();
    return text || null;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      console.error(`[WhatsApp] Whisper endpoint timed out after ${WHATSAPP_AI_TIMEOUT_MS}ms`);
      return null;
    }
    console.error("[WhatsApp] Whisper endpoint error:", error);
    return null;
  }
}

/**
 * Fallback transcription using Gemini Flash via OpenRouter
 */
async function transcribeWithGemini(audioBuffer: Buffer, audioFormat: string): Promise<string | null> {
  const base64Audio = audioBuffer.toString("base64");

  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://apollosong.com",
      "X-Title": "Apollo Song WhatsApp Audio Transcription",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcreva este áudio exatamente como falado. Retorne APENAS a transcrição, sem comentários, explicações ou formatação adicional.",
            },
            {
              type: "input_audio",
              input_audio: {
                data: base64Audio,
                format: audioFormat,
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2000,
    }),
  }, WHATSAPP_AI_TIMEOUT_MS);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[WhatsApp] Gemini transcription fallback failed:", response.status, errorText);
    return null;
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };
  const content = data.choices?.[0]?.message?.content;
  const transcription = extractTextFromMessageContent(content);

  if (transcription) {
    console.log(`[WhatsApp] Gemini transcribed (${transcription.length} chars): ${transcription.substring(0, 80)}...`);
  }

  return transcription;
}

function extractTextFromMessageContent(content: string | Array<{ type?: string; text?: string }> | undefined): string | null {
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
}

/**
 * Read image content using the same multimodal stack (OpenRouter + Gemini).
 * This is not a separate OCR engine; it is model-based vision extraction.
 */
export async function readImageWithMultimodal(imageBuffer: Buffer, mimeType: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    console.warn("[WhatsApp] OPENROUTER_API_KEY not set, cannot read image");
    return null;
  }

  const baseMime = mimeType.split(";")[0]!.trim();
  if (!baseMime.startsWith("image/")) {
    return null;
  }

  try {
    const base64Image = imageBuffer.toString("base64");
    const dataUrl = `data:${baseMime};base64,${base64Image}`;

    const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://apollosong.com",
        "X-Title": "Apollo Song WhatsApp Image Reader",
      },
      body: JSON.stringify({
        model: OPENROUTER_MULTIMODAL_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Leia esta imagem e retorne APENAS o conteúdo útil para atendimento. Se houver texto, transcreva o principal. Se for comprovante, inclua valor, data/horário, status e referência/ID quando visível. Se não houver texto legível, descreva em 1 frase curta o que a imagem mostra.",
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 800,
      }),
    }, WHATSAPP_AI_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WhatsApp] Multimodal image read failed:", response.status, errorText);
      return null;
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content;
    const extracted = extractTextFromMessageContent(content);
    const cleaned = extracted?.trim() ?? null;

    if (cleaned) {
      console.log(`[WhatsApp] Image content extracted (${cleaned.length} chars): ${cleaned.substring(0, 120)}...`);
    }

    return cleaned;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      console.error(`[WhatsApp] Multimodal image read timed out after ${WHATSAPP_AI_TIMEOUT_MS}ms`);
      return null;
    }
    console.error("[WhatsApp] Error reading image with multimodal model:", error);
    return null;
  }
}
