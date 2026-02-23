"use client";

import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { useTranslations } from "~/i18n/provider";

type ChannelItem = {
  title: string;
  description: string;
  detail: string;
  href: string;
  cta: string;
};

export function ContactPageClient() {
  const page = useTranslations("contact.page");

  const hero = page.raw("hero") as {
    eyebrow?: string;
    title: string;
    subtitle: string;
  };
  const channels = page.raw("channels") as {
    title: string;
    items: ChannelItem[];
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <SiteHeader />
      <main className="flex-grow">
        <section className="py-12">
          <div className="container mx-auto px-4 text-center">
            {hero.eyebrow && (
              <p className="text-dark/60 uppercase tracking-[0.25em] text-xs font-semibold">
                {hero.eyebrow}
              </p>
            )}
            <h1 className="mt-3 text-3xl md:text-4xl font-serif font-bold text-dark">
              {hero.title}
            </h1>
            <p className="mt-3 text-base text-[#1A1A2E]/60 max-w-2xl mx-auto">
              {hero.subtitle}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-4 pb-16">
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-dark text-center mb-8">
            {channels.title}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {channels.items.map((item) => (
              <a
                key={item.title}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white border border-aegean/10 rounded-2xl p-6 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegean/30"
              >
                <h3 className="text-lg font-serif font-semibold text-dark">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-[#1A1A2E]/60">
                  {item.description}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-semibold text-dark break-all">
                    {item.detail}
                  </span>
                  <span className="text-sm font-semibold text-aegean group-hover:underline">
                    {item.cta}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
