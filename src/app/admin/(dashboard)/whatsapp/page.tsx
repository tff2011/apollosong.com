"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Search, MessageSquare, Send, Bot, User, Phone, AlertTriangle, ToggleLeft, ToggleRight, Package, RefreshCw, FileText, Download, Mic, Image as ImageIcon, Video, File, Trash2, Eye, Tag, Plus, X, Check, Paperclip, Square, Music2, Maximize2, Minimize2, Bell, BellOff, Mail, Copy, Smile, ChevronLeft } from "lucide-react";
import { formatMegabytes, getWhatsAppMediaMaxBytes } from "~/lib/whatsapp-media-limits";
import { LeadDetailsDialog } from "../leads/details-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";

function timeAgo(date: Date | string | null): string {
    if (!date) return "--";
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "agora";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d`;
    return new Date(date).toLocaleDateString("pt-BR");
}

function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatOrderStatus(status: string): string {
    const labels: Record<string, string> = {
        PENDING: "Pendente",
        PAID: "Pago",
        IN_PROGRESS: "Em produção",
        COMPLETED: "Concluído",
        REVISION: "Em revisão",
        CANCELLED: "Cancelado",
        REFUNDED: "Reembolsado",
    };
    return labels[status] ?? status;
}

function formatOrderDateTime(date: Date | string): string {
    return new Date(date).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

type SupportedTrackOrderLocale = "pt" | "en" | "es" | "fr" | "it";

function normalizeTrackOrderLocale(locale: string | null | undefined): SupportedTrackOrderLocale {
    const value = (locale ?? "").toLowerCase().trim();
    if (value.startsWith("en")) return "en";
    if (value.startsWith("es")) return "es";
    if (value.startsWith("fr")) return "fr";
    if (value.startsWith("it")) return "it";
    return "pt";
}

function buildTrackOrderUrl(email: string, locale: string | null | undefined): string {
    const normalizedLocale = normalizeTrackOrderLocale(locale);
    const localePrefix = normalizedLocale !== "en" ? `/${normalizedLocale}` : "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://www.apollosong.com";
    return `${baseUrl}${localePrefix}/track-order?email=${encodeURIComponent(email)}`;
}

const STREAMING_VIP_EXPLAINER_AUDIO_URL = "https://pub-b085b85804204c82b96e15ec554b0940.r2.dev/upsell-spotify.mp3";

function buildStreamingVipIntroMessage(params: {
    recipientName: string | null | undefined;
}): string {
    const recipient = params.recipientName?.trim() ? ` para ${params.recipientName.trim()}` : "";
    return `🎵 Temos o serviço Streaming VIP${recipient}, para lançar a música no Spotify, Apple Music e outras plataformas.`;
}

function buildStreamingVipPaymentLinkMessage(checkoutUrl: string): string {
    return `Para 1 música, o link de pagamento é:
👉 ${checkoutUrl}`;
}

function normalizePhoneDigits(value: string | null | undefined): string {
    return (value ?? "").replace(/\D/g, "");
}

function phonesLikelyMatchForUi(phoneA: string | null | undefined, phoneB: string | null | undefined): boolean {
    const a = normalizePhoneDigits(phoneA);
    const b = normalizePhoneDigits(phoneB);
    if (!a || !b) return false;
    if (a === b) return true;

    const a8 = a.slice(-8);
    const b8 = b.slice(-8);
    if (a8.length === 8 && b8.length === 8 && a8 === b8) return true;

    const a10 = a.slice(-10);
    const b10 = b.slice(-10);
    if (a10.length === 10 && b10.length === 10 && a10 === b10) return true;

    return a.endsWith(b) || b.endsWith(a);
}

function isWithin24h(date: Date | string | null): boolean {
    if (!date) return false;
    return Date.now() - new Date(date).getTime() < 24 * 60 * 60 * 1000;
}

function isLockActive(lockExpiresAt: Date | string | null | undefined): boolean {
    if (!lockExpiresAt) return false;
    return new Date(lockExpiresAt).getTime() > Date.now();
}

function formatLockRemaining(lockExpiresAt: Date | string | null | undefined): string {
    if (!isLockActive(lockExpiresAt)) return "sem lock";
    const ms = new Date(lockExpiresAt as Date | string).getTime() - Date.now();
    const mins = Math.max(0, Math.ceil(ms / 60000));
    return `${mins}m`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRecordingDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function buildClipboardImageName(mimeType: string): string {
    const base = mimeType.split(";")[0]?.trim().toLowerCase() || "image/png";
    const extensionMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/heic": "heic",
        "image/heif": "heif",
        "image/bmp": "bmp",
    };
    const ext = extensionMap[base] || "png";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `clipboard-${stamp}.${ext}`;
}

function buildRecordedAudioName(mimeType: string): string {
    const base = mimeType.split(";")[0]?.trim().toLowerCase() || "audio/ogg";
    const extensionMap: Record<string, string> = {
        "audio/ogg": "ogg",
        "audio/mp4": "m4a",
        "audio/mpeg": "mp3",
        "audio/aac": "aac",
        "audio/amr": "amr",
        "audio/webm": "webm",
    };
    const ext = extensionMap[base] || "ogg";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `gravacao-${stamp}.${ext}`;
}

function getPreferredRecordingMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") return undefined;
    const candidates = [
        "audio/ogg;codecs=opus",
        "audio/mpeg",
        "audio/aac",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
    ];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

const SUPPORTED_REPLY_DOCUMENT_MIME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
]);

const DIRECT_REPLY_AUDIO_MIME_TYPES = new Set([
    "audio/aac",
    "audio/amr",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
]);

const SUPPORTED_REPLY_FILE_EXTENSIONS = new Set([
    "aac",
    "amr",
    "avi",
    "bmp",
    "doc",
    "docx",
    "gif",
    "heic",
    "heif",
    "jpeg",
    "jpg",
    "m4a",
    "mkv",
    "mov",
    "mp3",
    "mp4",
    "ogg",
    "pdf",
    "png",
    "txt",
    "wav",
    "webm",
    "webp",
    "xls",
    "xlsx",
]);

const MIME_BY_FILE_EXTENSION: Record<string, string> = {
    aac: "audio/aac",
    amr: "audio/amr",
    avi: "video/x-msvideo",
    bmp: "image/bmp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    m4a: "audio/mp4",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    ogg: "audio/ogg",
    pdf: "application/pdf",
    png: "image/png",
    txt: "text/plain",
    wav: "audio/wav",
    webm: "video/webm",
    webp: "image/webp",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function normalizeMimeType(rawMimeType: string | null | undefined): string {
    const base = (rawMimeType ?? "").split(";")[0]!.trim().toLowerCase();
    const aliases: Record<string, string> = {
        "audio/mp3": "audio/mpeg",
        "audio/x-mp3": "audio/mpeg",
        "audio/x-mpeg": "audio/mpeg",
        "audio/m4a": "audio/mp4",
        "audio/x-m4a": "audio/mp4",
        "audio/x-aac": "audio/aac",
        "audio/x-wav": "audio/wav",
        "image/jpg": "image/jpeg",
        "application/x-pdf": "application/pdf",
    };
    return aliases[base] ?? base;
}

function getFileExtension(fileName: string | null | undefined): string {
    if (!fileName) return "";
    const trimmed = fileName.trim();
    if (!trimmed.includes(".")) return "";
    return trimmed.split(".").pop()?.toLowerCase() ?? "";
}

function inferMimeTypeFromFileName(fileName: string | null | undefined): string {
    const extension = getFileExtension(fileName);
    return extension ? (MIME_BY_FILE_EXTENSION[extension] ?? "") : "";
}

function isSupportedReplyMediaFile(file: File): boolean {
    const mimeType = normalizeMimeType(file.type) || inferMimeTypeFromFileName(file.name);
    if (mimeType.startsWith("audio/") || mimeType.startsWith("video/") || mimeType.startsWith("image/")) {
        return true;
    }
    if (SUPPORTED_REPLY_DOCUMENT_MIME_TYPES.has(mimeType)) {
        return true;
    }
    const ext = getFileExtension(file.name);
    return Boolean(ext && SUPPORTED_REPLY_FILE_EXTENSIONS.has(ext));
}

function canUploadReplyMediaDirectly(mimeType: string): boolean {
    if (!mimeType) return false;
    if (mimeType.startsWith("image/")) return true;
    if (mimeType.startsWith("video/")) return true;
    if (SUPPORTED_REPLY_DOCUMENT_MIME_TYPES.has(mimeType)) return true;
    if (DIRECT_REPLY_AUDIO_MIME_TYPES.has(mimeType)) return true;
    return false;
}

function shouldForceServerAudioConversion(_rawMimeType: string, normalizedMimeType: string): boolean {
    if (!normalizedMimeType.startsWith("audio/")) return false;
    if (!DIRECT_REPLY_AUDIO_MIME_TYPES.has(normalizedMimeType)) return true;

    // Meta Cloud API is frequently rejecting MediaRecorder .m4a (audio/mp4),
    // even when codec information is missing from the MIME string.
    if (normalizedMimeType === "audio/mp4") {
        return true;
    }

    return false;
}

function getReplyUploadMessageType(mimeType: string): OutboundMediaType {
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("image/")) return "image";
    return "document";
}

function validateReplyMediaSize(file: File, mimeType: string): string | null {
    const messageType = getReplyUploadMessageType(mimeType);
    const maxBytes = getWhatsAppMediaMaxBytes(messageType);
    if (file.size <= maxBytes) {
        return null;
    }

    const label = messageType === "image"
        ? "Imagem"
        : messageType === "audio"
            ? "Audio"
            : messageType === "video"
                ? "Video"
                : "Documento";

    return `${label} muito grande para WhatsApp. Maximo ${formatMegabytes(maxBytes)}MB.`;
}

function getWhatsAppLastStatus(meta: unknown): { status?: string; code?: number; title?: string } {
    const wa = (meta && typeof meta === "object" && "wa" in (meta as any)) ? (meta as any).wa : undefined;
    const last = wa && typeof wa === "object" ? (wa as any).lastStatus : undefined;
    const status = last?.status;

    const errors = Array.isArray(last?.errors) ? last.errors : [];
    const first = errors[0] && typeof errors[0] === "object" ? errors[0] : undefined;
    const code = typeof first?.code === "number" ? first.code : undefined;
    const title = typeof first?.title === "string" ? first.title : undefined;

    return {
        status: typeof status === "string" ? status : undefined,
        code,
        title,
    };
}

function formatWhatsAppStatus(status?: string): string | null {
    if (!status) return null;
    const map: Record<string, string> = {
        sent: "enviado",
        delivered: "entregue",
        read: "lido",
        failed: "falhou",
    };
    return map[status] ?? status;
}

type RoutingInfo = {
    classification?: string;
    classificationLabel?: string;
    assignedTo?: string;
    escalated?: boolean;
};

function getRoutingInfo(meta: unknown): RoutingInfo | null {
    if (!meta || typeof meta !== "object") return null;
    const routing = (meta as Record<string, unknown>).routing;
    if (!routing || typeof routing !== "object") return null;
    const r = routing as Record<string, unknown>;

    const classification = typeof r.classification === "string" ? r.classification : undefined;
    const classificationLabel = typeof r.classificationLabel === "string" ? r.classificationLabel : undefined;
    const assignedTo = typeof r.assignedTo === "string" ? r.assignedTo : undefined;
    const escalated = typeof r.escalated === "boolean" ? r.escalated : undefined;

    if (!classification && !assignedTo && !classificationLabel) return null;
    return { classification, classificationLabel, assignedTo, escalated };
}

function getClassificationLabel(classification?: string, fallbackLabel?: string): string | null {
    if (fallbackLabel) return fallbackLabel;
    if (!classification) return null;

    const labels: Record<string, string> = {
        PEDIDO_STATUS: "Status do pedido",
        PAGAMENTO: "Pagamento",
        REVISAO: "Revisão",
        TECNICO: "Técnico",
        COMERCIAL: "Comercial",
        OUTROS: "Outros",
    };

    return labels[classification] ?? classification;
}

type MediaInfo = {
    messageType?: string;
    mediaUrl?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
    transcription?: string;
};

type OutboundMediaType = "audio" | "video" | "document" | "image";

type UploadedReplyMedia = {
    url: string;
    mimeType: string;
    fileName: string;
    messageType: OutboundMediaType;
    voiceNote?: boolean;
    warning?: string;
};

type DirectReplyUploadSession = UploadedReplyMedia & {
    uploadUrl: string;
    key: string;
    error?: string;
};

function getMediaInfo(meta: unknown): MediaInfo | null {
    if (!meta || typeof meta !== "object") return null;
    const m = meta as Record<string, unknown>;
    if (!m.messageType || m.messageType === "text") return null;
    return {
        messageType: m.messageType as string,
        mediaUrl: m.mediaUrl as string | undefined,
        mimeType: m.mimeType as string | undefined,
        fileName: m.fileName as string | undefined,
        caption: m.caption as string | undefined,
        transcription: m.transcription as string | undefined,
    };
}

function MessageMedia({ media, isInbound }: { media: MediaInfo; isInbound: boolean }) {
    const { messageType, mediaUrl, mimeType, fileName, caption, transcription } = media;
    const [isPdfPreviewVisible, setIsPdfPreviewVisible] = useState(false);
    const selectableTextStyle = {
        userSelect: "text" as const,
        WebkitUserSelect: "text" as const,
    };

    useEffect(() => {
        setIsPdfPreviewVisible(false);
    }, [mediaUrl]);

    if (!mediaUrl) {
        // No persisted URL - show placeholder
        const labels: Record<string, string> = { audio: "Áudio", image: "Imagem", video: "Vídeo", document: "Documento", sticker: "Sticker" };
        return (
            <div className="flex items-center gap-2 text-xs opacity-70 italic py-1">
                <File className="h-3.5 w-3.5" />
                {labels[messageType ?? ""] ?? "Mídia"} (não disponível)
            </div>
        );
    }

    const textColor = isInbound ? "text-[var(--wa-text-dim)]" : "text-dark/80";

    return (
        <div className="space-y-1.5">
            {/* Audio */}
            {messageType === "audio" && (
                <div className="pt-1">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Mic className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs font-medium">Áudio</span>
                    </div>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls preload="none" className="w-full max-w-[280px] h-8" style={{ minWidth: 200 }}>
                        <source src={mediaUrl} type={mimeType ?? "audio/ogg"} />
                    </audio>
                    {transcription && (
                        <p
                            className={`text-xs italic mt-1 select-text cursor-text ${textColor}`}
                            style={selectableTextStyle}
                        >
                            &ldquo;{transcription}&rdquo;
                        </p>
                    )}
                </div>
            )}

            {/* Image */}
            {messageType === "image" && (
                <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={mediaUrl}
                        alt="Imagem recebida"
                        className="rounded-lg max-w-[260px] max-h-[300px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
                        loading="lazy"
                    />
                </a>
            )}

            {/* Sticker */}
            {messageType === "sticker" && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={mediaUrl}
                    alt="Sticker"
                    className="max-w-[140px] max-h-[140px] object-contain"
                    loading="lazy"
                />
            )}

            {/* Video */}
            {messageType === "video" && (
                /* eslint-disable-next-line jsx-a11y/media-has-caption */
                <video
                    controls
                    preload="none"
                    className="rounded-lg max-w-[280px] max-h-[300px]"
                >
                    <source src={mediaUrl} type={mimeType ?? "video/mp4"} />
                </video>
            )}

            {/* Document / PDF */}
            {messageType === "document" && (
                <>
                    {mimeType === "application/pdf" ? (
                        <div>
                            <div className="flex items-center gap-1.5 mb-1">
                                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="text-xs font-medium">{fileName ?? "Documento.pdf"}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPdfPreviewVisible((current) => !current)}
                                className={`text-xs underline ${isInbound ? "text-[var(--wa-text-muted)] hover:text-[var(--wa-text-primary)]" : "text-white/90 hover:text-white"
                                    }`}
                            >
                                {isPdfPreviewVisible ? "Ocultar previa do PDF" : "Ver previa do PDF"}
                            </button>
                            {isPdfPreviewVisible && (
                                <iframe
                                    src={mediaUrl}
                                    title={fileName ?? "PDF"}
                                    loading="lazy"
                                    className="mt-2 w-full max-w-[300px] h-[360px] rounded-lg border border-black/10"
                                />
                            )}
                            <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1 text-xs mt-1 underline ${textColor}`}
                            >
                                <Download className="h-3 w-3" /> Abrir PDF
                            </a>
                        </div>
                    ) : (
                        <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors"
                        >
                            <FileText className="h-5 w-5 flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{fileName ?? "Documento"}</p>
                                <p className={`text-xs ${textColor}`}>{mimeType ?? "Arquivo"}</p>
                            </div>
                            <Download className="h-4 w-4 flex-shrink-0 ml-auto" />
                        </a>
                    )}
                </>
            )}

            {/* Caption (for image/video/document) */}
            {messageType !== "audio" && caption && (
                <p
                    className="text-sm whitespace-pre-wrap leading-relaxed select-text cursor-text"
                    style={selectableTextStyle}
                >
                    {caption}
                </p>
            )}
        </div>
    );
}

// Label badge component
function LabelBadge({ label }: { label: { name: string; color: string; emoji?: string | null } }) {
    return (
        <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
            style={{ backgroundColor: label.color }}
        >
            {label.emoji && <span>{label.emoji}</span>}
            {label.name}
        </span>
    );
}

const COLOR_PALETTE = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#14b8a6", "#3b82f6", "#6366f1", "#a855f7",
    "#ec4899", "#f43f5e", "#78716c", "#334155",
];

const INITIAL_THREAD_MESSAGE_LIMIT = 60;
const THREAD_MESSAGE_LIMIT_STEP = 60;
const MAX_THREAD_MESSAGE_LIMIT = 300;
const INITIAL_THREAD_RENDER_LIMIT = 70;
const THREAD_RENDER_LIMIT_STEP = 40;
const MAX_THREAD_RENDER_LIMIT = MAX_THREAD_MESSAGE_LIMIT;
const THREAD_VIRTUAL_ESTIMATED_ROW_HEIGHT = 132;
const THREAD_VIRTUAL_ROW_GAP = 10;
const THREAD_VIRTUAL_OVERSCAN = 5;
const CONVERSATION_VIRTUAL_ESTIMATED_ROW_HEIGHT = 108;
const CONVERSATION_VIRTUAL_ROW_GAP = 1;
const CONVERSATION_VIRTUAL_OVERSCAN = 4;
const POLLING_FOREGROUND_INTERVAL_MS = 15000;
const POLLING_BACKGROUND_INTERVAL_MS = 30000;
const REPLY_EMOJI_OPTIONS = [
    "🙂", "😊", "😁", "😂", "😍", "🤝", "🙏", "👏",
    "👍", "👎", "✅", "❌", "⚠️", "⏳", "🎉", "✨",
    "🎵", "🎤", "💬", "📩", "❤️", "🔥", "🙌", "🤔",
];
type WhatsAppThemeMode = "light" | "dark";

const DARK_CONTRAST_MIN = 70;
const DARK_CONTRAST_MAX = 130;
const DARK_CONTRAST_DEFAULT = 100;

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace("#", "").trim();
    const safeHex = normalized.length === 3
        ? normalized.split("").map((part) => `${part}${part}`).join("")
        : normalized.padStart(6, "0").slice(0, 6);

    const int = Number.parseInt(safeHex, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return [r, g, b];
}

function toHexChannel(value: number): string {
    return clampNumber(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHex([r, g, b]: [number, number, number]): string {
    return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

function mixHex(baseHex: string, targetHex: string, weight: number): string {
    const safeWeight = clampNumber(weight, 0, 1);
    const [baseR, baseG, baseB] = hexToRgb(baseHex);
    const [targetR, targetG, targetB] = hexToRgb(targetHex);
    return rgbToHex([
        baseR + (targetR - baseR) * safeWeight,
        baseG + (targetG - baseG) * safeWeight,
        baseB + (targetB - baseB) * safeWeight,
    ]);
}

function hexToRgbaString(hex: string, alpha: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${clampNumber(alpha, 0, 1)})`;
}

function applyDarkContrast(baseHex: string, contrastValue: number, highContrastDirection: "darken" | "brighten"): string {
    const contrastDelta = clampNumber(contrastValue, DARK_CONTRAST_MIN, DARK_CONTRAST_MAX) - DARK_CONTRAST_DEFAULT;
    if (contrastDelta === 0) return baseHex;

    const normalizedDelta = Math.abs(contrastDelta) / (DARK_CONTRAST_MAX - DARK_CONTRAST_DEFAULT);
    if (contrastDelta > 0) {
        const strength = normalizedDelta * 0.32;
        const shouldBrighten = highContrastDirection === "brighten";
        return mixHex(baseHex, shouldBrighten ? "#ffffff" : "#000000", strength);
    }

    // On low contrast we keep text readable:
    // backgrounds become lighter, while text darkens only a little.
    if (highContrastDirection === "darken") {
        return mixHex(baseHex, "#ffffff", normalizedDelta * 0.14);
    }

    return mixHex(baseHex, "#000000", normalizedDelta * 0.08);
}

function buildWhatsAppThemeVars(themeMode: WhatsAppThemeMode, darkContrast: number): CSSProperties {
    if (themeMode === "light") {
        return {
            "--wa-app-bg": "#f1f5f9",
            "--wa-surface": "#ffffff",
            "--wa-surface-overlay": "rgba(255, 255, 255, 0.95)",
            "--wa-surface-soft": "#f8fafc",
            "--wa-surface-soft-hover": "#e2e8f0",
            "--wa-surface-soft-hover-dim": "rgba(226, 232, 240, 0.7)",
            "--wa-border": "#e2e8f0",
            "--wa-text-primary": "#0f172a",
            "--wa-text-secondary": "#334155",
            "--wa-text-muted": "#475569",
            "--wa-text-dim": "#64748b",
            "--wa-bubble-admin": "#16a34a",
            "--wa-bubble-admin-hover": "#15803d",
            "--wa-bubble-bot": "#3b82f6",
            "--wa-popover-bg": "#ffffff",
            "--wa-accent": "#16a34a",
            "--wa-accent-soft": "rgba(22, 163, 74, 0.15)",
            "--wa-accent-softer": "rgba(22, 163, 74, 0.10)",
            "--wa-accent-hover": "#15803d",
            "--wa-accent-border": "rgba(22, 163, 74, 0.35)",
            "--wa-accent-ring": "rgba(22, 163, 74, 0.3)",
        } as CSSProperties;
    }

    const appBg = applyDarkContrast("#0b141a", darkContrast, "darken");
    const surface = applyDarkContrast("#111b21", darkContrast, "darken");
    const surfaceSoft = applyDarkContrast("#202c33", darkContrast, "darken");
    const surfaceSoftHover = applyDarkContrast("#374a54", darkContrast, "darken");
    const border = applyDarkContrast("#2a3942", darkContrast, "brighten");
    const textPrimary = applyDarkContrast("#e9edef", darkContrast, "brighten");
    const textSecondary = applyDarkContrast("#d1d7db", darkContrast, "brighten");
    const textMuted = applyDarkContrast("#aebac1", darkContrast, "brighten");
    const textDim = applyDarkContrast("#8696a0", darkContrast, "brighten");
    const bubbleAdmin = applyDarkContrast("#005c4b", darkContrast, "darken");
    const bubbleAdminHover = applyDarkContrast("#004a3d", darkContrast, "darken");
    const bubbleBot = applyDarkContrast("#1d3c45", darkContrast, "darken");
    const popoverBg = applyDarkContrast("#233138", darkContrast, "darken");
    const accent = applyDarkContrast("#00a884", darkContrast, "brighten");
    const accentHover = mixHex(accent, darkContrast >= DARK_CONTRAST_DEFAULT ? "#000000" : "#ffffff", 0.16);

    return {
        "--wa-app-bg": appBg,
        "--wa-surface": surface,
        "--wa-surface-overlay": hexToRgbaString(surface, 0.95),
        "--wa-surface-soft": surfaceSoft,
        "--wa-surface-soft-hover": surfaceSoftHover,
        "--wa-surface-soft-hover-dim": hexToRgbaString(surfaceSoftHover, 0.7),
        "--wa-border": border,
        "--wa-text-primary": textPrimary,
        "--wa-text-secondary": textSecondary,
        "--wa-text-muted": textMuted,
        "--wa-text-dim": textDim,
        "--wa-bubble-admin": bubbleAdmin,
        "--wa-bubble-admin-hover": bubbleAdminHover,
        "--wa-bubble-bot": bubbleBot,
        "--wa-popover-bg": popoverBg,
        "--wa-accent": accent,
        "--wa-accent-soft": hexToRgbaString(accent, 0.2),
        "--wa-accent-softer": hexToRgbaString(accent, 0.1),
        "--wa-accent-hover": accentHover,
        "--wa-accent-border": hexToRgbaString(accent, 0.32),
        "--wa-accent-ring": hexToRgbaString(accent, 0.3),
    } as CSSProperties;
}

export default function WhatsAppPage() {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"ALL" | "BOT" | "HUMAN">("ALL");
    const [humanSubfilter, setHumanSubfilter] = useState<"ALL" | "UNREAD">("ALL");
    const [labelFilter, setLabelFilter] = useState<string>("ALL");
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [threadMessageLimit, setThreadMessageLimit] = useState(INITIAL_THREAD_MESSAGE_LIMIT);
    const [replyText, setReplyText] = useState("");
    const [pendingMediaFile, setPendingMediaFile] = useState<File | null>(null);
    const [pendingMediaIsVoiceNote, setPendingMediaIsVoiceNote] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [newChatPhone, setNewChatPhone] = useState("");
    const [newChatCustomerName, setNewChatCustomerName] = useState("");
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [recordedAudioPreviewUrl, setRecordedAudioPreviewUrl] = useState<string | null>(null);
    const [sendingOrderSongsId, setSendingOrderSongsId] = useState<string | null>(null);
    const [sendingOrderPdfA4Id, setSendingOrderPdfA4Id] = useState<string | null>(null);
    const [creatingVipOrderId, setCreatingVipOrderId] = useState<string | null>(null);
    const [sendingVipOfferOrderId, setSendingVipOfferOrderId] = useState<string | null>(null);
    const [isImmersiveMode, setIsImmersiveMode] = useState(true);
    const [themeMode, setThemeMode] = useState<WhatsAppThemeMode>("light");
    const [darkContrast, setDarkContrast] = useState(DARK_CONTRAST_DEFAULT);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [isIncomingSoundEnabled, setIsIncomingSoundEnabled] = useState(true);
    const [isIncomingSoundBackgroundOnly, setIsIncomingSoundBackgroundOnly] = useState(false);
    const [isDragOverComposer, setIsDragOverComposer] = useState(false);
    const [isTabVisible, setIsTabVisible] = useState(true);
    const [threadRenderLimit, setThreadRenderLimit] = useState(INITIAL_THREAD_RENDER_LIMIT);
    const [conversationListScrollTop, setConversationListScrollTop] = useState(0);
    const [conversationListViewportHeight, setConversationListViewportHeight] = useState(0);
    const [conversationMeasuredHeights, setConversationMeasuredHeights] = useState<Record<string, number>>({});
    const [threadScrollTop, setThreadScrollTop] = useState(0);
    const [threadViewportHeight, setThreadViewportHeight] = useState(0);
    const [threadMeasuredHeights, setThreadMeasuredHeights] = useState<Record<string, number>>({});
    const [incomingAlert, setIncomingAlert] = useState<{
        id: string;
        conversationId: string;
        customerName: string;
        preview: string;
        count: number;
    } | null>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const conversationListViewportRef = useRef<HTMLDivElement>(null);
    const conversationVirtualScrollRafRef = useRef<number | null>(null);
    const conversationRowObserverRef = useRef<ResizeObserver | null>(null);
    const conversationObservedRowsRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const threadViewportRef = useRef<HTMLDivElement>(null);
    const threadVirtualScrollRafRef = useRef<number | null>(null);
    const threadRowObserverRef = useRef<ResizeObserver | null>(null);
    const threadObservedRowsRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const lastThreadIdRef = useRef<string | null>(null);
    const lastMessageIdRef = useRef<string | null>(null);
    const shouldScrollAfterSendRef = useRef(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<BlobPart[]>([]);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordedAudioPreviewRef = useRef<string | null>(null);
    const lastMarkedReadRef = useRef<string | null>(null);
    const seenLastInboundByConversationRef = useRef<Map<string, number>>(new Map());
    const hasInitializedInboundTrackingRef = useRef(false);
    const incomingAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tabFlashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tabFlashOriginalTitleRef = useRef<string>("");
    const utils = api.useUtils();
    const { data: currentAdmin } = api.admin.getCurrentAdmin.useQuery(undefined, {
        refetchInterval: 30000,
    });
    const operatorName = (currentAdmin?.name ?? currentAdmin?.username ?? "").trim();
    const safeDarkContrast = clampNumber(Math.round(darkContrast), DARK_CONTRAST_MIN, DARK_CONTRAST_MAX);
    const isDarkTheme = themeMode === "dark";
    const whatsappThemeStyle = useMemo(
        () => buildWhatsAppThemeVars(themeMode, safeDarkContrast),
        [safeDarkContrast, themeMode]
    );
    const effectiveImmersiveMode = isImmersiveMode && !isMobileViewport;

    // Label context menu state
    const [labelMenuOpen, setLabelMenuOpen] = useState(false);
    const [labelMenuPosition, setLabelMenuPosition] = useState({ x: 0, y: 0 });
    const [labelMenuConvId, setLabelMenuConvId] = useState<string | null>(null);
    const [createLabelOpen, setCreateLabelOpen] = useState(false);
    const [newLabelName, setNewLabelName] = useState("");
    const [newLabelColor, setNewLabelColor] = useState("#3b82f6");
    const [newLabelEmoji, setNewLabelEmoji] = useState("");
    const labelMenuRef = useRef<HTMLDivElement>(null);
    const conversationsRefetchInterval = isTabVisible
        ? POLLING_FOREGROUND_INTERVAL_MS
        : POLLING_BACKGROUND_INTERVAL_MS;
    const threadRefetchInterval = isTabVisible
        ? (threadMessageLimit >= 180 ? 20000 : POLLING_FOREGROUND_INTERVAL_MS)
        : POLLING_BACKGROUND_INTERVAL_MS;

    useEffect(() => {
        const updateViewportMode = () => {
            setIsMobileViewport(window.innerWidth < 1024);
        };

        updateViewportMode();
        window.addEventListener("resize", updateViewportMode);
        return () => window.removeEventListener("resize", updateViewportMode);
    }, []);

    const { data: conversations, isLoading } = api.admin.getWhatsAppConversations.useQuery(
        { page, pageSize: 30, search: search || undefined, filter, labelFilter },
        {
            refetchInterval: conversationsRefetchInterval,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: false,
            gcTime: 60_000,
        }
    );

    const filteredConversations = useMemo(() => {
        const items = conversations?.items ?? [];
        if (filter === "HUMAN" && humanSubfilter === "UNREAD") {
            return items.filter((conversation) => (conversation.unreadCount ?? 0) > 0);
        }
        return items;
    }, [conversations?.items, filter, humanSubfilter]);

    useEffect(() => {
        const validIds = new Set(filteredConversations.map((conversation) => conversation.id));
        const observer = conversationRowObserverRef.current;

        for (const [conversationId, element] of conversationObservedRowsRef.current.entries()) {
            if (validIds.has(conversationId)) continue;
            if (observer) {
                observer.unobserve(element);
            }
            conversationObservedRowsRef.current.delete(conversationId);
        }

        setConversationMeasuredHeights((current) => {
            let hasChanges = false;
            const next: Record<string, number> = {};

            for (const [conversationId, height] of Object.entries(current)) {
                if (!validIds.has(conversationId)) {
                    hasChanges = true;
                    continue;
                }
                next[conversationId] = height;
            }

            return hasChanges ? next : current;
        });
    }, [filteredConversations]);

    const { data: thread } = api.admin.getWhatsAppMessages.useQuery(
        { conversationId: selectedId!, messageLimit: threadMessageLimit },
        {
            enabled: !!selectedId,
            refetchInterval: threadRefetchInterval,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: false,
            gcTime: 60_000,
        }
    );

    const { data: stats } = api.admin.getWhatsAppStats.useQuery(undefined, {
        refetchInterval: 30000,
    });

    const { data: allLabels } = api.admin.getWhatsAppLabels.useQuery();

    useEffect(() => {
        setThreadMessageLimit(INITIAL_THREAD_MESSAGE_LIMIT);
        setThreadRenderLimit(INITIAL_THREAD_RENDER_LIMIT);
        setThreadMeasuredHeights({});
        setIsEmojiPickerOpen(false);
        const rowObserver = threadRowObserverRef.current;
        if (rowObserver) {
            for (const element of threadObservedRowsRef.current.values()) {
                rowObserver.unobserve(element);
            }
        }
        threadObservedRowsRef.current.clear();
        setThreadScrollTop(0);
        setThreadViewportHeight(0);
    }, [selectedId]);

    useEffect(() => {
        if (typeof document === "undefined") return;

        const updateVisibility = () => {
            setIsTabVisible(document.visibilityState === "visible");
        };

        updateVisibility();
        document.addEventListener("visibilitychange", updateVisibility);
        return () => document.removeEventListener("visibilitychange", updateVisibility);
    }, []);

    const handleConversationListViewportScroll = useCallback(() => {
        if (typeof window === "undefined") return;
        const viewport = conversationListViewportRef.current;
        if (!viewport) return;

        if (conversationVirtualScrollRafRef.current !== null) {
            window.cancelAnimationFrame(conversationVirtualScrollRafRef.current);
        }

        conversationVirtualScrollRafRef.current = window.requestAnimationFrame(() => {
            setConversationListScrollTop(viewport.scrollTop);
            conversationVirtualScrollRafRef.current = null;
        });
    }, []);

    const registerConversationRow = useCallback((conversationId: string) => {
        return (element: HTMLDivElement | null) => {
            const observer = conversationRowObserverRef.current;
            const observedRows = conversationObservedRowsRef.current;
            const previousElement = observedRows.get(conversationId);

            if (previousElement && previousElement !== element && observer) {
                observer.unobserve(previousElement);
            }

            if (!element) {
                observedRows.delete(conversationId);
                return;
            }

            observedRows.set(conversationId, element);
            if (observer) {
                observer.observe(element);
            }

            const measured = Math.ceil(element.getBoundingClientRect().height);
            if (measured > 0) {
                setConversationMeasuredHeights((current) => {
                    if (current[conversationId] === measured) return current;
                    return { ...current, [conversationId]: measured };
                });
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver((entries) => {
            setConversationMeasuredHeights((current) => {
                let hasChanges = false;
                const next = { ...current };

                for (const entry of entries) {
                    const element = entry.target as HTMLDivElement;
                    const conversationId = element.dataset.conversationId;
                    if (!conversationId) continue;
                    const measured = Math.ceil(element.getBoundingClientRect().height);
                    if (!Number.isFinite(measured) || measured <= 0) continue;
                    if (next[conversationId] === measured) continue;
                    next[conversationId] = measured;
                    hasChanges = true;
                }

                return hasChanges ? next : current;
            });
        });

        conversationRowObserverRef.current = observer;
        for (const element of conversationObservedRowsRef.current.values()) {
            observer.observe(element);
        }

        return () => {
            observer.disconnect();
            conversationRowObserverRef.current = null;
        };
    }, []);

    useEffect(() => {
        const viewport = conversationListViewportRef.current;
        if (!viewport) return;

        const syncViewportMetrics = () => {
            setConversationListViewportHeight(viewport.clientHeight);
            setConversationListScrollTop(viewport.scrollTop);
        };

        syncViewportMetrics();

        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(syncViewportMetrics);
        observer.observe(viewport);

        return () => {
            observer.disconnect();
        };
    }, [labelFilter, filter, humanSubfilter, page, search]);

    useEffect(() => {
        const viewport = conversationListViewportRef.current;
        if (viewport) {
            viewport.scrollTop = 0;
        }
        setConversationListScrollTop(0);
    }, [labelFilter, filter, humanSubfilter, page, search]);

    useEffect(() => {
        return () => {
            if (typeof window === "undefined") return;
            if (conversationVirtualScrollRafRef.current !== null) {
                window.cancelAnimationFrame(conversationVirtualScrollRafRef.current);
                conversationVirtualScrollRafRef.current = null;
            }
        };
    }, []);

    const handleThreadViewportScroll = useCallback(() => {
        if (typeof window === "undefined") return;
        const viewport = threadViewportRef.current;
        if (!viewport) return;

        if (threadVirtualScrollRafRef.current !== null) {
            window.cancelAnimationFrame(threadVirtualScrollRafRef.current);
        }

        threadVirtualScrollRafRef.current = window.requestAnimationFrame(() => {
            setThreadScrollTop(viewport.scrollTop);
            threadVirtualScrollRafRef.current = null;
        });
    }, []);

    const scrollThreadViewportToBottom = useCallback((behavior: ScrollBehavior) => {
        const viewport = threadViewportRef.current;
        if (!viewport) return;

        viewport.scrollTo({ top: viewport.scrollHeight, behavior });
        setThreadScrollTop(viewport.scrollTop);
    }, []);

    useEffect(() => {
        return () => {
            if (typeof window === "undefined") return;
            if (threadVirtualScrollRafRef.current !== null) {
                window.cancelAnimationFrame(threadVirtualScrollRafRef.current);
                threadVirtualScrollRafRef.current = null;
            }
        };
    }, []);

    const registerThreadMessageRow = useCallback((messageId: string) => {
        return (element: HTMLDivElement | null) => {
            const observer = threadRowObserverRef.current;
            const observedRows = threadObservedRowsRef.current;
            const previousElement = observedRows.get(messageId);

            if (previousElement && previousElement !== element && observer) {
                observer.unobserve(previousElement);
            }

            if (!element) {
                observedRows.delete(messageId);
                return;
            }

            observedRows.set(messageId, element);
            if (observer) {
                observer.observe(element);
            }

            const measured = Math.ceil(element.getBoundingClientRect().height);
            if (measured > 0) {
                setThreadMeasuredHeights((current) => {
                    if (current[messageId] === measured) return current;
                    return { ...current, [messageId]: measured };
                });
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver((entries) => {
            setThreadMeasuredHeights((current) => {
                let hasChanges = false;
                const next = { ...current };

                for (const entry of entries) {
                    const element = entry.target as HTMLDivElement;
                    const messageId = element.dataset.messageId;
                    if (!messageId) continue;
                    const measured = Math.ceil(element.getBoundingClientRect().height);
                    if (!Number.isFinite(measured) || measured <= 0) continue;
                    if (next[messageId] === measured) continue;
                    next[messageId] = measured;
                    hasChanges = true;
                }

                return hasChanges ? next : current;
            });
        });

        threadRowObserverRef.current = observer;
        for (const element of threadObservedRowsRef.current.values()) {
            observer.observe(element);
        }

        return () => {
            observer.disconnect();
            threadRowObserverRef.current = null;
        };
    }, []);

    useEffect(() => {
        const viewport = threadViewportRef.current;
        if (!viewport) return;

        const syncViewportMetrics = () => {
            setThreadViewportHeight(viewport.clientHeight);
            setThreadScrollTop(viewport.scrollTop);
        };

        syncViewportMetrics();

        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(syncViewportMetrics);
        observer.observe(viewport);

        return () => {
            observer.disconnect();
        };
    }, [selectedId, thread?.conversation.id]);

    const clearRecordingTimer = useCallback(() => {
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
    }, []);

    const stopRecordingStream = useCallback(() => {
        if (recordingStreamRef.current) {
            recordingStreamRef.current.getTracks().forEach((track) => track.stop());
            recordingStreamRef.current = null;
        }
    }, []);

    const cleanupRecordedAudioPreview = useCallback(() => {
        if (recordedAudioPreviewRef.current) {
            URL.revokeObjectURL(recordedAudioPreviewRef.current);
            recordedAudioPreviewRef.current = null;
        }
    }, []);

    const revokeRecordedAudioPreview = useCallback(() => {
        cleanupRecordedAudioPreview();
        setRecordedAudioPreviewUrl(null);
    }, [cleanupRecordedAudioPreview]);

    const clearPendingMedia = useCallback(() => {
        setPendingMediaFile(null);
        setPendingMediaIsVoiceNote(false);
        revokeRecordedAudioPreview();
        if (mediaInputRef.current) {
            mediaInputRef.current.value = "";
        }
    }, [revokeRecordedAudioPreview]);

    const stopAudioRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;

        if (recorder.state !== "inactive") {
            recorder.stop();
        } else {
            mediaRecorderRef.current = null;
            clearRecordingTimer();
            stopRecordingStream();
            setIsRecordingAudio(false);
            setRecordingSeconds(0);
        }
    }, [clearRecordingTimer, stopRecordingStream]);

    const startAudioRecording = useCallback(async () => {
        const activeOperatorName = operatorName.trim();
        const activeLockOwner =
            thread && isLockActive(thread.conversation.lockExpiresAt)
                ? (thread.conversation.assignedTo || null)
                : null;
        const currentlyLockedByOther = Boolean(activeLockOwner && activeLockOwner !== activeOperatorName);

        if (!activeOperatorName || currentlyLockedByOther || isUploadingMedia) return;

        if (typeof window === "undefined" || typeof navigator === "undefined") {
            toast.error("Gravação de áudio indisponível neste navegador.");
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            toast.error("Seu navegador não suporta gravação por microfone.");
            return;
        }

        if (pendingMediaFile) {
            const shouldReplace = confirm("Já existe uma mídia anexada. Deseja substituir pela gravação?");
            if (!shouldReplace) return;
            clearPendingMedia();
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredMimeType = getPreferredRecordingMimeType();
            const recorder = preferredMimeType
                ? new MediaRecorder(stream, { mimeType: preferredMimeType })
                : new MediaRecorder(stream);

            recordingStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            recordingChunksRef.current = [];
            setRecordingSeconds(0);
            setIsRecordingAudio(true);

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    recordingChunksRef.current.push(event.data);
                }
            };

            recorder.onerror = () => {
                toast.error("Falha ao gravar áudio. Tente novamente.");
                mediaRecorderRef.current = null;
                clearRecordingTimer();
                stopRecordingStream();
                setIsRecordingAudio(false);
                setRecordingSeconds(0);
            };

            recorder.onstop = () => {
                const mimeType = recorder.mimeType || preferredMimeType || "audio/ogg";
                const blob = new Blob(recordingChunksRef.current, { type: mimeType });
                recordingChunksRef.current = [];
                mediaRecorderRef.current = null;
                clearRecordingTimer();
                stopRecordingStream();
                setIsRecordingAudio(false);
                setRecordingSeconds(0);

                if (blob.size <= 0) {
                    toast.error("Nenhum áudio capturado.");
                    return;
                }

                const filename = buildRecordedAudioName(mimeType);
                const file = new globalThis.File([blob], filename, { type: mimeType });
                const previewUrl = URL.createObjectURL(blob);
                cleanupRecordedAudioPreview();

                setPendingMediaFile(file);
                setPendingMediaIsVoiceNote(true);
                recordedAudioPreviewRef.current = previewUrl;
                setRecordedAudioPreviewUrl(previewUrl);
                if (mediaInputRef.current) {
                    mediaInputRef.current.value = "";
                }
                toast.success("Áudio gravado. Clique em enviar para mandar ao cliente.");
            };

            recorder.start();
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds((seconds) => seconds + 1);
            }, 1000);
        } catch {
            stopRecordingStream();
            setIsRecordingAudio(false);
            setRecordingSeconds(0);
            toast.error("Não foi possível acessar o microfone.");
        }
    }, [
        clearPendingMedia,
        clearRecordingTimer,
        cleanupRecordedAudioPreview,
        isUploadingMedia,
        operatorName,
        pendingMediaFile,
        stopRecordingStream,
        thread,
    ]);

    useEffect(() => {
        return () => {
            clearRecordingTimer();
            stopRecordingStream();
            cleanupRecordedAudioPreview();
        };
    }, [clearRecordingTimer, cleanupRecordedAudioPreview, stopRecordingStream]);

    const sendReply = api.admin.sendWhatsAppReply.useMutation({
        onSuccess: () => {
            setReplyText("");
            setIsEmojiPickerOpen(false);
            clearPendingMedia();
            toast.success("Mensagem enfileirada para envio");
            shouldScrollAfterSendRef.current = true;
            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
        },
    });

    const startConversation = api.admin.startWhatsAppConversation.useMutation();

    const claimConversation = api.admin.claimWhatsAppConversation.useMutation({
        onSuccess: () => {
            toast.success("Conversa assumida");
            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const releaseConversation = api.admin.releaseWhatsAppConversation.useMutation({
        onSuccess: () => {
            toast.success("Conversa liberada");
            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const heartbeatConversation = api.admin.heartbeatWhatsAppConversation.useMutation({
        onError: (e) => {
            if (!e.message.includes("não possui o lock")) {
                toast.error(`Erro heartbeat: ${e.message}`);
            }
        },
    });

    const toggleBot = api.admin.toggleWhatsAppBot.useMutation({
        onSuccess: (data) => {
            toast.success(data.isBot ? "Bot ativado" : "Bot desativado");
            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const clearConversation = api.admin.clearWhatsAppConversation.useMutation({
        onSuccess: (data) => {
            toast.success(`${data.deletedCount} mensagens apagadas`);
            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });
    const markConversationRead = api.admin.markWhatsAppConversationRead.useMutation({
        onSuccess: () => {
            void utils.admin.getWhatsAppConversations.invalidate();
            void utils.admin.getWhatsAppMessages.invalidate();
        },
        onError: (e) => toast.error(`Erro ao marcar como lida: ${e.message}`),
    });
    const markConversationUnread = api.admin.markWhatsAppConversationUnread.useMutation({
        onSuccess: () => {
            void utils.admin.getWhatsAppConversations.invalidate();
            void utils.admin.getWhatsAppMessages.invalidate();
        },
        onError: (e) => toast.error(`Erro ao marcar como não lida: ${e.message}`),
    });
    const sendOrderSongs = api.admin.sendWhatsAppOrderSongs.useMutation();
    const sendOrderLyricsPdfA4 = api.admin.sendWhatsAppOrderLyricsPdfA4.useMutation();
    const sendReplyQuiet = api.admin.sendWhatsAppReply.useMutation();
    const createStreamingUpsellForSong = api.admin.createStreamingUpsellForSong.useMutation();

    const setConversationLabel = api.admin.setConversationLabel.useMutation({
        onSuccess: () => {
            void utils.admin.getWhatsAppConversations.invalidate();
            void utils.admin.getWhatsAppMessages.invalidate();
            setLabelMenuOpen(false);
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const createLabel = api.admin.createWhatsAppLabel.useMutation({
        onSuccess: () => {
            toast.success("Label criada");
            setCreateLabelOpen(false);
            setNewLabelName("");
            setNewLabelColor("#3b82f6");
            setNewLabelEmoji("");
            void utils.admin.getWhatsAppLabels.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const deleteLabel = api.admin.deleteWhatsAppLabel.useMutation({
        onSuccess: () => {
            toast.success("Label removida");
            void utils.admin.getWhatsAppLabels.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
            void utils.admin.getWhatsAppMessages.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    // Order details modal
    const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
    const {
        data: viewingLead,
        error: viewingLeadError,
        isLoading: isViewingLeadLoading,
        isFetching: isViewingLeadFetching,
    } = api.admin.getLeadById.useQuery(
        { id: viewingOrderId ?? "" },
        {
            enabled: !!viewingOrderId,
            refetchOnWindowFocus: false,
            retry: false,
        }
    );
    const isViewingLeadPending = isViewingLeadLoading || isViewingLeadFetching;
    const handleOpenOrderDetails = useCallback((orderId: string) => {
        setViewingOrderId(orderId);
    }, []);

    useEffect(() => {
        if (!viewingLeadError || !viewingOrderId) return;
        toast.error(`Não foi possível abrir o pedido ${viewingOrderId.slice(0, 8)}.`);
        setViewingOrderId(null);
    }, [viewingLeadError, viewingOrderId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const saved = window.localStorage.getItem("wa_incoming_sound_enabled");
        if (saved === "0") {
            setIsIncomingSoundEnabled(false);
        }
        const backgroundOnly = window.localStorage.getItem("wa_incoming_sound_background_only");
        if (backgroundOnly === "1") {
            setIsIncomingSoundBackgroundOnly(true);
        }
        const savedThemeMode = window.localStorage.getItem("wa_theme_mode");
        if (savedThemeMode === "light" || savedThemeMode === "dark") {
            setThemeMode(savedThemeMode);
        }
        const savedDarkContrast = Number.parseInt(window.localStorage.getItem("wa_dark_contrast") ?? "", 10);
        if (Number.isFinite(savedDarkContrast)) {
            setDarkContrast(clampNumber(savedDarkContrast, DARK_CONTRAST_MIN, DARK_CONTRAST_MAX));
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem("wa_incoming_sound_enabled", isIncomingSoundEnabled ? "1" : "0");
    }, [isIncomingSoundEnabled]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem("wa_incoming_sound_background_only", isIncomingSoundBackgroundOnly ? "1" : "0");
    }, [isIncomingSoundBackgroundOnly]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem("wa_theme_mode", themeMode);
    }, [themeMode]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem("wa_dark_contrast", String(safeDarkContrast));
    }, [safeDarkContrast]);

    useEffect(() => {
        if (!isImmersiveMode || typeof document === "undefined") return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isImmersiveMode]);

    useEffect(() => {
        if (!isImmersiveMode || typeof window === "undefined") return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsImmersiveMode(false);
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isImmersiveMode]);

    const playIncomingMessageSound = useCallback(() => {
        if (!isIncomingSoundEnabled || typeof window === "undefined") return;
        if (
            isIncomingSoundBackgroundOnly &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible"
        ) {
            return;
        }
        try {
            const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextCtor) return;

            const audioCtx = new AudioContextCtor();
            const now = audioCtx.currentTime;
            const master = audioCtx.createGain();
            master.gain.setValueAtTime(0.0001, now);
            master.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
            master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
            master.connect(audioCtx.destination);

            const scheduleTone = (frequency: number, startAt: number, duration: number) => {
                const oscillator = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                oscillator.type = "sine";
                oscillator.frequency.setValueAtTime(frequency, startAt);
                gain.gain.setValueAtTime(0.0001, startAt);
                gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
                oscillator.connect(gain);
                gain.connect(master);
                oscillator.start(startAt);
                oscillator.stop(startAt + duration);
            };

            scheduleTone(880, now, 0.13);
            scheduleTone(1174.66, now + 0.14, 0.14);

            window.setTimeout(() => {
                void audioCtx.close().catch(() => undefined);
            }, 900);
        } catch {
            // Browser may block auto-played audio before user gesture; ignore silently.
        }
    }, [isIncomingSoundBackgroundOnly, isIncomingSoundEnabled]);

    const stopTabFlash = useCallback(() => {
        if (tabFlashIntervalRef.current) {
            clearInterval(tabFlashIntervalRef.current);
            tabFlashIntervalRef.current = null;
        }
        if (typeof document !== "undefined" && tabFlashOriginalTitleRef.current) {
            document.title = tabFlashOriginalTitleRef.current;
        }
    }, []);

    const startTabFlash = useCallback((newMessagesCount: number) => {
        if (typeof document === "undefined") return;
        if (document.visibilityState === "visible") return;

        if (!tabFlashOriginalTitleRef.current) {
            tabFlashOriginalTitleRef.current = document.title;
        }

        if (tabFlashIntervalRef.current) {
            clearInterval(tabFlashIntervalRef.current);
            tabFlashIntervalRef.current = null;
        }

        const unreadLabel = newMessagesCount > 1
            ? `🔔 ${newMessagesCount} novas mensagens no WhatsApp`
            : "🔔 Nova mensagem no WhatsApp";
        let showAlertTitle = true;
        document.title = unreadLabel;

        tabFlashIntervalRef.current = setInterval(() => {
            showAlertTitle = !showAlertTitle;
            document.title = showAlertTitle
                ? unreadLabel
                : (tabFlashOriginalTitleRef.current || "Apollo Song");
        }, 900);
    }, []);

    useEffect(() => {
        if (typeof document === "undefined") return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                stopTabFlash();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            stopTabFlash();
        };
    }, [stopTabFlash]);

    useEffect(() => {
        if (!conversations?.items) return;

        const currentSnapshot = new Map<string, number>();
        const newlyUpdated: Array<{
            conversationId: string;
            customerName: string;
            preview: string;
            timestamp: number;
        }> = [];

        for (const conversation of conversations.items) {
            const lastInboundMs = conversation.lastCustomerMessageAt
                ? new Date(conversation.lastCustomerMessageAt).getTime()
                : 0;

            if (!lastInboundMs || !Number.isFinite(lastInboundMs)) continue;
            currentSnapshot.set(conversation.id, lastInboundMs);

            const previouslySeen = seenLastInboundByConversationRef.current.get(conversation.id) ?? 0;
            if (hasInitializedInboundTrackingRef.current && lastInboundMs > previouslySeen) {
                const latestInbound = conversation.messages.find((message) => message.direction === "inbound");
                const preview = (latestInbound?.body ?? "Nova mensagem")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 120);

                newlyUpdated.push({
                    conversationId: conversation.id,
                    customerName: conversation.customerName || conversation.waId,
                    preview: preview || "Nova mensagem",
                    timestamp: lastInboundMs,
                });
            }
        }

        seenLastInboundByConversationRef.current = currentSnapshot;

        if (!hasInitializedInboundTrackingRef.current) {
            hasInitializedInboundTrackingRef.current = true;
            return;
        }

        if (newlyUpdated.length === 0) return;

        newlyUpdated.sort((a, b) => b.timestamp - a.timestamp);
        const latest = newlyUpdated[0]!;
        setIncomingAlert({
            id: `${latest.conversationId}:${latest.timestamp}`,
            conversationId: latest.conversationId,
            customerName: latest.customerName,
            preview: latest.preview,
            count: newlyUpdated.length,
        });
        playIncomingMessageSound();
        startTabFlash(newlyUpdated.length);
    }, [conversations?.items, playIncomingMessageSound, startTabFlash]);

    useEffect(() => {
        if (!incomingAlert) return;
        if (incomingAlertTimeoutRef.current) {
            clearTimeout(incomingAlertTimeoutRef.current);
            incomingAlertTimeoutRef.current = null;
        }
        incomingAlertTimeoutRef.current = setTimeout(() => {
            setIncomingAlert(null);
            incomingAlertTimeoutRef.current = null;
        }, 6500);

        return () => {
            if (incomingAlertTimeoutRef.current) {
                clearTimeout(incomingAlertTimeoutRef.current);
                incomingAlertTimeoutRef.current = null;
            }
        };
    }, [incomingAlert]);

    // Keep scroll stable during polling; only scroll on conversation switch
    // and right after this operator sends a message.
    useEffect(() => {
        if (!thread) return;

        const threadId = thread.conversation.id;
        const latestMessageId = thread.messages.length > 0
            ? thread.messages[thread.messages.length - 1]?.id ?? null
            : null;
        const isConversationChanged = lastThreadIdRef.current !== threadId;

        if (isConversationChanged) {
            lastThreadIdRef.current = threadId;
            lastMessageIdRef.current = latestMessageId;
            scrollThreadViewportToBottom("auto");
            shouldScrollAfterSendRef.current = false;
            return;
        }

        const hasNewMessages = Boolean(latestMessageId && latestMessageId !== lastMessageIdRef.current);
        lastMessageIdRef.current = latestMessageId;

        if (hasNewMessages && shouldScrollAfterSendRef.current) {
            scrollThreadViewportToBottom("smooth");
            shouldScrollAfterSendRef.current = false;
        }
    }, [scrollThreadViewportToBottom, thread?.conversation.id, thread?.messages.length]);

    // Keep lock alive while this operator is viewing a claimed conversation
    useEffect(() => {
        if (!thread) return;
        const trimmed = operatorName.trim();
        if (!trimmed) return;
        if (thread.conversation.assignedTo !== trimmed) return;
        if (!isLockActive(thread.conversation.lockExpiresAt)) return;

        const interval = setInterval(() => {
            heartbeatConversation.mutate({
                conversationId: thread.conversation.id,
            });
        }, 60 * 1000);

        return () => clearInterval(interval);
    }, [thread, operatorName]);

    useEffect(() => {
        if (!thread) return;
        if (!thread.conversation.isBot) return;
        const unreadCount = thread.conversation.unreadCount ?? 0;
        if (unreadCount <= 0) return;
        if (markConversationRead.isPending) return;

        const marker = `${thread.conversation.id}:${unreadCount}`;
        if (lastMarkedReadRef.current === marker) return;
        lastMarkedReadRef.current = marker;

        markConversationRead.mutate({
            conversationId: thread.conversation.id,
        });
    }, [markConversationRead, markConversationRead.isPending, thread]);

    // Close label menu on click outside
    useEffect(() => {
        if (!labelMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (labelMenuRef.current && !labelMenuRef.current.contains(e.target as Node)) {
                setLabelMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [labelMenuOpen]);

    // Close emoji picker on click outside
    useEffect(() => {
        if (!isEmojiPickerOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (emojiPickerRef.current?.contains(target)) return;
            if (emojiButtonRef.current?.contains(target)) return;
            setIsEmojiPickerOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isEmojiPickerOpen]);

    const handleContextMenu = useCallback((e: React.MouseEvent, convId: string) => {
        e.preventDefault();
        setLabelMenuConvId(convId);
        setLabelMenuPosition({ x: e.clientX, y: e.clientY });
        setLabelMenuOpen(true);
    }, []);

    const uploadReplyMedia = async (file: File, voiceNote: boolean): Promise<UploadedReplyMedia> => {
        const rawMimeType = (file.type || "").toLowerCase();
        const normalizedMimeType = normalizeMimeType(rawMimeType) || inferMimeTypeFromFileName(file.name) || "application/octet-stream";
        const sizeValidationError = validateReplyMediaSize(file, normalizedMimeType);
        if (sizeValidationError) {
            throw new Error(sizeValidationError);
        }
        const normalizedFileName = file.name?.trim() || `arquivo-${Date.now()}`;
        const fileForUpload = (file.type === normalizedMimeType && file.name === normalizedFileName)
            ? file
            : new globalThis.File([file], normalizedFileName, {
                type: normalizedMimeType,
                lastModified: file.lastModified,
            });

        const requiresServerAudioConversion = shouldForceServerAudioConversion(rawMimeType, normalizedMimeType);

        const canUseDirectUpload = (voiceNote ? normalizedMimeType.startsWith("audio/") : canUploadReplyMediaDirectly(normalizedMimeType))
            && (!requiresServerAudioConversion || voiceNote);

        if (canUseDirectUpload) {
            try {
                const sessionResponse = await fetch("/api/admin/whatsapp/upload-media-url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileName: fileForUpload.name,
                        mimeType: rawMimeType || normalizedMimeType,
                        fileSize: fileForUpload.size,
                        voiceNote,
                    }),
                });

                const sessionRawBody = await sessionResponse.text();
                let sessionPayload: DirectReplyUploadSession | null = null;
                try {
                    sessionPayload = JSON.parse(sessionRawBody) as DirectReplyUploadSession;
                } catch {
                    sessionPayload = null;
                }

                if (
                    sessionResponse.ok &&
                    sessionPayload?.uploadUrl &&
                    sessionPayload.url &&
                    sessionPayload.messageType
                ) {
                    const uploadResponse = await fetch(sessionPayload.uploadUrl, {
                        method: "PUT",
                        headers: {
                            "Content-Type": sessionPayload.mimeType || normalizedMimeType,
                        },
                        body: fileForUpload,
                    });

                    if (!uploadResponse.ok) {
                        throw new Error(`Falha no upload direto (${uploadResponse.status}).`);
                    }

                    return {
                        url: sessionPayload.url,
                        mimeType: sessionPayload.mimeType,
                        fileName: sessionPayload.fileName,
                        messageType: sessionPayload.messageType,
                    };
                }

                if (!sessionResponse.ok) {
                    const sessionErrorMessage = sessionPayload?.error || sessionRawBody.trim() || `Falha ao iniciar upload da mídia (${sessionResponse.status}).`;
                    throw new Error(sessionErrorMessage);
                }

                throw new Error("Resposta inválida ao iniciar upload direto da mídia.");
            } catch (error) {
                console.warn("[WhatsApp composer] Direct upload failed, falling back to server upload.", error);
            }
        }

        const formData = new FormData();
        formData.append("file", fileForUpload);
        formData.append("voiceNote", voiceNote ? "1" : "0");

        const response = await fetch("/api/admin/whatsapp/upload-media", {
            method: "POST",
            body: formData,
        });

        const rawBody = await response.text();
        let payload: (UploadedReplyMedia & { error?: string }) | null = null;
        try {
            payload = JSON.parse(rawBody) as UploadedReplyMedia & { error?: string };
        } catch {
            payload = null;
        }

        if (!response.ok || !payload?.url || !payload?.messageType) {
            const fallbackError = rawBody.trim() || `Falha no upload da mídia (${response.status}).`;
            throw new Error(payload?.error || fallbackError);
        }

        return payload;
    };

    const getPendingMediaIcon = (file: File | null) => {
        if (!file) return <File className="h-3.5 w-3.5" />;
        if (file.type.startsWith("audio/")) return <Mic className="h-3.5 w-3.5" />;
        if (file.type.startsWith("video/")) return <Video className="h-3.5 w-3.5" />;
        if (file.type.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5" />;
        return <FileText className="h-3.5 w-3.5" />;
    };

    const handleSendReply = async () => {
        const trimmed = operatorName.trim();
        const text = replyText.trim();
        if (!selectedId || !trimmed) return;
        if (isRecordingAudio) {
            toast.error("Pare a gravação antes de enviar.");
            return;
        }
        if (!text && !pendingMediaFile) return;

        shouldScrollAfterSendRef.current = true;

        try {
            if (pendingMediaFile) {
                setIsUploadingMedia(true);
                const uploadedMedia = await uploadReplyMedia(pendingMediaFile, pendingMediaIsVoiceNote);
                if (uploadedMedia.warning) {
                    toast.warning(uploadedMedia.warning);
                }
                await sendReply.mutateAsync({
                    conversationId: selectedId,
                    body: text || undefined,
                    media: {
                        url: uploadedMedia.url,
                        messageType: uploadedMedia.messageType,
                        mimeType: uploadedMedia.mimeType,
                        fileName: uploadedMedia.fileName,
                        voiceNote: uploadedMedia.voiceNote ?? pendingMediaIsVoiceNote,
                        caption: text || undefined,
                    },
                });
            } else {
                await sendReply.mutateAsync({
                    conversationId: selectedId,
                    body: text,
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao enviar mensagem";
            toast.error(`Erro: ${message}`);
        } finally {
            setIsUploadingMedia(false);
        }
    };

    const handleSendOrderSongs = async (orderId: string, forceTakeover = false) => {
        if (!thread) return;
        if (!operatorName) {
            toast.error("Aguardando identificação do atendente logado.");
            return;
        }

        setSendingOrderSongsId(orderId);
        shouldScrollAfterSendRef.current = true;

        try {
            const result = await sendOrderSongs.mutateAsync({
                conversationId: thread.conversation.id,
                orderId,
                forceTakeover,
            });

            if (result.queued) {
                toast.success(`Envio enfileirado (${result.totalTracks} música(s)).`);
            } else if (result.failedCount > 0) {
                toast.error(`Enviadas ${result.sentCount}/${result.totalTracks} música(s). ${result.failedCount} falhou(aram).`);
            } else {
                toast.success(`${result.sentCount} música(s) enviada(s) para o cliente.`);
            }

            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao enviar músicas do pedido";
            if (!forceTakeover && message.includes("Conversa em atendimento por")) {
                const ok = confirm(`${message}. Deseja assumir mesmo assim?`);
                if (!ok) return;
                await handleSendOrderSongs(orderId, true);
                return;
            }
            toast.error(`Erro: ${message}`);
        } finally {
            setSendingOrderSongsId((current) => (current === orderId ? null : current));
        }
    };

    const handleSendOrderLyricsPdfA4 = async (orderId: string, forceTakeover = false) => {
        if (!thread) return;
        if (!operatorName) {
            toast.error("Aguardando identificação do atendente logado.");
            return;
        }

        setSendingOrderPdfA4Id(orderId);
        shouldScrollAfterSendRef.current = true;

        try {
            const result = await sendOrderLyricsPdfA4.mutateAsync({
                conversationId: thread.conversation.id,
                orderId,
                forceTakeover,
            });

            if (result.queued) {
                toast.success("Envio do PDF A4 enfileirado.");
            } else {
                toast.success("PDF A4 enviado para o cliente.");
            }

            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao enviar PDF A4 do pedido";
            if (!forceTakeover && message.includes("Conversa em atendimento por")) {
                const ok = confirm(`${message}. Deseja assumir mesmo assim?`);
                if (!ok) return;
                await handleSendOrderLyricsPdfA4(orderId, true);
                return;
            }
            toast.error(`Erro: ${message}`);
        } finally {
            setSendingOrderPdfA4Id((current) => (current === orderId ? null : current));
        }
    };

    const finalizeStartedConversation = (result: Awaited<ReturnType<typeof startConversation.mutateAsync>>) => {
        setSelectedId(result.conversation.id);
        setNewChatOpen(false);
        setNewChatPhone("");
        setNewChatCustomerName("");
        toast.success(result.existed ? "Conversa existente aberta" : "Nova conversa criada");
        void utils.admin.getWhatsAppConversations.invalidate();
        void utils.admin.getWhatsAppMessages.invalidate();
    };

    const handleStartConversation = async (forceTakeover = false) => {
        const phone = newChatPhone.trim();
        const customerName = newChatCustomerName.trim();

        if (!operatorName) {
            toast.error("Aguardando identificação do atendente logado.");
            return;
        }
        if (!phone) {
            toast.error("Informe o número do WhatsApp");
            return;
        }

        try {
            const result = await startConversation.mutateAsync({
                waId: phone,
                customerName: customerName || undefined,
                forceTakeover,
            });
            finalizeStartedConversation(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao iniciar conversa";
            if (!forceTakeover && message.includes("Conversa em atendimento por")) {
                const ok = confirm(`${message}. Deseja assumir mesmo assim?`);
                if (!ok) return;
                await handleStartConversation(true);
                return;
            }
            toast.error(`Erro: ${message}`);
        }
    };

    const copyToClipboard = useCallback(async (value: string, label: string) => {
        const text = value.trim();
        if (!text) return;
        const compactPreview = text.replace(/\s+/g, " ").trim();
        const descriptionPreview = compactPreview.length > 160
            ? `${compactPreview.slice(0, 157)}...`
            : compactPreview;

        const showSuccess = () => {
            toast.success(`${label} copiado!`, {
                description: descriptionPreview,
                duration: 1800,
            });
        };

        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                showSuccess();
                return;
            }
        } catch {
            // Fallback below
        }

        try {
            if (typeof document === "undefined") throw new Error("Clipboard indisponível");
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(textarea);
            if (!ok) throw new Error("Falha ao copiar");
            showSuccess();
        } catch {
            toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
        }
    }, []);

    const attachFileToComposer = useCallback((file: File, source: "paste" | "drop") => {
        const mimeType = normalizeMimeType(file.type) || inferMimeTypeFromFileName(file.name) || "application/octet-stream";
        if (!isSupportedReplyMediaFile(file)) {
            toast.error("Formato não suportado. Envie áudio, vídeo, imagem ou documento compatível.");
            return;
        }

        const fallbackFileName = mimeType.startsWith("image/")
            ? buildClipboardImageName(mimeType)
            : `arquivo-${Date.now()}`;
        const fileName = file.name?.trim() || fallbackFileName;
        const mediaFile = new globalThis.File([file], fileName, { type: mimeType });

        setPendingMediaFile(mediaFile);
        setPendingMediaIsVoiceNote(false);
        revokeRecordedAudioPreview();
        if (mediaInputRef.current) {
            mediaInputRef.current.value = "";
        }
        if (source === "paste" && mimeType.startsWith("image/")) {
            toast.success("Imagem colada. Clique em enviar para mandar ao cliente.");
        } else if (source === "drop") {
            toast.success("Arquivo anexado. Clique em enviar para mandar ao cliente.");
        } else {
            toast.success("Mídia anexada. Clique em enviar para mandar ao cliente.");
        }
    }, [revokeRecordedAudioPreview]);

    const insertReplyEmoji = useCallback((emoji: string) => {
        setReplyText((currentText) => {
            const textarea = replyTextareaRef.current;
            if (!textarea) return `${currentText}${emoji}`;

            const selectionStart = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : currentText.length;
            const selectionEnd = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : currentText.length;
            const nextText = `${currentText.slice(0, selectionStart)}${emoji}${currentText.slice(selectionEnd)}`;

            if (typeof window !== "undefined") {
                window.requestAnimationFrame(() => {
                    const currentTextarea = replyTextareaRef.current;
                    if (!currentTextarea) return;
                    const cursorPosition = selectionStart + emoji.length;
                    currentTextarea.focus();
                    currentTextarea.setSelectionRange(cursorPosition, cursorPosition);
                });
            }

            return nextText;
        });
        setIsEmojiPickerOpen(false);
    }, []);

    const handleReplyPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!operatorName.trim() || sendReply.isPending || isUploadingMedia || isRecordingAudio) return;

        const items = Array.from(e.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith("image/"));
        if (!imageItem) return;

        const file = imageItem.getAsFile();
        if (!file) return;

        e.preventDefault();
        attachFileToComposer(file, "paste");
    }, [attachFileToComposer, isRecordingAudio, isUploadingMedia, operatorName, sendReply.isPending]);

    const handleComposerDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        const hasFiles = e.dataTransfer.types.includes("Files");
        if (!hasFiles) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOverComposer(true);
    }, []);

    const handleComposerDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        const relatedTarget = e.relatedTarget as Node | null;
        if (relatedTarget && e.currentTarget.contains(relatedTarget)) return;
        setIsDragOverComposer(false);
    }, []);

    const handleComposerDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        const hasFiles = e.dataTransfer.types.includes("Files");
        if (!hasFiles) return;

        e.preventDefault();
        setIsDragOverComposer(false);

        if (!operatorName.trim() || sendReply.isPending || isUploadingMedia || isRecordingAudio) return;

        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length === 0) return;

        const supportedFile = files.find((file) => isSupportedReplyMediaFile(file));
        if (!supportedFile) {
            toast.error("Arraste um áudio, vídeo, imagem ou documento compatível.");
            return;
        }

        attachFileToComposer(supportedFile, "drop");
    }, [attachFileToComposer, isRecordingAudio, isUploadingMedia, operatorName, sendReply.isPending]);

    // Find current label for the context-menu'd conversation
    const labelMenuConv = useMemo(
        () => conversations?.items.find((c) => c.id === labelMenuConvId),
        [conversations?.items, labelMenuConvId]
    );
    const labelMenuCurrentLabelId = labelMenuConv?.labelId ?? null;
    const labelMenuConversationIsHuman = Boolean(labelMenuConv && !labelMenuConv.isBot);
    const labelMenuUnreadCount = labelMenuConv?.unreadCount ?? 0;

    const totalPages = conversations ? Math.ceil(conversations.total / conversations.pageSize) : 0;
    const conversationVirtualRows = useMemo(() => {
        const conversationCount = filteredConversations.length;
        if (conversationCount === 0) {
            return {
                items: [] as Array<{
                    conversation: (typeof filteredConversations)[number];
                    top: number;
                }>,
                totalHeight: 0,
            };
        }

        const estimatedRowHeight = CONVERSATION_VIRTUAL_ESTIMATED_ROW_HEIGHT + CONVERSATION_VIRTUAL_ROW_GAP;
        const rowOffsets = new Array<number>(conversationCount);
        const rowHeights = new Array<number>(conversationCount);

        let runningOffset = 0;
        for (let index = 0; index < conversationCount; index += 1) {
            const conversation = filteredConversations[index]!;
            const measuredHeight = conversationMeasuredHeights[conversation.id];
            const rowHeight = typeof measuredHeight === "number" && Number.isFinite(measuredHeight) && measuredHeight > 0
                ? measuredHeight
                : estimatedRowHeight;

            rowOffsets[index] = runningOffset;
            rowHeights[index] = rowHeight;
            runningOffset += rowHeight;
        }

        const overscanHeight = estimatedRowHeight * CONVERSATION_VIRTUAL_OVERSCAN;
        const viewportTop = Math.max(0, conversationListScrollTop - overscanHeight);
        const viewportBottom = conversationListScrollTop + Math.max(conversationListViewportHeight, estimatedRowHeight) + overscanHeight;

        let startIndex = 0;
        while (
            startIndex < conversationCount - 1 &&
            (rowOffsets[startIndex]! + rowHeights[startIndex]!) < viewportTop
        ) {
            startIndex += 1;
        }

        let endIndex = startIndex;
        while (endIndex < conversationCount - 1 && rowOffsets[endIndex]! < viewportBottom) {
            endIndex += 1;
        }

        startIndex = Math.max(0, startIndex - CONVERSATION_VIRTUAL_OVERSCAN);
        endIndex = Math.min(conversationCount - 1, endIndex + CONVERSATION_VIRTUAL_OVERSCAN);

        const items: Array<{ conversation: (typeof filteredConversations)[number]; top: number }> = [];
        for (let index = startIndex; index <= endIndex; index += 1) {
            const conversation = filteredConversations[index];
            if (!conversation) continue;
            items.push({
                conversation,
                top: rowOffsets[index] ?? 0,
            });
        }

        return {
            items,
            totalHeight: Math.max(0, runningOffset),
        };
    }, [
        conversationListScrollTop,
        conversationListViewportHeight,
        conversationMeasuredHeights,
        filteredConversations,
    ]);
    const threadMessages = thread?.messages ?? [];
    const visibleThreadMessages = useMemo(() => {
        if (threadMessages.length === 0) return [];
        const clampedRenderLimit = Math.min(
            MAX_THREAD_RENDER_LIMIT,
            Math.max(INITIAL_THREAD_RENDER_LIMIT, threadRenderLimit)
        );
        const visibleCount = Math.min(clampedRenderLimit, threadMessages.length);
        return threadMessages.slice(threadMessages.length - visibleCount);
    }, [threadMessages, threadRenderLimit]);
    const hiddenLoadedMessagesCount = Math.max(0, threadMessages.length - visibleThreadMessages.length);
    const latestRouting = useMemo(() => {
        if (!thread?.messages?.length) return null;
        for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
            const routingInfo = getRoutingInfo(thread.messages[index]?.metadata);
            if (routingInfo) return routingInfo;
        }
        return null;
    }, [thread?.messages]);
    const threadClassificationLabel = getClassificationLabel(
        latestRouting?.classification,
        latestRouting?.classificationLabel
    );
    const trimmedOperatorName = operatorName.trim();
    const threadLockActive = thread ? isLockActive(thread.conversation.lockExpiresAt) : false;
    const threadLockOwner = threadLockActive ? (thread?.conversation.assignedTo || null) : null;
    const lockedByOther = Boolean(threadLockOwner && threadLockOwner !== trimmedOperatorName);
    const linkedOrderEmailsForPhone = useMemo(() => {
        if (!thread) return [] as string[];
        return Array.from(
            new Map(
                thread.linkedOrders
                    .filter((order) => phonesLikelyMatchForUi(order.backupWhatsApp, thread.conversation.waId))
                    .map((order) => order.email?.trim())
                    .filter((email): email is string => Boolean(email))
                    .map((email) => [email.toLowerCase(), email])
            ).values()
        );
    }, [thread?.conversation.waId, thread?.linkedOrders]);
    const primaryPhoneEmail = linkedOrderEmailsForPhone[0] ?? null;
    const extraPhoneEmailCount = Math.max(0, linkedOrderEmailsForPhone.length - 1);
    const phoneEmailsTooltip = linkedOrderEmailsForPhone.join("\n");
    const trackingStatusCopyMessage = useMemo(() => {
        if (!thread || thread.linkedOrders.length === 0) return null;

        const ordersSorted = [...thread.linkedOrders].sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        const emailEntriesByKey = new Map<string, { email: string; locale: string | null }>();
        for (const order of ordersSorted) {
            const trimmedEmail = order.email?.trim();
            if (!trimmedEmail) continue;
            const emailKey = trimmedEmail.toLowerCase();
            if (!emailEntriesByKey.has(emailKey)) {
                emailEntriesByKey.set(emailKey, {
                    email: trimmedEmail,
                    locale: order.locale ?? null,
                });
            }
        }

        const trackingLinks = Array.from(emailEntriesByKey.values()).map((entry) => ({
            email: entry.email,
            url: buildTrackOrderUrl(entry.email, entry.locale),
        }));

        if (trackingLinks.length === 0) return null;

        const statusLines = ordersSorted.map((order) => {
            const recipientName = order.recipientName?.trim() || "Pedido";
            const genreLabel = order.genre?.trim() ? ` (${order.genre.trim()})` : "";
            const orderTypeLabel = order.orderType === "STREAMING_UPSELL" ? " [Streaming VIP]" : "";
            return `• ${recipientName}${genreLabel} — ${formatOrderStatus(order.status)}${orderTypeLabel}`;
        });

        const intro = trackingLinks.length > 1
            ? "Seguem os links de acompanhamento dos seus pedidos 🎵"
            : "Segue o link de acompanhamento do seu pedido 🎵";

        const linksBlock = trackingLinks.length > 1
            ? trackingLinks.map((entry) => `• ${entry.email}: ${entry.url}`).join("\n")
            : `👉 ${trackingLinks[0]!.url}`;

        return `${intro}\n\n${linksBlock}\n\nStatus atual:\n${statusLines.join("\n")}\n\nQualquer dúvida, me chame 😊`;
    }, [thread]);
    const threadVirtualRows = useMemo(() => {
        const messageCount = visibleThreadMessages.length;
        if (messageCount === 0) {
            return {
                items: [] as Array<{
                    message: (typeof visibleThreadMessages)[number];
                    top: number;
                }>,
                totalHeight: 0,
            };
        }

        const estimatedRowHeight = THREAD_VIRTUAL_ESTIMATED_ROW_HEIGHT + THREAD_VIRTUAL_ROW_GAP;
        const rowOffsets = new Array<number>(messageCount);
        const rowHeights = new Array<number>(messageCount);

        let runningOffset = 0;
        for (let index = 0; index < messageCount; index += 1) {
            const message = visibleThreadMessages[index]!;
            const measuredHeight = threadMeasuredHeights[message.id];
            const rowHeight = typeof measuredHeight === "number" && Number.isFinite(measuredHeight) && measuredHeight > 0
                ? measuredHeight
                : estimatedRowHeight;

            rowOffsets[index] = runningOffset;
            rowHeights[index] = rowHeight;
            runningOffset += rowHeight;
        }

        const overscanHeight = estimatedRowHeight * THREAD_VIRTUAL_OVERSCAN;
        const viewportTop = Math.max(0, threadScrollTop - overscanHeight);
        const viewportBottom = threadScrollTop + Math.max(threadViewportHeight, estimatedRowHeight) + overscanHeight;

        let startIndex = 0;
        while (
            startIndex < messageCount - 1 &&
            (rowOffsets[startIndex]! + rowHeights[startIndex]!) < viewportTop
        ) {
            startIndex += 1;
        }

        let endIndex = startIndex;
        while (endIndex < messageCount - 1 && rowOffsets[endIndex]! < viewportBottom) {
            endIndex += 1;
        }

        startIndex = Math.max(0, startIndex - THREAD_VIRTUAL_OVERSCAN);
        endIndex = Math.min(messageCount - 1, endIndex + THREAD_VIRTUAL_OVERSCAN);

        const items: Array<{ message: (typeof visibleThreadMessages)[number]; top: number }> = [];
        for (let index = startIndex; index <= endIndex; index += 1) {
            const message = visibleThreadMessages[index];
            if (!message) continue;
            items.push({
                message,
                top: rowOffsets[index] ?? 0,
            });
        }

        return {
            items,
            totalHeight: Math.max(0, runningOffset),
        };
    }, [threadMeasuredHeights, threadScrollTop, threadViewportHeight, visibleThreadMessages]);

    const renderedVirtualThreadMessages = useMemo(() => {
        return threadVirtualRows.items.map(({ message: msg, top }) => {
            const isInbound = msg.direction === "inbound";
            const isBot = msg.senderType === "bot";
            const isAdmin = msg.senderType === "admin";
            const waStatus = !isInbound ? getWhatsAppLastStatus(msg.metadata) : {};
            const waStatusLabel = !isInbound ? formatWhatsAppStatus(waStatus.status) : null;
            const media = getMediaInfo(msg.metadata);

            return (
                <div
                    key={msg.id}
                    ref={registerThreadMessageRow(msg.id)}
                    data-message-id={msg.id}
                    style={{
                        position: "absolute",
                        top,
                        left: 0,
                        right: 0,
                        paddingBottom: THREAD_VIRTUAL_ROW_GAP,
                    }}
                >
                    <div
                        className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                    >
                        <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2.5 select-text ${isInbound
                                ? "bg-[var(--wa-surface-soft)] text-[var(--wa-text-primary)] rounded-bl-md"
                                : isAdmin
                                    ? "bg-[var(--wa-bubble-admin)] text-white rounded-br-md"
                                    : "bg-[var(--wa-bubble-bot)] text-white rounded-br-md"
                                }`}
                            style={{
                                userSelect: "text",
                                WebkitUserSelect: "text",
                            }}
                        >
                            {media ? (
                                <MessageMedia media={media} isInbound={isInbound} />
                            ) : (
                                <div
                                    className="text-sm whitespace-pre-wrap leading-relaxed select-text cursor-text"
                                    style={{
                                        userSelect: "text",
                                        WebkitUserSelect: "text",
                                    }}
                                >
                                    {msg.body}
                                </div>
                            )}
                            <div className={`flex items-center gap-1.5 mt-1 ${isInbound ? "text-[var(--wa-text-dim)]" : "text-white/70"
                                }`}>
                                <span className="text-[10px]">{formatTime(msg.createdAt)}</span>
                                {!isInbound && waStatusLabel && (
                                    <span
                                        className={`text-[10px] ${waStatus.status === "failed" ? "text-red-200" : "text-white/70"
                                            }`}
                                        title={waStatus.title ? `WhatsApp: ${waStatus.title}` : "WhatsApp status"}
                                    >
                                        {waStatusLabel}{waStatus.code ? ` (${waStatus.code})` : ""}
                                    </span>
                                )}
                                {!isInbound && (
                                    <span className="text-[10px] flex items-center gap-0.5">
                                        {isBot ? (
                                            <><Bot className="h-3 w-3" /> Bot</>
                                        ) : (
                                            <><User className="h-3 w-3" /> Admin</>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        });
    }, [registerThreadMessageRow, threadVirtualRows.items]);
    const canCopyTrackingStatusMessage = Boolean(trackingStatusCopyMessage);
    const handlePrepareVipOneSongMessage = useCallback(async (order: {
        id: string;
        recipientName: string | null;
        orderType: string | null;
        songFileUrl: string | null;
    }) => {
        if (!trimmedOperatorName || lockedByOther) return;

        if (order.orderType === "STREAMING_UPSELL") {
            toast.error("Este pedido já é de Streaming VIP.");
            return;
        }

        if (!order.songFileUrl) {
            toast.error("A música 1 ainda não está pronta para gerar o link VIP.");
            return;
        }

        const recipientLabel = order.recipientName?.trim() || "cliente";
        const confirmVipOffer = window.confirm(
            `Enviar oferta VIP 1 para ${recipientLabel}?\n\nIsso vai enviar no WhatsApp:\n1) texto de apresentação\n2) áudio explicativo VIP\n3) link de pagamento`
        );

        if (!confirmVipOffer) {
            return;
        }

        setCreatingVipOrderId(order.id);
        try {
            const result = await createStreamingUpsellForSong.mutateAsync({
                orderId: order.id,
                songSlot: "1",
            });

            if (!selectedId) {
                throw new Error("Conversa não selecionada para enviar a oferta VIP.");
            }

            setSendingVipOfferOrderId(order.id);

            const introMessage = buildStreamingVipIntroMessage({
                recipientName: order.recipientName,
            });
            const paymentLinkMessage = buildStreamingVipPaymentLinkMessage(result.checkoutUrl);

            await sendReplyQuiet.mutateAsync({
                conversationId: selectedId,
                body: introMessage,
            });

            await sendReplyQuiet.mutateAsync({
                conversationId: selectedId,
                media: {
                    url: STREAMING_VIP_EXPLAINER_AUDIO_URL,
                    messageType: "audio",
                    mimeType: "audio/mpeg",
                    fileName: "upsell-spotify.mp3",
                },
            });

            await sendReplyQuiet.mutateAsync({
                conversationId: selectedId,
                body: paymentLinkMessage,
            });

            void utils.admin.getWhatsAppMessages.invalidate();
            void utils.admin.getWhatsAppConversations.invalidate();
            toast.success("Oferta VIP enviada: texto + áudio + link de pagamento.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao gerar link de pagamento VIP.";
            toast.error(message);
        } finally {
            setSendingVipOfferOrderId(null);
            setCreatingVipOrderId(null);
        }
    }, [createStreamingUpsellForSong, lockedByOther, selectedId, sendReplyQuiet, trimmedOperatorName, utils.admin.getWhatsAppConversations, utils.admin.getWhatsAppMessages]);
    const pageContainerClass = effectiveImmersiveMode
        ? "fixed inset-0 z-[80] bg-[var(--wa-app-bg)] px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6 overflow-hidden"
        : "space-y-4 lg:space-y-6 w-full pb-20";
    const panelsClass = effectiveImmersiveMode
        ? "flex flex-col lg:flex-row gap-4 h-[calc(100dvh-132px)] lg:h-[calc(100vh-132px)]"
        : "flex flex-col lg:flex-row gap-4 h-[calc(100dvh-220px)] lg:h-[calc(100vh-240px)]";

    return (
        <div className={pageContainerClass} style={whatsappThemeStyle}>
            {/* Header */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[var(--wa-text-primary)] tracking-tight flex items-center gap-3">
                        <MessageSquare className="text-green-600 h-8 w-8" />
                        WhatsApp
                    </h1>
                    <p className="text-[var(--wa-text-dim)] mt-2 text-sm lg:text-lg font-light">
                        {stats ? `${stats.total} conversas | ${stats.active24h} ativas 24h | ${stats.botActive} bot | ${stats.humanActive} humano` : "Carregando..."}
                    </p>
                </div>
                <div className="hidden lg:flex items-center gap-2">
                    <div
                        className="min-w-[220px] px-3 py-2 bg-[var(--wa-surface)] border border-[var(--wa-border)] rounded-xl text-sm text-[var(--wa-text-secondary)] font-medium"
                        title={operatorName ? `Atendente logado: ${operatorName}` : "Identificando atendente logado..."}
                    >
                        {operatorName ? `Atendente: ${operatorName}` : "Atendente: carregando..."}
                    </div>
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--wa-border)] bg-[var(--wa-surface-soft)]">
                        <button
                            type="button"
                            onClick={() => setThemeMode("light")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${themeMode === "light"
                                ? "bg-[var(--wa-surface)] text-[var(--wa-text-primary)]"
                                : "text-[var(--wa-text-dim)] hover:bg-[var(--wa-surface-soft-hover-dim)]"
                                }`}
                            title="Usar tema claro"
                        >
                            Light
                        </button>
                        <button
                            type="button"
                            onClick={() => setThemeMode("dark")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${themeMode === "dark"
                                ? "bg-[var(--wa-surface)] text-[var(--wa-text-primary)]"
                                : "text-[var(--wa-text-dim)] hover:bg-[var(--wa-surface-soft-hover-dim)]"
                                }`}
                            title="Usar tema escuro"
                        >
                            Dark
                        </button>
                    </div>
                    {isDarkTheme && (
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--wa-border)] bg-[var(--wa-surface-soft)]">
                            <span className="text-xs font-medium text-[var(--wa-text-muted)]">Contraste</span>
                            <input
                                type="range"
                                min={DARK_CONTRAST_MIN}
                                max={DARK_CONTRAST_MAX}
                                step={1}
                                value={safeDarkContrast}
                                onChange={(event) => setDarkContrast(Number.parseInt(event.target.value, 10))}
                                className="h-1.5 w-24 cursor-pointer accent-[var(--wa-accent)]"
                                aria-label="Intensidade de contraste do tema escuro"
                            />
                            <span className="text-[11px] font-semibold text-[var(--wa-text-secondary)] min-w-[38px] text-right">
                                {safeDarkContrast}%
                            </span>
                        </div>
                    )}
                    <button
                        onClick={() => setNewChatOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--wa-surface)] text-[var(--wa-text-secondary)] border border-[var(--wa-border)] rounded-xl text-sm font-medium hover:bg-[var(--wa-border)] transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Novo chat
                    </button>
                    <button
                        onClick={() => {
                            void utils.admin.getWhatsAppConversations.invalidate();
                            void utils.admin.getWhatsAppMessages.invalidate();
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--wa-bubble-admin)] text-white rounded-xl text-sm font-medium hover:bg-[var(--wa-bubble-admin-hover)] transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Atualizar
                    </button>
                    <button
                        onClick={() => setIsIncomingSoundEnabled((current) => !current)}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors ${isIncomingSoundEnabled
                            ? "bg-[var(--wa-surface)] text-[var(--wa-text-secondary)] border-[var(--wa-border)] hover:bg-[var(--wa-border)]"
                            : "bg-[var(--wa-surface-soft)] text-[var(--wa-text-primary)] border-[var(--wa-border)] hover:bg-[var(--wa-surface-soft-hover)]"
                            }`}
                        title={isIncomingSoundEnabled ? "Desativar som de novas mensagens" : "Ativar som de novas mensagens"}
                    >
                        {isIncomingSoundEnabled ? (
                            <>
                                <Bell className="h-4 w-4" />
                                Som ON
                            </>
                        ) : (
                            <>
                                <BellOff className="h-4 w-4" />
                                Som OFF
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => setIsIncomingSoundBackgroundOnly((current) => !current)}
                        disabled={!isIncomingSoundEnabled}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isIncomingSoundBackgroundOnly
                            ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                            : "bg-[var(--wa-surface)] text-[var(--wa-text-secondary)] border-[var(--wa-border)] hover:bg-[var(--wa-border)]"
                            }`}
                        title="Tocar som somente quando a aba estiver em segundo plano"
                    >
                        <Eye className="h-4 w-4" />
                        2º plano
                    </button>
                    <button
                        onClick={() => setIsImmersiveMode((current) => !current)}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--wa-surface)] text-[var(--wa-text-secondary)] border border-[var(--wa-border)] rounded-xl text-sm font-medium hover:bg-[var(--wa-border)] transition-colors"
                        title={effectiveImmersiveMode ? "Sair da tela cheia (Esc)" : "Entrar em tela cheia"}
                    >
                        {effectiveImmersiveMode ? (
                            <>
                                <Minimize2 className="h-4 w-4" />
                                Sair tela cheia
                            </>
                        ) : (
                            <>
                                <Maximize2 className="h-4 w-4" />
                                Tela cheia
                            </>
                        )}
                    </button>
                </div>
                <div className="flex lg:hidden flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => {
                                void utils.admin.getWhatsAppConversations.invalidate();
                                void utils.admin.getWhatsAppMessages.invalidate();
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--wa-bubble-admin)] text-white rounded-xl text-xs font-medium"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Atualizar
                        </button>
                        <button
                            onClick={() => setNewChatOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--wa-surface)] border border-[var(--wa-border)] text-[var(--wa-text-secondary)] rounded-xl text-xs font-medium"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Novo chat
                        </button>
                        <button
                            onClick={() => setIsIncomingSoundEnabled((current) => !current)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-medium ${isIncomingSoundEnabled
                                ? "bg-[var(--wa-surface)] text-[var(--wa-text-secondary)] border-[var(--wa-border)]"
                                : "bg-[var(--wa-surface-soft)] text-[var(--wa-text-primary)] border-[var(--wa-border)]"
                                }`}
                        >
                            {isIncomingSoundEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                            Som
                        </button>
                        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--wa-border)] bg-[var(--wa-surface-soft)]">
                            <button
                                type="button"
                                onClick={() => setThemeMode("light")}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${themeMode === "light"
                                    ? "bg-[var(--wa-surface)] text-[var(--wa-text-primary)]"
                                    : "text-[var(--wa-text-dim)]"
                                    }`}
                            >
                                Light
                            </button>
                            <button
                                type="button"
                                onClick={() => setThemeMode("dark")}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${themeMode === "dark"
                                    ? "bg-[var(--wa-surface)] text-[var(--wa-text-primary)]"
                                    : "text-[var(--wa-text-dim)]"
                                    }`}
                            >
                                Dark
                            </button>
                        </div>
                    </div>
                    {isDarkTheme && (
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--wa-border)] bg-[var(--wa-surface-soft)] w-full">
                            <span className="text-[11px] font-medium text-[var(--wa-text-muted)]">Contraste</span>
                            <input
                                type="range"
                                min={DARK_CONTRAST_MIN}
                                max={DARK_CONTRAST_MAX}
                                step={1}
                                value={safeDarkContrast}
                                onChange={(event) => setDarkContrast(Number.parseInt(event.target.value, 10))}
                                className="h-1.5 flex-1 cursor-pointer accent-[var(--wa-accent)]"
                                aria-label="Intensidade de contraste do tema escuro"
                            />
                            <span className="text-[11px] font-semibold text-[var(--wa-text-secondary)] min-w-[38px] text-right">
                                {safeDarkContrast}%
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {incomingAlert && (
                <div className="fixed top-20 right-4 md:right-6 z-[130] w-[350px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-emerald-200 bg-[var(--wa-surface-overlay)] backdrop-blur-sm shadow-[0_22px_50px_-18px_rgba(16,185,129,0.45)] p-3">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--wa-text-primary)] truncate">
                                Nova mensagem: {incomingAlert.customerName}
                            </p>
                            <p className="text-xs text-[var(--wa-text-muted)] mt-0.5 line-clamp-2">
                                {incomingAlert.preview}
                            </p>
                            {incomingAlert.count > 1 && (
                                <p className="text-[11px] text-emerald-700 font-medium mt-1">
                                    +{incomingAlert.count - 1} conversa(s) também recebeu(ram) mensagem.
                                </p>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedId(incomingAlert.conversationId);
                                        setIncomingAlert(null);
                                        markConversationRead.mutate({ conversationId: incomingAlert.conversationId });
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:bg-[var(--wa-accent-hover)] transition-colors"
                                >
                                    Abrir conversa
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIncomingAlert(null)}
                                    className="px-2.5 py-1.5 rounded-lg border border-[var(--wa-border)] text-[var(--wa-text-muted)] text-xs font-medium hover:bg-[var(--wa-border)] transition-colors"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIncomingAlert(null)}
                            className="text-[var(--wa-text-dim)] hover:text-[var(--wa-text-muted)] p-1 rounded transition-colors"
                            aria-label="Fechar notificação"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Two-panel layout */}
            <div className={panelsClass}>
                {/* Left Panel - Conversation List */}
                <div className={`${selectedId ? "hidden lg:flex" : "flex"} w-full lg:w-[380px] lg:flex-shrink-0 flex-col bg-[var(--wa-surface)] border border-[var(--wa-border)] rounded-2xl overflow-hidden`}>
                    {/* Search + Filter */}
                    <div className="p-3 border-b border-[var(--wa-border)] space-y-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--wa-text-dim)]" />
                            <input
                                type="text"
                                placeholder="Buscar por telefone ou nome..."
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                className="w-full pl-9 pr-3 py-2 bg-[var(--wa-surface-soft)] border border-[var(--wa-border)] rounded-lg text-sm text-[var(--wa-text-primary)] placeholder-[var(--wa-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent-ring)] focus:border-[var(--wa-accent)]"
                            />
                        </div>
                        <div className="flex gap-1">
                            {(["ALL", "BOT", "HUMAN"] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => { setFilter(f); setPage(1); }}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f
                                        ? "bg-[var(--wa-accent-soft)] text-[var(--wa-accent)]"
                                        : "text-[var(--wa-text-dim)] hover:bg-[var(--wa-border)]"
                                        }`}
                                >
                                    {f === "ALL" ? `Todos${stats ? ` (${stats.total})` : ""}` : f === "BOT" ? `Bot${stats ? ` (${stats.botActive})` : ""}` : `Humano${stats ? ` (${stats.humanActive})` : ""}`}
                                </button>
                            ))}
                        </div>
                        {filter === "HUMAN" && (
                            <div className="flex gap-1 rounded-lg bg-[var(--wa-surface-soft)] p-1">
                                <button
                                    onClick={() => { setHumanSubfilter("ALL"); setPage(1); }}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${humanSubfilter === "ALL"
                                        ? "bg-[var(--wa-surface)] text-[var(--wa-text-secondary)]"
                                        : "text-[var(--wa-text-dim)] hover:bg-[var(--wa-surface-soft-hover-dim)]"
                                        }`}
                                >
                                    Tudo
                                </button>
                                <button
                                    onClick={() => { setHumanSubfilter("UNREAD"); setPage(1); }}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${humanSubfilter === "UNREAD"
                                        ? "bg-[var(--wa-surface)] text-[var(--wa-text-secondary)]"
                                        : "text-[var(--wa-text-dim)] hover:bg-[var(--wa-surface-soft-hover-dim)]"
                                        }`}
                                >
                                    Não lidas
                                </button>
                            </div>
                        )}
                        {/* Label filter */}
                        <div className="flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-[var(--wa-text-dim)] flex-shrink-0" />
                            <select
                                value={labelFilter}
                                onChange={(e) => { setLabelFilter(e.target.value); setPage(1); }}
                                className="flex-1 text-xs bg-[var(--wa-surface-soft)] border border-[var(--wa-border)] rounded-lg px-2 py-1.5 text-[var(--wa-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent-ring)] focus:border-[var(--wa-accent)]"
                            >
                                <option value="ALL">Todas as etiquetas</option>
                                <option value="NONE">Sem etiqueta</option>
                                {allLabels?.map((label) => (
                                    <option key={label.id} value={label.id}>
                                        {label.emoji ? `${label.emoji} ` : ""}{label.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Conversation items */}
                    <div
                        ref={conversationListViewportRef}
                        onScroll={handleConversationListViewportScroll}
                        className="flex-1 overflow-y-auto"
                    >
                        {isLoading ? (
                            <div className="p-8 text-center text-[var(--wa-text-dim)] text-sm">Carregando...</div>
                        ) : !conversations || filteredConversations.length === 0 ? (
                            <div className="p-8 text-center">
                                <MessageSquare className="h-8 w-8 text-[var(--wa-text-dim)] mx-auto mb-2" />
                                <p className="text-sm text-[var(--wa-text-dim)]">
                                    {filter === "HUMAN" && humanSubfilter === "UNREAD"
                                        ? "Nenhuma conversa não lida encontrada"
                                        : "Nenhuma conversa encontrada"}
                                </p>
                            </div>
                        ) : (
                            <div className="relative" style={{ minHeight: Math.max(conversationVirtualRows.totalHeight, 1) }}>
                                {conversationVirtualRows.items.map(({ conversation: conv, top }) => {
                                    const lastMsg = conv.messages[0];
                                    const routingMsg = conv.messages.find((msg) => Boolean(getRoutingInfo(msg.metadata)));
                                    const routing = routingMsg ? getRoutingInfo(routingMsg.metadata) : null;
                                    const classificationLabel = getClassificationLabel(routing?.classification, routing?.classificationLabel);
                                    const lockActive = isLockActive(conv.lockExpiresAt);
                                    const lockOwner = lockActive ? conv.assignedTo : null;
                                    const isActive = conv.id === selectedId;
                                    const within24h = isWithin24h(conv.lastCustomerMessageAt);
                                    return (
                                        <div
                                            key={conv.id}
                                            ref={registerConversationRow(conv.id)}
                                            data-conversation-id={conv.id}
                                            style={{
                                                position: "absolute",
                                                top,
                                                left: 0,
                                                right: 0,
                                                paddingBottom: CONVERSATION_VIRTUAL_ROW_GAP,
                                            }}
                                        >
                                            <button
                                                onClick={() => {
                                                    setSelectedId(conv.id);
                                                    if ((conv.unreadCount ?? 0) > 0) {
                                                        markConversationRead.mutate({
                                                            conversationId: conv.id,
                                                        });
                                                    }
                                                }}
                                                onContextMenu={(e) => handleContextMenu(e, conv.id)}
                                                className={`w-full px-4 py-3 text-left border-b border-[var(--wa-border)] transition-colors ${isActive
                                                    ? "bg-[var(--wa-border)] border-l-2 border-[var(--wa-accent)]"
                                                    : "hover:bg-[var(--wa-border)] border-l-2 border-transparent"
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-semibold text-[var(--wa-text-primary)] truncate">
                                                        {conv.customerName || conv.waId}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        {within24h ? (
                                                            <span className="w-2 h-2 rounded-full bg-green-500" title="Janela 24h ativa" />
                                                        ) : (
                                                            <span className="w-2 h-2 rounded-full bg-red-400" title="Fora da janela 24h" />
                                                        )}
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${conv.isBot
                                                            ? "bg-blue-500/20 text-blue-400"
                                                            : "bg-amber-500/20 text-amber-400"
                                                            }`}>
                                                            {conv.isBot ? "Bot" : "Humano"}
                                                        </span>
                                                        {(conv.unreadCount ?? 0) > 0 && (
                                                            <span
                                                                className="text-[10px] min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--wa-accent)] text-white font-semibold inline-flex items-center justify-center"
                                                                title={`${conv.unreadCount} mensagem(ns) não lida(s)`}
                                                            >
                                                                {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-3 w-3 text-[var(--wa-text-dim)] flex-shrink-0" />
                                                    <span className="text-xs text-[var(--wa-text-dim)]">{conv.waId}</span>
                                                </div>
                                                {(classificationLabel || routing?.assignedTo || lockOwner || conv.label) && (
                                                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                                        {conv.label && (
                                                            <LabelBadge label={conv.label} />
                                                        )}
                                                        {classificationLabel && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--wa-border)] text-[var(--wa-text-dim)] font-medium">
                                                                {classificationLabel}
                                                            </span>
                                                        )}
                                                        {routing?.assignedTo && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                                                                {routing.assignedTo}
                                                            </span>
                                                        )}
                                                        {lockOwner && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                                                                Em atendimento: {lockOwner}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {lastMsg && (
                                                    <div className="flex items-center justify-between mt-1">
                                                        <span className="text-xs text-[var(--wa-text-dim)] truncate max-w-[220px]">
                                                            {lastMsg.direction === "inbound" ? "" : "Voce: "}
                                                            {lastMsg.body.substring(0, 60)}
                                                        </span>
                                                        <span className="text-[10px] text-[var(--wa-text-dim)] flex-shrink-0">
                                                            {timeAgo(lastMsg.createdAt)}
                                                        </span>
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-2 border-t border-[var(--wa-border)] flex items-center justify-between text-xs text-[var(--wa-text-dim)]">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-2 py-1 rounded hover:bg-[var(--wa-border)] disabled:opacity-40"
                            >
                                Anterior
                            </button>
                            <span>{page} / {totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-2 py-1 rounded hover:bg-[var(--wa-border)] disabled:opacity-40"
                            >
                                Proximo
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Panel - Chat Thread */}
                <div className={`${selectedId ? "flex" : "hidden lg:flex"} flex-1 flex-col bg-[var(--wa-surface)] border border-[var(--wa-border)] rounded-2xl overflow-hidden`}>
                    {!selectedId ? (
                        <div className="flex-1 flex items-center justify-center text-[var(--wa-text-dim)]">
                            <div className="text-center">
                                <MessageSquare className="h-12 w-12 mx-auto mb-3 text-[var(--wa-text-dim)]" />
                                <p className="text-lg font-medium">Selecione uma conversa</p>
                            </div>
                        </div>
                    ) : !thread ? (
                        <div className="flex-1 flex items-center justify-center text-[var(--wa-text-dim)] text-sm">Carregando...</div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="px-5 py-3 border-b border-[var(--wa-border)] flex items-center justify-between">
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(null)}
                                        className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--wa-text-muted)] hover:text-[var(--wa-text-secondary)] lg:hidden"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                        Conversas
                                    </button>
                                    <h3 className="text-sm font-semibold text-[var(--wa-text-primary)]">
                                        {thread.conversation.customerName || thread.conversation.waId}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Phone className="h-3 w-3 text-[var(--wa-text-dim)]" />
                                        <button
                                            type="button"
                                            onClick={() => { void copyToClipboard(thread.conversation.waId, "WhatsApp"); }}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs text-[var(--wa-text-dim)] hover:bg-[var(--wa-border)] hover:text-[var(--wa-text-secondary)] transition-colors"
                                            title="Clique para copiar o número do WhatsApp"
                                        >
                                            <span>{thread.conversation.waId}</span>
                                            <Copy className="h-3 w-3" />
                                        </button>
                                        {!isWithin24h(thread.conversation.lastCustomerMessageAt) && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                                <AlertTriangle className="h-3 w-3" />
                                                Fora da janela 24h
                                            </span>
                                        )}
                                    </div>
                                    {primaryPhoneEmail && (
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Mail className="h-3 w-3 text-[var(--wa-text-dim)]" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const emailsToCopy = linkedOrderEmailsForPhone.join("\n");
                                                    void copyToClipboard(emailsToCopy, linkedOrderEmailsForPhone.length > 1 ? "E-mails" : "E-mail");
                                                }}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs text-[var(--wa-text-dim)] hover:bg-[var(--wa-border)] hover:text-[var(--wa-text-secondary)] transition-colors max-w-[360px]"
                                                title={phoneEmailsTooltip}
                                            >
                                                <span className="truncate max-w-[320px]">
                                                    {primaryPhoneEmail}
                                                    {extraPhoneEmailCount > 0 ? ` +${extraPhoneEmailCount}` : ""}
                                                </span>
                                                <Copy className="h-3 w-3 flex-shrink-0" />
                                            </button>
                                        </div>
                                    )}
                                    {(threadClassificationLabel || threadLockOwner || thread.conversation.label) && (
                                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                            {thread.conversation.label && (
                                                <LabelBadge label={thread.conversation.label} />
                                            )}
                                            {threadClassificationLabel && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--wa-border)] text-[var(--wa-text-dim)] font-medium">
                                                    {threadClassificationLabel}
                                                </span>
                                            )}
                                            {threadLockOwner && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                                                    Em atendimento ({formatLockRemaining(thread?.conversation.lockExpiresAt)})
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="hidden lg:flex items-center gap-3">
                                    <span
                                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${trimmedOperatorName
                                            ? "bg-[var(--wa-surface-soft)] text-[var(--wa-text-secondary)] border-[var(--wa-border)]"
                                            : "bg-amber-500/10 text-amber-700 border-amber-200"
                                            }`}
                                        title={trimmedOperatorName ? `Atendente logado: ${trimmedOperatorName}` : "Aguardando identificação do atendente logado..."}
                                    >
                                        {trimmedOperatorName || "Carregando atendente..."}
                                    </span>
                                    <button
                                        onClick={() => {
                                            if (!trimmedOperatorName) {
                                                toast.error("Aguardando identificação do atendente logado.");
                                                return;
                                            }
                                            if (threadLockOwner && threadLockOwner !== trimmedOperatorName) {
                                                const ok = confirm(`Conversa está com ${threadLockOwner}. Deseja assumir mesmo assim?`);
                                                if (!ok) return;
                                                claimConversation.mutate({
                                                    conversationId: thread.conversation.id,
                                                    force: true,
                                                });
                                                return;
                                            }
                                            claimConversation.mutate({
                                                conversationId: thread.conversation.id,
                                            });
                                        }}
                                        disabled={claimConversation.isPending}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                                        title="Assumir atendimento desta conversa"
                                    >
                                        Assumir
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!trimmedOperatorName) {
                                                toast.error("Aguardando identificação do atendente logado.");
                                                return;
                                            }
                                            releaseConversation.mutate({
                                                conversationId: thread.conversation.id,
                                            });
                                        }}
                                        disabled={releaseConversation.isPending || !threadLockOwner}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--wa-surface-soft)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-surface-soft-hover)] transition-colors disabled:opacity-50"
                                        title="Liberar lock da conversa"
                                    >
                                        Liberar
                                    </button>
                                    {!thread.conversation.isBot && (
                                        <button
                                            onClick={() => {
                                                const unreadCount = thread.conversation.unreadCount ?? 0;
                                                if (unreadCount > 0) {
                                                    markConversationRead.mutate({
                                                        conversationId: thread.conversation.id,
                                                    });
                                                } else {
                                                    markConversationUnread.mutate({
                                                        conversationId: thread.conversation.id,
                                                    });
                                                }
                                            }}
                                            disabled={markConversationRead.isPending || markConversationUnread.isPending}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${(thread.conversation.unreadCount ?? 0) > 0
                                                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                : "bg-[var(--wa-surface-soft)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-surface-soft-hover)]"
                                                }`}
                                            title={(thread.conversation.unreadCount ?? 0) > 0 ? "Marcar conversa como lida" : "Marcar conversa como não lida"}
                                        >
                                            {(thread.conversation.unreadCount ?? 0) > 0 ? (
                                                <>
                                                    <Check className="h-3.5 w-3.5" />
                                                    Marcar lida
                                                </>
                                            ) : (
                                                <>
                                                    <Bell className="h-3.5 w-3.5" />
                                                    Marcar não lida
                                                </>
                                            )}
                                        </button>
                                    )}
                                    {!thread.conversation.isBot && canCopyTrackingStatusMessage && trackingStatusCopyMessage && (
                                        <button
                                            onClick={() => { void copyToClipboard(trackingStatusCopyMessage, "Link de acompanhamento"); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                            title="Copiar mensagem com link de acompanhamento e status dos pedidos"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                            Link de acompanhamento
                                        </button>
                                    )}
                                    {/* Linked orders */}
                                    {thread.linkedOrders.length > 0 && (
                                        <div className="flex items-center gap-1 text-xs text-[var(--wa-text-dim)]">
                                            <Package className="h-3.5 w-3.5" />
                                            {thread.linkedOrders.length} pedido(s)
                                        </div>
                                    )}
                                    {/* Bot toggle */}
                                    <button
                                        onClick={() => toggleBot.mutate({
                                            conversationId: thread.conversation.id,
                                            isBot: !thread.conversation.isBot,
                                        })}
                                        disabled={toggleBot.isPending}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${thread.conversation.isBot
                                            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                                            : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                                            }`}
                                    >
                                        {thread.conversation.isBot ? (
                                            <>
                                                <ToggleRight className="h-3.5 w-3.5" />
                                                Bot ON
                                            </>
                                        ) : (
                                            <>
                                                <ToggleLeft className="h-3.5 w-3.5" />
                                                Bot OFF
                                            </>
                                        )}
                                    </button>
                                    {/* Clear conversation */}
                                    <button
                                        onClick={() => {
                                            if (confirm("Apagar todas as mensagens desta conversa? (zera o contexto do bot)")) {
                                                clearConversation.mutate({ conversationId: thread.conversation.id });
                                            }
                                        }}
                                        disabled={clearConversation.isPending}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                        title="Limpar conversa (zera contexto do bot)"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Limpar
                                    </button>
                                </div>
                                <div className="mt-2 flex lg:hidden items-center gap-2 flex-wrap">
                                    <button
                                        onClick={() => {
                                            if (!trimmedOperatorName) {
                                                toast.error("Aguardando identificação do atendente logado.");
                                                return;
                                            }
                                            claimConversation.mutate({
                                                conversationId: thread.conversation.id,
                                                force: Boolean(threadLockOwner && threadLockOwner !== trimmedOperatorName),
                                            });
                                        }}
                                        disabled={claimConversation.isPending}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                                    >
                                        Assumir
                                    </button>
                                    <button
                                        onClick={() => toggleBot.mutate({
                                            conversationId: thread.conversation.id,
                                            isBot: !thread.conversation.isBot,
                                        })}
                                        disabled={toggleBot.isPending}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${thread.conversation.isBot
                                            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                                            : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                                            }`}
                                    >
                                        {thread.conversation.isBot ? "Bot ON" : "Bot OFF"}
                                    </button>
                                    <button
                                        onClick={() => {
                                            const unreadCount = thread.conversation.unreadCount ?? 0;
                                            if (unreadCount > 0) {
                                                markConversationRead.mutate({
                                                    conversationId: thread.conversation.id,
                                                });
                                            } else {
                                                markConversationUnread.mutate({
                                                    conversationId: thread.conversation.id,
                                                });
                                            }
                                        }}
                                        disabled={markConversationRead.isPending || markConversationUnread.isPending}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--wa-surface-soft)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-surface-soft-hover)] transition-colors"
                                    >
                                        {(thread.conversation.unreadCount ?? 0) > 0 ? "Marcar lida" : "Marcar não lida"}
                                    </button>
                                </div>
                            </div>

                            {/* Linked Orders Bar */}
                            {thread.linkedOrders.length > 0 && (
                                <div className="px-5 py-2 bg-[var(--wa-surface-soft)] border-b border-[var(--wa-border)] flex gap-2 flex-wrap lg:max-h-[72px] max-h-none overflow-x-auto lg:overflow-hidden">
                                    {thread.linkedOrders.map((order) => {
                                        const hasSongs = Boolean(order.songFileUrl || order.songFileUrl2);
                                        const isSendingThisOrder = sendingOrderSongsId === order.id;
                                        const hasPdfA4 = Boolean(order.hasLyrics && order.lyricsPdfA4Url);
                                        const isSendingPdfA4ThisOrder = sendingOrderPdfA4Id === order.id;
                                        const isCreatingVipThisOrder = creatingVipOrderId === order.id;
                                        const isSendingVipOfferThisOrder = sendingVipOfferOrderId === order.id;
                                        const isStreamingVipOrder = order.orderType === "STREAMING_UPSELL";
                                        const canOfferVipSong1 = !isStreamingVipOrder && Boolean(order.songFileUrl);
                                        const orderTooltip = `Pedido: ${order.id}\nStatus: ${formatOrderStatus(order.status)}\nCriado em: ${formatOrderDateTime(order.createdAt)}`;

                                        return (
                                            <div
                                                key={order.id}
                                                className="inline-flex items-stretch bg-[var(--wa-surface)] rounded-lg border border-[var(--wa-border)] text-xs max-w-[280px] overflow-hidden"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenOrderDetails(order.id)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 hover:border-green-300 hover:bg-[var(--wa-border)] transition-colors cursor-pointer min-w-0"
                                                    title={orderTooltip}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${order.status === "COMPLETED" ? "bg-green-500" :
                                                        order.status === "PAID" ? "bg-blue-500" :
                                                            order.status === "IN_PROGRESS" ? "bg-amber-500" :
                                                                order.status === "REVISION" ? "bg-orange-500" :
                                                                    "bg-slate-400"
                                                        }`} />
                                                    <span className="font-medium text-[var(--wa-text-secondary)] truncate">{order.recipientName}</span>
                                                    {order.status === "REVISION" && (
                                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/20 text-orange-400 uppercase tracking-wide flex-shrink-0 animate-pulse">
                                                            Revisão
                                                        </span>
                                                    )}
                                                    {isStreamingVipOrder && (
                                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 uppercase tracking-wide flex-shrink-0">
                                                            VIP
                                                        </span>
                                                    )}
                                                    <span className="text-[var(--wa-text-dim)] truncate">{order.genre}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handlePrepareVipOneSongMessage(order); }}
                                                    disabled={!trimmedOperatorName || lockedByOther || createStreamingUpsellForSong.isPending || sendReplyQuiet.isPending || isCreatingVipThisOrder || isSendingVipOfferThisOrder || !canOfferVipSong1}
                                                    className="px-2.5 border-l border-[var(--wa-border)] text-sky-700 hover:bg-sky-500/10 disabled:text-[var(--wa-text-dim)] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                                                    title={
                                                        !canOfferVipSong1
                                                            ? `${orderTooltip}\nA música 1 ainda não está pronta ou este pedido já é VIP`
                                                            : `${orderTooltip}\nEnviar apresentação + áudio VIP + link de pagamento (1 música)`
                                                    }
                                                >
                                                    {(isCreatingVipThisOrder || isSendingVipOfferThisOrder) ? (
                                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <span className="text-[10px] font-semibold uppercase tracking-wide">VIP 1</span>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleSendOrderSongs(order.id); }}
                                                    disabled={!trimmedOperatorName || lockedByOther || sendOrderSongs.isPending || isSendingThisOrder || !hasSongs}
                                                    className="px-2.5 border-l border-[var(--wa-border)] text-green-700 hover:bg-[var(--wa-border)] disabled:text-[var(--wa-text-dim)] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                                                    title={
                                                        !hasSongs
                                                            ? `${orderTooltip}\nPedido ainda sem músicas prontas`
                                                            : `${orderTooltip}\nEnviar músicas deste pedido para o cliente (sem oferta VIP)`
                                                    }
                                                >
                                                    {isSendingThisOrder ? (
                                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Music2 className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleSendOrderLyricsPdfA4(order.id); }}
                                                    disabled={!trimmedOperatorName || lockedByOther || sendOrderLyricsPdfA4.isPending || isSendingPdfA4ThisOrder || !hasPdfA4}
                                                    className="px-2.5 border-l border-[var(--wa-border)] text-indigo-700 hover:bg-indigo-500/10 disabled:text-[var(--wa-text-dim)] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                                                    title={
                                                        !order.hasLyrics
                                                            ? `${orderTooltip}\nCliente não comprou PDF da letra`
                                                            : !order.lyricsPdfA4Url
                                                                ? `${orderTooltip}\nPDF A4 ainda não está pronto para envio`
                                                                : `${orderTooltip}\nEnviar PDF A4 da letra para o cliente`
                                                    }
                                                >
                                                    {isSendingPdfA4ThisOrder ? (
                                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <FileText className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Order Details Modal */}
                            {viewingOrderId && !viewingLead && isViewingLeadPending && (
                                <Dialog open onOpenChange={(open) => { if (!open) setViewingOrderId(null); }}>
                                    <DialogContent className="sm:max-w-[420px]">
                                        <DialogHeader>
                                            <DialogTitle>Abrindo pedido...</DialogTitle>
                                        </DialogHeader>
                                        <div className="flex items-center gap-2 py-2 text-sm text-[var(--wa-text-muted)]">
                                            <RefreshCw className="h-4 w-4 animate-spin text-[var(--wa-text-dim)]" />
                                            Carregando os detalhes do pedido selecionado.
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}
                            {viewingLead && viewingOrderId && (
                                <LeadDetailsDialog
                                    lead={viewingLead}
                                    open={!!viewingOrderId}
                                    onClose={() => setViewingOrderId(null)}
                                />
                            )}

                            {/* Messages */}
                            <div
                                ref={threadViewportRef}
                                onScroll={handleThreadViewportScroll}
                                className="flex-1 overflow-y-auto px-5 py-4"
                                style={{ overflowAnchor: "none" }}
                            >
                                <div className="space-y-3">
                                    {thread.hasOlderMessages && (
                                        <div className="sticky top-0 z-10 mb-2 rounded-lg border border-amber-200 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 backdrop-blur-sm flex items-center justify-between gap-3">
                                            <span>
                                                Mostrando as {thread.messages.length} mensagens mais recentes.
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setThreadMessageLimit((current) =>
                                                        Math.min(MAX_THREAD_MESSAGE_LIMIT, current + THREAD_MESSAGE_LIMIT_STEP)
                                                    );
                                                }}
                                                disabled={threadMessageLimit >= MAX_THREAD_MESSAGE_LIMIT}
                                                className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {threadMessageLimit >= MAX_THREAD_MESSAGE_LIMIT ? "Limite atingido" : "Carregar historico"}
                                            </button>
                                        </div>
                                    )}
                                    {hiddenLoadedMessagesCount > 0 && (
                                        <div className="sticky top-0 z-10 mb-2 rounded-lg border border-sky-200 bg-sky-500/10 px-3 py-2 text-xs text-sky-800 backdrop-blur-sm flex items-center justify-between gap-3">
                                            <span>
                                                Exibindo {visibleThreadMessages.length} de {thread.messages.length} mensagens carregadas para manter o painel leve.
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setThreadRenderLimit((current) =>
                                                        Math.min(MAX_THREAD_RENDER_LIMIT, current + THREAD_RENDER_LIMIT_STEP)
                                                    );
                                                }}
                                                disabled={visibleThreadMessages.length >= Math.min(thread.messages.length, MAX_THREAD_RENDER_LIMIT)}
                                                className="px-2 py-1 rounded-md bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {visibleThreadMessages.length >= Math.min(thread.messages.length, MAX_THREAD_RENDER_LIMIT)
                                                    ? "Limite local atingido"
                                                    : "Mostrar mais"}
                                            </button>
                                        </div>
                                    )}
                                    <div className="relative" style={{ minHeight: Math.max(threadVirtualRows.totalHeight, 1) }}>
                                        {renderedVirtualThreadMessages}
                                    </div>
                                </div>
                            </div>

                            {/* Reply Input */}
                            <div
                                className={`px-5 py-3 border-t border-[var(--wa-border)] transition-colors ${isDragOverComposer ? "bg-[var(--wa-accent-softer)]" : ""
                                    }`}
                                onDragOver={handleComposerDragOver}
                                onDragEnter={handleComposerDragOver}
                                onDragLeave={handleComposerDragLeave}
                                onDrop={handleComposerDrop}
                            >
                                {!trimmedOperatorName && (
                                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-[var(--wa-surface-soft)] border border-[var(--wa-border)] rounded-lg text-xs text-[var(--wa-text-muted)]">
                                        Identificando atendente logado... aguarde para assumir e responder conversas.
                                    </div>
                                )}
                                {lockedByOther && (
                                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-700">
                                        Esta conversa está em atendimento por <strong>{threadLockOwner}</strong>. Assuma a conversa para responder.
                                    </div>
                                )}
                                {!isWithin24h(thread.conversation.lastCustomerMessageAt) && (
                                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-amber-500/10 border border-amber-200 rounded-lg text-xs text-amber-700">
                                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                        Fora da janela de 24h. A mensagem pode nao ser entregue sem template aprovado.
                                    </div>
                                )}
                                {isDragOverComposer && (
                                    <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-[var(--wa-accent-softer)] border border-[var(--wa-accent-border)] rounded-lg text-xs text-[var(--wa-accent)]">
                                        Solte o arquivo aqui para anexar.
                                    </div>
                                )}
                                {pendingMediaFile && (
                                    <div className="mb-2 flex items-center justify-between gap-3 px-3 py-2 bg-[var(--wa-surface-soft)] border border-[var(--wa-border)] rounded-lg">
                                        <div className="min-w-0 flex-1 text-xs text-[var(--wa-text-muted)]">
                                            <div className="min-w-0 flex items-center gap-2">
                                                {getPendingMediaIcon(pendingMediaFile)}
                                                <span className="font-medium truncate">{pendingMediaFile.name}</span>
                                                <span className="text-[var(--wa-text-dim)] flex-shrink-0">{formatFileSize(pendingMediaFile.size)}</span>
                                            </div>
                                            {pendingMediaFile.type.startsWith("audio/") && recordedAudioPreviewUrl && (
                                                <div className="mt-2">
                                                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                                    <audio controls preload="metadata" className="w-full h-8">
                                                        <source src={recordedAudioPreviewUrl} type={pendingMediaFile.type || "audio/ogg"} />
                                                    </audio>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                clearPendingMedia();
                                            }}
                                            className="p-1 rounded hover:bg-[var(--wa-surface-soft-hover)] text-[var(--wa-text-dim)] transition-colors"
                                            title="Remover mídia"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        ref={mediaInputRef}
                                        type="file"
                                        accept="audio/*,video/*,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] ?? null;
                                            setPendingMediaFile(file);
                                            setPendingMediaIsVoiceNote(false);
                                            revokeRecordedAudioPreview();
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => mediaInputRef.current?.click()}
                                        disabled={!trimmedOperatorName || lockedByOther || sendReply.isPending || isUploadingMedia || isRecordingAudio}
                                        className="px-3 py-2.5 bg-[var(--wa-surface-soft)] text-[var(--wa-text-secondary)] rounded-xl hover:bg-[var(--wa-surface-soft-hover)] disabled:opacity-50 transition-colors"
                                        title="Anexar arquivo, imagem, vídeo ou áudio"
                                    >
                                        <Paperclip className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isRecordingAudio) {
                                                stopAudioRecording();
                                            } else {
                                                void startAudioRecording();
                                            }
                                        }}
                                        disabled={!trimmedOperatorName || lockedByOther || sendReply.isPending || isUploadingMedia}
                                        className={`px-3 py-2.5 rounded-xl disabled:opacity-50 transition-colors ${isRecordingAudio
                                            ? "bg-red-600 text-white hover:bg-red-700"
                                            : "bg-[var(--wa-surface-soft)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-surface-soft-hover)]"
                                            }`}
                                        title={isRecordingAudio ? "Parar gravação de áudio" : "Gravar áudio com microfone"}
                                    >
                                        {isRecordingAudio ? (
                                            <Square className="h-4 w-4" />
                                        ) : (
                                            <Mic className="h-4 w-4" />
                                        )}
                                    </button>
                                    <div className="relative">
                                        <button
                                            ref={emojiButtonRef}
                                            type="button"
                                            onClick={() => setIsEmojiPickerOpen((current) => !current)}
                                            disabled={!trimmedOperatorName || lockedByOther || sendReply.isPending || isUploadingMedia || isRecordingAudio}
                                            className="px-3 py-2.5 bg-[var(--wa-surface-soft)] text-[var(--wa-text-secondary)] rounded-xl hover:bg-[var(--wa-surface-soft-hover)] disabled:opacity-50 transition-colors"
                                            title="Inserir emoji"
                                        >
                                            <Smile className="h-4 w-4" />
                                        </button>
                                        {isEmojiPickerOpen && (
                                            <div
                                                ref={emojiPickerRef}
                                                className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-60 rounded-xl border border-[var(--wa-border)] bg-[var(--wa-surface)] p-2 shadow-xl"
                                            >
                                                <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--wa-text-dim)]">
                                                    Emojis
                                                </div>
                                                <div className="grid grid-cols-8 gap-1">
                                                    {REPLY_EMOJI_OPTIONS.map((emoji) => (
                                                        <button
                                                            key={emoji}
                                                            type="button"
                                                            onClick={() => insertReplyEmoji(emoji)}
                                                            className="h-8 w-8 rounded-md text-base hover:bg-[var(--wa-border)] transition-colors"
                                                            title={`Inserir ${emoji}`}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <textarea
                                        ref={replyTextareaRef}
                                        placeholder={!trimmedOperatorName
                                            ? "Identificando atendente logado..."
                                            : lockedByOther
                                                ? "Conversa bloqueada por outro atendente..."
                                                : isRecordingAudio
                                                    ? `Gravando áudio... ${formatRecordingDuration(recordingSeconds)}`
                                                    : pendingMediaFile
                                                        ? "Legenda opcional da mídia..."
                                                        : "Digite uma mensagem..."}
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        onPaste={handleReplyPaste}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                void handleSendReply();
                                            }
                                        }}
                                        rows={1}
                                        disabled={!trimmedOperatorName || lockedByOther || sendReply.isPending || isUploadingMedia || isRecordingAudio}
                                        className="flex-1 px-4 py-2.5 bg-[var(--wa-surface-soft)] border border-[var(--wa-border)] rounded-xl text-sm text-[var(--wa-text-primary)] placeholder-[var(--wa-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent-ring)] focus:border-[var(--wa-accent)] disabled:opacity-60 resize-none min-h-[44px] max-h-36 leading-5"
                                    />
                                    <button
                                        onClick={() => { void handleSendReply(); }}
                                        disabled={
                                            (!replyText.trim() && !pendingMediaFile) ||
                                            sendReply.isPending ||
                                            isUploadingMedia ||
                                            isRecordingAudio ||
                                            !trimmedOperatorName ||
                                            lockedByOther
                                        }
                                        className="px-4 py-2.5 bg-[var(--wa-bubble-admin)] text-white rounded-xl hover:bg-[var(--wa-bubble-admin-hover)] disabled:opacity-50 transition-colors"
                                    >
                                        {sendReply.isPending || isUploadingMedia ? (
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                                <div className="mt-1.5 text-[11px] text-[var(--wa-text-dim)]">
                                    Dica: voce pode colar imagem com <kbd className="px-1 py-0.5 rounded border border-[var(--wa-border)] bg-[var(--wa-surface-soft)] text-[10px]">Ctrl+V</kbd> no campo de mensagem.
                                </div>
                                {isRecordingAudio && (
                                    <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-700">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                            Gravando áudio... {formatRecordingDuration(recordingSeconds)}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={stopAudioRecording}
                                            className="px-2.5 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                                        >
                                            Parar
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Label Context Menu (positioned absolutely) */}
            {labelMenuOpen && labelMenuConvId && (
                <div
                    ref={labelMenuRef}
                    className="fixed z-50 bg-[var(--wa-popover-bg)] border border-[var(--wa-border)] rounded-xl py-1.5 min-w-[200px]"
                    style={{
                        left: Math.min(labelMenuPosition.x, window.innerWidth - 220),
                        top: Math.min(labelMenuPosition.y, window.innerHeight - 300),
                    }}
                >
                    {labelMenuConversationIsHuman && (
                        <>
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--wa-text-dim)] uppercase tracking-wider">
                                Leitura
                            </div>
                            {labelMenuUnreadCount > 0 ? (
                                <button
                                    onClick={() => {
                                        markConversationRead.mutate({ conversationId: labelMenuConvId });
                                        setLabelMenuOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border)] transition-colors"
                                >
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    Marcar como lida
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        markConversationUnread.mutate({ conversationId: labelMenuConvId });
                                        setLabelMenuOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border)] transition-colors"
                                >
                                    <Bell className="h-3.5 w-3.5 text-amber-600" />
                                    Marcar como não lida
                                </button>
                            )}
                            <div className="border-t border-[var(--wa-border)] my-0.5" />
                        </>
                    )}
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--wa-text-dim)] uppercase tracking-wider">
                        Etiqueta
                    </div>
                    {allLabels?.map((label) => (
                        <button
                            key={label.id}
                            onClick={() => {
                                if (label.id === labelMenuCurrentLabelId) {
                                    setConversationLabel.mutate({ conversationId: labelMenuConvId, labelId: null });
                                } else {
                                    setConversationLabel.mutate({ conversationId: labelMenuConvId, labelId: label.id });
                                }
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border)] transition-colors"
                        >
                            <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: label.color }}
                            />
                            <span className="flex-1 text-left">{label.emoji ? `${label.emoji} ` : ""}{label.name}</span>
                            {label.id === labelMenuCurrentLabelId && (
                                <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            )}
                            {!label.isPredefined && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Deletar label "${label.name}"? Será removida de todas as conversas.`)) {
                                            deleteLabel.mutate({ id: label.id });
                                        }
                                    }}
                                    className="p-0.5 text-[var(--wa-text-dim)] hover:text-red-500 transition-colors"
                                    title="Deletar label"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </button>
                    ))}
                    {labelMenuCurrentLabelId && (
                        <button
                            onClick={() => {
                                setConversationLabel.mutate({ conversationId: labelMenuConvId, labelId: null });
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors border-t border-[var(--wa-border)]"
                        >
                            <X className="h-3.5 w-3.5" />
                            Remover etiqueta
                        </button>
                    )}
                    <div className="border-t border-[var(--wa-border)] mt-0.5">
                        <button
                            onClick={() => {
                                setLabelMenuOpen(false);
                                setCreateLabelOpen(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--wa-text-muted)] hover:bg-[var(--wa-border)] transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Criar nova etiqueta
                        </button>
                    </div>
                </div>
            )}

            {/* Create Label Dialog */}
            <Dialog open={createLabelOpen} onOpenChange={setCreateLabelOpen}>
                <DialogContent className="sm:max-w-[380px]">
                    <DialogHeader>
                        <DialogTitle>Nova etiqueta</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        <div>
                            <label className="text-sm font-medium text-[var(--wa-text-secondary)]">Nome</label>
                            <input
                                type="text"
                                value={newLabelName}
                                onChange={(e) => setNewLabelName(e.target.value)}
                                placeholder="Ex: Prioridade Alta"
                                maxLength={50}
                                className="mt-1 w-full px-3 py-2 bg-[var(--wa-surface)] border border-[var(--wa-border)] rounded-lg text-sm text-[var(--wa-text-primary)] placeholder-[var(--wa-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent-ring)] focus:border-[var(--wa-accent)]"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-[var(--wa-text-secondary)]">Cor</label>
                            <div className="grid grid-cols-6 gap-2 mt-1.5">
                                {COLOR_PALETTE.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => setNewLabelColor(color)}
                                        className={`w-8 h-8 rounded-lg transition-all ${newLabelColor === color
                                            ? "ring-2 ring-offset-2 ring-[var(--wa-text-dim)] scale-110"
                                            : "hover:scale-105"
                                            }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-[var(--wa-text-secondary)]">Emoji (opcional)</label>
                            <input
                                type="text"
                                value={newLabelEmoji}
                                onChange={(e) => setNewLabelEmoji(e.target.value)}
                                placeholder="Ex: \u{1F525}"
                                maxLength={4}
                                className="mt-1 w-20 px-3 py-2 bg-[var(--wa-surface)] border border-[var(--wa-border)] rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent-ring)] focus:border-[var(--wa-accent)]"
                            />
                        </div>
                        {/* Preview */}
                        {newLabelName.trim() && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--wa-text-dim)]">Preview:</span>
                                <LabelBadge label={{ name: newLabelName.trim(), color: newLabelColor, emoji: newLabelEmoji || null }} />
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setCreateLabelOpen(false)}
                                className="px-4 py-2 text-sm text-[var(--wa-text-muted)] hover:bg-[var(--wa-border)] rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (!newLabelName.trim()) return;
                                    createLabel.mutate({
                                        name: newLabelName.trim(),
                                        color: newLabelColor,
                                        emoji: newLabelEmoji || undefined,
                                    });
                                }}
                                disabled={!newLabelName.trim() || createLabel.isPending}
                                className="px-4 py-2 text-sm font-medium text-white bg-[var(--wa-bubble-admin)] hover:bg-[var(--wa-bubble-admin-hover)] rounded-lg transition-colors disabled:opacity-50"
                            >
                                Criar
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Iniciar conversa</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        <div>
                            <label className="text-sm font-medium text-[var(--wa-text-secondary)]">WhatsApp (DDI + DDD + numero)</label>
                            <input
                                type="text"
                                value={newChatPhone}
                                onChange={(e) => setNewChatPhone(e.target.value)}
                                placeholder="Ex: +55 61 99999-9999"
                                className="mt-1 w-full px-3 py-2 bg-[var(--wa-surface)] border border-[var(--wa-border)] rounded-lg text-sm text-[var(--wa-text-primary)] placeholder-[var(--wa-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent-ring)] focus:border-[var(--wa-accent)]"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-[var(--wa-text-secondary)]">Nome do cliente (opcional)</label>
                            <input
                                type="text"
                                value={newChatCustomerName}
                                onChange={(e) => setNewChatCustomerName(e.target.value)}
                                placeholder="Ex: Maria"
                                className="mt-1 w-full px-3 py-2 bg-[var(--wa-surface)] border border-[var(--wa-border)] rounded-lg text-sm text-[var(--wa-text-primary)] placeholder-[var(--wa-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent-ring)] focus:border-[var(--wa-accent)]"
                            />
                        </div>
                        <div className="text-xs text-[var(--wa-text-dim)]">
                            A conversa sera aberta no painel para voce enviar a primeira mensagem.
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setNewChatOpen(false)}
                                className="px-4 py-2 text-sm text-[var(--wa-text-muted)] hover:bg-[var(--wa-border)] rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { void handleStartConversation(); }}
                                disabled={!newChatPhone.trim() || !operatorName.trim() || startConversation.isPending}
                                className="px-4 py-2 text-sm font-medium text-white bg-[var(--wa-bubble-admin)] hover:bg-[var(--wa-bubble-admin-hover)] rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                            >
                                {startConversation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                                Abrir conversa
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
