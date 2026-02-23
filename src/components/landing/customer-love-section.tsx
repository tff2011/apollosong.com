"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Star, Play, Pause, Quote, CheckCircle2, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import Image from "next/image";
import { useTranslations, useLocale } from "~/i18n/provider";
import { motion } from "framer-motion";
import { cn } from "~/lib/utils";
import { WhatsappAudioPlayer } from "~/components/ui/whatsapp-audio-player";

const R2_URL = "https://pub-b085b85804204c82b96e15ec554b0940.r2.dev";

type ReviewCardProps = {
    type: "review";
    rating: number;
    quote: string;
    author: string;
    avatar: string;
    verified: boolean;
};

type VideoCardProps = {
    type: "video";
    thumbnail: string;
    title: string;
    subtitle: string;
    videoUrl?: string;
};

type AudioCardProps = {
    type: "audio";
    author: string;
    avatar: string;
    messages: Array<{
        src: string;
        duration: string;
    }>;
};

type ItemProps = ReviewCardProps | VideoCardProps | AudioCardProps;

const videoUrlsPT = {
    godGaveMeYou: `${R2_URL}/deus-me-deu-voce.mp3`,
    threeSqueezes: `${R2_URL}/tres-apertos.mp3`,
    myHeartIsYours: `${R2_URL}/meu-coracao-e-seu.mp3`,
    mommysLove: `${R2_URL}/amor-de-mae.mp3`,
    chosenHearts: `${R2_URL}/coracoes-escolhidos.mp3`,
};

const videoUrlsES = {
    godGaveMeYou: `${R2_URL}/exemplo-es-1.mp3`,
    threeSqueezes: `${R2_URL}/exemplo-es-2.mp3`,
    myHeartIsYours: `${R2_URL}/exemplo-es-3.mp3`,
    mommysLove: `${R2_URL}/exemplo-es-1.mp3`,
    chosenHearts: `${R2_URL}/exemplo-es-2.mp3`,
};

const videoUrlsFR = {
    godGaveMeYou: `${R2_URL}/exemplo-fr-1.mp3`,
    threeSqueezes: `${R2_URL}/exemplo-fr-2.mp3`,
    myHeartIsYours: `${R2_URL}/exemplo-fr-3.mp3`,
    mommysLove: `${R2_URL}/exemplo-fr-1.mp3`,
    chosenHearts: `${R2_URL}/exemplo-fr-2.mp3`,
};

const videoUrlsIT = {
    godGaveMeYou: `${R2_URL}/elisa-italiano.mp3`,
    threeSqueezes: `${R2_URL}/exemplo-it-2.mp3`,
    myHeartIsYours: `${R2_URL}/exemplo-it-3.mp3`,
    mommysLove: `${R2_URL}/elisa-italiano.mp3`,
    chosenHearts: `${R2_URL}/exemplo-it-2.mp3`,
};

const videoUrlsEN = {
    godGaveMeYou: `${R2_URL}/songs/saving-grace.mp3`,
    threeSqueezes: `${R2_URL}/songs/sent-to-me-from-god.mp3`,
    myHeartIsYours: `${R2_URL}/songs/stronger-now.mp3`,
    mommysLove: `${R2_URL}/songs/saving-grace.mp3`,
    chosenHearts: `${R2_URL}/songs/sent-to-me-from-god.mp3`,
};

// New realistic testimonial images
const TESTIMONIAL_IMAGES = [
    "/images/testimonial-1.webp",
    "/images/testimonial-2.webp",
    "/images/testimonial-3.webp",
    "/images/testimonial-4.webp",
    "/images/testimonial-5.webp",
];

const getItemsData = (locale: string) => {
    const videoUrls = locale === "pt" ? videoUrlsPT : locale === "es" ? videoUrlsES : locale === "fr" ? videoUrlsFR : locale === "it" ? videoUrlsIT : videoUrlsEN;

    return [
        {
            id: "godGaveMeYou",
            type: "video" as const,
            thumbnail: TESTIMONIAL_IMAGES[0]!,
            videoUrl: videoUrls.godGaveMeYou,
        },
        {
            id: "wendyB",
            type: "review" as const,
            rating: 5,
            avatar: "/images/avatars/avatar-1.webp",
            verified: true,
        },
        {
            id: "threeSqueezes",
            type: "video" as const,
            thumbnail: TESTIMONIAL_IMAGES[1]!,
            videoUrl: videoUrls.threeSqueezes,
        },
        {
            id: "myHeartIsYours",
            type: "video" as const,
            thumbnail: TESTIMONIAL_IMAGES[2]!,
            videoUrl: videoUrls.myHeartIsYours,
        },
        {
            id: "mommysLove",
            type: "video" as const,
            thumbnail: TESTIMONIAL_IMAGES[3]!,
            videoUrl: videoUrls.mommysLove,
        },
        {
            id: "chosenHearts",
            type: "video" as const,
            thumbnail: TESTIMONIAL_IMAGES[4]!,
            videoUrl: videoUrls.chosenHearts,
        },
    ];
};

/* ─── Horizontal Slider ─── */
function TestimonialSlider({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [totalCards, setTotalCards] = useState(0);

    const checkScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 10);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);

        // Calculate active index based on scroll position
        const cardWidth = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 16 : 320;
        setActiveIndex(Math.round(el.scrollLeft / cardWidth));
        setTotalCards(el.children.length);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        checkScroll();
        el.addEventListener("scroll", checkScroll, { passive: true });
        const observer = new ResizeObserver(checkScroll);
        observer.observe(el);
        return () => {
            el.removeEventListener("scroll", checkScroll);
            observer.disconnect();
        };
    }, [checkScroll]);

    const scroll = (direction: "left" | "right") => {
        const el = scrollRef.current;
        if (!el) return;
        const cardWidth = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 16 : 320;
        el.scrollBy({
            left: direction === "left" ? -cardWidth : cardWidth,
            behavior: "smooth",
        });
    };

    return (
        <div className={cn("relative group/slider", className)}>
            {/* Left arrow */}
            {canScrollLeft && (
                <button
                    onClick={() => scroll("left")}
                    className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-11 md:h-11 rounded-full bg-white shadow-lg border border-dark/5 flex items-center justify-center text-dark/60 hover:text-aegean hover:border-aegean/20 transition-all duration-300 active:scale-90"
                    aria-label="Previous"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            )}

            {/* Scrollable track */}
            <div
                ref={scrollRef}
                className="flex gap-4 overflow-x-auto scrollbar-hide px-5 md:px-10 py-2 scroll-smooth snap-x snap-mandatory"
                style={{ WebkitOverflowScrolling: "touch" }}
            >
                {children}
            </div>

            {/* Right arrow */}
            {canScrollRight && (
                <button
                    onClick={() => scroll("right")}
                    className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-11 md:h-11 rounded-full bg-white shadow-lg border border-dark/5 flex items-center justify-center text-dark/60 hover:text-aegean hover:border-aegean/20 transition-all duration-300 active:scale-90"
                    aria-label="Next"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            )}

            {/* Dot indicators — mobile only */}
            <div className="flex justify-center gap-1.5 mt-5 md:hidden">
                {Array.from({ length: Math.min(totalCards, 8) }).map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            i === activeIndex
                                ? "w-6 bg-aegean"
                                : "w-1.5 bg-dark/15"
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

export function CustomerLoveSection() {
    const t = useTranslations("home.socialProof");
    const common = useTranslations("common");
    const locale = useLocale();
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const itemsData = getItemsData(locale);

    const handlePlayPause = async (index: number, audioUrl?: string) => {
        if (!audioUrl) return;

        if (playingIndex === index && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setPlayingIndex(null);
            return;
        }

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
            setPlayingIndex(null);
            audioRef.current = null;
        };

        audio.onerror = () => {
            setPlayingIndex(null);
            audioRef.current = null;
        };

        try {
            audio.load();
            await audio.play();
            if (audioRef.current === audio) {
                setPlayingIndex(index);
            }
        } catch (err) {
            if (err instanceof Error && err.name !== "AbortError") {
                console.error("[CustomerLove] Error playing audio:", err);
            }
            if (audioRef.current === audio) {
                audioRef.current = null;
            }
        }
    };

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, []);

    const items: ItemProps[] = itemsData.map((item) => {
        if (item.type === "video") {
            return {
                type: "video",
                thumbnail: item.thumbnail,
                title: t(`items.${item.id}.title`),
                subtitle: t(`items.${item.id}.subtitle`),
                videoUrl: item.videoUrl,
            };
        } else {
            return {
                type: "review",
                rating: item.rating,
                quote: t(`items.${item.id}.quote`),
                author: t(`items.${item.id}.author`),
                avatar: item.avatar,
                verified: item.verified,
            };
        }
    });

    // Add Rosely's audio testimonial for Portuguese locale
    if (locale === "pt") {
        items.splice(1, 0, {
            type: "audio",
            author: "Rosely",
            avatar: "/images/rosely.webp",
            messages: [
                { src: `${R2_URL}/depoimento1.mp3`, duration: "0:23" },
                { src: `${R2_URL}/depoimento2.mp3`, duration: "0:45" },
                { src: `${R2_URL}/depoimento3.mp3`, duration: "0:30" },
            ],
        });
    }

    return (
        <section className="py-16 md:py-28 bg-porcelain relative overflow-hidden">
            {/* Subtle ambient glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-aegean/4 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10">
                {/* Header */}
                <div className="text-center mb-10 md:mb-16 px-5">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-aegean/8 text-aegean text-xs font-bold tracking-wider uppercase mb-5"
                    >
                        <Heart className="w-3 h-3 fill-aegean" />
                        {t("badge") || "Depoimentos Reais"}
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-dark tracking-tight leading-[1.1]"
                    >
                        {t("customerLoveTitle")}{" "}
                        <span className="italic text-aegean">{common("brand")}</span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="mt-4 text-base md:text-lg text-dark/45 font-light max-w-xl mx-auto"
                    >
                        {t("subtitle") || "Histórias reais de conexões inesquecíveis."}
                    </motion.p>
                </div>

                {/* Cards Slider */}
                <TestimonialSlider>
                    {items.map((item, index) => (
                        <div key={index} className="snap-start flex-shrink-0 w-[280px] sm:w-[300px] md:w-[340px]">
                            {item.type === "video" ? (
                                <div
                                    className="relative aspect-[3/4] rounded-2xl overflow-hidden group cursor-pointer shadow-md hover:shadow-xl transition-all duration-500 active:scale-[0.98]"
                                    onClick={() => handlePlayPause(index, item.videoUrl)}
                                >
                                    <Image
                                        src={item.thumbnail}
                                        alt={item.title}
                                        fill
                                        sizes="340px"
                                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                    {/* Play button */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div
                                            className={cn(
                                                "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 backdrop-blur-md border",
                                                playingIndex === index
                                                    ? "bg-white border-white scale-110 shadow-xl"
                                                    : "bg-white/15 border-white/25 group-hover:bg-white/30 group-hover:scale-110"
                                            )}
                                        >
                                            {playingIndex === index ? (
                                                <Pause className="w-5 h-5 fill-dark text-dark" />
                                            ) : (
                                                <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                                            )}
                                        </div>
                                    </div>

                                    {/* Text overlay */}
                                    <div className="absolute bottom-0 left-0 right-0 p-5">
                                        <h3 className="font-serif font-bold text-lg text-white leading-tight drop-shadow-lg">
                                            {item.title}
                                        </h3>
                                        <p className="text-white/70 text-xs font-medium tracking-wider uppercase mt-1">
                                            {item.subtitle}
                                        </p>
                                    </div>
                                </div>
                            ) : item.type === "audio" ? (
                                <div className="relative rounded-2xl bg-white p-5 md:p-6 flex flex-col shadow-md border border-dark/5 h-full">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-cream shadow-sm flex-shrink-0">
                                            <Image src={item.avatar} alt={item.author} fill sizes="44px" className="object-cover" />
                                        </div>
                                        <div>
                                            <p className="font-serif font-bold text-base text-dark">{item.author}</p>
                                            <p className="text-[10px] uppercase tracking-widest text-aegean font-bold">
                                                {locale === "pt" ? "Depoimento em Áudio" : "Audio Testimonial"}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        {item.messages.map((msg, i) => (
                                            <WhatsappAudioPlayer
                                                key={i}
                                                src={msg.src}
                                                duration={msg.duration}
                                                avatar={i === 0 ? item.avatar : undefined}
                                                compact
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="relative rounded-2xl bg-white p-6 md:p-7 flex flex-col shadow-md border border-dark/5 h-full">
                                    {/* Stars */}
                                    <div className="flex gap-1 mb-4">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className="w-4 h-4 fill-aegean text-aegean" />
                                        ))}
                                    </div>

                                    {/* Quote */}
                                    <blockquote className="flex-1 mb-5 relative">
                                        <Quote className="absolute -top-2 -left-2 w-8 h-8 text-aegean/8 rotate-180" />
                                        <p className="font-serif text-dark/80 leading-relaxed text-[15px] italic relative z-10">
                                            &ldquo;{item.quote}&rdquo;
                                        </p>
                                    </blockquote>

                                    {/* Author */}
                                    <div className="flex items-center gap-3 pt-4 border-t border-dark/5">
                                        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-cream flex-shrink-0">
                                            <Image src={item.avatar} alt={item.author} fill sizes="40px" className="object-cover" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-xs text-dark uppercase tracking-wider truncate">{item.author}</p>
                                            {item.verified && (
                                                <div className="flex items-center gap-1 mt-0.5 text-[10px] uppercase font-bold tracking-widest text-dark/30">
                                                    <CheckCircle2 className="w-3 h-3 text-aegean flex-shrink-0" />
                                                    <span className="truncate">{t("items.wendyB.verified")}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </TestimonialSlider>
            </div>
        </section>
    );
}
