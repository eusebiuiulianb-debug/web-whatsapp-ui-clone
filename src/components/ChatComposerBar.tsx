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
  showAudienceToggle?: boolean;
  showAttach?: boolean;
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
  showAudienceToggle = true,
  showAttach = true,
}: ChatComposerBarProps) {
  const isInternalMode = audience === "INTERNAL";
  const isInputDisabled = (isChatBlocked && !isInternalMode) || isInternalPanelOpen;
  return (
    <div
      className={clsx(
        "mt-1.5 flex flex-col gap-2 rounded-2xl border px-3 py-2.5 transition backdrop-blur",
        "shadow-[0_-12px_22px_-16px_rgba(0,0,0,0.55)]",
        isInternalMode
          ? "bg-gradient-to-r from-amber-500/12 via-slate-900/75 to-amber-500/12 border-amber-400/50"
          : "bg-gradient-to-r from-slate-900/55 via-slate-900/75 to-slate-900/55 border-slate-700/70",
        isInternalMode
          ? "focus-within:border-amber-400/70 focus-within:ring-1 focus-within:ring-amber-400/25"
          : "focus-within:border-emerald-400/70 focus-within:ring-1 focus-within:ring-emerald-400/25",
        isChatBlocked && !isInternalMode && "opacity-70"
      )}
    >
      <textarea
        ref={inputRef}
        rows={1}
        className={clsx(
          "w-full min-h-[48px] resize-none overflow-y-auto bg-transparent border-0 outline-none ring-0",
          "px-1 pt-3 pb-2 text-sm leading-6 text-slate-50 whitespace-pre-wrap break-words",
          "placeholder:text-slate-300/95",
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {showAttach && (
            <button
              type="button"
              onClick={onAttach}
              disabled={!canAttach}
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2",
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
          )}
          {showAudienceToggle && (
            <div
              className={clsx(
                "inline-flex h-8 items-center rounded-full border p-0.5 shrink-0",
                isInternalMode
                  ? "border-amber-400/60 bg-amber-500/12"
                  : "border-slate-800/70 bg-slate-900/50"
              )}
            >
              <button
                type="button"
                onClick={() => onAudienceChange("CREATOR")}
                className={clsx(
                  "h-7 rounded-full px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30",
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
                  "h-7 rounded-full px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30",
                  audience === "INTERNAL"
                    ? "bg-amber-500/20 text-amber-100"
                    : "text-slate-300 hover:text-slate-100"
                )}
                title="No se envía al fan. Se guarda en el chat interno."
              >
                {isInternalMode ? "🔒 Interno" : "Interno"}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          aria-label={actionLabel}
          className={clsx(
            "h-9 px-4 rounded-full text-sm font-semibold shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2",
            isInternalMode
              ? "bg-sky-500/90 text-slate-950 hover:bg-sky-400 focus-visible:ring-sky-400/40"
              : "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
