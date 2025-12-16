import Head from "next/head";
import { FormEvent, useEffect, useState } from "react";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { AiBaseTone, AiTurnMode, AI_TURN_MODE_OPTIONS, AI_TURN_MODES, normalizeAiBaseTone, normalizeAiTurnMode } from "../../lib/aiSettings";
import { buildDailyUsageFromLogs } from "../../lib/aiUsage";
import {
  CREATOR_PLATFORM_KEYS,
  CreatorPlatformConfig,
  CreatorPlatformKey,
  CreatorPlatforms,
  createDefaultCreatorPlatforms,
  formatPlatformLabel,
  normalizeCreatorPlatforms,
} from "../../lib/creatorPlatforms";

type CreatorAiSettings = {
  id: string;
  creatorId: string;
  tone: AiBaseTone;
  allowAutoLowPriority: boolean;
  creditsAvailable: number;
  hardLimitPerDay: number | null;
  createdAt: string;
  updatedAt: string;
  turnMode: AiTurnMode;
  platforms: CreatorPlatforms;
};

type FormState = {
  tone: AiBaseTone;
  turnMode: AiTurnMode;
  creditsAvailable: number | "";
  hardLimitPerDay: number | "" | null;
  allowAutoLowPriority: boolean;
  platforms: CreatorPlatforms;
};

type AiStatus = {
  creditsAvailable: number;
  hardLimitPerDay: number | null;
  usedToday: number;
  remainingToday: number | null;
  limitReached: boolean;
};

type ActionCount = { actionType: string; count: number };
type AiUsageSummary = {
  summary: {
    totalToday: number;
    totalLast7Days: number;
    creditsToday: number;
    creditsLast7Days: number;
    byActionTypeToday: ActionCount[];
    byActionTypeLast7Days: ActionCount[];
  };
  settings: { creditsAvailable: number; hardLimitPerDay: number | null } | null;
  recentLogs: {
    id: string;
    createdAt: string;
    fanId: string | null;
    actionType: string;
    creditsUsed: number;
    suggestedText: string | null;
    outcome: string | null;
    turnMode?: string | null;
  }[];
  dailyUsage?: { date: string; count: number }[];
};

export default function CreatorAiSettingsPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";

  const [settings, setSettings] = useState<CreatorAiSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const turnModeOptions = AI_TURN_MODE_OPTIONS;
  const platformKeys: CreatorPlatformKey[] = [...CREATOR_PLATFORM_KEYS];

  function updatePlatform(key: CreatorPlatformKey, patch: Partial<CreatorPlatformConfig>) {
    setForm((prev) => {
      if (!prev) return prev;
      const current = prev.platforms?.[key] ?? { enabled: false, handle: "" };
      const nextHandle = patch.handle !== undefined ? patch.handle : current.handle;
      return {
        ...prev,
        platforms: {
          ...prev.platforms,
          [key]: {
            enabled: patch.enabled ?? current.enabled,
            handle: typeof nextHandle === "string" ? nextHandle : current.handle,
          },
        },
      };
    });
  }

  useEffect(() => {
    fetchSettings();
    fetchStatus();
    fetchUsageSummary();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [usageSummary?.recentLogs?.length]);

  function normalizeSettings(raw: any): CreatorAiSettings {
    return {
      id: String(raw.id),
      creatorId: raw.creatorId,
      tone: normalizeAiBaseTone(raw.tone),
      allowAutoLowPriority: Boolean(raw.allowAutoLowPriority),
      creditsAvailable: Number.isFinite(Number(raw.creditsAvailable))
        ? Number(raw.creditsAvailable)
        : 0,
      hardLimitPerDay: (() => {
        if (raw.hardLimitPerDay === null || raw.hardLimitPerDay === undefined) return null;
        const parsed = Number(raw.hardLimitPerDay);
        return Number.isFinite(parsed) ? parsed : null;
      })(),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      turnMode: turnModeFromRaw(raw.turnMode),
      platforms: normalizeCreatorPlatforms(raw.platforms),
    };
  }

  function turnModeFromRaw(value: unknown): AiTurnMode {
    const parsed = typeof value === "string" ? value : "";
    const valid = (AI_TURN_MODES as readonly string[]).includes(parsed as AiTurnMode)
      ? (parsed as AiTurnMode)
      : normalizeAiTurnMode(parsed);
    return valid || "auto";
  }

  async function fetchSettings() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/creator/ai-settings");
      if (!res.ok) throw new Error("Error fetching settings");
      const data = await res.json();
      const normalized = normalizeSettings(data.settings);
      applyFormFromSettings(normalized);
    } catch (err) {
      console.error("Error loading AI settings", err);
      setError("No se pudieron cargar los ajustes.");
    } finally {
      setLoading(false);
    }
  }

  function applyFormFromSettings(next: CreatorAiSettings) {
    setSettings(next);
    setForm({
      tone: next.tone || "auto",
      turnMode: next.turnMode || "auto",
      creditsAvailable: Number.isFinite(next.creditsAvailable) ? next.creditsAvailable : 0,
      hardLimitPerDay: next.hardLimitPerDay === null ? "" : next.hardLimitPerDay,
      allowAutoLowPriority: next.allowAutoLowPriority,
      platforms: normalizeCreatorPlatforms(next.platforms),
    });
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/api/creator/ai/status");
      if (!res.ok) throw new Error("Error fetching status");
      const data = await res.json();
      setStatus({
        creditsAvailable: data.creditsAvailable ?? 0,
        hardLimitPerDay: data.hardLimitPerDay ?? null,
        usedToday: data.usedToday ?? 0,
        remainingToday: data.remainingToday ?? null,
        limitReached: Boolean(data.limitReached),
      });
    } catch (err) {
      console.error("Error loading AI status", err);
    }
  }

  async function fetchUsageSummary() {
    try {
      setUsageLoading(true);
      setUsageError("");
      const res = await fetch("/api/creator/ai-usage/summary");
      if (!res.ok) throw new Error("Error fetching usage summary");
      const data = await res.json();
      setUsageSummary(data as AiUsageSummary);
    } catch (err) {
      console.error("Error loading AI usage summary", err);
      setUsageError("No se pudo cargar la actividad de IA.");
    } finally {
      setUsageLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    setError("");
    setSuccess("");

    const creditsValue = form.creditsAvailable === "" ? 0 : form.creditsAvailable;
    if (creditsValue < 0) {
      setError("Los créditos disponibles no pueden ser negativos.");
      return;
    }

    const limitValue = form.hardLimitPerDay === "" ? null : form.hardLimitPerDay;
    if (limitValue !== null && typeof limitValue === "number" && limitValue < 0) {
      setError("El límite diario no puede ser negativo.");
      return;
    }

    const payload: Partial<CreatorAiSettings> = {
      tone: form.tone,
      turnMode: form.turnMode,
      creditsAvailable: typeof form.creditsAvailable === "number" ? form.creditsAvailable : 0,
      hardLimitPerDay: form.hardLimitPerDay === "" ? null : form.hardLimitPerDay ?? null,
      allowAutoLowPriority: form.allowAutoLowPriority,
      platforms: form.platforms ?? createDefaultCreatorPlatforms(),
    };

    try {
      setSaving(true);
      const res = await fetch("/api/creator/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Error saving settings");
      }

      const data = await res.json();
      if (data.settings) {
        const normalized = normalizeSettings(data.settings);
        applyFormFromSettings(normalized);
      }
      fetchStatus();
      setSuccess("Ajustes guardados.");
    } catch (err) {
      console.error("Error saving AI settings", err);
      setError("No se han podido guardar los ajustes. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("es-ES", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function mapActionType(actionType: string) {
    const map: Record<string, string> = {
      welcome_suggestion: "Saludo",
      warmup_suggestion: "Warmup",
      quick_extra_suggestion: "Extra rápido",
      followup_suggestion: "Seguimiento extra",
      renewal_suggestion: "Renovación",
      reactivation_suggestion: "Reactivación",
      boundaries_suggestion: "Límites",
      support_suggestion: "Soporte",
      pack_offer_suggestion: "Pack especial",
    };
    return map[actionType] ?? actionType;
  }

  const dailyUsageForChart = (() => {
    if (usageSummary?.dailyUsage && usageSummary.dailyUsage.length > 0) return usageSummary.dailyUsage;
    if (usageSummary?.recentLogs) {
      return buildDailyUsageFromLogs(usageSummary.recentLogs as any, 30).map((d) => ({
        date: d.date,
        count: d.suggestionsCount,
      }));
    }
    return [];
  })();
  const historyLogs = usageSummary?.recentLogs ?? [];
  const totalRows = historyLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = historyLogs.slice(startIndex, endIndex);

  function AiUsageChart({ data }: { data: { date: string; count: number }[] }) {
    if (!data || data.length === 0 || data.every((d) => !d.count)) {
      return (
        <div className="flex h-40 items-center justify-center text-[11px] text-slate-400">
          Aún no hay actividad suficiente para mostrar el uso diario.
        </div>
      );
    }
    const max = Math.max(...data.map((d) => d.count || 0));
    const safeMax = max || 1;

    return (
      <div className="w-full overflow-x-auto">
        <div className="min-w-[480px] flex flex-col gap-2">
          <div className="flex h-36 items-end gap-1 px-1">
            {data.map((point) => {
              const ratio = point.count / safeMax;
              const heightPx = point.count === 0 ? 0 : Math.max(12, Math.round(ratio * 120));
              const label = new Date(point.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
              return (
                <div key={point.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t-md bg-emerald-500/80"
                    style={{ height: `${heightPx}px` }}
                    title={`${label}: ${point.count} sugerencias`}
                    aria-label={`${label}: ${point.count} sugerencias`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 px-1">
            {data.map((point, idx) => {
              const shouldShow = data.length <= 7 || idx === 0 || idx === data.length - 1 || idx % 5 === 0;
              return (
                <span key={`${point.date}-label`} className="flex-1 text-center truncate">
                  {shouldShow ? point.date.slice(5) : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>Ajustes de IA – NOVSY</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <CreatorHeader
          name={config.creatorName}
          role="Creador"
          subtitle={config.creatorSubtitle}
          initial={creatorInitial}
          avatarUrl={config.avatarUrl}
          onOpenSettings={() => {}}
        />

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Ajustes de IA</h1>
          <p className="text-sm text-slate-300">
            Configura cómo y cuánto puede responder la IA por ti a lo largo del día.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
          {loading && <div className="text-sm text-slate-300">Cargando...</div>}
          {error && <div className="text-sm text-rose-300 mb-3">{error}</div>}
          {success && <div className="text-sm text-emerald-300 mb-3">{success}</div>}

          {form && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-slate-200 font-medium">Tono base de la IA</label>
                  <select
                    value={form.tone}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, tone: normalizeAiBaseTone(e.target.value) } : prev
                      )
                    }
                    className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                  >
                    {[
                      { value: "auto", label: "Automático (según fan)" },
                      { value: "soft", label: "Suave" },
                      { value: "intimate", label: "Íntimo" },
                      { value: "spicy", label: "Picante" },
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400">
                    La IA usará este tono como base cuando no haya contexto claro. El Manager IA puede ajustar el tono fan a fan.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-slate-200 font-medium">Modo de turno de la IA</label>
                  <select
                    value={form.turnMode}
                    onChange={(e) =>
                      setForm((prev) => (prev ? { ...prev, turnMode: e.target.value as AiTurnMode } : prev))
                    }
                    className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                  >
                    {turnModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400">
                    Define la estrategia general de la IA. El Manager IA sigue usando el objetivo de cada fan; esto solo orienta la priorización cuando haya varias opciones válidas.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-slate-200 font-medium">Créditos disponibles</label>
                  <input
                    type="number"
                    min={0}
                    value={form.creditsAvailable === "" ? "" : form.creditsAvailable}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) =>
                        prev
                          ? { ...prev, creditsAvailable: value === "" ? "" : Number(value) }
                          : prev
                      );
                    }}
                    className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-slate-200 font-medium">Límite diario de créditos (opcional)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Sin límite"
                    value={form.hardLimitPerDay === "" || form.hardLimitPerDay === null ? "" : form.hardLimitPerDay}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              hardLimitPerDay: value === "" ? "" : Number(value),
                            }
                          : prev
                      );
                    }}
                    className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                  />
                  <p className="text-xs text-slate-400">
                    Déjalo vacío si no quieres un límite diario.
                  </p>
                </div>

                <div className="flex items-center gap-3 border border-slate-800 rounded-xl px-4 py-3 bg-slate-900/70">
                  <input
                    id="allowAutoLowPriority"
                    type="checkbox"
                    checked={form.allowAutoLowPriority}
                    onChange={(e) =>
                      setForm((prev) => (prev ? { ...prev, allowAutoLowPriority: e.target.checked } : prev))
                    }
                    className="h-5 w-5 rounded border-slate-600 bg-slate-800 text-emerald-400 focus:ring-emerald-400"
                  />
                  <div className="flex flex-col">
                    <label htmlFor="allowAutoLowPriority" className="text-sm font-medium text-slate-200">
                      Permitir respuestas automáticas para fans de baja prioridad
                    </label>
                    <p className="text-xs text-slate-400">
                      Si está activado, la IA puede contestar por ti cuando la cola esté muy llena. Solo se usa con fans marcados como baja prioridad.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Guardando..." : "Guardar ajustes"}
                </button>
              </div>

              <div className="text-xs text-slate-300">
                Usados hoy:{" "}
                {status ? `${status.usedToday}/${status.hardLimitPerDay ?? "∞"}` : "—"} · Créditos restantes:{" "}
                {status ? status.creditsAvailable : "—"}
              </div>
            </form>
          )}

          {!loading && !form && (
            <div className="text-sm text-slate-300">No hay datos de ajustes disponibles en este momento.</div>
          )}
        </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Uso de IA</h2>
                    <p className="text-sm text-slate-300">Sugerencias y créditos recientes.</p>
            </div>
            <button
              type="button"
              onClick={fetchUsageSummary}
              className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-100 hover:border-emerald-400"
            >
              Refrescar
            </button>
          </div>
          {usageError && <div className="text-sm text-rose-300 mb-2">{usageError}</div>}
          {usageLoading && <div className="text-sm text-slate-300">Cargando actividad...</div>}

          {usageSummary && (
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white">Resumen rápido</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-xs text-slate-400">Sugerencias hoy</div>
                    <div className="text-2xl font-semibold text-white">{usageSummary.summary.totalToday}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Peticiones al Manager IA hoy</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-xs text-slate-400">Sugerencias últimos 7 días</div>
                    <div className="text-2xl font-semibold text-white">{usageSummary.summary.totalLast7Days}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Peticiones de los últimos 7 días</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-xs text-slate-400">Créditos usados hoy</div>
                    <div className="text-2xl font-semibold text-white">{usageSummary.summary.creditsToday}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Créditos consumidos hoy</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-xs text-slate-400">Créditos disponibles</div>
                    <div className="text-2xl font-semibold text-white">
                      {usageSummary.settings?.creditsAvailable ?? "—"}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">Saldo disponible de la IA</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-xs font-semibold text-white mb-2">Por tipo (últimos 7 días)</div>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-200">
                  {usageSummary.summary.byActionTypeLast7Days.length === 0 && <span className="text-slate-400">Sin datos</span>}
                  {usageSummary.summary.byActionTypeLast7Days.map((item) => (
                    <span key={item.actionType} className="rounded-full border border-slate-700 px-2 py-1">
                      {mapActionType(item.actionType)}: {item.count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-white">Uso de IA (30 días)</div>
                    <div className="text-[11px] text-slate-400">Sugerencias por día</div>
                  </div>
                </div>
                <div className="mt-3">
                  <AiUsageChart data={dailyUsageForChart} />
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-white">Historial de IA (últimos 30 días)</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm text-slate-100">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-800">
                        <th className="py-2 pr-3">Fecha</th>
                        <th className="py-2 pr-3">Fan</th>
                        <th className="py-2 pr-3">Acción</th>
                        <th className="py-2 pr-3">Créditos</th>
                        <th className="py-2 pr-3">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-2 text-slate-400">
                            Sin actividad reciente.
                          </td>
                        </tr>
                      )}
                      {pageRows.map((log) => (
                        <tr key={log.id} className="border-b border-slate-800/60">
                          <td className="py-2 pr-3">{formatDate(log.createdAt)}</td>
                          <td className="py-2 pr-3">{log.fanId ?? "-"}</td>
                          <td className="py-2 pr-3">{mapActionType(log.actionType)}</td>
                          <td className="py-2 pr-3">{log.creditsUsed}</td>
                          <td className="py-2 pr-3 text-slate-400">{log.outcome ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalRows > 0 && (
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-300">
                    <span>
                      Mostrando {startIndex + 1}-{Math.min(endIndex, totalRows)} de {totalRows}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>
                      <span className="text-slate-400">Página {safePage} de {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
