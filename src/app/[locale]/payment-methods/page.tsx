import { SiteFooter } from "~/components/landing/site-footer";
import { SiteHeader } from "~/components/landing/site-header";
import { defaultLocale, isLocale } from "~/i18n/config";
import { loadMessages } from "~/i18n/messages";
import { createTranslator } from "~/i18n/server";
import { buildAlternates } from "~/i18n/metadata";
import { CreditCard, Smartphone, ShieldCheck, Zap } from "lucide-react";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["payment-methods"]);
    const t = createTranslator(messages, "payment-methods.seo");
    const alternates = buildAlternates("/payment-methods", locale);

    const titleValue = t.raw("title");
    const descriptionValue = t.raw("description");

    const title = typeof titleValue === "string" ? titleValue : "Payment Methods | ApolloSong";
    const description = typeof descriptionValue === "string" ? descriptionValue : "Secure payment options at ApolloSong.";

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

export default async function PaymentMethodsPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["payment-methods"]);
    const t = createTranslator(messages, "payment-methods");

    const hero = t.raw("hero") as {
        eyebrow: string;
        title: string;
        subtitle: string;
        lastUpdatedLabel: string;
        lastUpdated: string;
    };

    const methodsData = t.raw("methods") as Record<string, { title: string; description: string }>;

    const getIcon = (key: string) => {
        switch (key) {
            case "pix": return <Zap className="w-8 h-8 text-aegean" />;
            case "creditCard": return <CreditCard className="w-8 h-8 text-aegean" />;
            case "digitalWallets": return <Smartphone className="w-8 h-8 text-aegean" />;
            case "security": return <ShieldCheck className="w-8 h-8 text-aegean" />;
            default: return <CreditCard className="w-8 h-8 text-aegean" />;
        }
    };

    return (
        <div className="min-h-screen bg-porcelain flex flex-col">
            <SiteHeader />
            <main className="flex-grow">
                {/* Hero Section */}
                <section className="bg-white border-b border-[#4A8E9A]/10 py-16">
                    <div className="container mx-auto px-4 text-center">
                        <p className="text-[#1A1A2E]/50 uppercase tracking-[0.2em] text-xs font-semibold mb-4">
                            {hero.eyebrow}
                        </p>
                        <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-6">
                            {hero.title}
                        </h1>
                        <p className="text-lg text-[#1A1A2E]/60 max-w-2xl mx-auto">
                            {hero.subtitle}
                        </p>
                        <div className="mt-8 inline-block px-4 py-1.5 bg-white/30 rounded-full text-sm text-[#1A1A2E]/50 border border-[#4A8E9A]/10">
                            {hero.lastUpdatedLabel}: <span className="font-medium text-gray-900">{hero.lastUpdated}</span>
                        </div>
                    </div>
                </section>

                {/* Content Section */}
                <section className="container mx-auto px-4 py-16">
                    <div className="max-w-4xl mx-auto space-y-12">
                        <p className="text-xl text-[#1A1A2E]/60 border-l-4 border-aegean pl-6 py-2 italic font-serif">
                            {t("intro")}
                        </p>

                        <div className="grid gap-8 md:grid-cols-2">
                            {Object.entries(methodsData).map(([key, data]) => (
                                <div key={key} className="bg-white p-8 rounded-3xl border border-aegean/10 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="mb-6">
                                        {getIcon(key)}
                                    </div>
                                    <h3 className="text-xl font-serif font-bold text-dark mb-4">
                                        {data.title}
                                    </h3>
                                    <div
                                        className="text-[#1A1A2E]/60 leading-relaxed prose-sm prose-strong:text-dark"
                                        dangerouslySetInnerHTML={{ __html: data.description.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
