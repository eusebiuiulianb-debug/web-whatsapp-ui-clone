import { useEffect, useMemo } from "react";
import clsx from "clsx";

export type PpvAttachment = {
  id: string;
  title: string;
  kind?: string;
  contentType?: string | null;
  url?: string | null;
};

type PpvContentSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string | null;
  priceLabel?: string;
  statusLabel?: string;
  content?: string | null;
  attachments?: PpvAttachment[];
  loading?: boolean;
  error?: string | null;
};

const DEFAULT_TITLE = "Extra (PPV)";

function formatAttachmentLabel(attachment: PpvAttachment) {
  if (attachment.kind === "AUDIO") return "Audio";
  if (attachment.kind === "CONTENT") {
    const raw = (attachment.contentType || "").trim().toUpperCase();
    if (raw === "IMAGE") return "Imagen";
    if (raw === "VIDEO") return "Video";
    if (raw === "AUDIO") return "Audio";
    if (raw === "TEXT") return "Texto";
    return "Contenido";
  }
  return "Adjunto";
}

function openAttachmentLink(url?: string | null) {
  const trimmed = (url || "").trim();
  if (!trimmed) return;
  window.open(trimmed, "_blank", "noopener,noreferrer");
}

export function PpvContentSheet({
  open,
  onClose,
  title,
  priceLabel,
  statusLabel,
  content,
  attachments = [],
  loading = false,
  error,
}: PpvContentSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const resolvedTitle = title?.trim() || DEFAULT_TITLE;
  const contentText = useMemo(() => {
    if (loading) return "Cargando contenido...";
    if (error) return error;
    if (content && content.trim()) return content;
    return "Contenido no disponible.";
  }, [content, error, loading]);
  const statusTone = (statusLabel || "").toLowerCase();
  const statusIsSuccess =
    statusTone.includes("comprado") || statusTone.includes("vendido") || statusTone.includes("desbloqueado");
  const statusClass = statusIsSuccess
    ? "border-[color:rgba(34,197,94,0.6)] bg-[color:rgba(34,197,94,0.14)] text-[color:rgb(22,163,74)]"
    : "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.12)] text-[color:var(--warning)]";
  const showAttachments = !loading && !error && attachments.length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75]">
      <div
        className="absolute inset-0 bg-[color:var(--surface-overlay)]"
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pb-6 pt-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[color:var(--text)] truncate">{resolvedTitle}</h3>
            {priceLabel ? <div className="text-xs text-[color:var(--muted)]">{priceLabel}</div> : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusLabel ? (
              <span className={clsx("rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide", statusClass)}>
                {statusLabel}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-[color:var(--surface-2)] text-[color:var(--text)]"
            >
              <span className="sr-only">Cerrar</span>
              ✕
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-3 text-sm text-[color:var(--text)] whitespace-pre-wrap">
            {contentText}
          </div>
          {showAttachments && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Adjuntos</div>
              <div className="grid gap-2">
                {attachments.map((attachment) => {
                  const label = formatAttachmentLabel(attachment);
                  const hasLink = Boolean(attachment.url && attachment.url.trim());
                  return (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => openAttachmentLink(attachment.url)}
                      disabled={!hasLink}
                      className={clsx(
                        "flex items-center justify-between rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-left",
                        hasLink
                          ? "hover:bg-[color:var(--surface-2)]"
                          : "cursor-not-allowed opacity-70"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[color:var(--text)]">
                          {attachment.title || "Adjunto"}
                        </div>
                        <div className="text-[11px] text-[color:var(--muted)]">{label}</div>
                      </div>
                      <span className="text-[11px] font-semibold text-[color:var(--warning)]">
                        Ver contenido
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
