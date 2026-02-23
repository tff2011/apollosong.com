export type WhatsAppUploadMessageType = "audio" | "video" | "document" | "image";

const MB = 1024 * 1024;

export const WHATSAPP_MEDIA_MAX_BYTES: Record<WhatsAppUploadMessageType, number> = {
  image: 5 * MB,
  audio: 16 * MB,
  video: 16 * MB,
  document: 100 * MB,
};

export function getWhatsAppMediaMaxBytes(messageType: WhatsAppUploadMessageType): number {
  return WHATSAPP_MEDIA_MAX_BYTES[messageType];
}

export function formatMegabytes(bytes: number): string {
  const mb = bytes / MB;
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}
