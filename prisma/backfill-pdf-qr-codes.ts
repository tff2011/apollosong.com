/**
 * Backfill script: Regenerate lyrics PDFs that are missing Spotify QR codes.
 *
 * Finds all parent orders that:
 *   1. Have hasLyrics = true (lyrics PDF was generated)
 *   2. Have a STREAMING_UPSELL child order with spotifyUrl set
 *
 * Then enqueues PDF regeneration (A4 + A3) for each, so the PDF
 * includes the Spotify QR code.
 *
 * Usage: npx tsx prisma/backfill-pdf-qr-codes.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const db = new PrismaClient();

async function main() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        console.error("REDIS_URL not set");
        process.exit(1);
    }

    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

    const pdfQueue = new Queue("pdf-generation", {
        connection,
        defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
        },
    });

    // Find parent orders with lyrics that have a streaming upsell child with spotifyUrl
    const parentOrders = await db.songOrder.findMany({
        where: {
            hasLyrics: true,
            orderType: { in: ["MAIN", "EXTRA_SONG"] },
            childOrders: {
                some: {
                    orderType: "STREAMING_UPSELL",
                    spotifyUrl: { not: null },
                },
            },
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            lyricsPdfA4Url: true,
        },
    });

    console.log(`Found ${parentOrders.length} orders with lyrics + Spotify URL that need PDF regeneration.\n`);

    if (parentOrders.length === 0) {
        console.log("Nothing to do.");
        await pdfQueue.close();
        await connection.quit();
        await db.$disconnect();
        return;
    }

    let enqueued = 0;

    for (const order of parentOrders) {
        console.log(`  Enqueuing: ${order.id} (${order.email}) - ${order.recipientName}`);

        await Promise.all([
            pdfQueue.add(
                "generate-pdf",
                { orderId: order.id, size: "A4" as const },
                { jobId: `pdf_${order.id}_A4`, priority: 10 }
            ),
            pdfQueue.add(
                "generate-pdf",
                { orderId: order.id, size: "A3" as const },
                { jobId: `pdf_${order.id}_A3`, priority: 10 }
            ),
        ]);

        enqueued++;
    }

    console.log(`\nDone. Enqueued ${enqueued} orders for PDF regeneration (A4 + A3).`);
    console.log("The worker will process them in the background.");

    await pdfQueue.close();
    await connection.quit();
    await db.$disconnect();
}

main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
