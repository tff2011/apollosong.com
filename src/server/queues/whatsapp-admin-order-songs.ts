import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type WhatsAppAdminOrderSongsJob = {
    conversationId: string;
    queuedMessageId: string;
    waId: string;
    orderId: string;
    operatorName: string;
    routingMetadata: {
        assignedTo: string;
        lockExpiresAt: string;
        lockTtlMs: number;
    };
};

const QUEUE_NAME = "whatsapp-admin-order-songs";

export const whatsappAdminOrderSongsQueue = new Queue<WhatsAppAdminOrderSongsJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 1,
    },
});

export async function enqueueWhatsAppAdminOrderSongs(data: WhatsAppAdminOrderSongsJob) {
    return whatsappAdminOrderSongsQueue.add(
        "send-admin-order-songs",
        data,
        {
            jobId: `wa_admin_order_songs_${data.queuedMessageId}`,
        }
    );
}

export { QUEUE_NAME as WHATSAPP_ADMIN_ORDER_SONGS_QUEUE_NAME };
