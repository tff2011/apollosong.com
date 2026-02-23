import type { MetadataRoute } from "next";
import { getSiteUrl } from "~/i18n/metadata";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();
  const sitemap = baseUrl
    ? new URL("/sitemap.xml", baseUrl).toString()
    : "/sitemap.xml";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/admin",
    },
    sitemap,
  };
}
