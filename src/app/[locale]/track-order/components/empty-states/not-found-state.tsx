"use client";

import { motion } from "framer-motion";
import { Music, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "../../utils/order-helpers";

interface NotFoundStateProps {
    locale: string;
    translations: {
        icon: string;
        title: string;
        paragraph1: string;
        paragraph2: string;
        paragraph3: string;
        helpList: string[];
        supportNote: string;
        contactSupport: string;
        createSong: string;
    };
}

export function NotFoundState({ locale, translations }: NotFoundStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto text-center"
        >
            <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring" }}
                className="text-6xl mb-6"
            >
                <Music className="w-16 h-16 mx-auto text-charcoal/30" />
            </motion.div>
            <h2 className="text-2xl font-serif font-bold text-charcoal mb-6">
                {translations.title}
            </h2>
            <div className="text-charcoal/70 space-y-4 text-left">
                <p>{translations.paragraph1}</p>
                <p>{translations.paragraph2}</p>
                <p>
                    {translations.paragraph3.replace("{email}", SUPPORT_EMAIL)}
                </p>
                <ul className="list-disc pl-6 space-y-1">
                    {translations.helpList.map((item, index) => (
                        <motion.li
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + index * 0.05 }}
                        >
                            {item}
                        </motion.li>
                    ))}
                </ul>
                <p className="pt-4">{translations.supportNote}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-8">
                <motion.a
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-charcoal/20 text-charcoal font-semibold hover:border-charcoal/40 active:scale-95 transition-all min-h-[44px]"
                >
                    <Mail className="w-5 h-5" />
                    {translations.contactSupport}
                </motion.a>
                <motion.a
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    href={`/${locale}/create`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#4A8E9A] text-dark font-semibold hover:bg-[#F0EDE6] active:scale-95 transition-all min-h-[44px]"
                >
                    <Music className="w-5 h-5" />
                    {translations.createSong}
                </motion.a>
            </div>
        </motion.div>
    );
}
