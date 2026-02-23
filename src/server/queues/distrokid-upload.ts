import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type DistrokidUploadJob = {
    orderId: string;
};

const QUEUE_NAME = "distrokid-upload";

export const distrokidUploadQueue = new Queue<DistrokidUploadJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 2,
        backoff: {
            type: "exponential",
            delay: 60 * 1000,
        },
    },
});

export async function enqueueDistrokidUpload(orderId: string) {
    await distrokidUploadQueue.add(
        "upload",
        { orderId },
        { jobId: `distrokid_${orderId}` }
    );
}

export { QUEUE_NAME as DISTROKID_UPLOAD_QUEUE_NAME };
