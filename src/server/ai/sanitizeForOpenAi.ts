import { maybeDecrypt } from "../crypto/maybeDecrypt";

type SanitizeOptions = {
  creatorId?: string;
};

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /^authorization$/i,
  /^cookie$/i,
  /api[_-]?key/i,
  /openai[_-]?api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
];

export function sanitizeForOpenAi<T>(value: T, opts?: SanitizeOptions): T {
  return sanitizeValue(value as unknown, { creatorId: opts?.creatorId, path: [] }) as T;
}

export function sanitizeOpenAiMessages(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts?: SanitizeOptions
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const creatorId = opts?.creatorId;
  return messages
    .map((msg, idx) => {
      const content = sanitizeString(msg.content, { creatorId, label: `openai.messages.${idx}.content` });
      return content ? { ...msg, content } : null;
    })
    .filter((msg): msg is { role: "system" | "user" | "assistant"; content: string } => Boolean(msg));
}

function sanitizeValue(value: unknown, ctx: { creatorId?: string; path: string[] }): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    const label = ctx.path.length > 0 ? ctx.path.join(".") : "value";
    return sanitizeString(value, { creatorId: ctx.creatorId, label });
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const items = value
      .map((item, idx) => sanitizeValue(item, { creatorId: ctx.creatorId, path: [...ctx.path, String(idx)] }))
      .filter((item) => item !== null && item !== undefined);
    return items;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(record)) {
      const nextPath = [...ctx.path, key];

      if (isSensitiveKey(key)) {
        out[key] = "[redacted]";
        continue;
      }

      if (key.toLowerCase() === "encrypted_content") {
        const decrypted = typeof raw === "string" ? maybeDecrypt(raw, { creatorId: ctx.creatorId, label: nextPath.join(".") }) : null;
        if (decrypted && decrypted.trim()) {
          out.content = decrypted;
        }
        continue;
      }

      const sanitized = sanitizeValue(raw, { creatorId: ctx.creatorId, path: nextPath });
      if (sanitized === null || sanitized === undefined) continue;
      out[key] = sanitized;
    }

    return out;
  }

  return null;
}

function sanitizeString(value: string, ctx: { creatorId?: string; label: string }): string | null {
  const decryptedOrSame = maybeDecrypt(value, { creatorId: ctx.creatorId, label: ctx.label });
  if (decryptedOrSame === null) return null;
  if (typeof decryptedOrSame !== "string") return null;
  return redactEmbeddedFernetTokens(decryptedOrSame, { creatorId: ctx.creatorId, label: ctx.label });
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redactEmbeddedFernetTokens(value: string, ctx: { creatorId?: string; label: string }): string {
  if (!value.includes("gAAAA")) return value;

  return value.replace(/gAAAA[0-9A-Za-z_-]{20,}/g, (match) => {
    const decrypted = maybeDecrypt(match, { creatorId: ctx.creatorId, label: `${ctx.label}._embedded` });
    if (!decrypted) return "[encrypted]";
    if (looksSensitiveValue(decrypted)) return "[redacted]";
    return decrypted;
  });
}

function looksSensitiveValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^sk-[A-Za-z0-9]{8,}/.test(trimmed)) return true;
  if (/^Bearer\\s+/i.test(trimmed)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(trimmed)) return true; // JWT-ish
  // Likely a token/secret if it's a long single "word" with no spaces.
  if (trimmed.length >= 64 && !/\\s/.test(trimmed)) return true;
  return false;
}
