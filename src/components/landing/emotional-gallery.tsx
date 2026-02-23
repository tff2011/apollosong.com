"use client";

import { motion } from "framer-motion";
import { Heart, Users, Sun, Moon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "~/i18n/provider";

export function EmotionalGallery() {
    const t = useTranslations("home.emotionalGallery");
    const categories = t.raw("items") as Array<{
        id: string;
        title: string;
        description: string;
        image: string;
        alt: string;
    }>;

    const icons = {
        spouse: Heart,
        children: Users,
        healing: Moon,
        faith: Sun,
    } as const;

    return (
        <section className="py-24 bg-white">
            <div className="container mx-auto px-4">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl md:text-5xl font-serif font-bold text-dark mb-4">
                        {t("title")}
                    </h2>
                    <p className="text-lg text-dark/60">
                        {t("subtitle")}
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {categories.map((cat, index) => {
                        const Icon = icons[cat.id as keyof typeof icons] ?? Heart;

                        return (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="group relative h-[400px] rounded-2xl overflow-hidden cursor-pointer shadow-lg"
                        >
                            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors z-10" />

                            <Image
                                src={cat.image}
                                alt={cat.alt}
                                fill
                                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                            />

                            <div className="absolute bottom-0 inset-x-0 p-6 z-20 text-white translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                <div className="inline-flex items-center justify-center p-2 rounded-full bg-white/20 backdrop-blur-md mb-3">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <h3 className="text-2xl font-serif font-bold mb-2">{cat.title}</h3>
                                <p className="text-white/90 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
                                    {cat.description}
                                </p>
                            </div>
                        </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
