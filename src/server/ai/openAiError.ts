import { redactEncryptedBlobs } from "../../lib/encryptedBlobs";
import { sanitizeForOpenAi } from "./sanitizeForOpenAi";

export type OpenAiErrorInfo = {
  status: number;
  code?: string;
  message: string;
};

export async function parseOpenAiError(response: Response, opts?: { creatorId?: string }): Promise<OpenAiErrorInfo> {
  const rawText = await response.text();
  let code: string | undefined;
  let message: string | undefined;

  try {
    const parsed = JSON.parse(rawText);
    const err = parsed?.error;
    if (err && typeof err === "object") {
      if (typeof err.code === "string") {
        code = err.code;
      } else if (typeof err.type === "string") {
        code = err.type;
      }
      if (typeof err.message === "string") {
        message = err.message;
      }
    }
  } catch (_err) {
    // Ignore parse errors and fall back to raw text.
  }

  const baseMessage = typeof message === "string" && message.trim() ? message : rawText || "openai_error";
  const redacted = redactEncryptedBlobs(baseMessage);
  const safe = sanitizeForOpenAi(redacted, { creatorId: opts?.creatorId }) as string;
  const safeMessage = typeof safe === "string" && safe.trim() ? safe : "openai_error";

  return { status: response.status, code, message: safeMessage };
}

export function isInvalidEncryptedContentError(err: unknown): boolean {
  const code = typeof (err as any)?.code === "string" ? (err as any).code : undefined;
  const message = typeof (err as any)?.message === "string" ? (err as any).message : undefined;
  return code === "invalid_encrypted_content" || (!!message && message.toLowerCase().includes("invalid_encrypted_content"));
}

export function toSafeErrorMessage(err: unknown, opts?: { creatorId?: string }): string {
  if (!err) return "unknown_error";

  if (typeof (err as any)?.safeMessage === "string") {
    return sanitizeForOpenAi((err as any).safeMessage, { creatorId: opts?.creatorId }) as string;
  }

  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : typeof (err as any)?.toString === "function"
      ? String(err)
      : "unknown_error";

  const redacted = redactEncryptedBlobs(raw);
  const safe = sanitizeForOpenAi(redacted, { creatorId: opts?.creatorId }) as string;
  return typeof safe === "string" && safe.trim() ? safe : "unknown_error";
}

