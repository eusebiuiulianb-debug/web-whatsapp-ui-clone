type AiUsageLogLite = {
  createdAt: string;
};

export function buildDailyUsageFromLogs(
  logs: AiUsageLogLite[],
  days: number = 30
): { date: string; label: string; suggestionsCount: number }[] {
  if (!Array.isArray(logs)) return [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - (days - 1));
  const counts: Record<string, number> = {};
  logs.forEach((log) => {
    const d = new Date(log.createdAt);
    if (Number.isNaN(d.getTime())) return;
    if (d < startDate || d > now) return;
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  });

  const result: { date: string; label: string; suggestionsCount: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = counts[key] || 0;
    const label = d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    result.push({ date: key, label, suggestionsCount: count });
  }
  return result;
}
