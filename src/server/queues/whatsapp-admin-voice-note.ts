import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type WhatsAppAdminVoiceNoteJob = {
    conversationId: string;
    queuedMessageId: string;
    waId: string;
    mediaUrl: string;
    mimeType?: string;
    fileName?: string;
    textBody?: string;
    operatorName: string;
    routingMetadata: {
        assignedTo: string;
        lockExpiresAt: string;
        lockTtlMs: number;
    };
};

const QUEUE_NAME = "whatsapp-admin-voice-note";

export const whatsappAdminVoiceNoteQueue = new Queue<WhatsAppAdminVoiceNoteJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 1,
    },
});

export async function enqueueWhatsAppAdminVoiceNote(data: WhatsAppAdminVoiceNoteJob) {
    return whatsappAdminVoiceNoteQueue.add(
        "send-admin-voice-note",
        data,
        {
            jobId: `wa_admin_voice_${data.queuedMessageId}`,
        }
    );
}

export { QUEUE_NAME as WHATSAPP_ADMIN_VOICE_NOTE_QUEUE_NAME };
