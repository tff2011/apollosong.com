import type { MetadataRoute } from "next";
import { defaultLocale, locales } from "~/i18n/config";
import { localizePath } from "~/i18n/routing";
import { getSiteUrl } from "~/i18n/metadata";

const STATIC_PATHS = [
  "/",
  "/create",
  "/contact",
  "/custom-songs",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl() ?? new URL("http://localhost:3000");
  const lastModified = new Date();
  const allPaths = STATIC_PATHS;

  return allPaths.flatMap((path) =>
    locales.map((locale) => {
      const languages: Record<string, string> = {};
      for (const targetLocale of locales) {
        languages[targetLocale] = new URL(
          localizePath(path, targetLocale),
          baseUrl,
        ).toString();
      }
      languages["x-default"] = new URL(
        localizePath(path, defaultLocale),
        baseUrl,
      ).toString();

      return {
        url: new URL(localizePath(path, locale), baseUrl).toString(),
        lastModified,
        alternates: { languages },
      };
    }),
  );
}
