import "dotenv/config";
import nodemailer from "nodemailer";

process.env.SKIP_ENV_VALIDATION = "true";

const getArg = (name: string, fallback: string) => {
    const index = process.argv.indexOf(name);
    if (index === -1) return fallback;
    const value = process.argv[index + 1];
    return value ?? fallback;
};

const to = getArg("--to", "statusct7@gmail.com");
const locale = getArg("--locale", "pt");
const recipientName = getArg("--recipient", "Pessoa Especial");
const orderId = getArg("--orderId", `test_${Date.now()}`);
const emailParam = getArg("--emailParam", to);
const includeTwoOptions = process.argv.includes("--two-options");

const requiredEnv = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`Missing env vars for SMTP: ${missingEnv.join(", ")}`);
    process.exit(1);
}

const { buildAutoDeliveryEmail } = await import("../src/server/workers/all-workers");

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
const trackOrderUrl = new URL(
    `/${locale}/track-order?email=${encodeURIComponent(emailParam)}`,
    baseUrl
).toString();

const emailContent = buildAutoDeliveryEmail({
    orderId,
    recipientName,
    locale,
    trackOrderUrl,
    songFileUrl: "https://pub-17653d8e09ec2ab1f59e734054fc2834.r2.dev/songs/musica0-pt.mp3",
    songFileUrl2: includeTwoOptions
        ? "https://pub-17653d8e09ec2ab1f59e734054fc2834.r2.dev/songs/musica1-pt.mp3"
        : undefined,
});

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
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
});

console.log(`Sent test auto-delivery email to ${to}`);
console.log(`Track order URL: ${trackOrderUrl}`);
