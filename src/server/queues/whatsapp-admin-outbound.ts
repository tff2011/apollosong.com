import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type WhatsAppAdminOutboundMedia = {
    url: string;
    messageType: "audio" | "video" | "document" | "image";
    mimeType?: string;
    fileName?: string;
    voiceNote?: boolean;
    caption?: string;
};

export type WhatsAppAdminOutboundJob = {
    conversationId: string;
    queuedMessageId: string;
    waId: string;
    textBody?: string;
    media?: WhatsAppAdminOutboundMedia;
    routingMetadata: {
        assignedTo: string;
        lockExpiresAt: string;
        lockTtlMs: number;
    };
};

const QUEUE_NAME = "whatsapp-admin-outbound";

export const whatsappAdminOutboundQueue = new Queue<WhatsAppAdminOutboundJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 1,
    },
});

export async function enqueueWhatsAppAdminOutbound(data: WhatsAppAdminOutboundJob) {
    return whatsappAdminOutboundQueue.add(
        "send-admin-outbound",
        data,
        {
            jobId: `wa_admin_outbound_${data.queuedMessageId}`,
        }
    );
}

export { QUEUE_NAME as WHATSAPP_ADMIN_OUTBOUND_QUEUE_NAME };
