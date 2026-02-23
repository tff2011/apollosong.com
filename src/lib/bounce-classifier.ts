export type BounceClassification = "hard" | "soft" | "unknown";

/**
 * Classifies a bounce based on SMTP response codes and reason text.
 *
 * Hard bounces = permanent failures (address doesn't exist, domain blocked)
 * Soft bounces = temporary failures (mailbox full, temporarily unavailable)
 */
export function classifyBounce(
  smtpCode: string | null | undefined,
  enhancedCode: string | null | undefined,
  reason: string | null | undefined,
): BounceClassification {
  const code = smtpCode ?? "";
  const enhanced = enhancedCode ?? "";
  const reasonLower = (reason ?? "").toLowerCase();

  // --- Check reason text first for clear signals ---

  // Spam/block signals → hard
  if (
    reasonLower.includes("spam") ||
    reasonLower.includes("rspam") ||
    reasonLower.includes("blacklist") ||
    reasonLower.includes("blocklist") ||
    reasonLower.includes("blocked") ||
    reasonLower.includes("rejected") ||
    reasonLower.includes("spfbl")
  ) {
    return "hard";
  }

  // User doesn't exist signals → hard
  if (
    reasonLower.includes("does not exist") ||
    reasonLower.includes("user unknown") ||
    reasonLower.includes("no such user") ||
    reasonLower.includes("recipient rejected") ||
    reasonLower.includes("address rejected") ||
    reasonLower.includes("invalid recipient") ||
    reasonLower.includes("mailbox not found")
  ) {
    return "hard";
  }

  // Mailbox full signals → soft
  if (
    reasonLower.includes("mailbox full") ||
    reasonLower.includes("over quota") ||
    reasonLower.includes("quota exceeded") ||
    reasonLower.includes("insufficient storage")
  ) {
    return "soft";
  }

  // --- Check enhanced status codes (5.x.x or 4.x.x) ---

  // 5.1.1 = bad destination mailbox → hard
  if (enhanced === "5.1.1" || enhanced === "5.1.2" || enhanced === "5.1.3" || enhanced === "5.1.6") {
    return "hard";
  }
  // 5.5.0 = mailbox unavailable → hard
  if (enhanced === "5.5.0") {
    return "hard";
  }
  // 5.7.1 = delivery not authorized / blocked → hard
  if (enhanced === "5.7.1" || enhanced === "5.7.0") {
    return "hard";
  }
  // 5.2.1 = mailbox disabled → hard
  if (enhanced === "5.2.1") {
    return "hard";
  }

  // 4.2.2 = mailbox full → soft
  if (enhanced === "4.2.2") {
    return "soft";
  }
  // 4.7.x = temporary policy rejection → soft
  if (enhanced.startsWith("4.7.")) {
    return "soft";
  }
  // 4.x.x generic = soft
  if (enhanced.startsWith("4.")) {
    return "soft";
  }

  // --- Check SMTP reply codes ---

  // 550 = mailbox unavailable → hard
  if (code === "550" || code === "551" || code === "553" || code === "554") {
    return "hard";
  }
  // 552 = exceeded storage → soft (could recover)
  if (code === "552") {
    return "soft";
  }
  // 421, 450, 451, 452 = temporary failures → soft
  if (code === "421" || code === "450" || code === "451" || code === "452") {
    return "soft";
  }

  // 5xx not matched above → hard
  if (code.startsWith("5")) {
    return "hard";
  }
  // 4xx not matched above → soft
  if (code.startsWith("4")) {
    return "soft";
  }

  return "unknown";
}
