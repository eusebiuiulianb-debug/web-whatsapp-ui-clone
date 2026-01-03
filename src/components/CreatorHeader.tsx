import Link from "next/link";
import { useRouter } from "next/router";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu";
import { IconButton } from "./ui/IconButton";

interface CreatorHeaderProps {
  name: string;
  role: string;
  subtitle: string;
  initial: string;
  avatarUrl?: string;
  onOpenSettings: () => void;
}

export default function CreatorHeader({ name, role, subtitle, initial, avatarUrl, onOpenSettings }: CreatorHeaderProps) {
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
    { label: "Cortex", href: "/creator/manager", active: isPanel, className: "" },
    { label: "Bio-link", href: "/creator/bio-link", active: isBioLink, className: "" },
    { label: "Analítica", href: "/creator/analytics", active: isAnalytics, className: "" },
  ];

  const menuItems: ContextMenuItem[] = [
    {
      label: "Ajustes del creador",
      icon: "settings",
      onClick: () => onOpenSettings(),
    },
    {
      label: "Ajustes de IA",
      icon: "spark",
      onClick: () => {
        void router.push("/creator/ai-settings");
      },
    },
    {
      label: "Ver perfil público",
      icon: "globe",
      onClick: () => {
        if (typeof window !== "undefined") {
          window.open("/creator", "_blank", "noopener,noreferrer");
        }
      },
    },
    {
      label: "Plantillas de IA",
      icon: "file",
      onClick: () => {
        void router.push("/creator/ai-templates");
      },
    },
    {
      label: "Biblioteca",
      icon: "folder",
      onClick: () => {
        void router.push("/library");
      },
    },
    {
      label: "Editar perfil",
      icon: "edit",
      onClick: () => {
        void router.push("/creator/edit");
      },
    },
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
          <ContextMenu
            buttonAriaLabel="Más opciones"
            items={menuItems}
            align="right"
            renderButton={({ ref, open, onClick, ariaLabel, ariaExpanded, ariaHaspopup, title }) => (
              <IconButton
                ref={ref}
                icon="dots"
                size="md"
                tone="neutral"
                active={open}
                ariaLabel={ariaLabel}
                ariaExpanded={ariaExpanded}
                ariaHaspopup={ariaHaspopup}
                title={title}
                onClick={onClick}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
