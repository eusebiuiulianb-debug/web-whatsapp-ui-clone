import { useState } from "react";
import clsx from "clsx";
import FanManagerPanel from "../chat/FanManagerPanel";
import { IconGlyph } from "../ui/IconGlyph";
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

const OFFER_SLOT_LABELS: Record<string, { phase: string; moment: string }> = {
  DAY_1: { phase: "Suave", moment: "Día" },
  DAY_2: { phase: "Picante", moment: "Día" },
  NIGHT_1: { phase: "Directo", moment: "Noche" },
  NIGHT_2: { phase: "Final", moment: "Noche" },
  ANY: { phase: "Cualquiera", moment: "" },
};
const formatDayPartLabel = (dayPart?: string | null) => {
  if (dayPart === "DAY") return "Día";
  if (dayPart === "NIGHT") return "Noche";
  if (dayPart === "ANY") return "Cualquiera";
  return null;
};
const formatOfferSlot = (slot?: string | null) => {
  if (!slot) return "Cualquiera";
  const meta = OFFER_SLOT_LABELS[slot];
  if (!meta) return slot;
  return meta.moment ? `${meta.phase} · ${meta.moment}` : meta.phase;
};
const formatOfferLabel = (offer?: PpvOffer | null) => {
  if (!offer) return null;
  const tier = offer.tier ?? "T?";
  const dayPartLabel = formatDayPartLabel(offer.dayPart ?? null);
  const slotLabel = dayPartLabel ?? formatOfferSlot(offer.slot);
  return `Oferta: ${tier} · ${slotLabel}`;
};

type PpvOffer = {
  contentId?: string;
  title?: string;
  tier?: string | null;
  dayPart?: string | null;
  slot?: string | null;
  priceCents?: number;
  currency?: string;
};

type Props = {
  managerSuggestions?: { id: string; label: string; message: string; intent?: string }[];
  onApplySuggestion?: (text: string, detail?: string, actionKeyOrIntent?: string) => void;
  draftCards?: { id: string; label: string; text: string; offer?: PpvOffer | null }[];
  onDraftAction?: (draftId: string, action: "alternate" | "shorter" | "softer" | "bolder") => void;
  onInsertOffer?: (text: string, offer: PpvOffer, detail?: string) => void;
  onPhaseAction?: (phase: "suave" | "picante" | "directo" | "final") => void;
  onOpenOfferSelector?: () => void;
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
  onInsertOffer,
  onPhaseAction,
  onOpenOfferSelector,
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
        ? "border-[color:rgba(244,63,94,0.7)] bg-[color:rgba(244,63,94,0.08)] text-[color:var(--text)]"
        : tone === "warning"
        ? "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)]"
        : tone === "success"
        ? "border-[color:var(--brand)] bg-[color:var(--brand-weak)] text-[color:var(--text)]"
        : tone === "info"
        ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
        : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)]"
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
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 md:px-6 md:py-4 text-[11px] text-[color:var(--text)] space-y-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-sm md:text-base font-semibold text-[color:var(--text)]">Manager IA</div>
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
                <span className="text-[11px] text-[color:var(--muted)]">Tono</span>
                <button
                  type="button"
                  onClick={() => onChangeTone("suave")}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] border transition",
                    tone === "suave"
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] border-[color:var(--brand)]"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:border-[color:var(--brand)]"
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
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] border-[color:var(--brand)]"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:border-[color:var(--brand)]"
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
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] border-[color:var(--brand)]"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:border-[color:var(--brand)]"
                  )}
                >
                  Picante
                </button>
              </div>
            )}
            <div className="text-xs md:text-sm leading-relaxed text-[color:var(--muted)]">{managerHeadlineText}</div>
            <div className="text-[11px] md:text-xs text-[color:var(--muted)]">Tú decides qué se envía.</div>
            {suggestedObjectiveLabel && (
              <div className="text-[11px] md:text-xs text-[color:var(--brand)]">
                Objetivo sugerido: {suggestedObjectiveLabel}
              </div>
            )}
            {summaryLine && <div className="text-[11px] md:text-xs text-[color:var(--muted)] truncate">{summaryLine}</div>}
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
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
                    managerDisabled && "opacity-60 cursor-not-allowed"
                  )}
                  title="Genera borradores sugeridos según el estado del fan."
                >
                  <IconGlyph name="spark" className="h-3.5 w-3.5" />
                  <span>Auto-sugerir (solo borradores)</span>
                </button>
                <div className="flex w-full flex-col items-end gap-1 text-[10px] leading-snug min-h-[32px]">
                  <div className="text-[color:var(--muted)]">Nunca envía nada automáticamente. Tú decides qué se envía.</div>
                  <div className={clsx(autoPilotEnabled ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]")}>
                    {autoPilotEnabled
                      ? "ON · Genera borradores sugeridos según el estado del fan (riesgo, caducidad, silencio…)."
                      : "OFF · No genera sugerencias por su cuenta."}
                  </div>
                </div>
              </div>
            )}
            <div
              className={clsx(
                "flex w-full flex-col items-end gap-1 text-[11px] text-[color:var(--muted)] min-h-[64px]",
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
                    "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
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
                    "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
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
              className="self-start inline-flex items-center gap-1.5 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
              aria-expanded={showMore}
              >
                <span>{showMore ? "Ocultar" : "Opciones"}</span>
                <IconGlyph
                  name="chevronDown"
                  className={clsx(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    showMore ? "rotate-180" : "rotate-0"
                  )}
                />
              </button>
          </div>
        </div>
        {managerDisabled && (
          <div className="rounded-lg border border-[color:var(--warning)]/50 bg-[color:rgba(245,158,11,0.08)] px-3 py-2 text-[11px] text-[color:var(--text)]">
            Manager IA está desactivado en este chat bloqueado.
          </div>
        )}
        {isAutoPilotLoading && (
          <div className="inline-flex items-center gap-1 text-[11px] text-[color:var(--brand)]">
            <IconGlyph name="spark" className="h-3.5 w-3.5" />
            <span>Generando borrador…</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {isCriticalExpiry && onSendLink && (
            <button
              type="button"
              className={clsx(
                "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-semibold transition",
                "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]",
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
                ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
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
                  ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
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
                  ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
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
                  ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Fases PPV</span>
          {(["suave", "picante", "directo", "final"] as const).map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => {
                if (objectivesLocked) return;
                onPhaseAction?.(phase);
              }}
              disabled={objectivesLocked}
              className={clsx(
                "inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                objectivesLocked
                  ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)]"
              )}
            >
              {phase === "suave"
                ? "Suave"
                : phase === "picante"
                ? "Picante"
                : phase === "directo"
                ? "Directo"
                : "Final"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              if (objectivesLocked) return;
              onOpenOfferSelector?.();
            }}
            disabled={objectivesLocked}
            className={clsx(
              "inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
              objectivesLocked
                ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                : "border-[color:rgba(245,158,11,0.6)] bg-[color:rgba(245,158,11,0.12)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.2)]"
            )}
          >
            Ofrecer extra
          </button>
        </div>
      </div>
      {draftCards && draftCards.length > 0 && (
        <div className="mt-3 rounded-xl border border-[color:rgba(var(--brand-rgb),0.25)] bg-[color:rgba(var(--brand-rgb),0.06)] p-3 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--brand)]">
            Borradores generados
          </div>
          <div className="space-y-2">
            {draftCards.map((draft) => (
              <div
                key={draft.id}
                className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">{draft.label}</div>
                <div className="text-[12px] text-[color:var(--text)]">{draft.text}</div>
                {draft.offer && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:rgba(var(--brand-rgb),0.12)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)]">
                      {formatOfferLabel(draft.offer)}
                    </span>
                    <button
                      type="button"
                      onClick={() => draft.offer && onInsertOffer?.(draft.text, draft.offer, draft.label)}
                      className="inline-flex items-center rounded-full border border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                    >
                      Insertar + Oferta
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onApplySuggestion?.(draft.text, draft.label, `draft:${draft.id}`)}
                    className="inline-flex items-center rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1 text-[11px] font-medium text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] transition"
                  >
                    Usar en mensaje
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "alternate")}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  >
                    Otra versión
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "shorter")}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  >
                    Más corta
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "softer")}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  >
                    Suavizar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftAction?.(draft.id, "bolder")}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
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
        <div className="mt-3 rounded-xl border border-[color:rgba(var(--brand-rgb),0.25)] bg-[color:rgba(var(--brand-rgb),0.06)] p-3 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--brand)]">
            Sugerencias del Manager
          </div>
          <div className="space-y-2">
            {managerSuggestions.slice(0, 3).map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                  {suggestion.label}
                </div>
                <div className="text-[12px] text-[color:var(--text)]">{suggestion.message}</div>
                <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onApplySuggestion?.(
                      suggestion.message,
                      suggestion.label,
                      suggestion.intent ?? `manager:${suggestion.id}`
                    )
                  }
                  className="inline-flex items-center rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1 text-[11px] font-medium text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] transition"
                >
                  Usar en mensaje
                </button>
                  <button
                    type="button"
                    onClick={() => onRequestSuggestionAlt?.(suggestion.message)}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  >
                    Otra versión
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestSuggestionShorter?.(suggestion.message)}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
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
            "space-y-3 text-[11px] text-[color:var(--text)]",
            showMore ? "border-t border-[color:var(--surface-border)] pt-3" : "pt-0"
          )}
        >
          {(statusLine || sessionSummary || iaSummary) && (
            <div className="flex flex-col gap-1 text-sm md:text-base text-[color:var(--text)]">
              {statusLine && <div className="font-semibold text-[color:var(--text)]">{statusLine}</div>}
              {sessionSummary && <div className="text-[color:var(--text)]">{sessionSummary}</div>}
              {iaSummary && <div className="text-[color:var(--text)]">{iaSummary}</div>}
            </div>
          )}
          {suggestedObjectiveLabel && (
            <div className="text-xs md:text-sm text-[color:var(--muted)]">
              Objetivo actual del Manager: <span className="text-[color:var(--text)]">{suggestedObjectiveLabel}</span>
            </div>
          )}
          {toneLabel && (
            <div className="text-xs md:text-sm text-[color:var(--muted)]">
              Tono IA actual: <span className="text-[color:var(--text)]">{toneLabel}</span>
            </div>
          )}
          {planSummaryText && (
            <div className="mt-5 border-t border-[color:var(--surface-border)] pt-4">
              <p className="text-xs md:text-sm font-semibold text-[color:var(--muted)] uppercase tracking-wide mb-1.5">
                Plan de hoy
              </p>
              <p className="text-sm md:text-base text-[color:var(--text)] leading-relaxed max-w-3xl">
                {planSummaryText}
              </p>
            </div>
          )}
          <div className="mt-5 border-t border-[color:var(--surface-border)] pt-4">
            <p className="text-xs md:text-sm font-semibold text-[color:var(--muted)] uppercase tracking-wide mb-1.5">
              Historial del fan
            </p>
            <div className="space-y-1 text-xs md:text-sm text-[color:var(--muted)]">
              <div>
                Nivel: <span className="text-[color:var(--text)]">{tierLabel}</span>
                {priceLabel ? <span className="text-[color:var(--muted)]"> ({priceLabel})</span> : null} ·{" "}
                <span className="text-[color:var(--text)]">{daysLeftLabel}</span>
              </div>
              <div>
                Total gastado: <span className="text-[color:var(--text)]">{lifetimeTotalLabel}</span>
              </div>
              <div>
                Extras: <span className="text-[color:var(--text)]">{extrasLabel}</span> · Propinas:{" "}
                <span className="text-[color:var(--text)]">{tipsLabel}</span> · Regalos:{" "}
                <span className="text-[color:var(--text)]">{giftsLabel}</span>
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
