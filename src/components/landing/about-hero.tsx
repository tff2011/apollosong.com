"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useTranslations } from "~/i18n/provider";

export function AboutHero() {
    const t = useTranslations("about");

    return (
        <section className="relative h-[70vh] min-h-[600px] flex items-center justify-center overflow-hidden">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/images/about-hero.webp"
                    alt="Apollo Song Studio"
                    fill
                    className="object-cover"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-b from-dark/70 via-dark/40 to-cream" />
            </div>

            {/* Content */}
            <div className="container mx-auto px-4 relative z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <span className="inline-block text-white text-sm font-medium tracking-[0.3em] uppercase mb-6 drop-shadow-2xl">
                        {t("hero.title")}
                    </span>
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold text-white mb-0 tracking-tight drop-shadow-2xl">
                        {t("hero.subtitle")}
                    </h1>
                </motion.div>
            </div>

            {/* Bottom transition element */}
            <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-cream to-transparent z-10" />
        </section>
    );
}
