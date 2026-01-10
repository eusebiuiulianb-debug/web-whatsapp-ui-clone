import { useEffect, useState } from "react";
import { fetchJsonDedupe } from "../lib/fetchDedupe";

export type CortexProviderStatus = {
  provider: "demo" | "openai" | "ollama";
  configured: boolean;
};

function normalizeProvider(raw: unknown): CortexProviderStatus["provider"] {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "openai") return "openai";
  if (value === "ollama") return "ollama";
  if (value === "mock" || value === "demo") return "demo";
  return "demo";
}

export function useCortexProviderStatus(): CortexProviderStatus | null {
  const [status, setStatus] = useState<CortexProviderStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetchJsonDedupe<any>(
      "cortex:provider-status",
      () => fetch("/api/creator/ai/status", { cache: "no-store" }),
      { ttlMs: 1200 }
    )
      .then((data) => {
        if (!active) return;
        const payload = data?.data ?? data;
        setStatus({
          provider: normalizeProvider(payload?.cortexProvider),
          configured: Boolean(payload?.cortexConfigured),
        });
      })
      .catch(() => {
        if (!active) return;
        setStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return status;
}
