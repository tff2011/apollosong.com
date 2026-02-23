"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import {
    getCookieValue,
    getStoredUtm,
    setStoredUtm,
    type UtmDetails,
} from "~/lib/analytics/utm-tracking";

const UTM_PARAMS: Array<[string, keyof UtmDetails]> = [
    ["utm_source", "utmSource"],
    ["utm_medium", "utmMedium"],
    ["utm_campaign", "utmCampaign"],
    ["utm_content", "utmContent"],
    ["utm_term", "utmTerm"],
];

export default function UtmTracker() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const stored = getStoredUtm();
        let updated = false;

        for (const [param, key] of UTM_PARAMS) {
            const value = searchParams.get(param);
            if (value) {
                stored[key] = value;
                updated = true;
            }
        }

        const fbclid = searchParams.get("fbclid");
        if (fbclid) {
            const fbc = `fb.1.${Date.now()}.${fbclid}`;
            stored.fbc = fbc;
            document.cookie = `_fbc=${fbc}; path=/; max-age=7776000; SameSite=Lax`;
            updated = true;
        } else {
            const fbcCookie = getCookieValue("_fbc");
            if (fbcCookie && stored.fbc !== fbcCookie) {
                stored.fbc = fbcCookie;
                updated = true;
            }
        }

        const fbpCookie = getCookieValue("_fbp");
        if (fbpCookie && stored.fbp !== fbpCookie) {
            stored.fbp = fbpCookie;
            updated = true;
        }

        if (updated) {
            setStoredUtm(stored);
        }
    }, [searchParams]);

    return null;
}
