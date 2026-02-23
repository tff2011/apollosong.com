import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type StreamingVipReminderJob = {
    orderId: string;
};

const QUEUE_NAME = "streaming-vip-reminder";

// 24 hours delay
const DELAY_24H = 24 * 60 * 60 * 1000;

export const streamingVipReminderQueue = new Queue<StreamingVipReminderJob>(QUEUE_NAME, {
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

export async function enqueueStreamingVipReminder(orderId: string) {
    await streamingVipReminderQueue.add(
        "streaming-vip-reminder",
        { orderId },
        {
            delay: DELAY_24H,
            jobId: `streaming-vip-reminder_${orderId}`,
        }
    );
}

export { QUEUE_NAME as STREAMING_VIP_REMINDER_QUEUE_NAME };
