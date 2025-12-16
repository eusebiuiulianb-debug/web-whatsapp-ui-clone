import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

interface CreatorHeaderProps {
  name: string;
  role: string;
  subtitle: string;
  initial: string;
  avatarUrl?: string;
  onOpenSettings: () => void;
}

export default function CreatorHeader({ name, role, subtitle, initial, avatarUrl, onOpenSettings }: CreatorHeaderProps) {
  const [ menuOpen, setMenuOpen ] = useState(false);
  const router = useRouter();

  const pathname = router.pathname;

  const isPanel = pathname.startsWith("/creator/manager");
  const isBioLink = pathname.startsWith("/creator/bio-link");
  const isPublicProfile = pathname === "/creator";
  const isAnalytics = pathname.startsWith("/creator/analytics");
  const isChat = pathname === "/" || (pathname.startsWith("/creator/") && !isPanel && !isBioLink && !isAnalytics);

  const linkClass = (isActive: boolean, extraClasses: string) =>
    `inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition border ${extraClasses} ${
      isActive
        ? "bg-emerald-400 text-slate-900 border-emerald-300 shadow-md"
        : "bg-slate-800/70 text-slate-200 border-slate-700 hover:bg-slate-700"
    }`;

  const navTabs = [
    { label: "Chat privado", href: "/", active: isChat, className: "" },
    { label: "Panel", href: "/creator/manager", active: isPanel, className: "" },
    { label: "Bio-link", href: "/creator/bio-link", active: isBioLink, className: "" },
    { label: "Analítica", href: "/creator/analytics", active: isAnalytics, className: "" },
  ];

  const menuLinks = [
    { label: "Ajustes de IA", href: "/creator/ai-settings", external: false },
    { label: "Ver perfil público", href: "/creator", external: true },
    { label: "Plantillas de IA", href: "/creator/ai-templates", external: false },
    { label: "Biblioteca", href: "/library", external: false },
    { label: "Editar perfil", href: "/creator/edit", external: false },
  ];

  return (
    <div className="sticky top-0 z-20 bg-[#0d1720]/90 border-b border-[rgba(134,150,160,0.15)] backdrop-blur">
      <div className="max-w-6xl mx-auto flex flex-col gap-4 px-4 py-4 md:py-5">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden border border-[rgba(134,150,160,0.2)] bg-[#2a3942] shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#2a3942] text-white font-semibold shadow-md">
              {initial}
            </div>
          )}
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-lg font-semibold text-white truncate">{name}</span>
            <span className="text-sm text-slate-300">{role}</span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
              {subtitle}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {navTabs.map((link) => (
            <Link key={link.label} href={link.href} legacyBehavior>
              <a className={linkClass(link.active, link.className)}>
                {link.label}
              </a>
            </Link>
          ))}
          <div className="relative">
            <button
              type="button"
              aria-label="Más opciones"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-800/80 p-2 text-slate-200 hover:bg-slate-700"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" className="text-[#AEBAC1]">
                <path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"></path>
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-[#0f1f26] border border-[rgba(134,150,160,0.2)] rounded-lg shadow-xl z-30">
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 text-white hover:bg-[#2a3942] rounded-lg"
                  onClick={() => {
                    onOpenSettings();
                    setMenuOpen(false);
                  }}
                >
                  Ajustes del creador
                </button>
                {menuLinks.map((link) => (
                  <Link key={link.label} href={link.href} legacyBehavior>
                    <a
                    className="block w-full px-4 py-3 text-slate-200 hover:bg-[#2a3942] rounded-lg text-sm"
                    onClick={() => {
                      setMenuOpen(false);
                    }}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                  >
                    {link.label}
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
