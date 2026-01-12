import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import FanManagerPanel from "../chat/FanManagerPanel";
import { IconGlyph } from "../ui/IconGlyph";
import type { FanManagerSummary } from "../../server/manager/managerService";
import type { FanManagerChip, FanManagerState, FanTone, ManagerObjective } from "../../types/manager";
import { scoreDraft } from "../../lib/agency/drafts";

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
const buildDraftMetaLine = (meta?: DraftMeta | null) => {
  if (!meta) return "Usando: —";
  const segments = [
    meta.stageLabel,
    meta.objectiveLabel,
    meta.intensityLabel,
    meta.styleLabel,
    meta.toneLabel,
    meta.lengthLabel,
    meta.ppvPhaseLabel,
  ].filter((value): value is string => Boolean(value && value.trim()));
  if (segments.length === 0) return "Usando: —";
  return `Usando: ${segments.join(" · ")}`;
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

type DraftDirectness = "suave" | "neutro" | "directo";
type DraftOutputLength = "short" | "medium" | "long";
type DraftMeta = {
  stageLabel: string;
  objectiveLabel: string;
  intensityLabel: string;
  styleLabel: string;
  toneLabel: string;
  lengthLabel: string;
  primaryActionLabel?: string | null;
  ppvPhaseLabel?: string | null;
};

type Props = {
  managerSuggestions?: { id: string; label: string; message: string; intent?: string }[];
  reengageSuggestions?: { id: string; label: string; message: string; intent?: string }[];
  reengageLoading?: boolean;
  onApplySuggestion?: (text: string, detail?: string, actionKeyOrIntent?: string) => void;
  onApplyReengage?: (text: string, detail?: string, actionKeyOrIntent?: string) => void;
  draftCards?: { id: string; label: string; text: string; offer?: PpvOffer | null; meta?: DraftMeta | null }[];
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
  onRequestReengageAlt?: (suggestionId: string) => void;
  onRequestReengageShorter?: (suggestionId: string) => void;
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
  agencyObjectiveLabel?: string | null;
  agencyStyleLabel?: string | null;
  draftActionPhase?: string | null;
  draftActionError?: string | null;
  onDraftCancel?: () => void;
  onDraftRetry?: () => void;
  draftActionKey?: string | null;
  draftActionLoading?: boolean;
  draftDirectnessById?: Record<string, DraftDirectness | null>;
  draftOutputLength?: DraftOutputLength;
  onDraftOutputLengthChange?: (length: DraftOutputLength) => void;
  fanLanguage?: string | null;
  managerIaMode?: "simple" | "advanced";
  onManagerIaModeChange?: (mode: "simple" | "advanced") => void;
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
  reengageSuggestions,
  reengageLoading = false,
  onApplySuggestion,
  onApplyReengage,
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
  onRequestReengageAlt,
  onRequestReengageShorter,
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
  agencyObjectiveLabel,
  agencyStyleLabel,
  draftActionPhase = null,
  draftActionError = null,
  onDraftCancel,
  onDraftRetry,
  draftActionKey = null,
  draftActionLoading = false,
  draftDirectnessById = {},
  draftOutputLength = "medium",
  onDraftOutputLengthChange,
  fanLanguage = null,
  managerIaMode = "simple",
  onManagerIaModeChange,
}: Props) {
  const [showMore, setShowMore] = useState(false);
  const isSimpleMode = managerIaMode === "simple";
  const draftSectionRef = useRef<HTMLDivElement | null>(null);
  const prevDraftCountRef = useRef(0);
  const prevDraftLoadingRef = useRef(false);
  const summaryLine = closedSummary || planSummary || statusLine;
  const hasDrafts = Boolean(draftCards && draftCards.length > 0);
  const visibleDraftCards = isSimpleMode ? (draftCards?.slice(0, 1) ?? []) : (draftCards ?? []);
  const planSummaryText = planSummary ? planSummary.replace(/^Plan de hoy:\s*/i, "").trim() : null;
  const managerDisabled = isBlocked;
  const managerHeadlineText =
    fanManagerHeadline || "Te ayuda a escribir mensajes claros, cercanos y profesionales.";
  const fanLanguageLabel = typeof fanLanguage === "string" && fanLanguage.trim() ? fanLanguage.trim().toUpperCase() : null;
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
  const objectiveDetailLabel = agencyObjectiveLabel ?? suggestedObjectiveLabel;
  const toneLabel = formatToneLabel(tone);
  const toneControlLabel = isSimpleMode ? "Nivel" : "Tono";
  const toneOptions: Array<{ value: FanTone; label: string }> = isSimpleMode
    ? [
        { value: "suave", label: "Suave" },
        { value: "intimo", label: "Picante" },
        { value: "picante", label: "Directo" },
      ]
    : [
        { value: "suave", label: "Suave" },
        { value: "intimo", label: "Íntimo" },
        { value: "picante", label: "Picante" },
      ];
  const canChangeMode = Boolean(onManagerIaModeChange);
  const showBolderAction = !isSimpleMode || tone !== "picante";
  const isObjectiveActive = (objective: ManagerObjective) => currentObjective === objective;
  const objectivesLocked = managerDisabled || isAutoPilotLoading || draftActionLoading;
  const isDraftActionLoading = (key: string) => draftActionLoading && draftActionKey === key;
  const draftActionKeyFor = (scope: "objective" | "draft", id: string, action?: string) =>
    scope === "draft" ? `draft:${id}:${action ?? "variant"}` : `objective:${id}`;
  const showPpvPhases =
    !isSimpleMode &&
    (isObjectiveActive("ofrecer_extra") || isDraftActionLoading(draftActionKeyFor("objective", "ofrecer_extra")));
  const showAutopilotAdjust = !isSimpleMode && autoPilotEnabled && hasAutopilotContext && hasDrafts;
  const showVariantActions = !isSimpleMode && hasDrafts;
  const monetizationData = monetization ?? null;
  const formatCount = (value?: number | null) => (typeof value === "number" ? `${value}` : "—");
  const formatEuro = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}€` : "—";
  const renderLoadingLabel = () => (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--surface-border)] border-t-transparent" />
      <span>{isSimpleMode ? "Pensando..." : "Generando..."}</span>
    </span>
  );

  useEffect(() => {
    const count = draftCards?.length ?? 0;
    const finishedLoading = prevDraftLoadingRef.current && !draftActionLoading;
    if ((finishedLoading && count > 0) || (!draftActionLoading && count > prevDraftCountRef.current)) {
      draftSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevDraftCountRef.current = count;
    prevDraftLoadingRef.current = draftActionLoading;
  }, [draftActionLoading, draftCards?.length]);
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm md:text-base font-semibold text-[color:var(--text)]">Manager IA</div>
              <div
                className={clsx(
                  "inline-flex items-center rounded-full border px-1 py-0.5 text-[10px] font-semibold",
                  canChangeMode
                    ? "border-[color:var(--surface-border)] bg-[color:var(--surface-1)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] opacity-60"
                )}
                role="tablist"
                aria-label="Modo Manager IA"
              >
                {(["simple", "advanced"] as const).map((mode) => {
                  const active = managerIaMode === mode;
                  const label = mode === "simple" ? "Simple" : "Avanzado";
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onManagerIaModeChange?.(mode)}
                      disabled={!canChangeMode}
                      role="tab"
                      aria-selected={active}
                      className={clsx(
                        "rounded-full px-3 py-1 transition",
                        active
                          ? "bg-[color:var(--brand-strong)] text-[color:var(--text)]"
                          : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {!isSimpleMode && stateChips.length > 0 && (
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
                <span className="text-[11px] text-[color:var(--muted)]">{toneControlLabel}</span>
                {toneOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChangeTone(option.value)}
                    className={clsx(
                      "rounded-full px-3 py-1 text-[11px] border transition",
                      tone === option.value
                        ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] border-[color:var(--brand)]"
                        : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:border-[color:var(--brand)]"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            {!isSimpleMode && onDraftOutputLengthChange && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[color:var(--muted)]">Longitud</span>
                <button
                  type="button"
                  disabled={objectivesLocked}
                  onClick={() => onDraftOutputLengthChange("short")}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] border transition",
                    draftOutputLength === "short"
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] border-[color:var(--brand)]"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:border-[color:var(--brand)]",
                    objectivesLocked && "opacity-60 cursor-not-allowed"
                  )}
                >
                  Corta
                </button>
                <button
                  type="button"
                  disabled={objectivesLocked}
                  onClick={() => onDraftOutputLengthChange("medium")}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] border transition",
                    draftOutputLength === "medium"
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] border-[color:var(--brand)]"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:border-[color:var(--brand)]",
                    objectivesLocked && "opacity-60 cursor-not-allowed"
                  )}
                >
                  Media
                </button>
                <button
                  type="button"
                  disabled={objectivesLocked}
                  onClick={() => onDraftOutputLengthChange("long")}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] border transition",
                    draftOutputLength === "long"
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] border-[color:var(--brand)]"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:border-[color:var(--brand)]",
                    objectivesLocked && "opacity-60 cursor-not-allowed"
                  )}
                >
                  Larga
                </button>
              </div>
            )}
            {!isSimpleMode && (
              <>
                <div className="text-xs md:text-sm leading-relaxed text-[color:var(--muted)]">{managerHeadlineText}</div>
                <div className="text-[11px] md:text-xs text-[color:var(--muted)]">Tú decides qué se envía.</div>
              </>
            )}
            {draftActionLoading && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2">
                <div className="inline-flex items-center gap-2 text-[11px] text-[color:var(--text)]">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--surface-border)] border-t-transparent" />
                  <span>{isSimpleMode ? "Pensando…" : "Generando…"}</span>
                  {!isSimpleMode && draftActionPhase && (
                    <span className="text-[color:var(--muted)]">{draftActionPhase}</span>
                  )}
                </div>
                {onDraftCancel && (
                  <button
                    type="button"
                    onClick={onDraftCancel}
                    className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {!isSimpleMode && (
              <>
                {suggestedObjectiveLabel && (
                  <div className="text-[11px] md:text-xs text-[color:var(--brand)]">
                    Objetivo sugerido: {suggestedObjectiveLabel}
                  </div>
                )}
                {agencyObjectiveLabel && (
                  <div className="text-[11px] md:text-xs text-[color:var(--text)]">
                    Objetivo actual: <span className="text-[color:var(--brand)]">{agencyObjectiveLabel}</span>
                  </div>
                )}
                {agencyStyleLabel && (
                  <div className="text-[11px] md:text-xs text-[color:var(--text)]">
                    Estilo actual: <span className="text-[color:var(--brand)]">{agencyStyleLabel}</span>
                  </div>
                )}
                {fanLanguageLabel && (
                  <div className="text-[11px] md:text-xs text-[color:var(--text)]">
                    Idioma: <span className="text-[color:var(--brand)]">{fanLanguageLabel}</span>
                  </div>
                )}
                {summaryLine && (
                  <div className="text-[11px] md:text-xs text-[color:var(--muted)] truncate">{summaryLine}</div>
                )}
              </>
            )}
          </div>
          {!isSimpleMode && (
            <div className="flex flex-col items-end gap-2 w-full md:w-[280px] shrink-0">
            {onToggleAutoPilot && (
              <div className="flex flex-col items-end gap-2 w-full">
                <button
                  type="button"
                  onClick={onToggleAutoPilot}
                  disabled={objectivesLocked}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                    autoPilotEnabled
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
                    objectivesLocked && "opacity-60 cursor-not-allowed"
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
            {showAutopilotAdjust && (
              <div className="flex w-full flex-col items-end gap-1 text-[11px] text-[color:var(--muted)]">
                <span className="text-right">Ajustar mensaje rápido:</span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={objectivesLocked}
                    onClick={onAutopilotSoften}
                    className={clsx(
                      "rounded-full border px-3 py-1 transition",
                      "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
                      objectivesLocked && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    Suavizar
                  </button>
                  <button
                    type="button"
                    disabled={objectivesLocked}
                    onClick={onAutopilotMakeBolder}
                    className={clsx(
                      "rounded-full border px-3 py-1 transition",
                      "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]",
                      objectivesLocked && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    Más directo
                  </button>
                </div>
              </div>
            )}
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
          )}
        </div>
        {managerDisabled && (
          <div className="rounded-lg border border-[color:var(--warning)]/50 bg-[color:rgba(245,158,11,0.08)] px-3 py-2 text-[11px] text-[color:var(--text)]">
            Manager IA está desactivado en este chat bloqueado.
          </div>
        )}
        {!isSimpleMode && isAutoPilotLoading && (
          <div className="inline-flex items-center gap-1 text-[11px] text-[color:var(--brand)]">
            <IconGlyph name="spark" className="h-3.5 w-3.5" />
            <span>Generando borrador…</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {!isSimpleMode && isCriticalExpiry && onSendLink && (
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
              isObjectiveActive("bienvenida") ||
                isObjectiveActive("romper_hielo") ||
                isRecommended("saludo_rapido") ||
                isDraftActionLoading(draftActionKeyFor("objective", "romper_hielo"))
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
            {isDraftActionLoading(draftActionKeyFor("objective", "romper_hielo"))
              ? renderLoadingLabel()
              : "Romper el hielo"}
          </button>
          {!isSimpleMode && showRenewAction && (
            <button
              type="button"
              className={clsx(
              "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
              isObjectiveActive("reactivar_fan_frio") ||
                isRecommended("renenganche") ||
                isDraftActionLoading(draftActionKeyFor("objective", "reactivar_fan_frio"))
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
              {isDraftActionLoading(draftActionKeyFor("objective", "reactivar_fan_frio"))
                ? renderLoadingLabel()
                : "Reactivar fan frío"}
            </button>
          )}
          <button
            type="button"
            className={clsx(
                "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
                isObjectiveActive("ofrecer_extra") ||
                  isRecommended("extra_rapido") ||
                  isDraftActionLoading(draftActionKeyFor("objective", "ofrecer_extra"))
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
            {isDraftActionLoading(draftActionKeyFor("objective", "ofrecer_extra"))
              ? renderLoadingLabel()
              : "Ofrecer un extra"}
          </button>
          <button
            type="button"
            className={clsx(
                "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
                isObjectiveActive("llevar_a_mensual") ||
                  isObjectiveActive("renovacion") ||
                  isRecommended("elegir_pack") ||
                  isDraftActionLoading(draftActionKeyFor("objective", "llevar_a_mensual"))
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
            {isDraftActionLoading(draftActionKeyFor("objective", "llevar_a_mensual"))
              ? renderLoadingLabel()
              : "Llevar a mensual"}
          </button>
        </div>
        {showPpvPhases && (
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
        )}
      </div>
      {(draftActionLoading || draftActionError || (draftCards && draftCards.length > 0)) && (
        <div
          ref={draftSectionRef}
          className="mt-3 rounded-xl border border-[color:rgba(var(--brand-rgb),0.25)] bg-[color:rgba(var(--brand-rgb),0.06)] p-3 flex flex-col gap-2"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--brand)]">
            Borradores generados
          </div>
          {draftActionLoading && (
            <div className="inline-flex items-center gap-2 text-[11px] text-[color:var(--text)]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--surface-border)] border-t-transparent" />
              <span>{isSimpleMode ? "Pensando…" : hasDrafts ? "Generando…" : "Pensando…"}</span>
            </div>
          )}
          {visibleDraftCards.length > 0 && (
            <div className="space-y-2">
              {visibleDraftCards.map((draft) => (
                <div
                  key={draft.id}
                  className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">{draft.label}</div>
                  {!isSimpleMode && (
                    <div className="text-[10px] text-[color:var(--muted)]">{buildDraftMetaLine(draft.meta)}</div>
                  )}
                  <div className="text-[12px] text-[color:var(--text)]">{draft.text}</div>
                  {!isSimpleMode && draft.offer && (
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
                      disabled={objectivesLocked}
                      className={clsx(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                        objectivesLocked
                          ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                          : isDraftActionLoading(draftActionKeyFor("draft", draft.id, "alternate"))
                          ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                          : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                      )}
                    >
                      {isDraftActionLoading(draftActionKeyFor("draft", draft.id, "alternate"))
                        ? renderLoadingLabel()
                        : "Otra versión"}
                    </button>
                    {!isSimpleMode && (
                      <button
                        type="button"
                        onClick={() => onDraftAction?.(draft.id, "shorter")}
                        disabled={objectivesLocked}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                          objectivesLocked
                            ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                            : isDraftActionLoading(draftActionKeyFor("draft", draft.id, "shorter"))
                            ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                        )}
                      >
                        {isDraftActionLoading(draftActionKeyFor("draft", draft.id, "shorter"))
                          ? renderLoadingLabel()
                          : "Más corta"}
                      </button>
                    )}
                    {!isSimpleMode && (
                      <button
                        type="button"
                        onClick={() => onDraftAction?.(draft.id, "softer")}
                        disabled={objectivesLocked}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                          objectivesLocked
                            ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                            : isDraftActionLoading(draftActionKeyFor("draft", draft.id, "softer"))
                            ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                            : draftDirectnessById[draft.id] === "suave"
                            ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                        )}
                      >
                        {isDraftActionLoading(draftActionKeyFor("draft", draft.id, "softer"))
                          ? renderLoadingLabel()
                          : "Suavizar"}
                      </button>
                    )}
                    {showBolderAction && (
                      <button
                        type="button"
                        onClick={() => onDraftAction?.(draft.id, "bolder")}
                        disabled={objectivesLocked}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                          objectivesLocked
                            ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                            : isDraftActionLoading(draftActionKeyFor("draft", draft.id, "bolder"))
                            ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                            : draftDirectnessById[draft.id] === "directo"
                            ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                        )}
                      >
                        {isDraftActionLoading(draftActionKeyFor("draft", draft.id, "bolder"))
                          ? renderLoadingLabel()
                          : "Más directo"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {draftActionError && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--warning)]">
              <span>{draftActionError}</span>
              {onDraftRetry && (
                <button
                  type="button"
                  onClick={() => {
                    if (draftActionLoading) return;
                    onDraftRetry();
                  }}
                  className="rounded-full border border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.12)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.2)]"
                >
                  Reintentar
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!isSimpleMode && managerSuggestions && managerSuggestions.length > 0 && (
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
                {(() => {
                  const qa = scoreDraft(suggestion.message);
                  const warnings = qa.warnings.slice(0, 2).join(" · ");
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                      <span className="font-semibold">QA: {qa.score}/100</span>
                      {warnings && <span>{warnings}</span>}
                    </div>
                  );
                })()}
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
                {showVariantActions && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (objectivesLocked) return;
                        onRequestSuggestionAlt?.(suggestion.message);
                      }}
                      disabled={objectivesLocked}
                      className={clsx(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                        objectivesLocked
                          ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                          : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                      )}
                    >
                      Otra versión
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (objectivesLocked) return;
                        onRequestSuggestionShorter?.(suggestion.message);
                      }}
                      disabled={objectivesLocked}
                      className={clsx(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                        objectivesLocked
                          ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                          : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                      )}
                    >
                      Más corta
                    </button>
                  </>
                )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!isSimpleMode && (reengageLoading || (reengageSuggestions && reengageSuggestions.length > 0)) && (
        <div className="mt-3 rounded-xl border border-[color:rgba(16,185,129,0.25)] bg-[color:rgba(16,185,129,0.06)] p-3 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:rgba(16,185,129,0.9)]">
            Re-engage por silencio
          </div>
          {reengageLoading && (
            <div className="text-[11px] text-[color:var(--muted)]">Generando toques…</div>
          )}
          {reengageSuggestions && reengageSuggestions.length > 0 && (
            <div className="space-y-2">
              {reengageSuggestions.slice(0, 3).map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                    {suggestion.label}
                  </div>
                  <div className="text-[12px] text-[color:var(--text)]">{suggestion.message}</div>
                  {(() => {
                    const qa = scoreDraft(suggestion.message);
                    const warnings = qa.warnings.slice(0, 2).join(" · ");
                    return (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                        <span className="font-semibold">QA: {qa.score}/100</span>
                        {warnings && <span>{warnings}</span>}
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onApplyReengage?.(
                          suggestion.message,
                          suggestion.label,
                          suggestion.intent ?? `reengage:${suggestion.id}`
                        )
                      }
                      className="inline-flex items-center rounded-full border border-[color:rgba(16,185,129,0.7)] bg-[color:rgba(16,185,129,0.12)] px-3 py-1 text-[11px] font-medium text-[color:var(--text)] hover:bg-[color:rgba(16,185,129,0.2)] transition"
                    >
                      Usar en mensaje
                    </button>
                    {showVariantActions && onRequestReengageAlt && (
                      <button
                        type="button"
                        onClick={() => {
                          if (objectivesLocked) return;
                          onRequestReengageAlt(suggestion.id);
                        }}
                        disabled={objectivesLocked}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                          objectivesLocked
                            ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                        )}
                      >
                        Otra versión
                      </button>
                    )}
                    {showVariantActions && onRequestReengageShorter && (
                      <button
                        type="button"
                        onClick={() => {
                          if (objectivesLocked) return;
                          onRequestReengageShorter(suggestion.id);
                        }}
                        disabled={objectivesLocked}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                          objectivesLocked
                            ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                        )}
                      >
                        Más corta
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!isSimpleMode && (
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
            {objectiveDetailLabel && (
              <div className="text-xs md:text-sm text-[color:var(--muted)]">
                Objetivo actual del Manager: <span className="text-[color:var(--text)]">{objectiveDetailLabel}</span>
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
      )}
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
