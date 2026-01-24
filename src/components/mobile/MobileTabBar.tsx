import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import clsx from "clsx";
import { Compass, Home, Inbox, Plus, User, type LucideIcon } from "lucide-react";

type TabItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  primary?: boolean;
};

const TABS: TabItem[] = [
  { key: "home", label: "Inicio", href: "/discover", icon: Home },
  { key: "explore", label: "Explorar", href: "/explore", icon: Compass },
  { key: "upload", label: "Subir", href: "/upload", icon: Plus, primary: true },
  { key: "inbox", label: "Buzon", href: "/inbox", icon: Inbox },
  { key: "me", label: "Tu", href: "/me", icon: User },
];

const VISIBLE_ROUTES = new Set([
  "/discover",
  "/explore",
  "/upload",
  "/inbox",
  "/me",
]);

export function MobileTabBar() {
  const router = useRouter();
  const pathname = router.pathname;
  const currentPath = router.asPath.split("?")[0] || "";
  const shouldRender = VISIBLE_ROUTES.has(pathname);

  useEffect(() => {
    if (!shouldRender) return;
    document.body.classList.add("has-mobile-tabbar");
    return () => {
      document.body.classList.remove("has-mobile-tabbar");
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="mx-auto flex w-full max-w-6xl items-end justify-around px-4 pb-2 pt-2">
        {TABS.map((tab) => {
          const isActive = currentPath === tab.href || currentPath.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          if (tab.primary) {
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-label={tab.label}
                className="relative -mt-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-strong)] text-[color:var(--surface-0)] shadow-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </Link>
            );
          }
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className={clsx(
                "flex flex-col items-center gap-1 text-[10px] font-semibold",
                isActive ? "text-[color:var(--text)]" : "text-[color:var(--muted)]"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
