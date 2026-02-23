"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Link } from "~/i18n/navigation";
import { useTranslations } from "~/i18n/provider";
import { GreekCTA } from "~/components/ui/greek-cta";

export function FinalCTA() {
    const t = useTranslations("home.finalCta");

    return (
        <section className="py-32 bg-cream relative overflow-hidden flex items-center justify-center text-center">
            {/* Subtle warm glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,_rgba(74,142,154,0.05)_0%,_transparent_70%)] pointer-events-none" />

            <div className="container relative z-10 px-6">
                <div className="max-w-4xl mx-auto space-y-12">
                    <p className="text-aegean uppercase tracking-[0.3em] text-xs font-bold font-serif">
                        {t("eyebrow")}
                    </p>

                    <h2 className="text-5xl md:text-7xl font-serif font-bold text-dark leading-tight tracking-tight">
                        {t("title")}<br />
                        <span className="italic font-light text-dark/70">{t("titleEmphasis")}</span>
                    </h2>

                    <p className="text-xl md:text-2xl text-dark/50 max-w-2xl mx-auto font-serif italic">
                        {t("description")}
                    </p>

                    <div className="pt-8">
                        <Link href="/create">
                            <GreekCTA>
                                {t("cta")}
                            </GreekCTA>
                        </Link>
                    </div>

                    <p className="text-dark/30 text-sm font-medium tracking-wide uppercase pt-8 border-t border-dark/5 max-w-xs mx-auto">
                        {t("footnote")}
                    </p>
                </div>
            </div>
        </section>
    );
}
