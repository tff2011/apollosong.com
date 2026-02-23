import "dotenv/config";

import IORedis from "ioredis";
import { Worker } from "bullmq";
import { db } from "../db";
import { buildAutoDeliveryEmail } from "../email/auto-delivery";
import { executeWithSmtpRetry } from "../email/smtp-retry";
import nodemailer from "nodemailer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { SunoJobData } from "../services/suno/types";
import {
    closeBrowser,
    resetContext,
    getGenreDisplayName,
} from "../services/suno";
import { generateSongsViaKieApi, isKieSunoEnabled } from "../services/suno/kie-api";
import {
    sendSunoCreditsAlert,
    sendSunoGenerationAlert,
} from "../../lib/telegram";
import { enqueuePdfGeneration } from "../queues/pdf-generation";
import { enqueueSunoGeneration } from "../queues/suno-generation";
import { isEmailBounced } from "../../lib/email-bounce-suppression";
import { normalizeVocals } from "../../lib/vocals";
import { buildSunoGenerationSignature } from "../services/suno/generation-signature";
import { getSunoAutomationDelayMs } from "../services/suno/automation-delay";

// ============================================================================
// SUNO-ONLY WORKER
// This entrypoint exists so we can scale Suno throughput by running multiple
// processes (one per Suno account/profile) without multiplying other workers.
// ============================================================================

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
const CREDITS_ALERT_THRESHOLD = 50;

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function parseFractionEnv(value: string | undefined, fallback: number): number {
    const parsed = Number.parseFloat(value || "");
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return fallback;
    return parsed;
}

const KIE_PROVIDER_RATE_LIMIT_MAX = parsePositiveIntEnv(process.env.KIE_SUNO_PROVIDER_RATE_LIMIT_MAX || process.env.KIE_SUNO_RATE_LIMIT_MAX, 20);
const KIE_RATE_LIMIT_UTILIZATION = parseFractionEnv(process.env.KIE_SUNO_RATE_LIMIT_UTILIZATION, 0.8);
const KIE_RATE_LIMIT_MAX = Math.max(1, Math.floor(KIE_PROVIDER_RATE_LIMIT_MAX * KIE_RATE_LIMIT_UTILIZATION));
const KIE_RATE_LIMIT_WINDOW_MS = parsePositiveIntEnv(process.env.KIE_SUNO_RATE_LIMIT_WINDOW_MS, 10_000);
const SUNO_WORKER_CONCURRENCY = Math.max(
    1,
    Math.min(
        parsePositiveIntEnv(process.env.KIE_SUNO_WORKER_CONCURRENCY, KIE_RATE_LIMIT_MAX),
        KIE_RATE_LIMIT_MAX
    )
);

// SMTP config (used for auto-delivery)
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";

const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASSWORD)
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: 587,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD,
        },
    })
    : null;

// R2 Storage configuration (accepts both R2_* and CLOUDFLARE_R2_* envs)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
const R2_PUBLIC_URL =
    process.env.R2_PUBLIC_URL ||
    process.env.CLOUDFLARE_R2_PUBLIC_URL ||
    (R2_PUBLIC_DOMAIN ? `https://${R2_PUBLIC_DOMAIN.replace(/^https?:\/\//, "")}` : undefined) ||
    (R2_ACCOUNT_ID ? `https://pub-${R2_ACCOUNT_ID}.r2.dev` : undefined);

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("R2 credentials are required for Suno worker (R2_* or CLOUDFLARE_R2_* envs)");
}

const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

type UploadedSong = {
    url: string;
    key: string;
};

async function uploadSongToR2(buffer: Buffer, orderId: string, slot: number): Promise<UploadedSong> {
    const key = `songs/${orderId}/song-${slot}.mp3`;

    await s3Client.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: "audio/mpeg",
        })
    );

    return {
        url: `${R2_PUBLIC_URL}/${key}`,
        key,
    };
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const SUNO_GENERATION_QUEUE = "suno-generation";
const SUNO_WORKER_STARTED_AT_KEY = "suno:worker:started-at";
const SUNO_WORKER_HEARTBEAT_KEY = "suno:worker:heartbeat";
const SUNO_WORKER_HEARTBEAT_INTERVAL_MS = 15_000;
const SUNO_WORKER_HEARTBEAT_TTL_SECONDS = 90;
const SUNO_FAILED_RETRY_INTERVAL_MS = parsePositiveIntEnv(
    process.env.SUNO_FAILED_RETRY_INTERVAL_MS,
    60 * 60 * 1000
);
const SUNO_RETRY_SWEEP_LOCK_KEY = "suno:retry-sweep:lock";
const SUNO_RETRY_SWEEP_LOCK_TTL_SECONDS = Math.max(
    60,
    Math.ceil(SUNO_FAILED_RETRY_INTERVAL_MS / 1000) - 60
);
const SUNO_GENERATABLE_ORDER_TYPES = new Set(["MAIN", "EXTRA_SONG", "GENRE_VARIANT"]);
let sunoHeartbeatTimer: NodeJS.Timeout | null = null;
let sunoRetrySweepTimer: NodeJS.Timeout | null = null;

function startSunoWorkerHeartbeat() {
    if (sunoHeartbeatTimer) return;

    const publishHeartbeat = () => {
        void connection.set(
            SUNO_WORKER_HEARTBEAT_KEY,
            Date.now().toString(),
            "EX",
            SUNO_WORKER_HEARTBEAT_TTL_SECONDS
        ).catch((error) => {
            console.warn("⚠️ [Suno] Failed to publish worker heartbeat:", error);
        });
    };

    publishHeartbeat();
    sunoHeartbeatTimer = setInterval(publishHeartbeat, SUNO_WORKER_HEARTBEAT_INTERVAL_MS);
    sunoHeartbeatTimer.unref?.();
}

function stopSunoWorkerHeartbeat() {
    if (sunoHeartbeatTimer) {
        clearInterval(sunoHeartbeatTimer);
        sunoHeartbeatTimer = null;
    }
    void connection.del(SUNO_WORKER_HEARTBEAT_KEY).catch(() => {
        // Ignore heartbeat cleanup errors during shutdown.
    });
}

type SunoRetryOrder = {
    id: string;
    orderType: string;
    status: string;
    lyricsStatus: string | null;
    lyrics: string | null;
    genre: string;
    locale: string;
    vocals: string;
    recipientName: string;
    songFileUrl: string | null;
    songFileUrl2: string | null;
    hasFastDelivery: boolean;
    planType: string | null;
    createdAt: Date;
    paymentCompletedAt: Date | null;
    parentOrder: { hasFastDelivery: boolean; planType: string | null } | null;
};

function normalizePlanTypeForSunoRetry(value: string | null | undefined): string {
    return String(value || "").trim().toLowerCase();
}

function isExpressSunoRetryOrder(order: SunoRetryOrder): boolean {
    const planType = normalizePlanTypeForSunoRetry(order.planType);
    const parentPlanType = normalizePlanTypeForSunoRetry(order.parentOrder?.planType);
    return Boolean(
        order.hasFastDelivery ||
        planType === "express" ||
        planType === "acelerado" ||
        order.parentOrder?.hasFastDelivery ||
        parentPlanType === "express" ||
        parentPlanType === "acelerado"
    );
}

function isEligibleForSunoRetry(order: SunoRetryOrder): boolean {
    const validOrderType = SUNO_GENERATABLE_ORDER_TYPES.has(order.orderType);
    const validStatus = order.status === "PAID" || order.status === "IN_PROGRESS";
    const hasLyricsReady = order.lyricsStatus === "completed" && Boolean(order.lyrics);
    const missingAnySong = !(order.songFileUrl && order.songFileUrl2);
    return validOrderType && validStatus && hasLyricsReady && missingAnySong;
}

async function enqueueSunoRetryOrder(order: SunoRetryOrder, delayMs: number): Promise<"enqueued" | "exists"> {
    const priority = isExpressSunoRetryOrder(order) ? 1 : 5;
    await enqueueSunoGeneration({
        orderId: order.id,
        lyrics: order.lyrics!,
        genre: order.genre,
        locale: order.locale,
        vocals: normalizeVocals(order.vocals),
        recipientName: order.recipientName,
    }, {
        priority,
        delay: delayMs,
    });
    return "enqueued";
}

async function scheduleSunoRetryAfterFinalFailure(job?: { data: SunoJobData; attemptsMade?: number; opts?: { attempts?: number } }) {
    if (!job?.data.orderId) return;

    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 3;
    if (attemptsMade < maxAttempts) {
        return;
    }

    if (!isKieSunoEnabled()) {
        console.warn(`[Suno] Retry-after-failure skipped for ${job.data.orderId}: Kie disabled`);
        return;
    }

    const order = await db.songOrder.findUnique({
        where: { id: job.data.orderId },
        select: {
            id: true,
            orderType: true,
            status: true,
            lyricsStatus: true,
            lyrics: true,
            genre: true,
            locale: true,
            vocals: true,
            recipientName: true,
            songFileUrl: true,
            songFileUrl2: true,
            hasFastDelivery: true,
            planType: true,
            createdAt: true,
            paymentCompletedAt: true,
            parentOrder: {
                select: {
                    hasFastDelivery: true,
                    planType: true,
                },
            },
        },
    }) as SunoRetryOrder | null;

    if (!order || !isEligibleForSunoRetry(order)) {
        console.log(`[Suno] Retry-after-failure skipped for ${job.data.orderId}: order not eligible`);
        return;
    }

    try {
        await enqueueSunoRetryOrder(order, SUNO_FAILED_RETRY_INTERVAL_MS);
        console.log(
            `🔁 [Suno] Re-enqueued failed order ${order.id} to retry in ${Math.max(1, Math.round(SUNO_FAILED_RETRY_INTERVAL_MS / 60000))} min`
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("already exists")) {
            console.log(`[Suno] Retry-after-failure already scheduled for ${order.id}, skipping`);
            return;
        }
        console.error(`[Suno] Retry-after-failure enqueue failed for ${order.id}:`, message);
    }
}

async function runSunoRetrySweep(trigger: "startup" | "interval") {
    if (!isKieSunoEnabled()) {
        console.warn("[Suno] Retry sweep skipped: Kie disabled");
        return;
    }

    const lock = await connection.set(
        SUNO_RETRY_SWEEP_LOCK_KEY,
        `${process.pid}:${Date.now()}`,
        "EX",
        SUNO_RETRY_SWEEP_LOCK_TTL_SECONDS,
        "NX"
    );
    if (lock !== "OK") {
        return;
    }

    const now = new Date();
    const orders = await db.songOrder.findMany({
        where: {
            status: { in: ["PAID", "IN_PROGRESS"] },
            orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
            lyricsStatus: "completed",
            lyrics: { not: null },
            OR: [
                { songFileUrl: null },
                { songFileUrl2: null },
            ],
        },
        select: {
            id: true,
            orderType: true,
            status: true,
            lyricsStatus: true,
            lyrics: true,
            genre: true,
            locale: true,
            vocals: true,
            recipientName: true,
            songFileUrl: true,
            songFileUrl2: true,
            hasFastDelivery: true,
            planType: true,
            createdAt: true,
            paymentCompletedAt: true,
            parentOrder: {
                select: {
                    hasFastDelivery: true,
                    planType: true,
                },
            },
        },
    }) as SunoRetryOrder[];

    let enqueued = 0;
    let alreadyExists = 0;
    let failed = 0;
    for (const order of orders) {
        if (!isEligibleForSunoRetry(order)) continue;

        const delayMs = getSunoAutomationDelayMs({
            isExpressOrder: isExpressSunoRetryOrder(order),
            planType: order.planType,
            parentPlanType: order.parentOrder?.planType,
            paymentCompletedAt: order.paymentCompletedAt,
            createdAt: order.createdAt,
            now,
        });

        try {
            await enqueueSunoRetryOrder(order, delayMs);
            enqueued += 1;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("already exists")) {
                alreadyExists += 1;
            } else {
                failed += 1;
                console.error(`[Suno] Retry sweep enqueue failed for ${order.id}:`, message);
            }
        }
    }

    console.log(
        `[Suno] Retry sweep (${trigger}) finished: ${enqueued} enqueued, ${alreadyExists} already queued, ${failed} errors`
    );
}

function startSunoRetrySweep() {
    if (sunoRetrySweepTimer) return;
    void runSunoRetrySweep("startup").catch((error) => {
        console.error("[Suno] Retry sweep startup failed:", error);
    });
    sunoRetrySweepTimer = setInterval(() => {
        void runSunoRetrySweep("interval").catch((error) => {
            console.error("[Suno] Retry sweep interval failed:", error);
        });
    }, SUNO_FAILED_RETRY_INTERVAL_MS);
    sunoRetrySweepTimer.unref?.();
}

function stopSunoRetrySweep() {
    if (sunoRetrySweepTimer) {
        clearInterval(sunoRetrySweepTimer);
        sunoRetrySweepTimer = null;
    }
}

const sunoGenerationWorker = new Worker<SunoJobData>(
    SUNO_GENERATION_QUEUE,
    async (job) => {
        const { orderId } = job.data;
        const kieEnabled = isKieSunoEnabled();
        const orderSnapshot = await db.songOrder.findUnique({
            where: { id: orderId },
            select: {
                email: true,
                backupWhatsApp: true,
                recipientName: true,
                genre: true,
                locale: true,
                vocals: true,
                lyrics: true,
                lyricsStatus: true,
            },
        });

        if (!orderSnapshot) {
            throw new Error(`Order ${orderId} not found for Suno generation`);
        }

        if (orderSnapshot.lyricsStatus !== "completed" || !orderSnapshot.lyrics) {
            throw new Error(`Order ${orderId} lyrics not ready for Suno (status=${orderSnapshot.lyricsStatus ?? "null"})`);
        }

        const recipientName = orderSnapshot.recipientName ?? job.data.recipientName;
        const genre = orderSnapshot.genre ?? job.data.genre;
        const locale = orderSnapshot.locale ?? job.data.locale;
        const vocals = normalizeVocals(orderSnapshot.vocals ?? job.data.vocals);
        const lyrics = orderSnapshot.lyrics;
        const generationSignature = buildSunoGenerationSignature({
            lyrics,
            genre,
            locale,
            vocals,
            recipientName,
        });
        const queuedSignature = job.data.generationSignature || buildSunoGenerationSignature({
            lyrics: job.data.lyrics,
            genre: job.data.genre,
            locale: job.data.locale,
            vocals: job.data.vocals,
            recipientName: job.data.recipientName,
        });
        const payloadIsStale = queuedSignature !== generationSignature;
        let effectiveKieTaskId = job.data.kieTaskId?.trim() || undefined;
        const customerEmail = orderSnapshot.email ?? null;
        const customerWhatsApp = orderSnapshot.backupWhatsApp ?? null;
        let failureAlertSent = false;

        const sendFailureAlert = async (error: string, creditsRemaining?: number) => {
            if (failureAlertSent) return;
            failureAlertSent = true;
            await sendSunoGenerationAlert({
                orderId,
                recipientName,
                genre: getGenreDisplayName(genre),
                success: false,
                creditsRemaining,
                error,
                customerEmail,
                customerWhatsApp,
            });
        };

        if (!kieEnabled) {
            await sendFailureAlert("Kie API not configured. Configure KIE_API_KEY and SUNO_KIE_ENABLED.");
            throw new Error("Kie API not configured. Configure KIE_API_KEY and SUNO_KIE_ENABLED.");
        }

        if (payloadIsStale) {
            console.warn(`⚠️ [Suno] Stale queued payload detected for order ${orderId}; syncing with latest DB lyrics/data`);
            await job.updateData({
                ...job.data,
                lyrics,
                genre,
                locale,
                vocals,
                recipientName,
                generationSignature,
                // Never reuse a Kie task id when payload/signature changed.
                kieTaskId: undefined,
            });
            effectiveKieTaskId = undefined;
        } else if (job.data.generationSignature !== generationSignature) {
            await job.updateData({
                ...job.data,
                generationSignature,
            });
        }

        console.log(`🎵 [Suno] Starting song generation for order ${orderId}`);
        console.log(`🎵 [Suno] Genre: ${getGenreDisplayName(genre)}, Locale: ${locale}, Vocals: ${vocals}`);

        try {
            const generationSource = "kie-api" as const;
            console.log(`🎵 [Suno] Using Kie API for order ${orderId}`);

            const result = await generateSongsViaKieApi({
                orderId,
                lyrics,
                genre,
                locale,
                vocals,
                recipientName,
                existingTaskId: effectiveKieTaskId,
                onTaskCreated: async (taskId) => {
                    if (job.data.kieTaskId === taskId) return;
                    await job.updateData({
                        ...job.data,
                        kieTaskId: taskId,
                        generationSignature,
                    });
                },
            });

            // Credits alerts (optional)
            if (result.creditsRemaining !== undefined) {
                if (result.creditsRemaining <= 0) {
                    await sendSunoCreditsAlert(0);
                } else if (result.creditsRemaining <= CREDITS_ALERT_THRESHOLD) {
                    await sendSunoCreditsAlert(result.creditsRemaining);
                }
            }

            if (!result.success || result.songs.length === 0) {
                await sendFailureAlert(result.error || "No songs generated", result.creditsRemaining);
                throw new Error(result.error || "No songs generated");
            }

            const existingOrder = await db.songOrder.findUnique({
                where: { id: orderId },
                select: { songFileUrl: true, songFileUrl2: true },
            });

            if (!existingOrder) {
                throw new Error(`Order ${orderId} not found when uploading songs`);
            }

            const missingSlots: number[] = [];
            if (!existingOrder.songFileUrl) missingSlots.push(1);
            if (!existingOrder.songFileUrl2) missingSlots.push(2);

            if (missingSlots.length === 0) {
                console.log(`🎵 [Suno] Order ${orderId} already has both songs, skipping upload.`);
                return {
                    success: true,
                    songUrl1: existingOrder.songFileUrl ?? undefined,
                    songUrl2: existingOrder.songFileUrl2 ?? undefined,
                    creditsRemaining: result.creditsRemaining,
                };
            }

            // Upload missing slots (in parallel).
            const uploadsBySlot: Array<UploadedSong | null> = [null, null];
            await Promise.all(
                missingSlots.map(async (slot, index) => {
                    const song = result.songs[index];
                    if (!song) return;

                    console.log(`🎵 [Suno] Uploading song for slot ${slot} to R2 (${song.mp3Buffer.length} bytes)`);
                    const upload = await uploadSongToR2(song.mp3Buffer, orderId, slot);
                    uploadsBySlot[slot - 1] = upload;
                    console.log(`🎵 [Suno] Song for slot ${slot} uploaded: ${upload.url}`);
                })
            );

            const uploadedCount = uploadsBySlot.filter(Boolean).length;

            // Update order with song URLs and Suno account info
            const sunoAccountEmail = process.env.KIE_SUNO_ACCOUNT_EMAIL?.trim() || "kie-api";
            const uploadedAt = new Date();

            const updatedOrder = await db.songOrder.update({
                where: { id: orderId },
                data: {
                    status: "IN_PROGRESS",
                    sunoAccountEmail,
                    kieTaskId: effectiveKieTaskId || result.kieTaskId || undefined,
                    ...(uploadsBySlot[0]
                        ? {
                            songFileUrl: uploadsBySlot[0].url,
                            songFileKey: uploadsBySlot[0].key,
                            songUploadedAt: uploadedAt,
                            ...(result.songs[0]?.kieAudioId ? { kieAudioId1: result.songs[0].kieAudioId } : {}),
                        }
                        : {}),
                    ...(uploadsBySlot[1]
                        ? {
                            songFileUrl2: uploadsBySlot[1].url,
                            songFileKey2: uploadsBySlot[1].key,
                            songUploadedAt2: uploadedAt,
                            ...(result.songs[1]?.kieAudioId ? { kieAudioId2: result.songs[1].kieAudioId } : {}),
                        }
                        : {}),
                },
                select: {
                    id: true,
                    email: true,
                    locale: true,
                    recipientName: true,
                    hasFastDelivery: true,
                    planType: true,
                    songDeliveredAt: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    parentOrder: {
                        select: {
                            hasFastDelivery: true,
                            planType: true,
                        },
                    },
                },
            });

            const isExpressOrder = Boolean(
                updatedOrder.hasFastDelivery ||
                updatedOrder.planType === "express" ||
                updatedOrder.planType === "acelerado" ||
                updatedOrder.parentOrder?.hasFastDelivery ||
                updatedOrder.parentOrder?.planType === "express" ||
                updatedOrder.parentOrder?.planType === "acelerado"
            );

            const songsAvailable = [updatedOrder.songFileUrl, updatedOrder.songFileUrl2].filter(Boolean).length;
            const hasTwoSongs = songsAvailable >= 2;

            if (updatedOrder.email && !updatedOrder.songDeliveredAt && hasTwoSongs) {
                if (!transporter || !SMTP_FROM) {
                    console.warn(`⚠️ [Suno] Auto-delivery skipped for order ${updatedOrder.id}: SMTP not configured`);
                } else {
                    // Bounce suppression check (fail-open)
                    let emailSuppressed = false;
                    let bounceCheck: Awaited<ReturnType<typeof isEmailBounced>> | null = null;
                    try {
                        bounceCheck = await isEmailBounced(updatedOrder.email);
                    } catch (bounceErr) {
                        console.error("[Bounce Check] Failed, proceeding with send:", bounceErr);
                    }

                    // If suppression applies, do not send even if logging fails.
                    if (bounceCheck?.suppressed) {
                        console.warn(`[Suno] Email suppressed: ${updatedOrder.email} (${bounceCheck.bounceType} bounce)`);
                        try {
                            await db.sentEmail.create({
                                data: {
                                    recipient: updatedOrder.email,
                                    subject: `Auto-delivery suppressed (${updatedOrder.id})`,
                                    template: "SONG_DELIVERY_AUTO",
                                    orderId: updatedOrder.id,
                                    metadata: { suppressionReason: `${bounceCheck.bounceType}_bounce`, source: "suno-worker" },
                                    status: "SUPPRESSED",
                                    error: `Bounce ${bounceCheck.bounceType} not resolved`,
                                },
                            });
                        } catch (logErr) {
                            console.error("[Suno] Failed to log suppressed email:", logErr);
                        }
                        emailSuppressed = true;
                    }

                    // Always mark as COMPLETED first, regardless of email outcome
                    const deliveredAt = new Date();
                    await db.songOrder.update({
                        where: { id: updatedOrder.id },
                        data: {
                            status: "COMPLETED",
                            songDeliveredAt: deliveredAt,
                        },
                    });

                    await db.songOrder.updateMany({
                        where: {
                            parentOrderId: updatedOrder.id,
                            orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT"] },
                            status: { in: ["PAID", "IN_PROGRESS"] },
                            OR: [
                                { songFileUrl: { not: null } },
                                { songFileUrl2: { not: null } },
                            ],
                        },
                        data: {
                            status: "COMPLETED",
                            songDeliveredAt: deliveredAt,
                        },
                    });

                    console.log(`✅ [Suno] Order ${updatedOrder.id} marked as COMPLETED`);

                    // Queue PDFs in background (best-effort)
                    try {
                        const orderWithLyrics = await db.songOrder.findUnique({
                            where: { id: updatedOrder.id },
                            select: { hasLyrics: true, lyricsPdfA4Url: true },
                        });

                        if (orderWithLyrics?.hasLyrics && !orderWithLyrics.lyricsPdfA4Url) {
                            await enqueuePdfGeneration(updatedOrder.id, "low");
                            console.log(`📄 [Suno] Queued PDF generation for order ${updatedOrder.id}`);
                        }
                    } catch (pdfErr) {
                        console.error(`⚠️ [Suno] Failed to queue PDF for order ${updatedOrder.id}:`, pdfErr);
                    }

                    // Auto-trigger karaoke if pre-purchased (best-effort)
                    try {
                        const karaokeChild = await db.songOrder.findFirst({
                            where: {
                                parentOrderId: updatedOrder.id,
                                orderType: "KARAOKE_UPSELL",
                                status: { in: ["PAID", "IN_PROGRESS"] },
                            },
                            select: { id: true, kieTaskId: true, kieAudioId1: true, kieAudioId2: true },
                        });

                        if (karaokeChild) {
                            const parentWithKie = await db.songOrder.findUnique({
                                where: { id: updatedOrder.id },
                                select: { songFileUrl: true, kieTaskId: true, kieAudioId1: true, kieAudioId2: true },
                            });

                            if (parentWithKie?.songFileUrl && parentWithKie.kieTaskId && parentWithKie.kieAudioId1) {
                                await db.songOrder.update({
                                    where: { id: karaokeChild.id },
                                    data: {
                                        kieTaskId: parentWithKie.kieTaskId,
                                        kieAudioId1: parentWithKie.kieAudioId1,
                                        kieAudioId2: parentWithKie.kieAudioId2,
                                    },
                                });
                                const { enqueueKaraokeGeneration } = await import("../queues/karaoke-generation");
                                await enqueueKaraokeGeneration({
                                    orderId: karaokeChild.id,
                                    parentOrderId: updatedOrder.id,
                                    songFileUrl: parentWithKie.songFileUrl,
                                    kieTaskId: parentWithKie.kieTaskId,
                                    kieAudioId: parentWithKie.kieAudioId1,
                                    kieAudioId2: parentWithKie.kieAudioId2 ?? undefined,
                                });
                                console.log(`🎤 [Suno] Auto-triggered karaoke generation for pre-purchased upsell ${karaokeChild.id}`);
                            }
                        }
                    } catch (karaokeErr) {
                        console.error(`⚠️ [Suno] Failed to auto-trigger karaoke for order ${updatedOrder.id}:`, karaokeErr);
                    }

                    // Send email separately (best-effort, does not block status)
                    if (!emailSuppressed) {
                        try {
                            const trackOrderUrl = new URL(
                                `/${updatedOrder.locale}/track-order?email=${encodeURIComponent(updatedOrder.email)}`,
                                SITE_URL
                            ).toString();

                            const email = buildAutoDeliveryEmail({
                                orderId: updatedOrder.id,
                                recipientName: updatedOrder.recipientName,
                                customerEmail: updatedOrder.email,
                                locale: updatedOrder.locale,
                                trackOrderUrl,
                                songFileUrl: updatedOrder.songFileUrl,
                                songFileUrl2: updatedOrder.songFileUrl2,
                            });

                            await executeWithSmtpRetry({
                                operationName: `[Suno] auto-delivery -> ${updatedOrder.email}`,
                                operation: () => transporter.sendMail({
                                    from: SMTP_FROM,
                                    to: updatedOrder.email,
                                    subject: email.subject,
                                    html: email.html,
                                    text: email.text,
                                }),
                            });

                            try {
                                await db.sentEmail.create({
                                    data: {
                                        recipient: updatedOrder.email,
                                        subject: email.subject,
                                        template: "SONG_DELIVERY_AUTO",
                                        orderId: updatedOrder.id,
                                        metadata: { autoDelivery: true, expressOrder: isExpressOrder, source: "suno-r2" },
                                        status: "SENT",
                                    },
                                });
                            } catch (logErr) {
                                console.error("[Suno] Failed to log sent email:", logErr);
                            }

                            console.log(`📧 [Suno] Auto-delivery email sent for order ${updatedOrder.id} (${updatedOrder.email})`);
                        } catch (emailError) {
                            const errorMessage = emailError instanceof Error ? emailError.message : "Unknown email error";
                            console.error(`❌ [Suno] Auto-delivery email failed for order ${updatedOrder.id} (status already COMPLETED):`, emailError);

                            try {
                                await db.sentEmail.create({
                                    data: {
                                        recipient: updatedOrder.email,
                                        subject: `Auto-delivery failed (${updatedOrder.id})`,
                                        template: "SONG_DELIVERY_AUTO",
                                        orderId: updatedOrder.id,
                                        metadata: { autoDelivery: true, expressOrder: isExpressOrder, source: "suno-r2" },
                                        status: "FAILED",
                                        error: errorMessage,
                                    },
                                });
                            } catch (logErr) {
                                console.error("[Suno] Failed to log failed email:", logErr);
                            }
                        }
                    } else {
                        console.log(`📧 [Suno] Email suppressed for order ${updatedOrder.id}, status already COMPLETED`);
                    }
                }
            } else if (updatedOrder.email && !updatedOrder.songDeliveredAt && !hasTwoSongs) {
                console.warn(`⚠️ [Suno] Auto-delivery skipped for order ${updatedOrder.id}: missing song option`);
            } else if (!updatedOrder.email && !updatedOrder.songDeliveredAt && hasTwoSongs) {
                console.warn(`⚠️ [Suno] Auto-delivery skipped for order ${updatedOrder.id}: missing email`);
            }

            await sendSunoGenerationAlert({
                orderId,
                recipientName,
                genre: getGenreDisplayName(genre),
                success: true,
                songsGenerated: result.songs.length,
                creditsRemaining: result.creditsRemaining,
                customerEmail,
                customerWhatsApp,
            });

            console.log(`✅ [Suno] Song generation completed for order ${orderId} via ${generationSource}. ${uploadedCount} uploaded, ${songsAvailable} disponível.`);

            return {
                success: true,
                songUrl1: updatedOrder.songFileUrl ?? undefined,
                songUrl2: updatedOrder.songFileUrl2 ?? undefined,
                creditsRemaining: result.creditsRemaining,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`❌ [Suno] Song generation failed for order ${orderId}:`, errorMessage);
            await sendFailureAlert(errorMessage);

            // Reset browser context on error for next attempt
            await resetContext();
            throw error;
        }
    },
    {
        connection,
        concurrency: SUNO_WORKER_CONCURRENCY,
        lockDuration: 15 * 60 * 1000,
        limiter: {
            max: KIE_RATE_LIMIT_MAX,
            duration: KIE_RATE_LIMIT_WINDOW_MS,
        },
    }
);

sunoGenerationWorker.on("completed", (job) => {
    console.log(`✅ [Suno] Worker completed for order ${job.data.orderId}`);
});

sunoGenerationWorker.on("failed", (job, error) => {
    console.error(
        `❌ [Suno] Worker failed for order ${job?.data.orderId ?? "unknown"}:`,
        error.message
    );
    void scheduleSunoRetryAfterFinalFailure(job).catch((retryError) => {
        console.error(
            `❌ [Suno] Retry-after-failure scheduling crashed for ${job?.data.orderId ?? "unknown"}:`,
            retryError
        );
    });
});

sunoGenerationWorker.on("ready", () => {
    void connection.set(SUNO_WORKER_STARTED_AT_KEY, Date.now().toString()).catch((error) => {
        console.warn("⚠️ [Suno] Failed to persist worker start time:", error);
    });
    startSunoWorkerHeartbeat();
    startSunoRetrySweep();
    console.log(
        `🎵 Suno generation worker started and ready (concurrency: ${SUNO_WORKER_CONCURRENCY}, limiter: ${KIE_RATE_LIMIT_MAX}/${Math.round(KIE_RATE_LIMIT_WINDOW_MS / 1000)}s, utilization: ${Math.round(KIE_RATE_LIMIT_UTILIZATION * 100)}% of ${KIE_PROVIDER_RATE_LIMIT_MAX})`
    );
});

const shutdown = async () => {
    console.log("Shutting down Suno worker...");

    stopSunoWorkerHeartbeat();
    stopSunoRetrySweep();
    await sunoGenerationWorker.close();
    await closeBrowser();
    await connection.quit();
    await db.$disconnect();

    console.log("Suno worker shut down successfully");
};

process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
});
