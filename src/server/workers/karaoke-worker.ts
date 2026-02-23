import "dotenv/config";

import IORedis from "ioredis";
import { Worker } from "bullmq";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../db";
import {
  createVocalSeparationTask,
  waitForVocalSeparation,
  downloadInstrumentalBuffer,
} from "../services/kie/vocal-separation";
import { buildKaraokeDeliveryEmail } from "../email/karaoke-delivery";
import { sendOperationalAlert } from "../../lib/telegram";
import type { KaraokeJobData } from "../queues/karaoke-generation";
import nodemailer from "nodemailer";

// ============================================================================
// KARAOKE WORKER
// Generates instrumental (karaoke) versions via Kie.ai vocal separation
// ============================================================================

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL is required");
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
const KIE_API_KEY = process.env.KIE_API_KEY;

// SMTP config
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";

const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASSWORD)
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: 587,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  })
  : null;

// R2 Storage
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  process.env.CLOUDFLARE_R2_PUBLIC_URL ||
  (R2_PUBLIC_DOMAIN ? `https://${R2_PUBLIC_DOMAIN.replace(/^https?:\/\//, "")}` : undefined) ||
  (R2_ACCOUNT_ID ? `https://pub-${R2_ACCOUNT_ID}.r2.dev` : undefined);

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  throw new Error("R2 credentials are required for karaoke worker");
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const KARAOKE_GENERATION_QUEUE = "karaoke-generation";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const karaokeWorker = new Worker<KaraokeJobData>(
  KARAOKE_GENERATION_QUEUE,
  async (job) => {
    const { orderId, parentOrderId, kieTaskId, kieAudioId, kieAudioId2 } = job.data;

    if (!KIE_API_KEY) {
      throw new Error("KIE_API_KEY not configured");
    }

    console.log(`🎤 [Karaoke] Processing job for order ${orderId} (parent: ${parentOrderId})`);

    // 1. Validate the child order exists
    const childOrder = await db.songOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!childOrder) {
      throw new Error(`Karaoke child order ${orderId} not found`);
    }

    // 2. Mark parent as processing
    await db.songOrder.update({
      where: { id: parentOrderId },
      data: { karaokeStatus: "processing" },
    });

    try {
      const generateInstrumental = async (params: { audioId: string; key: string; optionLabel: string }) => {
        console.log(`🎤 [Karaoke] Creating vocal separation task (${params.optionLabel}, kieTaskId=${kieTaskId}, kieAudioId=${params.audioId})`);
        const separationTaskId = await createVocalSeparationTask({
          apiKey: KIE_API_KEY,
          kieTaskId,
          kieAudioId: params.audioId,
        });

        console.log(`🎤 [Karaoke] Waiting for vocal separation (${params.optionLabel}, taskId=${separationTaskId})`);
        const result = await waitForVocalSeparation(KIE_API_KEY, separationTaskId);

        console.log(`🎤 [Karaoke] Downloading instrumental MP3 (${params.optionLabel})...`);
        const instrumentalBuffer = await downloadInstrumentalBuffer(result.instrumentalUrl);
        console.log(`🎤 [Karaoke] Downloaded ${instrumentalBuffer.length} bytes (${params.optionLabel})`);

        await s3Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: params.key,
            Body: instrumentalBuffer,
            ContentType: "audio/mpeg",
          }),
        );
        const fileUrl = `${R2_PUBLIC_URL}/${params.key}`;
        console.log(`🎤 [Karaoke] Uploaded instrumental to R2 (${params.optionLabel}): ${fileUrl}`);

        return { separationTaskId, fileUrl, key: params.key };
      };

      const option1 = await generateInstrumental({
        audioId: kieAudioId,
        key: `karaoke/${parentOrderId}/instrumental.mp3`,
        optionLabel: "option-1",
      });

      const option2 = kieAudioId2
        ? await generateInstrumental({
            audioId: kieAudioId2,
            key: `karaoke/${parentOrderId}/instrumental-2.mp3`,
            optionLabel: "option-2",
          })
        : null;

      // Keep first separation task as canonical task reference on parent.
      await db.songOrder.update({
        where: { id: parentOrderId },
        data: { karaokeKieTaskId: option1.separationTaskId },
      });

      // 8. Update parent order (single canonical karaoke URL for compatibility)
      await db.songOrder.update({
        where: { id: parentOrderId },
        data: {
          karaokeFileUrl: option1.fileUrl,
          karaokeFileKey: option1.key,
          karaokeStatus: "completed",
          karaokeGeneratedAt: new Date(),
        },
      });

      // 9. Mark child order as COMPLETED and attach karaoke files
      const deliveredAt = new Date();
      await db.songOrder.update({
        where: { id: orderId },
        data: {
          status: "COMPLETED",
          songFileUrl: option1.fileUrl,
          songFileKey: option1.key,
          songUploadedAt: deliveredAt,
          songDeliveredAt: deliveredAt,
          songFileUrl2: option2?.fileUrl ?? null,
          songFileKey2: option2?.key ?? null,
          songUploadedAt2: option2 ? deliveredAt : null,
        },
      });

      // 10. Send delivery email
      const parentOrder = await db.songOrder.findUnique({
        where: { id: parentOrderId },
        select: {
          email: true,
          recipientName: true,
          locale: true,
        },
      });

      if (parentOrder?.email && transporter) {
        try {
          const locale = (parentOrder.locale || "pt").toLowerCase();
          const localeSlug = locale !== "en" ? `/${locale}` : "";
          const trackOrderUrl = `${SITE_URL}${localeSlug}/track-order?email=${encodeURIComponent(parentOrder.email)}`;

          const emailData = buildKaraokeDeliveryEmail({
            orderId: parentOrderId,
            recipientName: parentOrder.recipientName || "",
            locale,
            trackOrderUrl,
            karaokeFileUrl: option1.fileUrl,
            customerEmail: parentOrder.email,
          });

          await transporter.sendMail({
            from: emailData.from,
            to: parentOrder.email,
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text,
            headers: emailData.headers,
          });

          console.log(`🎤 [Karaoke] Delivery email sent to ${parentOrder.email}`);
        } catch (emailError) {
          console.error(`🎤 [Karaoke] Failed to send delivery email:`, emailError);
        }
      }

      // 11. Telegram alert
      try {
        await sendOperationalAlert(
          `🎤 <b>Karaokê pronto!</b>\n\nPedido: <code>${parentOrderId}</code>\nDestinatário: ${parentOrder?.recipientName || "?"}\n\nInstrumental gerado e enviado por email.`,
        );
      } catch {
        // Non-critical
      }

      console.log(`🎤 [Karaoke] Job completed for order ${orderId}`);
    } catch (error) {
      // Mark as failed on parent
      const errorMessage = error instanceof Error ? error.message : "Unknown karaoke generation error";
      await db.songOrder.update({
        where: { id: parentOrderId },
        data: {
          karaokeStatus: "failed",
          karaokeError: errorMessage,
        },
      });

      try {
        await sendOperationalAlert(
          `❌ <b>Karaokê falhou</b>\n\nPedido: <code>${parentOrderId}</code>\nErro: ${errorMessage}`,
        );
      } catch {
        // Non-critical
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
  },
);

karaokeWorker.on("completed", (job) => {
  console.log(`🎤 [Karaoke] Job ${job.id} completed`);
});

karaokeWorker.on("failed", (job, error) => {
  console.error(`❌ [Karaoke] Job ${job?.id} failed:`, error.message);
});

karaokeWorker.on("ready", () => {
  console.log("🎤 Karaoke worker started and ready");
});

// Shutdown
const shutdown = async () => {
  console.log("Shutting down karaoke worker...");
  await karaokeWorker.close();
  await connection.quit();
  await db.$disconnect();
  console.log("Karaoke worker shut down successfully");
};

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

console.log(`🚀 Karaoke worker initializing... queue: ${KARAOKE_GENERATION_QUEUE}`);
