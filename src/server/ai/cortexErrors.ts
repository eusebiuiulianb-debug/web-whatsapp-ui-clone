export type ProviderErrorType = "MODEL_NOT_FOUND" | "TIMEOUT" | "PROVIDER_ERROR";

export function resolveProviderErrorType(params: {
  errorCode?: string | null;
  errorMessage?: string | null;
  status?: number | null;
}): ProviderErrorType {
  const code = (params.errorCode ?? "").toString().toLowerCase();
  const message = (params.errorMessage ?? "").toString().toLowerCase();

  const isModelNotFound =
    code.includes("model_not_found") ||
    code.includes("not_found") ||
    (message.includes("model") && message.includes("not found")) ||
    message.includes("no such model");
  if (isModelNotFound) return "MODEL_NOT_FOUND";

  const isTimeout =
    code.includes("timeout") ||
    code.includes("etimedout") ||
    message.includes("timeout") ||
    message.includes("timed out");
  if (isTimeout) return "TIMEOUT";

  return "PROVIDER_ERROR";
}

export function buildErrorSnippet(input: string, maxLen = 160): string {
  const normalized = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1)}…`;
}
