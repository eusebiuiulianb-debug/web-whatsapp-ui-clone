import Image from "next/image";
import type { BioLinkConfig, BioLinkSecondaryLink } from "../../types/bioLink";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { track } from "../../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { PublicLocationBadge } from "./PublicLocationBadge";

type Props = {
  config: BioLinkConfig;
};

export function BioLinkPublicView({ config }: Props) {
  const chips = (config.chips || []).filter(Boolean).slice(0, 3);
  const secondaryLinks = (config.secondaryLinks || []).filter((l) => l.label && l.url);
  const description = typeof config.description === "string" ? config.description.trim() : "";
  const faqEntries = Array.isArray(config.faq) ? config.faq.filter(Boolean).slice(0, 3) : [];
  const defaultChatUrl = `/go/${config.handle}`;
  const legacyChatUrl = `/c/${config.handle}`;
  const baseCtaUrl = resolveCtaUrl(config.primaryCtaUrl, defaultChatUrl, legacyChatUrl);
  const [ctaHref, setCtaHref] = useState(baseCtaUrl);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search || "";
    setCtaHref(appendSearchIfRelative(baseCtaUrl, search));
  }, [baseCtaUrl]);

  useEffect(() => {
    const utmMeta = readUtmMeta();
    track(ANALYTICS_EVENTS.BIO_LINK_VIEW, {
      creatorId: config.creatorId || "creator-1",
      meta: { handle: config.handle, ...utmMeta },
    });
  }, [config.creatorId, config.handle]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[color:var(--surface-0)] via-[color:var(--surface-1)] to-[color:var(--surface-0)] text-[color:var(--text)] flex flex-col items-center px-4 pt-16 pb-24 md:pt-20">
      <div className="w-full max-w-md mb-6">
        <div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/85 shadow-2xl shadow-black/40 px-6 py-8 flex flex-col gap-6 items-center">
          <div className="flex flex-col items-center gap-3 w-full">
            <AvatarCircle title={config.title} avatarUrl={config.avatarUrl} />
            <div className="text-center space-y-1">
              <h1 className="text-lg md:text-xl font-semibold text-[color:var(--text)]">{config.title}</h1>
              {config.tagline && <p className="text-sm text-[color:var(--muted)]">{config.tagline}</p>}
              {description && <p className="text-xs text-[color:var(--muted)]">{description}</p>}
              <p className="text-[11px] text-[color:var(--brand)]">Chat 1:1 con creador real</p>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {config.location && (
              <div className="pt-1">
                <PublicLocationBadge location={config.location} align="center" />
              </div>
            )}
          </div>

          <div className="w-full space-y-3">
            <a
              href={ctaHref}
              className="inline-flex w-full items-center justify-center rounded-lg border border-[color:rgba(245,158,11,0.7)] text-[color:var(--warning)] bg-transparent hover:bg-[color:rgba(245,158,11,0.08)] px-4 py-3 text-sm font-semibold transition"
            >
              {config.primaryCtaLabel}
            </a>
            {secondaryLinks.length > 0 && (
              <div className="flex flex-col gap-3 w-full">
                {secondaryLinks.map((link) => (
                  <a
                    key={`${link.label}-${link.url}`}
                    href={link.url}
                    className="inline-flex items-center justify-center gap-2 w-full rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:var(--surface-1)] px-4 py-2.5 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.08)] transition"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <IconChip iconKey={link.iconKey} />
                    <span className="truncate">{link.label}</span>
                  </a>
                ))}
              </div>
            )}
            {faqEntries.length > 0 && (
              <div className="w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">FAQ</p>
                <ul className="space-y-1 text-xs text-[color:var(--text)]">
                  {faqEntries.map((entry, idx) => (
                    <li key={`${entry}-${idx}`} className="flex gap-2">
                      <span className="text-[color:var(--warning)]">-</span>
                      <span>{entry}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarCircle({ title, avatarUrl }: { title: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    const normalizedSrc = normalizeImageSrc(avatarUrl);
    return (
      <div className="h-20 w-20 rounded-full border border-[color:var(--surface-border)] overflow-hidden shadow-lg shadow-black/40">
        <Image src={normalizedSrc} alt={title} width={80} height={80} className="h-full w-full object-cover" />
      </div>
    );
  }
  const initial = (title || "C")[0]?.toUpperCase() || "C";
  return (
    <div className="h-20 w-20 rounded-full border border-[color:var(--surface-border)] bg-gradient-to-br from-[color:rgba(var(--brand-rgb),0.9)] to-[color:rgba(var(--brand-rgb),0.45)] text-3xl font-bold text-[color:var(--text)] flex items-center justify-center shadow-lg shadow-black/40">
      {initial}
    </div>
  );
}

function IconChip({ iconKey }: { iconKey?: BioLinkSecondaryLink["iconKey"] }) {
  const map: Record<string, string> = {
    tiktok: "TT",
    instagram: "IG",
    twitter: "X",
  };
  const label = iconKey ? map[iconKey] || "•" : "•";
  return (
    <span
      className={clsx(
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
        iconKey === "tiktok" ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : iconKey === "instagram" ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
      )}
    >
      {label}
    </span>
  );
}

function readUtmMeta() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search || "");
  const utmSource = params.get("utm_source") || "";
  const utmMedium = params.get("utm_medium") || "";
  const utmCampaign = params.get("utm_campaign") || "";
  const utmContent = params.get("utm_content") || "";
  const utmTerm = params.get("utm_term") || "";
  return {
    ...(utmSource ? { utm_source: utmSource } : {}),
    ...(utmMedium ? { utm_medium: utmMedium } : {}),
    ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
    ...(utmContent ? { utm_content: utmContent } : {}),
    ...(utmTerm ? { utm_term: utmTerm } : {}),
  };
}

function resolveCtaUrl(primaryCtaUrl: string | undefined, defaultChatUrl: string, legacyChatUrl: string) {
  const trimmed = (primaryCtaUrl || "").trim();
  if (!trimmed) return defaultChatUrl;
  if (trimmed === defaultChatUrl || trimmed === legacyChatUrl) return defaultChatUrl;
  return trimmed;
}

function appendSearchIfRelative(url: string, search: string) {
  if (!search) return url;
  if (!url.startsWith("/")) return url;
  if (url.includes("?")) return `${url}&${search.replace(/^\?/, "")}`;
  return `${url}${search}`;
}
