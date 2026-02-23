import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { formatMegabytes, getWhatsAppMediaMaxBytes } from "~/lib/whatsapp-media-limits";
import { StorageService } from "~/lib/storage";
import { mimeToExtension } from "~/lib/whatsapp";
import { requireAdminApiAccess } from "~/server/auth/admin-api";

type UploadMessageType = "audio" | "video" | "document" | "image";

const MAX_FILE_SIZE_MB = Number.parseInt(process.env.WHATSAPP_ADMIN_UPLOAD_MAX_MB || "", 10);
const MAX_FILE_SIZE = (Number.isFinite(MAX_FILE_SIZE_MB) && MAX_FILE_SIZE_MB > 0 ? MAX_FILE_SIZE_MB : 64) * 1024 * 1024;

const SUPPORTED_REPLY_DOCUMENT_MIME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
]);

const WHATSAPP_SUPPORTED_AUDIO_MIME_TYPES = new Set([
    "audio/aac",
    "audio/amr",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
]);

function normalizeMimeType(mimeType: string): string {
    const base = mimeType.split(";")[0]!.trim().toLowerCase();
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

function getUploadMessageType(mimeType: string): UploadMessageType {
    const base = normalizeMimeType(mimeType);
    if (base.startsWith("audio/")) return "audio";
    if (base.startsWith("video/")) return "video";
    if (base.startsWith("image/")) return "image";
    return "document";
}

function getMessageTypeLabel(messageType: UploadMessageType): string {
    if (messageType === "image") return "imagem";
    if (messageType === "audio") return "audio";
    if (messageType === "video") return "video";
    return "documento";
}

function canUploadDirectly(mimeType: string): boolean {
    const normalized = normalizeMimeType(mimeType);

    if (normalized.startsWith("image/")) return true;
    if (normalized.startsWith("video/")) return true;
    if (SUPPORTED_REPLY_DOCUMENT_MIME_TYPES.has(normalized)) return true;
    if (normalized.startsWith("audio/")) return true;

    return false;
}

function shouldConvertAudioBeforeDirectUpload(_rawMimeType: string, normalizedMimeType: string): boolean {
    if (!normalizedMimeType.startsWith("audio/")) return false;
    if (!WHATSAPP_SUPPORTED_AUDIO_MIME_TYPES.has(normalizedMimeType)) return true;

    // MediaRecorder may produce .m4a payloads that WhatsApp classifies as invalid.
    // Force server-side conversion for all audio/mp4 variants.
    if (normalizedMimeType === "audio/mp4") {
        return true;
    }

    return false;
}

function sanitizeFilename(name: string): string {
    return name
        .trim()
        .replace(/[^\w.\- ]+/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 120) || "arquivo";
}

function ensureFileExtension(fileName: string, ext: string): string {
    const trimmed = fileName.trim() || "arquivo";
    const cleanExt = ext.replace(/^\./, "").toLowerCase();
    if (!cleanExt) return trimmed;

    if (trimmed.toLowerCase().endsWith(`.${cleanExt}`)) {
        return trimmed;
    }

    const withoutExt = trimmed.replace(/\.[a-z0-9]{1,8}$/i, "");
    return `${withoutExt || "arquivo"}.${cleanExt}`;
}

export async function POST(request: Request) {
    const access = await requireAdminApiAccess("WHATSAPP");
    if (!access.ok) {
        return access.response;
    }

    try {
        const body = await request.json() as { fileName?: unknown; mimeType?: unknown; voiceNote?: unknown; fileSize?: unknown };
        const rawMimeType = typeof body.mimeType === "string" ? body.mimeType : "";
        const mimeType = normalizeMimeType(rawMimeType);
        const inputFileName = typeof body.fileName === "string" ? body.fileName : "arquivo";
        const voiceNote = body.voiceNote === true;
        const rawFileSize = typeof body.fileSize === "number"
            ? body.fileSize
            : (typeof body.fileSize === "string" ? Number(body.fileSize) : NaN);
        const fileSize = Number.isFinite(rawFileSize) ? Math.floor(rawFileSize) : NaN;

        if (!mimeType) {
            return NextResponse.json({ error: "MIME type inválido" }, { status: 400 });
        }

        if (!Number.isFinite(fileSize) || fileSize <= 0) {
            return NextResponse.json({ error: "Tamanho do arquivo inválido" }, { status: 400 });
        }

        const messageType = getUploadMessageType(mimeType);
        const typeMaxBytes = getWhatsAppMediaMaxBytes(messageType);
        const effectiveMaxBytes = Math.min(MAX_FILE_SIZE, typeMaxBytes);
        if (fileSize > effectiveMaxBytes) {
            return NextResponse.json(
                {
                    error: `Arquivo muito grande para ${getMessageTypeLabel(messageType)} no WhatsApp. Máximo ${formatMegabytes(effectiveMaxBytes)}MB.`,
                },
                { status: 400 }
            );
        }

        if (!canUploadDirectly(mimeType)) {
            return NextResponse.json(
                { error: "Formato requer conversão no servidor antes do envio para WhatsApp." },
                { status: 400 }
            );
        }

        if (!voiceNote && shouldConvertAudioBeforeDirectUpload(rawMimeType.toLowerCase(), mimeType)) {
            return NextResponse.json(
                { error: "Formato de áudio requer conversão no servidor antes do envio para WhatsApp." },
                { status: 400 }
            );
        }

        const ext = mimeToExtension(mimeType);
        const safeFileName = ensureFileExtension(sanitizeFilename(inputFileName), ext);
        const key = `whatsapp-outbound/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

        const uploadUrl = await StorageService.getUploadUrl(key, mimeType);
        const url = await StorageService.getReadUrl(key);

        return NextResponse.json({
            success: true,
            uploadUrl,
            url,
            key,
            mimeType,
            fileName: safeFileName,
            messageType,
            voiceNote: messageType === "audio" ? voiceNote : false,
        });
    } catch (error) {
        console.error("[WhatsApp upload URL] Failed:", error);
        return NextResponse.json({ error: "Falha ao iniciar upload da mídia" }, { status: 500 });
    }
}
