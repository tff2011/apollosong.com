import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { formatMegabytes, getWhatsAppMediaMaxBytes } from "~/lib/whatsapp-media-limits";
import { StorageService } from "~/lib/storage";
import { mimeToExtension } from "~/lib/whatsapp";
import { requireAdminApiAccess } from "~/server/auth/admin-api";

const MAX_FILE_SIZE_MB = Number.parseInt(process.env.WHATSAPP_ADMIN_UPLOAD_MAX_MB || "", 10);
const MAX_FILE_SIZE = (Number.isFinite(MAX_FILE_SIZE_MB) && MAX_FILE_SIZE_MB > 0 ? MAX_FILE_SIZE_MB : 64) * 1024 * 1024;

type UploadMessageType = "audio" | "video" | "document" | "image";

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

function parseBooleanFormValue(value: FormDataEntryValue | null): boolean {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function POST(request: Request) {
    const access = await requireAdminApiAccess("WHATSAPP");
    if (!access.ok) {
        return access.response;
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file");
        const voiceNote = parseBooleanFormValue(formData.get("voiceNote"));

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
        }

        if (file.size <= 0) {
            return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `Arquivo muito grande. Máximo ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB.` },
                { status: 400 }
            );
        }

        const rawMimeType = (file.type || "application/octet-stream").toLowerCase();
        const mimeType = normalizeMimeType(rawMimeType) || "application/octet-stream";
        const messageType = getUploadMessageType(mimeType);
        const typeMaxBytes = getWhatsAppMediaMaxBytes(messageType);
        const effectiveMaxBytes = Math.min(MAX_FILE_SIZE, typeMaxBytes);

        if (file.size > effectiveMaxBytes) {
            return NextResponse.json(
                {
                    error: `Arquivo muito grande para ${getMessageTypeLabel(messageType)} no WhatsApp. Máximo ${formatMegabytes(effectiveMaxBytes)}MB.`,
                },
                { status: 400 }
            );
        }

        const ext = mimeToExtension(mimeType);
        const safeFileName = ensureFileExtension(sanitizeFilename(file.name), ext);

        if (messageType === "audio" && !voiceNote && !WHATSAPP_SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
            return NextResponse.json(
                { error: "Formato de áudio incompatível para envio direto no WhatsApp. Envie MP3/M4A/OGG." },
                { status: 400 }
            );
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer) as Buffer;

        const key = `whatsapp-outbound/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
        const url = await StorageService.uploadBuffer(key, buffer, mimeType);

        return NextResponse.json({
            success: true,
            url,
            key,
            mimeType,
            fileName: safeFileName,
            messageType,
            size: file.size,
            voiceNote: messageType === "audio" ? voiceNote : false,
        });
    } catch (error) {
        console.error("[WhatsApp upload] Failed:", error);
        return NextResponse.json({ error: "Falha ao fazer upload da mídia" }, { status: 500 });
    }
}
