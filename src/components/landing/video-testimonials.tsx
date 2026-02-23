"use client";

import { motion } from "framer-motion";
import { Play } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "~/i18n/provider";

export function VideoTestimonials() {
    const t = useTranslations("home.videoTestimonials");
    const testimonials = t.raw("items") as Array<{
        name: string;
        location: string;
        quote: string;
        video: string;
        alt: string;
    }>;

    return (
        <section className="py-24 bg-cream-light border-t border-b border-aegean/10">
            <div className="container mx-auto px-4">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-serif font-bold text-dark mb-4">
                        {t("title")}
                    </h2>
                    <p className="text-lg text-dark/60">
                        {t("subtitle")}
                    </p>
                </div>

                {/* Scrollable Container for Mobile, Grid for Desktop */}
                <div className="flex overflow-x-auto pb-8 gap-6 md:grid md:grid-cols-3 md:overflow-visible">
                    {testimonials.map((t, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="relative flex-none w-[280px] h-[500px] md:w-auto md:h-[600px] rounded-2xl overflow-hidden shadow-xl cursor-pointer group"
                        >
                            <Image
                                src={t.video}
                                alt={t.alt}
                                fill
                                sizes="(min-width: 768px) 33vw, 280px"
                                className="object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />

                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Play className="w-6 h-6 fill-white text-white ml-1" />
                                </div>
                            </div>

                            <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/90 to-transparent text-white">
                                <p className="text-xl font-serif font-bold italic mb-3">
                                    "{t.quote}"
                                </p>
                                <div className="flex items-center text-sm font-medium opacity-90">
                                    <span className="w-6 h-0.5 bg-aegean mr-3" />
                                    {t.name}, {t.location}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
