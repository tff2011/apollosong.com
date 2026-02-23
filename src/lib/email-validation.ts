import { promises as dns } from "dns";

// Simple regex for basic email format validation (not RFC 5322 complete, but catches obvious junk)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates basic email format. Rejects obviously invalid emails
 * without hitting the database.
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_REGEX.test(email);
}

// MX record cache: domain → { hasMx: boolean, expiresAt: timestamp }
const mxCache = new Map<string, { hasMx: boolean; expiresAt: number }>();
const MX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MX_CACHE_MAX_ENTRIES = 1000;

/**
 * Checks if the email's domain has valid MX records.
 * Uses an in-memory cache (1h TTL, max 1000 entries).
 * Fail-open: returns true on any error (DNS timeout, network issues).
 */
export async function hasMxRecords(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return false;

    const now = Date.now();

    // Check cache
    const cached = mxCache.get(domain);
    if (cached && cached.expiresAt > now) {
      return cached.hasMx;
    }

    // Evict expired entries if cache is too large
    if (mxCache.size >= MX_CACHE_MAX_ENTRIES) {
      for (const [key, value] of mxCache) {
        if (value.expiresAt <= now) mxCache.delete(key);
      }
      // If still too large after cleanup, clear oldest half
      if (mxCache.size >= MX_CACHE_MAX_ENTRIES) {
        const entries = [...mxCache.entries()];
        entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
        const toRemove = entries.slice(0, Math.floor(entries.length / 2));
        for (const [key] of toRemove) mxCache.delete(key);
      }
    }

    const records = await dns.resolveMx(domain);
    const hasMx = records.length > 0;

    mxCache.set(domain, { hasMx, expiresAt: now + MX_CACHE_TTL_MS });
    return hasMx;
  } catch {
    // Fail-open: if DNS lookup fails, allow the email through
    return true;
  }
}
