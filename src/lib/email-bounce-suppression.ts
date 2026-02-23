import { db } from "~/server/db";

const SOFT_BOUNCE_SUPPRESSION_DAYS = 3;
const SOFT_BOUNCE_ESCALATION_THRESHOLD = 3;

type BounceCheckResult = {
  suppressed: boolean;
  bounceType: "hard" | "soft" | "soft_escalated" | null;
};

/**
 * Checks if an email is suppressed due to a previous bounce.
 *
 * - Hard bounce (not resolved) → suppressed permanently
 * - Soft bounce ×3+ (not resolved) → auto-escalated to hard, suppressed permanently
 * - Soft bounce (not resolved, within last 3 days) → suppressed temporarily
 * - Unknown bounce → not suppressed (admin can reclassify)
 * - Fail-open: if the check fails (e.g. DB offline), returns not suppressed
 */
export async function isEmailBounced(email: string): Promise<BounceCheckResult> {
  const bounces = await db.emailBounce.findMany({
    where: {
      bouncedEmail: email.toLowerCase(),
      resolved: false,
    },
    select: {
      bounceType: true,
      detectedAt: true,
    },
    orderBy: { detectedAt: "desc" },
  });

  if (bounces.length === 0) {
    return { suppressed: false, bounceType: null };
  }

  // Hard bounce → always suppressed
  const hardBounce = bounces.find((b) => b.bounceType === "hard" || b.bounceType === "soft_escalated");
  if (hardBounce) {
    return { suppressed: true, bounceType: hardBounce.bounceType as "hard" | "soft_escalated" };
  }

  // Count unresolved soft bounces — if >= threshold, treat as hard (permanent)
  const softBounces = bounces.filter((b) => b.bounceType === "soft");
  if (softBounces.length >= SOFT_BOUNCE_ESCALATION_THRESHOLD) {
    return { suppressed: true, bounceType: "soft_escalated" };
  }

  // Single/few soft bounces → suppressed if within last N days
  if (softBounces.length > 0) {
    const mostRecent = softBounces[0]!;
    const daysSinceBounce =
      (Date.now() - mostRecent.detectedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceBounce <= SOFT_BOUNCE_SUPPRESSION_DAYS) {
      return { suppressed: true, bounceType: "soft" };
    }
  }

  // Unknown or expired soft bounce → not suppressed
  return { suppressed: false, bounceType: null };
}
