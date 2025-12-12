import clsx from "clsx";
import type { ReactNode } from "react";

type PanelType = "summary" | "priority" | null;

type Props = {
  panel: PanelType;
  onClose: () => void;
  summaryContent: ReactNode;
  priorityContent: ReactNode;
};

export function ManagerMobilePanels({ panel, onClose, summaryContent, priorityContent }: Props) {
  if (!panel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx("relative w-full max-w-3xl")}>
        <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl max-h-[85dvh] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-semibold text-white">{panel === "summary" ? "Resumen" : "Prioridad de hoy"}</div>
            <button
              type="button"
              className="text-xs text-slate-300 hover:text-white rounded-full border border-slate-700 px-3 py-1"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto">{panel === "summary" ? summaryContent : priorityContent}</div>
        </div>
      </div>
    </div>
  );
}
