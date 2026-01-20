type Props = {
  salesCount?: number | null;
  ratingsCount?: number | null;
  followersCount?: number | null;
};

export function PublicProfileStatsRow({ salesCount, ratingsCount, followersCount }: Props) {
  const salesValue = normalizeCount(salesCount);
  const ratingsValue = normalizeCount(ratingsCount);
  const followersValue = normalizeCount(followersCount);
  const stats = [
    ...(followersValue > 0 ? [{ label: "Seguidores", value: formatCount(followersValue) }] : []),
    ...(salesValue > 0 ? [{ label: "Ventas", value: formatCount(salesValue) }] : []),
    ...(ratingsValue > 0 ? [{ label: "Valoraciones", value: formatCount(ratingsValue) }] : []),
  ];
  if (stats.length === 0) return null;
  const columns = stats.length === 1 ? "grid-cols-1" : stats.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className={`grid ${columns} gap-3 min-w-0`}>
      {stats.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
      <div className="text-sm font-semibold text-[color:var(--text)] truncate">{value}</div>
    </div>
  );
}

function normalizeCount(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}
