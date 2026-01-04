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
  BAJO: "bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--brand)] border-[color:rgba(var(--brand-rgb),0.5)]",
  MEDIO: "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--warning)] border-[color:rgba(245,158,11,0.5)]",
  ALTO: "bg-[color:rgba(244,63,94,0.16)] text-[color:var(--danger)] border-[color:rgba(244,63,94,0.5)]",
};

export function CreatorAdvisorPanel({ data, error, isLoading }: Props) {
  const [showDebug, setShowDebug] = useState(false);
  const [rawPlanJson, setRawPlanJson] = useState("");
  const [plan, setPlan] = useState<CreatorAdvisorPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 text-xs text-[color:var(--text)]">
        <div className="font-semibold">Asesor IA del creador</div>
        <div className="text-[color:var(--muted)] mt-1">No se ha podido cargar el asesor IA del creador.</div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 text-xs text-[color:var(--text)] animate-pulse">
        <div className="font-semibold">Asesor IA del creador</div>
        <div className="h-3 w-32 bg-[color:var(--surface-2)]/80 rounded mt-2" />
        <div className="h-3 w-48 bg-[color:var(--surface-2)] rounded mt-2" />
      </div>
    );
  }

  const { preview, context, prompt } = data;

  return (
    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 text-xs text-[color:var(--text)] space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Asesor IA del creador</div>
          <div className="text-[color:var(--muted)] text-[11px] mt-[2px]">{preview.headline}</div>
        </div>
        <span className={clsx("inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase", riskColors[preview.riskLevel])}>
          {preview.riskLevel}
        </span>
      </div>
      <ul className="list-disc list-inside space-y-1 text-[color:var(--muted)]">
        {preview.summaryLines.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-1 inline-flex items-center rounded border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] text-[color:var(--text)] hover:border-[color:rgba(var(--brand-rgb),0.45)] hover:text-[color:var(--text)] transition"
        onClick={() => setShowDebug((v) => !v)}
      >
        {showDebug ? "Ocultar input IA" : "Ver input IA"}
      </button>
      {showDebug && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Contexto</div>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-[color:var(--surface-2)] p-2 text-[11px] text-[color:var(--text)] border border-[color:var(--surface-border)]">
{JSON.stringify(context, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Prompt IA</div>
            <textarea
              readOnly
              className="mt-1 w-full max-h-48 min-h-[120px] overflow-auto rounded bg-[color:var(--surface-2)] p-2 text-[11px] text-[color:var(--text)] border border-[color:var(--surface-border)]"
              value={prompt}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Plan sugerido por la IA (borrador)</div>
            <p className="text-[11px] text-[color:var(--muted)]">
              Pega aquí el JSON que te devuelva la IA usando este contexto y prompt. Solo se usa en tu panel, no se envía a ningún fan.
            </p>
            <textarea
              className="w-full min-h-[140px] rounded border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-2 text-[11px] text-[color:var(--text)]"
              placeholder={`{\n  "estado_general": "Resumen corto de cómo va el negocio",\n  "acciones_packs": [],\n  "acciones_contenido": [],\n  "alertas": []\n}`}
              value={rawPlanJson}
              onChange={(e) => setRawPlanJson(e.target.value)}
            />
            {planError && <div className="text-[color:var(--danger)] text-[11px]">{planError}</div>}
            <button
              type="button"
              className="inline-flex items-center rounded border border-[color:var(--brand)]/60 bg-[color:rgba(var(--brand-rgb),0.12)] px-2 py-1 text-[11px] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)] transition"
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
            <div className="rounded border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 text-[11px] text-[color:var(--text)] space-y-2">
              {!plan && <div className="text-[color:var(--muted)]">Aún no hay plan aplicado. Pega el JSON de la IA y pulsa “Aplicar plan”.</div>}
              {plan && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Estado del negocio</div>
                    {plan.estado_general && <div className="text-[color:var(--text)]">{plan.estado_general}</div>}
                    {plan.focos_7_dias && plan.focos_7_dias.length > 0 && (
                      <ul className="list-disc list-inside text-[color:var(--muted)]">
                        {plan.focos_7_dias.map((foco, idx) => (
                          <li key={`foco-${idx}`}>{foco}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Acciones en chat</div>
                    {plan.acciones_chat && plan.acciones_chat.length > 0 ? (
                      <ul className="space-y-2">
                        {plan.acciones_chat.map((item, idx) => (
                          <li key={`chat-${idx}`} className="rounded border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-2">
                            <div className="flex items-center gap-2 mb-1">
                              {item.segmento_objetivo && (
                                <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] px-2 py-[2px] text-[10px] uppercase text-[color:var(--text)]">
                                  {item.segmento_objetivo}
                                </span>
                              )}
                            </div>
                            <div className="text-[color:var(--text)] font-semibold">{item.titulo}</div>
                            {item.descripcion && <div className="text-[color:var(--text)]">{item.descripcion}</div>}
                            {item.impacto_esperado && <div className="text-[11px] text-[color:var(--muted)] mt-1">{item.impacto_esperado}</div>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[color:var(--muted)]">Sin acciones de chat.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Acciones de packs y extras</div>
                    {plan.acciones_packs && plan.acciones_packs.length > 0 ? (
                      <ul className="space-y-2">
                        {plan.acciones_packs.map((item, idx) => (
                          <li key={`pack-${idx}`} className="rounded border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-2">
                            <div className="flex items-center gap-2 mb-1">
                              {item.tipo_pack && (
                                <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] px-2 py-[2px] text-[10px] uppercase text-[color:var(--text)]">
                                  {item.tipo_pack}
                                </span>
                              )}
                              {item.urgencia && (
                                <span
                                  className={clsx(
                                    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase",
                                    item.urgencia === "ALTA"
                                      ? "border-[color:rgba(244,63,94,0.6)] text-[color:var(--danger)] bg-[color:rgba(244,63,94,0.08)]"
                                      : item.urgencia === "MEDIA"
                                      ? "border-[color:rgba(245,158,11,0.6)] text-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)]"
                                      : "border-[color:var(--surface-border)] text-[color:var(--text)] bg-[color:var(--surface-2)]"
                                  )}
                                >
                                  {item.urgencia}
                                </span>
                              )}
                            </div>
                            <div className="text-[color:var(--text)]">{item.idea}</div>
                            {item.justificacion && <div className="text-[11px] text-[color:var(--muted)] mt-1">{item.justificacion}</div>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[color:var(--muted)]">Sin acciones de packs para esta semana.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Acciones de contenido</div>
                    {plan.acciones_contenido && plan.acciones_contenido.length > 0 ? (
                      <ul className="space-y-2">
                        {plan.acciones_contenido.map((item, idx) => (
                          <li key={`contenido-${idx}`} className="rounded border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-2">
                            <div className="flex items-center gap-2 mb-1">
                              {item.urgencia && (
                                <span
                                  className={clsx(
                                    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase",
                                    item.urgencia === "ALTA"
                                      ? "border-[color:rgba(244,63,94,0.6)] text-[color:var(--danger)] bg-[color:rgba(244,63,94,0.08)]"
                                      : item.urgencia === "MEDIA"
                                      ? "border-[color:rgba(245,158,11,0.6)] text-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)]"
                                      : "border-[color:var(--surface-border)] text-[color:var(--text)] bg-[color:var(--surface-2)]"
                                  )}
                                >
                                  {item.urgencia}
                                </span>
                              )}
                            </div>
                            <div className="text-[color:var(--text)]">{item.idea}</div>
                            {item.justificacion && <div className="text-[11px] text-[color:var(--muted)] mt-1">{item.justificacion}</div>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[color:var(--muted)]">Sin acciones de contenido.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Alertas</div>
                    {plan.alertas && plan.alertas.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-[color:var(--text)]">
                        {plan.alertas.map((alerta, idx) => (
                          <li key={`alerta-${idx}`}>{alerta}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[color:var(--muted)]">Sin alertas por ahora.</div>
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
