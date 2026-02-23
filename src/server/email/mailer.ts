import "server-only";

import { env } from "~/env";
import { initMailer, sendEmail as sendEmailCore } from "./mailer-core";
import type { SendEmailParams } from "./mailer-core";

// Auto-initialize with env vars when imported in Next.js context
initMailer({
  smtpHost: env.SMTP_HOST,
  smtpPort: 587,
  smtpSecure: env.SMTP_SECURE === "true",
  smtpUser: env.SMTP_USER,
  smtpPassword: env.SMTP_PASSWORD,
  smtpFrom: env.SMTP_FROM,
  smtpReplyTo: env.SMTP_REPLY_TO,
});

export { sendEmailCore as sendEmail };
export type { SendEmailParams };
