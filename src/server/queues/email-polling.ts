import { Queue } from "bullmq";
import { redisConnection } from "./redis";

const QUEUE_NAME = "email-polling";

export const emailPollingQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50,
    },
});

/**
 * Trigger an immediate email poll (enqueues a job for the worker)
 */
export async function triggerEmailPoll() {
    await emailPollingQueue.add("poll-inbox", {}, {
        jobId: `manual_poll_${Date.now()}`,
    });
}

export { QUEUE_NAME as EMAIL_POLLING_QUEUE_NAME };
