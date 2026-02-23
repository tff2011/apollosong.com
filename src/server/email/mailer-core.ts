import nodemailer from "nodemailer";
import { db } from "~/server/db";
import { isEmailBounced } from "~/lib/email-bounce-suppression";
import { isEmailUnsubscribed } from "~/lib/email-unsubscribe";
import { isValidEmailFormat, hasMxRecords } from "~/lib/email-validation";
import { CRITICAL_TEMPLATES, MAX_EMAILS_PER_RECIPIENT_PER_DAY } from "~/lib/email-constants";
import { executeWithSmtpRetry } from "./smtp-retry";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  orderId?: string;
  metadata?: Record<string, any>;
  from?: string;
  headers?: Record<string, string>;
  skipBounceCheck?: boolean;
  skipRateLimit?: boolean;
  skipUnsubscribeCheck?: boolean;
};

type MailerConfig = {
  smtpHost: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  smtpReplyTo?: string;
};

let _transporter: nodemailer.Transporter | null = null;
let _config: MailerConfig | null = null;

/**
 * Initialize the mailer with SMTP config. Must be called once before sendEmail.
 * Safe to call multiple times (idempotent).
 */
export function initMailer(config: MailerConfig) {
  if (_transporter && _config === config) return;
  _config = config;
  _transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort ?? 587,
    secure: config.smtpSecure ?? false,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
  });
}

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) throw new Error("[Mailer] Not initialized. Call initMailer() first.");
  return _transporter;
}

function getFrom(): string {
  if (!_config) throw new Error("[Mailer] Not initialized. Call initMailer() first.");
  return _config.smtpFrom;
}

function getReplyTo(): string | undefined {
  return _config?.smtpReplyTo;
}

/**
 * Central email sending function with all checks:
 * 1. Email format validation
 * 2. MX record validation (fail-open)
 * 3. Bounce suppression
 * 4. Unsubscribe check (marketing only)
 * 5. Rate limit (marketing only)
 * 6. SMTP send
 * 7. SentEmail log
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  template,
  orderId,
  metadata,
  from,
  headers,
  skipBounceCheck,
  skipRateLimit,
  skipUnsubscribeCheck,
}: SendEmailParams): Promise<string | null> {
  const isCritical = CRITICAL_TEMPLATES.has(template);

  // --- 1. Email format validation ---
  if (!isValidEmailFormat(to)) {
    console.warn(`[Mailer] Invalid email format: ${to}`);
    await logEmail(to, subject, template, orderId, metadata, "SUPPRESSED", "Invalid email format");
    return null;
  }

  // --- 2. MX record validation (fail-open) ---
  try {
    const hasMx = await hasMxRecords(to);
    if (!hasMx) {
      console.warn(`[Mailer] No MX records for domain: ${to}`);
      await logEmail(to, subject, template, orderId, metadata, "SUPPRESSED", "No MX records for domain");
      return null;
    }
  } catch {
    // Fail-open: proceed if MX check errors
  }

  // --- 3. Bounce suppression check (fail-open) ---
  if (!skipBounceCheck) {
    try {
      const bounceCheck = await isEmailBounced(to);
      if (bounceCheck.suppressed) {
        console.warn(`[Mailer] Email suppressed: ${to} (${bounceCheck.bounceType} bounce)`);
        await logEmail(to, subject, template, orderId, {
          ...metadata,
          suppressionReason: `${bounceCheck.bounceType}_bounce`,
        }, "SUPPRESSED", `Bounce ${bounceCheck.bounceType} not resolved`);
        return null;
      }
    } catch (bounceErr) {
      console.error("[Bounce Check] Failed, proceeding with send:", bounceErr);
    }
  }

  // --- 4. Unsubscribe check (marketing only) ---
  if (!isCritical && !skipUnsubscribeCheck) {
    try {
      const unsubscribed = await isEmailUnsubscribed(to);
      if (unsubscribed) {
        console.warn(`[Mailer] Email unsubscribed: ${to}`);
        await logEmail(to, subject, template, orderId, {
          ...metadata,
          suppressionReason: "unsubscribed",
        }, "SUPPRESSED", "Recipient unsubscribed");
        return null;
      }
    } catch (err) {
      console.error("[Unsubscribe Check] Failed, proceeding with send:", err);
    }
  }

  // --- 5. Rate limit (marketing only) ---
  if (!isCritical && !skipRateLimit) {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const sentToday = await db.sentEmail.count({
        where: {
          recipient: to.toLowerCase(),
          status: "SENT",
          createdAt: { gte: startOfDay },
        },
      });

      if (sentToday >= MAX_EMAILS_PER_RECIPIENT_PER_DAY) {
        console.warn(`[Mailer] Rate limited: ${to} (${sentToday} emails today)`);
        await logEmail(to, subject, template, orderId, {
          ...metadata,
          suppressionReason: "rate_limited",
          sentToday,
        }, "SUPPRESSED", `Rate limited: ${sentToday} emails today`);
        return null;
      }
    } catch (err) {
      console.error("[Rate Limit Check] Failed, proceeding with send:", err);
    }
  }

  // --- 6. Send via SMTP ---
  try {
    const mailHeaders: Record<string, string> = {};
    if (headers?.["List-Unsubscribe"]) mailHeaders["List-Unsubscribe"] = headers["List-Unsubscribe"];
    if (headers?.["List-Unsubscribe-Post"]) mailHeaders["List-Unsubscribe-Post"] = headers["List-Unsubscribe-Post"];
    if (headers?.["X-Priority"]) mailHeaders["X-Priority"] = headers["X-Priority"];
    if (headers?.["X-Mailer"]) mailHeaders["X-Mailer"] = headers["X-Mailer"];
    if (headers?.["In-Reply-To"]) mailHeaders["In-Reply-To"] = headers["In-Reply-To"];
    if (headers?.["References"]) mailHeaders["References"] = headers["References"];

    const info = await executeWithSmtpRetry({
      operationName: `sendEmail(${template}) -> ${to}`,
      operation: () => getTransporter().sendMail({
        from: from || getFrom(),
        to,
        subject,
        html,
        text,
        replyTo: headers?.["Reply-To"] || getReplyTo() || undefined,
        headers: Object.keys(mailHeaders).length > 0 ? mailHeaders : undefined,
      }),
    });

    // --- 7. Log success ---
    await logEmail(to, subject, template, orderId, metadata, "SENT");

    return info.messageId;
  } catch (error) {
    console.error("Failed to send email:", error);

    await logEmail(to, subject, template, orderId, metadata, "FAILED",
      error instanceof Error ? error.message : "Unknown error");

    throw error;
  }
}

/** Best-effort email log (never throws) */
async function logEmail(
  recipient: string,
  subject: string,
  template: string,
  orderId: string | undefined,
  metadata: Record<string, any> | undefined,
  status: string,
  error?: string,
) {
  try {
    await db.sentEmail.create({
      data: {
        recipient,
        subject,
        template,
        orderId,
        metadata: metadata ?? {},
        status,
        error,
      },
    });
  } catch (logErr) {
    console.error("[Mailer] Failed to log email:", logErr);
  }
}
