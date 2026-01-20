import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PopClip } from "../../lib/popclips";
import type { CatalogItem } from "../../lib/catalog";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { SectionCard } from "../ui/SectionCard";
import { Skeleton } from "../ui/Skeleton";

const DAILY_LIMIT = 3;
const MAX_ACTIVE = 24;
const MAX_STORIES = 8;

type UploadMeta = {
  durationSec: number;
  width: number;
  height: number;
};

function slugifyHandle(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

function countTodayUtc(clips: PopClip[]) {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return clips.filter((clip) => {
    const created = Date.parse(clip.createdAt);
    return Number.isFinite(created) && created >= start && created < end;
  }).length;
}

async function extractVideoMeta(file: File): Promise<UploadMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => {
      URL.revokeObjectURL(url);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const durationSec = Math.round(video.duration || 0);
      const width = Math.round(video.videoWidth || 0);
      const height = Math.round(video.videoHeight || 0);
      cleanup();
      if (!durationSec || !width || !height) {
        reject(new Error("metadata"));
        return;
      }
      resolve({ durationSec, width, height });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("metadata"));
    };
    video.src = url;
  });
}

export function PopClipsPanel() {
  const { config } = useCreatorConfig();
  const [creatorId, setCreatorId] = useState("creator-1");
  const [popClips, setPopClips] = useState<PopClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCatalogItemId, setUploadCatalogItemId] = useState("");
  const [uploadMeta, setUploadMeta] = useState<UploadMeta | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const creatorHandle = config.creatorHandle || slugifyHandle(config.creatorName || "creator");

  useEffect(() => {
    const loadCreator = async () => {
      try {
        const res = await fetch("/api/creator");
        const payload = await res.json().catch(() => ({}));
        const resolvedId = payload?.creator?.id || "creator-1";
        setCreatorId(resolvedId);
      } catch (_err) {
        setCreatorId("creator-1");
      }
    };
    void loadCreator();
  }, []);

  const loadPopClips = useCallback(async () => {
    if (!creatorId) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/popclips?creatorId=${encodeURIComponent(creatorId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Error loading popclips");
      const payload = await res.json().catch(() => ({}));
      const clips = Array.isArray(payload?.clips) ? (payload.clips as PopClip[]) : [];
      setPopClips(clips);
    } catch (_err) {
      setError("No se pudieron cargar los PopClips.");
      setPopClips([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  const loadCatalog = useCallback(async () => {
    if (!creatorId) return;
    try {
      setCatalogLoading(true);
      const res = await fetch(`/api/catalog?creatorId=${encodeURIComponent(creatorId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Error loading catalog");
      const payload = await res.json().catch(() => ({}));
      const items = Array.isArray(payload?.items) ? (payload.items as CatalogItem[]) : [];
      setCatalogItems(items.filter((item) => item.type === "PACK"));
    } catch (_err) {
      setCatalogItems([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void loadPopClips();
    void loadCatalog();
  }, [loadCatalog, loadPopClips]);

  const activeClips = useMemo(() => popClips.filter((clip) => !clip.isArchived), [popClips]);
  const storyClips = useMemo(() => activeClips.filter((clip) => clip.isStory), [activeClips]);
  const archivedClips = useMemo(() => popClips.filter((clip) => clip.isArchived), [popClips]);

  const todayCount = useMemo(() => countTodayUtc(popClips), [popClips]);
  const canAddStory = storyClips.length < MAX_STORIES;

  const resetUpload = () => {
    setUploadFile(null);
    setUploadTitle("");
    setUploadCatalogItemId("");
    setUploadMeta(null);
    setUploadError("");
  };

  const handleFileChange = async (file: File | null) => {
    setUploadError("");
    setUploadMeta(null);
    setUploadFile(file);
    if (!file) return;
    try {
      const meta = await extractVideoMeta(file);
      setUploadMeta(meta);
    } catch (_err) {
      setUploadError("No se pudo leer la duración o resolución del video.");
    }
  };

  const handleUpload = async () => {
    if (!creatorId) {
      setUploadError("No hay creatorId disponible.");
      return;
    }
    if (!uploadFile) {
      setUploadError("Selecciona un vídeo.");
      return;
    }
    if (!uploadCatalogItemId) {
      setUploadError("Selecciona un pack del catálogo.");
      return;
    }
    if (!uploadMeta) {
      setUploadError("No se pudieron leer los metadatos del vídeo.");
      return;
    }

    try {
      setUploading(true);
      setUploadError("");
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("creatorId", creatorId);
      formData.append("catalogItemId", uploadCatalogItemId);
      if (uploadTitle.trim()) formData.append("title", uploadTitle.trim());
      formData.append("durationSec", String(uploadMeta.durationSec));
      formData.append("videoWidth", String(uploadMeta.width));
      formData.append("videoHeight", String(uploadMeta.height));
      formData.append("videoSizeBytes", String(uploadFile.size));
      formData.append("startAtSec", "0");

      const res = await fetch("/api/popclips/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(payload?.error || "No se pudo subir el PopClip.");
        return;
      }
      resetUpload();
      await loadPopClips();
    } catch (_err) {
      setUploadError("No se pudo subir el PopClip.");
    } finally {
      setUploading(false);
    }
  };

  const updateClip = async (clipId: string, data: Record<string, unknown>) => {
    if (!creatorId) return;
    try {
      const res = await fetch(`/api/popclips/${clipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, ...data }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "update_failed");
      }
      const updated = payload?.clip as PopClip | undefined;
      if (updated) {
        setPopClips((prev) => prev.map((clip) => (clip.id === updated.id ? updated : clip)));
      } else {
        await loadPopClips();
      }
    } catch (_err) {
      setError("No se pudo actualizar el PopClip.");
    }
  };

  const handleEditTitle = async (clip: PopClip) => {
    const nextTitle = window.prompt("Título del PopClip", clip.title ?? "");
    if (nextTitle === null) return;
    await updateClip(clip.id, { title: nextTitle.trim() || null });
  };

  const handleToggleStory = async (clip: PopClip) => {
    if (!clip.isStory && !canAddStory) return;
    await updateClip(clip.id, { isStory: !clip.isStory });
  };

  const handleArchive = async (clip: PopClip, nextArchived: boolean) => {
    await updateClip(clip.id, { isArchived: nextArchived });
  };

  const buildPreviewHref = (clipId: string) => `/c/${creatorHandle}?popclip=${encodeURIComponent(clipId)}`;

  const renderClipCard = (clip: PopClip, options?: { showStoryToggle?: boolean; allowArchive?: boolean }) => {
    const showStoryToggle = options?.showStoryToggle ?? true;
    const allowArchive = options?.allowArchive ?? true;
    const canToggleStory = clip.isStory || canAddStory;
    const previewHref = buildPreviewHref(clip.id);

    return (
      <div
        key={clip.id}
        className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-3"
      >
        <div className="flex gap-3">
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
            {clip.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={normalizeImageSrc(clip.posterUrl)}
                alt={clip.title ?? "PopClip"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-[color:var(--muted)]">
                PopClip
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--text)] line-clamp-2">
                  {clip.title || clip.catalogItem?.title || "PopClip"}
                </p>
                <p className="text-[11px] text-[color:var(--muted)]">
                  {clip.catalogItem?.title || "Pack"}
                  {formatDuration(clip.durationSec) ? ` · ${formatDuration(clip.durationSec)}` : ""}
                </p>
              </div>
              {clip.isStory && (
                <span className="rounded-full border border-[color:rgba(var(--brand-rgb),0.5)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                  Historia
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleEditTitle(clip)}
                className="rounded-full border border-[color:var(--surface-border)] px-2 py-1 text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Editar título
              </button>
              <a
                href={previewHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[color:var(--surface-border)] px-2 py-1 text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Preview
              </a>
              {showStoryToggle && (
                <button
                  type="button"
                  onClick={() => handleToggleStory(clip)}
                  disabled={!canToggleStory}
                  className={clsx(
                    "rounded-full border px-2 py-1",
                    clip.isStory
                      ? "border-[color:rgba(var(--brand-rgb),0.6)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] text-[color:var(--text)]",
                    !canToggleStory && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {clip.isStory ? "Quitar de Historias" : "Marcar como Historia"}
                </button>
              )}
              {allowArchive && (
                <button
                  type="button"
                  onClick={() => handleArchive(clip, !clip.isArchived)}
                  className="rounded-full border border-[color:var(--surface-border)] px-2 py-1 text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                >
                  {clip.isArchived ? "Desarchivar" : "Archivar"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <SectionCard
        eyebrow="PopClips"
        title="Control de PopClips"
        subtitle="Sube, destaca como historia y archiva clips sin perder el control del feed."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">Hoy</p>
            <p className="text-lg font-semibold text-[color:var(--text)]">
              {todayCount}/{DAILY_LIMIT}
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">Activos</p>
            <p className="text-lg font-semibold text-[color:var(--text)]">
              {activeClips.length}/{MAX_ACTIVE}
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">Historias</p>
            <p className="text-lg font-semibold text-[color:var(--text)]">
              {storyClips.length}/{MAX_STORIES}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Subir PopClip"
        title="Nuevo clip"
        subtitle="Duración 6–60s, 720p máx y teaser ligado a un pack."
        actions={
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)] disabled:opacity-60"
          >
            {uploading ? "Subiendo..." : "Subir PopClip"}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs text-[color:var(--muted)]">
            Vídeo
            <input
              type="file"
              accept="video/mp4,video/webm"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)]"
            />
          </label>
          <label className="text-xs text-[color:var(--muted)]">
            Pack
            <select
              value={uploadCatalogItemId}
              onChange={(event) => setUploadCatalogItemId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)]"
              disabled={catalogLoading}
            >
              <option value="">Selecciona un pack</option>
              {catalogItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[color:var(--muted)]">
            Título (opcional)
            <input
              type="text"
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)]"
            />
          </label>
        </div>
        {uploadMeta && (
          <div className="mt-2 text-[11px] text-[color:var(--muted)]">
            {uploadMeta.width}×{uploadMeta.height} · {uploadMeta.durationSec}s
          </div>
        )}
        {uploadError && <div className="mt-2 text-xs text-[color:var(--danger)]">{uploadError}</div>}
      </SectionCard>

      <SectionCard
        eyebrow="Historias"
        title="Historias activas"
        subtitle="Máximo 8. Estas clips se muestran arriba del perfil público."
      >
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, idx) => (
              <Skeleton key={`story-skeleton-${idx}`} className="h-24 w-full" />
            ))}
          </div>
        ) : storyClips.length === 0 ? (
          <div className="text-sm text-[color:var(--muted)]">Aún no hay historias.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {storyClips.map((clip) => renderClipCard(clip, { allowArchive: true }))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Activos"
        title="PopClips activos"
        subtitle="Máximo 24 activos. Los más antiguos se archivan automáticamente."
      >
        {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={`active-skeleton-${idx}`} className="h-24 w-full" />
            ))}
          </div>
        ) : activeClips.length === 0 ? (
          <div className="text-sm text-[color:var(--muted)]">No hay PopClips activos todavía.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeClips.map((clip) => renderClipCard(clip))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Archivados"
        title="Archivados"
        subtitle="Vuelven al perfil cuando los desarchivas."
        actions={
          <button
            type="button"
            onClick={() => setArchivedOpen((prev) => !prev)}
            className="rounded-full border border-[color:var(--surface-border)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)]"
          >
            {archivedOpen ? "Ocultar" : "Mostrar"}
          </button>
        }
      >
        {!archivedOpen ? (
          <div className="text-sm text-[color:var(--muted)]">Archivados: {archivedClips.length}</div>
        ) : archivedClips.length === 0 ? (
          <div className="text-sm text-[color:var(--muted)]">No hay clips archivados.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {archivedClips.map((clip) => renderClipCard(clip, { showStoryToggle: false }))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
