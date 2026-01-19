import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

type Props = {
  name: string;
  handle: string;
  avatarUrl?: string | null;
  trustLine?: string;
  chatHref: string;
};

export function PublicCreatorHeader({ name, handle, avatarUrl, trustLine, chatHref }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPageUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleShare = async () => {
    if (typeof navigator === "undefined") return;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url: pageUrl });
        setMenuOpen(false);
        return;
      }
    } catch (_err) {
      // ignore share errors
    }
    void handleCopy();
  };

  const handleCopy = async () => {
    if (!pageUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pageUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = pageUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
    } catch (_err) {
      // ignore clipboard errors
    }
  };

  const handleViewCatalog = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (typeof document === "undefined") return;
    const target = document.getElementById("catalog");
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header className="sticky top-0 z-20 bg-[color:var(--surface-0)]/95 backdrop-blur border-b border-[color:var(--surface-border)] sm:static">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:py-4">
        <div className="flex min-w-0 w-full items-center gap-3">
          <AvatarCircle title={name} avatarUrl={avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-base font-semibold text-[color:var(--text)] truncate">{name}</h1>
              <span className="text-xs text-[color:var(--muted)] truncate">@{handle}</span>
            </div>
            {trustLine && <p className="text-xs text-[color:var(--muted)] truncate">{trustLine}</p>}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Opciones"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
            >
              ...
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-lg p-1 text-xs">
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-full rounded-lg px-3 py-2 text-left text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                >
                  Compartir link
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="w-full rounded-lg px-3 py-2 text-left text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                >
                  {copied ? "Copiado" : "Copiar link"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={chatHref}
            className="inline-flex items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.75)] bg-[color:rgba(var(--brand-rgb),0.15)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
          >
            Abrir chat
          </a>
          <a
            href="#catalog"
            onClick={handleViewCatalog}
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
          >
            Ver catálogo
          </a>
        </div>
      </div>
    </header>
  );
}

function AvatarCircle({ title, avatarUrl }: { title: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return (
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
        <Image
          src={normalizeImageSrc(avatarUrl)}
          alt={title}
          width={56}
          height={56}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const initial = (title || "C")[0]?.toUpperCase() || "C";
  return (
    <div className="h-14 w-14 shrink-0 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-lg font-semibold text-[color:var(--text)] flex items-center justify-center">
      {initial}
    </div>
  );
}
