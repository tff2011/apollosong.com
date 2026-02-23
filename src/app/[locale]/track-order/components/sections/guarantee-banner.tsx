"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { SUPPORT_EMAIL } from "../../utils/order-helpers";

interface GuaranteeBannerProps {
    translations: {
        title: string;
        description: string;
    };
}

export function GuaranteeBanner({ translations }: GuaranteeBannerProps) {
    return (
        <section className="pt-8 pb-16">
            <div className="container mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="max-w-2xl mx-auto"
                >
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex gap-4">
                        <div className="flex-shrink-0">
                            <motion.div
                                initial={{ scale: 0 }}
                                whileInView={{ scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.2, type: "spring" }}
                                className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"
                            >
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                            </motion.div>
                        </div>
                        <div>
                            <h3 className="font-semibold text-green-900">
                                {translations.title}
                            </h3>
                            <p className="mt-1 text-sm text-green-800">
                                {translations.description.replace("{email}", SUPPORT_EMAIL)}
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
