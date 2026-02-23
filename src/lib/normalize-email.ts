/**
 * Common email domain typo corrections
 * Maps incorrect domains to their correct versions
 */
const DOMAIN_CORRECTIONS: Record<string, string> = {
    // .com.br para domínios internacionais (erro comum de brasileiros)
    // Nota: yahoo.com.br, outlook.com.br, hotmail.com.br e live.com.br são válidos (domínios regionais Microsoft)
    "gmail.com.br": "gmail.com",
    "icloud.com.br": "icloud.com",

    // Typos comuns do Gmail
    "gnail.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gmial.com": "gmail.com",
    "gmail.con": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.cm": "gmail.com",
    "gmail.om": "gmail.com",
    "gamil.com": "gmail.com",
    "gimail.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmailcom": "gmail.com",
    "g]mail.com": "gmail.com",
    "gmaill.com": "gmail.com",
    "gmaul.com": "gmail.com",
    "gemail.com": "gmail.com",
    "email.com": "gmail.com",

    // Typos comuns do Hotmail
    "hotmal.com": "hotmail.com",
    "hotmeil.com": "hotmail.com",
    "hotmil.com": "hotmail.com",
    "hotmail.con": "hotmail.com",
    "hotmail.co": "hotmail.com",
    "hotmail.cm": "hotmail.com",
    "hotmaill.com": "hotmail.com",
    "hitmail.com": "hotmail.com",
    "hotemail.com": "hotmail.com",
    "homail.com": "hotmail.com",
    "hotmial.com": "hotmail.com",
    "hotmaul.com": "hotmail.com",
    "hotamil.com": "hotmail.com",

    // Typos comuns do Outlook
    "outlok.com": "outlook.com",
    "outlock.com": "outlook.com",
    "outlook.con": "outlook.com",
    "outlook.co": "outlook.com",
    "outlook.cm": "outlook.com",
    "outllook.com": "outlook.com",
    "outlool.com": "outlook.com",
    "outloo.com": "outlook.com",
    "otlook.com": "outlook.com",

    // Typos comuns do Yahoo
    "yaho.com": "yahoo.com",
    "yahooo.com": "yahoo.com",
    "yahoo.con": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "yahoo.cm": "yahoo.com",
    "yhaoo.com": "yahoo.com",
    "yaoo.com": "yahoo.com",
    "yhoo.com": "yahoo.com",
    "yaoho.com": "yahoo.com",

    // Typos comuns do iCloud
    "icloud.con": "icloud.com",
    "icloud.co": "icloud.com",
    "icoud.com": "icloud.com",
    "iclud.com": "icloud.com",
    "iclould.com": "icloud.com",

    // Typos comuns do Live
    "live.con": "live.com",
    "live.co": "live.com",
    "llive.com": "live.com",

    // Typos .coml (dedo escorregando no L)
    "gmail.coml": "gmail.com",
    "hotmail.coml": "hotmail.com",
    "outlook.coml": "outlook.com",
    "yahoo.coml": "yahoo.com",
    "icloud.coml": "icloud.com",
    "live.coml": "live.com",

    // Typos .comm (L duplo)
    "gmail.comm": "gmail.com",
    "hotmail.comm": "hotmail.com",
    "outlook.comm": "outlook.com",
    "yahoo.comm": "yahoo.com",

    // UOL Brasil
    "uol.com": "uol.com.br",
    "bol.com": "bol.com.br",
};

/**
 * Normalizes an email address by:
 * 1. Converting to lowercase
 * 2. Trimming whitespace
 * 3. Fixing common domain typos
 *
 * @param email - The email address to normalize
 * @returns The normalized email address
 */
export function normalizeEmail(email: string): string {
    // Lowercase and trim
    let normalized = email.toLowerCase().trim();

    // Remove any spaces within the email (common copy/paste issue)
    normalized = normalized.replace(/\s+/g, "");

    // Extract domain
    const atIndex = normalized.lastIndexOf("@");
    if (atIndex === -1) return normalized;

    const localPart = normalized.slice(0, atIndex);
    let domain = normalized.slice(atIndex + 1);

    // Fix domain if there's a known typo
    const correction = DOMAIN_CORRECTIONS[domain];
    if (correction) {
        domain = correction;
    }

    // Common typo: accidental trailing chars after ".com" (e.g., .coma, .comb, .comi, .combr)
    // Keep this conservative (1-2 chars) to avoid changing valid TLDs like ".community".
    if (/\.com[a-z]{1,2}$/.test(domain)) {
        domain = domain.replace(/\.com[a-z]{1,2}$/, ".com");
    }

    return `${localPart}@${domain}`;
}
