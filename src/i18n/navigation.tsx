"use client";

import type { ComponentProps } from "react";
import type { UrlObject } from "url";
import NextLink from "next/link";
import type { Locale } from "./config";
import { localizePath } from "./routing";
import { useLocale } from "./provider";

type LinkProps = ComponentProps<typeof NextLink> & {
  locale?: Locale;
};

function localizeHref(href: string | UrlObject, locale: Locale) {
  if (typeof href === "string") {
    return localizePath(href, locale);
  }

  if (!href.pathname) {
    return href;
  }

  const pathname = href.pathname.toString();
  return {
    ...href,
    pathname: localizePath(pathname, locale),
  };
}

export function Link({ href, locale, ...props }: LinkProps) {
  const activeLocale = useLocale();
  const resolvedLocale = locale ?? activeLocale;
  const localizedHref = localizeHref(href, resolvedLocale);

  return <NextLink href={localizedHref} {...props} />;
}
