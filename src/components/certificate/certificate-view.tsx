"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { useTranslations } from "~/i18n/provider";
import { Loader2, Music } from "lucide-react";
import { Button } from "~/components/ui/button";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
import Link from "next/link";
import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { CertificatePDF } from "./certificate-pdf";
import { LyricsPDF } from "./lyrics-pdf";
import { EnvelopeStage } from "./envelope-stage";
import { RevealStage } from "./reveal-stage";
import { ExperienceStage } from "./experience-stage";

// Genre labels for display (for PDF generation)
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

type CertificateStage = "envelope" | "reveal" | "experience";

interface CertificateViewProps {
    token: string;
    locale: string;
    songOption?: 1 | 2;
}

export function CertificateView({ token, locale, songOption = 1 }: CertificateViewProps) {
    const t = useTranslations("certificate");
    const genreLabels = locale === "pt" ? genreLabelsPT : genreLabelsEN;
    const dateLocale = locale === "pt" ? ptBR : enUS;

    // Stage state for the gift-opening experience
    const [stage, setStage] = useState<CertificateStage>("envelope");

    // Branding based on locale
    const logoText = locale === "pt" ? "Apollo Song" : "ApolloSong";

    const { data, isLoading, error } = api.songOrder.getCertificateByToken.useQuery(
        { token },
        { retry: false }
    );

    // Get the current URL for PDF QR code
    const certificateUrl = typeof window !== "undefined" ? window.location.href : "";

    const handleDownloadCertificate = async () => {
        if (!data) return;
        try {
            const formattedDate = format(new Date(data.createdAt), "PPP", { locale: dateLocale });
            const genreDisplay = genreLabels[data.genre] || data.genre;

            // Generate QR code as data URL
            const qrCodeDataUrl = await QRCode.toDataURL(certificateUrl, {
                width: 200,
                margin: 1,
                color: {
                    dark: "#F0EDE6",
                    light: "#0A0E1A",
                },
            });

            const blob = await pdf(
                <CertificatePDF
                    recipientName={data.recipientName}
                    genre={genreDisplay}
                    createdAt={formattedDate}
                    locale={locale}
                    certificateUrl={certificateUrl}
                    qrCodeDataUrl={qrCodeDataUrl}
                />
            ).toBlob();

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `certificate-${data.recipientName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to generate certificate PDF:", error);
        }
    };

    const handleDownloadLyrics = async () => {
        if (!data || !data.lyrics) return;
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
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center">
                <div className="text-center text-[#F0EDE6]">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-[#C9A84C]" />
                    <p>{t("loading")}</p>
                </div>
            </div>
        );
    }

    // Error / Not found state
    if (error || !data) {
        return (
            <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center p-4">
                <div className="text-center text-[#F0EDE6] max-w-md">
                    <div className="w-20 h-20 rounded-full bg-[#C9A84C]/10 flex items-center justify-center mx-auto mb-6">
                        <Music className="w-10 h-10 text-[#C9A84C]" />
                    </div>
                    <h1 className="text-2xl font-serif mb-4">{t("notFound.title")}</h1>
                    <p className="text-[#78716C] mb-8">{t("notFound.description")}</p>
                    <Link href={`/${locale}`}>
                        <Button className="bg-[#C9A84C] hover:bg-[#A89240] text-white">
                            {t("notFound.goHome")}
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    // Stage 1: Envelope - the gift is waiting to be opened
    if (stage === "envelope") {
        return (
            <EnvelopeStage
                locale={locale}
                logoText={logoText}
                teaser={t("envelope.teaser")}
                openButtonText={t("envelope.openButton")}
                onOpen={() => setStage("reveal")}
            />
        );
    }

    // Stage 2: Reveal - showing who the song is for
    if (stage === "reveal") {
        return (
            <RevealStage
                locale={locale}
                logoText={logoText}
                recipientName={data.recipientName}
                genre={data.genre}
                createdAt={data.createdAt}
                subtitle={t("reveal.subtitle")}
                playButtonText={t("reveal.playButton")}
                genreLabel={t("genre")}
                createdOnLabel={t("createdOn")}
                onPlay={() => setStage("experience")}
            />
        );
    }

    // Stage 3: Experience - full certificate with player and downloads
    return (
        <ExperienceStage
            locale={locale}
            logoText={logoText}
            recipientName={data.recipientName}
            genre={data.genre}
            createdAt={data.createdAt}
            songFileUrl={songOption === 2 ? (data.songFileUrl2 || data.songFileUrl) : (data.songFileUrl || data.songFileUrl2)}
            hasLyrics={data.hasLyrics}
            lyrics={data.lyrics}
            t={{
                title: t("title"),
                subtitle: t("subtitle"),
                genre: t("genre"),
                createdOn: t("createdOn"),
                lyricsTitle: t("lyrics.title"),
                downloadCertificate: t("download.certificate"),
                downloadLyrics: t("lyrics.downloadPdf"),
                downloading: t("download.downloading"),
                footer: t("footer"),
                shareTitle: t("share.title"),
                shareCopied: t("share.copied"),
            }}
            onDownloadCertificate={handleDownloadCertificate}
            onDownloadLyrics={handleDownloadLyrics}
        />
    );
}
