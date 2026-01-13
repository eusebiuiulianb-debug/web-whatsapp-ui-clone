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
import { badgeToneForLabel } from "../../lib/badgeTone";
import { IconBadge } from "../ui/IconBadge";
import { Badge, type BadgeTone } from "../ui/Badge";
import { IconGlyph, type IconName } from "../ui/IconGlyph";
import { ConversationActionsMenu } from "../conversations/ConversationActionsMenu";

const INTENT_BADGE_LABELS: Record<string, string> = {
  BUY_NOW: "Compra",
  PRICE_ASK: "Precio",
  CONTENT_REQUEST: "Contenido",
  CUSTOM_REQUEST: "Custom",
  SUBSCRIBE: "Suscribir",
  CANCEL: "Cancelar",
  OFF_PLATFORM: "Off-platform",
  SUPPORT: "Soporte",
  OBJECTION: "Objeción",
  RUDE_OR_HARASS: "Grosero",
  UNSAFE_MINOR: "Menor",
  FLIRT: "Coqueteo",
  GREETING: "Saludo",
  OTHER: "Otro",
};

const SUGGESTED_ACTION_KEYS = new Set([
  "BREAK_ICE",
  "BUILD_RAPPORT",
  "OFFER_EXTRA",
  "PUSH_MONTHLY",
  "SEND_PAYMENT_LINK",
  "SUPPORT",
  "SAFETY",
]);

function normalizeSuggestedActionKey(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return SUGGESTED_ACTION_KEYS.has(normalized) ? normalized : null;
}

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
    unseenPurchaseCount,
    unseenPurchaseLabel,
  } = data;
  const borderClass = isFirstConversation ? "border-transparent" : "border-[color:var(--border)]";
  const isManagerChat = data.isManager === true;
  const previewMessage =
    typeof lastMessage === "string" && isStickerToken(lastMessage) ? "Sticker" : lastMessage;
  const hasUnread = !isManagerChat && !!unreadCount && unreadCount > 0;
  const hasUnseenPurchase = !isManagerChat && !!unseenPurchaseCount && unseenPurchaseCount > 0;
  const purchaseBadgeLabel = typeof unseenPurchaseLabel === "string" && unseenPurchaseLabel.trim().length > 0
    ? unseenPurchaseLabel
    : "+€";
  const isCompact = variant === "compact";
  const nameSizeClass = isCompact ? "text-[13px]" : "text-sm";
  const nameClasses = hasUnread
    ? `text-[color:var(--text)] ${nameSizeClass} font-semibold`
    : `text-[color:var(--text)] ${nameSizeClass} font-medium`;
  const previewClasses = hasUnread ? "text-[color:var(--text)] text-xs font-medium" : "text-[color:var(--muted)] text-xs";
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
        className={`flex items-center w-full bg-[color:var(--surface-1)] ${rowPadding} hover:bg-[color:var(--surface-2)] cursor-pointer border-t ${borderClass}`}
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
              <Badge tone="accent" size="sm">
                IA
              </Badge>
            </div>
            {hasManagerPreview && <span className={`truncate ${previewClasses}`}>{previewMessage}</span>}
            {hasManagerCaption && (
              <div className="flex items-center gap-2 text-[11px] ui-muted">
                <span>{managerCaption}</span>
                {lastTime ? (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[color:var(--muted)]" />
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
  const nameTint = normalizedAccessState === "EXPIRED" ? "text-[color:var(--muted)]" : nameClasses;
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
  const manualNextActionValue = normalizeSuggestedActionKey(data.nextAction)
    ? ""
    : (typeof data.nextAction === "string" ? data.nextAction.trim() : "");
  const hasNextAction = Boolean(
    followUpOpen ||
      Boolean(nextActionAt) ||
      Boolean(nextActionNote?.trim()) ||
      manualNextActionValue.length > 0
  );
  const nextActionNoteValue =
    (typeof data.nextActionNote === "string" ? data.nextActionNote.trim() : "") ||
    (typeof followUpTitle === "string" ? followUpTitle.trim() : "") ||
    (typeof followUpNote === "string" ? followUpNote.trim() : "") ||
    manualNextActionValue ||
    (typeof data.nextActionSummary === "string" ? data.nextActionSummary.trim() : "") ||
    (typeof data.nextActionSnippet === "string" ? data.nextActionSnippet.trim() : "") ||
    "";
  const followUpTooltip = formatNextActionTooltip(followUpDueAt || nextActionAt, nextActionNoteValue);
  const novsyStatus = (data as any).novsyStatus ?? null;
  const preferredLanguage = normalizePreferredLanguage(data.preferredLanguage);
  const languageBadgeLabel = !isManagerChat && preferredLanguage ? preferredLanguage.toUpperCase() : null;
  const temperatureBucketRaw = (data as any).temperatureBucket ?? (data as any).heatLabel ?? null;
  const temperatureBucket = temperatureBucketRaw ? String(temperatureBucketRaw).toUpperCase() : null;
  const normalizedTemperatureBucket = temperatureBucket === "READY" ? "HOT" : temperatureBucket;
  const temperatureScore =
    typeof (data as any).temperatureScore === "number"
      ? (data as any).temperatureScore
      : typeof (data as any).heatScore === "number"
      ? (data as any).heatScore
      : null;
  const lastIntentKey =
    (data as any).lastIntentKey && String((data as any).lastIntentKey).trim().length > 0
      ? String((data as any).lastIntentKey).toUpperCase()
      : null;
  const intentLabel = lastIntentKey ? INTENT_BADGE_LABELS[lastIntentKey] ?? lastIntentKey : null;
  const heatBadge =
    normalizedTemperatureBucket === "HOT"
      ? "🔥"
      : normalizedTemperatureBucket === "WARM"
      ? "🌡"
      : normalizedTemperatureBucket === "COLD"
      ? "❄"
      : null;
  const agencyStageKey = typeof data.agencyStage === "string" ? data.agencyStage.toUpperCase() : null;
  const agencyStageLabel = agencyStageKey ? AGENCY_STAGE_LABELS[agencyStageKey] ?? agencyStageKey : null;
  const agencyStageTone: BadgeTone = agencyStageKey
    ? AGENCY_STAGE_TONES[agencyStageKey] ?? "muted"
    : "muted";
  const agencyObjectiveKey = typeof data.agencyObjective === "string" ? data.agencyObjective.toUpperCase() : null;
  const agencyObjectiveLabelFromData =
    typeof data.agencyObjectiveLabel === "string" && data.agencyObjectiveLabel.trim()
      ? data.agencyObjectiveLabel.trim()
      : null;
  const agencyObjectiveIcon = agencyObjectiveKey ? AGENCY_OBJECTIVE_ICONS[agencyObjectiveKey] ?? null : null;
  const agencyObjectiveLabel = agencyObjectiveLabelFromData
    ? agencyObjectiveLabelFromData
    : agencyObjectiveKey
    ? AGENCY_OBJECTIVE_LABELS[agencyObjectiveKey] ?? agencyObjectiveKey
    : null;
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
  const isRiskTier = tierLabel === "En riesgo";
  const followUpBadgeLabel =
    followUpTag === "trial_soon"
      ? `Prueba · ${daysLeft ?? ""} d`
      : followUpTag === "monthly_soon"
      ? `Renueva en ${daysLeft ?? ""} d`
      : followUpTag === "expired"
      ? "Caducado"
      : "Seguimiento";
  const tierBadgeTone: BadgeTone = isRiskTier ? "danger" : badgeToneForLabel(tierLabel);
  const followUpTone: BadgeTone = badgeToneForLabel(followUpBadgeLabel);
  const urgencyTone: BadgeTone =
    urgencyLevel === "high" ? "danger" : urgencyLevel === "medium" ? "warn" : "muted";

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
  const accessBadgeTone: BadgeTone = badgeToneForLabel(accessChipLabel);

  return (
    <div 
      className={`flex items-center w-full bg-[color:var(--surface-1)] ${rowPadding} hover:bg-[color:var(--surface-2)] cursor-pointer border-t ${borderClass}`}
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
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`truncate ${nameTint}`}>{contactName}</span>
              {agencyStageLabel && (
                <Badge tone={agencyStageTone} size="sm" title={`Stage ${agencyStageLabel}`}>
                  {agencyStageLabel}
                </Badge>
              )}
              {agencyObjectiveIcon && agencyObjectiveLabel && (
                <span
                  className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[color:var(--muted)]"
                  title={`Objetivo: ${agencyObjectiveLabel}`}
                  aria-label={`Objetivo: ${agencyObjectiveLabel}`}
                >
                  <IconGlyph name={agencyObjectiveIcon} size="sm" />
                </span>
              )}
              {/* Badge de nivel según el tier del fan, usando la misma paleta que el botón amarillo */}
              <Badge tone={tierBadgeTone} size="sm">
                {tierLabel}
              </Badge>
              {languageBadgeLabel && (
                <Badge tone={badgeToneForLabel(languageBadgeLabel)} size="sm">
                  {languageBadgeLabel}
                </Badge>
              )}
              {heatBadge && (
                <Badge tone="muted" size="sm">
                  {heatBadge} {normalizedTemperatureBucket}
                  {temperatureScore !== null ? ` ${temperatureScore}` : ""}
                </Badge>
              )}
              {!isManagerChat && intentLabel && (
                <Badge tone="muted" size="sm">
                  Int: {intentLabel}
                </Badge>
              )}
              {novsyStatus === "NOVSY" && (
                <Badge tone={badgeToneForLabel("Extras")} size="sm">
                  Extras
                </Badge>
              )}
              {/* Badge de alta prioridad */}
              {isHighPriority && (
                <Badge
                  tone={badgeToneForLabel("Alta prioridad")}
                  size="sm"
                  leftGlyph="pin"
                  ariaLabel="Alta prioridad"
                  title="Alta prioridad"
                >
                  Alta
                </Badge>
              )}
              {followUpTag !== "none" && (
                <Badge tone={followUpTone} size="sm">
                  {followUpBadgeLabel}
                </Badge>
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
              <div className="flex items-center gap-1 text-[11px] ui-muted">
                <span>{`${totalSpent} €`}</span>
                {hasContextSignals && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[color:var(--muted)]" />
                    <span className="inline-flex items-center gap-2 text-[color:var(--muted)]">
                      {notesCount > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <IconBadge
                            label={notePreview || "Notas"}
                            icon="note"
                            variant="muted"
                            size="sm"
                          />
                          <span className="text-[11px] text-[color:var(--muted)]">{notesCount}</span>
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
            <div className={clsx(
              "flex items-center gap-1.5 flex-nowrap min-h-[18px] overflow-hidden",
              isCompact ? "mt-0.5" : "mt-1"
            )}>
              {shouldShowAccessChip ? (
                <Badge tone={accessBadgeTone} size="sm">
                  {accessChipLabel}
                </Badge>
              ) : null}
              {!isCompact && isInvitePending && (
                <Badge tone="warn" size="sm" title="Invitación privada /i/token pendiente de entrar">
                  Pendiente
                </Badge>
              )}
              {daysLabel ? (
                <Badge tone={urgencyTone} size="sm">
                  {daysLabel}
                </Badge>
              ) : null}
              {!isCompact && (sourceLabel || campaignLabel || contentLabel) && (
                <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                  {sourceLabel && (
                    <Badge tone="muted" size="sm">
                      {sourceLabel}
                    </Badge>
                  )}
                  {campaignLabel && (
                    <Badge tone="muted" size="sm">
                      {campaignLabel}
                    </Badge>
                  )}
                  {contentLabel && (
                    <Badge tone="muted" size="sm">
                      {contentLabel}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 w-auto text-[color:var(--muted)] relative">
            <div className="flex items-center gap-2">
              <h1 className="text-[10px] ui-muted">{lastTime}</h1>
              <ConversationActionsMenu
                conversation={data}
                variant="row"
                onToggleHighPriority={onToggleHighPriority}
                onCopyInvite={onCopyInvite}
              />
            </div>
            {hasUnseenPurchase && (
              <Badge
                key={`${purchaseBadgeLabel}-${unseenPurchaseCount}`}
                tone="accent"
                size="sm"
                className="novsy-purchase-pill novsy-pop"
              >
                {purchaseBadgeLabel}
              </Badge>
            )}
            {hasUnread && (
              <span className="self-end min-w-[20px] h-5 px-2 rounded-full bg-[color:var(--brand)] text-[color:var(--surface-0)] text-xs font-semibold flex items-center justify-center">
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

const AGENCY_STAGE_LABELS: Record<string, string> = {
  NEW: "NEW",
  WARM_UP: "WARM",
  HEAT: "HEAT",
  OFFER: "OFFER",
  CLOSE: "CLOSE",
  AFTERCARE: "CARE",
  RECOVERY: "RECOVER",
  BOUNDARY: "BOUNDARY",
};

const AGENCY_STAGE_TONES: Record<string, BadgeTone> = {
  NEW: "muted",
  WARM_UP: "accent",
  HEAT: "warn",
  OFFER: "danger",
  CLOSE: "danger",
  AFTERCARE: "muted",
  RECOVERY: "warn",
  BOUNDARY: "muted",
};

const AGENCY_OBJECTIVE_LABELS: Record<string, string> = {
  CONNECT: "Conectar",
  SELL_EXTRA: "Vender extra",
  SELL_PACK: "Vender pack",
  SELL_MONTHLY: "Vender mensual",
  RECOVER: "Recuperar",
  RETAIN: "Retener",
  UPSELL: "Upsell",
};

const AGENCY_OBJECTIVE_ICONS: Record<string, IconName> = {
  CONNECT: "smile",
  SELL_EXTRA: "gem",
  SELL_PACK: "gift",
  SELL_MONTHLY: "receipt",
  RECOVER: "alert",
  RETAIN: "thumbsUp",
  UPSELL: "coin",
};

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
  const toneClass = "ui-muted";
  return (
    <div className="flex items-center gap-2 min-w-0 text-[11px] ui-muted leading-tight">
      <IconBadge
        label={label}
        icon={icon}
        variant="subtle"
        size="md"
        className={toneClass}
      />
      <span className="truncate min-w-0 text-[11px] ui-muted" title={text}>
        {text}
      </span>
    </div>
  );
}
