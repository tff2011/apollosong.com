import "dotenv/config";

import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { type Prisma } from "@prisma/client";
import IORedis from "ioredis";
import path from "path";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { Readable } from "stream";
import { Worker, Queue } from "bullmq";
import ffmpegStaticPath from "ffmpeg-static";
import { fromZonedTime, formatInTimeZone, toZonedTime } from "date-fns-tz";
import { db } from "../db";

import QRCode from "qrcode";
import {
    stripLyricsTags,
    generateFrameableLyricsHtml,
    generatePdfFromHtml,
    type PaperSize,
} from "../../lib/frameable-pdf";
import { StorageService } from "../../lib/storage";
import { buildAutoDeliveryEmail } from "../email/auto-delivery";
import { buildStreamingVipReadyEmail } from "../email/streaming-vip-ready";
import { DistroKidAutomation } from "../services/distrokid/automation";
import { DISTROKID_DOWNLOADS_DIR } from "../services/distrokid/paths";
import { getUnsubscribeUrl } from "../../lib/email-unsubscribe";
import {
    findBestSpotifyTrackMatch,
    isSpotifyApiConfigured,
    isSpotifyRateLimitError,
} from "../services/spotify/client";
import { normalizeEmail } from "../../lib/normalize-email";
import { enqueueOrderReminders } from "../queues/order-reminders";
import { enqueuePdfGeneration } from "../queues/pdf-generation";
import { initMailer, sendEmail as sendEmailCentral } from "../email/mailer-core";
import type { WhatsAppAdminOrderSongsJob } from "../queues/whatsapp-admin-order-songs";
import type { WhatsAppAdminOutboundJob } from "../queues/whatsapp-admin-outbound";
import type { WhatsAppAdminVoiceNoteJob } from "../queues/whatsapp-admin-voice-note";

// Import shared constants and types from the lib
import {
    GENRE_NAMES,
    GENRE_INSTRUCTIONS,
    RELATIONSHIP_NAMES,
    RELATIONSHIP_CONTEXT,
    type LyricsInput,
    type SupportedLocale,
    getLocale,
    generateLyrics as generateLyricsWithRules,
} from "../../lib/lyrics-generator";
import { getSunoStylePrompt } from "../services/suno/genre-mapping";

// ============= SHARED CONFIG =============
const REDIS_URL = process.env.REDIS_URL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview";
const OPENROUTER_SUPPORT_MODEL = process.env.OPENROUTER_SUPPORT_MODEL || "openai/gpt-4.1-mini";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";

const SMTP_HOST = process.env.SMTP_HOST!;
const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD!;
const SMTP_FROM = process.env.SMTP_FROM!;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const STREAMING_SONG_NAME_STOP_WORDS = new Set([
    "a", "o", "as", "os", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "pra", "pro", "com", "sem",
    "the", "an", "and", "of", "for", "to", "in", "on", "with", "from", "my", "your", "our",
    "del", "la", "las", "el", "los", "y", "mi", "tu", "su",
    "du", "des", "le", "les", "pour", "avec", "sans", "mon", "ma", "mes", "ton", "ta", "tes",
    "di", "della", "delle", "dello", "il", "lo", "gli", "per", "senza", "mio", "mia", "tuo", "tua", "uno",
]);

// Validate required environment variables
if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
}
if (!OPENROUTER_API_KEY) {
    console.warn("WARNING: OPENROUTER_API_KEY not set - lyrics generation will fail");
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

// ============= SHARED INSTANCES =============
// ============= SHARED INSTANCES =============
// db imported from ../db
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Initialize central mailer for workers
initMailer({
    smtpHost: SMTP_HOST,
    smtpPort: 587,
    smtpSecure: SMTP_SECURE,
    smtpUser: SMTP_USER,
    smtpPassword: SMTP_PASSWORD,
    smtpFrom: SMTP_FROM,
});

// ============================================================================
// ORDER REMINDERS WORKER
// ============================================================================

const ORDER_REMINDERS_QUEUE = "order-reminders";

type ReminderStage = "15m" | "3d" | "7d";

type OrderReminderJob = {
    orderId: string;
    stage: ReminderStage;
};

type EmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    paragraphs: string[];
    cta: string;
    signoff: string;
};

type CopyParams = {
    recipientName: string;
    price: string;
};

const PT_COPY: Record<ReminderStage, (params: CopyParams) => EmailTemplate> = {
    "15m": ({ recipientName, price }) => ({
        subject: `Sua canção para ${recipientName} está quase pronta`,
        preheader: "Sua história continua guardada aqui.",
        headline: "Posso finalizar sua canção agora?",
        paragraphs: [
            `Oi! Vi que você começou a criar uma canção personalizada para ${recipientName}.`,
            "Sua história já está guardada e pronta para virar música. Falta só confirmar o pedido.",
            `Em poucos minutos você conclui, e eu começo a compor algo único. O valor segue ${price}.`,
            "Se não for o momento, tudo bem. Mas se essa homenagem ainda está no seu coração, eu estou pronta para transformar isso em música.",
        ],
        cta: "Finalizar meu pedido",
        signoff: "Com carinho, equipe Apollo Song",
    }),
    "3d": ({ recipientName, price }) => ({
        subject: `Sua história ainda pode virar música para ${recipientName}`,
        preheader: "Ainda dá tempo de entregar esse presente.",
        headline: "Sua história merece virar uma canção",
        paragraphs: [
            `Ainda guardamos sua canção para ${recipientName}.`,
            "Quando você confirmar o pedido, nós começamos a compor e dar vida a esse momento especial.",
            `É uma homenagem linda, emocional e feita sob medida. O valor é ${price}, com garantia total.`,
            "Se quiser continuar, é só clicar abaixo. Se já concluiu o pagamento, pode ignorar este email.",
        ],
        cta: "Continuar meu pedido",
        signoff: "Com carinho, equipe Apollo Song",
    }),
    "7d": ({ recipientName, price }) => ({
        subject: `Ainda quer sua canção personalizada para ${recipientName}?`,
        preheader: "Último lembrete antes de arquivarmos seu pedido.",
        headline: "Eu ainda posso compor sua canção",
        paragraphs: [
            `Seu pedido para ${recipientName} continua salvo aqui.`,
            "Se esse presente ainda faz sentido, estou pronta para transformar sua história em música.",
            `Basta finalizar o pedido e eu começo a criar. O valor continua ${price}.`,
            "Se não for a hora certa, tudo bem. Mas se quiser seguir, este é o caminho mais rápido para emocionar quem você ama.",
        ],
        cta: "Finalizar agora",
        signoff: "Com carinho, equipe Apollo Song",
    }),
};

const EN_COPY: Record<ReminderStage, (params: CopyParams) => EmailTemplate> = {
    "15m": ({ recipientName, price }) => ({
        subject: `Your song for ${recipientName} is waiting`,
        preheader: "Your story is still saved with us.",
        headline: "Want me to finish your song now?",
        paragraphs: [
            `Hi! I saw you started creating a custom song for ${recipientName}.`,
            "Your story is already saved and ready to become music. All that's left is to confirm the order.",
            `It takes just a few minutes to complete, and I will start composing right away. The total is ${price}.`,
            "If now isn't the right moment, no worries. But if this gift is still on your heart, I'm ready to turn it into a song.",
        ],
        cta: "Finish my order",
        signoff: "With care, the ApolloSong team",
    }),
    "3d": ({ recipientName, price }) => ({
        subject: `Your story can still become music for ${recipientName}`,
        preheader: "It's not too late to finish this gift.",
        headline: "Your story deserves a song",
        paragraphs: [
            `We still have your song saved for ${recipientName}.`,
            "Once you confirm the order, we begin composing and bringing this moment to life.",
            `It's a beautiful, emotional, custom-made gift. The total is ${price}, with a full guarantee.`,
            "If you want to continue, just click below. If you already paid, please ignore this email.",
        ],
        cta: "Continue my order",
        signoff: "With care, the ApolloSong team",
    }),
    "7d": ({ recipientName, price }) => ({
        subject: `Still want your custom song for ${recipientName}?`,
        preheader: "One last reminder before we archive your order.",
        headline: "I can still write your song",
        paragraphs: [
            `Your request for ${recipientName} is still saved here.`,
            "If this gift still feels right, I'm ready to turn your story into music.",
            `Just finish the order and I will start composing. The total is ${price}.`,
            "If it's not the right time, that's okay. But if you want to move forward, this is the fastest way to bless someone you love.",
        ],
        cta: "Finish now",
        signoff: "With care, the ApolloSong team",
    }),
};

function formatPrice(price: number, currency: string, locale: "pt" | "en") {
    try {
        return new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", {
            style: "currency",
            currency,
        }).format(price);
    } catch {
        return locale === "pt" ? `R$${price}` : `$${price}`;
    }
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildAbandonedOrderEmail(
    stage: ReminderStage,
    data: {
        orderId: string;
        customerEmail: string;
        recipientName?: string | null;
        locale?: string | null;
        price: number;
        currency: string;
        checkoutUrl: string;
        priceMode?: "exact" | "startingFrom";
    }
) {
    const locale = data.locale === "pt" ? "pt" : "en";
    const recipientName = data.recipientName?.trim() || (locale === "pt" ? "alguém especial" : "someone special");
    const formattedPrice = formatPrice(data.price, data.currency, locale);

    const template = (locale === "pt" ? PT_COPY : EN_COPY)[stage]({
        recipientName,
        price: formattedPrice,
    });

    if (data.priceMode === "startingFrom") {
        if (locale === "pt") {
            if (stage === "15m") {
                template.paragraphs[2] = `Em poucos minutos você conclui, e eu começo a compor algo único. Planos a partir de ${formattedPrice}.`;
            } else if (stage === "3d") {
                template.paragraphs[2] = `É uma homenagem linda, emocional e feita sob medida. Planos a partir de ${formattedPrice}, com garantia total.`;
            } else {
                template.paragraphs[2] = `Basta finalizar o pedido e eu começo a criar. Planos a partir de ${formattedPrice}.`;
            }
        } else {
            if (stage === "15m") {
                template.paragraphs[2] = `It takes just a few minutes to complete, and I will start composing right away. Plans start at ${formattedPrice}.`;
            } else if (stage === "3d") {
                template.paragraphs[2] = `It's a beautiful, emotional, custom-made gift. Plans start at ${formattedPrice}, with a full guarantee.`;
            } else {
                template.paragraphs[2] = `Just finish the order and I will start composing. Plans start at ${formattedPrice}.`;
            }
        }
    }

    const safeCheckoutUrl = escapeHtml(data.checkoutUrl);

    const htmlParagraphs = template.paragraphs
        .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.6;color:#2b2b2b;">${escapeHtml(paragraph)}</p>`)
        .join("");

    const orderLabel = locale === "pt" ? "Pedido" : "Order ID";
    const brandName = locale === "pt" ? "Apollo Song" : "ApolloSong";
    const subBrandText = locale === "pt" ? "por Apollo Song" : ""; // Empty for English
    const addressText = locale === "pt"
        ? "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil"
        : "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil";
    const unsubscribeText = locale === "pt" ? "Não deseja mais receber emails?" : "Don't want to receive emails?";
    const unsubscribeAction = locale === "pt" ? "Clique aqui" : "Click here";
    const unsubscribeUrl = getUnsubscribeUrl(data.customerEmail, locale);

    const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(template.subject)}</title>
  </head>
  <body style="margin:0;background:#f8f5f0;font-family:Arial, sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(template.preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;">
            <tr>
              <td style="padding:32px 32px 16px;">
                <p style="margin:0 0 4px;color:#0A0E1A;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(brandName)}</p>
                ${subBrandText ? `<p style="margin:0 0 8px;color:#6f6f6f;font-size:11px;">${escapeHtml(subBrandText)}</p>` : ""}
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.3;color:#1d1d1d;">${escapeHtml(template.headline)}</h1>
                ${htmlParagraphs}
                <a href="${safeCheckoutUrl}" style="display:inline-block;margin:8px 0 20px;padding:14px 24px;background:#22c55e;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;">${escapeHtml(template.cta)}</a>
                <p style="margin:0;color:#6f6f6f;font-size:14px;line-height:1.5;">${escapeHtml(template.signoff)}</p>
                <p style="margin:12px 0 0;color:#9a9a9a;font-size:12px;line-height:1.5;">${escapeHtml(
        locale === "pt"
            ? "Se você já concluiu o pagamento, ignore este email."
            : "If you already paid, please ignore this email."
    )}</p>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;color:#9a9a9a;font-size:11px;">${escapeHtml(orderLabel)}: ${escapeHtml(data.orderId)}</p>
          <p style="margin:8px 0 0;color:#9a9a9a;font-size:10px;">${escapeHtml(addressText)}</p>
          <p style="margin:8px 0 0;color:#9a9a9a;font-size:10px;">${escapeHtml(unsubscribeText)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9a9a9a;text-decoration:underline;">${escapeHtml(unsubscribeAction)}</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const text = [
        template.headline,
        "",
        ...template.paragraphs,
        "",
        `${template.cta}: ${data.checkoutUrl}`,
        "",
        template.signoff,
        "",
        locale === "pt"
            ? "Se você já concluiu o pagamento, ignore este email."
            : "If you already paid, you can ignore this email.",
        `${orderLabel}: ${data.orderId}`,
        addressText,
        `${unsubscribeText} -> ${unsubscribeUrl}`,
    ].join("\n");

    return {
        subject: template.subject,
        html,
        text,
    };
}

async function sendReminderEmail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    template: string;
    orderId: string;
}) {
    await sendEmailCentral({
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        template: params.template,
        orderId: params.orderId,
    });
    return true;
}

const orderRemindersWorker = new Worker<OrderReminderJob>(
    ORDER_REMINDERS_QUEUE,
    async (job) => {
        const { orderId, stage } = job.data;

        const order = await db.songOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                email: true,
                recipientName: true,
                locale: true,
                currency: true,
                priceAtOrder: true,
                status: true,
                utmSource: true,
            },
        });

        if (!order || !order.email) {
            console.log(`Order ${orderId} not found or no email`);
            return;
        }

        if (order.status !== "PENDING") {
            console.log(`Order ${orderId} status is ${order.status}, skipping reminder`);
            return;
        }

        const supabaseLeadSource = process.env.SUPABASE_LEAD_SOURCE || "supabase-import";
        const isImportedLead = order.utmSource === supabaseLeadSource;

        // TEMPORARY: skip all emails for supabase-import leads
        if (isImportedLead) {
            console.log(`Order ${orderId} is supabase-import lead, skipping email (temporarily disabled)`);
            return;
        }

        const localeForPrice = order.locale === "pt" || order.locale === "es" || order.locale === "fr" || order.locale === "it"
            ? (order.locale as "pt" | "es" | "fr" | "it")
            : "en";
        const priceCents = isImportedLead
            ? getLeadBasePrice(localeForPrice, "essencial")
            : order.priceAtOrder;
        const checkoutPath = isImportedLead
            ? `/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`
            : `/${order.locale}/order/${order.id}`;
        const checkoutUrl = new URL(checkoutPath, SITE_URL).toString();

        const email = buildAbandonedOrderEmail(stage, {
            orderId: order.id,
            customerEmail: order.email,
            recipientName: order.recipientName,
            locale: order.locale,
            price: priceCents / 100,
            currency: order.currency,
            checkoutUrl,
            priceMode: isImportedLead ? "startingFrom" : "exact",
        });

        await sendReminderEmail({
            to: order.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            template: "CART_ABANDONMENT",
            orderId: order.id,
        });
    },
    {
        connection,
        concurrency: 5,
    }
);

orderRemindersWorker.on("completed", (job) => {
    console.log(`✅ Order reminder sent for ${job.data.orderId} (${job.data.stage})`);
});

orderRemindersWorker.on("failed", (job, error) => {
    console.error(
        `❌ Order reminder failed for ${job?.data.orderId ?? "unknown"}:`,
        error.message
    );
});

orderRemindersWorker.on("ready", () => {
    console.log("🚀 Order reminder worker started and ready");
});

// ============================================================================
// STREAMING VIP REMINDER WORKER
// ============================================================================

const STREAMING_VIP_REMINDER_QUEUE = "streaming-vip-reminder";

type StreamingVipReminderJob = {
    orderId: string;
};

type StreamingVipEmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    greeting: string;
    paragraphs: string[];
    cta: string;
    signoff: string;
    ps?: string;
};

type StreamingVipCopyParams = {
    recipientName: string;
    customerFirstName: string;
    price: string;
};

const STREAMING_PT_COPY = ({ recipientName, customerFirstName }: StreamingVipCopyParams): StreamingVipEmailTemplate => ({
    subject: `A música de ${recipientName} está a um passo das plataformas...`,
    preheader: "Spotify, Instagram, TikTok, WhatsApp... A música dela está esperando.",
    headline: "Ela merece ouvir essa música <b>pra sempre</b>",
    greeting: `Oi${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `Eu vi que você começou a colocar a música de <b>${recipientName}</b> nas plataformas de streaming... mas <b>não finalizou</b>.`,
        "Eu entendo — a vida corrida, mil abas abertas, aquele \"depois eu volto\". Acontece.",
        `Mas deixa eu te contar uma coisa: <b>você já fez a parte mais difícil</b>. Você parou, pensou em cada detalhe, escolheu as palavras certas. A música de ${recipientName} <b>existe</b>. Ela está <b>linda</b>. Está <b>pronta</b>.`,
        "Só que por enquanto... <b>só vocês dois podem ouvir</b>.",
        `Agora imagina: ${recipientName} abre o <b>Spotify</b> e encontra uma música com o nome dela. Ou recebe um <b>Reels no Instagram</b> com a música tocando. Ou um vídeo no <b>TikTok</b>. Ou um status no <b>WhatsApp</b>. Uma <b>capa profissional personalizada</b> e um <b>nome de música lindo</b>, escolhido especialmente pra ela.`,
        "Isso não é um presente qualquer. É um presente que ela vai <b>compartilhar nos stories</b>, mostrar pras amigas, e <b>guardar pra sempre</b>.",
    ],
    cta: "Publicar nas plataformas agora",
    signoff: "Com carinho,\nEquipe Apollo Song",
    ps: "Se tiver qualquer dúvida, é só responder esse email.",
});

const STREAMING_EN_COPY = ({ recipientName, customerFirstName }: StreamingVipCopyParams): StreamingVipEmailTemplate => ({
    subject: `${recipientName}'s song is one step away from streaming...`,
    preheader: "Spotify, Instagram, TikTok, WhatsApp... The song is waiting.",
    headline: "They deserve to hear this song <b>forever</b>",
    greeting: `Hi${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `I noticed you started putting <b>${recipientName}</b>'s song on streaming platforms... but <b>didn't finish</b>.`,
        "I get it — busy life, a hundred tabs open, that \"I'll come back later\" moment. It happens.",
        `But here's the thing: <b>you already did the hardest part</b>. You stopped, thought about every detail, chose the right words. ${recipientName}'s song <b>exists</b>. It's <b>beautiful</b>. It's <b>ready</b>.`,
        "It's just that for now... <b>only you two can hear it</b>.",
        `Now imagine: ${recipientName} opens <b>Spotify</b> and finds a song with their name on it. Or receives an <b>Instagram Reel</b> with the song playing. Or a <b>TikTok</b> video. Or a <b>WhatsApp</b> status. A <b>professional personalized cover art</b> and a <b>beautiful song name</b>, chosen especially for them.`,
        "This isn't just any gift. It's a gift they'll <b>share on stories</b>, show their friends, and <b>treasure forever</b>.",
    ],
    cta: "Publish on platforms now",
    signoff: "With care,\nThe ApolloSong Team",
    ps: "If you have any questions, just reply to this email.",
});

const STREAMING_ES_COPY = ({ recipientName, customerFirstName }: StreamingVipCopyParams): StreamingVipEmailTemplate => ({
    subject: `La canción de ${recipientName} está a un paso de las plataformas...`,
    preheader: "Spotify, Instagram, TikTok, WhatsApp... La canción está esperando.",
    headline: "Merece escuchar esta canción <b>para siempre</b>",
    greeting: `Hola${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `Vi que empezaste a poner la canción de <b>${recipientName}</b> en las plataformas de streaming... pero <b>no terminaste</b>.`,
        "Lo entiendo — la vida ajetreada, mil pestañas abiertas, ese \"ya vuelvo después\". Pasa.",
        `Pero déjame contarte algo: <b>ya hiciste la parte más difícil</b>. Te detuviste, pensaste en cada detalle, elegiste las palabras correctas. La canción de ${recipientName} <b>existe</b>. Está <b>hermosa</b>. Está <b>lista</b>.`,
        "Solo que por ahora... <b>solo ustedes dos pueden escucharla</b>.",
        `Ahora imagina: ${recipientName} abre <b>Spotify</b> y encuentra una canción con su nombre. O recibe un <b>Reel en Instagram</b> con la canción sonando. O un video en <b>TikTok</b>. O un estado de <b>WhatsApp</b>. Una <b>portada profesional personalizada</b> y un <b>nombre de canción hermoso</b>, elegido especialmente para ella.`,
        "Esto no es un regalo cualquiera. Es un regalo que va a <b>compartir en stories</b>, mostrar a sus amigas, y <b>guardar para siempre</b>.",
    ],
    cta: "Publicar en las plataformas ahora",
    signoff: "Con cariño,\nEl equipo de ApolloSong",
    ps: "Si tienes alguna pregunta, solo responde a este correo.",
});

const STREAMING_FR_COPY = ({ recipientName, customerFirstName }: StreamingVipCopyParams): StreamingVipEmailTemplate => ({
    subject: `La chanson de ${recipientName} est à un pas des plateformes...`,
    preheader: "Spotify, Instagram, TikTok, WhatsApp... La chanson attend.",
    headline: "Elle mérite d'écouter cette chanson <b>pour toujours</b>",
    greeting: `Bonjour${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `J'ai remarqué que vous avez commencé à mettre la chanson de <b>${recipientName}</b> sur les plateformes de streaming... mais <b>vous n'avez pas terminé</b>.`,
        "Je comprends — la vie trépidante, cent onglets ouverts, ce \"j'y reviendrai plus tard\". Ça arrive.",
        `Mais laissez-moi vous dire quelque chose : <b>vous avez déjà fait le plus difficile</b>. Vous vous êtes arrêté, avez réfléchi à chaque détail, choisi les bons mots. La chanson de ${recipientName} <b>existe</b>. Elle est <b>magnifique</b>. Elle est <b>prête</b>.`,
        "C'est juste que pour l'instant... <b>seuls vous deux pouvez l'écouter</b>.",
        `Maintenant imaginez : ${recipientName} ouvre <b>Spotify</b> et trouve une chanson avec son nom. Ou reçoit un <b>Reel Instagram</b> avec la chanson. Ou une vidéo <b>TikTok</b>. Ou un statut <b>WhatsApp</b>. Une <b>pochette professionnelle personnalisée</b> et un <b>beau nom de chanson</b>, choisi spécialement pour elle.`,
        "Ce n'est pas un cadeau ordinaire. C'est un cadeau qu'elle <b>partagera en stories</b>, montrera à ses amies, et <b>gardera pour toujours</b>.",
    ],
    cta: "Publier sur les plateformes maintenant",
    signoff: "Avec affection,\nL'équipe ChansonDivine",
    ps: "Si vous avez des questions, répondez simplement à cet email.",
});

const STREAMING_IT_COPY = ({ recipientName, customerFirstName }: StreamingVipCopyParams): StreamingVipEmailTemplate => ({
    subject: `La canzone di ${recipientName} è a un passo dalle piattaforme...`,
    preheader: "Spotify, Instagram, TikTok, WhatsApp... La canzone sta aspettando.",
    headline: "Merita di ascoltare questa canzone <b>per sempre</b>",
    greeting: `Ciao${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `Ho notato che hai iniziato a mettere la canzone di <b>${recipientName}</b> sulle piattaforme di streaming... ma <b>non hai finito</b>.`,
        "Capisco — la vita frenetica, cento schede aperte, quel \"ci torno dopo\". Succede.",
        `Ma lascia che ti dica una cosa: <b>hai già fatto la parte più difficile</b>. Ti sei fermato, hai pensato a ogni dettaglio, hai scelto le parole giuste. La canzone di ${recipientName} <b>esiste</b>. È <b>bellissima</b>. È <b>pronta</b>.`,
        "Solo che per ora... <b>solo voi due potete ascoltarla</b>.",
        `Ora immagina: ${recipientName} apre <b>Spotify</b> e trova una canzone con il suo nome. O riceve un <b>Reel su Instagram</b> con la canzone. O un video <b>TikTok</b>. O uno stato <b>WhatsApp</b>. Una <b>copertina professionale personalizzata</b> e un <b>bel nome di canzone</b>, scelto apposta per lei.`,
        "Questo non è un regalo qualsiasi. È un regalo che <b>condividerà nelle stories</b>, mostrerà alle amiche, e <b>custodirà per sempre</b>.",
    ],
    cta: "Pubblicare sulle piattaforme ora",
    signoff: "Con affetto,\nIl team ApolloSong",
    ps: "Se hai domande, rispondi semplicemente a questa email.",
});

const STREAMING_COPY_BY_LOCALE: Record<SupportedLocale, (params: StreamingVipCopyParams) => StreamingVipEmailTemplate> = {
    en: STREAMING_EN_COPY,
    pt: STREAMING_PT_COPY,
    es: STREAMING_ES_COPY,
    fr: STREAMING_FR_COPY,
    it: STREAMING_IT_COPY,
};

const streamingVipDefaultNames: Record<SupportedLocale, string> = {
    en: "someone special",
    pt: "alguém especial",
    es: "alguien especial",
    fr: "quelqu'un de spécial",
    it: "qualcuno di speciale",
};

const streamingVipBrandNames: Record<SupportedLocale, string> = {
    en: "ApolloSong",
    pt: "Apollo Song",
    es: "ApolloSong",
    fr: "ChansonDivine",
    it: "ApolloSong",
};

const streamingVipOrderLabels: Record<SupportedLocale, string> = {
    en: "Order ID",
    pt: "Pedido",
    es: "Pedido",
    fr: "Commande",
    it: "Ordine",
};

const streamingVipWhatsappCopy: Record<SupportedLocale, { label: string; action: string; message: (orderId: string) => string }> = {
    en: {
        label: "Questions about how this works?",
        action: "Chat with us on WhatsApp",
        message: (orderId) => `Hi! I have a question about the Streaming VIP. Order ID: ${orderId}.`,
    },
    pt: {
        label: "Ficou com dúvidas sobre como funciona?",
        action: "Tire suas dúvidas no WhatsApp",
        message: (orderId) => `Olá! Tenho uma dúvida sobre o Streaming VIP. Pedido: ${orderId}.`,
    },
    es: {
        label: "¿Tienes dudas sobre cómo funciona?",
        action: "Escríbenos por WhatsApp",
        message: (orderId) => `¡Hola! Tengo una pregunta sobre el Streaming VIP. Pedido: ${orderId}.`,
    },
    fr: {
        label: "Des questions sur le fonctionnement ?",
        action: "Contactez-nous sur WhatsApp",
        message: (orderId) => `Bonjour ! J'ai une question sur le Streaming VIP. Commande : ${orderId}.`,
    },
    it: {
        label: "Hai dubbi su come funziona?",
        action: "Contattaci su WhatsApp",
        message: (orderId) => `Ciao! Ho una domanda sul Streaming VIP. Ordine: ${orderId}.`,
    },
};

function extractFirstName(fullName?: string | null): string {
    if (!fullName) return "";
    const trimmed = fullName.trim();
    const firstSpace = trimmed.indexOf(" ");
    return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
}

function buildStreamingVipReminderEmailInline(data: {
    orderId: string;
    parentOrderId: string;
    recipientName?: string | null;
    email: string;
    locale?: string | null;
    price: number;
    currency: string;
    paymentUrl: string;
}) {
    const locale = getLocale(data.locale || "en");
    const recipientName = data.recipientName?.trim() || streamingVipDefaultNames[locale];
    const customerFirstName = ""; // We don't have customer name in SongOrder model
    const price = formatStreamingPrice(data.price, data.currency, locale);

    const template = STREAMING_COPY_BY_LOCALE[locale]({
        recipientName,
        customerFirstName,
        price,
    });

    const safePaymentUrl = escapeStreamingHtml(data.paymentUrl);
    const brandName = streamingVipBrandNames[locale];
    const orderLabel = streamingVipOrderLabels[locale];
    const whatsappCopy = streamingVipWhatsappCopy[locale];
    const whatsappMessage = whatsappCopy.message(data.parentOrderId);
    const whatsappUrl = `https://wa.me/5561995790193?text=${encodeURIComponent(whatsappMessage)}`;

    // Dual branding - "by Apollo Song" (empty for English)
    const subBrandByLocale: Record<SupportedLocale, string> = {
        pt: "por Apollo Song",
        en: "",
        es: "por Apollo Song",
        fr: "par Apollo Song",
        it: "da Apollo Song",
    };
    const subBrandText = subBrandByLocale[locale];

    const addressByLocale: Record<SupportedLocale, string> = {
        pt: "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil",
        en: "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil",
        es: "CSG 3 LT 7, Brasilia-DF, CP 72035-503, Brasil",
        fr: "CSG 3 LT 7, Brasilia-DF, Code postal 72035-503, Brésil",
        it: "CSG 3 LT 7, Brasilia-DF, CAP 72035-503, Brasile",
    };
    const unsubscribeByLocale: Record<SupportedLocale, { text: string; action: string }> = {
        pt: { text: "Não deseja mais receber emails?", action: "Clique aqui" },
        en: { text: "Don't want to receive emails?", action: "Click here" },
        es: { text: "¿No desea recibir más correos?", action: "Haga clic aquí" },
        fr: { text: "Vous ne souhaitez plus recevoir d'emails ?", action: "Cliquez ici" },
        it: { text: "Non vuoi più ricevere email?", action: "Clicca qui" },
    };
    const addressText = addressByLocale[locale];
    const unsubscribeCopy = unsubscribeByLocale[locale];
    const unsubscribeUrl = getUnsubscribeUrl(data.email, locale);

    const htmlParagraphs = template.paragraphs
        .map((paragraph) => {
            // Escape HTML but preserve <b> tags for bold text
            const escaped = escapeStreamingHtml(paragraph)
                .replace(/&lt;b&gt;/g, "<b>")
                .replace(/&lt;\/b&gt;/g, "</b>");
            return `<p style="margin:0 0 18px;line-height:1.7;color:#2b2b2b;font-size:18px;">${escaped}</p>`;
        })
        .join("");

    const whatsappSection = `
                <div style="margin:24px 0;padding:20px 24px;background:linear-gradient(135deg, #25D366 0%, #128C7E 100%);border-radius:16px;text-align:center;">
                  <p style="margin:0 0 12px;color:#ffffff;font-size:16px;font-weight:600;line-height:1.4;">
                    ${escapeStreamingHtml(whatsappCopy.label)}
                  </p>
                  <a href="${escapeStreamingHtml(whatsappUrl)}" style="display:inline-block;padding:12px 24px;background:#ffffff;color:#25D366;text-decoration:none;font-weight:700;font-size:15px;border-radius:30px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                    &#128172; ${escapeStreamingHtml(whatsappCopy.action)}
                  </a>
                  <p style="margin:12px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">
                    +55 61 99579-0193
                  </p>
                </div>`;

    const psSection = template.ps
        ? `<p style="margin:20px 0 0;color:#6f6f6f;font-size:14px;font-style:italic;line-height:1.5;">${escapeStreamingHtml(template.ps)}</p>`
        : "";

    const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeStreamingHtml(template.subject)}</title>
  </head>
  <body style="margin:0;background:#f8f5f0;font-family:Arial, sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeStreamingHtml(template.preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;">
            <tr>
              <td style="padding:32px 32px 16px;">
                <p style="margin:0 0 4px;color:#0A0E1A;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">${escapeStreamingHtml(brandName)}</p>
                ${subBrandText ? `<p style="margin:0 0 8px;color:#6f6f6f;font-size:11px;">${escapeStreamingHtml(subBrandText)}</p>` : ""}
                <h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;color:#1d1d1d;">${escapeStreamingHtml(template.headline).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>")}</h1>
                <p style="margin:0 0 20px;line-height:1.7;color:#2b2b2b;font-size:18px;">${escapeStreamingHtml(template.greeting)}</p>
                ${htmlParagraphs}
                <a href="${safePaymentUrl}" style="display:inline-block;margin:8px 0 24px;padding:16px 28px;background:#22c55e;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;">${escapeStreamingHtml(template.cta)}</a>
                ${psSection}
                ${whatsappSection}
                <p style="margin:0;color:#6f6f6f;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeStreamingHtml(template.signoff)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;color:#9a9a9a;font-size:11px;">${escapeStreamingHtml(orderLabel)}: ${escapeStreamingHtml(data.parentOrderId)}</p>
          <p style="margin:8px 0 0;color:#9a9a9a;font-size:10px;">${escapeStreamingHtml(addressText)}</p>
          <p style="margin:8px 0 0;color:#9a9a9a;font-size:10px;">${escapeStreamingHtml(unsubscribeCopy.text)} <a href="${escapeStreamingHtml(unsubscribeUrl)}" style="color:#9a9a9a;text-decoration:underline;">${escapeStreamingHtml(unsubscribeCopy.action)}</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const text = [
        template.headline,
        "",
        template.greeting,
        "",
        ...template.paragraphs,
        "",
        `${template.cta}: ${data.paymentUrl}`,
        "",
        template.ps || "",
        "",
        `${whatsappCopy.label} ${whatsappUrl}`,
        "",
        template.signoff,
        "",
        `${orderLabel}: ${data.parentOrderId}`,
        addressText,
        `${unsubscribeCopy.text} -> ${unsubscribeUrl}`,
    ].filter(Boolean).join("\n");

    return {
        subject: template.subject,
        html,
        text,
    };
}

function formatStreamingPrice(price: number, currency: string, locale: SupportedLocale) {
    const localeMap: Record<SupportedLocale, string> = {
        en: "en-US",
        pt: "pt-BR",
        es: "es-ES",
        fr: "fr-FR",
        it: "it-IT",
    };
    try {
        return new Intl.NumberFormat(localeMap[locale], {
            style: "currency",
            currency,
        }).format(price);
    } catch {
        const fallbacks: Record<SupportedLocale, string> = {
            en: `$${price}`,
            pt: `R$${price}`,
            es: `$${price}`,
            fr: `€${price}`,
            it: `€${price}`,
        };
        return fallbacks[locale];
    }
}

function escapeStreamingHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const streamingVipReminderWorker = new Worker<StreamingVipReminderJob>(
    STREAMING_VIP_REMINDER_QUEUE,
    async (job) => {
        const { orderId } = job.data;

        // Fetch the streaming upsell order
        const upsellOrder = await db.songOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                email: true,
                locale: true,
                currency: true,
                priceAtOrder: true,
                status: true,
                orderType: true,
                parentOrderId: true,
            },
        });

        if (!upsellOrder || !upsellOrder.email) {
            console.log(`[Streaming VIP] Order ${orderId} not found or no email`);
            return;
        }

        if (upsellOrder.orderType !== "STREAMING_UPSELL") {
            console.log(`[Streaming VIP] Order ${orderId} is not a streaming upsell, skipping`);
            return;
        }

        if (upsellOrder.status !== "PENDING") {
            console.log(`[Streaming VIP] Order ${orderId} status is ${upsellOrder.status}, skipping reminder`);
            return;
        }

        if (!upsellOrder.parentOrderId) {
            console.log(`[Streaming VIP] Order ${orderId} has no parent order, skipping`);
            return;
        }

        // Fetch parent order for recipient name
        const parentOrder = await db.songOrder.findUnique({
            where: { id: upsellOrder.parentOrderId },
            select: {
                id: true,
                recipientName: true,
            },
        });

        if (!parentOrder) {
            console.log(`[Streaming VIP] Parent order ${upsellOrder.parentOrderId} not found, skipping`);
            return;
        }

        // Build track order URL with email and anchor to streaming section
        // English locale has no slug, other locales have /{locale}/ prefix
        // Link goes directly to payment page for less friction
        const localeSlug = upsellOrder.locale && upsellOrder.locale !== "en" ? `/${upsellOrder.locale}` : "";
        const paymentUrl = `${SITE_URL}${localeSlug}/order/${upsellOrder.id}`;

        const email = buildStreamingVipReminderEmailInline({
            orderId: upsellOrder.id,
            parentOrderId: parentOrder.id,
            recipientName: parentOrder.recipientName,
            email: upsellOrder.email,
            locale: upsellOrder.locale,
            price: upsellOrder.priceAtOrder / 100,
            currency: upsellOrder.currency,
            paymentUrl,
        });

        await sendReminderEmail({
            to: upsellOrder.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            template: "STREAMING_VIP_REMINDER",
            orderId: upsellOrder.id,
        });
    },
    {
        connection,
        concurrency: 5,
    }
);

streamingVipReminderWorker.on("completed", (job) => {
    console.log(`✅ [Streaming VIP] Reminder sent for ${job.data.orderId}`);
});

streamingVipReminderWorker.on("failed", (job, error) => {
    console.error(
        `❌ [Streaming VIP] Reminder failed for ${job?.data.orderId ?? "unknown"}:`,
        error.message
    );
});

streamingVipReminderWorker.on("ready", () => {
    console.log("🎧 Streaming VIP reminder worker started and ready");
});

// ============================================================================
// LYRICS GENERATION WORKER
// ============================================================================

const LYRICS_GENERATION_QUEUE = "lyrics-generation";

type LyricsGenerationJob = {
    orderId: string;
};

function buildLyricsPrompt(input: LyricsInput): string {
    const lang = getLocale(input.locale);
    const genreInstructions = GENRE_INSTRUCTIONS[input.genre]?.[lang] || GENRE_INSTRUCTIONS.pop![lang];
    const relationshipContext = RELATIONSHIP_CONTEXT[input.recipient]?.[lang] || RELATIONSHIP_CONTEXT.other![lang];
    const genreName = GENRE_NAMES[input.genre]?.[lang] || input.genre;
    const relationshipName = RELATIONSHIP_NAMES[input.recipient]?.[lang] || input.recipient;

    const langNames: Record<SupportedLocale, string> = {
        en: "English",
        pt: "Brazilian Portuguese",
        es: "Spanish (Latin American)",
        fr: "French",
        it: "Italian",
    };
    const langName = langNames[lang];

    const vocalsDescriptions: Record<SupportedLocale, { female: string; male: string; any: string }> = {
        en: { female: "female voice", male: "male voice", any: "any voice" },
        pt: { female: "voz feminina", male: "voz masculina", any: "qualquer voz" },
        es: { female: "voz femenina", male: "voz masculina", any: "cualquier voz" },
        fr: { female: "voix féminine", male: "voix masculine", any: "n'importe quelle voix" },
        it: { female: "voce femminile", male: "voce maschile", any: "qualsiasi voce" },
    };
    const vocalsDescription =
        input.vocals === "female"
            ? vocalsDescriptions[lang].female
            : input.vocals === "male"
                ? vocalsDescriptions[lang].male
                : vocalsDescriptions[lang].any;

    const prompts: Record<SupportedLocale, string> = {
        pt: `Você é um compositor profissional criando letras de música personalizadas.

CONTEXTO:
- Esta canção é um presente para ${input.recipientName}
- Relacionamento: ${relationshipName}
- ${relationshipContext}
- Gênero musical: ${genreName}
- Tipo de vocal: ${vocalsDescription}
- Idioma: Português Brasileiro

QUALIDADES ESPECIAIS DA PESSOA:
${input.qualities}

MEMÓRIAS E HISTÓRIAS COMPARTILHADAS:
${input.memories}

${input.message ? `MENSAGEM ADICIONAL DO CLIENTE:\n${input.message}` : ""}

INSTRUÇÕES DO GÊNERO:
${genreInstructions}

REQUISITOS:
1. Escreva letras que combinem com o estilo ${genreName}
2. Inclua o nome "${input.recipientName}" naturalmente nas letras (pelo menos 2-3 vezes)
3. Faça referência ao relacionamento (${relationshipName}) de forma emocional
4. Incorpore as qualidades e memórias fornecidas de forma criativa
5. Use esquema de rimas apropriado para ${genreName}
6. Estrutura: Verso 1, Refrão, Verso 2, Refrão, Ponte, Refrão Final
7. Idioma: Português Brasileiro
8. Tom: Emocional, sincero, celebratório
9. As letras devem fluir naturalmente e ser fáceis de cantar
10. Evite clichês excessivos, seja criativo e autêntico
11. NÃO deduza cor de pele ou cor de cabelo; só mencione se o cliente fornecer
12. IMPORTANTE: Quando houver datas ou anos numéricos (como 1994, 2010, 15 de março, etc.), SEMPRE escreva-os por extenso (exemplo: "mil novecentos e noventa e quatro" em vez de "1994", "quinze de março" em vez de "15 de março")

FORMATO DE SAÍDA:
Retorne APENAS as letras, formatadas corretamente com rótulos de seção como [Verso 1], [Refrão], [Verso 2], [Ponte], etc.
Não inclua explicações, apenas as letras.`,

        es: `Eres un compositor profesional creando letras de canciones personalizadas.

CONTEXTO:
- Esta canción es un regalo para ${input.recipientName}
- Relación: ${relationshipName}
- ${relationshipContext}
- Género musical: ${genreName}
- Tipo de voz: ${vocalsDescription}
- Idioma: Español Latinoamericano

CUALIDADES ESPECIALES DE LA PERSONA:
${input.qualities}

MEMORIAS E HISTORIAS COMPARTIDAS:
${input.memories}

${input.message ? `MENSAJE ADICIONAL DEL CLIENTE:\n${input.message}` : ""}

INSTRUCCIONES DEL GÉNERO:
${genreInstructions}

REQUISITOS:
1. Escribe letras que combinen con el estilo ${genreName}
2. Incluye el nombre "${input.recipientName}" naturalmente en las letras (al menos 2-3 veces)
3. Haz referencia a la relación (${relationshipName}) de manera emocional
4. Incorpora las cualidades y memorias proporcionadas de forma creativa
5. Usa un esquema de rimas apropiado para ${genreName}
6. Estructura: Verso 1, Coro, Verso 2, Coro, Puente, Coro Final
7. Idioma: Español Latinoamericano
8. Tono: Emocional, sincero, celebratorio
9. Las letras deben fluir naturalmente y ser fáciles de cantar
10. Evita clichés excesivos, sé creativo y auténtico
11. NO deduzcas color de piel ni color de cabello; solo menciónalos si el cliente los proporciona
12. IMPORTANTE: Cuando haya fechas o años numéricos (como 1994, 2010, 15 de marzo, etc.), SIEMPRE escríbelos completos (ejemplo: "mil novecientos noventa y cuatro" en vez de "1994", "quince de marzo" en vez de "15 de marzo")

FORMATO DE SALIDA:
Devuelve SOLO las letras, formateadas correctamente con etiquetas de sección como [Verso 1], [Coro], [Verso 2], [Puente], etc.
No incluyas explicaciones, solo las letras.`,

        fr: `Tu es un compositeur professionnel créant des paroles de chanson personnalisées.

CONTEXTE:
- Cette chanson est un cadeau pour ${input.recipientName}
- Relation: ${relationshipName}
- ${relationshipContext}
- Genre musical: ${genreName}
- Type de voix: ${vocalsDescription}
- Langue: Français

QUALITÉS SPÉCIALES DE LA PERSONNE:
${input.qualities}

SOUVENIRS ET HISTOIRES PARTAGÉS:
${input.memories}

${input.message ? `MESSAGE SUPPLÉMENTAIRE DU CLIENT:\n${input.message}` : ""}

INSTRUCTIONS DU GENRE:
${genreInstructions}

EXIGENCES:
1. Écris des paroles qui correspondent au style ${genreName}
2. Inclus le nom "${input.recipientName}" naturellement dans les paroles (au moins 2-3 fois)
3. Fais référence à la relation (${relationshipName}) de manière émotionnelle
4. Incorpore les qualités et souvenirs fournis de manière créative
5. Utilise un schéma de rimes approprié pour ${genreName}
6. Structure: Couplet 1, Refrain, Couplet 2, Refrain, Pont, Refrain Final
7. Langue: Français
8. Ton: Émotionnel, sincère, festif
9. Les paroles doivent couler naturellement et être faciles à chanter
10. Évite les clichés excessifs, sois créatif et authentique
11. N'infère pas la couleur de peau ou de cheveux; ne les mentionne que si le client les a fournies
12. IMPORTANT: Quand il y a des dates ou années numériques (comme 1994, 2010, 15 mars, etc.), TOUJOURS les écrire en toutes lettres (exemple: "mille neuf cent quatre-vingt-quatorze" au lieu de "1994", "quinze mars" au lieu de "15 mars")

FORMAT DE SORTIE:
Retourne UNIQUEMENT les paroles, correctement formatées avec des étiquettes de section comme [Couplet 1], [Refrain], [Couplet 2], [Pont], etc.
N'inclus pas d'explications, seulement les paroles.`,

        it: `Sei un compositore professionista che crea testi di canzoni personalizzate.

CONTESTO:
- Questa canzone è un regalo per ${input.recipientName}
- Relazione: ${relationshipName}
- ${relationshipContext}
- Genere musicale: ${genreName}
- Tipo di voce: ${vocalsDescription}
- Lingua: Italiano

QUALITÀ SPECIALI DELLA PERSONA:
${input.qualities}

RICORDI E STORIE CONDIVISE:
${input.memories}

${input.message ? `MESSAGGIO AGGIUNTIVO DEL CLIENTE:\n${input.message}` : ""}

ISTRUZIONI DEL GENERE:
${genreInstructions}

REQUISITI:
1. Scrivi testi che corrispondano allo stile ${genreName}
2. Includi il nome "${input.recipientName}" naturalmente nei testi (almeno 2-3 volte)
3. Fai riferimento alla relazione (${relationshipName}) in modo emotivo
4. Incorpora le qualità e i ricordi forniti in modo creativo
5. Usa uno schema di rime appropriato per ${genreName}
6. Struttura: Strofa 1, Ritornello, Strofa 2, Ritornello, Ponte, Ritornello Finale
7. Lingua: Italiano
8. Tono: Emotivo, sincero, celebrativo
9. I testi devono fluire naturalmente ed essere facili da cantare
10. Evita cliché eccessivi, sii creativo e autentico
11. Non dedurre colore della pelle o dei capelli; menzionali solo se il cliente li ha forniti
12. IMPORTANTE: Quando ci sono date o anni numerici (come 1994, 2010, 15 marzo, ecc.), SEMPRE scrivili per esteso (esempio: "millenovecentonovantaquattro" invece di "1994", "quindici marzo" invece di "15 marzo")

FORMATO DI OUTPUT:
Restituisci SOLO i testi, formattati correttamente con etichette di sezione come [Strofa 1], [Ritornello], [Strofa 2], [Ponte], ecc.
Non includere spiegazioni, solo i testi.`,

        en: `You are a professional songwriter creating personalized song lyrics.

CONTEXT:
- This song is a gift for ${input.recipientName}
- Relationship: ${relationshipName}
- ${relationshipContext}
- Musical genre: ${genreName}
- Vocal type: ${vocalsDescription}
- Language: ${langName}

PERSON'S SPECIAL QUALITIES:
${input.qualities}

SHARED MEMORIES & STORIES:
${input.memories}

${input.message ? `ADDITIONAL MESSAGE FROM CUSTOMER:\n${input.message}` : ""}

GENRE-SPECIFIC INSTRUCTIONS:
${genreInstructions}

REQUIREMENTS:
1. Write lyrics that match the ${genreName} style
2. Include the name "${input.recipientName}" naturally in the lyrics (at least 2-3 times)
3. Reference the relationship (${relationshipName}) emotionally
4. Incorporate the qualities and memories provided creatively
5. Use appropriate rhyme scheme for ${genreName}
6. Structure: Verse 1, Chorus, Verse 2, Chorus, Bridge, Final Chorus
7. Language: ${langName}
8. Tone: Emotional, heartfelt, celebratory
9. Lyrics should flow naturally and be easy to sing
10. Avoid excessive clichés, be creative and authentic
11. Do not infer skin tone or hair color; only mention them if the customer provided them
12. IMPORTANT: When there are numeric dates or years (like 1994, 2010, March 15th, etc.), ALWAYS write them out in full (example: "nineteen ninety-four" instead of "1994", "the fifteenth of March" instead of "March 15th")

OUTPUT FORMAT:
Return ONLY the lyrics, properly formatted with section labels like [Verse 1], [Chorus], [Verse 2], [Bridge], etc.
Do not include explanations, just the lyrics.`,
    };

    return prompts[lang];
}

// ============= PRONUNCIATION CORRECTION HELPER =============
async function applyPronunciationCorrections(text: string): Promise<string> {
    try {
        const corrections = await db.pronunciationCorrection.findMany();

        // Sort by length (descending) to handle subsets correctly (e.g. replace "New York" before "New")
        corrections.sort((a, b) => b.original.length - a.original.length);

        const wordChars = "[\\p{L}\\p{M}\\p{N}_]";
        let correctedText = text.normalize("NFC");
        for (const { original, replacement } of corrections) {
            const normalizedOriginal = original.normalize("NFC");
            const normalizedReplacement = replacement.normalize("NFC");
            // Escape special regex chars
            const escapedOriginal = normalizedOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // Match whole words/phrases using Unicode-aware boundaries
            const regex = new RegExp(`(?<!${wordChars})${escapedOriginal}(?!${wordChars})`, "giu");
            correctedText = correctedText.replace(regex, normalizedReplacement);
        }
        return correctedText;
    } catch (error) {
        console.error("Failed to apply pronunciation corrections:", error);
        return text; // Return original text on error to fail gracefully
    }
}

async function generateLyrics(
    input: LyricsInput
): Promise<{ lyrics: string; displayLyrics: string; musicPrompt: string; prompt: string }> {
    const pronunciationCorrections = await db.pronunciationCorrection.findMany({
        select: { original: true, replacement: true },
    });

    return generateLyricsWithRules({
        ...input,
        pronunciationCorrections,
    });
}

// ============= LYRICS ADAPTATION FOR GENRE VARIANTS =============
async function adaptLyricsForGenre(
    originalLyrics: string,
    originalGenre: string,
    targetGenre: string,
    locale: string
): Promise<string> {
    const lang = getLocale(locale);
    const originalGenreName = GENRE_NAMES[originalGenre]?.[lang] || originalGenre;
    const targetGenreName = GENRE_NAMES[targetGenre]?.[lang] || targetGenre;
    const targetInstructions = GENRE_INSTRUCTIONS[targetGenre]?.[lang] || GENRE_INSTRUCTIONS.pop![lang];

    const prompts: Record<SupportedLocale, string> = {
        pt: `Você é um letrista profissional especializado em adaptação de músicas entre gêneros.

TAREFA:
Adapte sutilmente a letra abaixo, originalmente escrita para ${originalGenreName}, para o gênero ${targetGenreName}.

REGRAS IMPORTANTES:
1. MANTENHA 100% da história, mensagem emocional e essência da letra original
2. PRESERVE a estrutura (versos, refrão, ponte) - mesma quantidade de linhas
3. PRESERVE todos os nomes próprios mencionados
4. Faça APENAS adaptações sutis necessárias para:
   - Usar vocabulário e expressões típicas de ${targetGenreName}
   - Ajustar rimas que funcionem melhor com a melodia de ${targetGenreName}
   - Adaptar referências culturais ao estilo ${targetGenreName}
5. NÃO reescreva a letra - apenas ajuste palavras e expressões onde necessário
6. Se uma linha já funciona bem para ${targetGenreName}, MANTENHA ela igual

INSTRUÇÕES DO GÊNERO ${targetGenreName.toUpperCase()}:
${targetInstructions}

LETRA ORIGINAL (${originalGenreName}):
${originalLyrics}

FORMATO DE SAÍDA:
Retorne APENAS a letra adaptada, com os mesmos rótulos de seção [Verso 1], [Refrão], etc.
Não inclua explicações - apenas a letra adaptada.`,

        es: `Eres un letrista profesional especializado en adaptar canciones entre géneros.

TAREA:
Adapta sutilmente la letra a continuación, originalmente escrita para ${originalGenreName}, al género ${targetGenreName}.

REGLAS IMPORTANTES:
1. MANTÉN el 100% de la historia, mensaje emocional y esencia de la letra original
2. PRESERVA la estructura (versos, estribillo, puente) - misma cantidad de líneas
3. PRESERVA todos los nombres propios mencionados
4. Haz SOLO adaptaciones sutiles necesarias para:
   - Usar vocabulario y expresiones típicas de ${targetGenreName}
   - Ajustar rimas que funcionen mejor con la melodía de ${targetGenreName}
   - Adaptar referencias culturales al estilo ${targetGenreName}
5. NO reescribas la letra - solo ajusta palabras y expresiones donde sea necesario
6. Si una línea ya funciona bien para ${targetGenreName}, MANTENLA igual

INSTRUCCIONES DEL GÉNERO ${targetGenreName.toUpperCase()}:
${targetInstructions}

LETRA ORIGINAL (${originalGenreName}):
${originalLyrics}

FORMATO DE SALIDA:
Devuelve SOLO la letra adaptada, con las mismas etiquetas de sección [Verso 1], [Estribillo], etc.
No incluyas explicaciones - solo la letra adaptada.`,

        fr: `Tu es un parolier professionnel spécialisé dans l'adaptation de chansons entre genres.

TÂCHE:
Adapte subtilement les paroles ci-dessous, originalement écrites pour ${originalGenreName}, au genre ${targetGenreName}.

RÈGLES IMPORTANTES:
1. GARDE 100% de l'histoire, du message émotionnel et de l'essence des paroles originales
2. PRÉSERVE la structure (couplets, refrain, pont) - même nombre de lignes
3. PRÉSERVE tous les noms propres mentionnés
4. Fais UNIQUEMENT les adaptations subtiles nécessaires pour:
   - Utiliser le vocabulaire et les expressions typiques de ${targetGenreName}
   - Ajuster les rimes qui fonctionnent mieux avec la mélodie de ${targetGenreName}
   - Adapter les références culturelles au style ${targetGenreName}
5. NE réécris PAS les paroles - ajuste seulement les mots et expressions où nécessaire
6. Si une ligne fonctionne déjà bien pour ${targetGenreName}, GARDE-la telle quelle

INSTRUCTIONS DU GENRE ${targetGenreName.toUpperCase()}:
${targetInstructions}

PAROLES ORIGINALES (${originalGenreName}):
${originalLyrics}

FORMAT DE SORTIE:
Retourne UNIQUEMENT les paroles adaptées, avec les mêmes étiquettes de section [Couplet 1], [Refrain], etc.
N'inclus pas d'explications - seulement les paroles adaptées.`,

        it: `Sei un paroliere professionista specializzato nell'adattare canzoni tra generi.

COMPITO:
Adatta sottilmente i testi qui sotto, originariamente scritti per ${originalGenreName}, al genere ${targetGenreName}.

REGOLE IMPORTANTI:
1. MANTIENI il 100% della storia, messaggio emotivo ed essenza dei testi originali
2. PRESERVA la struttura (strofe, ritornello, ponte) - stesso numero di righe
3. PRESERVA tutti i nomi propri menzionati
4. Fai SOLO adattamenti sottili necessari per:
   - Usare vocabolario ed espressioni tipiche di ${targetGenreName}
   - Aggiustare rime che funzionano meglio con la melodia di ${targetGenreName}
   - Adattare riferimenti culturali allo stile ${targetGenreName}
5. NON riscrivere i testi - aggiusta solo parole ed espressioni dove necessario
6. Se una riga funziona già bene per ${targetGenreName}, MANTIENILA uguale

ISTRUZIONI DEL GENERE ${targetGenreName.toUpperCase()}:
${targetInstructions}

TESTI ORIGINALI (${originalGenreName}):
${originalLyrics}

FORMATO DI OUTPUT:
Restituisci SOLO i testi adattati, con le stesse etichette di sezione [Strofa 1], [Ritornello], ecc.
Non includere spiegazioni - solo i testi adattati.`,

        en: `You are a professional lyricist specialized in adapting songs between genres.

TASK:
Subtly adapt the lyrics below, originally written for ${originalGenreName}, to the ${targetGenreName} genre.

IMPORTANT RULES:
1. KEEP 100% of the story, emotional message, and essence of the original lyrics
2. PRESERVE the structure (verses, chorus, bridge) - same number of lines
3. PRESERVE all proper names mentioned
4. Make ONLY subtle adaptations necessary to:
   - Use vocabulary and expressions typical of ${targetGenreName}
   - Adjust rhymes that work better with ${targetGenreName} melody
   - Adapt cultural references to ${targetGenreName} style
5. DO NOT rewrite the lyrics - only adjust words and expressions where necessary
6. If a line already works well for ${targetGenreName}, KEEP it the same

${targetGenreName.toUpperCase()} GENRE INSTRUCTIONS:
${targetInstructions}

ORIGINAL LYRICS (${originalGenreName}):
${originalLyrics}

OUTPUT FORMAT:
Return ONLY the adapted lyrics, with the same section labels [Verse 1], [Chorus], etc.
Do not include explanations - just the adapted lyrics.`,
    };

    const systemMessages: Record<SupportedLocale, string> = {
        pt: "Você é um letrista profissional que faz adaptações sutis de letras entre gêneros musicais, preservando a essência e história original.",
        es: "Eres un letrista profesional que hace adaptaciones sutiles de letras entre géneros musicales, preservando la esencia e historia original.",
        fr: "Tu es un parolier professionnel qui fait des adaptations subtiles de paroles entre genres musicaux, en préservant l'essence et l'histoire originale.",
        it: "Sei un paroliere professionista che fa adattamenti sottili di testi tra generi musicali, preservando l'essenza e la storia originale.",
        en: "You are a professional lyricist who makes subtle adaptations of lyrics between musical genres, preserving the original essence and story.",
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://apollosong.com",
            "X-Title": "ApolloSong Lyrics Adapter",
        },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
                {
                    role: "system",
                    content: systemMessages[lang],
                },
                {
                    role: "user",
                    content: prompts[lang],
                },
            ],
            temperature: 0.6,
            max_tokens: 2000,
            top_p: 0.9,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error during lyrics adaptation: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
    };

    if (data.error) {
        throw new Error(`OpenRouter API error: ${data.error.message}`);
    }

    const adaptedLyrics = data.choices?.[0]?.message?.content?.trim();

    if (!adaptedLyrics) {
        throw new Error("No adapted lyrics returned from OpenRouter API");
    }

    return adaptedLyrics;
}

const lyricsGenerationWorker = new Worker<LyricsGenerationJob>(
    LYRICS_GENERATION_QUEUE,
    async (job) => {
        const { orderId } = job.data;

        console.log(`🎵 Starting lyrics generation for order ${orderId}`);

        const order = await db.songOrder.findUnique({
            where: { id: orderId },
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
                status: true,
                lyrics: true,
                lyricsStatus: true,
                orderType: true,
            },
        });

        if (!order) {
            console.log(`Order ${orderId} not found, skipping lyrics generation`);
            return;
        }

        if (order.status !== "PAID" && order.status !== "IN_PROGRESS" && order.status !== "COMPLETED") {
            console.log(`Order ${orderId} status is ${order.status}, skipping lyrics generation`);
            return;
        }

        if (order.lyricsStatus === "completed" && order.lyrics) {
            console.log(`[Lyrics] Order ${orderId} already has lyrics, ensuring Suno is triggered...`);
            await triggerSunoGeneration(orderId);
            return;
        }

        const isGenreVariant = order.orderType === "GENRE_VARIANT";

        await db.songOrder.update({
            where: { id: orderId },
            data: { lyricsStatus: "generating" },
        });

        try {
	            const result = await generateLyrics({
	                recipientName: order.recipientName,
	                recipient: order.recipient,
	                genre: order.genre,
	                vocals: normalizeVocals(order.vocals),
	                qualities: order.qualities,
	                memories: order.memories,
	                message: order.message,
	                locale: order.locale,
	            });

            await db.songOrder.update({
                where: { id: orderId },
                data: {
                    lyrics: result.lyrics,
                    displayLyrics: result.displayLyrics,
                    musicPrompt: result.musicPrompt,
                    lyricsPrompt: result.prompt,
                    lyricsStatus: "completed",
                    lyricsGeneratedAt: new Date(),
                    lyricsError: null,
                },
            });

            console.log(
                isGenreVariant
                    ? `✅ GENRE_VARIANT lyrics generated from scratch for order ${orderId}`
                    : `✅ Lyrics and music prompt generated successfully for order ${orderId}`
            );

            // Trigger Suno song generation
            await triggerSunoGeneration(orderId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`❌ Failed to generate lyrics for order ${orderId}:`, errorMessage);

            await db.songOrder.update({
                where: { id: orderId },
                data: {
                    lyricsStatus: "failed",
                    lyricsError: errorMessage,
                },
            });

            throw error;
        }
    },
    {
        connection,
        concurrency: 2,
    }
);

lyricsGenerationWorker.on("completed", (job) => {
    console.log(`✅ Lyrics generation completed for order ${job.data.orderId}`);
});

lyricsGenerationWorker.on("failed", async (job, error) => {
    const orderId = job?.data.orderId ?? "unknown";
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;
    console.error(
        `❌ Lyrics generation failed for order ${orderId} (attempt ${attemptsMade}/${maxAttempts}):`,
        error.message
    );

    // Alert on final failure (all retries exhausted)
    if (attemptsMade >= maxAttempts) {
        try {
            const { sendLyricsFailureAlert } = await import("../../lib/telegram");
            await sendLyricsFailureAlert({ orderId, attempts: attemptsMade, error: error.message });
        } catch (telegramError) {
            console.error("Failed to send Telegram alert for lyrics failure:", telegramError);
        }
    }
});

lyricsGenerationWorker.on("ready", () => {
    console.log("🎵 Lyrics generation worker started and ready");
});

// ============================================================================
// AUTO-DELIVERY SCHEDULER (Express: 12h, Standard: 48h after payment)
// ============================================================================

const AUTO_DELIVERY_QUEUE = "auto-delivery";
const EXPRESS_DELIVERY_HOURS = 12; // Auto-deliver express orders after 12 hours
const STANDARD_DELIVERY_HOURS = 48; // Auto-deliver standard orders after 48 hours
const GENRE_VARIANT_DELIVERY_HOURS = 24; // Auto-deliver genre variants within 24 hours

// Create queue for scheduling repeatable jobs
const autoDeliveryQueue = new Queue(AUTO_DELIVERY_QUEUE, { connection });

async function checkAndAutoDeliver() {
    const expressCutoffTime = new Date(Date.now() - EXPRESS_DELIVERY_HOURS * 60 * 60 * 1000);
    const standardCutoffTime = new Date(Date.now() - STANDARD_DELIVERY_HOURS * 60 * 60 * 1000);
    const variantCutoffTime = new Date(Date.now() - GENRE_VARIANT_DELIVERY_HOURS * 60 * 60 * 1000);

    // Find genre variant orders ready for auto-delivery (24h after payment)
    const genreVariantOrders = await db.songOrder.findMany({
        where: {
            orderType: "GENRE_VARIANT",
            status: { in: ["PAID", "IN_PROGRESS"] },
            songFileUrl: { not: null },
            songDeliveredAt: null,
            OR: [
                { paymentCompletedAt: { not: null, lte: variantCutoffTime } },
                { paymentCompletedAt: null, createdAt: { lte: variantCutoffTime } },
            ],
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            locale: true,
            songFileUrl: true,
            songFileUrl2: true,
            hasFastDelivery: true,
        },
    });

    // Find express orders ready for auto-delivery (12h after payment)
    const expressOrders = await db.songOrder.findMany({
        where: {
            orderType: { not: "GENRE_VARIANT" },
            hasFastDelivery: true,
            status: { in: ["PAID", "IN_PROGRESS"] },
            songFileUrl: { not: null },
            songDeliveredAt: null,
            OR: [
                { paymentCompletedAt: { not: null, lte: expressCutoffTime } },
                { paymentCompletedAt: null, createdAt: { lte: expressCutoffTime } },
            ],
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            locale: true,
            songFileUrl: true,
            songFileUrl2: true,
            hasFastDelivery: true,
        },
    });

    // Find standard orders ready for auto-delivery (48h after payment)
    const standardOrders = await db.songOrder.findMany({
        where: {
            orderType: { not: "GENRE_VARIANT" },
            NOT: { hasFastDelivery: true },
            status: { in: ["PAID", "IN_PROGRESS"] },
            songFileUrl: { not: null },
            songDeliveredAt: null,
            OR: [
                { paymentCompletedAt: { not: null, lte: standardCutoffTime } },
                { paymentCompletedAt: null, createdAt: { lte: standardCutoffTime } },
            ],
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            locale: true,
            songFileUrl: true,
            songFileUrl2: true,
            hasFastDelivery: true,
        },
    });

    // Find orphan child orders (parent delivered, child has song but wasn't delivered)
    const orphanChildOrders = await db.songOrder.findMany({
        where: {
            orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT"] },
            status: { in: ["PAID", "IN_PROGRESS"] },
            songFileUrl: { not: null },
            songDeliveredAt: null,
            parentOrder: {
                status: "COMPLETED",
                songDeliveredAt: { not: null },
            },
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            locale: true,
            songFileUrl: true,
            songFileUrl2: true,
            hasFastDelivery: true,
        },
    });

    const ordersToDeliver = [...expressOrders, ...standardOrders, ...genreVariantOrders, ...orphanChildOrders];

    if (ordersToDeliver.length === 0) {
        return;
    }

    const expressCount = expressOrders.length;
    const standardCount = standardOrders.length;
    const variantCount = genreVariantOrders.length;
    const orphanCount = orphanChildOrders.length;
    console.log(`📦 Auto-delivery: Found ${ordersToDeliver.length} order(s) ready (${expressCount} express, ${standardCount} standard, ${variantCount} genre variants, ${orphanCount} orphan children)`);

    for (const order of ordersToDeliver) {
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

            const isExpress = order.hasFastDelivery === true;
            const messageId = await sendEmailCentral({
                to: order.email,
                subject: email.subject,
                html: email.html,
                text: email.text,
                template: "SONG_DELIVERY_AUTO",
                orderId: order.id,
                metadata: { autoDelivery: true, expressOrder: isExpress },
            });

            if (!messageId) {
                continue; // Suppressed (bounce, invalid, etc.)
            }

            // Update order status
            const now = new Date();
            await db.songOrder.update({
                where: { id: order.id },
                data: {
                    status: "COMPLETED",
                    songDeliveredAt: now,
                },
            });

            // Also mark child orders as COMPLETED only if they already have audio
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
                    songDeliveredAt: now,
                },
            });

            console.log(`✅ Auto-delivered ${isExpress ? "express" : "standard"} order ${order.id} to ${order.email}`);

            // Queue PDF generation if order has lyrics
            try {
                const orderWithLyrics = await db.songOrder.findUnique({
                    where: { id: order.id },
                    select: { hasLyrics: true, lyricsPdfA4Url: true },
                });
                if (orderWithLyrics?.hasLyrics && !orderWithLyrics.lyricsPdfA4Url) {
                    await pdfGenerationQueue.add("generate-pdf", { orderId: order.id, size: "A4" }, { jobId: `pdf_${order.id}_A4` });
                    await pdfGenerationQueue.add("generate-pdf", { orderId: order.id, size: "A3" }, { jobId: `pdf_${order.id}_A3` });
                    console.log(`📄 Queued PDF generation for order ${order.id}`);
                }
            } catch (pdfErr) {
                console.error(`⚠️ Failed to queue PDF for order ${order.id}:`, pdfErr);
            }
        } catch (error: any) {
            console.error(`❌ Auto-delivery failed for order ${order.id}:`, error);

            // Detect SMTP rejection (550 = invalid/blocked recipient)
            if (error?.responseCode === 550 || error?.code === "EENVELOPE") {
                const rejectedEmail = error.rejected?.[0] || order.email;
                const reason = error.response || error.message || "Recipient rejected";
                try {
                    // Fetch extra fields not in the auto-delivery select
                    const fullOrder = await db.songOrder.findUnique({
                        where: { id: order.id },
                        select: { status: true, backupWhatsApp: true },
                    });
                    await db.emailBounce.create({
                        data: {
                            bouncedEmail: rejectedEmail,
                            bounceReason: reason.substring(0, 500),
                            bounceType: "hard",
                            originalSubject: `Auto-delivery: ${order.recipientName}`,
                            orderId: order.id,
                            orderStatus: fullOrder?.status || "IN_PROGRESS",
                            recipientName: order.recipientName,
                            backupWhatsApp: fullOrder?.backupWhatsApp || null,
                            locale: order.locale,
                        },
                    });
                    const { sendBounceAlert } = await import("../../lib/telegram");
                    await sendBounceAlert({
                        bouncedEmail: rejectedEmail,
                        bounceReason: reason.substring(0, 300),
                        bounceType: "hard",
                        orderId: order.id,
                        orderStatus: fullOrder?.status || "IN_PROGRESS",
                        recipientName: order.recipientName,
                        backupWhatsApp: fullOrder?.backupWhatsApp,
                        locale: order.locale,
                    });
                    console.log(`📧 [Bounce] SMTP rejection recorded for ${rejectedEmail} (order: ${order.id})`);
                } catch (bounceErr) {
                    console.error(`⚠️ Failed to record bounce for order ${order.id}:`, bounceErr);
                }
            }
        }
    }
}

// Auto-delivery worker
const autoDeliveryWorker = new Worker(
    AUTO_DELIVERY_QUEUE,
    async () => {
        await checkAndAutoDeliver();
    },
    {
        connection,
        concurrency: 1,
    }
);

autoDeliveryWorker.on("completed", () => {
    // Silent - only log if there were deliveries
});

autoDeliveryWorker.on("failed", (job, error) => {
    console.error(`❌ Auto-delivery check failed:`, error.message);
});

autoDeliveryWorker.on("ready", () => {
    console.log("📦 Auto-delivery worker started and ready");
});

// Schedule repeatable job (every 15 minutes)
async function setupAutoDeliverySchedule() {
    // Remove old repeatable jobs first
    const repeatableJobs = await autoDeliveryQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await autoDeliveryQueue.removeRepeatableByKey(job.key);
    }

    // Add new repeatable job - every 15 minutes
    await autoDeliveryQueue.add(
        "check-express-orders",
        {},
        {
            repeat: {
                every: 15 * 60 * 1000, // 15 minutes
            },
        }
    );

    console.log("📦 Auto-delivery scheduled: checking every 15 minutes for express orders");
}

setupAutoDeliverySchedule().catch(console.error);

// ============================================================================
// DELAYED ORDERS BACKUP CHECK (Safety net for orders that should have been delivered)
// ============================================================================

const DELAYED_CHECK_QUEUE = "delayed-orders-check";
const DELAYED_THRESHOLD_HOURS = 72; // Alert if order has song but not delivered after 72h

const delayedCheckQueue = new Queue(DELAYED_CHECK_QUEUE, { connection });

async function checkDelayedOrders() {
    const cutoffTime = new Date(Date.now() - DELAYED_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Find orders that should have been delivered but weren't
    // Includes MAIN, EXTRA_SONG, and GENRE_VARIANT (excludes STREAMING_UPSELL which is manual)
    const delayedOrders = await db.songOrder.findMany({
        where: {
            orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
            status: { in: ["PAID", "IN_PROGRESS"] },
            songFileUrl: { not: null },
            songDeliveredAt: null,
            OR: [
                { paymentCompletedAt: { not: null, lte: cutoffTime } },
                { paymentCompletedAt: null, createdAt: { lte: cutoffTime } },
            ],
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            locale: true,
            orderType: true,
            hasFastDelivery: true,
            paymentCompletedAt: true,
            createdAt: true,
            songFileUrl: true,
            songFileUrl2: true,
        },
    });

    if (delayedOrders.length === 0) {
        console.log("🔍 Delayed check: No delayed orders found");
        return;
    }

    console.log(`🚨 Delayed check: Found ${delayedOrders.length} delayed order(s)!`);

    // Calculate days since payment for each order
    const ordersWithDays = delayedOrders.map((order) => {
        const paymentDate = order.paymentCompletedAt || order.createdAt;
        const daysSincePayment = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
            orderId: order.id,
            recipientName: order.recipientName,
            email: order.email,
            locale: order.locale,
            orderType: order.orderType,
            daysSincePayment,
            hasFastDelivery: order.hasFastDelivery ?? false,
        };
    });

    // Send Telegram alert
    await sendDelayedOrderAlert(ordersWithDays);

    // Attempt auto-delivery for each delayed order
    for (const order of delayedOrders) {
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

            const messageId = await sendEmailCentral({
                to: order.email,
                subject: email.subject,
                html: email.html,
                text: email.text,
                template: "SONG_DELIVERY_BACKUP",
                orderId: order.id,
                metadata: { backupDelivery: true },
            });

            if (!messageId) {
                continue; // Suppressed (bounce, invalid, etc.)
            }

            // Update order status
            const now = new Date();
            await db.songOrder.update({
                where: { id: order.id },
                data: {
                    status: "COMPLETED",
                    songDeliveredAt: now,
                },
            });

            // Also mark child orders as COMPLETED only if they already have audio
            if (order.orderType === "MAIN") {
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
                        songDeliveredAt: now,
                    },
                });
            }

            console.log(`✅ Backup delivery: Sent to ${order.email} (order ${order.id})`);
        } catch (error: any) {
            console.error(`❌ Backup delivery failed for order ${order.id}:`, error);

            if (error?.responseCode === 550 || error?.code === "EENVELOPE") {
                const rejectedEmail = error.rejected?.[0] || order.email;
                const reason = error.response || error.message || "Recipient rejected";
                try {
                    const fullOrder = await db.songOrder.findUnique({
                        where: { id: order.id },
                        select: { status: true, backupWhatsApp: true },
                    });
                    await db.emailBounce.create({
                        data: {
                            bouncedEmail: rejectedEmail,
                            bounceReason: reason.substring(0, 500),
                            bounceType: "hard",
                            originalSubject: `Backup delivery: ${order.recipientName}`,
                            orderId: order.id,
                            orderStatus: fullOrder?.status || "IN_PROGRESS",
                            recipientName: order.recipientName,
                            backupWhatsApp: fullOrder?.backupWhatsApp || null,
                            locale: order.locale,
                        },
                    });
                    const { sendBounceAlert } = await import("../../lib/telegram");
                    await sendBounceAlert({
                        bouncedEmail: rejectedEmail,
                        bounceReason: reason.substring(0, 300),
                        bounceType: "hard",
                        orderId: order.id,
                        orderStatus: fullOrder?.status || "IN_PROGRESS",
                        recipientName: order.recipientName,
                        backupWhatsApp: fullOrder?.backupWhatsApp,
                        locale: order.locale,
                    });
                    console.log(`📧 [Bounce] SMTP rejection recorded for ${rejectedEmail} (order: ${order.id})`);
                } catch (bounceErr) {
                    console.error(`⚠️ Failed to record bounce for order ${order.id}:`, bounceErr);
                }
            }
        }
    }
}

const delayedCheckWorker = new Worker(
    DELAYED_CHECK_QUEUE,
    async () => {
        await checkDelayedOrders();
    },
    {
        connection,
        concurrency: 1,
    }
);

delayedCheckWorker.on("completed", () => {
    // Silent
});

delayedCheckWorker.on("failed", (job, error) => {
    console.error(`❌ Delayed orders check failed:`, error.message);
});

delayedCheckWorker.on("ready", () => {
    console.log("🔍 Delayed orders check worker started and ready");
});

// Schedule repeatable job (every 2 hours)
async function setupDelayedCheckSchedule() {
    const repeatableJobs = await delayedCheckQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await delayedCheckQueue.removeRepeatableByKey(job.key);
    }

    await delayedCheckQueue.add(
        "check-delayed-orders",
        {},
        {
            repeat: {
                every: 2 * 60 * 60 * 1000, // Every 2 hours
            },
        }
    );

    console.log("🔍 Delayed orders check scheduled: every 2 hours");
}

setupDelayedCheckSchedule().catch(console.error);

// ============================================================================
// STREAMING VIP UPSELL WORKER (24h after song delivery)
// ============================================================================

import { buildStreamingVipUpsellEmail } from "../email/streaming-vip-upsell";
import { buildMonthlyReengagementEmail } from "../email/monthly-reengagement";
// isEmailUnsubscribed and isEmailBounced now handled by sendEmailCentral

const STREAMING_VIP_UPSELL_QUEUE = "streaming-vip-upsell";
const STREAMING_VIP_UPSELL_DELAY_HOURS = 24;

const streamingVipUpsellQueue = new Queue(STREAMING_VIP_UPSELL_QUEUE, { connection });

const streamingVipUpsellWorker = new Worker(
    STREAMING_VIP_UPSELL_QUEUE,
    async () => {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - STREAMING_VIP_UPSELL_DELAY_HOURS * 60 * 60 * 1000);

        // Find COMPLETED MAIN orders delivered > 24h ago
        const eligibleOrders = await db.songOrder.findMany({
            where: {
                orderType: "MAIN",
                status: "COMPLETED",
                songDeliveredAt: { not: null, lt: cutoffTime },
            },
            select: {
                id: true,
                email: true,
                recipientName: true,
                locale: true,
                currency: true,
                songDeliveredAt: true,
                childOrders: {
                    where: { orderType: "STREAMING_UPSELL" },
                    select: { id: true },
                },
            },
        });

        // Filter out those who already have streaming upsell
        const ordersWithoutUpsell = eligibleOrders.filter(o => o.childOrders.length === 0);

        if (ordersWithoutUpsell.length === 0) {
            return;
        }

        // Check which orders already received this email
        const alreadySent = await db.sentEmail.findMany({
            where: {
                template: "streaming-vip-upsell",
                orderId: { in: ordersWithoutUpsell.map(o => o.id) },
            },
            select: { orderId: true },
        });
        const alreadySentIds = new Set(alreadySent.map(s => s.orderId));

        const ordersToEmail = ordersWithoutUpsell.filter(o => !alreadySentIds.has(o.id));

        if (ordersToEmail.length === 0) {
            return;
        }

        console.log(`[Streaming VIP Upsell] Found ${ordersToEmail.length} orders to send upsell email`);

        for (const order of ordersToEmail) {
            if (!order.email) continue;

            try {
                const localeSlug = order.locale && order.locale !== "en" ? `/${order.locale}` : "";
                const trackOrderUrl = `${SITE_URL}${localeSlug}/track-order?email=${encodeURIComponent(order.email)}`;

                const emailData = buildStreamingVipUpsellEmail({
                    orderId: order.id,
                    recipientName: order.recipientName || "",
                    email: order.email,
                    locale: order.locale || "pt",
                    currency: order.currency || "BRL",
                    trackOrderUrl,
                });

                const messageId = await sendEmailCentral({
                    to: order.email,
                    subject: emailData.subject,
                    html: emailData.html,
                    text: emailData.text,
                    template: "streaming-vip-upsell",
                    orderId: order.id,
                    metadata: { recipientName: order.recipientName },
                });

                if (messageId) {
                    console.log(`✅ [Streaming VIP Upsell] Email sent to ${order.email} (${order.recipientName})`);
                }
            } catch (error) {
                console.error(`❌ [Streaming VIP Upsell] Failed to send to ${order.email}:`, error);
            }
        }
    },
    {
        connection,
        concurrency: 1,
    }
);

streamingVipUpsellWorker.on("completed", () => {
    // Silent
});

streamingVipUpsellWorker.on("failed", (job, error) => {
    console.error(`❌ [Streaming VIP Upsell] Worker failed:`, error.message);
});

streamingVipUpsellWorker.on("ready", () => {
    console.log("🎧 Streaming VIP Upsell worker started and ready");
});

// Schedule repeatable job (every 2 hours)
async function setupStreamingVipUpsellSchedule() {
    const repeatableJobs = await streamingVipUpsellQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await streamingVipUpsellQueue.removeRepeatableByKey(job.key);
    }

    await streamingVipUpsellQueue.add(
        "check-upsell-eligible",
        {},
        {
            repeat: {
                every: 2 * 60 * 60 * 1000, // Every 2 hours
            },
        }
    );

    console.log("🎧 Streaming VIP Upsell scheduled: checking every 2 hours");
}

setupStreamingVipUpsellSchedule().catch(console.error);

// ============================================================================
// R2 STORAGE + AUTOMATION WORKERS (DistroKid/Suno)
// ============================================================================

import { closeBrowser, resetContext, getGenreDisplayName } from "../services/suno";
import { generateSongsViaKieApi, isKieSunoEnabled } from "../services/suno/kie-api";
import { sendSunoCreditsAlert, sendSunoGenerationAlert, sendDelayedOrderAlert, sendDailyPendingOrdersAlert } from "../../lib/telegram";
import { normalizeVocals } from "../../lib/vocals";
import { sunoGenerationQueue, enqueueSunoGeneration } from "../queues/suno-generation";
import type { SunoJobData } from "../services/suno/types";
import { buildSunoGenerationSignature } from "../services/suno/generation-signature";
import { getSunoAutomationDelayMs } from "../services/suno/automation-delay";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const SUNO_GENERATION_QUEUE = "suno-generation";
const CREDITS_ALERT_THRESHOLD = 50;
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
let sunoHeartbeatTimer: NodeJS.Timeout | null = null;
let sunoRetrySweepTimer: NodeJS.Timeout | null = null;

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
    const validStatus = order.status === "PAID" || order.status === "IN_PROGRESS";
    const hasLyricsReady = order.lyricsStatus === "completed" && Boolean(order.lyrics);
    const missingAnySong = !(order.songFileUrl && order.songFileUrl2);
    return validStatus && hasLyricsReady && missingAnySong;
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
            lyricsStatus: "completed",
            lyrics: { not: null },
            OR: [
                { songFileUrl: null },
                { songFileUrl2: null },
            ],
        },
        select: {
            id: true,
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

// Initialize S3 client for R2
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials are required for worker tasks");
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

/**
 * Upload a song buffer to R2 and return the public URL + object key
 */
async function uploadSongToR2(
    buffer: Buffer,
    orderId: string,
    slot: number
): Promise<UploadedSong> {
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

// ============================================================================
// DISTROKID UPLOAD WORKER
// ============================================================================

type DistrokidUploadJob = {
    orderId: string;
};

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

async function downloadFileFromR2(key: string, localPath: string) {
    if (!R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME not configured");

    const response = await s3Client.send(
        new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        })
    );

    if (!response.Body) throw new Error("File body is empty");

    const buffer = await streamToBuffer(response.Body as Readable);
    await writeFile(localPath, buffer);
}

const DISTROKID_UPLOAD_QUEUE = "distrokid-upload";

const distrokidUploadWorker = new Worker<DistrokidUploadJob>(
    DISTROKID_UPLOAD_QUEUE,
    async (job) => {
        const { orderId } = job.data;
        console.log(`🎸 [DistroKid] Starting upload for order ${orderId}`);

        const order = await db.songOrder.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            throw new Error("Order not found");
        }

        let mp3Key = order.songFileKey;
        let coverKey = order.streamingCoverKey;

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

        if (!mp3Key) throw new Error("MP3 file not found for this order");
        if (!coverKey) throw new Error("Streaming Cover Art not found (upload it first)");

        const songName = order.streamingSongName || order.recipientName;
        if (!songName) throw new Error("Streaming song name not set");

        const existingStreamingOrders = await db.songOrder.findMany({
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
            throw new Error("Streaming song name already used in another active Streaming VIP order");
        }

        const tmpDir = DISTROKID_DOWNLOADS_DIR;
        await mkdir(tmpDir, { recursive: true });

        const mp3Path = path.join(tmpDir, `${orderId}.mp3`);
        const coverPath = path.join(tmpDir, `${orderId}.jpg`);

        console.log(`🎸 [DistroKid] Downloading files for order ${orderId}...`);
        await Promise.all([
            downloadFileFromR2(mp3Key, mp3Path),
            downloadFileFromR2(coverKey, coverPath),
        ]);

        const distrokidEmail = process.env.DISTROKID_EMAIL;
        const distrokidPassword = process.env.DISTROKID_PASSWORD;
        if (!distrokidEmail || !distrokidPassword) {
            throw new Error("DistroKid credentials not set in env");
        }

        const automation = new DistroKidAutomation();
        try {
            console.log("🎸 [DistroKid] Starting automation...");
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
        } finally {
            await automation.close();
            await unlink(mp3Path).catch(() => {});
            await unlink(coverPath).catch(() => {});
        }
    },
    {
        connection,
        concurrency: 1,
    }
);

distrokidUploadWorker.on("completed", (job) => {
    console.log(`✅ [DistroKid] Job completed (${job.id})`);
});

distrokidUploadWorker.on("failed", (job, error) => {
    const jobId = job?.id ?? "unknown";
    const orderId = job?.data?.orderId ?? "unknown";
    console.error(`❌ [DistroKid] Job failed (${jobId}, order ${orderId}):`, error.message);
});

distrokidUploadWorker.on("ready", () => {
    console.log("🎸 DistroKid upload worker started and ready");
});

// ============================================================================
// SPOTIFY AUTO SYNC WORKER (fills Spotify URL for published Streaming VIP orders)
// ============================================================================

const SPOTIFY_AUTO_SYNC_QUEUE = "spotify-auto-sync";

type SpotifyAutoSyncJob = Record<string, never>;

function parseBoundedIntegerEnv(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number
): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

const SPOTIFY_AUTO_SYNC_EVERY_MINUTES = parseBoundedIntegerEnv(
    process.env.SPOTIFY_AUTO_SYNC_EVERY_MINUTES,
    30,
    5,
    720
);
const SPOTIFY_AUTO_SYNC_BATCH_SIZE = parseBoundedIntegerEnv(
    process.env.SPOTIFY_AUTO_SYNC_BATCH_SIZE,
    25,
    1,
    100
);
const SPOTIFY_AUTO_SYNC_INTER_ORDER_DELAY_MS = parseBoundedIntegerEnv(
    process.env.SPOTIFY_AUTO_SYNC_INTER_ORDER_DELAY_MS,
    1500,
    0,
    15000
);
const SPOTIFY_AUTO_SYNC_MARKET = (process.env.SPOTIFY_MARKET || "BR").trim().toUpperCase();
const SPOTIFY_AUTO_SYNC_ARTIST_NAME = (process.env.SPOTIFY_ARTIST_NAME || "ApolloSong.com").trim();

let spotifyConfigWarningShown = false;

const spotifyAutoSyncQueue = new Queue<SpotifyAutoSyncJob>(SPOTIFY_AUTO_SYNC_QUEUE, { connection });

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncStreamingVipSpotifyUrls() {
    if (!isSpotifyApiConfigured()) {
        if (!spotifyConfigWarningShown) {
            spotifyConfigWarningShown = true;
            console.log("⚠️ [Spotify Auto] Missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET; auto-sync disabled.");
        }
        return;
    }

    const pendingOrders = await db.songOrder.findMany({
        where: {
            orderType: "STREAMING_UPSELL",
            status: "IN_PROGRESS",
            spotifyUrl: null,
            streamingSongName: { not: null },
        },
        select: {
            id: true,
            email: true,
            locale: true,
            recipientName: true,
            streamingSongName: true,
            streamingCoverUrl: true,
            parentOrderId: true,
            createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: SPOTIFY_AUTO_SYNC_BATCH_SIZE,
    });

    if (pendingOrders.length === 0) {
        return;
    }

    console.log(`🔎 [Spotify Auto] Checking ${pendingOrders.length} streaming order(s) without Spotify URL...`);

    for (const [index, order] of pendingOrders.entries()) {
        if (index > 0 && SPOTIFY_AUTO_SYNC_INTER_ORDER_DELAY_MS > 0) {
            await sleep(SPOTIFY_AUTO_SYNC_INTER_ORDER_DELAY_MS);
        }

        const songName = order.streamingSongName?.trim();
        if (!songName) continue;

        try {
            const match = await findBestSpotifyTrackMatch({
                songName,
                artistName: SPOTIFY_AUTO_SYNC_ARTIST_NAME || undefined,
                market: SPOTIFY_AUTO_SYNC_MARKET,
            });

            if (!match) {
                console.log(`⏳ [Spotify Auto] Not found yet for order ${order.id} ("${songName}")`);
                continue;
            }

            const latestState = await db.songOrder.findUnique({
                where: { id: order.id },
                select: {
                    status: true,
                    spotifyUrl: true,
                },
            });

            if (!latestState || latestState.spotifyUrl || latestState.status !== "IN_PROGRESS") {
                continue;
            }

            await db.songOrder.update({
                where: { id: order.id },
                data: {
                    spotifyUrl: match.spotifyUrl,
                    status: "COMPLETED",
                    songDeliveredAt: new Date(),
                },
            });

            console.log(
                `✅ [Spotify Auto] Order ${order.id} matched "${match.trackName}" (${match.score.toFixed(3)}): ${match.spotifyUrl}`
            );

            if (order.email) {
                try {
                    const locale = (order.locale || "pt").toLowerCase();
                    const localeSlug = locale !== "en" ? `/${locale}` : "";
                    const trackOrderUrl = `${SITE_URL}${localeSlug}/track-order?email=${encodeURIComponent(order.email)}`;
                    const emailData = buildStreamingVipReadyEmail({
                        orderId: order.id,
                        recipientName: order.recipientName || "",
                        locale,
                        spotifyUrl: match.spotifyUrl,
                        trackOrderUrl,
                        songName,
                        coverUrl: order.streamingCoverUrl || undefined,
                        customerEmail: order.email,
                    });

                    await sendEmailCentral({
                        to: order.email,
                        template: "streaming-vip-ready",
                        orderId: order.id,
                        metadata: { recipientName: order.recipientName },
                        ...emailData,
                    });
                } catch (emailError) {
                    console.error(
                        `❌ [Spotify Auto] Email failed for order ${order.id} (status already completed):`,
                        emailError
                    );
                }
            }

            if (order.parentOrderId) {
                try {
                    const parentOrder = await db.songOrder.findUnique({
                        where: { id: order.parentOrderId },
                        select: { id: true, hasLyrics: true },
                    });
                    if (parentOrder?.hasLyrics) {
                        await enqueuePdfGeneration(parentOrder.id, "low");
                        console.log(
                            `📄 [Spotify Auto] Enqueued PDF regeneration for parent order ${parentOrder.id} (Spotify QR).`
                        );
                    }
                } catch (pdfError) {
                    console.error(`⚠️ [Spotify Auto] Failed to enqueue PDF regeneration for order ${order.id}:`, pdfError);
                }
            }
        } catch (error) {
            if (isSpotifyRateLimitError(error)) {
                const retryAfterMs = error.retryAfterMs ?? 60_000;
                const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
                console.warn(
                    `⏸️ [Spotify Auto] Rate limited after order ${order.id}. Stopping this cycle and retrying later (~${retryAfterSeconds}s).`
                );
                break;
            }
            console.error(`❌ [Spotify Auto] Failed for order ${order.id}:`, error);
        }
    }
}

const spotifyAutoSyncWorker = new Worker<SpotifyAutoSyncJob>(
    SPOTIFY_AUTO_SYNC_QUEUE,
    async () => {
        await syncStreamingVipSpotifyUrls();
    },
    {
        connection,
        concurrency: 1,
    }
);

spotifyAutoSyncWorker.on("completed", () => {
    // Silent
});

spotifyAutoSyncWorker.on("failed", (_job, error) => {
    console.error("❌ [Spotify Auto] Worker run failed:", error.message);
});

spotifyAutoSyncWorker.on("ready", () => {
    console.log("🎧 Spotify auto-sync worker started and ready");
});

async function setupSpotifyAutoSyncSchedule() {
    const repeatableJobs = await spotifyAutoSyncQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await spotifyAutoSyncQueue.removeRepeatableByKey(job.key);
    }

    await spotifyAutoSyncQueue.add(
        "sync-streaming-vip-spotify-urls",
        {},
        {
            repeat: {
                every: SPOTIFY_AUTO_SYNC_EVERY_MINUTES * 60 * 1000,
            },
        }
    );

    console.log(`🎧 Spotify auto-sync scheduled: every ${SPOTIFY_AUTO_SYNC_EVERY_MINUTES} minute(s)`);
}

setupSpotifyAutoSyncSchedule().catch(console.error);

// ============================================================================
// SUNO AI SONG GENERATION WORKER
// ============================================================================

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

        const recipientName = orderSnapshot?.recipientName ?? job.data.recipientName;
        const genre = orderSnapshot?.genre ?? job.data.genre;
        const locale = orderSnapshot?.locale ?? job.data.locale;
        const vocals = normalizeVocals(orderSnapshot?.vocals ?? job.data.vocals);
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
        const customerEmail = orderSnapshot?.email ?? null;
        const customerWhatsApp = orderSnapshot?.backupWhatsApp ?? null;

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

            // Check credits and send alert if low
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
                select: {
                    songFileUrl: true,
                    songFileUrl2: true,
                },
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

            // Upload songs to R2 (only fill missing slots)
            const uploadsBySlot: Array<UploadedSong | null> = [null, null];
            let songIndex = 0;
            for (const slot of missingSlots) {
                const song = result.songs[songIndex];
                if (!song) break;

                console.log(`🎵 [Suno] Uploading song for slot ${slot} to R2 (${song.mp3Buffer.length} bytes)`);

                const upload = await uploadSongToR2(song.mp3Buffer, orderId, slot);
                uploadsBySlot[slot - 1] = upload;
                console.log(`🎵 [Suno] Song for slot ${slot} uploaded: ${upload.url}`);
                songIndex += 1;
            }

            const uploadedCount = uploadsBySlot.filter(Boolean).length;

            // Update order with song URLs and Suno account info
            const sunoAccountEmail = process.env.KIE_SUNO_ACCOUNT_EMAIL?.trim() || "kie-api";
            const uploadedAt = new Date();
            const updateData = {
                status: "IN_PROGRESS" as const,
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

                try {
                    const orderWithLyrics = await db.songOrder.findUnique({
                        where: { id: updatedOrder.id },
                        select: { hasLyrics: true, lyricsPdfA4Url: true },
                    });
                    if (orderWithLyrics?.hasLyrics && !orderWithLyrics.lyricsPdfA4Url) {
                        await pdfGenerationQueue.add("generate-pdf", { orderId: updatedOrder.id, size: "A4" }, { jobId: `pdf_${updatedOrder.id}_A4` });
                        await pdfGenerationQueue.add("generate-pdf", { orderId: updatedOrder.id, size: "A3" }, { jobId: `pdf_${updatedOrder.id}_A3` });
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
                            await karaokeGenerationQueue.add(
                                "generate-karaoke",
                                {
                                    orderId: karaokeChild.id,
                                    parentOrderId: updatedOrder.id,
                                    songFileUrl: parentWithKie.songFileUrl,
                                    kieTaskId: parentWithKie.kieTaskId,
                                    kieAudioId: parentWithKie.kieAudioId1,
                                    kieAudioId2: parentWithKie.kieAudioId2 ?? undefined,
                                },
                                { jobId: `karaoke_${karaokeChild.id}` }
                            );
                            console.log(`🎤 [Suno] Auto-triggered karaoke generation for pre-purchased upsell ${karaokeChild.id}`);
                        }
                    }
                } catch (karaokeErr) {
                    console.error(`⚠️ [Suno] Failed to auto-trigger karaoke for order ${updatedOrder.id}:`, karaokeErr);
                }

                // Send delivery email via central mailer (handles bounce/validation/logging)
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

                    const messageId = await sendEmailCentral({
                        to: updatedOrder.email,
                        subject: email.subject,
                        html: email.html,
                        text: email.text,
                        template: "SONG_DELIVERY_AUTO",
                        orderId: updatedOrder.id,
                        metadata: { autoDelivery: true, expressOrder: isExpressOrder, source: "suno-r2" },
                    });

                    if (messageId) {
                        console.log(`📧 [Suno] Auto-delivery sent for order ${updatedOrder.id} (${updatedOrder.email})`);
                    } else {
                        console.log(`📧 [Suno] Email suppressed for order ${updatedOrder.id}, status already COMPLETED`);
                    }
                } catch (emailError) {
                    console.error(`❌ [Suno] Auto-delivery failed for order ${updatedOrder.id} (status already COMPLETED):`, emailError);
                }
            } else if (updatedOrder.email && !updatedOrder.songDeliveredAt && !hasTwoSongs) {
                console.warn(`⚠️ [Suno] Auto-delivery skipped for order ${updatedOrder.id}: missing song option`);
            } else if (!updatedOrder.email && !updatedOrder.songDeliveredAt && hasTwoSongs) {
                console.warn(`⚠️ [Suno] Auto-delivery skipped for order ${updatedOrder.id}: missing email`);
            }

            // Send success alert
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
        lockDuration: 15 * 60 * 1000, // 15 minutes lock (generation can be slow)
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

/**
 * Enqueue Suno generation after lyrics are completed
 * Called from the lyrics worker when lyricsStatus = completed
 */
async function triggerSunoGeneration(orderId: string) {
    if (!isKieSunoEnabled()) {
        console.warn(`[Suno] ⏸️ Kie API not configured, skipping order ${orderId}`);
        const { sendOperationalAlert } = await import("~/lib/telegram");
        await sendOperationalAlert(`⚠️ <b>Suno API desabilitada</b>\n\nPedido <code>${orderId}</code> precisa de upload manual da música.`);
        return;
    }

	    const order = await db.songOrder.findUnique({
	        where: { id: orderId },
	        select: {
	            id: true,
	            lyrics: true,
	            genre: true,
	            locale: true,
	            vocals: true,
	            recipientName: true,
	            lyricsStatus: true,
	            songFileUrl: true, // Check if already generated
	            songFileUrl2: true,
	            hasFastDelivery: true,
	            planType: true,
	            parentOrderId: true,
	            createdAt: true,
	            paymentCompletedAt: true,
	        },
	    });

    if (!order) {
        console.log(`[Suno] Order ${orderId} not found, skipping Suno generation`);
        return;
    }

    if (order.lyricsStatus !== "completed" || !order.lyrics) {
        console.log(`[Suno] Order ${orderId} lyrics not ready (status: ${order.lyricsStatus}), skipping`);
        return;
    }

    if (order.songFileUrl && order.songFileUrl2) {
        console.log(`[Suno] Order ${orderId} already has songs, skipping Suno generation`);
        return;
    }

    console.log(`[Suno] Enqueueing song generation for order ${orderId}`);

    const expressPriority = 1;
    const standardPriority = 5;
    let priority =
        order.hasFastDelivery || order.planType === "express" || order.planType === "acelerado"
            ? expressPriority
            : standardPriority;
    let parentPlanType: string | null | undefined;
    let parentHasFastDelivery = false;

	    if (order.parentOrderId) {
	        const parent = await db.songOrder.findUnique({
	            where: { id: order.parentOrderId },
	            select: { hasFastDelivery: true, planType: true },
	        });
	        parentPlanType = parent?.planType ?? null;
	        parentHasFastDelivery = Boolean(parent?.hasFastDelivery);
	        if (parentHasFastDelivery || parentPlanType === "express" || parentPlanType === "acelerado") {
	            priority = expressPriority;
	        }
	    }

	    const delay = getSunoAutomationDelayMs({
	        isExpressOrder: priority === expressPriority || parentHasFastDelivery,
	        planType: order.planType,
	        parentPlanType,
	        paymentCompletedAt: order.paymentCompletedAt,
	        createdAt: order.createdAt,
	    });

	    try {
	        await enqueueSunoGeneration({
	            orderId: order.id,
	            lyrics: order.lyrics,
	            genre: order.genre,
	            locale: order.locale,
	            vocals: normalizeVocals(order.vocals),
	            recipientName: order.recipientName,
                generationSignature: buildSunoGenerationSignature({
                    lyrics: order.lyrics,
                    genre: order.genre,
                    locale: order.locale,
                    vocals: normalizeVocals(order.vocals),
                    recipientName: order.recipientName,
                }),
	        }, { priority, delay });
	    } catch (error) {
	        if (error instanceof Error && error.message.includes("already exists")) {
	            console.log(`[Suno] Job already enqueued for order ${order.id}, skipping`);
	            return;
	        }
	        throw error;
	    }
	}

// ============================================================================
// MUSICIAN TIP REMINDER WORKER
// ============================================================================

const MUSICIAN_TIP_REMINDER_QUEUE = "musician-tip-reminder";

type MusicianTipReminderJob = {
    tipOrderId: string;
    stage?: "30min" | "3day";
};

// PIX CPF for donations (Brazilian only)
const PIX_CPF = "011.103.041-29";

type MusicianTipEmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    greeting: string;
    paragraphs: string[];
    cta: string;
    optionalNote: string;
    signoff: string;
    footer: string;
};

type MusicianTipCopyParams = {
    recipientName: string;
    amount: string;
};

const MUSICIAN_TIP_PT_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Sua contribuição faz toda a diferença 💛",
    preheader: "Os músicos que criaram sua canção agradecem",
    headline: "Seu gesto de carinho ficou guardado",
    greeting: "Olá!",
    paragraphs: [
        `Percebemos que você iniciou uma contribuição de ${amount} para os músicos que criaram a canção de ${recipientName}, mas o pagamento não foi concluído.`,
        "Entendemos que imprevistos acontecem. Se ainda quiser ajudar os artistas que dedicaram seu talento para tornar esse momento especial, a opção continua disponível.",
        "Cada centavo vai diretamente para os músicos que trabalharam na sua canção. São pessoas reais, com famílias, que vivem da arte e colocam o coração em cada nota.",
    ],
    cta: "Completar Contribuição",
    optionalNote: "Sua contribuição é 100% opcional. Se preferir não contribuir, ignore este email com tranquilidade.",
    signoff: "Com carinho,\nEquipe Apollo Song",
    footer: "Este é apenas um lembrete gentil. Obrigado por fazer parte da nossa comunidade!",
});

const MUSICIAN_TIP_EN_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Your contribution makes all the difference 💛",
    preheader: "The musicians who created your song thank you",
    headline: "Your gesture of kindness was saved",
    greeting: "Hello!",
    paragraphs: [
        `We noticed you started a contribution of ${amount} for the musicians who created ${recipientName}'s song, but the payment wasn't completed.`,
        "We understand that things come up. If you still want to help the artists who dedicated their talent to make this moment special, the option is still available.",
        "Every cent goes directly to the musicians who worked on your song. They are real people, with families, who live from their art and put their heart into every note.",
    ],
    cta: "Complete Contribution",
    optionalNote: "Your contribution is 100% optional. If you prefer not to contribute, feel free to ignore this email.",
    signoff: "With care,\nThe ApolloSong Team",
    footer: "This is just a gentle reminder. Thank you for being part of our community!",
});

const MUSICIAN_TIP_ES_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Tu contribución hace toda la diferencia 💛",
    preheader: "Los músicos que crearon tu canción te lo agradecen",
    headline: "Tu gesto de cariño quedó guardado",
    greeting: "¡Hola!",
    paragraphs: [
        `Notamos que iniciaste una contribución de ${amount} para los músicos que crearon la canción de ${recipientName}, pero el pago no se completó.`,
        "Entendemos que imprevistos suceden. Si aún quieres ayudar a los artistas que dedicaron su talento para hacer este momento especial, la opción sigue disponible.",
        "Cada centavo va directamente a los músicos que trabajaron en tu canción. Son personas reales, con familias, que viven del arte y ponen el corazón en cada nota.",
    ],
    cta: "Completar Contribución",
    optionalNote: "Tu contribución es 100% opcional. Si prefieres no contribuir, ignora este correo con tranquilidad.",
    signoff: "Con cariño,\nEl equipo de ApolloSong",
    footer: "Este es solo un recordatorio amable. ¡Gracias por ser parte de nuestra comunidad!",
});

const MUSICIAN_TIP_FR_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Votre contribution fait toute la différence 💛",
    preheader: "Les musiciens qui ont créé votre chanson vous remercient",
    headline: "Votre geste de gentillesse a été conservé",
    greeting: "Bonjour !",
    paragraphs: [
        `Nous avons remarqué que vous avez commencé une contribution de ${amount} pour les musiciens qui ont créé la chanson de ${recipientName}, mais le paiement n'a pas été finalisé.`,
        "Nous comprenons que des imprévus arrivent. Si vous souhaitez toujours aider les artistes qui ont dédié leur talent pour rendre ce moment spécial, l'option est toujours disponible.",
        "Chaque centime va directement aux musiciens qui ont travaillé sur votre chanson. Ce sont de vraies personnes, avec des familles, qui vivent de leur art et mettent leur cœur dans chaque note.",
    ],
    cta: "Finaliser la Contribution",
    optionalNote: "Votre contribution est 100% optionnelle. Si vous préférez ne pas contribuer, ignorez cet email sans souci.",
    signoff: "Avec affection,\nL'équipe ChansonDivine",
    footer: "Ceci n'est qu'un rappel amical. Merci de faire partie de notre communauté !",
});

const MUSICIAN_TIP_IT_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Il tuo contributo fa tutta la differenza 💛",
    preheader: "I musicisti che hanno creato la tua canzone ti ringraziano",
    headline: "Il tuo gesto di gentilezza è stato conservato",
    greeting: "Ciao!",
    paragraphs: [
        `Abbiamo notato che hai iniziato un contributo di ${amount} per i musicisti che hanno creato la canzone di ${recipientName}, ma il pagamento non è stato completato.`,
        "Capiamo che gli imprevisti succedono. Se vuoi ancora aiutare gli artisti che hanno dedicato il loro talento per rendere speciale questo momento, l'opzione è ancora disponibile.",
        "Ogni centesimo va direttamente ai musicisti che hanno lavorato alla tua canzone. Sono persone vere, con famiglie, che vivono della loro arte e mettono il cuore in ogni nota.",
    ],
    cta: "Completare il Contributo",
    optionalNote: "Il tuo contributo è 100% opzionale. Se preferisci non contribuire, ignora questa email senza problemi.",
    signoff: "Con affetto,\nIl team ApolloSong",
    footer: "Questo è solo un gentile promemoria. Grazie per far parte della nostra comunità!",
});

const MUSICIAN_TIP_COPY_BY_LOCALE: Record<SupportedLocale, (params: MusicianTipCopyParams) => MusicianTipEmailTemplate> = {
    en: MUSICIAN_TIP_EN_COPY,
    pt: MUSICIAN_TIP_PT_COPY,
    es: MUSICIAN_TIP_ES_COPY,
    fr: MUSICIAN_TIP_FR_COPY,
    it: MUSICIAN_TIP_IT_COPY,
};

// ---- 3-day follow-up copies (different wording) ----

const MUSICIAN_TIP_3DAY_PT_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Os músicos da canção de " + recipientName + " ainda contam com você 🎵",
    preheader: "Sua contribuição transforma a vida de quem faz arte",
    headline: "Uma pequena atitude, um grande impacto",
    greeting: "Olá!",
    paragraphs: [
        `Há alguns dias, você demonstrou interesse em contribuir com ${amount} para os músicos que criaram a canção de ${recipientName}. Sabemos que o dia a dia é corrido e às vezes as coisas ficam para depois.`,
        "Queremos que saiba que os artistas que compuseram e produziram essa homenagem ficaram muito felizes em participar desse momento tão especial. Seu apoio, por menor que pareça, ajuda a manter esse trabalho vivo.",
        "Se ainda quiser fazer a diferença na vida desses músicos, o link continua disponível. Será muito bem-vindo!",
    ],
    cta: "Apoiar os Músicos",
    optionalNote: "Lembrando: a contribuição é totalmente voluntária. Se preferir não contribuir, tudo bem — ficamos felizes que a canção tenha tocado o seu coração.",
    signoff: "Com gratidão,\nEquipe Apollo Song",
    footer: "Este é nosso último lembrete sobre esta contribuição. Obrigado!",
});

const MUSICIAN_TIP_3DAY_EN_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "The musicians behind " + recipientName + "'s song still appreciate your support 🎵",
    preheader: "Your contribution transforms the lives of those who create art",
    headline: "A small gesture, a big impact",
    greeting: "Hello!",
    paragraphs: [
        `A few days ago, you showed interest in contributing ${amount} to the musicians who created ${recipientName}'s song. We know life gets busy and sometimes things get put off.`,
        "We want you to know that the artists who composed and produced this tribute were truly happy to be part of such a special moment. Your support, no matter how small, helps keep this work alive.",
        "If you'd still like to make a difference in these musicians' lives, the link is still available. It would be greatly appreciated!",
    ],
    cta: "Support the Musicians",
    optionalNote: "Just a reminder: the contribution is entirely voluntary. If you prefer not to contribute, that's perfectly fine — we're glad the song touched your heart.",
    signoff: "With gratitude,\nThe ApolloSong Team",
    footer: "This is our last reminder about this contribution. Thank you!",
});

const MUSICIAN_TIP_3DAY_ES_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Los músicos de la canción de " + recipientName + " aún cuentan contigo 🎵",
    preheader: "Tu contribución transforma la vida de quienes hacen arte",
    headline: "Un pequeño gesto, un gran impacto",
    greeting: "¡Hola!",
    paragraphs: [
        `Hace unos días, mostraste interés en contribuir con ${amount} para los músicos que crearon la canción de ${recipientName}. Sabemos que la vida es agitada y a veces las cosas quedan para después.`,
        "Queremos que sepas que los artistas que compusieron y produjeron este homenaje se sintieron muy felices de participar en un momento tan especial. Tu apoyo, por pequeño que parezca, ayuda a mantener vivo este trabajo.",
        "Si aún quieres hacer la diferencia en la vida de estos músicos, el enlace sigue disponible. ¡Será muy bienvenido!",
    ],
    cta: "Apoyar a los Músicos",
    optionalNote: "Recuerda: la contribución es totalmente voluntaria. Si prefieres no contribuir, está bien — nos alegra que la canción haya tocado tu corazón.",
    signoff: "Con gratitud,\nEl equipo de ApolloSong",
    footer: "Este es nuestro último recordatorio sobre esta contribución. ¡Gracias!",
});

const MUSICIAN_TIP_3DAY_FR_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "Les musiciens de la chanson de " + recipientName + " comptent encore sur vous 🎵",
    preheader: "Votre contribution transforme la vie de ceux qui créent de l'art",
    headline: "Un petit geste, un grand impact",
    greeting: "Bonjour !",
    paragraphs: [
        `Il y a quelques jours, vous avez montré de l'intérêt pour une contribution de ${amount} aux musiciens qui ont créé la chanson de ${recipientName}. Nous savons que la vie est chargée et que parfois les choses sont remises à plus tard.`,
        "Nous tenons à vous dire que les artistes qui ont composé et produit cet hommage étaient très heureux de participer à ce moment si spécial. Votre soutien, aussi modeste soit-il, aide à maintenir ce travail vivant.",
        "Si vous souhaitez encore faire la différence dans la vie de ces musiciens, le lien est toujours disponible. Ce serait très apprécié !",
    ],
    cta: "Soutenir les Musiciens",
    optionalNote: "Pour rappel : la contribution est entièrement volontaire. Si vous préférez ne pas contribuer, c'est tout à fait normal — nous sommes ravis que la chanson ait touché votre cœur.",
    signoff: "Avec gratitude,\nL'équipe ChansonDivine",
    footer: "Ceci est notre dernier rappel concernant cette contribution. Merci !",
});

const MUSICIAN_TIP_3DAY_IT_COPY = ({ recipientName, amount }: MusicianTipCopyParams): MusicianTipEmailTemplate => ({
    subject: "I musicisti della canzone di " + recipientName + " contano ancora su di te 🎵",
    preheader: "Il tuo contributo trasforma la vita di chi crea arte",
    headline: "Un piccolo gesto, un grande impatto",
    greeting: "Ciao!",
    paragraphs: [
        `Qualche giorno fa, hai mostrato interesse a contribuire con ${amount} per i musicisti che hanno creato la canzone di ${recipientName}. Sappiamo che la vita è frenetica e a volte le cose vengono rimandate.`,
        "Vogliamo che tu sappia che gli artisti che hanno composto e prodotto questo omaggio sono stati molto felici di partecipare a un momento così speciale. Il tuo supporto, per quanto piccolo possa sembrare, aiuta a mantenere vivo questo lavoro.",
        "Se vuoi ancora fare la differenza nella vita di questi musicisti, il link è ancora disponibile. Sarà molto apprezzato!",
    ],
    cta: "Supportare i Musicisti",
    optionalNote: "Ricorda: il contributo è completamente volontario. Se preferisci non contribuire, va benissimo — siamo felici che la canzone abbia toccato il tuo cuore.",
    signoff: "Con gratitudine,\nIl team ApolloSong",
    footer: "Questo è il nostro ultimo promemoria riguardo a questo contributo. Grazie!",
});

const MUSICIAN_TIP_3DAY_COPY_BY_LOCALE: Record<SupportedLocale, (params: MusicianTipCopyParams) => MusicianTipEmailTemplate> = {
    en: MUSICIAN_TIP_3DAY_EN_COPY,
    pt: MUSICIAN_TIP_3DAY_PT_COPY,
    es: MUSICIAN_TIP_3DAY_ES_COPY,
    fr: MUSICIAN_TIP_3DAY_FR_COPY,
    it: MUSICIAN_TIP_3DAY_IT_COPY,
};

const musicianTipDefaultNames: Record<SupportedLocale, string> = {
    en: "someone special",
    pt: "alguém especial",
    es: "alguien especial",
    fr: "quelqu'un de spécial",
    it: "qualcuno di speciale",
};

const musicianTipBrandNames: Record<SupportedLocale, string> = {
    en: "ApolloSong",
    pt: "Apollo Song",
    es: "ApolloSong",
    fr: "ChansonDivine",
    it: "ApolloSong",
};

const musicianTipOrderLabels: Record<SupportedLocale, string> = {
    en: "Order",
    pt: "Pedido",
    es: "Pedido",
    fr: "Commande",
    it: "Ordine",
};

const pixCopy = {
    title: "Prefere PIX? É instantâneo e sem taxas:",
    subtitle: "Chave PIX (CPF)",
    anyValue: "Qualquer valor é bem-vindo 💚",
};

function formatTipPrice(priceInCents: number, currency: string, locale: SupportedLocale) {
    const price = priceInCents / 100;
    const localeMap: Record<SupportedLocale, string> = {
        en: "en-US",
        pt: "pt-BR",
        es: "es-ES",
        fr: "fr-FR",
        it: "it-IT",
    };
    try {
        return new Intl.NumberFormat(localeMap[locale], {
            style: "currency",
            currency,
        }).format(price);
    } catch {
        const fallbacks: Record<SupportedLocale, string> = {
            en: `$${price.toFixed(2)}`,
            pt: `R$${price.toFixed(2)}`,
            es: `$${price.toFixed(2)}`,
            fr: `${price.toFixed(2)}€`,
            it: `${price.toFixed(2)}€`,
        };
        return fallbacks[locale];
    }
}

function buildMusicianTipReminderEmail(data: {
    recipientName?: string | null;
    locale?: string | null;
    tipAmount: number;
    currency: string;
    checkoutUrl: string;
    parentOrderId: string;
    stage?: "30min" | "3day";
}) {
    const locale = getLocale(data.locale || "en");
    const recipientName = data.recipientName?.trim() || musicianTipDefaultNames[locale];
    const amount = formatTipPrice(data.tipAmount, data.currency, locale);

    const copyMap = data.stage === "3day" ? MUSICIAN_TIP_3DAY_COPY_BY_LOCALE : MUSICIAN_TIP_COPY_BY_LOCALE;
    const template = copyMap[locale]({
        recipientName,
        amount,
    });

    const safeCheckoutUrl = escapeHtml(data.checkoutUrl);
    const brandName = musicianTipBrandNames[locale];
    const orderLabel = musicianTipOrderLabels[locale];

    const htmlParagraphs = template.paragraphs
        .map((paragraph) => `<p style="margin:0 0 18px;line-height:1.7;color:#2b2b2b;font-size:17px;">${escapeHtml(paragraph)}</p>`)
        .join("");

    // PIX section only for PT locale
    const pixSection = locale === "pt" ? `
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:32px 0;">
                  <tr>
                    <td align="center">
                      <p style="margin:0 0 16px;color:#666666 !important;font-size:16px;font-weight:600;">
                        ${escapeHtml(pixCopy.title)}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#00A884;border-radius:20px;">
                        <tr>
                          <td style="padding:28px 24px;text-align:center;min-width:280px;">
                            <p style="margin:0 0 8px;color:#ffffff !important;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                              ${escapeHtml(pixCopy.subtitle)}
                            </p>
                            <p style="margin:0 0 12px;color:#ffffff !important;font-size:32px;font-weight:bold;letter-spacing:3px;font-family:'Courier New', monospace;">
                              ${PIX_CPF}
                            </p>
                            <p style="margin:0 0 12px;color:#ffffff !important;font-size:14px;font-weight:500;">
                              (Thiago - Nu Bank)
                            </p>
                            <p style="margin:0;color:#ffffff !important;font-size:14px;">
                              ${escapeHtml(pixCopy.anyValue)}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>` : "";

    const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(template.subject)}</title>
  </head>
  <body style="margin:0;background:#f8f5f0;font-family:Arial, sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(template.preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;">
            <tr>
              <td style="padding:36px 32px 28px;">
                <p style="margin:0 0 8px;color:#0A0E1A;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;">${escapeHtml(brandName)}</p>
                <h1 style="margin:0 0 28px;font-size:26px;line-height:1.3;color:#1d1d1d;">${escapeHtml(template.headline)}</h1>
                <p style="margin:0 0 22px;line-height:1.7;color:#2b2b2b;font-size:17px;">${escapeHtml(template.greeting)}</p>
                ${htmlParagraphs}
                <div style="text-align:center;margin:28px 0;">
                  <a href="${safeCheckoutUrl}" style="display:inline-block;padding:16px 32px;background-color:#0A0E1A;color:#ffffff !important;text-decoration:none;border-radius:14px;font-weight:700;font-size:16px;">${escapeHtml(template.cta)}</a>
                </div>
                ${pixSection}
                <div style="margin:28px 0;padding:20px;background:#fef9f7;border-radius:12px;border-left:4px solid #0A0E1A;">
                  <p style="margin:0;color:#6f6f6f;font-size:14px;line-height:1.6;font-style:italic;">
                    ${escapeHtml(template.optionalNote)}
                  </p>
                </div>
                <p style="margin:24px 0 0;color:#6f6f6f;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(template.signoff)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9f7f5;border-radius:0 0 24px 24px;">
                <p style="margin:0;color:#9a9a9a;font-size:12px;line-height:1.5;text-align:center;">
                  ${escapeHtml(template.footer)}
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:#9a9a9a;font-size:11px;">${escapeHtml(orderLabel)}: ${escapeHtml(data.parentOrderId)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    // Plain text version
    const textParts = [
        template.headline,
        "",
        template.greeting,
        "",
        ...template.paragraphs,
        "",
        `${template.cta}: ${data.checkoutUrl}`,
        "",
    ];

    // Add PIX info for PT locale
    if (locale === "pt") {
        textParts.push(
            pixCopy.title,
            `${pixCopy.subtitle}: ${PIX_CPF}`,
            pixCopy.anyValue,
            ""
        );
    }

    textParts.push(
        template.optionalNote,
        "",
        template.signoff,
        "",
        template.footer,
        "",
        `${orderLabel}: ${data.parentOrderId}`
    );

    const text = textParts.join("\n");

    return {
        subject: template.subject,
        html,
        text,
    };
}

const musicianTipReminderWorker = new Worker<MusicianTipReminderJob>(
    MUSICIAN_TIP_REMINDER_QUEUE,
    async (job) => {
        const { tipOrderId, stage = "30min" } = job.data;

        // Fetch tip order
        const tipOrder = await db.songOrder.findUnique({
            where: { id: tipOrderId },
            select: {
                id: true,
                email: true,
                recipientName: true,
                locale: true,
                currency: true,
                priceAtOrder: true,
                status: true,
                orderType: true,
                parentOrderId: true,
            },
        });

        if (!tipOrder) {
            console.log(`[MusicianTip] Tip order ${tipOrderId} not found, skipping`);
            return { skipped: true, reason: "Order not found" };
        }

        // Only send if still PENDING (not paid)
        if (tipOrder.status !== "PENDING") {
            console.log(`[MusicianTip] Tip order ${tipOrderId} status is ${tipOrder.status}, skipping reminder`);
            return { skipped: true, reason: `Status is ${tipOrder.status}` };
        }

        // Verify it's a MUSICIAN_TIP order
        if (tipOrder.orderType !== "MUSICIAN_TIP") {
            console.log(`[MusicianTip] Order ${tipOrderId} is not a MUSICIAN_TIP, skipping`);
            return { skipped: true, reason: `Order type is ${tipOrder.orderType}` };
        }

        if (!tipOrder.email) {
            console.log(`[MusicianTip] Tip order ${tipOrderId} has no email, skipping`);
            return { skipped: true, reason: "No email" };
        }

        const checkoutUrl = new URL(
            `/${tipOrder.locale || "en"}/order/${tipOrder.parentOrderId}`,
            SITE_URL
        ).toString();

        const email = buildMusicianTipReminderEmail({
            recipientName: tipOrder.recipientName,
            locale: tipOrder.locale,
            tipAmount: tipOrder.priceAtOrder,
            currency: tipOrder.currency,
            checkoutUrl,
            parentOrderId: tipOrder.parentOrderId || tipOrder.id,
            stage,
        });

        const tipTemplate = stage === "3day" ? "MUSICIAN_TIP_REMINDER_3DAY" : "MUSICIAN_TIP_REMINDER";
        const messageId = await sendEmailCentral({
            to: tipOrder.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            template: tipTemplate,
            orderId: tipOrderId,
        });

        if (!messageId) {
            return { skipped: true, reason: "Email suppressed" };
        }

        console.log(`✅ [MusicianTip] Reminder sent for tip order ${tipOrderId}`);
        return { sent: true, email: tipOrder.email };
    },
    {
        connection,
        concurrency: 5,
    }
);

musicianTipReminderWorker.on("completed", (job) => {
    console.log(`✅ [MusicianTip] Worker completed for tip ${job.data.tipOrderId}`);
});

musicianTipReminderWorker.on("failed", (job, error) => {
    console.error(
        `❌ [MusicianTip] Worker failed for tip ${job?.data.tipOrderId ?? "unknown"}:`,
        error.message
    );
});

musicianTipReminderWorker.on("ready", () => {
    console.log("💛 Musician tip reminder worker started and ready");
});

// ============================================================================
// MONTHLY REENGAGEMENT WORKER (1 month after song delivery)
// ============================================================================

const MONTHLY_REENGAGEMENT_QUEUE = "monthly-reengagement";
const MONTHLY_REENGAGEMENT_DELAY_DAYS = 30;

const monthlyReengagementQueue = new Queue(MONTHLY_REENGAGEMENT_QUEUE, { connection });

const monthlyReengagementWorker = new Worker(
    MONTHLY_REENGAGEMENT_QUEUE,
    async () => {
        const now = new Date();
        // Find orders delivered exactly 30 days ago (with 24h window)
        const targetDate = new Date(now.getTime() - MONTHLY_REENGAGEMENT_DELAY_DAYS * 24 * 60 * 60 * 1000);
        const minDate = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000); // 29 days ago
        const maxDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000); // 31 days ago

        // Find COMPLETED MAIN orders delivered ~30 days ago
        const eligibleOrders = await db.songOrder.findMany({
            where: {
                orderType: "MAIN",
                status: "COMPLETED",
                songDeliveredAt: {
                    not: null,
                    gte: minDate,
                    lte: maxDate,
                },
            },
            select: {
                id: true,
                email: true,
                recipientName: true,
                locale: true,
                currency: true,
                songDeliveredAt: true,
            },
        });

        if (eligibleOrders.length === 0) {
            return;
        }

        // Check which orders already received this email
        const alreadySent = await db.sentEmail.findMany({
            where: {
                template: "monthly-reengagement",
                orderId: { in: eligibleOrders.map(o => o.id) },
            },
            select: { orderId: true },
        });
        const alreadySentIds = new Set(alreadySent.map(s => s.orderId));

        const ordersToEmail = eligibleOrders.filter(o => !alreadySentIds.has(o.id));

        if (ordersToEmail.length === 0) {
            return;
        }

        console.log(`[Monthly Reengagement] Found ${ordersToEmail.length} orders to send reengagement email`);

        for (const order of ordersToEmail) {
            if (!order.email) continue;

            try {
                const localeSlug = order.locale && order.locale !== "en" ? `/${order.locale}` : "";
                const quizUrl = `${SITE_URL}${localeSlug}`;

                const emailData = buildMonthlyReengagementEmail({
                    orderId: order.id,
                    recipientName: order.recipientName || "",
                    email: order.email,
                    locale: order.locale || "pt",
                    currency: order.currency || "BRL",
                    quizUrl,
                    customerEmail: order.email,
                });

                const messageId = await sendEmailCentral({
                    to: order.email,
                    subject: emailData.subject,
                    html: emailData.html,
                    text: emailData.text,
                    template: "monthly-reengagement",
                    orderId: order.id,
                    metadata: { recipientName: order.recipientName },
                });

                if (messageId) {
                    console.log(`✅ [Monthly Reengagement] Email sent to ${order.email} (${order.recipientName})`);
                }
            } catch (error) {
                console.error(`❌ [Monthly Reengagement] Failed to send to ${order.email}:`, error);
            }
        }
    },
    {
        connection,
        concurrency: 1,
    }
);

monthlyReengagementWorker.on("completed", () => {
    // Silent
});

monthlyReengagementWorker.on("failed", (job, error) => {
    console.error(`❌ [Monthly Reengagement] Worker failed:`, error.message);
});

monthlyReengagementWorker.on("ready", () => {
    console.log("📅 Monthly Reengagement worker started and ready");
});

// Schedule repeatable job (every 6 hours)
async function setupMonthlyReengagementSchedule() {
    const repeatableJobs = await monthlyReengagementQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await monthlyReengagementQueue.removeRepeatableByKey(job.key);
    }

    await monthlyReengagementQueue.add(
        "check-reengagement-eligible",
        {},
        {
            repeat: {
                every: 6 * 60 * 60 * 1000, // Every 6 hours
            },
        }
    );

    console.log("📅 Monthly Reengagement scheduled: checking every 6 hours");
}

setupMonthlyReengagementSchedule().catch(console.error);

// ============================================================================
// DAILY PENDING ORDERS ALERT (Orders waiting for lyrics/music)
// ============================================================================

const DAILY_PENDING_ALERT_QUEUE = "daily-pending-orders-alert";

const dailyPendingAlertQueue = new Queue(DAILY_PENDING_ALERT_QUEUE, { connection });

async function checkPendingOrdersForDailyAlert() {
    const now = new Date();

    // Find orders that are PAID or IN_PROGRESS and past their delivery threshold
    // Excludes STREAMING_UPSELL (manual process)
    const pendingOrders = await db.songOrder.findMany({
        where: {
            orderType: { in: ["MAIN", "EXTRA_SONG", "GENRE_VARIANT"] },
            status: { in: ["PAID", "IN_PROGRESS"] },
            paymentCompletedAt: { not: null },
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            locale: true,
            status: true,
            hasFastDelivery: true,
            paymentCompletedAt: true,
            lyrics: true,
            songFileUrl: true,
        },
    });

    // Filter to only orders that are past their threshold
    const delayedOrders = pendingOrders.filter(order => {
        if (!order.paymentCompletedAt) return false;
        const hoursSincePaid = (now.getTime() - order.paymentCompletedAt.getTime()) / (1000 * 60 * 60);
        const threshold = order.hasFastDelivery ? 12 : 48;
        return hoursSincePaid > threshold;
    });

    if (delayedOrders.length === 0) {
        console.log("📊 Daily pending check: No delayed orders found");
        return;
    }

    console.log(`📊 Daily pending check: Found ${delayedOrders.length} delayed order(s)`);

    // Build alert data
    const alertData = delayedOrders.map(order => {
        const hoursSincePayment = (now.getTime() - order.paymentCompletedAt!.getTime()) / (1000 * 60 * 60);
        const threshold = order.hasFastDelivery ? 12 : 48;
        const hoursLate = hoursSincePayment - threshold;

        return {
            orderId: order.id,
            recipientName: order.recipientName,
            email: order.email,
            locale: order.locale,
            status: order.status,
            hasFastDelivery: order.hasFastDelivery ?? false,
            hasLyrics: !!(order.lyrics && order.lyrics.length > 50),
            hasSong: !!order.songFileUrl,
            hoursSincePayment: Math.round(hoursSincePayment),
            hoursLate,
        };
    });

    await sendDailyPendingOrdersAlert(alertData);
}

const dailyPendingAlertWorker = new Worker(
    DAILY_PENDING_ALERT_QUEUE,
    async () => {
        await checkPendingOrdersForDailyAlert();
    },
    {
        connection,
        concurrency: 1,
    }
);

dailyPendingAlertWorker.on("completed", () => {
    console.log("📊 Daily pending orders alert completed");
});

dailyPendingAlertWorker.on("failed", (job, error) => {
    console.error(`❌ Daily pending orders alert failed:`, error.message);
});

dailyPendingAlertWorker.on("ready", () => {
    console.log("📊 Daily pending orders alert worker started and ready");
});

// Schedule repeatable job (once per day at 9 AM BRT / 12 PM UTC)
async function setupDailyPendingAlertSchedule() {
    const repeatableJobs = await dailyPendingAlertQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await dailyPendingAlertQueue.removeRepeatableByKey(job.key);
    }

    await dailyPendingAlertQueue.add(
        "daily-pending-alert",
        {},
        {
            repeat: {
                pattern: "0 12 * * *", // Every day at 12:00 UTC (9:00 AM BRT)
            },
        }
    );

    console.log("📊 Daily pending orders alert scheduled: every day at 9 AM BRT (12 PM UTC)");
}

setupDailyPendingAlertSchedule().catch(console.error);

// ============================================================================
// PDF GENERATION WORKER
// ============================================================================
const PDF_GENERATION_QUEUE = "pdf-generation";

type PdfGenerationJob = {
    orderId: string;
    size: "A4" | "A3";
};

const pdfGenerationQueue = new Queue<PdfGenerationJob>(PDF_GENERATION_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 30000 },
    },
});

function capitalizeTitle(text: string): string {
    const smallWords = new Set([
        "a", "e", "o", "as", "os", "de", "da", "do", "das", "dos",
        "em", "na", "no", "nas", "nos", "por", "para", "com", "sem",
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    ]);
    return text.toLowerCase().split(" ").map((word, i) =>
        i === 0 || !smallWords.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word
    ).join(" ");
}

const pdfGenerationWorker = new Worker<PdfGenerationJob>(
    PDF_GENERATION_QUEUE,
    async (job) => {
        const { orderId, size } = job.data;
        console.log(`📄 [PDF] Generating ${size} PDF for order ${orderId}`);

        const order = await db.songOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true, recipientName: true, recipient: true, lyrics: true, correctedLyrics: true, displayLyrics: true,
                locale: true, hasLyrics: true, status: true, orderType: true,
                parentOrderId: true, streamingSongName: true, lyricsPdfSongName: true, genre: true,
                parentOrder: { select: { hasLyrics: true } },
                childOrders: {
                    select: { hasLyrics: true, orderType: true, streamingSongName: true, spotifyUrl: true },
                },
            },
        });

        if (!order) throw new Error(`Order ${orderId} not found`);

        // Get target order (parent if needed) - use own lyrics if available
        const hasLyricsUpsell = order.childOrders?.some((c) => c.orderType === "LYRICS_UPSELL" && c.hasLyrics);
        const hasOwnLyricsContent = !!(order.displayLyrics || order.correctedLyrics || order.lyrics);
        const shouldUseParent = (order.orderType === "LYRICS_UPSELL" || order.orderType === "GENRE_VARIANT" || order.orderType === "EXTRA_SONG") && order.parentOrderId && !order.hasLyrics && !hasLyricsUpsell && !hasOwnLyricsContent;
        const targetOrder = shouldUseParent
            ? await db.songOrder.findUnique({
                where: { id: order.parentOrderId! },
                select: { id: true, recipientName: true, recipient: true, lyrics: true, correctedLyrics: true, displayLyrics: true, locale: true, hasLyrics: true, status: true, streamingSongName: true, lyricsPdfSongName: true, genre: true },
            })
            : order;

        if (!targetOrder) throw new Error(`Target order not found`);
        if (!targetOrder.hasLyrics && !hasLyricsUpsell && !order.parentOrder?.hasLyrics) {
            console.log(`📄 [PDF] Order ${orderId} has no lyrics, skipping`);
            return;
        }
        // Use canonical lyrics field (matches the music)
        const rawLyrics = targetOrder.displayLyrics || targetOrder.correctedLyrics || targetOrder.lyrics;
        if (!rawLyrics) throw new Error("Lyrics not available");
        const cleanLyrics = stripLyricsTags(rawLyrics);

        const streamingUpsell = order.childOrders?.find((c) => c.orderType === "STREAMING_UPSELL");
        const rawSongName = targetOrder.lyricsPdfSongName || targetOrder.streamingSongName || streamingUpsell?.streamingSongName;
        const songName = rawSongName ? capitalizeTitle(rawSongName) : undefined;
        const spotifyUrl = streamingUpsell?.spotifyUrl || undefined;

        let spotifyQrCodeDataUrl: string | undefined;
        if (spotifyUrl) {
            try {
                spotifyQrCodeDataUrl = await QRCode.toDataURL(spotifyUrl, {
                    width: 120, margin: 1, color: { dark: "#3D3929", light: "#FFFDF8" },
                });
            } catch (e) { console.error("[PDF] QR code error:", e); }
        }

        const isGroup = targetOrder.recipient === "group";
        const firstName = targetOrder.recipientName.trim().split(/\s+/)[0] || targetOrder.recipientName;
        const pdfRecipientName = isGroup ? (songName || capitalizeTitle(firstName)) : capitalizeTitle(firstName);

        const html = generateFrameableLyricsHtml({
            recipientName: pdfRecipientName,
            lyrics: cleanLyrics,
            locale: targetOrder.locale || "en",
            size: size as PaperSize,
            songName: isGroup ? undefined : songName,
            genre: targetOrder.genre || undefined,
            spotifyUrl,
            spotifyQrCodeDataUrl,
        });

        const pdfBuffer = await generatePdfFromHtml({ html, size: size as PaperSize });
        // Version the object key to avoid stale edge caches when regenerating PDFs for the same order.
        const filename = `lyrics-pdf/${orderId}/${size.toLowerCase()}-${Date.now()}.pdf`;
        const pdfUrl = await StorageService.uploadBuffer(filename, pdfBuffer, "application/pdf");

        const updateField = size === "A4" ? "lyricsPdfA4Url" : "lyricsPdfA3Url";
        await db.songOrder.update({
            where: { id: orderId },
            data: {
                [updateField]: pdfUrl,
                lyricsPdfGeneratedAt: new Date(),
            },
        });

        console.log(`✅ [PDF] ${size} PDF generated: ${pdfUrl}`);
    },
    { connection, concurrency: 3 }
);

pdfGenerationWorker.on("completed", (job) => console.log(`📄 [PDF] Job ${job.id} completed`));
pdfGenerationWorker.on("failed", (job, err) => console.error(`❌ [PDF] Job ${job?.id} failed:`, err.message));
pdfGenerationWorker.on("ready", () => console.log("📄 PDF generation worker started and ready (concurrency: 3)"));

// ============================================================================
// EMAIL POLLING WORKER (IMAP -> Support Tickets)
// ============================================================================

const IMAP_HOST = process.env.IMAP_HOST;
const IMAP_PORT = parseInt(process.env.IMAP_PORT || "993", 10);
const IMAP_USER = process.env.SMTP_USER; // Reuse SMTP credentials (MX Route)
const IMAP_PASSWORD = process.env.SMTP_PASSWORD;
const SUPPORT_EMAIL = process.env.SMTP_FROM;

const EMAIL_POLLING_QUEUE = "email-polling";
const emailPollingQueue = new Queue(EMAIL_POLLING_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50,
    },
});

async function pollInboxForTickets() {
    if (!IMAP_HOST || !IMAP_USER || !IMAP_PASSWORD) {
        console.log("[Email Polling] IMAP not configured, skipping");
        return;
    }

    // Dynamic import to avoid loading when IMAP is not configured
    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");

    const client = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: true,
        auth: {
            user: IMAP_USER,
            pass: IMAP_PASSWORD,
        },
        logger: false,
        socketTimeout: 120000,
    });

    // Prevent unhandled 'error' events from crashing the process
    let connectionLost = false;
    client.on("error", (err: Error) => {
        connectionLost = true;
        console.error("[Email Polling] IMAP connection error:", err.message);
    });

    // Collect bounces to process AFTER IMAP connection is closed
    const pendingBounces: Array<{
        fromAddress: string;
        subject: string;
        textBody: string;
        emailMessageId: string | undefined;
    }> = [];

    try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
            // Two-pass approach:
            // Pass 1: UNSEEN messages (fast - usually few)
            // Pass 2: SEEN messages from last 6h (catch emails read in other clients)
            //         Only fetch envelope first, then full source if not in DB

            // Collect UIDs to process from both passes
            const uidsToProcess: number[] = [];

            // Pass 1: all UNSEEN
            for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: true })) {
                uidsToProcess.push(msg.uid);
            }

            // Pass 2: SEEN messages from last 6h - check envelope only, skip if already in DB
            const since6h = new Date();
            since6h.setHours(since6h.getHours() - 6);

            for await (const msg of client.fetch({ seen: true, since: since6h }, { uid: true, envelope: true })) {
                const msgId = msg.envelope?.messageId;
                if (!msgId) {
                    uidsToProcess.push(msg.uid);
                    continue;
                }
                // Quick DB check - skip if already processed
                const exists = await db.ticketMessage.findUnique({ where: { emailMessageId: msgId }, select: { id: true } });
                if (!exists) {
                    const bounceExists = await db.emailBounce.findUnique({ where: { emailMessageId: msgId }, select: { id: true } });
                    if (!bounceExists) {
                        uidsToProcess.push(msg.uid);
                    }
                }
            }

            const uniqueUids = Array.from(new Set(uidsToProcess));
            console.log(`📧 [Email Polling] Found ${uniqueUids.length} message(s) to process`);

            const FETCH_BATCH_SIZE = 25;
            const SEEN_BATCH_SIZE = 50;

            const markSeen = async (uids: number[]) => {
                if (!uids.length) return;
                const unique = Array.from(new Set(uids));
                for (let i = 0; i < unique.length; i += SEEN_BATCH_SIZE) {
                    const batch = unique.slice(i, i + SEEN_BATCH_SIZE);
                    await client.messageFlagsAdd(batch, ["\\Seen"], { uid: true });
                }
            };

            for (let i = 0; i < uniqueUids.length; i += FETCH_BATCH_SIZE) {
                const batch = uniqueUids.slice(i, i + FETCH_BATCH_SIZE);
                const messages = client.fetch(batch, { source: true }, { uid: true });
                const uidsToMarkSeen: number[] = [];

                for await (const msg of messages) {
                    try {
                        if (!msg.source) continue;
                        const parsed = await simpleParser(msg.source as Buffer);

                        const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase();
                        if (!fromAddress) continue;

                        // Skip our own emails (loop prevention)
                        if (SUPPORT_EMAIL && fromAddress === SUPPORT_EMAIL.toLowerCase()) {
                            uidsToMarkSeen.push(msg.uid);
                            continue;
                        }

                        const subject = (parsed.subject as string) || "(No Subject)";
                        const textBody = (parsed.text as string) || "";
                        const htmlBody = (parsed.html as string) || undefined;
                        const emailMessageId = (parsed.messageId as string) || undefined;
                        const inReplyTo = (parsed.inReplyTo as string) || undefined;
                        const rawRefs = parsed.references as string | string[] | undefined;
                        const referencesHeader = Array.isArray(rawRefs)
                            ? rawRefs.join(" ")
                            : rawRefs || undefined;

                        // ===== BOUNCE / NDR DETECTION =====
                        const bounceFromPatterns = /mailer-daemon|postmaster|mail delivery subsystem/i;
                        const bounceSubjectPatterns = /undeliverable|delivery status|failure|returned|bounced|não entregue|devolvido|undelivered|delivery failed|mail delivery failed|returned mail/i;

                        const isBounce = bounceFromPatterns.test(fromAddress) || bounceSubjectPatterns.test(subject);

                        if (isBounce) {
                            console.log(`📧 [Email] Bounce/NDR detected from ${fromAddress}: ${subject}`);
                            uidsToMarkSeen.push(msg.uid);

                            // Dedup: skip if we already processed this bounce
                            if (emailMessageId) {
                                const existingBounce = await db.emailBounce.findUnique({
                                    where: { emailMessageId },
                                });
                                if (existingBounce) continue;
                            }

                            // Process bounce asynchronously (don't block IMAP loop)
                            const bounceData = { fromAddress, subject, textBody, emailMessageId };
                            pendingBounces.push(bounceData);
                            continue;
                        }

                        // Check for duplicate by emailMessageId
                        if (emailMessageId) {
                            const existing = await db.ticketMessage.findUnique({
                                where: { emailMessageId },
                            });
                            if (existing) {
                                uidsToMarkSeen.push(msg.uid);
                                continue;
                            }
                        }

                        // Thread matching: find existing ticket
                        let ticket = null;

                        // 1. Match by In-Reply-To header
                        if (inReplyTo) {
                            const replyMsg = await db.ticketMessage.findUnique({
                                where: { emailMessageId: inReplyTo },
                                include: { ticket: true },
                            });
                            if (replyMsg) {
                                ticket = replyMsg.ticket;
                            }
                        }

                        // 2. Fallback: match by email + cleaned subject
                        if (!ticket) {
                            const cleanSubject = subject
                                .replace(/^(Re|Fwd|Fw|Enc|Rép|Rif):\s*/gi, "")
                                .trim();
                            if (cleanSubject) {
                                ticket = await db.supportTicket.findFirst({
                                    where: {
                                        email: fromAddress,
                                        subject: cleanSubject,
                                        status: { not: "CLOSED" },
                                    },
                                    orderBy: { createdAt: "desc" },
                                });
                            }
                        }

                        if (ticket) {
                            // Append message to existing ticket
                            const newMessage = await db.ticketMessage.create({
                                data: {
                                    ticketId: ticket.id,
                                    direction: "INBOUND",
                                    senderEmail: fromAddress,
                                    body: textBody,
                                    htmlBody: htmlBody || null,
                                    emailMessageId: emailMessageId || null,
                                    inReplyTo: inReplyTo || null,
                                    references: referencesHeader || null,
                                    aiResponseStatus: "PENDING",
                                },
                            });

                            // Reopen ticket if it was waiting/resolved
                            if (ticket.status === "WAITING_REPLY" || ticket.status === "RESOLVED") {
                                await db.supportTicket.update({
                                    where: { id: ticket.id },
                                    data: { status: "OPEN" },
                                });
                            }

                            // Enqueue AI response
                            await ticketAiResponseQueue.add(
                                "generate-ai-response",
                                { ticketId: ticket.id, messageId: newMessage.id },
                                { jobId: `ticket_ai_${ticket.id}_${newMessage.id}` }
                            );

                            // Telegram notification
                            const { sendNewTicketAlert } = await import("../../lib/telegram");
                            await sendNewTicketAlert({
                                ticketId: ticket.id,
                                email: fromAddress,
                                subject: ticket.subject,
                                bodySnippet: textBody,
                                orderId: ticket.orderId,
                                isReply: true,
                            });

                            console.log(`📧 [Email] Reply added to ticket ${ticket.id} from ${fromAddress}`);
                        } else {
                            // Create new ticket
                            const cleanSubject = subject
                                .replace(/^(Re|Fwd|Fw|Enc|Rép|Rif):\s*/gi, "")
                                .trim() || "(No Subject)";

                            // Auto-link to most recent SongOrder by email
                            const recentOrder = await db.songOrder.findFirst({
                                where: { email: fromAddress },
                                orderBy: { createdAt: "desc" },
                                select: { id: true, locale: true },
                            });

                            const newTicket = await db.supportTicket.create({
                                data: {
                                    email: fromAddress,
                                    subject: cleanSubject,
                                    orderId: recentOrder?.id || null,
                                    locale: recentOrder?.locale || null,
                                    messages: {
                                        create: {
                                            direction: "INBOUND",
                                            senderEmail: fromAddress,
                                            body: textBody,
                                            htmlBody: htmlBody || null,
                                            emailMessageId: emailMessageId || null,
                                            inReplyTo: inReplyTo || null,
                                            references: referencesHeader || null,
                                            aiResponseStatus: "PENDING",
                                        },
                                    },
                                },
                                include: { messages: true },
                            });

                            const firstMessage = newTicket.messages[0];

                            // Enqueue AI response
                            if (firstMessage) {
                                await ticketAiResponseQueue.add(
                                    "generate-ai-response",
                                    { ticketId: newTicket.id, messageId: firstMessage.id },
                                    { jobId: `ticket_ai_${newTicket.id}_${firstMessage.id}` }
                                );
                            }

                            // Telegram notification
                            const { sendNewTicketAlert } = await import("../../lib/telegram");
                            await sendNewTicketAlert({
                                ticketId: newTicket.id,
                                email: fromAddress,
                                subject: cleanSubject,
                                bodySnippet: textBody,
                                orderId: recentOrder?.id || null,
                                isReply: false,
                            });

                            console.log(`📧 [Email] New ticket ${newTicket.id} created from ${fromAddress}`);
                        }

                        uidsToMarkSeen.push(msg.uid);
                    } catch (msgError) {
                        console.error("[Email Polling] Error processing message:", msgError);
                    }
                }

                await markSeen(uidsToMarkSeen);

                if (connectionLost) {
                    break;
                }
            }
        } finally {
            lock.release();
        }

        if (!connectionLost) {
            await client.logout();
        }
    } catch (error) {
        if (connectionLost || (error as any)?.code === "NoConnection" || String((error as any)?.message || "").includes("Socket timeout")) {
            console.warn("[Email Polling] IMAP connection dropped (timeout). Will retry on next poll.");
        } else {
            console.error("[Email Polling] Error:", error);
        }
        try { await client.logout(); } catch { /* ignore */ }
    }

    // Process bounces AFTER IMAP is closed (DB + Telegram don't need IMAP)
    for (const bounce of pendingBounces) {
        try {
            const bodyForParsing = bounce.textBody || "";
            const bounceFromPatterns = /mailer-daemon|postmaster|mail delivery subsystem/i;

            // Extract original recipient email
            const emailRegexPatterns = [
                /(?:Original-Recipient|Final-Recipient|Delivered-To|X-Failed-Recipients):\s*(?:rfc822;?\s*)?([^\s<>]+@[^\s<>;]+)/i,
                /(?:was not delivered to|could not be delivered to|delivery to the following recipient failed|undeliverable to)\s*:?\s*<?([^\s<>]+@[^\s<>;]+)/i,
                /<?([^\s<>@]+@[^\s<>;]+)>?\s*(?:was not delivered|could not be delivered|delivery failed|does not exist)/i,
            ];

            let bouncedEmail: string | null = null;
            for (const pattern of emailRegexPatterns) {
                const match = bodyForParsing.match(pattern);
                if (match?.[1]) {
                    bouncedEmail = match[1].toLowerCase().trim();
                    break;
                }
            }

            // Fallback: any email that isn't the sender or us
            if (!bouncedEmail) {
                const allEmails = bodyForParsing.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                if (allEmails) {
                    const candidate = allEmails.find((e: string) =>
                        e.toLowerCase() !== bounce.fromAddress &&
                        !bounceFromPatterns.test(e.toLowerCase()) &&
                        e.toLowerCase() !== SUPPORT_EMAIL?.toLowerCase()
                    );
                    if (candidate) bouncedEmail = candidate.toLowerCase();
                }
            }

            // Determine bounce type
            const bodyLower = bodyForParsing.toLowerCase();
            let bounceType = "unknown";
            if (/does not exist|user unknown|no such user|mailbox not found|invalid address|address rejected|recipient rejected/i.test(bodyLower)) {
                bounceType = "hard";
            } else if (/mailbox full|quota exceeded|over quota|too many|temporarily|try again|rate limit/i.test(bodyLower)) {
                bounceType = "soft";
            }

            // Extract bounce reason
            const reasonLines = bodyForParsing.split("\n").filter((l: string) => l.trim().length > 10);
            const bounceReason = reasonLines.slice(0, 3).join(" ").substring(0, 500) || bounce.subject;

            // Look up paid orders
            let linkedOrder = null;
            if (bouncedEmail) {
                linkedOrder = await db.songOrder.findFirst({
                    where: {
                        email: bouncedEmail,
                        status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] },
                    },
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        status: true,
                        recipientName: true,
                        backupWhatsApp: true,
                        locale: true,
                    },
                });
            }

            // Create EmailBounce record
            await db.emailBounce.create({
                data: {
                    bouncedEmail: bouncedEmail || bounce.fromAddress,
                    bounceReason,
                    bounceType,
                    originalSubject: bounce.subject,
                    rawSnippet: bodyForParsing.substring(0, 2000),
                    emailMessageId: bounce.emailMessageId || null,
                    orderId: linkedOrder?.id || null,
                    orderStatus: linkedOrder?.status || null,
                    recipientName: linkedOrder?.recipientName || null,
                    backupWhatsApp: linkedOrder?.backupWhatsApp || null,
                    locale: linkedOrder?.locale || null,
                },
            });

            // Telegram alert for paid orders
            if (linkedOrder) {
                const { sendBounceAlert } = await import("../../lib/telegram");
                await sendBounceAlert({
                    bouncedEmail: bouncedEmail || bounce.fromAddress,
                    bounceReason,
                    bounceType,
                    orderId: linkedOrder.id,
                    orderStatus: linkedOrder.status,
                    recipientName: linkedOrder.recipientName,
                    backupWhatsApp: linkedOrder.backupWhatsApp,
                    locale: linkedOrder.locale,
                });
            }

            console.log(`📧 [Email] Bounce recorded for ${bouncedEmail || bounce.fromAddress}${linkedOrder ? ` (order: ${linkedOrder.id})` : ""}`);
        } catch (bounceError) {
            console.error("[Email Polling] Error processing bounce:", bounceError);
        }
    }
}

const TICKET_AI_RESPONSE_QUEUE = "ticket-ai-response";
const ticketAiResponseQueue = new Queue(TICKET_AI_RESPONSE_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 30000 },
    },
});

const emailPollingWorker = new Worker(
    EMAIL_POLLING_QUEUE,
    async () => {
        await pollInboxForTickets();
    },
    { connection, concurrency: 1 }
);

emailPollingWorker.on("completed", () => console.log("📧 [Email Polling] Poll completed"));
emailPollingWorker.on("failed", (job, err) => console.error("❌ [Email Polling] Failed:", err.message));

// Schedule polling every 2 minutes (only if IMAP configured)
if (IMAP_HOST && IMAP_USER) {
    (async () => {
        await emailPollingQueue.upsertJobScheduler(
            "email-poll-scheduler",
            { every: 2 * 60 * 1000 },
            { name: "poll-inbox" }
        );
        console.log("📧 [Email Polling] Scheduled every 2 minutes");
    })();
} else {
    console.log("📧 [Email Polling] IMAP not configured, polling disabled");
}

// ============================================================================
// SUPABASE LEAD IMPORT WORKER (polls quizzes -> SongOrder leads)
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
const SUPABASE_LEADS_TABLE = process.env.SUPABASE_LEADS_TABLE || "quizzes";
const SUPABASE_LEAD_SOURCE = process.env.SUPABASE_LEAD_SOURCE || "supabase-import";
const SUPABASE_LEAD_CONVERTED_SOURCE = "supabase-convertido";
const SUPABASE_LEAD_MEDIUM = process.env.SUPABASE_LEAD_MEDIUM || "quiz";
const SUPABASE_LEAD_DEFAULT_LOCALE = process.env.SUPABASE_LEAD_DEFAULT_LOCALE || "pt";
const SUPABASE_LEAD_DEFAULT_CURRENCY = process.env.SUPABASE_LEAD_DEFAULT_CURRENCY;
const SUPABASE_LEAD_DEFAULT_PLAN_TYPE = process.env.SUPABASE_LEAD_DEFAULT_PLAN_TYPE || "express";
const SUPABASE_LEAD_TELEGRAM_ALERTS = process.env.SUPABASE_LEAD_TELEGRAM_ALERTS !== "false";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || "orders";

function parseNumberEnv(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const SUPABASE_LEAD_LOOKBACK_MINUTES = parseNumberEnv(process.env.SUPABASE_LEAD_LOOKBACK_MINUTES, 10);
const SUPABASE_LEAD_INTERVAL_MS = parseNumberEnv(process.env.SUPABASE_LEAD_INTERVAL_MS, 10 * 60 * 1000);
const SUPABASE_LEAD_OVERLAP_SECONDS = parseNumberEnv(process.env.SUPABASE_LEAD_OVERLAP_SECONDS, 60);
const SUPABASE_LEAD_SUMMARY_INTERVAL_MS = Math.max(
    60_000,
    parseNumberEnv(process.env.SUPABASE_LEAD_SUMMARY_INTERVAL_MS, 6 * 60 * 60 * 1000)
);
const SUPABASE_LEAD_SUMMARY_WINDOW_HOURS = Math.max(
    1,
    parseNumberEnv(process.env.SUPABASE_LEAD_SUMMARY_WINDOW_HOURS, 6)
);
const SUPABASE_ORDERS_LOOKBACK_MINUTES = parseNumberEnv(process.env.SUPABASE_ORDERS_LOOKBACK_MINUTES, 60);
const SUPABASE_ORDERS_INTERVAL_MS = parseNumberEnv(process.env.SUPABASE_ORDERS_INTERVAL_MS, 60_000);
const SUPABASE_ORDERS_OVERLAP_SECONDS = parseNumberEnv(process.env.SUPABASE_ORDERS_OVERLAP_SECONDS, 60);
const SUPABASE_LEAD_SUMMARY_TZ = "America/Sao_Paulo";

type LeadPlanType = "essencial" | "express";

function resolveLeadPlanType(): LeadPlanType {
    return SUPABASE_LEAD_DEFAULT_PLAN_TYPE === "essencial" ? "essencial" : "express";
}

function getLeadBasePrice(
    locale: "en" | "pt" | "es" | "fr" | "it",
    planType: LeadPlanType
): number {
    if (locale === "pt") {
        return planType === "essencial" ? 6990 : 9990;
    }
    if (locale === "es") {
        return planType === "essencial" ? 1900 : 2900;
    }
    if (locale === "fr") {
        return planType === "essencial" ? 4900 : 7900;
    }
    if (locale === "it") {
        return planType === "essencial" ? 6900 : 9900;
    }
    return 9900;
}
const SUPABASE_LEAD_LAST_CHECK_KEY = "supabase:lead-import:last-check";
const SUPABASE_ORDERS_LAST_CHECK_KEY = "supabase:orders:last-check";

type SupabaseQuizRecord = {
    id?: string | number;
    created_at?: string;
    about_who?: string;
    relationship?: string;
    style?: string;
    language?: string;
    key_moments?: string;
    desired_tone?: string;
    qualities?: string;
    memories?: string;
    message?: string;
    vocal_gender?: string;
    music_prompt?: string;
    occasion?: string;
    customer_email?: string;
    customer_whatsapp?: string;
    order_id?: string | number;
    transaction_id?: string | number;
    answers?: unknown;
};

type SupabaseOrderRecord = {
    id?: string | number;
    transaction_id?: string | number;
    customer_email?: string;
    customer_whatsapp?: string;
    amount_cents?: number;
    status?: string;
    paid_at?: string;
    created_at?: string;
};

function safeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function parseAnswers(raw: unknown): Record<string, unknown> | null {
    if (!raw) return null;
    if (typeof raw === "object" && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return null;
        }
    }
    return null;
}

function pickFirstNonEmpty(values: Array<string | undefined>): string {
    for (const value of values) {
        const trimmed = safeString(value);
        if (trimmed) return trimmed;
    }
    return "";
}

function normalizeForMatch(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function mapRecipient(raw: string): string {
    const value = normalizeForMatch(raw);
    if (!value) return "other";

    const mappings: Array<[string, string]> = [
        ["husband", "husband"],
        ["marido", "husband"],
        ["wife", "wife"],
        ["esposa", "wife"],
        ["boyfriend", "boyfriend"],
        ["namorado", "boyfriend"],
        ["girlfriend", "girlfriend"],
        ["namorada", "girlfriend"],
        ["children", "children"],
        ["filho", "children"],
        ["filha", "children"],
        ["filhos", "children"],
        ["crianca", "children"],
        ["father", "father"],
        ["pai", "father"],
        ["mother", "mother"],
        ["mae", "mother"],
        ["mamae", "mother"],
        ["sibling", "sibling"],
        ["irmao", "sibling"],
        ["irma", "sibling"],
        ["brother", "sibling"],
        ["sister", "sibling"],
        ["friend", "friend"],
        ["amigo", "friend"],
        ["amiga", "friend"],
        ["myself", "myself"],
        ["eu", "myself"],
        ["me", "myself"],
        ["mim", "myself"],
        ["group", "group"],
        ["grupo", "group"],
        ["familia", "group"],
        ["family", "group"],
        ["other", "other"],
        ["outro", "other"],
        ["outra", "other"],
    ];

    for (const [key, mapped] of mappings) {
        if (value.includes(key)) return mapped;
    }

    return "other";
}

function mapVocal(raw: string): "male" | "female" | "either" {
    const value = normalizeForMatch(raw);
    if (!value) return "either";
    if (value.includes("female") || value.includes("femin") || value.includes("mulher")) {
        return "female";
    }
    if (value.includes("male") || value.includes("masc") || value.includes("homem")) {
        return "male";
    }
    return "either";
}

function mapGenre(raw: string): string {
    const value = normalizeForMatch(raw);
    if (!value) return "pop";

    if (value === "romantico" || value === "romantica") {
        return "sertanejo-romantico";
    }

    if (value.includes("afro house")) return "eletronica-afro-house";
    if (value.includes("progressive house") || value.includes("prog house")) return "eletronica-progressive-house";
    if (value.includes("melodic techno") || value.includes("melodictechno")) return "eletronica-melodic-techno";
    if (value.includes("eletronica") || value.includes("electronica") || value.includes("electronic")) return "eletronica";

    if (value.includes("infantil") && value.includes("animad")) return "lullaby-animada";
    if (value.includes("ninar") || value.includes("lullaby")) return "lullaby-ninar";
    if (value.includes("infantil")) return "lullaby";

    if (value.includes("sertanejo")) {
        if (value.includes("romant")) return "sertanejo-romantico";
        if (value.includes("raiz")) return "sertanejo-raiz";
        return "sertanejo-universitario";
    }

    if (value.includes("pagode")) {
        if (value.includes("romant")) return "pagode-romantico";
        if (value.includes("universit")) return "pagode-universitario";
        if (value.includes("mesa") || value.includes("raiz")) return "pagode-de-mesa";
        return "pagode";
    }

    if (value.includes("forro")) {
        if (value.includes("universit")) return "forro-universitario";
        if (value.includes("eletron")) return "forro-eletronico";
        if (value.includes("pe de serra") || value.includes("pede serra")) {
            if (value.includes("lento") || value.includes("nostalg")) return "forro-pe-de-serra-lento";
            return "forro-pe-de-serra-rapido";
        }
        return "forro";
    }

    if (value.includes("funk")) {
        if (value.includes("carioca")) return "funk-carioca";
        if (value.includes("paulista")) return "funk-paulista";
        if (value.includes("melody")) return "funk-melody";
        return "funk";
    }

    if (value.includes("brega")) {
        if (value.includes("romant")) return "brega-romantico";
        if (value.includes("tecnobrega")) return "tecnobrega";
        return "brega";
    }

    if (value.includes("mpb")) return "mpb";
    if (value.includes("bossa")) return "bossa";
    if (value.includes("samba")) return "samba";
    if (value.includes("reggae")) return "reggae";
    if (value.includes("lullaby")) return "lullaby";
    if (value.includes("jovem guarda")) return "jovem-guarda";
    if (value.includes("pop rock brasileiro") || value.includes("pop-rock brasileiro") || value.includes("brazilian pop rock")) return "pop-rock-brasileiro";
    if (value.includes("rock classico")) return "rock-classico";
    if (value.includes("heavy metal") || value.includes("metal")) return "heavy-metal";
    if (value.includes("rock")) return "rock";
    if (value.includes("hip hop") || value.includes("hip-hop") || value.includes("rap")) return "hiphop";
    if (value.includes("r&b") || value.includes("rnb")) return "rnb";
    if (value.includes("jazz")) return "jazz";
    if (value.includes("blues")) return "blues";
    if (value.includes("gospel") || value.includes("worship")) return "worship";
    if (value.includes("country")) return "country";
    if (value.includes("pop")) return "pop";
    if (value.includes("latina")) return "latina";
    if (value.includes("salsa")) return "salsa";
    if (value.includes("merengue")) return "merengue";
    if (value.includes("bachata")) return "bachata";
    if (value.includes("bolero")) return "bolero";
    if (value.includes("cumbia")) return "cumbia";
    if (value.includes("ranchera")) return "ranchera";
    if (value.includes("balada")) return "balada";
    if (value.includes("tango")) return "tango";
    if (value.includes("valsa") || value.includes("waltz")) return "valsa";
    if (value.includes("chanson")) return "chanson";
    if (value.includes("variete")) return "variete";
    if (value.includes("adoracion")) return "adoracion";
    if (value.includes("tarantella")) return "tarantella";
    if (value.includes("napoletana")) return "napoletana";
    if (value.includes("lirico")) return "lirico";
    if (value.includes("axe")) return "axe";
    if (value.includes("capoeira")) return "capoeira";

    return "pop";
}

function mapLocale(raw: string): "en" | "pt" | "es" | "fr" | "it" {
    const value = normalizeForMatch(raw);
    if (value.startsWith("pt") || value.includes("portugu")) return "pt";
    if (value.startsWith("en") || value.includes("english") || value.includes("ingles")) return "en";
    if (value.startsWith("es") || value.includes("espan")) return "es";
    if (value.startsWith("fr") || value.includes("franc")) return "fr";
    if (value.startsWith("it") || value.includes("ital")) return "it";
    return SUPABASE_LEAD_DEFAULT_LOCALE as "en" | "pt" | "es" | "fr" | "it";
}

function mapCurrency(locale: "en" | "pt" | "es" | "fr" | "it"): "USD" | "BRL" | "EUR" {
    if (SUPABASE_LEAD_DEFAULT_CURRENCY) {
        const value = SUPABASE_LEAD_DEFAULT_CURRENCY.toUpperCase();
        if (value === "BRL" || value === "USD" || value === "EUR") return value;
    }
    if (locale === "pt") return "BRL";
    if (locale === "en" || locale === "es") return "USD";
    return "EUR";
}

function formatWhatsApp(raw: string): string | null {
    const digits = raw.replace(/[^\d+]/g, "");
    if (!digits) return null;
    if (digits.startsWith("+")) return digits;
    return `+${digits}`;
}

function getWhatsAppGenreLabel(genre: string | null | undefined): string {
    const raw = String(genre || "").trim();
    if (!raw) return "especial";

    const normalized = raw.toLowerCase();
    if (normalized === "worship" || normalized === "gospel") return "Gospel";

    return GENRE_NAMES[raw]?.pt || GENRE_NAMES[normalized]?.pt || raw;
}

function buildImportMessage(baseMessage: string, extraNotes: string[]): string | null {
    const message = baseMessage ? baseMessage : "";
    const notes = extraNotes.length ? `Imported data:\n${extraNotes.map((n) => `- ${n}`).join("\n")}` : "";
    const combined = [message, notes].filter(Boolean).join("\n\n");
    return combined || null;
}

function getSupabaseImportId(record: SupabaseQuizRecord, answers: Record<string, unknown> | null): string | null {
    if (record.id !== undefined && record.id !== null) {
        return String(record.id);
    }
    const fallbackCreatedAt = safeString(record.created_at);
    const fallbackEmail = pickFirstNonEmpty([
        safeString(record.customer_email),
        safeString(answers?.customer_email),
    ]);
    if (!fallbackCreatedAt && !fallbackEmail) {
        return null;
    }
    return `${fallbackCreatedAt || "unknown"}:${fallbackEmail || "unknown"}`;
}

type SupabaseLeadSummaryMetrics = {
    now: Date;
    windowStart: Date;
    leadsLastWindow: number;
    paidLastWindow: number;
    pendingLastWindow: number;
    paidTodayCount: number;
    revenueByCurrency: Map<string, number>;
};

function getSupabaseDayStartUtc(now: Date): Date {
    const nowSp = toZonedTime(now, SUPABASE_LEAD_SUMMARY_TZ);
    const startOfDaySp = new Date(
        nowSp.getFullYear(),
        nowSp.getMonth(),
        nowSp.getDate(),
        0,
        0,
        0,
        0
    );
    return fromZonedTime(startOfDaySp, SUPABASE_LEAD_SUMMARY_TZ);
}

function formatCurrencyAmount(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency,
        }).format(cents / 100);
    } catch {
        return `${currency} ${(cents / 100).toFixed(2)}`;
    }
}

async function getSupabaseLeadSummaryMetrics(): Promise<SupabaseLeadSummaryMetrics> {
    const now = new Date();
    const windowHours = Math.max(1, SUPABASE_LEAD_SUMMARY_WINDOW_HOURS);
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
    const dayStartUtc = getSupabaseDayStartUtc(now);

    const sourceFilter: Prisma.SongOrderWhereInput = {
        utmSource: { in: [SUPABASE_LEAD_SOURCE, SUPABASE_LEAD_CONVERTED_SOURCE] },
        orderType: "MAIN",
    };

    const [leadsLastWindow, paidLastWindow, paidTodayOrders] = await Promise.all([
        db.songOrder.count({
            where: {
                ...sourceFilter,
                createdAt: { gte: windowStart, lte: now },
            },
        }),
        db.songOrder.count({
            where: {
                ...sourceFilter,
                createdAt: { gte: windowStart, lte: now },
                supabasePaidAt: { not: null },
            },
        }),
        db.songOrder.findMany({
            where: {
                ...sourceFilter,
                supabasePaidAt: { gte: dayStartUtc, lte: now },
            },
            select: {
                priceAtOrder: true,
                currency: true,
            },
        }),
    ]);

    const revenueByCurrency = new Map<string, number>();
    for (const order of paidTodayOrders) {
        const currency = (order.currency || "BRL").toUpperCase();
        const current = revenueByCurrency.get(currency) || 0;
        revenueByCurrency.set(currency, current + (order.priceAtOrder || 0));
    }

    return {
        now,
        windowStart,
        leadsLastWindow,
        paidLastWindow,
        pendingLastWindow: Math.max(0, leadsLastWindow - paidLastWindow),
        paidTodayCount: paidTodayOrders.length,
        revenueByCurrency,
    };
}

async function sendSupabaseLeadSummaryAlert(): Promise<void> {
    if (!SUPABASE_LEAD_TELEGRAM_ALERTS) return;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("[Supabase Lead Summary] Telegram not configured, skipping");
        return;
    }

    try {
        const {
            now,
            windowStart,
            leadsLastWindow,
            paidLastWindow,
            pendingLastWindow,
            paidTodayCount,
            revenueByCurrency,
        } = await getSupabaseLeadSummaryMetrics();

        const windowHours = Math.max(1, SUPABASE_LEAD_SUMMARY_WINDOW_HOURS);
        const windowStartLabel = formatInTimeZone(windowStart, SUPABASE_LEAD_SUMMARY_TZ, "dd/MM HH:mm");
        const windowEndLabel = formatInTimeZone(now, SUPABASE_LEAD_SUMMARY_TZ, "dd/MM HH:mm");
        const dayLabel = formatInTimeZone(now, SUPABASE_LEAD_SUMMARY_TZ, "dd/MM/yyyy");

        const revenueLines =
            revenueByCurrency.size > 0
                ? Array.from(revenueByCurrency.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([currency, cents]) => `• ${currency}: <b>${formatCurrencyAmount(cents, currency)}</b>`)
                    .join("\n")
                : "• <b>R$ 0,00</b>";

        const message = `
📊 <b>Resumo Supabase (${windowHours}h)</b>

🕒 <b>Período:</b> ${windowStartLabel} → ${windowEndLabel} (BRT)
🧲 <b>Leads (últimas ${windowHours}h):</b> ${leadsLastWindow}
✅ <b>Pagantes:</b> ${paidLastWindow}
⏳ <b>Pendentes:</b> ${pendingLastWindow}

💰 <b>Faturamento de hoje (${dayLabel}):</b>
${revenueLines}
👥 <b>Pagantes hoje:</b> ${paidTodayCount}
`.trim();

        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: "HTML",
                disable_web_page_preview: true,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error("[Supabase Lead Summary] Telegram alert failed:", error);
        }
    } catch (error) {
        console.error("[Supabase Lead Summary] Telegram alert error:", error);
    }
}

async function getSupabaseLastCheckIso(): Promise<string> {
    const stored = await connection.get(SUPABASE_LEAD_LAST_CHECK_KEY);
    if (stored) return stored;
    const fallback = new Date(Date.now() - SUPABASE_LEAD_LOOKBACK_MINUTES * 60 * 1000);
    return fallback.toISOString();
}

async function fetchSupabaseLeads(sinceIso: string): Promise<SupabaseQuizRecord[]> {
    if (!SUPABASE_URL || !SUPABASE_KEY) return [];
    const url = new URL(`${SUPABASE_URL}/rest/v1/${SUPABASE_LEADS_TABLE}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", "created_at.asc");
    url.searchParams.set("created_at", `gte.${sinceIso}`);

    const response = await fetch(url.toString(), {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.text();
        console.error(`[Supabase Lead Import] HTTP ${response.status}:`, error);
        return [];
    }

    const payload = await response.json();
    return Array.isArray(payload) ? (payload as SupabaseQuizRecord[]) : [];
}

async function syncSupabaseLeads() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.log("[Supabase Lead Import] SUPABASE_URL/SUPABASE_KEY not configured, skipping");
        return;
    }

    const lastCheckIso = await getSupabaseLastCheckIso();
    const lastCheckDate = new Date(lastCheckIso);
    const overlapMs = Math.max(0, SUPABASE_LEAD_OVERLAP_SECONDS) * 1000;
    const sinceDate = Number.isNaN(lastCheckDate.getTime())
        ? new Date(Date.now() - SUPABASE_LEAD_LOOKBACK_MINUTES * 60 * 1000)
        : new Date(lastCheckDate.getTime() - overlapMs);
    const sinceIso = sinceDate.toISOString();

    const records = await fetchSupabaseLeads(sinceIso);
    if (!records.length) {
        await connection.set(SUPABASE_LEAD_LAST_CHECK_KEY, new Date().toISOString());
        return;
    }

    const answersList = records.map((record) => parseAnswers(record.answers));
    const importIds = records
        .map((record, index) => getSupabaseImportId(record, answersList[index] ?? null))
        .filter(Boolean) as string[];
    const sessionIds = importIds.map((id) => `supabase:${id}`);

    const existing = sessionIds.length
        ? await db.songOrder.findMany({
            where: { sessionId: { in: sessionIds } },
            select: { sessionId: true },
        })
        : [];
    const existingSessions = new Set(existing.map((row) => row.sessionId).filter(Boolean) as string[]);

    let createdCount = 0;
    let skippedCount = 0;
    let missingEmailCount = 0;
    let errorCount = 0;
    let newestCreatedAt: Date | null = null;

    for (const [index, record] of records.entries()) {
        const answers = answersList[index] ?? null;
        const importId = getSupabaseImportId(record, answers);
        if (!importId) {
            skippedCount += 1;
            continue;
        }

        const sessionId = `supabase:${importId}`;

        // Always advance the cursor past this record (even if skipped) to avoid re-fetching
        const createdAt = record.created_at ? new Date(record.created_at) : new Date();
        if (!Number.isNaN(createdAt.getTime())) {
            if (!newestCreatedAt || createdAt > newestCreatedAt) {
                newestCreatedAt = createdAt;
            }
        }

        if (existingSessions.has(sessionId)) {
            skippedCount += 1;
            continue;
        }

        const emailRaw = pickFirstNonEmpty([
            safeString(record.customer_email),
            safeString(answers?.customer_email),
        ]);
        if (!emailRaw) {
            missingEmailCount += 1;
            continue;
        }

        const aboutWho = pickFirstNonEmpty([
            safeString(record.about_who),
            safeString(answers?.about_who),
        ]) || "Nao informado";

        const relationship = pickFirstNonEmpty([
            safeString(record.relationship),
            safeString(answers?.relationship),
        ]);

        const style = pickFirstNonEmpty([
            safeString(record.style),
            safeString(answers?.style),
        ]);

        const language = pickFirstNonEmpty([
            safeString(record.language),
            safeString(answers?.language),
        ]);

        const locale = mapLocale(language);
        const currency = mapCurrency(locale);
        const planType = resolveLeadPlanType();
        const priceAtOrder = getLeadBasePrice(locale, planType);

        const vocals = mapVocal(pickFirstNonEmpty([
            safeString(record.vocal_gender),
            safeString(answers?.vocal_gender),
        ]));

        const genre = mapGenre(style);

        const qualities = pickFirstNonEmpty([
            safeString(record.qualities),
            safeString(answers?.qualities),
        ]) || "Nao informado";

        const memories = pickFirstNonEmpty([
            safeString(record.memories),
            safeString(answers?.memories),
            safeString(record.key_moments),
            safeString(answers?.key_moments),
        ]) || "Nao informado";

        const baseMessage = pickFirstNonEmpty([
            safeString(record.message),
            safeString(answers?.message),
        ]);

        const extraNotes: string[] = [];
        const occasion = pickFirstNonEmpty([
            safeString(record.occasion),
            safeString(answers?.occasion),
        ]);
        const desiredTone = pickFirstNonEmpty([
            safeString(record.desired_tone),
            safeString(answers?.desired_tone),
        ]);
        const keyMoments = pickFirstNonEmpty([
            safeString(record.key_moments),
            safeString(answers?.key_moments),
        ]);
        const musicPrompt = pickFirstNonEmpty([
            safeString(record.music_prompt),
            safeString(answers?.music_prompt),
        ]);

        if (occasion) extraNotes.push(`Occasion: ${occasion}`);
        if (desiredTone) extraNotes.push(`Desired tone: ${desiredTone}`);
        if (keyMoments) extraNotes.push(`Key moments: ${keyMoments}`);
        if (musicPrompt) extraNotes.push(`Music prompt: ${musicPrompt}`);

        const message = buildImportMessage(baseMessage, extraNotes);
        const relationshipValue = safeString(relationship);
        const recipient = relationshipValue ? mapRecipient(relationshipValue) : "other";
        const recipientRelationship =
            recipient === "other" && relationshipValue && relationshipValue !== "other"
                ? relationshipValue
                : null;
        const backupWhatsAppRaw = pickFirstNonEmpty([
            safeString(record.customer_whatsapp),
            safeString(answers?.customer_whatsapp),
        ]);
        const supabaseOrderId = pickFirstNonEmpty([
            safeString(record.order_id),
            safeString(answers?.order_id),
            safeString(record.id),
        ]);
        const supabaseTransactionId = pickFirstNonEmpty([
            safeString(record.transaction_id),
            safeString(answers?.transaction_id),
        ]);

        try {
            await db.songOrder.create({
                data: {
                    recipient,
                    recipientName: aboutWho,
                    recipientRelationship,
                    genre,
                    vocals,
                    qualities,
                    memories,
                    message,
                    email: normalizeEmail(emailRaw),
                    backupWhatsApp: backupWhatsAppRaw ? formatWhatsApp(backupWhatsAppRaw) : null,
                    locale,
                    currency,
                    priceAtOrder,
                    status: "PENDING",
                    orderType: "MAIN",
                    planType: locale === "pt" || locale === "es" || locale === "fr" || locale === "it" ? planType : null,
                    musicPrompt: musicPrompt || null,
                    utmSource: SUPABASE_LEAD_SOURCE,
                    utmMedium: SUPABASE_LEAD_MEDIUM,
                    sessionId,
                    supabaseOrderId: supabaseOrderId || null,
                    supabaseTransactionId: supabaseTransactionId || null,
                    quizStartedAt: createdAt,
                    quizCompletedAt: createdAt,
                    createdAt,
                },
            });

            createdCount += 1;
            existingSessions.add(sessionId);

            // TEMPORARY: disabled email reminders for supabase-import leads
            // enqueueOrderReminders(createdOrder.id, {
            //     immediate: true,
            //     delays: { "3d": 24 * 60 * 60 * 1000 },
            // }).catch((error) => {
            //     console.error("[Supabase Lead Import] Failed to enqueue reminders:", error);
            // });
        } catch (error) {
            errorCount += 1;
            console.error(`[Supabase Lead Import] Failed to insert ${sessionId}:`, error);
        }
    }

    await connection.set(
        SUPABASE_LEAD_LAST_CHECK_KEY,
        (newestCreatedAt || new Date()).toISOString()
    );

    if (createdCount || skippedCount || missingEmailCount || errorCount) {
        console.log(`[Supabase Lead Import] done: +${createdCount} created, ${skippedCount} skipped, ${missingEmailCount} no-email, ${errorCount} errors`);
    }
}

async function getSupabaseOrdersLastCheckIso(): Promise<string> {
    const stored = await connection.get(SUPABASE_ORDERS_LAST_CHECK_KEY);
    if (stored) return stored;
    const fallback = new Date(Date.now() - SUPABASE_ORDERS_LOOKBACK_MINUTES * 60 * 1000);
    return fallback.toISOString();
}

async function fetchSupabasePaidOrders(sinceIso: string): Promise<SupabaseOrderRecord[]> {
    if (!SUPABASE_URL || !SUPABASE_KEY) return [];
    const url = new URL(`${SUPABASE_URL}/rest/v1/${SUPABASE_ORDERS_TABLE}`);
    url.searchParams.set("select", "id,transaction_id,customer_email,customer_whatsapp,amount_cents,status,paid_at,created_at");
    url.searchParams.set("order", "paid_at.asc");
    url.searchParams.set("paid_at", `gte.${sinceIso}`);
    url.searchParams.set("limit", "1000");

    const response = await fetch(url.toString(), {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.text();
        console.error(`[Supabase Orders Sync] HTTP ${response.status}:`, error);
        return [];
    }

    const payload = await response.json();
    return Array.isArray(payload) ? (payload as SupabaseOrderRecord[]) : [];
}

async function syncSupabasePaidOrders() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.log("[Supabase Orders Sync] SUPABASE_URL/SUPABASE_KEY not configured, skipping");
        return;
    }

    const lastCheckIso = await getSupabaseOrdersLastCheckIso();
    const lastCheckDate = new Date(lastCheckIso);
    const overlapMs = Math.max(0, SUPABASE_ORDERS_OVERLAP_SECONDS) * 1000;
    const sinceDate = Number.isNaN(lastCheckDate.getTime())
        ? new Date(Date.now() - SUPABASE_ORDERS_LOOKBACK_MINUTES * 60 * 1000)
        : new Date(lastCheckDate.getTime() - overlapMs);
    const sinceIso = sinceDate.toISOString();

    const records = await fetchSupabasePaidOrders(sinceIso);
    if (!records.length) {
        await connection.set(SUPABASE_ORDERS_LAST_CHECK_KEY, new Date().toISOString());
        return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let newestPaidAt: Date | null = null;

    for (const record of records) {
        if (!record.paid_at) continue;
        const paidAt = new Date(record.paid_at);
        if (Number.isNaN(paidAt.getTime())) continue;
        if (!newestPaidAt || paidAt > newestPaidAt) {
            newestPaidAt = paidAt;
        }

        const supabaseOrderId = pickFirstNonEmpty([
            safeString(record.id),
        ]);
        const supabaseTransactionId = pickFirstNonEmpty([
            safeString(record.transaction_id),
        ]);
        const emailRaw = safeString(record.customer_email);
        const normalizedEmail = emailRaw ? normalizeEmail(emailRaw) : "";

        let lead = null as { id: string; supabasePaidAt: Date | null; supabaseOrderId: string | null; supabaseTransactionId: string | null } | null;

        const matchClauses = [
            supabaseOrderId ? { supabaseOrderId } : null,
            supabaseTransactionId ? { supabaseTransactionId } : null,
        ].filter(Boolean) as Array<{ supabaseOrderId?: string; supabaseTransactionId?: string }>;

        if (matchClauses.length) {
            lead = await db.songOrder.findFirst({
                where: {
                    utmSource: { in: [SUPABASE_LEAD_SOURCE, SUPABASE_LEAD_CONVERTED_SOURCE] },
                    OR: matchClauses,
                },
                select: {
                    id: true,
                    supabasePaidAt: true,
                    supabaseOrderId: true,
                    supabaseTransactionId: true,
                },
                orderBy: { createdAt: "desc" },
            });
        }

        if (!lead && normalizedEmail) {
            lead = await db.songOrder.findFirst({
                where: {
                    utmSource: { in: [SUPABASE_LEAD_SOURCE, SUPABASE_LEAD_CONVERTED_SOURCE] },
                    email: normalizedEmail,
                },
                select: {
                    id: true,
                    supabasePaidAt: true,
                    supabaseOrderId: true,
                    supabaseTransactionId: true,
                },
                orderBy: { createdAt: "desc" },
            });
        }

        if (!lead) {
            skippedCount += 1;
            continue;
        }

        if (lead.supabasePaidAt && lead.supabasePaidAt.getTime() >= paidAt.getTime()) {
            skippedCount += 1;
            continue;
        }

        await db.songOrder.update({
            where: { id: lead.id },
            data: {
                supabasePaidAt: paidAt,
                supabaseOrderStatus: record.status || "PAID",
                supabaseOrderId: lead.supabaseOrderId || supabaseOrderId || null,
                supabaseTransactionId: lead.supabaseTransactionId || supabaseTransactionId || null,
            },
        });

        updatedCount += 1;
    }

    await connection.set(
        SUPABASE_ORDERS_LAST_CHECK_KEY,
        (newestPaidAt || new Date()).toISOString()
    );

    if (updatedCount || skippedCount) {
        console.log(`[Supabase Orders Sync] done: ${updatedCount} updated, ${skippedCount} skipped`);
    }
}

const SUPABASE_LEAD_QUEUE = "supabase-lead-import";
const supabaseLeadQueue = new Queue(SUPABASE_LEAD_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50,
    },
});

const supabaseLeadImportWorker = new Worker(
    SUPABASE_LEAD_QUEUE,
    async () => {
        await syncSupabaseLeads();
    },
    { connection, concurrency: 1 }
);

supabaseLeadImportWorker.on("completed", () => console.log("🧲 [Supabase Lead Import] run completed"));
supabaseLeadImportWorker.on("failed", (job, err) => console.error("❌ [Supabase Lead Import] failed:", err.message));

async function setupSupabaseLeadImportSchedule() {
    const repeatableJobs = await supabaseLeadQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await supabaseLeadQueue.removeRepeatableByKey(job.key);
    }

    await supabaseLeadQueue.add(
        "sync-supabase-leads",
        {},
        {
            repeat: {
                every: SUPABASE_LEAD_INTERVAL_MS,
            },
        }
    );

    console.log(`🧲 [Supabase Lead Import] Scheduled every ${Math.round(SUPABASE_LEAD_INTERVAL_MS / 1000)}s`);
}

if (SUPABASE_URL && SUPABASE_KEY) {
    setupSupabaseLeadImportSchedule().catch(console.error);
} else {
    console.log("🧲 [Supabase Lead Import] SUPABASE_URL/SUPABASE_KEY not configured, scheduling disabled");
}

const SUPABASE_LEAD_SUMMARY_QUEUE = "supabase-lead-summary";
const supabaseLeadSummaryQueue = new Queue(SUPABASE_LEAD_SUMMARY_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50,
    },
});

const supabaseLeadSummaryWorker = new Worker(
    SUPABASE_LEAD_SUMMARY_QUEUE,
    async () => {
        await sendSupabaseLeadSummaryAlert();
    },
    { connection, concurrency: 1 }
);

supabaseLeadSummaryWorker.on("completed", () => console.log("🧲 [Supabase Lead Summary] run completed"));
supabaseLeadSummaryWorker.on("failed", (job, err) => console.error("❌ [Supabase Lead Summary] failed:", err.message));

async function setupSupabaseLeadSummarySchedule() {
    const repeatableJobs = await supabaseLeadSummaryQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await supabaseLeadSummaryQueue.removeRepeatableByKey(job.key);
    }

    await supabaseLeadSummaryQueue.add(
        "send-supabase-summary",
        {},
        {
            repeat: {
                every: SUPABASE_LEAD_SUMMARY_INTERVAL_MS,
            },
        }
    );

    console.log(
        `🧲 [Supabase Lead Summary] Scheduled every ${Math.round(SUPABASE_LEAD_SUMMARY_INTERVAL_MS / 1000)}s (window ${SUPABASE_LEAD_SUMMARY_WINDOW_HOURS}h)`
    );
}

if (SUPABASE_URL && SUPABASE_KEY) {
    setupSupabaseLeadSummarySchedule().catch(console.error);
} else {
    console.log("🧲 [Supabase Lead Summary] SUPABASE_URL/SUPABASE_KEY not configured, scheduling disabled");
}

const SUPABASE_ORDERS_QUEUE = "supabase-orders-sync";
const supabaseOrdersQueue = new Queue(SUPABASE_ORDERS_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50,
    },
});

const supabaseOrdersWorker = new Worker(
    SUPABASE_ORDERS_QUEUE,
    async () => {
        await syncSupabasePaidOrders();
    },
    { connection, concurrency: 1 }
);

supabaseOrdersWorker.on("completed", () => console.log("🧲 [Supabase Orders Sync] run completed"));
supabaseOrdersWorker.on("failed", (job, err) => console.error("❌ [Supabase Orders Sync] failed:", err.message));

async function setupSupabaseOrdersSyncSchedule() {
    const repeatableJobs = await supabaseOrdersQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await supabaseOrdersQueue.removeRepeatableByKey(job.key);
    }

    await supabaseOrdersQueue.add(
        "sync-supabase-orders",
        {},
        {
            repeat: {
                every: SUPABASE_ORDERS_INTERVAL_MS,
            },
        }
    );

    console.log(`🧲 [Supabase Orders Sync] Scheduled every ${Math.round(SUPABASE_ORDERS_INTERVAL_MS / 1000)}s`);
}

if (SUPABASE_URL && SUPABASE_KEY) {
    setupSupabaseOrdersSyncSchedule().catch(console.error);
} else {
    console.log("🧲 [Supabase Orders Sync] SUPABASE_URL/SUPABASE_KEY not configured, scheduling disabled");
}

// ============================================================================
// AI RESPONSE WORKER (generates suggested replies for tickets)
// ============================================================================

type TicketAiLocale = "pt" | "en" | "es" | "fr" | "it";

function normalizeTicketAiLocale(locale?: string | null): TicketAiLocale {
    const value = (locale || "").toLowerCase().trim();
    if (value.startsWith("pt")) return "pt";
    if (value.startsWith("es")) return "es";
    if (value.startsWith("fr")) return "fr";
    if (value.startsWith("it")) return "it";
    return "en";
}

function stripQuotedText(body: string): string {
    const lines = body.split("\n");
    const result: string[] = [];
    for (const line of lines) {
        if (/^(>|Em .+ escreveu:|On .+ wrote:|De:.+|From:.+|Enviado:.+|Sent:.+|---+$)/.test(line.trim())) break;
        result.push(line);
    }
    return result.join("\n").trim();
}

function isTicketDataCorrectionRequest(text: string): boolean {
    const value = normalizeForMatch(text || "");
    if (!value) return false;

    return /(corrig|correc|ajust|alter|dados|informac|data errad|nome errad|aniversar|idade errad|wrong|incorrect|mistake|update|edit information|correg|correcc|datos|fecha|nombr|revisione|correzion|modific|corriger|correction|donnees|informations|date incorrect)/.test(value);
}

function isTicketNewSongRequest(text: string): boolean {
    const value = normalizeForMatch(text || "");
    if (!value) return false;

    return /((nova|novo|outra|outro)\s+(musica|cancao|canção|song|cancion|chanson|canzone)|fazer\s+uma\s+(pro|pra|para)|fazer\s+outra|comprar\s+outra|quero\s+outra|gostaria\s+de\s+fazer\s+uma|new\s+song|another\s+song|otra\s+cancion|nueva\s+cancion|nouvelle\s+chanson|nuova\s+canzone)/.test(value);
}

function buildTicketNewSongReply(params: {
    locale: TicketAiLocale;
    createOrderLink: string;
    trackingLink: string;
}): string {
    const { locale, createOrderLink, trackingLink } = params;

    if (locale === "pt") {
        return `Que bom saber que você gostou! 💛

Para fazer uma nova música (por exemplo, para seu filho), é só iniciar um novo pedido neste link:

${createOrderLink}

Se quiser outra música para o mesmo homenageado, você também pode usar seu acompanhamento atual:

${trackingLink}`;
    }

    if (locale === "es") {
        return `¡Qué bueno saber que te gustó! 💛

Para hacer una nueva canción (por ejemplo, para tu hijo), solo inicia un nuevo pedido aquí:

${createOrderLink}

Si quieres otra canción para el mismo homenajeado, también puedes usar tu seguimiento actual:

${trackingLink}`;
    }

    if (locale === "fr") {
        return `Nous sommes ravis que cela vous ait plu ! 💛

Pour créer une nouvelle chanson (par exemple pour votre fils), lancez simplement une nouvelle commande ici :

${createOrderLink}

Si vous souhaitez une autre chanson pour la même personne, vous pouvez aussi utiliser votre suivi actuel :

${trackingLink}`;
    }

    if (locale === "it") {
        return `Che bello sapere che ti è piaciuta! 💛

Per creare una nuova canzone (ad esempio per tuo figlio), avvia semplicemente un nuovo ordine qui:

${createOrderLink}

Se vuoi un'altra canzone per la stessa persona, puoi anche usare il tuo tracciamento attuale:

${trackingLink}`;
    }

    return `Great to hear you loved it! 💛

To create a new song (for example, for your son), just start a new order here:

${createOrderLink}

If you want another song for the same recipient, you can also use your current tracking page:

${trackingLink}`;
}

function buildTicketCorrectionReply(params: {
    locale: TicketAiLocale;
    orderStatus: string;
    trackingLink: string;
}): string | null {
    const { locale, orderStatus, trackingLink } = params;
    const isEditable = orderStatus === "PAID" || orderStatus === "IN_PROGRESS";
    const needsRevision = orderStatus === "COMPLETED" || orderStatus === "REVISION";

    if (!isEditable && !needsRevision) {
        return null;
    }

    if (locale === "pt") {
        if (isEditable) {
            return `Obrigada por avisar! Para corrigir os dados do pedido com segurança, a alteração precisa ser feita por você no link de acompanhamento:

${trackingLink}

No pedido com pagamento confirmado/em produção, clique no botão laranja **EDITAR INFORMAÇÕES**, ajuste o que estiver errado e salve.`;
        }

        return `Obrigada por avisar! Como a música já está pronta, a correção deve ser solicitada pelo botão **Solicitar revisão** no link abaixo:

${trackingLink}

Descreva no pedido de revisão o que precisa ser ajustado para a equipe corrigir certinho.`;
    }

    if (locale === "es") {
        if (isEditable) {
            return `Gracias por avisarnos. Para corregir los datos del pedido de forma segura, el ajuste debe hacerlo usted mismo en el enlace de seguimiento:

${trackingLink}

Con el pago confirmado/en producción, haga clic en el botón **EDITAR INFORMACIÓN**, corrija los datos y guarde.`;
        }

        return `Gracias por avisarnos. Como la canción ya está lista, la corrección debe solicitarse en **Solicitar revisión** desde este enlace:

${trackingLink}

Indique allí exactamente qué dato necesita corregir.`;
    }

    if (locale === "fr") {
        if (isEditable) {
            return `Merci pour votre retour. Pour corriger les informations de la commande en toute sécurité, la modification doit être faite par vous-même via le lien de suivi :

${trackingLink}

Avec paiement confirmé/en production, cliquez sur **MODIFIER LES INFORMATIONS**, corrigez les données puis enregistrez.`;
        }

        return `Merci pour votre retour. Comme la chanson est déjà prête, la correction doit être demandée via **Demander une révision** sur ce lien :

${trackingLink}

Indiquez précisément les éléments à corriger dans la demande de révision.`;
    }

    if (locale === "it") {
        if (isEditable) {
            return `Grazie per l'avviso. Per correggere i dati dell'ordine in sicurezza, la modifica deve essere fatta da lei nel link di tracciamento:

${trackingLink}

Con pagamento confermato/in produzione, clicchi su **MODIFICA INFORMAZIONI**, corregga i dati e salvi.`;
        }

        return `Grazie per l'avviso. Poiché la canzone è già pronta, la correzione deve essere richiesta con **Richiedi revisione** da questo link:

${trackingLink}

Indichi nella revisione quali dati devono essere corretti.`;
    }

    if (isEditable) {
        return `Thanks for the update. To safely correct order details, the change must be made by you in the tracking link:

${trackingLink}

With payment confirmed/in production, click **EDIT INFORMATION**, fix the details, and save.`;
    }

    return `Thanks for the update. Since the song is already ready, please request the correction through **Request revision** in the tracking link:

${trackingLink}

Please describe exactly what should be corrected in your revision request.`;
}

const ticketAiResponseWorker = new Worker<{ ticketId: string; messageId: string }>(
    TICKET_AI_RESPONSE_QUEUE,
    async (job) => {
        const { ticketId, messageId } = job.data;
        console.log(`🤖 [AI Response] Generating for ticket ${ticketId}, message ${messageId}`);

        if (!OPENROUTER_API_KEY) {
            console.warn("[AI Response] OPENROUTER_API_KEY not set, skipping");
            return;
        }

        const ticket = await db.supportTicket.findUnique({
            where: { id: ticketId },
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
            console.warn(`[AI Response] Ticket ${ticketId} not found`);
            return;
        }

        // Get knowledge base entries
        const knowledgeEntries = await db.supportKnowledge.findMany({
            where: {
                isActive: true,
                locale: { in: ticket.locale ? [ticket.locale, "all"] : ["all"] },
                channel: { in: ["EMAIL", "BOTH"] as Array<"EMAIL" | "BOTH"> },
            },
        });

        const knowledgeContext = knowledgeEntries.length > 0
            ? knowledgeEntries.map(e => `## ${e.category} - ${e.title}\n${e.content}`).join("\n\n")
            : "No knowledge base entries available.";

        // Build order context - fetch ALL orders from this customer's email
        const allOrders = await db.songOrder.findMany({
            where: { email: { equals: ticket.email, mode: "insensitive" } },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                status: true,
                recipientName: true,
                genre: true,
                vocals: true,
                locale: true,
                orderType: true,
                songDeliveredAt: true,
                paymentCompletedAt: true,
                hasFastDelivery: true,
                hasCertificate: true,
                certificateToken: true,
                revisionCount: true,
                hasLyrics: true,
                spotifyUrl: true,
                priceAtOrder: true,
                currency: true,
                songFileUrl: true,
                sentEmails: {
                    where: { template: { contains: "delivery" } },
                    select: { status: true, createdAt: true, error: true },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
                createdAt: true,
            },
        });

        let orderContext = "No orders found for this customer.";
        if (allOrders.length > 0) {
            orderContext = `Customer has ${allOrders.length} order(s):\n\n` + allOrders.map((o, i) => {
                const isLinked = ticket.orderId === o.id;
                const certificateUrl = o.hasCertificate && o.certificateToken
                    ? `https://www.apollosong.com/pt/certificate/${o.certificateToken}`
                    : null;
                return `Order ${i + 1}${isLinked ? " (linked to this ticket)" : ""}:
- Order ID: ${o.id}
- Status: ${o.status}
- Order Type: ${o.orderType || "STANDARD"}
- Recipient: ${o.recipientName}
- Genre: ${o.genre}
- Vocals: ${o.vocals}
- Locale: ${o.locale}
- Price: ${o.priceAtOrder ? `${(o.priceAtOrder / 100).toFixed(2)} ${o.currency || "BRL"}` : "N/A"}
- Payment: ${o.paymentCompletedAt ? o.paymentCompletedAt.toISOString() : "Not paid"}
- Delivery: ${o.songDeliveredAt ? o.songDeliveredAt.toISOString() : "Not delivered"}
- Fast Delivery (24h): ${o.hasFastDelivery ? "YES - purchased" : "No"}
- Gift Experience (Experiência de Presente): ${o.hasCertificate ? `YES - purchased${certificateUrl ? ` | Link: ${certificateUrl}` : ""}` : "No"}
- Lyrics PDF: ${o.hasLyrics ? "YES - purchased" : "No"}
- Streaming VIP (Spotify): ${o.spotifyUrl ? `YES | ${o.spotifyUrl}` : "No"}
- Song files: ${o.songFileUrl ? "Uploaded" : "NOT uploaded"}
- Delivery email: ${o.sentEmails[0] ? `${o.sentEmails[0].status} at ${o.sentEmails[0].createdAt.toISOString()}${o.sentEmails[0].error ? ` (error: ${o.sentEmails[0].error})` : ""}` : "No delivery email found"}
- Revisions: ${o.revisionCount}
- Created: ${o.createdAt.toISOString()}`;
            }).join("\n\n");
        }

        // Build conversation history
        const conversationHistory = ticket.messages.map(m => {
            const role = m.direction === "INBOUND" ? "Customer" : "Support";
            return `[${role}] (${m.createdAt.toISOString()})\n${m.body}`;
        }).join("\n\n---\n\n");

        // Build tracking link for the customer
        const localePrefix = ticket.locale && ticket.locale !== "en" ? `/${ticket.locale}` : "";
        const trackingLink = `https://www.apollosong.com${localePrefix}/track-order?email=${encodeURIComponent(ticket.email)}`;
        const localeForGuardrail = normalizeTicketAiLocale(ticket.locale);
        const createOrderLink = localeForGuardrail === "en"
            ? "https://www.apollosong.com"
            : `https://www.apollosong.com/${localeForGuardrail}`;

        const systemPrompt = `Você é um especialista em suporte da empresa Apollo Song. O produto se chama Apollo Song.

PERFIL DO CLIENTE:
- Público 35+, a maioria não entende de tecnologia
- Seja MUITO atencioso, amigável e conversacional
- Fale de forma clara, simples e específica - especificidade nunca é demais
- Evite termos técnicos; se precisar usar, explique de forma simples
- NUNCA use termos em inglês com o cliente. Traduza SEMPRE os status dos pedidos para o idioma do cliente: COMPLETED = "entregue/pronta", PAID = "pagamento confirmado", IN_PROGRESS = "em produção", PENDING = "aguardando pagamento", REVISION = "em revisão". Nunca escreva PAID, COMPLETED, etc. no email.
- Os clientes gostam de atenção pois é um produto que toca o coração, 100% personalizado

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE no mesmo idioma que o cliente escreveu
- NUNCA invente informações que não estão no seu roteiro/knowledge base
- Se for uma pergunta fora do script, diga que vai passar para o supervisor responder e peça para aguardar
- ANTES de escalar pro supervisor, SEMPRE colete todas as informações necessárias do cliente (ex: quer trocar email? pergunte o novo email. Quer trocar dados? pergunte os dados novos). O supervisor NÃO deve precisar repetir perguntas.
- USE os dados do ORDER CONTEXT abaixo para responder. Você TEM acesso aos pedidos do cliente — NUNCA peça comprovante de pagamento, código de transação ou informações que já estão disponíveis nos dados dos pedidos. Se um pedido está COMPLETED, a música já foi entregue. Se está PAID ou IN_PROGRESS, está sendo produzida. Se está PENDING, o pagamento ainda não foi confirmado.
- REGRA DE NÃO ENTREGA: Se o cliente diz que não recebeu a música/canção e o pedido mostra status COMPLETED (entregue), NÃO oriente para revisão. Verifique no ORDER CONTEXT se "Song files" está como "Uploaded" e se "Delivery email" foi enviado. Informe que a música está disponível no link de acompanhamento e peça para verificar a caixa de spam/lixo eletrônico do email. Se já verificou e não encontrou, oriente a entrar em contato pelo WhatsApp para atendimento rápido: [Clique aqui para falar conosco no WhatsApp](https://wa.me/5561995790193).
- REGRA CRÍTICA - CORREÇÃO DE DADOS (nome, data, informações): se o cliente pedir correção e o pedido estiver com pagamento confirmado/em produção (PAID/IN_PROGRESS), NUNCA diga que você "já anotou", "já corrigiu", "encaminhou para compositores" ou que "vai ajustar internamente". Nesse caso, oriente o cliente a corrigir pessoalmente no link de acompanhamento usando o botão laranja "EDITAR INFORMAÇÕES". Se a música já estiver pronta/entregue (COMPLETED/REVISION), oriente a usar "Solicitar revisão" no mesmo link. Nunca prometa alteração manual interna nesses casos.
- REGRA CRÍTICA - NOVO PEDIDO: se o cliente disser que quer fazer/comprar outra música para outra pessoa (ex: "quero fazer uma pro meu filho"), NÃO trate como revisão. Oriente para iniciar novo pedido neste link: ${createOrderLink}

ORDER BUMPS / ADICIONAIS — LEIA COM ATENÇÃO:
O cliente pode ter comprado adicionais junto com a música. Os adicionais disponíveis são:
1. **Entrega Rápida (24h)** → "Fast Delivery" no contexto. Garante que a música será entregue em até 24 horas.
2. **Experiência de Presente** → "Gift Experience" no contexto. É uma página exclusiva na internet criada para o homenageado, onde ele descobre que a canção foi feita para ele. O cliente recebe um link para compartilhar. NÃO é um PDF, NÃO é a letra, NÃO é um certificado físico. É uma experiência digital interativa. Se comprada, o link da experiência aparece no ORDER CONTEXT.
3. **PDF da Letra Personalizada** → "Lyrics PDF" no contexto. Um PDF bonito com a letra da música para imprimir ou guardar como recordação.
4. **Streaming VIP (Spotify)** → A música é distribuída nas plataformas de streaming (Spotify, Apple Music, etc).

REGRA CRÍTICA: Quando o cliente perguntar sobre um valor adicional cobrado ou sobre algo que comprou, SEMPRE verifique os order bumps no ORDER CONTEXT antes de responder. Se o cliente comprou a "Experiência de Presente" (Gift Experience = YES), responda sobre a experiência de presente e forneça o link. NUNCA confunda a Experiência de Presente com o PDF da Letra — são produtos diferentes.
- REGRA CRÍTICA SOBRE PEDIDO NÃO ENCONTRADO: Quando o ORDER CONTEXT = "No orders found" E o cliente está buscando um pedido/música/canção (ex: comprou, pagou, não recebeu, não encontrou, música feita por outra pessoa, pedido feito por outro email, etc.), você NÃO DEVE:
  * Pedir nome do destinatário, número do pedido, comprovante, ou qualquer dado para investigar
  * Tentar localizar o pedido ou escalar para supervisor
  * Sugerir que o pedido pode estar em outro email
  Você DEVE simplesmente responder de forma breve e acolhedora, dizendo que para localizar o pedido com mais agilidade, pedimos que entre em contato pelo nosso WhatsApp: +55 61 99579-0193 (link: https://wa.me/5561995790193). Pronto, nada mais.
  Esta regra NÃO se aplica a dúvidas gerais sem relação com um pedido (ex: perguntas sobre o produto, preços, etc.) — nesses casos responda normalmente.
- REGRA DE INSATISFAÇÃO: Se perceber que o cliente está insatisfeito, frustrado, irritado ou com um problema recorrente que ainda não foi resolvido (ex: reclamação repetida, tom de urgência, pedido não atendido após múltiplas mensagens), peça gentilmente para ele entrar em contato URGENTE pelo nosso WhatsApp, explicando que pelo WhatsApp nossos atendentes vão resolver o problema dele de forma rápida e personalizada: [Clique aqui para falar conosco no WhatsApp](https://wa.me/5561995790193). Adapte o texto do link para o idioma do cliente (ex: em inglês "Click here to contact us on WhatsApp", em espanhol "Haga clic aquí para contactarnos por WhatsApp", etc.).
- Não inclua saudação inicial (o admin vai personalizar)
- Não inclua assinatura (é adicionada automaticamente)
- Mantenha a resposta concisa mas completa (máximo 250 palavras)
- SEMPRE forneça o link de acompanhamento quando relevante. Use EXATAMENTE este link (copie e cole, não modifique): ${trackingLink}
- NUNCA altere, encurte ou reescreva o link de acompanhamento. Use sempre a URL completa exata fornecida acima.

LINK DE ACOMPANHAMENTO DO CLIENTE:
${trackingLink}

KNOWLEDGE BASE:
${knowledgeContext}

ORDER CONTEXT:
${orderContext}`;

        const userPrompt = `Here is the full conversation thread for ticket "${ticket.subject}" from ${ticket.email}:

${conversationHistory}

Generate a suggested reply for the most recent customer message. The reply should directly address their question or concern.`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "HTTP-Referer": "https://apollosong.com",
                    "X-Title": "Apollo Song Support",
                },
                body: JSON.stringify({
                    model: OPENROUTER_SUPPORT_MODEL,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt },
                    ],
                    temperature: 0.4,
                    max_tokens: 1000,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            let aiResponse = data.choices?.[0]?.message?.content;

            if (!aiResponse) {
                throw new Error("Empty response from OpenRouter");
            }

            const lastInboundBody = [...ticket.messages]
                .reverse()
                .find((m) => m.direction === "INBOUND")
                ?.body ?? "";
            const referenceOrderStatus = ticket.order?.status ?? allOrders[0]?.status ?? "";
            // Strip quoted reply text (Stripe receipts, forwarded emails) to avoid false-positives
            const customerOwnText = stripQuotedText(lastInboundBody);
            const isNewSongIntent = isTicketNewSongRequest(customerOwnText);
            const isCorrectionIntent = isTicketDataCorrectionRequest(customerOwnText);

            if (isNewSongIntent && !isCorrectionIntent) {
                aiResponse = buildTicketNewSongReply({
                    locale: localeForGuardrail,
                    createOrderLink,
                    trackingLink,
                });
            } else if (isCorrectionIntent) {
                const correctionReply = buildTicketCorrectionReply({
                    locale: localeForGuardrail,
                    orderStatus: referenceOrderStatus,
                    trackingLink,
                });
                if (correctionReply) {
                    aiResponse = correctionReply;
                }
            }

            // Save AI response on the INBOUND message that triggered it
            await db.ticketMessage.update({
                where: { id: messageId },
                data: {
                    aiSuggestedResponse: aiResponse,
                    aiResponseStatus: "GENERATED",
                },
            });

            console.log(`✅ [AI Response] Generated for ticket ${ticketId}`);
        } catch (error) {
            console.error(`❌ [AI Response] Failed for ticket ${ticketId}:`, error);
            throw error;
        }
    },
    { connection, concurrency: 2 }
);

ticketAiResponseWorker.on("completed", (job) => console.log(`🤖 [AI Response] Job ${job.id} completed`));
ticketAiResponseWorker.on("failed", (job, err) => console.error(`❌ [AI Response] Job ${job?.id} failed:`, err.message));
ticketAiResponseWorker.on("ready", () => console.log("🤖 AI Response worker started and ready"));

// ============================================================================
// TICKET AUTO-CLOSE (5 days without customer reply)
// ============================================================================

const TICKET_AUTO_CLOSE_QUEUE = "ticket-auto-close";

const ticketAutoCloseQueue = new Queue(TICKET_AUTO_CLOSE_QUEUE, { connection });

async function autoCloseStaleTickets() {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    // Find WAITING_REPLY tickets where the last outbound message was sent > 5 days ago
    // and no newer inbound message exists after that outbound
    const staleTickets = await db.supportTicket.findMany({
        where: {
            status: "WAITING_REPLY",
        },
        include: {
            messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    const toClose = staleTickets.filter((t) => {
        const lastMsg = t.messages[0];
        if (!lastMsg) return false;
        // Only close if the last message is OUTBOUND (our reply) and older than 5 days
        return lastMsg.direction === "OUTBOUND" && lastMsg.createdAt < fiveDaysAgo;
    });

    if (toClose.length === 0) {
        console.log("🔒 Ticket auto-close: No stale tickets found");
        return;
    }

    await db.supportTicket.updateMany({
        where: { id: { in: toClose.map((t) => t.id) } },
        data: { status: "CLOSED", closedAt: new Date() },
    });

    console.log(`🔒 Ticket auto-close: Closed ${toClose.length} ticket(s) after 5 days without reply`);
}

const ticketAutoCloseWorker = new Worker(
    TICKET_AUTO_CLOSE_QUEUE,
    async () => {
        await autoCloseStaleTickets();
    },
    { connection, concurrency: 1 },
);

ticketAutoCloseWorker.on("completed", () => console.log("🔒 Ticket auto-close check completed"));
ticketAutoCloseWorker.on("failed", (job, error) => console.error(`❌ Ticket auto-close failed:`, error.message));
ticketAutoCloseWorker.on("ready", () => console.log("🔒 Ticket auto-close worker started and ready"));

async function setupTicketAutoCloseSchedule() {
    const repeatableJobs = await ticketAutoCloseQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await ticketAutoCloseQueue.removeRepeatableByKey(job.key);
    }

    await ticketAutoCloseQueue.add(
        "ticket-auto-close",
        {},
        {
            repeat: {
                every: 6 * 60 * 60 * 1000, // Every 6 hours
            },
        },
    );

    console.log("🔒 Ticket auto-close scheduled: checking every 6 hours");
}

setupTicketAutoCloseSchedule().catch(console.error);

// ============================================================================
// WHATSAPP RESPONSE WORKER
// ============================================================================

import { sendTextMessage, sendAudioMessage, sendAudioMessageFromBuffer, sendDocumentMessage, sendImageMessage, sendVideoMessage, markAsRead, downloadMedia, transcribeAudio, mimeToExtension, readImageWithMultimodal } from "../../lib/whatsapp";
import { generateWhatsAppAiResponse, type StreamingInfoUpdate } from "../../lib/whatsapp-ai";

const WHATSAPP_RESPONSE_QUEUE = "whatsapp-response";
const WHATSAPP_RESPONSE_WORKER_CONCURRENCY = (() => {
    const raw = Number.parseInt(process.env.WHATSAPP_RESPONSE_WORKER_CONCURRENCY || "", 10);
    return Number.isFinite(raw) && raw >= 1 && raw <= 20 ? raw : 4;
})();

const whatsappResponseQueue = new Queue(WHATSAPP_RESPONSE_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 10 * 1000 },
    },
});

const WHATSAPP_CLASSIFICATIONS = [
    "PEDIDO_STATUS",
    "PAGAMENTO",
    "REVISAO",
    "TECNICO",
    "COMERCIAL",
    "OUTROS",
] as const;

type WhatsAppClassification = typeof WHATSAPP_CLASSIFICATIONS[number];

function normalizeWhatsAppClassification(raw?: string | null): WhatsAppClassification | null {
    if (!raw) return null;
    const normalized = raw
        .trim()
        .toUpperCase()
        .replace(/[^A-Z_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    return WHATSAPP_CLASSIFICATIONS.includes(normalized as WhatsAppClassification)
        ? (normalized as WhatsAppClassification)
        : null;
}

function classifyWhatsAppByHeuristics(text: string): WhatsAppClassification {
    const value = normalizeForMatch(text || "");
    if (!value) return "OUTROS";

    if (/(pagamento|pagar|pix|cartao|boleto|estorno|refund|chargeback|fatura|cobranca|cobrança|payment)/.test(value)) {
        return "PAGAMENTO";
    }

    if (/(revisao|revisão|corrigir|corrige|erro|nome errado|pronuncia|pronúncia|letra errada|revision)/.test(value)) {
        return "REVISAO";
    }

    if (/(nao abre|não abre|nao funciona|não funciona|link quebrado|bug|erro tecnico|erro técnico|download|pdf|arquivo|audio|áudio|mp3|site)/.test(value)) {
        return "TECNICO";
    }

    if (/(desconto|cupom|coupon|promocao|promoção|valor|preco|preço|upgrade|streaming|plano)/.test(value)) {
        return "COMERCIAL";
    }

    if (/(pedido|status|entrega|acompanhar|acompanhamento|where is my order|order status|track order|cad[eê] meu pedido)/.test(value)) {
        return "PEDIDO_STATUS";
    }

    return "OUTROS";
}

function getWhatsAppClassificationLabel(category: WhatsAppClassification): string {
    const labels: Record<WhatsAppClassification, string> = {
        PEDIDO_STATUS: "Status do pedido",
        PAGAMENTO: "Pagamento",
        REVISAO: "Revisão",
        TECNICO: "Técnico",
        COMERCIAL: "Comercial",
        OUTROS: "Outros",
    };
    return labels[category];
}

const WHATSAPP_AUTO_LABEL_CONFIG = {
    "vip-streaming": { name: "VIP / Streaming", color: "#3b82f6", emoji: "\u{1F535}" },
    "pedido-status": { name: "Pedido / Status", color: "#22c55e", emoji: "\u{1F7E2}" },
    pagamento: { name: "Pagamento", color: "#f59e0b", emoji: "\u{1F7E1}" },
    revisao: { name: "Revisão", color: "#8b5cf6", emoji: "\u{1F7E3}" },
    tecnico: { name: "Técnico", color: "#64748b", emoji: "\u{1F539}" },
    comercial: { name: "Comercial", color: "#4A6FA5", emoji: "\u{1F535}" },
} as const;

type WhatsAppAutoLabelSlug = keyof typeof WHATSAPP_AUTO_LABEL_CONFIG;

const WHATSAPP_AUTO_LABEL_CACHE_TTL_MS = 5 * 60 * 1000;
const whatsAppAutoLabelIdCache = new Map<WhatsAppAutoLabelSlug, { id: string; expiresAt: number }>();

const WHATSAPP_CLASSIFICATION_TO_AUTO_LABEL: Record<WhatsAppClassification, WhatsAppAutoLabelSlug | null> = {
    PEDIDO_STATUS: "pedido-status",
    PAGAMENTO: "pagamento",
    REVISAO: "revisao",
    TECNICO: "tecnico",
    COMERCIAL: "comercial",
    OUTROS: null,
};

type ResolveAutoLabelInput = {
    classification: WhatsAppClassification;
    messageBody: string;
    sendUpsellAudio: boolean;
    streamingVipOrderId: string | null;
    streamingInfoUpdates: StreamingInfoUpdate[];
};

function isStreamingTopicForLabeling({
    messageBody,
    sendUpsellAudio,
    streamingVipOrderId,
    streamingInfoUpdates,
}: Omit<ResolveAutoLabelInput, "classification">): boolean {
    if (sendUpsellAudio || Boolean(streamingVipOrderId) || streamingInfoUpdates.length > 0) {
        return true;
    }

    const normalized = normalizeForMatch(messageBody || "");
    if (!normalized) return false;

    return /(spotify|streaming|distrokid|deezer|apple music|youtube music|amazon music|publicar|publicacao|distribuicao|plataforma|plataformas|capa|cover)/.test(normalized);
}

function resolveAutoLabelSlug(input: ResolveAutoLabelInput): WhatsAppAutoLabelSlug | null {
    if (isStreamingTopicForLabeling(input)) {
        return "vip-streaming";
    }
    return WHATSAPP_CLASSIFICATION_TO_AUTO_LABEL[input.classification];
}

async function ensureWhatsAppAutoLabelId(slug: WhatsAppAutoLabelSlug): Promise<string | null> {
    const now = Date.now();
    const cached = whatsAppAutoLabelIdCache.get(slug);
    if (cached && cached.expiresAt > now) {
        return cached.id;
    }

    const existing = await db.whatsAppLabel.findUnique({
        where: { slug },
        select: { id: true },
    });
    if (existing) {
        whatsAppAutoLabelIdCache.set(slug, { id: existing.id, expiresAt: now + WHATSAPP_AUTO_LABEL_CACHE_TTL_MS });
        return existing.id;
    }

    const config = WHATSAPP_AUTO_LABEL_CONFIG[slug];
    try {
        const created = await db.whatsAppLabel.create({
            data: {
                slug,
                name: config.name,
                color: config.color,
                emoji: config.emoji,
                isPredefined: true,
            },
            select: { id: true },
        });
        whatsAppAutoLabelIdCache.set(slug, { id: created.id, expiresAt: now + WHATSAPP_AUTO_LABEL_CACHE_TTL_MS });
        return created.id;
    } catch (error) {
        const concurrent = await db.whatsAppLabel.findUnique({
            where: { slug },
            select: { id: true },
        });
        if (concurrent) {
            whatsAppAutoLabelIdCache.set(slug, { id: concurrent.id, expiresAt: now + WHATSAPP_AUTO_LABEL_CACHE_TTL_MS });
            return concurrent.id;
        }
        console.error(`📱 [WhatsApp] Failed to ensure auto label ${slug}:`, error);
        return null;
    }
}

function pickStableAssignee(waId: string, preferredList?: string | null): string {
    const fallbackList = process.env.WHATSAPP_ASSIGNEES_DEFAULT || process.env.WHATSAPP_ESCALATION_DEFAULT_ASSIGNEE || "Thiago";
    const poolRaw = preferredList && preferredList.trim().length > 0 ? preferredList : fallbackList;
    const pool = poolRaw.split(",").map((name) => name.trim()).filter(Boolean);
    if (pool.length === 0) return "Thiago";
    if (pool.length === 1) return pool[0]!;

    let hash = 0;
    for (let i = 0; i < waId.length; i += 1) {
        hash = ((hash << 5) - hash + waId.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % pool.length;
    return pool[idx]!;
}

function resolveEscalationAssignee(category: WhatsAppClassification, waId: string): string {
    const byCategory: Record<WhatsAppClassification, string | undefined> = {
        PEDIDO_STATUS: process.env.WHATSAPP_ASSIGNEES_PEDIDO_STATUS,
        PAGAMENTO: process.env.WHATSAPP_ASSIGNEES_PAGAMENTO,
        REVISAO: process.env.WHATSAPP_ASSIGNEES_REVISAO,
        TECNICO: process.env.WHATSAPP_ASSIGNEES_TECNICO,
        COMERCIAL: process.env.WHATSAPP_ASSIGNEES_COMERCIAL,
        OUTROS: process.env.WHATSAPP_ASSIGNEES_OUTROS,
    };

    return pickStableAssignee(waId, byCategory[category]);
}

function detectWhatsAppLocale(text: string): "en" | "es" | "fr" | "it" | "pt" {
    const normalized = normalizeForMatch(text || "");
    if (!normalized) return "pt";

    const content = normalized.replace(/[^a-z0-9\s]/g, " ");
    const tokens = content.split(/\s+/).filter(Boolean);
    const tokenSet = new Set(tokens);

    const scores: Record<"en" | "es" | "fr" | "it" | "pt", number> = {
        pt: 0,
        en: 0,
        es: 0,
        fr: 0,
        it: 0,
    };

    const ptSignals = new Set([
        "ola",
        "oi",
        "obrigado",
        "obrigada",
        "pedido",
        "fiz",
        "comprar",
        "entregar",
        "pagamento",
        "receber",
        "quero",
        "preciso",
        "cancao",
        "musica",
        "ingresso",
        "link",
        "entregue",
        "ajuda",
        "certo",
        "valor",
        "forma",
        "prazo",
    ]);

    const enSignals = new Set([
        "the",
        "and",
        "you",
        "your",
        "order",
        "song",
        "track",
        "need",
        "thanks",
        "thank",
        "please",
        "can",
        "i",
        "my",
        "delivery",
        "payment",
        "refund",
        "purchase",
        "want",
        "customer",
        "how",
        "where",
        "when",
        "contact",
        "hello",
        "hi",
    ]);

    const esSignals = new Set([
        "hola",
        "gracias",
        "quiero",
        "tengo",
        "necesito",
        "puedo",
        "puedes",
        "cuando",
        "donde",
        "correo",
        "compra",
        "pedido",
        "cancion",
        "si",
        "entrega",
        "ayuda",
        "tambien",
    ]);

    const frSignals = new Set([
        "bonjour",
        "salut",
        "merci",
        "commande",
        "chanson",
        "musique",
        "aide",
        "acheter",
        "achat",
        "paiement",
        "livraison",
        "refus",
        "ou",
        "quand",
        "pourquoi",
        "comment",
        "client",
    ]);

    const itSignals = new Set([
        "ciao",
        "grazie",
        "ordine",
        "canzone",
        "brani",
        "acquist",
        "pagamento",
        "vorrei",
        "posso",
        "voglio",
        "compra",
        "consegna",
        "aiuto",
        "cliente",
        "dove",
        "quando",
        "quale",
    ]);

    for (const token of tokenSet) {
        if (ptSignals.has(token)) scores.pt += 1;
        if (enSignals.has(token)) scores.en += 1;
        if (esSignals.has(token)) scores.es += 1;
        if (frSignals.has(token)) scores.fr += 1;
        if (itSignals.has(token)) scores.it += 1;
    }

    const hasFrenchBigrams = /\b(?:bonjour|merci|comment|pourquoi|livraison|commande|details|paiement|ou|quand|avez-vous|avezvous|chez|quelle|client|par|de|la|partie)\b/i.test(content);
    const hasItalianBigrams = /\b(?:ciao|grazie|ordini|ordine|come posso|vorrei|pagamento|dove|quando|volete|messaggio|consegna|brano|canzone|ordine|grazie mille|spedizione)\b/i.test(content);

    const hasPortugueseBigrams = /\b(?:ola|oi|obrigado|obrigada|pedido|tambem|voce|voces|musica|quero|preciso|pagamento|entrega)\b/i.test(content);
    if (hasPortugueseBigrams) scores.pt += 3;

    const hasSpanishBigrams = /\b(?:que|para|por favor|muchas|buenas|buen dia|quiero|puedo|hace|mucho|vamos|desea|enviar|gracias|hola|tambien)\b/i.test(content);
    if (hasSpanishBigrams) scores.es += 3;

    if (hasFrenchBigrams) {
        scores.fr += 3;
    }

    if (hasItalianBigrams) {
        scores.it += 3;
    }

    const hasEnglishBigrams = /(?:thank you|how do|can you|i need|where is|please|what is|i want|is it|do you|order status|payment status|thank you for)/i.test(content);
    if (hasEnglishBigrams) scores.en += 3;

    const maxScore = Math.max(...Object.values(scores));
    if (maxScore < 1) return "pt";

    for (const locale of ["pt", "en", "es", "fr", "it"] as const) {
        if (scores[locale] === maxScore) {
            return locale;
        }
    }
    return "pt";
}

const whatsappResponseWorker = new Worker<{
    waId: string;
    messageBody: string;
    waMessageId: string;
    customerName: string | null;
    timestamp: number;
    messageType?: "text" | "audio" | "image" | "video" | "document" | "sticker";
    mediaId?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
    businessPhoneNumberId?: string;
    businessDisplayPhoneNumber?: string;
}>(
    WHATSAPP_RESPONSE_QUEUE,
    async (job) => {
        const {
            waId,
            waMessageId,
            customerName,
            timestamp,
            messageType,
            mediaId,
            mimeType: jobMimeType,
            fileName,
            caption,
            businessPhoneNumberId,
            businessDisplayPhoneNumber,
        } = job.data;
        let messageBody = job.data.messageBody;

        // Persist business number context (useful for debugging cross-country restrictions)
        const waMeta: Record<string, string> = {};
        if (businessPhoneNumberId) waMeta.businessPhoneNumberId = businessPhoneNumberId;
        if (businessDisplayPhoneNumber) waMeta.businessDisplayPhoneNumber = businessDisplayPhoneNumber;
        const waMetaObj = Object.keys(waMeta).length > 0 ? { wa: waMeta } : {};

        // Media metadata to store in the message (populated below for media types)
        let mediaUrl: string | undefined;
        let mediaMimeType: string | undefined;
        let transcription: string | undefined;
        let imageReading: string | undefined;

        const isMedia = messageType && messageType !== "text";

        // Handle media messages: download, persist to R2, and (for audio) transcribe
        if (isMedia && mediaId) {
            console.log(`📱 [WhatsApp] Processing ${messageType} message from ${waId}, mediaId: ${mediaId}`);
            const media = await downloadMedia(mediaId);
            if (media) {
                mediaMimeType = media.mimeType;
                const ext = mimeToExtension(media.mimeType);
                const r2Key = `whatsapp-media/${waId}/${waMessageId}.${ext}`;

                try {
                    mediaUrl = await StorageService.uploadBuffer(r2Key, media.buffer, media.mimeType);
                    console.log(`📱 [WhatsApp] Media uploaded to R2: ${r2Key}`);
                } catch (e) {
                    console.error(`📱 [WhatsApp] R2 upload failed for ${waId}:`, e);
                }

                // Audio-specific: also transcribe
                if (messageType === "audio") {
                    const result = await transcribeAudio(media.buffer, media.mimeType);
                    if (result) {
                        transcription = result;
                        messageBody = result;
                        console.log(`📱 [WhatsApp] Audio transcribed for ${waId}: ${result.substring(0, 80)}...`);
                    } else {
                        messageBody = "[Áudio não transcrito]";
                        console.warn(`📱 [WhatsApp] Audio transcription failed for ${waId}`);
                    }
                }

                if (messageType === "image") {
                    const imageResult = await readImageWithMultimodal(media.buffer, media.mimeType);
                    if (imageResult) {
                        imageReading = imageResult;
                        const cleanCaption = caption?.trim();
                        messageBody = cleanCaption ? `${cleanCaption}\n${imageResult}` : imageResult;
                        console.log(`📱 [WhatsApp] Image content extracted for ${waId}: ${imageResult.substring(0, 100)}...`);
                    } else {
                        console.warn(`📱 [WhatsApp] Image content extraction failed for ${waId}`);
                    }
                }
            } else {
                if (messageType === "audio") {
                    messageBody = "[Áudio não transcrito]";
                }
                console.warn(`📱 [WhatsApp] Media download failed for ${waId}, mediaId: ${mediaId}`);
            }
        } else {
            console.log(`📱 [WhatsApp] Processing message from ${waId}: ${messageBody.substring(0, 50)}...`);
        }

        // Find or create conversation
        let conversation = await db.whatsAppConversation.findUnique({
            where: { waId },
        });

        const isNew = !conversation;

        const messageLocale = detectWhatsAppLocale(messageBody);

        if (!conversation) {
            conversation = await db.whatsAppConversation.create({
                data: {
                    waId,
                    customerName,
                    locale: messageLocale,
                },
            });
            console.log(`📱 [WhatsApp] New conversation created for ${waId}`);
        } else {
            if (customerName && !conversation.customerName) {
                await db.whatsAppConversation.update({
                    where: { id: conversation.id },
                    data: { customerName },
                });
            }

            const shouldSwitchFromPtToForeign = conversation.locale === "pt" && ["en", "es", "fr", "it"].includes(messageLocale);
            const shouldSwitchBackToPt = conversation.locale !== "pt" && messageLocale === "pt";

            if (shouldSwitchFromPtToForeign || shouldSwitchBackToPt) {
                conversation = await db.whatsAppConversation.update({
                    where: { id: conversation.id },
                    data: { locale: messageLocale },
                });
            }
        }
        // Save inbound message (with idempotency check)
        const existingMsg = await db.whatsAppMessage.findUnique({
            where: { waMessageId },
            select: { id: true },
        });

        if (!existingMsg) {
            const isAudioTranscribed = messageType === "audio" && transcription;
            // Build display body
            let msgBody: string;
            if (messageType === "audio") {
                msgBody = isAudioTranscribed ? `[Áudio] ${messageBody}` : messageBody;
            } else if (messageType === "image") {
                if (caption && imageReading) {
                    msgBody = `[Imagem] ${caption}\n[Conteúdo detectado] ${imageReading}`;
                } else if (caption) {
                    msgBody = `[Imagem] ${caption}`;
                } else if (imageReading) {
                    msgBody = `[Imagem] ${imageReading}`;
                } else {
                    msgBody = "[Imagem]";
                }
            } else if (isMedia) {
                const typeLabels: Record<string, string> = { image: "Imagem", video: "Vídeo", document: "Documento", sticker: "Sticker" };
                const label = typeLabels[messageType!] ?? messageType;
                msgBody = caption ? `[${label}] ${caption}` : `[${label}]`;
            } else {
                msgBody = messageBody;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const metadata: any = { timestamp, ...waMetaObj };
            if (isMedia && messageType) {
                metadata.messageType = messageType;
                if (mediaId) metadata.mediaId = mediaId;
                if (mediaUrl) metadata.mediaUrl = mediaUrl;
                if (mediaMimeType) metadata.mimeType = mediaMimeType;
                if (fileName) metadata.fileName = fileName;
                if (caption) metadata.caption = caption;
                if (transcription) metadata.transcription = transcription;
                if (imageReading) metadata.imageReading = imageReading;
            }

            await db.whatsAppMessage.create({
                data: {
                    conversationId: conversation.id,
                    waMessageId,
                    direction: "inbound",
                    body: msgBody,
                    senderType: "customer",
                    metadata,
                },
            });
        }

        // Update conversation timestamp
        await db.whatsAppConversation.update({
            where: { id: conversation.id },
            data: { lastCustomerMessageAt: new Date() },
        });

        // Mark as read via Cloud API
        await markAsRead(waMessageId);

        const replyOptions = { replyToMessageId: waMessageId };

        // Dedup guard: if we already sent a non-reaction bot response to this message
        // (e.g., BullMQ retry after partial failure), skip the rest.
        const inboundMsg = await db.whatsAppMessage.findUnique({
            where: { waMessageId },
            select: { id: true, createdAt: true },
        });
        if (inboundMsg) {
            const existingBotResponse = await db.whatsAppMessage.findFirst({
                where: {
                    conversationId: conversation.id,
                    direction: "outbound",
                    senderType: "bot",
                    createdAt: { gte: inboundMsg.createdAt },
                },
                select: { id: true },
            });
            if (existingBotResponse) {
                console.log(`📱 [WhatsApp] Already responded to ${waMessageId}, skipping (dedup guard)`);
                return;
            }
        }

        // Staleness guard: if there is a newer inbound message in this conversation,
        // skip processing this older one to avoid queue buildup and outdated replies.
        if (inboundMsg) {
            const newerInboundBeforeAi = await db.whatsAppMessage.findFirst({
                where: {
                    conversationId: conversation.id,
                    direction: "inbound",
                    createdAt: { gt: inboundMsg.createdAt },
                },
                select: { waMessageId: true },
                orderBy: { createdAt: "desc" },
            });
            if (newerInboundBeforeAi?.waMessageId) {
                console.log(
                    `📱 [WhatsApp] Skipping stale message ${waMessageId} (newer inbound exists: ${newerInboundBeforeAi.waMessageId})`
                );
                return;
            }
        }

        // If audio transcription failed, ask customer to send text
        if (messageType === "audio" && messageBody === "[Áudio não transcrito]") {
            const fallbackMsg = "Desculpe, não consegui entender o áudio. Poderia enviar sua mensagem por texto, por favor? 🙏";
            const { messageId: fallbackWaId } = await sendTextMessage(waId, fallbackMsg, replyOptions);
            await db.whatsAppMessage.create({
                data: {
                    conversationId: conversation.id,
                    waMessageId: fallbackWaId ?? null,
                    direction: "outbound",
                    body: fallbackMsg,
                    senderType: "bot",
                    metadata: {
                        ...waMetaObj,
                        replyToWaMessageId: waMessageId,
                    } as any,
                },
            });
            console.log(`📱 [WhatsApp] Sent audio fallback message to ${waId}`);
            return;
        }

        // For non-text media without caption or transcription, skip AI response (nothing meaningful to reply to)
        const hasImageReading = messageType === "image" && Boolean(imageReading);
        if (isMedia && messageType !== "audio" && !caption && !hasImageReading) {
            console.log(`📱 [WhatsApp] ${messageType} without caption from ${waId}, skipping AI response`);
            return;
        }

        // If bot is disabled (admin took over), skip AI response
        if (!conversation.isBot) {
            console.log(`📱 [WhatsApp] Bot disabled for ${waId}, skipping AI response`);
            return;
        }

        // Generate AI response
        const aiResult = await generateWhatsAppAiResponse({
            conversationId: conversation.id,
            waId,
            locale: conversation.locale,
        });

        if (!aiResult) {
            console.warn(`📱 [WhatsApp] No AI response generated for ${waId}`);
            return;
        }

        const {
            text: aiResponse,
            escalate,
            sendAudioOrderIds,
            sendUpsellAudio,
            streamingVipOrderId,
            streamingInfoUpdates,
            classificationCategory,
        } = aiResult;

        const llmClassification = normalizeWhatsAppClassification(classificationCategory);
        const finalClassification = llmClassification ?? classifyWhatsAppByHeuristics(messageBody);
        const classificationLabel = getWhatsAppClassificationLabel(finalClassification);
        const classificationSource = llmClassification ? "llm" : "heuristic";
        const assignedTo = escalate ? resolveEscalationAssignee(finalClassification, waId) : null;
        let autoLabelIdToAssign: string | null = null;
        if (!conversation.labelId) {
            const autoLabelSlug = resolveAutoLabelSlug({
                classification: finalClassification,
                messageBody,
                sendUpsellAudio,
                streamingVipOrderId,
                streamingInfoUpdates,
            });

            if (autoLabelSlug) {
                autoLabelIdToAssign = await ensureWhatsAppAutoLabelId(autoLabelSlug);
            }
        }

        const outboundMetadata: Record<string, unknown> = { ...waMetaObj };
        const routingMetadata: Record<string, unknown> = {
            classification: finalClassification,
            classificationLabel,
            classificationSource,
        };
        if (escalate) routingMetadata.escalated = true;
        if (assignedTo) routingMetadata.assignedTo = assignedTo;
        if (escalate) routingMetadata.assignedAt = new Date().toISOString();
        outboundMetadata.routing = routingMetadata;
        outboundMetadata.replyToWaMessageId = waMessageId;

        // Re-check staleness right before sending, because a newer customer message
        // may have arrived while we were waiting for AI.
        if (inboundMsg) {
            const newerInboundBeforeSend = await db.whatsAppMessage.findFirst({
                where: {
                    conversationId: conversation.id,
                    direction: "inbound",
                    createdAt: { gt: inboundMsg.createdAt },
                },
                select: { waMessageId: true },
                orderBy: { createdAt: "desc" },
            });
            if (newerInboundBeforeSend?.waMessageId) {
                console.log(
                    `📱 [WhatsApp] Skipping stale send for ${waMessageId} (newer inbound exists: ${newerInboundBeforeSend.waMessageId})`
                );
                return;
            }
        }

        // Send response via Cloud API
        const { messageId: outboundWaId } = await sendTextMessage(waId, aiResponse, replyOptions);

        // Save outbound message
        await db.whatsAppMessage.create({
            data: {
                conversationId: conversation.id,
                waMessageId: outboundWaId ?? null,
                direction: "outbound",
                body: aiResponse,
                senderType: "bot",
                metadata: outboundMetadata as any,
            },
        });

        // Send audio files if requested (with duplicate guard)
        if (sendAudioOrderIds.length > 0) {
            // Check if audio was already sent in last 5 minutes to prevent loops
            const recentAudioSend = await db.whatsAppMessage.findFirst({
                where: {
                    conversationId: conversation.id,
                    direction: "outbound",
                    body: { startsWith: "🎵 Música enviada" },
                    createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
                },
            });
            if (recentAudioSend) {
                console.log(`📱 [WhatsApp] Skipping audio send — already sent recently for ${waId}`);
            } else {
            // Limit to first order only to prevent spam
            const limitedOrderIds = sendAudioOrderIds.slice(0, 1);
            for (const orderId of limitedOrderIds) {
                try {
                    const order = await db.songOrder.findUnique({
                        where: { id: orderId },
                        select: { songFileUrl: true, songFileUrl2: true, recipientName: true, genre: true, status: true, createdAt: true, hasLyrics: true, lyricsPdfA4Url: true },
                    });
                    if (!order) {
                        console.warn(`📱 [WhatsApp] SEND_AUDIO: order ${orderId} not found`);
                        continue;
                    }
                    if (order.status !== "COMPLETED") {
                        console.warn(`📱 [WhatsApp] SEND_AUDIO: order ${orderId} not completed (${order.status})`);
                        continue;
                    }
                    const urls = [order.songFileUrl, order.songFileUrl2].filter(Boolean) as string[];
                    if (urls.length === 0) {
                        console.warn(`📱 [WhatsApp] SEND_AUDIO: order ${orderId} has no song files`);
                        continue;
                    }

                    // Send context message before audio
                    const orderDate = new Date(order.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                    const statusMap: Record<string, string> = { COMPLETED: "Entregue ✅", PAID: "Pago", IN_PROGRESS: "Em produção", REVISION: "Em revisão" };
                    const genreLabel = getWhatsAppGenreLabel(order.genre);
                    const headerMsg = `🎵 Músicas para ${order.recipientName || "seu pedido"}${order.genre ? ` (${genreLabel})` : ""} — Pedido ${orderDate} — ${statusMap[order.status] || order.status}`;
                    const { messageId: headerMsgId } = await sendTextMessage(waId, headerMsg);
                    await db.whatsAppMessage.create({
                        data: {
                            conversationId: conversation.id,
                            waMessageId: headerMsgId ?? null,
                            direction: "outbound",
                            body: headerMsg,
                            senderType: "bot",
                        },
                    });

                    for (const url of urls) {
                        const { messageId: audioMsgId } = await sendAudioMessage(waId, url);
                        await db.whatsAppMessage.create({
                            data: {
                                conversationId: conversation.id,
                                waMessageId: audioMsgId ?? null,
                                direction: "outbound",
                                body: `🎵 Música enviada (${order.recipientName || "pedido"})`,
                                senderType: "bot",
                                metadata: { type: "audio", songOrderId: orderId, audioUrl: url } as any,
                            },
                        });
                        console.log(`📱 [WhatsApp] Audio sent for order ${orderId} to ${waId}`);
                    }

                    // Send lyrics PDF if purchased
                    if (order.hasLyrics && order.lyricsPdfA4Url) {
                        const pdfFilename = `Letra - ${order.recipientName || "Canção"}.pdf`;
                        const { messageId: pdfMsgId } = await sendDocumentMessage(waId, order.lyricsPdfA4Url, pdfFilename, `📜 PDF da letra — ${order.recipientName || "seu pedido"}`);
                        await db.whatsAppMessage.create({
                            data: {
                                conversationId: conversation.id,
                                waMessageId: pdfMsgId ?? null,
                                direction: "outbound",
                                body: `📜 PDF da letra enviado (${order.recipientName || "pedido"})`,
                                senderType: "bot",
                                metadata: { type: "document", songOrderId: orderId, documentUrl: order.lyricsPdfA4Url } as any,
                            },
                        });
                        console.log(`📱 [WhatsApp] Lyrics PDF sent for order ${orderId} to ${waId}`);
                    }
                } catch (e) {
                    console.error(`📱 [WhatsApp] SEND_AUDIO failed for order ${orderId}:`, e);
                }
            }
            } // end else (recentAudioSend guard)
        }

        // Send upsell audio about Spotify VIP if requested
        if (sendUpsellAudio) {
            const recentUpsellAudio = await db.whatsAppMessage.findFirst({
                where: {
                    conversationId: conversation.id,
                    direction: "outbound",
                    body: { contains: "Áudio explicativo sobre Streaming VIP" },
                },
            });
            if (recentUpsellAudio) {
                console.log(`📱 [WhatsApp] Skipping upsell audio — already sent for ${waId}`);
            } else {
                try {
                    const upsellAudioUrl = "https://pub-b085b85804204c82b96e15ec554b0940.r2.dev/upsell-spotify.mp3";
                    const { messageId: upsellMsgId } = await sendAudioMessage(waId, upsellAudioUrl);
                    await db.whatsAppMessage.create({
                        data: {
                            conversationId: conversation.id,
                            waMessageId: upsellMsgId ?? null,
                            direction: "outbound",
                            body: "🎵 Áudio explicativo sobre Streaming VIP enviado",
                            senderType: "bot",
                            metadata: { type: "audio", audioUrl: upsellAudioUrl, upsell: true } as any,
                        },
                    });
                    console.log(`📱 [WhatsApp] Upsell audio sent to ${waId}`);
                } catch (e) {
                    console.error(`📱 [WhatsApp] Failed to send upsell audio to ${waId}:`, e);
                }
            }
        }

        // Create Streaming VIP upsell if requested
        if (streamingVipOrderId) {
            try {
                const parentOrder = await db.songOrder.findUnique({
                    where: { id: streamingVipOrderId },
                    select: {
                        id: true, status: true, recipientName: true, genre: true, email: true,
                        locale: true, currency: true, songFileUrl: true, songFileUrl2: true,
                        orderType: true,
                        childOrders: {
                            where: { orderType: "STREAMING_UPSELL" },
                            select: { id: true, status: true, preferredSongForStreaming: true },
                        },
                    },
                });

                if (!parentOrder) {
                    console.warn(`📱 [WhatsApp] STREAMING_VIP: parent order ${streamingVipOrderId} not found`);
                } else if (parentOrder.status !== "COMPLETED") {
                    console.warn(`📱 [WhatsApp] STREAMING_VIP: parent order ${streamingVipOrderId} not completed`);
                } else {
                    // Check if already has an active streaming upsell
                    const existingUpsell = parentOrder.childOrders.find(c =>
                        ["PENDING", "PAID", "IN_PROGRESS", "COMPLETED"].includes(c.status)
                    );

                    if (existingUpsell) {
                        const statusMsg = existingUpsell.status === "PENDING"
                            ? `Já existe um pedido de Streaming VIP pendente para ${parentOrder.recipientName || "este pedido"}. Aqui está o link de pagamento:`
                            : `O Streaming VIP para ${parentOrder.recipientName || "este pedido"} já foi ${existingUpsell.status === "COMPLETED" ? "publicado" : "processado"}! ✅`;

                        if (existingUpsell.status === "PENDING") {
                            const locale = parentOrder.locale || "pt";
                            const localePrefix = locale !== "en" ? `/${locale}` : "";
                            const checkoutUrl = `${SITE_URL}${localePrefix}/order/${existingUpsell.id}`;
                            const fullMsg = `${statusMsg}\n\n👉 ${checkoutUrl}`;
                            const { messageId: vipMsgId } = await sendTextMessage(waId, fullMsg);
                            await db.whatsAppMessage.create({
                                data: {
                                    conversationId: conversation.id,
                                    waMessageId: vipMsgId ?? null,
                                    direction: "outbound",
                                    body: fullMsg,
                                    senderType: "bot",
                                },
                            });
                        }
                    } else {
                        // Create new streaming upsell
                        const currency = parentOrder.currency || "BRL";
                        const locale = parentOrder.locale || "pt";
                        const isSecondSong = false; // first streaming upsell for this parent

                        // Pricing logic (mirrors song-order.ts getStreamingUpsellPrice)
                        const priceMap: Record<string, number> = {
                            BRL: 19700, USD: 9900, EUR: 9900,
                        };
                        const price = priceMap[currency] ?? 9900;

                        const songUrl = parentOrder.songFileUrl;

                        const newUpsell = await db.songOrder.create({
                            data: {
                                email: parentOrder.email!,
                                recipient: parentOrder.recipientName || "Streaming VIP",
                                recipientName: parentOrder.recipientName,
                                qualities: "streaming_vip",
                                memories: "streaming_vip",
                                genre: parentOrder.genre,
                                locale,
                                currency,
                                status: "PENDING",
                                orderType: "STREAMING_UPSELL",
                                priceAtOrder: price,
                                parentOrderId: parentOrder.id,
                                preferredSongForStreaming: songUrl,
                            },
                        });

                        const localePrefix = locale !== "en" ? `/${locale}` : "";
                        const checkoutUrl = `${SITE_URL}${localePrefix}/order/${newUpsell.id}`;
                        const priceFormatted = currency === "BRL"
                            ? `R$ ${(price / 100).toFixed(2).replace(".", ",")}`
                            : currency === "EUR"
                            ? `€${(price / 100).toFixed(2)}`
                            : `$${(price / 100).toFixed(2)}`;

                        const parentGenreLabel = getWhatsAppGenreLabel(parentOrder.genre);
                        const vipMsg = `🎵 Streaming VIP para ${parentOrder.recipientName || "seu pedido"}${parentOrder.genre ? ` (${parentGenreLabel})` : ""}\nValor: ${priceFormatted}\n\nFinalize o pagamento aqui:\n👉 ${checkoutUrl}`;
                        const { messageId: vipMsgId } = await sendTextMessage(waId, vipMsg);
                        await db.whatsAppMessage.create({
                            data: {
                                conversationId: conversation.id,
                                waMessageId: vipMsgId ?? null,
                                direction: "outbound",
                                body: vipMsg,
                                senderType: "bot",
                            },
                        });
                        console.log(`📱 [WhatsApp] Streaming VIP upsell created for order ${streamingVipOrderId}, checkout: ${checkoutUrl}`);
                    }
                }
            } catch (e) {
                console.error(`📱 [WhatsApp] STREAMING_VIP failed for order ${streamingVipOrderId}:`, e);
            }
        }

        // Process streaming info updates (photo, song name, preferred version)
        if (streamingInfoUpdates.length > 0) {
            for (const update of streamingInfoUpdates) {
                try {
                    if (update.type === "photo") {
                        // Save the most recent image URL as honoree photo
                        if (mediaUrl && messageType === "image") {
                            await db.songOrder.update({
                                where: { id: update.upsellId },
                                data: { honoreePhotoUrl: mediaUrl },
                            });
                            console.log(`📱 [WhatsApp] Saved honoree photo for streaming upsell ${update.upsellId}`);
                        } else {
                            // Try to find the most recent image in the conversation
                            const recentImage = await db.whatsAppMessage.findFirst({
                                where: {
                                    conversationId: conversation.id,
                                    direction: "inbound",
                                    body: { startsWith: "[Imagem]" },
                                },
                                orderBy: { createdAt: "desc" },
                                select: { metadata: true },
                            });
                            const imgUrl = (recentImage?.metadata as any)?.mediaUrl as string | undefined;
                            if (imgUrl) {
                                await db.songOrder.update({
                                    where: { id: update.upsellId },
                                    data: { honoreePhotoUrl: imgUrl },
                                });
                                console.log(`📱 [WhatsApp] Saved honoree photo (from history) for streaming upsell ${update.upsellId}`);
                            } else {
                                console.warn(`📱 [WhatsApp] No image found to save as honoree photo for ${update.upsellId}`);
                            }
                        }
                    } else if (update.type === "name" && update.value) {
                        const normalizedSongName = update.value.replace(/\s+/g, " ").trim();
                        if (!normalizedSongName) continue;

                        const existingStreamingOrders = await db.songOrder.findMany({
                            where: {
                                orderType: "STREAMING_UPSELL",
                                id: { not: update.upsellId },
                                status: { notIn: ["CANCELLED", "REFUNDED"] },
                                streamingSongName: { not: null },
                            },
                            select: {
                                id: true,
                                streamingSongName: true,
                            },
                        });
                        const duplicateOrder = existingStreamingOrders.find((existingOrder) =>
                            areStreamingSongNamesConflicting(normalizedSongName, existingOrder.streamingSongName)
                        );
                        if (duplicateOrder) {
                            console.warn(
                                `📱 [WhatsApp] Skipped duplicate streaming song name "${normalizedSongName}" for ${update.upsellId}. Conflicts with ${duplicateOrder.id}`
                            );
                            continue;
                        }

                        await db.songOrder.update({
                            where: { id: update.upsellId },
                            data: { streamingSongName: normalizedSongName },
                        });
                        console.log(`📱 [WhatsApp] Saved song name "${normalizedSongName}" for streaming upsell ${update.upsellId}`);
                    } else if (update.type === "song" && update.value) {
                        // Get parent order to find the correct song URL
                        const upsell = await db.songOrder.findUnique({
                            where: { id: update.upsellId },
                            select: { parentOrderId: true },
                        });
                        if (upsell?.parentOrderId) {
                            const parent = await db.songOrder.findUnique({
                                where: { id: upsell.parentOrderId },
                                select: { songFileUrl: true, songFileUrl2: true },
                            });
                            const songUrl = update.value === "2" ? parent?.songFileUrl2 : parent?.songFileUrl;
                            if (songUrl) {
                                await db.songOrder.update({
                                    where: { id: update.upsellId },
                                    data: { preferredSongForStreaming: songUrl },
                                });
                                console.log(`📱 [WhatsApp] Saved preferred song (option ${update.value}) for streaming upsell ${update.upsellId}`);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`📱 [WhatsApp] STREAMING_INFO update failed for ${update.upsellId}:`, e);
                }
            }
        }

        // Update bot timestamp (and disable bot if escalating)
        await db.whatsAppConversation.update({
            where: { id: conversation.id },
            data: {
                lastBotMessageAt: new Date(),
                ...(autoLabelIdToAssign ? { labelId: autoLabelIdToAssign } : {}),
                ...(escalate ? { isBot: false } : {}),
            },
        });

        // Notify Telegram on escalation
        if (escalate) {
            const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
            const TELEGRAM_AUTOMATION_CHAT_ID = "-5221304809";
            if (TELEGRAM_BOT_TOKEN) {
                const name = customerName ? ` (${customerName})` : "";
                const snippet = messageBody.substring(0, 150);
                const assignedLabel = assignedTo ? `\n👤 ${assignedTo}` : "";
                const msg = `🔔 <b>ESCALAÇÃO WHATSAPP</b>\n\nBot transferiu para humano.\n📞 ${waId}${name}\n🏷️ ${classificationLabel}${assignedLabel}\n💬 ${snippet}`;
                try {
                    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                            text: msg,
                            parse_mode: "HTML",
                        }),
                    });
                } catch (e) {
                    console.error("[WhatsApp] Telegram escalation alert failed:", e);
                }
            }
            console.log(`📱 [WhatsApp] Escalated to human for ${waId} | class=${finalClassification} | assigned=${assignedTo ?? "none"}`);
        }

        // Send Telegram alert for new conversations
        if (isNew) {
            const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
            const TELEGRAM_AUTOMATION_CHAT_ID = "-5221304809";
            if (TELEGRAM_BOT_TOKEN) {
                const name = customerName ? ` (${customerName})` : "";
                const snippet = messageBody.substring(0, 150);
                const msg = `📱 <b>NOVA CONVERSA WHATSAPP</b>\n\n📞 ${waId}${name}\n💬 ${snippet}`;
                try {
                    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                            text: msg,
                            parse_mode: "HTML",
                        }),
                    });
                } catch (e) {
                    console.error("[WhatsApp] Telegram alert failed:", e);
                }
            }
        }

        console.log(`✅ [WhatsApp] Response sent to ${waId}`);
    },
    { connection, concurrency: WHATSAPP_RESPONSE_WORKER_CONCURRENCY }
);

whatsappResponseWorker.on("completed", (job) => console.log(`📱 [WhatsApp] Job ${job.id} completed`));
whatsappResponseWorker.on("failed", (job, err) => console.error(`❌ [WhatsApp] Job ${job?.id} failed:`, err.message));
whatsappResponseWorker.on("ready", () => console.log(`📱 WhatsApp response worker started and ready (concurrency: ${WHATSAPP_RESPONSE_WORKER_CONCURRENCY})`));

// ============================================================================
// WHATSAPP ADMIN VOICE NOTE WORKER (CONVERSION + SEND)
// ============================================================================

const WHATSAPP_ADMIN_VOICE_NOTE_QUEUE = "whatsapp-admin-voice-note";
const WHATSAPP_ADMIN_OUTBOUND_QUEUE = "whatsapp-admin-outbound";
const WHATSAPP_ADMIN_ORDER_SONGS_QUEUE = "whatsapp-admin-order-songs";
const WHATSAPP_ADMIN_VOICE_NOTE_FFMPEG_BINARY =
    process.env.WHATSAPP_AUDIO_FFMPEG_PATH?.trim()
    || process.env.FFMPEG_BINARY_PATH?.trim()
    || (typeof ffmpegStaticPath === "string" && ffmpegStaticPath.trim().length > 0 ? ffmpegStaticPath : "ffmpeg");

function toMetadataObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

const whatsappAdminOutboundQueue = new Queue<WhatsAppAdminOutboundJob>(WHATSAPP_ADMIN_OUTBOUND_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 1,
    },
});

const whatsappAdminOutboundWorker = new Worker<WhatsAppAdminOutboundJob>(
    WHATSAPP_ADMIN_OUTBOUND_QUEUE,
    async (job) => {
        const { conversationId, queuedMessageId, waId, textBody, media, routingMetadata } = job.data;

        const queuedMessage = await db.whatsAppMessage.findFirst({
            where: {
                id: queuedMessageId,
                conversationId,
                direction: "outbound",
                senderType: "admin",
            },
            select: {
                id: true,
                waMessageId: true,
                metadata: true,
            },
        });

        if (!queuedMessage) {
            throw new Error(`Queued outbound message ${queuedMessageId} not found`);
        }

        let metadata = toMetadataObject(queuedMessage.metadata);
        const persistMetadata = async (
            patch: Record<string, unknown>,
            options?: { waMessageId?: string | null }
        ) => {
            metadata = { ...metadata, ...patch };
            await db.whatsAppMessage.update({
                where: { id: queuedMessageId },
                data: {
                    ...(options?.waMessageId ? { waMessageId: options.waMessageId } : {}),
                    metadata: metadata as Prisma.InputJsonValue,
                },
            });
        };

        if (queuedMessage.waMessageId && metadata.sendStatus === "sent") {
            console.log(`📱 [WhatsApp Admin Outbound] Message ${queuedMessageId} already sent, skipping`);
            return;
        }

        await persistMetadata({
            sendStatus: "processing",
            processingAt: new Date().toISOString(),
            queueJobId: String(job.id ?? ""),
            queueName: WHATSAPP_ADMIN_OUTBOUND_QUEUE,
        });

        try {
            const trimmedText = textBody?.trim() ?? "";
            let messageId: string | undefined;

            if (media) {
                const caption = media.caption?.trim() || trimmedText || undefined;

                if (media.messageType === "audio") {
                    const audioResponse = await fetch(media.url);
                    if (!audioResponse.ok) {
                        throw new Error(`Falha ao baixar áudio para envio (${audioResponse.status}).`);
                    }

                    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
                    const headerMimeType = audioResponse.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
                    const result = await sendAudioMessageFromBuffer(waId, audioBuffer, {
                        mimeType: media.mimeType || headerMimeType,
                        fileName: media.fileName,
                        voice: Boolean(media.voiceNote),
                    });
                    messageId = result.messageId;
                    if (!messageId) {
                        if (result.errorCode === 131053) {
                            throw new Error("WhatsApp recusou o áudio (131053: formato/codec incompatível).");
                        }
                        throw new Error("WhatsApp recusou o envio do áudio.");
                    }
                } else if (media.messageType === "video") {
                    const result = await sendVideoMessage(waId, media.url, caption);
                    messageId = result.messageId;
                    if (!messageId) {
                        throw new Error("WhatsApp recusou o envio do vídeo.");
                    }
                } else if (media.messageType === "image") {
                    const result = await sendImageMessage(waId, media.url, caption);
                    messageId = result.messageId;
                    if (!messageId) {
                        throw new Error("WhatsApp recusou o envio da imagem.");
                    }
                } else {
                    const filename = media.fileName?.trim() || "arquivo";
                    const result = await sendDocumentMessage(waId, media.url, filename, caption);
                    messageId = result.messageId;
                    if (!messageId) {
                        throw new Error("WhatsApp recusou o envio do documento.");
                    }
                }

                if (media.messageType === "audio" && trimmedText) {
                    const followupResult = await sendTextMessage(waId, trimmedText);
                    await db.whatsAppMessage.create({
                        data: {
                            conversationId,
                            waMessageId: followupResult.messageId ?? null,
                            direction: "outbound",
                            body: trimmedText,
                            senderType: "admin",
                            metadata: {
                                routing: routingMetadata,
                                queueName: WHATSAPP_ADMIN_OUTBOUND_QUEUE,
                                queuedMessageId,
                            } as Prisma.InputJsonValue,
                        },
                    });
                }
            } else {
                if (!trimmedText) {
                    throw new Error("Mensagem vazia para envio de texto.");
                }
                const result = await sendTextMessage(waId, trimmedText);
                messageId = result.messageId;
                if (!messageId) {
                    throw new Error("WhatsApp recusou o envio da mensagem.");
                }
            }

            await persistMetadata(
                {
                    sendStatus: "sent",
                    sentAt: new Date().toISOString(),
                    ...(media ? {
                        messageType: media.messageType,
                        mediaUrl: media.url,
                        ...(media.mimeType ? { mimeType: media.mimeType } : {}),
                        ...(media.fileName ? { fileName: media.fileName } : {}),
                        ...(media.voiceNote ? { voiceNote: true } : {}),
                    } : {}),
                },
                { waMessageId: messageId ?? null }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown outbound send error";
            await persistMetadata({
                sendStatus: "failed",
                failedAt: new Date().toISOString(),
                errorMessage: message,
            });
            throw error;
        }
    },
    { connection, concurrency: 4 }
);

whatsappAdminOutboundWorker.on("completed", (job) => console.log(`📱 [WhatsApp Admin Outbound] Job ${job.id} completed`));
whatsappAdminOutboundWorker.on("failed", (job, err) => console.error(`❌ [WhatsApp Admin Outbound] Job ${job?.id} failed:`, err.message));
whatsappAdminOutboundWorker.on("ready", () => console.log("📱 WhatsApp admin outbound worker started and ready"));

const whatsappAdminOrderSongsQueue = new Queue<WhatsAppAdminOrderSongsJob>(WHATSAPP_ADMIN_ORDER_SONGS_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 1,
    },
});

const whatsappAdminOrderSongsWorker = new Worker<WhatsAppAdminOrderSongsJob>(
    WHATSAPP_ADMIN_ORDER_SONGS_QUEUE,
    async (job) => {
        const { conversationId, queuedMessageId, waId, orderId, routingMetadata } = job.data;

        const queuedMessage = await db.whatsAppMessage.findFirst({
            where: {
                id: queuedMessageId,
                conversationId,
                direction: "outbound",
                senderType: "admin",
            },
            select: {
                id: true,
                waMessageId: true,
                metadata: true,
            },
        });

        if (!queuedMessage) {
            throw new Error(`Queued order songs message ${queuedMessageId} not found`);
        }

        let metadata = toMetadataObject(queuedMessage.metadata);
        const persistMetadata = async (
            patch: Record<string, unknown>,
            options?: { waMessageId?: string | null }
        ) => {
            metadata = { ...metadata, ...patch };
            await db.whatsAppMessage.update({
                where: { id: queuedMessageId },
                data: {
                    ...(options?.waMessageId ? { waMessageId: options.waMessageId } : {}),
                    metadata: metadata as Prisma.InputJsonValue,
                },
            });
        };

        if (queuedMessage.waMessageId && metadata.sendStatus === "sent") {
            console.log(`📱 [WhatsApp Admin Songs] Message ${queuedMessageId} already sent, skipping`);
            return;
        }

        await persistMetadata({
            sendStatus: "processing",
            processingAt: new Date().toISOString(),
            queueJobId: String(job.id ?? ""),
            queueName: WHATSAPP_ADMIN_ORDER_SONGS_QUEUE,
        });

        try {
            const order = await db.songOrder.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    genre: true,
                    recipientName: true,
                    songFileUrl: true,
                    songFileUrl2: true,
                },
            });

            if (!order) {
                throw new Error("Pedido não encontrado para envio das músicas.");
            }

            const tracks = [
                { url: order.songFileUrl, trackIndex: 1 },
                { url: order.songFileUrl2, trackIndex: 2 },
            ].filter((track): track is { url: string; trackIndex: number } => Boolean(track.url));

            if (tracks.length === 0) {
                throw new Error("Pedido sem músicas prontas para envio.");
            }

            const honoreeName = order.recipientName?.trim() || "quem você ama";
            const genreLabel = getWhatsAppGenreLabel(order.genre);
            const introMessage = tracks.length > 1
                ? `🎵 Seguem suas músicas no gênero ${genreLabel} para homenagear ${honoreeName}.`
                : `🎵 Segue sua música no gênero ${genreLabel} para homenagear ${honoreeName}.`;

            const introResult = await sendTextMessage(waId, introMessage);
            if (!introResult.messageId) {
                throw new Error("WhatsApp recusou o envio da mensagem introdutória.");
            }

            await persistMetadata(
                {
                    sendStatus: "sending_tracks",
                    introSentAt: new Date().toISOString(),
                    orderId,
                },
                { waMessageId: introResult.messageId }
            );

            let sentCount = 0;
            let failedCount = 0;

            for (const track of tracks) {
                const result = await sendAudioMessage(waId, track.url);
                if (!result.messageId) {
                    failedCount += 1;
                    continue;
                }

                sentCount += 1;
                await db.whatsAppMessage.create({
                    data: {
                        conversationId,
                        waMessageId: result.messageId,
                        direction: "outbound",
                        body: `[audio] ${order.recipientName || "Música"} - pedido ${order.id} - opção ${track.trackIndex}`,
                        senderType: "admin",
                        metadata: {
                            routing: routingMetadata,
                            queueName: WHATSAPP_ADMIN_ORDER_SONGS_QUEUE,
                            messageType: "audio",
                            mediaUrl: track.url,
                            orderId: order.id,
                            trackIndex: track.trackIndex,
                        } as Prisma.InputJsonValue,
                    },
                });
            }

            if (sentCount === 0) {
                throw new Error("WhatsApp recusou o envio de todas as músicas do pedido.");
            }

            await persistMetadata({
                sendStatus: failedCount > 0 ? "partial" : "sent",
                sentAt: new Date().toISOString(),
                totalTracks: tracks.length,
                sentCount,
                failedCount,
                orderId: order.id,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown order songs send error";
            await persistMetadata({
                sendStatus: "failed",
                failedAt: new Date().toISOString(),
                errorMessage: message,
            });
            throw error;
        }
    },
    { connection, concurrency: 2 }
);

whatsappAdminOrderSongsWorker.on("completed", (job) => console.log(`📱 [WhatsApp Admin Songs] Job ${job.id} completed`));
whatsappAdminOrderSongsWorker.on("failed", (job, err) => console.error(`❌ [WhatsApp Admin Songs] Job ${job?.id} failed:`, err.message));
whatsappAdminOrderSongsWorker.on("ready", () => console.log("📱 WhatsApp admin order songs worker started and ready"));

async function convertAudioBufferToMp3InWorker(buffer: Buffer, inputExt: string): Promise<Buffer> {
    const id = randomUUID();
    const inputPath = path.join("/tmp", `wa-admin-voice-${id}.${inputExt || "bin"}`);
    const outputPath = path.join("/tmp", `wa-admin-voice-${id}.mp3`);

    await writeFile(inputPath, buffer);

    try {
        await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn(WHATSAPP_ADMIN_VOICE_NOTE_FFMPEG_BINARY, [
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                inputPath,
                "-vn",
                "-map_metadata",
                "-1",
                "-acodec",
                "libmp3lame",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-b:a",
                "128k",
                outputPath,
            ]);

            let stderr = "";
            ffmpeg.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            ffmpeg.on("error", reject);
            ffmpeg.on("close", (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(stderr || `ffmpeg exited with code ${code}`));
            });
        });

        return await readFile(outputPath);
    } finally {
        await Promise.allSettled([
            unlink(inputPath),
            unlink(outputPath),
        ]);
    }
}

const whatsappAdminVoiceNoteQueue = new Queue<WhatsAppAdminVoiceNoteJob>(WHATSAPP_ADMIN_VOICE_NOTE_QUEUE, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 1,
    },
});

const whatsappAdminVoiceNoteWorker = new Worker<WhatsAppAdminVoiceNoteJob>(
    WHATSAPP_ADMIN_VOICE_NOTE_QUEUE,
    async (job) => {
        const {
            conversationId,
            queuedMessageId,
            waId,
            mediaUrl,
            mimeType,
            fileName,
            textBody,
            routingMetadata,
        } = job.data;

        const queuedMessage = await db.whatsAppMessage.findFirst({
            where: {
                id: queuedMessageId,
                conversationId,
                direction: "outbound",
                senderType: "admin",
            },
            select: {
                id: true,
                waMessageId: true,
                metadata: true,
            },
        });

        if (!queuedMessage) {
            throw new Error(`Queued outbound message ${queuedMessageId} not found`);
        }

        let metadata = toMetadataObject(queuedMessage.metadata);

        const persistMetadata = async (
            patch: Record<string, unknown>,
            options?: { waMessageId?: string | null }
        ) => {
            metadata = { ...metadata, ...patch };
            await db.whatsAppMessage.update({
                where: { id: queuedMessageId },
                data: {
                    ...(options?.waMessageId ? { waMessageId: options.waMessageId } : {}),
                    metadata: metadata as Prisma.InputJsonValue,
                },
            });
        };

        if (queuedMessage.waMessageId && metadata.sendStatus === "sent") {
            console.log(`📱 [WhatsApp Admin Voice] Message ${queuedMessageId} already sent, skipping`);
            return;
        }

        await persistMetadata({
            sendStatus: "processing",
            processingAt: new Date().toISOString(),
            queueJobId: String(job.id ?? ""),
            queueName: WHATSAPP_ADMIN_VOICE_NOTE_QUEUE,
        });

        try {
            const downloadResponse = await fetch(mediaUrl);
            if (!downloadResponse.ok) {
                throw new Error(`Failed to download media (${downloadResponse.status})`);
            }

            const sourceBuffer = Buffer.from(await downloadResponse.arrayBuffer());
            const sourceMimeType = (
                mimeType
                || downloadResponse.headers.get("content-type")
                || "audio/ogg"
            ).split(";")[0]!.trim().toLowerCase();

            const sourceExt = mimeToExtension(sourceMimeType);
            const convertedBuffer = await convertAudioBufferToMp3InWorker(sourceBuffer, sourceExt);

            const convertedKey = `whatsapp-outbound/voice-note-converted/${new Date().toISOString().slice(0, 10)}/${queuedMessageId}.mp3`;
            const convertedUrl = await StorageService.uploadBuffer(convertedKey, convertedBuffer, "audio/mpeg");

            const normalizedFileName = fileName?.trim()
                ? fileName.trim().replace(/\.[a-z0-9]{1,8}$/i, ".mp3")
                : `voice-${queuedMessageId}.mp3`;

            const result = await sendAudioMessageFromBuffer(waId, convertedBuffer, {
                mimeType: "audio/mpeg",
                fileName: normalizedFileName,
                voice: false,
            });

            if (!result.messageId) {
                const errorLabel = result.errorCode
                    ? `WhatsApp error ${result.errorCode}`
                    : "WhatsApp rejected audio send";
                throw new Error(`${errorLabel}${result.errorMessage ? `: ${result.errorMessage}` : ""}`);
            }

            await persistMetadata(
                {
                    sendStatus: "sent",
                    sentAt: new Date().toISOString(),
                    mediaUrl: convertedUrl,
                    mimeType: "audio/mpeg",
                    voiceNote: false,
                    convertedFromMimeType: sourceMimeType,
                    ...(result.errorCode ? { lastErrorCode: result.errorCode } : {}),
                },
                { waMessageId: result.messageId }
            );

            const followupText = textBody?.trim();
            if (followupText) {
                const followupResult = await sendTextMessage(waId, followupText);
                await db.whatsAppMessage.create({
                    data: {
                        conversationId,
                        waMessageId: followupResult.messageId ?? null,
                        direction: "outbound",
                        body: followupText,
                        senderType: "admin",
                        metadata: {
                            routing: routingMetadata,
                            queueName: WHATSAPP_ADMIN_VOICE_NOTE_QUEUE,
                            queuedMessageId,
                        },
                    },
                });
            }

            console.log(`📱 [WhatsApp Admin Voice] Sent queued voice note for ${waId} (msg=${queuedMessageId})`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown voice note processing error";
            await persistMetadata({
                sendStatus: "failed",
                failedAt: new Date().toISOString(),
                errorMessage: message,
            });
            throw error;
        }
    },
    { connection, concurrency: 2 }
);

whatsappAdminVoiceNoteWorker.on("completed", (job) => console.log(`📱 [WhatsApp Admin Voice] Job ${job.id} completed`));
whatsappAdminVoiceNoteWorker.on("failed", (job, err) => console.error(`❌ [WhatsApp Admin Voice] Job ${job?.id} failed:`, err.message));
whatsappAdminVoiceNoteWorker.on("ready", () => console.log("📱 WhatsApp admin voice worker started and ready"));

// ============================================================================
// KARAOKE GENERATION WORKER
// ============================================================================

import {
  createVocalSeparationTask,
  waitForVocalSeparation,
  downloadInstrumentalBuffer,
} from "../services/kie/vocal-separation";
import { buildKaraokeDeliveryEmail } from "../email/karaoke-delivery";
import { karaokeGenerationQueue, type KaraokeJobData } from "../queues/karaoke-generation";

const KARAOKE_GENERATION_QUEUE = "karaoke-generation";

const karaokeGenerationWorker = new Worker<KaraokeJobData>(
  KARAOKE_GENERATION_QUEUE,
  async (job) => {
    const { orderId, parentOrderId, kieTaskId, kieAudioId, kieAudioId2 } = job.data;
    const kieApiKey = process.env.KIE_API_KEY;

    if (!kieApiKey) {
      throw new Error("KIE_API_KEY not configured");
    }

    console.log(`🎤 [Karaoke] Processing job for order ${orderId} (parent: ${parentOrderId})`);

    const childOrder = await db.songOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!childOrder) {
      throw new Error(`Karaoke child order ${orderId} not found`);
    }

    await db.songOrder.update({
      where: { id: parentOrderId },
      data: { karaokeStatus: "processing" },
    });

    try {
      const generateInstrumental = async (params: { audioId: string; key: string; optionLabel: string }) => {
        console.log(`🎤 [Karaoke] Creating vocal separation task (${params.optionLabel}, kieTaskId=${kieTaskId}, kieAudioId=${params.audioId})`);
        const separationTaskId = await createVocalSeparationTask({
          apiKey: kieApiKey,
          kieTaskId,
          kieAudioId: params.audioId,
        });

        console.log(`🎤 [Karaoke] Waiting for vocal separation (${params.optionLabel}, taskId=${separationTaskId})`);
        const result = await waitForVocalSeparation(kieApiKey, separationTaskId);

        console.log(`🎤 [Karaoke] Downloading instrumental MP3 (${params.optionLabel})...`);
        const instrumentalBuffer = await downloadInstrumentalBuffer(result.instrumentalUrl);
        console.log(`🎤 [Karaoke] Downloaded ${instrumentalBuffer.length} bytes (${params.optionLabel})`);

        await s3Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: params.key,
            Body: instrumentalBuffer,
            ContentType: "audio/mpeg",
          }),
        );
        const fileUrl = `${R2_PUBLIC_URL}/${params.key}`;
        console.log(`🎤 [Karaoke] Uploaded instrumental to R2 (${params.optionLabel}): ${fileUrl}`);

        return { separationTaskId, fileUrl, key: params.key };
      };

      const option1 = await generateInstrumental({
        audioId: kieAudioId,
        key: `karaoke/${parentOrderId}/instrumental.mp3`,
        optionLabel: "option-1",
      });

      const option2 = kieAudioId2
        ? await generateInstrumental({
            audioId: kieAudioId2,
            key: `karaoke/${parentOrderId}/instrumental-2.mp3`,
            optionLabel: "option-2",
          })
        : null;

      await db.songOrder.update({
        where: { id: parentOrderId },
        data: { karaokeKieTaskId: option1.separationTaskId },
      });

      await db.songOrder.update({
        where: { id: parentOrderId },
        data: {
          karaokeFileUrl: option1.fileUrl,
          karaokeFileKey: option1.key,
          karaokeStatus: "completed",
          karaokeGeneratedAt: new Date(),
        },
      });

      const deliveredAt = new Date();
      await db.songOrder.update({
        where: { id: orderId },
        data: {
          status: "COMPLETED",
          songFileUrl: option1.fileUrl,
          songFileKey: option1.key,
          songUploadedAt: deliveredAt,
          songDeliveredAt: deliveredAt,
          songFileUrl2: option2?.fileUrl ?? null,
          songFileKey2: option2?.key ?? null,
          songUploadedAt2: option2 ? deliveredAt : null,
        },
      });

      const parentOrder = await db.songOrder.findUnique({
        where: { id: parentOrderId },
        select: { email: true, recipientName: true, locale: true },
      });

      if (parentOrder?.email) {
        try {
          const locale = (parentOrder.locale || "pt").toLowerCase();
          const localeSlug = locale !== "en" ? `/${locale}` : "";
          const trackOrderUrl = `${SITE_URL}${localeSlug}/track-order?email=${encodeURIComponent(parentOrder.email)}`;

          const emailData = buildKaraokeDeliveryEmail({
            orderId: parentOrderId,
            recipientName: parentOrder.recipientName || "",
            locale,
            trackOrderUrl,
            karaokeFileUrl: option1.fileUrl,
            customerEmail: parentOrder.email,
          });

          await sendEmailCentral({
            to: parentOrder.email,
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text,
            template: "karaoke-delivery",
            orderId: parentOrderId,
            metadata: { recipientName: parentOrder.recipientName },
          });

          console.log(`🎤 [Karaoke] Delivery email sent to ${parentOrder.email}`);
        } catch (emailError) {
          console.error(`🎤 [Karaoke] Failed to send delivery email:`, emailError);
        }
      }

      try {
        const { sendOperationalAlert: alertKaraokeOk } = await import("~/lib/telegram");
        await alertKaraokeOk(
          `🎤 <b>Karaokê pronto!</b>\n\nPedido: <code>${parentOrderId}</code>\nDestinatário: ${parentOrder?.recipientName || "?"}\n\nInstrumental gerado e enviado por email.`,
        );
      } catch {
        // Non-critical
      }

      console.log(`🎤 [Karaoke] Job completed for order ${orderId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown karaoke generation error";
      await db.songOrder.update({
        where: { id: parentOrderId },
        data: {
          karaokeStatus: "failed",
          karaokeError: errorMessage,
        },
      });

      try {
        const { sendOperationalAlert: alertKaraokeFail } = await import("~/lib/telegram");
        await alertKaraokeFail(
          `❌ <b>Karaokê falhou</b>\n\nPedido: <code>${parentOrderId}</code>\nErro: ${errorMessage}`,
        );
      } catch {
        // Non-critical
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
  },
);

karaokeGenerationWorker.on("completed", (job) => {
  console.log(`🎤 [Karaoke] Job ${job.id} completed`);
});

karaokeGenerationWorker.on("failed", (job, error) => {
  console.error(`❌ [Karaoke] Job ${job?.id} failed:`, error.message);
});

karaokeGenerationWorker.on("ready", () => {
  console.log("🎤 Karaoke generation worker started and ready");
});

// ============================================================================
// UNIFIED SHUTDOWN
// ============================================================================

const shutdown = async () => {
    console.log("Shutting down all workers...");

    stopSunoWorkerHeartbeat();
    stopSunoRetrySweep();
    await Promise.all([
        orderRemindersWorker.close(),
        streamingVipReminderWorker.close(),
        streamingVipUpsellWorker.close(),
        streamingVipUpsellQueue.close(),
        lyricsGenerationWorker.close(),
        autoDeliveryWorker.close(),
        autoDeliveryQueue.close(),
        delayedCheckWorker.close(),
        delayedCheckQueue.close(),
        spotifyAutoSyncWorker.close(),
        spotifyAutoSyncQueue.close(),
        sunoGenerationWorker.close(),
        sunoGenerationQueue.close(),
        musicianTipReminderWorker.close(),
        monthlyReengagementWorker.close(),
        monthlyReengagementQueue.close(),
        dailyPendingAlertWorker.close(),
        dailyPendingAlertQueue.close(),
        pdfGenerationWorker.close(),
        pdfGenerationQueue.close(),
        emailPollingWorker.close(),
        emailPollingQueue.close(),
        supabaseLeadImportWorker.close(),
        supabaseLeadQueue.close(),
        supabaseLeadSummaryWorker.close(),
        supabaseLeadSummaryQueue.close(),
        supabaseOrdersWorker.close(),
        supabaseOrdersQueue.close(),
        ticketAiResponseWorker.close(),
        ticketAiResponseQueue.close(),
        ticketAutoCloseWorker.close(),
        ticketAutoCloseQueue.close(),
        whatsappResponseWorker.close(),
        whatsappResponseQueue.close(),
        whatsappAdminOutboundWorker.close(),
        whatsappAdminOutboundQueue.close(),
        whatsappAdminOrderSongsWorker.close(),
        whatsappAdminOrderSongsQueue.close(),
        whatsappAdminVoiceNoteWorker.close(),
        whatsappAdminVoiceNoteQueue.close(),
        karaokeGenerationWorker.close(),
        karaokeGenerationQueue.close(),
    ]);

    // Close Suno browser instance
    await closeBrowser();

    await connection.quit();
    await db.$disconnect();
    console.log("All workers shut down successfully");
};

process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
});

console.log(
    `🚀 All workers initializing... queues: ${ORDER_REMINDERS_QUEUE}, ${STREAMING_VIP_REMINDER_QUEUE}, ${STREAMING_VIP_UPSELL_QUEUE}, ${LYRICS_GENERATION_QUEUE}, ${SUNO_GENERATION_QUEUE}, ${AUTO_DELIVERY_QUEUE}, ${MUSICIAN_TIP_REMINDER_QUEUE}, ${MONTHLY_REENGAGEMENT_QUEUE}, ${DAILY_PENDING_ALERT_QUEUE}, ${PDF_GENERATION_QUEUE}, ${EMAIL_POLLING_QUEUE}, ${SUPABASE_LEAD_QUEUE}, ${SUPABASE_LEAD_SUMMARY_QUEUE}, ${SUPABASE_ORDERS_QUEUE}, ${TICKET_AI_RESPONSE_QUEUE}, ${TICKET_AUTO_CLOSE_QUEUE}, ${WHATSAPP_RESPONSE_QUEUE}, ${WHATSAPP_ADMIN_OUTBOUND_QUEUE}, ${WHATSAPP_ADMIN_ORDER_SONGS_QUEUE}, ${WHATSAPP_ADMIN_VOICE_NOTE_QUEUE}, ${SPOTIFY_AUTO_SYNC_QUEUE}, ${KARAOKE_GENERATION_QUEUE}`
);
