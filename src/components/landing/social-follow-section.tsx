"use client";

import { ArrowUpRight, Instagram, Landmark } from "lucide-react";
import { useTranslations } from "~/i18n/provider";

const TikTokIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z" />
    </svg>
);

export function SocialFollowSection() {
    const t = useTranslations("home.socialFollow");

    return (
        <section className="relative overflow-hidden bg-cream py-20 md:py-24">
            <div className="pointer-events-none absolute -left-28 top-12 h-72 w-72 rounded-full bg-aegean/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 right-10 h-64 w-64 rounded-full bg-aegean/10 blur-3xl" />

            <div className="container mx-auto px-4">
                <div className="mx-auto max-w-5xl">
                    <div className="relative overflow-hidden rounded-[2rem] border border-aegean/20 bg-porcelain/90 shadow-2xl shadow-aegean/10">
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-transparent to-aegean/5" />
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-7 border-b border-aegean/20 bg-[repeating-linear-gradient(90deg,rgba(74,142,154,0.12)_0,rgba(74,142,154,0.12)_14px,transparent_14px,transparent_28px)]" />
                        <div className="pointer-events-none absolute inset-x-12 bottom-0 h-5 border-t border-aegean/20 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_8px,rgba(74,142,154,0.12)_8px,rgba(74,142,154,0.12)_16px)]" />

                        <div className="pointer-events-none absolute bottom-8 left-4 top-12 hidden w-10 rounded-full border border-aegean/20 bg-gradient-to-b from-white/80 to-cream md:block" />
                        <div className="pointer-events-none absolute bottom-8 right-4 top-12 hidden w-10 rounded-full border border-aegean/20 bg-gradient-to-b from-white/80 to-cream md:block" />

                        <div className="relative z-10 px-6 pb-10 pt-14 text-center md:px-14 md:pb-14 md:pt-16">
                            <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-dark/55">
                                <Landmark className="h-4 w-4 text-aegean/80" />
                                {t("eyebrow")}
                                <Landmark className="h-4 w-4 text-aegean/80" />
                            </p>

                            <h3 className="mx-auto max-w-3xl text-3xl font-serif font-bold tracking-tight text-dark md:text-5xl">
                                {t("title")}
                            </h3>
                            <p className="mx-auto mt-4 max-w-3xl text-base text-dark/65 md:text-xl">
                                {t("description")}
                            </p>

                            <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
                                <a
                                    href="https://www.instagram.com/apollosongbr"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-center justify-between rounded-2xl border border-aegean/20 bg-white/80 px-5 py-4 text-dark shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-aegean/40 hover:shadow-lg hover:shadow-aegean/15"
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-aegean/30 bg-aegean/10 text-aegean">
                                            <Instagram className="h-5 w-5" />
                                        </span>
                                        <span className="text-base font-semibold">{t("instagramCta")}</span>
                                    </span>
                                    <ArrowUpRight className="h-5 w-5 text-dark/45 transition-colors group-hover:text-aegean" />
                                </a>

                                <a
                                    href="https://tiktok.com/@apollosong"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-center justify-between rounded-2xl border border-aegean/20 bg-white/80 px-5 py-4 text-dark shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-aegean/40 hover:shadow-lg hover:shadow-aegean/15"
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-aegean/30 bg-aegean/10 text-aegean">
                                            <TikTokIcon className="h-5 w-5" />
                                        </span>
                                        <span className="text-base font-semibold">{t("tiktokCta")}</span>
                                    </span>
                                    <ArrowUpRight className="h-5 w-5 text-dark/45 transition-colors group-hover:text-aegean" />
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
