import { useState } from "react";
import clsx from "clsx";
import FanManagerPanel from "../chat/FanManagerPanel";
import type { FanManagerSummary } from "../../server/manager/managerService";

type Props = {
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
};

export default function FanManagerDrawer({
  statusLine,
  lapexSummary,
  sessionSummary,
  iaSummary,
  planSummary,
  closedSummary,
  fanId,
  onManagerSummary,
  onSuggestionClick,
  onQuickGreeting,
  onRenew,
  onQuickExtra,
  onPackOffer,
  showRenewAction,
  quickExtraDisabled,
  isRecommended,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const summaryLine = closedSummary || planSummary || statusLine;
  const managerPanel = (
    <div className={clsx("text-[11px] text-slate-200", isOpen ? "block" : "hidden")}>
      <FanManagerPanel
        fanId={fanId}
        onSummary={onManagerSummary}
        onSuggestionClick={onSuggestionClick}
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-100">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-100">Manager IA</div>
            <div className="text-[11px] text-slate-400">
              Te ayuda a escribir mensajes claros, cercanos y profesionales. Tú decides qué se envía.
            </div>
            {summaryLine && <div className="text-[11px] text-slate-300 truncate">{summaryLine}</div>}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="text-[11px] font-semibold rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-slate-100 hover:bg-slate-700"
          >
            {isOpen ? "Ocultar ▴" : "Ver más ▾"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={clsx(
              "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
              isRecommended("saludo_rapido")
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100"
            )}
            onClick={onQuickGreeting}
            title="Mensaje breve para iniciar conversación o retomar contacto de forma natural."
          >
            Romper el hielo
          </button>
          {showRenewAction && (
            <button
              type="button"
              className={clsx(
                "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                isRecommended("renenganche")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100"
              )}
              onClick={onRenew}
              title="Pide feedback de lo que más le ha ayudado hasta ahora y adelanta que en unos días llegará el enlace de renovación."
            >
              Reactivar fan frío
            </button>
          )}
          <button
            type="button"
            className={clsx(
              "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
              isRecommended("extra_rapido")
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100",
              quickExtraDisabled ? "opacity-60 cursor-not-allowed" : ""
            )}
            onClick={onQuickExtra}
            disabled={quickExtraDisabled}
            title="Propuesta suave para ofrecer un contenido extra o actividad puntual."
          >
            Ofrecer un extra
          </button>
          <button
            type="button"
            className={clsx(
              "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
              isRecommended("elegir_pack")
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100"
              )}
            onClick={onPackOffer}
            title="Invitación clara para pasar al pack mensual sin presión."
          >
            Llevar a mensual
          </button>
        </div>
      </div>
      {isOpen && (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3 text-[11px] text-slate-200">
          {statusLine && <div className="font-semibold text-slate-100">{statusLine}</div>}
          {lapexSummary && (
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-100">
              <span className="flex h-5 min-w-[42px] items-center justify-center rounded-full bg-amber-400/70 px-2 text-[10px] font-black uppercase tracking-wide text-slate-900">
                LAPEX
              </span>
              <span className="text-amber-100/90">{lapexSummary}</span>
            </div>
          )}
          {sessionSummary && <div className="text-slate-300">{sessionSummary}</div>}
          {iaSummary && <div className="text-slate-300">{iaSummary}</div>}
          {managerPanel}
          {planSummary && <div className="text-slate-300">{planSummary}</div>}
        </div>
      )}
      {!isOpen && managerPanel}
    </div>
  );
}
