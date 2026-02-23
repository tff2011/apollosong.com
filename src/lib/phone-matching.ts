/**
 * Normalize a phone-like input to digits only.
 */
export function normalizePhoneDigits(phone: string): string {
    return phone.replace(/\D/g, "");
}

/**
 * Brazilian mobile numbers: insert the 9th digit after DDD.
 * Supports both with country code (55) and local format.
 */
export function insertBrazilian9(phone: string): string {
    const digits = normalizePhoneDigits(phone);

    if (digits.startsWith("55") && digits.length === 12) {
        return digits.slice(0, 4) + "9" + digits.slice(4);
    }

    if (!digits.startsWith("55") && digits.length === 10) {
        return digits.slice(0, 2) + "9" + digits.slice(2);
    }

    return digits;
}

/**
 * Brazilian mobile numbers: remove the 9th digit after DDD.
 * Supports both with country code (55) and local format.
 */
export function removeBrazilian9(phone: string): string {
    const digits = normalizePhoneDigits(phone);

    if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
        return digits.slice(0, 4) + digits.slice(5);
    }

    if (!digits.startsWith("55") && digits.length === 11 && digits[2] === "9") {
        return digits.slice(0, 2) + digits.slice(3);
    }

    return digits;
}

/**
 * Build normalized search candidates for a phone number:
 * - as provided (digits only)
 * - with/without country code (55)
 * - with/without Brazilian mobile 9th digit
 */
export function buildPhoneCandidates(rawPhone: string): Set<string> {
    const digits = normalizePhoneDigits(rawPhone);
    const candidates = new Set<string>();

    if (!digits) return candidates;

    candidates.add(digits);
    candidates.add(insertBrazilian9(digits));
    candidates.add(removeBrazilian9(digits));

    if (digits.startsWith("55")) {
        const local = digits.slice(2);
        if (local) {
            candidates.add(local);
            candidates.add(insertBrazilian9(local));
            candidates.add(removeBrazilian9(local));
        }
    } else if (digits.length >= 10 && digits.length <= 11) {
        const withCountry = `55${digits}`;
        candidates.add(withCountry);
        candidates.add(insertBrazilian9(withCountry));
        candidates.add(removeBrazilian9(withCountry));
    }

    return candidates;
}

/**
 * True when two phone values represent the same number under supported normalizations.
 */
export function phonesLikelyMatch(a: string, b: string): boolean {
    const aCandidates = buildPhoneCandidates(a);
    const bCandidates = buildPhoneCandidates(b);

    if (aCandidates.size === 0 || bCandidates.size === 0) return false;

    for (const candidate of aCandidates) {
        if (bCandidates.has(candidate)) {
            return true;
        }
    }

    return false;
}
