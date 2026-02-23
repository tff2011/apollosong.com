import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { db } from "~/server/db";
import { buildAutoDeliveryEmail } from "~/server/email/auto-delivery";
import { sendEmail } from "~/server/email/mailer";
import { enqueuePdfGeneration } from "~/server/queues/pdf-generation";
import { sendSunoGenerationAlert } from "~/lib/telegram";
import { GENRE_NAMES } from "~/lib/lyrics-generator";
import { formatDelayShort, getSunoAutomationDelayMs } from "~/server/services/suno/automation-delay";
import { normalizeVocals } from "~/lib/vocals";
import { requireAdminApiAccess } from "~/server/auth/admin-api";

// Check if we're in local mode (can run Playwright directly)
const IS_LOCAL_MODE = process.env.SUNO_LOCAL_MODE === "true";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
const SUNO_GENERATABLE_ORDER_TYPES = ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] as const;

type SunoProcessLockState = {
    locked: boolean;
    startedAt: number;
    orderId: string | null;
};

// Prevent concurrent Suno runs inside the same Next.js server process.
// Without this, one request can close the shared Playwright context while another is still running,
// leading to errors like: "Target page, context or browser has been closed".
const SUNO_PROCESS_LOCK_TTL_MS = 25 * 60 * 1000; // Keep generous: generation+download can take a while
const globalForSuno = globalThis as unknown as { __HS_SUNO_PROCESS_LOCK?: SunoProcessLockState };

function getSunoProcessLock(): SunoProcessLockState {
    if (!globalForSuno.__HS_SUNO_PROCESS_LOCK) {
        globalForSuno.__HS_SUNO_PROCESS_LOCK = { locked: false, startedAt: 0, orderId: null };
    }
    return globalForSuno.__HS_SUNO_PROCESS_LOCK;
}

function tryAcquireSunoProcessLock(orderId: string): { ok: true } | { ok: false; message: string } {
    const lock = getSunoProcessLock();
    if (lock.locked) {
        const ageMs = Date.now() - (lock.startedAt || 0);
        if (ageMs < SUNO_PROCESS_LOCK_TTL_MS) {
            const runningForSec = Math.max(0, Math.round(ageMs / 1000));
            return {
                ok: false,
                message: `Suno automation already running (order ${lock.orderId ?? "unknown"}, ${runningForSec}s). Try again shortly.`,
            };
        }

        // Stale lock (previous run crashed/hung). Release it.
        console.warn(`[API] Releasing stale Suno process lock (order ${lock.orderId ?? "unknown"})`);
        lock.locked = false;
        lock.startedAt = 0;
        lock.orderId = null;
    }

    lock.locked = true;
    lock.startedAt = Date.now();
    lock.orderId = orderId;
    return { ok: true };
}

function releaseSunoProcessLock(orderId: string) {
    const lock = getSunoProcessLock();
    if (!lock.locked) return;
    // Only release if it matches; avoid clearing a newer run's lock.
    if (lock.orderId && lock.orderId !== orderId) return;
    lock.locked = false;
    lock.startedAt = 0;
    lock.orderId = null;
}

async function releaseLocalSunoClaimOnFailure(params: {
    orderId: string;
    sunoAccountEmail: string | null;
}) {
    try {
        const where: Prisma.SongOrderWhereInput = {
            id: params.orderId,
            status: "IN_PROGRESS",
            songFileUrl: null,
            songFileUrl2: null,
            ...(params.sunoAccountEmail ? { sunoAccountEmail: params.sunoAccountEmail } : {}),
        };

        const result = await db.songOrder.updateMany({
            where,
            data: {
                status: "PAID",
                sunoAccountEmail: null,
            },
        });

        if (result.count > 0) {
            console.warn(`[API] Released Suno claim and reset order ${params.orderId} to PAID after failure`);
        }
    } catch (error) {
        console.error(`[API] Failed to release Suno claim for order ${params.orderId}:`, error);
    }
}

/**
 * Extract email from Suno auth state file without starting browser
 */
function extractEmailFromAuthState(authStateContent: string): string | null {
    try {
        const state = JSON.parse(authStateContent);
        const cookies = state.cookies || [];

        // Find the __session cookie for .suno.com domain
        const sessionCookie = cookies.find((c: { name: string; domain: string; value: string }) =>
            c.name === "__session" && c.domain === ".suno.com"
        );

        if (!sessionCookie?.value) {
            return null;
        }

        // JWT is in format: header.payload.signature
        const parts = sessionCookie.value.split(".");
        if (parts.length !== 3) {
            return null;
        }

        // Decode the payload (base64url)
        const payload = Buffer.from(parts[1]!, "base64url").toString("utf-8");
        const claims = JSON.parse(payload);

        // Extract email from claims
        return claims["suno.com/claims/email"] || claims["https://suno.ai/claims/email"] || null;
    } catch {
        return null;
    }
}

function getSunoAccountEmailFromAuthState(): string | null {
    const stateJson = process.env.SUNO_AUTH_STATE_JSON;
    if (stateJson) {
        try {
            const decoded = Buffer.from(stateJson, "base64").toString("utf-8");
            return extractEmailFromAuthState(decoded);
        } catch {
            return null;
        }
    }

    const authStatePath = process.env.SUNO_AUTH_STATE_PATH
        ? path.resolve(process.env.SUNO_AUTH_STATE_PATH)
        : path.join(process.cwd(), "suno-auth-state.json");

    if (!fs.existsSync(authStatePath)) {
        return null;
    }

    const authStateContent = fs.readFileSync(authStatePath, "utf-8");
    return extractEmailFromAuthState(authStateContent);
}

// Helper to get genre display name
function getGenreName(genre: string): string {
    return GENRE_NAMES[genre]?.pt || genre;
}

function isSunoGeneratableOrderType(orderType: string): boolean {
    return SUNO_GENERATABLE_ORDER_TYPES.includes(orderType as typeof SUNO_GENERATABLE_ORDER_TYPES[number]);
}

export async function POST(request: Request) {
    const access = await requireAdminApiAccess("LEADS");
    if (!access.ok) {
        return access.response;
    }

    let orderIdForError: string | undefined;
    let lockOrderId: string | null = null;
    let sunoAccountEmailFromState: string | null = null;

    try {
        const body = await request.json() as { orderId: string; forceImmediate?: boolean };
        orderIdForError = body.orderId;
        const { orderId } = body;
        const forceImmediate = body.forceImmediate === true;

        if (!orderId) {
            return NextResponse.json({ error: "orderId required" }, { status: 400 });
        }

        // Get order
        const order = await db.songOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                orderType: true,
                recipientName: true,
                genre: true,
                locale: true,
                vocals: true,
                lyrics: true,
                lyricsStatus: true,
                songFileUrl: true,
                songFileUrl2: true,
                email: true,
                hasFastDelivery: true,
                planType: true,
                createdAt: true,
                paymentCompletedAt: true,
                songDeliveredAt: true,
                hasLyrics: true,
                lyricsPdfA4Url: true,
                sunoAccountEmail: true,
                parentOrder: {
                    select: {
                        hasFastDelivery: true,
                        planType: true,
                    },
                },
            },
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (!isSunoGeneratableOrderType(order.orderType)) {
            return NextResponse.json(
                { error: `Order type ${order.orderType} is not eligible for Suno generation` },
                { status: 400 }
            );
        }

        if (!order.lyrics || order.lyricsStatus !== "completed") {
            return NextResponse.json({ error: "Lyrics not ready" }, { status: 400 });
        }

        const isTurboOrder = Boolean(
            order.planType === "acelerado" ||
            order.parentOrder?.planType === "acelerado"
        );
        const isExpressOrder = Boolean(
            order.hasFastDelivery ||
            order.planType === "express" ||
            order.planType === "acelerado" ||
            order.parentOrder?.hasFastDelivery ||
            order.parentOrder?.planType === "express" ||
            order.parentOrder?.planType === "acelerado"
        );
        const automationDelayMs = getSunoAutomationDelayMs({
            isExpressOrder,
            planType: order.planType,
            parentPlanType: order.parentOrder?.planType,
            paymentCompletedAt: order.paymentCompletedAt,
            createdAt: order.createdAt,
        });

        if (order.songFileUrl && order.songFileUrl2) {
            const songUrls = [order.songFileUrl, order.songFileUrl2];
            let deliverySent = Boolean(order.songDeliveredAt);
            let deliveryError: string | null = null;

            if (order.email && !order.songDeliveredAt) {
                const deliveredAt = new Date();
                await db.songOrder.update({
                    where: { id: order.id },
                    data: {
                        status: "COMPLETED",
                        songDeliveredAt: deliveredAt,
                    },
                });

                await db.songOrder.updateMany({
                    where: {
                        parentOrderId: order.id,
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

                if (order.hasLyrics && !order.lyricsPdfA4Url) {
                    try {
                        await enqueuePdfGeneration(order.id, "low");
                    } catch (pdfError) {
                        console.error(`⚠️ [API] Failed to queue PDF for order ${order.id}:`, pdfError);
                    }
                }

                try {
                    const trackOrderUrl = new URL(
                        `/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`,
                        SITE_URL
                    ).toString();

                    const email = buildAutoDeliveryEmail({
                        orderId: order.id,
                        recipientName: order.recipientName,
                        customerEmail: order.email,
                        locale: order.locale,
                        trackOrderUrl,
                        songFileUrl: order.songFileUrl,
                        songFileUrl2: order.songFileUrl2,
                    });

                    await sendEmail({
                        to: order.email,
                        subject: email.subject,
                        html: email.html,
                        text: email.text,
                        template: "SONG_DELIVERY_AUTO",
                        orderId: order.id,
                        metadata: { autoDelivery: true, expressOrder: isExpressOrder, source: "suno-r2" },
                    });

                    deliverySent = true;
                } catch (error) {
                    deliveryError = error instanceof Error ? error.message : "Unknown delivery error";
                    console.error(`❌ [API] Auto-delivery failed for order ${order.id} (status already COMPLETED):`, error);
                }
            } else if (!order.email && !order.songDeliveredAt) {
                deliveryError = "missing email";
            }

            return NextResponse.json({
                success: true,
                orderId,
                songsGenerated: 0,
                songsUploaded: 0,
                songsAvailable: 2,
                songUrls,
                deliverySent,
                deliveryError,
                sunoAccountEmail: order.sunoAccountEmail ?? null,
                mode: IS_LOCAL_MODE ? "local" : "queue",
            });
        }

        // PRODUCTION: Enqueue to BullMQ (worker processes with Playwright)
        if (!IS_LOCAL_MODE) {
            const { enqueueSunoGeneration } = await import("~/server/queues/suno-generation");

            const expressPriority = 1;
            const standardPriority = 5;
            const delay = forceImmediate ? 0 : automationDelayMs;
            const priority = forceImmediate ? 1 : (isExpressOrder ? expressPriority : standardPriority);

            try {
                await enqueueSunoGeneration({
                    orderId: order.id,
                    lyrics: order.lyrics,
                    genre: order.genre,
                    locale: order.locale,
                    vocals: normalizeVocals(order.vocals),
                    recipientName: order.recipientName,
                }, {
                    priority,
                    delay,
                    lifo: forceImmediate,
                    forceRequeue: forceImmediate,
                });
            } catch (error) {
                if (error instanceof Error && error.message.includes("already exists")) {
                    return NextResponse.json({
                        success: true,
                        orderId,
                        message: forceImmediate
                            ? "Job already running/queued with immediate priority"
                            : "Job already enqueued",
                        delayMs: delay,
                        mode: "queue",
                    });
                }
                throw error;
            }

            return NextResponse.json({
                success: true,
                orderId,
                message: forceImmediate
                    ? "Job prioritized for immediate processing"
                    : "Job enqueued for processing",
                delayMs: delay,
                mode: "queue",
            });
        }

        // LOCAL MODE: enforce the configured delay window for plan-based orders.
        if (automationDelayMs > 0 && !forceImmediate) {
            const delayLabel = isTurboOrder ? "6h" : isExpressOrder ? "24h" : "7d";
            return NextResponse.json({
                success: false,
                error: `Plano ${delayLabel}: aguardando janela de automacao apos pagamento. Faltam ${formatDelayShort(automationDelayMs)}.`,
                delayMs: automationDelayMs,
            }, { status: 425 });
        }

        // LOCAL MODE: claim the order for this Suno account to avoid duplicate processing
        // Also guard against concurrent runs in this server process (shared Playwright context).
        const lockAttempt = tryAcquireSunoProcessLock(order.id);
        if (!lockAttempt.ok) {
            return NextResponse.json({ error: lockAttempt.message }, { status: 429 });
        }
        lockOrderId = order.id;

        sunoAccountEmailFromState = getSunoAccountEmailFromAuthState();
        if (sunoAccountEmailFromState) {
            const claimResult = await db.songOrder.updateMany({
                where: {
                    id: order.id,
                    AND: [
                        {
                            OR: [
                                { songFileUrl: null },
                                { songFileUrl2: null },
                            ],
                        },
                        {
                            OR: [
                                { sunoAccountEmail: null },
                                { sunoAccountEmail: sunoAccountEmailFromState },
                            ],
                        },
                        {
                            status: { in: ["PAID", "IN_PROGRESS"] },
                        },
                    ],
                },
                data: {
                    sunoAccountEmail: sunoAccountEmailFromState,
                    status: "IN_PROGRESS",
                },
            });

            if (claimResult.count === 0) {
                return NextResponse.json({
                    error: "Order already claimed by another Suno account",
                }, { status: 409 });
            }
        } else {
            console.warn("[API] Suno account email not found in auth state; skipping claim lock");
        }

        // LOCAL MODE: Run Playwright directly (for testing)
        const { generateSongs, closeBrowser, getSunoAccountEmail } = await import("~/server/services/suno");
        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

        // S3 client for R2
        const s3Client = new S3Client({
            region: "auto",
            endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
            },
        });

        console.log(`[API] Starting Suno generation for order ${orderId} (LOCAL MODE)`);

        // Generate songs
        const result = await generateSongs({
            orderId: order.id,
            lyrics: order.lyrics,
            genre: order.genre,
            locale: order.locale,
            vocals: normalizeVocals(order.vocals),
            recipientName: order.recipientName,
        });

        if (!result.success || result.songs.length === 0) {
            const errorMsg = result.error || "No songs generated";
            console.error(`[API] ❌ Suno generation FAILED for order ${orderId}: ${errorMsg}`);

            // Send Telegram alert for failure
            await sendSunoGenerationAlert({
                orderId: order.id,
                recipientName: order.recipientName,
                genre: getGenreName(order.genre),
                success: false,
                error: errorMsg,
                creditsRemaining: result.creditsRemaining,
            });

            await releaseLocalSunoClaimOnFailure({
                orderId: order.id,
                sunoAccountEmail: sunoAccountEmailFromState,
            });

            await closeBrowser();
            return NextResponse.json({
                success: false,
                error: errorMsg,
                creditsRemaining: result.creditsRemaining,
            }, { status: 500 });
        }

        // Upload songs to R2 (only fill missing slots)
        const missingSlots: number[] = [];
        if (!order.songFileUrl) missingSlots.push(1);
        if (!order.songFileUrl2) missingSlots.push(2);

        const uploadsBySlot: Array<{ url: string; key: string } | null> = [null, null];
        let songIndex = 0;

        for (const slot of missingSlots) {
            const song = result.songs[songIndex];
            if (!song) break;

            const key = `songs/${order.id}/song-${slot}.mp3`;
            await s3Client.send(
                new PutObjectCommand({
                    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
                    Key: key,
                    Body: song.mp3Buffer,
                    ContentType: "audio/mpeg",
                })
            );
            const url = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
            uploadsBySlot[slot - 1] = { url, key };
            console.log(`[API] Uploaded song for slot ${slot}: ${url}`);
            songIndex += 1;
        }

        const uploadedCount = uploadsBySlot.filter(Boolean).length;

        // Update database
        console.log(`[API] Updating order ${orderId} with ${uploadedCount} song URLs, setting status to IN_PROGRESS`);
        const sunoAccountEmail = getSunoAccountEmail();
        const uploadedAt = new Date();
        const updateData = {
            status: "IN_PROGRESS" as const,
            sunoAccountEmail,
            ...(uploadsBySlot[0]
                ? {
                    songFileUrl: uploadsBySlot[0].url,
                    songFileKey: uploadsBySlot[0].key,
                    songUploadedAt: uploadedAt,
                }
                : {}),
            ...(uploadsBySlot[1]
                ? {
                    songFileUrl2: uploadsBySlot[1].url,
                    songFileKey2: uploadsBySlot[1].key,
                    songUploadedAt2: uploadedAt,
                }
                : {}),
        };

        const updatedOrder = await db.songOrder.update({
            where: { id: orderId },
            data: updateData,
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
                hasLyrics: true,
                lyricsPdfA4Url: true,
                parentOrder: {
                    select: {
                        hasFastDelivery: true,
                        planType: true,
                    },
                },
            },
        });

        const isExpressOrderForDelivery = Boolean(
            updatedOrder.hasFastDelivery ||
            updatedOrder.planType === "express" ||
            updatedOrder.planType === "acelerado" ||
            updatedOrder.parentOrder?.hasFastDelivery ||
            updatedOrder.parentOrder?.planType === "express" ||
            updatedOrder.parentOrder?.planType === "acelerado"
        );
        const songsAvailable = [updatedOrder.songFileUrl, updatedOrder.songFileUrl2].filter(Boolean).length;
        const hasTwoSongs = songsAvailable >= 2;
        const songUrls = [updatedOrder.songFileUrl, updatedOrder.songFileUrl2].filter(Boolean) as string[];

        let deliverySent = false;
        let deliveryError: string | null = null;

        if (updatedOrder.email && !updatedOrder.songDeliveredAt && hasTwoSongs) {
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

            if (updatedOrder.hasLyrics && !updatedOrder.lyricsPdfA4Url) {
                try {
                    await enqueuePdfGeneration(updatedOrder.id, "low");
                } catch (pdfError) {
                    console.error(`⚠️ [API] Failed to queue PDF for order ${updatedOrder.id}:`, pdfError);
                }
            }

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

                await sendEmail({
                    to: updatedOrder.email,
                    subject: email.subject,
                    html: email.html,
                    text: email.text,
                    template: "SONG_DELIVERY_AUTO",
                    orderId: updatedOrder.id,
                    metadata: { autoDelivery: true, expressOrder: isExpressOrderForDelivery, source: "suno-r2" },
                });

                deliverySent = true;
                console.log(`✅ [API] Auto-delivery sent for order ${updatedOrder.id} (${updatedOrder.email})`);
            } catch (error) {
                deliveryError = error instanceof Error ? error.message : "Unknown delivery error";
                console.error(`❌ [API] Auto-delivery failed for order ${updatedOrder.id} (status already COMPLETED):`, error);
            }
        } else if (updatedOrder.email && !updatedOrder.songDeliveredAt && !hasTwoSongs) {
            console.warn(`⚠️ [API] Auto-delivery skipped for order ${updatedOrder.id}: missing song option`);
        } else if (!updatedOrder.email && !updatedOrder.songDeliveredAt && hasTwoSongs) {
            console.warn(`⚠️ [API] Auto-delivery skipped for order ${updatedOrder.id}: missing email`);
        }

        console.log(`[API] ✅ Order ${orderId} updated. Songs disponíveis: ${songsAvailable}. Auto-delivery: ${deliverySent ? "sent" : "pending"}`);

        // Send success alert to Telegram
        await sendSunoGenerationAlert({
            orderId: order.id,
            recipientName: order.recipientName,
            genre: getGenreName(order.genre),
            success: true,
            songsGenerated: result.songs.length,
            creditsRemaining: result.creditsRemaining,
        });

        // Close browser after processing
        await closeBrowser();

        return NextResponse.json({
            success: true,
            orderId,
            songsGenerated: result.songs.length,
            songsUploaded: uploadedCount,
            songsAvailable,
            songUrls,
            creditsRemaining: result.creditsRemaining,
            deliverySent,
            deliveryError,
            sunoAccountEmail,
            mode: "local",
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        const errorStack = error instanceof Error ? error.stack : "";

        console.error(`[API] ❌ Suno process EXCEPTION:`, {
            error: errorMsg,
            stack: errorStack,
            orderId: orderIdForError,
        });

        // Try to get order info for telegram alert
        try {
            if (orderIdForError) {
                const order = await db.songOrder.findUnique({
                    where: { id: orderIdForError },
                    select: { id: true, recipientName: true, genre: true },
                });

                if (order) {
                    await sendSunoGenerationAlert({
                        orderId: order.id,
                        recipientName: order.recipientName,
                        genre: getGenreName(order.genre),
                        success: false,
                        error: `Exception: ${errorMsg}`,
                    });
                }
            }
        } catch (alertError) {
            console.error("[API] Failed to send error alert:", alertError);
        }

        // Try to close browser on error (only in local mode)
        if (IS_LOCAL_MODE) {
            if (orderIdForError) {
                await releaseLocalSunoClaimOnFailure({
                    orderId: orderIdForError,
                    sunoAccountEmail: sunoAccountEmailFromState,
                });
            }

            try {
                const { closeBrowser } = await import("~/server/services/suno");
                await closeBrowser();
            } catch { }
        }

        return NextResponse.json(
            { error: errorMsg },
            { status: 500 }
        );
    } finally {
        if (lockOrderId) {
            try {
                releaseSunoProcessLock(lockOrderId);
            } catch {
                // ignore
            }
        }
    }
}
