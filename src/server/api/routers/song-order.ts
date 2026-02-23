import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createSongOrderInputSchema, genreTypes, recipientTypes, vocalTypes } from "~/lib/validations/song-order";
import { TRPCError } from "@trpc/server";
import { enqueueOrderReminders } from "~/server/queues/order-reminders";
import { enqueueLyricsGeneration } from "~/server/queues/lyrics-generation";
import { enqueueStreamingVipReminder } from "~/server/queues/streaming-vip-reminder";
import { enqueueMusicianTipReminder } from "~/server/queues/musician-tip-reminder";
import { enqueuePdfGeneration } from "~/server/queues/pdf-generation";
import { normalizeEmail } from "~/lib/normalize-email";
import { normalizeVocals } from "~/lib/vocals";
import { generateSongNameSuggestions } from "~/lib/streaming-vip-generator";
import { sendRevisionRequestAlert } from "~/lib/telegram";
import { classifyRevision, type RevisionType, type RevisionFault } from "~/lib/revision-classifier";
import { StorageService } from "~/lib/storage";
import { normalizeRevisionHistory } from "~/lib/revision-history";
import { buildPhoneCandidates, normalizePhoneDigits } from "~/lib/phone-matching";
import type { Prisma, PrismaClient, SongOrderStatus } from "@prisma/client";
import {
    CHECKOUT_COUPON_CONFIG_ID,
    applyCouponDiscount,
    isValidCouponCode,
    normalizeCouponCode,
} from "~/lib/discount-coupons";
import {
    HEADLINE_AB_QUERY_PARAM,
    normalizeHeadlineAbVariant,
} from "~/lib/analytics/headline-ab-test";
import { env } from "~/env";

// Price constants in cents
const PRICES = {
    USD: {
        baseSong: 9900, // $99 (for EN)
        fastDelivery: 4900, // $49 (for EN)
        extraSong: 4950, // $49.50 (50% off)
        genreVariant: 3990, // $39.90 - new lyrics, different genre
        genreVariantUpsell: 3990, // $39.90 - track-order upsell
        certificate: 1990, // $19.90 - certificate of authorship
        lyrics: 990, // $9.90 - lyrics PDF (at checkout)
        lyricsUpsell: 990, // $9.90 - lyrics PDF upsell (track-order page)
        streamingUpsell: 9900, // $99 - streaming distribution upsell
        streamingUpsellSecond: 7500, // $75 - second song streaming (25% off)
        karaokeUpsell: 1990, // $19.90 - karaoke instrumental version
        // Plan-based pricing for ES locale
        plans: {
            essencial: 1700, // $17 - 7 days (for ES)
            express: 2700, // $27 - up to 24h (for ES)
            acelerado: 3700, // $37 - up to 6h (for ES)
        },
    },
    // ES-specific order bump prices ($9.99 each)
    ES: {
        extraSong: 999, // $9.99
        genreVariant: 999, // $9.99
        genreVariantUpsell: 999, // $9.99 - track-order upsell
        certificate: 999, // $9.99
        lyrics: 999, // $9.99
        lyricsUpsell: 999, // $9.99
        streamingUpsell: 9900, // $99
        streamingUpsellSecond: 7500, // $75 - second song streaming (25% off)
        karaokeUpsell: 999, // $9.99
    },
    BRL: {
        // Plan-based pricing for BRL
        plans: {
            essencial: 6990, // R$69,90 - 7 days
            express: 9990, // R$99,90 - up to 24h
            acelerado: 19990, // R$199,90 - bundle premium (até 6h)
        },
        extraSong: 4990, // R$49,90 (Dupla Emoção)
        genreVariant: 3990, // R$39,90 - new lyrics, different genre
        genreVariantUpsell: 4990, // R$49,90 - track-order upsell
        certificate: 1990, // R$19,90 - certificate of authorship
        lyrics: 1490, // R$14,90 - lyrics PDF (at checkout)
        lyricsUpsell: 1990, // R$19,90 - lyrics PDF upsell (track-order page)
        streamingUpsell: 19700, // R$197,00 - streaming distribution upsell
        streamingUpsellSecond: 14700, // R$147,00 - second song streaming (25% off)
        karaokeUpsell: 4990, // R$49,90 - karaoke instrumental version
    },
    EUR: {
        // Plan-based pricing for FR locale (same bump prices as IT)
        plans: {
            essencial: 6900, // €69 - 7 days
            express: 9900, // €99 - up to 24h
            acelerado: 12900, // €129 - up to 6h
        },
        extraSong: 2900, // €29
        genreVariant: 2900, // €29
        genreVariantUpsell: 2900, // €29 - track-order upsell
        certificate: 1900, // €19
        lyrics: 900, // €9
        lyricsUpsell: 900, // €9
        streamingUpsell: 9900, // €99
        streamingUpsellSecond: 6700, // €67 - second song streaming (25% off)
        karaokeUpsell: 1900, // €19 - karaoke instrumental version
    },
    IT: {
        // Plan-based pricing for IT locale
        plans: {
            essencial: 6900, // €69 - 7 days
            express: 9900, // €99 - up to 24h
            acelerado: 12900, // €129 - up to 6h
        },
        extraSong: 2900, // €29
        genreVariant: 2900, // €29
        genreVariantUpsell: 2900, // €29 - track-order upsell
        certificate: 1900, // €19
        lyrics: 900, // €9
        lyricsUpsell: 900, // €9
        streamingUpsell: 9900, // €99
        streamingUpsellSecond: 6700, // €67 - second song streaming (25% off)
        karaokeUpsell: 1900, // €19 - karaoke instrumental version
    },
} as const;

// Locales that use plan-based pricing
const PLAN_BASED_LOCALES = ["pt", "es", "fr", "it"] as const;

// Plan types for BRL
export const BRL_PLAN_TYPES = ["essencial", "express", "acelerado"] as const;
export type BRLPlanType = (typeof BRL_PLAN_TYPES)[number];

// Delivery days by plan
export const PLAN_DELIVERY_DAYS: Record<BRLPlanType, number> = {
    essencial: 7,
    express: 1, // up to 24h
    acelerado: 1, // shown as "até 6h" in UI
};

const isFastPlanType = (plan: BRLPlanType | null | undefined) =>
    plan === "express" || plan === "acelerado";

const VARIANT_PARENT_ORDER_TYPES = new Set(["MAIN", "EXTRA_SONG"]);
const UPSELL_PARENT_ORDER_TYPES = new Set(["MAIN", "EXTRA_SONG", "GENRE_VARIANT"]);
const STREAMING_UPSELL_ACTIVE_STATUSES: SongOrderStatus[] = ["PENDING", "PAID", "IN_PROGRESS", "COMPLETED"];
const STREAMING_UPSELL_PURCHASED_STATUSES: SongOrderStatus[] = ["PAID", "IN_PROGRESS", "COMPLETED"];
const MIN_WHATSAPP_DIGITS = 10;
const CUSTOMER_COVER_IMAGE_MODEL = "google/gemini-3-pro-image-preview";
const CHECKOUT_COUPON_INVALID_MESSAGE = "Cupom inválido ou indisponível.";
const CHECKOUT_COUPON_DISABLED_MESSAGE = "Cupons estão indisponíveis no momento.";
const STREAMING_SONG_NAME_STOP_WORDS = new Set([
    "a", "o", "as", "os", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "pra", "pro", "com", "sem",
    "the", "an", "and", "of", "for", "to", "in", "on", "with", "from", "my", "your", "our",
    "del", "la", "las", "el", "los", "y", "mi", "tu", "su",
    "du", "des", "le", "les", "pour", "avec", "sans", "mon", "ma", "mes", "ton", "ta", "tes",
    "di", "della", "delle", "dello", "il", "lo", "gli", "per", "senza", "mio", "mia", "tuo", "tua", "uno",
]);

function appendHeadlineVariantToLandingPage(
    landingPage: string | undefined,
    variant: string | undefined
): string | undefined {
    if (!landingPage) return undefined;

    const normalizedVariant = normalizeHeadlineAbVariant(variant);
    if (!normalizedVariant) return landingPage;

    try {
        const parsed = new URL(landingPage, "https://apollosong.com");
        const existingVariant = normalizeHeadlineAbVariant(
            parsed.searchParams.get(HEADLINE_AB_QUERY_PARAM)
        );
        if (!existingVariant) {
            parsed.searchParams.set(HEADLINE_AB_QUERY_PARAM, normalizedVariant);
        }
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return landingPage;
    }
}

type CustomerCoverStyle = "realistic" | "cartoon";
type CouponDbClient = PrismaClient | Prisma.TransactionClient;

type DiscountCouponRecord = {
    id: string;
    code: string;
    discountPercent: number;
    maxUses: number | null;
    usedCount: number;
    isActive: boolean;
};

async function getOrCreateCheckoutCouponConfig(db: CouponDbClient): Promise<{ couponFieldEnabled: boolean }> {
    return db.checkoutCouponConfig.upsert({
        where: { id: CHECKOUT_COUPON_CONFIG_ID },
        create: {
            id: CHECKOUT_COUPON_CONFIG_ID,
            couponFieldEnabled: false,
        },
        update: {},
        select: {
            couponFieldEnabled: true,
        },
    });
}

function assertCouponAvailability(coupon: DiscountCouponRecord | null): asserts coupon is DiscountCouponRecord {
    if (!coupon || !coupon.isActive) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: CHECKOUT_COUPON_INVALID_MESSAGE,
        });
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este cupom atingiu o limite de usos.",
        });
    }

    if (coupon.discountPercent <= 0 || coupon.discountPercent > 100) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: CHECKOUT_COUPON_INVALID_MESSAGE,
        });
    }
}

function isLikelyValidWhatsApp(value: string | null | undefined): value is string {
    if (!value) return false;
    return normalizePhoneDigits(value).length >= MIN_WHATSAPP_DIGITS;
}

function withCacheBust(url: string): string {
    return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function normalizePromptValue(value: string | null | undefined, fallback: string): string {
    const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
    return cleaned || fallback;
}

function normalizeStreamingSongNameForComparison(value: string | null | undefined): string {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

function normalizeHonoreeNameForComparison(value: string | null | undefined): string {
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

function buildFixedCustomerCoverPrompt(input: {
    style: CustomerCoverStyle;
    songName: string;
    recipientName: string;
    genre: string;
    qualities: string;
}): string {
    const songName = normalizePromptValue(input.songName, "Homenagem Especial");
    const recipientName = normalizePromptValue(input.recipientName, "Pessoa homenageada");
    const genre = normalizePromptValue(input.genre, "pop");
    const qualities = normalizePromptValue(input.qualities, "amor, gratidão e celebração");

    if (input.style === "realistic") {
        return `Using the attached original photo of ${recipientName}, create a premium 1:1 (square) music cover for the song "${songName}". Keep the photo original and recognizable (same faces and identities, no face replacement, no extra people). If the attached photo contains more than one person, keep ALL original people visible and recognizable; do not remove, crop out, blur, merge, or replace anyone. Preserve the original relative position, pose, and spacing of each person exactly as in the provided photo; do not swap people, relocate them, or recompose the group layout. Place the title "${songName}" clearly on the cover with readable typography, strong contrast, and safe margins for streaming thumbnails. Keep ${recipientName} as the central focus when possible while preserving every original person in the frame, add tasteful cinematic lighting/color grading aligned with ${genre}, and include minimal symbolic accents inspired by ${qualities} without cluttering the frame. Keep the scene grounded in real life with natural perspective and a warm celebratory mood. IMPORTANT: Do NOT use halo/aureole around the head, angel wings, floating clouds, heavenly gates, ascension rays, or any funeral/memorial visual language. If faith appears in the theme, use subtle earthly symbols instead of supernatural saint-like imagery. Final result must look professional and release-ready for Spotify/Apple Music.`;
    }

    return `Using the attached photo of ${recipientName}, create a 1:1 format cartoon-style album cover for "${songName}" in a vibrant, stylized 3D digital art style reminiscent of high-end animation. Keep all original people from the photo visible and recognizable; do not remove, replace, merge, or add extra faces. ${recipientName} should appear as a charismatic main character in a symbolic visual world inspired by ${qualities}, with dynamic composition and premium streaming-quality finish. Use bold shapes, rich textures, and a cohesive palette aligned with ${genre}. Place the title "${songName}" clearly with excellent readability and safe margins for thumbnails, leaving a clean title-safe area while preserving emotional warmth and celebration.`;
}

function isStreamingVipReadyForDistroKid(input: {
    status: SongOrderStatus;
    streamingSongName: string | null;
    preferredSongForStreaming: string | null;
    streamingCoverUrl: string | null;
    coverApproved: boolean;
}) {
    return (
        input.status === "PAID" &&
        !!input.streamingSongName &&
        !!input.preferredSongForStreaming &&
        !!input.streamingCoverUrl &&
        input.coverApproved
    );
}

async function generateStreamingCoverImageFromPrompt(input: {
    orderId: string;
    honoreePhotoUrl: string;
    prompt: string;
    style: CustomerCoverStyle;
}): Promise<{ url: string; key: string }> {
    if (!env.OPENROUTER_API_KEY) {
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "OPENROUTER_API_KEY not configured",
        });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://apollosong.com",
            "X-Title": "ApolloSong Customer Cover Generator",
        },
        body: JSON.stringify({
            model: CUSTOMER_COVER_IMAGE_MODEL,
            modalities: ["image"],
            image_config: {
                aspect_ratio: "1:1",
                image_size: "2K",
            },
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: input.honoreePhotoUrl },
                        },
                        {
                            type: "text",
                            text: input.prompt,
                        },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[StreamingVipCustomerCover] OpenRouter error:", response.status, errorText);
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro na API de geração: ${response.status}`,
        });
    }

    const data = await response.json() as {
        choices?: Array<{
            message?: {
                content?: unknown;
                images?: Array<{ image_url?: { url?: string } }>;
            };
        }>;
        error?: { message?: string };
    };

    if (data.error) {
        console.error("[StreamingVipCustomerCover] OpenRouter API error:", data.error.message);
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro na API: ${data.error.message}`,
        });
    }

    const message = data.choices?.[0]?.message;
    let imageUrl = message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
        const content = message?.content;
        if (typeof content === "string") {
            const embeddedImageMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
            imageUrl = embeddedImageMatch?.[0];
        } else if (Array.isArray(content)) {
            for (const part of content) {
                if (!part || typeof part !== "object") continue;
                const record = part as Record<string, unknown>;

                const directImageUrl = record.image_url;
                if (typeof directImageUrl === "string" && directImageUrl.trim()) {
                    imageUrl = directImageUrl.trim();
                    break;
                }

                if (directImageUrl && typeof directImageUrl === "object") {
                    const nestedUrl = (directImageUrl as Record<string, unknown>).url;
                    if (typeof nestedUrl === "string" && nestedUrl.trim()) {
                        imageUrl = nestedUrl.trim();
                        break;
                    }
                }

                const directUrl = record.url;
                if (typeof directUrl === "string" && directUrl.trim()) {
                    imageUrl = directUrl.trim();
                    break;
                }
            }
        }
    }

    if (!imageUrl) {
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "A API não retornou nenhuma imagem",
        });
    }

    let imageBuffer: Buffer;
    const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (base64Match?.[1]) {
        imageBuffer = Buffer.from(base64Match[1], "base64");
    } else if (/^https?:\/\//i.test(imageUrl)) {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Falha ao baixar imagem gerada pela API",
            });
        }
        const imageArrayBuffer = await imageResponse.arrayBuffer();
        imageBuffer = Buffer.from(imageArrayBuffer);
    } else {
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Formato de imagem inválido retornado pela API",
        });
    }

    const sharp = (await import("sharp")).default;
    const path = await import("path");
    const fs = await import("fs/promises");

    const TARGET_SIZE = 3000;
    const WATERMARK_SIZE = 90;
    const WATERMARK_MARGIN = 20;

    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    let processedImage = sharp(imageBuffer);

    if (originalWidth > TARGET_SIZE || originalHeight > TARGET_SIZE) {
        processedImage = processedImage.resize(TARGET_SIZE, TARGET_SIZE, {
            fit: "cover",
            position: "center",
        });
    } else if (originalWidth !== originalHeight) {
        const minDim = Math.min(originalWidth, originalHeight);
        processedImage = processedImage.resize(minDim, minDim, {
            fit: "cover",
            position: "center",
        });
    }

    let finalSize: number;
    if (originalWidth > TARGET_SIZE || originalHeight > TARGET_SIZE) {
        finalSize = TARGET_SIZE;
    } else if (originalWidth !== originalHeight) {
        finalSize = Math.min(originalWidth, originalHeight);
    } else {
        finalSize = originalWidth;
    }

    const watermarkScale = Math.min(1, finalSize / TARGET_SIZE);
    const scaledWatermarkSize = Math.round(WATERMARK_SIZE * watermarkScale);
    const scaledMargin = Math.round(WATERMARK_MARGIN * watermarkScale);

    try {
        const watermarkPath = path.join(process.cwd(), "public", "images", "watermark.png");
        await fs.access(watermarkPath);

        const watermarkBuffer = await sharp(watermarkPath)
            .resize(scaledWatermarkSize, scaledWatermarkSize, {
                fit: "contain",
                background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .toBuffer();

        processedImage = processedImage.composite([{
            input: watermarkBuffer,
            top: finalSize - scaledWatermarkSize - scaledMargin,
            left: finalSize - scaledWatermarkSize - scaledMargin,
        }]);
    } catch {
        console.log("[StreamingVipCustomerCover] No watermark file found, skipping");
    }

    const processedBuffer = await processedImage
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();

    const key = `covers/${input.orderId}-cover-auto-${input.style}.jpg`;
    const url = await StorageService.uploadBuffer(key, processedBuffer, "image/jpeg");

    return { url, key };
}

function getStreamingUpsellPrice(currency: string, locale: string, isSecondSong: boolean): number {
    if (isSecondSong) {
        return currency === "BRL"
            ? PRICES.BRL.streamingUpsellSecond
            : locale === "es"
            ? PRICES.ES.streamingUpsellSecond
            : currency === "EUR"
            ? PRICES.EUR.streamingUpsellSecond
            : PRICES.USD.streamingUpsellSecond;
    }

    return currency === "BRL"
        ? PRICES.BRL.streamingUpsell
        : locale === "es"
        ? PRICES.ES.streamingUpsell
        : currency === "EUR"
        ? PRICES.EUR.streamingUpsell
        : PRICES.USD.streamingUpsell;
}

async function resolveVariantParentOrderId(db: PrismaClient, orderId: string): Promise<string> {
    // We allow passing a GENRE_VARIANT order id from the UI, but variants must
    // ultimately be created for a MAIN or EXTRA_SONG "root" order.
    const seen = new Set<string>();
    let currentId: string | null | undefined = orderId;
    type VariantParentOrderRow = {
        id: string;
        orderType: string;
        parentOrderId: string | null;
    };

    while (currentId) {
        if (seen.has(currentId)) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid parent order chain",
            });
        }
        seen.add(currentId);

        const order = await db.songOrder.findUnique({
            where: { id: currentId },
            select: {
                id: true,
                orderType: true,
                parentOrderId: true,
            },
        }) as VariantParentOrderRow | null;

        if (!order) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Parent order not found",
            });
        }

        if (VARIANT_PARENT_ORDER_TYPES.has(order.orderType)) {
            return order.id;
        }

        if (order.orderType === "GENRE_VARIANT") {
            currentId = order.parentOrderId;
            continue;
        }

        break;
    }

    throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Can only create variants for main or extra song orders",
    });
}

export const songOrderRouter = createTRPCRouter({
    getGenreAudioSamples: publicProcedure.query(async ({ ctx }) => {
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

    /**
     * Get editable order details (for the edit-order page)
     * Only allows PAID or IN_PROGRESS main orders.
     */
    getEditableOrder: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                email: z.string().email(),
            })
        )
        .query(async ({ ctx, input }) => {
            const normalizedEmail = normalizeEmail(input.email);
            const order = await ctx.db.songOrder.findFirst({
                where: {
                    id: input.orderId,
                    email: normalizedEmail,
                },
                select: {
                    id: true,
                    status: true,
                    orderType: true,
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    vocals: true,
                    qualities: true,
                    memories: true,
                    message: true,
                    locale: true,
                    currency: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            if (order.orderType !== "MAIN" && order.orderType !== "GENRE_VARIANT" && order.orderType !== "EXTRA_SONG") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Only main, genre variant, or extra song orders can be edited",
                });
            }

            if (order.status !== "PAID" && order.status !== "IN_PROGRESS") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order cannot be edited at this stage",
                });
            }

            // Normalize vocals to lowercase (database may have uppercase values)
            return {
                ...order,
                vocals: order.vocals?.toLowerCase() ?? "either",
            };
        }),

    getCheckoutCouponConfig: publicProcedure.query(async ({ ctx }) => {
        const config = await getOrCreateCheckoutCouponConfig(ctx.db);
        return {
            couponFieldEnabled: config.couponFieldEnabled,
        };
    }),

    validateCoupon: publicProcedure
        .input(
            z.object({
                code: z.string().min(1).max(64),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const config = await getOrCreateCheckoutCouponConfig(ctx.db);
            if (!config.couponFieldEnabled) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: CHECKOUT_COUPON_DISABLED_MESSAGE,
                });
            }

            const normalizedCode = normalizeCouponCode(input.code);
            if (!normalizedCode || !isValidCouponCode(normalizedCode)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: CHECKOUT_COUPON_INVALID_MESSAGE,
                });
            }

            const coupon = await ctx.db.discountCoupon.findUnique({
                where: { code: normalizedCode },
                select: {
                    id: true,
                    code: true,
                    discountPercent: true,
                    maxUses: true,
                    usedCount: true,
                    isActive: true,
                },
            });

            assertCouponAvailability(coupon);

            return {
                code: coupon.code,
                discountPercent: coupon.discountPercent,
            };
        }),

    /**
     * Create a new song order with quiz data and analytics
     * This is a public procedure - no auth required
     */
    create: publicProcedure
        .input(createSongOrderInputSchema)
        .mutation(async ({ ctx, input }) => {
            const {
                quizData,
                locale,
                currency: inputCurrency,
                browserInfo,
                trafficSource,
                sessionAnalytics,
                orderBumps,
                planType,
                couponCode,
            } = input;

            // Never trust client currency blindly. Keep currency locked to locale.
            const currency = locale === "pt"
                ? "BRL"
                : (locale === "fr" || locale === "it")
                    ? "EUR"
                    : "USD";
            if (inputCurrency !== currency) {
                console.warn(
                    `[SongOrder.create] Currency mismatch for locale=${locale}: input=${inputCurrency}, forced=${currency}`
                );
            }

            // Calculate total price based on currency, locale, and plan
            let totalPrice: number;
            let hasFastDelivery = false;
            const selectedPlan = (planType ?? "express") as BRLPlanType;
            const includePremiumBundle =
                PLAN_BASED_LOCALES.includes(locale as (typeof PLAN_BASED_LOCALES)[number]) &&
                selectedPlan === "acelerado";
            const hasExtraSong = orderBumps?.extraSong ?? false;
            const rawGenreVariants = orderBumps?.genreVariants ?? [];
            const genreVariants = Array.from(new Set(rawGenreVariants)).filter(
                (genre) => genre !== quizData.genre
            );
            const hasCertificate = (orderBumps?.certificate ?? false) || includePremiumBundle;
            const hasLyrics = (orderBumps?.lyrics ?? false) || includePremiumBundle;
            const shouldChargeCertificate = hasCertificate && !includePremiumBundle;
            const shouldChargeLyrics = hasLyrics && !includePremiumBundle;

            // Check if this locale uses plan-based pricing
            const usesPlanPricing = PLAN_BASED_LOCALES.includes(locale as typeof PLAN_BASED_LOCALES[number]);

            if (currency === "BRL") {
                // BRL uses plan-based pricing
                totalPrice = PRICES.BRL.plans[selectedPlan];
                // Set hasFastDelivery based on plan (for delivery date calculation)
                hasFastDelivery = isFastPlanType(selectedPlan);
                if (hasExtraSong) {
                    totalPrice += PRICES.BRL.extraSong;
                }
                // Add genre variants price
                totalPrice += genreVariants.length * PRICES.BRL.genreVariant;
                // Add certificate and lyrics prices
                if (shouldChargeCertificate) {
                    totalPrice += PRICES.BRL.certificate;
                }
                if (shouldChargeLyrics) {
                    totalPrice += PRICES.BRL.lyrics;
                }
            } else if (usesPlanPricing && locale === "es") {
                // Spanish uses USD with plan-based pricing and ES-specific bump prices
                totalPrice = PRICES.USD.plans[selectedPlan];
                hasFastDelivery = isFastPlanType(selectedPlan);
                if (hasExtraSong) {
                    totalPrice += PRICES.ES.extraSong; // $9.99
                }
                // Add genre variants price
                totalPrice += genreVariants.length * PRICES.ES.genreVariant; // $9.99 each
                // Add certificate and lyrics prices
                if (shouldChargeCertificate) {
                    totalPrice += PRICES.ES.certificate; // $9.99
                }
                if (shouldChargeLyrics) {
                    totalPrice += PRICES.ES.lyrics; // $9.99
                }
            } else if (usesPlanPricing && locale === "fr") {
                // French uses EUR with plan-based pricing
                totalPrice = PRICES.EUR.plans[selectedPlan];
                hasFastDelivery = isFastPlanType(selectedPlan);
                if (hasExtraSong) {
                    totalPrice += PRICES.EUR.extraSong;
                }
                // Add genre variants price
                totalPrice += genreVariants.length * PRICES.EUR.genreVariant;
                // Add certificate and lyrics prices
                if (shouldChargeCertificate) {
                    totalPrice += PRICES.EUR.certificate;
                }
                if (shouldChargeLyrics) {
                    totalPrice += PRICES.EUR.lyrics;
                }
            } else if (usesPlanPricing && locale === "it") {
                // Italian uses EUR with plan-based pricing (IT-specific bump prices)
                totalPrice = PRICES.IT.plans[selectedPlan];
                hasFastDelivery = isFastPlanType(selectedPlan);
                if (hasExtraSong) {
                    totalPrice += PRICES.IT.extraSong;
                }
                // Add genre variants price
                totalPrice += genreVariants.length * PRICES.IT.genreVariant;
                // Add certificate and lyrics prices
                if (shouldChargeCertificate) {
                    totalPrice += PRICES.IT.certificate;
                }
                if (shouldChargeLyrics) {
                    totalPrice += PRICES.IT.lyrics;
                }
            } else {
                // USD (EN) uses traditional pricing with optional bumps
                totalPrice = PRICES.USD.baseSong;
                hasFastDelivery = orderBumps?.fastDelivery ?? false;
                if (hasFastDelivery) {
                    totalPrice += PRICES.USD.fastDelivery;
                }
                if (hasExtraSong) {
                    totalPrice += PRICES.USD.extraSong;
                }
                // Add genre variants price
                totalPrice += genreVariants.length * PRICES.USD.genreVariant;
                // Add certificate and lyrics prices
                if (shouldChargeCertificate) {
                    totalPrice += PRICES.USD.certificate;
                }
                if (shouldChargeLyrics) {
                    totalPrice += PRICES.USD.lyrics;
                }
            }

            // Generate certificate token if certificate is purchased
            const certificateToken = hasCertificate ? nanoid(12) : null;
            const forwardedFor = ctx.headers.get("x-forwarded-for");
            const userIp =
                forwardedFor?.split(",")[0]?.trim() ||
                ctx.headers.get("x-real-ip") ||
                undefined;
            const userAgent = browserInfo?.userAgent || ctx.headers.get("user-agent") || undefined;

            // Try to inherit WhatsApp from previous orders with the same email.
            // If the user typed an invalid/partial value (e.g. "+"), we still inherit a valid previous number.
            let inheritedWhatsApp: string | null = null;
            const typedWhatsApp = (quizData.whatsapp ?? "").trim();
            const hasValidTypedWhatsApp = isLikelyValidWhatsApp(typedWhatsApp);

            if (!hasValidTypedWhatsApp) {
                try {
                    const previousOrders = await ctx.db.songOrder.findMany({
                        where: {
                            email: normalizeEmail(quizData.email),
                            backupWhatsApp: { not: null },
                        },
                        orderBy: { createdAt: "desc" },
                        select: { backupWhatsApp: true },
                        take: 20,
                    });

                    inheritedWhatsApp =
                        previousOrders
                            .map((order) => order.backupWhatsApp?.trim() ?? null)
                            .find((value): value is string => isLikelyValidWhatsApp(value)) ?? null;
                } catch {
                    // Silently ignore - don't break order creation if this fails
                }
            }
            const backupWhatsApp = hasValidTypedWhatsApp ? typedWhatsApp : inheritedWhatsApp;
            const normalizedCouponCode = normalizeCouponCode(couponCode);
            const landingPageWithHeadlineVariant = appendHeadlineVariantToLandingPage(
                trafficSource?.landingPage,
                trafficSource?.abHeadlineVariant
            );

            try {
                const mainOrderId = await ctx.db.$transaction(async (tx) => {
                    let finalTotalPrice = totalPrice;
                    let appliedCoupon:
                        | {
                            id: string;
                            code: string;
                            discountPercent: number;
                            discountAmount: number;
                        }
                        | null = null;

                    if (normalizedCouponCode) {
                        if (!isValidCouponCode(normalizedCouponCode)) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: CHECKOUT_COUPON_INVALID_MESSAGE,
                            });
                        }

                        const config = await getOrCreateCheckoutCouponConfig(tx);
                        if (!config.couponFieldEnabled) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: CHECKOUT_COUPON_DISABLED_MESSAGE,
                            });
                        }

                        const coupon = await tx.discountCoupon.findUnique({
                            where: { code: normalizedCouponCode },
                            select: {
                                id: true,
                                code: true,
                                discountPercent: true,
                                maxUses: true,
                                usedCount: true,
                                isActive: true,
                            },
                        });
                        assertCouponAvailability(coupon);

                        const reservedCoupons = await tx.$queryRaw<
                            Array<{ id: string; code: string; discountPercent: number }>
                        >`
                            UPDATE "DiscountCoupon"
                            SET "usedCount" = "usedCount" + 1,
                                "updatedAt" = CURRENT_TIMESTAMP
                            WHERE "id" = ${coupon.id}
                              AND "isActive" = true
                              AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
                            RETURNING "id", "code", "discountPercent"
                        `;
                        const reservedCoupon = reservedCoupons[0] ?? null;
                        if (!reservedCoupon) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: "Este cupom atingiu o limite de usos.",
                            });
                        }

                        const discount = applyCouponDiscount(totalPrice, reservedCoupon.discountPercent);
                        finalTotalPrice = discount.finalTotal;
                        appliedCoupon = {
                            id: reservedCoupon.id,
                            code: reservedCoupon.code,
                            discountPercent: reservedCoupon.discountPercent,
                            discountAmount: discount.discountAmount,
                        };
                    }

                    // Create main order with total price
                    const mainOrder = await tx.songOrder.create({
                        data: {
                            // Quiz data
                            recipient: quizData.recipient,
                            recipientName: quizData.name,
                            recipientRelationship: quizData.relationship || null,
                            genre: quizData.genre,
                            vocals: quizData.vocals,
                            qualities: quizData.qualities,
                            memories: quizData.memories,
                            message: quizData.message || null,
                            email: normalizeEmail(quizData.email),
                            backupWhatsApp,

                            // Localization
                            locale,
                            currency,
                            priceAtOrder: finalTotalPrice,
                            planType: (currency === "BRL" || locale === "es" || locale === "fr" || locale === "it") ? selectedPlan : null,
                            couponId: appliedCoupon?.id ?? null,
                            couponCode: appliedCoupon?.code ?? null,
                            couponDiscountPercent: appliedCoupon?.discountPercent ?? null,
                            couponDiscountAmount: appliedCoupon?.discountAmount ?? null,

                            // Order type and bump flags
                            orderType: "MAIN",
                            hasFastDelivery,
                            hasCertificate,
                            hasLyrics,
                            certificateToken,

                            // Browser/device info
                            userAgent,
                            userIp,
                            browserName: browserInfo?.browserName,
                            browserVersion: browserInfo?.browserVersion,
                            osName: browserInfo?.osName,
                            osVersion: browserInfo?.osVersion,
                            deviceType: browserInfo?.deviceType,
                            screenWidth: browserInfo?.screenWidth,
                            screenHeight: browserInfo?.screenHeight,
                            viewportWidth: browserInfo?.viewportWidth,
                            viewportHeight: browserInfo?.viewportHeight,
                            pixelRatio: browserInfo?.pixelRatio,
                            touchSupport: browserInfo?.touchSupport,
                            language: browserInfo?.language,
                            languages: browserInfo?.languages ?? [],
                            timezone: browserInfo?.timezone,
                            timezoneOffset: browserInfo?.timezoneOffset,

                            // Traffic source
                            referrer: trafficSource?.referrer,
                            referrerDomain: trafficSource?.referrerDomain,
                            utmSource: trafficSource?.utmSource,
                            utmMedium: trafficSource?.utmMedium,
                            utmCampaign: trafficSource?.utmCampaign,
                            utmTerm: trafficSource?.utmTerm,
                            utmContent: trafficSource?.utmContent,
                            fbc: trafficSource?.fbc,
                            fbp: trafficSource?.fbp,
                            landingPage: landingPageWithHeadlineVariant,

                            // Session analytics
                            sessionId: sessionAnalytics?.sessionId,
                            pageViewCount: sessionAnalytics?.pageViewCount,
                            timeOnSiteMs: sessionAnalytics?.timeOnSiteMs,
                            quizStartedAt: sessionAnalytics?.quizStartedAt
                                ? new Date(sessionAnalytics.quizStartedAt)
                                : null,
                            quizCompletedAt: sessionAnalytics?.quizCompletedAt
                                ? new Date(sessionAnalytics.quizCompletedAt)
                                : null,
                            quizDurationMs: sessionAnalytics?.quizDurationMs,
                        },
                    });

                    // Create child order for extra song if selected (always for a different person)
                    if (hasExtraSong && orderBumps?.extraSongData) {
                        const extraSongData = orderBumps.extraSongData;

                        await tx.songOrder.create({
                            data: {
                                // Link to parent order
                                parentOrderId: mainOrder.id,
                                orderType: "EXTRA_SONG",
                                priceAtOrder: 0, // Bump orders have 0 price

                                // Quiz data for the other person
                                recipient: extraSongData.recipient!,
                                recipientName: extraSongData.recipientName!,
                                recipientRelationship: null,
                                genre: extraSongData.genre!,
                                vocals: extraSongData.vocals ?? quizData.vocals,
                                qualities: extraSongData.qualities!,
                                memories: "", // Different person, no shared memories
                                message: null,
                                email: normalizeEmail(quizData.email),
                                backupWhatsApp,

                                // Localization
                                locale,
                                currency,
                                hasFastDelivery,

                                // Copy browser/device info from main order
                                userAgent,
                                userIp,
                                browserName: browserInfo?.browserName,
                                browserVersion: browserInfo?.browserVersion,
                                osName: browserInfo?.osName,
                                osVersion: browserInfo?.osVersion,
                                deviceType: browserInfo?.deviceType,
                            },
                        });
                    }

                    // Create genre variant orders (new lyrics, different genre)
                    if (genreVariants.length > 0) {
                        for (const variantGenre of genreVariants) {
                            // Skip if same as main genre
                            if (variantGenre === quizData.genre) continue;

                            await tx.songOrder.create({
                                data: {
                                    // Link to parent order
                                    parentOrderId: mainOrder.id,
                                    orderType: "GENRE_VARIANT",
                                    priceAtOrder: 0, // Bump orders have 0 price (included in main)

                                    // Copy all quiz data from main order
                                    recipient: quizData.recipient,
                                    recipientName: quizData.name,
                                    recipientRelationship: quizData.relationship || null,
                                    genre: variantGenre, // Different genre!
                                    vocals: quizData.vocals,
                                    qualities: quizData.qualities,
                                    memories: quizData.memories,
                                    message: quizData.message || null,
                                    email: normalizeEmail(quizData.email),
                                    backupWhatsApp,

                                    // Localization
                                    locale,
                                    currency,
                                    hasFastDelivery,

                                    // Lyrics will be generated from scratch for the selected genre

                                    // Copy browser/device info
                                    userAgent,
                                    userIp,
                                    browserName: browserInfo?.browserName,
                                    browserVersion: browserInfo?.browserVersion,
                                    osName: browserInfo?.osName,
                                    osVersion: browserInfo?.osVersion,
                                    deviceType: browserInfo?.deviceType,
                                },
                            });
                        }
                    }

                    // Premium BRL plan includes karaoke playback from checkout.
                    // Create a zero-value child order so generation is auto-triggered after delivery.
                    if (includePremiumBundle) {
                        await tx.songOrder.create({
                            data: {
                                parentOrderId: mainOrder.id,
                                orderType: "KARAOKE_UPSELL",
                                priceAtOrder: 0,
                                recipient: quizData.recipient,
                                recipientName: quizData.name,
                                recipientRelationship: quizData.relationship || null,
                                genre: quizData.genre,
                                vocals: quizData.vocals,
                                qualities: quizData.qualities,
                                memories: quizData.memories,
                                message: quizData.message || null,
                                email: normalizeEmail(quizData.email),
                                backupWhatsApp,
                                locale,
                                currency,
                                hasFastDelivery,
                                userAgent,
                                userIp,
                                browserName: browserInfo?.browserName,
                                browserVersion: browserInfo?.browserVersion,
                                osName: browserInfo?.osName,
                                osVersion: browserInfo?.osVersion,
                                deviceType: browserInfo?.deviceType,
                            },
                        });
                    }

                    return mainOrder.id;
                });

                enqueueOrderReminders(mainOrderId).catch((error) => {
                    console.error("Failed to enqueue order reminders:", error);
                });

                return {
                    success: true,
                    orderId: mainOrderId,
                };
            } catch (error) {
                if (error instanceof TRPCError) {
                    throw error;
                }
                console.error("Failed to create song order:", error);
                console.error("Input data:", JSON.stringify({ quizData, orderBumps, locale, currency }, null, 2));
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: error instanceof Error ? error.message : "Failed to create order. Please try again.",
                });
            }
        }),

    /**
     * Get a song order by ID (for checkout page)
     */
    getById: publicProcedure
        .input(z.object({ orderId: z.string().cuid() }))
        .query(async ({ ctx, input }) => {
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
                    email: true,
                    locale: true,
                    currency: true,
                    priceAtOrder: true,
                    planType: true,
                    couponCode: true,
                    couponDiscountPercent: true,
                    couponDiscountAmount: true,
                    status: true,
                    createdAt: true,
                    orderType: true,
                    hasFastDelivery: true,
                    hasCertificate: true,
                    hasLyrics: true,
                    paymentMethod: true,
                    parentOrderId: true,
                    childOrders: {
                        select: {
                            id: true,
                            orderType: true,
                            recipientName: true,
                            genre: true,
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

            return order;
        }),

    /**
     * Update plan type for BRL and ES orders (called from checkout page)
     * Only works for PENDING orders with plan-based pricing
     */
    updatePlan: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                planType: z.enum(["essencial", "express", "acelerado"]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { orderId, planType } = input;

            // Get the order first to validate
            const order = await ctx.db.songOrder.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    currency: true,
                    locale: true,
                    status: true,
                    orderType: true,
                    stripePaymentIntentId: true,
                    couponDiscountPercent: true,
                    childOrders: {
                        select: { id: true },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Only MAIN orders can have their plan updated
            // Child orders (EXTRA_SONG, GENRE_VARIANT, etc.) are paid via the parent
            if (order.orderType !== "MAIN") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Plan selection only available for main orders",
                });
            }

            if (order.status !== "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Cannot update plan for non-pending orders",
                });
            }

            // Check if this order uses plan-based pricing (PT/ES/FR/IT locales)
            const usesPlanPricing = PLAN_BASED_LOCALES.includes(order.locale as (typeof PLAN_BASED_LOCALES)[number]);
            if (!usesPlanPricing) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Plan selection only available for PT, ES, FR, or IT orders",
                });
            }

            // If payment intent already exists, we can't change the price
            // (they need to go back and restart)
            if (order.stripePaymentIntentId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Cannot change plan after payment started",
                });
            }

            // Calculate new price based on locale/currency
            const prices =
                order.currency === "BRL"
                    ? PRICES.BRL
                    : order.locale === "fr"
                        ? PRICES.EUR
                        : order.locale === "it"
                            ? PRICES.IT
                            : PRICES.USD;
            const planPrice = prices.plans[planType];
            const hasExtraSong = order.childOrders.length > 0;
            const extraSongPrice =
                order.currency === "BRL"
                    ? PRICES.BRL.extraSong
                    : order.locale === "es"
                        ? PRICES.ES.extraSong
                        : order.locale === "fr"
                            ? PRICES.EUR.extraSong
                            : order.locale === "it"
                                ? PRICES.IT.extraSong
                                : PRICES.USD.extraSong;
            const subtotalPrice = hasExtraSong ? planPrice + extraSongPrice : planPrice;
            const discountSummary =
                order.couponDiscountPercent && order.couponDiscountPercent > 0
                    ? applyCouponDiscount(subtotalPrice, order.couponDiscountPercent)
                    : { discountAmount: 0, finalTotal: subtotalPrice };
            const totalPrice = discountSummary.finalTotal;

            // Update the order
            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: orderId },
                data: {
                    planType,
                    priceAtOrder: totalPrice,
                    hasFastDelivery: planType === "express" || planType === "acelerado",
                    couponDiscountAmount: discountSummary.discountAmount > 0 ? discountSummary.discountAmount : null,
                },
                select: {
                    id: true,
                    planType: true,
                    priceAtOrder: true,
                    hasFastDelivery: true,
                },
            });

            return updatedOrder;
        }),

    /**
     * Get orders by email (for track order page)
     * Returns song-producing orders (main, extra song, and genre variants)
     * that are paid, in progress, or completed.
     */
    getByEmail: publicProcedure
        .input(z.object({ email: z.string().email() }))
        .query(async ({ ctx, input }) => {
            const normalizedEmail = normalizeEmail(input.email);
            const orders = await ctx.db.songOrder.findMany({
                where: {
                    email: { contains: normalizedEmail, mode: "insensitive" },
                    orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] }, // Show main orders, extra songs, and genre variants as separate cards
                    status: {
                        in: ["PENDING", "PAID", "IN_PROGRESS", "COMPLETED", "REVISION"],
                    },
                },
                select: {
                    id: true,
                    email: true,
                    orderType: true, // To distinguish MAIN from GENRE_VARIANT
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    status: true,
                    createdAt: true,
                    parentOrderId: true,
                    hasFastDelivery: true,
                    planType: true,
                    currency: true, // Include currency for genre variant upsell pricing
                    priceAtOrder: true, // Include price paid
                    songFileUrl: true, // Include song file URL for completed orders
                    songFileUrl2: true, // Include second song option
                    // Certificate and lyrics order bumps
                    hasCertificate: true,
                    hasLyrics: true,
                    lyricsPdfSongName: true,
                    certificateToken: true,
                    lyrics: true,
                    correctedLyrics: true,
                    locale: true, // For constructing certificate URL
                    // Karaoke upsell fields
                    hasKaraokePlayback: true,
                    karaokeFileUrl: true,
                    karaokeStatus: true,
                    kieTaskId: true,
                    kieAudioId1: true,
                    songUploadedAt: true, // For karaoke upsell expiration (Kie IDs expire ~14 days)
                    revisionCount: true, // For showing revision request button
                    revisionRequestedAt: true, // For queue position calculation
                    revisionNotes: true, // For showing existing notes when adding more
                    melodyPreference: true, // For showing melody preference on revision status
                    revisionCompletedAt: true, // For showing "Revision #X completed" badge
                    // Quiz data for review (shown on pending orders)
                    qualities: true,
                    memories: true,
                    message: true,
                    vocals: true,
                    childOrders: {
                        where: { orderType: { in: ["GENRE_VARIANT", "STREAMING_UPSELL", "LYRICS_UPSELL", "KARAOKE_UPSELL"] } },
                        select: {
                            id: true,
                            orderType: true,
                            recipientName: true,
                            genre: true, // Include genre for GENRE_VARIANT display
                            status: true,
                            hasLyrics: true, // For LYRICS_UPSELL detection
                            songFileUrl: true, // Include song file URL for child orders
                            songFileUrl2: true, // Include second song option for child orders
                            spotifyUrl: true,
                            streamingSongName: true,
                            streamingCoverUrl: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            type OrderItem = (typeof orders)[number];

            const filteredOrders = orders.filter(
                (order: OrderItem) => normalizeEmail(order.email) === normalizedEmail
            );

            // Sanitize orders: remove email and hide lyrics for non-completed orders
            const sanitizedOrders = filteredOrders.map((order: OrderItem) => {
                const { email: _email, ...rest } = order;
                void _email; // Explicitly mark as intentionally unused
                return rest.status === "COMPLETED"
                    ? rest
                    : { ...rest, lyrics: null, correctedLyrics: null };
            });

            // Calculate queue position for REVISION orders
            const revisionOrders = sanitizedOrders.filter(o => o.status === "REVISION" && o.revisionRequestedAt);
            const revisionOrderIds = revisionOrders.map(o => o.id);

            // If there are revision orders, calculate their positions
            let queuePositions: Record<string, number> = {};
            if (revisionOrderIds.length > 0) {
                // Get all REVISION orders to calculate positions
                const allRevisionOrders = await ctx.db.songOrder.findMany({
                    where: { status: "REVISION", revisionRequestedAt: { not: null } },
                    select: { id: true, revisionRequestedAt: true },
                    orderBy: { revisionRequestedAt: "asc" },
                });

                allRevisionOrders.forEach((order, index) => {
                    if (revisionOrderIds.includes(order.id)) {
                        queuePositions[order.id] = index + 1;
                    }
                });
            }

            // Add queue position to each order
            const ordersWithQueuePosition = sanitizedOrders.map(order => ({
                ...order,
                revisionQueuePosition: order.status === "REVISION" ? (queuePositions[order.id] || null) : null,
            }));

            return ordersWithQueuePosition;
        }),

    /**
     * Get orders by phone number (for track order page).
     * Strips non-digits and matches exact normalized variants:
     * - with/without country code (55)
     * - with/without Brazilian mobile 9th digit
     * This avoids false positives from broad suffix matching.
     */
    getByPhone: publicProcedure
        .input(z.object({ phone: z.string().min(4) }))
        .query(async ({ ctx, input }) => {
            const normalizedPhone = normalizePhoneDigits(input.phone);
            const searchCandidates = buildPhoneCandidates(normalizedPhone);
            if (normalizedPhone.length < 10 || searchCandidates.size === 0) {
                return [];
            }
            const orders = await ctx.db.songOrder.findMany({
                where: {
                    backupWhatsApp: { not: null },
                    orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
                    status: {
                        in: ["PENDING", "PAID", "IN_PROGRESS", "COMPLETED", "REVISION"],
                    },
                },
                select: {
                    id: true,
                    email: true,
                    backupWhatsApp: true,
                    orderType: true,
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    status: true,
                    createdAt: true,
                    parentOrderId: true,
                    hasFastDelivery: true,
                    planType: true,
                    currency: true,
                    priceAtOrder: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    hasCertificate: true,
                    hasLyrics: true,
                    lyricsPdfSongName: true,
                    certificateToken: true,
                    lyrics: true,
                    correctedLyrics: true,
                    locale: true,
                    hasKaraokePlayback: true,
                    karaokeFileUrl: true,
                    karaokeStatus: true,
                    kieTaskId: true,
                    kieAudioId1: true,
                    songUploadedAt: true,
                    revisionCount: true,
                    revisionRequestedAt: true,
                    revisionNotes: true,
                    melodyPreference: true,
                    revisionCompletedAt: true,
                    qualities: true,
                    memories: true,
                    message: true,
                    vocals: true,
                    childOrders: {
                        where: { orderType: { in: ["GENRE_VARIANT", "STREAMING_UPSELL", "LYRICS_UPSELL", "KARAOKE_UPSELL"] } },
                        select: {
                            id: true,
                            orderType: true,
                            recipientName: true,
                            genre: true,
                            status: true,
                            hasLyrics: true,
                            songFileUrl: true,
                            songFileUrl2: true,
                            spotifyUrl: true,
                            streamingSongName: true,
                            streamingCoverUrl: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            type OrderItem = (typeof orders)[number];

            // Match by normalized variants (exact set intersection).
            const filteredOrders = orders.filter((order: OrderItem) => {
                const storedDigits = normalizePhoneDigits(order.backupWhatsApp ?? "");
                if (!storedDigits) return false;
                const storedCandidates = buildPhoneCandidates(storedDigits);
                for (const candidate of searchCandidates) {
                    if (storedCandidates.has(candidate)) {
                        return true;
                    }
                }
                return false;
            });

            // Sanitize orders: remove email/phone and hide lyrics for non-completed orders
            const sanitizedOrders = filteredOrders.map((order: OrderItem) => {
                const { email: _email, backupWhatsApp: _phone, ...rest } = order;
                void _email;
                void _phone;
                return rest.status === "COMPLETED"
                    ? rest
                    : { ...rest, lyrics: null, correctedLyrics: null };
            });

            // Calculate queue position for REVISION orders
            const revisionOrders = sanitizedOrders.filter(o => o.status === "REVISION" && o.revisionRequestedAt);
            const revisionOrderIds = revisionOrders.map(o => o.id);

            let queuePositions: Record<string, number> = {};
            if (revisionOrderIds.length > 0) {
                const allRevisionOrders = await ctx.db.songOrder.findMany({
                    where: { status: "REVISION", revisionRequestedAt: { not: null } },
                    select: { id: true, revisionRequestedAt: true },
                    orderBy: { revisionRequestedAt: "asc" },
                });

                allRevisionOrders.forEach((order, index) => {
                    if (revisionOrderIds.includes(order.id)) {
                        queuePositions[order.id] = index + 1;
                    }
                });
            }

            const ordersWithQueuePosition = sanitizedOrders.map(order => ({
                ...order,
                revisionQueuePosition: order.status === "REVISION" ? (queuePositions[order.id] || null) : null,
            }));

            return ordersWithQueuePosition;
        }),

    /**
     * Update pending order info (for editing quiz data before payment)
     */
    updatePendingOrderInfo: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                email: z.string().email(),
                recipientName: z.string().min(1).max(100).optional(),
                genre: z.string().optional(),
                qualities: z.string().optional(),
                memories: z.string().max(2000).optional(),
                message: z.string().max(2000).optional(),
                vocals: z.enum(["MALE", "FEMALE", "EITHER"]).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const normalizedEmail = normalizeEmail(input.email);

            // Find the order
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    status: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate email matches
            if (normalizeEmail(order.email) !== normalizedEmail) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Only allow editing PENDING orders
            if (order.status !== "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only edit pending orders",
                });
            }

            // Build update data
            const updateData: Record<string, unknown> = {};
            if (input.recipientName !== undefined) updateData.recipientName = input.recipientName;
            if (input.genre !== undefined) updateData.genre = input.genre;
            if (input.qualities !== undefined) updateData.qualities = input.qualities || null;
            if (input.memories !== undefined) updateData.memories = input.memories || null;
            if (input.message !== undefined) updateData.message = input.message || null;
            if (input.vocals !== undefined) updateData.vocals = normalizeVocals(input.vocals);

            // Update the order
            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: updateData,
                select: {
                    id: true,
                    recipientName: true,
                    genre: true,
                    qualities: true,
                    memories: true,
                    message: true,
                    vocals: true,
                },
            });

            return updatedOrder;
        }),

    /**
     * Get available genres for creating a genre variant
     * Returns genres not yet used by the order or its variants
     */
    getAvailableGenresForVariant: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                email: z.string().email(),
            })
        )
        .query(async ({ ctx, input }) => {
            const resolvedOrderId = await resolveVariantParentOrderId(ctx.db, input.orderId);
            const order = await ctx.db.songOrder.findUnique({
                where: { id: resolvedOrderId },
                select: {
                    id: true,
                    email: true,
                    genre: true,
                    status: true,
                    orderType: true,
                    locale: true,
                    currency: true,
                    lyrics: true,
                    childOrders: {
                        where: { orderType: "GENRE_VARIANT" },
                        select: { genre: true },
                    },
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate email matches
            if (order.email.toLowerCase() !== input.email.toLowerCase()) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // All genres available — allow repurchasing same genre with new lyrics
            const availableGenres = [...genreTypes];

            // Can purchase once the main order is paid (lyrics are generated from scratch)
            const canPurchase =
                order.status !== "PENDING" &&
                VARIANT_PARENT_ORDER_TYPES.has(order.orderType);

            const price =
                order.currency === "BRL"
                    ? PRICES.BRL.genreVariantUpsell
                    : order.locale === "es"
                    ? PRICES.ES.genreVariantUpsell
                    : order.currency === "EUR"
                    ? PRICES.EUR.genreVariantUpsell
                    : PRICES.USD.genreVariantUpsell;

            return {
                orderId: order.id,
                currentGenre: order.genre,
                availableGenres,
                canPurchase,
                hasLyrics: !!order.lyrics,
                price,
                currency: order.currency,
                locale: order.locale,
            };
        }),

    /**
     * Create a genre variant order (upsell from track-order page)
     * Creates a new order with lyrics written from scratch for the selected genre
     */
    createGenreVariant: publicProcedure
        .input(
            z.object({
                parentOrderId: z.string().cuid(),
                genres: z.array(z.enum(genreTypes)).min(1).max(12),
                email: z.string().email(),
                vocals: z.enum(vocalTypes).optional(),
                lyricsOption: z.enum(["same", "adapt"]).optional().default("same"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const resolvedParentOrderId = await resolveVariantParentOrderId(ctx.db, input.parentOrderId);
            // Get parent order with all needed data
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: resolvedParentOrderId },
                select: {
                    id: true,
                    email: true,
                    backupWhatsApp: true,
                    status: true,
                    genre: true,
                    recipientName: true,
                    recipient: true,
                    vocals: true,
                    locale: true,
                    currency: true,
                    orderType: true,
                    qualities: true,
                    memories: true,
                    message: true,
                    hasFastDelivery: true,
                    lyrics: true,
                    correctedLyrics: true,
                    childOrders: {
                        where: { orderType: "GENRE_VARIANT" },
                        select: { genre: true },
                    },
                },
            });

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            // Validate email
            if (parentOrder.email.toLowerCase() !== input.email.toLowerCase()) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Validate status
            if (parentOrder.status === "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent order must be paid first",
                });
            }

            // Validate order type
            if (!VARIANT_PARENT_ORDER_TYPES.has(parentOrder.orderType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only create variants for main or extra song orders",
                });
            }

            // Note: We allow creating variants even if lyrics aren't ready yet
            // Lyrics are generated from scratch for the selected genre
            // Allow repurchasing same genre — each variant gets unique lyrics
            const validGenres = input.genres;

            // Calculate total price
            const pricePerVariant =
                parentOrder.currency === "BRL"
                    ? PRICES.BRL.genreVariantUpsell
                    : parentOrder.locale === "es"
                    ? PRICES.ES.genreVariantUpsell
                    : parentOrder.currency === "EUR"
                    ? PRICES.EUR.genreVariantUpsell
                    : PRICES.USD.genreVariantUpsell;
            const totalPrice = validGenres.length * pricePerVariant;

            // Determine lyrics data based on lyricsOption
            const parentLyrics = parentOrder.correctedLyrics ?? parentOrder.lyrics;
            const lyricsData =
                input.lyricsOption === "same" && parentLyrics
                    ? {
                          lyrics: parentLyrics,
                          lyricsStatus: "pending", // Worker will generate only musicPrompt
                          keepParentLyrics: true,
                          adaptFromParentLyrics: false,
                      }
                    : input.lyricsOption === "adapt"
                    ? {
                          lyrics: null,
                          lyricsStatus: "pending",
                          keepParentLyrics: false,
                          adaptFromParentLyrics: true,
                      }
                    : {
                          // Default: generate from scratch (legacy behavior)
                          lyrics: null,
                          lyricsStatus: "pending",
                          keepParentLyrics: false,
                          adaptFromParentLyrics: false,
                      };

            // Create a "wrapper" order that holds the payment
            // This is the order that goes to checkout
            const wrapperOrder = await ctx.db.songOrder.create({
                data: {
                    // Link to original parent for reference
                    parentOrderId: parentOrder.id,
                    orderType: "GENRE_VARIANT",
                    priceAtOrder: totalPrice,

                    // Copy data from parent
                    recipient: parentOrder.recipient,
                    recipientName: parentOrder.recipientName,
                    genre: validGenres[0]!, // First variant genre
                    vocals: input.vocals ?? parentOrder.vocals,
                    qualities: parentOrder.qualities,
                    memories: parentOrder.memories,
                    message: parentOrder.message,
                    email: parentOrder.email,
                    backupWhatsApp: parentOrder.backupWhatsApp,
                    locale: parentOrder.locale,
                    currency: parentOrder.currency,
                    hasFastDelivery: parentOrder.hasFastDelivery,

                    // Lyrics handling based on lyricsOption
                    ...lyricsData,
                    lyricsGeneratedAt: null,
                },
            });

            // If multiple genres, create additional variant orders
            if (validGenres.length > 1) {
                for (let i = 1; i < validGenres.length; i++) {
                    await ctx.db.songOrder.create({
                        data: {
                            parentOrderId: wrapperOrder.id,
                            orderType: "GENRE_VARIANT",
                            priceAtOrder: 0, // Included in wrapper price

                            recipient: parentOrder.recipient,
                            recipientName: parentOrder.recipientName,
                            genre: validGenres[i]!,
                            vocals: input.vocals ?? parentOrder.vocals,
                            qualities: parentOrder.qualities,
                            memories: parentOrder.memories,
                            message: parentOrder.message,
                            email: parentOrder.email,
                            backupWhatsApp: parentOrder.backupWhatsApp,
                            locale: parentOrder.locale,
                            currency: parentOrder.currency,
                            hasFastDelivery: parentOrder.hasFastDelivery,

                            // Lyrics handling based on lyricsOption
                            ...lyricsData,
                            lyricsGeneratedAt: null,
                        },
                    });
                }
            }

            return {
                success: true,
                orderId: wrapperOrder.id,
                genres: validGenres,
                price: totalPrice,
                currency: parentOrder.currency,
            };
        }),

    /**
     * Create a lyrics upsell order (upsell from track-order page)
     * Creates a new order to add lyrics to an existing order
     */
    createLyricsUpsell: publicProcedure
        .input(
            z.object({
                parentOrderId: z.string().cuid(),
                email: z.string().email(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Get parent order with all needed data
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.parentOrderId },
                select: {
                    id: true,
                    email: true,
                    backupWhatsApp: true,
                    status: true,
                    hasLyrics: true,
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
                    lyrics: true,
                    hasFastDelivery: true,
                },
            });

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            // Validate email
            if (parentOrder.email.toLowerCase() !== input.email.toLowerCase()) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Validate status
            if (parentOrder.status === "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent order must be paid first",
                });
            }

            // Validate order type
            if (!UPSELL_PARENT_ORDER_TYPES.has(parentOrder.orderType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only add lyrics to main, extra song, or genre variant orders",
                });
            }

            // Check if already has lyrics
            if (parentOrder.hasLyrics) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order already has lyrics",
                });
            }

            // Check for existing pending lyrics upsell (idempotency)
            const existingUpsell = await ctx.db.songOrder.findFirst({
                where: {
                    parentOrderId: parentOrder.id,
                    orderType: "LYRICS_UPSELL",
                    status: { in: ["PENDING", "PAID", "IN_PROGRESS", "COMPLETED"] },
                },
                select: {
                    id: true,
                    status: true,
                },
            });

            if (existingUpsell) {
                // Return existing order instead of creating duplicate
                const price =
                    parentOrder.currency === "BRL"
                        ? PRICES.BRL.lyricsUpsell
                        : parentOrder.locale === "es"
                        ? PRICES.ES.lyricsUpsell
                        : parentOrder.currency === "EUR"
                        ? PRICES.EUR.lyricsUpsell
                        : PRICES.USD.lyricsUpsell;

                return {
                    success: true,
                    orderId: existingUpsell.id,
                    price,
                    currency: parentOrder.currency,
                };
            }

            // Calculate price (upsell price is different from checkout price)
            const price =
                parentOrder.currency === "BRL"
                    ? PRICES.BRL.lyricsUpsell
                    : parentOrder.locale === "es"
                    ? PRICES.ES.lyricsUpsell
                    : parentOrder.currency === "EUR"
                    ? PRICES.EUR.lyricsUpsell
                    : PRICES.USD.lyricsUpsell;

            // Create a "wrapper" order that holds the payment for lyrics
            const lyricsOrder = await ctx.db.songOrder.create({
                data: {
                    // Link to original parent for reference
                    parentOrderId: parentOrder.id,
                    orderType: "LYRICS_UPSELL",
                    priceAtOrder: price,

                    // Copy data from parent
                    recipient: parentOrder.recipient,
                    recipientName: parentOrder.recipientName,
                    genre: parentOrder.genre,
                    vocals: parentOrder.vocals,
                    qualities: parentOrder.qualities,
                    memories: parentOrder.memories,
                    message: parentOrder.message,
                    email: parentOrder.email,
                    backupWhatsApp: parentOrder.backupWhatsApp,
                    locale: parentOrder.locale,
                    currency: parentOrder.currency,
                    hasFastDelivery: parentOrder.hasFastDelivery,

                    // Copy lyrics if available (they will be shown after payment)
                    lyrics: parentOrder.lyrics,
                    lyricsStatus: parentOrder.lyrics ? "completed" : "pending",
                    lyricsGeneratedAt: parentOrder.lyrics ? new Date() : null,

                    // Mark that this order is for lyrics
                    hasLyrics: true,
                },
            });

            return {
                success: true,
                orderId: lyricsOrder.id,
                price,
                currency: parentOrder.currency,
            };
        }),

    /**
     * Create a karaoke (instrumental) upsell order (upsell from track-order page)
     * Generates instrumental version via Kie.ai vocal separation
     */
    createKaraokeUpsell: publicProcedure
        .input(
            z.object({
                parentOrderId: z.string().cuid(),
                email: z.string().email(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.parentOrderId },
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
                    hasKaraokePlayback: true,
                    songFileUrl: true,
                    kieTaskId: true,
                    kieAudioId1: true,
                    kieAudioId2: true,
                    songUploadedAt: true,
                },
            });

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            if (parentOrder.email.toLowerCase() !== input.email.toLowerCase()) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            if (parentOrder.status === "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent order must be paid first",
                });
            }

            if (!UPSELL_PARENT_ORDER_TYPES.has(parentOrder.orderType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only add karaoke to main, extra song, or genre variant orders",
                });
            }

            // Reject if Kie IDs exist but expired (14-day Kie limit, 12-day safety margin)
            const KIE_EXPIRY_MS = 12 * 24 * 60 * 60 * 1000;
            if (
                parentOrder.songUploadedAt &&
                Date.now() - parentOrder.songUploadedAt.getTime() > KIE_EXPIRY_MS
            ) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Karaoke generation is no longer available for this order (Kie IDs expired)",
                });
            }

            if (parentOrder.hasKaraokePlayback) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order already has karaoke playback",
                });
            }

            // Completed orders can only buy karaoke when the current song version
            // has valid Kie IDs linked to the current file.
            const hasKieIdsForCurrentSong = Boolean(
                parentOrder.songFileUrl && parentOrder.kieTaskId && parentOrder.kieAudioId1
            );
            if (parentOrder.status === "COMPLETED" && !hasKieIdsForCurrentSong) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Karaoke is unavailable for this song version",
                });
            }

            // Check for existing karaoke upsell (idempotency)
            const existingUpsell = await ctx.db.songOrder.findFirst({
                where: {
                    parentOrderId: parentOrder.id,
                    orderType: "KARAOKE_UPSELL",
                    status: { in: ["PENDING", "PAID", "IN_PROGRESS", "COMPLETED"] },
                },
                select: {
                    id: true,
                    status: true,
                },
            });

            const price =
                parentOrder.currency === "BRL"
                    ? PRICES.BRL.karaokeUpsell
                    : parentOrder.locale === "es"
                    ? PRICES.ES.karaokeUpsell
                    : parentOrder.currency === "EUR"
                    ? PRICES.EUR.karaokeUpsell
                    : PRICES.USD.karaokeUpsell;

            if (existingUpsell) {
                return {
                    success: true,
                    orderId: existingUpsell.id,
                    price,
                    currency: parentOrder.currency,
                };
            }

            const karaokeOrder = await ctx.db.songOrder.create({
                data: {
                    parentOrderId: parentOrder.id,
                    orderType: "KARAOKE_UPSELL",
                    priceAtOrder: price,

                    recipient: parentOrder.recipient,
                    recipientName: parentOrder.recipientName,
                    genre: parentOrder.genre,
                    vocals: parentOrder.vocals,
                    qualities: parentOrder.qualities,
                    memories: parentOrder.memories,
                    message: parentOrder.message,
                    email: parentOrder.email,
                    backupWhatsApp: parentOrder.backupWhatsApp,
                    locale: parentOrder.locale,
                    currency: parentOrder.currency,
                    hasFastDelivery: parentOrder.hasFastDelivery,
                    // Snapshot Kie linkage at purchase time for deterministic karaoke generation.
                    kieTaskId: parentOrder.kieTaskId,
                    kieAudioId1: parentOrder.kieAudioId1,
                    kieAudioId2: parentOrder.kieAudioId2,
                },
            });

            return {
                success: true,
                orderId: karaokeOrder.id,
                price,
                currency: parentOrder.currency,
            };
        }),

    /**
     * Create a streaming distribution upsell order (upsell from track-order page)
     * Adds the song to Spotify/Instagram/TikTok with cover art
     * Supports songSlot: "1" (first song), "2" (second song), or "both" (creates 2 orders)
     */
    createStreamingUpsell: publicProcedure
        .input(
            z.object({
                parentOrderId: z.string().cuid(),
                email: z.string().email(),
                quantity: z.enum(["1", "2"]).default("1"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.parentOrderId },
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

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            // Validate email
            if (parentOrder.email.toLowerCase() !== input.email.toLowerCase()) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Validate status
            if (parentOrder.status === "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent order must be paid first",
                });
            }

            // Validate order type
            if (!UPSELL_PARENT_ORDER_TYPES.has(parentOrder.orderType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only add streaming distribution to main, extra song, or genre variant orders",
                });
            }

            // Validate quantity=2 requires two songs
            const hasTwoSongs = !!(parentOrder.songFileUrl && parentOrder.songFileUrl2);
            if (input.quantity === "2" && !hasTwoSongs) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order does not have two songs",
                });
            }

            // Get existing streaming upsells - separate queries for different purposes
            // 1. For idempotency: include PENDING orders (to avoid creating duplicates)
            const allUpsells = await ctx.db.songOrder.findMany({
                where: {
                    parentOrderId: parentOrder.id,
                    orderType: "STREAMING_UPSELL",
                    status: { in: STREAMING_UPSELL_ACTIVE_STATUSES },
                },
                select: {
                    id: true,
                    status: true,
                    preferredSongForStreaming: true,
                },
            });

            // 2. For price calculation: only PAID or later count as "purchased"
            const paidUpsells = allUpsells.filter((u) =>
                STREAMING_UPSELL_PURCHASED_STATUSES.includes(u.status as typeof STREAMING_UPSELL_PURCHASED_STATUSES[number])
            );

            // Determine which slots are already purchased (only PAID counts for pricing)
            const slot1Purchased = paidUpsells.some(
                (u) => u.preferredSongForStreaming === parentOrder.songFileUrl
            );
            const slot2Purchased = hasTwoSongs && paidUpsells.some(
                (u) => u.preferredSongForStreaming === parentOrder.songFileUrl2
            );

            // Helper to get price based on currency/locale
            const getPrice = (isSecondSong: boolean) => {
                return getStreamingUpsellPrice(parentOrder.currency, parentOrder.locale, isSecondSong);
            };

            // Helper to create a streaming order
            // songUrl can be null if user will select later (quantity=1 with 2 songs available)
            const createStreamingOrder = async (
                songUrl: string | null,
                price: number,
                shouldEnqueueReminder: boolean
            ) => {
                const order = await ctx.db.songOrder.create({
                    data: {
                        parentOrderId: parentOrder.id,
                        orderType: "STREAMING_UPSELL",
                        priceAtOrder: price,
                        preferredSongForStreaming: songUrl,

                        recipient: parentOrder.recipient,
                        recipientName: parentOrder.recipientName,
                        genre: parentOrder.genre,
                        vocals: parentOrder.vocals,
                        qualities: parentOrder.qualities,
                        memories: parentOrder.memories,
                        message: parentOrder.message,
                        email: parentOrder.email,
                        backupWhatsApp: parentOrder.backupWhatsApp,
                        locale: parentOrder.locale,
                        currency: parentOrder.currency,
                        hasFastDelivery: parentOrder.hasFastDelivery,
                    },
                });
                if (shouldEnqueueReminder) {
                    await enqueueStreamingVipReminder(order.id);
                }
                return order;
            };

            const createdOrders: { id: string; price: number }[] = [];

            if (input.quantity === "1") {
                // Check if any streaming upsell already exists for this parent
                const existingPending = allUpsells.find(
                    (u) => u.preferredSongForStreaming === null ||
                           u.preferredSongForStreaming === parentOrder.songFileUrl ||
                           u.preferredSongForStreaming === parentOrder.songFileUrl2
                );

                // If user already has one, return it
                if (existingPending) {
                    return {
                        success: true,
                        orderId: existingPending.id,
                        orderIds: [existingPending.id],
                        price: getPrice(false),
                        totalPrice: getPrice(false),
                        currency: parentOrder.currency,
                    };
                }

                // Determine price based on whether this is a second purchase
                const isSecondPurchase = slot1Purchased || slot2Purchased;
                const price = getPrice(isSecondPurchase);

                // If only 1 song available, set it directly
                // If 2 songs available, leave null for user to select on success page
                const songUrl = hasTwoSongs ? null : parentOrder.songFileUrl;
                const order = await createStreamingOrder(songUrl, price, true);
                createdOrders.push({ id: order.id, price });
            } else {
                // quantity === "2": Create orders for both songs
                let shouldEnqueueReminder = true;
                if (!slot1Purchased) {
                    const price1 = getPrice(false); // First song: full price
                    const order1 = await createStreamingOrder(
                        parentOrder.songFileUrl!,
                        price1,
                        shouldEnqueueReminder
                    );
                    createdOrders.push({ id: order1.id, price: price1 });
                    shouldEnqueueReminder = false;
                }
                if (!slot2Purchased) {
                    // Second song: discounted price (or full if first was already purchased)
                    const price2 = getPrice(!slot1Purchased || createdOrders.length > 0);
                    const order2 = await createStreamingOrder(
                        parentOrder.songFileUrl2!,
                        price2,
                        shouldEnqueueReminder
                    );
                    createdOrders.push({ id: order2.id, price: price2 });
                    shouldEnqueueReminder = false;
                }

                // If both were already purchased, return the existing orders
                if (createdOrders.length === 0) {
                    return {
                        success: true,
                        orderId: allUpsells[0]!.id,
                        orderIds: allUpsells.map((u) => u.id),
                        price: getPrice(false),
                        totalPrice: getPrice(false) * 2,
                        currency: parentOrder.currency,
                    };
                }
            }

            const totalPrice = createdOrders.reduce((sum, o) => sum + o.price, 0);

            return {
                success: true,
                orderId: createdOrders[0]!.id,
                orderIds: createdOrders.map((o) => o.id),
                price: createdOrders[0]!.price,
                totalPrice,
                currency: parentOrder.currency,
            };
        }),

    /**
     * Returns eligible "other orders" for cross-order streaming bundle checkout.
     * Rules:
     * - Same customer email
     * - Same currency and locale (country/market lock)
     * - Order is completed and streaming not purchased yet
     */
    getStreamingBundleCandidates: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                email: z.string().email(),
            })
        )
        .query(async ({ ctx, input }) => {
            const normalizedEmail = normalizeEmail(input.email);
            const currentOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    locale: true,
                    currency: true,
                    orderType: true,
                    status: true,
                    childOrders: {
                        where: { orderType: "STREAMING_UPSELL" },
                        select: { status: true },
                    },
                },
            });

            if (!currentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            if (normalizeEmail(currentOrder.email) !== normalizedEmail) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            if (!UPSELL_PARENT_ORDER_TYPES.has(currentOrder.orderType)) {
                return { candidates: [] as Array<{ id: string; recipientName: string; recipient: string; genre: string; createdAt: Date }> };
            }

            const currentHasStreaming = currentOrder.childOrders.some((child) =>
                STREAMING_UPSELL_PURCHASED_STATUSES.includes(child.status as typeof STREAMING_UPSELL_PURCHASED_STATUSES[number])
            );
            const currentIsEligible = currentOrder.status === "COMPLETED" && !currentHasStreaming;

            if (!currentIsEligible) {
                return { candidates: [] as Array<{ id: string; recipientName: string; recipient: string; genre: string; createdAt: Date }> };
            }

            const candidates = await ctx.db.songOrder.findMany({
                where: {
                    id: { not: currentOrder.id },
                    email: { equals: normalizedEmail, mode: "insensitive" },
                    currency: currentOrder.currency,
                    locale: currentOrder.locale,
                    orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
                    status: "COMPLETED",
                    childOrders: {
                        none: {
                            orderType: "STREAMING_UPSELL",
                            status: { in: STREAMING_UPSELL_PURCHASED_STATUSES },
                        },
                    },
                },
                select: {
                    id: true,
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
            });

            return { candidates };
        }),

    /**
     * Creates a 2-song streaming bundle across different parent orders.
     * This enables the "2 songs promo" even when songs are on separate orders.
     */
    createStreamingUpsellBundle: publicProcedure
        .input(
            z.object({
                email: z.string().email(),
                parentOrderIds: z.array(z.string().cuid()).length(2),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const normalizedEmail = normalizeEmail(input.email);
            const uniqueParentOrderIds = Array.from(new Set(input.parentOrderIds));

            if (uniqueParentOrderIds.length !== 2) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Bundle requires exactly 2 different orders",
                });
            }

            const parents = await ctx.db.songOrder.findMany({
                where: { id: { in: uniqueParentOrderIds } },
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

            if (parents.length !== uniqueParentOrderIds.length) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "One or more parent orders not found",
                });
            }

            const parentById = new Map(parents.map((parent) => [parent.id, parent]));
            const orderedParents = uniqueParentOrderIds.map((id) => {
                const parent = parentById.get(id);
                if (!parent) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Parent order not found",
                    });
                }
                return parent;
            });

            const firstParent = orderedParents[0]!;
            const bundleCurrency = firstParent.currency;
            const bundleLocale = firstParent.locale;

            for (const parent of orderedParents) {
                if (normalizeEmail(parent.email) !== normalizedEmail) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Email does not match order",
                    });
                }

                if (!UPSELL_PARENT_ORDER_TYPES.has(parent.orderType)) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Can only add streaming distribution to main, extra song, or genre variant orders",
                    });
                }

                if (parent.status !== "COMPLETED") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Parent order must be completed first",
                    });
                }

                if (parent.currency !== bundleCurrency || parent.locale !== bundleLocale) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Bundle orders must use the same currency and locale",
                    });
                }

                if (!parent.songFileUrl && !parent.songFileUrl2) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Order does not have a song ready for streaming",
                    });
                }
            }

            const existingUpsells = await ctx.db.songOrder.findMany({
                where: {
                    parentOrderId: { in: uniqueParentOrderIds },
                    orderType: "STREAMING_UPSELL",
                    status: { in: STREAMING_UPSELL_ACTIVE_STATUSES },
                },
                select: {
                    id: true,
                    parentOrderId: true,
                    status: true,
                    priceAtOrder: true,
                },
            });

            const existingPurchasedUpsells = existingUpsells.filter((upsell) =>
                STREAMING_UPSELL_PURCHASED_STATUSES.includes(upsell.status as typeof STREAMING_UPSELL_PURCHASED_STATUSES[number])
            );
            if (existingPurchasedUpsells.length > 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "One or more selected orders already has streaming purchased",
                });
            }

            const existingPendingByParentId = new Map(
                existingUpsells
                    .filter((upsell) => upsell.status === "PENDING")
                    .map((upsell) => [upsell.parentOrderId, upsell] as const)
            );

            const fullPrice = getStreamingUpsellPrice(bundleCurrency, bundleLocale, false);
            const discountedPrice = getStreamingUpsellPrice(bundleCurrency, bundleLocale, true);

            const bundleOrders = await ctx.db.$transaction(async (tx) => {
                const lockCheck = await tx.songOrder.findFirst({
                    where: {
                        parentOrderId: { in: uniqueParentOrderIds },
                        orderType: "STREAMING_UPSELL",
                        status: { in: STREAMING_UPSELL_PURCHASED_STATUSES },
                    },
                    select: { id: true },
                });

                if (lockCheck) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Streaming bundle already created for one of these orders",
                    });
                }

                const created: { id: string; price: number }[] = [];
                const resolved: { id: string; price: number }[] = [];

                for (let index = 0; index < orderedParents.length; index++) {
                    const parent = orderedParents[index]!;
                    const pendingOrder = existingPendingByParentId.get(parent.id);
                    if (pendingOrder) {
                        resolved.push({ id: pendingOrder.id, price: pendingOrder.priceAtOrder });
                        continue;
                    }

                    const price = resolved.length === 0 ? fullPrice : discountedPrice;
                    const hasTwoSongs = !!(parent.songFileUrl && parent.songFileUrl2);
                    const preferredSong =
                        hasTwoSongs
                            ? null
                            : parent.songFileUrl ?? parent.songFileUrl2 ?? null;

                    const order = await tx.songOrder.create({
                        data: {
                            parentOrderId: parent.id,
                            orderType: "STREAMING_UPSELL",
                            priceAtOrder: price,
                            preferredSongForStreaming: preferredSong,

                            recipient: parent.recipient,
                            recipientName: parent.recipientName,
                            genre: parent.genre,
                            vocals: parent.vocals,
                            qualities: parent.qualities,
                            memories: parent.memories,
                            message: parent.message,
                            email: parent.email,
                            backupWhatsApp: parent.backupWhatsApp,
                            locale: parent.locale,
                            currency: parent.currency,
                            hasFastDelivery: parent.hasFastDelivery,
                        },
                        select: { id: true },
                    });

                    const createdOrder = { id: order.id, price };
                    created.push(createdOrder);
                    resolved.push(createdOrder);
                }

                return { created, resolved };
            });

            // Keep reminder behavior consistent with the existing flow: once per bundle.
            if (bundleOrders.created.length > 0) {
                await enqueueStreamingVipReminder(bundleOrders.created[0]!.id);
            }

            const resolvedOrders = bundleOrders.resolved;
            const totalPrice = resolvedOrders.reduce((sum, order) => sum + order.price, 0);

            return {
                success: true,
                orderId: resolvedOrders[0]!.id,
                orderIds: resolvedOrders.map((order) => order.id),
                price: resolvedOrders[0]!.price,
                totalPrice,
                currency: bundleCurrency,
            };
        }),

    /**
     * Get lyrics by order ID
     * Used on the lyrics page to display lyrics in HTML
     */
    getLyricsById: publicProcedure
        .input(z.object({ orderId: z.string().cuid() }))
        .query(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    recipientName: true,
                    hasLyrics: true,
                    lyrics: true,
                    displayLyrics: true,
                    status: true,
                    orderType: true,
                    parentOrderId: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            const targetOrder =
                order.orderType === "LYRICS_UPSELL" && order.parentOrderId
                    ? await ctx.db.songOrder.findUnique({
                        where: { id: order.parentOrderId },
                        select: {
                            id: true,
                            recipientName: true,
                            hasLyrics: true,
                            lyrics: true,
                            displayLyrics: true,
                            status: true,
                        },
                    })
                    : order;

            if (!targetOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Check if lyrics add-on was purchased
            if (!targetOrder.hasLyrics) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Lyrics add-on not purchased for this order",
                });
            }

            // Only return if order is completed (song delivered)
            if (targetOrder.status !== "COMPLETED") {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Lyrics not available yet",
                });
            }

            // Check if lyrics are ready
            if (!targetOrder.lyrics) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Lyrics not yet available",
                });
            }

            return {
                recipientName: targetOrder.recipientName,
                lyrics: targetOrder.lyrics ?? targetOrder.displayLyrics,
            };
        }),

    /**
     * Get certificate data by public token
     * Used on the public certificate page
     */
    getCertificateByToken: publicProcedure
        .input(z.object({ token: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { certificateToken: input.token },
                select: {
                    id: true,
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    vocals: true,
                    createdAt: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    hasCertificate: true,
                    hasLyrics: true,
                    lyrics: true,
                    locale: true,
                    status: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Certificate not found",
                });
            }

            // Only return if certificate was purchased
            if (!order.hasCertificate) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Certificate not found",
                });
            }

            // Only return if order is paid and song is ready
            if (order.status === "PENDING" || order.status === "CANCELLED") {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Certificate not available yet",
                });
            }

            return {
                recipientName: order.recipientName,
                recipient: order.recipient,
                genre: order.genre,
                vocals: order.vocals,
                createdAt: order.createdAt,
                songFileUrl: order.songFileUrl,
                songFileUrl2: order.songFileUrl2,
                hasLyrics: order.hasLyrics,
                // Only return lyrics if the lyrics bump was purchased
                lyrics: order.hasLyrics ? order.lyrics : null,
                locale: order.locale,
            };
        }),

    /**
     * Update the email address for an order (and its related child orders)
     * This allows customers to correct typos on the success page
     */
    updateEmail: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                currentEmail: z.string().email(),
                newEmail: z.string().email(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const normalizedCurrentEmail = normalizeEmail(input.currentEmail);
            const normalizedNewEmail = normalizeEmail(input.newEmail);

            const order = await ctx.db.songOrder.findFirst({
                where: {
                    id: input.orderId,
                    email: normalizedCurrentEmail,
                },
                select: {
                    id: true,
                    parentOrderId: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            const rootOrderId = order.parentOrderId ?? order.id;

            if (normalizedCurrentEmail !== normalizedNewEmail) {
                await ctx.db.songOrder.updateMany({
                    where: {
                        OR: [
                            { id: rootOrderId },
                            { parentOrderId: rootOrderId },
                        ],
                    },
                    data: { email: normalizedNewEmail },
                });
            }

            return {
                id: rootOrderId,
                email: normalizedNewEmail,
            };
        }),

    /**
     * Update story details for an order and regenerate lyrics
     */
    updateStoryDetails: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                email: z.string().email(),
                recipientName: z.string().max(100),
                recipient: z.enum(recipientTypes),
                genre: z.enum(genreTypes),
                vocals: z.enum(vocalTypes),
                qualities: z.string().min(10),
                memories: z.string().min(10),
                message: z.string().optional().nullable(),
            })
            .refine(
                (data) => {
                    if (data.recipient !== "group") {
                        return data.recipientName.trim().length > 0;
                    }
                    return true;
                },
                { message: "Name is required", path: ["recipientName"] }
            )
        )
        .mutation(async ({ ctx, input }) => {
            const normalizedEmail = normalizeEmail(input.email);
            const EDIT_COOLDOWN_MINUTES = 5;
            const cooldownMs = EDIT_COOLDOWN_MINUTES * 60 * 1000;

            const order = await ctx.db.songOrder.findFirst({
                where: {
                    id: input.orderId,
                    email: normalizedEmail,
                },
                select: {
                    id: true,
                    parentOrderId: true,
                    status: true,
                    orderType: true,
                    updatedAt: true,
                    lyricsStatus: true,
                    hasFastDelivery: true,
                    recipientName: true,
                    recipient: true,
                    genre: true,
                    vocals: true,
                    qualities: true,
                    memories: true,
                    message: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            if (order.orderType !== "MAIN" && order.orderType !== "GENRE_VARIANT" && order.orderType !== "EXTRA_SONG") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only update story details for main, genre variant, or extra song orders",
                });
            }

            if (order.status !== "PAID" && order.status !== "IN_PROGRESS") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order cannot be edited at this stage",
                });
            }

            if (
                order.lyricsStatus &&
                (order.lyricsStatus === "pending" || order.lyricsStatus === "generating") &&
                Date.now() - order.updatedAt.getTime() < cooldownMs
            ) {
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: "Please wait a few minutes before editing again",
                });
            }

            const recipientName = input.recipientName.trim();
            const qualities = input.qualities.trim();
            const memories = input.memories.trim();
            const message = input.message?.trim() ? input.message.trim() : null;
            const nextStatus = "PAID" as const;
            const normalizedCurrentHonoree = normalizeHonoreeNameForComparison(order.recipientName);
            const hasSharedStoryChanges =
                recipientName !== order.recipientName ||
                input.recipient !== order.recipient ||
                qualities !== order.qualities ||
                memories !== order.memories ||
                (message ?? null) !== (order.message ?? null);

            const isUnchanged =
                recipientName === order.recipientName &&
                input.recipient === order.recipient &&
                input.genre === order.genre &&
                input.vocals === order.vocals?.toLowerCase() &&
                qualities === order.qualities &&
                memories === order.memories &&
                (message ?? null) === (order.message ?? null);

            if (isUnchanged) {
                return {
                    id: order.id,
                    recipientName: order.recipientName,
                    recipient: order.recipient,
                    genre: order.genre,
                    vocals: order.vocals,
                    qualities: order.qualities,
                    memories: order.memories,
                    message: order.message,
                    status: order.status,
                };
            }

            let syncTargets: Array<{
                id: string;
                updatedAt: Date;
                lyricsStatus: string | null;
                hasFastDelivery: boolean;
                recipientName: string;
            }> = [
                {
                    id: order.id,
                    updatedAt: order.updatedAt,
                    lyricsStatus: order.lyricsStatus,
                    hasFastDelivery: order.hasFastDelivery,
                    recipientName: order.recipientName,
                },
            ];

            const canSyncMainAndExtra = order.orderType === "MAIN" || order.orderType === "EXTRA_SONG";
            if (canSyncMainAndExtra && normalizedCurrentHonoree && hasSharedStoryChanges) {
                const rootOrderId = order.parentOrderId ?? order.id;
                const relatedOrders = await ctx.db.songOrder.findMany({
                    where: {
                        OR: [
                            { id: rootOrderId },
                            { parentOrderId: rootOrderId },
                        ],
                        orderType: { in: ["MAIN", "EXTRA_SONG"] },
                        status: { in: ["PAID", "IN_PROGRESS"] },
                    },
                    select: {
                        id: true,
                        updatedAt: true,
                        lyricsStatus: true,
                        hasFastDelivery: true,
                        recipientName: true,
                    },
                });

                const matchingOrders = relatedOrders.filter(
                    (candidate) =>
                        normalizeHonoreeNameForComparison(candidate.recipientName) === normalizedCurrentHonoree
                );

                if (matchingOrders.length > 0) {
                    syncTargets = matchingOrders;
                }
            }

            const uniqueSyncTargets = Array.from(
                new Map(syncTargets.map((target) => [target.id, target])).values()
            );

            for (const target of uniqueSyncTargets) {
                if (
                    target.lyricsStatus &&
                    (target.lyricsStatus === "pending" || target.lyricsStatus === "generating") &&
                    Date.now() - target.updatedAt.getTime() < cooldownMs
                ) {
                    throw new TRPCError({
                        code: "TOO_MANY_REQUESTS",
                        message: "Please wait a few minutes before editing again",
                    });
                }
            }

            const syncTargetIds = uniqueSyncTargets.map((target) => target.id);

            const updatedOrder = await ctx.db.$transaction(async (tx) => {
                const resetForRegenerationData = {
                    status: nextStatus,
                    lyrics: null,
                    musicPrompt: null,
                    lyricsStatus: "pending" as const,
                    lyricsGeneratedAt: null,
                    lyricsError: null,
                    lyricsPrompt: null,
                    songFileUrl: null,
                    songFileKey: null,
                    songUploadedAt: null,
                    songFileUrl2: null,
                    songFileKey2: null,
                    songUploadedAt2: null,
                    songDeliveredAt: null,
                };

                await tx.songOrder.updateMany({
                    where: { id: { in: syncTargetIds } },
                    data: {
                        recipientName,
                        recipient: input.recipient,
                        qualities,
                        memories,
                        message,
                        ...resetForRegenerationData,
                    },
                });

                await tx.songOrder.update({
                    where: { id: order.id },
                    data: {
                        genre: input.genre,
                        vocals: input.vocals,
                    },
                });

                const currentOrder = await tx.songOrder.findUnique({
                    where: { id: order.id },
                    select: {
                        id: true,
                        recipientName: true,
                        recipient: true,
                        genre: true,
                        vocals: true,
                        qualities: true,
                        memories: true,
                        message: true,
                        status: true,
                    },
                });

                if (!currentOrder) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Order not found",
                    });
                }

                return currentOrder;
            });

            if (updatedOrder.status !== "PENDING") {
                for (const target of uniqueSyncTargets) {
                    try {
                        const lyricsPriority = target.hasFastDelivery ? 1 : 5;
                        await enqueueLyricsGeneration(target.id, { priority: lyricsPriority });
                    } catch (error) {
                        if (!(error instanceof Error) || !error.message.includes("already exists")) {
                            throw error;
                        }
                    }
                }
            }

            return updatedOrder;
        }),

    /**
     * Update backup WhatsApp number for an order
     * This allows customers to provide an alternative contact method on the success page
     */
    updateBackupWhatsApp: publicProcedure
        .input(
            z.object({
                orderId: z.string(),
                email: z.string().email(),
                backupWhatsApp: z.string().min(8).max(25),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Normalize email for comparison
            const normalizedEmail = normalizeEmail(input.email);

            // Verify the order exists and belongs to this email
            const order = await ctx.db.songOrder.findFirst({
                where: {
                    id: input.orderId,
                    email: normalizedEmail,
                },
                select: { id: true },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Update only the backupWhatsApp field
            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: { backupWhatsApp: input.backupWhatsApp },
                select: { id: true, backupWhatsApp: true },
            });

            // Notify Telegram so the team sees the WhatsApp number
            try {
                const { sendWhatsAppUpdateAlert } = await import("~/lib/telegram");
                await sendWhatsAppUpdateAlert({
                    orderId: input.orderId,
                    backupWhatsApp: input.backupWhatsApp,
                });
            } catch {
                // Non-critical, don't fail the mutation
            }

            return updated;
        }),

    /**
     * Create a musician tip order (voluntary contribution)
     * Creates a new order for customers who want to tip the musicians
     */
    createMusicianTip: publicProcedure
        .input(
            z.object({
                parentOrderId: z.string().cuid(),
                email: z.string().email(),
                amount: z.number().min(1000).max(295000), // in cents, min 10, max 2950
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Get parent order
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: input.parentOrderId },
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
                },
            });

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            // Validate email
            if (parentOrder.email.toLowerCase() !== input.email.toLowerCase()) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Validate status - must be COMPLETED (song delivered)
            if (parentOrder.status !== "COMPLETED") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order must be completed before tipping",
                });
            }

            const tipEligibleOrderTypes = new Set(["MAIN", "EXTRA_SONG", "GENRE_VARIANT"]);
            // Validate order type - only song orders can receive tips
            if (!tipEligibleOrderTypes.has(parentOrder.orderType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Can only tip on song orders",
                });
            }

            // Check for existing musician tip
            const existingTip = await ctx.db.songOrder.findFirst({
                where: {
                    parentOrderId: parentOrder.id,
                    orderType: "MUSICIAN_TIP",
                    status: { in: ["PENDING", "PAID"] },
                },
                select: {
                    id: true,
                    status: true,
                    priceAtOrder: true,
                },
            });

            if (existingTip) {
                // If already PAID, return as-is (can't change)
                if (existingTip.status === "PAID") {
                    return {
                        success: true,
                        orderId: existingTip.id,
                        amount: existingTip.priceAtOrder,
                        currency: parentOrder.currency,
                    };
                }

                // If PENDING, update the amount and invalidate old PaymentIntent
                await ctx.db.songOrder.update({
                    where: { id: existingTip.id },
                    data: {
                        priceAtOrder: input.amount,
                        stripePaymentIntentId: null,  // Force new PaymentIntent to be created
                    },
                });

                return {
                    success: true,
                    orderId: existingTip.id,
                    amount: input.amount,
                    currency: parentOrder.currency,
                };
            }

            // Create the musician tip order
            const tipOrder = await ctx.db.songOrder.create({
                data: {
                    // Link to original parent
                    parentOrderId: parentOrder.id,
                    orderType: "MUSICIAN_TIP",
                    priceAtOrder: input.amount,

                    // Copy essential data from parent
                    recipient: parentOrder.recipient,
                    recipientName: parentOrder.recipientName,
                    genre: parentOrder.genre,
                    vocals: parentOrder.vocals,
                    qualities: parentOrder.qualities,
                    memories: parentOrder.memories,
                    message: parentOrder.message,
                    email: parentOrder.email,
                    backupWhatsApp: parentOrder.backupWhatsApp,
                    locale: parentOrder.locale,
                    currency: parentOrder.currency,
                    hasFastDelivery: parentOrder.hasFastDelivery,
                },
            });

            // Enqueue reminder email for 30 minutes later (if not paid)
            await enqueueMusicianTipReminder(tipOrder.id);

            return {
                success: true,
                orderId: tipOrder.id,
                amount: input.amount,
                currency: parentOrder.currency,
            };
        }),

    // ============= REVISION REQUEST =============

    /**
     * Get order data for revision request page
     * Only allows COMPLETED orders with revisionCount < 4
     */
    getOrderForRevision: publicProcedure
        .input(
            z.object({
                orderId: z.string(),
                email: z.string().email(),
            })
        )
        .query(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    recipientName: true,
                    genre: true,
                    status: true,
                    orderType: true,
                    lyrics: true,
                    revisionCount: true,
                    revisionNotes: true,
                    locale: true,
                    backupWhatsApp: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    revisionHistory: true,
                    // Original customer input for revision reference
                    qualities: true,
                    memories: true,
                    message: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate email
            if (normalizeEmail(order.email) !== normalizeEmail(input.email)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Only COMPLETED orders can request revision
            if (order.status !== "COMPLETED") {
                // If already in revision, show specific message
                if (order.status === "REVISION") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "REVISION_ALREADY_REQUESTED",
                    });
                }
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Only completed orders can request revision",
                });
            }

            // Check revision limit (max 10)
            if (order.revisionCount >= 10) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Maximum revision limit reached",
                });
            }

            // Only MAIN, EXTRA_SONG, and GENRE_VARIANT orders can request revision
            if (order.orderType !== "MAIN" && order.orderType !== "EXTRA_SONG" && order.orderType !== "GENRE_VARIANT") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "This order type cannot request revision",
                });
            }

            const revisionHistory = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount })
                .map((entry) => ({
                    revisionNumber: entry.revisionNumber,
                    songFileUrl: typeof entry.songFileUrl === "string" ? entry.songFileUrl : null,
                    songFileUrl2: typeof entry.songFileUrl2 === "string" ? entry.songFileUrl2 : null,
                }));

            return {
                id: order.id,
                recipientName: order.recipientName,
                genre: order.genre,
                lyrics: order.lyrics,
                revisionCount: order.revisionCount,
                locale: order.locale,
                backupWhatsApp: order.backupWhatsApp,
                songFileUrl: order.songFileUrl,
                songFileUrl2: order.songFileUrl2,
                revisionHistory,
                // Original customer input for revision reference
                qualities: order.qualities,
                memories: order.memories,
                message: order.message,
            };
        }),

    /**
     * Submit a revision request
     * Changes status from COMPLETED to REVISION
     */
    requestRevision: publicProcedure
        .input(
            z.object({
                orderId: z.string(),
                email: z.string().email(),
                revisionNotes: z.string().min(10, "Please describe what needs to be fixed"),
                whatsapp: z.string().optional(),
                preferredSongVersion: z.enum(["1", "2"]).optional(),
                preferredSongChoiceLabel: z.string().min(1).max(200).optional(),
                preferredSongChoiceUrl: z.string().url().optional(),
                melodyPreference: z.enum(["KEEP_CURRENT", "SUGGEST_NEW"]).optional(),
                revisionAudioUrl: z.string().url().optional(),
                revisionAudioKey: z.string().min(1).max(512).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    status: true,
                    orderType: true,
                    revisionCount: true,
                    recipientName: true,
                    locale: true,
                    // Dados originais para classificação de responsabilidade
                    qualities: true,
                    memories: true,
                    message: true,
                    // Previous revision data to save to history
                    revisionNotes: true,
                    revisionRequestedAt: true,
                    revisionType: true,
                    revisionFault: true,
                    revisionFaultReason: true,
                    revisionCompletedBy: true,
                    revisionCompletedAt: true,
                    revisionAudioUrl: true,
                    revisionAudioKey: true,
                    revisionHistory: true,
                    melodyPreference: true,
                    // Song files to preserve in revision history
                    songFileUrl: true,
                    songFileUrl2: true,
                    songFileKey: true,
                    songFileKey2: true,
                    songUploadedAt: true,
                    songUploadedAt2: true,
                    songDeliveredAt: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate email
            if (normalizeEmail(order.email) !== normalizeEmail(input.email)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Only COMPLETED orders can request revision
            if (order.status !== "COMPLETED") {
                // If already in revision, show specific message
                if (order.status === "REVISION") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "REVISION_ALREADY_REQUESTED",
                    });
                }
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Only completed orders can request revision",
                });
            }

            // Check revision limit (max 10)
            if (order.revisionCount >= 10) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Maximum revision limit reached",
                });
            }

            // Only MAIN, EXTRA_SONG, and GENRE_VARIANT orders can request revision
            if (order.orderType !== "MAIN" && order.orderType !== "EXTRA_SONG" && order.orderType !== "GENRE_VARIANT") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "This order type cannot request revision",
                });
            }

            const hasRevisionAudioInput = !!input.revisionAudioUrl || !!input.revisionAudioKey;
            if (hasRevisionAudioInput) {
                if (!input.revisionAudioUrl || !input.revisionAudioKey) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Both revisionAudioUrl and revisionAudioKey must be provided together",
                    });
                }
                if (!input.revisionAudioKey.startsWith(`revisions/${input.orderId}/audio/`)) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid revision audio key for this order",
                    });
                }
            }

            const hasPreferredSongChoiceInput = !!input.preferredSongChoiceLabel || !!input.preferredSongChoiceUrl;
            if (hasPreferredSongChoiceInput) {
                if (!input.preferredSongChoiceLabel || !input.preferredSongChoiceUrl) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Both preferredSongChoiceLabel and preferredSongChoiceUrl must be provided together",
                    });
                }

                const allowedSongUrls = new Set<string>();
                if (order.songFileUrl) allowedSongUrls.add(order.songFileUrl);
                if (order.songFileUrl2) allowedSongUrls.add(order.songFileUrl2);
                const normalizedHistory = normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount });
                for (const entry of normalizedHistory) {
                    if (typeof entry.songFileUrl === "string") allowedSongUrls.add(entry.songFileUrl);
                    if (typeof entry.songFileUrl2 === "string") allowedSongUrls.add(entry.songFileUrl2);
                }

                if (!allowedSongUrls.has(input.preferredSongChoiceUrl)) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Preferred song choice URL is not part of this order history",
                    });
                }
            }

            // Update order: change status to REVISION, save notes, increment count
            // Include preferred song version in notes if provided
            const preferredChoiceHeader = hasPreferredSongChoiceInput
                ? `Versão preferida: ${input.preferredSongChoiceLabel!}\nURL da versão: ${input.preferredSongChoiceUrl!}`
                : input.preferredSongVersion
                    ? `Versão preferida: Opção ${input.preferredSongVersion}`
                    : null;
            const notesWithVersion = preferredChoiceHeader
                ? `${preferredChoiceHeader}\n\n${input.revisionNotes}`
                : input.revisionNotes;

            // Extract marked words from notes (format: "Words with errors in lyrics: word1, word2\n\n...")
            const markedWordsMatch = notesWithVersion.match(/Words with errors in lyrics:\s*([^\n]+)/i)
                || notesWithVersion.match(/Palavras com erros na letra:\s*([^\n]+)/i);
            const markedWords = markedWordsMatch?.[1]?.trim() || undefined;

            // Auto-classify revision type and fault using AI
            let revisionType: RevisionType | null = null;
            let revisionFault: RevisionFault | null = null;
            let revisionFaultReason: string | null = null;
            try {
                const classification = await classifyRevision({
                    revisionNotes: notesWithVersion,
                    recipientName: order.recipientName,
                    markedWords,
                    locale: order.locale,
                    // Dados originais para determinar responsabilidade
                    originalQualities: order.qualities,
                    originalMemories: order.memories,
                    originalMessage: order.message ?? undefined,
                });
                revisionType = classification.type;
                revisionFault = classification.fault;
                revisionFaultReason = classification.faultReason ?? null;
                console.log(`[Revision] Classified as ${revisionType} (${classification.confidence})`);
                console.log(`[Revision] Fault: ${revisionFault} - ${revisionFaultReason}`);
            } catch (err) {
                console.error("[Revision] Classification failed:", err);
                // Continue without classification
            }

            // Save snapshot of current songs to revision history
            // Entry N = songs that existed BEFORE revision N was requested
            // Entry 0 = originals, Entry 1 = songs after revision 1, etc.
            type RevisionHistoryEntry = {
                revisionNumber: number;
                requestedAt: Date | null;
                notes: string | null;
                type: string | null;
                fault: string | null;
                faultReason: string | null;
                melodyPreference: string | null;
                completedBy: string | null;
                completedAt: Date | null;
                revisionAudioUrl: string | null;
                revisionAudioKey: string | null;
                songFileUrl: string | null;
                songFileUrl2: string | null;
                songFileKey: string | null;
                songFileKey2: string | null;
                songUploadedAt: Date | null;
                songUploadedAt2: Date | null;
                songDeliveredAt: Date | null;
            };
            // Normalize to avoid collisions from older 1-based numbering (e.g. [1,2,2]).
            const existingHistory = (normalizeRevisionHistory(order.revisionHistory, { revisionCount: order.revisionCount }) as unknown as RevisionHistoryEntry[])
                // Safety: revisionHistory should only contain snapshots for 0..revisionCount-1
                .filter((e) => typeof e.revisionNumber === "number" && e.revisionNumber < order.revisionCount);
            // revisionNumber = current version being archived (before increment)
            const currentSnapshot: RevisionHistoryEntry = {
                revisionNumber: order.revisionCount,
                requestedAt: order.revisionRequestedAt,
                notes: order.revisionNotes,
                type: order.revisionType,
                fault: order.revisionFault,
                faultReason: order.revisionFaultReason,
                melodyPreference: order.melodyPreference,
                completedBy: order.revisionCompletedBy,
                completedAt: order.revisionCompletedAt,
                revisionAudioUrl: order.revisionAudioUrl,
                revisionAudioKey: order.revisionAudioKey,
                songFileUrl: order.songFileUrl,
                songFileUrl2: order.songFileUrl2,
                songFileKey: order.songFileKey,
                songFileKey2: order.songFileKey2,
                songUploadedAt: order.songUploadedAt,
                songUploadedAt2: order.songUploadedAt2,
                songDeliveredAt: order.songDeliveredAt,
            };
            const newHistory = normalizeRevisionHistory([...existingHistory, currentSnapshot]) as unknown as RevisionHistoryEntry[];

            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    status: "REVISION",
                    revisionNotes: notesWithVersion,
                    revisionRequestedAt: new Date(),
                    revisionCount: { increment: 1 },
                    revisionType: revisionType,
                    revisionFault: revisionFault,
                    revisionFaultReason: revisionFaultReason,
                    melodyPreference: input.melodyPreference ?? null,
                    revisionAudioUrl: hasRevisionAudioInput ? input.revisionAudioUrl! : null,
                    revisionAudioKey: hasRevisionAudioInput ? input.revisionAudioKey! : null,
                    // Save history (always — includes snapshot of current songs)
                    revisionHistory: newHistory,
                    revisionCompletedBy: null,
                    revisionCompletedAt: null,
                    ...(input.whatsapp && { backupWhatsApp: input.whatsapp }),
                },
                select: {
                    id: true,
                    status: true,
                    revisionCount: true,
                    revisionRequestedAt: true,
                    revisionType: true,
                    revisionFault: true,
                    revisionFaultReason: true,
                },
            });

            // Calculate queue position (count of REVISION orders requested before this one)
            const queuePosition = await ctx.db.songOrder.count({
                where: {
                    status: "REVISION",
                    revisionRequestedAt: {
                        lt: updatedOrder.revisionRequestedAt!,
                    },
                },
            });

            // TODO: Send confirmation email to customer

            // Send Telegram alert for revision request
            await sendRevisionRequestAlert({
                orderId: input.orderId,
                recipientName: order.recipientName,
                email: order.email,
                whatsapp: input.whatsapp ?? null,
                revisionNotes: notesWithVersion,
                revisionCount: updatedOrder.revisionCount,
                locale: order.locale,
                revisionType: updatedOrder.revisionType ?? undefined,
                revisionFault: updatedOrder.revisionFault ?? undefined,
                revisionFaultReason: updatedOrder.revisionFaultReason ?? undefined,
                melodyPreference: input.melodyPreference ?? undefined,
            });

            return {
                success: true,
                orderId: updatedOrder.id,
                status: updatedOrder.status,
                revisionCount: updatedOrder.revisionCount,
                queuePosition: queuePosition + 1, // 1-based position
            };
        }),

    /**
     * Append additional notes to an existing revision request
     * Allows customers to add more information after initial submission
     */
    appendRevisionNotes: publicProcedure
        .input(
            z.object({
                orderId: z.string(),
                email: z.string().email(),
                additionalNotes: z.string().min(1, "Please provide additional information"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    status: true,
                    revisionNotes: true,
                    recipientName: true,
                    locale: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate email
            if (normalizeEmail(order.email) !== normalizeEmail(input.email)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Only REVISION orders can have notes appended
            if (order.status !== "REVISION") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Only revision orders can have notes updated",
                });
            }

            // Append the new notes with a timestamp
            const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
            const updatedNotes = `${order.revisionNotes || ""}\n\n--- Adicionado em ${timestamp} ---\n${input.additionalNotes}`;

            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    revisionNotes: updatedNotes,
                },
                select: {
                    id: true,
                    revisionNotes: true,
                },
            });

            // Send Telegram alert for additional notes
            await sendRevisionRequestAlert({
                orderId: input.orderId,
                recipientName: order.recipientName,
                email: order.email,
                whatsapp: null,
                revisionNotes: `📝 NOTAS ADICIONAIS:\n${input.additionalNotes}`,
                revisionCount: 0, // Not a new revision, just additional notes
                locale: order.locale,
            });

            return {
                success: true,
                orderId: updatedOrder.id,
                revisionNotes: updatedOrder.revisionNotes,
            };
        }),

    /**
     * Cancel a revision request
     * Changes status from REVISION back to COMPLETED
     * Note: revisionCount is NOT decremented (counts as used)
     */
    cancelRevision: publicProcedure
        .input(
            z.object({
                orderId: z.string(),
                email: z.string().email(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    email: true,
                    status: true,
                    orderType: true,
                    revisionCount: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            // Validate email
            if (normalizeEmail(order.email) !== normalizeEmail(input.email)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Email does not match order",
                });
            }

            // Only REVISION orders can be cancelled
            if (order.status !== "REVISION") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Only revision orders can be cancelled",
                });
            }

            // Update order: change status back to COMPLETED, clear revision data
            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    status: "COMPLETED",
                    revisionNotes: null,
                    revisionRequestedAt: null,
                    revisionAudioUrl: null,
                    revisionAudioKey: null,
                    // Note: revisionCount is NOT decremented - it counts as a used revision
                },
                select: {
                    id: true,
                    status: true,
                    revisionCount: true,
                },
            });

            return {
                success: true,
                orderId: updatedOrder.id,
                status: updatedOrder.status,
                revisionCount: updatedOrder.revisionCount,
            };
        }),

    /**
     * Get streaming slots status for an order
     * Returns which song slots have streaming upsells already purchased
     */
    getStreamingSlotsStatus: publicProcedure
        .input(z.object({ orderId: z.string().cuid() }))
        .query(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    locale: true,
                    currency: true,
                },
            });

            if (!order) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }

            const hasTwoSongs = !!(order.songFileUrl && order.songFileUrl2);

            // Get existing streaming upsells (only PAID or later - PENDING doesn't count as purchased)
            const allUpsells = await ctx.db.songOrder.findMany({
                where: {
                    parentOrderId: order.id,
                    orderType: "STREAMING_UPSELL",
                    status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                },
                select: {
                    id: true,
                    status: true,
                    preferredSongForStreaming: true,
                },
            });

            // Determine which slots are purchased (only count PAID or later)
            const slot1Purchased = allUpsells.some(
                (u) => u.preferredSongForStreaming === order.songFileUrl
            );
            const slot2Purchased = hasTwoSongs && allUpsells.some(
                (u) => u.preferredSongForStreaming === order.songFileUrl2
            );

            // Calculate prices
            const getPrice = (isSecondSong: boolean) => {
                if (isSecondSong) {
                    return order.currency === "BRL"
                        ? PRICES.BRL.streamingUpsellSecond
                        : order.locale === "es"
                        ? PRICES.ES.streamingUpsellSecond
                        : order.currency === "EUR"
                        ? PRICES.EUR.streamingUpsellSecond
                        : PRICES.USD.streamingUpsellSecond;
                }
                return order.currency === "BRL"
                    ? PRICES.BRL.streamingUpsell
                    : order.locale === "es"
                    ? PRICES.ES.streamingUpsell
                    : order.currency === "EUR"
                    ? PRICES.EUR.streamingUpsell
                    : PRICES.USD.streamingUpsell;
            };

            const fullPrice = getPrice(false);
            const discountedPrice = getPrice(true);

            return {
                hasTwoSongs,
                slot1: {
                    songUrl: order.songFileUrl,
                    purchased: slot1Purchased,
                    // If slot2 is already purchased, this becomes second purchase
                    price: slot2Purchased ? discountedPrice : fullPrice,
                },
                slot2: hasTwoSongs ? {
                    songUrl: order.songFileUrl2,
                    purchased: slot2Purchased,
                    // If slot1 is already purchased, this becomes second purchase
                    price: slot1Purchased ? discountedPrice : fullPrice,
                } : null,
                bothPrice: fullPrice + discountedPrice,
                fullPrice,
                discountedPrice,
                discount: fullPrice - discountedPrice,
                currency: order.currency,
            };
        }),

    /**
     * Get streaming upsell data including parent order songs and lyrics
     * Used on the success page to show song selection UI
     */
    getStreamingUpsellData: publicProcedure
        .input(z.object({ orderId: z.string().cuid() }))
        .query(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    parentOrderId: true,
                    status: true,
                    streamingSongName: true,
                    preferredSongForStreaming: true,
                    backupWhatsApp: true,
                    honoreePhotoUrl: true,
                    honoreePhotoKey: true,
                    streamingCoverUrl: true,
                    streamingCoverKey: true,
                    coverApproved: true,
                    coverHumanReviewRequested: true,
                    coverHumanReviewRequestedAt: true,
                    recipientName: true,
                    genre: true,
                    locale: true,
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
                    message: "This endpoint is only for streaming upsell orders",
                });
            }

            if (!order.parentOrderId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Streaming upsell order must have a parent order",
                });
            }

            // Fetch parent order with songs and lyrics
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: order.parentOrderId },
                select: {
                    id: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                    lyrics: true,
                    recipientName: true,
                    genre: true,
                    qualities: true,
                    locale: true,
                    honoreePhotoUrl: true,
                },
            });

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            const siblingOrders = await ctx.db.songOrder.findMany({
                where: {
                    parentOrderId: order.parentOrderId,
                    orderType: "STREAMING_UPSELL",
                    id: { not: order.id },
                },
                select: {
                    id: true,
                    status: true,
                    streamingSongName: true,
                },
                orderBy: { createdAt: "asc" },
            });

            return {
                order: {
                    id: order.id,
                    status: order.status,
                    streamingSongName: order.streamingSongName,
                    preferredSongForStreaming: order.preferredSongForStreaming,
                    backupWhatsApp: order.backupWhatsApp,
                    honoreePhotoUrl: order.honoreePhotoUrl,
                    honoreePhotoKey: order.honoreePhotoKey,
                    streamingCoverUrl: order.streamingCoverUrl,
                    streamingCoverKey: order.streamingCoverKey,
                    coverApproved: order.coverApproved,
                    coverHumanReviewRequested: order.coverHumanReviewRequested,
                    coverHumanReviewRequestedAt: order.coverHumanReviewRequestedAt,
                    recipientName: order.recipientName,
                    genre: order.genre,
                    locale: order.locale,
                },
                parentOrder: {
                    id: parentOrder.id,
                    songFileUrl: parentOrder.songFileUrl,
                    songFileUrl2: parentOrder.songFileUrl2,
                    lyrics: parentOrder.lyrics,
                    recipientName: parentOrder.recipientName,
                    genre: parentOrder.genre,
                    qualities: parentOrder.qualities,
                    locale: parentOrder.locale,
                    honoreePhotoUrl: parentOrder.honoreePhotoUrl,
                },
                siblingOrders,
            };
        }),

    /**
     * Generate song name suggestions for streaming upsell
     * Calls OpenRouter AI to generate 5 name options based on lyrics
     */
    generateSongNamesForUser: publicProcedure
        .input(z.object({ orderId: z.string().cuid() }))
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    parentOrderId: true,
                    recipientName: true,
                    genre: true,
                    locale: true,
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
                    message: "This endpoint is only for streaming upsell orders",
                });
            }

            if (!order.parentOrderId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Streaming upsell order must have a parent order",
                });
            }

            // Fetch parent order lyrics
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: order.parentOrderId },
                select: {
                    lyrics: true,
                    recipientName: true,
                    genre: true,
                },
            });

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            if (!parentOrder.lyrics) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Parent order does not have lyrics yet",
                });
            }

            // Generate song name suggestions using the existing function
            const suggestions = await generateSongNameSuggestions({
                lyrics: parentOrder.lyrics,
                recipientName: parentOrder.recipientName ?? order.recipientName,
                genre: parentOrder.genre ?? order.genre,
                locale: order.locale ?? "en",
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

            // Remove duplicates (normalized) and avoid suggestions already used by active streaming orders.
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

            const filteredSuggestions = uniqueSuggestions;
            if (filteredSuggestions.length > 0) {
                return { suggestions: filteredSuggestions };
            }

            const localeSuffix =
                order.locale === "pt"
                    ? "Versão"
                    : order.locale === "es"
                    ? "Versión"
                    : order.locale === "fr"
                    ? "Version"
                    : order.locale === "it"
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
     * Save user's streaming choices (song name, preferred version, WhatsApp, and honoree photo)
     * Called from the success page after user selects options
     */
    saveStreamingChoices: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                songName: z.string().min(1).max(100),
                preferredSongUrl: z.string().url().optional(),
                backupWhatsApp: z.string().min(10).max(20),
                honoreePhotoUrl: z.string().url().optional(),
                honoreePhotoKey: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    status: true,
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
                    message: "This endpoint is only for streaming upsell orders",
                });
            }

            const songName = input.songName.replace(/\s+/g, " ").trim();
            if (!songName) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Nome da música é obrigatório",
                });
            }

            const existingStreamingOrders = await ctx.db.songOrder.findMany({
                where: {
                    orderType: "STREAMING_UPSELL",
                    id: { not: order.id },
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
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message:
                        "Este nome de música já está em uso em outro pedido Streaming VIP. Escolha um nome diferente para publicar no DistroKid.",
                });
            }

            // Update the streaming upsell order with user's choices
            // Note: Status stays PAID until admin manually changes to IN_PROGRESS when sending to DistroKid
            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    streamingSongName: songName,
                    preferredSongForStreaming: input.preferredSongUrl,
                    backupWhatsApp: input.backupWhatsApp,
                    honoreePhotoUrl: input.honoreePhotoUrl,
                    honoreePhotoKey: input.honoreePhotoKey,
                },
                select: {
                    id: true,
                    streamingSongName: true,
                    preferredSongForStreaming: true,
                    backupWhatsApp: true,
                    honoreePhotoUrl: true,
                    status: true,
                },
            });

            return {
                success: true,
                orderId: updatedOrder.id,
                songName: updatedOrder.streamingSongName,
                preferredSongUrl: updatedOrder.preferredSongForStreaming,
                backupWhatsApp: updatedOrder.backupWhatsApp,
                honoreePhotoUrl: updatedOrder.honoreePhotoUrl,
                status: updatedOrder.status,
            };
        }),

    /**
     * Generate the automatic customer cover after all streaming choices are confirmed
     * One attempt only: if a cover already exists, returns the existing cover instead of regenerating.
     */
    generateAutoCoverForCustomer: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                style: z.enum(["realistic", "cartoon"]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    status: true,
                    streamingSongName: true,
                    preferredSongForStreaming: true,
                    backupWhatsApp: true,
                    honoreePhotoUrl: true,
                    streamingCoverUrl: true,
                    streamingCoverKey: true,
                    coverApproved: true,
                    coverHumanReviewRequested: true,
                    coverHumanReviewRequestedAt: true,
                    parentOrder: {
                        select: {
                            recipientName: true,
                            genre: true,
                            qualities: true,
                            honoreePhotoUrl: true,
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

            if (order.orderType !== "STREAMING_UPSELL") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "This endpoint is only for streaming upsell orders",
                });
            }

            if (order.status === "PENDING") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Order must be paid before generating cover",
                });
            }

            if (!order.streamingSongName) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Nome da música ainda não foi definido",
                });
            }

            if (!order.preferredSongForStreaming) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Versão da música ainda não foi selecionada",
                });
            }

            if (!isLikelyValidWhatsApp(order.backupWhatsApp)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "WhatsApp de contato inválido ou ausente",
                });
            }

            const honoreePhotoUrl = order.honoreePhotoUrl || order.parentOrder?.honoreePhotoUrl;
            if (!honoreePhotoUrl) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Pedido não tem foto do homenageado",
                });
            }

            if (order.streamingCoverUrl) {
                return {
                    success: true,
                    generated: false,
                    style: input.style,
                    url: withCacheBust(order.streamingCoverUrl),
                    key: order.streamingCoverKey ?? null,
                    coverApproved: order.coverApproved,
                    coverHumanReviewRequested: order.coverHumanReviewRequested,
                    coverHumanReviewRequestedAt: order.coverHumanReviewRequestedAt,
                    readyForDistroKid: isStreamingVipReadyForDistroKid({
                        status: order.status,
                        streamingSongName: order.streamingSongName,
                        preferredSongForStreaming: order.preferredSongForStreaming,
                        streamingCoverUrl: order.streamingCoverUrl,
                        coverApproved: order.coverApproved,
                    }),
                };
            }

            const prompt = buildFixedCustomerCoverPrompt({
                style: input.style,
                songName: order.streamingSongName,
                recipientName: order.parentOrder?.recipientName || order.streamingSongName,
                genre: order.parentOrder?.genre || "",
                qualities: order.parentOrder?.qualities || "",
            });

            const generatedCover = await generateStreamingCoverImageFromPrompt({
                orderId: order.id,
                honoreePhotoUrl,
                prompt,
                style: input.style,
            });

            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    streamingCoverUrl: generatedCover.url,
                    streamingCoverKey: generatedCover.key,
                    coverApproved: false,
                    coverHumanReviewRequested: false,
                    coverHumanReviewRequestedAt: null,
                },
                select: {
                    status: true,
                    streamingSongName: true,
                    preferredSongForStreaming: true,
                    streamingCoverUrl: true,
                    coverApproved: true,
                    coverHumanReviewRequested: true,
                    coverHumanReviewRequestedAt: true,
                },
            });

            return {
                success: true,
                generated: true,
                style: input.style,
                url: withCacheBust(generatedCover.url),
                key: generatedCover.key,
                coverApproved: updated.coverApproved,
                coverHumanReviewRequested: updated.coverHumanReviewRequested,
                coverHumanReviewRequestedAt: updated.coverHumanReviewRequestedAt,
                readyForDistroKid: isStreamingVipReadyForDistroKid({
                    status: updated.status,
                    streamingSongName: updated.streamingSongName,
                    preferredSongForStreaming: updated.preferredSongForStreaming,
                    streamingCoverUrl: updated.streamingCoverUrl,
                    coverApproved: updated.coverApproved,
                }),
            };
        }),

    /**
     * Get a presigned URL for uploading preview photos used by the streaming debug flow.
     * Does not require a real order id.
     */
    getStreamingPreviewPhotoUploadUrl: publicProcedure
        .input(
            z.object({
                fileName: z.string(),
            })
        )
        .mutation(async ({ input }) => {
            const sanitizedFileName = input.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
            const key = `honoree-photos/preview/${Date.now()}-${nanoid(8)}-${sanitizedFileName}`;

            const extension = input.fileName.split(".").pop()?.toLowerCase();
            const contentTypeMap: Record<string, string> = {
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                webp: "image/webp",
            };
            const contentType = contentTypeMap[extension ?? ""] ?? "image/jpeg";

            const uploadUrl = await StorageService.getUploadUrl(key, contentType);
            const domain = env.R2_PUBLIC_DOMAIN?.replace(/^(https?[:/]+)/, "") ?? "";
            const publicUrl = `https://${domain}/${key}`;

            return {
                uploadUrl,
                publicUrl,
                key,
            };
        }),

    /**
     * Generate a real AI cover from preview mode (`preview=true&previewRealCover=1`)
     * without mutating any real order.
     */
    generateStreamingPreviewCover: publicProcedure
        .input(
            z.object({
                photoUrl: z.string().url(),
                style: z.enum(["realistic", "cartoon"]),
                songName: z.string().min(1).max(100).optional(),
                recipientName: z.string().min(1).max(120).optional(),
                genre: z.string().min(1).max(80).optional(),
                locale: z.string().min(2).max(8).optional(),
                qualities: z.string().max(500).optional(),
                lyrics: z.string().max(5000).optional(),
            })
        )
        .mutation(async ({ input }) => {
            const recipientName = input.recipientName?.trim() || "Pessoa homenageada";
            const genre = input.genre?.trim() || "pop";
            const qualities = input.qualities?.trim() || "amor, gratidão, celebração";
            const songName = input.songName?.trim() || `${recipientName} - Homenagem Especial`;
            const prompt = buildFixedCustomerCoverPrompt({
                style: input.style,
                songName,
                recipientName,
                genre,
                qualities,
            });

            const previewId = `preview-${nanoid(12)}`;
            const generatedCover = await generateStreamingCoverImageFromPrompt({
                orderId: previewId,
                honoreePhotoUrl: input.photoUrl,
                prompt,
                style: input.style,
            });

            return {
                success: true,
                style: input.style,
                url: withCacheBust(generatedCover.url),
                key: generatedCover.key,
            };
        }),

    /**
     * Persist customer decision for auto-generated cover (approve or request human review)
     */
    submitAutoCoverDecision: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                decision: z.enum(["approve", "human_review"]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    status: true,
                    streamingSongName: true,
                    preferredSongForStreaming: true,
                    streamingCoverUrl: true,
                    coverApproved: true,
                    coverHumanReviewRequested: true,
                    coverHumanReviewRequestedAt: true,
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
                    message: "This endpoint is only for streaming upsell orders",
                });
            }

            if (!order.streamingCoverUrl) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Capa ainda não foi gerada",
                });
            }

            const approved = input.decision === "approve";
            const updated = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    coverApproved: approved,
                    coverHumanReviewRequested: !approved,
                    coverHumanReviewRequestedAt: approved ? null : new Date(),
                },
                select: {
                    status: true,
                    streamingSongName: true,
                    preferredSongForStreaming: true,
                    streamingCoverUrl: true,
                    coverApproved: true,
                    coverHumanReviewRequested: true,
                    coverHumanReviewRequestedAt: true,
                },
            });

            return {
                success: true,
                decision: input.decision,
                coverApproved: updated.coverApproved,
                coverHumanReviewRequested: updated.coverHumanReviewRequested,
                coverHumanReviewRequestedAt: updated.coverHumanReviewRequestedAt,
                readyForDistroKid: isStreamingVipReadyForDistroKid({
                    status: updated.status,
                    streamingSongName: updated.streamingSongName,
                    preferredSongForStreaming: updated.preferredSongForStreaming,
                    streamingCoverUrl: updated.streamingCoverUrl,
                    coverApproved: updated.coverApproved,
                }),
            };
        }),

    /**
     * Select which song version to use for streaming distribution
     * Called from success page when user bought 1 song but has 2 options
     */
    selectPreferredSongForStreaming: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                preferredSongUrl: z.string().url(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Get the streaming upsell order
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
                    status: true,
                    preferredSongForStreaming: true,
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
                    message: "This endpoint is only for streaming upsell orders",
                });
            }

            // Only allow selection if preferredSongForStreaming is null
            if (order.preferredSongForStreaming !== null) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Song version has already been selected",
                });
            }

            // Get parent order to validate the URL is one of the songs
            const parentOrder = await ctx.db.songOrder.findUnique({
                where: { id: order.parentOrderId! },
                select: {
                    songFileUrl: true,
                    songFileUrl2: true,
                },
            });

            if (!parentOrder) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Parent order not found",
                });
            }

            // Validate URL is one of the available songs
            const validUrls = [parentOrder.songFileUrl, parentOrder.songFileUrl2].filter(Boolean);
            if (!validUrls.includes(input.preferredSongUrl)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Invalid song URL. Must be one of the available song versions.",
                });
            }

            // Update the order with the selected song
            const updatedOrder = await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    preferredSongForStreaming: input.preferredSongUrl,
                },
                select: {
                    id: true,
                    preferredSongForStreaming: true,
                },
            });

            return {
                success: true,
                orderId: updatedOrder.id,
                preferredSongUrl: updatedOrder.preferredSongForStreaming,
            };
        }),

    /**
     * Get a presigned URL for uploading the honoree photo
     * Called from the success page when user selects a photo
     */
    getHonoreePhotoUploadUrl: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                fileName: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: {
                    id: true,
                    orderType: true,
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
                    message: "This endpoint is only for streaming upsell orders",
                });
            }

            // Generate unique key: honoree-photos/{orderId}/{timestamp}-{sanitizedFileName}
            const sanitizedFileName = input.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
            const key = `honoree-photos/${input.orderId}/${Date.now()}-${sanitizedFileName}`;

            // Determine content type from file extension
            const extension = input.fileName.split(".").pop()?.toLowerCase();
            const contentTypeMap: Record<string, string> = {
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                webp: "image/webp",
            };
            const contentType = contentTypeMap[extension ?? ""] ?? "image/jpeg";

            const uploadUrl = await StorageService.getUploadUrl(key, contentType);
            // Handle R2_PUBLIC_DOMAIN with or without https:// prefix
            const domain = env.R2_PUBLIC_DOMAIN?.replace(/^(https?[:/]+)/, "") ?? "";
            const publicUrl = `https://${domain}/${key}`;

            return {
                uploadUrl,
                publicUrl,
                key,
            };
        }),

    /**
     * Update the custom song name for the lyrics PDF.
     * Clears cached PDFs and enqueues regeneration.
     */
    updateLyricsPdfSongName: publicProcedure
        .input(
            z.object({
                orderId: z.string().cuid(),
                email: z.string().email(),
                songName: z.string().max(100).trim(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const order = await ctx.db.songOrder.findUnique({
                where: { id: input.orderId },
                select: { email: true, status: true },
            });

            if (!order) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
            }

            if (normalizeEmail(order.email) !== normalizeEmail(input.email)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Email mismatch" });
            }

            if (order.status !== "COMPLETED") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Order not completed" });
            }

            await ctx.db.songOrder.update({
                where: { id: input.orderId },
                data: {
                    lyricsPdfSongName: input.songName || null,
                    lyricsPdfA4Url: null,
                    lyricsPdfA3Url: null,
                    lyricsPdfGeneratedAt: null,
                },
            });

            await enqueuePdfGeneration(input.orderId, "high");

            return { success: true };
        }),
});
