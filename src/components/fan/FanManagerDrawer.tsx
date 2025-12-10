import { useState } from "react";
import clsx from "clsx";
import FanManagerPanel from "../chat/FanManagerPanel";
import type { FanManagerSummary } from "../../server/manager/managerService";
import type { ManagerObjective } from "../ConversationDetails";

type Props = {
  managerSuggestions?: { id: string; label: string; message: string }[];
  onApplySuggestion?: (text: string) => void;
  currentObjective?: ManagerObjective | null;
  statusLine: string;
  lapexSummary?: string | null;
  sessionSummary?: string | null;
  iaSummary?: string | null;
  planSummary?: string | null;
  closedSummary?: string | null;
  fanId: string | null | undefined;
  onManagerSummary: (summary: FanManagerSummary | null) => void;
  onSuggestionClick: (text: string) => void;
  onQuickGreeting: () => void;
  onRenew: () => void;
  onQuickExtra: () => void;
  onPackOffer: () => void;
  showRenewAction: boolean;
  quickExtraDisabled?: boolean;
  isRecommended: (id: string) => boolean;
  isBlocked?: boolean;
};

export default function FanManagerDrawer({
  statusLine,
  lapexSummary: _lapexSummary,
  sessionSummary,
  iaSummary,
  planSummary,
  closedSummary,
  fanId,
  onManagerSummary,
  onSuggestionClick,
  managerSuggestions,
  onApplySuggestion,
  currentObjective,
  onQuickGreeting,
  onRenew,
  onQuickExtra,
  onPackOffer,
  showRenewAction,
  quickExtraDisabled,
  isRecommended,
  isBlocked = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const summaryLine = closedSummary || planSummary || statusLine;
  const planSummaryText = planSummary ? planSummary.replace(/^Plan de hoy:\s*/i, "").trim() : null;
  const managerDisabled = isBlocked;
  const isObjectiveActive = (objective: ManagerObjective) => currentObjective === objective;
  const managerPanel = (
    <div className={clsx("text-[11px] text-slate-200", isOpen ? "block" : "hidden")}>
      <FanManagerPanel
        fanId={fanId}
        onSummary={onManagerSummary}
        onSuggestionClick={onSuggestionClick}
        hideSuggestions
      />
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 md:px-6 md:py-4 text-[11px] text-slate-100 space-y-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="text-sm md:text-base font-semibold text-slate-100">Manager IA</div>
            <div className="text-xs md:text-sm leading-relaxed text-slate-300">
              Te ayuda a escribir mensajes claros, cercanos y profesionales. Tú decides qué se envía.
            </div>
            {summaryLine && <div className="text-[11px] md:text-xs text-slate-300 truncate">{summaryLine}</div>}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="self-start rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
          >
            {isOpen ? "Ocultar ▴" : "Ver más ▾"}
          </button>
        </div>
        {managerDisabled && (
          <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            Manager IA está desactivado en este chat bloqueado.
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={clsx(
              "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-6 py-2 text-sm font-medium transition",
              isObjectiveActive("bienvenida") || isObjectiveActive("romper_hielo") || isRecommended("saludo_rapido")
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
              managerDisabled && "opacity-60 cursor-not-allowed"
            )}
            onClick={() => {
              if (managerDisabled) return;
              onQuickGreeting();
            }}
            title="Mensaje breve para iniciar conversación o retomar contacto de forma natural."
            disabled={managerDisabled}
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
                managerDisabled && "opacity-60 cursor-not-allowed"
              )}
              onClick={() => {
                if (managerDisabled) return;
                onRenew();
              }}
              title="Pide feedback de lo que más le ha ayudado hasta ahora y adelanta que en unos días llegará el enlace de renovación."
              disabled={managerDisabled}
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
              quickExtraDisabled || managerDisabled ? "opacity-60 cursor-not-allowed" : ""
            )}
            onClick={() => {
              if (managerDisabled || quickExtraDisabled) return;
              onQuickExtra();
            }}
            disabled={quickExtraDisabled || managerDisabled}
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
              managerDisabled && "opacity-60 cursor-not-allowed"
              )}
            onClick={() => {
              if (managerDisabled) return;
              onPackOffer();
            }}
            title="Invitación clara para pasar al pack mensual sin presión."
            disabled={managerDisabled}
          >
            Llevar a mensual
          </button>
        </div>
      </div>
      {managerSuggestions && managerSuggestions.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
            Sugerencias del Manager
          </div>
          <div className="flex flex-wrap gap-2">
            {managerSuggestions.slice(0, 3).map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onApplySuggestion?.(suggestion.message)}
                className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-[13px] font-medium text-emerald-100 hover:bg-emerald-500/20 transition"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {isOpen && (
        <div className="mt-3 space-y-3 border-t border-slate-800 pt-3 text-[11px] text-slate-200">
          {(statusLine || sessionSummary || iaSummary) && (
            <div className="flex flex-col gap-1 text-sm md:text-base text-slate-200">
              {statusLine && <div className="font-semibold text-slate-100">{statusLine}</div>}
              {sessionSummary && <div className="text-slate-200">{sessionSummary}</div>}
              {iaSummary && <div className="text-slate-200">{iaSummary}</div>}
            </div>
          )}
          {managerPanel}
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
        </div>
      )}
      {!isOpen && managerPanel}
    </div>
  );
}
