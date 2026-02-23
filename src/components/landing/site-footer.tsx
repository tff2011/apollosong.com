"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { Link } from "~/i18n/navigation";
import { Heart, Mail } from "lucide-react";

const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.634 1.432h.006c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);
import { locales } from "~/i18n/config";
import { useLocale, useTranslations } from "~/i18n/provider";

function stripLocaleFromPath(pathname: string) {
    for (const locale of locales) {
        if (pathname === `/${locale}`) {
            return "/";
        }
        if (pathname.startsWith(`/${locale}/`)) {
            return pathname.slice(locale.length + 1);
        }
    }

    return pathname;
}

export function SiteFooter() {
    const t = useTranslations("common");
    const locale = useLocale();
    const pathname = usePathname() ?? "/";
    const basePath = stripLocaleFromPath(pathname);
    const languageLabels = t.raw("footer.languages") as Record<string, string>;
    const showBrandByline = false;

    return (
        <footer className="bg-porcelain text-dark pt-24 pb-12 relative overflow-hidden border-t border-dark/5">
            {/* Background Elements */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-aegean/5 blur-[120px] rounded-full pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10 max-w-7xl">

                {/* Brand & Tagline */}
                <div className="text-center mb-20 max-w-2xl mx-auto flex flex-col justify-center items-center">
                    <img
                        src="/apollo-song-logo.svg"
                        alt={t("brand")}
                        className={`h-16 md:h-20 w-auto object-contain ${showBrandByline ? "mb-2" : "mb-6"}`}
                    />
                    {showBrandByline && (
                        <p className="text-xs font-semibold tracking-widest text-dark/40 mb-4 uppercase">
                            {t("brandByline")}
                        </p>
                    )}
                    <p className="text-lg md:text-xl text-dark/60 font-serif italic leading-relaxed">
                        {t("footer.tagline")}
                    </p>
                </div>

                {/* 3-Column Grid */}
                <div className="grid md:grid-cols-3 gap-16 md:gap-12 text-center md:text-left mx-auto border-t border-dark/10 pt-16 mb-20">

                    {/* Contact - Left */}
                    <div className="flex flex-col items-center md:items-start space-y-5">
                        <h5 className="font-serif font-bold text-xl text-dark mb-2 tracking-tight">{t("footer.links.contact")}</h5>
                        <a href="mailto:contact@apollosong.com" className="text-dark/70 hover:text-aegean transition-colors duration-300 flex items-center gap-3 font-medium">
                            <Mail className="w-4 h-4 text-aegean" />
                            contact@apollosong.com
                        </a>
                        <a
                            href="https://wa.me/5561995790193"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-dark/70 hover:text-aegean transition-colors duration-300 flex items-center gap-3 font-medium"
                        >
                            <WhatsAppIcon className="w-4 h-4 text-aegean" />
                            +55 61 99579-0193
                        </a>
                        <p className="text-sm text-dark/40 italic font-serif pt-2">{t("footer.hours")}</p>
                    </div>

                    {/* Navigation - Center */}
                    <div className="flex flex-col items-center md:items-start space-y-5 md:pl-12 lg:pl-24">
                        <h5 className="font-serif font-bold text-xl text-dark mb-2 tracking-tight">{t("footer.navigation")}</h5>
                        <Link href="/track-order" className="text-dark/70 hover:text-aegean transition-colors duration-300 font-medium">
                            {t("header.nav.trackOrder")}
                        </Link>
                        <Link href="/about" className="text-dark/70 hover:text-aegean transition-colors duration-300 font-medium">
                            {t("footer.links.about")}
                        </Link>
                        <Link href="/reviews" className="text-dark/70 hover:text-aegean transition-colors duration-300 font-medium">
                            {t("header.nav.reviews")}
                        </Link>
                        <Link href="/#faq" className="text-dark/70 hover:text-aegean transition-colors duration-300 font-medium">
                            FAQ
                        </Link>
                    </div>

                    {/* Legal - Right */}
                    <div className="flex flex-col items-center md:items-end space-y-5">
                        <h5 className="font-serif font-bold text-xl text-dark mb-2 tracking-tight">{t("footer.legal")}</h5>
                        <Link href="/privacy" className="text-dark/70 hover:text-aegean transition-colors duration-300 font-medium">
                            {t("footer.links.privacy")}
                        </Link>
                        <Link href="/terms" className="text-dark/70 hover:text-aegean transition-colors duration-300 font-medium">
                            {t("footer.links.terms")}
                        </Link>
                        <Link href="/payment-methods" className="text-dark/70 hover:text-aegean transition-colors duration-300 font-medium">
                            {t("footer.links.payment")}
                        </Link>
                    </div>

                </div>

                {/* Bottom Bar */}
                <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-dark/5 text-xs text-dark/40 gap-6 font-medium tracking-wide">
                    <p>&copy; {new Date().getFullYear()} Apollo Song. <span className="hidden sm:inline">{t("footer.rights")}</span></p>

                    {/* Language Switcher */}
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow-sm border border-dark/5">
                        {locales.map((targetLocale, index) => (
                            <Fragment key={targetLocale}>
                                <Link
                                    href={basePath}
                                    locale={targetLocale}
                                    className={`uppercase font-bold transition-colors duration-300 ${locale === targetLocale ? "text-aegean" : "text-dark/30 hover:text-dark/80"
                                        }`}
                                >
                                    {targetLocale}
                                </Link>
                                {index < locales.length - 1 && <span className="opacity-20 text-dark font-light">|</span>}
                            </Fragment>
                        ))}
                    </div>

                    <p className="flex items-center">
                        {t("footer.madeWith")} <Heart className="w-3.5 h-3.5 mx-1.5 text-aegean fill-aegean/20 animate-pulse" /> {t("footer.madeFor")}
                    </p>
                </div>

            </div>
        </footer>
    );
}
