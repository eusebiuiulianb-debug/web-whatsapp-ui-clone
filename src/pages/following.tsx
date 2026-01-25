import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { normalizeImageSrc } from "../utils/normalizeImageSrc";
import { CtaPill } from "../components/ui/CtaPill";
import { emitFollowChange, getFollowSnapshot, subscribeFollowUpdates } from "../lib/followEvents";
import { useFollowState } from "../lib/useFollowState";

type FollowingCreator = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
};

export default function FollowingPage() {
  const [items, setItems] = useState<FollowingCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setActionError("");
    fetch("/api/following", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("AUTH_REQUIRED");
          }
          throw new Error("request failed");
        }
        const payload = (await res.json().catch(() => null)) as
          | { items?: FollowingCreator[]; creators?: FollowingCreator[] }
          | null;
        const list = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.creators)
          ? payload.creators
          : [];
        const reconciled = list.filter((creator) => {
          const snapshot = getFollowSnapshot(creator.id);
          return snapshot?.isFollowing === false ? false : true;
        });
        if (isActive) {
          setItems(reconciled);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!isActive) return;
        if (err instanceof Error && err.message === "AUTH_REQUIRED") {
          setError("Inicia sesion para ver a quien sigues.");
          return;
        }
        setError("No se pudo cargar la lista.");
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });
    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    return subscribeFollowUpdates((detail) => {
      const normalized = typeof detail?.creatorId === "string" ? detail.creatorId.trim() : "";
      if (!normalized || typeof detail?.isFollowing !== "boolean") return;
      if (!detail.isFollowing) {
        setItems((prev) => prev.filter((item) => item.id !== normalized));
      }
    });
  }, []);

  const handleToggle = useCallback(
    async (creatorId: string) => {
      if (pendingId) return;
      setPendingId(creatorId);
      setActionError("");
      try {
        const res = await fetch("/api/follow/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorId }),
        });
        if (res.status === 401) {
          setActionError("Inicia sesion para dejar de seguir.");
          return;
        }
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json().catch(() => null)) as
          | { isFollowing?: boolean; following?: boolean; followersCount?: number }
          | null;
        const resolvedFollowing =
          typeof payload?.isFollowing === "boolean"
            ? payload.isFollowing
            : typeof payload?.following === "boolean"
            ? payload.following
            : null;
        if (resolvedFollowing === null) {
          throw new Error("invalid response");
        }
        if (!resolvedFollowing) {
          setItems((prev) => prev.filter((item) => item.id !== creatorId));
        }
        emitFollowChange(creatorId, {
          isFollowing: resolvedFollowing,
          followersCount: payload?.followersCount,
        });
      } catch (_err) {
        setActionError("No se pudo actualizar.");
      } finally {
        setPendingId(null);
      }
    },
    [pendingId]
  );

  return (
    <>
      <Head>
        <title>Siguiendo</title>
      </Head>
      <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
        <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Siguiendo</h1>
            <Link
              href="/explore"
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              Volver a explorar
            </Link>
          </div>

          {loading ? (
            <div className="text-sm text-[color:var(--muted)]">Cargando...</div>
          ) : error ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              Aun no sigues a ningun creador.
            </div>
          ) : (
            <div className="space-y-3">
              {actionError ? <div className="text-xs text-[color:var(--danger)]">{actionError}</div> : null}
              {items.map((creator) => (
                <CreatorRowCard
                  key={creator.id}
                  creator={creator}
                  pending={pendingId === creator.id}
                  onToggle={() => void handleToggle(creator.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function CreatorRowCard({
  creator,
  pending,
  onToggle,
}: {
  creator: FollowingCreator;
  pending: boolean;
  onToggle: () => void;
}) {
  const followState = useFollowState(creator.id, { isFollowing: true });
  if (!followState.isFollowing) return null;
  const avatarLabel = creator.name?.trim()?.[0]?.toUpperCase() || "C";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
          {creator.avatarUrl ? (
            <Image
              src={normalizeImageSrc(creator.avatarUrl)}
              alt={creator.name}
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--muted)]">
              {avatarLabel}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[color:var(--text)]">{creator.name}</div>
          <div className="truncate text-xs text-[color:var(--muted)]">@{creator.handle}</div>
        </div>
      </div>
      <div className="relative z-20 flex items-center gap-2">
        <CtaPill asChild>
          <Link href={`/c/${encodeURIComponent(creator.handle)}`}>Ver perfil</Link>
        </CtaPill>
        <CtaPill
          asChild
          className="!text-red-200 ring-red-200/30 hover:!text-red-100 hover:bg-red-500/15"
        >
          <button type="button" onClick={onToggle} disabled={pending}>
            {pending ? "Quitando..." : "Dejar de seguir"}
          </button>
        </CtaPill>
      </div>
    </div>
  );
}
