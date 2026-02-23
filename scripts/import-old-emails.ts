/**
 * One-time script to import old emails from IMAP into the ticket system.
 * Processes emails from the last 30 days, including already-read ones.
 * Has dedup built-in so it's safe to run multiple times.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/import-old-emails.ts   # Preview only
 *   npx tsx scripts/import-old-emails.ts              # Actually import
 */
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const IMAP_HOST = process.env.IMAP_HOST!;
const IMAP_PORT = parseInt(process.env.IMAP_PORT || "993", 10);
const IMAP_USER = process.env.SMTP_USER!;
const IMAP_PASSWORD = process.env.SMTP_PASSWORD!;
const SUPPORT_EMAIL = process.env.SMTP_FROM?.match(/<(.+)>/)?.[1] || process.env.SMTP_FROM;

const DRY_RUN = process.env.DRY_RUN === "1";
const DAYS_BACK = 30;

// Bounce detection patterns
const bounceFromPatterns = /mailer-daemon|postmaster|mail delivery subsystem/i;
const bounceSubjectPatterns = /undeliverable|delivery status|failure|returned|bounced|não entregue|devolvido|undelivered|delivery failed|mail delivery failed|returned mail/i;

async function main() {
  console.log(`\n${DRY_RUN ? "🔍 DRY RUN" : "🚀 LIVE RUN"} - Importing emails from last ${DAYS_BACK} days\n`);

  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASSWORD) {
    console.error("❌ IMAP credentials not configured");
    process.exit(1);
  }

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASSWORD },
    logger: false,
    socketTimeout: 60000,
  });

  client.on("error", (err: Error) => {
    console.error("[IMAP] Connection error:", err.message);
  });

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - DAYS_BACK);

  let stats = {
    total: 0,
    skippedOwn: 0,
    skippedDuplicateTicket: 0,
    skippedDuplicateBounce: 0,
    bouncesCreated: 0,
    ticketsCreated: 0,
    repliesAdded: 0,
    errors: 0,
  };

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Fetch ALL messages from last 30 days (including SEEN)
      const messages = client.fetch(
        { since: sinceDate },
        { source: true, envelope: true, uid: true }
      );

      for await (const msg of messages) {
        stats.total++;
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source as Buffer);

          const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase();
          if (!fromAddress) continue;

          // Skip our own emails
          if (SUPPORT_EMAIL && fromAddress === SUPPORT_EMAIL.toLowerCase()) {
            stats.skippedOwn++;
            continue;
          }

          const subject = (parsed.subject as string) || "(No Subject)";
          const textBody = (parsed.text as string) || "";
          const htmlBody = (parsed.html as string) || undefined;
          const emailMessageId = (parsed.messageId as string) || undefined;
          const inReplyTo = (parsed.inReplyTo as string) || undefined;
          const rawRefs = parsed.references as string | string[] | undefined;
          const referencesHeader = Array.isArray(rawRefs)
            ? rawRefs.join(" ")
            : rawRefs || undefined;
          const emailDate = parsed.date || new Date();

          // === BOUNCE DETECTION ===
          const isBounce = bounceFromPatterns.test(fromAddress) || bounceSubjectPatterns.test(subject);

          if (isBounce) {
            // Dedup
            if (emailMessageId) {
              const existing = await db.emailBounce.findUnique({ where: { emailMessageId } });
              if (existing) {
                stats.skippedDuplicateBounce++;
                continue;
              }
            }

            // Extract bounced email
            const emailRegexPatterns = [
              /(?:Original-Recipient|Final-Recipient|Delivered-To|X-Failed-Recipients):\s*(?:rfc822;?\s*)?([^\s<>]+@[^\s<>;]+)/i,
              /(?:was not delivered to|could not be delivered to|delivery to the following recipient failed|undeliverable to)\s*:?\s*<?([^\s<>]+@[^\s<>;]+)/i,
              /<?([^\s<>@]+@[^\s<>;]+)>?\s*(?:was not delivered|could not be delivered|delivery failed|does not exist)/i,
            ];
            let bouncedEmail: string | null = null;
            for (const pattern of emailRegexPatterns) {
              const match = textBody.match(pattern);
              if (match?.[1]) {
                bouncedEmail = match[1].toLowerCase().trim();
                break;
              }
            }
            if (!bouncedEmail) {
              const allEmails = textBody.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
              if (allEmails) {
                const candidate = allEmails.find((e: string) =>
                  e.toLowerCase() !== fromAddress &&
                  !bounceFromPatterns.test(e.toLowerCase()) &&
                  e.toLowerCase() !== SUPPORT_EMAIL?.toLowerCase()
                );
                if (candidate) bouncedEmail = candidate.toLowerCase();
              }
            }

            const bodyLower = textBody.toLowerCase();
            let bounceType = "unknown";
            if (/does not exist|user unknown|no such user|mailbox not found|invalid address|address rejected|recipient rejected/i.test(bodyLower)) {
              bounceType = "hard";
            } else if (/mailbox full|quota exceeded|over quota|too many|temporarily|try again|rate limit/i.test(bodyLower)) {
              bounceType = "soft";
            }

            const reasonLines = textBody.split("\n").filter((l: string) => l.trim().length > 10);
            const bounceReason = reasonLines.slice(0, 3).join(" ").substring(0, 500) || subject;

            let linkedOrder = null;
            if (bouncedEmail) {
              linkedOrder = await db.songOrder.findFirst({
                where: { email: bouncedEmail, status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] } },
                orderBy: { createdAt: "desc" },
                select: { id: true, status: true, recipientName: true, backupWhatsApp: true, locale: true },
              });
            }

            console.log(`  📨 BOUNCE: ${bouncedEmail || fromAddress} [${bounceType}]${linkedOrder ? ` → order ${linkedOrder.id}` : ""}`);

            if (!DRY_RUN) {
              await db.emailBounce.create({
                data: {
                  bouncedEmail: bouncedEmail || fromAddress,
                  bounceReason,
                  bounceType,
                  originalSubject: subject,
                  rawSnippet: textBody.substring(0, 2000),
                  emailMessageId: emailMessageId || null,
                  orderId: linkedOrder?.id || null,
                  orderStatus: linkedOrder?.status || null,
                  recipientName: linkedOrder?.recipientName || null,
                  backupWhatsApp: linkedOrder?.backupWhatsApp || null,
                  locale: linkedOrder?.locale || null,
                  detectedAt: emailDate,
                },
              });
            }
            stats.bouncesCreated++;
            continue;
          }

          // === TICKET PROCESSING ===
          // Dedup by emailMessageId
          if (emailMessageId) {
            const existing = await db.ticketMessage.findUnique({ where: { emailMessageId } });
            if (existing) {
              stats.skippedDuplicateTicket++;
              continue;
            }
          }

          // Thread matching
          let ticket = null;

          if (inReplyTo) {
            const replyMsg = await db.ticketMessage.findUnique({
              where: { emailMessageId: inReplyTo },
              include: { ticket: true },
            });
            if (replyMsg) ticket = replyMsg.ticket;
          }

          if (!ticket) {
            const cleanSubject = subject.replace(/^(Re|Fwd|Fw|Enc|Rép|Rif):\s*/gi, "").trim();
            if (cleanSubject) {
              ticket = await db.supportTicket.findFirst({
                where: { email: fromAddress, subject: cleanSubject, status: { not: "CLOSED" } },
                orderBy: { createdAt: "desc" },
              });
            }
          }

          if (ticket) {
            console.log(`  💬 REPLY: ${fromAddress} → ticket ${ticket.id.slice(-8)}`);
            if (!DRY_RUN) {
              await db.ticketMessage.create({
                data: {
                  ticketId: ticket.id,
                  direction: "INBOUND",
                  senderEmail: fromAddress,
                  body: textBody,
                  htmlBody: htmlBody || null,
                  emailMessageId: emailMessageId || null,
                  inReplyTo: inReplyTo || null,
                  references: referencesHeader || null,
                  createdAt: emailDate,
                },
              });
              if (ticket.status === "WAITING_REPLY" || ticket.status === "RESOLVED") {
                await db.supportTicket.update({ where: { id: ticket.id }, data: { status: "OPEN" } });
              }
            }
            stats.repliesAdded++;
          } else {
            const cleanSubject = subject.replace(/^(Re|Fwd|Fw|Enc|Rép|Rif):\s*/gi, "").trim() || "(No Subject)";
            const recentOrder = await db.songOrder.findFirst({
              where: { email: fromAddress },
              orderBy: { createdAt: "desc" },
              select: { id: true, locale: true },
            });

            console.log(`  📩 NEW TICKET: ${fromAddress} - "${cleanSubject.substring(0, 50)}"`);

            if (!DRY_RUN) {
              await db.supportTicket.create({
                data: {
                  email: fromAddress,
                  subject: cleanSubject,
                  orderId: recentOrder?.id || null,
                  locale: recentOrder?.locale || null,
                  createdAt: emailDate,
                  messages: {
                    create: {
                      direction: "INBOUND",
                      senderEmail: fromAddress,
                      body: textBody,
                      htmlBody: htmlBody || null,
                      emailMessageId: emailMessageId || null,
                      inReplyTo: inReplyTo || null,
                      references: referencesHeader || null,
                      createdAt: emailDate,
                    },
                  },
                },
              });
            }
            stats.ticketsCreated++;
          }
        } catch (msgError: any) {
          console.error(`  ❌ Error processing message:`, msgError.message);
          stats.errors++;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error: any) {
    console.error("❌ IMAP error:", error.message);
    try { await client.logout(); } catch { /* ignore */ }
  }

  console.log(`
═══════════════════════════════════
  ${DRY_RUN ? "DRY RUN" : "IMPORT"} COMPLETE
═══════════════════════════════════
  Total emails scanned:    ${stats.total}
  Skipped (own emails):    ${stats.skippedOwn}
  Skipped (dup tickets):   ${stats.skippedDuplicateTicket}
  Skipped (dup bounces):   ${stats.skippedDuplicateBounce}
  Bounces created:         ${stats.bouncesCreated}
  New tickets created:     ${stats.ticketsCreated}
  Replies added:           ${stats.repliesAdded}
  Errors:                  ${stats.errors}
═══════════════════════════════════
${DRY_RUN ? "\n🔍 This was a dry run. Run without DRY_RUN=1 to actually import.\n" : ""}
`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
