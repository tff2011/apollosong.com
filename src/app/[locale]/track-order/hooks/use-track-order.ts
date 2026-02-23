"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, type RouterOutputs } from "~/trpc/react";
import { normalizeEmail } from "~/lib/normalize-email";

export type TrackOrder = RouterOutputs["songOrder"]["getByEmail"][number];
export type TrackOrderChild = NonNullable<TrackOrder["childOrders"]>[number];
export type TabId = "orders" | "listen" | "extras" | "help";
export type SearchMode = "email" | "phone";

export function useTrackOrder() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [searchMode, setSearchMode] = useState<SearchMode>("email");
    const [inputValue, setInputValue] = useState("");
    const [searchedEmail, setSearchedEmail] = useState<string | null>(null);
    const [searchedPhone, setSearchedPhone] = useState<string | null>(null);
    const [initializedFromUrl, setInitializedFromUrl] = useState(false);
    const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [revisionModalOrderId, setRevisionModalOrderId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>("orders");

    // Auto-fill from URL parameter and trigger search
    useEffect(() => {
        if (initializedFromUrl) return;

        const emailParam = searchParams.get("email");
        const phoneParam = searchParams.get("phone");
        if (emailParam) {
            const decodedEmail = normalizeEmail(decodeURIComponent(emailParam));
            setSearchMode("email");
            setInputValue(decodedEmail);
            setSearchedEmail(decodedEmail);
            setInitializedFromUrl(true);
        } else if (phoneParam) {
            const decodedPhone = decodeURIComponent(phoneParam);
            setSearchMode("phone");
            setInputValue(decodedPhone);
            setSearchedPhone(decodedPhone);
            setInitializedFromUrl(true);
        }
    }, [searchParams, initializedFromUrl]);

    const {
        data: emailOrders,
        isLoading: isLoadingEmail,
        isFetching: isFetchingEmail,
        refetch: refetchEmail,
    } = api.songOrder.getByEmail.useQuery(
        { email: searchedEmail! },
        {
            enabled: !!searchedEmail,
            retry: false,
            staleTime: 60 * 1000,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        }
    );

    const {
        data: phoneOrders,
        isLoading: isLoadingPhone,
        isFetching: isFetchingPhone,
        refetch: refetchPhone,
    } = api.songOrder.getByPhone.useQuery(
        { phone: searchedPhone! },
        {
            enabled: !!searchedPhone,
            retry: false,
            staleTime: 60 * 1000,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        }
    );

    const orders = searchMode === "email" ? emailOrders : phoneOrders;
    const isLoading = searchMode === "email" ? isLoadingEmail : isLoadingPhone;
    const isFetching = searchMode === "email" ? isFetchingEmail : isFetchingPhone;
    const refetch = searchMode === "email" ? refetchEmail : refetchPhone;

    const ordersList = (orders ?? []) as TrackOrder[];

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim()) {
            setCurrentOrderIndex(0);
            setActiveTab("orders");
            const params = new URLSearchParams(searchParams.toString());

            if (searchMode === "email") {
                const normalizedEmail = normalizeEmail(inputValue);
                setSearchedEmail(normalizedEmail);
                setSearchedPhone(null);
                params.delete("phone");
                params.set("email", normalizedEmail);
            } else {
                setSearchedPhone(inputValue.trim());
                setSearchedEmail(null);
                params.delete("email");
                params.set("phone", inputValue.trim());
            }

            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
    }, [inputValue, searchMode, pathname, router, searchParams]);

    const handleCopy = useCallback((text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }, []);

    const handleReset = useCallback(() => {
        setInputValue("");
        setSearchedEmail(null);
        setSearchedPhone(null);
        setCurrentOrderIndex(0);
        setActiveTab("orders");
        const params = new URLSearchParams(searchParams.toString());
        params.delete("email");
        params.delete("phone");
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.replace(newUrl, { scroll: false });
    }, [pathname, router, searchParams]);

    const handleSearchModeChange = useCallback((mode: SearchMode) => {
        setSearchMode(mode);
        setInputValue("");
    }, []);

    const searchedValue = searchMode === "email" ? searchedEmail : searchedPhone;
    const hasSearched = searchedValue !== null;
    const hasOrders = ordersList.length > 0;
    const showNotFound = hasSearched && !isLoading && !hasOrders;
    const showResults = hasSearched && !isLoading && hasOrders;
    const currentOrder = ordersList[currentOrderIndex] ?? null;

    return {
        // State
        email: inputValue, // keep backward compat name for track-order-page
        setEmail: setInputValue,
        searchedEmail: searchedValue, // used in compact bar display
        searchMode,
        setSearchMode: handleSearchModeChange,
        ordersList,
        currentOrderIndex,
        setCurrentOrderIndex,
        currentOrder,
        copiedId,
        revisionModalOrderId,
        setRevisionModalOrderId,
        activeTab,
        setActiveTab,

        // Flags
        isLoading,
        isFetching,
        hasSearched,
        hasOrders,
        showNotFound,
        showResults,

        // Actions
        handleSubmit,
        handleCopy,
        handleReset,
        refetch,
    };
}
