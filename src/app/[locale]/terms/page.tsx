import { SiteFooter } from "~/components/landing/site-footer";
import { SiteHeader } from "~/components/landing/site-header";
import { defaultLocale, isLocale } from "~/i18n/config";
import { loadMessages } from "~/i18n/messages";
import { createTranslator } from "~/i18n/server";
import { buildAlternates } from "~/i18n/metadata";

type SummaryItem = {
  title: string;
  description: string;
};

type TocItem = {
  id: string;
  label: string;
};

type ContentSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type ContactCard = {
  title: string;
  description: string;
  emailLabel: string;
  email: string;
  responseLabel: string;
  responseTime: string;
  note: string;
};

export async function generateMetadata({
  params: paramsPromise,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await paramsPromise;
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const messages = await loadMessages(locale, ["terms.seo"]);
  const t = createTranslator(messages, "terms.seo");
  const alternates = buildAlternates("/terms", locale);
  const titleValue = t.raw("title");
  const descriptionValue = t.raw("description");
  const title =
    typeof titleValue === "string"
      ? titleValue
      : "Terms of Service | ApolloSong";
  const description =
    typeof descriptionValue === "string"
      ? descriptionValue
      : "Review the ApolloSong terms of service for ordering and using your custom song.";

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

export default async function TermsPage({
  params: paramsPromise,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await paramsPromise;
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const messages = await loadMessages(locale, ["terms.page"]);
  const t = createTranslator(messages, "terms.page");

  const hero = t.raw("hero") as {
    eyebrow: string;
    title: string;
    subtitle: string;
    lastUpdatedLabel: string;
    lastUpdated: string;
  };
  const summary = t.raw("summary") as { title: string; items: SummaryItem[] };
  const tocTitle = t("tocTitle");
  const toc = t.raw("toc") as TocItem[];
  const sections = t.raw("sections") as ContentSection[];
  const contactCard = t.raw("contactCard") as ContactCard;

  return (
    <div className="min-h-screen bg-porcelain flex flex-col">
      <SiteHeader />
      <main className="flex-grow">
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

        <section className="container mx-auto px-4 py-12">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-10">
            <div className="space-y-12">
              <div className="bg-white border border-aegean/10 rounded-3xl p-6 md:p-8 shadow-sm">
                <h2 className="text-2xl font-serif font-bold text-dark mb-6">
                  {summary.title}
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {summary.items.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-xl border border-[#4A8E9A]/10 bg-white/30 p-5"
                    >
                      <h3 className="font-bold text-gray-900 mb-2">
                        {item.title}
                      </h3>
                      <p className="text-sm text-[#1A1A2E]/60">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-12">
                {sections.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-28 border-b border-aegean/10 pb-10 last:border-b-0"
                  >
                    <div className="prose prose-lg max-w-none prose-headings:font-serif prose-headings:text-navy prose-p:text-[#1A1A2E]/70 prose-li:text-[#1A1A2E]/70 prose-a:text-aegean prose-a:font-semibold prose-a:no-underline hover:prose-a:underline">
                      <h2>{section.title}</h2>
                      {section.paragraphs?.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      {section.bullets && section.bullets.length > 0 && (
                        <ul>
                          {section.bullets.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <aside className="lg:col-span-1">
              <div className="space-y-6 lg:sticky lg:top-24">
                <div className="bg-white border border-aegean/10 rounded-2xl p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-dark">
                    {tocTitle}
                  </p>
                  <nav className="mt-4 space-y-2 text-sm text-[#1A1A2E]/60">
                    {toc.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="block hover:text-aegean transition-colors"
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>
                </div>

                <div className="bg-navy text-white rounded-2xl p-6 shadow-sm">
                  <h3 className="text-xl font-serif font-semibold text-aegean">
                    {contactCard.title}
                  </h3>
                  <p className="mt-3 text-sm text-white/80">
                    {contactCard.description}
                  </p>
                  <div className="mt-4 text-sm">
                    <p className="uppercase text-[11px] tracking-widest text-white/60">
                      {contactCard.emailLabel}
                    </p>
                    <a
                      href={`mailto:${contactCard.email}`}
                      className="text-aegean font-semibold hover:text-aegean/80"
                    >
                      {contactCard.email}
                    </a>
                  </div>
                  <div className="mt-4 text-sm">
                    <p className="uppercase text-[11px] tracking-widest text-white/60">
                      {contactCard.responseLabel}
                    </p>
                    <p className="text-white/80">{contactCard.responseTime}</p>
                  </div>
                  <p className="mt-4 text-xs text-white/60">{contactCard.note}</p>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
