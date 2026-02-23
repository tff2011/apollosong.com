"use client";

import { Music, Play } from "lucide-react";
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

interface RevealStageProps {
    locale: string;
    logoText: string;
    recipientName: string;
    genre: string;
    createdAt: Date;
    subtitle: string;
    playButtonText: string;
    genreLabel: string;
    createdOnLabel: string;
    onPlay: () => void;
}

export function RevealStage({
    locale,
    logoText,
    recipientName,
    genre,
    createdAt,
    subtitle,
    playButtonText,
    genreLabel,
    createdOnLabel,
    onPlay,
}: RevealStageProps) {
    const genreLabels = locale === "pt" ? genreLabelsPT : genreLabelsEN;
    const dateLocale = locale === "pt" ? ptBR : enUS;
    const formattedDate = format(new Date(createdAt), "PPP", { locale: dateLocale });
    const genreDisplay = genreLabels[genre] || genre;

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

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                {/* Decorative Stars */}
                <div className="flex justify-center gap-2 mb-6 animate-fade-up">
                    <span className="text-[#C9A84C]/60">✦</span>
                    <span className="text-[#C9A84C]/60">✦</span>
                    <span className="text-[#C9A84C] text-xl">✦</span>
                    <span className="text-[#C9A84C]/60">✦</span>
                    <span className="text-[#C9A84C]/60">✦</span>
                </div>

                {/* Subtitle */}
                <p className="text-[#78716C] text-lg md:text-xl text-center mb-4 animate-fade-up animate-delay-100">
                    {subtitle}
                </p>

                {/* Recipient Name - The Big Reveal */}
                <div className="animate-reveal-scale mb-8">
                    <div className="bg-[#111827] border-2 border-[#C9A84C] rounded-2xl px-8 md:px-12 py-6 shadow-lg">
                        <h1 className="text-3xl md:text-5xl font-serif text-[#F0EDE6] tracking-wide text-center">
                            {recipientName}
                        </h1>
                    </div>
                </div>

                {/* Play Button - Prominent */}
                <Button
                    onClick={onPlay}
                    size="lg"
                    className="bg-[#C9A84C] hover:bg-[#A89240] text-white px-12 py-8 text-xl rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 mb-8 animate-fade-up animate-delay-200"
                >
                    <Play className="w-6 h-6 mr-3 fill-current" />
                    {playButtonText}
                </Button>

                {/* Details */}
                <div className="flex flex-wrap justify-center gap-4 text-[#9A9488] text-sm animate-fade-up animate-delay-300">
                    <div className="flex items-center gap-1">
                        <Music className="w-4 h-4 text-[#C9A84C]" />
                        <span>{genreLabel}: {genreDisplay}</span>
                    </div>
                    <span className="text-[#E8DDD3]">•</span>
                    <div>
                        <span>{createdOnLabel}: {formattedDate}</span>
                    </div>
                </div>
            </div>

            {/* Subtle footer */}
            <div className="py-4 text-center">
                <a
                    href={`https://apollosong.com${locale === "pt" ? "/pt" : ""}`}
                    className="text-[#C9A84C]/40 text-xs hover:text-[#C9A84C]/60"
                >
                    {locale === "pt" ? "apollosong.com/pt" : "apollosong.com"}
                </a>
            </div>
        </div>
    );
}
