import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type WhatsAppMediaType = "text" | "audio" | "image" | "video" | "document" | "sticker";

export type WhatsAppResponseJob = {
    waId: string;
    messageBody: string;
    waMessageId: string;
    customerName: string | null;
    timestamp: number;
    messageType?: WhatsAppMediaType;
    mediaId?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
    businessPhoneNumberId?: string;
    businessDisplayPhoneNumber?: string;
};

const QUEUE_NAME = "whatsapp-response";

export const whatsappResponseQueue = new Queue<WhatsAppResponseJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 10 * 1000,
        },
    },
});

export async function enqueueWhatsAppResponse(data: WhatsAppResponseJob) {
    await whatsappResponseQueue.add(
        "process-whatsapp-message",
        data,
        {
            jobId: `wa_${data.waMessageId}`,
        }
    );
}

export { QUEUE_NAME as WHATSAPP_RESPONSE_QUEUE_NAME };
