import "dotenv/config";
import nodemailer from "nodemailer";

process.env.SKIP_ENV_VALIDATION = "true";

const getArg = (name: string, fallback: string) => {
    const index = process.argv.indexOf(name);
    if (index === -1) return fallback;
    const value = process.argv[index + 1];
    return value ?? fallback;
};

const to = getArg("--to", "thiagofelizola@gmail.com");
const customerEmail = getArg("--customerEmail", "");
const stageInput = getArg("--stage", "15m");
const useRealData = process.argv.includes("--real");
const priceModeInput = getArg("--priceMode", "");
const useTrackOrder = process.argv.includes("--trackOrder");

const stage = (["15m", "3d", "7d"].includes(stageInput) ? stageInput : "15m") as
    | "15m"
    | "3d"
    | "7d";
const priceMode = priceModeInput === "startingFrom" ? "startingFrom" : "exact";

const requiredEnv = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`Missing env vars for SMTP: ${missingEnv.join(", ")}`);
    process.exit(1);
}

const { buildAbandonedOrderEmail } = await import("../src/server/email/abandoned-order");
const { db } = await import("../src/server/db");

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";

let emailData: Parameters<typeof buildAbandonedOrderEmail>[1];

function getStartingFromPrice(locale: string | null, currency: string): number {
    if (currency === "BRL") return 69.9;
    if (locale === "es") return 19;
    if (locale === "fr") return 49;
    if (locale === "it") return 69;
    return 99;
}

if (useRealData) {
    // Fetch real order with quiz data
    const order = await db.songOrder.findFirst({
        where: {
            ...(customerEmail ? { email: customerEmail } : {}),
            recipientName: { not: "" },
            qualities: { not: "" },
            memories: { not: "" },
        },
        select: {
            id: true,
            recipientName: true,
            locale: true,
            currency: true,
            priceAtOrder: true,
            recipient: true,
            qualities: true,
            memories: true,
            message: true,
            genre: true,
            vocals: true,
        },
        orderBy: { createdAt: "desc" },
    });

    if (!order) {
        console.error("No order found with quiz data");
        process.exit(1);
    }

    console.log("📦 Using real order:", order.id);
    console.log("   Recipient:", order.recipientName, `(${order.recipient})`);
    console.log("   Genre:", order.genre);
    console.log("   Locale:", order.locale);

    const checkoutUrlOverride = getArg("--checkoutUrl", "");
    const checkoutPath = useTrackOrder
        ? `/${order.locale}/track-order?email=${encodeURIComponent(customerEmail || order.email)}`
        : `/${order.locale}/order/${order.id}`;
    const checkoutUrl = checkoutUrlOverride
        ? checkoutUrlOverride
        : new URL(checkoutPath, baseUrl).toString();
    const price = priceMode === "startingFrom"
        ? getStartingFromPrice(order.locale ?? null, order.currency)
        : order.priceAtOrder / 100;

    emailData = {
        orderId: order.id,
        recipientName: order.recipientName,
        locale: order.locale,
        price,
        currency: order.currency,
        checkoutUrl,
        customerEmail: to,
        priceMode,
        recipient: order.recipient,
        qualities: order.qualities,
        memories: order.memories,
        message: order.message,
        genre: order.genre,
        vocals: order.vocals,
    };
} else {
    // Use fake data for testing
    const locale = getArg("--locale", "pt");
    const recipientName = getArg("--recipient", "Ana Santos");
    const orderId = getArg("--orderId", `test_${Date.now()}`);
    const price = Number(getArg("--price", "149.9"));
    const currency = getArg("--currency", locale === "pt" ? "BRL" : "USD");
    const checkoutUrl = getArg(
        "--checkoutUrl",
        new URL(`/${locale}/order/${orderId}`, baseUrl).toString()
    );

    emailData = {
        orderId,
        recipientName,
        locale,
        price,
        currency,
        checkoutUrl,
        customerEmail: to,
        priceMode,
        // Test quiz data
        recipient: "mother",
        qualities: "Ela é a pessoa mais carinhosa e dedicada que conheço. Sempre esteve presente nos momentos importantes.",
        memories: "Lembro das tardes fazendo bolo juntos e das histórias que ela contava antes de dormir.",
        message: "Mãe, você é a razão do meu sorriso.",
        genre: "Gospel",
        vocals: "female",
    };
}

const emailContent = buildAbandonedOrderEmail(stage, emailData);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "[TESTE] " + emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
});

console.log(`\n✅ Sent abandoned-order test email to ${to}`);
console.log(`   Stage: ${stage} | Using real data: ${useRealData}`);

await db.$disconnect();
