import Image from "next/image";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

type StoryItem = {
  id: string;
  title: string;
  thumbUrl?: string | null;
};

type Props = {
  items: StoryItem[];
  onSelect?: (id: string) => void;
  onViewAll?: () => void;
  isLoading?: boolean;
  emptyLabel?: string;
};

export function PublicStoriesRow({ items, onSelect, onViewAll, isLoading = false, emptyLabel }: Props) {
  const hasItems = items.length > 0;
  const resolvedEmptyLabel = emptyLabel ?? "Aún no hay historias";
  const showEmptyLabel = !hasItems && !isLoading;
  const placeholderCount = 3;
  const storyCount = items.length;

  return (
    <section className="space-y-3 min-w-0">
      <div className="flex items-center justify-between min-w-0">
        <h2 className="text-base font-semibold text-[color:var(--text)]">Historias ({storyCount})</h2>
        {onViewAll && hasItems && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
          >
            Ver todo
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory sm:mx-0 sm:px-0">
        {hasItems ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item.id)}
              title={item.title}
              className="shrink-0 flex flex-col items-start gap-2 text-left snap-start"
            >
              <div className="relative w-24 overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] ring-1 ring-[color:rgba(var(--brand-rgb),0.35)]">
                <div className="aspect-[9/16] w-full">
                  {item.thumbUrl ? (
                    <Image
                      src={normalizeImageSrc(item.thumbUrl)}
                      alt={item.title}
                      width={144}
                      height={256}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] text-[color:var(--muted)]">
                      PopClip
                    </div>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                  <span className="block text-[11px] leading-tight text-white line-clamp-2">{item.title}</span>
                </div>
              </div>
            </button>
          ))
        ) : (
          Array.from({ length: placeholderCount }).map((_, index) => (
            <div key={`story-placeholder-${index}`} className="shrink-0 flex flex-col items-start gap-2">
              <div
                className={`w-24 aspect-[9/16] overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]${
                  isLoading ? " animate-pulse" : ""
                }`}
              />
              <div
                className={`h-2 w-20 rounded bg-[color:var(--surface-2)]${isLoading ? " animate-pulse" : ""}`}
              />
            </div>
          ))
        )}
      </div>
      {showEmptyLabel && <p className="text-xs text-[color:var(--muted)]">{resolvedEmptyLabel}</p>}
    </section>
  );
}
