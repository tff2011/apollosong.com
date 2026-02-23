import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type ReminderStage = "15m" | "3d" | "7d";

export type OrderReminderJob = {
    orderId: string;
    stage: ReminderStage;
};

const QUEUE_NAME = "order-reminders";

const REMINDER_SCHEDULES: Array<{ stage: ReminderStage; delayMs: number }> = [
    { stage: "15m", delayMs: 15 * 60 * 1000 },
    { stage: "3d", delayMs: 3 * 24 * 60 * 60 * 1000 },
    { stage: "7d", delayMs: 7 * 24 * 60 * 60 * 1000 },
];

export const orderReminderQueue = new Queue<OrderReminderJob>(QUEUE_NAME, {
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

export async function enqueueOrderReminders(
    orderId: string,
    options?: { immediate?: boolean; delays?: Partial<Record<ReminderStage, number>> }
) {
    await Promise.all(
        REMINDER_SCHEDULES.map(({ stage, delayMs }) => {
            const shouldSendImmediately = options?.immediate && stage === "15m";
            const overrideDelay = options?.delays?.[stage];
            const resolvedDelay = typeof overrideDelay === "number" ? overrideDelay : delayMs;
            const delay = shouldSendImmediately ? 0 : resolvedDelay;
            return orderReminderQueue.add(
                "order-reminder",
                { orderId, stage },
                {
                    delay,
                    jobId: `order-reminder_${orderId}_${stage}`,
                }
            );
        })
    );
}

export { QUEUE_NAME as ORDER_REMINDER_QUEUE_NAME };
