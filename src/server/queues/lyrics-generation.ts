import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type LyricsGenerationJob = {
    orderId: string;
};

const QUEUE_NAME = "lyrics-generation";

export const lyricsGenerationQueue = new Queue<LyricsGenerationJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 5,
        backoff: {
            type: "exponential",
            delay: 2 * 60 * 1000, // Start with 2 min → 4 min → 8 min → 16 min → 32 min
        },
    },
});

type LyricsGenerationOptions = {
    priority?: number;
};

/**
 * Enqueue lyrics generation for an order
 * Called immediately after payment is confirmed
 */
export async function enqueueLyricsGeneration(
    orderId: string,
    options: LyricsGenerationOptions = {}
) {
    await lyricsGenerationQueue.add(
        "generate-lyrics",
        { orderId },
        {
            jobId: `lyrics_${orderId}`,
            priority: options.priority,
            // No delay - generate immediately after payment
        }
    );
}

export { QUEUE_NAME as LYRICS_GENERATION_QUEUE_NAME };
