"use client";

import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";

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
  compactTitle,
  subtitle,
  brand,
  actions,
  search,
  chips,
  className,
}: PublicStickyHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScroll = () => {
      setScrolled(window.scrollY > 32);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled ? "true" : "false"}
      className={clsx(
        "sticky top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl transition-all duration-200 ease-out",
        scrolled && "border-white/15 bg-black/70 shadow-[0_6px_20px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      <div className="pt-[env(safe-area-inset-top)]">
        <div className={clsx("transition-all duration-200 ease-out", scrolled ? "py-2.5" : "py-4")}>
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className={clsx("flex items-start justify-between gap-4", scrolled ? "mb-2" : "mb-3")}>
              <div className="min-w-0">
                {!scrolled && brand ? (
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
                    {brand}
                  </div>
                ) : null}
                <h1
                  className={clsx(
                    "font-semibold text-[color:var(--text)] transition-all duration-200 ease-out",
                    scrolled ? "hidden sm:block text-lg" : "text-2xl"
                  )}
                >
                  {scrolled ? compactTitle || title : title}
                </h1>
                {subtitle && !scrolled ? (
                  <p className="text-[13px] leading-snug text-[color:var(--muted)]">{subtitle}</p>
                ) : null}
              </div>
              {actions ? <div className="flex items-start gap-2">{actions}</div> : null}
            </div>

            {search ? <div>{search}</div> : null}
            {chips ? (
              <div className={clsx("mt-2.5 transition-all duration-200 ease-out", scrolled ? "mt-2" : "")}>
                {chips}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
