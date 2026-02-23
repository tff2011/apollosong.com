import React from "react";
import { LaurelWreath } from "~/components/ui/greek-motifs";
import { cn } from "~/lib/utils";

interface GreekCTAProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    className?: string;
}

export const GreekCTA = React.forwardRef<HTMLButtonElement, GreekCTAProps>(
    ({ children, className, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "group relative overflow-hidden rounded-full border border-aegean/80 bg-aegean text-white px-7 py-3 md:px-8 md:py-3.5 transition-all duration-300",
                    "outline outline-[1px] outline-aegean/25 outline-offset-[3px] shadow-[0_10px_24px_rgba(74,142,154,0.22)] hover:bg-[#3A7E8A] hover:shadow-[0_14px_28px_rgba(74,142,154,0.28)] hover:scale-[1.01] active:scale-[0.99]",
                    className
                )}
                {...props}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-[#3A7E8A] via-aegean to-[#3A7E8A] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Inner Border (Classic Frame - minimal) */}
                <div className="absolute inset-[2px] rounded-full border border-white/20 z-10 pointer-events-none" />

                <div className="relative z-20 flex items-center justify-center gap-2.5 px-1 pb-px">
                    <LaurelWreath className="w-4 h-4 md:w-[18px] md:h-[18px] text-white/75 transition-colors duration-300 -scale-x-100 group-hover:text-white/90" />
                    <span className="font-serif font-extrabold text-[14px] md:text-[16px] tracking-[0.12em] uppercase text-white transition-colors duration-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)] leading-none mt-0.5">
                        {children}
                    </span>
                    <LaurelWreath className="w-4 h-4 md:w-[18px] md:h-[18px] text-white/75 transition-colors duration-300 group-hover:text-white/90" />
                </div>
            </button>
        );
    }
);
GreekCTA.displayName = "GreekCTA";
