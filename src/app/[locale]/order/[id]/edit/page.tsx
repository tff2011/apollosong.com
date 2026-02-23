import { Suspense } from "react";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";
import { notFound } from "next/navigation";
import { createTranslator } from "~/i18n/server";
import { EditOrderPageClient } from "./edit-order-page";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["order-edit"]);
    const t = createTranslator(messages, "order-edit");
    const titleValue = t.raw("title");
    const descriptionValue = t.raw("subtitle");
    const title = typeof titleValue === "string" ? titleValue : "Edit your order";
    const description =
        typeof descriptionValue === "string"
            ? descriptionValue
            : "Update your order details before we finish the song.";

    return {
        title,
        description,
        robots: {
            index: false,
            follow: false,
        },
    };
}

export default async function EditOrderPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { locale: localeParam, id } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;

    if (!id || id.length < 10) {
        notFound();
    }

    const messages = await loadMessages(locale, ["order-edit", "create.quiz", "common"]);

    return (
        <I18nProvider locale={locale} messages={messages}>
            <Suspense fallback={<div className="min-h-screen bg-porcelain" />}>
                <EditOrderPageClient orderId={id} />
            </Suspense>
        </I18nProvider>
    );
}
