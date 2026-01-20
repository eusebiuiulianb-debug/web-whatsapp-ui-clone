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
};

export function PublicStoriesRow({ items, onSelect, onViewAll }: Props) {
  if (!items.length) return null;

  return (
    <section className="space-y-3 min-w-0">
      <div className="flex items-center justify-between min-w-0">
        <h2 className="text-base font-semibold text-[color:var(--text)]">Historias</h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
          >
            Ver todo
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item.id)}
            title={item.title}
            className="shrink-0 flex flex-col items-center gap-2 text-left"
          >
            <div className="h-16 w-16 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] overflow-hidden">
              {item.thumbUrl ? (
                <Image
                  src={normalizeImageSrc(item.thumbUrl)}
                  alt={item.title}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-[color:var(--muted)]">
                  Story
                </div>
              )}
            </div>
            <span className="w-16 text-[11px] leading-tight text-[color:var(--muted)] line-clamp-2 text-center">
              {item.title}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
