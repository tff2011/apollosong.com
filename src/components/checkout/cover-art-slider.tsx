"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "~/lib/utils";

const COVER_IMAGES = [
    "/images/capas/capa-ex-1.webp",
    "/images/capas/capa-ex-2.webp",
    "/images/capas/capa-ex-3.webp",
    "/images/capas/capa-ex-4.webp",
];

type CoverArtSliderProps = {
    title?: string;
    subtitle?: string;
};

export function CoverArtSlider({ title, subtitle }: CoverArtSliderProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    // Handle keyboard navigation in lightbox
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (lightboxIndex === null) return;

        if (e.key === "Escape") {
            setLightboxIndex(null);
        } else if (e.key === "ArrowLeft") {
            setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : COVER_IMAGES.length - 1));
        } else if (e.key === "ArrowRight") {
            setLightboxIndex((prev) => (prev !== null && prev < COVER_IMAGES.length - 1 ? prev + 1 : 0));
        }
    }, [lightboxIndex]);

    useEffect(() => {
        if (lightboxIndex !== null) {
            document.addEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [lightboxIndex, handleKeyDown]);

    const checkScroll = () => {
        if (!scrollRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);

        // Calculate active index based on scroll position
        const itemWidth = scrollRef.current.children[0]?.clientWidth ?? 200;
        const gap = 16; // gap-4
        const newIndex = Math.round(scrollLeft / (itemWidth + gap));
        setActiveIndex(Math.min(newIndex, COVER_IMAGES.length - 1));
    };

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener("scroll", checkScroll);
        checkScroll();
        return () => el.removeEventListener("scroll", checkScroll);
    }, []);

    const scroll = (direction: "left" | "right") => {
        if (!scrollRef.current) return;
        const itemWidth = scrollRef.current.children[0]?.clientWidth ?? 200;
        const gap = 16;
        const scrollAmount = direction === "left" ? -(itemWidth + gap) : itemWidth + gap;
        scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    };

    const scrollToIndex = (index: number) => {
        if (!scrollRef.current) return;
        const itemWidth = scrollRef.current.children[0]?.clientWidth ?? 200;
        const gap = 16;
        scrollRef.current.scrollTo({ left: index * (itemWidth + gap), behavior: "smooth" });
    };

    return (
        <div className="bg-gradient-to-br from-sky-50/50 to-indigo-50/50 rounded-3xl p-5 sm:p-6 border border-sky-200/40">
            {/* Header */}
            {(title || subtitle) && (
                <div className="text-center mb-5">
                    {title && (
                        <h4 className="font-bold text-sky-900 text-base sm:text-lg">
                            {title}
                        </h4>
                    )}
                    {subtitle && (
                        <p className="text-sky-700/70 text-sm mt-1">
                            {subtitle}
                        </p>
                    )}
                </div>
            )}

            {/* Slider Container */}
            <div className="relative">
                {/* Left Arrow */}
                <button
                    onClick={() => scroll("left")}
                    className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center transition-all -ml-3",
                        canScrollLeft
                            ? "opacity-100 hover:bg-white hover:scale-105"
                            : "opacity-0 pointer-events-none"
                    )}
                    aria-label="Previous"
                >
                    <ChevronLeft className="w-5 h-5 text-sky-700" />
                </button>

                {/* Right Arrow */}
                <button
                    onClick={() => scroll("right")}
                    className={cn(
                        "absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center transition-all -mr-3",
                        canScrollRight
                            ? "opacity-100 hover:bg-white hover:scale-105"
                            : "opacity-0 pointer-events-none"
                    )}
                    aria-label="Next"
                >
                    <ChevronRight className="w-5 h-5 text-sky-700" />
                </button>

                {/* Scrollable Container */}
                <div
                    ref={scrollRef}
                    className="flex gap-4 overflow-x-auto scroll-smooth scrollbar-hide px-1 py-2"
                    style={{ scrollSnapType: "x mandatory" }}
                >
                    {COVER_IMAGES.map((src, index) => (
                        <div
                            key={src}
                            className="flex-shrink-0 scroll-snap-align-start"
                            style={{ scrollSnapAlign: "start" }}
                        >
                            <button
                                onClick={() => setLightboxIndex(index)}
                                className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden shadow-xl ring-2 ring-white/50 transition-transform hover:scale-[1.03] active:scale-[0.98] cursor-zoom-in"
                            >
                                <Image
                                    src={src}
                                    alt={`Cover art example ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 640px) 160px, 192px"
                                />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Dots Indicator */}
            <div className="flex justify-center gap-2 mt-4">
                {COVER_IMAGES.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => scrollToIndex(index)}
                        className={cn(
                            "w-2 h-2 rounded-full transition-all",
                            index === activeIndex
                                ? "bg-sky-600 w-6"
                                : "bg-sky-300 hover:bg-sky-400"
                        )}
                        aria-label={`Go to slide ${index + 1}`}
                    />
                ))}
            </div>

            {/* Lightbox Modal */}
            {lightboxIndex !== null && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
                    onClick={() => setLightboxIndex(null)}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-6 h-6 text-white" />
                    </button>

                    {/* Previous Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : COVER_IMAGES.length - 1));
                        }}
                        className="absolute left-4 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="w-7 h-7 text-white" />
                    </button>

                    {/* Next Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setLightboxIndex((prev) => (prev !== null && prev < COVER_IMAGES.length - 1 ? prev + 1 : 0));
                        }}
                        className="absolute right-4 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Next image"
                    >
                        <ChevronRight className="w-7 h-7 text-white" />
                    </button>

                    {/* Image Container */}
                    <div
                        className="relative w-[90vw] h-[90vw] max-w-[500px] max-h-[500px] rounded-3xl overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Image
                            src={COVER_IMAGES[lightboxIndex]!}
                            alt={`Cover art example ${lightboxIndex + 1}`}
                            fill
                            className="object-cover"
                            sizes="(max-width: 500px) 90vw, 500px"
                            priority
                        />
                    </div>

                    {/* Image Counter */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium">
                        {lightboxIndex + 1} / {COVER_IMAGES.length}
                    </div>
                </div>
            )}
        </div>
    );
}
