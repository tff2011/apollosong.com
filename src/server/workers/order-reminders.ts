import "dotenv/config";

import IORedis from "ioredis";
import { Worker } from "bullmq";
import { db } from "../db";
import { buildAbandonedOrderEmail, type ReminderStage } from "../email/abandoned-order";
import { initMailer, sendEmail } from "../email/mailer-core";

// ============= CONFIG =============
const QUEUE_NAME = "order-reminders";
const REDIS_URL = process.env.REDIS_URL!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
const SUPABASE_LEAD_SOURCE = process.env.SUPABASE_LEAD_SOURCE || "supabase-import";

// Initialize central mailer
initMailer({
    smtpHost: process.env.SMTP_HOST!,
    smtpPort: 587,
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER!,
    smtpPassword: process.env.SMTP_PASSWORD!,
    smtpFrom: process.env.SMTP_FROM!,
});

// ============= REDIS =============
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// ============= TYPES =============
type OrderReminderJob = {
    orderId: string;
    stage: ReminderStage;
};

function getStartingFromPrice(locale: string | null, currency: string): number {
    if (currency === "BRL") return 69.9;
    if (locale === "es") return 19;
    if (locale === "fr") return 49;
    if (locale === "it") return 69;
    return 99;
}

// ============= WORKER =============
const worker = new Worker<OrderReminderJob>(
    QUEUE_NAME,
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
                // Quiz fields for order summary
                recipient: true,
                qualities: true,
                memories: true,
                message: true,
                genre: true,
                vocals: true,
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

        const isImportedLead = order.utmSource === SUPABASE_LEAD_SOURCE;

        // TEMPORARY: skip all emails for supabase-import leads
        if (isImportedLead) {
            console.log(`Order ${orderId} is supabase-import lead, skipping email (temporarily disabled)`);
            return;
        }

        const checkoutPath = isImportedLead
            ? `/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`
            : `/${order.locale}/order/${order.id}`;
        const checkoutUrl = new URL(checkoutPath, SITE_URL).toString();
        const price = isImportedLead
            ? getStartingFromPrice(order.locale ?? null, order.currency)
            : order.priceAtOrder / 100;

        const email = buildAbandonedOrderEmail(stage, {
            orderId: order.id,
            recipientName: order.recipientName,
            locale: order.locale,
            price,
            currency: order.currency,
            checkoutUrl,
            customerEmail: order.email,
            priceMode: isImportedLead ? "startingFrom" : "exact",
            // Quiz fields for order summary
            recipient: order.recipient,
            qualities: order.qualities,
            memories: order.memories,
            message: order.message,
            genre: order.genre,
            vocals: order.vocals,
        });

        await sendEmail({
            to: order.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            template: "CART_ABANDONMENT",
            orderId: order.id,
            headers: email.headers,
        });
    },
    {
        connection,
        concurrency: 5,
    }
);

worker.on("completed", (job) => {
    console.log(`✅ Order reminder sent for ${job.data.orderId} (${job.data.stage})`);
});

worker.on("failed", (job, error) => {
    console.error(
        `❌ Order reminder failed for ${job?.data.orderId ?? "unknown"}:`,
        error.message
    );
});

worker.on("ready", () => {
    console.log("🚀 Order reminder worker started and ready");
});

// ============= SHUTDOWN =============
const shutdown = async () => {
    console.log("Shutting down worker...");
    await worker.close();
    await connection.quit();
};

process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
});
