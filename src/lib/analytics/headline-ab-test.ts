export const HEADLINE_AB_EXPERIMENT_KEY = "home_headline_expression_vs_emotion_v2";
export const HEADLINE_AB_QUERY_PARAM = "ab_headline_variant";

const HEADLINE_AB_LOCAL_STORAGE_KEY = "ab_headline_variant_v2";
const HEADLINE_AB_SESSION_STORAGE_KEY = "ab_headline_variant_v2";
const HEADLINE_AB_COOKIE_KEY = "ab_headline_variant_v2";
const HEADLINE_AB_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const HEADLINE_AB_VARIANTS = ["A", "B"] as const;

export type HeadlineAbVariant = (typeof HEADLINE_AB_VARIANTS)[number];

export function normalizeHeadlineAbVariant(value: string | null | undefined): HeadlineAbVariant | undefined {
    if (!value) return undefined;
    if ((HEADLINE_AB_VARIANTS as readonly string[]).includes(value)) {
        return value as HeadlineAbVariant;
    }
    return undefined;
}

export function getStoredHeadlineAbVariant(): HeadlineAbVariant | undefined {
    if (typeof window === "undefined") return undefined;

    const sessionVariant = normalizeHeadlineAbVariant(
        window.sessionStorage.getItem(HEADLINE_AB_SESSION_STORAGE_KEY)
    );
    if (sessionVariant) return sessionVariant;

    const localVariant = normalizeHeadlineAbVariant(
        window.localStorage.getItem(HEADLINE_AB_LOCAL_STORAGE_KEY)
    );
    if (localVariant) return localVariant;

    const cookieVariant = normalizeHeadlineAbVariant(readCookieValue(HEADLINE_AB_COOKIE_KEY));
    if (cookieVariant) return cookieVariant;

    return undefined;
}

export function persistHeadlineAbVariant(variant: HeadlineAbVariant): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    try {
        window.sessionStorage.setItem(HEADLINE_AB_SESSION_STORAGE_KEY, variant);
    } catch {
        // Ignore storage errors
    }

    try {
        window.localStorage.setItem(HEADLINE_AB_LOCAL_STORAGE_KEY, variant);
    } catch {
        // Ignore storage errors
    }

    document.cookie = `${HEADLINE_AB_COOKIE_KEY}=${variant}; path=/; max-age=${HEADLINE_AB_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function getOrAssignHeadlineAbVariant(): HeadlineAbVariant {
    const existing = getStoredHeadlineAbVariant();
    if (existing) {
        persistHeadlineAbVariant(existing);
        return existing;
    }

    const assigned: HeadlineAbVariant = Math.random() < 0.5 ? "A" : "B";
    persistHeadlineAbVariant(assigned);
    return assigned;
}

function readCookieValue(name: string): string | undefined {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
