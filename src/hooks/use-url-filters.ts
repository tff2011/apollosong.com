"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

type FilterValue = string | number | Date | undefined;

export function useUrlFilters<T extends Record<string, FilterValue>>(defaultValues: T) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const filters = useMemo(() => {
        const params = { ...defaultValues } as Record<string, FilterValue>;

        searchParams.forEach((value, key) => {
            if (key in defaultValues) {
                const defaultVal = defaultValues[key];
                if (typeof defaultVal === "number") {
                    params[key] = parseInt(value, 10);
                } else if (defaultVal instanceof Date || key.toLowerCase().includes("date")) {
                    params[key] = new Date(value);
                } else {
                    params[key] = value;
                }
            }
        });

        return params as T;
    }, [searchParams, defaultValues]);

    const setFilters = useCallback(
        (newFilters: Partial<T>, resetPage = true) => {
            const params = new URLSearchParams(searchParams.toString());

            Object.entries(newFilters).forEach(([key, value]) => {
                if (value === undefined || value === "" || value === defaultValues[key]) {
                    params.delete(key);
                } else if (value instanceof Date) {
                    params.set(key, value.toISOString());
                } else {
                    params.set(key, String(value));
                }
            });

            // Reset to page 1 when filters change (except when changing page itself)
            if (resetPage && !("page" in newFilters)) {
                params.set("page", "1");
            }

            router.push(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [searchParams, router, pathname, defaultValues]
    );

    const resetFilters = useCallback(() => {
        router.push(pathname, { scroll: false });
    }, [router, pathname]);

    return { filters, setFilters, resetFilters };
}
