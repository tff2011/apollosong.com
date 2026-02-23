/**
 * Templates that are critical to the customer experience and should
 * skip rate-limit and unsubscribe checks.
 */
export const CRITICAL_TEMPLATES = new Set([
  "SONG_DELIVERY",
  "SONG_DELIVERY_AUTO",
  "PURCHASE_CONFIRMATION",
  "TICKET_REPLY",
  "TICKET_CREATED",
  "REVISION_COMPLETED",
  "REVISION_CONFIRMATION",
  "PASSWORD_RESET",
]);

/**
 * Maximum marketing emails per recipient per day.
 * Critical templates are exempt from this limit.
 */
export const MAX_EMAILS_PER_RECIPIENT_PER_DAY = 2;
