import { Suspense } from "react";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";
import { notFound } from "next/navigation";
import { SuccessPage } from "~/components/checkout/success-page";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;

    const titles = {
        en: "Payment Successful | ApolloSong",
        pt: "Pagamento Confirmado | Apollo Song",
        es: "Pago Exitoso | ApolloSong",
        fr: "Paiement Confirmé | ChansonDivine",
        it: "Pagamento Confermato | ApolloSong",
    };

    const descriptions = {
        en: "Your payment was successful! We're now creating your custom song.",
        pt: "Seu pagamento foi confirmado! Estamos criando sua canção personalizada.",
        es: "¡Tu pago fue exitoso! Estamos creando tu canción personalizada.",
        fr: "Votre paiement a été confirmé ! Nous créons maintenant votre chanson personnalisée.",
        it: "Il tuo pagamento è stato confermato! Stiamo creando la tua canzone personalizzata.",
    };

    return {
        title: titles[locale],
        description: descriptions[locale],
        robots: {
            index: false,
            follow: false,
        },
    };
}

export default async function OrderSuccessPage({
    params: paramsPromise,
    searchParams: searchParamsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
    searchParams: Promise<{ preview?: string; type?: string }>;
}) {
    const { locale: localeParam, id } = await paramsPromise;
    const { preview, type } = await searchParamsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const isPreview = preview === "true";
    const previewType =
        type === "tip"
            ? "MUSICIAN_TIP"
            : type === "genre"
            ? "GENRE_VARIANT"
            : type === "lyrics"
            ? "LYRICS_UPSELL"
            : type === "streaming"
            ? "STREAMING_UPSELL"
            : type === "karaoke"
            ? "KARAOKE_UPSELL"
            : "MAIN";

    // Basic ID validation (skip in preview mode)
    if (!isPreview && (!id || id.length < 10)) {
        notFound();
    }

    const messages = await loadMessages(locale, ["checkout", "common"]);

    return (
        <I18nProvider locale={locale} messages={messages}>
            <Suspense
                fallback={
                    <div className="min-h-screen bg-porcelain flex items-center justify-center">
                        <div className="animate-pulse text-charcoal/50">Loading...</div>
                    </div>
                }
            >
                <SuccessPage orderId={id} preview={isPreview} previewType={previewType} />
            </Suspense>
        </I18nProvider>
    );
}
