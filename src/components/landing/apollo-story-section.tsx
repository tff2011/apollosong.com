"use client";

import { motion } from "framer-motion";
import { useTranslations } from "~/i18n/provider";
import { ApolloSun } from "~/components/ui/greek-motifs";

export function ApolloStorySection() {
    const t = useTranslations("home.apolloStory");

    return (
        <section className="py-24 md:py-32 bg-porcelain relative overflow-hidden flex items-center justify-center">
            {/* Subtle glow and Sun Motif */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,_rgba(74,142,154,0.05)_0%,_transparent_60%)] pointer-events-none flex items-center justify-center">
                <ApolloSun className="w-[400px] h-[400px] text-aegean/5 animate-[spin_60s_linear_infinite]" />
            </div>

            <div className="container mx-auto px-4 relative z-10 max-w-5xl">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
                    className="flex flex-col md:flex-row gap-12 md:gap-20 items-stretch"
                >
                    {/* Left Column: Title & Subtitle */}
                    <div className="flex-1 flex flex-col justify-center">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                        >
                            <span className="text-aegean font-semibold tracking-widest uppercase text-xs md:text-sm mb-4 block">
                                {t("badge")}
                            </span>
                            <h2 className="text-4xl md:text-5xl lg:text-[3.5rem] font-serif font-bold text-dark leading-[1.15] mb-6">
                                {t("title")}
                            </h2>
                            <p className="text-xl md:text-2xl text-dark/70 font-serif italic border-l-2 border-aegean/40 pl-6 py-2">
                                {t("subtitle")}
                            </p>
                        </motion.div>
                    </div>

                    {/* Right Column: Story text */}
                    <div className="flex-1 flex flex-col justify-center space-y-6 text-lg text-dark/60 leading-relaxed font-sans mt-4 md:mt-0">
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                        >
                            {t("p1")}
                        </motion.p>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.5 }}
                        >
                            {t("p2")}
                        </motion.p>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            className="font-medium text-dark/80"
                        >
                            {t("p3")}
                        </motion.p>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
