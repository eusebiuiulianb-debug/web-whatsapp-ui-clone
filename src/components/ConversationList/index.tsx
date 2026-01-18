import { useContext } from "react";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import { ConversationListData } from "../../types/Conversation";
import { normalizeNextActionNote } from "../../lib/nextActionLabel";
import { normalizePreferredLanguage } from "../../lib/language";
import { isStickerToken } from "../../lib/stickers";
import { badgeToneForLabel } from "../../lib/badgeTone";
import { Badge, type BadgeTone } from "../ui/Badge";
import { ConversationActionsMenu } from "../conversations/ConversationActionsMenu";
import { useTypingIndicator } from "../../hooks/useTypingIndicator";
import { normalizeFanDraftText } from "../../lib/fanDraftPreview";

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

const NEXT_ACTION_LABELS: Record<string, string> = {
  BREAK_ICE: "Romper hielo",
  BUILD_RAPPORT: "Crear rapport",
  OFFER_EXTRA: "Ofrecer extra",
  PUSH_MONTHLY: "Llevar a mensual",
  SEND_PAYMENT_LINK: "Enviar link",
  SUPPORT: "Soporte",
  SAFETY: "Seguridad",
};

function normalizeSuggestedActionKey(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return SUGGESTED_ACTION_KEYS.has(normalized) ? normalized : null;
}

function getFollowUpIndicator(dueAt?: string | null) {
  if (!dueAt) return null;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (parsed.getTime() < startOfToday.getTime()) return "overdue";
  if (parsed.getTime() <= endOfToday.getTime()) return "today";
  return null;
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
    accessState,
    daysLeft,
  } = data;
  const borderClass = isFirstConversation ? "border-transparent" : "border-[color:var(--border)]";
  const isManagerChat = data.isManager === true;
  const typingIndicator = useTypingIndicator(data.id);
  const isTyping = !isManagerChat && Boolean(typingIndicator?.isTyping);
  const typingDraftPreview =
    isTyping && typingIndicator?.draftText
      ? normalizeFanDraftText(typingIndicator.draftText)
      : "";
  const previewMessage =
    typeof lastMessage === "string" && isStickerToken(lastMessage) ? "Sticker" : lastMessage;
  const hasUnread = !isManagerChat && !!unreadCount && unreadCount > 0;
  const isCompact = variant === "compact";
  const nameSizeClass = isCompact ? "text-[13px]" : "text-sm";
  const nameClasses = hasUnread
    ? `text-[color:var(--text)] ${nameSizeClass} font-semibold`
    : `text-[color:var(--text)] ${nameSizeClass} font-medium`;
  const previewClasses = hasUnread ? "text-[color:var(--text)] text-xs font-medium" : "text-[color:var(--muted)] text-xs";
  const rowPadding = isCompact ? "px-3 py-2.5" : "px-3 py-3.5";
  const avatarSize = isCompact ? { width: "w-9", height: "h-9" } : { width: "w-12", height: "h-12" };
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

  const nameTint =
    normalizedAccessState === "EXPIRED"
      ? `text-[color:var(--muted)] ${nameSizeClass} font-medium`
      : nameClasses;

  function normalizeTier(tier: string | undefined | null) {
    const lower = (tier || "").toLowerCase();
    if (lower === "vip" || lower === "priority") return "vip";
    if (lower === "regular") return "regular";
    return "new";
  }

  const segment = (data.segment || "").toUpperCase();
  const riskLevel = (data.riskLevel || "").toString().toUpperCase();
  const customerTier = (data.customerTier ?? "new") as "new" | "regular" | "vip" | "priority";
  const normalizedTierFromSegment =
    segment === "VIP" ? "vip" : segment === "LEAL_ESTABLE" ? "regular" : segment === "NUEVO" ? "new" : null;
  const normalizedTier = normalizedTierFromSegment ?? normalizeTier(customerTier);
  const isNewTier = data.isNew === true || data.isNew30d === true || normalizedTier === "new";
  const isRiskTier = segment === "EN_RIESGO" || (riskLevel !== "" && riskLevel !== "LOW");
  const tierLabel =
    isRiskTier
      ? "En riesgo"
      : normalizedTier === "vip"
      ? "VIP"
      : isNewTier
      ? "Nuevo"
      : "Habitual";
  const shouldShowTierLabel = tierLabel === "En riesgo" || tierLabel === "VIP" || tierLabel === "Nuevo";
  const tierBadgeTone: BadgeTone = badgeToneForLabel(tierLabel);

  const preferredLanguage = normalizePreferredLanguage(data.preferredLanguage);
  const languageBadgeLabel = preferredLanguage ? preferredLanguage.toUpperCase() : null;
  const isAdultConfirmed = Boolean(data.adultConfirmedAt);
  const adultBadgeLabel = !isManagerChat && !isAdultConfirmed ? "18+ no confirmado" : null;
  const adultBadgeTone: BadgeTone = "warn";

  const temperatureBucketRaw = data.temperatureBucket ?? data.heatLabel ?? null;
  const temperatureBucket = temperatureBucketRaw ? String(temperatureBucketRaw).toUpperCase() : "";
  const normalizedTemperatureBucket = temperatureBucket === "READY" ? "HOT" : temperatureBucket;
  const temperatureScore =
    typeof data.temperatureScore === "number"
      ? data.temperatureScore
      : typeof data.heatScore === "number"
      ? data.heatScore
      : null;
  const temperatureLabelFromScore =
    typeof temperatureScore === "number"
      ? temperatureScore >= 70
        ? "HOT"
        : temperatureScore >= 35
        ? "WARM"
        : "COLD"
      : "";
  const temperatureLabel =
    normalizedTemperatureBucket === "HOT" ||
    normalizedTemperatureBucket === "WARM" ||
    normalizedTemperatureBucket === "COLD"
      ? normalizedTemperatureBucket
      : temperatureLabelFromScore;
  const temperatureTone: BadgeTone =
    temperatureLabel === "HOT" ? "warn" : temperatureLabel === "WARM" ? "accent" : "muted";

  const lastIntentKey =
    data.lastIntentKey && String(data.lastIntentKey).trim().length > 0
      ? String(data.lastIntentKey).toUpperCase()
      : null;
  const intentLabel = lastIntentKey ? INTENT_BADGE_LABELS[lastIntentKey] ?? lastIntentKey : null;

  const followUpOpen = data.followUpOpen ?? null;
  const followUpTitle = followUpOpen?.title ?? null;
  const followUpNote = followUpOpen?.note ?? null;
  const nextActionKey = normalizeSuggestedActionKey(data.nextAction);
  const manualNextActionValue = nextActionKey
    ? ""
    : (typeof data.nextAction === "string" ? data.nextAction.trim() : "");
  const legacyNextActionKeyLabel = nextActionKey ? NEXT_ACTION_LABELS[nextActionKey] ?? nextActionKey : "";
  const nextActionRaw =
    (typeof data.nextActionSummary === "string" ? data.nextActionSummary.trim() : "") ||
    (typeof data.nextActionSnippet === "string" ? data.nextActionSnippet.trim() : "") ||
    (typeof data.nextActionNote === "string" ? data.nextActionNote.trim() : "") ||
    (typeof followUpTitle === "string" ? followUpTitle.trim() : "") ||
    (typeof followUpNote === "string" ? followUpNote.trim() : "") ||
    manualNextActionValue ||
    legacyNextActionKeyLabel ||
    "";
  const lastInboundMs = parseTimestamp(data.lastInboundAt);
  const lastCreatorMs = parseTimestamp(data.lastCreatorMessageAt);
  const hasUnreadInbound = lastInboundMs !== null && (lastCreatorMs === null || lastInboundMs > lastCreatorMs);
  const activityTimestamp = hasUnreadInbound
    ? data.lastInboundAt ?? null
    : data.lastMessageAt ?? data.lastInboundAt ?? null;
  const relativeTimeLabel = formatRelativeTimeShort(activityTimestamp);
  const showRelativeTime = Boolean(relativeTimeLabel);
  const unreadBadgeLabel = hasUnread && unreadCount ? String(unreadCount) : null;
  const nextActionLabelFromData =
    typeof data.nextActionLabel === "string" ? data.nextActionLabel.trim() : "";
  const localeBase =
    typeof data.locale === "string" ? data.locale.trim().toLowerCase().split(/[-_]/)[0] : "";
  const replyLanguage = preferredLanguage === "en" || preferredLanguage === "es" ? preferredLanguage : localeBase;
  const replyFallbackLabel = replyLanguage === "en" ? "Reply" : "Responder";
  const nextActionKeyFromData = typeof data.nextActionKey === "string" ? data.nextActionKey.trim() : "";
  const normalizedNextActionKey = nextActionKeyFromData ? nextActionKeyFromData.toUpperCase() : "";
  const nextActionKeyLabel =
    normalizedNextActionKey === "REPLY"
      ? replyFallbackLabel
      : normalizedNextActionKey
      ? NEXT_ACTION_LABELS[normalizedNextActionKey] ?? nextActionKeyFromData
      : "";
  const inferredNextActionLabel =
    nextActionLabelFromData ||
    (hasUnreadInbound ? replyFallbackLabel : "") ||
    normalizeNextActionNote(nextActionRaw) ||
    nextActionKeyLabel ||
    (intentLabel ?? "");
  const nextActionLabel = inferredNextActionLabel || "—";
  const shouldShowNextAction = data.needsAction === true || inferredNextActionLabel.trim().length > 0;
  const followUpDueAt = followUpOpen?.dueAt ?? data.nextActionAt ?? null;
  const followUpIndicator = getFollowUpIndicator(followUpDueAt);
  const followUpIndicatorLabel =
    followUpIndicator === "overdue" ? "Seguimiento vencido" : "Seguimiento hoy";
  const followUpIndicatorClass =
    followUpIndicator === "overdue" ? "bg-[color:var(--danger)]" : "bg-[color:var(--warning)]";

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
          <div className="flex flex-col gap-1 min-w-0 w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`truncate ${nameTint}`}>{contactName}</span>
              {followUpIndicator && (
                <span
                  className={`inline-block h-2 w-2 rounded-full ${followUpIndicatorClass}`}
                  aria-label={followUpIndicatorLabel}
                  title={followUpIndicatorLabel}
                />
              )}
              {shouldShowTierLabel && (
                <Badge tone={tierBadgeTone} size="sm">
                  {tierLabel}
                </Badge>
              )}
              {languageBadgeLabel && (
                <Badge tone={badgeToneForLabel(languageBadgeLabel)} size="sm">
                  {languageBadgeLabel}
                </Badge>
              )}
              {adultBadgeLabel && (
                <Badge tone={adultBadgeTone} size="sm">
                  {adultBadgeLabel}
                </Badge>
              )}
              {temperatureLabel && (
                <Badge tone={temperatureTone} size="sm" title="Temperatura">
                  Temp {temperatureLabel}
                </Badge>
              )}
            </div>
            <div
              className={`flex flex-col gap-1 min-w-0 ${isCompact ? "text-[11px]" : "text-xs"} text-[color:var(--muted)]`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isTyping ? (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="truncate">Escribiendo</span>
                    <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                      <span
                        className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--muted)]"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--muted)]"
                        style={{ animationDelay: "140ms" }}
                      />
                      <span
                        className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--muted)]"
                        style={{ animationDelay: "280ms" }}
                      />
                    </span>
                  </span>
                ) : shouldShowNextAction ? (
                  <span className="truncate min-w-0">Siguiente: {nextActionLabel}</span>
                ) : (
                  <span className="truncate min-w-0 opacity-60">Siguiente: —</span>
                )}
                {showRelativeTime && (
                  <>
                    <span
                      className={`w-1 h-1 rounded-full shrink-0 ${
                        hasUnreadInbound ? "bg-[color:var(--text)]" : "bg-[color:var(--muted)]"
                      }`}
                    />
                    <span className="shrink-0">{relativeTimeLabel}</span>
                  </>
                )}
                {unreadBadgeLabel ? (
                  <Badge tone="accent" size="sm" className="shrink-0">
                    {unreadBadgeLabel}
                  </Badge>
                ) : null}
              </div>
              {isTyping && typingDraftPreview ? (
                <div className={`truncate ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
                  <span className="font-semibold">Borrador:</span> {typingDraftPreview}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <ConversationActionsMenu
              conversation={data}
              variant="row"
              onToggleHighPriority={onToggleHighPriority}
              onCopyInvite={onCopyInvite}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function formatRelativeTimeShort(value?: string | null): string {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp;
  if (!Number.isFinite(diffMs)) return "";
  if (diffMs < 0) return "hace 1 min";
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return "hace 1 min";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} d`;
}
