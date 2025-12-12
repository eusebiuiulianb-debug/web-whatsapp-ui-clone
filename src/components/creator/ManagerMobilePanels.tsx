import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";

type PanelType = "priority" | null;

type Props = {
  panel: PanelType;
  onClose: () => void;
  priorityContent: ReactNode;
};

export function ManagerMobilePanels({ panel, onClose, priorityContent }: Props) {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => (typeof window === "undefined" ? false : window.matchMedia("(min-width: 1024px)").matches));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isDesktop && panel) {
      onClose();
    }
  }, [isDesktop, onClose, panel]);

  if (isDesktop || !panel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx("relative w-full max-w-3xl")}>
        <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl max-h-[85dvh] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-semibold text-white">Prioridad de hoy</div>
            <button
              type="button"
              className="text-xs text-slate-300 hover:text-white rounded-full border border-slate-700 px-3 py-1"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto">{priorityContent}</div>
        </div>
      </div>
    </div>
  );
}
