import { Queue } from "bullmq";
import { redisConnection } from "./redis";
import type { SunoJobData } from "../services/suno/types";
import { buildSunoGenerationSignature } from "../services/suno/generation-signature";

const QUEUE_NAME = "suno-generation";

export const sunoGenerationQueue = new Queue<SunoJobData>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 60 * 1000, // Start with 60 seconds (Suno can be slow)
        },
    },
});

type SunoGenerationOptions = {
    priority?: number;
    delay?: number;
    lifo?: boolean;
    forceRequeue?: boolean;
};

/**
 * Enqueue Suno song generation for an order
 * Called after lyrics are generated successfully
 */
export async function enqueueSunoGeneration(
    data: SunoJobData,
    options: SunoGenerationOptions = {}
) {
    const normalizedData: SunoJobData = {
        ...data,
        kieTaskId: data.kieTaskId?.trim() || undefined,
        generationSignature: data.generationSignature || buildSunoGenerationSignature({
            lyrics: data.lyrics,
            genre: data.genre,
            locale: data.locale,
            vocals: data.vocals,
            recipientName: data.recipientName,
        }),
    };

    let dataToEnqueue = normalizedData;
    const jobId = `suno_${normalizedData.orderId}`;
    const existingJob = await sunoGenerationQueue.getJob(jobId);

    if (existingJob) {
        const state = await existingJob.getState();
        const existingData = existingJob.data as SunoJobData;
        const existingSignature =
            existingData.generationSignature || buildSunoGenerationSignature({
                lyrics: existingData.lyrics,
                genre: existingData.genre,
                locale: existingData.locale,
                vocals: existingData.vocals,
                recipientName: existingData.recipientName,
            });
        const payloadChanged =
            existingData.orderId !== normalizedData.orderId ||
            existingSignature !== normalizedData.generationSignature;

        const replaceableStates = new Set([
            "waiting",
            "delayed",
            "paused",
            "prioritized",
            "waiting-children",
        ]);

        if (options.forceRequeue) {
            const removableStates = new Set([
                "failed",
                "completed",
                ...replaceableStates,
            ]);

            if (payloadChanged) {
                dataToEnqueue = { ...normalizedData, kieTaskId: undefined };
            }

            if (removableStates.has(state)) {
                await existingJob.remove();
            } else if (payloadChanged) {
                // If already active, persist fresh payload for retries.
                await existingJob.updateData({
                    ...existingData,
                    ...normalizedData,
                    kieTaskId: undefined,
                });
                return;
            } else {
                throw new Error(`Job already exists (${state})`);
            }
        } else if (state === "failed" || state === "completed") {
            // Allow manual/API retries when an old job with the same id is terminal.
            // BullMQ keeps failed jobs by default (removeOnFail: 100), which otherwise
            // blocks re-enqueueing with the same jobId.
            await existingJob.remove();
            if (payloadChanged) {
                dataToEnqueue = { ...normalizedData, kieTaskId: undefined };
            }
        } else if (payloadChanged && replaceableStates.has(state)) {
            // If lyrics/order payload changed while the job is still queued,
            // replace it so Suno uses the latest DB state.
            await existingJob.remove();
            dataToEnqueue = { ...normalizedData, kieTaskId: undefined };
        } else if (payloadChanged) {
            // If already active, at least persist the latest payload for retries.
            await existingJob.updateData({
                ...existingData,
                ...normalizedData,
                // Payload changed while active: never reuse the previous task id.
                kieTaskId: undefined,
            });
            return;
        } else {
            throw new Error(`Job already exists (${state})`);
        }
    }

    await sunoGenerationQueue.add(
        "generate-song",
        dataToEnqueue,
        {
            jobId,
            priority: options.priority,
            delay: options.delay,
            lifo: options.lifo,
        }
    );
}

export { QUEUE_NAME as SUNO_GENERATION_QUEUE_NAME };
