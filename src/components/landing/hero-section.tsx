"use client";

import { motion } from "framer-motion";
import { Gift, Play, Star, Volume2 } from "lucide-react";
import { LaurelWreath, ApolloSun } from "~/components/ui/greek-motifs";
import { GreekCTA } from "~/components/ui/greek-cta";
import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "~/components/ui/button";
import { Link } from "~/i18n/navigation";
import { useTranslations, useLocale } from "~/i18n/provider";
import {
    HEADLINE_AB_EXPERIMENT_KEY,
    HEADLINE_AB_QUERY_PARAM,
    getOrAssignHeadlineAbVariant,
    type HeadlineAbVariant,
} from "~/lib/analytics/headline-ab-test";

const R2_URL = "https://pub-b085b85804204c82b96e15ec554b0940.r2.dev";
const SHOW_HOME_HERO_VIDEO = true;
const HOME_HERO_VIDEO_ID = "euebKq4kErQ";
const HOME_HERO_VIDEO_EMBED_PARAMS = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    disablekb: "1",
    fs: "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    iv_load_policy: "3",
    loop: "1",
    playlist: HOME_HERO_VIDEO_ID,
});
const HOME_HERO_VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${HOME_HERO_VIDEO_ID}?${HOME_HERO_VIDEO_EMBED_PARAMS.toString()}`;

const SAMPLE_SONGS_PT = [
    `${R2_URL}/songs/musica0-pt.mp3`,
    `${R2_URL}/deus-me-deu-voce.mp3`,
    `${R2_URL}/tres-apertos.mp3`,
    `${R2_URL}/meu-coracao-e-seu.mp3`,
    `${R2_URL}/amor-de-mae.mp3`,
    `${R2_URL}/coracoes-escolhidos.mp3`,
];

const SAMPLE_SONGS_ES = [
    `${R2_URL}/exemplo-es-1.mp3`,
    `${R2_URL}/exemplo-es-2.mp3`,
    `${R2_URL}/exemplo-es-3.mp3`,
];

const SAMPLE_SONGS_FR = [
    `${R2_URL}/exemplo-fr-1.mp3`,
    `${R2_URL}/exemplo-fr-2.mp3`,
    `${R2_URL}/exemplo-fr-3.mp3`,
];

const SAMPLE_SONGS_IT = [
    `${R2_URL}/elisa-italiano.mp3`,
    `${R2_URL}/exemplo-it-2.mp3`,
    `${R2_URL}/exemplo-it-3.mp3`,
];

const SAMPLE_SONGS_EN = [
    `${R2_URL}/songs/saving-grace.mp3`,
    `${R2_URL}/songs/sent-to-me-from-god.mp3`,
    `${R2_URL}/songs/stronger-now.mp3`,
];

const PT_HEADLINE_VARIANTS: Record<
    HeadlineAbVariant,
    { title: string; titleHighlight?: string; description: string; badge: string; cta: string }
> = {
    A: {
        title: "Imagine a Pessoa Que Você Ama Ouvindo",
        titleHighlight: "Uma Música Feita Só Pra Ela.",
        description:
            "Artistas profissionais transformam a história de quem você ama em uma canção exclusiva. Você só responde 5 perguntas.",
        badge: "Entregue em até 7 dias",
        cta: "CRIAR MINHA CANÇÃO",
    },
    B: {
        title: "Você Já Sabe Quem Vai Chorar.",
        titleHighlight: "Crie a Música.",
        description:
            "Artistas profissionais transformam a história de quem você ama em uma canção exclusiva. Você só responde 5 perguntas.",
        badge: "Entregue em até 7 dias",
        cta: "CRIAR MINHA CANÇÃO",
    },
};

function trackHeadlineExperimentEvent(
    eventType: "impression" | "cta_click",
    variant: HeadlineAbVariant,
    locale: string
) {
    if (typeof window === "undefined") return;

    const eventName =
        eventType === "impression"
            ? "ab_headline_impression"
            : "ab_headline_cta_click";
    const payload = {
        event: eventName,
        experiment: HEADLINE_AB_EXPERIMENT_KEY,
        variant,
        locale,
        pagePath: window.location.pathname,
        timestamp: Date.now(),
    };

    const windowWithDataLayer = window as Window & {
        dataLayer?: Array<Record<string, unknown>>;
    };
    windowWithDataLayer.dataLayer?.push(payload);

    window.fbq?.(
        "trackCustom",
        eventType === "impression" ? "ABHeadlineImpression" : "ABHeadlineCtaClick",
        {
            experiment: HEADLINE_AB_EXPERIMENT_KEY,
            variant,
            locale,
        }
    );

    window.ttq?.track?.(
        eventType === "impression" ? "ABHeadlineImpression" : "ABHeadlineCtaClick",
        {
            content_name: "home_headline_ab_test",
            experiment: HEADLINE_AB_EXPERIMENT_KEY,
            variant,
            locale,
        }
    );
}

export function HeroSection() {
    const t = useTranslations("home.hero");
    const locale = useLocale();
    const isPtLocale = locale === "pt";
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const songIndexRef = useRef(-1);
    const [headlineVariant, setHeadlineVariant] = useState<HeadlineAbVariant>("A");
    const hasTrackedImpressionRef = useRef(false);
    const sampleSongs = locale === "pt" ? SAMPLE_SONGS_PT : locale === "es" ? SAMPLE_SONGS_ES : locale === "fr" ? SAMPLE_SONGS_FR : locale === "it" ? SAMPLE_SONGS_IT : SAMPLE_SONGS_EN;
    const [currentSongUrl, setCurrentSongUrl] = useState(sampleSongs[0]);

    useEffect(() => {
        songIndexRef.current = Math.floor(Math.random() * sampleSongs.length);
        setCurrentSongUrl(sampleSongs[songIndexRef.current]);
    }, [sampleSongs]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onEnded = () => {
            songIndexRef.current = (songIndexRef.current + 1) % sampleSongs.length;
            setCurrentSongUrl(sampleSongs[songIndexRef.current]);
        };
        audio.addEventListener("ended", onEnded);
        return () => audio.removeEventListener("ended", onEnded);
    }, [sampleSongs]);

    const hasMountedRef = useRef(false);
    useEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }
        const audio = audioRef.current;
        if (audio && isPlaying) {
            audio.load();
            audio.play().catch(console.error);
        }
    }, [currentSongUrl]);

    const toggleAudio = () => {
        const audio = audioRef.current;
        if (audio) {
            if (isPlaying) {
                audio.pause();
            } else {
                audio.play().catch(console.error);
            }
            setIsPlaying(!isPlaying);
        }
    };

    const meta = t.raw("meta") as string[];
    const ptHeadlineCopy = isPtLocale ? PT_HEADLINE_VARIANTS[headlineVariant] : null;
    const badgeText = ptHeadlineCopy?.badge ?? meta[0] ?? t("badge");
    const descriptionText = ptHeadlineCopy?.description ?? t("description");
    const primaryCtaText = ptHeadlineCopy?.cta ?? t("primaryCta");
    const createHref = isPtLocale
        ? {
            pathname: "/create",
            query: {
                [HEADLINE_AB_QUERY_PARAM]: headlineVariant,
                ab_experiment: HEADLINE_AB_EXPERIMENT_KEY,
            },
        }
        : "/create";

    useEffect(() => {
        if (!isPtLocale) return;

        const assignedVariant = getOrAssignHeadlineAbVariant();
        setHeadlineVariant(assignedVariant);

        if (!hasTrackedImpressionRef.current) {
            trackHeadlineExperimentEvent("impression", assignedVariant, locale);
            hasTrackedImpressionRef.current = true;
        }
    }, [isPtLocale, locale]);

    const handlePrimaryCtaClick = () => {
        if (!isPtLocale) return;
        trackHeadlineExperimentEvent("cta_click", headlineVariant, locale);
    };

    return (
        <section className="relative w-full overflow-hidden bg-porcelain min-h-[90vh] flex items-center pb-20 pt-10">
            {/* Subtle glow - Aegean Blue with Apollo Sun motif */}
            <div className="absolute top-1/4 -left-32 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,_rgba(74,142,154,0.06)_0%,_transparent_50%)] pointer-events-none flex items-center justify-center">
                <ApolloSun className="w-[600px] h-[600px] text-aegean/5 animate-[spin_120s_linear_infinite]" />
            </div>

            <div className="container px-6 mx-auto relative z-10">
                <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">

                    {/* Left: Typography Statement */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
                        className="flex-1 max-w-2xl"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-dark/10 bg-white/50 backdrop-blur-sm mb-8">
                            <Star className="w-3.5 h-3.5 text-aegean fill-aegean" />
                            <span className="text-xs font-semibold tracking-widest uppercase text-dark/70">
                                {badgeText}
                            </span>
                        </div>

                        <h1 className="text-5xl lg:text-[4.5rem] font-serif font-bold text-dark leading-[1.05] tracking-tight mb-8">
                            {ptHeadlineCopy ? (
                                <>
                                    {ptHeadlineCopy.title}{" "}
                                    {ptHeadlineCopy.titleHighlight && (
                                        <span className="text-aegean italic block mt-2">{ptHeadlineCopy.titleHighlight}</span>
                                    )}
                                </>
                            ) : (
                                <>
                                    {t("title")}{" "}
                                    <span className="text-aegean italic block mt-2">{t("titleHighlight")}</span>
                                </>
                            )}
                        </h1>

                        <p className="text-xl lg:text-2xl text-dark/60 leading-relaxed font-serif italic mb-10 max-w-xl">
                            {descriptionText}
                        </p>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            <Link href={createHref}>
                                <GreekCTA onClick={handlePrimaryCtaClick}>
                                    {primaryCtaText}
                                </GreekCTA>
                            </Link>

                            {/* Social Proof Mini */}
                            <div className="flex items-center gap-3">
                                <div className="flex -space-x-2">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="relative w-8 h-8 rounded-full border-2 border-porcelain overflow-hidden shadow-sm">
                                            <Image src={`/images/avatars/avatar-${i}.webp`} alt={`Customer`} fill sizes="32px" className="object-cover" />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1">
                                        <Star className="w-3 h-3 text-aegean fill-aegean" />
                                        <span className="text-xs font-bold text-dark">4.99</span>
                                    </div>
                                    <span className="text-[10px] uppercase tracking-wider text-dark/50 font-semibold">{t("socialProof.highlight")}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right: Floating Video Art Direction */}
                    <div className="flex-1 w-full max-w-2xl relative">
                        {SHOW_HOME_HERO_VIDEO && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ duration: 1, delay: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
                                className="relative aspect-[4/5] md:aspect-video lg:aspect-[4/5] rounded-[2rem] overflow-hidden shadow-2xl shadow-dark/5 border border-white/50 bg-white"
                            >
                                <iframe
                                    src={HOME_HERO_VIDEO_EMBED_URL}
                                    title="Hero video"
                                    className="absolute inset-0 w-full h-[120%] -top-[10%] pointer-events-none object-cover"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    sandbox="allow-scripts allow-same-origin allow-presentation"
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-dark/40 via-transparent to-transparent pointer-events-none" />

                                <audio ref={audioRef} src={currentSongUrl} playsInline />

                                <button
                                    onClick={toggleAudio}
                                    className="absolute bottom-8 left-8 z-10 flex items-center gap-3 px-6 py-4 bg-white/90 backdrop-blur-md rounded-full shadow-xl hover:bg-white hover:scale-105 transition-all duration-300"
                                >
                                    <span className="w-10 h-10 rounded-full bg-aegean flex items-center justify-center shadow-inner">
                                        {isPlaying ? (
                                            <Volume2 className="w-4 h-4 text-white" />
                                        ) : (
                                            <Play className="w-4 h-4 fill-white text-white ml-1" />
                                        )}
                                    </span>
                                    <span className="text-sm font-bold tracking-widest uppercase text-dark">
                                        {isPlaying ? t("video.muteButton") : t("video.listenButton")}
                                    </span>
                                </button>
                            </motion.div>
                        )}

                        {/* Decorative floating element */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 1, delay: 0.6 }}
                            className="absolute -bottom-6 -right-6 bg-white p-4 rounded-xl shadow-lg border border-dark/5 flex items-center gap-3"
                        >
                            <div className="w-12 h-12 bg-cream rounded-full flex items-center justify-center">
                                <LaurelWreath className="w-6 h-6 text-aegean" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-dark">{meta[2]}</p>
                                <p className="text-xs text-dark/50 font-serif italic">Entrega garantida</p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
