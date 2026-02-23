import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, locales } from "./i18n/config";

const PUBLIC_FILE = /\.[^/]+$/;

function getLocaleFromPath(pathname: string) {
  return locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/admin") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const localeFromPath = getLocaleFromPath(pathname);
  if (localeFromPath) {
    if (localeFromPath === defaultLocale) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace(`/${defaultLocale}`, "") || "/";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
