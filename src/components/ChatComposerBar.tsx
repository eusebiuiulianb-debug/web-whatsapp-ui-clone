import React from "react";
import clsx from "clsx";

type ComposerAudience = "CREATOR" | "INTERNAL";

type ChatComposerBarProps = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  sendDisabled: boolean;
  placeholder: string;
  actionLabel: string;
  audience: ComposerAudience;
  onAudienceChange: (mode: ComposerAudience) => void;
  canAttach: boolean;
  onAttach: () => void;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  maxHeight: number;
  isChatBlocked: boolean;
  isInternalPanelOpen: boolean;
};

export function ChatComposerBar({
  value,
  onChange,
  onKeyDown,
  onSend,
  sendDisabled,
  placeholder,
  actionLabel,
  audience,
  onAudienceChange,
  canAttach,
  onAttach,
  inputRef,
  maxHeight,
  isChatBlocked,
  isInternalPanelOpen,
}: ChatComposerBarProps) {
  const isInternalMode = audience === "INTERNAL";
  const isInputDisabled = (isChatBlocked && !isInternalMode) || isInternalPanelOpen;
  return (
    <div
      className={clsx(
        "mt-1.5 flex flex-wrap items-end gap-2 rounded-2xl border px-2 py-2 transition backdrop-blur",
        isInternalMode
          ? "bg-gradient-to-r from-amber-500/10 via-slate-900/70 to-amber-500/10 border-amber-400/50"
          : "bg-gradient-to-r from-slate-950/50 via-slate-900/70 to-slate-950/50 border-slate-800/60",
        isInternalMode
          ? "focus-within:border-amber-400/70 focus-within:ring-1 focus-within:ring-amber-400/20"
          : "focus-within:border-emerald-400/70 focus-within:ring-1 focus-within:ring-emerald-400/20",
        isChatBlocked && !isInternalMode && "opacity-70"
      )}
    >
      <button
        type="button"
        onClick={onAttach}
        disabled={!canAttach}
        className={clsx(
          "flex h-8 w-8 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2",
          canAttach
            ? "border-slate-800/70 bg-slate-900/50 text-slate-200 hover:border-slate-600/80 hover:bg-slate-800/70 focus-visible:ring-emerald-400/30"
            : "border-slate-800/50 bg-slate-900/30 text-slate-500 cursor-not-allowed"
        )}
        title={canAttach ? "Adjuntar contenido" : "Solo disponible cuando escribes al fan."}
        aria-label="Adjuntar contenido"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
      <div className="flex min-w-[160px] flex-1 items-end gap-2">
        <div
          className={clsx(
            "inline-flex h-7 items-center rounded-full border p-0.5 shrink-0",
            isInternalMode
              ? "border-amber-400/60 bg-amber-500/12"
              : "border-slate-800/70 bg-slate-900/50"
          )}
        >
          <button
            type="button"
            onClick={() => onAudienceChange("CREATOR")}
            className={clsx(
              "h-6 rounded-full px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30",
              audience === "CREATOR"
                ? "bg-emerald-500/20 text-emerald-100"
                : "text-slate-300 hover:text-slate-100"
            )}
          >
            Fan
          </button>
          <button
            type="button"
            onClick={() => onAudienceChange("INTERNAL")}
            className={clsx(
              "h-6 rounded-full px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30",
              audience === "INTERNAL"
                ? "bg-amber-500/20 text-amber-100"
                : "text-slate-300 hover:text-slate-100"
            )}
            title="No se envía al fan. Se guarda en el chat interno."
          >
            {isInternalMode ? "🔒 Interno" : "Interno"}
          </button>
        </div>
        <textarea
          ref={inputRef}
          rows={1}
          className={clsx(
            "flex-1 min-w-0 min-h-[44px] bg-transparent resize-none overflow-y-auto",
            "px-2 py-2 text-sm leading-relaxed text-slate-50 whitespace-pre-wrap break-words",
            "placeholder:text-slate-400 focus:outline-none",
            isInternalMode ? "caret-amber-300" : "caret-emerald-400",
            isInputDisabled && "cursor-not-allowed"
          )}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          onChange={onChange}
          value={value}
          disabled={isInputDisabled}
          style={{ maxHeight: `${maxHeight}px` }}
        />
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={sendDisabled}
        aria-label={actionLabel}
        className={clsx(
          "h-8 px-3 rounded-full text-sm font-semibold shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2",
          isInternalMode
            ? "bg-sky-500/90 text-slate-950 hover:bg-sky-400 focus-visible:ring-sky-400/40"
            : "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {actionLabel}
      </button>
    </div>
  );
}
