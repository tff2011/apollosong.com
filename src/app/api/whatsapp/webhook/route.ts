import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "~/server/db";
import { enqueueWhatsAppResponse } from "~/server/queues/whatsapp-response";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

type WhatsAppStatusError = {
  code?: number;
  title?: string;
  message?: string;
  error_data?: unknown;
};

type PersistableWhatsAppStatus = {
  key: string;
  status: string;
  timestamp: number; // unix seconds
  businessPhoneNumberId?: string;
  businessDisplayPhoneNumber?: string;
  recipientId?: string;
  conversationId?: string;
  pricing?: unknown;
  errors?: WhatsAppStatusError[];
};

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unstringifiable]";
  }
}

function extractErrorCodes(errors: WhatsAppStatusError[] | undefined): number[] {
  if (!errors || errors.length === 0) return [];
  const codes = errors
    .map((e) => e.code)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  return Array.from(new Set(codes));
}

async function notifyTelegram(text: string): Promise<void> {
  // Avoid breaking the webhook for a best-effort notification.
  if (!TELEGRAM_BOT_TOKEN) return;
  const TELEGRAM_AUTOMATION_CHAT_ID = "-5221304809";
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("[WhatsApp Webhook] Telegram notify failed:", e);
  }
}

type WhatsAppBusinessMeta = {
  businessPhoneNumberId?: string;
  businessDisplayPhoneNumber?: string;
};

async function persistStatusUpdate(statusObj: any, meta?: WhatsAppBusinessMeta) {
  const waMessageId = statusObj?.id as string | undefined;
  const status = statusObj?.status as string | undefined;
  const timestamp = parseInt(statusObj?.timestamp, 10);
  const recipientId = statusObj?.recipient_id as string | undefined;
  const conversationId = statusObj?.conversation?.id as string | undefined;
  const pricing = statusObj?.pricing as unknown;
  const errors = (statusObj?.errors ?? []) as WhatsAppStatusError[];

  if (!waMessageId || !status || !Number.isFinite(timestamp)) {
    console.warn("[WhatsApp Webhook] Invalid status payload:", safeJsonStringify(statusObj));
    return;
  }

  const key = `${waMessageId}:${status}:${timestamp}:${recipientId ?? ""}`;

  const errorCodes = extractErrorCodes(errors);
  const errLabel = errorCodes.length > 0 ? ` errors=${errorCodes.join(",")}` : "";
  const fromLabel = meta?.businessDisplayPhoneNumber ? ` from=${meta.businessDisplayPhoneNumber}` : "";
  const fromIdLabel = meta?.businessPhoneNumberId ? ` phoneNumberId=${meta.businessPhoneNumberId}` : "";
  console.log(
    `[WhatsApp Webhook] Status update: id=${waMessageId} status=${status} to=${recipientId ?? "--"} ts=${timestamp}${fromLabel}${fromIdLabel}${errLabel}`
  );

  const msg = await db.whatsAppMessage.findUnique({
    where: { waMessageId },
    select: { id: true, metadata: true, conversationId: true, direction: true },
  });

  // Prisma JSON fields do not accept `undefined` anywhere in the object, so we only add keys when defined.
  const persistable: PersistableWhatsAppStatus = {
    key,
    status,
    timestamp,
    ...(meta?.businessPhoneNumberId ? { businessPhoneNumberId: meta.businessPhoneNumberId } : {}),
    ...(meta?.businessDisplayPhoneNumber ? { businessDisplayPhoneNumber: meta.businessDisplayPhoneNumber } : {}),
    ...(recipientId ? { recipientId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(pricing !== undefined ? { pricing } : {}),
    ...(errors?.length ? { errors } : {}),
  };

  if (!msg) {
    // Still alert on important failures even if we couldn't correlate.
    if (status === "failed" && errorCodes.some((c) => c === 130497 || c === 131047)) {
      const code = errorCodes[0];
      await notifyTelegram(
        `❌ <b>WhatsApp status=failed (sem correlacao)</b>\n\n<b>code:</b> ${code ?? "?"}\n<b>id:</b> ${waMessageId}\n<b>to:</b> ${recipientId ?? "--"}\n<b>from:</b> ${meta?.businessDisplayPhoneNumber ?? "--"}\n<b>phone_number_id:</b> ${meta?.businessPhoneNumberId ?? "--"}`
      );
    }
    console.warn(`[WhatsApp Webhook] Status for unknown message id=${waMessageId} (not in db yet?)`);
    return;
  }

  const existingMeta = (msg.metadata ?? {}) as any;
  const waMeta = (existingMeta.wa && typeof existingMeta.wa === "object") ? existingMeta.wa : {};
  const existingEvents = Array.isArray(waMeta.statusEvents) ? waMeta.statusEvents : [];

  // Dedup by key, keep only the most recent 25 events to avoid unbounded growth.
  const nextEvents = [...existingEvents.filter((e: any) => e?.key !== key), persistable].slice(-25);
  const nextWaMeta = {
    ...waMeta,
    lastStatus: persistable,
    statusEvents: nextEvents,
  };

  await db.whatsAppMessage.update({
    where: { id: msg.id },
    data: { metadata: { ...existingMeta, wa: nextWaMeta } },
  });

  // High-signal alerts for common silent-failure cases.
  if (status === "failed") {
    const codes = extractErrorCodes(errors);
    if (codes.some((c) => c === 130497 || c === 131047)) {
      const code = codes[0];
      const title = errors?.find((e) => e.code === code)?.title;
      const msgTitle = title ? `\n<b>title:</b> ${title}` : "";
      await notifyTelegram(
        `❌ <b>WhatsApp status=failed</b>\n\n<b>code:</b> ${code ?? "?"}${msgTitle}\n<b>id:</b> ${waMessageId}\n<b>to:</b> ${recipientId ?? "--"}\n<b>from:</b> ${meta?.businessDisplayPhoneNumber ?? "--"}\n<b>phone_number_id:</b> ${meta?.businessPhoneNumberId ?? "--"}\n<b>direction:</b> ${msg.direction}`
      );
    }
  }
}

/**
 * GET - Webhook verification (Meta sends this during setup)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    console.log("[WhatsApp Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[WhatsApp Webhook] Verification failed");
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST - Incoming messages from WhatsApp
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Validate signature if META_APP_SECRET is configured
  if (META_APP_SECRET) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      console.warn("[WhatsApp Webhook] Missing signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const expectedSignature = "sha256=" + crypto
      .createHmac("sha256", META_APP_SECRET)
      .update(rawBody)
      .digest("hex");

    try {
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);
      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.warn("[WhatsApp Webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } catch {
      console.warn("[WhatsApp Webhook] Signature verification error");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Process entries
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    const changes = entry?.changes ?? [];
    for (const change of changes) {
      const value = change?.value;
      if (!value || value.messaging_product !== "whatsapp") continue;

      const businessPhoneNumberId = value?.metadata?.phone_number_id as string | undefined;
      const businessDisplayPhoneNumber = value?.metadata?.display_phone_number as string | undefined;
      const businessMeta: WhatsAppBusinessMeta = {
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
      };

      // Persist status callbacks (delivery outcomes).
      const statuses = value.statuses ?? [];
      for (const statusObj of statuses) {
        try {
          await persistStatusUpdate(statusObj, businessMeta);
        } catch (e) {
          console.error("[WhatsApp Webhook] Failed to persist status update:", e);
        }
      }

      const messages = value.messages ?? [];
      const contacts = value.contacts ?? [];

      for (const message of messages) {
        const SUPPORTED_TYPES = ["text", "audio", "image", "video", "document", "sticker"] as const;
        type SupportedType = typeof SUPPORTED_TYPES[number];
        if (!SUPPORTED_TYPES.includes(message.type as SupportedType)) continue;

        const waId = message.from; // E.164 without +
        const waMessageId = message.id;
        const timestamp = parseInt(message.timestamp, 10) || Math.floor(Date.now() / 1000);
        const msgType = message.type as SupportedType;

        const isMedia = msgType !== "text";
        const mediaObj = isMedia ? (message[msgType] ?? {}) : {};
        const mediaId = isMedia ? mediaObj.id : undefined;
        const mimeType = isMedia ? mediaObj.mime_type : undefined;
        const fileName = msgType === "document" ? mediaObj.filename : undefined;
        const caption = isMedia ? (mediaObj.caption ?? "") : "";
        const messageBody = msgType === "text" ? (message.text?.body ?? "") : caption;

        if (!waId || !waMessageId) continue;
        if (!isMedia && !messageBody) continue;
        if (isMedia && !mediaId) continue;

        // Idempotency check
        const existing = await db.whatsAppMessage.findUnique({
          where: { waMessageId },
          select: { id: true },
        });
        if (existing) {
          console.log(`[WhatsApp Webhook] Duplicate message ${waMessageId}, skipping`);
          continue;
        }

        // Extract customer name from contacts
        const contact = contacts.find((c: any) => c.wa_id === waId);
        const customerName = contact?.profile?.name ?? null;

        // Enqueue for async processing
        await enqueueWhatsAppResponse({
          waId,
          messageBody,
          waMessageId,
          customerName,
          timestamp,
          messageType: msgType,
          mediaId,
          mimeType,
          fileName,
          caption,
          businessPhoneNumberId,
          businessDisplayPhoneNumber,
        });

        const logPreview = isMedia ? `[${msgType}]` : messageBody.substring(0, 50) + "...";
        console.log(`[WhatsApp Webhook] Enqueued ${message.type} message from ${waId}: ${logPreview}`);
      }
    }
  }

  // Always return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
