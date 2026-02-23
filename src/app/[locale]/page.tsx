import { WhatYouGetSection } from "~/components/landing/what-you-get-section";
import { GiftOccasionsSection } from "~/components/landing/gift-occasions-section";
import { CustomerLoveSection } from "~/components/landing/customer-love-section";
import { FAQSection } from "~/components/landing/faq-section";
import { FinalCTA } from "~/components/landing/final-cta";
import { GuaranteeSection } from "~/components/landing/guarantee-section";
import { HeroSection } from "~/components/landing/hero-section";
import { HowItWorks } from "~/components/landing/how-it-works";
import { ApolloStorySection } from "~/components/landing/apollo-story-section";
import { GenreAudioSamplesSection } from "~/components/landing/genre-audio-samples-section";
import { SocialFollowSection } from "~/components/landing/social-follow-section";

import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { HydrateClient } from "~/trpc/server";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale, type Locale } from "~/i18n/config";
import { createTranslator } from "~/i18n/server";
import { buildAlternates, getSiteUrl } from "~/i18n/metadata";
import { JsonLd } from "~/components/seo/json-ld";
import { db } from "~/server/db";

async function getGenreAudioSamples(locale: Locale) {
  try {
    return await db.genreAudioSample.findMany({
      where: { locale },
      select: { genre: true, audioUrl: true, vocals: true },
    });
  } catch (error) {
    console.error("Failed to load genre audio samples", { locale, error });
    return [];
  }
}

// Service schema for custom Christian songs
function getServiceSchema(locale: Locale) {
  const siteUrl = getSiteUrl()?.toString() ?? "https://apollosong.com";
  const names: Record<Locale, { name: string; description: string }> = {
    en: {
      name: "Custom Song Gift by Professional Artists",
      description:
        "Create a one-of-a-kind song from your story. Professional artists craft your memories into music in 23 styles. The perfect gift that makes them cry happy tears.",
    },
    pt: {
      name: "Música Personalizada de Presente por Artistas Profissionais",
      description:
        "Crie uma canção exclusiva com a sua história. Artistas profissionais compõem em 23 estilos. O presente perfeito que emociona quem você ama.",
    },
    es: {
      name: "Canción Personalizada de Regalo por Artistas Profesionales",
      description:
        "Crea una canción única con tu historia. Artistas profesionales componen en 23 estilos. El regalo perfecto que emociona a quien amas.",
    },
    fr: {
      name: "Chanson Personnalisée Cadeau par Artistes Professionnels",
      description:
        "Créez une chanson unique avec votre histoire. Des artistes professionnels composent en 23 styles. Le cadeau parfait qui émeut vos proches.",
    },
    it: {
      name: "Canzone Personalizzata Regalo da Artisti Professionisti",
      description:
        "Crea una canzone unica con la tua storia. Artisti professionisti compongono in 23 stili. Il regalo perfetto che emoziona chi ami.",
    },
  };

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: names[locale].name,
    description: names[locale].description,
    provider: {
      "@id": `${siteUrl}/#organization`,
    },
    serviceType: "Music Composition",
    areaServed: "Worldwide",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: "69.90",
      highPrice: "149.80",
      offerCount: "3",
    },
  };
}

// OG images per locale
const ogImages: Record<Locale, string> = {
  en: "/images/og/og-en.png",
  pt: "/images/og/og-pt.png",
  es: "/images/og/og-es.png",
  fr: "/images/og/og-fr.png",
  it: "/images/og/og-it.png",
};

export async function generateMetadata({
  params: paramsPromise,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await paramsPromise;
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const messages = await loadMessages(locale, ["home.seo"]);
  const t = createTranslator(messages, "home.seo");
  const alternates = buildAlternates("/", locale);
  const siteUrl = getSiteUrl()?.toString() ?? "https://apollosong.com";
  const titleValue = t.raw("title");
  const descriptionValue = t.raw("description");
  const openGraphTitleValue = t.raw("openGraph.title");
  const openGraphDescriptionValue = t.raw("openGraph.description");
  const title = typeof titleValue === "string" ? titleValue : "ApolloSong";
  const description =
    typeof descriptionValue === "string"
      ? descriptionValue
      : "Turn your story into a custom Christian song.";
  const ogTitle =
    typeof openGraphTitleValue === "string" ? openGraphTitleValue : title;
  const ogDescription =
    typeof openGraphDescriptionValue === "string"
      ? openGraphDescriptionValue
      : description;
  const ogImage = `${siteUrl}${ogImages[locale]}`;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: alternates.canonical,
      siteName: "ApolloSong",
      locale,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: ogTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Home({
  params: paramsPromise,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await paramsPromise;
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const [messages, genreAudioSamples] = await Promise.all([
    loadMessages(locale, [
      "home.hero",
      "home.howItWorks",
      "home.apolloStory",
      "home.genreAudio",
      "home.emotionalGallery",
      "home.reviews",
      "home.socialProof",
      "home.guarantee",
      "home.faq",
      "home.finalCta",
      "home.whatYouGet",
      "home.giftOccasions",
      "home.socialFollow",
    ]),
    getGenreAudioSamples(locale),
  ]);

  return (
    <HydrateClient>
      <JsonLd data={getServiceSchema(locale)} />
      <I18nProvider locale={locale} messages={messages}>
        <main className="min-h-screen bg-cream selection:bg-aegean/20">
          <SiteHeader />
          <HeroSection />
          <HowItWorks />
          <ApolloStorySection />
          <GenreAudioSamplesSection samples={genreAudioSamples} />
          <CustomerLoveSection />
          <GiftOccasionsSection />
          <WhatYouGetSection />
          <GuaranteeSection />
          <SocialFollowSection />
          <FAQSection />
          <FinalCTA />
          <SiteFooter />
        </main>
      </I18nProvider>
    </HydrateClient>
  );
}
