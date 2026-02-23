export type UtmDetails = {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    fbc?: string;
    fbp?: string;
};

const STORAGE_KEY = "utm-data";

export function getStoredUtm(): UtmDetails {
    if (typeof window === "undefined") return {};

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored ? (JSON.parse(stored) as UtmDetails) : {};
    } catch {
        return {};
    }
}

export function setStoredUtm(data: UtmDetails): void {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Ignore storage errors (e.g. privacy mode)
    }
}

export function getCookieValue(name: string): string | undefined {
    if (typeof document === "undefined") return undefined;

    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    const value = match?.[1];
    return value ? decodeURIComponent(value) : undefined;
}
