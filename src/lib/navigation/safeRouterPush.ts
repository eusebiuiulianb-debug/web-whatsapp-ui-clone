import Router, { type NextRouter } from "next/router";
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
  const fallbackUrl = buildFallbackUrl(as ?? target);
  if (typeof window === "undefined" || !fallbackUrl) {
    return router.push(target, as as string | undefined, options);
  }

  if (router.asPath === fallbackUrl) return true;

  let cancelled = false;
  const handleError = (err: unknown, url: string) => {
    if (url !== fallbackUrl) return;
    const error = err as { cancelled?: boolean; message?: string } | null;
    const message = typeof error?.message === "string" ? error.message : "";
    if (error?.cancelled || /cancel rendering route/i.test(message)) {
      cancelled = true;
    }
  };

  Router.events.on("routeChangeError", handleError);
  try {
    const resolved = await router.push(target, as as string | undefined, options);
    if (!resolved || cancelled) {
      window.location.assign(fallbackUrl);
      return false;
    }
    return resolved;
  } catch (_err) {
    window.location.assign(fallbackUrl);
    return false;
  } finally {
    Router.events.off("routeChangeError", handleError);
  }
}
