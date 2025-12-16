import type { BioLinkConfig, BioLinkSecondaryLink } from "../../types/bioLink";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { track } from "../../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";

type Props = {
  config: BioLinkConfig;
};

export function BioLinkPublicView({ config }: Props) {
  const chips = (config.chips || []).filter(Boolean).slice(0, 3);
  const secondaryLinks = (config.secondaryLinks || []).filter((l) => l.label && l.url);
  const [ctaHref, setCtaHref] = useState(`/go/${config.handle}`);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search || "";
    setCtaHref(`/go/${config.handle}${search}`);
  }, [config.handle]);

  useEffect(() => {
    track(ANALYTICS_EVENTS.BIO_LINK_VIEW, { creatorId: config.creatorId || "creator-1", meta: { handle: config.handle } });
  }, [config.creatorId, config.handle]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col items-center px-4 pt-16 pb-24 md:pt-20">
      <div className="w-full max-w-md mb-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/85 shadow-2xl shadow-black/40 px-6 py-8 flex flex-col gap-6 items-center">
          <div className="flex flex-col items-center gap-3 w-full">
            <AvatarCircle title={config.title} avatarUrl={config.avatarUrl} />
            <div className="text-center space-y-1">
              <h1 className="text-lg md:text-xl font-semibold text-slate-50">{config.title}</h1>
              {config.tagline && <p className="text-sm text-slate-400">{config.tagline}</p>}
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-100"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="w-full space-y-3">
            <a
              href={ctaHref}
              className="inline-flex w-full items-center justify-center rounded-lg border border-amber-400/70 text-amber-200 bg-transparent hover:bg-amber-400/10 px-4 py-3 text-sm font-semibold transition"
            >
              {config.primaryCtaLabel}
            </a>
            {secondaryLinks.length > 0 && (
              <div className="flex flex-col gap-3 w-full">
                {secondaryLinks.map((link) => (
                  <a
                    key={`${link.label}-${link.url}`}
                    href={link.url}
                    className="inline-flex items-center justify-center gap-2 w-full rounded-full border border-amber-300/70 bg-slate-900/70 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/10 transition"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <IconChip iconKey={link.iconKey} />
                    <span className="truncate">{link.label}</span>
                  </a>
                ))}
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
    return <div className="h-20 w-20 rounded-full border border-slate-700 overflow-hidden shadow-lg shadow-black/40">
      <img src={avatarUrl} alt={title} className="h-full w-full object-cover" />
    </div>;
  }
  const initial = (title || "C")[0]?.toUpperCase() || "C";
  return (
    <div className="h-20 w-20 rounded-full border border-slate-700 bg-gradient-to-br from-emerald-500/90 to-sky-500/90 text-3xl font-bold text-white flex items-center justify-center shadow-lg shadow-black/40">
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
        iconKey === "tiktok" ? "bg-slate-800 text-white" : iconKey === "instagram" ? "bg-amber-500/20 text-amber-100" : "bg-slate-800 text-slate-100"
      )}
    >
      {label}
    </span>
  );
}
