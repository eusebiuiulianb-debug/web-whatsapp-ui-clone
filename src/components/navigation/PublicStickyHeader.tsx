"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";

type PublicStickyHeaderProps = {
  title: string;
  subtitle?: string;
  brand?: ReactNode;
  actions?: ReactNode;
  search?: ReactNode;
  chips?: ReactNode;
  className?: string;
  compactTitle?: string;
};

export function PublicStickyHeader({
  title,
  subtitle,
  brand,
  actions,
  search,
  chips,
  className,
}: PublicStickyHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ON = 12;
    const OFF = 4;
    const update = () => {
      scrollRafRef.current = null;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setScrolled((prev) => {
        if (!prev && y >= ON) return true;
        if (prev && y <= OFF) return false;
        return prev;
      });
    };
    const handleScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(update);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  return (
    <header
      data-scrolled={scrolled ? "true" : "false"}
      className={clsx(
        "sticky top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl transition-[box-shadow,background-color,border-color,opacity] duration-200 ease-out",
        scrolled && "border-white/15 bg-black/70 shadow-[0_6px_20px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      <div className="pt-[env(safe-area-inset-top)]">
        <div className="py-4">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                {brand ? (
                  <div
                    className={clsx(
                      "text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)] transition-opacity duration-200",
                      scrolled && "opacity-0"
                    )}
                  >
                    {brand}
                  </div>
                ) : null}
                <h1
                  className={clsx(
                    "text-2xl font-semibold text-[color:var(--text)] transition-opacity duration-200 ease-out",
                    scrolled && "opacity-95"
                  )}
                >
                  {title}
                </h1>
                {subtitle ? (
                  <p
                    className={clsx(
                      "text-[13px] leading-snug text-[color:var(--muted)] transition-opacity duration-200",
                      scrolled && "opacity-0"
                    )}
                  >
                    {subtitle}
                  </p>
                ) : null}
              </div>
              {actions ? <div className="flex items-start gap-2">{actions}</div> : null}
            </div>

            {search ? <div>{search}</div> : null}
            {chips ? (
              <div className="mt-2.5">{chips}</div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
