import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { getSunoAutomationDelayMs } from "~/server/services/suno/automation-delay";
import { normalizeVocals } from "~/lib/vocals";
import { redisConnection } from "~/server/queues/redis";
import { sunoGenerationQueue } from "~/server/queues/suno-generation";
import * as fs from "fs";
import * as path from "path";
import { requireAdminApiAccess } from "~/server/auth/admin-api";

// For local testing - process directly without Redis/BullMQ
const USE_LOCAL_MODE = process.env.SUNO_LOCAL_MODE === "true";
const SUNO_WORKER_STARTED_AT_KEY = "suno:worker:started-at";
const SUNO_WORKER_HEARTBEAT_KEY = "suno:worker:heartbeat";
const FALLBACK_METRICS_WINDOW_MS = 24 * 60 * 60 * 1000;
const LAST_HOUR_MS = 60 * 60 * 1000;
const WORKER_HEARTBEAT_STALE_MS = 2 * 60 * 1000;
const EXPRESS_PRIORITY = 1;
const STANDARD_PRIORITY = 5;
const SUNO_GENERATABLE_ORDER_TYPES = ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] as const;

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
const SUNO_WORKER_CONCURRENCY = Math.max(
    1,
    Math.min(
        parsePositiveIntEnv(process.env.KIE_SUNO_WORKER_CONCURRENCY, KIE_RATE_LIMIT_MAX),
        KIE_RATE_LIMIT_MAX
    )
);

function parseWorkerStartedAt(value: string | null): Date | null {
    if (!value) return null;

    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
        const fromMs = new Date(asNumber);
        return Number.isFinite(fromMs.getTime()) ? fromMs : null;
    }

    const fromDate = new Date(value);
    return Number.isFinite(fromDate.getTime()) ? fromDate : null;
}

function normalizePlanType(value: string | null | undefined): string {
    return String(value || "").trim().toLowerCase();
}

function isSunoGeneratableOrderType(orderType: string): boolean {
    return SUNO_GENERATABLE_ORDER_TYPES.includes(orderType as typeof SUNO_GENERATABLE_ORDER_TYPES[number]);
}

function isExpressOrder(order: {
    hasFastDelivery?: boolean;
    planType?: string | null;
    parentOrder?: { hasFastDelivery?: boolean; planType?: string | null } | null;
}): boolean {
    const planType = normalizePlanType(order.planType);
    const parentPlanType = normalizePlanType(order.parentOrder?.planType);
    return Boolean(
        order.hasFastDelivery ||
        planType === "express" ||
        planType === "acelerado" ||
        order.parentOrder?.hasFastDelivery ||
        parentPlanType === "express" ||
        parentPlanType === "acelerado"
    );
}

function getQueueSortData(order: {
    hasFastDelivery?: boolean;
    planType?: string | null;
    parentOrder?: { hasFastDelivery?: boolean; planType?: string | null } | null;
    paymentCompletedAt: Date | null;
    createdAt: Date;
}, now: Date) {
    const express = isExpressOrder(order);
    const priority = express ? EXPRESS_PRIORITY : STANDARD_PRIORITY;
    const delay = getSunoAutomationDelayMs({
        isExpressOrder: express,
        planType: order.planType,
        parentPlanType: order.parentOrder?.planType,
        paymentCompletedAt: order.paymentCompletedAt,
        createdAt: order.createdAt,
        now,
    });
    const paidAtMs = (order.paymentCompletedAt ?? order.createdAt).getTime();
    return { delay, priority, paidAtMs };
}

function extractOrderIdFromQueueJob(job: { id?: string | number | null; data?: unknown }): string | null {
    const data = job.data as { orderId?: unknown } | undefined;
    if (typeof data?.orderId === "string" && data.orderId.trim()) {
        return data.orderId.trim();
    }

    const rawId = String(job.id ?? "").trim();
    if (!rawId) return null;
    if (rawId.startsWith("suno_")) {
        const orderId = rawId.slice("suno_".length).trim();
        return orderId || null;
    }
    return null;
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

type SunoOrder = {
    id: string;
    orderType: string;
    email: string;
    recipientName: string;
    genre: string;
    locale: string;
    vocals: string;
    lyrics: string | null;
    lyricsStatus: string | null;
    songFileUrl: string | null;
    songFileUrl2?: string | null;
    status: string;
    sunoAccountEmail?: string | null;
    hasFastDelivery?: boolean;
    planType?: string | null;
    parentOrder?: { hasFastDelivery: boolean; planType: string | null } | null;
    createdAt: Date;
    paymentCompletedAt: Date | null;
};

type RecentSunoOrder = {
    id: string;
    recipientName: string;
    email: string;
    locale: string;
    sunoAccountEmail: string | null;
    processedAt: string;
    songsGenerated: number;
    deliverySent: boolean;
};

type SunoAutomationMetrics = {
    workerStartedAt: string | null;
    workerHeartbeatAt: string | null;
    workerOnline: boolean;
    workerState: "offline" | "idle" | "processing";
    runtimeHours: number;
    songsGenerated: number;
    avgSongsPerHour: number;
    usingEstimatedWindow: boolean;
    lastHourSuccessCount: number;
    lastHourFailureCount: number;
    parallelActive: number;
    parallelLimit: number;
    queueWaiting: number;
    queueDelayed: number;
};

export async function POST(request: Request) {
    const access = await requireAdminApiAccess("LEADS");
    if (!access.ok) {
        return access.response;
    }

    try {
        const body = await request.json() as { orderId?: string; processAll?: boolean };
        const { orderId, processAll } = body;

        // Find orders to process
        let orders: SunoOrder[] = [];
        if (orderId) {
            // Process specific order
            const order = await db.songOrder.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    orderType: true,
                    email: true,
                    recipientName: true,
                    genre: true,
                    locale: true,
                    vocals: true,
                    lyrics: true,
                    lyricsStatus: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    status: true,
                    sunoAccountEmail: true,
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
            });
            if (order && !isSunoGeneratableOrderType(order.orderType)) {
                return NextResponse.json({
                    error: `Order type ${order.orderType} is not eligible for Suno generation`,
                }, { status: 400 });
            }
            orders = order ? [order] : [];
        } else if (processAll) {
            // Find all paid orders without songs but with completed lyrics
            const sunoAccountEmail = getSunoAccountEmailFromAuthState();
            const accountFilter = sunoAccountEmail
                ? {
                    OR: [
                        { sunoAccountEmail: null },
                        { sunoAccountEmail },
                    ],
                }
                : null;

            orders = await db.songOrder.findMany({
                where: {
                    AND: [
                        {
                            status: { in: ["PAID", "IN_PROGRESS"] },
                            orderType: { in: [...SUNO_GENERATABLE_ORDER_TYPES] },
                            lyricsStatus: "completed",
                            lyrics: { not: null },
                        },
                        {
                            OR: [
                                { songFileUrl: null },
                                { songFileUrl2: null },
                            ],
                        },
                        ...(accountFilter ? [accountFilter] : []),
                    ],
                },
                select: {
                    id: true,
                    orderType: true,
                    email: true,
                    recipientName: true,
                    genre: true,
                    locale: true,
                    vocals: true,
                    lyrics: true,
                    lyricsStatus: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    status: true,
                    sunoAccountEmail: true,
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
                orderBy: [
                    { hasFastDelivery: "desc" },      // 24h delivery first
                    { paymentCompletedAt: "asc" },    // then by oldest payment (most delayed first)
                ],
            });
        } else {
            return NextResponse.json({ error: "orderId or processAll required" }, { status: 400 });
        }

        if (orders.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No orders to process",
                processed: 0
            });
        }

        if (USE_LOCAL_MODE) {
            // Local mode: return orders to process, frontend will trigger individually
            return NextResponse.json({
                success: true,
                mode: "local",
                orders: orders.map(o => ({
                    id: o.id,
                    recipientName: o.recipientName,
                    genre: o.genre,
                    status: o.status,
                    lyricsStatus: o.lyricsStatus,
                    hasLyrics: !!o.lyrics,
                    hasSong: Boolean(o.songFileUrl || o.songFileUrl2),
                    sunoAccountEmail: o.sunoAccountEmail ?? null,
                })),
            });
        } else {
            // Production mode: enqueue to BullMQ
            const { enqueueSunoGeneration } = await import("~/server/queues/suno-generation");

            const enqueued: string[] = [];
            const now = new Date();

            const candidates = orders
                .filter((order) => isSunoGeneratableOrderType(order.orderType) && Boolean(order.lyrics))
                .map((order) => {
                    const sort = getQueueSortData(order, now);
                    return { order, ...sort };
                });

            const orderedCandidates = candidates
                .sort((a, b) => (
                    a.delay - b.delay ||
                    a.priority - b.priority ||
                    a.paidAtMs - b.paidAtMs
                ));

            const tryEnqueue = async (c: typeof candidates[number]) => {
                const order = c.order;
                if (!order.lyrics) return false;

                try {
                    await enqueueSunoGeneration({
                        orderId: order.id,
                        lyrics: order.lyrics,
                        genre: order.genre,
                        locale: order.locale,
                        vocals: normalizeVocals(order.vocals),
                        recipientName: order.recipientName,
                    }, { priority: c.priority, delay: c.delay });
                    enqueued.push(order.id);
                    return true;
                } catch (error) {
                    // Idempotency: allow re-triggering without blowing up if the job already exists.
                    if (error instanceof Error && error.message.includes("already exists")) {
                        return false;
                    }
                    throw error;
                }
            };

            for (const c of orderedCandidates) {
                await tryEnqueue(c);
            }

            return NextResponse.json({
                success: true,
                mode: "queue",
                enqueued,
                message: `${enqueued.length} orders enqueued for processing`,
            });
        }
    } catch (error) {
        console.error("Suno trigger error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

export async function GET() {
    const access = await requireAdminApiAccess("LEADS");
    if (!access.ok) {
        return access.response;
    }

    // Get pending orders summary
    const sunoAccountEmail = getSunoAccountEmailFromAuthState();
    const accountFilter = sunoAccountEmail
        ? {
            OR: [
                { sunoAccountEmail: null },
                { sunoAccountEmail },
            ],
        }
        : null;

    const pendingOrdersRaw = await db.songOrder.findMany({
        where: {
            AND: [
                {
                    status: { in: ["PAID", "IN_PROGRESS"] },
                    orderType: { in: [...SUNO_GENERATABLE_ORDER_TYPES] },
                    lyricsStatus: "completed",
                    lyrics: { not: null },
                },
                {
                    OR: [
                        { songFileUrl: null },
                        { songFileUrl2: null },
                    ],
                },
                ...(accountFilter ? [accountFilter] : []),
            ],
        },
        select: {
            id: true,
            recipientName: true,
            genre: true,
            vocals: true,
            locale: true,
            createdAt: true,
            paymentCompletedAt: true,
            hasFastDelivery: true,
            planType: true,
            email: true,
            backupWhatsApp: true,
            musicPrompt: true,
            sunoAccountEmail: true,
            songFileUrl: true,
            songFileUrl2: true,
            parentOrder: {
                select: {
                    hasFastDelivery: true,
                    planType: true,
                },
            },
        },
        orderBy: [
            { hasFastDelivery: "desc" },      // 24h delivery first
            { paymentCompletedAt: "asc" },    // then by oldest payment (most delayed first)
        ],
    });

    const nowMs = Date.now();
    const now = new Date(nowMs);
    const pendingOrders = [...pendingOrdersRaw]
        .map((order) => ({ order, sort: getQueueSortData(order, now) }))
        .sort((a, b) => (
            a.sort.delay - b.sort.delay ||
            a.sort.priority - b.sort.priority ||
            a.sort.paidAtMs - b.sort.paidAtMs
        ))
        .map((item) => item.order);

    const recentCutoff = new Date(nowMs - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(nowMs - LAST_HOUR_MS);
    const recentOrdersRaw = await db.songOrder.findMany({
        where: {
            orderType: "MAIN",
            songUploadedAt: { gte: recentCutoff },
            songFileUrl: { not: null },
        },
        select: {
            id: true,
            recipientName: true,
            email: true,
            locale: true,
            sunoAccountEmail: true,
            songUploadedAt: true,
            songDeliveredAt: true,
            songFileUrl: true,
            songFileUrl2: true,
        },
        orderBy: { songUploadedAt: "desc" },
        take: 20,
    });

    const recentOrders: RecentSunoOrder[] = recentOrdersRaw.map((order) => {
        const songsGenerated = order.songFileUrl2 ? 2 : order.songFileUrl ? 1 : 0;
        const processedAt = order.songUploadedAt ?? order.songDeliveredAt ?? new Date();
        return {
            id: order.id,
            recipientName: order.recipientName,
            email: order.email,
            locale: order.locale,
            sunoAccountEmail: order.sunoAccountEmail ?? null,
            processedAt: processedAt.toISOString(),
            songsGenerated,
            deliverySent: Boolean(order.songDeliveredAt),
        };
    });

    let workerStartedAt: Date | null = null;
    let workerHeartbeatAt: Date | null = null;
    try {
        const [startedAtRaw, heartbeatRaw] = await Promise.all([
            redisConnection.get(SUNO_WORKER_STARTED_AT_KEY),
            redisConnection.get(SUNO_WORKER_HEARTBEAT_KEY),
        ]);
        workerStartedAt = parseWorkerStartedAt(startedAtRaw);
        workerHeartbeatAt = parseWorkerStartedAt(heartbeatRaw);
    } catch (error) {
        console.warn("[suno-trigger] Failed to load worker heartbeat/start time from Redis:", error);
    }

    const estimatedStartMsFromRecent = recentOrders
        .map((order) => new Date(order.processedAt).getTime())
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => a - b)[0];

    const fallbackStart = estimatedStartMsFromRecent
        ? new Date(estimatedStartMsFromRecent)
        : new Date(Date.now() - FALLBACK_METRICS_WINDOW_MS);

    const metricsStart = workerStartedAt ?? fallbackStart;

    const [uploadedSlot1Count, uploadedSlot2Count, uploadedLastHourSlot1Count, uploadedLastHourSlot2Count] = await Promise.all([
        db.songOrder.count({
            where: {
                songUploadedAt: { gte: metricsStart },
                ...(accountFilter ? accountFilter : {}),
            },
        }),
        db.songOrder.count({
            where: {
                songUploadedAt2: { gte: metricsStart },
                ...(accountFilter ? accountFilter : {}),
            },
        }),
        db.songOrder.count({
            where: {
                songUploadedAt: { gte: oneHourAgo },
                ...(accountFilter ? accountFilter : {}),
            },
        }),
        db.songOrder.count({
            where: {
                songUploadedAt2: { gte: oneHourAgo },
                ...(accountFilter ? accountFilter : {}),
            },
        }),
    ]);

    const songsGenerated = uploadedSlot1Count + uploadedSlot2Count;
    const runtimeHours = Math.max(0, (now.getTime() - metricsStart.getTime()) / (60 * 60 * 1000));
    const avgSongsPerHour = runtimeHours > 0 ? songsGenerated / runtimeHours : 0;
    const lastHourSuccessCount = uploadedLastHourSlot1Count + uploadedLastHourSlot2Count;

    let parallelActive = 0;
    let queueWaiting = 0;
    let queueDelayed = 0;
    let lastHourFailureCount = 0;
    let workerActiveOrderIds: string[] = [];

    if (!USE_LOCAL_MODE) {
        try {
            const [activeCount, waitingCount, delayedCount, failedJobs, activeJobs] = await Promise.all([
                sunoGenerationQueue.getActiveCount(),
                sunoGenerationQueue.getWaitingCount(),
                sunoGenerationQueue.getDelayedCount(),
                sunoGenerationQueue.getJobs(["failed"], 0, 99),
                sunoGenerationQueue.getJobs(["active"], 0, Math.max(99, SUNO_WORKER_CONCURRENCY * 4)),
            ]);

            parallelActive = activeCount;
            queueWaiting = waitingCount;
            queueDelayed = delayedCount;
            workerActiveOrderIds = Array.from(
                new Set(
                    activeJobs
                        .map((job) => extractOrderIdFromQueueJob(job))
                        .filter((id): id is string => Boolean(id))
                )
            );
            const oneHourAgoMs = nowMs - LAST_HOUR_MS;
            lastHourFailureCount = failedJobs.filter((job) => {
                const finishedOn = typeof job.finishedOn === "number" ? job.finishedOn : 0;
                return finishedOn >= oneHourAgoMs;
            }).length;
        } catch (error) {
            console.warn("[suno-trigger] Failed to load queue metrics:", error);
        }
    }

    const heartbeatAgeMs = workerHeartbeatAt ? nowMs - workerHeartbeatAt.getTime() : Number.POSITIVE_INFINITY;
    const workerOnline = heartbeatAgeMs <= WORKER_HEARTBEAT_STALE_MS;
    const workerState: "offline" | "idle" | "processing" = !workerOnline
        ? "offline"
        : parallelActive > 0
        ? "processing"
        : "idle";

    const automationMetrics: SunoAutomationMetrics = {
        workerStartedAt: workerStartedAt?.toISOString() ?? null,
        workerHeartbeatAt: workerHeartbeatAt?.toISOString() ?? null,
        workerOnline,
        workerState,
        runtimeHours,
        songsGenerated,
        avgSongsPerHour,
        usingEstimatedWindow: !workerStartedAt,
        lastHourSuccessCount,
        lastHourFailureCount,
        parallelActive,
        parallelLimit: SUNO_WORKER_CONCURRENCY,
        queueWaiting,
        queueDelayed,
    };

    // Get current Suno account email from auth state
    return NextResponse.json({
        mode: USE_LOCAL_MODE ? "local" : "queue",
        pendingCount: pendingOrders.length,
        orders: pendingOrders,
        workerActiveOrderIds,
        sunoAccountEmail,
        recentOrders,
        automationMetrics,
    });
}
