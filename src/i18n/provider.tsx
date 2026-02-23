"use client";

import { createContext, useContext } from "react";
import type { Locale } from "./config";
import { mergeMessages, resolvePath, type Messages } from "./utils";

interface I18nContextValue {
  locale: Locale;
  messages: Messages;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages = {},
  children,
}: {
  locale?: Locale;
  messages?: Messages;
  children: React.ReactNode;
}) {
  const parent = useContext(I18nContext);
  const resolvedLocale = locale ?? parent?.locale;

  if (!resolvedLocale) {
    throw new Error("I18nProvider requires a locale.");
  }

  const mergedMessages = parent
    ? mergeMessages(parent.messages, messages)
    : messages;

  return (
    <I18nContext.Provider value={{ locale: resolvedLocale, messages: mergedMessages }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useLocale must be used within I18nProvider.");
  }
  return ctx.locale;
}

type TranslationFn = ((key: string, params?: Record<string, string | number>) => string) & {
  raw: (key: string) => unknown;
};

export function useTranslations(namespace?: string): TranslationFn {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslations must be used within I18nProvider.");
  }

  const base = namespace ? resolvePath(ctx.messages, namespace) : ctx.messages;

  const t = ((key: string, params?: Record<string, string | number>) => {
    const value = resolvePath(base, key);

    if (typeof value !== "string") return key;

    if (params) {
      return Object.entries(params).reduce((acc, [paramKey, paramValue]) => {
        return acc.replace(new RegExp(`{${paramKey}}`, "g"), String(paramValue));
      }, value);
    }

    return value;
  }) as TranslationFn;

  t.raw = (key: string) => resolvePath(base, key);

  return t;
}
