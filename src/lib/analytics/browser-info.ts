import type {
    BrowserInfo,
    TrafficSource,
    SessionAnalytics,
} from "~/lib/validations/song-order";
import { getCookieValue, getStoredUtm } from "~/lib/analytics/utm-tracking";
import {
    HEADLINE_AB_QUERY_PARAM,
    getStoredHeadlineAbVariant,
    normalizeHeadlineAbVariant,
    persistHeadlineAbVariant,
} from "~/lib/analytics/headline-ab-test";

/**
 * Collect browser and device information
 */
export function collectBrowserInfo(): BrowserInfo {
    if (typeof window === "undefined") return {};

    const ua = navigator.userAgent;

    // Parse user agent for browser/OS info
    const browserInfo = parseBrowserInfo(ua);
    const osInfo = parseOSInfo(ua);
    const deviceType = detectDeviceType();

    return {
        userAgent: ua,
        browserName: browserInfo.name,
        browserVersion: browserInfo.version,
        osName: osInfo.name,
        osVersion: osInfo.version,
        deviceType,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio,
        touchSupport: "ontouchstart" in window || navigator.maxTouchPoints > 0,
        language: navigator.language,
        languages: [...navigator.languages],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
    };
}

/**
 * Collect traffic source information (UTM params, referrer)
 */
export function collectTrafficSource(): TrafficSource {
    if (typeof window === "undefined") return {};

    const url = new URL(window.location.href);
    const referrer = document.referrer;
    const storedUtm = getStoredUtm();

    let referrerDomain: string | undefined;
    if (referrer) {
        try {
            referrerDomain = new URL(referrer).hostname;
        } catch {
            // Invalid referrer URL
        }
    }

    // Also check sessionStorage for UTM params (in case they arrived on a different page)
    const storedUtmSource =
        sessionStorage.getItem("utm_source") ||
        url.searchParams.get("utm_source") ||
        storedUtm.utmSource;
    const storedUtmMedium =
        sessionStorage.getItem("utm_medium") ||
        url.searchParams.get("utm_medium") ||
        storedUtm.utmMedium;
    const storedUtmCampaign =
        sessionStorage.getItem("utm_campaign") ||
        url.searchParams.get("utm_campaign") ||
        storedUtm.utmCampaign;
    const storedUtmTerm =
        sessionStorage.getItem("utm_term") ||
        url.searchParams.get("utm_term") ||
        storedUtm.utmTerm;
    const storedUtmContent =
        sessionStorage.getItem("utm_content") ||
        url.searchParams.get("utm_content") ||
        storedUtm.utmContent;

    const fbc = storedUtm.fbc || getCookieValue("_fbc");
    const fbp = storedUtm.fbp || getCookieValue("_fbp");
    const abHeadlineVariant =
        normalizeHeadlineAbVariant(url.searchParams.get(HEADLINE_AB_QUERY_PARAM)) ??
        getStoredHeadlineAbVariant();
    if (abHeadlineVariant) {
        persistHeadlineAbVariant(abHeadlineVariant);
    }

    const rawLandingPage =
        sessionStorage.getItem("landingPage") ||
        `${window.location.pathname}${window.location.search}`;
    const landingPage = appendHeadlineVariantToLandingPage(
        rawLandingPage,
        abHeadlineVariant
    );

    return {
        referrer: referrer || undefined,
        referrerDomain,
        utmSource: storedUtmSource || undefined,
        utmMedium: storedUtmMedium || undefined,
        utmCampaign: storedUtmCampaign || undefined,
        utmTerm: storedUtmTerm || undefined,
        utmContent: storedUtmContent || undefined,
        fbc: fbc || undefined,
        fbp: fbp || undefined,
        landingPage,
        abHeadlineVariant,
    };
}

/**
 * Collect session analytics
 */
export function collectSessionAnalytics(
    quizStartTime: Date
): SessionAnalytics {
    if (typeof window === "undefined") return {};

    const now = new Date();

    // Get or create session ID
    let sessionId = sessionStorage.getItem("sessionId");
    if (!sessionId) {
        sessionId = generateSessionId();
        sessionStorage.setItem("sessionId", sessionId);
    }

    // Get page view count
    const pageViewCount = parseInt(
        sessionStorage.getItem("pageViewCount") || "1",
        10
    );

    // Get session start time
    const sessionStartStr = sessionStorage.getItem("sessionStart");
    const sessionStart = sessionStartStr ? new Date(sessionStartStr) : now;
    const timeOnSiteMs = now.getTime() - sessionStart.getTime();

    return {
        sessionId,
        pageViewCount,
        timeOnSiteMs,
        quizStartedAt: quizStartTime.toISOString(),
        quizCompletedAt: now.toISOString(),
        quizDurationMs: now.getTime() - quizStartTime.getTime(),
    };
}

// ============= Helper Functions =============

function parseBrowserInfo(ua: string): { name?: string; version?: string } {
    const browsers = [
        { name: "Chrome", regex: /Chrome\/(\d+\.?\d*)/ },
        { name: "Firefox", regex: /Firefox\/(\d+\.?\d*)/ },
        { name: "Safari", regex: /Version\/(\d+\.?\d*).*Safari/ },
        { name: "Edge", regex: /Edg\/(\d+\.?\d*)/ },
        { name: "Opera", regex: /OPR\/(\d+\.?\d*)/ },
    ];

    for (const browser of browsers) {
        const match = ua.match(browser.regex);
        if (match) {
            return { name: browser.name, version: match[1] };
        }
    }

    return {};
}

function parseOSInfo(ua: string): { name?: string; version?: string } {
    if (/Windows NT 10/.test(ua)) return { name: "Windows", version: "10" };
    if (/Windows NT 11/.test(ua)) return { name: "Windows", version: "11" };
    if (/Windows NT 6.3/.test(ua)) return { name: "Windows", version: "8.1" };
    if (/Mac OS X (\d+[._]\d+)/.test(ua)) {
        const match = ua.match(/Mac OS X (\d+[._]\d+)/);
        return { name: "macOS", version: match?.[1]?.replace("_", ".") };
    }
    if (/iPhone OS (\d+_\d+)/.test(ua)) {
        const match = ua.match(/iPhone OS (\d+_\d+)/);
        return { name: "iOS", version: match?.[1]?.replace("_", ".") };
    }
    if (/Android (\d+\.?\d*)/.test(ua)) {
        const match = ua.match(/Android (\d+\.?\d*)/);
        return { name: "Android", version: match?.[1] };
    }
    if (/Linux/.test(ua)) return { name: "Linux" };

    return {};
}

function detectDeviceType(): "desktop" | "mobile" | "tablet" {
    if (typeof window === "undefined") return "desktop";

    const ua = navigator.userAgent;

    // Check for tablets first
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) {
        return "tablet";
    }

    // Check for mobile
    if (
        /Mobile|iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
            ua
        )
    ) {
        return "mobile";
    }

    // Also check screen width as fallback
    if (window.innerWidth < 768) {
        return "mobile";
    }
    if (window.innerWidth < 1024) {
        return "tablet";
    }

    return "desktop";
}

function generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Initialize session tracking (call this on app mount or page load)
 * This stores UTM params and landing page for later retrieval
 */
export function initSessionTracking(): void {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const abVariantFromUrl = normalizeHeadlineAbVariant(
        url.searchParams.get(HEADLINE_AB_QUERY_PARAM)
    );
    const abVariant = abVariantFromUrl ?? getStoredHeadlineAbVariant();
    if (abVariant) {
        persistHeadlineAbVariant(abVariant);
    }

    // Set landing page if not already set
    if (!sessionStorage.getItem("landingPage")) {
        const firstLandingPage = appendHeadlineVariantToLandingPage(
            window.location.pathname + window.location.search,
            abVariant
        );
        sessionStorage.setItem(
            "landingPage",
            firstLandingPage || (window.location.pathname + window.location.search)
        );
    }

    // Set session start if not already set
    if (!sessionStorage.getItem("sessionStart")) {
        sessionStorage.setItem("sessionStart", new Date().toISOString());
    }

    // Store UTM params if present
    const utmParams = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
    ];
    for (const param of utmParams) {
        const value = url.searchParams.get(param);
        if (value && !sessionStorage.getItem(param)) {
            sessionStorage.setItem(param, value);
        }
    }

    // Increment page view count
    const currentCount = parseInt(
        sessionStorage.getItem("pageViewCount") || "0",
        10
    );
    sessionStorage.setItem("pageViewCount", String(currentCount + 1));

    // Generate session ID if not exists
    if (!sessionStorage.getItem("sessionId")) {
        sessionStorage.setItem("sessionId", generateSessionId());
    }
}

function appendHeadlineVariantToLandingPage(
    landingPage: string | undefined,
    variant: string | undefined
): string | undefined {
    if (!landingPage) return undefined;

    const normalizedVariant = normalizeHeadlineAbVariant(variant);
    if (!normalizedVariant) return landingPage;

    try {
        const parsed = new URL(landingPage, window.location.origin);
        const existingVariant = normalizeHeadlineAbVariant(
            parsed.searchParams.get(HEADLINE_AB_QUERY_PARAM)
        );
        if (!existingVariant) {
            parsed.searchParams.set(HEADLINE_AB_QUERY_PARAM, normalizedVariant);
        }
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return landingPage;
    }
}
