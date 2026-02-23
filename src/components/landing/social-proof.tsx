"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useTranslations } from "~/i18n/provider";

export function SocialProof() {
    const t = useTranslations("home.socialProof");
    const logos = t.raw("logos") as string[];

    return (
        <section className="py-12 bg-white border-b border-cream-darker">
            <div className="container mx-auto px-4 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="flex flex-col items-center justify-center space-y-4"
                >
                    <div className="flex space-x-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Star key={i} className="w-6 h-6 fill-gold text-aegean" />
                        ))}
                    </div>
                    <h3 className="text-xl md:text-2xl font-serif font-medium text-dark">
                        {t("title")}
                    </h3>

                    <div className="pt-6 flex flex-wrap justify-center gap-6 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                        {/* Placeholders for Press Logos or User Avatars */}
                        {logos.map((logo, index) => (
                            <Fragment key={`${logo}-${index}`}>
                                <div className="text-sm font-sans font-semibold tracking-wider uppercase text-dark/50">
                                    {logo}
                                </div>
                                {index < logos.length - 1 && (
                                    <div className="text-sm font-sans font-semibold tracking-wider uppercase text-dark/50 text-2xl">•</div>
                                )}
                            </Fragment>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
