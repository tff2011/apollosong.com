"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "~/i18n/provider";

export function GuaranteeSection() {
    const t = useTranslations("home.guarantee");

    return (
        <section className="py-24 bg-cream/50 relative">
            <div className="container mx-auto px-4">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-[2.5rem] p-10 md:p-14 shadow-2xl shadow-aegean/10 border border-aegean/20 flex flex-col md:flex-row items-center gap-10 text-center md:text-left relative overflow-hidden">
                        {/* Decorative background element for the card */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-aegean/5 rounded-full -mr-16 -mt-16 blur-2xl" />

                        <div className="flex-shrink-0 relative z-10">
                            <div className="w-28 h-28 rounded-full bg-aegean/10 flex items-center justify-center mx-auto md:mx-0 shadow-inner">
                                <ShieldCheck className="w-14 h-14 text-aegean" />
                            </div>
                        </div>

                        <div className="flex-1 relative z-10">
                            <h3 className="text-3xl md:text-4xl font-serif font-bold text-dark mb-4">
                                {t("title")}
                            </h3>
                            <p className="text-dark/60 text-lg md:text-xl leading-relaxed">
                                {t("description")}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
