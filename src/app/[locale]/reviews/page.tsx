import { ReviewsSection } from "~/components/landing/reviews-section";
import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { FinalCTA } from "~/components/landing/final-cta";
import { HydrateClient } from "~/trpc/server";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;

    const metadata: Record<string, { title: string; description: string }> = {
        pt: {
            title: "Apollo Song é Confiável? Veja Avaliações Reais de Clientes",
            description: "Descubra por que mais de 1000 famílias confiam na Apollo Song para criar músicas cristãs personalizadas. Veja depoimentos reais e avaliações verificadas.",
        },
        es: {
            title: "Reseñas - ApolloSong",
            description: "Lee lo que las familias dicen sobre sus canciones personalizadas.",
        },
        fr: {
            title: "Avis - ApolloSong",
            description: "Découvrez ce que les familles disent de leurs chansons personnalisées.",
        },
        it: {
            title: "Recensioni - ApolloSong",
            description: "Leggi cosa dicono le famiglie delle loro canzoni personalizzate.",
        },
        en: {
            title: "Reviews - ApolloSong",
            description: "Read what families are saying about their custom songs.",
        },
    };

    const localeMetadata = metadata[locale] ?? metadata.en!;
    const { title, description } = localeMetadata;

    return {
        title,
        description,
        alternates: {
            canonical: `/${locale}/reviews`,
            languages: {
                en: "/en/reviews",
                pt: "/pt/reviews",
                es: "/es/reviews",
                fr: "/fr/reviews",
                it: "/it/reviews",
            }
        }
    };
}

export default async function ReviewsPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, [
        "home.reviews",
        "home.finalCta",
        "common",
        "home.hero" // Potentially needed for header/footer
    ]);

    return (
        <HydrateClient>
            <I18nProvider locale={locale} messages={messages}>
                <main className="min-h-screen bg-cream selection:bg-aegean/20">
                    <SiteHeader />
                    <div className="pt-20"> {/* Add padding for sticky header */}
                        <ReviewsSection />
                    </div>
                    <FinalCTA />
                    <SiteFooter />
                </main>
            </I18nProvider>
        </HydrateClient>
    );
}
