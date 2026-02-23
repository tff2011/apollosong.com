"use client";

import { motion } from "framer-motion";
import { Disc, Mic2, Clock, Repeat } from "lucide-react";
import { useTranslations } from "~/i18n/provider";

export function ProductDetails() {
    const t = useTranslations("home.productDetails");
    const features = t.raw("features") as Array<{
        id: string;
        title: string;
        description: string;
    }>;
    const label = t.raw("label") as {
        lines: string[];
        subline: string;
    };

    const icons = {
        radio: Mic2,
        lyrics: Disc,
        delivery: Clock,
        replay: Repeat,
    } as const;

    return (
        <section className="py-24 bg-white overflow-hidden">
            <div className="container mx-auto px-4">
                <div className="flex flex-col lg:flex-row items-center gap-16">

                    {/* Visual Side - Player Mockup */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="flex-1 relative w-full max-w-lg"
                    >
                        <div className="relative aspect-square rounded-full bg-black shadow-2xl border-4 border-aegean/20 flex items-center justify-center p-8 animate-spin-slow">
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20" />
                            {/* Vinyl Label */}
                            <div className="w-1/3 h-1/3 rounded-full bg-porcelain border-2 border-aegean flex items-center justify-center text-center p-2 relative z-10 shadow-[0_0_15px_rgba(251,249,246,0.3)]">
                                <div className="text-[10px] sm:text-xs font-serif font-bold text-[#060912] tracking-widest uppercase">
                                    {label.lines.map((line, index) => (
                                        <span key={`${line}-${index}`}>
                                            {line}
                                            <br />
                                        </span>
                                    ))}
                                    <span className="text-aegean text-[8px]">{label.subline}</span>
                                </div>
                            </div>
                            {/* Grooves */}
                            <div className="absolute inset-0 rounded-full border-[20px] border-transparent border-t-white/5 border-b-white/5" />
                            <div className="absolute inset-0 rounded-full border-[60px] border-transparent border-l-white/5" />
                        </div>

                        {/* Player UI Float */}
                        <div className="absolute -bottom-8 -right-8 bg-white p-6 rounded-2xl shadow-xl border border-aegean/10 max-w-xs backdrop-blur-sm bg-white/90">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-aegean/10 rounded-lg flex items-center justify-center">
                                    <Disc className="w-6 h-6 text-aegean animate-spin" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-dark text-sm">{t("player.title")}</h4>
                                    <p className="text-xs text-dark/50">{t("player.duration")}</p>
                                </div>
                            </div>
                            <div className="h-1 bg-white/60 rounded-full overflow-hidden">
                                <div className="h-full w-2/3 bg-aegean rounded-full" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Features List */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="flex-1"
                    >
                        <h2 className="text-3xl md:text-5xl font-serif font-bold text-dark mb-8 leading-tight">
                            {t("headline")}<br />
                            <span className="text-aegean italic">{t("headlineEmphasis")}</span>
                        </h2>

                        <div className="grid sm:grid-cols-2 gap-8">
                            {features.map((feature, idx) => {
                                const Icon = icons[feature.id as keyof typeof icons] ?? Mic2;

                                return (
                                    <div key={idx} className="flex flex-col space-y-3">
                                        <div className="w-12 h-12 rounded-full bg-cream flex items-center justify-center border border-aegean/10">
                                            <Icon className="w-6 h-6 text-aegean" />
                                        </div>
                                        <h3 className="font-bold text-lg text-dark">{feature.title}</h3>
                                        <p className="text-sm text-dark/60 leading-relaxed">{feature.description}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}
