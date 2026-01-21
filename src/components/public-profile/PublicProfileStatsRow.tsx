import type { SVGProps } from "react";

type Props = {
  commentsCount?: number | null;
  contentCount?: number | null;
  followersCount?: number | null;
};

export function PublicProfileStatsRow({ commentsCount, contentCount, followersCount }: Props) {
  const commentsValue = normalizeCount(commentsCount);
  const contentValue = normalizeCount(contentCount);
  const followersValue = normalizeCount(followersCount);
  const stats = [
    { label: "Seguidores", value: formatCount(followersValue), icon: UserIcon },
    { label: "Comentarios", value: formatCount(commentsValue), icon: CommentIcon },
    { label: "Contenido", value: formatCount(contentValue), icon: PlayIcon },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 min-w-0">
      {stats.map((stat) => (
        <StatChip key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
      ))}
    </div>
  );
}

function StatChip({ label, value, icon: Icon }: { label: string; value: string; icon: (props: SVGProps<SVGSVGElement>) => JSX.Element }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 min-w-0 text-sm leading-tight"
      aria-label={`${label}: ${value}`}
    >
      <Icon className="h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden="true" />
      <span className="text-sm font-semibold tabular-nums text-[color:var(--text)]">{value}</span>
      <span className="sr-only md:not-sr-only text-[10px] uppercase tracking-wide text-[color:var(--muted)] truncate">
        {label}
      </span>
    </div>
  );
}

function normalizeCount(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <circle cx="10" cy="6.5" r="3.2" />
      <path d="M4 16.2c1.6-3 10.4-3 12 0" strokeLinecap="round" />
    </svg>
  );
}

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M4 5.5h12a2 2 0 0 1 2 2V12a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <rect x="3" y="4.5" width="14" height="11" rx="2" />
      <path d="M9 8l4 2.5L9 13V8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
