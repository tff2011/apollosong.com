import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type TicketAiResponseJob = {
    ticketId: string;
    messageId: string;
};

const QUEUE_NAME = "ticket-ai-response";

export const ticketAiResponseQueue = new Queue<TicketAiResponseJob>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 30 * 1000,
        },
    },
});

export async function enqueueTicketAiResponse(ticketId: string, messageId: string) {
    await ticketAiResponseQueue.add(
        "generate-ai-response",
        { ticketId, messageId },
        {
            jobId: `ticket_ai_${ticketId}_${messageId}`,
        }
    );
}

export { QUEUE_NAME as TICKET_AI_RESPONSE_QUEUE_NAME };
