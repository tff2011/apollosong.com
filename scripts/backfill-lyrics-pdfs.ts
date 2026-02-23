/**
 * Backfill script to generate PDFs for all existing orders with hasLyrics=true
 * Run with: npx tsx scripts/backfill-lyrics-pdfs.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const db = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const pdfGenerationQueue = new Queue("pdf-generation", {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 30000 },
    },
});

async function main() {
    console.log("🔍 Finding orders with hasLyrics=true but no PDF URLs...");

    const orders = await db.songOrder.findMany({
        where: {
            hasLyrics: true,
            status: "COMPLETED",
            lyrics: { not: null },
            OR: [
                { lyricsPdfA4Url: null },
                { lyricsPdfA3Url: null },
            ],
        },
        select: {
            id: true,
            recipientName: true,
            lyricsPdfA4Url: true,
            lyricsPdfA3Url: true,
        },
    });

    console.log(`📋 Found ${orders.length} orders needing PDF generation`);

    if (orders.length === 0) {
        console.log("✅ No orders need PDF generation");
        await cleanup();
        return;
    }

    let queued = 0;
    for (const order of orders) {
        try {
            // Priority 10 = low (backfill), user requests use priority 1 (high)
            if (!order.lyricsPdfA4Url) {
                await pdfGenerationQueue.add(
                    "generate-pdf",
                    { orderId: order.id, size: "A4" },
                    { jobId: `pdf_${order.id}_A4`, priority: 10 }
                );
            }
            if (!order.lyricsPdfA3Url) {
                await pdfGenerationQueue.add(
                    "generate-pdf",
                    { orderId: order.id, size: "A3" },
                    { jobId: `pdf_${order.id}_A3`, priority: 10 }
                );
            }
            queued++;
            console.log(`📄 Queued PDF for order ${order.id} (${order.recipientName})`);
        } catch (err) {
            // Job might already exist
            console.log(`⚠️ Skipped order ${order.id}: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    }

    console.log(`\n✅ Queued ${queued} orders for PDF generation`);
    console.log("📌 Make sure the worker is running to process the queue");

    await cleanup();
}

async function cleanup() {
    await pdfGenerationQueue.close();
    await connection.quit();
    await db.$disconnect();
}

main().catch((err) => {
    console.error("❌ Error:", err);
    cleanup().finally(() => process.exit(1));
});
