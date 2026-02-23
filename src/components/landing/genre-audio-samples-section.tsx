"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "~/i18n/provider";
import { type Locale } from "~/i18n/config";
import { WhatsappAudioPlayer } from "~/components/ui/whatsapp-audio-player";
import { cn } from "~/lib/utils";
import { getGenreAudioEntries, getGenreDisplayName } from "~/lib/genre-audio";
import { Search, Music, X, PlayCircle, Sparkles, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Button } from "~/components/ui/button";

type GenreAudioSample = {
    genre: string;
    audioUrl: string;
    vocals: string;
};

type VocalsFilter = "male" | "female";

/* ─── Animated Background Waves ─── */
function MusicWaves() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <svg
                className="absolute bottom-0 w-[200%] h-40 text-aegean opacity-[0.06] animate-wave-drift"
                viewBox="0 0 2880 160"
                preserveAspectRatio="none"
            >
                <path
                    d="M0,80 Q180,30 360,80 Q540,130 720,80 Q900,30 1080,80 Q1260,130 1440,80 Q1620,30 1800,80 Q1980,130 2160,80 Q2340,30 2520,80 Q2700,130 2880,80"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                />
            </svg>
            <svg
                className="absolute bottom-8 w-[200%] h-32 text-aegean opacity-[0.04] animate-wave-drift"
                style={{ animationDuration: "15s", animationDirection: "reverse" }}
                viewBox="0 0 2880 128"
                preserveAspectRatio="none"
            >
                <path
                    d="M0,64 Q360,20 720,64 Q1080,108 1440,64 Q1800,20 2160,64 Q2520,108 2880,64"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                />
            </svg>
            <svg
                className="absolute top-1/4 w-[200%] h-24 text-aegean opacity-[0.03] animate-wave-drift"
                style={{ animationDuration: "30s" }}
                viewBox="0 0 2880 96"
                preserveAspectRatio="none"
            >
                <path
                    d="M0,48 Q720,10 1440,48 Q2160,86 2880,48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                />
            </svg>
            <svg
                className="absolute top-0 w-[200%] h-48 text-aegean opacity-[0.015] animate-wave-drift"
                style={{ animationDuration: "25s", animationDirection: "reverse" }}
                viewBox="0 0 2880 192"
                preserveAspectRatio="none"
            >
                <path
                    d="M0,96 Q480,40 960,96 Q1440,152 1920,96 Q2400,40 2880,96 L2880,192 L0,192 Z"
                    fill="currentColor"
                />
            </svg>
        </div>
    );
}

/* ─── Equalizer Bars ─── */
function EqualizerBars({
    className,
    barCount = 5,
    size = "md",
    color = "bg-aegean",
}: {
    className?: string;
    barCount?: number;
    size?: "sm" | "md" | "lg";
    color?: string;
}) {
    const eqClasses = ["animate-eq-1", "animate-eq-2", "animate-eq-3", "animate-eq-4", "animate-eq-5"];
    const heights = { sm: "h-3", md: "h-5", lg: "h-8" };
    const widths = { sm: "w-[2px]", md: "w-[3px]", lg: "w-1" };
    const gaps = { sm: "gap-[2px]", md: "gap-[3px]", lg: "gap-1" };

    return (
        <div className={cn("flex items-end", gaps[size], className)}>
            {Array.from({ length: barCount }).map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        widths[size],
                        heights[size],
                        color,
                        "rounded-full origin-bottom",
                        eqClasses[i % eqClasses.length]
                    )}
                />
            ))}
        </div>
    );
}

/* ─── Genre Card for Slider ─── */
function GenreCard({
    entry,
    displayName,
    parentLabel,
    audioUrl,
    missingAudioText,
}: {
    entry: { id: string; parent?: string };
    displayName: string;
    parentLabel: string | null;
    audioUrl: string | undefined;
    missingAudioText: string;
}) {
    const hasAudio = Boolean(audioUrl);

    return (
        <div
            className={cn(
                "group relative flex flex-col justify-end transition-all duration-700 overflow-hidden",
                "w-[280px] sm:w-[300px] md:w-[320px] flex-shrink-0",
                "aspect-[3/4] rounded-[1.5rem] border border-white/20 shadow-lg hover:shadow-2xl hover:shadow-aegean/15 bg-dark/5"
            )}
        >
            {/* Background Image */}
            <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
                <Image
                    src={`/images/genres/${entry.id}.webp`}
                    alt={displayName}
                    fill
                    sizes="320px"
                    className="object-cover transition-transform duration-1000 group-hover:scale-110"
                    onError={(e) => {
                        e.currentTarget.src = "/images/about-hero.webp";
                    }}
                />
            </div>

            {/* Gradient Overlays */}
            <div className="absolute inset-x-0 bottom-0 h-[75%] bg-gradient-to-t from-black/90 via-black/50 to-transparent z-10 transition-opacity duration-700 group-hover:h-[85%]" />
            <div className="absolute inset-0 bg-aegean/0 group-hover:bg-aegean/10 transition-colors duration-700 z-10 mix-blend-overlay" />

            <div className="relative z-20 flex flex-col justify-end h-full w-full p-5">
                {/* Top Right: Play + Equalizer */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    {hasAudio && (
                        <>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                <EqualizerBars barCount={4} size="sm" color="bg-white" />
                            </div>
                            <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500 shadow-lg border border-white/20">
                                <PlayCircle className="w-5 h-5 text-white" />
                            </div>
                        </>
                    )}
                </div>

                {/* Text Content */}
                <div className="mb-3 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                    {parentLabel && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-1 block drop-shadow-md">
                            {parentLabel}
                        </span>
                    )}
                    <h3 className="text-xl font-serif font-bold text-white group-hover:text-cream transition-colors duration-300 drop-shadow-xl leading-tight">
                        {displayName}
                    </h3>
                </div>

                {/* Audio Player */}
                <div className="w-full h-12 relative flex items-center">
                    {audioUrl ? (
                        <div className="w-full transform origin-bottom scale-95 opacity-80 group-hover:scale-100 group-hover:opacity-100 transition-all duration-500 backdrop-blur-md bg-black/30 rounded-full border border-white/10 p-0.5">
                            <div className="[&_.bg-porcelain]:!bg-transparent [&_text-dark]:!text-white [&_svg]:!text-white">
                                <WhatsappAudioPlayer src={audioUrl} compact />
                            </div>
                        </div>
                    ) : (
                        <div className="w-full rounded-full border border-white/10 bg-black/30 backdrop-blur-md px-4 py-2.5 text-center opacity-80">
                            <p className="text-[10px] tracking-widest uppercase text-white/50 font-semibold drop-shadow-md">
                                {missingAudioText}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Horizontal Slider with Scroll ─── */
function HorizontalSlider({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 10);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        checkScroll();
        el.addEventListener("scroll", checkScroll, { passive: true });
        const observer = new ResizeObserver(checkScroll);
        observer.observe(el);
        return () => {
            el.removeEventListener("scroll", checkScroll);
            observer.disconnect();
        };
    }, [checkScroll]);

    const scroll = (direction: "left" | "right") => {
        const el = scrollRef.current;
        if (!el) return;
        const cardWidth = 320 + 16; // card width + gap
        el.scrollBy({
            left: direction === "left" ? -cardWidth * 2 : cardWidth * 2,
            behavior: "smooth",
        });
    };

    return (
        <div className={cn("relative group/slider", className)}>
            {/* Left fade + arrow */}
            <div
                className={cn(
                    "absolute left-0 top-0 bottom-0 w-16 md:w-24 z-20 bg-gradient-to-r from-porcelain via-porcelain/80 to-transparent pointer-events-none transition-opacity duration-300",
                    canScrollLeft ? "opacity-100" : "opacity-0"
                )}
            />
            {canScrollLeft && (
                <button
                    onClick={() => scroll("left")}
                    className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border border-aegean/10 flex items-center justify-center text-dark/70 hover:text-aegean hover:border-aegean/30 hover:shadow-xl transition-all duration-300 opacity-0 group-hover/slider:opacity-100 md:opacity-80"
                    aria-label="Scroll left"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            )}

            {/* Scrollable track */}
            <div
                ref={scrollRef}
                className="flex gap-4 overflow-x-auto scrollbar-hide px-4 md:px-8 py-4 scroll-smooth snap-x snap-mandatory"
                style={{ WebkitOverflowScrolling: "touch" }}
            >
                {children}
            </div>

            {/* Right fade + arrow */}
            <div
                className={cn(
                    "absolute right-0 top-0 bottom-0 w-16 md:w-24 z-20 bg-gradient-to-l from-porcelain via-porcelain/80 to-transparent pointer-events-none transition-opacity duration-300",
                    canScrollRight ? "opacity-100" : "opacity-0"
                )}
            />
            {canScrollRight && (
                <button
                    onClick={() => scroll("right")}
                    className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border border-aegean/10 flex items-center justify-center text-dark/70 hover:text-aegean hover:border-aegean/30 hover:shadow-xl transition-all duration-300 opacity-0 group-hover/slider:opacity-100 md:opacity-80"
                    aria-label="Scroll right"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            )}
        </div>
    );
}

export function GenreAudioSamplesSection({ samples }: { samples: GenreAudioSample[] }) {
    const t = useTranslations("home.genreAudio");
    const locale = useLocale() as Locale;
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedVocals, setSelectedVocals] = useState<VocalsFilter>("male");
    const inputRef = useRef<HTMLInputElement>(null);

    const entries = useMemo(() => getGenreAudioEntries(locale), [locale]);

    const sampleMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const sample of samples) {
            map.set(`${sample.genre}:${sample.vocals}`, sample.audioUrl);
        }
        return map;
    }, [samples]);

    const getAudioUrl = (genre: string) => {
        return sampleMap.get(`${genre}:${selectedVocals}`);
    };

    // Filter only by search
    const filteredEntries = useMemo(() => {
        if (!searchQuery.trim()) return entries;
        const query = searchQuery.toLowerCase().trim();
        return entries.filter((entry) => {
            const displayName = getGenreDisplayName(entry.id, locale).toLowerCase();
            const parentName = entry.parent ? getGenreDisplayName(entry.parent, locale).toLowerCase() : "";
            return displayName.includes(query) || parentName.includes(query) || entry.id.toLowerCase().includes(query);
        });
    }, [entries, searchQuery, locale]);

    const clearSearch = () => {
        setSearchQuery("");
        inputRef.current?.focus();
    };

    const isSearching = searchQuery.trim().length > 0;

    return (
        <section className="py-20 md:py-28 bg-porcelain relative overflow-hidden">
            <MusicWaves />

            {/* Radial glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-aegean/5 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10">
                {/* Header */}
                <div className="text-center max-w-4xl mx-auto mb-10 md:mb-14 px-4 space-y-5">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-aegean/10 text-aegean text-xs font-bold tracking-wider uppercase"
                    >
                        <EqualizerBars barCount={3} size="sm" />
                        <Sparkles className="w-3 h-3" />
                        {t("subtitle") || "Nossos Estilos"}
                        <EqualizerBars barCount={3} size="sm" />
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-serif font-medium text-dark tracking-tight"
                    >
                        {t("title")}
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-base md:text-lg text-dark/50 max-w-2xl mx-auto font-light leading-relaxed"
                    >
                        {isSearching
                            ? t("showingFiltered", { count: filteredEntries.length, total: entries.length })
                            : t("description")
                        }
                    </motion.p>

                    {/* Equalizer divider */}
                    <motion.div
                        initial={{ opacity: 0, scaleX: 0 }}
                        whileInView={{ opacity: 1, scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3, duration: 0.6 }}
                        className="flex items-center justify-center gap-3 pt-1"
                    >
                        <div className="h-px w-12 bg-gradient-to-r from-transparent to-aegean/30" />
                        <EqualizerBars barCount={5} size="sm" color="bg-aegean/40" />
                        <div className="h-px w-12 bg-gradient-to-l from-transparent to-aegean/30" />
                    </motion.div>
                </div>

                {/* Search + Vocals — compact row */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 }}
                    className="max-w-2xl mx-auto mb-8 md:mb-10 px-4"
                >
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        {/* Search Bar */}
                        <div className="relative flex-1 group">
                            <div className="absolute inset-0 bg-aegean/8 rounded-full blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                            <div className="relative bg-white rounded-full shadow-sm border border-aegean/10 overflow-hidden flex items-center transition-all focus-within:ring-2 focus-within:ring-aegean/20 focus-within:border-aegean/40">
                                <div className="pl-4 text-dark/40">
                                    <Search className="w-4 h-4" />
                                </div>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t("searchPlaceholder")}
                                    className="w-full px-3 py-3 bg-transparent border-none text-dark placeholder:text-dark/35 focus:outline-none text-sm"
                                />
                                <AnimatePresence>
                                    {searchQuery && (
                                        <motion.button
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            onClick={clearSearch}
                                            className="pr-4 pl-1 text-dark/40 hover:text-dark transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </motion.button>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Vocals Toggle — pill style */}
                        <div className="inline-flex rounded-full bg-white border border-aegean/15 p-1 shadow-sm self-center">
                            <button
                                onClick={() => setSelectedVocals("male")}
                                className={cn(
                                    "px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200",
                                    selectedVocals === "male"
                                        ? "bg-aegean text-white shadow-md shadow-aegean/20"
                                        : "text-dark/50 hover:text-dark hover:bg-aegean/5"
                                )}
                            >
                                {t("vocalsMale")}
                            </button>
                            <button
                                onClick={() => setSelectedVocals("female")}
                                className={cn(
                                    "px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200",
                                    selectedVocals === "female"
                                        ? "bg-aegean text-white shadow-md shadow-aegean/20"
                                        : "text-dark/50 hover:text-dark hover:bg-aegean/5"
                                )}
                            >
                                {t("vocalsFemale")}
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Slider / Search Results */}
                {filteredEntries.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-20 mx-4 border border-dashed border-aegean/20 rounded-3xl bg-white/50"
                    >
                        <Music className="w-14 h-14 text-dark/15 mx-auto mb-3" />
                        <p className="text-lg text-dark/40 font-medium">{t("noResults")}</p>
                        <button
                            onClick={clearSearch}
                            className="mt-3 text-sm text-aegean hover:underline font-medium"
                        >
                            {t("clearSearch") || "Ver todos os gêneros"}
                        </button>
                    </motion.div>
                ) : isSearching ? (
                    /* Search results — grid view for precise browsing */
                    <div className="px-4 md:px-8">
                        <motion.div
                            layout
                            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 max-w-7xl mx-auto"
                        >
                            <AnimatePresence mode="popLayout">
                                {filteredEntries.map((entry, index) => {
                                    const audioUrl = getAudioUrl(entry.id);
                                    const parentLabel = entry.parent ? getGenreDisplayName(entry.parent, locale) : null;
                                    const displayName = getGenreDisplayName(entry.id, locale);

                                    return (
                                        <motion.div
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
                                            key={entry.id}
                                            className="snap-start"
                                        >
                                            <GenreCard
                                                entry={entry}
                                                displayName={displayName}
                                                parentLabel={parentLabel}
                                                audioUrl={audioUrl}
                                                missingAudioText={t("missingAudio")}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </motion.div>
                    </div>
                ) : (
                    /* Default — horizontal slider */
                    <HorizontalSlider>
                        {filteredEntries.map((entry) => {
                            const audioUrl = getAudioUrl(entry.id);
                            const parentLabel = entry.parent ? getGenreDisplayName(entry.parent, locale) : null;
                            const displayName = getGenreDisplayName(entry.id, locale);

                            return (
                                <div key={entry.id} className="snap-start">
                                    <GenreCard
                                        entry={entry}
                                        displayName={displayName}
                                        parentLabel={parentLabel}
                                        audioUrl={audioUrl}
                                        missingAudioText={t("missingAudio")}
                                    />
                                </div>
                            );
                        })}
                    </HorizontalSlider>
                )}

                {/* Bottom CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="text-center mt-12 md:mt-16 px-4"
                >
                    <p className="text-sm text-dark/40 mb-4 font-light">
                        {t("totalGenres", { count: entries.length }) || `${entries.length} estilos musicais disponíveis`}
                    </p>
                    <Link href={`/${locale}/quiz`}>
                        <Button className="bg-aegean hover:bg-[#3A7E8A] text-white h-auto rounded-full px-8 py-3.5 text-base font-semibold shadow-lg shadow-aegean/20 hover:shadow-xl hover:shadow-aegean/30 transition-all duration-300">
                            {t("ctaButton")}
                            <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
