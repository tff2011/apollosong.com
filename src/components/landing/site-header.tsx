"use client";

import { TikTokPageViewTracker } from "~/components/tiktok-pageview-tracker";
import { Link } from "~/i18n/navigation";
import { Button } from "~/components/ui/button";
import { GreekCTA } from "~/components/ui/greek-cta";
import { ShoppingBag, Star, Menu, Instagram, Heart, Sparkles } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "~/components/ui/sheet";
import { useTranslations, useLocale } from "~/i18n/provider";

const TikTokIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z" />
    </svg>
);

const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
    </svg>
);

const FlagUS = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
        <path fill="#bd3d44" d="M0 0h640v480H0" />
        <path stroke="#fff" strokeWidth="37" d="M0 55.3h640M0 129h640M0 202.8h640M0 276.5h640M0 350.2h640M0 423.9h640" />
        <path fill="#192f5d" d="M0 0h296.2v240H0" />
        <g fill="#fff">
            <g id="s18">
                <g id="s9">
                    <g id="s5">
                        <g id="s4">
                            <path id="s" d="M24.7 12l5.7 17.6L16 18.5h17.3L19 29.6l5.7-17.6" />
                            <use href="#s" y="42" />
                            <use href="#s" y="84" />
                            <use href="#s" y="126" />
                        </g>
                        <use href="#s" y="168" />
                    </g>
                    <use href="#s4" x="24.7" y="21" />
                </g>
                <use href="#s9" x="49.4" />
            </g>
            <use href="#s18" x="98.8" />
            <use href="#s9" x="197.6" />
            <use href="#s5" x="247" />
        </g>
    </svg>
);

const FlagBR = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
        <path fill="#009c3b" d="M0 0h640v480H0" />
        <path fill="#ffdf00" d="m317 76 226 164-226 164L91 240z" />
        <circle cx="317" cy="240" r="102" fill="#002776" />
        <path fill="#fff" fillRule="evenodd" d="M410 240a125 125 0 0 0-256 22c5 0 11-1 16-1a125 125 0 0 1 240-21" />
    </svg>
);

const FlagES = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
        <path fill="#c60b1e" d="M0 0h640v480H0z" />
        <path fill="#ffc400" d="M0 120h640v240H0z" />
    </svg>
);

const FlagFR = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
        <path fill="#002654" d="M0 0h213.3v480H0z" />
        <path fill="#fff" d="M213.3 0h213.4v480H213.3z" />
        <path fill="#ce1126" d="M426.7 0H640v480H426.7z" />
    </svg>
);

const FlagIT = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
        <path fill="#009246" d="M0 0h213.3v480H0z" />
        <path fill="#fff" d="M213.3 0h213.4v480H213.3z" />
        <path fill="#ce2b37" d="M426.7 0H640v480H426.7z" />
    </svg>
);

interface SiteHeaderProps {
    hideAnnouncement?: boolean;
}

const SUPPORTED_LOCALES = ["en", "pt", "es", "fr", "it"] as const;

export function SiteHeader({ hideAnnouncement = false }: SiteHeaderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const t = useTranslations("common");
    const pathname = usePathname();
    const currentLocale = useLocale();
    const showBrandByline = false;
    const tempPathname = pathname || "/";
    const segments = tempPathname.split("/").filter(Boolean);
    const hasLocalePrefix = SUPPORTED_LOCALES.includes((segments[0] || "") as (typeof SUPPORTED_LOCALES)[number]);
    const normalizedPathname = hasLocalePrefix
        ? segments.length > 1
            ? `/ ${segments.slice(1).join("/")} `
            : "/"
        : tempPathname;

    const desktopNavItems = [
        { href: "/reviews", label: t("header.nav.reviews"), Icon: Star },
        { href: "/track-order", label: t("header.nav.trackOrder"), Icon: ShoppingBag },
    ] as const;

    const switchLocale = (newLocale: string) => {
        const tempPathname = pathname || "/";
        const segments = tempPathname.split('/').filter(Boolean);

        if (SUPPORTED_LOCALES.includes((segments[0] || "") as (typeof SUPPORTED_LOCALES)[number])) {
            segments.shift();
        }

        const pathWithoutLocale = segments.length > 0 ? `/ ${segments.join('/')} ` : '';
        return `/ ${newLocale}${pathWithoutLocale} `;
    };

    return (
        <div className="w-full">
            {/* Announcement Bar */}
            {!hideAnnouncement && (
                <div className="bg-gradient-to-r from-dark via-[#102331] to-dark border-b border-white/5">
                    <div className="container mx-auto px-6 py-2.5 flex items-center justify-center text-center">
                        <span className="inline-flex items-center gap-2 text-sm font-medium tracking-wide text-white/90">
                            <Heart className="w-4 h-4 text-aegean/90" />
                            {t("header.announcement")}
                        </span>
                    </div>
                </div>
            )}

            {/* Navigation Bar */}
            <header className="sticky top-0 z-50 w-full bg-porcelain/85 backdrop-blur-xl border-b border-dark/5 transition-all duration-300">
                <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-0.5 group">
                        <img
                            src="/apollo-song-logo.svg"
                            alt="Apollo Song"
                            className="h-12 w-auto md:h-14 object-contain"
                        />
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-3">
                        {desktopNavItems.map(({ href, label, Icon }) => {
                            const isActive = normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);

                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`group inline-flex items-center gap-2 rounded-full px-4 py-2.5 border transition-all ${isActive
                                        ? "bg-dark/6 border-dark/10 text-dark"
                                        : "bg-white/70 border-dark/5 text-dark/65 hover:text-dark hover:bg-white"
                                        }`}
                                >
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${isActive ? "bg-aegean/15 text-aegean" : "bg-dark/5 text-dark/45 group-hover:bg-aegean/15 group-hover:text-aegean"}`}>
                                        <Icon className="w-4 h-4" />
                                    </span>
                                    <span className="text-sm font-medium">{label}</span>
                                </Link>
                            );
                        })}
                        <Link href="/create">
                            <GreekCTA className="scale-90 origin-right">
                                {t("cta")}
                            </GreekCTA>
                        </Link>
                    </nav >

                    {/* Mobile Menu */}
                    < div className="md:hidden" >
                        <Sheet open={isOpen} onOpenChange={setIsOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-dark hover:bg-dark/5 rounded-full"
                                >
                                    <Menu className="w-6 h-6" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent
                                side="right"
                                className="w-full sm:w-[400px] bg-porcelain border-l border-dark/5 p-0 flex flex-col"
                            >
                                {/* Header */}
                                <div className="p-6 border-b border-dark/5 flex items-center justify-between">
                                    <SheetTitle className="sr-only">Apollo Song Menu</SheetTitle>
                                    <img
                                        src="/apollo-song-logo.svg"
                                        alt="Apollo Song"
                                        className="h-10 w-auto object-contain"
                                    />
                                </div>

                                {/* Language Selector */}
                                <div className="flex justify-center py-6">
                                    <div className="grid grid-cols-5 gap-1 bg-dark/5 rounded-2xl p-1.5">
                                        {[
                                            { code: 'en', Flag: FlagUS },
                                            { code: 'pt', Flag: FlagBR },
                                            { code: 'es', Flag: FlagES },
                                            { code: 'fr', Flag: FlagFR },
                                            { code: 'it', Flag: FlagIT },
                                        ].map(({ code, Flag }) => (
                                            <a
                                                key={code}
                                                href={switchLocale(code)}
                                                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl transition-all ${currentLocale === code ? 'bg-white text-dark shadow-sm' : 'text-dark/40 hover:text-dark/70 hover:bg-white/50'}`}
                                            >
                                                <Flag className="w-7 h-5 rounded-sm" />
                                                <span className="text-xs font-medium tracking-wide">{code.toUpperCase()}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>

                                {/* Navigation Links */}
                                <div className="flex-1 flex flex-col justify-center px-8 gap-8">
                                    <Link
                                        href="/track-order"
                                        className="group flex items-center gap-4 text-3xl font-serif text-dark/80 hover:text-aegean transition-all duration-300"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <ShoppingBag className="w-6 h-6 text-dark/30 group-hover:text-aegean transition-colors" />
                                        <span>{t("header.mobile.trackOrder")}</span>
                                    </Link>
                                    <Link
                                        href="/reviews"
                                        className="group flex items-center gap-4 text-3xl font-serif text-dark/80 hover:text-aegean transition-all duration-300"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <Star className="w-6 h-6 text-dark/30 group-hover:text-aegean transition-colors" />
                                        <span>{t("header.mobile.reviews")}</span>
                                    </Link>
                                    <Link
                                        href="/contact"
                                        className="group flex items-center gap-4 text-3xl font-serif text-dark/80 hover:text-aegean transition-all duration-300"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <span className="w-6 h-6 flex items-center justify-center text-dark/30 group-hover:text-aegean transition-colors text-xl">@</span>
                                        <span>{t("header.mobile.contact")}</span>
                                    </Link>

                                    {/* Social Icons */}
                                    <div className="mt-4 pt-8 border-t border-dark/5 w-full max-w-[200px] mx-auto">
                                        <div className="flex justify-center gap-8">
                                            <a
                                                href="https://www.instagram.com/apollosongbr"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label="Instagram"
                                                className="group transition-all duration-300 hover:scale-110"
                                            >
                                                <Instagram className="w-6 h-6 text-dark/30 group-hover:text-[#E1306C]" />
                                            </a>
                                            <a
                                                href="https://tiktok.com/@apollosong"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label="TikTok"
                                                className="group transition-all duration-300 hover:scale-110"
                                            >
                                                <TikTokIcon className="w-5 h-5 text-dark/30 group-hover:text-dark" />
                                            </a>
                                            <a
                                                href="https://wa.me/5561995790193"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label="WhatsApp"
                                                className="group transition-all duration-300 hover:scale-110"
                                            >
                                                <WhatsAppIcon className="w-6 h-6 text-dark/30 group-hover:text-[#25D366]" />
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer CTA */}
                                <div className="p-8 border-t border-dark/5">
                                    <Link href="/create" onClick={() => setIsOpen(false)}>
                                        <GreekCTA className="w-full">
                                            {t("header.mobile.cta")}
                                        </GreekCTA>
                                    </Link>

                                    <div className="flex justify-center gap-6 mt-6 text-dark/30 text-sm">
                                        <Link href="/terms" className="hover:text-dark/60 transition-colors" onClick={() => setIsOpen(false)}>{t("header.mobile.terms")}</Link>
                                        <span className="opacity-30">|</span>
                                        <Link href="/payment-methods" className="hover:text-dark/60 transition-colors" onClick={() => setIsOpen(false)}>{t("header.mobile.payment")}</Link>
                                        <span className="opacity-30">|</span>
                                        <Link href="/privacy" className="hover:text-dark/60 transition-colors" onClick={() => setIsOpen(false)}>{t("header.mobile.privacy")}</Link>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div >
                </div >
            </header >
        </div >
    );
}
