"use client";

import { motion } from "framer-motion";
import { ArrowRight, Music, PenTool, Send } from "lucide-react";
import { Button } from "~/components/ui/button";
import { WhatsappAudioPlayer } from "~/components/ui/whatsapp-audio-player";
import { Link } from "~/i18n/navigation";
import { useLocale, useTranslations } from "~/i18n/provider";
import { GreekKey, LaurelWreath } from "~/components/ui/greek-motifs";
import { GreekCTA } from "~/components/ui/greek-cta";

export function HowItWorks() {
    const t = useTranslations("home.howItWorks");
    const locale = useLocale();
    const steps = t.raw("steps") as Array<{
        id: string;
        title: string;
        description: string;
    }>;

    const icons = {
        share: PenTool,
        create: Music,
        deliver: Send,
    } as const;

    return (
        <section className="py-24 md:py-32 bg-cream relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-1/3 h-full bg-porcelain/50 mix-blend-multiply pointer-events-none" />
            <div className="absolute -left-40 top-40 w-80 h-80 bg-aegean/10 rounded-full blur-3xl pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10 max-w-5xl">
                <div className="text-center mb-20 md:mb-32">
                    <div className="flex justify-center mb-8">
                        <GreekKey className="h-6 w-48 text-aegean/20" />
                    </div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-dark tracking-tight"
                    >
                        {t("title")}
                    </motion.h2>
                    {locale !== "pt" && (
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="mt-6 text-xl text-dark/60 font-serif italic max-w-2xl mx-auto"
                        >
                            {t("subtitle")}
                        </motion.p>
                    )}
                </div>

                {locale === "pt" && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="bg-white/80 backdrop-blur-md rounded-3xl p-8 md:p-12 shadow-xl shadow-dark/5 border border-dark/5 mb-24 max-w-3xl mx-auto text-center relative overflow-hidden"
                    >
                        {/* Decorative quote mark */}
                        <div className="absolute top-4 left-6 text-9xl font-serif text-aegean/10 leading-none select-none pointer-events-none">"</div>

                        <h3 className="text-2xl md:text-3xl font-serif font-bold text-dark mb-6 relative z-10">
                            {t("audioPrompt")}
                        </h3>
                        <div className="flex justify-center w-full mb-10 relative z-10">
                            <div className="w-full max-w-md bg-cream/50 rounded-2xl p-2 border border-aegean/20">
                                <WhatsappAudioPlayer src="https://pub-b085b85804204c82b96e15ec554b0940.r2.dev/audio-como-funciona-home.mp3" />
                            </div>
                        </div>
                        <Link href="/create" className="relative z-10">
                            <Button
                                variant="divine"
                                size="lg"
                                className="rounded-full px-12 py-7 text-lg uppercase tracking-widest shadow-lg shadow-aegean/20 hover:scale-105 transition-all"
                            >
                                {t("audioCta")}
                            </Button>
                        </Link>
                    </motion.div>
                )}

                {/* Vertical Steps */}
                <div className="relative space-y-24 md:space-y-32">
                    {/* Central Line */}
                    <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-dark/0 via-dark/10 to-dark/0 -translate-x-1/2 z-0" />

                    {steps.map((step, index) => {
                        const Icon = icons[step.id as keyof typeof icons] ?? PenTool;
                        const isEven = index % 2 === 0;

                        return (
                            <div key={index} className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-8 md:gap-16`}>
                                {/* Content */}
                                <motion.div
                                    initial={{ opacity: 0, x: isEven ? -50 : 50 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true, margin: "-100px" }}
                                    transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
                                    className={`flex-1 text-center ${isEven ? 'md:text-right' : 'md:text-left'} relative`}
                                >
                                    <span className={`text-laurel/15 font-serif text-8xl md:text-9xl absolute top-1/2 -translate-y-1/2 z-0 font-bold leading-none select-none
                                                   left-1/2 -translate-x-1/2 md:translate-x-0
                                                   ${isEven ? 'md:right-8 md:left-auto' : 'md:left-8 md:right-auto'}`}>
                                        0{index + 1}
                                    </span>
                                    <h3 className="text-3xl md:text-4xl font-serif font-bold text-dark mb-4 drop-shadow-sm">{step.title}</h3>
                                    <p className="text-lg md:text-xl text-dark/60 leading-relaxed font-serif italic">{step.description}</p>
                                </motion.div>

                                {/* Center Icon */}
                                <motion.div
                                    initial={{ opacity: 0, scale: 0 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true, margin: "-100px" }}
                                    transition={{ duration: 0.5, delay: 0.2 }}
                                    className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white shadow-xl shadow-dark/5 border border-aegean/20 flex items-center justify-center shrink-0 relative z-20"
                                >
                                    <LaurelWreath className="absolute w-[140%] h-[140%] text-aegean/10 -z-10 animate-[spin_60s_linear_infinite]" />
                                    <Icon className="w-8 h-8 md:w-10 md:h-10 text-aegean relative z-10" strokeWidth={1.5} />
                                    {/* Pulse ring */}
                                    <div className="absolute inset-0 rounded-full border border-aegean/30 scale-[1.3] opacity-0" />
                                </motion.div>

                                {/* Empty space for balance */}
                                <div className="hidden md:block flex-1" />
                            </div>
                        );
                    })}
                </div>

                {locale !== "pt" && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mt-32 text-center"
                    >
                        <Link href="/create">
                            <Button
                                variant="divine"
                                size="lg"
                                className="rounded-full px-12 py-8 text-lg uppercase tracking-widest shadow-xl shadow-aegean/20 hover:scale-105 transition-all group"
                            >
                                {t("cta")}
                                <ArrowRight className="ml-3 w-5 h-5 group-hover:translate-x-2 transition-transform" />
                            </Button>
                        </Link>
                    </motion.div>
                )}
            </div>
        </section>
    );
}
