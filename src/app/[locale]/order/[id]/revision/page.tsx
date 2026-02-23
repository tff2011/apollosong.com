import { Suspense } from "react";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";
import { notFound } from "next/navigation";
import { createTranslator } from "~/i18n/server";
import { RevisionPageClient } from "./revision-page";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["revision"]);
    const t = createTranslator(messages, "revision");
    const titleValue = t.raw("title");
    const descriptionValue = t.raw("subtitle");
    const title = typeof titleValue === "string" ? titleValue : "Request Revision";
    const description =
        typeof descriptionValue === "string"
            ? descriptionValue
            : "Request a revision for your song.";

    return {
        title,
        description,
        robots: {
            index: false,
            follow: false,
        },
    };
}

export default async function RevisionPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { locale: localeParam, id } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;

    if (!id || id.length < 10) {
        notFound();
    }

    const messages = await loadMessages(locale, ["revision", "common"]);

    return (
        <I18nProvider locale={locale} messages={messages}>
            <Suspense fallback={<div className="min-h-screen bg-porcelain" />}>
                <RevisionPageClient orderId={id} />
            </Suspense>
        </I18nProvider>
    );
}
