import { useState } from "react";
import clsx from "clsx";
import FanManagerPanel from "../chat/FanManagerPanel";
import type { FanManagerSummary } from "../../server/manager/managerService";
import type { FanManagerChip, FanManagerState, FanTone, ManagerObjective } from "../../types/manager";

function formatObjectiveLabel(objective?: ManagerObjective | null) {
  switch (objective) {
    case "bienvenida":
      return "Bienvenida";
    case "romper_hielo":
      return "Romper el hielo";
    case "reactivar_fan_frio":
      return "Reactivar fan frío";
    case "ofrecer_extra":
      return "Ofrecer un extra";
    case "llevar_a_mensual":
      return "Llevar a mensual";
    case "renovacion":
      return "Renovación";
    default:
      return null;
  }
}

function formatToneLabel(tone?: FanTone | null) {
  if (tone === "suave") return "Suave";
  if (tone === "picante") return "Picante";
  if (tone === "intimo") return "Íntimo";
  return null;
}

type Props = {
  managerSuggestions?: { id: string; label: string; message: string }[];
  onApplySuggestion?: (text: string, detail?: string) => void;
  draftCards?: { id: string; label: string; text: string }[];
  onDraftAction?: (draftId: string, action: "alternate" | "shorter" | "softer" | "bolder") => void;
  currentObjective?: ManagerObjective | null;
  suggestedObjective?: ManagerObjective | null;
  fanManagerState?: FanManagerState | null;
  fanManagerHeadline?: string | null;
  fanManagerChips?: FanManagerChip[];
  daysLeft?: number | null;
  tone?: FanTone;
  onChangeTone?: (tone: FanTone) => void;
  statusLine: string;
  lapexSummary?: string | null;
  sessionSummary?: string | null;
  iaSummary?: string | null;
  planSummary?: string | null;
  closedSummary?: string | null;
  monetization?: FanManagerSummary["monetization"] | null;
  subscriptionLabel?: string | null;
  fanId: string | null | undefined;
  onManagerSummary: (summary: FanManagerSummary | null) => void;
  onSuggestionClick: (text: string) => void;
  onQuickGreeting: () => void;
  onSendLink?: () => void;
  onRenew: () => void;
  onQuickExtra: () => void;
  onPackOffer: () => void;
  onRequestSuggestionAlt?: (text: string) => void;
  onRequestSuggestionShorter?: (text: string) => void;
  showRenewAction: boolean;
  quickExtraDisabled?: boolean;
  isRecommended: (id: string) => boolean;
  isBlocked?: boolean;
  autoPilotEnabled?: boolean;
  onToggleAutoPilot?: () => void;
  isAutoPilotLoading?: boolean;
  hasAutopilotContext?: boolean;
  onAutopilotSoften?: () => void;
  onAutopilotMakeBolder?: () => void;
};

export default function FanManagerDrawer({
  statusLine,
  lapexSummary: _lapexSummary,
  sessionSummary,
  iaSummary,
  planSummary,
  closedSummary,
  monetization,
  subscriptionLabel,
  fanId,
  onManagerSummary,
  onSuggestionClick,
  managerSuggestions,
  onApplySuggestion,
  draftCards,
  onDraftAction,
  currentObjective,
  suggestedObjective,
  fanManagerState,
  fanManagerHeadline,
  fanManagerChips,
  daysLeft,
  tone,
  onChangeTone,
  onQuickGreeting,
  onSendLink,
  onRenew,
  onQuickExtra,
  onPackOffer,
  onRequestSuggestionAlt,
  onRequestSuggestionShorter,
  showRenewAction,
  quickExtraDisabled,
  isRecommended,
  isBlocked = false,
  autoPilotEnabled = false,
  onToggleAutoPilot,
  isAutoPilotLoading = false,
  hasAutopilotContext = false,
  onAutopilotSoften,
  onAutopilotMakeBolder,
}: Props) {
  const [showMore, setShowMore] = useState(false);
  const summaryLine = closedSummary || planSummary || statusLine;
  const planSummaryText = planSummary ? planSummary.replace(/^Plan de hoy:\s*/i, "").trim() : null;
  const managerDisabled = isBlocked;
  const managerHeadlineText =
    fanManagerHeadline || "Te ayuda a escribir mensajes claros, cercanos y profesionales.";
  const stateChips = fanManagerChips ?? [];
  const chipClass = (tone?: FanManagerChip["tone"]) =>
    clsx(
      "inline-flex items-center rounded-full border px-3 py-0.5 text-xs md:text-sm font-medium",
      tone === "danger"
        ? "border-rose-400/70 bg-rose-500/10 text-rose-100"
        : tone === "warning"
        ? "border-amber-400/70 bg-amber-500/10 text-amber-100"
        : tone === "success"
        ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
        : tone === "info"
        ? "border-sky-400/70 bg-sky-500/10 text-sky-100"
        : "border-slate-700 bg-slate-900/60 text-slate-100"
    );
  const isCriticalExpiry = typeof daysLeft === "number" && daysLeft <= 0;
  const suggestedObjectiveLabel =
    suggestedObjective === "renovacion" && isCriticalExpiry
      ? "Renovación hoy"
      : formatObjectiveLabel(suggestedObjective ?? null);
  const toneLabel = formatToneLabel(tone);
  const isObjectiveActive = (objective: ManagerObjective) => currentObjective === objective;
  const objectivesLocked = managerDisabled || isAutoPilotLoading;
  const showAutopilotAdjust = autoPilotEnabled && hasAutopilotContext;
  const monetizationData = monetization ?? null;
  const formatCount = (value?: number | null) => (typeof value === "number" ? `${value}` : "—");
  const formatEuro = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}€` : "—";
  const fallbackSubscriptionLabel = monetizationData
    ? monetizationData.subscription.active
      ? "Suscripción activa"
      : "Sin acceso"
    : "—";
  const tierLabel = subscriptionLabel ?? fallbackSubscriptionLabel;
  const hasPrice =
    Boolean(monetizationData?.subscription?.active) &&
    typeof monetizationData?.subscription?.price === "number" &&
    Number.isFinite(monetizationData.subscription.price);
  const priceLabel = hasPrice ? formatEuro(monetizationData?.subscription?.price ?? null) : null;
  const daysLeftLabel =
    typeof monetizationData?.subscription?.daysLeft === "number"
      ? `${monetizationData.subscription.daysLeft}d`
      : "—";
  const lifetimeTotalLabel = formatEuro(monetizationData?.totalSpent ?? null);
  const extrasLabel = `${formatCount(monetizationData?.extras?.count ?? null)} (${formatEuro(
    monetizationData?.extras?.total ?? null
  )})`;
  const tipsLabel = `${formatCount(monetizationData?.tips?.count ?? null)} (${formatEuro(
    monetizationData?.tips?.total ?? null
  )})`;
  const giftsLabel = formatCount(monetizationData?.gifts?.count ?? null);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 md:px-6 md:py-4 text-[11px] text-slate-100 space-y-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-sm md:text-base font-semibold text-slate-100">Manager IA</div>
            {stateChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {stateChips.map((chip, idx) => (
                  <span key={`${chip.label}-${idx}`} className={chipClass(chip.tone)}>
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
            {tone && onChangeTone && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">Tono</span>
                <button
                  type="button"
                  onClick={() => onChangeTone("suave")}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] border transition",
                    tone === "suave"
                      ? "bg-emerald-600 text-white border-emerald-500"
                      : "bg-slate-800/90 text-slate-200 border-slate-600 hover:border-emerald-400"
                  )}
                >
                  Suave
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTone("intimo")}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] border transition",
                    tone === "intimo"
                      ? "bg-emerald-600 text-white border-emerald-500"
                      : "bg-slate-800/90 text-slate-200 border-slate-600 hover:border-emerald-400"
                  )}
                >
                  Íntimo
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTone("picante")}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] border transition",
                    tone === "picante"
                      ? "bg-emerald-600 text-white border-emerald-500"
                      : "bg-slate-800/90 text-slate-200 border-slate-600 hover:border-emerald-400"
                  )}
                >
                  Picante
                </button>
              </div>
            )}
            <div className="text-xs md:text-sm leading-relaxed text-slate-300">{managerHeadlineText}</div>
            <div className="text-[11px] md:text-xs text-slate-400">Tú decides qué se envía.</div>
            {suggestedObjectiveLabel && (
              <div className="text-[11px] md:text-xs text-emerald-200">
                Objetivo sugerido: {suggestedObjectiveLabel}
              </div>
            )}
            {summaryLine && <div className="text-[11px] md:text-xs text-slate-300 truncate">{summaryLine}</div>}
          </div>
          <div className="flex flex-col items-end gap-2 w-full md:w-[280px] shrink-0">
            {onToggleAutoPilot && (
              <div className="flex flex-col items-end gap-2 w-full">
                <button
                  type="button"
                  onClick={onToggleAutoPilot}
                  disabled={managerDisabled}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                    autoPilotEnabled
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                      : "border-slate-600 bg-slate-800/80 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
                    managerDisabled && "opacity-60 cursor-not-allowed"
                  )}
                  title="Genera borradores sugeridos según el estado del fan."
                >
                  ⚡ Auto-sugerir (solo borradores)
                </button>
                <div className="flex w-full flex-col items-end gap-1 text-[10px] leading-snug min-h-[32px]">
                  <div className="text-slate-400">Nunca envía nada automáticamente. Tú decides qué se envía.</div>
                  <div className={clsx(autoPilotEnabled ? "text-emerald-200" : "text-slate-400")}>
                    {autoPilotEnabled
                      ? "ON · Genera borradores sugeridos según el estado del fan (riesgo, caducidad, silencio…)."
                      : "OFF · No genera sugerencias por su cuenta."}
                  </div>
                </div>
              </div>
            )}
            <div
              className={clsx(
                "flex w-full flex-col items-end gap-1 text-[11px] text-slate-300 min-h-[64px]",
                showAutopilotAdjust ? "visible" : "invisible"
              )}
              aria-hidden={!showAutopilotAdjust}
            >
              <span className="text-right">Ajustar mensaje rápido:</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isAutoPilotLoading || managerDisabled || !showAutopilotAdjust}
                  onClick={onAutopilotSoften}
                  className={clsx(
                    "rounded-full border px-3 py-1 transition",
                    "border-slate-600 bg-slate-800/80 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
                    (isAutoPilotLoading || managerDisabled || !showAutopilotAdjust) && "opacity-60 cursor-not-allowed"
                  )}
                >
                  Suavizar
                </button>
                <button
                  type="button"
                  disabled={isAutoPilotLoading || managerDisabled || !showAutopilotAdjust}
                  onClick={onAutopilotMakeBolder}
                  className={clsx(
                    "rounded-full border px-3 py-1 transition",
                    "border-slate-600 bg-slate-800/80 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
                    (isAutoPilotLoading || managerDisabled || !showAutopilotAdjust) && "opacity-60 cursor-not-allowed"
                  )}
                >
                  Más directo
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMore((prev) => !prev)}
              className="self-start inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
              aria-expanded={showMore}
            >
              <span>{showMore ? "Ocultar" : "Opciones"}</span>
              <span
                className={clsx(
                  "inline-flex items-center transition-transform duration-200",
                  showMore ? "rotate-180" : "rotate-0"
                )}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
          </div>
        </div>
        {managerDisabled && (
          <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            Manager IA está desactivado en este chat bloqueado.
          </div>
        )}
        {isAutoPilotLoading && (
          <div className="text-[11px] text-emerald-200">⚡ Generando borrador…</div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {isCriticalExpiry && onSendLink && (
            <button
              type="button"
              className={clsx(
                "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-semibold transition",
                "border-sky-400 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30",
                objectivesLocked && "opacity-60 cursor-not-allowed"
              )}
              onClick={() => {
                if (objectivesLocked) return;
                onSendLink();
              }}
              title="Enviar enlace de renovación ahora."
              disabled={objectivesLocked}
            >
              Enviar enlace
            </button>
          )}
          <button
            type="button"
            className={clsx(
              "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
              isObjectiveActive("bienvenida") || isObjectiveActive("romper_hielo") || isRecommended("saludo_rapido")
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
              objectivesLocked && "opacity-60 cursor-not-allowed"
            )}
            onClick={() => {
              if (objectivesLocked) return;
              onQuickGreeting();
            }}
            title="Mensaje breve para iniciar conversación o retomar contacto de forma natural."
            disabled={objectivesLocked}
          >
            Romper el hielo
          </button>
          {showRenewAction && (
            <button
              type="button"
              className={clsx(
                "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
                isObjectiveActive("reactivar_fan_frio") || isRecommended("renenganche")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
                objectivesLocked && "opacity-60 cursor-not-allowed"
              )}
              onClick={() => {
                if (objectivesLocked) return;
                onRenew();
              }}
              title="Pide feedback de lo que más le ha ayudado hasta ahora y adelanta que en unos días llegará el enlace de renovación."
              disabled={objectivesLocked}
            >
              Reactivar fan frío
            </button>
          )}
          <button
            type="button"
            className={clsx(
                "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
                isObjectiveActive("ofrecer_extra") || isRecommended("extra_rapido")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
              quickExtraDisabled || objectivesLocked ? "opacity-60 cursor-not-allowed" : ""
            )}
            onClick={() => {
              if (objectivesLocked || quickExtraDisabled) return;
              onQuickExtra();
            }}
            disabled={quickExtraDisabled || objectivesLocked}
            title="Propuesta suave para ofrecer un contenido extra o actividad puntual."
          >
            Ofrecer un extra
          </button>
          <button
            type="button"
            className={clsx(
                "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
                isObjectiveActive("llevar_a_mensual") || isObjectiveActive("renovacion") || isRecommended("elegir_pack")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
              objectivesLocked && "opacity-60 cursor-not-allowed"
              )}
            onClick={() => {
              if (objectivesLocked) return;
              onPackOffer();
            }}
            title="Invitación clara para pasar al pack mensual sin presión."
            disabled={objectivesLocked}
          >
            Llevar a mensual
          </button>
        </div>
      </div>
      {draftCards && draftCards.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
            Borradores generados
          </div>
          <div className="space-y-2">
            {draftCards.map((draft) => (
              <div
                key={draft.id}
                className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 space-y-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{draft.label}</div>
                <div className="text-[12px] text-slate-100">{draft.text}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onApplySuggestion?.(draft.text, draft.label)}
                    className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/20 transition"
                  >
                    Usar en mensaje
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "alternate")}
                    className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/40 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:border-slate-500/70"
                  >
                    Otra versión
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "shorter")}
                    className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/40 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:border-slate-500/70"
                  >
                    Más corta
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "softer")}
                    className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/40 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:border-slate-500/70"
                  >
                    Suavizar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "bolder")}
                    className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/40 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:border-slate-500/70"
                  >
                    Más directo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {managerSuggestions && managerSuggestions.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
            Sugerencias del Manager
          </div>
          <div className="space-y-2">
            {managerSuggestions.slice(0, 3).map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 space-y-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  {suggestion.label}
                </div>
                <div className="text-[12px] text-slate-100">{suggestion.message}</div>
                <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onApplySuggestion?.(suggestion.message, suggestion.label)}
                  className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/20 transition"
                >
                  Usar en mensaje
                </button>
                  <button
                    type="button"
                    onClick={() => onRequestSuggestionAlt?.(suggestion.message)}
                    className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/40 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:border-slate-500/70"
                  >
                    Otra versión
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestSuggestionShorter?.(suggestion.message)}
                    className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/40 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:border-slate-500/70"
                  >
                    Más corta
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        className={clsx(
          "mt-3 overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
          showMore ? "max-h-[900px] opacity-100" : "max-h-0 opacity-0"
        )}
        aria-hidden={!showMore}
      >
        <div
          className={clsx(
            "space-y-3 text-[11px] text-slate-200",
            showMore ? "border-t border-slate-800 pt-3" : "pt-0"
          )}
        >
          {(statusLine || sessionSummary || iaSummary) && (
            <div className="flex flex-col gap-1 text-sm md:text-base text-slate-200">
              {statusLine && <div className="font-semibold text-slate-100">{statusLine}</div>}
              {sessionSummary && <div className="text-slate-200">{sessionSummary}</div>}
              {iaSummary && <div className="text-slate-200">{iaSummary}</div>}
            </div>
          )}
          {suggestedObjectiveLabel && (
            <div className="text-xs md:text-sm text-slate-300">
              Objetivo actual del Manager: <span className="text-slate-100">{suggestedObjectiveLabel}</span>
            </div>
          )}
          {toneLabel && (
            <div className="text-xs md:text-sm text-slate-300">
              Tono IA actual: <span className="text-slate-100">{toneLabel}</span>
            </div>
          )}
          {planSummaryText && (
            <div className="mt-5 border-t border-slate-800 pt-4">
              <p className="text-xs md:text-sm font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Plan de hoy
              </p>
              <p className="text-sm md:text-base text-slate-100 leading-relaxed max-w-3xl">
                {planSummaryText}
              </p>
            </div>
          )}
          <div className="mt-5 border-t border-slate-800 pt-4">
            <p className="text-xs md:text-sm font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Historial del fan
            </p>
            <div className="space-y-1 text-xs md:text-sm text-slate-300">
              <div>
                Nivel: <span className="text-slate-100">{tierLabel}</span>
                {priceLabel ? <span className="text-slate-400"> ({priceLabel})</span> : null} ·{" "}
                <span className="text-slate-100">{daysLeftLabel}</span>
              </div>
              <div>
                Total gastado: <span className="text-slate-100">{lifetimeTotalLabel}</span>
              </div>
              <div>
                Extras: <span className="text-slate-100">{extrasLabel}</span> · Propinas:{" "}
                <span className="text-slate-100">{tipsLabel}</span> · Regalos:{" "}
                <span className="text-slate-100">{giftsLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="hidden">
        <FanManagerPanel
          fanId={fanId}
          onSummary={onManagerSummary}
          onSuggestionClick={onSuggestionClick}
          hideSuggestions
          headline={fanManagerHeadline ?? undefined}
          chips={fanManagerChips}
          fanManagerState={fanManagerState ?? undefined}
          suggestedObjective={suggestedObjective ?? currentObjective ?? null}
          tone={tone}
          onChangeTone={onChangeTone}
        />
      </div>
    </div>
  );
}
