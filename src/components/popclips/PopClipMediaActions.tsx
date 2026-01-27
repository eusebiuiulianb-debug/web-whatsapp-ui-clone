import clsx from "clsx";
import { Bookmark, BookmarkCheck } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

export const popClipMediaActionButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/90 shadow-lg backdrop-blur-md transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

type Props = {
  isSaved: boolean;
  onToggleSave?: () => void;
  menu?: ReactNode;
  className?: string;
};

export function PopClipMediaActions({ isSaved, onToggleSave, menu, className }: Props) {
  if (!menu && !onToggleSave) return null;

  const handleSave = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleSave?.();
  };

  return (
    <div className={clsx("pointer-events-auto absolute top-3 right-3 z-30 flex flex-col gap-2", className)}>
      {menu}
      {onToggleSave ? (
        <button
          type="button"
          aria-label={isSaved ? "Quitar guardado" : "Guardar clip"}
          title={isSaved ? "Quitar guardado" : "Guardar clip"}
          aria-pressed={isSaved}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleSave}
          className={popClipMediaActionButtonClass}
        >
          {isSaved ? <BookmarkCheck className="h-5 w-5" aria-hidden="true" /> : <Bookmark className="h-5 w-5" aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}
