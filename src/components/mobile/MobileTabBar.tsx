import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Bookmark, Home, Inbox, Plus, User, type LucideIcon } from "lucide-react";
import { QuickActionsSheet } from "./QuickActionsSheet";

type TabItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  primary?: boolean;
};

const TABS: TabItem[] = [
  { key: "home", label: "Inicio", href: "/explore", icon: Home },
  { key: "saved", label: "Guardados", href: "/favoritos", icon: Bookmark },
  { key: "upload", label: "Subir", href: "/creator/panel", icon: Plus, primary: true },
  { key: "chats", label: "Chats", href: "/creator/manager?tab=chats", icon: Inbox },
  { key: "me", label: "Tu", href: "/creator/panel", icon: User },
];

const VISIBLE_ROUTES = new Set(["/discover", "/explore", "/favorites", "/favoritos", "/login", "/c/[handle]", "/[handle]"]);

function TabLink({
  label,
  icon: Icon,
  active,
  primary,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  primary?: boolean;
  onClick?: () => void;
}) {
  if (primary) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className="relative -mt-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-strong)] text-[color:var(--surface-0)] shadow-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={clsx(
        "flex flex-col items-center gap-1 text-[10px] font-semibold",
        active ? "text-[color:var(--text)]" : "text-[color:var(--muted)]"
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function MobileTabBar() {
  const router = useRouter();
  const pathname = router.pathname;
  const currentPath = router.asPath.split("?")[0] || "";
  const shouldRender = VISIBLE_ROUTES.has(pathname);
  const shouldPadBody = shouldRender && pathname !== "/c/[handle]";
  const [creatorAvailable, setCreatorAvailable] = useState<boolean | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const queryPart = router.asPath.split("?")[1] ?? "";
  const queryString = queryPart.split("#")[0] ?? "";
  const query = new URLSearchParams(queryString);
  const tabParam = (query.get("tab") || "").toLowerCase();
  const isExplore = currentPath === "/explore";
  const isFavorites = currentPath === "/favorites" || currentPath === "/favoritos";
  const hasExploreQuery = isExplore && queryString.length > 0;
  const isManager = currentPath === "/creator/manager";
  const isPanelRoute = currentPath === "/creator/panel";
  const isBioLinkRoute = currentPath.startsWith("/creator/bio-link");
  const isProfileTab = isManager && ["panel", "profile", "biolink"].includes(tabParam);
  const quickMode: "creator" | "fan" =
    creatorAvailable === false ? "fan" : pathname.startsWith("/creator") || creatorAvailable ? "creator" : "fan";

  useEffect(() => {
    if (!shouldPadBody) {
      document.body.classList.remove("has-mobile-tabbar");
      return;
    }
    document.body.classList.add("has-mobile-tabbar");
    return () => {
      document.body.classList.remove("has-mobile-tabbar");
    };
  }, [shouldPadBody]);

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
    const handleRoute = () => setQuickOpen(false);
    router.events.on("routeChangeStart", handleRoute);
    return () => {
      router.events.off("routeChangeStart", handleRoute);
    };
  }, [quickOpen, router.events]);

  const scrollToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigate = useCallback(
    (href: string) => {
      if (!href) return;
      if (router.asPath === href) return;
      void router.push(href);
    },
    [router]
  );

  if (!shouldRender) return null;

  const chatsHref = creatorAvailable === false ? "/login" : "/creator/manager?tab=chats";
  const meHref = creatorAvailable === false ? "/login" : "/creator/panel";
  const resolvedTabs = TABS.map((tab) => {
    if (tab.key === "chats") return { ...tab, href: chatsHref };
    if (tab.key === "me") return { ...tab, href: meHref };
    return tab;
  });

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl xl:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-end justify-around px-4 pb-2 pt-2">
          {resolvedTabs.map((tab) => {
            const basePath = tab.href.split("?")[0];
            const isActive =
              tab.primary
                ? false
                : tab.key === "saved"
                ? isFavorites
                : tab.key === "home"
                  ? isExplore || currentPath === "/discover"
                  : tab.key === "chats"
                    ? isManager && (tabParam === "chats" || tabParam === "")
                    : tab.key === "me"
                      ? isProfileTab || isPanelRoute || isBioLinkRoute || currentPath === "/login"
                      : currentPath === basePath || currentPath.startsWith(`${basePath}/`);
            const handleClick =
              tab.primary
                ? () => {
                    setQuickOpen(true);
                  }
                : tab.key === "home"
                  ? () => {
                      if (isExplore && !hasExploreQuery) {
                        scrollToTop();
                        return;
                      }
                      navigate("/explore");
                      scrollToTop();
                    }
                  : tab.key === "saved"
                    ? () => {
                        if (isFavorites) {
                          scrollToTop();
                          return;
                        }
                      navigate("/favoritos");
                      scrollToTop();
                    }
                    : tab.key === "chats"
                      ? () => {
                          navigate(chatsHref);
                        }
                      : tab.key === "me"
                        ? () => {
                            navigate(meHref);
                          }
                        : undefined;
            return (
              <TabLink
                key={tab.key}
                label={tab.label}
                icon={tab.icon}
                active={isActive}
                primary={tab.primary}
                onClick={handleClick}
              />
            );
          })}
        </div>
      </nav>
      <QuickActionsSheet open={quickOpen} onClose={() => setQuickOpen(false)} mode={quickMode} />
    </>
  );
}
