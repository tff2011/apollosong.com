import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { generateLyrics } from "~/lib/lyrics-generator";
import { getGenreAudioEntries } from "~/lib/genre-audio";
import { genreTypes } from "~/lib/validations/song-order";
import { locales } from "~/i18n/config";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { StorageService } from "~/lib/storage";
import { env } from "~/env";
import { sendEmail } from "~/server/email/mailer";
import { buildSongDeliveryEmail } from "~/server/email/song-delivery";
import { buildStreamingVipReadyEmail } from "~/server/email/streaming-vip-ready";
import { buildStreamingVipInProgressEmail } from "~/server/email/streaming-vip-in-progress";
import { buildRevisionCompletedEmail } from "~/server/email/revision-completed";
import { buildStreamingUrgentContactEmail } from "~/server/email/streaming-urgent-contact";
import { sendRevisionCompletedAlert } from "~/lib/telegram";
import { enqueuePdfGeneration } from "~/server/queues/pdf-generation";
import { enqueueKaraokeGeneration, karaokeGenerationQueue } from "~/server/queues/karaoke-generation";
import { triggerEmailPoll } from "~/server/queues/email-polling";
import { enqueueWhatsAppAdminOrderSongs } from "~/server/queues/whatsapp-admin-order-songs";
import { enqueueWhatsAppAdminOutbound } from "~/server/queues/whatsapp-admin-outbound";
import { enqueueWhatsAppAdminVoiceNote } from "~/server/queues/whatsapp-admin-voice-note";
import { convertSupabaseImportOnPaid } from "~/lib/supabase-source-conversion";
import { normalizeRevisionHistory } from "~/lib/revision-history";
import { buildPhoneCandidates, normalizePhoneDigits, phonesLikelyMatch } from "~/lib/phone-matching";
import { normalizePhoneToWaId } from "~/lib/whatsapp";
import {
    ADMIN_PERMISSIONS,
    ADMIN_PERMISSION_METADATA,
    type AdminPermission,
    canAccessAdminPath,
    getDefaultAdminPath,
} from "~/lib/admin/permissions";
import {
    assertAccessToAdminProcedure,
    assertSuperAdmin,
    buildWorkSessionDayKey,
    requireAdminUserFromSession,
    WORK_SESSION_TZ,
} from "~/server/auth/admin-access";
import { createPasswordHash } from "~/server/auth/password";
import {
    CHECKOUT_COUPON_CONFIG_ID,
    isValidCouponCode,
    normalizeCouponCode,
} from "~/lib/discount-coupons";

const SAO_PAULO_TZ = "America/Sao_Paulo";
const SUPER_ADMIN_DEFAULT_NAME = "Thiago Felizola";
const MUSIC_LOVELY_SOURCE = "supabase-import";
const MUSIC_LOVELY_CONVERTED_SOURCE = "supabase-convertido";
const WHATSAPP_LOCK_TTL_MS = 5 * 60 * 1000;
const STREAMING_SONG_NAME_STOP_WORDS = new Set([
    "a", "o", "as", "os", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "pra", "pro", "com", "sem",
    "the", "an", "and", "of", "for", "to", "in", "on", "with", "from", "my", "your", "our",
    "del", "la", "las", "el", "los", "y", "mi", "tu", "su",
    "du", "des", "le", "les", "pour", "avec", "sans", "mon", "ma", "mes", "ton", "ta", "tes",
    "di", "della", "delle", "dello", "il", "lo", "gli", "per", "senza", "mio", "mia", "tuo", "tua", "uno",
]);
const APOLLO_SOURCE_FILTER: Prisma.SongOrderWhereInput = {
    OR: [{ utmSource: { not: MUSIC_LOVELY_SOURCE } }, { utmSource: null }],
};

type FinanciallyRedactableOrder = {
    priceAtOrder: number;
    stripeFee: number | null;
    stripeNetAmount: number | null;
    stripePaymentIntentId: string | null;
};

function getWhatsAppGenreLabel(genre: string | null | undefined): string {
    const raw = String(genre || "").trim();
    if (!raw) return "especial";

    const normalized = raw.toLowerCase();
    if (normalized === "worship" || normalized === "gospel") return "Gospel";

    return raw;
}

function withFinancialVisibility<T extends FinanciallyRedactableOrder>(
    order: T,
    canViewFinancials: boolean
): T & { canViewFinancials: boolean } {
    if (canViewFinancials) {
        return { ...order, canViewFinancials };
    }

    return {
        ...order,
        priceAtOrder: 0,
        stripeFee: null,
        stripeNetAmount: null,
        stripePaymentIntentId: null,
        canViewFinancials,
    };
}

function normalizeOperatorName(name: string): string {
    return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

function resolveWhatsAppOperatorName(adminUser: {
    name: string | null;
    adminUsername: string | null;
    email: string | null;
    adminRole: "SUPER_ADMIN" | "STAFF";
}): string {
    const preferredName = normalizeAdminName(adminUser.name, adminUser.adminRole);
    const fallback = adminUser.adminUsername ?? adminUser.email ?? "Atendente";
    const operatorName = normalizeOperatorName(preferredName || fallback);

    if (!operatorName) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível identificar o atendente logado." });
    }

    return operatorName;
}

function isWhatsAppLockActive(conversation: { assignedTo?: string | null; lockExpiresAt?: Date | null }, now = new Date()): boolean {
    return Boolean(
        conversation.assignedTo &&
        conversation.lockExpiresAt &&
        conversation.lockExpiresAt.getTime() > now.getTime()
    );
}

function nextWhatsAppLockExpiry(now = new Date()): Date {
    return new Date(now.getTime() + WHATSAPP_LOCK_TTL_MS);
}

// Capitalize first letter of each word (for consistent reviewer names)
function capitalizeWords(str: string | null | undefined): string | null {
    const trimmed = str?.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLocaleLowerCase("pt-BR");
    return lower.replace(/(^|[\s.'-])(\p{L})/gu, (_match, prefix: string, letter: string) => {
        return `${prefix}${letter.toLocaleUpperCase("pt-BR")}`;
    });
}

const REVIEWER_CANONICAL_KEY_ALIASES: Record<string, string> = {
    thiago: "thiago felizola",
};

const REVIEWER_CANONICAL_DISPLAY_BY_KEY: Record<string, string> = {
    "thiago felizola": "Thiago Felizola",
};

function normalizeReviewerName(str: string | null | undefined): string {
    const normalized = (str ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");

    return REVIEWER_CANONICAL_KEY_ALIASES[normalized] ?? normalized;
}

function isSameReviewerName(a: string | null | undefined, b: string | null | undefined): boolean {
    const normalizedA = normalizeReviewerName(a);
    const normalizedB = normalizeReviewerName(b);
    return normalizedA.length > 0 && normalizedA === normalizedB;
}

function hasReviewerDiacritics(name: string): boolean {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") !== name;
}

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

function pickPreferredReviewerDisplayName(currentName: string | null | undefined, candidateName: string): string {
    if (!currentName) return candidateName;
    const currentHasDiacritics = hasReviewerDiacritics(currentName);
    const candidateHasDiacritics = hasReviewerDiacritics(candidateName);

    if (candidateHasDiacritics && !currentHasDiacritics) {
        return candidateName;
    }

    if (candidateHasDiacritics === currentHasDiacritics && candidateName.length > currentName.length) {
        return candidateName;
    }

    return currentName;
}

function getReviewerIdentity(rawName: string | null | undefined): { key: string; displayName: string } | null {
    const displayNameFromInput = capitalizeWords(rawName);
    if (!displayNameFromInput) return null;
    const key = normalizeReviewerName(displayNameFromInput);
    if (!key) return null;
    const canonicalDisplayName = REVIEWER_CANONICAL_DISPLAY_BY_KEY[key];
    const displayName = canonicalDisplayName ?? displayNameFromInput;
    return { key, displayName };
}

function resolveRevisionActorName(adminUser: {
    name: string | null;
    adminUsername: string | null;
    email: string | null;
    adminRole: "SUPER_ADMIN" | "STAFF";
}): string {
    const explicitName = adminUser.name?.trim() ?? "";
    const fallback = adminUser.adminUsername?.trim() ?? adminUser.email?.trim() ?? "";
    const candidateName = explicitName || fallback || normalizeAdminName(adminUser.name, adminUser.adminRole);
    const resolvedIdentity = getReviewerIdentity(candidateName);
    const resolved = resolvedIdentity?.displayName ?? (capitalizeWords(candidateName) ?? candidateName.trim());

    if (!resolved) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não foi possível identificar o admin logado para validar a trava da revisão.",
        });
    }

    return resolved;
}

function assertRevisionEditAccess(params: {
    order: { status: string; revisionLockedBy: string | null };
    adminUser: {
        name: string | null;
        adminUsername: string | null;
        email: string | null;
        adminRole: "SUPER_ADMIN" | "STAFF";
    };
}): void {
    const { order, adminUser } = params;
    if (order.status !== "REVISION") return;

    if (!order.revisionLockedBy) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Revision must be locked before editing",
        });
    }

    if (adminUser.adminRole === "SUPER_ADMIN") return;

    const actorName = resolveRevisionActorName(adminUser);
    if (!isSameReviewerName(order.revisionLockedBy, actorName)) {
        throw new TRPCError({
            code: "CONFLICT",
            message: `Revisão já travada por ${capitalizeWords(order.revisionLockedBy) ?? order.revisionLockedBy}`,
        });
    }
}

function normalizeRevisionHistoryReviewerNames(history: unknown): unknown {
    if (!Array.isArray(history)) return history;

    return history.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
        const record = entry as Record<string, unknown>;
        const completedBy = typeof record.completedBy === "string"
            ? capitalizeWords(record.completedBy) ?? record.completedBy
            : record.completedBy;

        return {
            ...record,
            completedBy,
        };
    });
}

function normalizeReviewerFieldsInOrder<
    T extends {
        revisionCompletedBy?: string | null;
        revisionLockedBy?: string | null;
        revisionHistory?: unknown;
    }
>(order: T): T {
    return {
        ...order,
        revisionCompletedBy: capitalizeWords(order.revisionCompletedBy),
        revisionLockedBy: capitalizeWords(order.revisionLockedBy),
        revisionHistory: normalizeRevisionHistoryReviewerNames(order.revisionHistory),
    };
}

function mergeReviewerCounts(
    rows: Array<{ revisionCompletedBy: string | null; _count: { revisionCompletedBy: number } }>
): Array<{ name: string; count: number }> {
    const merged = new Map<string, { name: string; count: number }>();

    for (const row of rows) {
        const reviewerIdentity = getReviewerIdentity(row.revisionCompletedBy);
        if (!reviewerIdentity) continue;

        const existing = merged.get(reviewerIdentity.key);
        if (existing) {
            existing.count += row._count.revisionCompletedBy;
            existing.name = pickPreferredReviewerDisplayName(existing.name, reviewerIdentity.displayName);
            continue;
        }

        merged.set(reviewerIdentity.key, {
            name: reviewerIdentity.displayName,
            count: row._count.revisionCompletedBy,
        });
    }

    return Array.from(merged.values())
        .sort((a, b) => b.count - a.count);
}

function getCurrentPausedMs(
    session: {
        pausedAt: Date | null;
        totalPausedMs: number;
        endedAt: Date | null;
    },
    now = new Date()
): number {
    const base = Math.max(0, session.totalPausedMs || 0);
    if (!session.pausedAt || session.endedAt) return base;
    return base + Math.max(0, now.getTime() - session.pausedAt.getTime());
}

function getWorkedMsForSession(
    session: {
        startedAt: Date | null;
        endedAt: Date | null;
        pausedAt: Date | null;
        totalPausedMs: number;
    },
    now = new Date()
): number | null {
    if (!session.startedAt) return null;
    const end = session.endedAt ?? now;
    const totalSpan = Math.max(0, end.getTime() - session.startedAt.getTime());
    const pausedMs = getCurrentPausedMs(session, now);
    return Math.max(0, totalSpan - pausedMs);
}

function parsePossibleDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : null;
    }
    if (typeof value === "string") {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    return null;
}

function sortReviewerCountMap(
    countMap: Map<string, number>,
    reviewerDisplayNameMap?: Map<string, string>
): Array<{ name: string; count: number }> {
    return Array.from(countMap.entries())
        .map(([reviewerKey, count]) => ({
            name: reviewerDisplayNameMap?.get(reviewerKey) ?? capitalizeWords(reviewerKey) ?? reviewerKey,
            count,
        }))
        .sort((a, b) => b.count - a.count);
}

const SongOrderStatusEnum = z.enum(["PENDING", "PAID", "IN_PROGRESS", "COMPLETED", "REVISION", "CANCELLED", "REFUNDED"]);
const AdminPermissionEnum = z.enum(ADMIN_PERMISSIONS);
const DiscountCouponInputSchema = z.object({
    code: z.string().min(3).max(32),
    discountPercent: z.number().int().min(1).max(100),
    maxUses: z.number().int().min(1).max(100000).nullable().optional(),
    isActive: z.boolean().optional().default(true),
});

const adminProcedure = publicProcedure.use(async ({ ctx, path, next }) => {
    const adminUser = await requireAdminUserFromSession(ctx.session);
    assertAccessToAdminProcedure(adminUser, path);

    return next({
        ctx: {
            ...ctx,
            adminUser,
        },
    });
});

function normalizeAdminName(
    name: string | null | undefined,
    role: "SUPER_ADMIN" | "STAFF"
): string {
    const trimmed = name?.trim();
    if (!trimmed) return role === "SUPER_ADMIN" ? SUPER_ADMIN_DEFAULT_NAME : "Funcionário";
    return trimmed;
}

/**
 * Apply pronunciation corrections: original → replacement
 * Used to ensure Suno-facing lyrics keep hardcoded pronunciation dictionary entries.
 */
function applyPronunciationCorrections(
    text: string,
    corrections: Array<{ original: string; replacement: string }>
): string {
    if (corrections.length === 0) return text;

    // Sort by original length (longest first) to avoid partial matches
    const sorted = [...corrections].sort((a, b) => b.original.length - a.original.length);
    const wordChars = "[\\p{L}\\p{M}\\p{N}_]";
    let result = text.normalize("NFC");

    for (const { original, replacement } of sorted) {
        const normalizedOriginal = original.normalize("NFC");
        const normalizedReplacement = replacement.normalize("NFC");
        const escaped = normalizedOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(?<!${wordChars})${escaped}(?!${wordChars})`, "giu");
        result = result.replace(regex, normalizedReplacement);
    }

    return result;
}

/**
 * Reverse pronunciation corrections: replacement → original
 * Used to generate displayLyrics (clean for PDF/email) from correctedLyrics (phonetic for Suno)
 */
function stripPronunciationCorrections(
    text: string,
    corrections: Array<{ original: string; replacement: string }>
): string {
    if (corrections.length === 0) return text;

    // Sort by replacement length (longest first) to avoid partial matches
    const sorted = [...corrections].sort((a, b) => b.replacement.length - a.replacement.length);
    const wordChars = "[\\p{L}\\p{M}\\p{N}_]";
    let result = text.normalize("NFC");

    for (const { original, replacement } of sorted) {
        const normalizedReplacement = replacement.normalize("NFC");
        const normalizedOriginal = original.normalize("NFC");
        const escaped = normalizedReplacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(?<!${wordChars})${escaped}(?!${wordChars})`, "giu");
        result = result.replace(regex, normalizedOriginal);
    }

    return result;
}

type HeadlineAbVariantRow = {
    variant: string;
    leads: number;
    converted: number;
};

type HeadlineAbVariantStats = {
    variant: "A" | "B";
    leads: number;
    converted: number;
    conversionRate: number;
};

type HeadlineAbSummary = {
    periodDays: number;
    variantA: HeadlineAbVariantStats;
    variantB: HeadlineAbVariantStats;
    unknown: {
        leads: number;
        converted: number;
        conversionRate: number;
    };
    liftBvsA: number;
    significance: {
        zScore: number;
        pValue: number;
        isSignificant: boolean;
        winner: "A" | "B" | null;
    } | null;
};

function toHeadlineAbVariantStats(
    rows: HeadlineAbVariantRow[],
    variant: "A" | "B"
): HeadlineAbVariantStats {
    const row = rows.find((item) => item.variant === variant);
    const leads = row?.leads ?? 0;
    const converted = row?.converted ?? 0;

    return {
        variant,
        leads,
        converted,
        conversionRate: leads > 0 ? converted / leads : 0,
    };
}

function calculateTwoProportionZTest(
    convertedA: number,
    totalA: number,
    convertedB: number,
    totalB: number
): { zScore: number; pValue: number } | null {
    if (totalA === 0 || totalB === 0) return null;

    const pA = convertedA / totalA;
    const pB = convertedB / totalB;
    const pooled = (convertedA + convertedB) / (totalA + totalB);
    const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));

    if (!Number.isFinite(standardError) || standardError === 0) return null;

    const zScore = (pA - pB) / standardError;
    const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));

    return { zScore, pValue };
}

function normalCdf(value: number): number {
    return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value: number): number {
    const sign = value < 0 ? -1 : 1;
    const absValue = Math.abs(value);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1 / (1 + p * absValue);
    const y =
        1 -
        (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
            Math.exp(-absValue * absValue);

    return sign * y;
}

function buildHeadlineAbSummary(
    rows: HeadlineAbVariantRow[],
    periodDays: number
): HeadlineAbSummary {
    const variantA = toHeadlineAbVariantStats(rows, "A");
    const variantB = toHeadlineAbVariantStats(rows, "B");
    const unknownRow = rows.find((row) => row.variant === "unknown");
    const unknownLeads = unknownRow?.leads ?? 0;
    const unknownConverted = unknownRow?.converted ?? 0;
    const liftBvsA = variantB.conversionRate - variantA.conversionRate;
    const winner = liftBvsA === 0 ? null : liftBvsA > 0 ? "B" : "A";
    const significanceResult = calculateTwoProportionZTest(
        variantA.converted,
        variantA.leads,
        variantB.converted,
        variantB.leads
    );

    return {
        periodDays,
        variantA,
        variantB,
        unknown: {
            leads: unknownLeads,
            converted: unknownConverted,
            conversionRate: unknownLeads > 0 ? unknownConverted / unknownLeads : 0,
        },
        liftBvsA,
        significance: significanceResult
            ? {
                ...significanceResult,
                isSignificant: significanceResult.pValue < 0.05,
                winner,
            }
            : null,
    };
}

export const adminRouter = createTRPCRouter({
    getCurrentAdmin: adminProcedure.query(async ({ ctx }) => {
        const now = new Date();
        const dayKey = buildWorkSessionDayKey(now);
        const permissions = ctx.adminUser.adminPermissions as unknown as string[];
        const normalizedPermissions = permissions.filter((value): value is AdminPermission => {
            return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
        });

        const role = ctx.adminUser.adminRole;
        const availablePaths = [
            "/admin/leads",
            "/admin/stats",
            "/admin/conversion",
            "/admin/automation",
            "/admin/tickets",
            "/admin/whatsapp",
            "/admin/bounces",
            "/admin/knowledge",
            "/admin/pronunciation-corrections",
            "/admin/genre-prompts",
            "/admin/audio-samples",
            "/admin/suno-emails",
            "/admin/content-calendar",
            "/admin/time-clock",
            "/admin/team",
        ].filter((path) => canAccessAdminPath(role, normalizedPermissions, path));

        const todayWorkSession = await ctx.db.workSession.findUnique({
            where: {
                userId_dayKey: {
                    userId: ctx.adminUser.id,
                    dayKey,
                },
            },
        });

        const openWorkSession = await ctx.db.workSession.findFirst({
            where: {
                userId: ctx.adminUser.id,
                status: { in: ["OPEN", "PAUSED"] },
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        const baseSessionForToday = openWorkSession ?? todayWorkSession;
        const currentWorkedMs = baseSessionForToday ? getWorkedMsForSession(baseSessionForToday, now) : null;
        const currentPausedMs = baseSessionForToday ? getCurrentPausedMs(baseSessionForToday, now) : 0;

        return {
            id: ctx.adminUser.id,
            name: normalizeAdminName(ctx.adminUser.name, role),
            email: ctx.adminUser.email,
            username: ctx.adminUser.adminUsername,
            role,
            permissions: normalizedPermissions,
            availablePaths,
            defaultPath: getDefaultAdminPath(role, normalizedPermissions),
            isSuperAdmin: role === "SUPER_ADMIN",
            serverNow: now,
            dayKey,
            dayLabel: formatInTimeZone(now, WORK_SESSION_TZ, "dd/MM/yyyy"),
            shouldPromptWorkStart: role === "STAFF" && !openWorkSession && todayWorkSession?.status === "PENDING_START",
            todayWorkSession,
            openWorkSession,
            currentWorkedMs,
            currentPausedMs,
            permissionLabels: ADMIN_PERMISSIONS.map((permission) => ({
                permission,
                label: ADMIN_PERMISSION_METADATA[permission].label,
            })),
        };
    }),

    getMyWorkSessionStatus: adminProcedure.query(async ({ ctx }) => {
        const now = new Date();
        const dayKey = buildWorkSessionDayKey(now);

        const openWorkSession = await ctx.db.workSession.findFirst({
            where: {
                userId: ctx.adminUser.id,
                status: { in: ["OPEN", "PAUSED"] },
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        let todayWorkSession = await ctx.db.workSession.findUnique({
            where: {
                userId_dayKey: {
                    userId: ctx.adminUser.id,
                    dayKey,
                },
            },
        });

        if (!todayWorkSession && ctx.adminUser.adminRole === "STAFF" && !openWorkSession) {
            todayWorkSession = await ctx.db.workSession.create({
                data: {
                    userId: ctx.adminUser.id,
                    dayKey,
                    firstLoginAt: now,
                    status: "PENDING_START",
                },
            });
        }

        const baseSessionForToday = openWorkSession ?? todayWorkSession;
        const currentWorkedMs = baseSessionForToday ? getWorkedMsForSession(baseSessionForToday, now) : null;
        const currentPausedMs = baseSessionForToday ? getCurrentPausedMs(baseSessionForToday, now) : 0;

        return {
            serverNow: now,
            dayKey,
            dayLabel: formatInTimeZone(now, WORK_SESSION_TZ, "dd/MM/yyyy"),
            shouldPromptStart: ctx.adminUser.adminRole === "STAFF" && !openWorkSession && todayWorkSession?.status === "PENDING_START",
            todayWorkSession,
            openWorkSession,
            currentWorkedMs,
            currentPausedMs,
        };
    }),

    respondToWorkSessionPrompt: adminProcedure
        .input(
            z.object({
                startNow: z.boolean(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (ctx.adminUser.adminRole !== "STAFF") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Controle de ponto é aplicável a funcionários." });
            }

            const now = new Date();
            const dayKey = buildWorkSessionDayKey(now);

            const openWorkSession = await ctx.db.workSession.findFirst({
                where: {
                    userId: ctx.adminUser.id,
                    status: { in: ["OPEN", "PAUSED"] },
                },
                orderBy: {
                    startedAt: "desc",
                },
            });

            if (openWorkSession) {
                return openWorkSession;
            }

            const existing = await ctx.db.workSession.findUnique({
                where: {
                    userId_dayKey: {
                        userId: ctx.adminUser.id,
                        dayKey,
                    },
                },
            });

            if (!existing) {
                return ctx.db.workSession.create({
                    data: {
                        userId: ctx.adminUser.id,
                        dayKey,
                        firstLoginAt: now,
                        promptAnsweredAt: now,
                        startedAt: input.startNow ? now : null,
                        pausedAt: null,
                        totalPausedMs: 0,
                        status: input.startNow ? "OPEN" : "DECLINED",
                    },
                });
            }

            if (existing.status === "CLOSED") {
                return existing;
            }

            return ctx.db.workSession.update({
                where: { id: existing.id },
                data: {
                    promptAnsweredAt: now,
                    startedAt: input.startNow ? (existing.startedAt ?? now) : null,
                    pausedAt: null,
                    totalPausedMs: input.startNow ? (existing.totalPausedMs || 0) : 0,
                    endedAt: input.startNow ? null : existing.endedAt,
                    status: input.startNow ? "OPEN" : "DECLINED",
                },
            });
        }),

    startMyWorkSession: adminProcedure.mutation(async ({ ctx }) => {
        if (ctx.adminUser.adminRole !== "STAFF") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Controle de ponto é aplicável a funcionários." });
        }

        const now = new Date();
        const dayKey = buildWorkSessionDayKey(now);

        const openWorkSession = await ctx.db.workSession.findFirst({
            where: {
                userId: ctx.adminUser.id,
                status: { in: ["OPEN", "PAUSED"] },
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        if (openWorkSession) {
            return openWorkSession;
        }

        const todaySession = await ctx.db.workSession.findUnique({
            where: {
                userId_dayKey: {
                    userId: ctx.adminUser.id,
                    dayKey,
                },
            },
        });

        if (!todaySession) {
            return ctx.db.workSession.create({
                data: {
                    userId: ctx.adminUser.id,
                    dayKey,
                    firstLoginAt: now,
                    promptAnsweredAt: now,
                    startedAt: now,
                    pausedAt: null,
                    totalPausedMs: 0,
                    status: "OPEN",
                },
            });
        }

        if (todaySession.status === "CLOSED") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ponto do dia já encerrado." });
        }

        return ctx.db.workSession.update({
            where: { id: todaySession.id },
            data: {
                promptAnsweredAt: now,
                startedAt: todaySession.startedAt ?? now,
                pausedAt: null,
                endedAt: null,
                status: "OPEN",
            },
        });
    }),

    pauseMyWorkSession: adminProcedure.mutation(async ({ ctx }) => {
        if (ctx.adminUser.adminRole !== "STAFF") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Controle de ponto é aplicável a funcionários." });
        }

        const openWorkSession = await ctx.db.workSession.findFirst({
            where: {
                userId: ctx.adminUser.id,
                status: "OPEN",
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        if (!openWorkSession) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum ponto em andamento para pausar." });
        }

        if (!openWorkSession.startedAt) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ponto sem horário de início." });
        }

        return ctx.db.workSession.update({
            where: { id: openWorkSession.id },
            data: {
                status: "PAUSED",
                pausedAt: new Date(),
            },
        });
    }),

    resumeMyWorkSession: adminProcedure.mutation(async ({ ctx }) => {
        if (ctx.adminUser.adminRole !== "STAFF") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Controle de ponto é aplicável a funcionários." });
        }

        const pausedWorkSession = await ctx.db.workSession.findFirst({
            where: {
                userId: ctx.adminUser.id,
                status: "PAUSED",
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        if (!pausedWorkSession) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum ponto pausado para retomar." });
        }

        if (!pausedWorkSession.pausedAt) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ponto pausado sem horário de pausa." });
        }

        const now = new Date();
        const pauseWindowMs = Math.max(0, now.getTime() - pausedWorkSession.pausedAt.getTime());

        return ctx.db.workSession.update({
            where: { id: pausedWorkSession.id },
            data: {
                status: "OPEN",
                pausedAt: null,
                totalPausedMs: (pausedWorkSession.totalPausedMs || 0) + pauseWindowMs,
            },
        });
    }),

    endMyWorkSession: adminProcedure.mutation(async ({ ctx }) => {
        const openWorkSession = await ctx.db.workSession.findFirst({
            where: {
                userId: ctx.adminUser.id,
                status: { in: ["OPEN", "PAUSED"] },
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        if (!openWorkSession) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum ponto em aberto para encerrar." });
        }

        const now = new Date();
        const pauseWindowMs = openWorkSession.pausedAt
            ? Math.max(0, now.getTime() - openWorkSession.pausedAt.getTime())
            : 0;

        return ctx.db.workSession.update({
            where: { id: openWorkSession.id },
            data: {
                endedAt: now,
                pausedAt: null,
                totalPausedMs: (openWorkSession.totalPausedMs || 0) + pauseWindowMs,
                status: "CLOSED",
            },
        });
    }),

    getMyWorkSessionHistory: adminProcedure
        .input(
            z.object({
                limit: z.number().int().min(1).max(180).default(60),
                page: z.number().int().min(1).default(1),
            }).optional()
        )
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 60;
            const page = input?.page ?? 1;
            const skip = (page - 1) * limit;

            const where: Prisma.WorkSessionWhereInput = {
                userId: ctx.adminUser.id,
            };

            const [total, rows] = await Promise.all([
                ctx.db.workSession.count({ where }),
                ctx.db.workSession.findMany({
                    where,
                    orderBy: {
                        dayKey: "desc",
                    },
                    skip,
                    take: limit,
                }),
            ]);

            const totalPages = Math.max(1, Math.ceil(total / limit));
            const now = new Date();

            const items = rows.map((row) => {
                const workedMs = getWorkedMsForSession(row, now);
                const pausedMs = getCurrentPausedMs(row, now);

                return {
                    ...row,
                    workedMinutes: workedMs === null ? null : Math.round(workedMs / 60000),
                    pausedMinutes: Math.round(pausedMs / 60000),
                };
            });

            return {
                items,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasPrevPage: page > 1,
                    hasNextPage: page < totalPages,
                },
            };
        }),

    getTeamWorkSessionHistory: adminProcedure
        .input(
            z.object({
                from: z.date().optional(),
                to: z.date().optional(),
                userId: z.string().optional(),
                limit: z.number().int().min(1).max(500).default(200),
                page: z.number().int().min(1).default(1),
            }).optional()
        )
        .query(async ({ ctx, input }) => {
            assertSuperAdmin(ctx.adminUser);

            const where: Prisma.WorkSessionWhereInput = {};
            const limit = input?.limit ?? 200;
            const page = input?.page ?? 1;
            const skip = (page - 1) * limit;

            if (input?.userId) {
                where.userId = input.userId;
            }
            if (input?.from || input?.to) {
                where.firstLoginAt = {
                    ...(input.from ? { gte: input.from } : {}),
                    ...(input.to ? { lte: input.to } : {}),
                };
            }

            const [total, rows] = await Promise.all([
                ctx.db.workSession.count({ where }),
                ctx.db.workSession.findMany({
                    where,
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                adminUsername: true,
                                adminRole: true,
                            },
                        },
                    },
                    orderBy: [
                        { dayKey: "desc" },
                        { firstLoginAt: "desc" },
                    ],
                    skip,
                    take: limit,
                }),
            ]);

            const totalPages = Math.max(1, Math.ceil(total / limit));
            const now = new Date();

            const items = rows.map((row) => {
                const workedMs = getWorkedMsForSession(row, now);
                const pausedMs = getCurrentPausedMs(row, now);

                return {
                    ...row,
                    workedMinutes: workedMs === null ? null : Math.round(workedMs / 60000),
                    pausedMinutes: Math.round(pausedMs / 60000),
                };
            });

            return {
                items,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasPrevPage: page > 1,
                    hasNextPage: page < totalPages,
                },
            };
        }),

    getAdminUsers: adminProcedure.query(async ({ ctx }) => {
        assertSuperAdmin(ctx.adminUser);

        return ctx.db.user.findMany({
            where: {
                OR: [
                    { adminEnabled: true },
                    { adminUsername: { not: null } },
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
                adminUsername: true,
                adminRole: true,
                adminPermissions: true,
                adminEnabled: true,
                pixKey: true,
            },
            orderBy: [
                { adminRole: "asc" },
                { adminUsername: "asc" },
            ],
        });
    }),

    createAdminUser: adminProcedure
        .input(
            z.object({
                name: z.string().min(2).max(80),
                email: z.string().email().optional(),
                username: z.string().min(3).max(40),
                password: z.string().min(6).max(120),
                permissions: z.array(AdminPermissionEnum).max(ADMIN_PERMISSIONS.length),
                pixKey: z.string().max(255).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            assertSuperAdmin(ctx.adminUser);

            const username = input.username.trim().toLowerCase();
            if (username === "admin") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "O usuário \"admin\" é reservado para o administrador geral." });
            }

            const normalizedEmail = input.email?.trim().toLowerCase() || null;
            const normalizedPixKey = input.pixKey?.trim() || null;
            const uniquePermissions = Array.from(new Set(input.permissions));

            const usernameExists = await ctx.db.user.findFirst({
                where: {
                    adminUsername: username,
                },
                select: { id: true },
            });
            if (usernameExists) {
                throw new TRPCError({ code: "CONFLICT", message: "Este nome de usuário já está em uso." });
            }

            if (normalizedEmail) {
                const emailExists = await ctx.db.user.findUnique({
                    where: { email: normalizedEmail },
                    select: { id: true },
                });
                if (emailExists) {
                    throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já está em uso." });
                }
            }

            return ctx.db.user.create({
                data: {
                    name: input.name.trim(),
                    email: normalizedEmail,
                    adminUsername: username,
                    adminPasswordHash: createPasswordHash(input.password),
                    adminRole: "STAFF",
                    adminPermissions: uniquePermissions,
                    adminEnabled: true,
                    pixKey: normalizedPixKey,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    adminUsername: true,
                    adminRole: true,
                    adminPermissions: true,
                    adminEnabled: true,
                    pixKey: true,
                },
            });
        }),

    updateAdminUserPermissions: adminProcedure
        .input(
            z.object({
                userId: z.string().min(1),
                permissions: z.array(AdminPermissionEnum).max(ADMIN_PERMISSIONS.length),
            })
        )
        .mutation(async ({ ctx, input }) => {
            assertSuperAdmin(ctx.adminUser);

            const target = await ctx.db.user.findUnique({
                where: { id: input.userId },
                select: { id: true, adminRole: true },
            });

            if (!target) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
            }

            if (target.adminRole === "SUPER_ADMIN") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Permissões do administrador geral não podem ser alteradas por aqui." });
            }

            const uniquePermissions = Array.from(new Set(input.permissions));

            return ctx.db.user.update({
                where: { id: input.userId },
                data: {
                    adminPermissions: uniquePermissions,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    adminUsername: true,
                    adminRole: true,
                    adminPermissions: true,
                    adminEnabled: true,
                    pixKey: true,
                },
            });
        }),

    updateAdminUserPixKey: adminProcedure
        .input(
            z.object({
                userId: z.string().min(1),
                pixKey: z.string().max(255).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            assertSuperAdmin(ctx.adminUser);

            const target = await ctx.db.user.findUnique({
                where: { id: input.userId },
                select: { id: true, adminRole: true },
            });

            if (!target) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
            }

            if (target.adminRole === "SUPER_ADMIN") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "A chave PIX do administrador geral não é editada por esta tela." });
            }

            const normalizedPixKey = input.pixKey?.trim() || null;

            return ctx.db.user.update({
                where: { id: input.userId },
                data: {
                    pixKey: normalizedPixKey,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    adminUsername: true,
                    adminRole: true,
                    adminPermissions: true,
                    adminEnabled: true,
                    pixKey: true,
                },
            });
        }),

    toggleAdminUserEnabled: adminProcedure
        .input(
            z.object({
                userId: z.string().min(1),
                enabled: z.boolean(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            assertSuperAdmin(ctx.adminUser);

            if (input.userId === ctx.adminUser.id && !input.enabled) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode desativar seu próprio usuário." });
            }

            const target = await ctx.db.user.findUnique({
                where: { id: input.userId },
                select: { id: true, adminRole: true },
            });

            if (!target) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
            }

            if (target.adminRole === "SUPER_ADMIN" && !input.enabled) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Não é permitido desativar o administrador geral." });
            }

            return ctx.db.user.update({
                where: { id: input.userId },
                data: {
                    adminEnabled: input.enabled,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    adminUsername: true,
                    adminRole: true,
                    adminPermissions: true,
                    adminEnabled: true,
                    pixKey: true,
                },
            });
        }),

    resetAdminUserPassword: adminProcedure
        .input(
            z.object({
                userId: z.string().min(1),
                newPassword: z.string().min(6).max(120),
            })
        )
        .mutation(async ({ ctx, input }) => {
            assertSuperAdmin(ctx.adminUser);

            const target = await ctx.db.user.findUnique({
                where: { id: input.userId },
                select: { id: true },
            });

            if (!target) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
            }

            await ctx.db.user.update({
                where: { id: input.userId },
                data: {
                    adminPasswordHash: createPasswordHash(input.newPassword),
                },
            });

            return { success: true };
        }),

    deleteAdminUser: adminProcedure
        .input(
            z.object({
                userId: z.string().min(1),
            })
        )
        .mutation(async ({ ctx, input }) => {
            assertSuperAdmin(ctx.adminUser);

            if (input.userId === ctx.adminUser.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir seu próprio usuário." });
            }

            const target = await ctx.db.user.findUnique({
                where: { id: input.userId },
                select: {
                    id: true,
                    adminRole: true,
                    adminUsername: true,
                    adminEnabled: true,
                },
            });

            if (!target) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
            }

            if (target.adminRole === "SUPER_ADMIN") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Não é permitido excluir um administrador geral." });
            }

            if (!target.adminUsername && !target.adminEnabled) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Este usuário não possui acesso administrativo para ser excluído por esta tela." });
            }

            await ctx.db.user.delete({
                where: { id: input.userId },
            });

            return { success: true };
        }),

    // ============= PAGINATED LEADS WITH FILTERS =============
    getLeadsPaginated: adminProcedure
        .input(
            z.object({
                page: z.number().min(1).default(1),
                pageSize: z.number().min(10).max(100).default(20),
                // Search filters
                search: z.string().optional(),
                searchMode: z.enum(["ALL", "SPOTIFY_SONG_NAME"]).optional(),
                // Dropdown filters
                status: z.enum(["ALL", "PENDING", "PAID", "IN_PROGRESS", "COMPLETED", "REVISION", "CANCELLED", "REFUNDED", "STUCK", "NO_LYRICS", "SPOTIFY_READY", "SPOTIFY_PENDING", "SPOTIFY_IN_DISTRIBUTION", "SPOTIFY_PUBLISHED", "SONGS_PENDING"]).optional(),
                revisionType: z.enum(["PRONUNCIATION", "LYRICS_ERROR", "NAME_ERROR", "STYLE_CHANGE", "QUALITY_ISSUE", "OTHER"]).optional(),
                revisionFault: z.enum(["OUR_FAULT", "CLIENT_FAULT", "UNCLEAR"]).optional(),
                melodyPreference: z.enum(["KEEP_CURRENT", "SUGGEST_NEW", "UNSET"]).optional(),
                genre: z.string().optional(),
                vocals: z.preprocess(
                    (val) => (val === "" ? undefined : val),
                    z.enum(["male", "female", "either"]).optional()
                ),
                locale: z.enum(["en", "pt", "es", "fr", "it"]).optional(),
                plan: z.enum(["ESSENTIAL", "EXPRESS", "TURBO"]).optional(),
                upsell: z.string().optional(),
                recoveryEmail: z.enum(["ALL", "ANY", "CART", "STREAMING"]).optional(),
                orderType: z.enum(["MUSICIAN_TIP"]).optional(),
                reviewedBy: z.string().optional(),
                source: z.string().optional(),
                excludeSource: z.string().optional(),
                // Date range
                dateFrom: z.date().optional(),
                dateTo: z.date().optional(),
                // Sorting
                sortBy: z.enum(["createdAt", "email", "recipientName", "status", "priceAtOrder"]).default("createdAt"),
                sortOrder: z.enum(["asc", "desc"]).default("desc"),
            })
        )
        .query(async ({ ctx, input }) => {
            const {
                page,
                pageSize,
                search,
                searchMode,
                status,
                revisionType,
                revisionFault,
                melodyPreference,
                genre,
                vocals,
                locale,
                plan,
                upsell,
                recoveryEmail,
                orderType,
                reviewedBy,
                source,
                excludeSource,
                dateFrom,
                dateTo,
                sortBy,
                sortOrder,
            } = input;
            const trimmedSearch = search?.trim();

            // Build WHERE clause
            const conditions: any[] = [];

            // Status filter (ALL means no filter)
            // STUCK filter shows IN_PROGRESS orders without music files (non-streaming)
            if (status && status !== "ALL") {
                if (status === "PAID") {
                    conditions.push({ status: "PAID" });
                } else if (status === "NO_LYRICS") {
                    conditions.push({
                        status: { in: ["PAID", "IN_PROGRESS"] },
                        orderType: { not: "STREAMING_UPSELL" },
                        lyrics: null,
                    });
                } else if (status === "SPOTIFY_READY") {
                    conditions.push({
                        orderType: "STREAMING_UPSELL",
                        status: "PAID",
                        streamingSongName: { not: null },
                        streamingCoverUrl: { not: null },
                        coverApproved: true,
                        preferredSongForStreaming: { not: null },
                    });
                } else if (status === "SPOTIFY_PENDING") {
                    conditions.push({
                        orderType: "STREAMING_UPSELL",
                        status: "PAID",
                    });
                } else if (status === "SPOTIFY_IN_DISTRIBUTION") {
                    conditions.push({
                        orderType: "STREAMING_UPSELL",
                        status: { in: ["IN_PROGRESS", "COMPLETED"] },
                        spotifyUrl: null,
                    });
                } else if (status === "SPOTIFY_PUBLISHED") {
                    conditions.push({
                        orderType: "STREAMING_UPSELL",
                        status: "COMPLETED",
                        spotifyUrl: { not: null },
                    });
                } else if (status === "SONGS_PENDING") {
                    conditions.push({
                        status: { in: ["PAID", "IN_PROGRESS"] },
                        orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
                        lyricsStatus: "completed",
                        lyrics: { not: null },
                        songFileUrl: null,
                    });
                } else if (status === "STUCK") {
                    conditions.push({
                        status: "IN_PROGRESS",
                        orderType: { not: "STREAMING_UPSELL" },
                        songFileUrl: null,
                        songFileUrl2: null,
                    });
                } else {
                    conditions.push({ status });
                }
            }

            // Revision type filter (only applicable when status is REVISION)
            if (revisionType) {
                conditions.push({ revisionType });
            }

            // Revision fault filter (only applicable when status is REVISION)
            if (revisionFault) {
                conditions.push({ revisionFault });
            }

            // Melody preference filter (keep current vs suggest new)
            if (melodyPreference === "UNSET") {
                conditions.push({ melodyPreference: null });
            } else if (melodyPreference) {
                conditions.push({ melodyPreference });
            }

            // Search across fields, or by Spotify song name only when requested.
            if (trimmedSearch) {
                if (searchMode === "SPOTIFY_SONG_NAME") {
                    conditions.push({
                        OR: [
                            { streamingSongName: { contains: trimmedSearch, mode: "insensitive" } },
                            {
                                childOrders: {
                                    some: {
                                        orderType: "STREAMING_UPSELL",
                                        streamingSongName: { contains: trimmedSearch, mode: "insensitive" },
                                    },
                                },
                            },
                        ],
                    });
                } else {
                    const phoneSearchDigits = normalizePhoneDigits(trimmedSearch);
                    const phoneSearchCandidates = phoneSearchDigits.length >= 10
                        ? Array.from(buildPhoneCandidates(phoneSearchDigits))
                        : [];

                    const searchConditions: any[] = [
                        { email: { contains: trimmedSearch, mode: "insensitive" } },
                        { recipientName: { contains: trimmedSearch, mode: "insensitive" } },
                        { backupWhatsApp: { contains: trimmedSearch, mode: "insensitive" } },
                        { id: trimmedSearch },
                        { streamingSongName: { contains: trimmedSearch, mode: "insensitive" } },
                        { lyrics: { contains: trimmedSearch, mode: "insensitive" } },
                        {
                            childOrders: {
                                some: {
                                    orderType: "STREAMING_UPSELL",
                                    streamingSongName: { contains: trimmedSearch, mode: "insensitive" },
                                },
                            },
                        },
                    ];

                    for (const candidate of phoneSearchCandidates) {
                        searchConditions.push({
                            backupWhatsApp: { contains: candidate, mode: "insensitive" },
                        });
                    }

                    conditions.push({
                        OR: searchConditions,
                    });
                }
            }

            // Genre filter
            if (genre) {
                conditions.push({ genre });
            }

            // Vocals filter
            if (vocals) {
                conditions.push({ vocals });
            }

            // Locale filter
            if (locale) {
                conditions.push({ locale });
            }

            // Delivery plan filter
            if (plan) {
                if (plan === "TURBO") {
                    conditions.push({
                        OR: [
                            { planType: "acelerado" },
                            { parentOrder: { is: { planType: "acelerado" } } },
                        ],
                    });
                } else if (plan === "EXPRESS") {
                    conditions.push({
                        AND: [
                            {
                                NOT: {
                                    OR: [
                                        { planType: "acelerado" },
                                        { parentOrder: { is: { planType: "acelerado" } } },
                                    ],
                                },
                            },
                            {
                                OR: [
                                    { hasFastDelivery: true },
                                    { planType: "express" },
                                    { parentOrder: { is: { hasFastDelivery: true } } },
                                    { parentOrder: { is: { planType: "express" } } },
                                ],
                            },
                        ],
                    });
                } else if (plan === "ESSENTIAL") {
                    conditions.push({
                        NOT: {
                            OR: [
                                { planType: "acelerado" },
                                { parentOrder: { is: { planType: "acelerado" } } },
                                { hasFastDelivery: true },
                                { planType: "express" },
                                { parentOrder: { is: { hasFastDelivery: true } } },
                                { parentOrder: { is: { planType: "express" } } },
                            ],
                        },
                    });
                }
            }

            // Upsell filter (supports comma-separated values for AND logic)
            if (upsell && upsell !== "ALL") {
                const upsellValues = upsell.split(",").filter(Boolean);
                const addUpsellCondition = (val: string) => {
                    if (val === "ANY") {
                        conditions.push({
                            OR: [
                                { hasLyrics: true },
                                { hasCertificate: true },
                                { orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT", "STREAMING_UPSELL"] } },
                                { childOrders: { some: { orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT", "STREAMING_UPSELL"] } } } },
                            ],
                        });
                    } else if (val === "LYRICS") {
                        conditions.push({ hasLyrics: true });
                    } else if (val === "CERTIFICATE") {
                        conditions.push({ hasCertificate: true });
                    } else if (val === "EXTRA_SONG") {
                        conditions.push({
                            OR: [
                                { orderType: "EXTRA_SONG" },
                                { childOrders: { some: { orderType: "EXTRA_SONG" } } },
                            ],
                        });
                    } else if (val === "GENRE_VARIANT") {
                        conditions.push({
                            OR: [
                                { orderType: "GENRE_VARIANT" },
                                { childOrders: { some: { orderType: "GENRE_VARIANT" } } },
                            ],
                        });
                    } else if (val === "STREAMING") {
                        conditions.push({
                            OR: [
                                { orderType: "STREAMING_UPSELL" },
                                { childOrders: { some: { orderType: "STREAMING_UPSELL" } } },
                            ],
                        });
                    }
                };
                for (const val of upsellValues) {
                    addUpsellCondition(val);
                }
            }

            // Recovery email filter
            if (recoveryEmail && recoveryEmail !== "ALL") {
                const cartCondition = {
                    sentEmails: {
                        some: {
                            status: "SENT",
                            template: "CART_ABANDONMENT",
                        },
                    },
                };
                const streamingSelfCondition = {
                    sentEmails: {
                        some: {
                            status: "SENT",
                            template: "STREAMING_VIP_REMINDER",
                        },
                    },
                };
                const streamingChildCondition = {
                    childOrders: {
                        some: {
                            sentEmails: {
                                some: {
                                    status: "SENT",
                                    template: "STREAMING_VIP_REMINDER",
                                },
                            },
                        },
                    },
                };

                if (recoveryEmail === "CART") {
                    conditions.push(cartCondition);
                } else if (recoveryEmail === "STREAMING") {
                    conditions.push({ OR: [streamingSelfCondition, streamingChildCondition] });
                } else if (recoveryEmail === "ANY") {
                    conditions.push({ OR: [cartCondition, streamingSelfCondition, streamingChildCondition] });
                }
            }

            // Order type filter (for MUSICIAN_TIP - show the actual musician tip orders)
            if (orderType === "MUSICIAN_TIP") {
                conditions.push({
                    orderType: "MUSICIAN_TIP",
                });
            }

            // Reviewed by filter (orders that went through revision and were completed by someone)
            if (reviewedBy === "ALL") {
                // Show all reviewed orders (any reviewer)
                conditions.push({
                    revisionCompletedBy: { not: null },
                });
            } else if (reviewedBy) {
                // Show orders reviewed by a specific person
                conditions.push({
                    revisionCompletedBy: {
                        equals: reviewedBy,
                        mode: "insensitive",
                    },
                });
            }

            // Source filter (UTM source)
            if (source) {
                conditions.push({ utmSource: source });
            }
            if (excludeSource) {
                conditions.push({ OR: [{ utmSource: { not: excludeSource } }, { utmSource: null }] });
            }

            // Date range
            if (dateFrom) {
                conditions.push({ createdAt: { gte: dateFrom } });
            }
            if (dateTo) {
                // Add one day to include the entire end date
                const endOfDay = new Date(dateTo);
                endOfDay.setHours(23, 59, 59, 999);
                conditions.push({ createdAt: { lte: endOfDay } });
            }

            const where: any = conditions.length > 0 ? { AND: conditions } : {};

            // Custom sorting based on filter type
            let orderBy: any;
            const isStreamingFilter = upsell === "STREAMING";
            if (status === "REVISION") {
                // Sort by revision queue (oldest first)
                orderBy = { revisionRequestedAt: "asc" as const };
            } else if (
                status === "PAID" ||
                status === "SONGS_PENDING" ||
                status === "SPOTIFY_PENDING" ||
                status === "SPOTIFY_IN_DISTRIBUTION" ||
                status === "SPOTIFY_PUBLISHED" ||
                status === "SPOTIFY_READY"
            ) {
                // Sort operational queues oldest first (work through queue in order)
                orderBy = { createdAt: "asc" as const };
            } else if (isStreamingFilter) {
                // For streaming, we'll sort in memory after fetching
                orderBy = { createdAt: "desc" as const };
            } else {
                orderBy = { [sortBy]: sortOrder };
            }

            // For streaming filter, fetch all and sort in memory by status priority
            const skipPagination = isStreamingFilter;

            // Parallel queries for data + count
            const [rawItems, totalCount] = await Promise.all([
                ctx.db.songOrder.findMany({
                    where,
                    orderBy,
                    skip: skipPagination ? 0 : (page - 1) * pageSize,
                    take: skipPagination ? 1000 : pageSize, // Fetch more for streaming filter
                    include: {
                        childOrders: {
                            select: {
                                id: true,
                                orderType: true,
                                recipientName: true,
                                status: true,
                                sentEmails: {
                                    where: {
                                        status: "SENT",
                                        template: "STREAMING_VIP_REMINDER",
                                    },
                                    select: {
                                        template: true,
                                        createdAt: true,
                                    },
                                    orderBy: {
                                        createdAt: "desc",
                                    },
                                },
                            },
                        },
                        parentOrder: {
                            select: {
                                id: true,
                                recipientName: true,
                                songFileUrl: true,
                                songFileUrl2: true,
                                kieTaskId: true,
                                kieAudioId1: true,
                                kieAudioId2: true,
                                status: true,
                                hasFastDelivery: true,
                                planType: true,
                            },
                        },
                        sentEmails: {
                            where: {
                                status: "SENT",
                                template: {
                                    in: ["CART_ABANDONMENT", "STREAMING_VIP_REMINDER"],
                                },
                            },
                            select: {
                                template: true,
                                createdAt: true,
                            },
                            orderBy: {
                                createdAt: "desc",
                            },
                        },
                    },
                }),
                ctx.db.songOrder.count({ where }),
            ]);

            // For streaming filter, sort by status priority: PAID → IN_PROGRESS → COMPLETED
            let items = rawItems;
            if (isStreamingFilter) {
                const statusPriority: Record<string, number> = {
                    PAID: 0,
                    IN_PROGRESS: 1,
                    COMPLETED: 2,
                };
                items = [...rawItems].sort((a, b) => {
                    const priorityA = statusPriority[a.status] ?? 99;
                    const priorityB = statusPriority[b.status] ?? 99;
                    if (priorityA !== priorityB) return priorityA - priorityB;
                    // Secondary sort by createdAt desc within same status
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
                // Apply pagination after sorting
                const start = (page - 1) * pageSize;
                items = items.slice(start, start + pageSize);
            }

            const canViewFinancials = ctx.adminUser.adminRole === "SUPER_ADMIN";
            const normalizedItems = items.map((item) =>
                withFinancialVisibility(normalizeReviewerFieldsInOrder(item), canViewFinancials)
            );

            return {
                items: normalizedItems,
                pagination: {
                    page,
                    pageSize,
                    totalCount,
                    totalPages: Math.ceil(totalCount / pageSize),
                    hasNextPage: page * pageSize < totalCount,
                    hasPrevPage: page > 1,
                },
            };
        }),

    // Get a single lead by ID (same structure as getLeadsPaginated items)
    getLeadById: adminProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const lead = await ctx.db.songOrder.findUnique({
                where: { id: input.id },
                include: {
                    childOrders: {
                        select: {
                            id: true,
                            orderType: true,
                            recipientName: true,
                            status: true,
                            sentEmails: {
                                where: {
                                    status: "SENT",
                                    template: "STREAMING_VIP_REMINDER",
                                },
                                select: {
                                    template: true,
                                    createdAt: true,
                                },
                                orderBy: {
                                    createdAt: "desc",
                                },
                            },
                        },
                    },
                    parentOrder: {
                        select: {
                            id: true,
                            recipientName: true,
                            songFileUrl: true,
                            songFileUrl2: true,
                            kieTaskId: true,
                            kieAudioId1: true,
                            kieAudioId2: true,
                            status: true,
                            hasFastDelivery: true,
                            planType: true,
                        },
                    },
                    sentEmails: {
                        where: {
                            status: "SENT",
                            template: {
                                in: ["CART_ABANDONMENT", "STREAMING_VIP_REMINDER"],
                            },
                        },
                        select: {
                            template: true,
                            createdAt: true,
                        },
                        orderBy: {
                            createdAt: "desc",
                        },
                    },
                },
            });

            if (!lead) {
                throw new Error("Lead not found");
            }

            return withFinancialVisibility(
                normalizeReviewerFieldsInOrder(lead),
                ctx.adminUser.adminRole === "SUPER_ADMIN"
            );
        }),

    // ============= FILTER OPTIONS =============
    getFilterOptions: adminProcedure.query(async ({ ctx }) => {
        const [genres, statuses, sources, stuckCount, noLyricsCount, spotifyReadyCount, spotifyPendingCount, spotifyInDistributionCount, spotifyPublishedCount, songsPendingCount] = await Promise.all([
            ctx.db.songOrder.findMany({
                select: { genre: true },
                distinct: ["genre"],
                where: { genre: { not: "" } },
            }),
            ctx.db.songOrder.groupBy({
                by: ["status"],
                _count: { status: true },
            }),
            ctx.db.songOrder.findMany({
                select: { utmSource: true },
                distinct: ["utmSource"],
                where: { utmSource: { not: null } },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: "IN_PROGRESS",
                    orderType: { not: "STREAMING_UPSELL" },
                    songFileUrl: null,
                    songFileUrl2: null,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS"] },
                    orderType: { not: "STREAMING_UPSELL" },
                    lyrics: null,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: "PAID",
                    streamingSongName: { not: null },
                    streamingCoverUrl: { not: null },
                    coverApproved: true,
                    preferredSongForStreaming: { not: null },
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: "PAID",
                    OR: [
                        { streamingSongName: null },
                        { streamingCoverUrl: null },
                        { coverApproved: false },
                        { preferredSongForStreaming: null },
                    ],
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: { in: ["IN_PROGRESS", "COMPLETED"] },
                    spotifyUrl: null,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: "COMPLETED",
                    spotifyUrl: { not: null },
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS"] },
                    orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
                    lyricsStatus: "completed",
                    lyrics: { not: null },
                    songFileUrl: null,
                },
            }),
        ]);

        const statusCountsList: { value: string; count: number }[] = statuses.map((s) => ({
            value: s.status as string,
            count: s._count.status,
        }));
        if (stuckCount > 0) {
            statusCountsList.push({ value: "STUCK", count: stuckCount });
        }
        if (noLyricsCount > 0) {
            statusCountsList.push({ value: "NO_LYRICS", count: noLyricsCount });
        }
        if (spotifyReadyCount > 0) {
            statusCountsList.push({ value: "SPOTIFY_READY", count: spotifyReadyCount });
        }
        if (spotifyPendingCount > 0) {
            statusCountsList.push({ value: "SPOTIFY_PENDING", count: spotifyPendingCount });
        }
        if (spotifyInDistributionCount > 0) {
            statusCountsList.push({ value: "SPOTIFY_IN_DISTRIBUTION", count: spotifyInDistributionCount });
        }
        if (spotifyPublishedCount > 0) {
            statusCountsList.push({ value: "SPOTIFY_PUBLISHED", count: spotifyPublishedCount });
        }
        if (songsPendingCount > 0) {
            statusCountsList.push({ value: "SONGS_PENDING", count: songsPendingCount });
        }

        return {
            genres: genres.map((g) => g.genre).filter(Boolean),
            statusCounts: statusCountsList,
            sources: sources.map((s) => s.utmSource).filter(Boolean) as string[],
        };
    }),

    // Lightweight stats used by the admin header/navigation.
    getAutomationNavStats: adminProcedure.query(async ({ ctx }) => {
        const songsPending = await ctx.db.songOrder.count({
            where: {
                status: { in: ["PAID", "IN_PROGRESS"] },
                orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
                lyricsStatus: "completed",
                lyrics: { not: null },
                songFileUrl: null,
                ...APOLLO_SOURCE_FILTER,
            },
        });

        return {
            songsPending,
        };
    }),

    // ============= BULK OPERATIONS =============
    bulkUpdateStatus: adminProcedure
        .input(
            z.object({
                ids: z.array(z.string()).min(1).max(100),
                status: SongOrderStatusEnum,
            })
        )
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db.songOrder.updateMany({
                where: { id: { in: input.ids } },
                data: { status: input.status },
            });

            // Convert supabase-import → supabase-convertido when marking as PAID
            if (input.status === "PAID") {
                await convertSupabaseImportOnPaid(input.ids);
            }

            return { updatedCount: result.count };
        }),

    bulkDelete: adminProcedure
        .input(
            z.object({
                ids: z.array(z.string()).min(1).max(100),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db.songOrder.deleteMany({
                where: { id: { in: input.ids } },
            });
            return { deletedCount: result.count };
        }),

    bulkSendDeliveryEmails: adminProcedure
        .input(
            z.object({
                ids: z.array(z.string()).min(1).max(100),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Fetch valid orders (IN_PROGRESS with song uploaded)
            const orders = await ctx.db.songOrder.findMany({
                where: {
                    id: { in: input.ids },
                    status: "IN_PROGRESS",
                    OR: [
                        { songFileUrl: { not: null } },
                        { songFileUrl2: { not: null } },
                    ],
                },
                include: {
                    childOrders: {
                        where: {
                            orderType: "GENRE_VARIANT",
                            hasLyrics: true,
                        },
                        select: { id: true, genre: true },
                    },
                },
            });

            let successCount = 0;
            let errorCount = 0;
            const errors: string[] = [];

            for (const order of orders) {
                try {
                    if (!order.email) {
                        throw new Error("No email");
                    }

                    const trackOrderUrl = `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`;

                    // Build genre variants array
                    const genreVariants = order.childOrders.map(gv => ({
                        orderId: gv.id,
                        genre: gv.genre,
                        trackOrderUrl: `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`,
                    }));

                    const emailData = buildSongDeliveryEmail({
                        orderId: order.id,
                        recipientName: order.recipientName,
                        locale: order.locale,
                        trackOrderUrl,
                        songFileUrl: order.songFileUrl ?? undefined,
                        songFileUrl2: order.songFileUrl2 ?? undefined,
                        hasCertificate: order.hasCertificate ?? false,
                        certificateToken: order.certificateToken,
                        hasLyrics: order.hasLyrics ?? false,
                        genreVariants,
                        customerEmail: order.email,
                    });

                    // Update order status first, regardless of email outcome
                    const now = new Date();
                    await ctx.db.songOrder.update({
                        where: { id: order.id },
                        data: {
                            status: "COMPLETED",
                            songDeliveredAt: now,
                        },
                    });

                    // Mark child orders as COMPLETED only if they already have audio
                    await ctx.db.songOrder.updateMany({
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
                            songDeliveredAt: now,
                        },
                    });

                    // Send email separately (best-effort)
                    try {
                        await sendEmail({
                            to: order.email,
                            template: "song-delivery",
                            orderId: order.id,
                            metadata: { recipientName: order.recipientName },
                            ...emailData,
                        });
                    } catch (emailError) {
                        console.error(`❌ [Admin] Bulk delivery email failed for order ${order.id} (status already COMPLETED):`, emailError);
                    }

                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push(`${order.email ?? order.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            }

            return {
                successCount,
                errorCount,
                skippedCount: input.ids.length - orders.length,
                errors: errors.slice(0, 10),
            };
        }),

    // ============= LEGACY: Lead Management - Fetch Pending Orders (kept for compatibility) =============
    getLeads: adminProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(100).default(50),
                cursor: z.string().nullish(), // Cursor for infinite query
                status: z.enum(["PENDING", "PAID", "IN_PROGRESS", "COMPLETED", "REVISION", "CANCELLED", "REFUNDED"]).optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            const limit = input.limit;
            const { cursor } = input;

            const items = await ctx.db.songOrder.findMany({
                take: limit + 1, // get an extra item at the end to know if there's a next page
                where: {
                    // If a specific status is requested, use it.
                    // If NO status is requested, filtered out finalized statuses (PAID/COMPLETED) to focus on leads,
                    // OR show everything? User said "leads tab". Usually means Pending.
                    // But user wants "full table with leads".
                    // Let's default to showing PENDING/IN_PROGRESS if no filter, or maybe ALL except PAID/COMPLETED?
                    // I'll stick to: if status provided, filter by it. If not, exclude PAID/COMPLETED (Sales).
                    status: input.status ? input.status : { notIn: ["PAID", "COMPLETED"] },
                },
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: { createdAt: "desc" },
                include: {
                    childOrders: {
                        select: {
                            id: true,
                            orderType: true,
                            recipientName: true,
                            status: true,
                        },
                    },
                    parentOrder: {
                        select: {
                            id: true,
                            recipientName: true,
                        },
                    },
                },
            });

            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > limit) {
                const nextItem = items.pop();
                nextCursor = nextItem!.id;
            }

            return {
                items,
                nextCursor,
            };
        }),

    // Dashboard Statistics
    getStats: adminProcedure.query(async ({ ctx }) => {
        // Date helpers - using São Paulo timezone (GMT-3)
        const nowUtc = new Date();
        const nowSP = toZonedTime(nowUtc, SAO_PAULO_TZ);

        // Calculate start of today in São Paulo time, then convert to UTC for DB queries
        const todayStartSP = new Date(nowSP.getFullYear(), nowSP.getMonth(), nowSP.getDate());
        const todayStart = fromZonedTime(todayStartSP, SAO_PAULO_TZ);

        const yesterdayStartSP = new Date(todayStartSP);
        yesterdayStartSP.setDate(yesterdayStartSP.getDate() - 1);
        const yesterdayStart = fromZonedTime(yesterdayStartSP, SAO_PAULO_TZ);

        const sevenDaysAgoSP = new Date(todayStartSP);
        sevenDaysAgoSP.setDate(sevenDaysAgoSP.getDate() - 7);
        const sevenDaysAgo = fromZonedTime(sevenDaysAgoSP, SAO_PAULO_TZ);

        const thisMonthStartSP = new Date(nowSP.getFullYear(), nowSP.getMonth(), 1);
        const thisMonthStart = fromZonedTime(thisMonthStartSP, SAO_PAULO_TZ);

        const lastMonthStartSP = new Date(nowSP.getFullYear(), nowSP.getMonth() - 1, 1);
        const lastMonthStart = fromZonedTime(lastMonthStartSP, SAO_PAULO_TZ);

        const lastMonthEndSP = new Date(nowSP.getFullYear(), nowSP.getMonth(), 0, 23, 59, 59, 999);
        const lastMonthEnd = fromZonedTime(lastMonthEndSP, SAO_PAULO_TZ);

        // Helper to get net revenue for a date range (Stripe net USD only)
        // Use paymentCompletedAt (not createdAt) to match Stripe's reporting dates
        const getNetRevenue = async (from: Date, to?: Date, locale?: string) => {
            const where: Prisma.SongOrderWhereInput = {
                status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                ...excludeSupabase,
                paymentCompletedAt: {
                    gte: from,
                    ...(to ? { lte: to } : {}),
                },
                ...(locale ? { locale } : {}),
            };

            const stripeAgg = await ctx.db.songOrder.aggregate({
                _sum: { stripeNetAmount: true },
                where: { ...where, stripeNetAmount: { not: null } },
            });

            return (stripeAgg._sum.stripeNetAmount || 0) / 100;
        };

        // Helper to count orders for a date range (by payment date)
        const getOrderCount = async (from: Date, to?: Date) => {
            return ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    paymentCompletedAt: {
                        gte: from,
                        ...(to ? { lte: to } : {}),
                    },
                },
            });
        };

        // Fetch stats in sequential batches (max 5 concurrent) to avoid pool exhaustion
        const paidStatuses: ("PAID" | "IN_PROGRESS" | "COMPLETED")[] = ["PAID", "IN_PROGRESS", "COMPLETED"];
        const excludeSupabase = APOLLO_SOURCE_FILTER;
        const paidWhere = { status: { in: paidStatuses }, ...excludeSupabase };

        // Batch 1: Revenue by period (5 queries)
        const [netToday, netYesterday, netLast7Days, netThisMonth, netLastMonth] = await Promise.all([
            getNetRevenue(todayStart),
            getNetRevenue(yesterdayStart, todayStart),
            getNetRevenue(sevenDaysAgo),
            getNetRevenue(thisMonthStart),
            getNetRevenue(lastMonthStart, lastMonthEnd),
        ]);

        // Batch 2: Order counts by period (5 queries)
        const [ordersToday, ordersYesterday, ordersLast7Days, ordersThisMonth, ordersLastMonth] = await Promise.all([
            getOrderCount(todayStart),
            getOrderCount(yesterdayStart, todayStart),
            getOrderCount(sevenDaysAgo),
            getOrderCount(thisMonthStart),
            getOrderCount(lastMonthStart, lastMonthEnd),
        ]);

        // Batch 3: Aggregate counts (5 queries)
        const [totalOrders, totalFormSubmissions, paidOrders, ordersEN, ordersPT] = await Promise.all([
            ctx.db.songOrder.count({
                where: { ...paidWhere, orderType: { not: "MUSICIAN_TIP" } },
            }),
            ctx.db.songOrder.count({
                where: { quizCompletedAt: { not: null }, ...excludeSupabase },
            }),
            ctx.db.songOrder.count({
                where: paidWhere,
            }),
            ctx.db.songOrder.count({
                where: { ...paidWhere, locale: "en" },
            }),
            ctx.db.songOrder.count({
                where: { ...paidWhere, locale: "pt" },
            }),
        ]);

        // Batch 4: More locale counts + total revenue (6 queries)
        const [ordersES, ordersFR, ordersIT, totalRevenue, musicianTipNet, musicLovelyCountToday] = await Promise.all([
            ctx.db.songOrder.count({
                where: { ...paidWhere, locale: "es" },
            }),
            ctx.db.songOrder.count({
                where: { ...paidWhere, locale: "fr" },
            }),
            ctx.db.songOrder.count({
                where: { ...paidWhere, locale: "it" },
            }),
            (async () => {
                const where: Prisma.SongOrderWhereInput = { ...paidWhere, orderType: { not: "MUSICIAN_TIP" } };
                const stripeAgg = await ctx.db.songOrder.aggregate({
                    _sum: { stripeNetAmount: true },
                    where: { ...where, stripeNetAmount: { not: null } },
                });
                return (stripeAgg._sum.stripeNetAmount || 0) / 100;
            })(),
            (async () => {
                const where: Prisma.SongOrderWhereInput = {
                    ...paidWhere,
                    orderType: "MUSICIAN_TIP",
                };
                const stripeAgg = await ctx.db.songOrder.aggregate({
                    _sum: { stripeNetAmount: true },
                    where: { ...where, stripeNetAmount: { not: null } },
                });
                return (stripeAgg._sum.stripeNetAmount || 0) / 100;
            })(),
            // MusicLovely revenue for today (Supabase Import + Convertido) - fixed R$47.00 per order
            ctx.db.songOrder.count({
                where: {
                    utmSource: { in: [MUSIC_LOVELY_SOURCE, MUSIC_LOVELY_CONVERTED_SOURCE] },
                    supabasePaidAt: { gte: todayStart },
                },
            }),
        ]);

        // Batch 5: Musician tip today + streaming VIP (3 entries, peak ~5 connections from nested queries)
        const [musicianTipToday, streamingVipAllTime, streamingVipToday] = await Promise.all([
            (async () => {
                const where: Prisma.SongOrderWhereInput = {
                    ...paidWhere,
                    orderType: "MUSICIAN_TIP",
                    createdAt: { gte: todayStart },
                };
                const stripeAgg = await ctx.db.songOrder.aggregate({
                    _sum: { stripeNetAmount: true },
                    where: { ...where, stripeNetAmount: { not: null } },
                });
                return (stripeAgg._sum.stripeNetAmount || 0) / 100;
            })(),
            (async () => {
                const where: Prisma.SongOrderWhereInput = {
                    ...paidWhere,
                    orderType: "STREAMING_UPSELL",
                };
                const [stripeAgg, count] = await Promise.all([
                    ctx.db.songOrder.aggregate({
                        _sum: { stripeNetAmount: true },
                        where: { ...where, stripeNetAmount: { not: null } },
                    }),
                    ctx.db.songOrder.count({ where }),
                ]);
                return { value: (stripeAgg._sum.stripeNetAmount || 0) / 100, count };
            })(),
            (async () => {
                const where: Prisma.SongOrderWhereInput = {
                    ...paidWhere,
                    orderType: "STREAMING_UPSELL",
                    createdAt: { gte: todayStart },
                };
                const [stripeAgg, count] = await Promise.all([
                    ctx.db.songOrder.aggregate({
                        _sum: { stripeNetAmount: true },
                        where: { ...where, stripeNetAmount: { not: null } },
                    }),
                    ctx.db.songOrder.count({ where }),
                ]);
                return { value: (stripeAgg._sum.stripeNetAmount || 0) / 100, count };
            })(),
        ]);

        // Batch 6: Locale revenue - today (5 queries)
        const [netTodayEN, netTodayPT, netTodayES, netTodayFR, netTodayIT] = await Promise.all([
            getNetRevenue(todayStart, undefined, "en"),
            getNetRevenue(todayStart, undefined, "pt"),
            getNetRevenue(todayStart, undefined, "es"),
            getNetRevenue(todayStart, undefined, "fr"),
            getNetRevenue(todayStart, undefined, "it"),
        ]);

        // Batch 7: Locale revenue - yesterday (5 queries)
        const [netYesterdayEN, netYesterdayPT, netYesterdayES, netYesterdayFR, netYesterdayIT] = await Promise.all([
            getNetRevenue(yesterdayStart, todayStart, "en"),
            getNetRevenue(yesterdayStart, todayStart, "pt"),
            getNetRevenue(yesterdayStart, todayStart, "es"),
            getNetRevenue(yesterdayStart, todayStart, "fr"),
            getNetRevenue(yesterdayStart, todayStart, "it"),
        ]);

        // Batch 8: Locale revenue - last 7 days (5 queries)
        const [net7DaysEN, net7DaysPT, net7DaysES, net7DaysFR, net7DaysIT] = await Promise.all([
            getNetRevenue(sevenDaysAgo, undefined, "en"),
            getNetRevenue(sevenDaysAgo, undefined, "pt"),
            getNetRevenue(sevenDaysAgo, undefined, "es"),
            getNetRevenue(sevenDaysAgo, undefined, "fr"),
            getNetRevenue(sevenDaysAgo, undefined, "it"),
        ]);

        // Batch 9: Locale revenue - this month (5 queries)
        const [netThisMonthEN, netThisMonthPT, netThisMonthES, netThisMonthFR, netThisMonthIT] = await Promise.all([
            getNetRevenue(thisMonthStart, undefined, "en"),
            getNetRevenue(thisMonthStart, undefined, "pt"),
            getNetRevenue(thisMonthStart, undefined, "es"),
            getNetRevenue(thisMonthStart, undefined, "fr"),
            getNetRevenue(thisMonthStart, undefined, "it"),
        ]);

        const pendingSongBaseWhere: Prisma.SongOrderWhereInput = {
            status: { in: ["PAID", "IN_PROGRESS"] },
            orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
            lyricsStatus: "completed",
            lyrics: { not: null },
            songFileUrl: null,
            ...excludeSupabase,
        };
        const turboPlanPendingSongWhere: Prisma.SongOrderWhereInput = {
            ...pendingSongBaseWhere,
            OR: [
                { planType: "acelerado" },
                { parentOrder: { is: { planType: "acelerado" } } },
            ],
        };
        const expressPlanPendingSongWhere: Prisma.SongOrderWhereInput = {
            ...pendingSongBaseWhere,
            AND: [
                {
                    NOT: {
                        OR: [
                            { planType: "acelerado" },
                            { parentOrder: { is: { planType: "acelerado" } } },
                        ],
                    },
                },
                {
                    OR: [
                        { hasFastDelivery: true },
                        { planType: "express" },
                        { parentOrder: { is: { hasFastDelivery: true } } },
                        { parentOrder: { is: { planType: "express" } } },
                    ],
                },
            ],
        };
        const essentialPlanPendingSongWhere: Prisma.SongOrderWhereInput = {
            ...pendingSongBaseWhere,
            AND: [
                {
                    NOT: {
                        OR: [
                            { planType: "acelerado" },
                            { parentOrder: { is: { planType: "acelerado" } } },
                            { hasFastDelivery: true },
                            { planType: "express" },
                            { parentOrder: { is: { hasFastDelivery: true } } },
                            { parentOrder: { is: { planType: "express" } } },
                        ],
                    },
                },
            ],
        };

        // Batch 10: Pending counts
        const [
            pendingRevisionsCount,
            pendingRevisionsKeepCurrentCount,
            pendingRevisionsSuggestNewCount,
            pendingStreamingVipCount,
            readyStreamingVipCount,
            inDistributionStreamingVipCount,
            publishedStreamingVipCount,
            pendingSongGenerationCount,
            pendingSongs6h,
            pendingSongs24h,
            pendingSongs7d,
        ] = await Promise.all([
            ctx.db.songOrder.count({
                where: { status: "REVISION", ...excludeSupabase },
            }),
            ctx.db.songOrder.count({
                where: { status: "REVISION", melodyPreference: "KEEP_CURRENT", ...excludeSupabase },
            }),
            ctx.db.songOrder.count({
                where: { status: "REVISION", melodyPreference: "SUGGEST_NEW", ...excludeSupabase },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: "PAID",
                    OR: [
                        { streamingSongName: null },
                        { streamingCoverUrl: null },
                        { coverApproved: false },
                        { preferredSongForStreaming: null },
                    ],
                    ...excludeSupabase,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: "PAID",
                    streamingSongName: { not: null },
                    streamingCoverUrl: { not: null },
                    coverApproved: true,
                    preferredSongForStreaming: { not: null },
                    ...excludeSupabase,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: { in: ["IN_PROGRESS", "COMPLETED"] },
                    spotifyUrl: null,
                    ...excludeSupabase,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    orderType: "STREAMING_UPSELL",
                    status: "COMPLETED",
                    spotifyUrl: { not: null },
                    ...excludeSupabase,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS"] },
                    orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
                    lyricsStatus: "completed",
                    lyrics: { not: null },
                    songFileUrl: null,
                    ...excludeSupabase,
                },
            }),
            ctx.db.songOrder.count({
                where: turboPlanPendingSongWhere,
            }),
            ctx.db.songOrder.count({
                where: expressPlanPendingSongWhere,
            }),
            ctx.db.songOrder.count({
                where: essentialPlanPendingSongWhere,
            }),
        ]);

        // Genre statistics (grouped by genre and locale for filtering)
        const genreStatsRaw = await ctx.db.songOrder.groupBy({
            by: ['genre', 'locale'],
            where: {
                status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                orderType: "MAIN",
                ...excludeSupabase,
            },
            _count: { genre: true },
        });

        // Aggregate genre stats (all locales combined)
        const genreAggregated = new Map<string, number>();
        genreStatsRaw.forEach(g => {
            if (g.genre) {
                genreAggregated.set(g.genre, (genreAggregated.get(g.genre) || 0) + g._count.genre);
            }
        });
        const genreStats = Array.from(genreAggregated.entries())
            .map(([genre, count]) => ({ genre, count }))
            .sort((a, b) => b.count - a.count);

        // Genre stats by locale for filtering
        const genreStatsByLocale: Record<string, { genre: string; count: number }[]> = {
            all: genreStats,
            en: [],
            pt: [],
            es: [],
            fr: [],
            it: [],
        };
        genreStatsRaw.forEach(g => {
            if (g.genre && g.locale && genreStatsByLocale[g.locale]) {
                genreStatsByLocale[g.locale]!.push({ genre: g.genre, count: g._count.genre });
            }
        });
        // Sort each locale's stats
        Object.keys(genreStatsByLocale).forEach(locale => {
            genreStatsByLocale[locale] = genreStatsByLocale[locale]!.sort((a, b) => b.count - a.count);
        });

        // Calculate conversion rate
        const conversionRate = totalFormSubmissions > 0
            ? (paidOrders / totalFormSubmissions) * 100
            : 0;

        // Chart data (last 30 days)
        const thirtyDaysAgoSP = new Date(todayStartSP);
        thirtyDaysAgoSP.setDate(thirtyDaysAgoSP.getDate() - 30);
        const thirtyDaysAgo = fromZonedTime(thirtyDaysAgoSP, SAO_PAULO_TZ);

        const checkouts = await ctx.db.songOrder.findMany({
            where: {
                status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                ...excludeSupabase,
                createdAt: { gte: thirtyDaysAgo },
            },
            select: { createdAt: true, stripeNetAmount: true },
            orderBy: { createdAt: "asc" },
        });

        type ChartDataPoint = { date: string; revenue: number; orders: number };
        const chartDataMap: Record<string, ChartDataPoint> = {};

        checkouts.forEach((order) => {
            if (order.createdAt) {
                // Convert to São Paulo timezone for grouping by local date
                const spDate = toZonedTime(order.createdAt, SAO_PAULO_TZ);
                const date = `${spDate.getFullYear()}-${String(spDate.getMonth() + 1).padStart(2, "0")}-${String(spDate.getDate()).padStart(2, "0")}`;
                if (!chartDataMap[date]) {
                    chartDataMap[date] = { date, revenue: 0, orders: 0 };
                }
                // Stripe net only, ignore priceAtOrder fallbacks
                const amount = order.stripeNetAmount || 0;
                chartDataMap[date]!.revenue += amount / 100;
                chartDataMap[date]!.orders += 1;
            }
        });

        // Hourly sales data (all-time, grouped by hour of day in São Paulo timezone)
        const allPaidOrders = await ctx.db.songOrder.findMany({
            where: {
                status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                ...excludeSupabase,
            },
            select: { createdAt: true },
        });

        // Initialize hourly data (0-23 hours)
        const hourlyData: { hour: number; label: string; orders: number }[] = [];
        for (let h = 0; h < 24; h++) {
            hourlyData.push({
                hour: h,
                label: `${String(h).padStart(2, "0")}:00`,
                orders: 0,
            });
        }

        // Count orders by hour
        allPaidOrders.forEach((order) => {
            if (order.createdAt) {
                const spDate = toZonedTime(order.createdAt, SAO_PAULO_TZ);
                const hour = spDate.getHours();
                hourlyData[hour]!.orders += 1;
            }
        });

        // Calculate average ticket (AOV)
        const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        // Order Bump Statistics (5 order bumps: Lyrics PDF, Certificate, Extra Song, Genre Variant, Streaming VIP)
        // Note: Fast Delivery is a plan type (express vs essencial), NOT an order bump
        const [
            certificateCount,
            lyricsCount,
            extraSongCount,
            genreVariantCount,
            streamingUpsellCount,
            customersWithAnyBump,
        ] = await Promise.all([
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    hasCertificate: true,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    hasLyrics: true,
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    orderType: "EXTRA_SONG",
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    orderType: "GENRE_VARIANT",
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    orderType: "STREAMING_UPSELL",
                },
            }),
            // Count MAIN orders that have at least one order bump
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    orderType: "MAIN",
                    OR: [
                        { hasLyrics: true },
                        { hasCertificate: true },
                        { childOrders: { some: { orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT", "STREAMING_UPSELL"] } } } },
                    ],
                },
            }),
        ]);

        // Total MAIN orders (for bump adoption rate calculation)
        const totalMainOrders = await ctx.db.songOrder.count({
            where: {
                status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                ...excludeSupabase,
                orderType: "MAIN",
            },
        });

        // Delivery plan distribution (Turbo 6h vs Express 24h vs Essencial 7d)
        const [turboCount, expressCount, essencialCount] = await Promise.all([
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    orderType: "MAIN",
                    planType: "acelerado",
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    orderType: "MAIN",
                    AND: [
                        { NOT: { planType: "acelerado" } },
                        {
                            OR: [
                                { hasFastDelivery: true },
                                { planType: "express" },
                            ],
                        },
                    ],
                },
            }),
            ctx.db.songOrder.count({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    orderType: "MAIN",
                    AND: [
                        APOLLO_SOURCE_FILTER,
                        {
                            NOT: {
                                OR: [
                                    { planType: "acelerado" },
                                    { hasFastDelivery: true },
                                    { planType: "express" },
                                ],
                            },
                        },
                    ],
                },
            }),
        ]);
        const turboPercent = totalMainOrders > 0 ? (turboCount / totalMainOrders) * 100 : 0;
        const expressPercent = totalMainOrders > 0 ? (expressCount / totalMainOrders) * 100 : 0;
        const essencialPercent = totalMainOrders > 0 ? (essencialCount / totalMainOrders) * 100 : 0;

        const orderBumpStats = [
            { name: "Lyrics PDF", count: lyricsCount, color: "#3b82f6" },
            { name: "Certificate", count: certificateCount, color: "#eab308" },
            { name: "Extra Song", count: extraSongCount, color: "#22c55e" },
            { name: "Genre Variant", count: genreVariantCount, color: "#a855f7" },
            { name: "Streaming VIP", count: streamingUpsellCount, color: "#0ea5e9" },
        ].sort((a, b) => b.count - a.count);

        const bumpAdoptionRate = totalMainOrders > 0
            ? (customersWithAnyBump / totalMainOrders) * 100
            : 0;

        // Reviewer statistics (historical): include completed revisions from revisionHistory
        // plus the current completed revision fields on each order.
        // This prevents counts from "disappearing" when a new revision resets revisionCompletedBy to null.
        const reviewerOrders = await ctx.db.songOrder.findMany({
            where: {
                ...excludeSupabase,
                OR: [
                    { revisionCompletedBy: { not: null } },
                    { revisionCount: { gt: 0 } },
                ],
            },
            select: {
                revisionCompletedBy: true,
                revisionCompletedAt: true,
                revisionHistory: true,
                revisionCount: true,
            },
        });

        const reviewerTotalMap = new Map<string, number>();
        const reviewerTodayMap = new Map<string, number>();
        const reviewerYesterdayMap = new Map<string, number>();
        const reviewerLast7DaysMap = new Map<string, number>();
        const reviewerWorkedDaysMap = new Map<string, Set<string>>();
        const reviewerDisplayNameMap = new Map<string, string>();

        const resolveReviewerIdentityForStats = (rawName: string | null | undefined): { key: string; displayName: string } | null => {
            const reviewerIdentity = getReviewerIdentity(rawName);
            if (!reviewerIdentity) return null;
            const preferredDisplayName = pickPreferredReviewerDisplayName(
                reviewerDisplayNameMap.get(reviewerIdentity.key),
                reviewerIdentity.displayName
            );
            reviewerDisplayNameMap.set(reviewerIdentity.key, preferredDisplayName);
            return {
                key: reviewerIdentity.key,
                displayName: preferredDisplayName,
            };
        };

        const addCount = (map: Map<string, number>, reviewerKey: string) => {
            map.set(reviewerKey, (map.get(reviewerKey) ?? 0) + 1);
        };

        const getReviewerDayKey = (date: Date): string => {
            const spDate = toZonedTime(date, SAO_PAULO_TZ);
            const year = spDate.getFullYear();
            const month = String(spDate.getMonth() + 1).padStart(2, "0");
            const day = String(spDate.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };

        const addCompletionEvent = (rawName: string | null | undefined, completedAt: Date | null) => {
            const reviewerIdentity = resolveReviewerIdentityForStats(rawName);
            if (!reviewerIdentity) return;

            addCount(reviewerTotalMap, reviewerIdentity.key);

            if (completedAt) {
                const dayKey = getReviewerDayKey(completedAt);
                const workedDays = reviewerWorkedDaysMap.get(reviewerIdentity.key) ?? new Set<string>();
                workedDays.add(dayKey);
                reviewerWorkedDaysMap.set(reviewerIdentity.key, workedDays);
            }

            if (completedAt && completedAt >= todayStart) {
                addCount(reviewerTodayMap, reviewerIdentity.key);
            }

            if (completedAt && completedAt >= yesterdayStart && completedAt < todayStart) {
                addCount(reviewerYesterdayMap, reviewerIdentity.key);
            }

            if (completedAt && completedAt >= sevenDaysAgo) {
                addCount(reviewerLast7DaysMap, reviewerIdentity.key);
            }
        };

        for (const order of reviewerOrders) {
            const normalizedHistory = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount }) as Array<Record<string, unknown> & { revisionNumber: number }>;

            const historyCompletions = normalizedHistory
                .map((entry) => ({
                    completedBy: typeof entry.completedBy === "string" ? entry.completedBy : null,
                    completedAt: parsePossibleDate(entry.completedAt),
                }))
                .filter((entry): entry is { completedBy: string; completedAt: Date | null } => !!entry.completedBy);

            for (const completion of historyCompletions) {
                addCompletionEvent(completion.completedBy, completion.completedAt);
            }

            if (order.revisionCompletedBy) {
                const currentCompletedAt = order.revisionCompletedAt ?? null;
                const currentCompletedIdentity = resolveReviewerIdentityForStats(order.revisionCompletedBy);
                const currentCompletedByKey = currentCompletedIdentity?.key ?? null;

                // Avoid double counting if current completion is already archived in history.
                const existsInHistory = currentCompletedByKey
                    ? historyCompletions.some((completion) => {
                        const historyIdentity = getReviewerIdentity(completion.completedBy);
                        if (!historyIdentity || historyIdentity.key !== currentCompletedByKey) return false;
                        if (!completion.completedAt && !currentCompletedAt) return true;
                        if (!completion.completedAt || !currentCompletedAt) return false;
                        return completion.completedAt.getTime() === currentCompletedAt.getTime();
                    })
                    : false;

                if (!existsInHistory) {
                    addCompletionEvent(order.revisionCompletedBy, currentCompletedAt);
                }
            }
        }

        const reviewerStats = sortReviewerCountMap(reviewerTotalMap, reviewerDisplayNameMap);
        const reviewerStatsToday = sortReviewerCountMap(reviewerTodayMap, reviewerDisplayNameMap);
        const reviewerStatsYesterday = sortReviewerCountMap(reviewerYesterdayMap, reviewerDisplayNameMap);
        const reviewerStatsLast7Days = sortReviewerCountMap(reviewerLast7DaysMap, reviewerDisplayNameMap);
        const reviewerStatsWorkedDayAverage = Array.from(reviewerTotalMap.entries())
            .map(([reviewerKey, count]) => {
                const workedDays = reviewerWorkedDaysMap.get(reviewerKey)?.size ?? 0;
                const average = workedDays > 0 ? count / workedDays : 0;
                return {
                    name: reviewerDisplayNameMap.get(reviewerKey) ?? capitalizeWords(reviewerKey) ?? reviewerKey,
                    average,
                    workedDays,
                };
            })
            .sort((a, b) => {
                if (b.average !== a.average) return b.average - a.average;
                if (b.workedDays !== a.workedDays) return b.workedDays - a.workedDays;
                return b.name.localeCompare(a.name, "pt-BR");
            });

        // ============ TOP CUSTOMERS RANKINGS ============

        // Get all paid orders with email for customer rankings
        const allCustomerOrders = await ctx.db.songOrder.findMany({
            where: {
                status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                ...excludeSupabase,
            },
            select: {
                email: true,
                backupWhatsApp: true,
                stripeNetAmount: true,
                orderType: true,
            },
        });

        // Build a map of email -> whatsapp (keep the most recent non-null)
        const emailToWhatsApp = new Map<string, string | null>();
        allCustomerOrders.forEach(o => {
            if (o.email && o.backupWhatsApp) {
                emailToWhatsApp.set(o.email, o.backupWhatsApp);
            }
        });

        // Top customers by total spent
        const spenderMap = new Map<string, { total: number; count: number }>();
        allCustomerOrders.forEach(o => {
            if (o.email && o.stripeNetAmount) {
                const current = spenderMap.get(o.email) || { total: 0, count: 0 };
                current.total += o.stripeNetAmount;
                current.count += 1;
                spenderMap.set(o.email, current);
            }
        });
        const topSpenders = Array.from(spenderMap.entries())
            .map(([email, data]) => ({
                email,
                whatsapp: emailToWhatsApp.get(email) || null,
                totalSpent: data.total / 100,
                orderCount: data.count,
            }))
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 10);

        // Top tip donors
        const tipDonorMap = new Map<string, { total: number; count: number }>();
        allCustomerOrders.filter(o => o.orderType === "MUSICIAN_TIP").forEach(o => {
            if (o.email && o.stripeNetAmount) {
                const current = tipDonorMap.get(o.email) || { total: 0, count: 0 };
                current.total += o.stripeNetAmount;
                current.count += 1;
                tipDonorMap.set(o.email, current);
            }
        });
        const topTipDonors = Array.from(tipDonorMap.entries())
            .map(([email, data]) => ({
                email,
                whatsapp: emailToWhatsApp.get(email) || null,
                totalTips: data.total / 100,
                tipCount: data.count,
            }))
            .sort((a, b) => b.totalTips - a.totalTips)
            .slice(0, 10);

        // Top Spotify/Streaming buyers
        const streamingBuyerMap = new Map<string, { total: number; count: number }>();
        allCustomerOrders.filter(o => o.orderType === "STREAMING_UPSELL").forEach(o => {
            if (o.email && o.stripeNetAmount) {
                const current = streamingBuyerMap.get(o.email) || { total: 0, count: 0 };
                current.total += o.stripeNetAmount;
                current.count += 1;
                streamingBuyerMap.set(o.email, current);
            }
        });
        const topStreamingBuyers = Array.from(streamingBuyerMap.entries())
            .map(([email, data]) => ({
                email,
                whatsapp: emailToWhatsApp.get(email) || null,
                totalSpent: data.total / 100,
                purchaseCount: data.count,
            }))
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 10);

        // Repeat customers (multiple MAIN orders)
        const mainOrderMap = new Map<string, number>();
        allCustomerOrders.filter(o => o.orderType === "MAIN").forEach(o => {
            if (o.email) {
                mainOrderMap.set(o.email, (mainOrderMap.get(o.email) || 0) + 1);
            }
        });
        const repeatCustomers = Array.from(mainOrderMap.entries())
            .filter(([, count]) => count > 1)
            .map(([email, orderCount]) => ({
                email,
                whatsapp: emailToWhatsApp.get(email) || null,
                orderCount,
            }))
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 10);

        // Repeat customer stats
        const totalUniqueCustomers = mainOrderMap.size;
        const repeatCustomerCount = Array.from(mainOrderMap.values()).filter(c => c > 1).length;
        const repeatCustomerRate = totalUniqueCustomers > 0
            ? (repeatCustomerCount / totalUniqueCustomers) * 100
            : 0;

        // Calculate average daily net revenue (all-time)
        const firstOrder = await ctx.db.songOrder.findFirst({
            where: { status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] }, ...excludeSupabase },
            orderBy: { createdAt: "asc" },
            select: { createdAt: true },
        });

        // Total all-time net revenue (uses Stripe net only)
        const totalNetAllTime = await (async () => {
            const stripeAgg = await ctx.db.songOrder.aggregate({
                _sum: { stripeNetAmount: true },
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...excludeSupabase,
                    stripeNetAmount: { not: null },
                },
            });
            return (stripeAgg._sum.stripeNetAmount || 0) / 100;
        })();

        const headlineAbPeriodDays = 14;
        const headlineAbExperiment = "home_headline_expression_vs_emotion_v2";
        const headlineAbRows = await ctx.db.$queryRaw<HeadlineAbVariantRow[]>`
            SELECT
                COALESCE(NULLIF(SUBSTRING("landingPage" FROM 'ab_headline_variant=([AB])'), ''), 'unknown') AS variant,
                COUNT(*)::int AS leads,
                COUNT(*) FILTER (
                    WHERE "status" IN ('PAID', 'IN_PROGRESS', 'COMPLETED', 'REVISION')
                )::int AS converted
            FROM "SongOrder"
            WHERE "orderType" = 'MAIN'
              AND "createdAt" >= NOW() - (${headlineAbPeriodDays}::int * INTERVAL '1 day')
              AND "landingPage" LIKE '%ab_experiment=' || ${headlineAbExperiment} || '%'
            GROUP BY 1
            ORDER BY 1
        `;
        const headlineAbStats = buildHeadlineAbSummary(headlineAbRows, headlineAbPeriodDays);

        let averageDailyNet = 0;
        let totalDaysActive = 0;
        if (firstOrder?.createdAt) {
            const firstOrderDate = toZonedTime(firstOrder.createdAt, SAO_PAULO_TZ);
            const firstOrderDay = new Date(firstOrderDate.getFullYear(), firstOrderDate.getMonth(), firstOrderDate.getDate());
            const daysDiff = Math.ceil((todayStartSP.getTime() - firstOrderDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            totalDaysActive = daysDiff;
            averageDailyNet = daysDiff > 0 ? totalNetAllTime / daysDiff : 0;
        }

        const stats = {
            netToday,
            netYesterday,
            netLast7Days,
            netThisMonth,
            netLastMonth,
            ordersToday,
            ordersYesterday,
            ordersLast7Days,
            ordersThisMonth,
            ordersLastMonth,
            totalOrders,
            ordersEN,
            ordersPT,
            ordersES,
            ordersFR,
            ordersIT,
            netTodayEN,
            netTodayPT,
            netTodayES,
            netTodayFR,
            netTodayIT,
            netYesterdayEN,
            netYesterdayPT,
            netYesterdayES,
            netYesterdayFR,
            netYesterdayIT,
            net7DaysEN,
            net7DaysPT,
            net7DaysES,
            net7DaysFR,
            net7DaysIT,
            netThisMonthEN,
            netThisMonthPT,
            netThisMonthES,
            netThisMonthFR,
            netThisMonthIT,
            conversionRate,
            averageTicket,
            musicianTipNet,
            musicianTipToday,
            musicLovelyRevenueToday: musicLovelyCountToday * 47, // R$47.00 fixed
            streamingVipNet: streamingVipAllTime.value,
            streamingVipCount: streamingVipAllTime.count,
            streamingVipNetToday: streamingVipToday.value,
            streamingVipCountToday: streamingVipToday.count,
            chartData: Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date)),
            hourlyData,
            genreStats,
            genreStatsByLocale,
            orderBumpStats,
            bumpAdoptionRate,
            customersWithAnyBump,
            totalMainOrders,
            turboCount,
            expressCount,
            essencialCount,
            turboPercent,
            expressPercent,
            essencialPercent,
            pendingRevisionsCount,
            pendingRevisionsKeepCurrentCount,
            pendingRevisionsSuggestNewCount,
            pendingStreamingVipCount,
            readyStreamingVipCount,
            inDistributionStreamingVipCount,
            publishedStreamingVipCount,
            pendingSongGenerationCount,
            pendingSongs6h,
            pendingSongs24h,
            pendingSongs7d,
            reviewerStats,
            reviewerStatsToday,
            reviewerStatsYesterday,
            reviewerStatsLast7Days,
            reviewerStatsWorkedDayAverage,
            // Customer rankings
            topSpenders,
            topTipDonors,
            topStreamingBuyers,
            repeatCustomers,
            repeatCustomerRate,
            totalUniqueCustomers,
            // Average daily stats
            averageDailyNet,
            totalDaysActive,
            totalNetAllTime,
            headlineAbStats,
        };

        if (ctx.adminUser.adminRole === "SUPER_ADMIN") {
            return stats;
        }

        return {
            ...stats,
            netToday: 0,
            netYesterday: 0,
            netLast7Days: 0,
            netThisMonth: 0,
            netLastMonth: 0,
            netTodayEN: 0,
            netTodayPT: 0,
            netTodayES: 0,
            netTodayFR: 0,
            netTodayIT: 0,
            netYesterdayEN: 0,
            netYesterdayPT: 0,
            netYesterdayES: 0,
            netYesterdayFR: 0,
            netYesterdayIT: 0,
            net7DaysEN: 0,
            net7DaysPT: 0,
            net7DaysES: 0,
            net7DaysFR: 0,
            net7DaysIT: 0,
            netThisMonthEN: 0,
            netThisMonthPT: 0,
            netThisMonthES: 0,
            netThisMonthFR: 0,
            netThisMonthIT: 0,
            averageTicket: 0,
            musicianTipNet: 0,
            musicianTipToday: 0,
            musicLovelyRevenueToday: 0,
            streamingVipNet: 0,
            streamingVipNetToday: 0,
            chartData: stats.chartData.map((point) => ({ ...point, revenue: 0 })),
            topSpenders: [],
            topTipDonors: [],
            topStreamingBuyers: [],
            averageDailyNet: 0,
            totalNetAllTime: 0,
        };
    }),

    // Monthly Revenue (all-time history)
    getMonthlyRevenue: adminProcedure.query(async ({ ctx }) => {
        const paidStatuses = ["PAID", "IN_PROGRESS", "COMPLETED"] as const;

        // Find earliest paid order
        const earliest = await ctx.db.songOrder.findFirst({
            where: {
                status: { in: [...paidStatuses] },
                paymentCompletedAt: { not: null },
                ...APOLLO_SOURCE_FILTER,
            },
            orderBy: { paymentCompletedAt: "asc" },
            select: { paymentCompletedAt: true },
        });

        if (!earliest?.paymentCompletedAt) {
            return { months: [], totalNet: 0 };
        }

        const nowUtc = new Date();
        const nowSP = toZonedTime(nowUtc, SAO_PAULO_TZ);
        const currentYear = nowSP.getFullYear();
        const currentMonth = nowSP.getMonth() + 1;

        const startSP = toZonedTime(earliest.paymentCompletedAt, SAO_PAULO_TZ);
        let year = startSP.getFullYear();
        let month = startSP.getMonth() + 1;

        // Build list of months from earliest to current
        const monthRanges: { year: number; month: number; from: Date; to: Date }[] = [];
        while (year < currentYear || (year === currentYear && month <= currentMonth)) {
            const fromSP = new Date(year, month - 1, 1);
            const toSP = new Date(year, month, 0, 23, 59, 59, 999);
            monthRanges.push({
                year,
                month,
                from: fromZonedTime(fromSP, SAO_PAULO_TZ),
                to: fromZonedTime(toSP, SAO_PAULO_TZ),
            });
            month++;
            if (month > 12) { month = 1; year++; }
        }

        // Fetch all paid orders with stripeNetAmount in one query
        const allOrders = await ctx.db.songOrder.findMany({
            where: {
                status: { in: [...paidStatuses] },
                paymentCompletedAt: { not: null },
                stripeNetAmount: { not: null },
                ...APOLLO_SOURCE_FILTER,
            },
            select: { paymentCompletedAt: true, stripeNetAmount: true },
        });

        // Bucket by month
        const monthMap = new Map<string, number>();
        for (const r of monthRanges) {
            monthMap.set(`${r.year}-${r.month}`, 0);
        }

        let totalNet = 0;
        for (const order of allOrders) {
            if (!order.paymentCompletedAt) continue;
            const sp = toZonedTime(order.paymentCompletedAt, SAO_PAULO_TZ);
            const key = `${sp.getFullYear()}-${sp.getMonth() + 1}`;
            const net = (order.stripeNetAmount || 0) / 100;
            const prev = monthMap.get(key);
            if (prev !== undefined) {
                monthMap.set(key, prev + net);
            }
            totalNet += net;
        }

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const months = monthRanges.map((r) => ({
            year: r.year,
            month: r.month,
            label: `${monthNames[r.month - 1]} ${r.year}`,
            net: monthMap.get(`${r.year}-${r.month}`) || 0,
            isCurrent: r.year === currentYear && r.month === currentMonth,
        }));

        return { months, totalNet };
    }),

    // Daily Revenue for a specific month
    getDailyRevenue: adminProcedure
        .input(z.object({
            year: z.number(),
            month: z.number().min(1).max(12),
        }))
        .query(async ({ ctx, input }) => {
            const { year, month } = input;

            // Get first and last day of the month in São Paulo timezone
            const monthStartSP = new Date(year, month - 1, 1);
            const monthEndSP = new Date(year, month, 0, 23, 59, 59, 999);
            const monthStart = fromZonedTime(monthStartSP, SAO_PAULO_TZ);
            const monthEnd = fromZonedTime(monthEndSP, SAO_PAULO_TZ);

            const orders = await ctx.db.songOrder.findMany({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...APOLLO_SOURCE_FILTER,
                    paymentCompletedAt: { gte: monthStart, lte: monthEnd },
                },
                select: { paymentCompletedAt: true, stripeNetAmount: true },
                orderBy: { paymentCompletedAt: "asc" },
            });

            // Determine how many days to show (don't show future days)
            const nowUtc = new Date();
            const nowSP = toZonedTime(nowUtc, SAO_PAULO_TZ);
            const currentYear = nowSP.getFullYear();
            const currentMonth = nowSP.getMonth() + 1;
            const currentDay = nowSP.getDate();

            const daysInMonth = new Date(year, month, 0).getDate();
            const isCurrentMonth = year === currentYear && month === currentMonth;

            // For current month: show up to today
            // For past months: show all days
            // For future months: show nothing (shouldn't happen but handle it)
            const maxDay = isCurrentMonth ? currentDay : (year < currentYear || (year === currentYear && month < currentMonth)) ? daysInMonth : 0;

            const dailyData: { day: number; net: number; orders: number; isToday: boolean }[] = [];
            for (let d = 1; d <= maxDay; d++) {
                dailyData.push({ day: d, net: 0, orders: 0, isToday: isCurrentMonth && d === currentDay });
            }

            // Sum revenue by day (using payment date, not creation date)
            let totalNet = 0;
            orders.forEach((order) => {
                if (order.paymentCompletedAt) {
                    const spDate = toZonedTime(order.paymentCompletedAt, SAO_PAULO_TZ);
                    const day = spDate.getDate();
                    // Only add if day is within our range
                    if (day <= maxDay) {
                        // Stripe net only
                        const net = (order.stripeNetAmount || 0) / 100;
                        dailyData[day - 1]!.net += net;
                        dailyData[day - 1]!.orders += 1;
                        totalNet += net;
                    }
                }
            });

            return {
                dailyData,
                totalNet,
                month,
                year,
                currentDay: isCurrentMonth ? currentDay : null,
            };
        }),

    // Weekly Revenue (last 12 weeks)
    getWeeklyRevenue: adminProcedure.query(async ({ ctx }) => {
        const paidStatuses = ["PAID", "IN_PROGRESS", "COMPLETED"] as const;

        const nowUtc = new Date();
        const nowSP = toZonedTime(nowUtc, SAO_PAULO_TZ);

        // Calculate start of the week 11 weeks ago (12 weeks total including current)
        const currentDay = nowSP.getDay(); // 0=Sun
        const mondayThisWeek = new Date(nowSP);
        mondayThisWeek.setDate(nowSP.getDate() - ((currentDay + 6) % 7));
        mondayThisWeek.setHours(0, 0, 0, 0);

        const startDate = new Date(mondayThisWeek);
        startDate.setDate(startDate.getDate() - 11 * 7);

        const allOrders = await ctx.db.songOrder.findMany({
            where: {
                status: { in: [...paidStatuses] },
                ...APOLLO_SOURCE_FILTER,
                paymentCompletedAt: { gte: fromZonedTime(startDate, SAO_PAULO_TZ) },
                stripeNetAmount: { not: null },
            },
            select: { paymentCompletedAt: true, stripeNetAmount: true },
        });

        // Build week buckets
        const weekMap = new Map<string, { year: number; week: number; label: string; net: number; isCurrent: boolean }>();
        for (let i = 0; i < 12; i++) {
            const weekStart = new Date(startDate);
            weekStart.setDate(weekStart.getDate() + i * 7);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            // ISO week number
            const jan1 = new Date(weekStart.getFullYear(), 0, 1);
            const dayOfYear = Math.floor((weekStart.getTime() - jan1.getTime()) / 86400000) + 1;
            const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
            const yr = weekStart.getFullYear();

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const label = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}-${monthNames[weekEnd.getMonth()]} ${weekEnd.getDate()}`;
            const key = `${yr}-W${weekNum}`;

            weekMap.set(key, {
                year: yr,
                week: weekNum,
                label,
                net: 0,
                isCurrent: i === 11,
            });
        }

        // Build a list of week start dates for bucketing
        const weekStarts: Date[] = [];
        for (let i = 0; i < 12; i++) {
            const ws = new Date(startDate);
            ws.setDate(ws.getDate() + i * 7);
            weekStarts.push(ws);
        }

        let totalNet = 0;
        for (const order of allOrders) {
            if (!order.paymentCompletedAt) continue;
            const sp = toZonedTime(order.paymentCompletedAt, SAO_PAULO_TZ);
            const net = (order.stripeNetAmount || 0) / 100;

            // Find which week bucket this falls into
            for (let i = weekStarts.length - 1; i >= 0; i--) {
                if (sp >= weekStarts[i]!) {
                    const ws = weekStarts[i]!;
                    const jan1 = new Date(ws.getFullYear(), 0, 1);
                    const dayOfYear = Math.floor((ws.getTime() - jan1.getTime()) / 86400000) + 1;
                    const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
                    const key = `${ws.getFullYear()}-W${weekNum}`;
                    const bucket = weekMap.get(key);
                    if (bucket) {
                        bucket.net += net;
                    }
                    break;
                }
            }
            totalNet += net;
        }

        const weeks = Array.from(weekMap.values());
        return { weeks, totalNet };
    }),

    // Daily Conversion Rate for a specific month
    getDailyConversion: adminProcedure
        .input(z.object({
            year: z.number(),
            month: z.number().min(1).max(12),
        }))
        .query(async ({ ctx, input }) => {
            const { year, month } = input;

            const monthStartSP = new Date(year, month - 1, 1);
            const monthEndSP = new Date(year, month, 0, 23, 59, 59, 999);
            const monthStart = fromZonedTime(monthStartSP, SAO_PAULO_TZ);
            const monthEnd = fromZonedTime(monthEndSP, SAO_PAULO_TZ);

            // Quiz completions per day
            const quizOrders = await ctx.db.songOrder.findMany({
                where: {
                    quizCompletedAt: { gte: monthStart, lte: monthEnd },
                    ...APOLLO_SOURCE_FILTER,
                },
                select: { quizCompletedAt: true },
            });

            // Paid orders per day
            const paidOrders = await ctx.db.songOrder.findMany({
                where: {
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    ...APOLLO_SOURCE_FILTER,
                    paymentCompletedAt: { gte: monthStart, lte: monthEnd },
                },
                select: { paymentCompletedAt: true },
            });

            const nowUtc = new Date();
            const nowSP = toZonedTime(nowUtc, SAO_PAULO_TZ);
            const currentYear = nowSP.getFullYear();
            const currentMonth = nowSP.getMonth() + 1;
            const currentDay = nowSP.getDate();
            const daysInMonth = new Date(year, month, 0).getDate();
            const isCurrentMonth = year === currentYear && month === currentMonth;
            const maxDay = isCurrentMonth ? currentDay : (year < currentYear || (year === currentYear && month < currentMonth)) ? daysInMonth : 0;

            const dailyData: { day: number; quizzes: number; paid: number; rate: number; isToday: boolean }[] = [];
            for (let d = 1; d <= maxDay; d++) {
                dailyData.push({ day: d, quizzes: 0, paid: 0, rate: 0, isToday: isCurrentMonth && d === currentDay });
            }

            for (const order of quizOrders) {
                if (!order.quizCompletedAt) continue;
                const sp = toZonedTime(order.quizCompletedAt, SAO_PAULO_TZ);
                const day = sp.getDate();
                if (day <= maxDay) {
                    dailyData[day - 1]!.quizzes += 1;
                }
            }

            for (const order of paidOrders) {
                if (!order.paymentCompletedAt) continue;
                const sp = toZonedTime(order.paymentCompletedAt, SAO_PAULO_TZ);
                const day = sp.getDate();
                if (day <= maxDay) {
                    dailyData[day - 1]!.paid += 1;
                }
            }

            // Compute rates
            let totalQuizzes = 0;
            let totalPaid = 0;
            for (const d of dailyData) {
                d.rate = d.quizzes > 0 ? (d.paid / d.quizzes) * 100 : 0;
                totalQuizzes += d.quizzes;
                totalPaid += d.paid;
            }

            const avgRate = totalQuizzes > 0 ? (totalPaid / totalQuizzes) * 100 : 0;

            return { dailyData, avgRate, month, year };
        }),

    // Revenue By Country (locale) per month
    getRevenueByCountry: adminProcedure.query(async ({ ctx }) => {
        const paidStatuses = ["PAID", "IN_PROGRESS", "COMPLETED"] as const;

        const nowUtc = new Date();
        const nowSP = toZonedTime(nowUtc, SAO_PAULO_TZ);
        const currentYear = nowSP.getFullYear();
        const currentMonth = nowSP.getMonth() + 1;

        // Build month ranges (same logic as getMonthlyRevenue)
        const monthRanges: { year: number; month: number; from: Date; to: Date }[] = [];
        let year = 2024;
        let month = 10; // Oct 2024 start
        while (year < currentYear || (year === currentYear && month <= currentMonth)) {
            const fromSP = new Date(year, month - 1, 1, 0, 0, 0, 0);
            const toSP = new Date(year, month, 0, 23, 59, 59, 999);
            monthRanges.push({
                year,
                month,
                from: fromZonedTime(fromSP, SAO_PAULO_TZ),
                to: fromZonedTime(toSP, SAO_PAULO_TZ),
            });
            month++;
            if (month > 12) { month = 1; year++; }
        }

        const allOrders = await ctx.db.songOrder.findMany({
            where: {
                status: { in: [...paidStatuses] },
                ...APOLLO_SOURCE_FILTER,
                paymentCompletedAt: { not: null },
                stripeNetAmount: { not: null },
            },
            select: { paymentCompletedAt: true, stripeNetAmount: true, locale: true },
        });

        // Bucket by (month, locale)
        const localeList = ["en", "pt", "es", "fr", "it"] as const;
        type LocaleKey = typeof localeList[number];
        const monthMap = new Map<string, Record<LocaleKey, number> & { total: number }>();
        for (const r of monthRanges) {
            monthMap.set(`${r.year}-${r.month}`, { en: 0, pt: 0, es: 0, fr: 0, it: 0, total: 0 });
        }

        let totalNet = 0;
        for (const order of allOrders) {
            if (!order.paymentCompletedAt) continue;
            const sp = toZonedTime(order.paymentCompletedAt, SAO_PAULO_TZ);
            const key = `${sp.getFullYear()}-${sp.getMonth() + 1}`;
            const net = (order.stripeNetAmount || 0) / 100;
            const bucket = monthMap.get(key);
            if (bucket) {
                const loc = (order.locale || "en") as LocaleKey;
                const validLoc = localeList.includes(loc) ? loc : "en";
                bucket[validLoc] += net;
                bucket.total += net;
            }
            totalNet += net;
        }

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const months = monthRanges.map((r) => ({
            label: `${monthNames[r.month - 1]} ${r.year}`,
            isCurrent: r.year === currentYear && r.month === currentMonth,
            ...monthMap.get(`${r.year}-${r.month}`)!,
        }));

        return { months, totalNet };
    }),

    // Conversion Funnel
    getConversion: adminProcedure.query(async ({ ctx }) => {
        const totalInteractions = await ctx.db.songOrder.count({
            where: { ...APOLLO_SOURCE_FILTER },
        });

        const quizCompleted = await ctx.db.songOrder.count({
            where: { quizCompletedAt: { not: null }, ...APOLLO_SOURCE_FILTER },
        });

        const paid = await ctx.db.songOrder.count({
            where: { status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] }, ...APOLLO_SOURCE_FILTER },
        });

        return {
            totalInteractions,
            quizCompleted,
            paid,
            conversionRate: totalInteractions > 0 ? (paid / totalInteractions) * 100 : 0,
        };
    }),

    // CRUD Actions
    updateOrder: adminProcedure
        .input(z.object({
            id: z.string(),
            status: z.enum(["PENDING", "PAID", "IN_PROGRESS", "COMPLETED", "REVISION", "CANCELLED", "REFUNDED"]).optional(),
            recipient: z.string().optional(),
            recipientName: z.string().optional(),
            recipientRelationship: z.string().nullable().optional(),
            email: z.string().optional(),
            backupWhatsApp: z.string().nullable().optional(),
            sunoAccountEmail: z.string().nullable().optional(),
            genre: z.string().optional(),
            vocals: z.string().optional(),
            qualities: z.string().optional(),
            memories: z.string().optional(),
            message: z.string().optional(),
            revisionCount: z.number().min(0).max(10).optional(),
            revisionNotes: z.string().optional(),
            preferredSongForStreaming: z.string().url().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...data } = input;
            const existingOrder = await ctx.db.songOrder.findUnique({
                where: { id },
                select: {
                    id: true,
                    status: true,
                    revisionLockedBy: true,
                },
            });

            if (!existingOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            assertRevisionEditAccess({
                order: existingOrder,
                adminUser: ctx.adminUser,
            });

            const updatedOrder = await ctx.db.songOrder.update({
                where: { id },
                data: data,
            });

            // Convert supabase-import → supabase-convertido when marking as PAID
            if (input.status === "PAID") {
                await convertSupabaseImportOnPaid(id);
            }

            // Handle LYRICS_UPSELL: update parent hasLyrics when status changes to PAID or COMPLETED
            if (
                (input.status === "PAID" || input.status === "COMPLETED") &&
                updatedOrder.orderType === "LYRICS_UPSELL" &&
                updatedOrder.parentOrderId
            ) {
                await ctx.db.songOrder.update({
                    where: { id: updatedOrder.parentOrderId },
                    data: { hasLyrics: true },
                });
            }

            return updatedOrder;
        }),

    /**
     * Mark a revision as completed
     * Changes status from REVISION -> COMPLETED and sends notification email
     */
    completeRevision: adminProcedure
        .input(z.object({
            orderId: z.string(),
            adminName: z.string().trim().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const actorName = resolveRevisionActorName(ctx.adminUser);
            // Fetch order with necessary fields
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    status: true,
                    recipientName: true,
                    locale: true,
                    revisionCount: true,
                    revisionRequestedAt: true,
                    revisionLockedBy: true,
                    songFileUrl: true,
                    songFileKey: true,
                    songUploadedAt: true,
                    songFileUrl2: true,
                    songFileKey2: true,
                    songUploadedAt2: true,
                    revisionHistory: true,
                    lyrics: true,
                    correctedLyrics: true,
                    displayLyrics: true,
                    hasLyrics: true,
                    lyricsPdfA4Url: true,
                    lyricsPdfA3Url: true,
                    childOrders: {
                        select: { orderType: true, hasLyrics: true, status: true },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate order is in REVISION status
            if (order.status !== "REVISION") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order is not in REVISION status",
                });
            }

            // Validate at least one song file exists
            if (!order.songFileUrl && !order.songFileUrl2) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "No song file uploaded. Please upload the revised song first.",
                });
            }

            if (!order.email) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Customer email not found",
                });
            }

            if (!order.revisionLockedBy) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Revision must be locked before completion",
                });
            }

            if (!isSameReviewerName(order.revisionLockedBy, actorName)) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Revisão já travada por ${capitalizeWords(order.revisionLockedBy) ?? order.revisionLockedBy}`,
                });
            }

            const now = new Date();

            const history = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount }) as Array<Record<string, any> & { revisionNumber: number }>;
            const historyMap = new Map(history.map((e) => [e.revisionNumber, e]));
            const previousSnapshot = historyMap.get(order.revisionCount - 1);

            const revisionRequestedAtMs = order.revisionRequestedAt ? new Date(order.revisionRequestedAt).getTime() : null;

            // Determine whether each slot was updated during this revision.
            // Goal: prevent carrying over an old option into the final delivery when only one option was revised.
            const getSlotUpdatedState = (slot: 1 | 2): boolean | null => {
                const currentUrl = slot === 2 ? order.songFileUrl2 : order.songFileUrl;
                if (!currentUrl) return false;

                const snapshotKey = slot === 2 ? "songFileUrl2" : "songFileUrl";
                if (previousSnapshot && Object.prototype.hasOwnProperty.call(previousSnapshot, snapshotKey)) {
                    const prevUrl = previousSnapshot[snapshotKey] as unknown;
                    if (typeof prevUrl === "string") return prevUrl !== currentUrl;
                    if (prevUrl === null) return true;
                }

                const uploadedAt = slot === 2 ? order.songUploadedAt2 : order.songUploadedAt;
                if (revisionRequestedAtMs && uploadedAt) {
                    return uploadedAt.getTime() > revisionRequestedAtMs;
                }

                return null;
            };

            const slot1Updated = getSlotUpdatedState(1);
            const slot2Updated = getSlotUpdatedState(2);

            // If we can prove neither slot was updated, block completion.
            if (slot1Updated === false && slot2Updated === false) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Nenhuma música nova foi enviada. Envie a música revisada antes de concluir.",
                });
            }

            // Update order status to COMPLETED and clear any revision lock
            // Save who completed the revision permanently
            const updateData: Prisma.SongOrderUpdateInput = {
                status: "COMPLETED",
                songDeliveredAt: now,
                revisionLockedBy: null,
                revisionLockedAt: null,
                revisionCompletedBy: actorName,
                revisionCompletedAt: now,
            };

            // Clear carried-over options that were NOT updated during this revision, so the client doesn't see an old option.
            // Treat uncertain (null) as "not updated" to avoid stale songs leaking through.
            if (slot1Updated !== true) {
                updateData.songFileUrl = null;
                updateData.songFileKey = null;
                updateData.songUploadedAt = null;
                updateData.kieTaskId = null;
                updateData.kieAudioId1 = null;
            }
            if (slot2Updated !== true) {
                updateData.songFileUrl2 = null;
                updateData.songFileKey2 = null;
                updateData.songUploadedAt2 = null;
            }

            const completeResult = await ctx.db.songOrder.updateMany({
                where: {
                    id: input.orderId,
                    status: "REVISION",
                    revisionLockedBy: order.revisionLockedBy,
                },
                data: updateData,
            });

            if (completeResult.count === 0) {
                const latestOrder = await ctx.db.songOrder.findUnique({
                    where: { id: input.orderId },
                    select: {
                        id: true,
                        status: true,
                        revisionLockedBy: true,
                    },
                });

                if (!latestOrder) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Order not found",
                    });
                }

                if (latestOrder.status !== "REVISION") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Order is not in REVISION status",
                    });
                }

                if (!latestOrder.revisionLockedBy) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Revision lock was released. Lock it again before completion.",
                    });
                }

                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Revisão já travada por ${capitalizeWords(latestOrder.revisionLockedBy) ?? latestOrder.revisionLockedBy}`,
                });
            }

            const updatedOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: { id: true, status: true },
            });

            if (!updatedOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Regenerate PDF if order has lyrics addon
            const hasLyricsAddon = !!order.hasLyrics || !!order.childOrders?.some(
                (child) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics && child.status !== "PENDING"
            );
            if (hasLyricsAddon) {
                await ctx.db.songOrder.update({
                    where: { id: input.orderId },
                    data: { lyricsPdfA4Url: null, lyricsPdfA3Url: null, lyricsPdfGeneratedAt: null },
                });
                await enqueuePdfGeneration(input.orderId, "high");
                console.log(`[completeRevision] Triggered PDF regeneration for order ${input.orderId}`);
            }

            // Build and send revision completed email
            const trackOrderUrl = `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`;

            const emailData = buildRevisionCompletedEmail({
                orderId: order.id,
                recipientName: order.recipientName,
                locale: order.locale,
                trackOrderUrl,
                customerEmail: order.email,
            });

            try {
                await sendEmail({
                    to: order.email,
                    template: "revision-completed",
                    orderId: order.id,
                    metadata: { recipientName: order.recipientName },
                    ...emailData,
                });
            } catch (emailError) {
                console.error(`❌ [Admin] Revision email failed for order ${order.id} (status already COMPLETED):`, emailError);
            }

            // Send Telegram notification
            await sendRevisionCompletedAlert({
                orderId: order.id,
                recipientName: order.recipientName,
                email: order.email,
                locale: order.locale,
                revisionCount: order.revisionCount,
            });

            return {
                success: true,
                orderId: updatedOrder.id,
                status: updatedOrder.status,
            };
        }),

    /**
     * Get list of reviewer names (people who have completed revisions)
     * Used to show quick-select buttons in the lock dialog
     */
    getReviewerNames: adminProcedure
        .query(async ({ ctx }) => {
            const reviewers = await ctx.db.songOrder.groupBy({
                by: ["revisionCompletedBy"],
                where: {
                    revisionCompletedBy: { not: null },
                },
                _count: { revisionCompletedBy: true },
            });

            return mergeReviewerCounts(reviewers).slice(0, 10); // Top 10 reviewers
        }),

    /**
     * Lock a revision for editing by an admin
     * Prevents other admins from opening/editing the same revision
     */
    lockRevision: adminProcedure
        .input(z.object({
            orderId: z.string(),
            adminName: z.string().trim().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const actorName = resolveRevisionActorName(ctx.adminUser);

            // Fetch current order state
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    status: true,
                    revisionLockedBy: true,
                    revisionLockedAt: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate order is in REVISION status
            if (order.status !== "REVISION") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order is not in REVISION status",
                });
            }

            // Check if already locked by another admin
            if (order.revisionLockedBy && !isSameReviewerName(order.revisionLockedBy, actorName)) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Revisão já travada por ${capitalizeWords(order.revisionLockedBy) ?? order.revisionLockedBy}`,
                });
            }

            // Atomic lock update: only succeeds if the lock is still in the same state we just read.
            const lockResult = await ctx.db.songOrder.updateMany({
                where: {
                    id: input.orderId,
                    status: "REVISION",
                    OR: [
                        { revisionLockedBy: null },
                        ...(order.revisionLockedBy ? [{ revisionLockedBy: order.revisionLockedBy }] : []),
                    ],
                },
                data: {
                    revisionLockedBy: actorName,
                    revisionLockedAt: new Date(),
                },
            });

            if (lockResult.count === 0) {
                const latestOrder = await ctx.db.songOrder.findUnique({
                    where: { id: input.orderId },
                    select: {
                        id: true,
                        status: true,
                        revisionLockedBy: true,
                        revisionLockedAt: true,
                    },
                });

                if (!latestOrder) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Order not found",
                    });
                }

                if (latestOrder.status !== "REVISION") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Order is not in REVISION status",
                    });
                }

                if (latestOrder.revisionLockedBy && !isSameReviewerName(latestOrder.revisionLockedBy, actorName)) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: `Revisão já travada por ${capitalizeWords(latestOrder.revisionLockedBy) ?? latestOrder.revisionLockedBy}`,
                    });
                }

                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Não foi possível travar a revisão. Tente novamente.",
                });
            }

            const updatedOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    revisionLockedBy: true,
                    revisionLockedAt: true,
                },
            });

            if (!updatedOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            return {
                success: true,
                orderId: updatedOrder.id,
                lockedBy: updatedOrder.revisionLockedBy,
                lockedAt: updatedOrder.revisionLockedAt,
            };
        }),

    /**
     * Unlock a revision, making it available for other admins
     */
    unlockRevision: adminProcedure
        .input(z.object({
            orderId: z.string(),
            adminName: z.string().trim().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const actorName = resolveRevisionActorName(ctx.adminUser);
            const isSuperAdmin = ctx.adminUser.adminRole === "SUPER_ADMIN";

            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: { id: true, revisionLockedBy: true },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            if (!order.revisionLockedBy) {
                return {
                    success: true,
                    orderId: order.id,
                };
            }

            if (!isSuperAdmin && !isSameReviewerName(order.revisionLockedBy, actorName)) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Revisão travada por ${capitalizeWords(order.revisionLockedBy) ?? order.revisionLockedBy}. Apenas essa pessoa pode destravar.`,
                });
            }

            // Atomic unlock: only the current lock owner can clear it.
            const unlockResult = await ctx.db.songOrder.updateMany({
                where: {
                    id: input.orderId,
                    revisionLockedBy: order.revisionLockedBy,
                },
                data: {
                    revisionLockedBy: null,
                    revisionLockedAt: null,
                },
            });

            if (unlockResult.count === 0) {
                const latestOrder = await ctx.db.songOrder.findUnique({
                    where: { id: input.orderId },
                    select: { id: true, revisionLockedBy: true },
                });

                if (!latestOrder) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Order not found",
                    });
                }

                if (latestOrder.revisionLockedBy && !isSuperAdmin && !isSameReviewerName(latestOrder.revisionLockedBy, actorName)) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: `Revisão travada por ${capitalizeWords(latestOrder.revisionLockedBy) ?? latestOrder.revisionLockedBy}. Apenas essa pessoa pode destravar.`,
                    });
                }

                return {
                    success: true,
                    orderId: latestOrder.id,
                };
            }

            return {
                success: true,
                orderId: order.id,
            };
        }),

    /**
     * Generate AI-corrected lyrics based on revision notes
     * Compares revision feedback with current lyrics and suggests corrections
     */
    generateCorrectedLyrics: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Dynamic import to avoid bundling issues
            const { generateCorrectedLyrics } = await import("~/lib/lyrics-corrector");

            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    lyrics: true,
                    displayLyrics: true,
                    revisionNotes: true,
                    revisionType: true,
                    revisionCount: true,
                    revisionHistory: true,
                    genre: true,
                    locale: true,
                    status: true,
                    revisionLockedBy: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            if (!order.lyrics && !order.displayLyrics) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order has no lyrics to correct",
                });
            }

            if (!order.revisionNotes) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order has no revision notes",
                });
            }

            assertRevisionEditAccess({
                order,
                adminUser: ctx.adminUser,
            });

            // Extract marked words from revision notes
            // Format: "Palavras com erro na letra: word1, word2, word3\n\nrest of notes"
            const parseMarkedWords = (notes: string): string[] => {
                const match = notes.match(/Palavras com erro na letra:\s*([^\n]+)/i);
                if (!match || !match[1]) return [];
                return match[1].split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
            };

            const markedWords = parseMarkedWords(order.revisionNotes);

            try {
                // Se já tem displayLyrics (de revisão anterior), usa ela como base
                // Senão usa lyrics (original)
                const lyricsBase = order.displayLyrics || order.lyrics;

                // Parse + normalize revisionHistory JSON into a stable 0-based sequence.
                const revisionHistory = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount }).map((r) => ({
                    revisionNumber: r.revisionNumber,
                    notes: typeof r.notes === "string" ? r.notes : null,
                    type: typeof r.type === "string" ? r.type : null,
                    fault: typeof r.fault === "string" ? r.fault : null,
                }));

                const result = await generateCorrectedLyrics({
                    lyrics: lyricsBase!,
                    revisionNotes: order.revisionNotes,
                    revisionType: order.revisionType,
                    markedWords,
                    genre: order.genre,
                    locale: order.locale,
                    revisionHistory,
                });

                return {
                    success: true,
                    orderId: order.id,
                    correctedLyrics: result.correctedLyrics,
                    displayLyrics: result.displayLyrics,
                    changes: result.changes,
                };
            } catch (error) {
                console.error("Failed to generate corrected lyrics:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: error instanceof Error ? error.message : "Failed to generate corrected lyrics",
                });
            }
        }),

    /**
     * Save corrected lyrics to the order
     * Stores in correctedLyrics field, preserving original lyrics
     * Auto-regenerates PDF if order has lyrics addon
     */
    saveCorrectedLyrics: adminProcedure
        .input(z.object({
            orderId: z.string(),
            correctedLyrics: z.string().min(1),
            displayLyrics: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    hasLyrics: true,
                    status: true,
                    revisionLockedBy: true,
                    childOrders: {
                        select: {
                            orderType: true,
                            hasLyrics: true,
                            status: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            assertRevisionEditAccess({
                order,
                adminUser: ctx.adminUser,
            });

            // Re-apply pronunciation dictionary after accepting LLM correction.
            // This keeps correctedLyrics aligned with the same behavior as normal lyrics generation.
            const corrections = await ctx.db.pronunciationCorrection.findMany({
                select: { original: true, replacement: true },
            });
            const correctedLyricsWithPronunciation = applyPronunciationCorrections(input.correctedLyrics, corrections);

            // Auto-generate displayLyrics (clean) from the pronunciation-corrected text when missing.
            let finalDisplayLyrics = input.displayLyrics;
            if (!finalDisplayLyrics) {
                finalDisplayLyrics = stripPronunciationCorrections(correctedLyricsWithPronunciation, corrections);
            }

            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    correctedLyrics: correctedLyricsWithPronunciation,
                    displayLyrics: finalDisplayLyrics,
                    correctedLyricsAt: new Date(),
                    lyricsPdfA4Url: null,
                    lyricsPdfA3Url: null,
                    lyricsPdfGeneratedAt: null,
                },
            });

            // Auto-regenerate PDF if order has lyrics addon
            const hasLyricsAddon = !!order.hasLyrics || !!order.childOrders?.some(
                (child) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics && child.status !== "PENDING"
            );
            if (hasLyricsAddon) {
                await enqueuePdfGeneration(input.orderId, "high");
                console.log(`[saveCorrectedLyrics] Triggered PDF regeneration for order ${input.orderId}`);
            }

            return {
                success: true,
                orderId: updatedOrder.id,
                correctedLyricsAt: updatedOrder.correctedLyricsAt,
            };
        }),

    deleteOrder: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.songOrder.delete({
                where: { id: input.id },
            });
        }),

    createOrder: adminProcedure
        .input(z.object({
            recipient: z.string(),
            recipientName: z.string(),
            email: z.string(),
            genre: z.string(),
            vocals: z.string(),
            qualities: z.string(),
            memories: z.string(),
            message: z.string().optional(),
            locale: z.enum(["en", "pt", "es", "fr", "it"]).default("en"),
            status: z.enum(["PENDING", "PAID", "IN_PROGRESS", "COMPLETED", "REVISION", "CANCELLED", "REFUNDED"]).default("PENDING"),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.songOrder.create({
                data: {
                    ...input,
                    // Defaults for required fields that might not be in the form
                    priceAtOrder: 0,
                    currency: "USD",
                    locale: input.locale ?? "en",
                },
            });
        }),

    // ============= LYRICS MANAGEMENT =============

    /**
     * Generate or regenerate lyrics for an order
     * This calls the OpenRouter LLM API synchronously
     */
    generateLyrics: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    vocals: true,
                    qualities: true,
                    memories: true,
                    message: true,
                    locale: true,
                    hasLyrics: true,
                    childOrders: {
                        select: {
                            orderType: true,
                            hasLyrics: true,
                            status: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            // Mark as generating
            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: { lyricsStatus: "generating", lyricsError: null },
            });

            try {
                const pronunciationCorrections = await ctx.db.pronunciationCorrection.findMany({
                    select: { original: true, replacement: true },
                });

                const result = await generateLyrics({
                    recipientName: order.recipientName,
                    recipient: order.recipient,
                    genre: order.genre,
                    vocals: order.vocals,
                    qualities: order.qualities,
                    memories: order.memories,
                    message: order.message,
                    locale: order.locale,
                    pronunciationCorrections,
                });

                // Save lyrics and music prompt
                const updated = await ctx.db.songOrder.update({
                    where: { id: input.orderId },
                    data: {
                        lyrics: result.lyrics,
                        // Keep the PDF/email version in sync with the latest lyrics generation.
                        // The generator returns a "clean" displayLyrics (no pronunciation corrections).
                        displayLyrics: result.displayLyrics,
                        // If there was a previous correction snapshot, it's now stale relative to the new lyrics.
                        correctedLyrics: null,
                        musicPrompt: result.musicPrompt,
                        lyricsPrompt: result.prompt,
                        lyricsStatus: "completed",
                        lyricsGeneratedAt: new Date(),
                        lyricsError: null,
                        // Invalidate cached PDFs so downloads always reflect the latest lyrics.
                        lyricsPdfA4Url: null,
                        lyricsPdfA3Url: null,
                        lyricsPdfGeneratedAt: null,
                    },
                });

                // Auto-regenerate PDF if order has lyrics add-on
                const hasLyricsAddon = !!order.hasLyrics || !!order.childOrders?.some(
                    (child) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics && child.status !== "PENDING"
                );
                if (hasLyricsAddon) {
                    await enqueuePdfGeneration(input.orderId, "high");
                    console.log(`[generateLyrics] Triggered PDF regeneration for order ${input.orderId}`);
                }

                return {
                    success: true,
                    lyrics: result.lyrics,
                    musicPrompt: result.musicPrompt,
                    lyricsStatus: updated.lyricsStatus,
                    lyricsGeneratedAt: updated.lyricsGeneratedAt,
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";

                await ctx.db.songOrder.update({
                    where: { id: input.orderId },
                    data: {
                        lyricsStatus: "failed",
                        lyricsError: errorMessage,
                    },
                });

                throw new Error(`Failed to generate lyrics: ${errorMessage}`);
            }
        }),

    /**
     * Queue lyrics generation for an order (async via BullMQ worker)
     * Use this to retry failed or pending lyrics generation
     */
    queueLyricsGeneration: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    status: true,
                    lyricsStatus: true,
                    recipientName: true,
                    hasFastDelivery: true,
                },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            // Import dynamically to avoid server-only issues in client bundle
            const { enqueueLyricsGeneration } = await import("~/server/queues/lyrics-generation");

            const lyricsPriority = order.hasFastDelivery ? 1 : 5;
            await enqueueLyricsGeneration(input.orderId, { priority: lyricsPriority });

            // Mark as pending to show it's queued
            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: { lyricsStatus: "pending", lyricsError: null },
            });

            return {
                success: true,
                message: `Lyrics generation queued for order ${order.recipientName}`,
            };
        }),

    /**
     * Manually update lyrics and/or music prompt (for editing)
     * Auto-regenerates PDF if correctedLyrics is updated and order has lyrics addon
     */
    updateLyrics: adminProcedure
        .input(z.object({
            orderId: z.string(),
            lyrics: z.string().optional(),
            correctedLyrics: z.string().optional(),
            displayLyrics: z.string().optional(),
            musicPrompt: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Fetch order to check if it has lyrics addon
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    status: true,
                    revisionLockedBy: true,
                    hasLyrics: true,
                    childOrders: {
                        select: {
                            orderType: true,
                            hasLyrics: true,
                            status: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            assertRevisionEditAccess({
                order,
                adminUser: ctx.adminUser,
            });

            const data: {
                lyrics?: string;
                correctedLyrics?: string;
                displayLyrics?: string;
                correctedLyricsAt?: Date;
                musicPrompt?: string;
                lyricsStatus?: string;
                lyricsPdfA4Url?: string | null;
                lyricsPdfA3Url?: string | null;
                lyricsPdfGeneratedAt?: Date | null;
            } = {};

            if (input.lyrics !== undefined) {
                data.lyrics = input.lyrics;
                data.lyricsStatus = "completed";

                // Keep displayLyrics (used for PDF/email) in sync when editing the original lyrics.
                // This prevents PDFs from serving an older displayLyrics snapshot after revisions.
                if (input.displayLyrics === undefined && input.correctedLyrics === undefined) {
                    const corrections = await ctx.db.pronunciationCorrection.findMany({
                        select: { original: true, replacement: true },
                    });
                    data.displayLyrics = stripPronunciationCorrections(input.lyrics, corrections);
                }
            }
            if (input.correctedLyrics !== undefined) {
                data.correctedLyrics = input.correctedLyrics;
                data.correctedLyricsAt = new Date();
                // Auto-generate displayLyrics if not explicitly provided
                if (input.displayLyrics === undefined) {
                    const corrections = await ctx.db.pronunciationCorrection.findMany({
                        select: { original: true, replacement: true },
                    });
                    data.displayLyrics = stripPronunciationCorrections(input.correctedLyrics, corrections);
                }
            }
            if (input.displayLyrics !== undefined) {
                data.displayLyrics = input.displayLyrics;
                data.correctedLyricsAt = new Date();
            }
            if (input.musicPrompt !== undefined) {
                data.musicPrompt = input.musicPrompt;
            }
            const shouldInvalidatePdf = input.lyrics !== undefined
                || input.correctedLyrics !== undefined
                || input.displayLyrics !== undefined;
            if (shouldInvalidatePdf) {
                data.lyricsPdfA4Url = null;
                data.lyricsPdfA3Url = null;
                data.lyricsPdfGeneratedAt = null;
                if (!data.correctedLyricsAt) {
                    data.correctedLyricsAt = new Date();
                }
            }

            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data,
            });

            // Auto-regenerate PDF if lyrics-related fields changed and order has lyrics addon
            const hasLyricsAddon = !!order?.hasLyrics || !!order?.childOrders?.some(
                (child) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics && child.status !== "PENDING"
            );
            if (shouldInvalidatePdf && hasLyricsAddon) {
                await enqueuePdfGeneration(input.orderId, "high");
                console.log(`[updateLyrics] Triggered PDF regeneration for order ${input.orderId}`);
            }

            return {
                success: true,
                lyrics: updated.lyrics,
                correctedLyrics: updated.correctedLyrics,
                musicPrompt: updated.musicPrompt,
                lyricsStatus: updated.lyricsStatus,
            };
        }),

    /**
     * Format lyrics using AI - only organizes formatting (line breaks, stanzas, Suno tags)
     * without changing any content
     */
    formatLyrics: adminProcedure
        .input(z.object({
            lyrics: z.string(),
        }))
        .mutation(async ({ input }) => {
            if (!env.OPENROUTER_API_KEY) {
                throw new Error("OPENROUTER_API_KEY not configured");
            }

            const systemPrompt = `You are a lyrics formatting assistant. Your ONLY job is to organize the formatting of song lyrics without changing ANY words, content, or meaning.

Rules:
1. DO NOT change any words, add words, remove words, or modify the lyrics content in any way
2. ONLY organize the formatting: add proper line breaks, separate stanzas with blank lines
3. Keep all Suno AI tags like [Intro], [Verse 1], [Chorus], [Bridge], [Outro], etc. on their own lines
4. Each line of lyrics should be on its own line (not all jumbled together)
5. Separate different sections (verses, chorus, bridge) with a blank line
6. Return ONLY the formatted lyrics, nothing else - no explanations, no comments`;

            const userPrompt = `Format these lyrics by organizing line breaks and stanza separation. DO NOT change any words:\n\n${input.lyrics}`;

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://apollosong.com",
                },
                body: JSON.stringify({
                    model: env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt },
                    ],
                    temperature: 0.1, // Low temperature for consistent formatting
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`AI formatting failed: ${error}`);
            }

            const data = await response.json() as {
                choices: Array<{ message: { content: string } }>;
            };

            const formattedLyrics = data.choices[0]?.message?.content?.trim();
            if (!formattedLyrics) {
                throw new Error("AI returned empty response");
            }

            return { formattedLyrics };
        }),

    /**
     * Get lyrics data for an order
     */
    getLyrics: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    lyrics: true,
                    musicPrompt: true,
                    lyricsStatus: true,
                    lyricsGeneratedAt: true,
                    lyricsError: true,
                    lyricsPrompt: true,
                    correctedLyrics: true,
                    correctedLyricsAt: true,
                    displayLyrics: true,
                    recipientName: true,
                    recipient: true,
                    recipientRelationship: true,
                    genre: true,
                    vocals: true,
                    locale: true,
                    orderType: true,
                    parentOrderId: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    parentOrder: {
                        select: {
                            lyrics: true,
                            musicPrompt: true,
                            lyricsStatus: true,
                            lyricsGeneratedAt: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            // Prefer manual prompt saved in DB; fallback to hardcoded genre mapping only when empty.
            let fallbackSunoStylePrompt: string | null = null;
            const resolveFallbackPrompt = async () => {
                if (fallbackSunoStylePrompt !== null) return fallbackSunoStylePrompt;
                const { getSunoStylePrompt } = await import("~/server/services/suno/genre-mapping");
                fallbackSunoStylePrompt = await getSunoStylePrompt(order.genre, order.locale || "pt", order.vocals);
                return fallbackSunoStylePrompt;
            };

            const resolvedOrderMusicPrompt = order.musicPrompt?.trim() || await resolveFallbackPrompt();

            // For streaming upsell orders, use parent's lyrics data
            if (order.orderType === "STREAMING_UPSELL" && order.parentOrder) {
                const resolvedParentMusicPrompt = order.parentOrder.musicPrompt?.trim() || resolvedOrderMusicPrompt;
                return {
                    ...order,
                    lyrics: order.parentOrder.lyrics,
                    musicPrompt: resolvedParentMusicPrompt,
                    lyricsStatus: order.parentOrder.lyricsStatus,
                    lyricsGeneratedAt: order.parentOrder.lyricsGeneratedAt,
                    isFromParent: true,
                };
            }

            return { ...order, musicPrompt: resolvedOrderMusicPrompt };
        }),

    // ============= SONG DELIVERY MANAGEMENT =============

    /**
     * Generate presigned URL for uploading MP3 to R2
     * @param slot - 1 for first song option, 2 for second song option
     */
    getSongUploadUrl: adminProcedure
        .input(z.object({
            orderId: z.string(),
            fileName: z.string(),
            slot: z.union([z.literal(1), z.literal(2)]).default(1),
        }))
        .mutation(async ({ ctx, input }) => {
            // Validate file extension
            if (!input.fileName.toLowerCase().endsWith('.mp3')) {
                throw new Error("Only MP3 files are allowed");
            }

            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    status: true,
                    revisionLockedBy: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            assertRevisionEditAccess({
                order,
                adminUser: ctx.adminUser,
            });

            // Generate unique key: songs/{orderId}/{slot}-{timestamp}-{sanitizedFileName}
            const sanitizedFileName = input.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const slotPrefix = input.slot === 2 ? 'option2' : 'option1';
            const key = `songs/${input.orderId}/${slotPrefix}-${Date.now()}-${sanitizedFileName}`;

            const uploadUrl = await StorageService.getUploadUrl(key, "audio/mpeg");
            // Handle R2_PUBLIC_DOMAIN with or without https:// prefix
            const domain = env.R2_PUBLIC_DOMAIN?.replace(/^(https?[:/]+)/, "") ?? "";
            const publicUrl = `https://${domain}/${key}`;

            return {
                uploadUrl,
                publicUrl,
                key,
                slot: input.slot,
            };
        }),

    /**
     * Confirm upload completed and save URL to database
     * @param slot - 1 for first song option, 2 for second song option
     */
    confirmSongUpload: adminProcedure
        .input(z.object({
            orderId: z.string(),
            songFileUrl: z.string(),
            songFileKey: z.string(),
            slot: z.union([z.literal(1), z.literal(2)]).default(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    status: true,
                    revisionLockedBy: true,
                    songFileKey: true,
                    songFileKey2: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            assertRevisionEditAccess({
                order,
                adminUser: ctx.adminUser,
            });

            // Validate that the songFileKey belongs to this order (prevents uploading to wrong order)
            if (!input.songFileKey.startsWith(`songs/${input.orderId}/`)) {
                throw new Error("Song file key does not match order ID");
            }

            // Determine which fields to update based on slot
            const isSlot2 = input.slot === 2;
            const existingKey = isSlot2 ? order.songFileKey2 : order.songFileKey;

            // If there was a previous file in this slot, delete it
            // Skip deletion when order is in REVISION to preserve song files in revisionHistory
            if (existingKey && existingKey !== input.songFileKey && order.status !== "REVISION") {
                try {
                    await StorageService.deleteFile(existingKey);
                } catch (error) {
                    console.error(`Failed to delete old song file (slot ${input.slot}):`, error);
                }
            }

            // Build update data based on slot
            // Preserve REVISION status if order is being revised.
            // Outside revision mode, mark as COMPLETED automatically once both slots are populated.
            const nextSongFileUrl = isSlot2 ? order.songFileUrl : input.songFileUrl;
            const nextSongFileUrl2 = isSlot2 ? input.songFileUrl : order.songFileUrl2;
            const willHaveTwoSongs = Boolean(nextSongFileUrl && nextSongFileUrl2);
            const newStatus = order.status === "REVISION"
                ? "REVISION" as const
                : willHaveTwoSongs
                    ? "COMPLETED" as const
                    : "IN_PROGRESS" as const;
            const updateData = isSlot2 ? {
                songFileUrl2: input.songFileUrl,
                songFileKey2: input.songFileKey,
                songUploadedAt2: new Date(),
                kieAudioId2: null,
                status: newStatus,
            } : {
                songFileUrl: input.songFileUrl,
                songFileKey: input.songFileKey,
                songUploadedAt: new Date(),
                // Manual upload replaces the current file; clear stale Kie references.
                kieTaskId: null,
                kieAudioId1: null,
                status: newStatus,
            };

            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: updateData,
            });

            // Sincronizar preferredSongForStreaming dos pedidos filhos STREAMING_UPSELL
            // que tinham a URL antiga como preferência
            const oldUrl = isSlot2 ? order.songFileUrl2 : order.songFileUrl;
            if (oldUrl) {
                await ctx.db.songOrder.updateMany({
                    where: {
                        parentOrderId: input.orderId,
                        orderType: "STREAMING_UPSELL",
                        preferredSongForStreaming: oldUrl,
                    },
                    data: {
                        preferredSongForStreaming: input.songFileUrl,
                    },
                });
            }

            // Limpar preferredSongForStreaming inválidas (que não batem com nenhuma das opções atuais)
            // Isso permite que o cliente selecione novamente após atualização
            const validUrls = [updated.songFileUrl, updated.songFileUrl2].filter(Boolean);
            if (validUrls.length > 0) {
                await ctx.db.songOrder.updateMany({
                    where: {
                        parentOrderId: input.orderId,
                        orderType: "STREAMING_UPSELL",
                        preferredSongForStreaming: { notIn: validUrls as string[] },
                    },
                    data: {
                        preferredSongForStreaming: null,
                    },
                });
            }

            return {
                success: true,
                slot: input.slot,
                songFileUrl: isSlot2 ? updated.songFileUrl2 : updated.songFileUrl,
                songUploadedAt: isSlot2 ? updated.songUploadedAt2 : updated.songUploadedAt,
                status: updated.status,
            };
        }),

    /**
     * Save a song URL to a specific revisionHistory entry (backfill old revisions)
     */
    confirmRevisionHistorySongUpload: adminProcedure
        .input(z.object({
            orderId: z.string(),
            revisionNumber: z.number().min(0),
            songFileUrl: z.string(),
            songFileKey: z.string(),
            slot: z.union([z.literal(1), z.literal(2)]).default(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: { revisionHistory: true, revisionCount: true },
            });
            if (!order) throw new Error("Order not found");

            // Normalize revision numbers and avoid collisions from older 1-based numbering.
            let history = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount }) as Array<Record<string, any>>;
            let entryIndex = history.findIndex((e) => e.revisionNumber === input.revisionNumber);
            if (entryIndex === -1) {
                // Back-compat: allow updating an old 1-based entry (n+1) when the UI sends 0-based (n).
                const oldIndex = history.findIndex((e) => e.revisionNumber === input.revisionNumber + 1);
                if (oldIndex !== -1) {
                    history[oldIndex]!.revisionNumber = input.revisionNumber;
                    entryIndex = oldIndex;
                }
            }
            if (entryIndex === -1) {
                history.push({ revisionNumber: input.revisionNumber });
                entryIndex = history.length - 1;
            }

            const entry = history[entryIndex]!;
            if (input.slot === 2) {
                entry.songFileUrl2 = input.songFileUrl;
                entry.songFileKey2 = input.songFileKey;
            } else {
                entry.songFileUrl = input.songFileUrl;
                entry.songFileKey = input.songFileKey;
            }

            // Re-normalize after mutation (sort + collision-fix).
            history = normalizeRevisionHistory(history, { revisionCount: order.revisionCount }) as Array<Record<string, any>>;

            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: { revisionHistory: history as any },
            });

            return { success: true };
        }),

    deleteRevisionHistorySongFile: adminProcedure
        .input(z.object({
            orderId: z.string(),
            revisionNumber: z.number().min(0),
            slot: z.union([z.literal(1), z.literal(2)]).default(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: { revisionHistory: true, revisionCount: true },
            });
            if (!order) throw new Error("Order not found");

            let history = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount }) as Array<Record<string, any>>;
            let entryIndex = history.findIndex((e) => e.revisionNumber === input.revisionNumber);
            if (entryIndex === -1) {
                const oldIndex = history.findIndex((e) => e.revisionNumber === input.revisionNumber + 1);
                if (oldIndex !== -1) {
                    history[oldIndex]!.revisionNumber = input.revisionNumber;
                    entryIndex = oldIndex;
                }
            }

            const entry = entryIndex === -1 ? undefined : history[entryIndex];
            if (!entry) {
                throw new Error(`Revision #${input.revisionNumber} not found in history`);
            }
            const fileKey = input.slot === 2
                ? entry.songFileKey2 as string | null
                : entry.songFileKey as string | null;

            // Delete file from R2
            if (fileKey) {
                try {
                    await StorageService.deleteFile(fileKey);
                } catch (error) {
                    console.error(`Failed to delete revision song file from R2:`, error);
                }
            }

            // Clear the fields in the history entry
            if (input.slot === 2) {
                entry.songFileUrl2 = null;
                entry.songFileKey2 = null;
            } else {
                entry.songFileUrl = null;
                entry.songFileKey = null;
            }

            history = normalizeRevisionHistory(history, { revisionCount: order.revisionCount }) as Array<Record<string, any>>;

            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: { revisionHistory: history as any },
            });

            return { success: true };
        }),

    /**
     * Send song delivery email to customer
     */
    sendSongDeliveryEmail: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            // Check that at least one song file is uploaded
            if (!order.songFileUrl && !order.songFileUrl2) {
                throw new Error("No song file uploaded yet");
            }

            if (!order.email) {
                throw new Error("Customer email not found");
            }

            // Determine effective song URLs (clean up stale slots for REVISION orders)
            const now = new Date();
            const updateData: Prisma.SongOrderUpdateInput = {
                status: "COMPLETED",
                songDeliveredAt: now,
            };

            // If the order is in REVISION, clear carried-over slots that were NOT updated
            // (same logic as completeRevision to prevent stale option 2 from showing)
            let effectiveSongUrl1 = order.songFileUrl;
            let effectiveSongUrl2 = order.songFileUrl2;

            if (order.status === "REVISION") {
                const history = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount }) as Array<Record<string, any> & { revisionNumber: number }>;
                const historyMap = new Map(history.map((e) => [e.revisionNumber, e]));
                const previousSnapshot = historyMap.get(order.revisionCount - 1);
                const revisionRequestedAtMs = order.revisionRequestedAt ? new Date(order.revisionRequestedAt).getTime() : null;

                const getSlotUpdatedState = (slot: 1 | 2): boolean | null => {
                    const currentUrl = slot === 2 ? order.songFileUrl2 : order.songFileUrl;
                    if (!currentUrl) return false;
                    const snapshotKey = slot === 2 ? "songFileUrl2" : "songFileUrl";
                    if (previousSnapshot && Object.prototype.hasOwnProperty.call(previousSnapshot, snapshotKey)) {
                        const prevUrl = previousSnapshot[snapshotKey] as unknown;
                        if (typeof prevUrl === "string") return prevUrl !== currentUrl;
                        if (prevUrl === null) return true;
                    }
                    const uploadedAt = slot === 2 ? order.songUploadedAt2 : order.songUploadedAt;
                    if (revisionRequestedAtMs && uploadedAt) {
                        return new Date(uploadedAt).getTime() > revisionRequestedAtMs;
                    }
                    return null;
                };

                const slot1Updated = getSlotUpdatedState(1);
                const slot2Updated = getSlotUpdatedState(2);

                // Clear slots that were NOT updated (treat uncertain/null as not updated)
                if (slot1Updated !== true) {
                    updateData.songFileUrl = null;
                    updateData.songFileKey = null;
                    updateData.songUploadedAt = null;
                    effectiveSongUrl1 = null;
                }
                if (slot2Updated !== true) {
                    updateData.songFileUrl2 = null;
                    updateData.songFileKey2 = null;
                    updateData.songUploadedAt2 = null;
                    effectiveSongUrl2 = null;
                }
            }

            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: updateData,
            });

            // Build and send email using effective (cleaned) URLs
            const trackOrderUrl = `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`;

            // Fetch child orders (GENRE_VARIANT) with lyrics for inclusion in the email
            const genreVariantOrders = await ctx.db.songOrder.findMany({
                where: {
                    parentOrderId: input.orderId,
                    orderType: "GENRE_VARIANT",
                    hasLyrics: true,
                },
                select: { id: true, genre: true },
            });

            // Build genreVariants array with track-order URLs
            const genreVariants = genreVariantOrders.map(gv => ({
                orderId: gv.id,
                genre: gv.genre,
                trackOrderUrl: `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`,
            }));

            const emailData = buildSongDeliveryEmail({
                orderId: order.id,
                recipientName: order.recipientName,
                locale: order.locale,
                trackOrderUrl,
                songFileUrl: effectiveSongUrl1 ?? undefined,
                songFileUrl2: effectiveSongUrl2 ?? undefined,
                hasCertificate: order.hasCertificate ?? false,
                certificateToken: order.certificateToken,
                hasLyrics: order.hasLyrics ?? false,
                genreVariants,
                customerEmail: order.email,
            });

            // Also mark child orders as COMPLETED only if they already have audio
            await ctx.db.songOrder.updateMany({
                where: {
                    parentOrderId: input.orderId,
                    orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT"] },
                    status: { in: ["PAID", "IN_PROGRESS"] },
                    OR: [
                        { songFileUrl: { not: null } },
                        { songFileUrl2: { not: null } },
                    ],
                },
                data: {
                    status: "COMPLETED",
                    songDeliveredAt: now,
                },
            });

            // Send email separately (best-effort, does not block status)
            try {
                await sendEmail({
                    to: order.email,
                    template: "song-delivery",
                    orderId: order.id,
                    metadata: { recipientName: order.recipientName },
                    ...emailData,
                });
            } catch (emailError) {
                console.error(`❌ [Admin] Delivery email failed for order ${order.id} (status already COMPLETED):`, emailError);
            }

            return {
                success: true,
                songDeliveredAt: updated.songDeliveredAt,
                status: updated.status,
            };
        }),

    resendDeliveryEmail: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            if (order.status !== "COMPLETED") {
                throw new Error("Order is not COMPLETED. Use sendSongDeliveryEmail instead.");
            }

            if (!order.songFileUrl && !order.songFileUrl2) {
                throw new Error("No song file uploaded yet");
            }

            if (!order.email) {
                throw new Error("Customer email not found");
            }

            const trackOrderUrl = `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`;

            const genreVariantOrders = await ctx.db.songOrder.findMany({
                where: {
                    parentOrderId: input.orderId,
                    orderType: "GENRE_VARIANT",
                    hasLyrics: true,
                },
                select: { id: true, genre: true },
            });

            const genreVariants = genreVariantOrders.map(gv => ({
                orderId: gv.id,
                genre: gv.genre,
                trackOrderUrl: `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`,
            }));

            const emailData = buildSongDeliveryEmail({
                orderId: order.id,
                recipientName: order.recipientName,
                locale: order.locale,
                trackOrderUrl,
                songFileUrl: order.songFileUrl ?? undefined,
                songFileUrl2: order.songFileUrl2 ?? undefined,
                hasCertificate: order.hasCertificate ?? false,
                certificateToken: order.certificateToken,
                hasLyrics: order.hasLyrics ?? false,
                genreVariants,
                customerEmail: order.email,
            });

            await sendEmail({
                to: order.email,
                template: "song-delivery-resend",
                orderId: order.id,
                metadata: { recipientName: order.recipientName, resend: true },
                ...emailData,
            });

            return { success: true };
        }),

    /**
     * Delete uploaded song file from R2
     * @param slot - 1 for first song option, 2 for second song option
     */
    deleteSongFile: adminProcedure
        .input(z.object({
            orderId: z.string(),
            slot: z.union([z.literal(1), z.literal(2)]).default(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            const isSlot2 = input.slot === 2;
            const fileKey = isSlot2 ? order.songFileKey2 : order.songFileKey;

            // Delete file from R2 if exists
            if (fileKey) {
                try {
                    await StorageService.deleteFile(fileKey);
                } catch (error) {
                    console.error(`Failed to delete song file (slot ${input.slot}) from R2:`, error);
                }
            }

            // Build update data based on slot
            const updateData = isSlot2 ? {
                songFileUrl2: null,
                songFileKey2: null,
                songUploadedAt2: null,
                kieAudioId2: null,
            } : {
                songFileUrl: null,
                songFileKey: null,
                songUploadedAt: null,
                kieTaskId: null,
                kieAudioId1: null,
            };

            // Check if we should revert status (only if no songs remain)
            const otherSlotHasSong = isSlot2 ? order.songFileUrl : order.songFileUrl2;
            if (!otherSlotHasSong && (order.status === "IN_PROGRESS" || order.status === "COMPLETED")) {
                (updateData as Record<string, unknown>).status = "PAID";
                (updateData as Record<string, unknown>).songDeliveredAt = null;
            }

            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: updateData,
            });

            // Limpar preferredSongForStreaming dos pedidos filhos que tinham a URL deletada
            const deletedUrl = isSlot2 ? order.songFileUrl2 : order.songFileUrl;
            if (deletedUrl) {
                await ctx.db.songOrder.updateMany({
                    where: {
                        parentOrderId: input.orderId,
                        orderType: "STREAMING_UPSELL",
                        preferredSongForStreaming: deletedUrl,
                    },
                    data: {
                        preferredSongForStreaming: null,
                    },
                });
            }

            return {
                success: true,
                slot: input.slot,
                status: updated.status,
            };
        }),

    /**
     * Get song delivery info for an order
     */
    getSongDeliveryInfo: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    // Option 1
                    songFileUrl: true,
                    songFileKey: true,
                    songUploadedAt: true,
                    // Option 2
                    songFileUrl2: true,
                    songFileKey2: true,
                    songUploadedAt2: true,
                    // Common
                    songDeliveredAt: true,
                    revisionCompletedBy: true,
                    revisionCompletedAt: true,
                    sunoAccountEmail: true,
                    status: true,
                    recipientName: true,
                    genre: true,
                    email: true,
                    backupWhatsApp: true,
                    locale: true,
                    orderType: true,
                    spotifyUrl: true,
                    streamingSongName: true,
                    preferredSongForStreaming: true,
                    streamingCoverUrl: true,
                    streamingCoverKey: true,
                    coverApproved: true,
                    coverHumanReviewRequested: true,
                    coverHumanReviewRequestedAt: true,
                    honoreePhotoUrl: true,
                    honoreePhotoKey: true,
                    // Parent order info for STREAMING_UPSELL
                    parentOrderId: true,
                    parentOrder: {
                        select: {
                            songFileUrl: true,
                            songFileUrl2: true,
                            lyrics: true,
                            recipientName: true,
                            genre: true,
                            status: true,
                        },
                    },
                    // Certificate and Lyrics order bumps
                    hasCertificate: true,
                    hasLyrics: true,
                    certificateToken: true,
                    lyrics: true,
                    lyricsPdfA4Url: true,
                    lyricsPdfA3Url: true,
                    // Revision history for song version history
                    revisionHistory: true,
                    revisionCount: true,
                    revisionRequestedAt: true,
                    revisionLockedBy: true,
                    revisionLockedAt: true,
                },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            return normalizeReviewerFieldsInOrder(order);
        }),

    updateStreamingVipUrl: adminProcedure
        .input(
            z.object({
                orderId: z.string(),
                spotifyUrl: z.string().url().or(z.literal("")).optional(),
                streamingSongName: z.string().or(z.literal("")).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    status: true,
                    email: true,
                    recipientName: true,
                    locale: true,
                    spotifyUrl: true,
                    streamingSongName: true,
                    streamingCoverUrl: true,
                    parentOrderId: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            if (order.orderType !== "STREAMING_UPSELL") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order is not a Streaming VIP upsell",
                });
            }

            const hasSpotifyInput = input.spotifyUrl !== undefined;
            const normalizedUrl = hasSpotifyInput ? input.spotifyUrl?.trim() ?? "" : "";
            const spotifyUrl = normalizedUrl === "" ? null : normalizedUrl;
            const hasSongNameInput = input.streamingSongName !== undefined;
            const normalizedSongName = hasSongNameInput ? input.streamingSongName?.trim() ?? "" : "";
            const streamingSongName = normalizedSongName === "" ? null : normalizedSongName;

            if (hasSongNameInput && streamingSongName) {
                const existingStreamingOrders = await ctx.db.songOrder.findMany({
                    where: {
                        orderType: "STREAMING_UPSELL",
                        id: { not: order.id },
                        status: { notIn: ["CANCELLED", "REFUNDED"] },
                        streamingSongName: { not: null },
                    },
                    select: {
                        streamingSongName: true,
                    },
                });

                const hasDuplicateSongName = existingStreamingOrders.some(
                    (existingOrder) =>
                        areStreamingSongNamesConflicting(streamingSongName, existingOrder.streamingSongName)
                );

                if (hasDuplicateSongName) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:
                            "Este nome de música já está em uso em outro pedido Streaming VIP. Escolha um nome diferente para publicar no DistroKid.",
                    });
                }
            }

            const shouldSendEmail = hasSpotifyInput && !!spotifyUrl && spotifyUrl !== order.spotifyUrl;
            const data: Prisma.SongOrderUpdateInput = {};

            if (hasSpotifyInput) {
                data.spotifyUrl = spotifyUrl;
            }
            if (hasSongNameInput) {
                data.streamingSongName = streamingSongName;
            }

            // Status changes are now manual:
            // - IN_PROGRESS: via markAsPublishedOnDistroKid mutation (requires name + cover + preferred version)
            // - COMPLETED: when adding Spotify URL
            if (hasSpotifyInput && spotifyUrl && (order.status === "PAID" || order.status === "IN_PROGRESS")) {
                data.status = "COMPLETED";
                data.songDeliveredAt = new Date();
            }

            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data,
                select: {
                    id: true,
                    status: true,
                    spotifyUrl: true,
                    streamingSongName: true,
                    songDeliveredAt: true,
                },
            });

            if (shouldSendEmail && order.email) {
                try {
                    const baseUrl = env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
                    const trackOrderUrl = `${baseUrl}/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`;
                    const emailData = buildStreamingVipReadyEmail({
                        orderId: order.id,
                        recipientName: order.recipientName,
                        locale: order.locale,
                        spotifyUrl,
                        trackOrderUrl,
                        songName: order.streamingSongName || undefined,
                        coverUrl: order.streamingCoverUrl || undefined,
                        customerEmail: order.email,
                    });

                    await sendEmail({
                        to: order.email,
                        template: "streaming-vip-ready",
                        orderId: order.id,
                        metadata: { recipientName: order.recipientName },
                        ...emailData,
                    });
                } catch (emailError) {
                    console.error(`❌ [Admin] Streaming VIP email failed for order ${order.id} (status already updated):`, emailError);
                }
            }

            // Auto-regenerate lyrics PDF with QR code if parent order has lyrics
            if (hasSpotifyInput && spotifyUrl && order.parentOrderId) {
                const parentOrder = await ctx.db.songOrder.findUnique({
                    where: { id: order.parentOrderId },
                    select: { id: true, hasLyrics: true },
                });
                if (parentOrder?.hasLyrics) {
                    const { enqueuePdfGeneration } = await import("~/server/queues/pdf-generation");
                    await enqueuePdfGeneration(parentOrder.id, "low");
                    console.log(`[updateStreamingVipUrl] Enqueued PDF regeneration for parent order ${parentOrder.id} (now includes Spotify QR)`);
                }
            }

            return updated;
        }),

    // Mark streaming upsell as published on DistroKid (PAID -> IN_PROGRESS)
    markAsPublishedOnDistroKid: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    status: true,
                    streamingSongName: true,
                    parentOrderId: true,
                    streamingCoverUrl: true,
                    coverApproved: true,
                    preferredSongForStreaming: true,
                    email: true,
                    locale: true,
                    recipientName: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Pedido não encontrado",
                });
            }

            if (order.orderType !== "STREAMING_UPSELL") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Este pedido não é um Streaming VIP",
                });
            }

            if (order.status !== "PAID") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Este pedido já foi processado",
                });
            }

            // Validate all required fields
            const missingFields: string[] = [];
            if (!order.streamingSongName) missingFields.push("Nome da música");
            if (!order.streamingCoverUrl) missingFields.push("Capa");
            if (!order.coverApproved) missingFields.push("Aprovação da capa");
            if (!order.preferredSongForStreaming) missingFields.push("Versão preferida");

            if (missingFields.length > 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Campos obrigatórios faltando: ${missingFields.join(", ")}`,
                });
            }

            if (order.streamingSongName) {
                const existingStreamingOrders = await ctx.db.songOrder.findMany({
                    where: {
                        orderType: "STREAMING_UPSELL",
                        id: { not: order.id },
                        status: { notIn: ["CANCELLED", "REFUNDED"] },
                        streamingSongName: { not: null },
                    },
                    select: {
                        streamingSongName: true,
                    },
                });

                const hasDuplicateSongName = existingStreamingOrders.some(
                    (existingOrder) =>
                        areStreamingSongNamesConflicting(order.streamingSongName, existingOrder.streamingSongName)
                );

                if (hasDuplicateSongName) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:
                            "Nome da música duplicado em outro pedido Streaming VIP. Ajuste para um nome único antes de marcar como publicado.",
                    });
                }
            }

            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    status: "IN_PROGRESS",
                },
                select: {
                    id: true,
                    status: true,
                },
            });

            // Send email notification (best-effort)
            if (order.email) {
                try {
                    const loc = order.locale === "en" ? "" : `${order.locale}/`;
                    const baseUrl = env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
                    const trackOrderUrl = `${baseUrl}/${loc}track-order?email=${encodeURIComponent(order.email)}`;

                    const emailData = buildStreamingVipInProgressEmail({
                        orderId: order.id,
                        recipientName: order.recipientName,
                        locale: order.locale,
                        trackOrderUrl,
                        songName: order.streamingSongName,
                        coverUrl: order.streamingCoverUrl,
                        customerEmail: order.email,
                    });

                    await sendEmail({
                        to: order.email,
                        template: "streaming-vip-in-progress",
                        orderId: order.id,
                        metadata: { recipientName: order.recipientName },
                        ...emailData,
                    });
                } catch (emailError) {
                    console.error(`❌ [Admin] Streaming VIP in-progress email failed for order ${order.id} (status already IN_PROGRESS):`, emailError);
                }
            }

            return updated;
        }),

    // ============= PRONUNCIATION CORRECTIONS =============
    getPronunciationCorrections: adminProcedure.query(async ({ ctx }) => {
        return ctx.db.pronunciationCorrection.findMany({
            orderBy: { createdAt: "desc" },
        });
    }),

    createPronunciationCorrection: adminProcedure
        .input(z.object({
            original: z.string().min(1),
            replacement: z.string().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.pronunciationCorrection.create({
                data: input,
            });
        }),

    updatePronunciationCorrection: adminProcedure
        .input(z.object({
            id: z.string(),
            original: z.string().min(1),
            replacement: z.string().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.pronunciationCorrection.update({
                where: { id: input.id },
                data: {
                    original: input.original,
                    replacement: input.replacement,
                },
            });
        }),

    deletePronunciationCorrection: adminProcedure
        .input(z.object({
            id: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.pronunciationCorrection.delete({
                where: { id: input.id },
            });
        }),

    /**
     * Apply pronunciation corrections from the dictionary to the current lyrics of an order.
     * Overwrites `lyrics` with corrected pronunciation and auto-generates `displayLyrics` (clean version).
     */
    applyPronunciationToLyrics: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: { lyrics: true },
            });

            if (!order?.lyrics) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found or has no lyrics",
                });
            }

            const corrections = await ctx.db.pronunciationCorrection.findMany({
                select: { original: true, replacement: true },
            });

            if (corrections.length === 0) {
                return { lyrics: order.lyrics, applied: 0 };
            }

            const corrected = applyPronunciationCorrections(order.lyrics, corrections);

            if (corrected === order.lyrics) {
                return { lyrics: order.lyrics, applied: 0 };
            }

            // Count how many corrections were actually applied
            let applied = 0;
            const sorted = [...corrections].sort((a, b) => b.original.length - a.original.length);
            const wordChars = "[\\p{L}\\p{M}\\p{N}_]";
            for (const { original } of sorted) {
                const normalizedOriginal = original.normalize("NFC");
                const escaped = normalizedOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regex = new RegExp(`(?<!${wordChars})${escaped}(?!${wordChars})`, "giu");
                const matches = order.lyrics.normalize("NFC").match(regex);
                if (matches) applied += matches.length;
            }

            // Save corrected lyrics and auto-generate clean displayLyrics
            const displayLyrics = stripPronunciationCorrections(corrected, corrections);
            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    lyrics: corrected,
                    displayLyrics,
                },
            });

            return { lyrics: corrected, applied };
        }),

    // ============= GENRE PROMPTS CRUD =============
    getGenrePrompts: adminProcedure.query(async ({ ctx }) => {
        return ctx.db.genrePrompt.findMany({
            orderBy: [{ genre: "asc" }, { locale: "asc" }],
        });
    }),

    createGenrePrompt: adminProcedure
        .input(z.object({
            genre: z.string().min(1),
            locale: z.string().min(1),
            prompt: z.string().min(1),
            displayName: z.string().min(1),
            isActive: z.boolean().optional().default(true),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.genrePrompt.create({ data: input });
        }),

    updateGenrePrompt: adminProcedure
        .input(z.object({
            id: z.string(),
            genre: z.string().min(1),
            locale: z.string().min(1),
            prompt: z.string().min(1),
            displayName: z.string().min(1),
            isActive: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...data } = input;
            return ctx.db.genrePrompt.update({ where: { id }, data });
        }),

    deleteGenrePrompt: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.genrePrompt.delete({ where: { id: input.id } });
        }),

    syncGenrePromptsFromCode: adminProcedure.mutation(async ({ ctx }) => {
        // Import hardcoded genres from genre-mapping.ts
        const { GENRE_STYLES, GENRE_DISPLAY_NAMES, GENRE_LOCALES } = await import("~/server/services/suno/genre-mapping");

        let created = 0;
        let updated = 0;

        for (const [genre, prompt] of Object.entries(GENRE_STYLES)) {
            const displayName = GENRE_DISPLAY_NAMES[genre] || genre;
            const locale = GENRE_LOCALES[genre] || "all";

            const existing = await ctx.db.genrePrompt.findUnique({
                where: { genre_locale: { genre, locale } },
            });

            if (existing) {
                // Only update if prompt or displayName changed
                if (existing.prompt !== prompt || existing.displayName !== displayName) {
                    await ctx.db.genrePrompt.update({
                        where: { id: existing.id },
                        data: { prompt, displayName },
                    });
                    updated++;
                }
            } else {
                await ctx.db.genrePrompt.create({
                    data: { genre, locale, prompt, displayName, isActive: true },
                });
                created++;
            }
        }

        return { created, updated, total: Object.keys(GENRE_STYLES).length };
    }),

    // ============= GENRE AUDIO SAMPLES =============
    getGenreAudioSamples: adminProcedure.query(async ({ ctx }) => {
        return ctx.db.genreAudioSample.findMany({
            orderBy: [{ locale: "asc" }, { genre: "asc" }, { vocals: "asc" }],
            select: {
                locale: true,
                genre: true,
                vocals: true,
                audioUrl: true,
            },
        });
    }),

    saveGenreAudioSamples: adminProcedure
        .input(
            z.object({
                locale: z.enum(locales),
                vocals: z.enum(["male", "female"]).default("male"),
                samples: z.array(
                    z.object({
                        genre: z.enum(genreTypes),
                        audioUrl: z.string().trim().optional().nullable(),
                    })
                ),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const allowedGenres = new Set(getGenreAudioEntries(input.locale).map((entry) => entry.id));
            const operations: Array<Prisma.PrismaPromise<unknown>> = [];
            let saved = 0;
            let cleared = 0;

            for (const sample of input.samples) {
                if (!allowedGenres.has(sample.genre)) {
                    continue;
                }

                const audioUrl = sample.audioUrl?.trim() ?? "";

                if (!audioUrl) {
                    operations.push(
                        ctx.db.genreAudioSample.deleteMany({
                            where: {
                                locale: input.locale,
                                genre: sample.genre,
                                vocals: input.vocals,
                            },
                        })
                    );
                    cleared++;
                    continue;
                }

                operations.push(
                    ctx.db.genreAudioSample.upsert({
                        where: {
                            locale_genre_vocals: {
                                locale: input.locale,
                                genre: sample.genre,
                                vocals: input.vocals,
                            },
                        },
                        create: {
                            locale: input.locale,
                            genre: sample.genre,
                            vocals: input.vocals,
                            audioUrl,
                        },
                        update: {
                            audioUrl,
                        },
                    })
                );
                saved++;
            }

            if (operations.length > 0) {
                await ctx.db.$transaction(operations);
            }

            return { saved, cleared };
        }),

    // ============= CHECKOUT DISCOUNT COUPONS =============
    getCheckoutCouponConfig: adminProcedure.query(async ({ ctx }) => {
        return ctx.db.checkoutCouponConfig.upsert({
            where: { id: CHECKOUT_COUPON_CONFIG_ID },
            create: {
                id: CHECKOUT_COUPON_CONFIG_ID,
                couponFieldEnabled: false,
            },
            update: {},
            select: {
                id: true,
                couponFieldEnabled: true,
                updatedAt: true,
            },
        });
    }),

    updateCheckoutCouponConfig: adminProcedure
        .input(
            z.object({
                couponFieldEnabled: z.boolean(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            return ctx.db.checkoutCouponConfig.upsert({
                where: { id: CHECKOUT_COUPON_CONFIG_ID },
                create: {
                    id: CHECKOUT_COUPON_CONFIG_ID,
                    couponFieldEnabled: input.couponFieldEnabled,
                },
                update: {
                    couponFieldEnabled: input.couponFieldEnabled,
                },
                select: {
                    id: true,
                    couponFieldEnabled: true,
                    updatedAt: true,
                },
            });
        }),

    getDiscountCoupons: adminProcedure.query(async ({ ctx }) => {
        const coupons = await ctx.db.discountCoupon.findMany({
            orderBy: [{ createdAt: "desc" }, { code: "asc" }],
            select: {
                id: true,
                code: true,
                discountPercent: true,
                maxUses: true,
                usedCount: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Count paid orders per coupon
        const couponIds = coupons.map((c) => c.id);
        const paidCounts = couponIds.length > 0
            ? await ctx.db.songOrder.groupBy({
                by: ["couponId"],
                where: {
                    couponId: { in: couponIds },
                    status: { not: "PENDING" },
                },
                _count: { id: true },
            })
            : [];

        const paidCountMap = new Map(
            paidCounts.map((row) => [row.couponId, row._count.id])
        );

        return coupons.map((coupon) => ({
            ...coupon,
            paidCount: paidCountMap.get(coupon.id) ?? 0,
        }));
    }),

    createDiscountCoupon: adminProcedure
        .input(DiscountCouponInputSchema)
        .mutation(async ({ ctx, input }) => {
            const normalizedCode = normalizeCouponCode(input.code);
            if (!normalizedCode || !isValidCouponCode(normalizedCode)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Código de cupom inválido. Use apenas letras, números, - ou _.",
                });
            }

            const existing = await ctx.db.discountCoupon.findUnique({
                where: { code: normalizedCode },
                select: { id: true },
            });
            if (existing) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Já existe um cupom com este código.",
                });
            }

            return ctx.db.discountCoupon.create({
                data: {
                    code: normalizedCode,
                    discountPercent: input.discountPercent,
                    maxUses: input.maxUses ?? null,
                    isActive: input.isActive ?? true,
                },
                select: {
                    id: true,
                    code: true,
                    discountPercent: true,
                    maxUses: true,
                    usedCount: true,
                    isActive: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }),

    updateDiscountCoupon: adminProcedure
        .input(
            DiscountCouponInputSchema.extend({
                id: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const normalizedCode = normalizeCouponCode(input.code);
            if (!normalizedCode || !isValidCouponCode(normalizedCode)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Código de cupom inválido. Use apenas letras, números, - ou _.",
                });
            }

            const existingCoupon = await ctx.db.discountCoupon.findUnique({
                where: { id: input.id },
                select: { id: true, usedCount: true },
            });
            if (!existingCoupon) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Cupom não encontrado.",
                });
            }

            if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses < existingCoupon.usedCount) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "O limite de uso não pode ser menor que os usos já registrados.",
                });
            }

            const duplicate = await ctx.db.discountCoupon.findFirst({
                where: {
                    code: normalizedCode,
                    id: { not: input.id },
                },
                select: { id: true },
            });
            if (duplicate) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Já existe outro cupom com este código.",
                });
            }

            return ctx.db.discountCoupon.update({
                where: { id: input.id },
                data: {
                    code: normalizedCode,
                    discountPercent: input.discountPercent,
                    maxUses: input.maxUses ?? null,
                    isActive: input.isActive ?? true,
                },
                select: {
                    id: true,
                    code: true,
                    discountPercent: true,
                    maxUses: true,
                    usedCount: true,
                    isActive: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }),

    deleteDiscountCoupon: adminProcedure
        .input(
            z.object({
                id: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.discountCoupon.findUnique({
                where: { id: input.id },
                select: { id: true },
            });
            if (!existing) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Cupom não encontrado.",
                });
            }

            await ctx.db.songOrder.updateMany({
                where: { couponId: input.id },
                data: { couponId: null },
            });

            return ctx.db.discountCoupon.delete({
                where: { id: input.id },
                select: {
                    id: true,
                },
            });
        }),

    // ============= STREAMING VIP AUTOMATION =============

    /**
     * Generate song name suggestions for Streaming VIP orders
     * Uses the parent order's lyrics to generate 5 name suggestions
     */
    generateSongNameSuggestions: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Find the streaming upsell order
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    parentOrderId: true,
                    parentOrder: {
                        select: {
                            id: true,
                            lyrics: true,
                            recipientName: true,
                            genre: true,
                            locale: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
            }

            if (order.orderType !== "STREAMING_UPSELL") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Order is not a Streaming VIP upsell" });
            }

            const parentOrder = order.parentOrder;
            if (!parentOrder) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Parent order not found" });
            }

            if (!parentOrder.lyrics) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Parent order has no lyrics generated yet" });
            }

            // Import generator dynamically
            const { generateSongNameSuggestions } = await import("~/lib/streaming-vip-generator");

            const suggestions = await generateSongNameSuggestions({
                lyrics: parentOrder.lyrics,
                recipientName: parentOrder.recipientName,
                genre: parentOrder.genre,
                locale: parentOrder.locale,
            });

            const existingStreamingOrders = await ctx.db.songOrder.findMany({
                where: {
                    orderType: "STREAMING_UPSELL",
                    id: { not: order.id },
                    status: { notIn: ["CANCELLED", "REFUNDED"] },
                    streamingSongName: { not: null },
                },
                select: {
                    streamingSongName: true,
                },
            });

            const existingStreamingSongNames = existingStreamingOrders
                .map((existingOrder) => existingOrder.streamingSongName)
                .filter((name): name is string => !!name?.trim());

            const uniqueSuggestions: string[] = [];
            for (const suggestion of suggestions) {
                const cleanedSuggestion = suggestion.replace(/\s+/g, " ").trim();
                if (!cleanedSuggestion) continue;

                const conflictsWithExistingStreamingOrder = existingStreamingSongNames.some((existingName) =>
                    areStreamingSongNamesConflicting(cleanedSuggestion, existingName)
                );
                if (conflictsWithExistingStreamingOrder) continue;

                const duplicatesExistingSuggestion = uniqueSuggestions.some((existingSuggestion) =>
                    areStreamingSongNamesConflicting(cleanedSuggestion, existingSuggestion)
                );
                if (duplicatesExistingSuggestion) continue;

                uniqueSuggestions.push(cleanedSuggestion);
            }

            if (uniqueSuggestions.length > 0) {
                return { suggestions: uniqueSuggestions };
            }

            const localeSuffix =
                parentOrder.locale === "pt"
                    ? "Versão"
                    : parentOrder.locale === "es"
                    ? "Versión"
                    : parentOrder.locale === "fr"
                    ? "Version"
                    : parentOrder.locale === "it"
                    ? "Versione"
                    : "Version";

            const fallbackSuggestions: string[] = [];
            suggestions.forEach((suggestion, index) => {
                const cleanedSuggestion = suggestion.replace(/\s+/g, " ").trim();
                if (!cleanedSuggestion) return;
                const candidate = `${cleanedSuggestion} - ${localeSuffix} ${index + 2}`;
                if (existingStreamingSongNames.some((existingName) => areStreamingSongNamesConflicting(candidate, existingName))) {
                    return;
                }
                if (fallbackSuggestions.some((existingName) => areStreamingSongNamesConflicting(candidate, existingName))) {
                    return;
                }
                fallbackSuggestions.push(candidate);
            });

            return { suggestions: fallbackSuggestions.length > 0 ? fallbackSuggestions : suggestions };
        }),

    /**
     * Generate cover art prompts for Streaming VIP orders
     * Creates fixed cartoon and original-photo prompts
     */
    generateCoverPrompts: adminProcedure
        .input(z.object({
            orderId: z.string(),
            customPrompt: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Find the streaming upsell order
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    parentOrderId: true,
                    streamingSongName: true,
                    parentOrder: {
                        select: {
                            id: true,
                            lyrics: true,
                            recipientName: true,
                            genre: true,
                            qualities: true,
                            locale: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
            }

            if (order.orderType !== "STREAMING_UPSELL") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Order is not a Streaming VIP upsell" });
            }

            const parentOrder = order.parentOrder;
            if (!parentOrder) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Parent order not found" });
            }

            if (!parentOrder.lyrics) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Parent order has no lyrics generated yet" });
            }

            // Import generator dynamically
            const { generateCoverPrompts } = await import("~/lib/streaming-vip-generator");

            const result = await generateCoverPrompts({
                lyrics: parentOrder.lyrics,
                recipientName: parentOrder.recipientName,
                genre: parentOrder.genre,
                qualities: parentOrder.qualities || "",
                locale: parentOrder.locale,
                songName: order.streamingSongName || undefined,
                customPrompt: input.customPrompt,
            });

            return result;
        }),

    /**
     * Generate cover image using AI via OpenRouter
     * Takes a prompt + honoree photo and generates a cover image
     */
    generateCoverImage: adminProcedure
        .input(z.object({
            orderId: z.string(),
            promptType: z.enum(["cartoon", "photo", "photoImproved"]),
            prompt: z.string().min(1),
        }))
        .mutation(async () => {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Geração de capa por IA no admin foi desativada. Use a geração automática única no fluxo do cliente.",
            });
        }),

    /**
     * Set a specific generated cover as the active/official cover for streaming
     */
    setActiveCover: adminProcedure
        .input(z.object({
            orderId: z.string(),
            url: z.string(),
            key: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    streamingCoverUrl: input.url,
                    streamingCoverKey: input.key,
                    coverApproved: false,
                },
            });
            return { success: true };
        }),

    /**
     * Delete a generated cover by prompt type from R2
     */
    deleteGeneratedCover: adminProcedure
        .input(z.object({
            orderId: z.string(),
            promptType: z.enum(["cartoon", "photo", "photoImproved"]),
        }))
        .mutation(async ({ ctx, input }) => {
            const key = `covers/${input.orderId}-cover-${input.promptType}.jpg`;

            try {
                await StorageService.deleteFile(key);
            } catch (e) {
                console.error(`Failed to delete cover ${key}:`, e);
            }

            // If this was the active cover, clear it
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: { streamingCoverKey: true },
            });

            if (order?.streamingCoverKey === key) {
                await ctx.db.songOrder.update({
                    where: { id: input.orderId },
                    data: {
                        streamingCoverUrl: null,
                        streamingCoverKey: null,
                        coverApproved: false,
                    },
                });
            }

            return { success: true };
        }),

    /**
     * Toggle cover approval status
     */
    toggleCoverApproval: adminProcedure
        .input(z.object({
            orderId: z.string(),
            approved: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    coverApproved: input.approved,
                    ...(input.approved
                        ? {
                            coverHumanReviewRequested: false,
                            coverHumanReviewRequestedAt: null,
                        }
                        : {}),
                },
            });
            return { success: true, approved: input.approved };
        }),

    // Send urgent contact email for Streaming VIP PAID orders
    sendStreamingUrgentContactEmail: adminProcedure
        .input(z.object({
            orderId: z.string().cuid(),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    orderType: true,
                    status: true,
                    locale: true,
                    streamingSongName: true,
                    parentOrder: {
                        select: {
                            recipientName: true,
                        },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
            }

            if (order.orderType !== "STREAMING_UPSELL") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Order is not a Streaming VIP order" });
            }

            if (order.status !== "PAID") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Order is not in PAID status" });
            }

            if (!order.email) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Order has no email" });
            }

            const recipientName = order.parentOrder?.recipientName || "";

            const emailData = buildStreamingUrgentContactEmail({
                orderId: order.id,
                recipientName,
                email: order.email,
                locale: order.locale || "pt",
                streamingSongName: order.streamingSongName,
            });

            await sendEmail({
                to: order.email,
                subject: emailData.subject,
                html: emailData.html,
                text: emailData.text,
                template: "streaming-urgent-contact",
                orderId: order.id,
                metadata: { recipientName },
            });

            return { success: true, email: order.email };
        }),

    /**
     * Manually trigger karaoke generation for a paid KARAOKE_UPSELL order.
     * Mirrors the payment webhook flow and keeps Kie IDs synchronized.
     */
    triggerKaraokeUpsellGeneration: adminProcedure
        .input(z.object({
            orderId: z.string().cuid(),
        }))
        .mutation(async ({ ctx, input }) => {
            const karaokeOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    status: true,
                    orderType: true,
                    parentOrderId: true,
                    kieTaskId: true,
                    kieAudioId1: true,
                    kieAudioId2: true,
                    parentOrder: {
                        select: {
                            id: true,
                            songFileUrl: true,
                            kieTaskId: true,
                            kieAudioId1: true,
                            kieAudioId2: true,
                        },
                    },
                },
            });

            if (!karaokeOrder) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
            }

            if (karaokeOrder.orderType !== "KARAOKE_UPSELL") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order is not a karaoke upsell",
                });
            }

            if (!["PAID", "IN_PROGRESS", "COMPLETED"].includes(karaokeOrder.status)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Karaoke upsell must be paid before triggering generation",
                });
            }

            const parentOrder = karaokeOrder.parentOrder;
            if (!karaokeOrder.parentOrderId || !parentOrder) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent order not found for karaoke upsell",
                });
            }

            if (!parentOrder.songFileUrl) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent song is not ready yet",
                });
            }

            // Keep parity with the automatic flow:
            // always use the parent order's current Kie IDs (source-of-truth).
            const resolvedKieTaskId = parentOrder.kieTaskId?.trim() || "";
            const resolvedKieAudioId = parentOrder.kieAudioId1?.trim() || "";
            const resolvedKieAudioId2 = parentOrder.kieAudioId2?.trim() || undefined;

            if (!resolvedKieTaskId || !resolvedKieAudioId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent order is missing Kie IDs. Karaoke generation must use parent Kie IDs to preserve the original track mapping.",
                });
            }

            const jobId = `karaoke_${karaokeOrder.id}`;
            const existingJob = await karaokeGenerationQueue.getJob(jobId);

            if (existingJob) {
                const state = await existingJob.getState();
                if (["active", "waiting", "delayed", "waiting-children"].includes(state)) {
                    return {
                        success: true,
                        alreadyQueued: true,
                        jobId,
                        jobState: state,
                    };
                }

                if (state !== "unknown") {
                    await existingJob.remove();
                }
            }

            const childUpdateData: Prisma.SongOrderUpdateInput = {
                status: "IN_PROGRESS",
                karaokeStatus: "pending",
                karaokeError: null,
                kieTaskId: resolvedKieTaskId,
                kieAudioId1: resolvedKieAudioId,
                kieAudioId2: resolvedKieAudioId2 ?? null,
            };

            await ctx.db.$transaction([
                ctx.db.songOrder.update({
                    where: { id: parentOrder.id },
                    data: {
                        hasKaraokePlayback: true,
                        karaokeStatus: "pending",
                        karaokeError: null,
                    },
                }),
                ctx.db.songOrder.update({
                    where: { id: karaokeOrder.id },
                    data: childUpdateData,
                }),
            ]);

            try {
                await enqueueKaraokeGeneration({
                    orderId: karaokeOrder.id,
                    parentOrderId: parentOrder.id,
                    songFileUrl: parentOrder.songFileUrl,
                    kieTaskId: resolvedKieTaskId,
                    kieAudioId: resolvedKieAudioId,
                    kieAudioId2: resolvedKieAudioId2,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : "";
                if (/job.*exists|JobIdAlreadyExists/i.test(message)) {
                    return {
                        success: true,
                        alreadyQueued: true,
                        jobId,
                        jobState: "waiting",
                    };
                }
                throw error;
            }

            return {
                success: true,
                alreadyQueued: false,
                jobId,
                jobState: "waiting",
            };
        }),

    /**
     * Get revision queue info for a specific order
     * Returns the position of the order in the revision queue and total count
     */
    getRevisionQueueInfo: adminProcedure
        .input(z.object({
            orderId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            // Get all orders in REVISION status, sorted by revisionRequestedAt (oldest first = queue order)
            const revisionOrders = await ctx.db.songOrder.findMany({
                where: { status: "REVISION" },
                orderBy: { revisionRequestedAt: "asc" },
                select: { id: true },
            });

            const totalInQueue = revisionOrders.length;
            const position = revisionOrders.findIndex(order => order.id === input.orderId) + 1;

            return {
                position: position > 0 ? position : null,
                total: totalInQueue,
            };
        }),

    /**
     * Create a streaming upsell order from admin panel and return checkout URL
     * Allows admin to create streaming VIP for a specific song of an order
     */
    createStreamingUpsellForSong: adminProcedure
        .input(z.object({
            orderId: z.string().cuid(),
            songSlot: z.enum(["1", "2"]),
        }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    backupWhatsApp: true,
                    status: true,
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    vocals: true,
                    locale: true,
                    currency: true,
                    orderType: true,
                    qualities: true,
                    memories: true,
                    message: true,
                    hasFastDelivery: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate order type - can only create streaming for main, extra song, or genre variant
            if (!["MAIN", "EXTRA_SONG", "GENRE_VARIANT"].includes(order.orderType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only create streaming upsell for main, extra song, or genre variant orders",
                });
            }

            // Validate status
            if (order.status === "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order must be paid first",
                });
            }

            // Get the song URL for the specified slot
            const songUrl = input.songSlot === "1" ? order.songFileUrl : order.songFileUrl2;
            if (!songUrl) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Song ${input.songSlot} does not exist for this order`,
                });
            }

            // Check if streaming upsell already exists for this song
            const existingUpsell = await ctx.db.songOrder.findFirst({
                where: {
                    parentOrderId: order.id,
                    orderType: "STREAMING_UPSELL",
                    preferredSongForStreaming: songUrl,
                    status: { in: ["PENDING", "PAID", "IN_PROGRESS", "COMPLETED"] },
                },
                select: { id: true, status: true },
            });

            if (existingUpsell) {
                // Return existing checkout URL
                const locale = order.locale || "pt";
                const checkoutUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://apollosong.com"}/${locale}/order/${existingUpsell.id}`;
                return {
                    success: true,
                    orderId: existingUpsell.id,
                    checkoutUrl,
                    alreadyExists: true,
                    status: existingUpsell.status,
                };
            }

            // Check if there's already a PAID streaming upsell for the OTHER song (to apply discount)
            // Only PAID or later counts as "purchased" - PENDING orders should not affect pricing
            const hasTwoSongs = !!(order.songFileUrl && order.songFileUrl2);
            const otherSongUrl = input.songSlot === "1" ? order.songFileUrl2 : order.songFileUrl;
            const otherSlotPurchased = hasTwoSongs && otherSongUrl && await ctx.db.songOrder.findFirst({
                where: {
                    parentOrderId: order.id,
                    orderType: "STREAMING_UPSELL",
                    preferredSongForStreaming: otherSongUrl,
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                },
                select: { id: true },
            });

            // Calculate price (discounted if buying second song)
            const isSecondSongPurchase = !!otherSlotPurchased;
            const PRICES = {
                USD: { full: 9900, discounted: 7500 },
                BRL: { full: 19700, discounted: 14700 },
                EUR: { full: 9900, discounted: 6700 },
                ES: { full: 9900, discounted: 7500 },
            };

            let price: number;
            if (order.currency === "BRL") {
                price = isSecondSongPurchase ? PRICES.BRL.discounted : PRICES.BRL.full;
            } else if (order.locale === "es") {
                price = isSecondSongPurchase ? PRICES.ES.discounted : PRICES.ES.full;
            } else if (order.currency === "EUR") {
                price = isSecondSongPurchase ? PRICES.EUR.discounted : PRICES.EUR.full;
            } else {
                price = isSecondSongPurchase ? PRICES.USD.discounted : PRICES.USD.full;
            }

            // Create the streaming upsell order
            const streamingOrder = await ctx.db.songOrder.create({
                data: {
                    parentOrderId: order.id,
                    orderType: "STREAMING_UPSELL",
                    priceAtOrder: price,
                    preferredSongForStreaming: songUrl,

                    recipient: order.recipient,
                    recipientName: order.recipientName,
                    genre: order.genre,
                    vocals: order.vocals,
                    qualities: order.qualities,
                    memories: order.memories,
                    message: order.message,
                    email: order.email,
                    backupWhatsApp: order.backupWhatsApp,
                    locale: order.locale,
                    currency: order.currency,
                    hasFastDelivery: order.hasFastDelivery,
                },
            });

            // Build checkout URL
            const locale = order.locale || "pt";
            const checkoutUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://apollosong.com"}/${locale}/order/${streamingOrder.id}`;

            return {
                success: true,
                orderId: streamingOrder.id,
                checkoutUrl,
                alreadyExists: false,
                price,
                currency: order.currency,
                isDiscounted: isSecondSongPurchase,
            };
        }),

    // ============= SUNO ACCOUNTS TRACKING =============
    getSunoEmails: adminProcedure.query(async ({ ctx }) => {
        // Get all distinct suno account emails with count of songs generated
        const results = await ctx.db.songOrder.groupBy({
            by: ["sunoAccountEmail"],
            where: {
                sunoAccountEmail: { not: null },
            },
            _count: {
                sunoAccountEmail: true,
            },
            orderBy: {
                _count: {
                    sunoAccountEmail: "desc",
                },
            },
        });

        // Get additional info: last used date for each email
        const emailsWithDetails = await Promise.all(
            results.map(async (result) => {
                const lastOrder = await ctx.db.songOrder.findFirst({
                    where: { sunoAccountEmail: result.sunoAccountEmail },
                    orderBy: { songUploadedAt: "desc" },
                    select: {
                        songUploadedAt: true,
                        songUploadedAt2: true,
                    },
                });

                const lastUsed = lastOrder?.songUploadedAt2 || lastOrder?.songUploadedAt || null;

                return {
                    email: result.sunoAccountEmail!,
                    songsGenerated: result._count.sunoAccountEmail,
                    lastUsed,
                };
            })
        );

        return emailsWithDetails;
    }),

    // ============= SUPPORT TICKETS =============

    getTickets: adminProcedure
        .input(
            z.object({
                page: z.number().min(1).default(1),
                pageSize: z.number().min(10).max(100).default(20),
                search: z.string().optional(),
                status: z.enum(["ALL", "OPEN", "WAITING_REPLY", "RESOLVED", "CLOSED"]).optional(),
                priority: z.enum(["ALL", "LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
                dateFrom: z.date().optional(),
                dateTo: z.date().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            const conditions: any[] = [];

            if (input.status && input.status !== "ALL") {
                conditions.push({ status: input.status });
            }

            if (input.priority && input.priority !== "ALL") {
                conditions.push({ priority: input.priority });
            }

            if (input.search?.trim()) {
                const s = input.search.trim();
                conditions.push({
                    OR: [
                        { email: { contains: s, mode: "insensitive" } },
                        { subject: { contains: s, mode: "insensitive" } },
                        { id: s },
                    ],
                });
            }

            if (input.dateFrom) {
                conditions.push({ createdAt: { gte: input.dateFrom } });
            }
            if (input.dateTo) {
                const endOfDay = new Date(input.dateTo);
                endOfDay.setHours(23, 59, 59, 999);
                conditions.push({ createdAt: { lte: endOfDay } });
            }

            const where = conditions.length > 0 ? { AND: conditions } : {};

            const [items, total] = await Promise.all([
                ctx.db.supportTicket.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: (input.page - 1) * input.pageSize,
                    take: input.pageSize,
                    include: {
                        messages: {
                            orderBy: { createdAt: "desc" },
                            take: 1,
                        },
                        order: {
                            select: {
                                recipientName: true,
                                status: true,
                                genre: true,
                                backupWhatsApp: true,
                            },
                        },
                        _count: { select: { messages: true } },
                    },
                }),
                ctx.db.supportTicket.count({ where }),
            ]);

            // Enrich with reply status (has any outbound message?)
            const ticketIds = items.map(t => t.id);
            const outboundCounts = ticketIds.length > 0
                ? await ctx.db.ticketMessage.groupBy({
                    by: ["ticketId"],
                    where: { ticketId: { in: ticketIds }, direction: "OUTBOUND" },
                    _count: true,
                })
                : [];
            const outboundMap = new Map(outboundCounts.map(c => [c.ticketId, c._count]));

            const enrichedItems = items.map(t => ({
                ...t,
                hasReply: (outboundMap.get(t.id) || 0) > 0,
            }));

            return { items: enrichedItems, total, page: input.page, pageSize: input.pageSize };
        }),

    getOrdersByEmail: adminProcedure
        .input(z.object({ email: z.string() }))
        .query(async ({ ctx, input }) => {
            const canViewFinancials = ctx.adminUser.adminRole === "SUPER_ADMIN";
            const orders = await ctx.db.songOrder.findMany({
                where: { email: { equals: input.email, mode: "insensitive" } },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    status: true,
                    recipientName: true,
                    genre: true,
                    vocals: true,
                    locale: true,
                    createdAt: true,
                    priceAtOrder: true,
                    currency: true,
                    backupWhatsApp: true,
                    orderType: true,
                },
            });

            return orders.map((order) => ({
                ...order,
                priceAtOrder: canViewFinancials ? order.priceAtOrder : 0,
                canViewFinancials,
            }));
        }),

    getNextUnrepliedTicketId: adminProcedure
        .input(z.object({ excludeId: z.string().optional() }))
        .query(async ({ ctx, input }) => {
            const ticket = await ctx.db.supportTicket.findFirst({
                where: {
                    id: input.excludeId ? { not: input.excludeId } : undefined,
                    status: { in: ["OPEN"] },
                    messages: { none: { direction: "OUTBOUND" } },
                },
                orderBy: { createdAt: "desc" },
                select: { id: true },
            });
            return ticket?.id ?? null;
        }),

    getTicketById: adminProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const ticket = await ctx.db.supportTicket.findUnique({
                where: { id: input.id },
                include: {
                    messages: { orderBy: { createdAt: "asc" } },
                    order: {
                        select: {
                            id: true,
                            status: true,
                            recipientName: true,
                            genre: true,
                            vocals: true,
                            locale: true,
                            email: true,
                            songDeliveredAt: true,
                            paymentCompletedAt: true,
                            hasFastDelivery: true,
                            revisionCount: true,
                            createdAt: true,
                        },
                    },
                },
            });

            if (!ticket) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
            }

            return ticket;
        }),

    updateTicketStatus: adminProcedure
        .input(z.object({
            id: z.string(),
            status: z.enum(["OPEN", "WAITING_REPLY", "RESOLVED", "CLOSED"]),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.supportTicket.update({
                where: { id: input.id },
                data: {
                    status: input.status,
                    closedAt: input.status === "CLOSED" ? new Date() : undefined,
                },
            });
        }),

    updateTicketPriority: adminProcedure
        .input(z.object({
            id: z.string(),
            priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.supportTicket.update({
                where: { id: input.id },
                data: { priority: input.priority },
            });
        }),

    sendTicketReply: adminProcedure
        .input(z.object({
            ticketId: z.string(),
            body: z.string().min(1),
            aiResponseStatus: z.enum(["ACCEPTED", "MODIFIED", "REJECTED"]).optional(),
            sourceMessageId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const ticket = await ctx.db.supportTicket.findUnique({
                where: { id: input.ticketId },
                include: {
                    messages: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                    },
                },
            });

            if (!ticket) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
            }

            // Get the last inbound message for threading
            const lastInboundMessage = await ctx.db.ticketMessage.findFirst({
                where: {
                    ticketId: input.ticketId,
                    direction: "INBOUND",
                },
                orderBy: { createdAt: "desc" },
            });

            // Build email
            const { buildTicketReplyEmail } = await import("~/server/email/ticket-reply");

            const emailData = buildTicketReplyEmail({
                to: ticket.email,
                body: input.body,
                originalSubject: ticket.subject,
                inReplyTo: lastInboundMessage?.emailMessageId,
                references: lastInboundMessage?.references
                    ? `${lastInboundMessage.references} ${lastInboundMessage.emailMessageId || ""}`
                    : lastInboundMessage?.emailMessageId || undefined,
                locale: ticket.locale,
            });

            // Send email
            const messageId = await sendEmail({
                to: emailData.to,
                subject: emailData.subject,
                html: emailData.html,
                text: emailData.text,
                template: "TICKET_REPLY",
                headers: emailData.headers,
            });

            // Create outbound message
            await ctx.db.ticketMessage.create({
                data: {
                    ticketId: input.ticketId,
                    direction: "OUTBOUND",
                    senderEmail: env.SMTP_FROM,
                    body: input.body,
                    htmlBody: emailData.html,
                    emailMessageId: messageId || null,
                    inReplyTo: lastInboundMessage?.emailMessageId || null,
                    sentAt: new Date(),
                },
            });

            // Update AI response status on source message if provided
            if (input.sourceMessageId && input.aiResponseStatus) {
                await ctx.db.ticketMessage.update({
                    where: { id: input.sourceMessageId },
                    data: { aiResponseStatus: input.aiResponseStatus },
                });
            }

            // Update ticket status
            await ctx.db.supportTicket.update({
                where: { id: input.ticketId },
                data: { status: "WAITING_REPLY" },
            });

            return { success: true };
        }),

    regenerateAiResponse: adminProcedure
        .input(z.object({
            ticketId: z.string(),
            messageId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Reset AI status
            await ctx.db.ticketMessage.update({
                where: { id: input.messageId },
                data: {
                    aiSuggestedResponse: null,
                    aiResponseStatus: "PENDING",
                },
            });

            // Re-enqueue AI generation
            const { enqueueTicketAiResponse } = await import("~/server/queues/ticket-ai-response");
            await enqueueTicketAiResponse(input.ticketId, input.messageId);

            return { success: true };
        }),

    getTicketStats: adminProcedure.query(async ({ ctx }) => {
        const [open, waitingReply, closed] = await Promise.all([
            ctx.db.supportTicket.count({ where: { status: "OPEN" } }),
            ctx.db.supportTicket.count({ where: { status: "WAITING_REPLY" } }),
            ctx.db.supportTicket.count({ where: { status: "CLOSED" } }),
        ]);
        return { open, waitingReply, closed, total: open };
    }),

    bulkCloseTickets: adminProcedure
        .input(z.object({
            ticketIds: z.array(z.string()).min(1).max(100),
        }))
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db.supportTicket.updateMany({
                where: { id: { in: input.ticketIds }, status: { not: "CLOSED" } },
                data: { status: "CLOSED", closedAt: new Date() },
            });
            return { closedCount: result.count };
        }),

    bulkGenerateAiResponses: adminProcedure
        .input(z.object({
            ticketIds: z.array(z.string()).min(1).max(100),
        }))
        .mutation(async ({ ctx, input }) => {
            const tickets = await ctx.db.supportTicket.findMany({
                where: {
                    id: { in: input.ticketIds },
                    status: { not: "CLOSED" },
                },
                include: {
                    messages: {
                        where: {
                            direction: "INBOUND",
                            OR: [
                                { aiResponseStatus: null },
                                { aiResponseStatus: "REJECTED" },
                            ],
                        },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                    },
                },
            });

            const { enqueueTicketAiResponse } = await import("~/server/queues/ticket-ai-response");

            let enqueuedCount = 0;
            let skippedCount = 0;

            for (const ticket of tickets) {
                const msg = ticket.messages[0];
                if (!msg) {
                    skippedCount++;
                    continue;
                }
                await ctx.db.ticketMessage.update({
                    where: { id: msg.id },
                    data: { aiResponseStatus: "PENDING" },
                });
                await enqueueTicketAiResponse(ticket.id, msg.id);
                enqueuedCount++;
            }

            skippedCount += input.ticketIds.length - tickets.length;

            return { enqueuedCount, skippedCount };
        }),

    bulkSendAiResponses: adminProcedure
        .input(z.object({
            ticketIds: z.array(z.string()).min(1).max(100),
        }))
        .mutation(async ({ ctx, input }) => {
            const tickets = await ctx.db.supportTicket.findMany({
                where: { id: { in: input.ticketIds } },
                include: {
                    messages: {
                        where: {
                            direction: "INBOUND",
                            aiResponseStatus: "GENERATED",
                            aiSuggestedResponse: { not: null },
                        },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                    },
                },
            });

            const { buildTicketReplyEmail } = await import("~/server/email/ticket-reply");

            let sentCount = 0;
            let errorCount = 0;
            let skippedCount = 0;
            const errors: string[] = [];

            for (const ticket of tickets) {
                const msg = ticket.messages[0];
                if (!msg || !msg.aiSuggestedResponse) {
                    skippedCount++;
                    continue;
                }

                try {
                    const lastInboundMessage = await ctx.db.ticketMessage.findFirst({
                        where: { ticketId: ticket.id, direction: "INBOUND" },
                        orderBy: { createdAt: "desc" },
                    });

                    const emailData = buildTicketReplyEmail({
                        to: ticket.email,
                        body: msg.aiSuggestedResponse,
                        originalSubject: ticket.subject,
                        inReplyTo: lastInboundMessage?.emailMessageId,
                        references: lastInboundMessage?.references
                            ? `${lastInboundMessage.references} ${lastInboundMessage.emailMessageId || ""}`
                            : lastInboundMessage?.emailMessageId || undefined,
                        locale: ticket.locale,
                    });

                    const messageId = await sendEmail({
                        to: emailData.to,
                        subject: emailData.subject,
                        html: emailData.html,
                        text: emailData.text,
                        template: "TICKET_REPLY",
                        headers: emailData.headers,
                    });

                    await ctx.db.ticketMessage.create({
                        data: {
                            ticketId: ticket.id,
                            direction: "OUTBOUND",
                            senderEmail: env.SMTP_FROM,
                            body: msg.aiSuggestedResponse,
                            htmlBody: emailData.html,
                            emailMessageId: messageId || null,
                            inReplyTo: lastInboundMessage?.emailMessageId || null,
                            sentAt: new Date(),
                        },
                    });

                    await ctx.db.ticketMessage.update({
                        where: { id: msg.id },
                        data: { aiResponseStatus: "ACCEPTED" },
                    });

                    await ctx.db.supportTicket.update({
                        where: { id: ticket.id },
                        data: { status: "WAITING_REPLY" },
                    });

                    sentCount++;
                } catch (e) {
                    errorCount++;
                    errors.push(`${ticket.email}: ${e instanceof Error ? e.message : "Unknown error"}`);
                }
            }

            skippedCount += input.ticketIds.length - tickets.length;

            return { sentCount, errorCount, skippedCount, errors };
        }),

    // ============= EMAIL POLLING =============

    triggerEmailPoll: adminProcedure.mutation(async () => {
        await triggerEmailPoll();
        return { success: true };
    }),

    // ============= EMAIL BOUNCES =============

    getEmailBounces: adminProcedure
        .input(z.object({
            resolved: z.boolean().default(false),
            onlyPaidOrders: z.boolean().default(true),
            paymentMethod: z.enum(["all", "pix", "card"]).default("all"),
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
            page: z.number().min(1).default(1),
            pageSize: z.number().min(10).max(100).default(50),
        }))
        .query(async ({ ctx, input }) => {
            const where: any = {
                resolved: input.resolved,
            };

            if (input.onlyPaidOrders) {
                where.orderId = { not: null };
            }

            if (input.paymentMethod !== "all") {
                where.order = { paymentMethod: input.paymentMethod };
            }

            if (input.dateFrom || input.dateTo) {
                where.detectedAt = {};
                if (input.dateFrom) where.detectedAt.gte = new Date(input.dateFrom);
                if (input.dateTo) {
                    const endDate = new Date(input.dateTo);
                    endDate.setHours(23, 59, 59, 999);
                    where.detectedAt.lte = endDate;
                }
            }

            const [bounces, total] = await Promise.all([
                ctx.db.emailBounce.findMany({
                    where,
                    orderBy: { detectedAt: "desc" },
                    skip: (input.page - 1) * input.pageSize,
                    take: input.pageSize,
                    include: {
                        order: {
                            select: {
                                id: true,
                                status: true,
                                recipientName: true,
                                genre: true,
                                email: true,
                                backupWhatsApp: true,
                                locale: true,
                                createdAt: true,
                                paymentMethod: true,
                            },
                        },
                    },
                }),
                ctx.db.emailBounce.count({ where }),
            ]);

            // Group by day
            const grouped: Record<string, typeof bounces> = {};
            for (const bounce of bounces) {
                const dayKey = bounce.detectedAt.toISOString().split("T")[0]!;
                if (!grouped[dayKey]) grouped[dayKey] = [];
                grouped[dayKey]!.push(bounce);
            }

            return {
                grouped,
                total,
                page: input.page,
                pageSize: input.pageSize,
                totalPages: Math.ceil(total / input.pageSize),
            };
        }),

    resolveEmailBounce: adminProcedure
        .input(z.object({
            id: z.string(),
            note: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.emailBounce.update({
                where: { id: input.id },
                data: {
                    resolved: true,
                    resolvedAt: new Date(),
                    resolvedNote: input.note || null,
                },
            });
        }),

    getEmailBounceStats: adminProcedure.query(async ({ ctx }) => {
        const result = await ctx.db.emailBounce.groupBy({
            by: ["bouncedEmail"],
            where: {
                resolved: false,
                orderId: { not: null },
            },
        });
        return { unresolvedWithOrder: result.length };
    }),

    // ============= KNOWLEDGE BASE CRUD =============

    getKnowledgeEntries: adminProcedure
        .input(z.object({
            category: z.string().optional(),
            locale: z.string().optional(),
            channel: z.enum(["BOTH", "EMAIL", "WHATSAPP"]).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
            const where: any = {};
            if (input?.category) where.category = input.category;
            if (input?.locale) where.locale = input.locale;
            if (input?.channel) where.channel = input.channel;

            return ctx.db.supportKnowledge.findMany({
                where,
                orderBy: [{ category: "asc" }, { createdAt: "desc" }],
            });
        }),

    createKnowledgeEntry: adminProcedure
        .input(z.object({
            title: z.string().min(1),
            content: z.string().min(1),
            category: z.string().min(1),
            locale: z.string().default("all"),
            channel: z.enum(["BOTH", "EMAIL", "WHATSAPP"]).default("BOTH"),
            isActive: z.boolean().default(true),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.supportKnowledge.create({ data: input });
        }),

    updateKnowledgeEntry: adminProcedure
        .input(z.object({
            id: z.string(),
            title: z.string().min(1).optional(),
            content: z.string().min(1).optional(),
            category: z.string().min(1).optional(),
            locale: z.string().optional(),
            channel: z.enum(["BOTH", "EMAIL", "WHATSAPP"]).optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...data } = input;
            return ctx.db.supportKnowledge.update({
                where: { id },
                data,
            });
        }),

    deleteKnowledgeEntry: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.supportKnowledge.delete({
                where: { id: input.id },
            });
        }),

    // ============= WHATSAPP BOT =============

    getWhatsAppConversations: adminProcedure
        .input(z.object({
            page: z.number().min(1).default(1),
            pageSize: z.number().min(10).max(100).default(20),
            search: z.string().optional(),
            filter: z.enum(["ALL", "BOT", "HUMAN"]).default("ALL"),
            labelFilter: z.enum(["ALL", "NONE"]).or(z.string()).default("ALL"),
        }))
        .query(async ({ ctx, input }) => {
            const where: Prisma.WhatsAppConversationWhereInput = {};
            const pickRoutingMetadata = (raw: Prisma.JsonValue | null): Record<string, unknown> | null => {
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
                const routingRaw = (raw as Record<string, unknown>).routing;
                if (!routingRaw || typeof routingRaw !== "object" || Array.isArray(routingRaw)) return null;

                const routing = routingRaw as Record<string, unknown>;
                const compactRouting: Record<string, unknown> = {};
                if (typeof routing.classification === "string") compactRouting.classification = routing.classification;
                if (typeof routing.classificationLabel === "string") compactRouting.classificationLabel = routing.classificationLabel;
                if (typeof routing.assignedTo === "string") compactRouting.assignedTo = routing.assignedTo;
                if (typeof routing.escalated === "boolean") compactRouting.escalated = routing.escalated;

                return Object.keys(compactRouting).length > 0
                    ? { routing: compactRouting }
                    : null;
            };

            if (input.filter === "BOT") where.isBot = true;
            if (input.filter === "HUMAN") where.isBot = false;

            if (input.labelFilter === "NONE") {
                where.labelId = null;
            } else if (input.labelFilter !== "ALL") {
                where.labelId = input.labelFilter;
            }

            const trimmedSearch = input.search?.trim();
            if (trimmedSearch) {
                const searchConditions: Prisma.WhatsAppConversationWhereInput[] = [
                    { waId: { contains: trimmedSearch } },
                    { customerName: { contains: trimmedSearch, mode: "insensitive" } },
                    { messages: { some: { body: { contains: trimmedSearch, mode: "insensitive" } } } },
                ];

                const phoneDigits = normalizePhoneDigits(trimmedSearch);
                if (phoneDigits.length > 0) {
                    searchConditions.push({ waId: { contains: phoneDigits } });

                    // For full/near-full numbers, include normalized variants (e.g. with/without country code).
                    if (phoneDigits.length >= 10) {
                        for (const candidate of buildPhoneCandidates(phoneDigits)) {
                            searchConditions.push({ waId: { contains: candidate } });
                        }
                    }
                }

                where.OR = searchConditions;
            }

            const [items, total] = await Promise.all([
                ctx.db.whatsAppConversation.findMany({
                    where,
                    skip: (input.page - 1) * input.pageSize,
                    take: input.pageSize,
                    orderBy: [
                        { lastCustomerMessageAt: { sort: "desc", nulls: "last" } },
                        { updatedAt: "desc" },
                    ],
                    include: {
                        label: true,
                        messages: {
                            orderBy: { createdAt: "desc" },
                            take: 5,
                            select: { body: true, createdAt: true, direction: true, metadata: true },
                        },
                    },
                }),
                ctx.db.whatsAppConversation.count({ where }),
            ]);

            const unreadRows = items.length > 0
                ? await ctx.db.whatsAppMessage.groupBy({
                    by: ["conversationId"],
                    where: {
                        direction: "inbound",
                        OR: items.map((conversation) => ({
                            conversationId: conversation.id,
                            createdAt: { gt: conversation.lastBotMessageAt ?? new Date(0) },
                        })),
                    },
                    _count: { _all: true },
                })
                : [];

            const unreadByConversation = new Map<string, number>();
            for (const row of unreadRows) {
                unreadByConversation.set(row.conversationId, row._count._all);
            }

            const itemsWithUnread = items.map((conversation) => ({
                ...conversation,
                messages: conversation.messages.map((message) => ({
                    ...message,
                    metadata: pickRoutingMetadata(message.metadata as Prisma.JsonValue | null),
                })),
                unreadCount: unreadByConversation.get(conversation.id) ?? 0,
            }));

            return { items: itemsWithUnread, total, page: input.page, pageSize: input.pageSize };
        }),

    getWhatsAppMessages: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            messageLimit: z.number().min(50).max(500).default(120),
        }))
        .query(async ({ ctx, input }) => {
            const conversation = await ctx.db.whatsAppConversation.findUnique({
                where: { id: input.conversationId },
                include: { label: true },
            });

            if (!conversation) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
            }

            const sanitizeThreadMetadata = (raw: Prisma.JsonValue | null): Record<string, unknown> | null => {
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

                const source = raw as Record<string, unknown>;
                const compact: Record<string, unknown> = {};

                // Media information required by the chat bubble renderer.
                if (typeof source.messageType === "string") compact.messageType = source.messageType;
                if (typeof source.mediaUrl === "string") compact.mediaUrl = source.mediaUrl;
                if (typeof source.mimeType === "string") compact.mimeType = source.mimeType;
                if (typeof source.fileName === "string") compact.fileName = source.fileName;
                if (typeof source.caption === "string") compact.caption = source.caption;
                if (typeof source.transcription === "string") compact.transcription = source.transcription;

                // Routing chips shown in the conversation list/header.
                const routingRaw = source.routing;
                if (routingRaw && typeof routingRaw === "object" && !Array.isArray(routingRaw)) {
                    const routing = routingRaw as Record<string, unknown>;
                    const compactRouting: Record<string, unknown> = {};
                    if (typeof routing.classification === "string") compactRouting.classification = routing.classification;
                    if (typeof routing.classificationLabel === "string") compactRouting.classificationLabel = routing.classificationLabel;
                    if (typeof routing.assignedTo === "string") compactRouting.assignedTo = routing.assignedTo;
                    if (typeof routing.escalated === "boolean") compactRouting.escalated = routing.escalated;
                    if (Object.keys(compactRouting).length > 0) {
                        compact.routing = compactRouting;
                    }
                }

                // WhatsApp send status chips for outbound messages.
                const waRaw = source.wa;
                if (waRaw && typeof waRaw === "object" && !Array.isArray(waRaw)) {
                    const wa = waRaw as Record<string, unknown>;
                    const lastStatusRaw = wa.lastStatus;
                    if (lastStatusRaw && typeof lastStatusRaw === "object" && !Array.isArray(lastStatusRaw)) {
                        const lastStatus = lastStatusRaw as Record<string, unknown>;
                        const compactLastStatus: Record<string, unknown> = {};

                        if (typeof lastStatus.status === "string") {
                            compactLastStatus.status = lastStatus.status;
                        }

                        if (Array.isArray(lastStatus.errors)) {
                            const compactErrors = lastStatus.errors
                                .map((entry) => {
                                    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
                                    const error = entry as Record<string, unknown>;
                                    const compactError: Record<string, unknown> = {};
                                    if (typeof error.code === "number") compactError.code = error.code;
                                    if (typeof error.title === "string") compactError.title = error.title;
                                    return Object.keys(compactError).length > 0 ? compactError : null;
                                })
                                .filter((entry): entry is Record<string, unknown> => Boolean(entry))
                                .slice(0, 3);

                            if (compactErrors.length > 0) {
                                compactLastStatus.errors = compactErrors;
                            }
                        }

                        if (Object.keys(compactLastStatus).length > 0) {
                            compact.wa = { lastStatus: compactLastStatus };
                        }
                    }
                }

                return Object.keys(compact).length > 0 ? compact : null;
            };

            const recentMessagesDesc = await ctx.db.whatsAppMessage.findMany({
                where: { conversationId: input.conversationId },
                orderBy: { createdAt: "desc" },
                take: input.messageLimit + 1,
                select: {
                    id: true,
                    direction: true,
                    body: true,
                    senderType: true,
                    metadata: true,
                    createdAt: true,
                },
            });

            const hasOlderMessages = recentMessagesDesc.length > input.messageLimit;
            const boundedMessagesDesc = hasOlderMessages
                ? recentMessagesDesc.slice(0, input.messageLimit)
                : recentMessagesDesc;
            const messages = [...boundedMessagesDesc]
                .reverse()
                .map((message) => ({
                    ...message,
                    metadata: sanitizeThreadMetadata(message.metadata as Prisma.JsonValue | null),
                }));

            const unreadCount = await ctx.db.whatsAppMessage.count({
                where: {
                    conversationId: input.conversationId,
                    direction: "inbound",
                    createdAt: { gt: conversation.lastBotMessageAt ?? new Date(0) },
                },
            });

            // Extract emails mentioned in recent inbound messages only.
            // This avoids scanning very large threads on every poll.
            const recentInboundMessagesWithEmail = await ctx.db.whatsAppMessage.findMany({
                where: {
                    conversationId: input.conversationId,
                    direction: "inbound",
                    body: { contains: "@" },
                },
                orderBy: { createdAt: "desc" },
                take: 300,
                select: { body: true },
            });

            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const mentionedEmails = new Set<string>();
            for (const msg of recentInboundMessagesWithEmail) {
                const matches = msg.body.match(emailRegex);
                if (matches) {
                    for (const email of matches) {
                        mentionedEmails.add(email.toLowerCase());
                    }
                }
            }

            // Lookup linked orders by phone
            const normalizedWaId = conversation.waId;
            const linkedOrderStatuses = ["PENDING" as const, "PAID" as const, "IN_PROGRESS" as const, "COMPLETED" as const, "REVISION" as const];
            const phoneCandidates = Array.from(buildPhoneCandidates(normalizedWaId));

            type LinkedOrderRow = {
                id: string;
                status: string;
                orderType: string | null;
                locale: string | null;
                recipientName: string | null;
                genre: string | null;
                createdAt: Date;
                backupWhatsApp: string | null;
                email: string | null;
                songFileUrl: string | null;
                songFileUrl2: string | null;
                hasLyrics: boolean;
                lyricsPdfA4Url: string | null;
            };

            const [phoneOrders, emailOrders] = await Promise.all([
                phoneCandidates.length > 0
                    ? ctx.db.$queryRaw<LinkedOrderRow[]>`
                        SELECT
                            "id",
                            "status",
                            "orderType",
                            "locale",
                            "recipientName",
                            "genre",
                            "createdAt",
                            "backupWhatsApp",
                            "email",
                            "songFileUrl",
                            "songFileUrl2",
                            "hasLyrics",
                            "lyricsPdfA4Url"
                        FROM "SongOrder"
                        WHERE "backupWhatsApp" IS NOT NULL
                          AND "status" IN ('PENDING', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'REVISION')
                          AND REGEXP_REPLACE("backupWhatsApp", '[^0-9]', '', 'g') LIKE ANY(${phoneCandidates.map((candidate) => `%${candidate}%`)})
                        ORDER BY "createdAt" DESC
                        LIMIT 100
                    `
                    : Promise.resolve<LinkedOrderRow[]>([]),
                mentionedEmails.size > 0
                    ? ctx.db.songOrder.findMany({
                        where: {
                            email: { in: [...mentionedEmails] },
                            status: { in: linkedOrderStatuses },
                        },
                        orderBy: { createdAt: "desc" },
                        take: 50,
                        select: {
                            id: true,
                            status: true,
                            orderType: true,
                            locale: true,
                            recipientName: true,
                            genre: true,
                            createdAt: true,
                            backupWhatsApp: true,
                            email: true,
                            songFileUrl: true,
                            songFileUrl2: true,
                            hasLyrics: true,
                            lyricsPdfA4Url: true,
                        },
                    })
                    : [],
            ]);

            // Merge phone-matched + email-matched orders, deduplicated
            const seenIds = new Set<string>();
            const linkedOrders: LinkedOrderRow[] = [];

            for (const o of phoneOrders) {
                if (!o.backupWhatsApp || !phonesLikelyMatch(o.backupWhatsApp, normalizedWaId)) continue;
                if (seenIds.has(o.id)) continue;
                seenIds.add(o.id);
                linkedOrders.push(o);
            }
            for (const o of emailOrders) {
                if (seenIds.has(o.id)) continue;
                seenIds.add(o.id);
                linkedOrders.push(o);
            }

            return {
                conversation: {
                    ...conversation,
                    unreadCount,
                },
                messages,
                linkedOrders,
                hasOlderMessages,
            };
        }),

    markWhatsAppConversationRead: adminProcedure
        .input(z.object({
            conversationId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.whatsAppConversation.update({
                where: { id: input.conversationId },
                data: {
                    // "lastBotMessageAt" is used as "last handled/read checkpoint" for unread calculation.
                    lastBotMessageAt: new Date(),
                },
            });
        }),

    markWhatsAppConversationUnread: adminProcedure
        .input(z.object({
            conversationId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const latestInboundMessage = await ctx.db.whatsAppMessage.findFirst({
                where: {
                    conversationId: input.conversationId,
                    direction: "inbound",
                },
                orderBy: { createdAt: "desc" },
                select: { createdAt: true },
            });

            const unreadCheckpoint = latestInboundMessage
                ? new Date(latestInboundMessage.createdAt.getTime() - 1)
                : null;

            return ctx.db.whatsAppConversation.update({
                where: { id: input.conversationId },
                data: {
                    // Move checkpoint to just before latest inbound so it appears as unread in the list.
                    lastBotMessageAt: unreadCheckpoint,
                },
            });
        }),

    startWhatsAppConversation: adminProcedure
        .input(z.object({
            waId: z.string().min(5).max(40),
            customerName: z.string().min(1).max(120).optional(),
            forceTakeover: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const operatorName = resolveWhatsAppOperatorName(ctx.adminUser);

            const normalizedWaId = normalizePhoneToWaId(input.waId);
            if (normalizedWaId.length < 8 || normalizedWaId.length > 20) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Número de WhatsApp inválido. Use DDI + DDD + número (apenas dígitos).",
                });
            }

            const customerName = input.customerName?.trim() || null;
            const now = new Date();
            const lockExpiresAt = nextWhatsAppLockExpiry(now);

            const existing = await ctx.db.whatsAppConversation.findUnique({
                where: { waId: normalizedWaId },
            });

            if (existing) {
                const lockActive = isWhatsAppLockActive(existing, now);
                const lockedByOther = lockActive && existing.assignedTo !== operatorName;
                if (lockedByOther && !input.forceTakeover) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: `Conversa em atendimento por ${existing.assignedTo}`,
                    });
                }

                const conversation = await ctx.db.whatsAppConversation.update({
                    where: { id: existing.id },
                    data: {
                        ...(customerName ? { customerName } : {}),
                        isBot: false,
                        assignedTo: operatorName,
                        assignedAt: existing.assignedTo === operatorName ? (existing.assignedAt ?? now) : now,
                        lockExpiresAt,
                    },
                });

                return { conversation, existed: true };
            }

            const conversation = await ctx.db.whatsAppConversation.create({
                data: {
                    waId: normalizedWaId,
                    customerName,
                    locale: "pt",
                    isBot: false,
                    assignedTo: operatorName,
                    assignedAt: now,
                    lockExpiresAt,
                },
            });

            return { conversation, existed: false };
        }),

    sendWhatsAppReply: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            body: z.string().optional(),
            forceTakeover: z.boolean().optional(),
            media: z.object({
                url: z.string().url(),
                messageType: z.enum(["audio", "video", "document", "image"]),
                mimeType: z.string().optional(),
                fileName: z.string().optional(),
                voiceNote: z.boolean().optional(),
                caption: z.string().optional(),
            }).optional(),
        }).superRefine((val, ctx) => {
            const hasText = Boolean(val.body?.trim());
            const hasMedia = Boolean(val.media);
            if (!hasText && !hasMedia) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Mensagem de texto ou mídia é obrigatória",
                    path: ["body"],
                });
            }
        }))
        .mutation(async ({ ctx, input }) => {
            const operatorName = resolveWhatsAppOperatorName(ctx.adminUser);
            const textBody = input.body?.trim() ?? "";

            const now = new Date();
            const conversation = await ctx.db.whatsAppConversation.findUnique({
                where: { id: input.conversationId },
            });

            if (!conversation) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
            }

            const lockActive = isWhatsAppLockActive(conversation, now);
            const lockedByOther = lockActive && conversation.assignedTo !== operatorName;
            if (lockedByOther && !input.forceTakeover) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Conversa em atendimento por ${conversation.assignedTo}`,
                });
            }

            const lockExpiresAt = nextWhatsAppLockExpiry(now);
            await ctx.db.whatsAppConversation.update({
                where: { id: conversation.id },
                data: {
                    assignedTo: operatorName,
                    assignedAt: conversation.assignedTo === operatorName ? (conversation.assignedAt ?? now) : now,
                    lockExpiresAt,
                },
            });

            // Send via Cloud API
            const routingMetadata = {
                assignedTo: operatorName,
                lockExpiresAt: lockExpiresAt.toISOString(),
                lockTtlMs: WHATSAPP_LOCK_TTL_MS,
            };

            const enqueueAndPersistAdminOutbound = async (params: {
                queuedBody: string;
                queuedMetadata: Record<string, unknown>;
                queueKind: "voice-note" | "outbound";
                mediaPayload?: {
                    url: string;
                    messageType: "audio" | "video" | "document" | "image";
                    mimeType?: string;
                    fileName?: string;
                    voiceNote?: boolean;
                    caption?: string;
                };
                textPayload?: string;
                enqueueErrorMessage: string;
            }) => {
                const queuedMessage = await ctx.db.whatsAppMessage.create({
                    data: {
                        conversationId: conversation.id,
                        waMessageId: null,
                        direction: "outbound",
                        body: params.queuedBody,
                        senderType: "admin",
                        metadata: params.queuedMetadata as Prisma.InputJsonValue,
                    },
                });

                try {
                    const queuedJob = params.queueKind === "voice-note"
                        ? await enqueueWhatsAppAdminVoiceNote({
                            conversationId: conversation.id,
                            queuedMessageId: queuedMessage.id,
                            waId: conversation.waId,
                            mediaUrl: params.mediaPayload?.url ?? "",
                            mimeType: params.mediaPayload?.mimeType,
                            fileName: params.mediaPayload?.fileName,
                            textBody: params.textPayload,
                            operatorName,
                            routingMetadata,
                        })
                        : await enqueueWhatsAppAdminOutbound({
                            conversationId: conversation.id,
                            queuedMessageId: queuedMessage.id,
                            waId: conversation.waId,
                            textBody: params.textPayload,
                            media: params.mediaPayload,
                            routingMetadata,
                        });

                    const queuedMessageWithJob = await ctx.db.whatsAppMessage.update({
                        where: { id: queuedMessage.id },
                        data: {
                            metadata: {
                                ...params.queuedMetadata,
                                ...(queuedJob.id ? { queueJobId: String(queuedJob.id) } : {}),
                            } as Prisma.InputJsonValue,
                        },
                    });

                    // Auto-disable bot when admin sends a reply
                    await ctx.db.whatsAppConversation.update({
                        where: { id: conversation.id },
                        data: {
                            isBot: false,
                            lastBotMessageAt: new Date(),
                            assignedTo: operatorName,
                            assignedAt: conversation.assignedTo === operatorName ? (conversation.assignedAt ?? now) : now,
                            lockExpiresAt,
                        },
                    });

                    return queuedMessageWithJob;
                } catch (error) {
                    await ctx.db.whatsAppMessage.update({
                        where: { id: queuedMessage.id },
                        data: {
                            metadata: {
                                ...params.queuedMetadata,
                                sendStatus: "queue_failed",
                                failedAt: new Date().toISOString(),
                                errorMessage: error instanceof Error ? error.message : params.enqueueErrorMessage,
                            } as Prisma.InputJsonValue,
                        },
                    });

                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: params.enqueueErrorMessage,
                    });
                }
            };

            if (input.media) {
                const media = input.media;
                const caption = media.caption?.trim() || textBody || undefined;

                if (media.messageType === "audio" && media.voiceNote === true) {
                    const queuedBody = `[${media.messageType}] ${media.fileName?.trim() || media.messageType}`;
                    const queuedMetadata: Record<string, unknown> = {
                        routing: routingMetadata,
                        messageType: media.messageType,
                        mediaUrl: media.url,
                        ...(media.mimeType ? { mimeType: media.mimeType } : {}),
                        ...(media.fileName ? { fileName: media.fileName } : {}),
                        voiceNote: true,
                        sendStatus: "queued",
                        queueName: "whatsapp-admin-voice-note",
                        queuedAt: now.toISOString(),
                        ...(caption ? { caption } : {}),
                    };

                    return enqueueAndPersistAdminOutbound({
                        queuedBody,
                        queuedMetadata,
                        queueKind: "voice-note",
                        mediaPayload: {
                            url: media.url,
                            messageType: media.messageType,
                            mimeType: media.mimeType,
                            fileName: media.fileName,
                            voiceNote: true,
                            caption,
                        },
                        textPayload: textBody || undefined,
                        enqueueErrorMessage: "Falha ao enfileirar envio da mensagem de voz. Tente novamente.",
                    });
                }

                const queuedBody = `[${media.messageType}] ${media.fileName?.trim() || media.messageType}`;
                const queuedMetadata: Record<string, unknown> = {
                    routing: routingMetadata,
                    messageType: media.messageType,
                    mediaUrl: media.url,
                    ...(media.mimeType ? { mimeType: media.mimeType } : {}),
                    ...(media.fileName ? { fileName: media.fileName } : {}),
                    ...(media.voiceNote ? { voiceNote: true } : {}),
                    sendStatus: "queued",
                    queueName: "whatsapp-admin-outbound",
                    queuedAt: now.toISOString(),
                    ...(caption ? { caption } : {}),
                };

                return enqueueAndPersistAdminOutbound({
                    queuedBody,
                    queuedMetadata,
                    queueKind: "outbound",
                    mediaPayload: {
                        url: media.url,
                        messageType: media.messageType,
                        mimeType: media.mimeType,
                        fileName: media.fileName,
                        voiceNote: media.voiceNote,
                        caption,
                    },
                    textPayload: textBody || undefined,
                    enqueueErrorMessage: "Falha ao enfileirar envio da mídia. Tente novamente.",
                });
            }

            const queuedMetadata: Record<string, unknown> = {
                routing: routingMetadata,
                sendStatus: "queued",
                queueName: "whatsapp-admin-outbound",
                queuedAt: now.toISOString(),
            };

            return enqueueAndPersistAdminOutbound({
                queuedBody: textBody,
                queuedMetadata,
                queueKind: "outbound",
                textPayload: textBody,
                enqueueErrorMessage: "Falha ao enfileirar envio da mensagem. Tente novamente.",
            });
        }),

    sendWhatsAppOrderSongs: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            orderId: z.string(),
            forceTakeover: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const operatorName = resolveWhatsAppOperatorName(ctx.adminUser);

            const now = new Date();
            const conversation = await ctx.db.whatsAppConversation.findUnique({
                where: { id: input.conversationId },
            });

            if (!conversation) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
            }

            const lockActive = isWhatsAppLockActive(conversation, now);
            const lockedByOther = lockActive && conversation.assignedTo !== operatorName;
            if (lockedByOther && !input.forceTakeover) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Conversa em atendimento por ${conversation.assignedTo}`,
                });
            }

            const lockExpiresAt = nextWhatsAppLockExpiry(now);
            await ctx.db.whatsAppConversation.update({
                where: { id: conversation.id },
                data: {
                    assignedTo: operatorName,
                    assignedAt: conversation.assignedTo === operatorName ? (conversation.assignedAt ?? now) : now,
                    lockExpiresAt,
                },
            });

            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    genre: true,
                    recipientName: true,
                    email: true,
                    backupWhatsApp: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                },
            });

            if (!order) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado" });
            }

            // Guardrail: allow only orders linked to this conversation by phone or an email cited in inbound messages.
            const phoneMatches = Boolean(order.backupWhatsApp && phonesLikelyMatch(order.backupWhatsApp, conversation.waId));
            let emailMatches = false;

            if (!phoneMatches && order.email) {
                const inboundMessages = await ctx.db.whatsAppMessage.findMany({
                    where: {
                        conversationId: conversation.id,
                        direction: "inbound",
                    },
                    select: { body: true },
                    take: 300,
                    orderBy: { createdAt: "desc" },
                });

                const normalizedOrderEmail = order.email.toLowerCase();
                emailMatches = inboundMessages.some((message) => message.body.toLowerCase().includes(normalizedOrderEmail));
            }

            if (!phoneMatches && !emailMatches) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Esse pedido não está vinculado à conversa atual",
                });
            }

            const tracks = [
                { url: order.songFileUrl, trackIndex: 1 },
                { url: order.songFileUrl2, trackIndex: 2 },
            ].filter((track): track is { url: string; trackIndex: number } => Boolean(track.url));

            if (tracks.length === 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Este pedido ainda não tem músicas prontas para envio",
                });
            }

            const routingMetadata = {
                assignedTo: operatorName,
                lockExpiresAt: lockExpiresAt.toISOString(),
                lockTtlMs: WHATSAPP_LOCK_TTL_MS,
            };

            const honoreeName = order.recipientName?.trim() || "quem você ama";
            const genreLabel = getWhatsAppGenreLabel(order.genre);
            const introMessage = tracks.length > 1
                ? `🎵 Seguem suas músicas no gênero ${genreLabel} para homenagear ${honoreeName}.`
                : `🎵 Segue sua música no gênero ${genreLabel} para homenagear ${honoreeName}.`;

            const queuedMetadata: Record<string, unknown> = {
                routing: routingMetadata,
                orderId: order.id,
                sendStatus: "queued",
                queueName: "whatsapp-admin-order-songs",
                queuedAt: now.toISOString(),
                totalTracks: tracks.length,
            };

            const queuedMessage = await ctx.db.whatsAppMessage.create({
                data: {
                    conversationId: conversation.id,
                    waMessageId: null,
                    direction: "outbound",
                    body: introMessage,
                    senderType: "admin",
                    metadata: queuedMetadata as Prisma.InputJsonValue,
                },
            });

            try {
                const queuedJob = await enqueueWhatsAppAdminOrderSongs({
                    conversationId: conversation.id,
                    queuedMessageId: queuedMessage.id,
                    waId: conversation.waId,
                    orderId: order.id,
                    operatorName,
                    routingMetadata,
                });

                await ctx.db.whatsAppMessage.update({
                    where: { id: queuedMessage.id },
                    data: {
                        metadata: {
                            ...queuedMetadata,
                            ...(queuedJob.id ? { queueJobId: String(queuedJob.id) } : {}),
                        } as Prisma.InputJsonValue,
                    },
                });

                await ctx.db.whatsAppConversation.update({
                    where: { id: conversation.id },
                    data: {
                        isBot: false,
                        lastBotMessageAt: new Date(),
                        assignedTo: operatorName,
                        assignedAt: conversation.assignedTo === operatorName ? (conversation.assignedAt ?? now) : now,
                        lockExpiresAt,
                    },
                });

                return {
                    sentCount: 0,
                    failedCount: 0,
                    totalTracks: tracks.length,
                    queued: true,
                };
            } catch (error) {
                await ctx.db.whatsAppMessage.update({
                    where: { id: queuedMessage.id },
                    data: {
                        metadata: {
                            ...queuedMetadata,
                            sendStatus: "queue_failed",
                            failedAt: new Date().toISOString(),
                            errorMessage: error instanceof Error ? error.message : "Falha ao enfileirar envio das músicas",
                        } as Prisma.InputJsonValue,
                    },
                });

                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Falha ao enfileirar envio das músicas do pedido. Tente novamente.",
                });
            }
        }),

    sendWhatsAppOrderLyricsPdfA4: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            orderId: z.string(),
            forceTakeover: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const operatorName = resolveWhatsAppOperatorName(ctx.adminUser);

            const now = new Date();
            const conversation = await ctx.db.whatsAppConversation.findUnique({
                where: { id: input.conversationId },
            });

            if (!conversation) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
            }

            const lockActive = isWhatsAppLockActive(conversation, now);
            const lockedByOther = lockActive && conversation.assignedTo !== operatorName;
            if (lockedByOther && !input.forceTakeover) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Conversa em atendimento por ${conversation.assignedTo}`,
                });
            }

            const lockExpiresAt = nextWhatsAppLockExpiry(now);
            await ctx.db.whatsAppConversation.update({
                where: { id: conversation.id },
                data: {
                    assignedTo: operatorName,
                    assignedAt: conversation.assignedTo === operatorName ? (conversation.assignedAt ?? now) : now,
                    lockExpiresAt,
                },
            });

            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    recipientName: true,
                    email: true,
                    backupWhatsApp: true,
                    hasLyrics: true,
                    lyricsPdfA4Url: true,
                },
            });

            if (!order) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado" });
            }

            // Guardrail: allow only orders linked to this conversation by phone or an email cited in inbound messages.
            const phoneMatches = Boolean(order.backupWhatsApp && phonesLikelyMatch(order.backupWhatsApp, conversation.waId));
            let emailMatches = false;

            if (!phoneMatches && order.email) {
                const inboundMessages = await ctx.db.whatsAppMessage.findMany({
                    where: {
                        conversationId: conversation.id,
                        direction: "inbound",
                    },
                    select: { body: true },
                    take: 300,
                    orderBy: { createdAt: "desc" },
                });

                const normalizedOrderEmail = order.email.toLowerCase();
                emailMatches = inboundMessages.some((message) => message.body.toLowerCase().includes(normalizedOrderEmail));
            }

            if (!phoneMatches && !emailMatches) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Esse pedido não está vinculado à conversa atual",
                });
            }

            if (!order.hasLyrics) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Este pedido não possui compra de PDF da letra",
                });
            }

            if (!order.lyricsPdfA4Url) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Este pedido ainda não possui PDF A4 pronto para envio",
                });
            }

            const routingMetadata = {
                assignedTo: operatorName,
                lockExpiresAt: lockExpiresAt.toISOString(),
                lockTtlMs: WHATSAPP_LOCK_TTL_MS,
            };

            const honoreeName = order.recipientName?.trim() || "seu pedido";
            const pdfFileName = `Letra - ${order.recipientName?.trim() || "Cancao"}.pdf`;
            const pdfCaption = `📜 PDF A4 da letra — ${honoreeName}`;
            const queuedBody = `📜 PDF A4 da letra (${honoreeName})`;
            const queuedMetadata: Record<string, unknown> = {
                routing: routingMetadata,
                orderId: order.id,
                messageType: "document",
                mediaUrl: order.lyricsPdfA4Url,
                mimeType: "application/pdf",
                fileName: pdfFileName,
                caption: pdfCaption,
                sendStatus: "queued",
                queueName: "whatsapp-admin-outbound",
                queuedAt: now.toISOString(),
            };

            const queuedMessage = await ctx.db.whatsAppMessage.create({
                data: {
                    conversationId: conversation.id,
                    waMessageId: null,
                    direction: "outbound",
                    body: queuedBody,
                    senderType: "admin",
                    metadata: queuedMetadata as Prisma.InputJsonValue,
                },
            });

            try {
                const queuedJob = await enqueueWhatsAppAdminOutbound({
                    conversationId: conversation.id,
                    queuedMessageId: queuedMessage.id,
                    waId: conversation.waId,
                    routingMetadata,
                    media: {
                        url: order.lyricsPdfA4Url,
                        messageType: "document",
                        mimeType: "application/pdf",
                        fileName: pdfFileName,
                        caption: pdfCaption,
                    },
                });

                await ctx.db.whatsAppMessage.update({
                    where: { id: queuedMessage.id },
                    data: {
                        metadata: {
                            ...queuedMetadata,
                            ...(queuedJob.id ? { queueJobId: String(queuedJob.id) } : {}),
                        } as Prisma.InputJsonValue,
                    },
                });

                await ctx.db.whatsAppConversation.update({
                    where: { id: conversation.id },
                    data: {
                        isBot: false,
                        lastBotMessageAt: new Date(),
                        assignedTo: operatorName,
                        assignedAt: conversation.assignedTo === operatorName ? (conversation.assignedAt ?? now) : now,
                        lockExpiresAt,
                    },
                });

                return { queued: true };
            } catch (error) {
                await ctx.db.whatsAppMessage.update({
                    where: { id: queuedMessage.id },
                    data: {
                        metadata: {
                            ...queuedMetadata,
                            sendStatus: "queue_failed",
                            failedAt: new Date().toISOString(),
                            errorMessage: error instanceof Error ? error.message : "Falha ao enfileirar envio do PDF A4",
                        } as Prisma.InputJsonValue,
                    },
                });

                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Falha ao enfileirar envio do PDF A4 do pedido. Tente novamente.",
                });
            }
        }),

    claimWhatsAppConversation: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            force: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const operatorName = resolveWhatsAppOperatorName(ctx.adminUser);

            const now = new Date();
            const conversation = await ctx.db.whatsAppConversation.findUnique({
                where: { id: input.conversationId },
            });

            if (!conversation) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
            }

            const lockActive = isWhatsAppLockActive(conversation, now);
            const lockedByOther = lockActive && conversation.assignedTo !== operatorName;
            if (lockedByOther && !input.force) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Conversa em atendimento por ${conversation.assignedTo}`,
                });
            }

            return ctx.db.whatsAppConversation.update({
                where: { id: input.conversationId },
                data: {
                    assignedTo: operatorName,
                    assignedAt: conversation.assignedTo === operatorName ? (conversation.assignedAt ?? now) : now,
                    lockExpiresAt: nextWhatsAppLockExpiry(now),
                    isBot: false,
                },
            });
        }),

    heartbeatWhatsAppConversation: adminProcedure
        .input(z.object({
            conversationId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const operatorName = resolveWhatsAppOperatorName(ctx.adminUser);
            const now = new Date();

            const conversation = await ctx.db.whatsAppConversation.findUnique({
                where: { id: input.conversationId },
            });

            if (!conversation) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
            }

            const lockActive = isWhatsAppLockActive(conversation, now);
            if (!lockActive || conversation.assignedTo !== operatorName) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Você não possui o lock desta conversa",
                });
            }

            return ctx.db.whatsAppConversation.update({
                where: { id: input.conversationId },
                data: {
                    lockExpiresAt: nextWhatsAppLockExpiry(now),
                },
            });
        }),

    releaseWhatsAppConversation: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            force: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const operatorName = resolveWhatsAppOperatorName(ctx.adminUser);
            const now = new Date();

            const conversation = await ctx.db.whatsAppConversation.findUnique({
                where: { id: input.conversationId },
            });

            if (!conversation) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
            }

            const lockActive = isWhatsAppLockActive(conversation, now);
            const lockedByOther = lockActive && conversation.assignedTo !== operatorName;
            if (lockedByOther && !input.force) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Conversa em atendimento por ${conversation.assignedTo}`,
                });
            }

            return ctx.db.whatsAppConversation.update({
                where: { id: input.conversationId },
                data: {
                    assignedTo: null,
                    assignedAt: null,
                    lockExpiresAt: null,
                },
            });
        }),

    toggleWhatsAppBot: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            isBot: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
            return ctx.db.whatsAppConversation.update({
                where: { id: input.conversationId },
                data: input.isBot
                    ? { isBot: true, assignedTo: null, assignedAt: null, lockExpiresAt: null }
                    : { isBot: false },
            });
        }),

    clearWhatsAppConversation: adminProcedure
        .input(z.object({ conversationId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const deleted = await ctx.db.whatsAppMessage.deleteMany({
                where: { conversationId: input.conversationId },
            });
            return { deletedCount: deleted.count };
        }),

    getWhatsAppStats: adminProcedure.query(async ({ ctx }) => {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [stats] = await ctx.db.$queryRaw<[{ total: bigint; active24h: bigint; bot_active: bigint; human_active: bigint }]>`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE "lastCustomerMessageAt" >= ${twentyFourHoursAgo}) AS active24h,
                COUNT(*) FILTER (WHERE "isBot" = true) AS bot_active,
                COUNT(*) FILTER (WHERE "isBot" = false) AS human_active
            FROM "WhatsAppConversation"
        `;
        return {
            total: Number(stats?.total ?? 0),
            active24h: Number(stats?.active24h ?? 0),
            botActive: Number(stats?.bot_active ?? 0),
            humanActive: Number(stats?.human_active ?? 0),
        };
    }),

    // ============= WHATSAPP LABELS =============

    getWhatsAppLabels: adminProcedure.query(async ({ ctx }) => {
        return ctx.db.whatsAppLabel.findMany({
            orderBy: [{ isPredefined: "desc" }, { name: "asc" }],
        });
    }),

    createWhatsAppLabel: adminProcedure
        .input(z.object({
            name: z.string().min(1).max(50),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            emoji: z.string().max(4).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const slug = input.name
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");

            const existing = await ctx.db.whatsAppLabel.findUnique({ where: { slug } });
            if (existing) {
                throw new TRPCError({ code: "CONFLICT", message: "Já existe uma label com esse nome" });
            }

            return ctx.db.whatsAppLabel.create({
                data: {
                    slug,
                    name: input.name,
                    color: input.color,
                    emoji: input.emoji ?? null,
                    isPredefined: false,
                },
            });
        }),

    deleteWhatsAppLabel: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const label = await ctx.db.whatsAppLabel.findUnique({ where: { id: input.id } });
            if (!label) throw new TRPCError({ code: "NOT_FOUND", message: "Label não encontrada" });
            if (label.isPredefined) throw new TRPCError({ code: "FORBIDDEN", message: "Não é possível deletar labels pré-definidas" });

            await ctx.db.whatsAppConversation.updateMany({
                where: { labelId: input.id },
                data: { labelId: null },
            });

            return ctx.db.whatsAppLabel.delete({ where: { id: input.id } });
        }),

    setConversationLabel: adminProcedure
        .input(z.object({
            conversationId: z.string(),
            labelId: z.string().nullable(),
        }))
        .mutation(async ({ ctx, input }) => {
            if (input.labelId) {
                const label = await ctx.db.whatsAppLabel.findUnique({ where: { id: input.labelId } });
                if (!label) throw new TRPCError({ code: "NOT_FOUND", message: "Label não encontrada" });
            }

            return ctx.db.whatsAppConversation.update({
                where: { id: input.conversationId },
                data: { labelId: input.labelId },
                include: { label: true },
            });
        }),
});
