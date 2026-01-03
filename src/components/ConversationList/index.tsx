import { useContext } from "react";
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
import { IconBadge } from "../ui/IconBadge";
import { Chip } from "../ui/Chip";
import { ConversationActionsMenu } from "../conversations/ConversationActionsMenu";

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
              <Chip variant="emerald" size="xs">
                IA
              </Chip>
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
  const isUrgencyDefault = urgencyLevel !== "high" && urgencyLevel !== "medium";
  const nameTint = normalizedAccessState === "EXPIRED" ? "text-[#7d8a93]" : nameClasses;
  const followUpTag = getFollowUpTag(membershipStatus, daysLeft, data.activeGrantTypes);
  const notesCount = data.notesCount ?? 0;
  const notePreview = typeof data.notePreview === "string" ? data.notePreview : "";
  const hasNotePreview = notePreview.trim().length > 0;
  const profilePreview = getProfilePreview(data.profileText);
  const hasProfilePreview = profilePreview.length > 0;
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
  const shouldShowNotePreview = notesCount > 0 && hasNotePreview;

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
  const tierChipVariant = normalizedTier === "vip" ? "amber" : normalizedTier === "regular" ? "emerald" : "neutral";
  const tierChipClass =
    normalizedTier === "new" ? "border-sky-400 text-sky-100 bg-sky-500/20" : undefined;

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

  const hasActiveAccess = typeof data.hasActiveAccess === "boolean" ? data.hasActiveAccess : normalizedAccessState === "ACTIVE";
  const isInvitePending = !isManagerChat && !data.inviteUsedAt && !hasActiveAccess;

  return (
    <div 
      className={`flex items-center w-full bg-[#111B21] ${rowPadding} hover:bg-[#2A3942] cursor-pointer border-t ${borderClass}`}
      style={{ contentVisibility: "auto" }}
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
              <Chip variant={tierChipVariant} size="sm" className={tierChipClass}>
                {tierLabel}
              </Chip>
              {languageBadgeLabel && (
                <Chip variant="subtle" size="xs">
                  {languageBadgeLabel}
                </Chip>
              )}
              {novsyStatus === "NOVSY" && (
                <Chip variant="emerald" size="xs">
                  Extras
                </Chip>
              )}
              {/* Chip de alta prioridad */}
              {isHighPriority && (
                <Chip
                  variant="amber"
                  size="xs"
                  leftGlyph="pin"
                  ariaLabel="Alta prioridad"
                  title="Alta prioridad"
                >
                  Alta
                </Chip>
              )}
              {followUpTag !== "none" && (
                <Chip
                  variant={
                    followUpTag === "trial_soon"
                      ? "amber"
                      : followUpTag === "expired"
                      ? "danger"
                      : "neutral"
                  }
                  size="xs"
                  className={clsx(
                    "ml-1",
                    followUpTag === "monthly_soon" && "border-sky-400/70 bg-sky-500/15 text-sky-100"
                  )}
                >
                  {followUpTag === "trial_soon" && `Prueba · ${daysLeft ?? ""} d`}
                  {followUpTag === "monthly_soon" && `Renueva en ${daysLeft ?? ""} d`}
                  {followUpTag === "expired" && "Caducado"}
                </Chip>
              )}
            </div>
            {!isCompact && <span className={`truncate ${previewClasses}`}>{previewMessage}</span>}
            {!isCompact && (hasProfilePreview || shouldShowNotePreview) && (
              <div className="flex flex-col gap-1 min-w-0">
                {hasProfilePreview && (
                  <MetaRow
                    label="Perfil"
                    text={profilePreview}
                    variant="profile"
                  />
                )}
                {shouldShowNotePreview && (
                  <MetaRow
                    label="Nota"
                    text={notePreview}
                    variant="note"
                  />
                )}
              </div>
            )}
            {!isCompact && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span>{`${totalSpent} €`}</span>
                {hasContextSignals && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                    <span className="inline-flex items-center gap-2 text-slate-400">
                      {notesCount > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <IconBadge
                            label={notePreview || "Notas"}
                            icon="note"
                            variant="muted"
                            size="sm"
                          />
                          <span className="text-[11px] text-slate-400">{notesCount}</span>
                        </span>
                      )}
                      {hasNextAction && (
                        <IconBadge
                          label={followUpTooltip || "Seguimiento"}
                          icon="clock"
                          variant="muted"
                          size="sm"
                        />
                      )}
                    </span>
                  </>
                )}
              </div>
            )}
            <div className={clsx("flex flex-wrap items-center gap-2", isCompact ? "mt-0.5" : "mt-1")}>
              {shouldShowAccessChip ? (
                <Chip
                  variant="subtle"
                  size="xs"
                  className="bg-slate-800/80 text-amber-200 border-slate-700/70"
                >
                  {accessChipLabel}
                </Chip>
              ) : null}
              {!isCompact && isInvitePending && (
                <Chip
                  variant="amber"
                  size="xs"
                  title="Invitación privada /i/token pendiente de entrar"
                >
                  Pendiente
                </Chip>
              )}
              {daysLabel ? (
                <Chip
                  variant={urgencyLevel === "high" ? "danger" : urgencyLevel === "medium" ? "amber" : "neutral"}
                  size="xs"
                  className={clsx(isUrgencyDefault && "border-slate-600 bg-slate-800/80 text-slate-300")}
                >
                  {daysLabel}
                </Chip>
              ) : null}
              {!isCompact && (sourceLabel || campaignLabel || contentLabel) && (
                <div className="flex flex-wrap items-center gap-1">
                  {sourceLabel && (
                    <Chip variant="subtle" size="xs">
                      {sourceLabel}
                    </Chip>
                  )}
                  {campaignLabel && (
                    <Chip variant="subtle" size="xs" className="text-slate-300">
                      {campaignLabel}
                    </Chip>
                  )}
                  {contentLabel && (
                    <Chip variant="subtle" size="xs" className="text-slate-300">
                      {contentLabel}
                    </Chip>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 w-auto text-[#aebac1] relative">
            <div className="flex items-center gap-2">
              <h1 className="text-[10px] text-slate-500">{lastTime}</h1>
              <ConversationActionsMenu
                conversation={data}
                variant="row"
                onToggleHighPriority={onToggleHighPriority}
                onCopyInvite={onCopyInvite}
              />
            </div>
            {hasUnread && (
              <span className="self-end min-w-[20px] h-5 px-2 rounded-full bg-[#53bdeb] text-[#0b141a] text-xs font-semibold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
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

function getProfilePreview(value?: string | null, max = 90): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const line = trimmed.split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return "";
  if (line.length <= max) return line;
  const sliceEnd = Math.max(0, max - 3);
  return `${line.slice(0, sliceEnd)}...`;
}

type MetaRowProps = {
  label: string;
  text: string;
  variant: "profile" | "note";
};

function MetaRow({ label, text, variant }: MetaRowProps) {
  const icon = variant === "profile" ? "user" : "note";
  const toneClass = variant === "profile" ? "text-slate-300/80" : "text-slate-300/70";
  return (
    <div className="flex items-center gap-2 min-w-0 text-[11px] text-slate-400/80 leading-tight">
      <IconBadge
        label={label}
        icon={icon}
        variant="subtle"
        size="md"
        className={toneClass}
      />
      <span className="truncate min-w-0 text-[11px] text-slate-400/80" title={text}>
        {text}
      </span>
    </div>
  );
}
