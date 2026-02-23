import { Suspense } from "react";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";
import { notFound } from "next/navigation";
import { CheckoutPage } from "~/components/checkout/checkout-page";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;

    const titles = {
        en: "Complete Your Order | ApolloSong",
        pt: "Complete Seu Pedido | ApolloSong",
        es: "Completa Tu Pedido | ApolloSong",
        fr: "Finalisez Votre Commande | ChansonDivine",
        it: "Completa il Tuo Ordine | ApolloSong",
    };

    const descriptions = {
        en: "Complete your custom song order and start creating a beautiful gift for your loved one.",
        pt: "Complete seu pedido de canção personalizada e comece a criar um presente lindo para quem você ama.",
        es: "Completa tu pedido de canción personalizada y comienza a crear un regalo hermoso para tu ser querido.",
        fr: "Finalisez votre commande de chanson personnalisée et commencez à créer un beau cadeau pour votre proche.",
        it: "Completa il tuo ordine di canzone personalizzata e inizia a creare un bellissimo regalo per chi ami.",
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

export default async function OrderPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { locale: localeParam, id } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;

    // Basic ID validation
    if (!id || id.length < 10) {
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
                <CheckoutPage orderId={id} />
            </Suspense>
        </I18nProvider>
    );
}
