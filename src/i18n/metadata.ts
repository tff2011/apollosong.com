import { defaultLocale, locales, type Locale } from "./config";
import { localizePath } from "./routing";

function withProtocol(value: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://${value}`;
}

export function getSiteUrl(): URL | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? withProtocol(process.env.VERCEL_URL) : null);

  if (!raw) {
    return null;
  }

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function buildAlternates(pathname: string, locale: Locale) {
  const baseUrl = getSiteUrl();
  const canonicalPath = localizePath(pathname, locale);
  const canonical = baseUrl
    ? new URL(canonicalPath, baseUrl).toString()
    : canonicalPath;

  const languages: Record<string, string> = {};

  for (const targetLocale of locales) {
    const localizedPath = localizePath(pathname, targetLocale);
    languages[targetLocale] = baseUrl
      ? new URL(localizedPath, baseUrl).toString()
      : localizedPath;
  }

  const defaultPath = localizePath(pathname, defaultLocale);
  languages["x-default"] = baseUrl
    ? new URL(defaultPath, baseUrl).toString()
    : defaultPath;

  return {
    canonical,
    languages,
  };
}
