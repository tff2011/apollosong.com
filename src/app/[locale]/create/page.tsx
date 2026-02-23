import { Suspense } from "react";
import { SongQuiz } from "~/components/create/song-quiz";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";
import { createTranslator } from "~/i18n/server";
import { buildAlternates } from "~/i18n/metadata";
import { db } from "~/server/db";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const alternates = buildAlternates("/create", locale);

    const titles = {
        en: "Create Your Custom Christian Song | ApolloSong",
        pt: "Crie Sua Canção Cristã Personalizada | ApolloSong",
        es: "Crea Tu Canción Cristiana Personalizada | ApolloSong",
        fr: "Créez Votre Chanson Chrétienne Personnalisée | ChansonDivine",
        it: "Crea la Tua Canzone Cristiana Personalizzata | ApolloSong",
    };

    const descriptions = {
        en: "Tell us your story and we'll create a beautiful, personalized Christian song for your loved one. Start your faith-filled musical journey today.",
        pt: "Conte-nos sua história e criaremos uma bela canção cristã personalizada para quem você ama. Comece sua jornada musical cheia de fé hoje.",
        es: "Cuéntanos tu historia y crearemos una hermosa canción cristiana personalizada para tu ser querido. Comienza tu viaje musical lleno de fe hoy.",
        fr: "Racontez-nous votre histoire et nous créerons une belle chanson chrétienne personnalisée pour votre proche. Commencez votre voyage musical rempli de foi aujourd'hui.",
        it: "Raccontaci la tua storia e creeremo una bellissima canzone cristiana personalizzata per chi ami. Inizia oggi il tuo viaggio musicale pieno di fede.",
    };

    const siteNames = {
        en: "ApolloSong",
        pt: "ApolloSong",
        es: "ApolloSong",
        fr: "ChansonDivine",
        it: "ApolloSong",
    };

    return {
        title: titles[locale],
        description: descriptions[locale],
        alternates,
        openGraph: {
            title: titles[locale],
            description: descriptions[locale],
            url: alternates.canonical,
            siteName: siteNames[locale],
            locale,
        },
    };
}

export default async function CreatePage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const [messages, genreAudioSamples] = await Promise.all([
        loadMessages(locale, ["create.quiz", "common"]),
        db.genreAudioSample.findMany({
            where: { locale },
            select: { genre: true, audioUrl: true, vocals: true },
        }),
    ]);

    return (
        <I18nProvider locale={locale} messages={messages}>
            <Suspense fallback={<div className="min-h-screen bg-porcelain" />}>
                <SongQuiz genreAudioSamples={genreAudioSamples} />
            </Suspense>
        </I18nProvider>
    );
}
