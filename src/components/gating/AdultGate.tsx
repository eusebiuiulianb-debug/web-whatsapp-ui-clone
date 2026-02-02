import { ReactNode } from 'react';

type AdultGateProps = {
  shouldGate: boolean;
  children: ReactNode;
  preview?: ReactNode;
  onOpenGate?: () => void;
};

/**
 * AdultGate - Wrapper component that conditionally renders children based on gating
 * CRITICAL: When shouldGate=true, children are NOT mounted to prevent video preload
 */
export function AdultGate({ shouldGate, children, preview, onOpenGate }: AdultGateProps) {
  // CRITICAL: Do NOT render children when gating is active
  // This prevents <video> elements from being mounted and preloading content
  if (shouldGate) {
    return (
      <>
        {preview}
        {onOpenGate && (
          <button
            type="button"
            onClick={onOpenGate}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 text-white/90 backdrop-blur-sm"
          >
            <span className="rounded-full border border-white/30 bg-black/50 px-4 py-2 text-[11px] font-semibold">
              Confirmar 18+ para ver
            </span>
          </button>
        )}
      </>
    );
  }

  // Only render children when gating is not active
  return <>{children}</>;
}
