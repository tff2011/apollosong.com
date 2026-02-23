"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Loader2, Music, Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { pdf } from "@react-pdf/renderer";
import { LyricsPDF } from "~/components/certificate/lyrics-pdf";

interface LyricsPageViewProps {
    orderId: string;
    locale: string;
}

// Translations
const translations = {
    en: {
        loading: "Loading your lyrics...",
        notFound: {
            title: "Lyrics Not Found",
            description: "We couldn't find the lyrics you're looking for. The link may be invalid or the lyrics haven't been generated yet.",
            goHome: "Go Home",
        },
        noAccess: {
            title: "Lyrics Not Available",
            description: "The lyrics add-on was not purchased for this order.",
            goHome: "Go Home",
        },
        header: {
            logo: "ApolloSong",
            title: "Song Lyrics",
            subtitle: "An exclusive song for",
        },
        continuation: "continued",
        page: "Page",
        of: "of",
        download: {
            button: "Download PDF",
            downloading: "Generating...",
        },
        footer: "Created with love",
        websiteDisplay: "apollosong.com",
        websiteHref: "https://apollosong.com",
    },
    pt: {
        loading: "Carregando sua letra...",
        notFound: {
            title: "Letra Não Encontrada",
            description: "Não encontramos a letra que você procura. O link pode estar inválido ou a letra ainda não foi gerada.",
            goHome: "Voltar ao Início",
        },
        noAccess: {
            title: "Letra Não Disponível",
            description: "O complemento de letra não foi adquirido para este pedido.",
            goHome: "Voltar ao Início",
        },
        header: {
            logo: "Apollo Song",
            title: "Letra da Música",
            subtitle: "Uma canção exclusiva para",
        },
        continuation: "continuação",
        page: "Página",
        of: "de",
        download: {
            button: "Baixar PDF",
            downloading: "Gerando...",
        },
        footer: "Criado com amor",
        websiteDisplay: "apollosong.com/pt",
        websiteHref: "https://apollosong.com/pt",
    },
    es: {
        loading: "Cargando tu letra...",
        notFound: {
            title: "Letra No Encontrada",
            description: "No pudimos encontrar la letra que buscas. El enlace puede ser inválido o la letra aún no ha sido generada.",
            goHome: "Volver al Inicio",
        },
        noAccess: {
            title: "Letra No Disponible",
            description: "El complemento de letra no fue adquirido para este pedido.",
            goHome: "Volver al Inicio",
        },
        header: {
            logo: "ApolloSong",
            title: "Letra de la Canción",
            subtitle: "Una canción exclusiva para",
        },
        continuation: "continuación",
        page: "Página",
        of: "de",
        download: {
            button: "Descargar PDF",
            downloading: "Generando...",
        },
        footer: "Creado con amor",
        websiteDisplay: "apollosong.com/es",
        websiteHref: "https://apollosong.com/es",
    },
};

// Estimate how many lines a verse takes
function estimateVerseLines(verse: string): number {
    return verse.split("\n").length;
}

// Split verses into pages (same logic as PDF)
function splitVersesIntoPages(verses: string[]): string[][] {
    const pages: string[][] = [];
    let currentPage: string[] = [];
    let currentLines = 0;

    // First page has full header, so less space for lyrics
    const FIRST_PAGE_MAX_LINES = 18;
    // Continuation pages have smaller header
    const CONTINUATION_PAGE_MAX_LINES = 24;

    for (const verse of verses) {
        const verseLines = estimateVerseLines(verse);
        const maxLines = pages.length === 0 ? FIRST_PAGE_MAX_LINES : CONTINUATION_PAGE_MAX_LINES;

        if (currentLines + verseLines > maxLines && currentPage.length > 0) {
            pages.push(currentPage);
            currentPage = [];
            currentLines = 0;
        }

        currentPage.push(verse);
        currentLines += verseLines + 1;
    }

    if (currentPage.length > 0) {
        pages.push(currentPage);
    }

    return pages;
}

export function LyricsPageView({ orderId, locale }: LyricsPageViewProps) {
    const t = translations[locale as keyof typeof translations] || translations.en;
    const [isDownloading, setIsDownloading] = useState(false);

    const { data, isLoading, error } = api.songOrder.getLyricsById.useQuery(
        { orderId },
        {
            retry: false,
            staleTime: 0,
            refetchOnMount: "always",
        }
    );

    const handleDownloadPdf = async () => {
        if (!data) return;
        setIsDownloading(true);

        try {
            const blob = await pdf(
                <LyricsPDF
                    recipientName={data.recipientName}
                    lyrics={data.lyrics}
                    locale={locale}
                />
            ).toBlob();

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `lyrics-${data.recipientName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to generate lyrics PDF:", error);
        } finally {
            setIsDownloading(false);
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center text-[#1A1A2E]">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-[#4A8E9A]" />
                    <p>{t.loading}</p>
                </div>
            </div>
        );
    }

    // Error / Not found state
    if (error || !data) {
        const isNoAccess = error?.message?.includes("not purchased");
        const errorT = isNoAccess ? t.noAccess : t.notFound;

        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center p-4">
                <div className="text-center text-[#1A1A2E] max-w-md">
                    <div className="w-20 h-20 rounded-full bg-[#4A8E9A]/10 flex items-center justify-center mx-auto mb-6">
                        <Music className="w-10 h-10 text-[#4A8E9A]" />
                    </div>
                    <h1 className="text-2xl font-serif mb-4">{errorT.title}</h1>
                    <p className="text-[#78716C] mb-8">{errorT.description}</p>
                    <Link href={`/${locale}`}>
                        <Button className="bg-[#4A8E9A] hover:bg-[#A89240] text-white">
                            {errorT.goHome}
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    // Split lyrics into verses and pages
    const verses = data.lyrics.split(/\n\s*\n/);
    const pages = splitVersesIntoPages(verses);

    return (
        <div className="min-h-screen bg-[#E8DDD3] py-8 px-4">
            {/* Download button - fixed at top */}
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-end">
                <Button
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                    className="bg-[#4A8E9A] hover:bg-[#A89240] text-white gap-2"
                >
                    {isDownloading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t.download.downloading}
                        </>
                    ) : (
                        <>
                            <Download className="w-4 h-4" />
                            {t.download.button}
                        </>
                    )}
                </Button>
            </div>

            {/* A4 Pages */}
            <div className="max-w-[210mm] mx-auto space-y-8">
                {pages.map((pageVerses, pageIndex) => (
                    <div
                        key={pageIndex}
                        className="bg-white rounded-xl shadow-2xl overflow-hidden"
                        style={{
                            minHeight: "297mm",
                            aspectRatio: "210 / 297",
                        }}
                    >
                        {/* Gold top border */}
                        <div className="h-1.5 bg-[#4A8E9A]" />

                        <div className="p-10 md:p-12 h-full flex flex-col">
                            {pageIndex === 0 ? (
                                /* First page - full header */
                                <>
                                    {/* Header */}
                                    <div className="text-center mb-6">
                                        <h1 className="text-2xl font-serif font-bold text-[#1A1A2E] tracking-wide">
                                            {t.header.logo}
                                        </h1>
                                    </div>

                                    {/* Decorative dots */}
                                    <div className="flex items-center justify-center gap-2 mb-6">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#4A8E9A] opacity-50" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#4A8E9A] opacity-50" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#4A8E9A]" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#4A8E9A] opacity-50" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#4A8E9A] opacity-50" />
                                    </div>

                                    {/* Title */}
                                    <h2 className="text-3xl font-serif font-bold text-[#1A1A2E] text-center mb-2 tracking-wide">
                                        {t.header.title}
                                    </h2>
                                    <p className="text-[#78716C] text-center mb-5">
                                        {t.header.subtitle}
                                    </p>

                                    {/* Recipient name box */}
                                    <div className="flex justify-center mb-6">
                                        <div className="border-2 border-[#4A8E9A] rounded-xl px-8 py-3 bg-porcelain">
                                            <p className="text-xl font-serif font-bold text-[#1A1A2E] tracking-wide">
                                                {data.recipientName}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="flex items-center justify-center gap-3 mb-6">
                                        <div className="w-12 h-px bg-[#4A8E9A] opacity-40" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#4A8E9A]" />
                                        <div className="w-12 h-px bg-[#4A8E9A] opacity-40" />
                                    </div>
                                </>
                            ) : (
                                /* Continuation pages - smaller header */
                                <div className="text-center mb-4">
                                    <h1 className="text-lg font-serif font-bold text-[#1A1A2E] tracking-wide">
                                        {t.header.logo}
                                    </h1>
                                    <p className="text-sm text-[#78716C] mt-1">
                                        {t.header.title} - {data.recipientName} ({t.continuation})
                                    </p>
                                </div>
                            )}

                            {/* Lyrics */}
                            <div className="bg-porcelain rounded-xl p-6 md:p-8 border border-[#E8DDD3] flex-grow">
                                {pageVerses.map((verse, index) => (
                                    <p
                                        key={index}
                                        className="text-[#44403C] leading-relaxed whitespace-pre-wrap mb-5 last:mb-0"
                                        style={{ lineHeight: "1.9" }}
                                    >
                                        {verse}
                                    </p>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="mt-6 text-center">
                                <p className="text-sm text-[#B8B0A5] mb-2">
                                    {t.footer}
                                </p>

                                {/* Elegant pagination */}
                                {pages.length > 1 && (
                                    <div className="flex items-center justify-center gap-3 mb-2">
                                        <div className="w-8 h-px bg-[#4A8E9A] opacity-30" />
                                        <span className="text-xs text-[#4A8E9A] font-medium tracking-wider">
                                            {pageIndex + 1} / {pages.length}
                                        </span>
                                        <div className="w-8 h-px bg-[#4A8E9A] opacity-30" />
                                    </div>
                                )}

                                <a
                                    href={t.websiteHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-semibold text-[#4A8E9A] hover:underline"
                                >
                                    {t.websiteDisplay}
                                </a>
                            </div>
                        </div>

                        {/* Gold bottom border */}
                        <div className="h-1.5 bg-[#4A8E9A]" />
                    </div>
                ))}
            </div>

            {/* Bottom spacing */}
            <div className="h-8" />
        </div>
    );
}
