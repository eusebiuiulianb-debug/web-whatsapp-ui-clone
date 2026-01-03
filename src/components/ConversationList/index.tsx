import { useContext, useState } from "react";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import { ConversationListData } from "../../types/Conversation"
import { getFollowUpTag } from "../../utils/followUp";
import clsx from "clsx";
import { PACKS } from "../../config/packs";
import { computeFanTotals } from "../../lib/fanTotals";
import { formatNextActionTooltip } from "../../lib/nextActionLabel";
import { normalizePreferredLanguage } from "../../lib/language";
import { isStickerToken } from "../../lib/stickers";

interface ConversationListProps {
  isFirstConversation?: boolean;
  data: ConversationListData;
  variant?: "default" | "compact";
  onSelect?: (conversation: ConversationListData) => void;
  onToggleHighPriority?: (conversation: ConversationListData) => void;
  onCopyInvite?: (conversation: ConversationListData) => Promise<boolean>;
}

export default function ConversationList(props: ConversationListProps) {
  const {
    isFirstConversation,
    data,
    onSelect,
    onToggleHighPriority,
    onCopyInvite,
    variant = "default",
  } = props;
  const { setConversation } = useContext(ConversationContext);
  const {
    contactName,
    lastMessage,
    lastTime,
    image,
    unreadCount,
    isNew,
    membershipStatus,
    accessState,
    accessType,
    accessLabel,
    daysLeft,
    urgencyLevel,
  } = data;
  const borderClass = isFirstConversation ? "border-transparent" : "border-[rgba(134,150,160,0.15)]";
  const [ isHover, seHover ] = useState(false);
  const [ inviteCopyState, setInviteCopyState ] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const isManagerChat = data.isManager === true;
  const previewMessage =
    typeof lastMessage === "string" && isStickerToken(lastMessage) ? "Sticker" : lastMessage;
  const hasUnread = !isManagerChat && !!unreadCount && unreadCount > 0;
  const isCompact = variant === "compact";
  const nameSizeClass = isCompact ? "text-[13px]" : "text-sm";
  const nameClasses = hasUnread
    ? `text-slate-50 ${nameSizeClass} font-semibold`
    : `text-slate-50 ${nameSizeClass} font-medium`;
  const previewClasses = hasUnread ? "text-slate-50 text-xs font-medium" : "text-slate-400 text-xs";
  const rowPadding = isCompact ? "px-3 py-2.5" : "px-3 py-3.5";
  const avatarSize = isCompact ? { width: "w-9", height: "h-9" } : { width: "w-12", height: "h-12" };
  const sourceLabelRaw = typeof data.firstUtmSource === "string" ? data.firstUtmSource : null;
  const sourceLabel = sourceLabelRaw && sourceLabelRaw.trim().length > 0 ? formatSourceLabel(sourceLabelRaw) : "";
  const campaignLabel = data.firstUtmCampaign?.trim();
  const contentLabel = data.firstUtmContent?.trim();
  if (isManagerChat) {
    const managerCaption = data.managerCaption ?? "Chat interno del Manager IA";
    const hasManagerCaption = managerCaption.trim().length > 0;
    const hasManagerPreview = typeof previewMessage === "string" && previewMessage.trim().length > 0;
    return (
      <div 
        className={`flex items-center w-full bg-[#111B21] ${rowPadding} hover:bg-[#2A3942] cursor-pointer border-t ${borderClass}`}
        style={{ contentVisibility: "auto" }}
        onMouseMove={ () => seHover(true) }
        onMouseLeave={ () => seHover(false) }
        onClick={() => {
          if (onSelect) {
            onSelect(data);
          } else {
            setConversation(data);
          }
        }}
      >
        <div className="flex items-center gap-3 w-full">
          <Avatar width={avatarSize.width} height={avatarSize.height} image={image} />
          <div className="flex flex-col gap-[2px] min-w-0 w-full">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`truncate ${nameClasses}`}>{contactName}</span>
              <span className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                IA
              </span>
            </div>
            {hasManagerPreview && <span className={`truncate ${previewClasses}`}>{previewMessage}</span>}
            {hasManagerCaption && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>{managerCaption}</span>
                {lastTime ? (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                    <span>{lastTime}</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  const normalizedAccessState = (() => {
    const provided = (accessState || "").toString().toUpperCase();
    if (provided === "ACTIVE" || provided === "EXPIRED" || provided === "NONE") return provided as "ACTIVE" | "EXPIRED" | "NONE";
    const hasActiveGrant = Array.isArray(data.activeGrantTypes) && data.activeGrantTypes.length > 0 && (daysLeft ?? 0) > 0;
    if (hasActiveGrant) return "ACTIVE";
    if (data.hasAccessHistory) return "EXPIRED";
    return "NONE";
  })();

  const daysLabel = daysLeft !== undefined && daysLeft !== null ? `${daysLeft} d` : "";
  const nameTint = normalizedAccessState === "EXPIRED" ? "text-[#7d8a93]" : nameClasses;
  const followUpTag = getFollowUpTag(membershipStatus, daysLeft, data.activeGrantTypes);
  const notesCount = data.notesCount ?? 0;
  const notePreview = typeof data.notePreview === "string" ? data.notePreview : "";
  const hasNotePreview = notePreview.trim().length > 0;
  const segment = (data.segment || "").toUpperCase();
  const customerTier = (data.customerTier ?? "new") as "new" | "regular" | "vip" | "priority";
  const followUpOpen = data.followUpOpen ?? null;
  const followUpTitle = followUpOpen?.title ?? null;
  const followUpNote = followUpOpen?.note ?? null;
  const followUpDueAt = followUpOpen?.dueAt ?? null;
  const nextActionNote = typeof data.nextActionNote === "string" ? data.nextActionNote : null;
  const nextActionAt = data.nextActionAt ?? null;
  const hasNextAction = Boolean(
    followUpOpen ||
      Boolean(nextActionAt) ||
      Boolean(nextActionNote?.trim()) ||
      (typeof data.nextAction === "string" && data.nextAction.trim().length > 0)
  );
  const nextActionNoteValue =
    (typeof data.nextActionNote === "string" ? data.nextActionNote.trim() : "") ||
    (typeof followUpTitle === "string" ? followUpTitle.trim() : "") ||
    (typeof followUpNote === "string" ? followUpNote.trim() : "") ||
    (typeof data.nextAction === "string" ? data.nextAction.trim() : "") ||
    (typeof data.nextActionSummary === "string" ? data.nextActionSummary.trim() : "") ||
    (typeof data.nextActionSnippet === "string" ? data.nextActionSnippet.trim() : "") ||
    "";
  const followUpTooltip = formatNextActionTooltip(followUpDueAt || nextActionAt, nextActionNoteValue);
  const novsyStatus = (data as any).novsyStatus ?? null;
  const preferredLanguage = normalizePreferredLanguage(data.preferredLanguage);
  const languageBadgeLabel = !isManagerChat && preferredLanguage ? preferredLanguage.toUpperCase() : null;
  const hasContextSignals = notesCount > 0 || hasNextAction;

  function normalizeTier(tier: string | undefined) {
    const lower = (tier || "").toLowerCase();
    if (lower === "vip" || lower === "priority") return "vip";
    if (lower === "regular") return "regular";
    return "new";
  }

  const normalizedTierFromSegment =
    segment === "VIP" ? "vip" : segment === "LEAL_ESTABLE" ? "regular" : segment === "NUEVO" ? "new" : null;
  const normalizedTier = normalizedTierFromSegment ?? normalizeTier(customerTier);
  const tierLabel =
    segment === "EN_RIESGO"
      ? "En riesgo"
      : normalizedTier === "vip"
      ? "VIP"
      : normalizedTier === "regular"
      ? "Habitual"
      : "Nuevo";
  const isHighPriority = (data as any).isHighPriority === true;
  const purchaseTotals = computeFanTotals([
    { kind: "EXTRA", amount: data.extrasSpentTotal ?? 0 },
    { kind: "TIP", amount: data.tipsSpentTotal ?? 0 },
    { kind: "GIFT", amount: data.giftsSpentTotal ?? 0 },
  ]);
  const totalSpent = Math.round(purchaseTotals.totalSpent);
  const tierBadgeClass = clsx(
    "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold whitespace-nowrap shrink-0",
    normalizedTier === "vip"
      ? "border border-amber-400 text-amber-900 bg-amber-300/80"
    : normalizedTier === "regular"
      ? "border border-emerald-400 text-emerald-100 bg-emerald-500/20"
      : "border border-sky-400 text-sky-100 bg-sky-500/20"
  );

  function getAccessChipLabel() {
    if (normalizedAccessState === "NONE") {
      if (sourceLabel) return `Origen: ${sourceLabel}`;
      return isNew ? "Nuevo" : "Sin acceso";
    }
    if (normalizedAccessState === "EXPIRED") return "Caducado";
    if (accessLabel) return accessLabel;
    const statusLower = (membershipStatus || "").toLowerCase();
    if (statusLower.includes("trial") || statusLower.includes("prueba")) return PACKS.trial.shortLabel;
    if (statusLower.includes("monthly") || statusLower.includes("mensual") || statusLower.includes("suscripción")) return PACKS.monthly.shortLabel;
    if (statusLower.includes("special") || statusLower.includes("individual") || statusLower.includes("especial")) return PACKS.special.shortLabel;
    return membershipStatus || "";
  }

  const accessChipLabel = getAccessChipLabel();
  const shouldShowAccessChip = Boolean(accessChipLabel);

  const canToggleHighPriority = !isManagerChat && typeof onToggleHighPriority === "function";
  const hasActiveAccess = typeof data.hasActiveAccess === "boolean" ? data.hasActiveAccess : normalizedAccessState === "ACTIVE";
  const isInvitePending = !isManagerChat && !data.inviteUsedAt && !hasActiveAccess;
  const canCopyInvite = isInvitePending && typeof onCopyInvite === "function";
  const inviteCopyLabel =
    inviteCopyState === "copied"
      ? "Copiado"
      : inviteCopyState === "copying"
      ? "Copiando..."
      : "Copiar enlace";

  return (
    <div 
      className={`flex items-center w-full bg-[#111B21] ${rowPadding} hover:bg-[#2A3942] cursor-pointer border-t ${borderClass}`}
      style={{ contentVisibility: "auto" }}
      onMouseMove={ () => seHover(true) }
      onMouseLeave={ () => seHover(false) }
      onClick={() => {
        if (onSelect) {
          onSelect(data);
        } else {
          setConversation(data);
        }
      }}
    >
      <div className="flex items-center gap-3 w-full">
        <Avatar width={avatarSize.width} height={avatarSize.height} image={image} />
        <div className="flex w-full items-start gap-3 min-w-0">
          <div className="flex flex-col gap-[2px] min-w-0 w-full">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`truncate ${nameTint}`}>{contactName}</span>
              {/* Chip de nivel según el tier del fan, usando la misma paleta que el botón amarillo */}
              <span className={tierBadgeClass}>
                {tierLabel}
              </span>
              {languageBadgeLabel && (
                <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2 py-1 text-[10px] font-semibold text-slate-200 whitespace-nowrap shrink-0">
                  {languageBadgeLabel}
                </span>
              )}
              {novsyStatus === "NOVSY" && (
                <span className="inline-flex items-center rounded-full border border-emerald-400/80 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 whitespace-nowrap shrink-0">
                  Extras
                </span>
              )}
              {/* Chip de alta prioridad */}
              {isHighPriority && (
                <span
                  className="inline-flex items-center justify-center rounded-full bg-amber-300 px-2.5 py-1 text-[12px] font-semibold leading-none text-neutral-950 shadow-sm whitespace-nowrap shrink-0"
                  aria-label="Alta prioridad"
                  title="Alta prioridad"
                >
                  <span aria-hidden>🔥</span>
                </span>
              )}
              {followUpTag !== "none" && (
                <span
                  className={clsx(
                    "ml-1 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0",
                    followUpTag === "trial_soon" && "border border-amber-400/70 bg-amber-500/15 text-amber-100",
                    followUpTag === "monthly_soon" && "border border-sky-400/70 bg-sky-500/15 text-sky-100",
                    followUpTag === "expired" && "border border-rose-400/70 bg-rose-500/15 text-rose-100"
                  )}
                >
                  {followUpTag === "trial_soon" && `Prueba · ${daysLeft ?? ""} d`}
                  {followUpTag === "monthly_soon" && `Renueva en ${daysLeft ?? ""} d`}
                  {followUpTag === "expired" && "Caducado"}
                </span>
              )}
            </div>
            {!isCompact && <span className={`truncate ${previewClasses}`}>{previewMessage}</span>}
            {!isCompact && hasNotePreview && (
              <span className="truncate text-[11px] text-slate-500/80">{notePreview}</span>
            )}
            {!isCompact && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span>{`${totalSpent} €`}</span>
                {hasContextSignals && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                    <span className="inline-flex items-center gap-2 text-slate-400">
                      {notesCount > 0 && (
                        <span aria-label="Notas" title={notePreview || ""}>
                          📝 {notesCount}
                        </span>
                      )}
                      {hasNextAction && (
                        <span aria-label="Seguimiento" title={followUpTooltip}>
                          ⏰
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
            )}
            <div className={clsx("flex flex-wrap items-center gap-2", isCompact ? "mt-0.5" : "mt-1")}>
              {shouldShowAccessChip ? (
                <span className="inline-flex items-center rounded-full bg-slate-800/80 text-[11px] text-amber-200 px-3 py-1 font-semibold whitespace-nowrap shrink-0 w-auto">
                  {accessChipLabel}
                </span>
              ) : null}
              {!isCompact && isInvitePending && (
                <span
                  className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 whitespace-nowrap shrink-0"
                  title="Invitación privada /i/token pendiente de entrar"
                >
                  Pendiente
                </span>
              )}
              {!isCompact && canCopyInvite && (
                <button
                  type="button"
                  className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-100 whitespace-nowrap shrink-0 w-auto"
                  onClick={async (event) => {
                    event.stopPropagation();
                    if (!onCopyInvite) return;
                    try {
                      setInviteCopyState("copying");
                      const ok = await onCopyInvite(data);
                      setInviteCopyState(ok ? "copied" : "error");
                      setTimeout(() => setInviteCopyState("idle"), 1500);
                    } catch (_err) {
                      setInviteCopyState("error");
                      setTimeout(() => setInviteCopyState("idle"), 1500);
                    }
                  }}
                  aria-live="polite"
                >
                  {inviteCopyState === "error" ? "Error" : inviteCopyLabel}
                </button>
              )}
              {daysLabel ? (
                <span
                  className={
                    urgencyLevel === "high"
                      ? "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold border-red-500 text-red-200 bg-red-500/10 whitespace-nowrap shrink-0"
                    : urgencyLevel === "medium"
                      ? "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold border-amber-400 text-amber-200 bg-amber-500/10 whitespace-nowrap shrink-0"
                      : "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold border-slate-600 text-slate-300 bg-slate-800/80 whitespace-nowrap shrink-0"
                  }
                >
                  {daysLabel}
                </span>
              ) : null}
              {!isCompact && (sourceLabel || campaignLabel || contentLabel) && (
                <div className="flex flex-wrap items-center gap-1">
                  {sourceLabel && (
                    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200 whitespace-nowrap shrink-0">
                      {sourceLabel}
                    </span>
                  )}
                  {campaignLabel && (
                    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300 whitespace-nowrap shrink-0">
                      {campaignLabel}
                    </span>
                  )}
                  {contentLabel && (
                    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300 whitespace-nowrap shrink-0">
                      {contentLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 w-auto text-[#aebac1]">
            <div className="flex items-center gap-2">
              {canToggleHighPriority && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleHighPriority?.(data);
                  }}
                  className={clsx(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs transition",
                    isHighPriority
                      ? "border-amber-300 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                      : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-amber-300 hover:text-amber-100"
                  )}
                  aria-pressed={isHighPriority}
                  aria-label={isHighPriority ? "Quitar alta prioridad" : "Marcar alta prioridad"}
                  title={isHighPriority ? "Quitar alta prioridad" : "Marcar alta prioridad"}
                >
                  📌
                </button>
              )}
              <h1 className="text-[10px] text-slate-500">{lastTime}</h1>
            </div>
            {hasUnread && (
              <span className="self-end min-w-[20px] h-5 px-2 rounded-full bg-[#53bdeb] text-[#0b141a] text-xs font-semibold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
            {isHover ? (
              <span className="flex cursor-pointer h-full items-center justify-center">
                <svg viewBox="0 0 19 20" width="19" height="20" className="">
                  <path fill="currentColor" d="m3.8 6.7 5.7 5.7 5.7-5.7 1.6 1.6-7.3 7.2-7.3-7.2 1.6-1.6z"></path>
                </svg>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatSourceLabel(raw?: string | null) {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return "Direct";
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("instagram") || value === "ig") return "IG";
  if (value.includes("discover") || value.includes("discovery")) return "Discovery";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
