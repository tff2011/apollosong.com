import type { Metadata } from "next";
import { LyricsPageView } from "./lyrics-page-view";

interface Props {
    params: Promise<{
        locale: string;
        orderId: string;
    }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale } = await params;
    const isPt = locale === "pt";
    const isEs = locale === "es";

    return {
        title: isEs ? "Letra de la Canción" : isPt ? "Letra da Música" : "Song Lyrics",
        description: isEs
            ? "Tu letra personalizada"
            : isPt
                ? "Sua letra personalizada"
                : "Your personalized song lyrics",
        robots: "noindex, nofollow",
    };
}

export default async function LyricsPage({ params }: Props) {
    const { locale, orderId } = await params;

    return <LyricsPageView orderId={orderId} locale={locale} />;
}
