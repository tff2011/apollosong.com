"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function TikTokPageViewTracker() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const hasMounted = useRef(false);
    const search = searchParams?.toString() ?? "";

    useEffect(() => {
        if (!hasMounted.current) {
            hasMounted.current = true;
            return;
        }

        window.ttq?.page?.();
    }, [pathname, search]);

    return null;
}
