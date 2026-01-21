import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import type { CreatorLocation } from "../../types/creatorLocation";
import { PublicLocationBadge } from "./PublicLocationBadge";

type Props = {
  name: string;
  avatarUrl?: string | null;
  tagline?: string;
  trustLine?: string;
  topEligible?: boolean;
  location?: CreatorLocation | null;
  chips: string[];
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
};

export function PublicHero({
  name,
  avatarUrl,
  tagline,
  trustLine,
  topEligible,
  location,
  chips,
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
}: Props) {
  const showLocation = Boolean(location && location.visibility !== "OFF" && location.label);
  const showMeta = Boolean(trustLine) || showLocation;
  const showSeparator = Boolean(trustLine) && showLocation;

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 min-w-0">
        <AvatarCircle title={name} avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xl font-semibold text-[color:var(--text)] truncate">{name}</h1>
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
        </div>
      </div>

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
          className={`inline-flex h-12 w-full items-center justify-center rounded-xl border border-[color:rgba(245,158,11,0.5)] bg-[color:rgba(245,158,11,0.08)] px-4 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:rgba(245,158,11,0.16)] sm:w-auto${
            secondaryDisabled ? " opacity-60 pointer-events-none" : ""
          }`}
        >
          {secondaryCtaContent ?? secondaryCtaLabel}
        </a>
      </div>

      {chips.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 max-w-full">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function AvatarCircle({ title, avatarUrl }: { title: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return (
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
        <Image
          src={normalizeImageSrc(avatarUrl)}
          alt={title}
          width={56}
          height={56}
          className="h-full w-full object-cover"
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
