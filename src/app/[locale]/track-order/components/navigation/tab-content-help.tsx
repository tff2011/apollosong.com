"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { MessageCircle, ShieldCheck, HelpCircle, Sparkles, Instagram } from "lucide-react";
import { SUPPORT_EMAIL } from "../../utils/order-helpers";

interface TabContentHelpProps {
    locale: string;
    translations: {
        needHelp: {
            title: string;
            description: string;
            contactSupport: string;
            whatsAppMessage: string;
            followInstagram?: string;
            createNewSongTitle: string;
            createNewSongCta: string;
        };
        guarantee: {
            title: string;
            description: string;
        };
        faq: {
            title: string;
            items: Array<{
                question: string;
                answer: string;
            }>;
        };
    };
}

export function TabContentHelp({ locale, translations }: TabContentHelpProps) {
    return (
        <div className="px-4 py-6 space-y-6 pb-24">
            {/* Create New Song CTA */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-aegean/10 to-amber-50 border border-aegean/20 rounded-2xl p-5"
            >
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-aegean/20 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-6 h-6 text-aegean" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-charcoal mb-1">
                            {translations.needHelp.createNewSongTitle}
                        </h3>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-3">
                            <Link
                                href={`/${locale}/create`}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aegean text-white font-semibold hover:bg-aegean/90 active:scale-95 transition-all min-h-[44px]"
                            >
                                <Sparkles className="w-5 h-5" />
                                {translations.needHelp.createNewSongCta}
                            </Link>
                        </motion.div>
                    </div>
                </div>
            </motion.div>

            {/* WhatsApp & Instagram CTAs */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-2xl p-5"
            >
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-charcoal mb-1">
                            {translations.needHelp.title}
                        </h3>
                        <p className="text-sm text-charcoal/70 mb-4">
                            {translations.needHelp.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <motion.a
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                href={`https://wa.me/5561995790193?text=${encodeURIComponent(translations.needHelp.whatsAppMessage)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] text-white font-semibold hover:bg-[#1da851] active:scale-95 transition-all min-h-[44px]"
                            >
                                <MessageCircle className="w-5 h-5" />
                                {translations.needHelp.contactSupport}
                            </motion.a>
                            <motion.a
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                href="https://instagram.com/apollosongbr"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white font-semibold hover:opacity-90 active:scale-95 transition-all min-h-[44px]"
                            >
                                <Instagram className="w-5 h-5" />
                                {translations.needHelp.followInstagram || "Seguir no Instagram"}
                            </motion.a>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* FAQ Section */}
            {translations.faq?.items && translations.faq.items.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                >
                    <h3 className="font-semibold text-charcoal flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-charcoal/50" />
                        {translations.faq.title}
                    </h3>
                    <div className="space-y-2">
                        {translations.faq.items.map((item, index) => (
                            <details
                                key={index}
                                className="bg-white rounded-xl border border-charcoal/10 overflow-hidden group"
                            >
                                <summary className="px-4 py-3 cursor-pointer font-medium text-charcoal hover:bg-charcoal/5 transition-colors list-none flex items-center justify-between">
                                    {item.question}
                                    <span className="text-charcoal/30 group-open:rotate-180 transition-transform text-xs">
                                        ▼
                                    </span>
                                </summary>
                                <div
                                    className="px-4 pb-4 pt-2 text-sm text-charcoal/70"
                                    dangerouslySetInnerHTML={{ __html: item.answer }}
                                />
                            </details>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Guarantee Banner */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-green-50 border border-green-200 rounded-2xl p-5"
            >
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-green-900 mb-1">
                            {translations.guarantee.title}
                        </h3>
                        <p className="text-sm text-green-800">
                            {translations.guarantee.description.replace("{email}", SUPPORT_EMAIL)}
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
