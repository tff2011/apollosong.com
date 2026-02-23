"use client";

import { motion } from "framer-motion";
import { MessageCircle, Instagram } from "lucide-react";

interface NeedHelpSectionProps {
    translations: {
        title: string;
        description: string;
        contactSupport: string;
        whatsAppMessage: string;
        followInstagram?: string;
    };
}

export function NeedHelpSection({ translations }: NeedHelpSectionProps) {
    return (
        <section className="py-16 bg-porcelain">
            <div className="container mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="max-w-2xl mx-auto text-center"
                >
                    <h2 className="text-2xl font-serif font-bold text-charcoal mb-4">
                        {translations.title}
                    </h2>
                    <p className="text-charcoal/70 mb-6">
                        {translations.description}
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <motion.a
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            href={`https://wa.me/5561995790193?text=${encodeURIComponent(translations.whatsAppMessage)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#25D366] text-white font-semibold hover:bg-[#1da851] active:scale-95 transition-all min-h-[44px]"
                        >
                            <MessageCircle className="w-5 h-5" />
                            {translations.contactSupport}
                        </motion.a>
                        <motion.a
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            href="https://instagram.com/apollosongbr"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white font-semibold hover:opacity-90 active:scale-95 transition-all min-h-[44px]"
                        >
                            <Instagram className="w-5 h-5" />
                            {translations.followInstagram || "Seguir no Instagram"}
                        </motion.a>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
