"use client";

import { useState } from "react";
import { Download, ExternalLink, Loader2, Music, Share2, Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

// Genre labels for display
const genreLabelsEN: Record<string, string> = {
    pop: "Pop",
    country: "Country",
    rock: "Rock",
    "jovem-guarda": "Jovem Guarda",
    "rock-classico": "Classic Rock",
    "pop-rock-brasileiro": "Brazilian Pop Rock",
    "heavy-metal": "Heavy Metal",
    eletronica: "Electronic",
    "eletronica-afro-house": "Afro House",
    "eletronica-progressive-house": "Progressive House",
    "eletronica-melodic-techno": "Melodic Techno",
    latina: "Latin Music",
    salsa: "Salsa",
    merengue: "Merengue",
    bachata: "Bachata",
    bolero: "Bolero",
    rnb: "R&B",
    jazz: "Jazz",
    blues: "American Blues",
    "blues-melancholic": "American Blues (Melancholic)",
    "blues-upbeat": "American Blues (Upbeat)",
    worship: "Worship",
    hiphop: "Hip-Hop",
    funk: "Funk",
    "funk-carioca": "Funk Carioca",
    "funk-paulista": "Funk Paulista",
    "funk-melody": "Funk Melody",
    brega: "Brega",
    "brega-romantico": "Brega Romantico",
    tecnobrega: "Tecnobrega",
    samba: "Samba",
    pagode: "Pagode",
    "pagode-de-mesa": "Pagode de Mesa (Roots)",
    "pagode-romantico": "Pagode Romantico (90s)",
    "pagode-universitario": "Pagode Universitario / Novo Pagode",
    "sertanejo-raiz": "Sertanejo Raiz",
    "sertanejo-universitario": "Sertanejo Universitário",
    "sertanejo-romantico": "Sertanejo Romântico",
    "forro-pe-de-serra": "Forró Pé-de-Serra",
    "forro-pe-de-serra-rapido": "Forró Pé-de-Serra (Dançante)",
    "forro-pe-de-serra-lento": "Forró Pé-de-Serra (Lento)",
    "forro-universitario": "Forró Universitário",
    "forro-eletronico": "Forró Eletrônico",
    lullaby: "Lullaby",
    "lullaby-ninar": "Lullaby (Soothing)",
    "lullaby-animada": "Kids Song (Upbeat)",
};

const genreLabelsPT: Record<string, string> = {
    pop: "Pop",
    country: "Sertanejo",
    rock: "Rock",
    "jovem-guarda": "Jovem Guarda",
    "rock-classico": "Rock Clássico",
    "pop-rock-brasileiro": "Pop Rock Brasileiro",
    "heavy-metal": "Heavy Metal",
    eletronica: "Eletrônica",
    "eletronica-afro-house": "Afro House",
    "eletronica-progressive-house": "Progressive House",
    "eletronica-melodic-techno": "Melodic Techno",
    latina: "Música Latina",
    salsa: "Salsa",
    merengue: "Merengue",
    bachata: "Bachata",
    bolero: "Bolero",
    rnb: "Black Music",
    jazz: "Jazz",
    blues: "Blues Americano",
    "blues-melancholic": "Blues Americano (Melancólico)",
    "blues-upbeat": "Blues Americano (Alto Astral)",
    worship: "Gospel",
    hiphop: "Rap",
    funk: "Funk",
    "funk-carioca": "Funk Carioca",
    "funk-paulista": "Funk Paulista",
    "funk-melody": "Funk Melody",
    brega: "Brega",
    "brega-romantico": "Brega Romântico",
    tecnobrega: "Tecnobrega",
    samba: "Samba",
    pagode: "Pagode",
    "pagode-de-mesa": "Pagode de Mesa (Raiz)",
    "pagode-romantico": "Pagode Romântico (Anos 90)",
    "pagode-universitario": "Pagode Universitário / Novo Pagode",
    forro: "Forró",
    "sertanejo-raiz": "Sertanejo Raiz",
    "sertanejo-universitario": "Sertanejo Universitário",
    "sertanejo-romantico": "Sertanejo Romântico",
    "forro-pe-de-serra": "Forró Pé-de-Serra",
    "forro-pe-de-serra-rapido": "Forró Pé-de-Serra (Dançante)",
    "forro-pe-de-serra-lento": "Forró Pé-de-Serra (Lento)",
    "forro-universitario": "Forró Universitário",
    "forro-eletronico": "Forró Eletrônico",
    axe: "Axé",
    capoeira: "Capoeira",
    reggae: "Reggae",
    lullaby: "Infantil",
    "lullaby-ninar": "Canções de Ninar",
    "lullaby-animada": "Infantil Animada",
};

interface ExperienceStageProps {
    locale: string;
    logoText: string;
    recipientName: string;
    genre: string;
    createdAt: Date;
    songFileUrl: string | null;
    hasLyrics: boolean;
    lyrics: string | null;
    // Translation strings
    t: {
        title: string;
        subtitle: string;
        genre: string;
        createdOn: string;
        lyricsTitle: string;
        downloadCertificate: string;
        downloadLyrics: string;
        downloading: string;
        footer: string;
        shareTitle: string;
        shareCopied: string;
    };
    // Download handlers
    onDownloadCertificate: () => Promise<void>;
    onDownloadLyrics: () => Promise<void>;
}

export function ExperienceStage({
    locale,
    logoText,
    recipientName,
    genre,
    createdAt,
    songFileUrl,
    hasLyrics,
    lyrics,
    t,
    onDownloadCertificate,
    onDownloadLyrics,
}: ExperienceStageProps) {
    const genreLabels = locale === "pt" ? genreLabelsPT : genreLabelsEN;
    const dateLocale = locale === "pt" ? ptBR : enUS;
    const formattedDate = format(new Date(createdAt), "PPP", { locale: dateLocale });
    const genreDisplay = genreLabels[genre] || genre;

    // URL structure: apollosong.com/pt for PT, apollosong.com for EN
    const websiteDisplay = locale === "pt" ? "apollosong.com/pt" : "apollosong.com";
    const websiteHref = `https://apollosong.com${locale === "pt" ? "/pt" : ""}`;

    const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);
    const [isDownloadingLyrics, setIsDownloadingLyrics] = useState(false);
    const [showCopied, setShowCopied] = useState(false);
    const [audioError, setAudioError] = useState(false);

    const handleDownloadCertificate = async () => {
        setIsDownloadingCertificate(true);
        try {
            await onDownloadCertificate();
        } finally {
            setIsDownloadingCertificate(false);
        }
    };

    const handleDownloadLyrics = async () => {
        setIsDownloadingLyrics(true);
        try {
            await onDownloadLyrics();
        } finally {
            setIsDownloadingLyrics(false);
        }
    };

    const handleShare = async () => {
        const url = window.location.href;
        try {
            await navigator.clipboard.writeText(url);
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        } catch {
            // Fallback for browsers without clipboard API
            const textArea = document.createElement("textarea");
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        }
    };

    return (
        <div className="min-h-screen bg-[#0A0E1A] flex flex-col">
            {/* Header with Logo */}
            <header className="py-6 border-b border-[#E8DDD3]">
                <div className="max-w-2xl mx-auto px-4 text-center">
                    <Link href={`/${locale}`}>
                        <span className="font-serif text-2xl text-[#F0EDE6] tracking-tight">
                            {logoText}
                        </span>
                    </Link>
                </div>
            </header>

            {/* Certificate Container */}
            <div className="flex-1 max-w-2xl mx-auto w-full p-4 py-8 md:py-12">
                {/* Main Certificate Card */}
                <div className="bg-[#111827] rounded-2xl overflow-hidden shadow-lg border border-[#E8DDD3] animate-fade-up">
                    {/* Gold Header Border */}
                    <div className="h-1.5 bg-gradient-to-r from-[#C9A84C] via-[#D4BC6A] to-[#C9A84C]" />

                    {/* Certificate Content */}
                    <div className="p-8 md:p-12 text-center">
                        {/* Decorative Stars */}
                        <div className="flex justify-center gap-2 mb-6">
                            <span className="text-[#C9A84C]/60">✦</span>
                            <span className="text-[#C9A84C]/60">✦</span>
                            <span className="text-[#C9A84C] text-xl">✦</span>
                            <span className="text-[#C9A84C]/60">✦</span>
                            <span className="text-[#C9A84C]/60">✦</span>
                        </div>

                        {/* Title */}
                        <h1 className="text-3xl md:text-4xl font-serif text-[#F0EDE6] mb-3 tracking-wide">
                            {t.title}
                        </h1>

                        {/* Subtitle */}
                        <p className="text-[#78716C] text-lg mb-8">{t.subtitle}</p>

                        {/* Recipient Name */}
                        <div className="relative inline-block mb-8">
                            <div className="bg-[#0A0E1A] border-2 border-[#C9A84C] rounded-xl px-10 py-5">
                                <h2 className="text-3xl md:text-4xl font-serif text-[#F0EDE6] tracking-wide">
                                    {recipientName}
                                </h2>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="flex flex-wrap justify-center gap-6 text-[#78716C] text-sm mb-10">
                            <div>
                                <span className="text-[#C9A84C] font-medium">{t.genre}:</span>{" "}
                                {genreDisplay}
                            </div>
                            <div>
                                <span className="text-[#C9A84C] font-medium">{t.createdOn}:</span>{" "}
                                {formattedDate}
                            </div>
                        </div>

                        {/* Decorative Divider */}
                        <div className="flex items-center justify-center gap-4 mb-10">
                            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#C9A84C]/40" />
                            <Music className="w-5 h-5 text-[#C9A84C]" />
                            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#C9A84C]/40" />
                        </div>

                        {/* Audio Player Section */}
                        {songFileUrl && (
                            <div className="mb-10">
                                {!audioError ? (
                                    <audio
                                        controls
                                        playsInline
                                        preload="metadata"
                                        className="w-full max-w-md mx-auto"
                                        style={{ minHeight: "54px" }}
                                        onError={() => setAudioError(true)}
                                    >
                                        <source src={songFileUrl} type="audio/mpeg" />
                                        Your browser does not support the audio element.
                                    </audio>
                                ) : null}
                                {/* Fallback link - always show for mobile compatibility */}
                                <div className={`text-center ${audioError ? "" : "mt-3"}`}>
                                    <a
                                        href={songFileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-sm text-[#C9A84C] hover:text-[#A89240] hover:underline"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        {locale === "pt" ? "Abrir áudio em nova aba" : "Open audio in new tab"}
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* Lyrics Section (if purchased) */}
                        {hasLyrics && lyrics && (
                            <>
                                <div className="flex items-center justify-center gap-4 mb-8">
                                    <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#C9A84C]/40" />
                                    <span className="text-[#C9A84C] text-sm font-medium">{t.lyricsTitle}</span>
                                    <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#C9A84C]/40" />
                                </div>

                                <div className="bg-[#0A0E1A] rounded-xl p-6 mb-8 text-left border border-[#E8DDD3]">
                                    <pre className="whitespace-pre-wrap font-sans text-[#44403C] text-sm leading-relaxed">
                                        {lyrics}
                                    </pre>
                                </div>
                            </>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-4">
                            {/* Share Button */}
                            <Button
                                variant="outline"
                                className="border-[#E8DDD3] text-[#78716C] hover:bg-[#0A0E1A] mx-auto"
                                onClick={handleShare}
                            >
                                {showCopied ? (
                                    <>
                                        <Check className="w-4 h-4 mr-2 text-green-600" />
                                        {t.shareCopied}
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-4 h-4 mr-2" />
                                        {t.shareTitle}
                                    </>
                                )}
                            </Button>

                            {/* Download Buttons */}
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Button
                                    className="bg-[#C9A84C] hover:bg-[#A89240] text-white"
                                    onClick={handleDownloadCertificate}
                                    disabled={isDownloadingCertificate}
                                >
                                    {isDownloadingCertificate ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4 mr-2" />
                                    )}
                                    {isDownloadingCertificate ? t.downloading : t.downloadCertificate}
                                </Button>

                                {hasLyrics && lyrics && (
                                    <Button
                                        variant="outline"
                                        className="border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10"
                                        onClick={handleDownloadLyrics}
                                        disabled={isDownloadingLyrics}
                                    >
                                        {isDownloadingLyrics ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4 mr-2" />
                                        )}
                                        {isDownloadingLyrics ? t.downloading : t.downloadLyrics}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Gold Footer Border */}
                    <div className="h-1.5 bg-gradient-to-r from-[#C9A84C] via-[#D4BC6A] to-[#C9A84C]" />
                </div>

                {/* Footer */}
                <div className="text-center mt-8 space-y-3">
                    <p className="text-[#9A9488] text-sm">{t.footer}</p>
                    <a
                        href={websiteHref}
                        className="text-[#C9A84C] text-sm font-medium hover:underline block"
                    >
                        {websiteDisplay}
                    </a>
                    {/* Discrete CTA */}
                    <p className="text-[#B8B0A5] text-xs pt-2">
                        {locale === "pt" ? (
                            <>
                                Quer homenagear alguém especial?{" "}
                                <a href={`${websiteHref}/create`} className="text-[#C9A84C] hover:underline">
                                    Crie uma canção
                                </a>
                            </>
                        ) : (
                            <>
                                Want to honor someone special?{" "}
                                <a href={`${websiteHref}/create`} className="text-[#C9A84C] hover:underline">
                                    Create a song
                                </a>
                            </>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
