import { db } from "~/server/db";
import crypto from "crypto";

const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || "apollo-unsubscribe-secret";

/**
 * Generates a secure token for the unsubscribe link using HMAC-SHA256
 */
export function generateUnsubscribeToken(email: string): string {
  return crypto
    .createHmac("sha256", UNSUBSCRIBE_SECRET)
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/**
 * Validates that the provided token matches the expected token for the email
 */
export function validateUnsubscribeToken(email: string, token: string): boolean {
  const expectedToken = generateUnsubscribeToken(email);
  return token === expectedToken;
}

/**
 * Generates the full unsubscribe URL with email and token parameters
 */
export function getUnsubscribeUrl(email: string, locale: string): string {
  const token = generateUnsubscribeToken(email);
  const encodedEmail = encodeURIComponent(email);
  return `https://apollosong.com/api/unsubscribe?email=${encodedEmail}&token=${token}&locale=${locale}`;
}

/**
 * Checks if an email has been unsubscribed from marketing emails
 */
export async function isEmailUnsubscribed(email: string): Promise<boolean> {
  const record = await db.emailUnsubscribe.findUnique({
    where: { email: email.toLowerCase() },
  });
  return !!record;
}

/**
 * Adds an email to the unsubscribe list
 */
export async function unsubscribeEmail(email: string, reason?: string): Promise<void> {
  await db.emailUnsubscribe.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      reason: reason || "user_request",
    },
    update: {
      unsubscribedAt: new Date(),
      reason: reason || "user_request",
    },
  });
}
