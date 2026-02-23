import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type MusicianTipReminderJob = {
    tipOrderId: string;
    stage?: "30min" | "3day";
};

const QUEUE_NAME = "musician-tip-reminder";

const DELAY_30MIN = 30 * 60 * 1000;
const DELAY_3DAYS = 3 * 24 * 60 * 60 * 1000;

export const musicianTipReminderQueue = new Queue<MusicianTipReminderJob>(QUEUE_NAME, {
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

export async function enqueueMusicianTipReminder(tipOrderId: string) {
    await Promise.all([
        musicianTipReminderQueue.add(
            "musician-tip-reminder",
            { tipOrderId, stage: "30min" },
            { delay: DELAY_30MIN, jobId: `musician-tip-reminder_${tipOrderId}_30min` },
        ),
        musicianTipReminderQueue.add(
            "musician-tip-reminder",
            { tipOrderId, stage: "3day" },
            { delay: DELAY_3DAYS, jobId: `musician-tip-reminder_${tipOrderId}_3day` },
        ),
    ]);
}

export { QUEUE_NAME as MUSICIAN_TIP_REMINDER_QUEUE_NAME };
