import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type PdfGenerationJob = {
    orderId: string;
    size: "A4" | "A3";
};

const QUEUE_NAME = "pdf-generation";

export const pdfGenerationQueue = new Queue<PdfGenerationJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 30 * 1000,
        },
    },
});

/**
 * Enqueue PDF generation for an order
 * Generates both A4 and A3 versions
 * @param orderId - The order ID
 * @param priority - "high" for user-requested (runs first), "low" for backfill/auto
 */
export async function enqueuePdfGeneration(orderId: string, priority: "high" | "low" = "low") {
    // BullMQ: lower number = higher priority
    const priorityValue = priority === "high" ? 1 : 10;

    // Queue both sizes
    await Promise.all([
        pdfGenerationQueue.add(
            "generate-pdf",
            { orderId, size: "A4" },
            { jobId: `pdf_${orderId}_A4`, priority: priorityValue }
        ),
        pdfGenerationQueue.add(
            "generate-pdf",
            { orderId, size: "A3" },
            { jobId: `pdf_${orderId}_A3`, priority: priorityValue }
        ),
    ]);
}

/**
 * Enqueue a single PDF size with high priority (user-requested)
 */
export async function enqueuePdfGenerationSingle(orderId: string, size: "A4" | "A3") {
    await pdfGenerationQueue.add(
        "generate-pdf",
        { orderId, size },
        { jobId: `pdf_${orderId}_${size}`, priority: 1 } // High priority
    );
}

export { QUEUE_NAME as PDF_GENERATION_QUEUE_NAME };
