import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { classifyBounce } from "~/lib/bounce-classifier";

const BOUNCE_WEBHOOK_SECRET = process.env.BOUNCE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  // Auth check
  if (BOUNCE_WEBHOOK_SECRET) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${BOUNCE_WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    email?: string;
    smtpCode?: string;
    enhancedCode?: string;
    reason?: string;
    messageId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, smtpCode, enhancedCode, reason, messageId } = body;

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const bounceType = classifyBounce(smtpCode, enhancedCode, reason);

  // Dedup: if we already have a bounce with this messageId, skip
  if (messageId) {
    const existing = await db.emailBounce.findUnique({
      where: { emailMessageId: messageId },
    });
    if (existing) {
      return NextResponse.json({ status: "duplicate", id: existing.id });
    }
  }

  // Find the most recent order for this email (for admin dashboard context)
  const recentOrder = await db.songOrder.findFirst({
    where: { email: normalizedEmail },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      recipientName: true,
      backupWhatsApp: true,
      locale: true,
    },
  });

  const bounce = await db.emailBounce.create({
    data: {
      bouncedEmail: normalizedEmail,
      bounceReason: reason ?? `SMTP ${smtpCode ?? "unknown"} ${enhancedCode ?? ""}`.trim(),
      bounceType,
      smtpCode: smtpCode ?? null,
      enhancedCode: enhancedCode ?? null,
      emailMessageId: messageId ?? null,
      orderId: recentOrder?.id ?? null,
      orderStatus: recentOrder?.status ?? null,
      recipientName: recentOrder?.recipientName ?? null,
      backupWhatsApp: recentOrder?.backupWhatsApp ?? null,
      locale: recentOrder?.locale ?? null,
    },
  });

  console.log(
    `[Bounce Webhook] Recorded ${bounceType} bounce for ${normalizedEmail} (SMTP ${smtpCode ?? "?"} ${enhancedCode ?? ""})`,
  );

  return NextResponse.json({ status: "created", id: bounce.id, bounceType });
}
