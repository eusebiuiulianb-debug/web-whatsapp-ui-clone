import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { AiTemplateUsage, AiTurnMode, AI_TEMPLATE_USAGES, AI_TURN_MODES, USAGE_LABELS } from "../../lib/aiTemplateTypes";
import { normalizeAiTurnMode } from "../../lib/aiSettings";

type TemplateTone = "auto" | "cercano" | "profesional" | "jugueton";
type TemplateMode = AiTurnMode;

type Template = {
  id?: string;
  name: string;
  category: AiTemplateUsage;
  tone: TemplateTone;
  content: string;
  isActive: boolean;
  tier: "T0" | "T1" | "T2" | "T3" | "T4" | null;
  mode: TemplateMode;
};

type ServerTemplate = {
  id: string;
  name: string;
  category: string;
  tone: string | null;
  content: string;
  isActive: boolean;
  tier: string | null;
  mode: string | null;
};

const TURN_MODE_LABELS: Record<AiTurnMode, string> = {
  auto: "Automático (equilibrado)",
  push_pack: "Empujar pack",
  care_new: "Cuidar nuevos",
  vip_focus: "Mimar VIP",
};

export default function CreatorAiTemplatesPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/creator/ai/templates");
      if (!res.ok) throw new Error("Error al cargar plantillas");
      const data = await res.json();
      const mapped: Template[] = Array.isArray(data.templates)
        ? data.templates.map(mapServerTemplate)
        : [];
      setTemplates(mapped);
    } catch (err) {
      console.error("Error loading templates", err);
      setError("No se pudieron cargar las plantillas.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function mapServerTemplate(tpl: ServerTemplate): Template {
    return {
      id: tpl.id,
      name: tpl.name,
      category: (tpl.category as AiTemplateUsage) || "extra_quick",
      tone: tpl.tone ? (tpl.tone as TemplateTone) : "auto",
      content: tpl.content,
      isActive: tpl.isActive,
      tier: tpl.tier && ["T0", "T1", "T2", "T3", "T4"].includes(tpl.tier) ? (tpl.tier as any) : null,
      mode:
        tpl.mode && (AI_TURN_MODES as readonly string[]).includes(normalizeAiTurnMode(tpl.mode) as AiTurnMode)
          ? normalizeAiTurnMode(tpl.mode)
          : "auto",
    };
  }

  function addTemplate() {
    setTemplates((prev) => [
      ...prev,
      {
        name: "Nueva plantilla",
        category: "extra_quick",
        tone: "auto",
        content: "",
        isActive: true,
        tier: null,
        mode: "auto",
      },
    ]);
  }

  function updateTemplate(index: number, updater: (tpl: Template) => Template) {
    setTemplates((prev) => {
      const next = [...prev];
      next[index] = updater(next[index]);
      return next;
    });
  }

  async function saveTemplate(index: number) {
    const tpl = templates[index];
    if (!tpl) return;

    const payload = {
      id: tpl.id,
      name: tpl.name,
      category: tpl.category,
      tone: tpl.tone === "auto" ? null : tpl.tone,
      content: tpl.content,
      isActive: tpl.isActive,
      tier: tpl.tier,
        mode: tpl.mode === "auto" ? null : tpl.mode,
    };

    try {
      updateTemplate(index, (t) => ({ ...t, saving: true } as any));
      const res = await fetch("/api/creator/ai/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const data = await res.json();
      const saved = mapServerTemplate(data.template);
      updateTemplate(index, () => saved);
      updateTemplate(index, (t) => ({ ...t, saved: true } as any));
      setTimeout(() => {
        updateTemplate(index, (t) => {
          const { saved, saving, ...rest } = t as any;
          return rest as Template;
        });
      }, 1200);
    } catch (err) {
      console.error("Error saving template", err);
      updateTemplate(index, (t) => ({ ...(t as any), error: "No se ha podido guardar esta plantilla." }));
    } finally {
      updateTemplate(index, (t) => ({ ...(t as any), saving: false }));
    }
  }

  return (
    <div className="min-h-screen bg-[#0b141a] text-[color:var(--text)]">
      <Head>
        <title>Plantillas de IA – NOVSY</title>
      </Head>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <CreatorHeader
          name={config.creatorName}
          role="Creador"
          subtitle={config.creatorSubtitle}
          initial={creatorInitial}
          avatarUrl={config.avatarUrl}
          onOpenSettings={() => {}}
        />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Plantillas de IA</h1>
            <p className="text-sm text-[color:var(--muted)]">Define tus propios mensajes para el botón Extra rápido.</p>
          </div>
          <button
            type="button"
            onClick={addTemplate}
            className="rounded-lg border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
          >
            Añadir plantilla
          </button>
        </div>

        {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}
        {loading && <div className="text-sm text-[color:var(--muted)]">Cargando plantillas...</div>}

        <div className="flex flex-col gap-4">
          {templates.map((tpl, idx) => {
            const anyTpl = tpl as any;
            const isSaving = Boolean(anyTpl.saving);
            const isSaved = Boolean(anyTpl.saved);
            const rowError = anyTpl.error as string | undefined;

            return (
              <div key={tpl.id || `new-${idx}`} className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[color:var(--muted)]">Nombre</label>
                    <input
                      className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                      value={tpl.name}
                      onChange={(e) => updateTemplate(idx, (t) => ({ ...t, name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[color:var(--muted)]">Uso</label>
                    <select
                      className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                      value={tpl.category}
                      onChange={(e) => updateTemplate(idx, (t) => ({ ...t, category: e.target.value as AiTemplateUsage }))}
                    >
                      {AI_TEMPLATE_USAGES.map((usage) => (
                        <option key={usage} value={usage}>
                          {USAGE_LABELS[usage]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[color:var(--muted)]">Tono preferente</label>
                    <select
                    className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                    value={tpl.tone}
                    onChange={(e) =>
                      updateTemplate(idx, (t) => ({ ...t, tone: e.target.value as TemplateTone }))
                    }
                  >
                      <option value="auto">Automático</option>
                      <option value="cercano">Cercano</option>
                      <option value="profesional">Profesional</option>
                      <option value="jugueton">Juguetón</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[color:var(--muted)]">Modo de turno</label>
                    <select
                      className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                      value={tpl.mode}
                      onChange={(e) =>
                        updateTemplate(idx, (t) => ({ ...t, mode: e.target.value as TemplateMode }))
                      }
                  >
                    {AI_TURN_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {TURN_MODE_LABELS[mode]}
                      </option>
                    ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[color:var(--muted)]">Escalón sugerido (opcional)</label>
                    <select
                      className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                      value={tpl.tier || ""}
                      onChange={(e) =>
                        updateTemplate(idx, (t) => ({ ...t, tier: e.target.value === "" ? null : (e.target.value as any) }))
                      }
                    >
                      <option value="">Sin escalón</option>
                      <option value="T0">T0 – gratis / incluido</option>
                      <option value="T1">T1 – extra básico</option>
                      <option value="T2">T2 – pack medio</option>
                      <option value="T3">T3 – alto valor</option>
                      <option value="T4">T4 – techo / pack caro</option>
                    </select>
                    <span className="text-[11px] text-[color:var(--muted)]">
                      Útil para usos de extras (extra rápido, pack especial). Para otros usos puedes dejarlo vacío.
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[color:var(--muted)]">Contenido</label>
                  <textarea
                    className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                    rows={3}
                    value={tpl.content}
                    onChange={(e) => updateTemplate(idx, (t) => ({ ...t, content: e.target.value }))}
                  />
                  <span className="text-[11px] text-[color:var(--muted)]">
                    Puedes usar variables básicas como {"{nombre_fan}"} y {"{precio_extra}"} (no procesamos variables todavía).
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
                    <input
                      type="checkbox"
                      checked={tpl.isActive}
                      onChange={(e) => updateTemplate(idx, (t) => ({ ...t, isActive: e.target.checked }))}
                      className="h-4 w-4 accent-[color:var(--brand)]"
                    />
                    Activa
                  </label>

                  <div className="flex items-center gap-3">
                    {rowError && <span className="text-xs text-[color:var(--danger)]">{rowError}</span>}
                    {isSaved && <span className="text-xs text-[color:var(--brand)]">Guardado</span>}
                    <button
                      type="button"
                      onClick={() => saveTemplate(idx)}
                      disabled={isSaving}
                      className="rounded-lg border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSaving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && templates.length === 0 && <div className="text-sm text-[color:var(--muted)]">Aún no tienes plantillas.</div>}
        </div>
      </div>
    </div>
  );
}
