"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Play, Pause, SkipBack, SkipForward, Music, FileText, Disc, CalendarClock, Radio } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Link } from "~/i18n/navigation";
import { useTranslations, useLocale } from "~/i18n/provider";
import { GreekKey } from "~/components/ui/greek-motifs";
import { GreekCTA } from "~/components/ui/greek-cta";

const R2_URL = "https://pub-b085b85804204c82b96e15ec554b0940.r2.dev";

const songsEN = [
    { src: `${R2_URL}/songs/saving-grace.mp3`, title: "Saving Grace" },
    { src: `${R2_URL}/songs/sent-to-me-from-god.mp3`, title: "Sent To Me From God" },
    { src: `${R2_URL}/songs/stronger-now.mp3`, title: "Stronger Now" },
];

const songsPT = [
    { src: `${R2_URL}/songs/musica0-pt.mp3`, title: "Exemplo 1" },
    { src: `${R2_URL}/songs/musica1-pt.mp3`, title: "Exemplo 2" },
    { src: `${R2_URL}/songs/musica2-pt.mp3`, title: "Exemplo 3" },
];

const songsES = [
    { src: `${R2_URL}/exemplo-es-1.mp3`, title: "Ejemplo 1" },
    { src: `${R2_URL}/exemplo-es-2.mp3`, title: "Ejemplo 2" },
    { src: `${R2_URL}/exemplo-es-3.mp3`, title: "Ejemplo 3" },
];

const songsFR = [
    { src: `${R2_URL}/exemplo-fr-1.mp3`, title: "Exemple 1" },
    { src: `${R2_URL}/exemplo-fr-2.mp3`, title: "Exemple 2" },
    { src: `${R2_URL}/exemplo-fr-3.mp3`, title: "Exemple 3" },
];

const songsIT = [
    { src: `${R2_URL}/elisa-italiano.mp3`, title: "Elisa - Napoletana" },
    { src: `${R2_URL}/exemplo-it-2.mp3`, title: "Rosa - Ballata" },
    { src: `${R2_URL}/exemplo-it-3.mp3`, title: "Giuseppe - Tarantella" },
];

export function WhatYouGetSection() {
    const t = useTranslations("home.whatYouGet");
    const locale = useLocale();
    const songs = locale === "pt" ? songsPT : locale === "es" ? songsES : locale === "fr" ? songsFR : locale === "it" ? songsIT : songsEN;
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
        const handleLoadedMetadata = () => setDuration(audio.duration);
        const handleEnded = () => nextTrack();

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("ended", handleEnded);

        return () => {
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("ended", handleEnded);
        };
    }, [currentTrack]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const nextTrack = () => {
        setCurrentTrack((prev) => (prev + 1) % songs.length);
        setIsPlaying(false);
        setTimeout(() => {
            audioRef.current?.play();
            setIsPlaying(true);
        }, 100);
    };

    const prevTrack = () => {
        setCurrentTrack((prev) => (prev - 1 + songs.length) % songs.length);
        setIsPlaying(false);
        setTimeout(() => {
            audioRef.current?.play();
            setIsPlaying(true);
        }, 100);
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const features = [
        { key: "radio", icon: Music },
        { key: "lyrics", icon: FileText },
        { key: "versions", icon: Disc },
        { key: "plans", icon: CalendarClock },
        { key: "streaming", icon: Radio },
    ];

    return (
        <section className="py-24 bg-porcelain relative overflow-hidden">
            {/* Flow transition from Gift Occasions */}
            <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-porcelain to-transparent pointer-events-none z-10" />
            <div className="container mx-auto px-4 text-center relative z-10">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="mb-12"
                >
                    <span className="inline-block text-aegean text-sm font-medium tracking-[0.2em] uppercase mb-4">
                        {t("title")}
                    </span>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-dark mb-6">
                        {t("subtitle")}
                    </h2>

                    <div className="flex justify-center mb-8">
                        <GreekKey className="h-4 w-32 text-aegean/20" />
                    </div>

                    <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
                        <p className="text-lg md:text-xl text-dark/70 leading-relaxed">
                            {t("description")}
                        </p>

                        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 py-4 sm:py-3 px-6 rounded-2xl bg-white/50 border border-aegean/10 backdrop-blur-sm shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-bold text-dark/40 uppercase tracking-widest">
                                <Music className="w-4 h-4 text-aegean" />
                                <span>{t("deliveryLink")}</span>
                            </div>
                            <div className="hidden sm:block w-[1px] h-4 bg-aegean/20" />
                            <div className="flex items-center gap-2 text-xs font-bold text-dark/40 uppercase tracking-widest">
                                <FileText className="w-4 h-4 text-aegean" />
                                <span>{t("deliveryEmail")}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Vinyl Player Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="relative max-w-sm mx-auto mb-20"
                >
                    {/* Glow Effect */}
                    <div className="absolute inset-0 bg-aegean/10 blur-[80px] rounded-full scale-150 pointer-events-none" />

                    <div className="relative bg-white rounded-[2.5rem] p-6 shadow-2xl shadow-dark/5 border border-aegean/10">
                        {/* Audio Element */}
                        <audio ref={audioRef} src={songs[currentTrack]?.src} preload="metadata" playsInline />

                        {/* Vinyl Record */}
                        <div className={`relative aspect-square rounded-full bg-[#111] shadow-2xl mb-6 flex items-center justify-center ${isPlaying ? "animate-[spin_6s_linear_infinite]" : ""}`}>
                            {/* Grooves */}
                            <div className="absolute inset-4 rounded-full border border-white/5" />
                            <div className="absolute inset-8 rounded-full border border-white/5" />
                            <div className="absolute inset-12 rounded-full border border-white/5" />
                            <div className="absolute inset-16 rounded-full border border-white/5" />

                            {/* Shine effect */}
                            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 via-transparent to-transparent" />

                            {/* Label */}
                            <div className="absolute inset-0 m-auto w-1/3 h-1/3 bg-gradient-to-br from-aegean to-[#e6683c] rounded-full flex items-center justify-center border-2 border-white/20 shadow-inner">
                                <span className="font-serif font-bold text-white text-sm">{t("vinylLabel")}</span>
                            </div>
                        </div>

                        {/* Player Controls */}
                        <div className="space-y-4">
                            {/* Progress Bar */}
                            <div className="flex items-center gap-3 text-xs font-medium text-dark/40">
                                <span>{formatTime(currentTime)}</span>
                                <div className="flex-1 h-2 bg-dark/5 rounded-full overflow-hidden border border-dark/10">
                                    <div
                                        className="h-full bg-gradient-to-r from-aegean to-aegean rounded-full transition-all duration-200"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <span>{formatTime(duration)}</span>
                            </div>

                            {/* Buttons */}
                            <div className="flex items-center justify-center gap-6">
                                <button
                                    onClick={prevTrack}
                                    className="text-dark/40 hover:text-aegean transition-colors"
                                >
                                    <SkipBack className="w-5 h-5 fill-current" />
                                </button>
                                <button
                                    onClick={togglePlay}
                                    className="w-14 h-14 rounded-full bg-aegean shadow-lg shadow-aegean/40 flex items-center justify-center hover:scale-105 transition-transform"
                                >
                                    {isPlaying ? (
                                        <Pause className="w-6 h-6 fill-white text-white" />
                                    ) : (
                                        <Play className="w-6 h-6 fill-white text-white ml-0.5" />
                                    )}
                                </button>
                                <button
                                    onClick={nextTrack}
                                    className="text-dark/40 hover:text-aegean transition-colors"
                                >
                                    <SkipForward className="w-5 h-5 fill-current" />
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Features Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 max-w-6xl mx-auto mb-16">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.key}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: index * 0.1 }}
                            className="bg-white rounded-2xl p-6 shadow-lg shadow-dark/5 border border-aegean/10 hover:shadow-xl hover:shadow-aegean/10 transition-all duration-300"
                        >
                            <div className="w-12 h-12 rounded-xl bg-aegean/10 flex items-center justify-center mb-4 mx-auto">
                                <feature.icon className="w-6 h-6 text-aegean" />
                            </div>
                            <h3 className="font-serif font-bold text-xl text-dark mb-2">
                                {t(`features.${feature.key}.title`)}
                            </h3>
                            <p className="text-dark/60 text-sm leading-relaxed">
                                {t(`features.${feature.key}.description`)}
                            </p>
                        </motion.div>
                    ))}
                </div>

                {/* CTA Button */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                >
                    <Link href="/create">
                        <GreekCTA>
                            {t("cta")}
                        </GreekCTA>
                    </Link>
                </motion.div>
            </div>

            {/* Bottom transition divider */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0] transform rotate-180">
                <svg className="relative block w-full h-[60px]" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" fill="#F9F8F6" opacity="1"></path>
                </svg>
            </div>
        </section>
    );
}
