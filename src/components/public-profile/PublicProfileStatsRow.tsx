type Props = {
  salesCount?: number | null;
  ratingsCount?: number | null;
};

export function PublicProfileStatsRow({ salesCount, ratingsCount }: Props) {
  const salesValue = normalizeCount(salesCount);
  const ratingsValue = normalizeCount(ratingsCount);
  if (salesValue === 0 && ratingsValue === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 min-w-0">
      <StatCard label="Ventas" value={formatCount(salesValue)} />
      <StatCard label="Valoraciones" value={formatCount(ratingsValue)} />
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
