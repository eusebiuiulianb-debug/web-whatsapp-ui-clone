import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { Bookmark, Home, Inbox, Menu, Plus, User } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { QuickActionsSheet } from "../mobile/QuickActionsSheet";

type QuickAction = {
  id: string;
  label: string;
  description?: string;
  href: string;
};

export function DesktopMenuNav({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = router.pathname;
  const currentPath = router.asPath.split("?")[0] || "";
  const isCreatorRoute = pathname.startsWith("/creator");
  const isAuthRoute = pathname === "/login" || pathname.startsWith("/auth");
  const shouldRender = !isCreatorRoute && !isAuthRoute;
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatorAvailable, setCreatorAvailable] = useState<boolean | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const queryPart = router.asPath.split("?")[1] ?? "";
  const queryString = queryPart.split("#")[0] ?? "";
  const query = new URLSearchParams(queryString);
  const tabParam = (query.get("tab") || "").toLowerCase();
  const isExplore = currentPath === "/explore";
  const isFavorites = currentPath === "/favorites" || currentPath === "/favoritos";
  const isManager = currentPath === "/creator/manager";
  const isPanelRoute = currentPath === "/creator/panel";
  const isBioLinkRoute = currentPath.startsWith("/creator/bio-link");
  const isProfileTab = isManager && ["panel", "profile", "biolink"].includes(tabParam);
  const quickMode: "creator" | "fan" = creatorAvailable === false ? "fan" : creatorAvailable ? "creator" : "fan";

  const actions = useMemo<QuickAction[]>(() => {
    if (quickMode === "creator") {
      return [
        {
          id: "new-popclip",
          label: "Nuevo PopClip",
          description: "Crea un clip y publicalo en discovery.",
          href: "/creator/panel?tab=popclips&action=new",
        },
        {
          id: "new-pack",
          label: "Nuevo pack",
          description: "Anade un pack al catalogo.",
          href: "/creator/panel?tab=catalog&action=newPack",
        },
        {
          id: "edit-profile",
          label: "Editar perfil",
          description: "Actualiza tu bio y detalles publicos.",
          href: "/creator/edit",
        },
      ];
    }

    return [
      {
        id: "search-creators",
        label: "Buscar creadores",
        description: "Encuentra perfiles y audios nuevos.",
        href: "/explore?focusSearch=1",
      },
      {
        id: "view-popclips",
        label: "Ver PopClips",
        description: "Salta directo a los clips.",
        href: "/explore?mode=popclips",
      },
      {
        id: "open-filters",
        label: "Filtros",
        description: "Ajusta distancia, ubicacion y preferencias.",
        href: "/explore?openFilters=1",
      },
    ];
  }, [quickMode]);

  useEffect(() => {
    if (!shouldRender) return;
    let isActive = true;
    const controller = new AbortController();

    fetch("/api/creator", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 404) {
            throw new Error("auth_required");
          }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!isActive || !data) return;
        setCreatorAvailable(true);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!isActive) return;
        setCreatorAvailable(false);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [shouldRender]);

  useEffect(() => {
    if (!quickOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [quickOpen]);

  const navigate = useCallback(
    (href: string) => {
      if (!href) return;
      if (router.asPath === href) return;
      const [path, queryString] = href.split("?");
      if (path === router.pathname && queryString) {
        const params = new URLSearchParams(queryString);
        const nextQuery: Record<string, string> = {};
        params.forEach((value, key) => {
          nextQuery[key] = value;
        });
        void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
          shallow: true,
          scroll: false,
        });
        return;
      }
      void router.push(href);
    },
    [router]
  );

  if (!shouldRender) return null;

  const chatsHref = creatorAvailable === false ? "/login" : "/creator/manager?tab=chats";
  const meHref = creatorAvailable === false ? "/login" : "/creator/panel";
  const isHomeActive = isExplore || currentPath === "/discover";
  const isSavedActive = isFavorites;
  const isChatsActive = isManager && (tabParam === "chats" || tabParam === "");
  const isMeActive = isProfileTab || isPanelRoute || isBioLinkRoute || currentPath === "/login";

  const handleNav = (href: string) => {
    setMenuOpen(false);
    navigate(href);
  };

  const handleHome = () => {
    if (isExplore && !queryString) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setMenuOpen(false);
      return;
    }
    handleNav("/explore");
  };

  const handleSaved = () => {
    handleNav("/favoritos");
  };

  return (
    <>
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Menú"
            className={clsx(
              "inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 text-sm font-semibold text-[color:var(--text)] shadow-lg backdrop-blur-xl transition hover:bg-[color:var(--surface-2)] h-9 w-9 xl:h-auto xl:w-auto xl:px-4 xl:py-2.5",
              className
            )}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">Menú</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={12}
            collisionPadding={16}
            className="z-50 w-[240px] rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 p-2 text-[color:var(--text)] shadow-2xl backdrop-blur-xl"
          >
            <div className="flex flex-col gap-1">
              <MenuItem icon={Home} label="Inicio" active={isHomeActive} onClick={handleHome} />
              <MenuItem icon={Bookmark} label="Guardados" active={isSavedActive} onClick={handleSaved} />
              <MenuItem
                icon={Plus}
                label="Nuevo"
                onClick={() => {
                  setMenuOpen(false);
                  setQuickOpen(true);
                }}
              />
              <MenuItem icon={Inbox} label="Chats" active={isChatsActive} onClick={() => handleNav(chatsHref)} />
              <MenuItem icon={User} label="Tú" active={isMeActive} onClick={() => handleNav(meHref)} />
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {quickOpen ? (
        <div className="hidden xl:flex fixed inset-0 z-50 items-center justify-center bg-black/50 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Cerrar acciones rapidas"
            onClick={() => setQuickOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative w-[min(92vw,420px)] rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">Acciones rapidas</p>
                <p className="text-sm font-semibold text-[color:var(--text)]">
                  {quickMode === "creator" ? "Creador" : "Explorar"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setQuickOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-2 px-4 py-4">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setQuickOpen(false);
                    navigate(action.href);
                  }}
                  className="flex flex-col items-start gap-1 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 text-left transition hover:bg-[color:var(--surface-1)]"
                >
                  <span className="text-sm font-semibold text-[color:var(--text)]">{action.label}</span>
                  {action.description ? (
                    <span className="text-xs text-[color:var(--muted)]">{action.description}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <QuickActionsSheet open={quickOpen} onClose={() => setQuickOpen(false)} mode={quickMode} />
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[color:var(--surface-2)] text-[color:var(--text)]"
          : "text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
