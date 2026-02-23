import type { Metadata } from "next";
import { CertificateView } from "~/components/certificate/certificate-view";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";

interface CertificatePageProps {
    params: Promise<{
        locale: string;
        token: string;
    }>;
    searchParams: Promise<{
        song?: string;
    }>;
}

export async function generateMetadata({ params }: CertificatePageProps): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const isPortuguese = locale === "pt";

    return {
        title: isPortuguese ? "Experiência Presente | Apollo Song" : "Gift Experience | ApolloSong",
        description: isPortuguese
            ? "Uma canção especial foi criada exclusivamente para você"
            : "A special song was created exclusively for you",
    };
}

export default async function CertificatePage({ params, searchParams }: CertificatePageProps) {
    const { locale: localeParam, token } = await params;
    const { song } = await searchParams;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["certificate", "common"]);
    const songOption = song === "2" ? 2 : 1;

    return (
        <I18nProvider locale={locale} messages={messages}>
            <CertificateView token={token} locale={locale} songOption={songOption} />
        </I18nProvider>
    );
}
