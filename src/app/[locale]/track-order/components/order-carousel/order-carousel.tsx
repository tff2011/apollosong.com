"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";
import type { TrackOrder } from "../../hooks/use-track-order";
import { CarouselDots } from "./carousel-dots";

interface OrderCarouselProps {
    orders: TrackOrder[];
    currentIndex: number;
    onIndexChange: (index: number) => void;
    children: React.ReactNode[];
    translations: {
        orderFor: string;
        ofTotal: string;
    };
}

export function OrderCarousel({
    orders,
    currentIndex,
    onIndexChange,
    children,
    translations,
}: OrderCarouselProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: false,
        align: "center",
        containScroll: "trimSnaps",
    });
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);

    const onSelect = useCallback(() => {
        if (!emblaApi) return;
        const newIndex = emblaApi.selectedScrollSnap();
        onIndexChange(newIndex);
        setCanScrollPrev(emblaApi.canScrollPrev());
        setCanScrollNext(emblaApi.canScrollNext());
    }, [emblaApi, onIndexChange]);

    useEffect(() => {
        if (!emblaApi) return;
        emblaApi.on("select", onSelect);
        onSelect();
        return () => {
            emblaApi.off("select", onSelect);
        };
    }, [emblaApi, onSelect]);

    const scrollPrev = useCallback(() => {
        emblaApi?.scrollPrev();
    }, [emblaApi]);

    const scrollNext = useCallback(() => {
        emblaApi?.scrollNext();
    }, [emblaApi]);

    const scrollTo = useCallback((index: number) => {
        emblaApi?.scrollTo(index);
    }, [emblaApi]);

    // Only one order - no carousel needed
    if (orders.length === 1) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                {children[0]}
            </motion.div>
        );
    }

    return (
        <div className="relative">
            {/* Carousel Container */}
            <div ref={emblaRef} className="overflow-hidden">
                <div className="flex gap-4">
                    {children.map((child, index) => (
                        <div
                            key={orders[index]?.id}
                            className="flex-[0_0_100%] min-w-0"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{
                                    opacity: currentIndex === index ? 1 : 0.7,
                                    scale: currentIndex === index ? 1 : 0.95,
                                }}
                                transition={{ duration: 0.3 }}
                            >
                                {child}
                            </motion.div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation Arrows (for desktop) */}
            <div className="hidden sm:block">
                <AnimatePresence>
                    {canScrollPrev && (
                        <motion.button
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            onClick={scrollPrev}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-12 h-12 rounded-full bg-[#2D2D2D] shadow-lg flex items-center justify-center text-white hover:bg-[#3D3D3D] active:scale-95 transition-all"
                            aria-label="Previous order"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </motion.button>
                    )}
                </AnimatePresence>
                <AnimatePresence>
                    {canScrollNext && (
                        <motion.button
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            onClick={scrollNext}
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-12 h-12 rounded-full bg-[#2D2D2D] shadow-lg flex items-center justify-center text-white hover:bg-[#3D3D3D] active:scale-95 transition-all"
                            aria-label="Next order"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* Dots & Position Indicator */}
            <CarouselDots
                total={orders.length}
                current={currentIndex}
                onDotClick={scrollTo}
                translations={translations}
            />

            {/* Swipe Hint (mobile only, first time) */}
            <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 3, duration: 0.5 }}
                className="sm:hidden absolute inset-x-0 bottom-20 flex justify-center pointer-events-none"
            >
                <div className="flex items-center gap-2 px-4 py-2 bg-charcoal/80 text-white rounded-full text-sm font-medium">
                    <ChevronLeft className="w-4 h-4" />
                    <span>Deslize para navegar</span>
                    <ChevronRight className="w-4 h-4" />
                </div>
            </motion.div>
        </div>
    );
}
