"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Gift, Sparkles, Music } from "lucide-react";
import { renderBold } from "../../utils/order-helpers";

interface CreateAnotherCtaProps {
    locale: string;
    translations: {
        title: string;
        description: string;
        cta: string;
    };
}

export function CreateAnotherCta({ locale, translations }: CreateAnotherCtaProps) {
    return (
        <section className="py-16 bg-white">
            <div className="container mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="max-w-2xl mx-auto text-center"
                >
                    <h2 className="text-2xl font-serif font-bold text-charcoal mb-4">
                        {renderBold(translations.title, "font-bold")}
                    </h2>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Link
                            href={`/${locale}/create`}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#4A8E9A] text-dark font-semibold hover:bg-[#F0EDE6] active:scale-95 transition-all min-h-[44px]"
                        >
                            <Music className="w-5 h-5" />
                            {translations.cta}
                        </Link>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}

interface CreateNewSongCtaProps {
    locale: string;
    translations: {
        createNewSongTitle: string;
        createNewSongCta: string;
    };
}

export function CreateNewSongCta({ locale, translations }: CreateNewSongCtaProps) {
    return (
        <section className="py-16 bg-white">
            <div className="container mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="max-w-2xl mx-auto text-center"
                >
                    <h2 className="text-2xl font-serif font-bold text-charcoal mb-4">
                        {translations.createNewSongTitle}
                    </h2>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Link
                            href={`/${locale}/create`}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#4A8E9A] text-dark font-semibold hover:bg-[#F0EDE6] active:scale-95 transition-all min-h-[44px]"
                        >
                            <Music className="w-5 h-5" />
                            {translations.createNewSongCta}
                        </Link>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}
