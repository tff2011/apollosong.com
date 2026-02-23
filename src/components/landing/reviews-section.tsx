"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Users, ShieldCheck, Heart, ArrowRight, Play, X, MessageCircle, Video } from "lucide-react";
import Image from "next/image";
import { Button } from "~/components/ui/button";
import { useTranslations, useLocale } from "~/i18n/provider";
import type { Locale } from "~/i18n/config";

// AggregateRating schema for reviews
function getAggregateRatingSchema(locale: Locale, reviewCount: number) {
    const names: Record<Locale, string> = {
        en: "Custom Christian Songs by ApolloSong",
        pt: "Músicas Cristãs Personalizadas - Apollo Song",
        es: "Canciones Cristianas Personalizadas - ApolloSong",
        fr: "Chansons Chrétiennes Personnalisées - ChansonDivine",
        it: "Canzoni Cristiane Personalizzate - ApolloSong",
    };

    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: names[locale],
        aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.99",
            bestRating: "5",
            worstRating: "1",
            ratingCount: String(reviewCount),
        },
    };
}

type VideoReview = {
    type: "video";
    thumbnail: string;
    videoUrl: string;
    title: string;
    alt: string;
};

type TextReview = {
    type: "text";
    quote: string;
    name: string;
    avatar: string;
};

type ImageReview = {
    type: "image";
    src: string;
    alt: string;
};

type ReviewItem = VideoReview | TextReview | ImageReview;

export function ReviewsSection() {
    const t = useTranslations("home.reviews");
    const locale = useLocale();
    const reviews = t.raw("items") as ReviewItem[];
    const [activeVideo, setActiveVideo] = useState<VideoReview | null>(null);

    const aggregateRatingSchema = getAggregateRatingSchema(locale, reviews.length);

    return (
        <section id="reviews" className="py-20 bg-cream">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(aggregateRatingSchema) }}
            />
            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="text-center mb-12">
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-dark mb-4">
                        {t("title")}
                    </h2>
                    <p className="text-lg text-dark/60 max-w-2xl mx-auto mb-8">
                        {t("subtitle")}
                    </p>

                    {/* Stats */}
                    <div className="flex flex-wrap justify-center items-center gap-6 md:gap-10 mb-8">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4].map((star) => (
                                    <Star key={star} className="w-5 h-5 fill-gold text-aegean" />
                                ))}
                                {/* Last star ~99% filled */}
                                <div className="relative w-5 h-5">
                                    <Star className="absolute w-5 h-5 text-aegean/30" />
                                    <div className="absolute inset-0 overflow-hidden" style={{ width: '99%' }}>
                                        <Star className="w-5 h-5 fill-gold text-aegean" />
                                    </div>
                                </div>
                            </div>
                            <span className="font-semibold text-dark">{t("stats.rating")}</span>
                        </div>
                        <div className="flex items-center gap-2 text-dark/60">
                            <Users className="w-5 h-5" />
                            <span>{t("stats.customers")}</span>
                        </div>
                        <div className="flex items-center gap-2 text-dark/60">
                            <ShieldCheck className="w-5 h-5 text-green-600" />
                            <span>{t("stats.verified")}</span>
                        </div>
                    </div>

                    {/* CTA */}
                    <Button
                        variant="divine"
                        size="lg"
                        className="rounded-full px-8 py-6 text-lg group"
                    >
                        <Heart className="w-5 h-5 mr-2" />
                        {t("cta")}
                        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </div>

                {/* Reviews Grid - Masonry Style */}
                <div className="columns-1 sm:columns-2 lg:columns-4 gap-4 space-y-4">
                    {reviews.map((review, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: index * 0.05 }}
                            className="break-inside-avoid"
                        >
                            {review.type === "video" ? (
                                <VideoCard review={review} brand={t("brand")} onPlay={() => setActiveVideo(review)} />
                            ) : review.type === "image" ? (
                                <ImageCard review={review} />
                            ) : (
                                <TextCard review={review} verifiedLabel={t("verified")} />
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Video Modal */}
            <AnimatePresence>
                {activeVideo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
                        onClick={() => setActiveVideo(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative w-full max-w-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setActiveVideo(null)}
                                className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors"
                            >
                                <X className="w-8 h-8" />
                            </button>
                            <video
                                src={activeVideo.videoUrl}
                                controls
                                autoPlay
                                playsInline
                                className="w-full rounded-2xl shadow-2xl"
                                style={{ maxHeight: "80vh" }}
                            />
                            <p className="text-center text-white mt-4 font-semibold">{activeVideo.title}</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}

function VideoCard({ review, brand, onPlay }: { review: VideoReview; brand: string; onPlay: () => void }) {
    return (
        <div
            className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-lg cursor-pointer group bg-black"
            onClick={onPlay}
        >
            <Image
                src={review.thumbnail}
                alt={review.alt}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />

            {/* Video Badge */}
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm">
                <Video className="w-3.5 h-3.5 text-aegean" />
                <span className="text-xs font-medium text-dark">Vídeo</span>
            </div>

            {/* Play Button */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-14 h-14 rounded-full bg-aegean/90 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                    <Play className="w-6 h-6 fill-white text-white ml-1" />
                </div>
            </div>

            {/* Title Overlay */}
            <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
                <p className="font-semibold text-sm">{review.title}</p>
                <p className="text-xs text-white/70">{brand}</p>
            </div>
        </div>
    );
}

function TextCard({ review, verifiedLabel }: { review: TextReview; verifiedLabel: string }) {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-aegean/10">
            {/* Stars */}
            <div className="flex mb-3">
                {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-gold text-aegean" />
                ))}
            </div>

            {/* Quote Icon */}
            <div className="text-aegean text-4xl font-serif leading-none mb-2">"</div>

            {/* Quote Text */}
            <p className="text-dark/70 text-sm leading-relaxed mb-4">
                {review.quote}
            </p>

            {/* Author */}
            <div className="flex items-center gap-3">
                <Image
                    src={review.avatar}
                    alt={review.name}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                    <p className="font-semibold text-dark text-sm">{review.name}</p>
                    <div className="flex items-center gap-1 text-xs text-green-600">
                        <ShieldCheck className="w-3 h-3" />
                        <span>{verifiedLabel}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ImageCard({ review }: { review: ImageReview }) {
    return (
        <div className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-lg bg-white">
            <Image
                src={review.src}
                alt={review.alt}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                className="object-cover"
            />
            {/* Badge */}
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm">
                <MessageCircle className="w-3.5 h-3.5 text-aegean" />
                <span className="text-xs font-medium text-dark">Depoimento</span>
            </div>
        </div>
    );
}
