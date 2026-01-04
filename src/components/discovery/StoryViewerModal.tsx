import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DiscoveryRecommendation } from "../../types/discovery";

type StoryViewerModalProps = {
  open: boolean;
  recommendation: DiscoveryRecommendation | null;
  onClose: () => void;
};

type SlideId = "fit" | "pricing" | "privacy";

const slideOrder: SlideId[] = ["fit", "pricing", "privacy"];

export function StoryViewerModal({ open, recommendation, onClose }: StoryViewerModalProps) {
  const [currentSlide, setCurrentSlide] = useState<SlideId>("fit");

  const goNext = useCallback(() => {
    const idx = slideOrder.indexOf(currentSlide);
    const next = slideOrder[(idx + 1) % slideOrder.length];
    setCurrentSlide(next);
  }, [currentSlide]);

  const goPrev = useCallback(() => {
    const idx = slideOrder.indexOf(currentSlide);
    const prev = slideOrder[(idx - 1 + slideOrder.length) % slideOrder.length];
    setCurrentSlide(prev);
  }, [currentSlide]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        onClose();
      }
      if (evt.key === "ArrowRight") {
        evt.preventDefault();
        goNext();
      }
      if (evt.key === "ArrowLeft") {
        evt.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, goNext, goPrev]);

  useEffect(() => {
    if (open) {
      setCurrentSlide("fit");
    }
  }, [open, recommendation]);

  const visible = open && recommendation;
  const slideContent = useMemo(() => {
    if (!recommendation) return null;
    switch (currentSlide) {
      case "fit":
        return {
          title: "Encaje",
          body: (
            <div className="space-y-3">
              <p className="text-[color:var(--muted)]">Coincidencias principales:</p>
              <ul className="space-y-2">
                {recommendation.reasons.slice(0, 3).map((reason, idx) => (
                  <li key={`reason-${idx}`} className="flex gap-2 text-sm text-[color:var(--text)]">
                    <span className="text-[color:var(--brand)]">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ),
        };
      case "pricing":
        return {
          title: "Precio y respuesta",
          body: (
            <div className="space-y-3 text-sm text-[color:var(--text)]">
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <span className="text-[color:var(--muted)]">Precio</span>
                <span className="font-semibold text-[color:var(--brand)]">
                  {recommendation.priceRange || "Rango privado"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <span className="text-[color:var(--muted)]">Tiempo de respuesta</span>
                <span className="font-semibold text-[color:var(--brand)]">
                  {recommendation.responseHours ? `~${recommendation.responseHours}h` : "Estándar"}
                </span>
              </div>
            </div>
          ),
        };
      case "privacy":
      default:
        return {
          title: "Privacidad y límites",
          body: (
            <div className="space-y-3 text-sm text-[color:var(--text)]">
              {recommendation.country ? (
                <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                  <div className="text-[color:var(--muted)]">Ubicación aproximada</div>
                  <div className="font-semibold text-[color:var(--text)]">
                    {recommendation.country}
                    {recommendation.cityApprox ? ` · ${recommendation.cityApprox}` : ""}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 text-[color:var(--muted)]">
                  No comparte ubicación. Respeta tus preferencias de privacidad.
                </div>
              )}
              <p className="text-[color:var(--muted)] text-xs">
                El creador controla qué datos se muestran y cómo se usan. Tú decides si seguir adelante.
              </p>
            </div>
          ),
        };
    }
  }, [currentSlide, recommendation]);

  if (!visible || !recommendation || !slideContent) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalles de ${recommendation.displayName}`}
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl shadow-black/40 overflow-hidden">
        <button
          type="button"
          aria-label="Cerrar"
          className="absolute top-3 right-3 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--text)] hover:border-[color:var(--brand)]/60"
          onClick={onClose}
        >
          Esc
        </button>
        <div className="flex flex-col md:flex-row gap-6 p-6">
          <div className="flex flex-col items-center gap-3 md:w-1/3">
            <div className="h-20 w-20 rounded-full overflow-hidden border border-[color:rgba(var(--brand-rgb),0.5)] bg-[color:rgba(var(--brand-rgb),0.2)] flex items-center justify-center text-xl font-semibold">
              {recommendation.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recommendation.avatarUrl} alt={recommendation.displayName} className="h-full w-full object-cover" />
              ) : (
                recommendation.displayName[0]?.toUpperCase()
              )}
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{recommendation.displayName}</div>
              <div className="text-xs text-[color:var(--muted)]">{recommendation.priceRange || "Rango privado"}</div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/link/${recommendation.handle}`} passHref>
                <a className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]/60">
                  Ver perfil
                </a>
              </Link>
              <Link href={`/c/${recommendation.handle}`} passHref>
                <a className="rounded-full border border-[color:var(--brand)]/70 bg-[color:var(--brand-strong)]/20 px-3 py-1 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--brand-strong)]/30">
                  Abrir chat
                </a>
              </Link>
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm uppercase tracking-wide text-[color:var(--brand)]/80">Vista Orbital</div>
              <div className="flex items-center gap-2">
                {slideOrder.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      currentSlide === id
                        ? "bg-[color:var(--brand-strong)]/20 text-[color:var(--text)] border border-[color:var(--brand)]/60"
                        : "bg-[color:var(--surface-2)] text-[color:var(--text)] border border-[color:var(--surface-border)] hover:border-[color:rgba(var(--brand-rgb),0.5)]"
                    }`}
                    onClick={() => setCurrentSlide(id)}
                  >
                    {id === "fit" ? "Encaje" : id === "pricing" ? "Precio" : "Privacidad"}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 min-h-[180px]">
              <h4 className="text-xl font-semibold mb-3">{slideContent.title}</h4>
              {slideContent.body}
            </div>
            <div className="flex items-center justify-between text-xs ui-muted">
              <span>Usa ← → para cambiar de slide</span>
              <span>Enter en burbuja · Esc para cerrar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoryViewerModal;
