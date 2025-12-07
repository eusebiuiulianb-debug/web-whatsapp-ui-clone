import { useState } from "react";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import clsx from "clsx";

type Props = {
  data?: CreatorAiAdvisorInput;
  error?: boolean;
  isLoading?: boolean;
};

type CreatorAdvisorPlan = {
  estado_general?: string;
  riesgo?: string;
  prioridad_global?: number;
  focos_7_dias?: string[];
  acciones_packs?: {
    tipo_pack?: string;
    idea: string;
    justificacion?: string;
    urgencia?: "ALTA" | "MEDIA" | "BAJA";
  }[];
  acciones_contenido?: {
    idea: string;
    justificacion?: string;
    urgencia?: "ALTA" | "MEDIA" | "BAJA";
  }[];
  acciones_chat?: {
    titulo?: string;
    segmento_objetivo?: string;
    descripcion?: string;
    impacto_esperado?: string;
  }[];
  alertas?: string[];
};

const riskColors: Record<"BAJO" | "MEDIO" | "ALTO", string> = {
  BAJO: "bg-emerald-500/20 text-emerald-200 border-emerald-500/50",
  MEDIO: "bg-amber-500/20 text-amber-200 border-amber-500/50",
  ALTO: "bg-rose-500/20 text-rose-200 border-rose-500/50",
};

export function CreatorAdvisorPanel({ data, error, isLoading }: Props) {
  const [showDebug, setShowDebug] = useState(false);
  const [rawPlanJson, setRawPlanJson] = useState("");
  const [plan, setPlan] = useState<CreatorAdvisorPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200">
        <div className="font-semibold">Asesor IA del creador</div>
        <div className="text-slate-400 mt-1">No se ha podido cargar el asesor IA del creador.</div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200 animate-pulse">
        <div className="font-semibold">Asesor IA del creador</div>
        <div className="h-3 w-32 bg-slate-700/80 rounded mt-2" />
        <div className="h-3 w-48 bg-slate-800 rounded mt-2" />
      </div>
    );
  }

  const { preview, context, prompt } = data;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Asesor IA del creador</div>
          <div className="text-slate-400 text-[11px] mt-[2px]">{preview.headline}</div>
        </div>
        <span className={clsx("inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase", riskColors[preview.riskLevel])}>
          {preview.riskLevel}
        </span>
      </div>
      <ul className="list-disc list-inside space-y-1 text-slate-300">
        {preview.summaryLines.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-1 inline-flex items-center rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-200 hover:border-emerald-400/70 hover:text-emerald-100 transition"
        onClick={() => setShowDebug((v) => !v)}
      >
        {showDebug ? "Ocultar input IA" : "Ver input IA"}
      </button>
      {showDebug && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Contexto</div>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-950/70 p-2 text-[11px] text-slate-100 border border-slate-800">
{JSON.stringify(context, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Prompt IA</div>
            <textarea
              readOnly
              className="mt-1 w-full max-h-48 min-h-[120px] overflow-auto rounded bg-slate-950/70 p-2 text-[11px] text-slate-100 border border-slate-800"
              value={prompt}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Plan sugerido por la IA (borrador)</div>
            <p className="text-[11px] text-slate-400">
              Pega aquí el JSON que te devuelva la IA usando este contexto y prompt. Solo se usa en tu panel, no se envía a ningún fan.
            </p>
            <textarea
              className="w-full min-h-[140px] rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px] text-slate-100"
              placeholder={`{\n  "estado_general": "Resumen corto de cómo va el negocio",\n  "acciones_packs": [],\n  "acciones_contenido": [],\n  "alertas": []\n}`}
              value={rawPlanJson}
              onChange={(e) => setRawPlanJson(e.target.value)}
            />
            {planError && <div className="text-rose-300 text-[11px]">{planError}</div>}
            <button
              type="button"
              className="inline-flex items-center rounded border border-emerald-500/60 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20 transition"
              onClick={() => {
                if (!rawPlanJson.trim()) {
                  setPlan(null);
                  setPlanError(null);
                  return;
                }
                try {
                  const parsed = JSON.parse(rawPlanJson) as CreatorAdvisorPlan;
                  setPlan(parsed);
                  setPlanError(null);
                } catch (_err) {
                  setPlanError("JSON no válido. Revisa comas y comillas.");
                }
              }}
            >
              Aplicar plan
            </button>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-3 text-[11px] text-slate-200 space-y-2">
              {!plan && <div className="text-slate-400">Aún no hay plan aplicado. Pega el JSON de la IA y pulsa “Aplicar plan”.</div>}
              {plan && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Estado del negocio</div>
                    {plan.estado_general && <div className="text-slate-200">{plan.estado_general}</div>}
                    {plan.focos_7_dias && plan.focos_7_dias.length > 0 && (
                      <ul className="list-disc list-inside text-slate-300">
                        {plan.focos_7_dias.map((foco, idx) => (
                          <li key={`foco-${idx}`}>{foco}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Acciones en chat</div>
                    {plan.acciones_chat && plan.acciones_chat.length > 0 ? (
                      <ul className="space-y-2">
                        {plan.acciones_chat.map((item, idx) => (
                          <li key={`chat-${idx}`} className="rounded border border-slate-800 bg-slate-950/50 p-2">
                            <div className="flex items-center gap-2 mb-1">
                              {item.segmento_objetivo && (
                                <span className="inline-flex items-center rounded-full border border-slate-600 px-2 py-[2px] text-[10px] uppercase text-slate-200">
                                  {item.segmento_objetivo}
                                </span>
                              )}
                            </div>
                            <div className="text-slate-200 font-semibold">{item.titulo}</div>
                            {item.descripcion && <div className="text-slate-200">{item.descripcion}</div>}
                            {item.impacto_esperado && <div className="text-[11px] text-slate-400 mt-1">{item.impacto_esperado}</div>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-slate-400">Sin acciones de chat.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Acciones de packs y extras</div>
                    {plan.acciones_packs && plan.acciones_packs.length > 0 ? (
                      <ul className="space-y-2">
                        {plan.acciones_packs.map((item, idx) => (
                          <li key={`pack-${idx}`} className="rounded border border-slate-800 bg-slate-950/50 p-2">
                            <div className="flex items-center gap-2 mb-1">
                              {item.tipo_pack && (
                                <span className="inline-flex items-center rounded-full border border-slate-600 px-2 py-[2px] text-[10px] uppercase text-slate-200">
                                  {item.tipo_pack}
                                </span>
                              )}
                              {item.urgencia && (
                                <span
                                  className={clsx(
                                    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase",
                                    item.urgencia === "ALTA"
                                      ? "border-rose-500/60 text-rose-200 bg-rose-500/10"
                                      : item.urgencia === "MEDIA"
                                      ? "border-amber-500/60 text-amber-200 bg-amber-500/10"
                                      : "border-slate-600 text-slate-200 bg-slate-800/60"
                                  )}
                                >
                                  {item.urgencia}
                                </span>
                              )}
                            </div>
                            <div className="text-slate-200">{item.idea}</div>
                            {item.justificacion && <div className="text-[11px] text-slate-400 mt-1">{item.justificacion}</div>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-slate-400">Sin acciones de packs para esta semana.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Acciones de contenido</div>
                    {plan.acciones_contenido && plan.acciones_contenido.length > 0 ? (
                      <ul className="space-y-2">
                        {plan.acciones_contenido.map((item, idx) => (
                          <li key={`contenido-${idx}`} className="rounded border border-slate-800 bg-slate-950/50 p-2">
                            <div className="flex items-center gap-2 mb-1">
                              {item.urgencia && (
                                <span
                                  className={clsx(
                                    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase",
                                    item.urgencia === "ALTA"
                                      ? "border-rose-500/60 text-rose-200 bg-rose-500/10"
                                      : item.urgencia === "MEDIA"
                                      ? "border-amber-500/60 text-amber-200 bg-amber-500/10"
                                      : "border-slate-600 text-slate-200 bg-slate-800/60"
                                  )}
                                >
                                  {item.urgencia}
                                </span>
                              )}
                            </div>
                            <div className="text-slate-200">{item.idea}</div>
                            {item.justificacion && <div className="text-[11px] text-slate-400 mt-1">{item.justificacion}</div>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-slate-400">Sin acciones de contenido.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Alertas</div>
                    {plan.alertas && plan.alertas.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-slate-200">
                        {plan.alertas.map((alerta, idx) => (
                          <li key={`alerta-${idx}`}>{alerta}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-slate-400">Sin alertas por ahora.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
