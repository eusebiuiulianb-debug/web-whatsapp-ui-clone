import { useMemo } from "react";
import type { DiscoveryRecommendation } from "../../types/discovery";

type OrbitalExplorerProps = {
  recommendations: DiscoveryRecommendation[];
  onOpen: (rec: DiscoveryRecommendation) => void;
  reducedMotion?: boolean;
};

type PositionedRecommendation = DiscoveryRecommendation & {
  x: number;
  y: number;
  size: number;
  ring: number;
  reasonsPreview: string[];
};

function seededValue(seed: string, mod = 1) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000 * mod;
}

function computePositions(list: DiscoveryRecommendation[]): PositionedRecommendation[] {
  if (!list.length) return [];
  return list.map((rec, idx) => {
    const ring = idx === 0 ? 0 : Math.floor((idx - 1) / 4) + 1;
    const itemsInRing = list.slice(1).filter((_, i) => Math.floor(i / 4) === ring - 1).length || 1;
    const angleIndex = ring === 0 ? 0 : (idx - 1) % 4;
    const baseAngle = ring === 0 ? 0 : (2 * Math.PI * angleIndex) / Math.max(4, itemsInRing);
    const jitterA = (seededValue(rec.creatorId, 0.4) - 0.2) * (ring + 1);
    const jitterR = (seededValue(rec.creatorId, 18) - 9) * (ring + 1);
    const radius = ring * 120 + jitterR;
    const angle = baseAngle + jitterA;

    const size = Math.max(64, 120 - ring * 10);
    const reasonsPreview = rec.reasons.slice(0, 2);

    return {
      ...rec,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size,
      ring,
      reasonsPreview,
    };
  });
}

export function OrbitalExplorer({ recommendations, onOpen, reducedMotion }: OrbitalExplorerProps) {
  const positioned = useMemo(() => computePositions(recommendations), [recommendations]);

  return (
    <div className="relative h-[480px] rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,#0f172a_0,#0b141a_60%)]" />
      <div className="relative h-full flex items-center justify-center">
        {positioned.map((rec) => {
          const translate = `translate(${rec.x}px, ${rec.y}px)`;
          return (
            <button
              key={rec.creatorId}
              type="button"
              tabIndex={0}
              aria-label={`Abrir detalles de ${rec.displayName}`}
              onClick={() => onOpen(rec)}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" || evt.key === " ") {
                  evt.preventDefault();
                  onOpen(rec);
                }
              }}
              className="group absolute rounded-full border border-emerald-500/50 bg-emerald-700/20 shadow-2xl shadow-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              style={{
                width: rec.size,
                height: rec.size,
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) ${translate}`,
                transition: reducedMotion ? "none" : "transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease",
              }}
            >
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition" />
              <div className="h-full w-full rounded-full overflow-hidden flex items-center justify-center text-lg font-semibold text-white">
                {rec.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rec.avatarUrl} alt={rec.displayName} className="h-full w-full object-cover" />
                ) : (
                  rec.displayName[0]?.toUpperCase()
                )}
              </div>
              <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-3 w-52 -translate-x-1/2 rounded-xl border border-slate-800 bg-slate-900/90 p-3 opacity-0 shadow-lg shadow-black/30 transition group-hover:opacity-100 group-focus:opacity-100">
                <div className="text-sm font-semibold text-white">{rec.displayName}</div>
                <div className="text-xs text-slate-400 space-y-1 mt-1">
                  {rec.reasonsPreview.map((reason, idx) => (
                    <div key={`${rec.creatorId}-tip-${idx}`} className="flex gap-2">
                      <span className="text-emerald-300">•</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default OrbitalExplorer;
