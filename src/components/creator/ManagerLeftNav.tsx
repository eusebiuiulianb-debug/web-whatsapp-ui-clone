import clsx from "clsx";
import { useEffect, useState } from "react";
import { IconGlyph, type IconName } from "../ui/IconGlyph";

type NavItem = {
  id: string;
  label: string;
  icon: IconName;
};

type Props = {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  density: "comfortable" | "compact";
};

const STORAGE_KEY = "novsy_sidebar";

export function ManagerLeftNav({ items, activeId, onSelect, density }: Props) {
  const [collapsed, setCollapsed] = useState<"open" | "collapsed">("open");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "open" || stored === "collapsed") {
      setCollapsed(stored);
      return;
    }
    setCollapsed(density === "compact" ? "collapsed" : "open");
  }, [density]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, collapsed);
  }, [collapsed]);

  return (
    <aside
      className={clsx(
        "flex h-full min-h-0 flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/70",
        collapsed === "collapsed" ? "w-[64px] p-2" : "w-[240px] p-3"
      )}
    >
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-200 hover:border-emerald-400/60"
        onClick={() => setCollapsed((prev) => (prev === "collapsed" ? "open" : "collapsed"))}
      >
        <IconGlyph
          name={collapsed === "collapsed" ? "chevronRight" : "chevronLeft"}
          className="h-4 w-4"
        />
      </button>
      <nav className="flex flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={clsx(
              "flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-200 transition hover:bg-slate-800",
              activeId === item.id ? "border border-emerald-500/60 bg-emerald-500/10 text-emerald-100" : "border border-transparent",
              collapsed === "collapsed" ? "justify-center px-0" : "justify-start"
            )}
            onClick={() => onSelect(item.id)}
          >
            <span aria-hidden>
              <IconGlyph name={item.icon} className="h-4 w-4" />
            </span>
            {collapsed === "open" && <span className="truncate text-xs md:text-sm leading-tight">{item.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
