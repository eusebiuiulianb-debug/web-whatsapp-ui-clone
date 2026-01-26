import Image from "next/image";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import type { CreatorLocation } from "../../types/creatorLocation";
import { PublicLocationBadge } from "./PublicLocationBadge";
import { Skeleton } from "../ui/Skeleton";
import { OfferTagsRow } from "./OfferTagsRow";
import { VerifiedBadge } from "../ui/VerifiedBadge";

type ChipItem = string | { label: string; className?: string } | { node: ReactNode; key?: string };

type Props = {
  name: string;
  avatarUrl?: string | null;
  tagline?: string;
  trustLine?: string;
  topEligible?: boolean;
  isVerified?: boolean;
  location?: CreatorLocation | null;
  chips: ChipItem[];
  chipsPlacement?: "meta" | "footer";
  chipsAction?: ReactNode;
  offerTags?: string[];
  primaryCtaLabel: string;
  primaryHref: string;
  primaryOnClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  primaryDisabled?: boolean;
  secondaryCtaLabel: string;
  secondaryCtaContent?: ReactNode;
  secondaryCtaAriaLabel?: string;
  secondaryCtaTitle?: string;
  secondaryHref: string;
  secondaryOnClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  secondaryDisabled?: boolean;
  secondaryVariant?: "default" | "tile";
};

export function PublicHero({
  name,
  avatarUrl,
  tagline,
  trustLine,
  topEligible,
  isVerified,
  location,
  chips,
  chipsPlacement = "footer",
  chipsAction,
  offerTags,
  primaryCtaLabel,
  primaryHref,
  primaryOnClick,
  primaryDisabled,
  secondaryCtaLabel,
  secondaryCtaContent,
  secondaryCtaAriaLabel,
  secondaryCtaTitle,
  secondaryHref,
  secondaryOnClick,
  secondaryDisabled,
  secondaryVariant = "default",
}: Props) {
  const showLocation = Boolean(location && location.visibility !== "OFF" && location.label);
  const showMeta = Boolean(trustLine) || showLocation;
  const showSeparator = Boolean(trustLine) && showLocation;
  const hasChips = chips.length > 0 || Boolean(chipsAction);
  const renderChips = (extraClassName?: string) => {
    if (!hasChips) return null;
    return (
      <div className={`flex flex-wrap items-center gap-2 min-w-0 ${extraClassName || ""}`}>
        {chips.map((chip, index) => {
          if (typeof chip === "string") {
            const label = chip;
            if (!label) return null;
            return (
              <span
                key={`${label}-${index}`}
                className="inline-flex min-w-0 max-w-full items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]"
              >
                <span className="truncate">{label}</span>
              </span>
            );
          }
          if ("node" in chip) {
            return (
              <span key={chip.key || `chip-node-${index}`} className="min-w-0">
                {chip.node}
              </span>
            );
          }
          const label = chip.label;
          if (!label) return null;
          return (
            <span
              key={`${label}-${index}`}
              className={`inline-flex min-w-0 max-w-full items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] ${chip.className || ""}`}
            >
              <span className="truncate">{label}</span>
            </span>
          );
        })}
        {chipsAction}
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 min-w-0">
        <AvatarCircle title={name} avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 min-w-0 min-h-[28px]">
            <h1 className="text-xl font-semibold text-[color:var(--text)] truncate">{name}</h1>
            {isVerified ? <VerifiedBadge className="shrink-0" /> : null}
            {topEligible && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-[color:rgba(245,158,11,0.6)] bg-[color:rgba(245,158,11,0.16)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                Perfil top
              </span>
            )}
          </div>
          {tagline && <p className="text-sm text-[color:var(--muted)] truncate">{tagline}</p>}
          {showMeta && (
            <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs text-[color:var(--muted)]">
              {trustLine && <span className="min-w-0 break-words">{trustLine}</span>}
              {showSeparator && (
                <span className="h-1 w-1 rounded-full bg-[color:var(--muted)] opacity-60" aria-hidden="true" />
              )}
              {showLocation && <PublicLocationBadge location={location} variant="chip" />}
            </div>
          )}
          {chipsPlacement === "meta" ? renderChips("pt-2") : null}
        </div>
      </div>

      <OfferTagsRow tags={offerTags} className="pt-1" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <a
          href={primaryHref}
          onClick={(event) => {
            if (primaryDisabled) {
              event.preventDefault();
              return;
            }
            primaryOnClick?.(event);
          }}
          aria-disabled={primaryDisabled}
          className={`inline-flex h-12 w-full items-center justify-center rounded-xl bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)] sm:w-auto${
            primaryDisabled ? " opacity-60 pointer-events-none" : ""
          }`}
        >
          {primaryCtaLabel}
        </a>
        <a
          href={secondaryHref}
          onClick={(event) => {
            if (secondaryDisabled) {
              event.preventDefault();
              return;
            }
            secondaryOnClick?.(event);
          }}
          aria-label={secondaryCtaAriaLabel ?? secondaryCtaLabel}
          title={secondaryCtaTitle}
          aria-disabled={secondaryDisabled}
          className={`${
            secondaryVariant === "tile"
              ? "inline-flex h-10 w-full items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40 sm:w-auto"
              : "inline-flex h-12 w-full items-center justify-center rounded-xl border border-[color:rgba(245,158,11,0.5)] bg-[color:rgba(245,158,11,0.08)] px-4 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:rgba(245,158,11,0.16)] sm:w-auto"
          }${secondaryDisabled ? " opacity-60 pointer-events-none" : ""}`}
        >
          {secondaryCtaContent ?? secondaryCtaLabel}
        </a>
      </div>

      {chipsPlacement === "footer" ? renderChips() : null}
    </section>
  );
}

function AvatarCircle({ title, avatarUrl }: { title: string; avatarUrl?: string | null }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [avatarUrl]);

  if (avatarUrl) {
    return (
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
        <Image
          src={normalizeImageSrc(avatarUrl)}
          alt={title}
          width={56}
          height={56}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoadingComplete={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
        <Skeleton
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
            loaded ? "opacity-0" : "opacity-100"
          }`}
        />
      </div>
    );
  }

  const initial = (title || "C")[0]?.toUpperCase() || "C";
  return (
    <div className="h-14 w-14 shrink-0 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-lg font-semibold text-[color:var(--text)] flex items-center justify-center">
      {initial}
    </div>
  );
}
