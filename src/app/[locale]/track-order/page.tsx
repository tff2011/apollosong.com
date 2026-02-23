import { Suspense } from "react";
import { TrackOrderPageClient } from "./track-order-page";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";
import { createTranslator } from "~/i18n/server";
import { buildAlternates } from "~/i18n/metadata";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["track-order"]);
    const t = createTranslator(messages, "track-order.seo");
    const alternates = buildAlternates("/track-order", locale);
    const titleValue = t.raw("title");
    const descriptionValue = t.raw("description");
    const title =
        typeof titleValue === "string" ? titleValue : "Track Your Song Order | ApolloSong";
    const description =
        typeof descriptionValue === "string"
            ? descriptionValue
            : "Check the status of your personalized Christian song order.";

    return {
        title,
        description,
        alternates,
        openGraph: {
            title,
            description,
            url: alternates.canonical,
            siteName: "ApolloSong",
            locale,
        },
        twitter: {
            card: "summary",
            title,
            description,
        },
    };
}

export default async function TrackOrderPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["track-order", "common"]);

    return (
        <I18nProvider locale={locale} messages={messages}>
            <Suspense fallback={null}>
                <TrackOrderPageClient />
            </Suspense>
        </I18nProvider>
    );
}
