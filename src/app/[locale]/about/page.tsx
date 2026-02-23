import { AboutHero } from "~/components/landing/about-hero";
import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { SocialFollowSection } from "~/components/landing/social-follow-section";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale, type Locale } from "~/i18n/config";
import { createTranslator } from "~/i18n/server";
import { buildAlternates } from "~/i18n/metadata";
import Image from "next/image";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["about"]);
    const t = createTranslator(messages, "about");
    const alternates = buildAlternates("/about", locale);

    return {
        title: t("seo.title"),
        description: t("seo.description"),
        alternates,
    };
}

export default async function AboutPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["common", "about", "home.socialFollow"]);
    const t = createTranslator(messages, "about");

    return (
        <I18nProvider locale={locale} messages={messages}>
            <main className="min-h-screen bg-cream selection:bg-aegean/20">
                <SiteHeader />

                <AboutHero />

                {/* Content Sections */}
                <div className="container mx-auto px-4 py-24">
                    <div className="max-w-4xl mx-auto space-y-32">

                        {/* Name Meaning Section */}
                        <div className="grid md:grid-cols-5 gap-12 items-center">
                            <div className="md:col-span-2">
                                <div className="aspect-square rounded-3xl overflow-hidden bg-navy/5 border border-aegean/10 shadow-lg relative group">
                                    <Image
                                        src="/images/about-apollo-symbol.webp"
                                        alt="Apollo Symbol"
                                        fill
                                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-dark/20 to-transparent" />
                                </div>
                            </div>
                            <div className="md:col-span-3 space-y-6 text-center md:text-left">
                                <h2 className="text-4xl md:text-5xl font-serif font-bold text-dark italic">
                                    {t("nameMeaning.title")}
                                </h2>
                                <p className="text-xl text-dark/70 leading-relaxed font-light">
                                    {t("nameMeaning.content")}
                                </p>
                            </div>
                        </div>

                        {/* Musicians Story Section */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-aegean/5 blur-3xl rounded-full -z-10" />
                            <div className="text-center space-y-8 max-w-4xl mx-auto">
                                <div className="w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-white shadow-2xl relative mb-12">
                                    <Image
                                        src="/images/about-musicians-story.webp"
                                        alt="Our Story"
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                                <h2 className="text-4xl md:text-6xl font-serif font-bold text-dark">
                                    {t("musicians.title")}
                                </h2>
                                <p className="text-2xl text-dark/80 leading-relaxed font-serif italic">
                                    "{t("musicians.content")}"
                                </p>
                            </div>
                        </div>

                        {/* Made with Love Section */}
                        <div className="bg-white rounded-[3rem] p-8 md:p-20 shadow-xl border border-aegean/10 text-center space-y-12 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-aegean/5 rounded-full -mr-32 -mt-32 blur-3xl" />

                            <div className="w-full h-64 md:h-96 rounded-2xl overflow-hidden relative shadow-inner">
                                <Image
                                    src="/images/about-made-with-love.webp"
                                    alt="Made with Love"
                                    fill
                                    className="object-cover"
                                />
                                <div className="absolute inset-0 ring-1 ring-inset ring-black/10" />
                            </div>

                            <div className="space-y-8">
                                <h2 className="text-4xl md:text-5xl font-serif font-bold text-dark">
                                    {t("love.title")}
                                </h2>
                                <p className="text-xl text-dark/70 leading-relaxed max-w-2xl mx-auto">
                                    {t("love.content")}
                                </p>
                            </div>
                        </div>

                    </div>
                </div>

                <SocialFollowSection />

                <SiteFooter />
            </main>
        </I18nProvider>
    );
}
