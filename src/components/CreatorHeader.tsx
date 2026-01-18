import Link from "next/link";
import { useRouter } from "next/router";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu";
import { IconButton } from "./ui/IconButton";
import { AI_ENABLED } from "../lib/features";

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
  const aiEnabled = AI_ENABLED;

  const pathname = router.pathname;

  const isPanel = pathname.startsWith("/creator/manager");
  const isBioLink = pathname.startsWith("/creator/bio-link");
  const isPublicProfile = pathname === "/creator";
  const isAnalytics = pathname.startsWith("/creator/analytics");
  const isChat = pathname === "/" || (pathname.startsWith("/creator/") && !isPanel && !isBioLink && !isAnalytics);

  const linkClass = (isActive: boolean, extraClasses: string) =>
    `inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition border ${extraClasses} ${
      isActive
        ? "bg-[color:var(--brand)] text-[color:var(--surface-0)] border-[color:var(--brand-strong)] shadow-md"
        : "bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--surface-border)] hover:bg-[color:var(--surface-1)]"
    }`;

  const navTabs = [
    { label: "Chat privado", href: "/", active: isChat, className: "" },
    ...(aiEnabled ? [{ label: "Cortex", href: "/creator/manager", active: isPanel, className: "" }] : []),
    { label: "Bio-link", href: "/creator/bio-link", active: isBioLink, className: "" },
    { label: "Analítica", href: "/creator/analytics", active: isAnalytics, className: "" },
  ];

  const menuItems: ContextMenuItem[] = [
    {
      label: "Ajustes del creador",
      icon: "settings",
      onClick: () => onOpenSettings(),
    },
    ...(aiEnabled
      ? [
          {
            label: "Ajustes de IA",
            icon: "spark",
            onClick: () => {
              void router.push("/creator/ai-settings");
            },
          },
        ]
      : []),
    {
      label: "Ver perfil público",
      icon: "globe",
      onClick: () => {
        if (typeof window !== "undefined") {
          window.open("/creator", "_blank", "noopener,noreferrer");
        }
      },
    },
    ...(aiEnabled
      ? [
          {
            label: "Plantillas de IA",
            icon: "file",
            onClick: () => {
              void router.push("/creator/ai-templates");
            },
          },
        ]
      : []),
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
    <div className="sticky top-0 z-20 bg-[color:var(--surface-1)] border-b border-[color:var(--surface-border)] backdrop-blur">
      <div className="max-w-6xl mx-auto flex flex-col gap-4 px-4 py-4 md:py-5">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[color:var(--surface-2)] text-[color:var(--text)] font-semibold shadow-md">
              {initial}
            </div>
          )}
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-lg font-semibold text-[color:var(--text)] truncate">{name}</span>
            <span className="text-sm text-[color:var(--muted)]">{role}</span>
            <span className="flex items-center gap-1 text-xs text-[color:var(--muted)]">
              <span className="w-2 h-2 rounded-full bg-[color:rgba(var(--brand-rgb),0.8)]" />
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
