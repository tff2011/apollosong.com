import { defaultLocale, type Locale, locales } from "./config";

const LOCALE_SEGMENT = new Set(locales);

function hasLocalePrefix(pathname: string): boolean {
  const [, segment] = pathname.split("/");
  return Boolean(segment && LOCALE_SEGMENT.has(segment as Locale));
}

export function localizePath(pathname: string, locale: Locale): string {
  if (!pathname.startsWith("/")) {
    return pathname;
  }

  if (pathname.startsWith("#")) {
    return pathname;
  }

  if (hasLocalePrefix(pathname)) {
    return pathname;
  }

  if (locale === defaultLocale) {
    return pathname;
  }

  const [pathWithQuery = "", hash] = pathname.split("#");
  const [pathOnly, query] = pathWithQuery.split("?");
  const localizedPath = pathOnly === "/" ? `/${locale}` : `/${locale}${pathOnly}`;
  const withQuery = query ? `${localizedPath}?${query}` : localizedPath;

  return hash ? `${withQuery}#${hash}` : withQuery;
}
