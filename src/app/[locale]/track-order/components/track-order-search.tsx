"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Mail, Phone, ChevronDown, X } from "lucide-react";
import { cn } from "~/lib/utils";
import type { SearchMode } from "../hooks/use-track-order";

interface TrackOrderSearchProps {
    email: string;
    onEmailChange: (email: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onReset?: () => void;
    isLoading: boolean;
    isCompact?: boolean;
    searchedEmail?: string | null;
    searchMode: SearchMode;
    onSearchModeChange: (mode: SearchMode) => void;
    translations: {
        title: string;
        subtitle: string;
        placeholder: string;
        phonePlaceholder: string;
        submit: string;
        searching: string;
        searchAnother?: string;
        searchByEmail: string;
        searchByPhone: string;
        searchHint: string;
    };
}

export function TrackOrderSearch({
    email,
    onEmailChange,
    onSubmit,
    onReset,
    isLoading,
    isCompact = false,
    searchedEmail,
    searchMode,
    onSearchModeChange,
    translations,
}: TrackOrderSearchProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const inputIcon = searchMode === "email"
        ? <Mail className="w-4 h-4 text-charcoal/40" />
        : <Phone className="w-4 h-4 text-charcoal/40" />;

    const displayIcon = searchMode === "email"
        ? <Mail className="w-4 h-4 text-charcoal/50 flex-shrink-0" />
        : <Phone className="w-4 h-4 text-charcoal/50 flex-shrink-0" />;

    const placeholder = searchMode === "email" ? translations.placeholder : translations.phonePlaceholder;
    const inputType = searchMode === "email" ? "email" : "tel";

    // Compact mode: show small bar with email/phone
    if (isCompact && searchedEmail) {
        return (
            <section className="py-4 border-b border-charcoal/10 bg-white/50 sticky top-0 z-40 backdrop-blur-sm">
                <div className="container mx-auto px-4">
                    <div className="max-w-5xl mx-auto">
                        <AnimatePresence mode="wait">
                            {isExpanded ? (
                                <motion.div
                                    key="expanded"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <button
                                            type="button"
                                            onClick={() => onSearchModeChange("email")}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                                searchMode === "email"
                                                    ? "bg-[#4A8E9A] text-dark"
                                                    : "bg-charcoal/5 text-charcoal/60 hover:bg-charcoal/10"
                                            )}
                                        >
                                            <Mail className="w-3.5 h-3.5" />
                                            {translations.searchByEmail}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onSearchModeChange("phone")}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                                searchMode === "phone"
                                                    ? "bg-[#4A8E9A] text-dark"
                                                    : "bg-charcoal/5 text-charcoal/60 hover:bg-charcoal/10"
                                            )}
                                        >
                                            <Phone className="w-3.5 h-3.5" />
                                            {translations.searchByPhone}
                                        </button>
                                    </div>
                                    <form onSubmit={(e) => { onSubmit(e); setIsExpanded(false); }} className="flex items-center gap-3">
                                        <div className="relative flex-1">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                                {inputIcon}
                                            </div>
                                            <input
                                                type={inputType}
                                                value={email}
                                                onChange={(e) => onEmailChange(e.target.value)}
                                                placeholder={placeholder}
                                                required
                                                autoFocus
                                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-charcoal/20 focus:border-[#4A8E9A] focus:ring-0 focus:outline-none transition-colors text-charcoal"
                                            />
                                        </div>
                                        <motion.button
                                            whileTap={{ scale: 0.95 }}
                                            type="submit"
                                            disabled={isLoading}
                                            className={cn(
                                                "flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-medium transition-all min-h-[44px]",
                                                isLoading
                                                    ? "bg-[#4A8E9A]/70 cursor-not-allowed"
                                                    : "bg-[#4A8E9A] hover:bg-[#F0EDE6]"
                                            )}
                                        >
                                            {isLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Search className="w-4 h-4" />
                                            )}
                                            <span className="hidden sm:inline">{isLoading ? translations.searching : translations.submit}</span>
                                        </motion.button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsExpanded(false);
                                                onEmailChange("");
                                                onReset?.();
                                            }}
                                            className="p-2 text-charcoal/50 hover:text-charcoal transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </form>
                                </motion.div>
                            ) : (
                                <motion.button
                                    key="collapsed"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setIsExpanded(true)}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-charcoal/5 hover:bg-charcoal/10 transition-colors group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {displayIcon}
                                        <span className="text-sm text-charcoal truncate">
                                            {searchedEmail}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[#1A1A2E] text-sm font-medium flex-shrink-0">
                                        <span className="hidden sm:inline">{translations.searchAnother || "Buscar outro"}</span>
                                        <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                                    </div>
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </section>
        );
    }

    // Full mode: show complete search form
    return (
        <>
            {/* Hero Section */}
            <section className="py-8 md:py-12">
                <div className="container mx-auto px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-2xl mx-auto text-center"
                    >
                        <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal">
                            {translations.title}
                        </h1>
                        <p
                            className="mt-3 text-lg text-charcoal/70"
                            dangerouslySetInnerHTML={{
                                __html: translations.subtitle
                                    .replace(/<b>/g, '<b class="font-semibold text-charcoal">')
                                    .replace(/<\/b>/g, "</b>"),
                            }}
                        />
                    </motion.div>
                </div>
            </section>

            {/* Search Form */}
            <section className="pb-12">
                <div className="container mx-auto px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="max-w-md mx-auto"
                    >
                        <div className="bg-white rounded-3xl p-8 shadow-lg border border-charcoal/10">
                            {/* Mode toggle */}
                            <div className="flex items-center gap-2 mb-5">
                                <button
                                    type="button"
                                    onClick={() => onSearchModeChange("email")}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
                                        searchMode === "email"
                                            ? "bg-[#4A8E9A] text-dark"
                                            : "bg-charcoal/5 text-charcoal/60 hover:bg-charcoal/10"
                                    )}
                                >
                                    <Mail className="w-4 h-4" />
                                    {translations.searchByEmail}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onSearchModeChange("phone")}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
                                        searchMode === "phone"
                                            ? "bg-[#4A8E9A] text-dark"
                                            : "bg-charcoal/5 text-charcoal/60 hover:bg-charcoal/10"
                                    )}
                                >
                                    <Phone className="w-4 h-4" />
                                    {translations.searchByPhone}
                                </button>
                            </div>

                            <form onSubmit={onSubmit} className="space-y-4">
                                <div className="relative">
                                    <input
                                        type={inputType}
                                        value={email}
                                        onChange={(e) => onEmailChange(e.target.value)}
                                        placeholder={placeholder}
                                        required
                                        className="w-full px-4 py-4 rounded-xl border-2 border-charcoal/20 focus:border-[#4A8E9A] focus:ring-0 focus:outline-none transition-colors text-charcoal text-lg"
                                    />
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    type="submit"
                                    disabled={isLoading}
                                    className={cn(
                                        "w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-white font-semibold text-lg transition-all min-h-[56px]",
                                        isLoading
                                            ? "bg-[#4A8E9A]/70 cursor-not-allowed"
                                            : "bg-[#4A8E9A] hover:bg-[#F0EDE6] active:scale-[0.99]"
                                    )}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            {translations.searching}
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-5 h-5" />
                                            {translations.submit}
                                        </>
                                    )}
                                </motion.button>
                            </form>
                        </div>
                        <p
                            className="mt-3 text-center text-sm text-charcoal/50"
                            dangerouslySetInnerHTML={{
                                __html: translations.searchHint
                                    .replace(/<b>/g, '<b class="font-semibold text-charcoal">')
                                    .replace(/<\/b>/g, "</b>"),
                            }}
                        />
                    </motion.div>
                </div>
            </section>
        </>
    );
}
