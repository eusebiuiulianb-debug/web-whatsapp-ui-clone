import Head from "next/head";
import { useEffect, useState } from "react";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { AiTemplateUsage, AI_TEMPLATE_USAGES, USAGE_LABELS } from "../../lib/aiTemplateTypes";

type TemplateTone = "auto" | "cercano" | "profesional" | "jugueton";

type Template = {
  id?: string;
  name: string;
  category: AiTemplateUsage;
  tone: TemplateTone;
  content: string;
  isActive: boolean;
  tier: "T0" | "T1" | "T2" | "T3" | "T4" | null;
};

type ServerTemplate = {
  id: string;
  name: string;
  category: string;
  tone: string | null;
  content: string;
  isActive: boolean;
  tier: string | null;
};

export default function CreatorAiTemplatesPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
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
  }

  function mapServerTemplate(tpl: ServerTemplate): Template {
    return {
      id: tpl.id,
      name: tpl.name,
      category: (tpl.category as AiTemplateUsage) || "extra_quick",
      tone: tpl.tone ? (tpl.tone as TemplateTone) : "auto",
      content: tpl.content,
      isActive: tpl.isActive,
      tier: tpl.tier && ["T0", "T1", "T2", "T3", "T4"].includes(tpl.tier) ? (tpl.tier as any) : null,
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
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>Plantillas de IA – NOVSY</title>
      </Head>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <CreatorHeader
          name={config.creatorName}
          role="Creador"
          subtitle={config.creatorSubtitle}
          initial={creatorInitial}
          onOpenSettings={() => {}}
        />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Plantillas de IA</h1>
            <p className="text-sm text-slate-300">Define tus propios mensajes para el botón Extra rápido.</p>
          </div>
          <button
            type="button"
            onClick={addTemplate}
            className="rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
          >
            Añadir plantilla
          </button>
        </div>

        {error && <div className="text-sm text-rose-300">{error}</div>}
        {loading && <div className="text-sm text-slate-300">Cargando plantillas...</div>}

        <div className="flex flex-col gap-4">
          {templates.map((tpl, idx) => {
            const anyTpl = tpl as any;
            const isSaving = Boolean(anyTpl.saving);
            const isSaved = Boolean(anyTpl.saved);
            const rowError = anyTpl.error as string | undefined;

            return (
              <div key={tpl.id || `new-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-300">Nombre</label>
                    <input
                      className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                      value={tpl.name}
                      onChange={(e) => updateTemplate(idx, (t) => ({ ...t, name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-300">Uso</label>
                    <select
                      className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white"
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
                    <label className="text-xs text-slate-300">Tono preferente</label>
                    <select
                      className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white"
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
                    <label className="text-xs text-slate-300">Escalón sugerido (opcional)</label>
                    <select
                      className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white"
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
                    <span className="text-[11px] text-slate-400">
                      Útil para usos de extras (extra rápido, pack especial). Para otros usos puedes dejarlo vacío.
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">Contenido</label>
                  <textarea
                    className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                    rows={3}
                    value={tpl.content}
                    onChange={(e) => updateTemplate(idx, (t) => ({ ...t, content: e.target.value }))}
                  />
                  <span className="text-[11px] text-slate-400">
                    Puedes usar variables básicas como {"{nombre_fan}"} y {"{precio_extra}"} (no procesamos variables todavía).
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={tpl.isActive}
                      onChange={(e) => updateTemplate(idx, (t) => ({ ...t, isActive: e.target.checked }))}
                    />
                    Activa
                  </label>

                  <div className="flex items-center gap-3">
                    {rowError && <span className="text-xs text-rose-300">{rowError}</span>}
                    {isSaved && <span className="text-xs text-emerald-300">Guardado</span>}
                    <button
                      type="button"
                      onClick={() => saveTemplate(idx)}
                      disabled={isSaving}
                      className="rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSaving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && templates.length === 0 && <div className="text-sm text-slate-300">Aún no tienes plantillas.</div>}
        </div>
      </div>
    </div>
  );
}
