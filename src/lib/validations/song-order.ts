import { z } from "zod";
import { normalizeEmail } from "~/lib/normalize-email";

// BRL Plan types
export const brlPlanTypes = ["essencial", "express", "acelerado"] as const;

// Enum values matching the quiz options
export const recipientTypes = [
    "husband",
    "wife",
    "boyfriend",
    "girlfriend",
    "children",
    "father",
    "mother",
    "sibling",
    "friend",
    "myself",
    "group",
    "other",
] as const;

export const genreTypes = [
    // Universal genres
    "pop",
    "country",
    "rock",
    "rnb",
    "jazz",
    "blues",
    "blues-melancholic",
    "blues-upbeat",
    "worship",
    "hiphop",
    "reggae",
    "lullaby",
    "lullaby-ninar",
    "lullaby-animada",
    // Brazilian genres (PT)
    "funk",
    "funk-carioca",
    "funk-paulista",
    "funk-melody",
    "brega",
    "brega-romantico",
    "tecnobrega",
    "samba",
    "pagode",
    "pagode-de-mesa",
    "pagode-romantico",
    "pagode-universitario",
    "forro",
    "forro-pe-de-serra-rapido", // Tradicional, dançante, animado
    "forro-pe-de-serra-lento", // Contemplativo, nostálgico, 70-85 BPM
    "forro-universitario",
    "forro-eletronico",
    "sertanejo-raiz",
    "sertanejo-universitario",
    "sertanejo-romantico",
    "rock-classico",
    "pop-rock-brasileiro",
    "heavy-metal",
    "axe",
    "capoeira",
    "mpb",
    "bossa",
    "mpb-bossa-nova",
    "mpb-cancao-brasileira",
    "mpb-pop",
    "mpb-intimista",
    "jovem-guarda",
    "musica-classica",
    "valsa",
    "eletronica",
    "eletronica-afro-house",
    "eletronica-progressive-house",
    "eletronica-melodic-techno",
    "latina",
    "bolero",
    // Latin genres (ES)
    "salsa",
    "merengue",
    "bachata",
    "cumbia",
    "ranchera",
    "balada",
    "tango",
    // French genres (FR)
    "chanson",
    "variete",
    // Spanish worship (ES)
    "adoracion",
    // Italian genres (IT)
    "tarantella",
    "napoletana",
    "lirico",
] as const;

export const vocalTypes = ["female", "male", "either"] as const;

// Quiz data schema (from the form)
export const quizDataSchema = z
    .object({
        recipient: z.enum(recipientTypes),
        name: z.string().max(100).default(""),
        relationship: z.string().max(100).optional().default(""), // Custom relationship when recipient is "other"
        genre: z.enum(genreTypes),
        vocals: z.enum(vocalTypes).default("either"),
        qualities: z
            .string()
            .min(10, "Please describe at least a few qualities"),
        memories: z
            .string()
            .refine(
                (val) => val.trim() === "" || val.trim().length >= 10,
                { message: "Please share at least one memory (10+ characters)" }
            ),
        message: z.string().optional().default(""),
        email: z
            .string()
            .transform(normalizeEmail)
            .pipe(z.string().email("Please enter a valid email address")),
        whatsapp: z.string().optional().default(""),
    })
    .refine(
        (data) => {
            // Name is required unless recipient is "group"
            if (data.recipient !== "group") {
                return data.name && data.name.trim().length > 0;
            }
            return true;
        },
        { message: "Name is required", path: ["name"] }
    );

// Browser/device info schema (collected client-side)
export const browserInfoSchema = z.object({
    userAgent: z.string().optional(),
    browserName: z.string().optional(),
    browserVersion: z.string().optional(),
    osName: z.string().optional(),
    osVersion: z.string().optional(),
    deviceType: z.enum(["desktop", "mobile", "tablet"]).optional(),
    screenWidth: z.number().int().positive().optional(),
    screenHeight: z.number().int().positive().optional(),
    viewportWidth: z.number().int().positive().optional(),
    viewportHeight: z.number().int().positive().optional(),
    colorDepth: z.number().int().positive().optional(),
    pixelRatio: z.number().positive().optional(),
    touchSupport: z.boolean().optional(),
    language: z.string().optional(),
    languages: z.array(z.string()).optional(),
    timezone: z.string().optional(),
    timezoneOffset: z.number().int().optional(),
});

// Traffic source schema (UTM params, referrer)
export const trafficSourceSchema = z.object({
    referrer: z.string().optional(),
    referrerDomain: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmTerm: z.string().optional(),
    utmContent: z.string().optional(),
    fbc: z.string().optional(),
    fbp: z.string().optional(),
    landingPage: z.string().optional(),
    abHeadlineVariant: z.enum(["A", "B"]).optional(),
});

// Session analytics schema
export const sessionAnalyticsSchema = z.object({
    sessionId: z.string().optional(),
    pageViewCount: z.number().int().nonnegative().optional(),
    timeOnSiteMs: z.number().int().nonnegative().optional(),
    quizStartedAt: z.string().datetime().optional(),
    quizCompletedAt: z.string().datetime().optional(),
    quizDurationMs: z.number().int().nonnegative().optional(),
});

// Order bump extra song data schema (always for a different person)
export const orderBumpExtraSongSchema = z
    .object({
        sameRecipient: z.boolean(),
        recipientName: z.string().min(1).max(100).optional(),
        recipient: z.enum(recipientTypes).optional(),
        qualities: z.string().min(10).optional(),
        genre: z.enum(genreTypes).optional(),
        vocals: z.enum(vocalTypes).optional(),
    })
    .refine(
        (data) => {
            // Extra song is always for a different person, require all fields
            if (!data.sameRecipient) {
                return data.recipientName && data.recipient && data.qualities && data.genre && data.vocals;
            }
            return true;
        },
        { message: "All fields required for extra song" }
    );

// Order bump selection schema
export const orderBumpSelectionSchema = z.object({
    fastDelivery: z.boolean().default(false),
    extraSong: z.boolean().default(false),
    extraSongData: orderBumpExtraSongSchema.optional().nullable(),
    // Genre variants: new lyrics for a different musical style
    genreVariants: z.array(z.enum(genreTypes)).default([]),
    // Certificate of authorship: personalized page with QR code + PDF
    certificate: z.boolean().default(false),
    // Lyrics PDF: complete lyrics in a stylized PDF
    lyrics: z.boolean().default(false),
});

// Complete input schema for the create procedure
export const createSongOrderInputSchema = z.object({
    // Core quiz data
    quizData: quizDataSchema,

    // Locale info
    locale: z.enum(["en", "pt", "es", "fr", "it"]).default("en"),
    currency: z.enum(["USD", "BRL", "EUR"]).default("USD"),

    // BRL plan selection (only used for BRL currency)
    planType: z.enum(brlPlanTypes).optional(),

    // Analytics data (all optional)
    browserInfo: browserInfoSchema.optional(),
    trafficSource: trafficSourceSchema.optional(),
    sessionAnalytics: sessionAnalyticsSchema.optional(),

    // Order bump selections (optional)
    orderBumps: orderBumpSelectionSchema.optional(),

    // Optional coupon code applied at checkout
    couponCode: z
        .string()
        .trim()
        .min(3)
        .max(32)
        .regex(/^[A-Za-z0-9_-]+$/)
        .optional(),
});

// Type exports
export type BRLPlanType = (typeof brlPlanTypes)[number];
export type QuizData = z.infer<typeof quizDataSchema>;
export type BrowserInfo = z.infer<typeof browserInfoSchema>;
export type TrafficSource = z.infer<typeof trafficSourceSchema>;
export type SessionAnalytics = z.infer<typeof sessionAnalyticsSchema>;
export type OrderBumpExtraSong = z.infer<typeof orderBumpExtraSongSchema>;
export type OrderBumpSelection = z.infer<typeof orderBumpSelectionSchema>;
export type CreateSongOrderInput = z.infer<typeof createSongOrderInputSchema>;
