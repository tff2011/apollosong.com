import { resolvePath, type Messages } from "./utils";

type TranslationFn = ((key: string) => string) & {
  raw: (key: string) => unknown;
};

export function createTranslator(
  messages: Messages,
  namespace?: string
): TranslationFn {
  const base = namespace ? resolvePath(messages, namespace) : messages;

  const t = ((key: string) => {
    const value = resolvePath(base, key);
    return typeof value === "string" ? value : key;
  }) as TranslationFn;

  t.raw = (key: string) => resolvePath(base, key);

  return t;
}
