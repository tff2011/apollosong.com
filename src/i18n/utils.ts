export type Messages = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolvePath(source: unknown, path: string): unknown {
  if (!path) {
    return source;
  }

  return path.split(".").reduce((acc, part) => {
    if (!acc || typeof acc !== "object" || acc === null) {
      return undefined;
    }

    return (acc as Record<string, unknown>)[part];
  }, source);
}

export function setMessageNamespace(
  target: Messages,
  namespace: string,
  value: unknown
) {
  const parts = namespace.split(".");
  let current: Messages = target;

  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }

    const next = current[part];
    if (!isPlainObject(next)) {
      current[part] = {};
    }
    current = current[part] as Messages;
  });
}

export function mergeMessages(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];

    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = mergeMessages(existing, value);
      continue;
    }

    result[key] = value;
  }

  return result;
}
