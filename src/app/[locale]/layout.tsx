import "~/styles/globals.css";

import { type Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { notFound } from "next/navigation";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import { FloatingWhatsApp } from "~/components/floating-whatsapp";
import { ScrollToTop } from "~/components/ui/scroll-to-top";
import UtmTracker from "~/components/utm-tracker";
import { TikTokPageViewTracker } from "~/components/tiktok-pageview-tracker";
import { I18nProvider } from "~/i18n/provider";
import { isLocale, locales, type Locale } from "~/i18n/config";
import { loadMessages } from "~/i18n/messages";
import { getSiteUrl } from "~/i18n/metadata";
import { JsonLd } from "~/components/seo/json-ld";

// Organization and WebSite schemas for SEO
function getOrganizationSchema(locale: Locale) {
  const siteUrl = getSiteUrl()?.toString() ?? "https://apollosong.com";
  const names: Record<Locale, string> = {
    en: "ApolloSong",
    pt: "Apollo Song",
    es: "ApolloSong",
    fr: "ChansonDivine",
    it: "ApolloSong",
  };

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: names[locale],
    alternateName: Object.values(names).filter((n) => n !== names[locale]),
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: `${siteUrl}/icon-512.png`,
      width: 512,
      height: 512,
    },
    sameAs: ["https://www.instagram.com/apollosongbr"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      availableLanguage: ["English", "Portuguese", "Spanish", "French", "Italian"],
    },
  };
}

function getWebSiteSchema(locale: Locale) {
  const siteUrl = getSiteUrl()?.toString() ?? "https://apollosong.com";
  const names: Record<Locale, string> = {
    en: "ApolloSong",
    pt: "Apollo Song",
    es: "ApolloSong",
    fr: "ChansonDivine",
    it: "ApolloSong",
  };

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: names[locale],
    url: siteUrl,
    inLanguage: ["en", "pt", "es", "fr", "it"],
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
  };
}

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "Custom Song Gift | Make Your Loved Ones Cry Happy Tears",
  description: "Create a one-of-a-kind song from your story. Professional artists, 23 styles, ready in days. Gospel, Pop, Country & more. Listen to samples!",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-serif",
});

const PIXEL_ID = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
const PIXEL_ID_2 = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID_2;
const PIXEL_SCRIPT = PIXEL_ID
  ? `
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;
      n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s);
    }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', '${PIXEL_ID}');
    ${PIXEL_ID_2 ? `fbq('init', '${PIXEL_ID_2}');` : ""}
    fbq('track', 'PageView');
  `
  : null;
const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
const TIKTOK_PIXEL_SCRIPT = TIKTOK_PIXEL_ID
  ? `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
      var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
      ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};

      ttq.load('${TIKTOK_PIXEL_ID}');
      ttq.page();
    }(window, document, 'ttq');
  `
  : null;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params: paramsPromise,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await paramsPromise;
  if (!isLocale(localeParam)) {
    notFound();
  }

  const messages = await loadMessages(localeParam, ["common"]);

  return (
    <html lang={localeParam} className={`${dmSans.variable} ${cormorantGaramond.variable}`}>
      <head>
        {/* Schema.org JSON-LD for SEO */}
        <JsonLd data={getOrganizationSchema(localeParam)} />
        <JsonLd data={getWebSiteSchema(localeParam)} />
        {/* Google Tag Manager */}
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-WMMWKKN6');`}
        </Script>
        {PIXEL_SCRIPT ? (
          <Script id="facebook-pixel" strategy="afterInteractive">
            {PIXEL_SCRIPT}
          </Script>
        ) : null}
        {TIKTOK_PIXEL_SCRIPT ? (
          <Script id="tiktok-pixel" strategy="afterInteractive">
            {TIKTOK_PIXEL_SCRIPT}
          </Script>
        ) : null}
      </head>
      <body
        className="font-sans antialiased bg-background text-foreground min-h-[100dvh] overflow-x-hidden overscroll-y-none supports-[min-height:100dvh]:min-h-[100dvh]"
        suppressHydrationWarning
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-WMMWKKN6"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {PIXEL_ID ? (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        ) : null}
        <Suspense fallback={null}>
          <UtmTracker />
          {TIKTOK_PIXEL_ID ? <TikTokPageViewTracker /> : null}
        </Suspense>
        <I18nProvider locale={localeParam} messages={messages}>
          <TRPCReactProvider>{children}</TRPCReactProvider>
          <ScrollToTop />
          {/* TODO: Temporarily hidden - re-enable when ready */}
          {/* <FloatingWhatsApp /> */}
        </I18nProvider>
      </body>
    </html>
  );
}
