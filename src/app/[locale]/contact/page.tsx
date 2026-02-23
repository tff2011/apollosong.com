import { ContactPageClient } from "./contact-page";
import { I18nProvider } from "~/i18n/provider";
import { loadMessages } from "~/i18n/messages";
import { defaultLocale, isLocale } from "~/i18n/config";
import { createTranslator } from "~/i18n/server";
import { buildAlternates } from "~/i18n/metadata";

export async function generateMetadata({
  params: paramsPromise,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await paramsPromise;
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const messages = await loadMessages(locale, ["contact.seo"]);
  const t = createTranslator(messages, "contact.seo");
  const alternates = buildAlternates("/contact", locale);
  const titleValue = t.raw("title");
  const descriptionValue = t.raw("description");
  const title =
    typeof titleValue === "string" ? titleValue : "Contact ApolloSong";
  const description =
    typeof descriptionValue === "string"
      ? descriptionValue
      : "Talk to our team about creating a personalized Christian song.";

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

export default async function ContactPage({
  params: paramsPromise,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await paramsPromise;
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const messages = await loadMessages(locale, ["contact", "contact.page"]);

  return (
    <I18nProvider locale={locale} messages={messages}>
      <ContactPageClient />
    </I18nProvider>
  );
}
