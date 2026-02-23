"use client";

import { motion } from "framer-motion";
import { cn } from "~/lib/utils";

interface CarouselDotsProps {
    total: number;
    current: number;
    onDotClick: (index: number) => void;
    translations: {
        orderFor: string;
        ofTotal: string;
    };
}

export function CarouselDots({
    total,
    current,
    onDotClick,
    translations,
}: CarouselDotsProps) {
    return (
        <div className="mt-6 flex flex-col items-center gap-3">
            {/* Dot Navigation */}
            <div className="flex items-center gap-2">
                {Array.from({ length: total }).map((_, index) => (
                    <motion.button
                        key={index}
                        onClick={() => onDotClick(index)}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        className={cn(
                            "transition-all duration-300 rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center",
                            current === index
                                ? "w-8 h-8 bg-[#4A8E9A] shadow-lg"
                                : "w-6 h-6 bg-charcoal/20 hover:bg-charcoal/30"
                        )}
                        aria-label={`Go to order ${index + 1}`}
                    >
                        {current === index && (
                            <motion.span
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-white text-sm font-bold"
                            >
                                {index + 1}
                            </motion.span>
                        )}
                    </motion.button>
                ))}
            </div>

            {/* Position Text */}
            <motion.p
                key={current}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-charcoal/60 font-medium"
            >
                <span className="font-bold text-charcoal">{current + 1}</span>
                {" "}
                {translations.ofTotal.replace("{total}", String(total))}
            </motion.p>
        </div>
    );
}
