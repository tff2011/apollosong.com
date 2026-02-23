import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type KaraokeJobData = {
  orderId: string;        // ID of the child KARAOKE_UPSELL order
  parentOrderId: string;  // ID of the parent order with the song
  songFileUrl: string;    // URL of the song to separate
  kieTaskId: string;      // Original Kie task ID
  kieAudioId: string;     // Original Kie audio ID
  kieAudioId2?: string;   // Optional second Kie audio ID (when parent has option 2)
};

const QUEUE_NAME = "karaoke-generation";

export const karaokeGenerationQueue = new Queue<KaraokeJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 60 * 1000,
    },
  },
});

/**
 * Enqueue karaoke (instrumental) generation for an order
 */
export async function enqueueKaraokeGeneration(data: KaraokeJobData) {
  await karaokeGenerationQueue.add(
    "generate-karaoke",
    data,
    { jobId: `karaoke_${data.orderId}` },
  );
}

export { QUEUE_NAME as KARAOKE_GENERATION_QUEUE_NAME };
