import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { DistroKidAutomation } from "~/server/services/distrokid/automation";
import { enqueueDistrokidUpload } from "~/server/queues/distrokid-upload";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { env } from "~/env.js";
import { DISTROKID_DOWNLOADS_DIR } from "~/server/services/distrokid/paths";
import { requireAdminApiAccess } from "~/server/auth/admin-api";

export const maxDuration = 300; // 5 minutes timeout for long-running automation

// Initialize S3 Client (Cloudflare R2)
const R2 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
});

const STREAMING_SONG_NAME_STOP_WORDS = new Set([
    "a", "o", "as", "os", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "pra", "pro", "com", "sem",
    "the", "an", "and", "of", "for", "to", "in", "on", "with", "from", "my", "your", "our",
    "del", "la", "las", "el", "los", "y", "mi", "tu", "su",
    "du", "des", "le", "les", "pour", "avec", "sans", "mon", "ma", "mes", "ton", "ta", "tes",
    "di", "della", "delle", "dello", "il", "lo", "gli", "per", "senza", "mio", "mia", "tuo", "tua", "uno",
]);

function normalizeStreamingSongNameForComparison(value: string | null | undefined): string {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

function tokenizeStreamingSongNameForComparison(value: string | null | undefined): string[] {
    const normalized = normalizeStreamingSongNameForComparison(value)
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!normalized) return [];

    return normalized
        .split(" ")
        .filter((token) => token.length > 1 && !STREAMING_SONG_NAME_STOP_WORDS.has(token));
}

function calculateTokenJaccardSimilarity(a: string[], b: string[]): number {
    const aSet = new Set(a);
    const bSet = new Set(b);
    if (aSet.size === 0 || bSet.size === 0) return 0;

    let intersectionCount = 0;
    for (const token of aSet) {
        if (bSet.has(token)) intersectionCount += 1;
    }

    const unionCount = new Set([...aSet, ...bSet]).size;
    return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

function areStreamingSongNamesConflicting(a: string | null | undefined, b: string | null | undefined): boolean {
    const normalizedA = normalizeStreamingSongNameForComparison(a);
    const normalizedB = normalizeStreamingSongNameForComparison(b);

    if (!normalizedA || !normalizedB) return false;
    if (normalizedA === normalizedB) return true;
    if (normalizedA.replace(/\s+/g, "") === normalizedB.replace(/\s+/g, "")) return true;

    const tokenizedA = tokenizeStreamingSongNameForComparison(normalizedA);
    const tokenizedB = tokenizeStreamingSongNameForComparison(normalizedB);
    if (tokenizedA.length === 0 || tokenizedB.length === 0) return false;

    const tokenPhraseA = tokenizedA.join(" ");
    const tokenPhraseB = tokenizedB.join(" ");

    if (tokenPhraseA === tokenPhraseB) return true;

    const minTokenPhraseLength = Math.min(tokenPhraseA.length, tokenPhraseB.length);
    if (
        minTokenPhraseLength >= 12 &&
        (tokenPhraseA.includes(tokenPhraseB) || tokenPhraseB.includes(tokenPhraseA))
    ) {
        return true;
    }

    const tokenSimilarity = calculateTokenJaccardSimilarity(tokenizedA, tokenizedB);
    return tokenSimilarity >= 0.85;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

async function downloadToFile(key: string, localPath: string) {
    const command = new GetObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
    });

    const response = await R2.send(command);
    if (!response.Body) throw new Error("File body is empty");

    const buffer = await streamToBuffer(response.Body as Readable);
    await writeFile(localPath, buffer);
}

export async function POST(req: NextRequest) {
    const access = await requireAdminApiAccess("LEADS");
    if (!access.ok) {
        return access.response;
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
        return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // Fetch order details
    const order = await db.songOrder.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            recipientName: true,
            streamingSongName: true,
            parentOrderId: true,
            songFileKey: true,
            streamingCoverKey: true,
            preferredSongForStreaming: true,
        },
    });

    if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let mp3Key = order.songFileKey;
    let coverKey = order.streamingCoverKey;

    // If keys are missing, check parent order
    if (!mp3Key && order.parentOrderId) {
        const parent = await db.songOrder.findUnique({
            where: { id: order.parentOrderId },
            select: {
                songFileKey: true,
                songFileKey2: true,
                songFileUrl: true,
                songFileUrl2: true,
            },
        });
        if (parent) {
            if (order.preferredSongForStreaming === parent.songFileUrl) mp3Key = parent.songFileKey;
            else if (order.preferredSongForStreaming === parent.songFileUrl2) mp3Key = parent.songFileKey2;
            else mp3Key = parent.songFileKey;
        }
    }

    if (!mp3Key) return NextResponse.json({ error: "MP3 file not found for this order" }, { status: 400 });
    if (!coverKey) return NextResponse.json({ error: "Streaming Cover Art not found (upload it first)" }, { status: 400 });

    const songName = order.streamingSongName || order.recipientName;
    if (!songName) return NextResponse.json({ error: "Streaming song name not set" }, { status: 400 });

    const existingStreamingOrders = await db.songOrder.findMany({
        where: {
            orderType: "STREAMING_UPSELL",
            id: { not: orderId },
            status: { notIn: ["CANCELLED", "REFUNDED"] },
            streamingSongName: { not: null },
        },
        select: {
            id: true,
            streamingSongName: true,
        },
    });
    const duplicateOrder = existingStreamingOrders.find((existingOrder) =>
        areStreamingSongNamesConflicting(songName, existingOrder.streamingSongName)
    );
    if (duplicateOrder) {
        return NextResponse.json(
            { error: "Este nome de música já está em uso em outro pedido Streaming VIP. Escolha um nome diferente antes de enviar ao DistroKid." },
            { status: 400 }
        );
    }

    const modeOverride = process.env.DISTROKID_UPLOAD_MODE;
    const hostname = req.nextUrl.hostname;
    const isLocalRequest = hostname === "localhost" || hostname === "127.0.0.1";
    const runLocal =
        modeOverride === "local" ||
        isLocalRequest ||
        (modeOverride !== "queue" && process.env.NODE_ENV !== "production");

    if (!runLocal) {
        try {
            await enqueueDistrokidUpload(orderId);
            return NextResponse.json({
                success: true,
                mode: "queue",
                message: "Upload enfileirado para processamento no worker",
            });
        } catch (error) {
            if (error instanceof Error && error.message.includes("Job with the same id")) {
                return NextResponse.json({
                    success: true,
                    mode: "queue",
                    message: "Upload já enfileirado para este pedido",
                });
            }
            console.error("DistroKid automation error:", error);
            return NextResponse.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, { status: 500 });
        }
    }

    const distrokidEmail = process.env.DISTROKID_EMAIL;
    const distrokidPassword = process.env.DISTROKID_PASSWORD;
    if (!distrokidEmail || !distrokidPassword) {
        return NextResponse.json({ error: "DistroKid credentials not set in env" }, { status: 500 });
    }

    // Download files from R2 to local tmp
    const tmpDir = DISTROKID_DOWNLOADS_DIR;
    await mkdir(tmpDir, { recursive: true });

    const mp3Path = path.join(tmpDir, `${orderId}.mp3`);
    const coverPath = path.join(tmpDir, `${orderId}.jpg`);

    try {
        console.log(`🎸 [DistroKid] Downloading files for order ${orderId}...`);
        await Promise.all([
            downloadToFile(mp3Key, mp3Path),
            downloadToFile(coverKey, coverPath),
        ]);

        console.log("🎸 [DistroKid] Starting automation...");
        const automation = new DistroKidAutomation();
        try {
            await automation.init();
            await automation.login(distrokidEmail, distrokidPassword);
            await automation.navigateToNewUpload();

            await automation.uploadMusic({
                nomeDaMusica: songName,
                arquivoMp3: mp3Path,
                arquivoCapa: coverPath,
            });

            await db.songOrder.update({
                where: { id: orderId },
                data: { status: "IN_PROGRESS" },
            });

            console.log(`✅ [DistroKid] Upload completed for order ${orderId}`);
            return NextResponse.json({
                success: true,
                mode: "local",
                message: "Upload concluído com sucesso no DistroKid",
            });
        } finally {
            await automation.close();
            await unlink(mp3Path).catch(() => {});
            await unlink(coverPath).catch(() => {});
        }
    } catch (error) {
        console.error("DistroKid automation error:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }, { status: 500 });
    }
}
