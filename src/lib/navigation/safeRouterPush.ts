import type { NextRouter } from "next/router";
import type { UrlObject } from "url";

type RouterTarget = string | UrlObject;

function buildFallbackUrl(target: RouterTarget): string | null {
  if (typeof target === "string") return target;
  if (!target || typeof target !== "object") return null;
  const pathname = typeof target.pathname === "string" ? target.pathname : "";
  const params = new URLSearchParams();
  if (target.query && typeof target.query === "object") {
    Object.entries(target.query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry === undefined || entry === null) return;
          params.append(key, String(entry));
        });
        return;
      }
      params.set(key, String(value));
    });
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export async function safeRouterPush(
  router: NextRouter,
  target: RouterTarget,
  as?: RouterTarget,
  options?: Parameters<NextRouter["push"]>[2]
) {
  try {
    const resolved = await router.push(target, as as string | undefined, options);
    if (!resolved) {
      const fallback = buildFallbackUrl(as ?? target);
      if (fallback && typeof window !== "undefined") {
        window.location.assign(fallback);
      }
    }
    return resolved;
  } catch (_err) {
    const fallback = buildFallbackUrl(as ?? target);
    if (fallback && typeof window !== "undefined") {
      window.location.assign(fallback);
    }
    return false;
  }
}