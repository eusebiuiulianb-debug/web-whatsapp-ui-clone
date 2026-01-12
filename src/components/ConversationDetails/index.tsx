import {
  type CSSProperties,
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type TouchEventHandler,
  type UIEventHandler,
  type WheelEventHandler,
} from "react";
import { createPortal } from "react-dom";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import MessageBalloon from "../MessageBalloon";
import { EmojiPicker } from "../EmojiPicker";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { Message as ApiMessage, Fan, FanFollowUp } from "../../types/chat";
import { Message as ConversationMessage, ConversationListData } from "../../types/Conversation";
import { getAccessLabel, getAccessState, getAccessSummary } from "../../lib/access";
import { FollowUpTag, getFollowUpTag, getUrgencyLevel } from "../../utils/followUp";
import { PACKS } from "../../config/packs";
import { ChatComposerBar } from "../ChatComposerBar";
import { getFanDisplayNameForCreator } from "../../utils/fanDisplayName";
import { ContentItem, getContentTypeLabel, getContentVisibilityLabel } from "../../types/content";
import type { Offer, OfferTier } from "../../types/offers";
import { getTimeOfDayTag } from "../../utils/contentTags";
import {
  emitCreatorDataChanged,
  emitExtrasUpdated,
  emitFanMessageSent,
  emitPurchaseCreated,
  emitPurchaseSeen,
  type FanMessageSentPayload,
} from "../../lib/events";
import { publishChatEvent } from "../../lib/chatEvents";
import { useCreatorRealtime } from "../../hooks/useCreatorRealtime";
import { recordDevRequest } from "../../lib/devRequestStats";
import { fetchJsonDedupe } from "../../lib/fetchDedupe";
import { VoiceInsightsCard } from "../VoiceInsightsCard";
import {
  mergeVoiceInsightsJson,
  safeParseVoiceAnalysis,
  safeParseVoiceTranslation,
  type VoiceAnalysis,
  type VoiceTranslation,
} from "../../types/voiceAnalysis";
import { AiTone, normalizeTone, ACTION_TYPE_FOR_USAGE } from "../../lib/aiQuickExtra";
import { AiTemplateUsage, AiTurnMode } from "../../lib/aiTemplateTypes";
import { normalizeAiTurnMode } from "../../lib/aiSettings";
import { getAccessSnapshot, getChatterProPlan } from "../../lib/chatPlaybook";
import {
  AGENCY_INTENSITIES,
  AGENCY_PLAYBOOKS,
  AGENCY_STAGES,
  type AgencyIntensity,
  type AgencyPlaybook,
  type AgencyStage,
} from "../../lib/agency/types";
import {
  BUILT_IN_OBJECTIVES,
  isBuiltInObjectiveCode,
  normalizeObjectiveCode,
  resolveObjectiveLabel,
  slugifyObjectiveCode,
  type ObjectiveLabels,
} from "../../lib/agency/objectives";
import { sanitizeAgencyMarketingText, scoreDraft, type DraftQaResult } from "../../lib/agency/drafts";
import { getAutoAdvanceStage } from "../../lib/agency/autoAdvance";
import FanManagerDrawer from "../fan/FanManagerDrawer";
import type { FanManagerSummary } from "../../server/manager/managerService";
import { deriveFanManagerState, getDefaultFanTone } from "../../lib/fanManagerState";
import { getManagerPromptTemplate } from "../../lib/managerPrompts";
import { getAutopilotDraft } from "../../lib/managerAutopilot";
import type { ManagerObjective as AutopilotObjective } from "../../lib/managerAutopilot";
import type { FanManagerStateAnalysis } from "../../lib/fanManagerState";
import type { FanTone, ManagerObjective } from "../../types/manager";
import { track } from "../../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { deriveAudience, isVisibleToFan, normalizeFrom } from "../../lib/messageAudience";
import { getNearDuplicateSimilarity } from "../../lib/text/isNearDuplicate";
import { getStickerById, type StickerItem as LegacyStickerItem } from "../../lib/emoji/stickers";
import { readEmojiRecents, recordEmojiRecent } from "../../lib/emoji/recents";
import { buildStickerToken, getStickerByToken, type StickerItem as PickerStickerItem } from "../../lib/stickers";
import { applyOptimisticReaction, getMineEmoji } from "../../lib/messageReactions";
import { useEmojiFavorites } from "../../hooks/useEmojiFavorites";
import { computeFanTotals } from "../../lib/fanTotals";
import { generateClientTxnId } from "../../lib/clientTxn";
import { useVoiceRecorder } from "../../lib/useVoiceRecorder";
import { formatPurchaseUI } from "../../lib/purchaseUi";
import { formatNextActionLabel, formatWhen, isGenericNextActionNote } from "../../lib/nextActionLabel";
import {
  buildCatalogPitch,
  formatCatalogIncludesSummary,
  formatCatalogPriceCents,
  type CatalogItem,
} from "../../lib/catalog";
import {
  DB_SCHEMA_OUT_OF_SYNC_FIX,
  DB_SCHEMA_OUT_OF_SYNC_MESSAGE,
  isDbSchemaOutOfSyncPayload,
  type DbSchemaOutOfSyncPayload,
} from "../../lib/dbSchemaGuard";
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  UI_LOCALES,
  UI_LOCALE_LABELS,
  getTranslationLanguageName,
  normalizeLocale,
  normalizeLocaleTag,
  normalizePreferredLanguage,
  normalizeTranslationLanguage,
  normalizeUiLocale,
  type SupportedLanguage,
  type TranslationLanguage,
} from "../../lib/language";
import clsx from "clsx";
import { useRouter } from "next/router";
import { useIsomorphicLayoutEffect } from "../../hooks/useIsomorphicLayoutEffect";
import Image from "next/image";
import { IconGlyph, type IconName } from "../ui/IconGlyph";
import { consumePendingPurchaseNotice, consumeUnseenPurchase } from "../../lib/unseenPurchases";
import { consumePendingManagerTranscript } from "../../lib/pendingManagerTranscript";
import type { PurchaseCreatedPayload } from "../../lib/events";
import { resolvePurchaseEventId } from "../../lib/purchaseEventDedupe";
import { Badge, type BadgeTone } from "../ui/Badge";
import { ConversationActionsMenu } from "../conversations/ConversationActionsMenu";
import { ContextMenu } from "../ui/ContextMenu";
import { badgeToneForLabel } from "../../lib/badgeTone";
import {
  COMPOSER_DRAFT_EVENT,
  appendDraftText,
  consumeDraft,
  getFanIdFromQuery,
  insertIntoCurrentComposer,
  openCortexAndPrefill,
  openFanChat,
  openFanChatAndPrefill,
} from "../../lib/navigation/openCreatorChat";
import {
  clearCortexFlow,
  getNextFanFromFlow,
  readCortexFlow,
  writeCortexFlow,
  type CortexFlowState,
} from "../../lib/cortexFlow";

type ManagerQuickIntent = ManagerObjective;
type ManagerSuggestionIntent = "romper_hielo" | "pregunta_simple" | "cierre_suave" | "upsell_mensual_suave";
type SuggestionVariantMode = "alternate" | "shorter";
type DraftVariantMode = "alternate" | "shorter" | "softer" | "bolder";
type DraftLength = "short" | "medium" | "long";
type ManagerIaMode = "simple" | "advanced";
type DraftDirectness = "suave" | "neutro" | "directo";
type PpvPhase = "suave" | "picante" | "directo" | "final";
type DraftActionState = { status: "idle" | "loading"; key: string | null };
type DraftRequestOptions = {
  objectiveKey: string;
  tone?: FanTone | null;
  directness?: DraftDirectness;
  outputLength?: DraftLength;
  variationOf?: string | null;
  actionKey: string;
};
type DraftSource = "reformular" | "citar" | "autosuggest";
type PpvOffer = {
  contentId?: string;
  title?: string;
  tier?: string | null;
  dayPart?: string | null;
  slot?: string | null;
  priceCents?: number;
  currency?: string;
};
type ObjectiveOption = {
  id: string;
  code: string;
  labels: ObjectiveLabels;
  active: boolean;
};
type DraftCard = {
  id: string;
  text: string;
  label: string;
  source: DraftSource;
  createdAt: string;
  tone?: FanTone | null;
  objective?: ManagerObjective | null;
  meta?: DraftMeta | null;
  selectedText?: string | null;
  basePrompt?: string | null;
  offer?: PpvOffer | null;
};
type DraftMeta = {
  stageLabel: string;
  objectiveLabel: string;
  intensityLabel: string;
  styleLabel: string;
  toneLabel: string;
  lengthLabel: string;
  primaryActionLabel?: string | null;
  ppvPhaseLabel?: string | null;
};
type FanTemplateTone = "suave" | "intimo" | "picante" | "any";
type FanTemplateCategory = "greeting" | "question" | "closing";
type FanTemplateItem = {
  id: string;
  title: string;
  text: string;
  tone?: FanTemplateTone;
};
type FanTemplatePools = Record<FanTemplateCategory, FanTemplateItem[]>;
type FanTemplateSelection = Record<FanTemplateCategory, string | null>;
type PlaybookMoment = "DAY" | "NIGHT" | "ANY";
type PlaybookTier = "T0" | "T1" | "T2" | "T3" | null;
type PlaybookObjective =
  | "romper_hielo"
  | "calentar"
  | "ofrecer_extra"
  | "subir_nivel"
  | "cerrar_extra"
  | "reactivar"
  | "renovar";
type Playbook = {
  id: string;
  title: string;
  description: string;
  tier: PlaybookTier;
  moment: PlaybookMoment;
  objective: PlaybookObjective;
  tags: string[];
  messages: string[];
  recommended?: boolean;
};
type ComposerTarget = "fan" | "internal" | "manager";

type PurchaseNoticeState = {
  count: number;
  totalAmountCents: number;
  kind: string;
  title?: string;
  createdAt?: string;
  purchaseIds: string[];
  fanName?: string;
};
type MessageAudienceMode = "CREATOR" | "INTERNAL";
type InlineTab = "templates" | "tools" | "manager";
type InternalPanelTab = "manager" | "internal" | "note";
type InlineActionKind = "ok" | "info" | "warn";
type InlineAction = {
  id: string;
  kind: InlineActionKind;
  title: string;
  detail?: string;
  undoLabel?: string;
  onUndo?: () => void;
  ttlMs?: number;
};
type DuplicateConfirmState = {
  candidate: string;
  reason: "intent" | "hash" | "similarity";
  actionKey?: string | null;
  lastSentPreview?: string | null;
  lastSentAt?: number | null;
};

type ConversationDetailsProps = {
  onBackToBoard?: () => void;
};

const PACK_ESPECIAL_UPSELL_TEXT =
  "Veo que lo que estás pidiendo entra ya en el terreno de mi Pack especial: incluye todo lo de tu suscripción mensual + fotos y escenas extra más intensas. Si quieres subir de nivel, son 49 € y te lo dejo desbloqueado en este chat.";
const PACK_MONTHLY_UPSELL_TEXT =
  'Te propongo subir al siguiente nivel: la suscripción mensual. Incluye fotos, vídeos y guías extra para seguir trabajando en tu relación. Si te interesa, dime "MENSUAL" y te paso el enlace.';
const MANAGER_OBJECTIVE_TO_DRAFT_KEY: Record<ManagerObjective, string> = {
  bienvenida: "BREAK_ICE",
  romper_hielo: "BREAK_ICE",
  reactivar_fan_frio: "REENGAGE",
  ofrecer_extra: "UPSELL_EXTRA",
  llevar_a_mensual: "CONVERT_MONTHLY",
  renovacion: "RENEWAL",
};
const DUPLICATE_SIMILARITY_THRESHOLD = 0.88;
const DUPLICATE_STRICT_SIMILARITY = 0.93;
const DUPLICATE_RECENT_HOURS = 6;
const DUPLICATE_STRICT_HOURS = 24;
const DUPLICATE_ACTION_WINDOW_MS = 6 * 60 * 60 * 1000;
const DUPLICATE_BYPASS_WINDOW_MS = 5 * 60 * 1000;
const FAN_SEND_COOLDOWN_MS = 15000;
const LAST_SENT_STORAGE_PREFIX = "novsy:lastSent:";
const MANAGER_IA_MODE_STORAGE_KEY = "managerIaMode";
const VOICE_MAX_DURATION_MS = 120_000;
const VOICE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const VOICE_MIN_SIZE_BYTES = 2 * 1024;
const VOICE_MIME_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
];
const TOOLBAR_MARGIN = 12;
const TRANSLATION_POPOVER_MAX_WIDTH = 360;
const TRANSLATION_POPOVER_HEIGHT = 180;
type ChatPpvTierValue = "CHAT_T0" | "CHAT_T1" | "CHAT_T2" | "CHAT_T3";
const CHAT_PPV_TIERS: ChatPpvTierValue[] = ["CHAT_T0", "CHAT_T1", "CHAT_T2", "CHAT_T3"];
const CHAT_PPV_DEFAULT_COPY: Record<ChatPpvTierValue, string> = {
  CHAT_T0: "Uf… vas directo 😈. Lo más privado lo dejo para el privado. ¿Lo quieres suave o más picante?",
  CHAT_T1: "Te puedo mandar un primer privado ahora. ¿Te lo paso?",
  CHAT_T2: "El siguiente es más privado y mejor. ¿Lo desbloqueamos?",
  CHAT_T3: "Te hago uno premium ahora mismo (más exclusivo). ¿Te va?",
};
const EXTRA_SLOT_LABELS: Record<string, { phase: string; moment: string }> = {
  DAY_1: { phase: "Suave", moment: "Día" },
  DAY_2: { phase: "Picante", moment: "Día" },
  NIGHT_1: { phase: "Directo", moment: "Noche" },
  NIGHT_2: { phase: "Final", moment: "Noche" },
  ANY: { phase: "Cualquiera", moment: "" },
};
const formatExtraSlotLabel = (slot?: string | null, timeOfDay?: string | null) => {
  if (slot && EXTRA_SLOT_LABELS[slot]) {
    const meta = EXTRA_SLOT_LABELS[slot];
    return meta.moment ? `${meta.phase} · ${meta.moment}` : meta.phase;
  }
  if (timeOfDay === "DAY") return "Suave · Día";
  if (timeOfDay === "NIGHT") return "Directo · Noche";
  return "Cualquiera";
};
const formatDayPartLabel = (dayPart?: string | null) => {
  if (dayPart === "DAY") return "Día";
  if (dayPart === "NIGHT") return "Noche";
  if (dayPart === "ANY") return "Cualquiera";
  return null;
};

type VoiceUploadPayload = {
  blob: Blob;
  base64: string;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
};

type MessageTranslationResponse = {
  id: string;
  translatedText: string;
  targetLang: string;
  sourceKind: "text" | "voice_transcript";
  detectedSourceLang?: string | null;
  createdAt: string;
};

type MessageTranslationState = {
  status: "idle" | "loading" | "error";
  error?: string;
};

type MessageSuggestReplyState = {
  status: "idle" | "loading";
};

type MessageActionSheetState = {
  messageId?: string;
  text: string;
  canTranslate: boolean;
  canSuggestReply?: boolean;
  suggestTargetLang?: string;
};

const normalizeActionKey = (key?: string | null) => {
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  return trimmed ? trimmed : null;
};
const resolveChatTierLabel = (tier: ChatPpvTierValue) => tier.replace("CHAT_", "");
const resolveChatTierFromExtraTier = (tier?: string | null): ChatPpvTierValue | null => {
  if (tier === "T0" || tier === "T1" || tier === "T2" || tier === "T3") {
    return `CHAT_${tier}` as ChatPpvTierValue;
  }
  return null;
};
const resolveExtraTierFromChatTier = (tier?: ChatPpvTierValue | null): "T0" | "T1" | "T2" | "T3" | null => {
  if (!tier) return null;
  return tier.replace("CHAT_", "") as "T0" | "T1" | "T2" | "T3";
};
const formatOfferLabel = (offer?: PpvOffer | null) => {
  if (!offer) return null;
  const tier = offer.tier ?? "T?";
  const dayPartLabel = formatDayPartLabel(offer.dayPart ?? null);
  const slotLabel = dayPartLabel ?? formatExtraSlotLabel(offer.slot, null);
  return `Oferta: ${tier} · ${slotLabel}`;
};

const formatTranslationLang = (value: string | null | undefined, fallback: string) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return fallback;
  const upper = trimmed.toUpperCase();
  if (upper === "AUTO" || upper === "UN" || upper === "?") return fallback;
  return upper;
};

const normalizeDetectedLang = (value: string | null | undefined) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "auto" || trimmed === "un" || trimmed === "?") return null;
  return trimmed.split(/[-_]/)[0] || null;
};

const buildManagerTranslationPayload = (
  sourceLabel: string,
  targetLabel: string,
  originalText: string,
  translatedText: string,
  isSourceUnknown: boolean
) => {
  const cleanOriginal = originalText.trim();
  const cleanTranslated = translatedText.trim();
  const instruction = isSourceUnknown
    ? "Responde en el mismo idioma del mensaje original. Devuelve SOLO el texto final."
    : `Responde al fan en el idioma detectado (${sourceLabel}). Devuelve SOLO el texto final.`;
  return (
    `Original (${sourceLabel}): ${cleanOriginal}\n\n` +
    `Traducción (${targetLabel}): ${cleanTranslated}\n\n` +
    `Idioma detectado: ${sourceLabel}\n` +
    `Instrucción: ${instruction}`
  );
};

const isTranslateNotConfiguredError = (err: unknown) => {
  if (!err || typeof err !== "object") return false;
  return "code" in err && (err as { code?: string }).code === "TRANSLATE_NOT_CONFIGURED";
};

const normalizeTextForHash = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

const hashText = (text: string) => {
  const normalized = normalizeTextForHash(text);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const readLastSentRecord = (fanId: string) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${LAST_SENT_STORAGE_PREFIX}${fanId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      actionKey?: string | null;
      textHash?: string;
      sentAt?: number;
      preview?: string;
    };
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.textHash || typeof parsed.sentAt !== "number") return null;
    return {
      actionKey: normalizeActionKey(parsed.actionKey),
      textHash: parsed.textHash,
      sentAt: parsed.sentAt,
      preview: typeof parsed.preview === "string" ? parsed.preview : "",
    };
  } catch (_err) {
    return null;
  }
};

const writeLastSentRecord = (
  fanId: string,
  record: { actionKey?: string | null; textHash: string; sentAt: number; preview: string }
) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${LAST_SENT_STORAGE_PREFIX}${fanId}`, JSON.stringify(record));
  } catch (_err) {
    // ignore storage errors
  }
};

const CONTENT_PACKS = [
  { code: "WELCOME" as const, label: "Pack bienvenida" },
  { code: "MONTHLY" as const, label: "Suscripción mensual" },
  { code: "SPECIAL" as const, label: "Pack especial pareja" },
] as const;
const FAN_TEMPLATE_CATEGORIES: { id: FanTemplateCategory; label: string }[] = [
  { id: "greeting", label: "Saludo corto" },
  { id: "question", label: "Pregunta simple" },
  { id: "closing", label: "Cierre suave" },
];
const FAN_TEMPLATE_CATEGORY_LABELS: Record<FanTemplateCategory, string> = {
  greeting: "Saludo corto",
  question: "Pregunta simple",
  closing: "Cierre suave",
};
const EMPTY_DRAFTS: DraftCard[] = [];
const LOCAL_FAN_TEMPLATE_POOLS: FanTemplatePools = {
  greeting: [
    { id: "greet-suave-1", title: "Saludo corto", text: "Hola, ¿cómo estás?", tone: "suave" },
    { id: "greet-suave-2", title: "Saludo cálido", text: "Hola, ¿qué tal va tu día?", tone: "suave" },
    { id: "greet-suave-3", title: "Saludo amable", text: "Hola, me alegra verte por aquí.", tone: "suave" },
    { id: "greet-intimo-1", title: "Saludo íntimo", text: "Hola, tenía ganas de leerte. ¿Cómo estás?", tone: "intimo" },
    { id: "greet-intimo-2", title: "Saludo cercano", text: "Ey, qué gusto verte. ¿Cómo te sientes hoy?", tone: "intimo" },
    { id: "greet-intimo-3", title: "Saludo suave", text: "Hola, aquí contigo. ¿Qué te apetece?", tone: "intimo" },
    { id: "greet-picante-1", title: "Saludo con chispa", text: "Hey, ¿vienes con ganas hoy? 😏", tone: "picante" },
    { id: "greet-picante-2", title: "Saludo juguetón", text: "Hola, ¿te apetece jugar un poco? 😉", tone: "picante" },
    { id: "greet-picante-3", title: "Saludo picante", text: "Ey, ¿hoy suave o con chispa? 🔥", tone: "picante" },
    { id: "greet-any-1", title: "Saludo simple", text: "Hola, ¿qué tal vas?", tone: "any" },
  ],
  question: [
    { id: "question-suave-1", title: "Pregunta simple", text: "¿Te apetece algo corto o prefieres algo más completo?", tone: "suave" },
    { id: "question-suave-2", title: "Pregunta suave", text: "¿Prefieres algo suave o un poco más directo hoy?", tone: "suave" },
    { id: "question-suave-3", title: "Pregunta abierta", text: "¿Qué te gustaría recibir ahora mismo?", tone: "suave" },
    { id: "question-intimo-1", title: "Pregunta íntima", text: "¿Qué te haría sentir mejor ahora?", tone: "intimo" },
    { id: "question-intimo-2", title: "Pregunta cercana", text: "¿Te apetece algo más íntimo o más ligero hoy?", tone: "intimo" },
    { id: "question-intimo-3", title: "Pregunta lenta", text: "¿Quieres que vaya despacio o te apetece algo más intenso?", tone: "intimo" },
    { id: "question-picante-1", title: "Pregunta atrevida", text: "¿Te va un toque más atrevido hoy? 😈", tone: "picante" },
    { id: "question-picante-2", title: "Pregunta con chispa", text: "¿Quieres algo con más chispa o lo hacemos suave?", tone: "picante" },
    { id: "question-picante-3", title: "Pregunta directa", text: "¿Te apetece que suba un poco el tono? 🔥", tone: "picante" },
    { id: "question-any-1", title: "Pregunta rápida", text: "¿Quieres una idea rápida o prefieres contarme qué te apetece?", tone: "any" },
  ],
  closing: [
    { id: "close-suave-1", title: "Cierre suave", text: "Cuando quieras seguimos, estoy aquí.", tone: "suave" },
    { id: "close-suave-2", title: "Cierre tranquilo", text: "Lo dejamos por hoy. Escríbeme cuando te apetezca.", tone: "suave" },
    { id: "close-suave-3", title: "Cierre corto", text: "Te leo cuando quieras, sin prisa.", tone: "suave" },
    { id: "close-intimo-1", title: "Cierre íntimo", text: "Me quedo cerquita; cuando quieras retomamos.", tone: "intimo" },
    { id: "close-intimo-2", title: "Cierre cercano", text: "Aquí contigo. Si te apetece, seguimos luego.", tone: "intimo" },
    { id: "close-intimo-3", title: "Cierre cálido", text: "Lo dejamos suave por hoy. Cuando quieras, estoy.", tone: "intimo" },
    { id: "close-picante-1", title: "Cierre con ganas", text: "Te dejo con ganas 😏 Avísame y seguimos.", tone: "picante" },
    { id: "close-picante-2", title: "Cierre juguetón", text: "Lo paramos aquí y luego seguimos jugando 😉", tone: "picante" },
    { id: "close-picante-3", title: "Cierre picante", text: "Te quedo debiendo más... cuando quieras, seguimos 🔥", tone: "picante" },
    { id: "close-any-1", title: "Cierre simple", text: "Estoy aquí cuando quieras.", tone: "any" },
  ],
};

const PLAYBOOK_OBJECTIVE_LABELS: Record<PlaybookObjective, string> = {
  romper_hielo: "Romper hielo",
  calentar: "Calentar",
  ofrecer_extra: "Ofrecer extra",
  subir_nivel: "Subir nivel",
  cerrar_extra: "Cerrar extra",
  reactivar: "Reactivar",
  renovar: "Renovar",
};

const PLAYBOOK_MOMENT_LABELS: Record<PlaybookMoment, string> = {
  DAY: "Día",
  NIGHT: "Noche",
  ANY: "Cualquiera",
};

const AGENCY_INTENSITY_LABELS: Record<AgencyIntensity, string> = {
  SOFT: "Soft",
  MEDIUM: "Medium",
  INTENSE: "Intense",
};

const AGENCY_PLAYBOOK_LABELS: Record<AgencyPlaybook, string> = {
  GIRLFRIEND: "Novia cercana",
  PLAYFUL: "Juguetona",
  ELEGANT: "Elegante",
  SOFT_DOMINANT: "Dominante sutil",
};

function formatAgencyStageLabel(value: AgencyStage) {
  return value.replace(/_/g, " ");
}

const OFFER_TIER_LABELS: Record<OfferTier, string> = {
  MICRO: "Micro",
  STANDARD: "Standard",
  PREMIUM: "Premium",
  MONTHLY: "Monthly",
};

const OFFER_INTENSITY_RANK: Record<AgencyIntensity, number> = {
  SOFT: 0,
  MEDIUM: 1,
  INTENSE: 2,
};

const REENGAGE_TOUCHES: Array<{ key: string; label: string; minHours: number; intensity: AgencyIntensity }> = [
  { key: "touch1", label: "Toque 1", minHours: 12, intensity: "SOFT" },
  { key: "touch2", label: "Toque 2", minHours: 48, intensity: "MEDIUM" },
  { key: "touch3", label: "Toque 3", minHours: 120, intensity: "INTENSE" },
];

const LOCAL_PLAYBOOKS: Playbook[] = [
  {
    id: "pb-bienvenida-suave",
    title: "Bienvenida suave",
    description: "Abrir con saludo corto y una pregunta simple.",
    tier: "T0",
    moment: "DAY",
    objective: "romper_hielo",
    tags: ["saludo", "warmup", "suave"],
    messages: [
      "Hola {nombre_fan}, ¿cómo estás?",
      "Hola, ¿qué tal va tu día?",
      "Hola, me alegra verte por aquí. ¿Cómo estás?",
    ],
    recommended: true,
  },
  {
    id: "pb-calentar-curiosidad",
    title: "Calentar con curiosidad",
    description: "Subir temperatura sin presión y con opciones.",
    tier: "T1",
    moment: "DAY",
    objective: "calentar",
    tags: ["calentar", "suave", "pregunta"],
    messages: [
      "Hoy voy suave 😌. ¿Te apetece algo corto o algo más completo?",
      "Me gusta ir poco a poco. ¿Quieres algo suave o subimos un poco?",
      "Cuéntame qué te apetece y te preparo algo a tu ritmo.",
    ],
    recommended: true,
  },
  {
    id: "pb-extra-suave",
    title: "Extra suave",
    description: "Ofrecer un primer PPV suave.",
    tier: "T1",
    moment: "DAY",
    objective: "ofrecer_extra",
    tags: ["extra", "ppv", "suave"],
    messages: [
      "Te puedo mandar un extra suave ahora mismo. ¿Te lo paso?",
      "Si te apetece, te preparo un extra suave y lo tienes al instante. ¿Te va?",
      "Tengo un extra suave listo. ¿Lo quieres ahora?",
    ],
    recommended: true,
  },
  {
    id: "pb-directo-noche",
    title: "Directo de noche",
    description: "Subir intensidad con un PPV nocturno.",
    tier: "T2",
    moment: "NIGHT",
    objective: "subir_nivel",
    tags: ["directo", "noche", "ppv"],
    messages: [
      "Esta noche me apetece subir un poco 😏. ¿Te hago un extra Directo?",
      "Si quieres algo más intenso, te preparo un Directo en PPV. ¿Te lo envío?",
      "Podemos subir a Directo esta noche. ¿Te apetece?",
    ],
    recommended: true,
  },
  {
    id: "pb-final-premium",
    title: "Final premium",
    description: "Cerrar con un extra premium de alto valor.",
    tier: "T3",
    moment: "NIGHT",
    objective: "cerrar_extra",
    tags: ["premium", "final", "ppv"],
    messages: [
      "Te hago un extra Final premium ahora mismo 😈. ¿Lo quieres?",
      "Si quieres lo más exclusivo, te preparo un Final premium. ¿Te va?",
      "Tengo un Final premium listo para ti. ¿Te lo mando?",
    ],
    recommended: true,
  },
  {
    id: "pb-reactivar-suave",
    title: "Reactivar sin presión",
    description: "Reenganche corto para fans fríos.",
    tier: "T0",
    moment: "ANY",
    objective: "reactivar",
    tags: ["reactivar", "suave"],
    messages: [
      "Hace tiempo que no hablamos. ¿Qué tal vas?",
      "Me acordé de ti. ¿Te apetece retomar por aquí?",
      "Cuando quieras retomamos. ¿Cómo te va?",
    ],
  },
  {
    id: "pb-renovacion-suave",
    title: "Renovación suave",
    description: "Renovar acceso sin presión.",
    tier: "T1",
    moment: "ANY",
    objective: "renovar",
    tags: ["renovar", "suscripcion"],
    messages: [
      "Si te apetece seguir, puedo renovarte el acceso y seguir cuidándote por aquí. ¿Quieres?",
      "Te puedo renovar para que sigamos a gusto. ¿Te va?",
      "Si quieres, te preparo la renovación y seguimos.",
    ],
  },
  {
    id: "pb-pack-especial",
    title: "Pack especial suave",
    description: "Presentar el pack especial sin presión.",
    tier: "T2",
    moment: "ANY",
    objective: "subir_nivel",
    tags: ["pack", "upsell"],
    messages: [
      "Si quieres algo más completo, puedo prepararte un Pack especial. ¿Te interesa?",
      "Si te va subir de nivel, te cuento el Pack especial. ¿Lo vemos?",
      "Te puedo ofrecer el Pack especial cuando quieras. ¿Te apetece?",
    ],
  },
  {
    id: "pb-cierre-suave",
    title: "Cierre con pregunta",
    description: "Cerrar suave dejando la puerta abierta.",
    tier: "T1",
    moment: "ANY",
    objective: "cerrar_extra",
    tags: ["cierre", "suave"],
    messages: [
      "Lo dejamos suave por ahora. ¿Quieres que te prepare algo más luego?",
      "Cuando quieras sigo contigo. ¿Te apetece que te prepare un extra?",
      "Me dices si quieres que te sorprenda luego.",
    ],
  },
];

type ApiAiTemplate = {
  id?: string;
  name?: string;
  category?: string;
  tone?: string | null;
  tier?: string | null;
  content?: string;
  isActive?: boolean;
};

const AI_TEMPLATE_CATEGORY_MAP: Record<string, FanTemplateCategory> = {
  welcome: "greeting",
  warmup: "question",
  followup: "closing",
};

const mapAiTemplateTone = (tone?: string | null): FanTemplateTone => {
  const normalized = (tone ?? "").toLowerCase();
  if (normalized === "cercano") return "suave";
  if (normalized === "jugueton") return "picante";
  if (normalized === "profesional") return "any";
  return "any";
};

const isSafeFanTemplateContent = (content: string) => {
  const matches = content.match(/\{[^}]+\}/g);
  if (!matches) return true;
  return matches.every((token) => {
    const normalized = token.toLowerCase();
    return normalized === "{nombre_fan}" || normalized === "{nombre}";
  });
};

const mergeFanTemplateLists = (primary: FanTemplateItem[], fallback: FanTemplateItem[]) => {
  const seen = new Set<string>();
  const merged: FanTemplateItem[] = [];
  const pushUnique = (item: FanTemplateItem) => {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };
  primary.forEach(pushUnique);
  fallback.forEach(pushUnique);
  return merged;
};

const buildFanTemplatePoolsFromApi = (
  templates: ApiAiTemplate[] | null | undefined,
  fallback: FanTemplatePools
): FanTemplatePools => {
  const pools: FanTemplatePools = { greeting: [], question: [], closing: [] };
  if (!Array.isArray(templates)) return fallback;
  templates.forEach((tpl, index) => {
    if (!tpl || tpl.isActive === false) return;
    const category = AI_TEMPLATE_CATEGORY_MAP[tpl.category ?? ""];
    if (!category) return;
    const text = typeof tpl.content === "string" ? tpl.content.trim() : "";
    if (!text || !isSafeFanTemplateContent(text)) return;
    const title = typeof tpl.name === "string" && tpl.name.trim()
      ? tpl.name.trim()
      : FAN_TEMPLATE_CATEGORY_LABELS[category];
    pools[category].push({
      id: `api-${tpl.id ?? `${category}-${index}`}`,
      title,
      text,
      tone: mapAiTemplateTone(tpl.tone),
    });
  });
  return {
    greeting: mergeFanTemplateLists(pools.greeting, fallback.greeting),
    question: mergeFanTemplateLists(pools.question, fallback.question),
    closing: mergeFanTemplateLists(pools.closing, fallback.closing),
  };
};

const API_PLAYBOOK_OBJECTIVE_MAP: Record<string, PlaybookObjective> = {
  welcome: "romper_hielo",
  warmup: "calentar",
  followup: "cerrar_extra",
  extra_quick: "ofrecer_extra",
  pack_offer: "subir_nivel",
  renewal: "renovar",
  reactivation: "reactivar",
  boundaries: "cerrar_extra",
  support: "calentar",
};

const resolvePlaybookObjective = (category?: string | null): PlaybookObjective => {
  const normalized = typeof category === "string" ? category.trim().toLowerCase() : "";
  return API_PLAYBOOK_OBJECTIVE_MAP[normalized] ?? "calentar";
};

const resolveApiPlaybookTier = (tier?: string | null): PlaybookTier => {
  const normalized = typeof tier === "string" ? tier.trim().toUpperCase() : "";
  if (normalized === "T0" || normalized === "T1" || normalized === "T2" || normalized === "T3") {
    return normalized as PlaybookTier;
  }
  return null;
};

const buildPlaybooksFromApi = (templates: ApiAiTemplate[] | null | undefined): Playbook[] => {
  if (!Array.isArray(templates)) return [];
  return templates
    .filter((tpl) => tpl && tpl.isActive !== false)
    .map((tpl, index) => {
      const content = typeof tpl.content === "string" ? tpl.content.trim() : "";
      if (!content) return null;
      const objective = resolvePlaybookObjective(tpl.category);
      const title = typeof tpl.name === "string" && tpl.name.trim() ? tpl.name.trim() : "Guion personalizado";
      const categoryTag = typeof tpl.category === "string" ? tpl.category.trim().toLowerCase() : "";
      const toneTag = typeof tpl.tone === "string" ? tpl.tone.trim().toLowerCase() : "";
      const tier = resolveApiPlaybookTier(tpl.tier ?? null);
      const tags = [categoryTag, toneTag, tier ? tier.toLowerCase() : ""].filter(Boolean);
      return {
        id: `api-${tpl.id ?? `template-${index}`}`,
        title,
        description: `Guion personalizado para ${PLAYBOOK_OBJECTIVE_LABELS[objective]}.`,
        tier,
        moment: "ANY",
        objective,
        tags,
        messages: [content],
      } as Playbook;
    })
    .filter((playbook): playbook is Playbook => Boolean(playbook));
};

type InlinePanelShellProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  containerClassName?: string;
  containerRef?: Ref<HTMLDivElement>;
  headerSlot?: ReactNode;
  stickyHeader?: boolean;
  bodyRef?: Ref<HTMLDivElement>;
  bodyClassName?: string;
  bodyScrollClassName?: string;
  onBodyScroll?: UIEventHandler<HTMLDivElement>;
  onBodyWheel?: WheelEventHandler<HTMLDivElement>;
  onBodyTouchMove?: TouchEventHandler<HTMLDivElement>;
  scrollable?: boolean;
  footer?: ReactNode;
};

function InlinePanelShell({
  title,
  children,
  onClose,
  containerClassName,
  containerRef,
  headerSlot,
  stickyHeader = false,
  bodyRef,
  bodyClassName,
  bodyScrollClassName,
  onBodyScroll,
  onBodyWheel,
  onBodyTouchMove,
  scrollable = true,
  footer,
}: InlinePanelShellProps) {
  const scrollClassName =
    bodyScrollClassName ??
    (scrollable
      ? "min-h-0 max-h-[45vh] overflow-y-auto overscroll-contain space-y-3"
      : "overflow-hidden");
  return (
    <div
      ref={containerRef}
      className={clsx(
        "w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] backdrop-blur-xl shadow-[0_12px_30px_rgba(0,0,0,0.2)] ring-1 ring-[color:var(--surface-ring)]",
        containerClassName
      )}
    >
      <div
        className={clsx(
          "shrink-0 border-b border-[color:var(--surface-border)]",
          stickyHeader && "dockOverlayHeader backdrop-blur"
        )}
      >
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[11px] font-semibold text-[color:var(--muted)]">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--muted)] transition hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            aria-label="Cerrar panel"
          >
            ✕
          </button>
        </div>
        {headerSlot && <div className="px-4 pb-3">{headerSlot}</div>}
      </div>
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        onWheelCapture={onBodyWheel}
        onTouchMoveCapture={onBodyTouchMove}
        className={clsx(
          "px-4 py-3 text-[12px] text-[color:var(--text)]",
          scrollClassName,
          bodyClassName
        )}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

type ComposerChipsRowProps = {
  children: ReactNode;
};

const ComposerChipsRow = forwardRef<HTMLDivElement, ComposerChipsRowProps>(({ children }, ref) => (
  <div
    ref={ref}
    className={clsx(
      "mt-1.5 flex w-full flex-wrap items-center gap-2 pb-1.5",
      "[-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden"
    )}
  >
    {children}
  </div>
));

ComposerChipsRow.displayName = "ComposerChipsRow";

type InlinePanelContainerProps = {
  children: ReactNode;
  isOpen: boolean;
  panelId?: string;
  bottomOffset?: number;
  openMaxHeightClassName?: string;
  isOverlay?: boolean;
  onBackdropPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
};

function InlinePanelContainer({
  children,
  isOpen,
  panelId,
  bottomOffset,
  openMaxHeightClassName,
  isOverlay = false,
  onBackdropPointerDown,
}: InlinePanelContainerProps) {
  const openMaxHeight = openMaxHeightClassName ?? "max-h-[55vh]";
  const openClassName = isOverlay
    ? "opacity-100 visible"
    : clsx("mt-3 opacity-100 translate-y-0 visible", openMaxHeight);
  const closedClassName = isOverlay
    ? "opacity-0 invisible pointer-events-none"
    : "mt-0 max-h-0 opacity-0 -translate-y-1 invisible pointer-events-none";
  const resolvedBottom = typeof bottomOffset === "number" ? bottomOffset : undefined;
  const containerStyle: CSSProperties = {
    willChange: "opacity, transform, max-height",
    bottom: resolvedBottom,
    marginBottom: !isOverlay && resolvedBottom ? resolvedBottom : undefined,
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isOverlay || !onBackdropPointerDown) return;
    onBackdropPointerDown(event);
  };
  return (
    <div
      id={panelId}
      className={clsx(
        "transition-all duration-200 ease-out overflow-hidden",
        isOverlay ? "absolute inset-0 z-50 pointer-events-none" : bottomOffset ? "sticky z-10" : null,
        isOpen ? openClassName : closedClassName
      )}
      style={containerStyle}
      onPointerDown={handlePointerDown}
      aria-hidden={!isOpen}
    >
      {children}
    </div>
  );
}

function reconcileMessages(
  existing: ConversationMessage[],
  incoming: ConversationMessage[],
  targetFanId?: string
): ConversationMessage[] {
  const filteredIncoming = targetFanId
    ? incoming.filter((msg) => msg.fanId === targetFanId)
    : incoming;
  const existingKeys = existing.map((msg, idx) => msg.id || `__idx-${idx}`);
  const map = new Map<string, ConversationMessage>();
  existing.forEach((msg, idx) => {
    const key = msg.id || `__idx-${idx}`;
    map.set(key, msg);
  });
  filteredIncoming.forEach((msg, idx) => {
    const key = msg.id || msg.time || `incoming-${idx}`;
    if (map.has(key)) {
      const prev = map.get(key)!;
      map.set(key, { ...prev, ...msg, status: msg.status || "sent" });
    } else {
      existingKeys.push(key);
      map.set(key, { ...msg, status: msg.status || "sent" });
    }
  });
  return existingKeys.map((key) => map.get(key)).filter(Boolean) as ConversationMessage[];
}

function reconcileApiMessages(existing: ApiMessage[], incoming: ApiMessage[], targetFanId?: string): ApiMessage[] {
  const filteredIncoming = targetFanId
    ? incoming.filter((msg) => msg.fanId === targetFanId)
    : incoming;
  const map = new Map<string, ApiMessage>();
  existing.forEach((msg) => map.set(msg.id, msg));
  filteredIncoming.forEach((msg) => {
    const prev = map.get(msg.id);
    map.set(msg.id, prev ? { ...prev, ...msg } : msg);
  });
  return Array.from(map.values()).sort((a, b) => {
    const at = a.id ? String(a.id) : "";
    const bt = b.id ? String(b.id) : "";
    if (at === bt) return 0;
    return at > bt ? 1 : -1;
  });
}

function getFirstName(name?: string | null) {
  if (!name) return "";
  const first = name.trim().split(" ")[0];
  return first;
}

function safeDecodeQueryParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeObjectiveName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getReengageTemplate(name: string) {
  const cleanName = name?.trim() || "";
  return `Hola ${cleanName || "allí"}, soy Eusebiu. Hoy termina tu acceso a este espacio privado. Si quieres que sigamos trabajando juntos en tu relación y tu vida sexual, puedo ofrecerte renovar la suscripción o prepararte un pack especial solo para ti. Si te interesa, dime “QUIERO SEGUIR” y lo vemos juntos.`;
}

export default function ConversationDetails({ onBackToBoard }: ConversationDetailsProps) {
  const {
    conversation,
    message: messages,
    setMessage,
    setConversation,
    activeQueueFilter,
    setActiveQueueFilter,
    queueFans,
    managerPanelOpen,
    managerPanelTab,
    openManagerPanel,
    closeManagerPanel,
  } = useContext(ConversationContext);
  const {
    contactName,
    image,
    membershipStatus,
    daysLeft,
    lastSeen,
    lastSeenAt,
    id,
    followUpTag: conversationFollowUpTag,
    lastCreatorMessageAt,
  } = conversation;
  const activeFanId = conversation?.isManager ? null : id ?? null;
  const [ messageSend, setMessageSend ] = useState("");
  const [ composerActionKey, setComposerActionKey ] = useState<string | null>(null);
  const [ pendingInsert, setPendingInsert ] = useState<{ text: string; detail?: string } | null>(null);
  const [ isSending, setIsSending ] = useState(false);
  const [ isInternalSending, setIsInternalSending ] = useState(false);
  const [ isManagerSending, setIsManagerSending ] = useState(false);
  const [ composerError, setComposerError ] = useState<string | null>(null);
  const [ composerTarget, setComposerTarget ] = useState<ComposerTarget>("fan");
  const [ showPackSelector, setShowPackSelector ] = useState(false);
  const [ isLoadingMessages, setIsLoadingMessages ] = useState(false);
  const [ messagesError, setMessagesError ] = useState("");
  const [ schemaError, setSchemaError ] = useState<DbSchemaOutOfSyncPayload | null>(null);
  const [ schemaCopyState, setSchemaCopyState ] = useState<"idle" | "copied" | "error">("idle");
  const [ grantLoadingType, setGrantLoadingType ] = useState<"trial" | "monthly" | "special" | null>(null);
  const [ selectedPackType, setSelectedPackType ] = useState<"trial" | "monthly" | "special">("monthly");
  const [ accessGrants, setAccessGrants ] = useState<
    { id: string; fanId: string; type: string; createdAt: string; expiresAt: string }[]
  >([]);
  const [ fanSendCooldownById, setFanSendCooldownById ] = useState<
    Record<string, { until: number; phase: "sent" | "cooldown" }>
  >({});
  const [ purchaseNotice, setPurchaseNotice ] = useState<PurchaseNoticeState | null>(null);
  const [ voiceNotice, setVoiceNotice ] = useState<{ fanName: string; durationMs?: number; createdAt: string } | null>(null);
  const [ internalToast, setInternalToast ] = useState<string | null>(null);
  const [ actionToast, setActionToast ] = useState<{ message: string; actionLabel: string; actionHref: string } | null>(
    null
  );
  const purchaseNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const purchaseNoticeShownAtRef = useRef(0);
  const purchaseNoticeFallbackNameRef = useRef("Fan");
  const internalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionInFlightRef = useRef<Set<string>>(new Set());
  const [ isVoiceUploading, setIsVoiceUploading ] = useState(false);
  const [ voiceUploadError, setVoiceUploadError ] = useState("");
  const [ voiceRetryPayload, setVoiceRetryPayload ] = useState<VoiceUploadPayload | null>(null);
  const {
    isRecording: isVoiceRecording,
    recordingMs: voiceRecordingMs,
    start: startVoiceRecorder,
    stop: stopVoiceRecorder,
    cancel: cancelVoiceRecorder,
    reset: resetVoiceRecorder,
  } = useVoiceRecorder({ mimePreferences: VOICE_MIME_PREFERENCES });
  const voiceObjectUrlsRef = useRef<Map<string, string>>(new Map());
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null);
  const messageEventIdsRef = useRef<Set<string>>(new Set());
  const lastSentMessageIdRef = useRef<string | null>(null);
  const lastSentMessageRef = useRef<ApiMessage | null>(null);
  const lastContentMessageIdRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatOverlayRef = useRef<HTMLDivElement | null>(null);

  const showPurchaseNotice = useCallback((payload: PurchaseNoticeState) => {
    setPurchaseNotice(payload);
    purchaseNoticeShownAtRef.current = Date.now();
    if (purchaseNoticeTimerRef.current) {
      clearTimeout(purchaseNoticeTimerRef.current);
    }
    purchaseNoticeTimerRef.current = setTimeout(() => setPurchaseNotice(null), 7000);
  }, []);

  const showVoiceNotice = useCallback((payload: { fanName: string; durationMs?: number; createdAt: string }) => {
    setVoiceNotice(payload);
    if (voiceNoticeTimerRef.current) {
      clearTimeout(voiceNoticeTimerRef.current);
    }
    voiceNoticeTimerRef.current = setTimeout(() => setVoiceNotice(null), 6500);
  }, []);

  useEffect(() => {
    purchaseNoticeFallbackNameRef.current = getFanDisplayNameForCreator(conversation) || contactName || "Fan";
  }, [conversation, contactName]);

  const dismissPurchaseNotice = useCallback(() => {
    if (purchaseNoticeTimerRef.current) {
      clearTimeout(purchaseNoticeTimerRef.current);
      purchaseNoticeTimerRef.current = null;
    }
    if (purchaseNotice) {
      setPurchaseNotice(null);
    }
  }, [purchaseNotice]);


  const previewVoiceBlob = useCallback((blob: Blob) => {
    if (typeof Audio === "undefined") return;
    if (voicePreviewRef.current) {
      voicePreviewRef.current.pause();
      voicePreviewRef.current = null;
    }
    const previewUrl = URL.createObjectURL(blob);
    const audio = new Audio(previewUrl);
    audio.preload = "metadata";
    voicePreviewRef.current = audio;
    const cleanup = () => {
      if (voicePreviewRef.current === audio) {
        voicePreviewRef.current = null;
      }
      URL.revokeObjectURL(previewUrl);
    };
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        console.warn("[voice-note] preview playback failed", err);
        cleanup();
      });
    }
  }, []);

  const formatRecordingLabel = (ms: number) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return formatAudioTime(seconds);
  };

  const handleSchemaOutOfSync = useCallback((payload: any) => {
    if (!isDbSchemaOutOfSyncPayload(payload)) return false;
    const fix = Array.isArray(payload.fix) && payload.fix.length > 0 ? payload.fix : [...DB_SCHEMA_OUT_OF_SYNC_FIX];
    const message =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : DB_SCHEMA_OUT_OF_SYNC_MESSAGE;
    setSchemaError({ errorCode: payload.errorCode, message, fix });
    setSchemaCopyState("idle");
    return true;
  }, [setSchemaCopyState, setSchemaError]);

  const mapApiMessagesToState = useCallback((apiMessages: ApiMessage[]): ConversationMessage[] => {
    const resolveLatestTranslation = (
      message: ApiMessage,
      sourceKind: "text" | "voice_transcript"
    ) => {
      const translations = Array.isArray(message.messageTranslations) ? message.messageTranslations : [];
      return translations.find((translation) => translation?.sourceKind === sourceKind) ?? null;
    };
    return apiMessages.map((msg) => {
      const isContent = msg.type === "CONTENT";
      const isLegacySticker = msg.type === "STICKER";
      const isAudio = msg.type === "AUDIO" || msg.type === "VOICE";
      const isSystem = msg.type === "SYSTEM";
      const tokenSticker = !isContent && !isLegacySticker ? getStickerByToken(msg.text ?? "") : null;
      const isSticker = isLegacySticker || Boolean(tokenSticker);
      const sticker = isLegacySticker ? getStickerById(msg.stickerId ?? null) : null;
      const stickerSrc = isLegacySticker ? sticker?.file ?? null : tokenSticker?.src ?? null;
      const stickerAlt = isLegacySticker ? sticker?.label ?? null : tokenSticker?.label ?? null;
      const textTranslation = resolveLatestTranslation(msg, "text");
      const voiceTranslation = resolveLatestTranslation(msg, "voice_transcript");
      return {
        id: msg.id,
        fanId: msg.fanId,
        me: isSystem ? false : msg.from === "creator",
        message: msg.text ?? "",
        translatedText: isSticker ? undefined : textTranslation?.translatedText ?? undefined,
        translationSourceLang: textTranslation?.detectedSourceLang ?? null,
        translationTargetLang: textTranslation?.targetLang ?? null,
        audience: deriveAudience(msg),
        seen: !!msg.isLastFromCreator,
        time: msg.time || "",
        createdAt: (msg as any)?.createdAt ?? undefined,
        status: "sent",
        kind: isSystem ? "system" : isContent ? "content" : isSticker ? "sticker" : isAudio ? "audio" : "text",
        type: msg.type,
        stickerId: isLegacySticker ? msg.stickerId ?? null : null,
        stickerSrc,
        stickerAlt,
        audioUrl: isAudio ? msg.audioUrl ?? null : null,
        audioDurationMs: isAudio ? msg.audioDurationMs ?? null : null,
        audioMime: isAudio ? msg.audioMime ?? null : null,
        audioSizeBytes: isAudio ? msg.audioSizeBytes ?? null : null,
        transcriptText: isAudio ? msg.transcriptText ?? null : null,
        transcriptStatus: isAudio ? msg.transcriptStatus ?? null : null,
        transcriptError: isAudio ? msg.transcriptError ?? null : null,
        transcribedAt: isAudio ? msg.transcribedAt ?? null : null,
        transcriptLang: isAudio ? msg.transcriptLang ?? null : null,
        intentJson: isAudio ? msg.intentJson ?? null : null,
        voiceAnalysisJson: isAudio ? msg.voiceAnalysisJson ?? null : null,
        voiceAnalysisUpdatedAt: isAudio ? msg.voiceAnalysisUpdatedAt ?? null : null,
        voiceTranslation: voiceTranslation?.translatedText
          ? {
              text: voiceTranslation.translatedText,
              targetLang: voiceTranslation.targetLang,
              sourceLang: voiceTranslation.detectedSourceLang ?? null,
              updatedAt: voiceTranslation.createdAt,
            }
          : safeParseVoiceTranslation(msg.voiceAnalysisJson),
        reactionsSummary: Array.isArray(msg.reactionsSummary) ? msg.reactionsSummary : [],
        contentItem: msg.contentItem
          ? {
              id: msg.contentItem.id,
              title: msg.contentItem.title,
              type: msg.contentItem.type,
              visibility: msg.contentItem.visibility,
              externalUrl: msg.contentItem.externalUrl,
            }
          : null,
      };
    });
  }, []);


  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight - el.clientHeight,
      behavior,
    });
  }, []);

  const showComposerToast = useCallback((message: string) => {
    setInternalToast(message);
    if (internalToastTimer.current) {
      clearTimeout(internalToastTimer.current);
    }
    internalToastTimer.current = setTimeout(() => {
      setInternalToast(null);
    }, 1800);
  }, []);

  const showActionToast = useCallback((message: string, actionLabel: string, actionHref: string) => {
    setActionToast({ message, actionLabel, actionHref });
    if (actionToastTimer.current) {
      clearTimeout(actionToastTimer.current);
    }
    actionToastTimer.current = setTimeout(() => {
      setActionToast(null);
    }, 3500);
  }, []);

  const handleReactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!messageId) return;
      if (reactionInFlightRef.current.has(messageId)) return;
      reactionInFlightRef.current.add(messageId);
      let previousSummary: ReturnType<typeof applyOptimisticReaction> | null = null;
      setMessage((prev) => {
        if (!prev) return prev;
        return prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          previousSummary = Array.isArray(msg.reactionsSummary) ? msg.reactionsSummary : [];
          return {
            ...msg,
            reactionsSummary: applyOptimisticReaction(previousSummary, emoji),
          };
        });
      });
      try {
        const res = await fetch("/api/messages/react", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
          body: JSON.stringify({ messageId, emoji }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !Array.isArray(data.reactionsSummary)) {
          throw new Error("No se pudo reaccionar");
        }
        setMessage((prev) => {
          if (!prev) return prev;
          return prev.map((msg) =>
            msg.id === messageId ? { ...msg, reactionsSummary: data.reactionsSummary } : msg
          );
        });
      } catch (_err) {
        if (previousSummary) {
          setMessage((prev) => {
            if (!prev) return prev;
            return prev.map((msg) =>
              msg.id === messageId ? { ...msg, reactionsSummary: previousSummary ?? [] } : msg
            );
          });
        }
        showComposerToast("No se pudo reaccionar");
      } finally {
        reactionInFlightRef.current.delete(messageId);
      }
    },
    [setMessage, showComposerToast]
  );

  const handleCopyTranscript = useCallback(
    async (text: string) => {
      if (!text) return;
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        showComposerToast("No se pudo copiar el texto.");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showComposerToast("Texto copiado.");
      } catch (_err) {
        showComposerToast("No se pudo copiar el texto.");
      }
    },
    [showComposerToast]
  );

  const uploadVoiceNote = useCallback(
    async (payload: VoiceUploadPayload) => {
      if (!id) return;
      const { blob, base64, durationMs, mimeType, sizeBytes } = payload;
      const tempId = `temp-voice-${Date.now()}`;
      const localUrl = URL.createObjectURL(blob);
      voiceObjectUrlsRef.current.set(tempId, localUrl);
      const timeLabel = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const tempMessage: ConversationMessage = {
        id: tempId,
        fanId: id,
        me: true,
        message: "",
        time: timeLabel,
        createdAt: new Date().toISOString(),
        status: "sending",
        kind: "audio",
        type: "VOICE",
        audioUrl: localUrl,
        audioDurationMs: durationMs,
        audioMime: mimeType,
        audioSizeBytes: sizeBytes,
      };
      setMessage((prev) => {
        if (!id) return prev || [];
        return [...(prev || []), tempMessage];
      });
      scrollToBottom("auto");
      setVoiceUploadError("");
      setVoiceRetryPayload(null);

      setIsVoiceUploading(true);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
          body: JSON.stringify({
            fanId: id,
            from: "creator",
            type: "VOICE",
            audioBase64: base64,
            mimeType,
            durationMs,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (handleSchemaOutOfSync(data)) {
          setMessage((prev) => (prev || []).filter((msg) => msg.id !== tempId));
          return;
        }
        if (!res.ok || !data?.ok) {
          const errorMessage =
            typeof data?.error === "string" && data.error.trim().length > 0
              ? data.error
              : res.ok
              ? "No se pudo subir la nota de voz."
              : `Error ${res.status}`;
          throw new Error(errorMessage);
        }
        const apiMessages: ApiMessage[] = Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : data.message
          ? [data.message as ApiMessage]
          : [];
        const deduped = apiMessages.filter((msg) => {
          if (!msg?.id) return true;
          if (messageEventIdsRef.current.has(msg.id)) return false;
          messageEventIdsRef.current.add(msg.id);
          return true;
        });
        const mapped = mapApiMessagesToState(deduped);
        if (mapped.length > 0) {
          setMessage((prev) => {
            const withoutTemp = (prev || []).filter((msg) => msg.id !== tempId);
            return reconcileMessages(withoutTemp, mapped, id);
          });
        } else {
          setMessage((prev) => (prev || []).filter((msg) => msg.id !== tempId));
        }
        const voiceMessage = apiMessages[apiMessages.length - 1] ?? null;
        const voiceMessageId = voiceMessage?.id ?? null;
        if (deduped.length > 0) {
          const durationMsValue =
            typeof voiceMessage?.audioDurationMs === "number" ? voiceMessage.audioDurationMs : durationMs;
          emitFanMessageSent({
            fanId: id,
            text: "🎤 Nota de voz",
            kind: "audio",
            sentAt: new Date().toISOString(),
            from: "creator",
            eventId: voiceMessageId ?? undefined,
            durationMs: durationMsValue,
            message: voiceMessage ?? undefined,
          });
          emitCreatorDataChanged({ reason: "fan_message_sent", fanId: id });
        }
        setSchemaError(null);
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0 ? err.message : "No se pudo subir la nota de voz.";
        setVoiceUploadError(message);
        setVoiceRetryPayload(payload);
        setMessage((prev) => (prev || []).filter((msg) => msg.id !== tempId));
      } finally {
        const url = voiceObjectUrlsRef.current.get(tempId);
        if (url) {
          URL.revokeObjectURL(url);
          voiceObjectUrlsRef.current.delete(tempId);
        }
        setIsVoiceUploading(false);
      }
    },
    [id, handleSchemaOutOfSync, mapApiMessagesToState, scrollToBottom, setMessage]
  );

  const startVoiceRecording = useCallback(async () => {
    if (isVoiceRecording || isVoiceUploading) return;
    if (!id || conversation.isManager || composerTarget !== "fan") return;
    try {
      setVoiceUploadError("");
      setVoiceRetryPayload(null);
      await startVoiceRecorder();
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0 ? err.message : "Permiso del micro denegado.";
      setVoiceUploadError(message);
      showComposerToast(message);
      resetVoiceRecorder();
    }
  }, [
    composerTarget,
    conversation.isManager,
    id,
    isVoiceRecording,
    isVoiceUploading,
    resetVoiceRecorder,
    showComposerToast,
    startVoiceRecorder,
  ]);

  const stopVoiceRecording = useCallback(async () => {
    if (!isVoiceRecording) return;
    try {
      const result = await stopVoiceRecorder();
      if (!result) return;
      console.info("[voice-note] recorded", {
        blobType: result.blob.type,
        blobSize: result.sizeBytes,
        durationMs: result.durationMs,
      });
      if (!result.sizeBytes) {
        showComposerToast("No se pudo grabar la nota de voz.");
        return;
      }
      if (result.sizeBytes < VOICE_MIN_SIZE_BYTES) {
        showComposerToast("No se detectó audio.");
        return;
      }
      if (result.sizeBytes > VOICE_MAX_SIZE_BYTES) {
        showComposerToast("La nota de voz supera los 10 MB.");
        return;
      }
      if (result.durationMs > VOICE_MAX_DURATION_MS) {
        showComposerToast("La nota de voz supera los 120 s.");
        return;
      }
      if (result.durationMs < 800) {
        showComposerToast("La nota de voz es demasiado corta.");
        return;
      }
      previewVoiceBlob(result.blob);
      void uploadVoiceNote({
        blob: result.blob,
        base64: result.base64,
        durationMs: result.durationMs,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : "Error al grabar la nota de voz.";
      setVoiceUploadError(message);
      showComposerToast(message);
      resetVoiceRecorder();
    }
  }, [
    isVoiceRecording,
    previewVoiceBlob,
    resetVoiceRecorder,
    showComposerToast,
    stopVoiceRecorder,
    uploadVoiceNote,
  ]);

  const cancelVoiceRecording = useCallback(() => {
    if (!isVoiceRecording) return;
    cancelVoiceRecorder();
  }, [cancelVoiceRecorder, isVoiceRecording]);

  const retryVoiceUpload = useCallback(() => {
    if (!voiceRetryPayload || isVoiceUploading) return;
    setVoiceUploadError("");
    const payload = voiceRetryPayload;
    setVoiceRetryPayload(null);
    void uploadVoiceNote(payload);
  }, [isVoiceUploading, uploadVoiceNote, voiceRetryPayload]);

  const clearVoiceRetry = useCallback(() => {
    setVoiceRetryPayload(null);
    setVoiceUploadError("");
  }, []);

  useEffect(() => {
    const objectUrls = voiceObjectUrlsRef.current;
    return () => {
      resetVoiceRecorder();
      if (voicePreviewRef.current) {
        voicePreviewRef.current.pause();
        voicePreviewRef.current = null;
      }
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [resetVoiceRecorder]);

  useEffect(() => {
    messageEventIdsRef.current.clear();
    setVoiceUploadError("");
    setVoiceRetryPayload(null);
    resetVoiceRecorder();
  }, [id, resetVoiceRecorder]);

  useEffect(() => {
    if (!id || conversation.isManager) {
      setAgencyMeta(null);
      setAgencyDraft(null);
      setAgencyError(null);
      setAgencyLoading(false);
      return;
    }

    const fallback = {
      stage: (conversation.agencyStage ?? "NEW") as AgencyStage,
      objective: normalizeObjectiveCode(conversation.agencyObjective) ?? "CONNECT",
      intensity: (conversation.agencyIntensity ?? "MEDIUM") as AgencyIntensity,
      playbook: (conversation.agencyPlaybook ?? "GIRLFRIEND") as AgencyPlaybook,
      nextAction: (conversation.agencyNextAction ?? "").toString(),
      recommendedOfferId: null,
    };
    setAgencyMeta(fallback);
    setAgencyDraft(fallback);
    setAgencyLoading(true);
    setAgencyError(null);

    const controller = new AbortController();
    const fanId = id;
    (async () => {
      try {
        const res = await fetch(`/api/creator/agency/chat-meta?fanId=${fanId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(data?.error || res.statusText);
        }
        const meta = data.meta || {};
        const rawObjective =
          typeof meta.objectiveCode === "string" ? meta.objectiveCode : typeof meta.objective === "string" ? meta.objective : null;
        const nextMeta = {
          stage: (meta.stage ?? fallback.stage) as AgencyStage,
          objective: normalizeObjectiveCode(rawObjective) ?? fallback.objective,
          intensity: (meta.intensity ?? fallback.intensity) as AgencyIntensity,
          playbook: (meta.playbook ?? fallback.playbook) as AgencyPlaybook,
          nextAction: meta.nextAction ? String(meta.nextAction) : "",
          recommendedOfferId: typeof meta.recommendedOfferId === "string" ? meta.recommendedOfferId : null,
        };
        setAgencyMeta(nextMeta);
        setAgencyDraft(nextMeta);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.error("Error loading agency meta", err);
        setAgencyError("No se pudo cargar Agency OS.");
      } finally {
        setAgencyLoading(false);
      }
    })();

    return () => controller.abort();
  }, [
    conversation.agencyIntensity,
    conversation.agencyNextAction,
    conversation.agencyObjective,
    conversation.agencyPlaybook,
    conversation.agencyStage,
    conversation.isManager,
    id,
  ]);

  const fetchObjectives = useCallback(async () => {
    setObjectivesLoading(true);
    setObjectivesError(null);
    try {
      const res = await fetch("/api/creator/agency/objectives?includeInactive=1", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || res.statusText);
      }
      const items = Array.isArray(data.items) ? (data.items as ObjectiveOption[]) : [];
      const normalized = items
        .filter((item) => item && typeof item.code === "string")
        .map((item) => ({
          id: item.id,
          code: item.code.trim(),
          labels:
            item.labels && typeof item.labels === "object" && !Array.isArray(item.labels)
              ? (item.labels as ObjectiveLabels)
              : ({} as ObjectiveLabels),
          active: typeof item.active === "boolean" ? item.active : true,
        }));
      setObjectiveOptions(normalized);
    } catch (err) {
      console.error("Error loading objectives", err);
      setObjectivesError("No se pudieron cargar objetivos.");
    } finally {
      setObjectivesLoading(false);
    }
  }, []);

  const fetchOffers = useCallback(async () => {
    setOffersLoading(true);
    setOffersError(null);
    try {
      const res = await fetch("/api/creator/agency/offers?includeInactive=1", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || res.statusText);
      }
      const items = Array.isArray(data.items) ? (data.items as Offer[]) : [];
      setOffers(items);
    } catch (err) {
      console.error("Error loading offers", err);
      setOffersError("No se pudieron cargar las ofertas.");
    } finally {
      setOffersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!managerPanelOpen || !id || conversation.isManager) return;
    void fetchOffers();
    void fetchObjectives();
  }, [conversation.isManager, fetchObjectives, fetchOffers, id, managerPanelOpen]);

  function formatCurrency(value: number) {
    const rounded = Math.round((value ?? 0) * 100) / 100;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)} €`;
  }

  function formatOfferPrice(priceCents: number, currency?: string | null) {
    const amount = priceCents / 100;
    const base = formatCurrency(amount);
    const code = (currency || "EUR").toUpperCase();
    return code === "EUR" ? base : `${base} ${code}`;
  }

  function pickRandom<T>(items: T[]): T | null {
    if (!Array.isArray(items) || items.length === 0) return null;
    const index = Math.floor(Math.random() * items.length);
    return items[index] ?? null;
  }

  function ensureQuestion(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/[?¿]$/.test(trimmed)) return trimmed;
    return `${trimmed}?`;
  }

  function sanitizeOfferCopy(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return sanitizeAgencyMarketingText(trimmed);
  }

  function buildOfferMessage(offer: Offer): string {
    const hook = sanitizeOfferCopy(pickRandom(offer.hooks) ?? "");
    const oneLiner = sanitizeOfferCopy(offer.oneLiner ?? "");
    const cta = ensureQuestion(sanitizeOfferCopy(pickRandom(offer.ctas) ?? ""));
    return [hook, oneLiner, cta].map((part) => part.trim()).filter(Boolean).join(" ");
  }

  function isOfferCompatible(offer: Offer, intensity: AgencyIntensity): boolean {
    const offerRank = OFFER_INTENSITY_RANK[offer.intensityMin] ?? 0;
    const intensityRank = OFFER_INTENSITY_RANK[intensity] ?? 0;
    return offerRank <= intensityRank;
  }


  const [ cortexFlow, setCortexFlow ] = useState<CortexFlowState | null>(null);
  const [ cortexFlowAutoNext, setCortexFlowAutoNext ] = useState(true);
  const [ purchaseHistory, setPurchaseHistory ] = useState<
    {
      id: string;
      kind: "EXTRA" | "TIP" | "GIFT";
      amount: number;
      createdAt: string;
      contentItemId?: string | null;
      contentTitle?: string | null;
      isArchived?: boolean;
    }[]
  >([]);
  const [ showArchivedPurchases, setShowArchivedPurchases ] = useState(false);
  const [ purchaseHistoryLoading, setPurchaseHistoryLoading ] = useState(false);
  const [ purchaseArchiveBusyId, setPurchaseArchiveBusyId ] = useState<string | null>(null);
  const [ historyFilter, setHistoryFilter ] = useState<"all" | "extra" | "tip" | "gift">("all");
  const [ accessGrantsLoading, setAccessGrantsLoading ] = useState(false);
  const [ openPanel, setOpenPanel ] = useState<"none" | "history" | "extras">("none");
  const [ profileText, setProfileText ] = useState(conversation.profileText ?? "");
  const [ profileLoading, setProfileLoading ] = useState(false);
  const [ profileDraft, setProfileDraft ] = useState("");
  const [ profileError, setProfileError ] = useState("");
  const [ quickNote, setQuickNote ] = useState(conversation.quickNote ?? "");
  const [ quickNoteDraft, setQuickNoteDraft ] = useState("");
  const [ quickNoteEditing, setQuickNoteEditing ] = useState(false);
  const [ quickNoteLoading, setQuickNoteLoading ] = useState(false);
  const [ quickNoteError, setQuickNoteError ] = useState("");
  const [ followUpOpen, setFollowUpOpen ] = useState<FanFollowUp | null>(conversation.followUpOpen ?? null);
  const [ followUpHistory, setFollowUpHistory ] = useState<FanFollowUp[]>([]);
  const [ followUpLoading, setFollowUpLoading ] = useState(false);
  const [ followUpHistoryLoading, setFollowUpHistoryLoading ] = useState(false);
  const [ followUpError, setFollowUpError ] = useState("");
  const [ followUpHistoryError, setFollowUpHistoryError ] = useState("");
  const [ agencyMeta, setAgencyMeta ] = useState<{
    stage: AgencyStage;
    objective: string;
    intensity: AgencyIntensity;
    playbook: AgencyPlaybook;
    nextAction: string;
    recommendedOfferId: string | null;
  } | null>(null);
  const [ agencyDraft, setAgencyDraft ] = useState<{
    stage: AgencyStage;
    objective: string;
    intensity: AgencyIntensity;
    playbook: AgencyPlaybook;
    nextAction: string;
    recommendedOfferId: string | null;
  } | null>(null);
  const [ agencyLoading, setAgencyLoading ] = useState(false);
  const [ agencySaving, setAgencySaving ] = useState(false);
  const [ agencyError, setAgencyError ] = useState<string | null>(null);
  const [ offers, setOffers ] = useState<Offer[]>([]);
  const [ offersLoading, setOffersLoading ] = useState(false);
  const [ offersError, setOffersError ] = useState<string | null>(null);
  const [ offerSelectionSaving, setOfferSelectionSaving ] = useState(false);
  const [ objectiveOptions, setObjectiveOptions ] = useState<ObjectiveOption[]>([]);
  const [ objectivesLoading, setObjectivesLoading ] = useState(false);
  const [ objectivesError, setObjectivesError ] = useState<string | null>(null);
  const [ objectiveCreatorOpen, setObjectiveCreatorOpen ] = useState(false);
  const [ objectiveNameDraft, setObjectiveNameDraft ] = useState("");
  const [ objectiveNameEnDraft, setObjectiveNameEnDraft ] = useState("");
  const [ objectiveCodeDraft, setObjectiveCodeDraft ] = useState("");
  const [ objectiveCreateError, setObjectiveCreateError ] = useState<string | null>(null);
  const [ objectiveCreateSaving, setObjectiveCreateSaving ] = useState(false);
  const [ objectiveManagerOpen, setObjectiveManagerOpen ] = useState(false);
  const [ objectiveDeleteId, setObjectiveDeleteId ] = useState<string | null>(null);
  const [ objectiveDeleteError, setObjectiveDeleteError ] = useState<string | null>(null);
  const [ objectiveTranslations, setObjectiveTranslations ] = useState<ObjectiveLabels>({});
  const [ objectiveTranslateLoading, setObjectiveTranslateLoading ] = useState(false);
  const [ objectiveTranslateError, setObjectiveTranslateError ] = useState<string | null>(null);
  const [ historyError, setHistoryError ] = useState("");

  useEffect(() => {
    setObjectiveCreatorOpen(false);
  }, [id]);

  useEffect(() => {
    if (objectiveCreatorOpen) return;
    setObjectiveNameDraft("");
    setObjectiveNameEnDraft("");
    setObjectiveCodeDraft("");
    setObjectiveCreateError(null);
    setObjectiveTranslations({});
    setObjectiveTranslateError(null);
    setObjectiveTranslateLoading(false);
  }, [id, objectiveCreatorOpen]);

  const [ nextActionDraft, setNextActionDraft ] = useState("");
  const [ nextActionDate, setNextActionDate ] = useState("");
  const [ nextActionTime, setNextActionTime ] = useState("");
  const [ isEditNameOpen, setIsEditNameOpen ] = useState(false);
  const [ editNameValue, setEditNameValue ] = useState("");
  const [ editNameError, setEditNameError ] = useState<string | null>(null);
  const [ editNameSaving, setEditNameSaving ] = useState(false);
  const [ preferredLanguage, setPreferredLanguage ] = useState<SupportedLanguage | null>(null);
  const [ preferredLanguageSaving, setPreferredLanguageSaving ] = useState(false);
  const [ preferredLanguageError, setPreferredLanguageError ] = useState<string | null>(null);
  const [ inlineAction, setInlineAction ] = useState<InlineAction | null>(null);
  const [ translationPreviewOpen, setTranslationPreviewOpen ] = useState(false);
  const [ templateScope, setTemplateScope ] = useState<"fan" | "manager">("fan");
  const [ fanTemplatePools, setFanTemplatePools ] = useState<FanTemplatePools>(LOCAL_FAN_TEMPLATE_POOLS);
  const [ fanTemplateSelection, setFanTemplateSelection ] = useState<FanTemplateSelection>({
    greeting: null,
    question: null,
    closing: null,
  });
  const [ apiPlaybooks, setApiPlaybooks ] = useState<Playbook[]>([]);
  const [ playbookSelections, setPlaybookSelections ] = useState<Record<string, number>>({});
  const [ playbookSearch, setPlaybookSearch ] = useState("");
  const [ playbookTierFilter, setPlaybookTierFilter ] = useState<PlaybookTier | "all">("all");
  const [ playbookMomentFilter, setPlaybookMomentFilter ] = useState<PlaybookMoment | "all">("all");
  const [ playbookObjectiveFilter, setPlaybookObjectiveFilter ] = useState<PlaybookObjective | "all">("all");
  const [ playbookProMode, setPlaybookProMode ] = useState(false);
  const [ draftCardsByFan, setDraftCardsByFan ] = useState<Record<string, DraftCard[]>>({});
  const [ generatedDraftsByFan, setGeneratedDraftsByFan ] = useState<Record<string, DraftCard[]>>({});
  const [ draftActionState, setDraftActionState ] = useState<DraftActionState>({ status: "idle", key: null });
  const [ draftActionPhase, setDraftActionPhase ] = useState<string | null>(null);
  const [ draftActionError, setDraftActionError ] = useState<string | null>(null);
  const [ draftDirectnessById, setDraftDirectnessById ] = useState<Record<string, DraftDirectness | null>>({});
  const [ draftOutputLengthById, setDraftOutputLengthById ] = useState<Record<string, DraftLength>>({});
  const draftActionAbortRef = useRef<AbortController | null>(null);
  const draftActionPhaseTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const draftLastRequestRef = useRef<DraftRequestOptions | null>(null);
  const draftActionRequestIdRef = useRef(0);
  const [ internalPanelTab, setInternalPanelTab ] = useState<InternalPanelTab>("manager");
  const [ , setTranslationPreviewStatus ] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const [ , setTranslationPreviewText ] = useState<string | null>(null);
  const [ , setTranslationPreviewNotice ] = useState<string | null>(null);
  const [ messageTranslationState, setMessageTranslationState ] = useState<Record<string, MessageTranslationState>>({});
  const [ messageSuggestReplyState, setMessageSuggestReplyState ] = useState<
    Record<string, MessageSuggestReplyState>
  >({});
  const [ inviteCopyState, setInviteCopyState ] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [ inviteCopyError, setInviteCopyError ] = useState<string | null>(null);
  const [ inviteCopyUrl, setInviteCopyUrl ] = useState<string | null>(null);
  const [ inviteCopyToast, setInviteCopyToast ] = useState("");
  const inviteCopyToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileDraftEditedRef = useRef(false);
  const [ dockHeight, setDockHeight ] = useState(0);
  const schemaCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSendingRef = useRef(false);
  const inlineActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingComposerDraftRef = useRef<string | null>(null);
  const pendingComposerDraftFanIdRef = useRef<string | null>(null);
  const draftAppliedFanIdRef = useRef<string | null>(null);
  const translationPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationPreviewAbortRef = useRef<AbortController | null>(null);
  const translationPreviewRequestId = useRef(0);
  const translationPreviewKeyRef = useRef<string | null>(null);
  const messageTranslationInFlightRef = useRef(new Map<string, Promise<MessageTranslationResponse>>());
  const messageSuggestReplyInFlightRef = useRef(new Set<string>());
  const [ showContentModal, setShowContentModal ] = useState(false);
  const [ ppvTierMenuOpen, setPpvTierMenuOpen ] = useState(false);
  const [ ppvTierFilter, setPpvTierFilter ] = useState<ChatPpvTierValue>("CHAT_T1");
  const [ duplicateConfirm, setDuplicateConfirm ] = useState<DuplicateConfirmState | null>(null);
  const [ isCoarsePointer, setIsCoarsePointer ] = useState(false);
  const [ messageActionSheet, setMessageActionSheet ] = useState<MessageActionSheetState | null>(null);
  const [ messageTranslationPopover, setMessageTranslationPopover ] = useState<{
    messageId: string;
    error: string;
    x: number;
    y: number;
    maxWidth: number;
  } | null>(null);
  const [ contentModalMode, setContentModalMode ] = useState<"packs" | "extras" | "catalog">("packs");
  const [ extraTierFilter, setExtraTierFilter ] = useState<"T0" | "T1" | "T2" | "T3" | "T4" | null>(null);
  const [ contentModalPackFocus, setContentModalPackFocus ] = useState<"WELCOME" | "MONTHLY" | "SPECIAL" | null>(null);
  const [ registerExtrasChecked, setRegisterExtrasChecked ] = useState(false);
  const [ registerExtrasSource, setRegisterExtrasSource ] = useState<string | null>(null);
  const [ transactionPrices, setTransactionPrices ] = useState<Record<string, number>>({});
  type TimeOfDayValue = "DAY" | "NIGHT" | "ANY";
  type ContentWithFlags = ContentItem & {
    pack: "WELCOME" | "MONTHLY" | "SPECIAL";
    hasBeenSentToFan?: boolean;
    isExtra?: boolean;
    extraTier?: "T0" | "T1" | "T2" | "T3" | null;
    extraSlot?: string | null;
    chatTier?: ChatPpvTierValue | null;
    defaultCopy?: string | null;
    timeOfDay?: TimeOfDayValue;
  };
  const [ contentItems, setContentItems ] = useState<ContentWithFlags[]>([]);
  const [ contentLoading, setContentLoading ] = useState(false);
  const [ contentError, setContentError ] = useState("");
  const [ isContentSending, setIsContentSending ] = useState(false);
  const contentSendingRef = useRef(false);
  const [ catalogItems, setCatalogItems ] = useState<CatalogItem[]>([]);
  const [ catalogLoading, setCatalogLoading ] = useState(false);
  const catalogLoadingRef = useRef(false);
  const [ catalogError, setCatalogError ] = useState<string | null>(null);
  const [ catalogSearch, setCatalogSearch ] = useState("");
  const [ catalogTypeFilter, setCatalogTypeFilter ] = useState<"all" | "EXTRA" | "BUNDLE" | "PACK">("all");
  const [ creatorId, setCreatorId ] = useState<string | null>(null);
  const [ loadingPaymentId, setLoadingPaymentId ] = useState<string | null>(null);
  const [ selectedContentIds, setSelectedContentIds ] = useState<string[]>([]);
  type TimeOfDayFilter = "all" | "day" | "night";
  const [ timeOfDayFilter, setTimeOfDayFilter ] = useState<TimeOfDayFilter>("all");
  const [ timeOfDay, setTimeOfDay ] = useState<TimeOfDayValue>(getCurrentTimeOfDay());
  const [ extraHistory, setExtraHistory ] = useState<
    {
      id: string;
      tier: "T0" | "T1" | "T2" | "T3";
      amount: number;
      sessionTag?: string | null;
      createdAt: string;
      contentItem: { id: string; title: string; type: string; timeOfDay?: TimeOfDayValue; isExtra?: boolean; extraTier?: string | null };
    }[]
  >([]);
  const [ extraHistoryError, setExtraHistoryError ] = useState("");
  const [ isLoadingExtraHistory, setIsLoadingExtraHistory ] = useState(false);
  const [ selectedExtraId, setSelectedExtraId ] = useState<string>("");
  const [ extraAmount, setExtraAmount ] = useState<number | "">("");
  const [ extraError, setExtraError ] = useState<string | null>(null);
  const [ isRegisteringExtra, setIsRegisteringExtra ] = useState(false);
  const registerExtraRef = useRef(false);
  const registerExtraTxnRef = useRef<string | null>(null);
  const [ showManualExtraForm, setShowManualExtraForm ] = useState(false);
  const [ isChatBlocked, setIsChatBlocked ] = useState(conversation.isBlocked ?? false);
  const [ isChatArchived, setIsChatArchived ] = useState(conversation.isArchived ?? false);
  const [ isChatActionLoading, setIsChatActionLoading ] = useState(false);
  const router = useRouter();
  const templatePanelOpenRef = useRef(false);
  const MAX_MAIN_COMPOSER_HEIGHT = 140;
  const MAX_INTERNAL_COMPOSER_HEIGHT = 220;
  const SCROLL_BOTTOM_THRESHOLD = 48;
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const ppvTierButtonRef = useRef<HTMLButtonElement | null>(null);
  const ppvTierMenuRef = useRef<HTMLDivElement | null>(null);
  const composerActionKeyRef = useRef<string | null>(null);
  const fanSendCooldownTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fanSendCooldownPhaseTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const duplicateBypassRef = useRef<{ actionKey?: string | null; expiresAt: number } | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const dockOverlaySheetRef = useRef<HTMLDivElement | null>(null);
  const overlayBodyRef = useRef<HTMLDivElement | null>(null);
  const profileInputRef = useRef<HTMLTextAreaElement | null>(null);
  const nextActionInputRef = useRef<HTMLInputElement | null>(null);
  const segmentNoteByFanRef = useRef<Record<string, string>>({});
  const pendingFollowUpPanelRef = useRef<string | null>(null);
  type ManagerChatMessage = {
    id: string;
    role: "creator" | "manager" | "system";
    text: string;
    createdAt: string;
    title?: string;
    suggestions?: string[];
    offer?: PpvOffer | null;
    qa?: DraftQaResult | null;
  };
  type ManagerSuggestion = {
    id: string;
    label: string;
    message: string;
    intent?: ManagerQuickIntent | string;
    intensity?: AgencyIntensity;
  };
  const [ managerChatByFan, setManagerChatByFan ] = useState<Record<string, ManagerChatMessage[]>>({});
  const [ managerChatInput, setManagerChatInput ] = useState("");
  const [ managerSelectedText, setManagerSelectedText ] = useState<string | null>(null);
  const [ internalDraftInput, setInternalDraftInput ] = useState("");
  const [ highlightDraftId, setHighlightDraftId ] = useState<string | null>(null);
  const managerChatListRef = useRef<HTMLDivElement | null>(null);
  const managerChatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const internalDraftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const managerPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const managerChatEndRef = useRef<HTMLDivElement | null>(null);
  const managerPanelScrollTopRef = useRef(0);
  const managerPanelStickToBottomRef = useRef(false);
  const managerPanelSkipAutoScrollRef = useRef(false);
  const internalChatScrollTopRef = useRef(0);
  const internalChatStickToBottomRef = useRef(true);
  const internalChatForceScrollRef = useRef(false);
  const [ internalMessages, setInternalMessages ] = useState<ApiMessage[]>([]);
  const [ internalMessagesError, setInternalMessagesError ] = useState("");
  const [ isLoadingInternalMessages, setIsLoadingInternalMessages ] = useState(false);
  const internalMessagesAbortRef = useRef<AbortController | null>(null);
  const [ managerSuggestions, setManagerSuggestions ] = useState<ManagerSuggestion[]>([]);
  const [ reengageSuggestions, setReengageSuggestions ] = useState<ManagerSuggestion[]>([]);
  const [ reengageLoading, setReengageLoading ] = useState(false);
  const [ currentObjective, setCurrentObjective ] = useState<ManagerObjective | null>(null);
  const [ managerSummary, setManagerSummary ] = useState<FanManagerSummary | null>(null);
  const [ hasManualManagerObjective, setHasManualManagerObjective ] = useState(false);
  const [ autoPilotEnabled, setAutoPilotEnabled ] = useState(false);
  const [ isAutoPilotLoading, setIsAutoPilotLoading ] = useState(false);
  const [ lastAutopilotObjective, setLastAutopilotObjective ] = useState<AutopilotObjective | null>(null);
  const [ lastAutopilotTone, setLastAutopilotTone ] = useState<FanTone | null>(null);
  const [ fanToneById, setFanToneById ] = useState<Record<string, FanTone>>({});
  const [ includeInternalContextByFan, setIncludeInternalContextByFan ] = useState<Record<string, boolean>>({});
  const fanManagerAnalysis: FanManagerStateAnalysis = useMemo(
    () => deriveFanManagerState({ fan: conversation, messages }),
    [conversation, messages]
  );
  const [ fanTone, setFanTone ] = useState<FanTone>(() => getDefaultFanTone(fanManagerAnalysis.state));
  const [ managerIaMode, setManagerIaMode ] = useState<ManagerIaMode>("simple");
  const [ hasManualTone, setHasManualTone ] = useState(false);
  const [ ppvPhase, setPpvPhase ] = useState<PpvPhase>("suave");
  const previousObjectiveRef = useRef<ManagerObjective | null>(null);
  const draftOutputLength = id ? (draftOutputLengthById[id] ?? "medium") : "medium";
  const isManagerIaSimple = managerIaMode === "simple";
  const clearDraftActionPhaseTimers = useCallback(() => {
    draftActionPhaseTimersRef.current.forEach((timer) => clearTimeout(timer));
    draftActionPhaseTimersRef.current = [];
  }, []);
  const startDraftActionPhaseTimers = useCallback(() => {
    clearDraftActionPhaseTimers();
    setDraftActionPhase("Pensando…");
    draftActionPhaseTimersRef.current = [
      setTimeout(() => setDraftActionPhase("Afinando el tono…"), 2500),
      setTimeout(() => setDraftActionPhase("Casi listo…"), 6000),
    ];
  }, [clearDraftActionPhaseTimers]);

  useEffect(() => {
    return () => {
      clearDraftActionPhaseTimers();
      if (draftActionAbortRef.current) {
        draftActionAbortRef.current.abort();
      }
    };
  }, [clearDraftActionPhaseTimers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedMode = localStorage.getItem(MANAGER_IA_MODE_STORAGE_KEY);
      if (storedMode === "simple" || storedMode === "advanced") {
        setManagerIaMode(storedMode);
      }
    } catch (_err) {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(MANAGER_IA_MODE_STORAGE_KEY, managerIaMode);
    } catch (_err) {
      // ignore storage errors
    }
  }, [managerIaMode]);
  const playbooks = useMemo(() => {
    const merged: Playbook[] = [];
    const seen = new Set<string>();
    for (const entry of [...LOCAL_PLAYBOOKS, ...apiPlaybooks]) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      merged.push(entry);
    }
    return merged;
  }, [apiPlaybooks]);
  const playbookCount = playbooks.length;
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatPanelScrollTopRef = useRef(0);
  const chatPanelRestorePendingRef = useRef(false);
  const previousPanelOpenRef = useRef(false);
  const fanHeaderRef = useRef<HTMLDivElement | null>(null);
  const { config } = useCreatorConfig();

  useEffect(() => {
    composerActionKeyRef.current = composerActionKey;
  }, [composerActionKey]);

  useEffect(() => {
    const cooldownTimeouts = fanSendCooldownTimeoutsRef.current;
    const cooldownPhaseTimeouts = fanSendCooldownPhaseTimeoutsRef.current;
    return () => {
      Object.values(cooldownTimeouts).forEach((timer) => clearTimeout(timer));
      Object.values(cooldownPhaseTimeouts).forEach((timer) => clearTimeout(timer));
    };
  }, []);
  const accessSummary = getAccessSummary({
    membershipStatus,
    daysLeft,
    hasAccessHistory: conversation.hasAccessHistory,
    activeGrantTypes: conversation.activeGrantTypes,
  });
  const subscriptionLabel =
    accessSummary.state === "NONE"
      ? "Sin acceso"
      : accessSummary.state === "EXPIRED"
      ? "Acceso caducado"
      : accessSummary.primaryLabel;
  const accessState = conversation.accessState || getAccessState({ membershipStatus, daysLeft });
  const accessLabel = conversation.accessLabel || getAccessLabel({ membershipStatus, daysLeft });
  const packLabel = accessLabel || (selectedPackType ? PACKS[selectedPackType].name : null) || getAccessLabel({ membershipStatus, daysLeft });
  const selectedPackStatus = getPackStatusForType(selectedPackType);
  const effectiveDaysLeft = selectedPackStatus.daysLeft ?? daysLeft;
  const followUpTag: FollowUpTag =
    conversationFollowUpTag ?? getFollowUpTag(membershipStatus, daysLeft, conversation.activeGrantTypes);
  const normalizedGrants = (conversation.activeGrantTypes ?? []).map((t) => t.toLowerCase());
const EXTRA_PRICES: Record<"T0" | "T1" | "T2" | "T3", number> = {
  T0: 0,
  T1: 9,
  T2: 25,
  T3: 60,
}; // TODO: leer estos precios desde config
const DEFAULT_EXTRA_TIER: "T0" | "T1" | "T2" | "T3" = "T1";
  const [ showQuickSheet, setShowQuickSheet ] = useState(false);
  const [ isDesktop, setIsDesktop ] = useState(false);
  const hasWelcome = normalizedGrants.includes("welcome") || normalizedGrants.includes("trial");
  const hasMonthly = normalizedGrants.includes("monthly");
  const hasSpecial = normalizedGrants.includes("special");
  const isAccessExpired = accessSummary.state === "EXPIRED";
  const canOfferMonthly = hasWelcome && !hasMonthly;
  const canOfferSpecial = hasMonthly && !hasSpecial;
  const isRecommended = (id: string) => Boolean(managerSummary?.recommendedButtons?.includes(id));
  const monetizationSummary = useMemo(
    () => managerSummary?.monetization ?? null,
    [managerSummary?.monetization]
  );
  const isAgencyDirty = useMemo(() => {
    if (!agencyMeta || !agencyDraft) return false;
    return (
      agencyMeta.stage !== agencyDraft.stage ||
      agencyMeta.objective !== agencyDraft.objective ||
      agencyMeta.intensity !== agencyDraft.intensity ||
      agencyMeta.playbook !== agencyDraft.playbook ||
      (agencyMeta.nextAction || "") !== (agencyDraft.nextAction || "")
    );
  }, [agencyDraft, agencyMeta]);

  const activeOffers = useMemo(() => offers.filter((offer) => offer.active), [offers]);
  const agencyIntensity = agencyDraft?.intensity ?? "MEDIUM";
  const compatibleOffers = useMemo(
    () => activeOffers.filter((offer) => isOfferCompatible(offer, agencyIntensity)),
    [activeOffers, agencyIntensity]
  );
  const offersForDropdown = compatibleOffers.length > 0 ? compatibleOffers : activeOffers;
  const selectedOfferId = agencyDraft?.recommendedOfferId ?? null;
  const selectedOffer = offersForDropdown.find((offer) => offer.id === selectedOfferId) ?? null;
  const objectiveLocale = normalizeUiLocale(config?.uiLocale) ?? "es";
  const objectiveLabelsByCode = useMemo(() => {
    const map = new Map<string, ObjectiveLabels>();
    objectiveOptions.forEach((objective) => {
      if (!objective?.code) return;
      const rawCode = objective.code.trim();
      if (!rawCode) return;
      map.set(rawCode, objective.labels ?? {});
      const normalized = normalizeObjectiveCode(rawCode);
      if (normalized) {
        map.set(normalized, objective.labels ?? {});
      }
    });
    return map;
  }, [objectiveOptions]);
  const objectiveSelectOptions = useMemo(() => {
    const options: Array<{ code: string; label: string; active: boolean; isBuiltIn: boolean }> = [];
    const seenNames = new Map<string, { code: string; label: string; active: boolean; isBuiltIn: boolean }>();
    const addOption = (entry: { code: string; label: string; active: boolean; isBuiltIn: boolean }) => {
      const normalizedName = normalizeObjectiveName(entry.label);
      const existing = seenNames.get(normalizedName);
      if (existing) {
        const currentObjective = normalizeObjectiveCode(agencyDraft?.objective) ?? agencyDraft?.objective ?? null;
        if (currentObjective && entry.code === currentObjective && existing.code !== currentObjective) {
          existing.code = entry.code;
          existing.active = entry.active;
          existing.isBuiltIn = entry.isBuiltIn;
        }
        return;
      }
      seenNames.set(normalizedName, entry);
      options.push(entry);
    };
    BUILT_IN_OBJECTIVES.forEach((code) => {
      const label =
        resolveObjectiveLabel({ code, locale: objectiveLocale, labelsByCode: objectiveLabelsByCode }) ?? code;
      addOption({ code, label, active: true, isBuiltIn: true });
    });
    objectiveOptions.forEach((objective) => {
      const normalized = normalizeObjectiveCode(objective.code) ?? objective.code;
      if (!normalized || isBuiltInObjectiveCode(normalized)) return;
      const label =
        resolveObjectiveLabel({ code: normalized, locale: objectiveLocale, labelsByCode: objectiveLabelsByCode }) ??
        normalized;
      addOption({ code: normalized, label, active: objective.active, isBuiltIn: false });
    });
    const currentObjective = normalizeObjectiveCode(agencyDraft?.objective) ?? agencyDraft?.objective ?? null;
    if (currentObjective && !options.some((entry) => entry.code === currentObjective)) {
      const label =
        resolveObjectiveLabel({ code: currentObjective, locale: objectiveLocale, labelsByCode: objectiveLabelsByCode }) ??
        currentObjective;
      addOption({ code: currentObjective, label, active: true, isBuiltIn: false });
    }
    return options;
  }, [agencyDraft?.objective, objectiveLabelsByCode, objectiveLocale, objectiveOptions]);
  const agencyObjectiveLabel = useMemo(() => {
    const code = normalizeObjectiveCode(agencyDraft?.objective) ?? agencyDraft?.objective ?? null;
    if (!code) return null;
    const match = objectiveSelectOptions.find((entry) => entry.code === code);
    return match?.label ?? code;
  }, [agencyDraft?.objective, objectiveSelectOptions]);
  const agencyStyleLabel = useMemo(() => {
    const playbook = agencyDraft?.playbook ?? conversation.agencyPlaybook ?? null;
    if (!playbook) return null;
    return AGENCY_PLAYBOOK_LABELS[playbook as AgencyPlaybook] ?? playbook;
  }, [agencyDraft?.playbook, conversation.agencyPlaybook]);

  function parseNextActionValue(value?: string | null) {
    if (!value) return { text: "", date: "", time: "" };
    const match = value.match(/\(para\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?\)/i);
    const date = match?.[1] ?? "";
    const time = match?.[2] ?? "";
    const text = value.replace(/\(para\s+(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?\)/i, "").trim();
    return { text, date, time };
  }

  function splitDueAt(dueAt?: string | null) {
    if (!dueAt) return { date: "", time: "" };
    const parsed = new Date(dueAt);
    if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
    const date = parsed.toLocaleDateString("en-CA");
    const time = parsed.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
    return { date, time };
  }

  function addDays(base: Date, days: number) {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
  }

  function formatDateInput(value: Date) {
    return value.toLocaleDateString("en-CA");
  }

  function derivePackFromLabel(label?: string | null) {
    const lower = (label || "").toLowerCase();
    if (lower.includes("prueba")) return "trial";
    if (lower.includes("mensual")) return "monthly";
    if (lower.includes("individual")) return "special";
    return null;
  }

  const handleAgencySave = useCallback(async () => {
    if (!id || !agencyDraft) return;
    setAgencySaving(true);
    setAgencyError(null);
    try {
      const res = await fetch("/api/creator/agency/chat-meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: id,
          stage: agencyDraft.stage,
          objectiveCode: agencyDraft.objective,
          intensity: agencyDraft.intensity,
          playbook: agencyDraft.playbook,
          nextAction: agencyDraft.nextAction,
          recommendedOfferId: agencyDraft.recommendedOfferId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || res.statusText);
      }
      const meta = data.meta || {};
      const rawObjective =
        typeof meta.objectiveCode === "string" ? meta.objectiveCode : typeof meta.objective === "string" ? meta.objective : null;
      const nextMeta = {
        stage: (meta.stage ?? agencyDraft.stage) as AgencyStage,
        objective: normalizeObjectiveCode(rawObjective) ?? agencyDraft.objective,
        intensity: (meta.intensity ?? agencyDraft.intensity) as AgencyIntensity,
        playbook: (meta.playbook ?? agencyDraft.playbook) as AgencyPlaybook,
        nextAction: meta.nextAction ? String(meta.nextAction) : "",
        recommendedOfferId: typeof meta.recommendedOfferId === "string" ? meta.recommendedOfferId : agencyDraft.recommendedOfferId,
      };
      setAgencyMeta(nextMeta);
      setAgencyDraft(nextMeta);
      if (!conversation.isManager) {
        setConversation({
          ...conversation,
          agencyStage: nextMeta.stage,
          agencyObjective: nextMeta.objective,
          agencyIntensity: nextMeta.intensity,
          agencyPlaybook: nextMeta.playbook,
          agencyNextAction: nextMeta.nextAction || null,
          agencyRecommendedOfferId: nextMeta.recommendedOfferId ?? null,
        } as any);
      }
    } catch (err) {
      console.error("Error saving agency meta", err);
      setAgencyError("No se pudo guardar Agency OS.");
    } finally {
      setAgencySaving(false);
    }
  }, [agencyDraft, conversation, id, setConversation]);

  const handleRecommendedOfferChange = useCallback(
    async (nextId: string | null) => {
      if (!agencyDraft) return;
      setAgencyDraft((prev) => (prev ? { ...prev, recommendedOfferId: nextId } : prev));
      if (!id) return;
      setOfferSelectionSaving(true);
      try {
        const res = await fetch("/api/creator/agency/chat-meta", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fanId: id,
            recommendedOfferId: nextId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(data?.error || res.statusText);
        }
        const meta = data.meta || {};
        const updatedId = typeof meta.recommendedOfferId === "string" ? meta.recommendedOfferId : null;
        setAgencyMeta((prev) => (prev ? { ...prev, recommendedOfferId: updatedId } : prev));
        setAgencyDraft((prev) => (prev ? { ...prev, recommendedOfferId: updatedId } : prev));
      } catch (err) {
        console.error("Error updating recommended offer", err);
        setAgencyError("No se pudo guardar la oferta recomendada.");
      } finally {
        setOfferSelectionSaving(false);
      }
    },
    [agencyDraft, id]
  );

  const objectiveCodePreview = useMemo(() => {
    const seed = objectiveCodeDraft.trim() || objectiveNameDraft.trim();
    return seed ? slugifyObjectiveCode(seed) : "";
  }, [objectiveCodeDraft, objectiveNameDraft]);

  const handleObjectiveSelect = useCallback(
    (value: string) => {
      if (value === "__create__") {
        setObjectiveCreatorOpen(true);
        return;
      }
      const normalized = normalizeObjectiveCode(value) ?? value;
      setObjectiveCreatorOpen(false);
      setObjectiveCreateError(null);
      setAgencyDraft((prev) => (prev ? { ...prev, objective: normalized } : prev));
    },
    []
  );

  const handleCreateObjective = useCallback(async () => {
    if (objectiveCreateSaving) return;
    setObjectiveCreateError(null);
    const localName = objectiveNameDraft.trim();
    const englishName = objectiveNameEnDraft.trim();
    if (!localName) {
      setObjectiveCreateError("Añade un nombre para el objetivo.");
      return;
    }
    if (localName.length > 80 || englishName.length > 80) {
      setObjectiveCreateError("El nombre es demasiado largo.");
      return;
    }
    const code = normalizeObjectiveCode(objectiveCodeDraft.trim() || localName);
    if (!code) {
      setObjectiveCreateError("Código inválido.");
      return;
    }
    if (code.length > 48) {
      setObjectiveCreateError("El código es demasiado largo.");
      return;
    }
    if (isBuiltInObjectiveCode(code)) {
      setObjectiveCreateError("Ese código ya está reservado.");
      return;
    }
    const exists = objectiveOptions.some((objective) => {
      const normalized = normalizeObjectiveCode(objective.code) ?? objective.code;
      return normalized === code;
    });
    if (exists) {
      setObjectiveCreateError("Ya existe un objetivo con ese código.");
      return;
    }

    const objectiveLocaleKey = normalizeLocaleTag(objectiveLocale) || objectiveLocale;
    const labels: ObjectiveLabels = { [objectiveLocaleKey]: localName };
    if (englishName) {
      labels.en = englishName;
    }
    Object.entries(objectiveTranslations).forEach(([locale, label]) => {
      const normalized = normalizeLocaleTag(locale) || locale;
      if (!normalized || labels[normalized]) return;
      const trimmed = label.trim();
      if (!trimmed) return;
      labels[normalized] = trimmed;
    });

    setObjectiveCreateSaving(true);
    try {
      const res = await fetch("/api/creator/agency/objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, labels }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || res.statusText);
      }
      const item = data?.item ?? {};
      const normalizedItem: ObjectiveOption = {
        id: typeof item.id === "string" ? item.id : `objective-${code}`,
        code: typeof item.code === "string" ? item.code : code,
        labels:
          item.labels && typeof item.labels === "object" && !Array.isArray(item.labels)
            ? (item.labels as ObjectiveLabels)
            : labels,
        active: typeof item.active === "boolean" ? item.active : true,
      };
      setObjectiveOptions((prev) => {
        const normalizedCode = normalizeObjectiveCode(normalizedItem.code) ?? normalizedItem.code;
        const filtered = prev.filter((entry) => {
          const entryCode = normalizeObjectiveCode(entry.code) ?? entry.code;
          return entryCode !== normalizedCode;
        });
        return [normalizedItem, ...filtered];
      });
      setAgencyDraft((prev) => (prev ? { ...prev, objective: normalizedItem.code } : prev));
      setObjectiveCreatorOpen(false);
    } catch (err) {
      console.error("Error creating objective", err);
      setObjectiveCreateError("No se pudo crear el objetivo.");
    } finally {
      setObjectiveCreateSaving(false);
    }
  }, [
    objectiveCreateSaving,
    objectiveNameDraft,
    objectiveNameEnDraft,
    objectiveCodeDraft,
    objectiveLocale,
    objectiveOptions,
    objectiveTranslations,
  ]);

  const handleDeleteObjective = useCallback(
    async (objective: ObjectiveOption) => {
      if (!objective?.id || objectiveDeleteId) return;
      setObjectiveDeleteError(null);
      setObjectiveDeleteId(objective.id);
      try {
        const res = await fetch(`/api/creator/agency/objectives/${objective.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(data?.error || res.statusText);
        }
        const currentCode = normalizeObjectiveCode(agencyDraft?.objective) ?? agencyDraft?.objective ?? null;
        const deletedCode = normalizeObjectiveCode(objective.code) ?? objective.code;
        if (currentCode && deletedCode && currentCode === deletedCode) {
          const fallbackObjective = BUILT_IN_OBJECTIVES[0] ?? "BREAK_ICE";
          setAgencyDraft((prev) => (prev ? { ...prev, objective: fallbackObjective } : prev));
        }
        setObjectiveOptions((prev) => prev.filter((entry) => entry.id !== objective.id));
        await fetchObjectives();
      } catch (err) {
        console.error("Error deleting objective", err);
        setObjectiveDeleteError("No se pudo eliminar el objetivo.");
      } finally {
        setObjectiveDeleteId(null);
      }
    },
    [agencyDraft?.objective, fetchObjectives, objectiveDeleteId]
  );

  const handleObjectiveAutoTranslate = useCallback(async () => {
    if (objectiveTranslateLoading) return;
    setObjectiveTranslateError(null);
    const source = objectiveNameDraft.trim();
    if (!source) {
      setObjectiveTranslateError("Añade un nombre antes de traducir.");
      return;
    }

    const objectiveLocaleKey = normalizeLocaleTag(objectiveLocale);
    const usedLocales = new Set<string>();
    if (objectiveLocaleKey) usedLocales.add(objectiveLocaleKey);
    if (objectiveNameEnDraft.trim()) usedLocales.add("en");
    Object.keys(objectiveTranslations).forEach((key) => {
      const normalized = normalizeLocaleTag(key);
      if (normalized) usedLocales.add(normalized);
    });

    const targets = UI_LOCALES.filter((locale) => {
      const normalized = normalizeLocaleTag(locale);
      return normalized ? !usedLocales.has(normalized) : false;
    });
    if (targets.length === 0) {
      setObjectiveTranslateError("No hay idiomas pendientes de traducir.");
      return;
    }

    setObjectiveTranslateLoading(true);
    const translated: ObjectiveLabels = {};
    let hadConfigError = false;
    let hadNetworkError = false;

    await Promise.all(
      targets.map(async (targetLocale) => {
        const normalizedTarget = normalizeLocaleTag(targetLocale);
        if (!normalizedTarget) return;
        const candidates = normalizeLocale(normalizedTarget);
        const targetLang =
          normalizeTranslationLanguage(candidates[0]) ??
          normalizeTranslationLanguage(candidates[1]) ??
          null;
        if (!targetLang) return;

        try {
          const res = await fetch("/api/creator/messages/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: source, targetLang }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || typeof data?.translatedText !== "string") {
            if (data?.error === "TRANSLATE_NOT_CONFIGURED" || data?.code === "TRANSLATE_NOT_CONFIGURED") {
              hadConfigError = true;
              return;
            }
            hadNetworkError = true;
            return;
          }
          const text = data.translatedText.trim();
          if (text) translated[normalizedTarget] = text;
        } catch (_err) {
          hadNetworkError = true;
        }
      })
    );

    if (translated.en && !objectiveNameEnDraft.trim()) {
      setObjectiveNameEnDraft(translated.en);
      delete translated.en;
    }
    if (Object.keys(translated).length > 0) {
      setObjectiveTranslations((prev) => ({ ...prev, ...translated }));
    }

    if (hadConfigError) {
      setObjectiveTranslateError("Configura DeepL para traducir automáticamente.");
    } else if (hadNetworkError && Object.keys(translated).length === 0) {
      setObjectiveTranslateError("No se pudieron generar traducciones.");
    }

    setObjectiveTranslateLoading(false);
  }, [
    objectiveLocale,
    objectiveNameDraft,
    objectiveNameEnDraft,
    objectiveTranslations,
    objectiveTranslateLoading,
  ]);

  const applyAutoAdvanceStage = useCallback(
    async (nextStage: AgencyStage, actionKey?: string | null) => {
      if (!id || conversation.isManager) return;
      if (!agencyMeta || !agencyDraft) return;
      if (isAgencyDirty) return;
      if (agencyMeta.stage === nextStage) return;
      try {
        const res = await fetch("/api/creator/agency/chat-meta", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fanId: id,
            stage: nextStage,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(data?.error || res.statusText);
        }
        const meta = data.meta || {};
        const updatedStage = (meta.stage ?? nextStage) as AgencyStage;
        const rawObjective =
          typeof meta.objectiveCode === "string" ? meta.objectiveCode : typeof meta.objective === "string" ? meta.objective : null;
        const updatedMeta = {
          stage: updatedStage,
          objective: normalizeObjectiveCode(rawObjective) ?? agencyMeta.objective,
          intensity: (meta.intensity ?? agencyMeta.intensity) as AgencyIntensity,
          playbook: (meta.playbook ?? agencyMeta.playbook) as AgencyPlaybook,
          nextAction: meta.nextAction ? String(meta.nextAction) : agencyMeta.nextAction,
          recommendedOfferId:
            typeof meta.recommendedOfferId === "string" ? meta.recommendedOfferId : agencyMeta.recommendedOfferId,
        };
        setAgencyMeta(updatedMeta);
        setAgencyDraft(updatedMeta);
        if (!conversation.isManager) {
          setConversation({
            ...conversation,
            agencyStage: updatedStage,
          } as any);
        }
      } catch (err) {
        console.error("Error auto-advancing agency stage", { actionKey, err });
      }
    },
    [agencyDraft, agencyMeta, conversation, id, isAgencyDirty, setConversation]
  );

  const captureChatScrollForPanelToggle = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    chatPanelScrollTopRef.current = el.scrollTop;
    chatPanelRestorePendingRef.current = true;
  }, []);

  const closeInlinePanel = useCallback(
    (options?: { focus?: boolean }) => {
      if (process.env.NODE_ENV !== "production") {
        console.trace("CLOSE_INLINE_PANEL");
      }
      if (managerPanelOpen) {
        captureChatScrollForPanelToggle();
        closeManagerPanel();
      }
      if (options?.focus) {
        requestAnimationFrame(() => {
          messageInputRef.current?.focus();
        });
      }
    },
    [managerPanelOpen, captureChatScrollForPanelToggle, closeManagerPanel]
  );

  const closeContentModal = useCallback(() => {
    setShowContentModal(false);
    setSelectedContentIds([]);
    setContentModalPackFocus(null);
    setRegisterExtrasChecked(false);
    setRegisterExtrasSource(null);
    setTransactionPrices({});
    setCatalogSearch("");
    setCatalogTypeFilter("all");
  }, []);

  const closeOverlays = useCallback((options?: { keepManagerPanel?: boolean }) => {
    if (!options?.keepManagerPanel) {
      closeInlinePanel();
    }
    closeContentModal();
    setShowQuickSheet(false);
    setIsEditNameOpen(false);
    setEditNameError(null);
    setOpenPanel("none");
    setShowManualExtraForm(false);
  }, [closeInlinePanel, closeContentModal]);

  const clearInlineAction = useCallback(() => {
    if (inlineActionTimerRef.current) {
      clearTimeout(inlineActionTimerRef.current);
      inlineActionTimerRef.current = null;
    }
    setInlineAction(null);
  }, []);

  const showInlineAction = useCallback((payload: Omit<InlineAction, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ttlMs = payload.ttlMs ?? (payload.undoLabel ? 9000 : 4500);
    if (inlineActionTimerRef.current) {
      clearTimeout(inlineActionTimerRef.current);
    }
    setInlineAction({ ...payload, id, ttlMs });
    if (ttlMs > 0) {
      inlineActionTimerRef.current = setTimeout(() => {
        setInlineAction(null);
      }, ttlMs);
    }
  }, []);

  const autoGrowTextarea = useCallback((el: HTMLTextAreaElement | null, maxHeight: number) => {
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  const focusManagerComposer = useCallback((withSelectionEnd = true) => {
    requestAnimationFrame(() => {
      const input = managerChatInputRef.current;
      if (!input) return;
      input.focus();
      if (withSelectionEnd) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
      autoGrowTextarea(input, MAX_INTERNAL_COMPOSER_HEIGHT);
    });
  }, [autoGrowTextarea]);

  const resetMessageInputHeight = useCallback(() => {
    autoGrowTextarea(messageInputRef.current, MAX_MAIN_COMPOSER_HEIGHT);
  }, [autoGrowTextarea]);

  const applyComposerDraft = useCallback(
    (draftText: string, insertMode: "replace" | "append" = "replace", actionKey?: string | null) => {
      if (!id) return false;
      const trimmed = draftText.trim();
      if (!trimmed) return false;
      const nextText = insertMode === "append" ? appendDraftText(messageSend, draftText) : draftText;
      if (!nextText.trim()) return false;
      setComposerTarget("fan");
      setMessageSend(nextText);
      setComposerActionKey(actionKey ?? null);
      draftAppliedFanIdRef.current = id;
      requestAnimationFrame(() => {
        const input = messageInputRef.current;
        if (!input) return;
        input.focus();
        const len = nextText.length;
        input.setSelectionRange(len, len);
        autoGrowTextarea(input, MAX_MAIN_COMPOSER_HEIGHT);
      });
      return true;
    },
    [autoGrowTextarea, id, messageSend]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleComposerDraft = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as {
        target?: string;
        fanId?: string;
        text?: string;
        insertMode?: string;
        actionKey?: string;
      } | undefined;
      const target = detail?.target === "cortex" ? "cortex" : "fan";
      if (target !== "fan") return;
      if (!id || !detail?.fanId || detail.fanId !== id) return;
      const stored = consumeDraft({ target: "fan", fanId: id });
      const insertMode = stored?.insertMode === "append" || detail?.insertMode === "append" ? "append" : "replace";
      const actionKey =
        stored?.actionKey ?? (typeof detail?.actionKey === "string" ? detail.actionKey : null);
      if (stored?.text) {
        applyComposerDraft(stored.text, insertMode, actionKey);
        return;
      }
      if (typeof detail.text === "string" && detail.text.trim()) {
        applyComposerDraft(detail.text, insertMode, actionKey);
      }
    };
    window.addEventListener(COMPOSER_DRAFT_EVENT, handleComposerDraft as EventListener);
    return () => {
      window.removeEventListener(COMPOSER_DRAFT_EVENT, handleComposerDraft as EventListener);
    };
  }, [applyComposerDraft, id]);

  useEffect(() => {
    if (!router.isReady) return;
    const fanIdValue = getFanIdFromQuery(router.query);
    const nextQuery = { ...router.query };
    let shouldReplace = false;

    const rawDraft = router.query.draft;
    if (typeof rawDraft !== "undefined") {
      const draftValue = Array.isArray(rawDraft) ? rawDraft[0] : rawDraft;
      if (process.env.NODE_ENV !== "production") {
      }
      if (typeof draftValue === "string") {
        const decodedDraft = safeDecodeQueryParam(draftValue);
        pendingComposerDraftRef.current = decodedDraft;
        pendingComposerDraftFanIdRef.current = fanIdValue;
      }
      delete nextQuery.draft;
      shouldReplace = true;
    }

    const rawSegmentNote = router.query.segmentNote;
    if (typeof rawSegmentNote !== "undefined") {
      const noteValue = Array.isArray(rawSegmentNote) ? rawSegmentNote[0] : rawSegmentNote;
      if (typeof noteValue === "string" && fanIdValue) {
        const decodedNote = safeDecodeQueryParam(noteValue).trim();
        if (decodedNote) {
          segmentNoteByFanRef.current[fanIdValue] = decodedNote;
        }
      }
      delete nextQuery.segmentNote;
      shouldReplace = true;
    }

    const rawPanel = router.query.panel;
    if (typeof rawPanel !== "undefined") {
      const panelValue = Array.isArray(rawPanel) ? rawPanel[0] : rawPanel;
      if (panelValue === "followup" && fanIdValue) {
        pendingFollowUpPanelRef.current = fanIdValue;
      }
      delete nextQuery.panel;
      shouldReplace = true;
    }

    if (shouldReplace) {
      void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }
  }, [router]);

  const firstName = (contactName || "").split(" ")[0] || contactName || "";
  const messagesLength = messages?.length ?? 0;

  useEffect(() => {
    setProfileText(conversation.profileText ?? "");
    setQuickNote(conversation.quickNote ?? "");
    setFollowUpOpen(conversation.followUpOpen ?? null);
  }, [conversation.id, conversation.profileText, conversation.quickNote, conversation.followUpOpen]);

  useEffect(() => {
    const openFollowUp = conversation.followUpOpen ?? followUpOpen;
    if (openFollowUp) {
      setNextActionDraft(openFollowUp.title ?? "");
      const parsedDue = splitDueAt(openFollowUp.dueAt ?? null);
      setNextActionDate(parsedDue.date);
      setNextActionTime(parsedDue.time);
      return;
    }
    const note = typeof conversation.nextActionNote === "string" ? conversation.nextActionNote.trim() : "";
    const scheduledAt = conversation.nextActionAt ?? null;
    if (note || scheduledAt) {
      const parsedDue = splitDueAt(scheduledAt);
      const legacyParsed = parseNextActionValue(conversation.nextAction);
      setNextActionDraft(note || legacyParsed.text);
      setNextActionDate(parsedDue.date || legacyParsed.date);
      setNextActionTime(parsedDue.time || legacyParsed.time);
      return;
    }
    const parsed = parseNextActionValue(conversation.nextAction);
    setNextActionDraft(parsed.text);
    setNextActionDate(parsed.date);
    setNextActionTime(parsed.time);
  }, [
    conversation.id,
    conversation.nextAction,
    conversation.nextActionAt,
    conversation.nextActionNote,
    conversation.followUpOpen,
    followUpOpen,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewport = () => setIsDesktop(window.innerWidth >= 1024);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    setIsChatBlocked(conversation.isBlocked ?? false);
    setIsChatArchived(conversation.isArchived ?? false);
    resetMessageInputHeight();
  }, [conversation.id, conversation.isBlocked, conversation.isArchived, resetMessageInputHeight]);

  useIsomorphicLayoutEffect(() => {
    autoGrowTextarea(messageInputRef.current, MAX_MAIN_COMPOSER_HEIGHT);
  }, [messageSend, autoGrowTextarea]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = dockRef.current;
    const pane = rightPaneRef.current;
    if (!el) return;
    const update = () => {
      const raw = el.getBoundingClientRect().height;
      const height = Math.max(48, Math.min(raw, 88));
      setDockHeight(height);
      if (pane) {
        pane.style.setProperty("--dock-h", `${height}px`);
      }
    };
    update();
    const handleResize = () => update();
    window.addEventListener("resize", handleResize);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => update());
      observer.observe(el);
    }
    return () => {
      window.removeEventListener("resize", handleResize);
      if (observer) observer.disconnect();
      if (pane) {
        pane.style.removeProperty("--dock-h");
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (inviteCopyToastTimer.current) {
        clearTimeout(inviteCopyToastTimer.current);
      }
      if (inlineActionTimerRef.current) {
        clearTimeout(inlineActionTimerRef.current);
      }
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 80;
      const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      setIsAtBottom(distanceToBottom < threshold);
    };
    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useIsomorphicLayoutEffect(() => {
    setIsAtBottom(true);
    scrollToBottom("auto");
  }, [conversation.id]);

  useIsomorphicLayoutEffect(() => {
    if (!isAtBottom) return;
    if (!messagesLength) return;
    scrollToBottom("smooth");
  }, [messagesLength, isAtBottom]);

  useIsomorphicLayoutEffect(() => {
    if (!chatPanelRestorePendingRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) {
      chatPanelRestorePendingRef.current = false;
      return;
    }
    const target = chatPanelScrollTopRef.current;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = target;
      chatPanelRestorePendingRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [managerPanelOpen]);

  useIsomorphicLayoutEffect(() => {
    const prev = previousPanelOpenRef.current;
    if (!prev && managerPanelOpen) {
      scrollToBottom("auto");
    }
    previousPanelOpenRef.current = managerPanelOpen;
  }, [managerPanelOpen]);

  useIsomorphicLayoutEffect(() => {
    if (!inlineAction || !isAtBottom) return;
    const frame = requestAnimationFrame(() => {
      scrollToBottom("smooth");
    });
    return () => cancelAnimationFrame(frame);
  }, [inlineAction, isAtBottom]);

  function getPackTypeFromName(name: string) {
    const lower = name.toLowerCase();
    if (lower.includes("bienvenida")) return "trial";
    if (lower.includes("mensual")) return "monthly";
    if (lower.includes("especial")) return "special";
    return null;
  }

  function findPackByType(type: "trial" | "monthly" | "special") {
    return config.packs.find((pack) => getPackTypeFromName(pack.name) === type);
  }

  function computeDaysLeft(expiresAt: string | Date) {
    const now = new Date();
    const exp = new Date(expiresAt);
    const diff = exp.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function formatLastCreatorMessage(lastMessage?: string | null) {
    if (!lastMessage) return "Nunca";
    const last = new Date(lastMessage);
    const now = new Date();
    const sameDay =
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate();
    if (sameDay) return "Hoy";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      last.getFullYear() === yesterday.getFullYear() &&
      last.getMonth() === yesterday.getMonth() &&
      last.getDate() === yesterday.getDate();
    if (isYesterday) return "Ayer";

    const diffDays = Math.ceil((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;

    return last.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  }

  function formatNoteDate(dateStr: string) {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
  }

  function getFollowUpStatusFromDate(dateStr?: string | null) {
    if (!dateStr) return null;
    const target = dateStr.includes("T") ? new Date(dateStr) : new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round((targetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Atrasado", tone: "overdue" as const };
    if (diffDays === 0) return { label: "Hoy", tone: "today" as const };
    if (diffDays === 1) return { label: "Mañana", tone: "tomorrow" as const };
    return null;
  }

  type PackStatus = "active" | "expired" | "never";

  function getPackStatusForType(type: "trial" | "monthly" | "special"): { status: PackStatus; daysLeft?: number } {
    const grantsForType = accessGrants.filter((g) => g.type === type);
    if (!grantsForType.length) return { status: "never" };

    const now = new Date();
    const activeGrant = grantsForType.find((g) => new Date(g.expiresAt) > now);
    if (activeGrant) {
      return { status: "active", daysLeft: computeDaysLeft(activeGrant.expiresAt) };
    }

    return { status: "expired" };
  }

  function buildPackProposalMessage(pack: { name: string; price: string; description: string }) {
    return `Te propongo el ${pack.name} (${pack.price}): ${pack.description} Si te encaja, te envío el enlace de pago: [pega aquí tu enlace].`;
  }

  function mapGrantType(type: string) {
    if (type === "trial") return { label: "Prueba 7 días", amount: 0 };
    if (type === "monthly") return { label: "Suscripción mensual", amount: 25 };
    if (type === "special") return { label: "Pack especial pareja", amount: 49 };
    return { label: type, amount: 0 };
  }

  function formatGrantDate(dateString: string) {
    const d = new Date(dateString);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function mapGrantLevel(type?: string | null): 1 | 2 | 3 | null {
    if (!type) return null;
    const lower = type.toLowerCase();
    if (lower === "special" || lower === "single") return 3;
    if (lower === "monthly") return 2;
    if (lower === "trial" || lower === "welcome") return 1;
    return null;
  }

  function mapLastGrantToPackType(type?: string | null): "trial" | "monthly" | "special" {
    const lower = (type || "").toLowerCase();
    if (lower === "special" || lower === "single") return "special";
    if (lower === "trial" || lower === "welcome") return "trial";
    return "monthly";
  }

  function getCurrentTimeOfDay(): TimeOfDayValue {
    const h = new Date().getHours();
    return h >= 7 && h < 19 ? "DAY" : "NIGHT";
  }

  function getFanMaxPackLevel() {
    const levels = accessGrants
      .map((grant) => mapGrantLevel(grant.type))
      .filter((lvl): lvl is 1 | 2 | 3 => !!lvl);
    if (levels.length === 0) {
      const activeLevels = (conversation.activeGrantTypes ?? [])
        .map((type) => mapGrantLevel(type))
        .filter((lvl): lvl is 1 | 2 | 3 => !!lvl);
      if (activeLevels.length === 0) return null;
      return Math.max(...activeLevels);
    }
    return Math.max(...levels);
  }

  function getGrantStatus(expiresAt?: string | null) {
    if (!expiresAt) return "Sin fecha";
    const now = new Date();
    const exp = new Date(expiresAt);
    return exp > now ? "Activo" : "Caducado";
  }

  function getCustomerTierFromSpend(total: number): "new" | "regular" | "vip" {
    if (total >= 200) return "vip";
    if (total >= 50) return "regular";
    return "new";
  }

  function getQueuePosition() {
    if (activeQueueFilter !== "ventas_hoy" || !conversation?.id) return { index: -1, size: queueFans.length };
    const idx = queueFans.findIndex((f) => f.id === conversation.id);
    return { index: idx, size: queueFans.length };
  }

  function fillMessage(template: string, actionKey?: string | null) {
    if (id) {
      insertIntoCurrentComposer({
        target: "fan",
        fanId: id,
        mode: "fan",
        text: template,
        actionKey: actionKey ?? undefined,
      });
      return;
    }
    setComposerTarget("fan");
    setMessageSend(template);
    setComposerActionKey(actionKey ?? null);
  }

  async function fillMessageForFan(text: string, actionKey?: string | null) {
    const fanLanguage = (preferredLanguage ?? "en") as SupportedLanguage;

    if (fanLanguage === "es") {
      fillMessage(text, actionKey);
      return;
    }

    const payload: { text: string; targetLanguage: string; fanId?: string } = {
      text,
      targetLanguage: fanLanguage,
    };
    if (id) {
      payload.fanId = id;
    }

    try {
      const res = await fetch("/api/messages/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.status === 501 && data?.code === "TRANSLATE_NOT_CONFIGURED") {
        fillMessage(text, actionKey);
        return;
      }
      const translatedText = typeof data?.translatedText === "string" ? data.translatedText.trim() : "";
      if (translatedText) {
        fillMessage(translatedText, actionKey);
        return;
      }
    } catch (err) {
      console.warn("fillMessageForFan_translate_error", err);
    }

    fillMessage(text, actionKey);
  }
  const handleInsertEmoji = useCallback(
    (emoji: string) => {
      const input = messageInputRef.current;
      if (!input) {
        setMessageSend((prev) => `${prev}${emoji}`);
        return;
      }
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const nextValue = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
      setMessageSend(nextValue);
      requestAnimationFrame(() => {
        input.focus();
        const cursor = start + emoji.length;
        input.setSelectionRange(cursor, cursor);
        autoGrowTextarea(input, MAX_MAIN_COMPOSER_HEIGHT);
      });
    },
    [autoGrowTextarea]
  );
  const handleInsertManagerEmoji = useCallback(
    (emoji: string) => {
      const input = managerChatInputRef.current;
      if (!input) {
        setManagerChatInput((prev) => `${prev}${emoji}`);
        return;
      }
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const nextValue = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
      setManagerChatInput(nextValue);
      setManagerSelectedText(null);
      requestAnimationFrame(() => {
        input.focus();
        const cursor = start + emoji.length;
        input.setSelectionRange(cursor, cursor);
        autoGrowTextarea(input, MAX_INTERNAL_COMPOSER_HEIGHT);
      });
    },
    [autoGrowTextarea]
  );
  const handleInsertSticker = useCallback(
    (sticker: PickerStickerItem) => {
      const token = buildStickerToken(sticker.collectionId, sticker.packId, sticker.id);
      const input = messageInputRef.current;
      setMessageSend(token);
      requestAnimationFrame(() => {
        if (!input) return;
        input.focus();
        input.setSelectionRange(token.length, token.length);
        autoGrowTextarea(input, MAX_MAIN_COMPOSER_HEIGHT);
      });
    },
    [autoGrowTextarea]
  );
  const focusMainMessageInput = (text: string, actionKey?: string | null) => {
    setComposerTarget("fan");
    setMessageSend(text);
    setComposerActionKey(actionKey ?? null);
    requestAnimationFrame(() => {
      adjustMessageInputHeight();
      const input = messageInputRef.current;
      if (input) {
        input.focus();
        const len = text.length;
        input.setSelectionRange(len, len);
        input.scrollIntoView({ block: "nearest" });
      }
    });
  };
  const insertComposerTextWithUndo = (
    nextText: string,
    options: { title: string; detail?: string; forceFan?: boolean; actionKey?: string }
  ) => {
    const previousText = messageSend;
    if (!id || !nextText.trim()) return;
    insertIntoCurrentComposer({
      target: "fan",
      fanId: id,
      mode: "fan",
      text: nextText,
      actionKey: options.actionKey,
    });
    showInlineAction({
      kind: "ok",
      title: options.title,
      detail: options.detail,
      undoLabel: "Deshacer",
      onUndo: () => focusMainMessageInput(previousText, null),
      ttlMs: 9000,
    });
  };
  const resolveIntentActionKey = (intent?: string | null) => {
    switch (intent) {
      case "romper_hielo":
        return "break_ice";
      case "ofrecer_extra":
        return "offer_extra";
      case "llevar_a_mensual":
        return "monthly_upsell";
      case "reactivar_fan_frio":
        return "reactivate_cold";
      case "renovacion":
        return "renewal";
      case "bienvenida":
        return "welcome";
      default:
        return intent ? `intent:${intent}` : null;
    }
  };

  const resolveActionKeyValue = (value?: string | null) => {
    if (!value) return null;
    if (value.includes(":")) return value;
    return resolveIntentActionKey(value);
  };

  const handleApplyManagerSuggestion = (text: string, detail?: string, actionKeyOrIntent?: string) => {
    const filled = text.replace("{nombre}", getFirstName(contactName) || contactName || "");
    const actionKey = resolveActionKeyValue(actionKeyOrIntent);
    handleUseManagerReplyAsMainMessage(filled, detail, actionKey);
  };
  const handleSelectFanFromBanner = useCallback(
    (fan: ConversationListData | null) => {
      if (!fan?.id) return;
      openFanChat(router, fan.id, { shallow: true, pathname: router.pathname || "/creator" });
      setConversation(fan as any);
    },
    [router, setConversation]
  );
  function handleManagerSuggestion(text: string) {
    handleApplyManagerSuggestion(text);
  }

  const mergeComposerText = (existing: string, incoming: string, mode: "replace" | "prepend" | "append") => {
    if (mode === "replace") return incoming;
    const trimmedExisting = existing.trim();
    const trimmedIncoming = incoming.trim();
    if (!trimmedExisting) return trimmedIncoming;
    if (!trimmedIncoming) return trimmedExisting;
    if (mode === "prepend") {
      return `${trimmedIncoming}\n\n${trimmedExisting}`;
    }
    return `${trimmedExisting}\n\n${trimmedIncoming}`;
  };

  const applyComposerInsert = (text: string, mode: "replace" | "prepend" | "append", detail?: string) => {
    const nextText = mergeComposerText(messageSend, text, mode);
    setComposerTarget("fan");
    setMessageSend(nextText);
    autoGrowTextarea(messageInputRef.current, MAX_MAIN_COMPOSER_HEIGHT);
    closeInlinePanel({ focus: true });
    requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) return;
      const len = nextText.length;
      input.focus();
      input.setSelectionRange(len, len);
    });
    showInlineAction({
      kind: "ok",
      title: "Sugerencia insertada",
      detail: detail ?? "Manager IA",
      ttlMs: 1600,
    });
  };

  function handleUseManagerReplyAsMainMessage(text: string, detail?: string, actionKey?: string | null) {
    const nextText = text || "";
    if (!id || !nextText.trim()) return;
    insertIntoCurrentComposer({
      target: "fan",
      fanId: id,
      mode: "fan",
      text: nextText,
      actionKey: actionKey ?? undefined,
    });
    closeInlinePanel({ focus: true });
    showInlineAction({
      kind: "ok",
      title: "Sugerencia insertada",
      detail: detail ?? "Manager IA",
      ttlMs: 1600,
    });
  }

  function handleInsertOffer(text: string, offer: PpvOffer, detail?: string, action?: string | null) {
    const nextText = text || "";
    if (!id || !nextText.trim()) return;
    insertIntoCurrentComposer({
      target: "fan",
      fanId: id,
      mode: "fan",
      text: nextText,
      actionKey: action ?? (offer.contentId ? `ppv:${offer.contentId}` : offer.tier ? `ppv:${offer.tier}` : undefined),
    });
    const tier = typeof offer.tier === "string" ? (offer.tier as "T0" | "T1" | "T2" | "T3") : null;
    if (offer.dayPart === "DAY") {
      setTimeOfDayFilter("day");
    } else if (offer.dayPart === "NIGHT") {
      setTimeOfDayFilter("night");
    } else if (offer.dayPart === "ANY") {
      setTimeOfDayFilter("all");
    }
    openContentModal({
      mode: "extras",
      tier,
      selectedIds: offer.contentId ? [offer.contentId] : [],
      defaultRegisterExtras: false,
      registerSource: "offer_flow",
    });
    const slotMeta = offer.slot ? EXTRA_SLOT_LABELS[offer.slot] : null;
    const dayPartLabel = formatDayPartLabel(offer.dayPart ?? null);
    const phaseLabel = dayPartLabel ?? (slotMeta ? slotMeta.phase : "Cualquiera");
    track(ANALYTICS_EVENTS.PPV_OFFER_INSERTED, {
      fanId: id ?? undefined,
      meta: {
        creatorId: creatorId ?? undefined,
        contentId: offer.contentId ?? undefined,
        title: offer.title ?? undefined,
        tier: offer.tier ?? undefined,
        slot: offer.slot ?? undefined,
        dayPart: offer.dayPart ?? undefined,
        phaseLabel,
        source: "MANAGER_AI",
        action,
      },
    });
    track(ANALYTICS_EVENTS.PPV_OFFER_SENT, {
      fanId: id ?? undefined,
      meta: {
        creatorId: creatorId ?? undefined,
        contentId: offer.contentId ?? undefined,
        title: offer.title ?? undefined,
        tier: offer.tier ?? undefined,
        slot: offer.slot ?? undefined,
        dayPart: offer.dayPart ?? undefined,
        phaseLabel,
        source: "MANAGER_AI",
        action,
      },
    });
    closeInlinePanel({ focus: true });
    showInlineAction({
      kind: "ok",
      title: "Oferta insertada",
      detail: detail ?? offer.title ?? offer.tier ?? "Oferta",
      ttlMs: 1800,
    });
  }

  const handleInsertManagerComposerText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      openCortexAndPrefill(router, {
        text: trimmed,
        fanId: id ?? undefined,
        mode: "manager",
        source: "translation",
      });
      showComposerToast("Enviado al Manager IA");
    },
    [id, router, showComposerToast]
  );

  const handleChangeFanTone = useCallback(
    (tone: FanTone) => {
      setFanTone(tone);
      setHasManualTone(true);
      if (id) {
        setFanToneById((prev) => ({ ...prev, [id]: tone }));
      }
    },
    [id]
  );

  function formatObjectiveLabel(objective?: ManagerObjective | null) {
    switch (objective) {
      case "bienvenida":
        return "Bienvenida";
      case "romper_hielo":
        return "Romper el hielo";
      case "reactivar_fan_frio":
        return "Reactivar fan frío";
      case "ofrecer_extra":
        return "Ofrecer un extra";
      case "llevar_a_mensual":
        return "Llevar a mensual";
      case "renovacion":
        return "Renovación";
      default:
        return null;
    }
  }

  function getObjectiveFollowUpNote(objective?: ManagerObjective | null) {
    switch (objective) {
      case "bienvenida":
      case "romper_hielo":
        return "Romper el hielo";
      case "reactivar_fan_frio":
        return "Reactivar fan frío";
      case "ofrecer_extra":
        return "Ofrecer un extra";
      case "llevar_a_mensual":
        return "Proponer pack especial";
      case "renovacion":
        return "Cerrar renovación";
      default:
        return null;
    }
  }

  function formatToneLabel(tone?: FanTone | null) {
    if (tone === "suave") return "Suave";
    if (tone === "picante") return "Picante";
    if (tone === "intimo") return "Íntimo";
    return null;
  }

  function formatLengthLabel(length?: DraftLength | null) {
    if (length === "short") return "Corta";
    if (length === "long") return "Larga";
    if (length === "medium") return "Media";
    return null;
  }

  function formatPpvPhaseLabel(phase?: PpvPhase | null) {
    if (phase === "suave") return "Suave";
    if (phase === "picante") return "Picante";
    if (phase === "directo") return "Directo";
    if (phase === "final") return "Final";
    return null;
  }

  const managerPromptTemplate = (() => {
    const objective = currentObjective ?? fanManagerAnalysis.defaultObjective;
    if (!objective || !fanTone) return null;
    return getManagerPromptTemplate({
      tone: fanTone,
      objective,
      fan: conversation,
    });
  })();

  const handleToggleAutoPilot = useCallback(() => {
    setAutoPilotEnabled((prev) => !prev);
  }, []);

  const templateTone: FanTemplateTone | null =
    fanTone === "suave" || fanTone === "intimo" || fanTone === "picante" ? fanTone : null;

  const resolveFanTemplateText = useCallback(
    (text: string) => {
      const firstName = getFirstName(contactName);
      if (!firstName) return text;
      return text.replace(/\{nombre_fan\}/gi, firstName).replace(/\{nombre\}/gi, firstName);
    },
    [contactName]
  );

  const visiblePlaybooks = useMemo(() => {
    const search = normalizeSearchText(playbookSearch);
    const base = playbookProMode ? playbooks : playbooks.filter((pb) => pb.recommended);
    return base.filter((playbook) => {
      if (playbookTierFilter !== "all" && playbook.tier !== playbookTierFilter) return false;
      if (playbookMomentFilter !== "all" && playbook.moment !== playbookMomentFilter) return false;
      if (playbookObjectiveFilter !== "all" && playbook.objective !== playbookObjectiveFilter) return false;
      if (!search) return true;
      const haystack = normalizeSearchText(
        [playbook.title, playbook.description, playbook.tags.join(" "), playbook.messages.join(" ")].join(" ")
      );
      return haystack.includes(search);
    });
  }, [
    playbookSearch,
    playbookProMode,
    playbooks,
    playbookTierFilter,
    playbookMomentFilter,
    playbookObjectiveFilter,
  ]);

  const getTemplatePoolForTone = useCallback(
    (category: FanTemplateCategory, tone: FanTemplateTone | null, options?: { allowAnyFallback?: boolean }) => {
      const pool = fanTemplatePools[category] ?? [];
      if (!tone) return pool;
      const toneMatches = pool.filter((item) => item.tone === tone);
      const anyMatches = pool.filter((item) => !item.tone || item.tone === "any");
      let selectedPool = toneMatches.length > 0 ? toneMatches : anyMatches.length > 0 ? anyMatches : pool;
      if (options?.allowAnyFallback && selectedPool.length < 2) {
        const combined = [ ...toneMatches, ...anyMatches ].filter(
          (item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index
        );
        if (combined.length >= 2) {
          selectedPool = combined;
        } else if (pool.length >= 2) {
          selectedPool = pool;
        }
      }
      return selectedPool.length ? selectedPool : pool;
    },
    [fanTemplatePools]
  );

  const syncFanTemplateSelection = useCallback(
    (forceRandom: boolean) => {
      setFanTemplateSelection((prev) => {
        let changed = false;
        const next: FanTemplateSelection = { ...prev };
        FAN_TEMPLATE_CATEGORIES.forEach((category) => {
          const pool = getTemplatePoolForTone(category.id, templateTone);
          if (pool.length === 0) {
            if (next[category.id] !== null) {
              next[category.id] = null;
              changed = true;
            }
            return;
          }
          const current = forceRandom ? null : pool.find((item) => item.id === next[category.id]);
          if (!current) {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            next[category.id] = pick.id;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    },
    [getTemplatePoolForTone, templateTone]
  );

  const handleFanTemplateRotate = useCallback(
    (category: FanTemplateCategory) => {
      setFanTemplateSelection((prev) => {
        const pool = getTemplatePoolForTone(category, templateTone, { allowAnyFallback: true });
        if (pool.length === 0) return prev;
        const currentId = prev[category];
        const alternatives = pool.filter((item) => item.id !== currentId);
        const candidates = alternatives.length > 0 ? alternatives : pool;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        if (pick.id === currentId) return prev;
        return { ...prev, [category]: pick.id };
      });
    },
    [getTemplatePoolForTone, templateTone]
  );

  useEffect(() => {
    const isTemplatesOpen = managerPanelOpen && managerPanelTab === "templates";
    if (!isTemplatesOpen) {
      templatePanelOpenRef.current = false;
      return;
    }
    if (!templatePanelOpenRef.current) {
      templatePanelOpenRef.current = true;
      syncFanTemplateSelection(true);
    }
  }, [managerPanelOpen, managerPanelTab, syncFanTemplateSelection]);

  useEffect(() => {
    if (!managerPanelOpen || managerPanelTab !== "templates") return;
    syncFanTemplateSelection(false);
  }, [fanTemplatePools, templateTone, managerPanelOpen, managerPanelTab, syncFanTemplateSelection]);

  function buildFollowUpTrialMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} ¿cómo te han sentado estos días de prueba?\n\n` +
      "Tu período de prueba termina en breve. Si quieres que sigamos trabajando juntos, la suscripción mensual (25 €) incluye chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vais viviendo.\n\n" +
      "¿Quieres que te pase el enlace para entrar ya o prefieres primero contarme cómo te has sentido con estos días de prueba?"
    );
  }

  function buildFollowUpMonthlyMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} vengo a hacer un check rápido contigo.\n\n` +
      "Tu suscripción está a punto de renovarse. Antes de que eso pase, cuéntame en una frase: ¿qué ha sido lo más útil para ti este mes?\n\n" +
      "Si quieres que sigamos, te dejo el enlace de renovación: [pega aquí tu enlace].\n" +
      "Si sientes que hay algo que ajustar (ritmo, enfoque, tipo de contenido), dímelo y lo acomodamos."
    );
  }

  function buildFollowUpExpiredMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} he visto que tu acceso ya ha caducado y quería preguntarte algo antes de dejarlo aquí.\n\n` +
      "En estos días, ¿qué fue lo que más te movió o te ayudó de lo que hemos trabajado juntos?\n\n" +
      "Si notas que aún queda tema pendiente y quieres retomar, puedo proponerte tres opciones sencillas (audio puntual, pack especial o un mes de suscripción) y eliges lo que mejor encaje."
    );
  }

  async function handleQuickGreeting() {
    await handleQuickTemplateClick("welcome");
  }

  async function handleWelcomePack() {
    const welcomePackMessage =
      "Te propongo el Pack bienvenida (9 €): primer contacto + 3 audios base personalizados. Si te encaja, te envío el enlace de pago.";
    await fillMessageForFan(welcomePackMessage, "pack:welcome");
    setShowPackSelector(false);
    setOpenPanel("none");
  }

  function handleChoosePack(defaultType?: "trial" | "monthly" | "special") {
    if (defaultType) {
      setSelectedPackType(defaultType);
    }
    setShowPackSelector((prev) => (defaultType ? true : !prev));
    setOpenPanel("none");
  }

  function handleNextInQueue() {
    if (activeQueueFilter !== "ventas_hoy" || queueFans.length === 0) {
      showComposerToast("No hay cola activa.");
      return;
    }
    const currentIdx = queueStatus.index >= 0 ? queueStatus.index : -1;
    const nextIdx = currentIdx + 1;
    const nextFan = queueFans[nextIdx >= 0 ? nextIdx : 0];
    if (!nextFan) {
      showComposerToast("Cola terminada.");
      return;
    }
    setConversation(nextFan as any);
  }

  function handlePrevInQueue() {
    if (activeQueueFilter !== "ventas_hoy" || queueFans.length === 0) {
      showComposerToast("No hay cola activa.");
      return;
    }
    if (queueStatus.index <= 0) {
      showComposerToast("Estás al inicio de la cola.");
      return;
    }
    const prevFan = queueFans[queueStatus.index - 1];
    if (prevFan) {
      setConversation(prevFan as any);
    }
  }

  async function handleSubscriptionLink(options?: { focus?: boolean }) {
    const subscriptionLinkMessage =
      "Aquí tienes el enlace para la suscripción mensual (25 €):\n\n" +
      "👉 [pega aquí tu enlace]\n\n" +
      "Incluye: acceso al chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vas viviendo.\n" +
      "Si tienes alguna duda antes de entrar, dímelo y lo aclaramos.";
    if (options?.focus) {
      focusMainMessageInput(subscriptionLinkMessage, "pack:subscription_link");
    } else {
      await fillMessageForFan(subscriptionLinkMessage, "pack:subscription_link");
    }
    setShowPackSelector(false);
    setOpenPanel("none");
  }

  const [iaBlocked, setIaBlocked] = useState(false);
  const [iaMessage, setIaMessage] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    creditsAvailable: number;
    hardLimitPerDay: number | null;
    usedToday: number;
    remainingToday: number | null;
    limitReached: boolean;
    turnMode?: AiTurnMode;
    translateConfigured?: boolean;
    translateProvider?: string;
    translateMissingVars?: string[];
    creatorLang?: TranslationLanguage;
  } | null>(null);
  const [aiTone, setAiTone] = useState<AiTone>("cercano");
  const [aiTurnMode, setAiTurnMode] = useState<AiTurnMode>("auto");

  async function fetchAiStatus() {
    try {
      const data = await fetchJsonDedupe<any>(
        "cd:status",
        () => fetch("/api/creator/ai/status", { cache: "no-store" }),
        { ttlMs: 1200 }
      );
      const payload = data?.data ?? data;
      setAiStatus({
        creditsAvailable: payload.creditsAvailable ?? 0,
        hardLimitPerDay: payload.hardLimitPerDay ?? null,
        usedToday: payload.usedToday ?? 0,
        remainingToday: payload.remainingToday ?? null,
        limitReached: Boolean(payload.limitReached),
        turnMode: payload.turnMode as AiTurnMode | undefined,
        translateConfigured: Boolean(payload.translateConfigured),
        translateProvider: typeof payload.translateProvider === "string" ? payload.translateProvider : undefined,
        translateMissingVars: Array.isArray(payload.translateMissingVars)
          ? payload.translateMissingVars.filter((item: unknown) => typeof item === "string" && item.trim().length > 0)
          : [],
        creatorLang: normalizeTranslationLanguage(payload.creatorLang) ?? "es",
      });
      setIaBlocked(Boolean(payload.limitReached));
      if (typeof payload.turnMode === "string") {
        setAiTurnMode(normalizeAiTurnMode(payload.turnMode));
      }
    } catch (err) {
      console.error("Error obteniendo estado de IA", err);
    }
  }

  async function fetchAiSettingsTone() {
    try {
      const data = await fetchJsonDedupe<any>(
        "cd:ai-settings",
        () => fetch("/api/creator/ai-settings", { cache: "no-store" }),
        { ttlMs: 1200 }
      );
      const settingsPayload = data?.data?.settings ?? data?.settings;
      const tone = settingsPayload?.tone;
      if (typeof tone === "string" && tone.trim().length > 0) {
        setAiTone(normalizeTone(tone));
      }
      const mode = settingsPayload?.turnMode;
      if (typeof mode === "string") {
        setAiTurnMode(normalizeAiTurnMode(mode));
      }
    } catch (err) {
      console.error("Error obteniendo ajustes de IA", err);
    }
  }

  function getExtraTier(item?: ContentWithFlags | null): "T0" | "T1" | "T2" | "T3" {
    return (item?.extraTier as "T0" | "T1" | "T2" | "T3") ?? DEFAULT_EXTRA_TIER;
  }

  function getExtraPrice(item?: ContentWithFlags | null): number {
    const tier = getExtraTier(item);
    return EXTRA_PRICES[tier] ?? EXTRA_PRICES.T1;
  }

  async function registerExtraSale({
    fanId,
    extraId,
    amount,
    tier,
    sessionTag,
    source,
    clientTxnId,
    title,
  }: {
    fanId: string;
    extraId: string;
    amount: number;
    tier: "T0" | "T1" | "T2" | "T3";
    sessionTag?: string | null;
    source?: string | null;
    clientTxnId?: string | null;
    title?: string | null;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!fanId || !extraId) return { ok: false, error: "Datos incompletos." };
    try {
      const payload = {
        fanId,
        contentItemId: extraId,
        tier,
        amount,
        sessionTag,
        source,
        clientTxnId: clientTxnId ?? null,
      };
      const res = await fetch("/api/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const errText = typeof data?.error === "string" ? data.error : "";
        return { ok: false, error: errText || "No se pudo registrar el extra." };
      }
      const reused = data?.reused === true;
      const purchase = data?.purchase as
        | { id?: string; kind?: string; amount?: number; createdAt?: string; clientTxnId?: string | null }
        | undefined;
      if (!reused) {
        const prevExtrasCount = conversation.extrasCount ?? 0;
        const prevExtrasTotal = conversation.extrasSpentTotal ?? 0;
        const prevLifetime = conversation.lifetimeSpend ?? 0;
        const updatedExtrasCount = prevExtrasCount + 1;
        const updatedExtrasTotal = prevExtrasTotal + amount;
        const updatedLifetime = prevLifetime + amount;
        const updatedTier = getCustomerTierFromSpend(updatedLifetime);
        const updatedHighPriority = conversation.isHighPriority ?? false;
        setConversation({
          ...conversation,
          extrasCount: updatedExtrasCount,
          extrasSpentTotal: updatedExtrasTotal,
          lifetimeSpend: updatedLifetime,
          lifetimeValue: updatedLifetime,
          customerTier: updatedTier,
          isHighPriority: updatedHighPriority,
        });
        emitExtrasUpdated({
          fanId,
          totals: {
            extrasCount: updatedExtrasCount,
            extrasSpentTotal: updatedExtrasTotal,
            lifetimeSpend: updatedLifetime,
            lifetimeValue: updatedLifetime,
            customerTier: updatedTier,
            isHighPriority: updatedHighPriority,
          },
        });
        emitPurchaseCreated({
          fanId,
          fanName: contactName || undefined,
          amountCents: Math.round((purchase?.amount ?? amount) * 100),
          kind: purchase?.kind ?? "EXTRA",
          title: title ?? undefined,
          purchaseId: purchase?.id,
          createdAt: typeof purchase?.createdAt === "string" ? purchase.createdAt : undefined,
          clientTxnId: purchase?.clientTxnId ?? clientTxnId ?? undefined,
        });
      }
      await refreshFanData(fanId);
      await fetchExtrasHistory(fanId);
      return { ok: true };
    } catch (_err) {
      return { ok: false, error: "No se pudo registrar el extra." };
    }
  }

  async function logTemplateUsage(suggestedText: string, usage: AiTemplateUsage): Promise<boolean> {
    const actionType = ACTION_TYPE_FOR_USAGE[usage] ?? ACTION_TYPE_FOR_USAGE.extra_quick;
    try {
      const res = await fetch("/api/creator/ai/log-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: id,
          actionType,
          suggestedText,
          outcome: "suggested",
          creditsUsed: 1,
          turnMode: aiTurnMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 429 && data?.code === "AI_HARD_LIMIT_REACHED") {
          setIaMessage("Has alcanzado el límite diario de IA por hoy.");
          setIaBlocked(true);
          fetchAiStatus();
          return false;
        }
        if (res.status === 402 && data?.code === "AI_NO_CREDITS_LEFT") {
          setIaMessage("No te quedan créditos de IA disponibles.");
          setIaBlocked(true);
          fetchAiStatus();
          return false;
        }
        console.error("Error desconocido al registrar IA", data);
        return false;
      } else {
        setIaMessage(null);
        setIaBlocked(false);
        fetchAiStatus();
      }
    } catch (err) {
      console.error("Error al registrar uso de IA", err);
      setIaMessage("No se pudo registrar el uso de IA.");
      return false;
    }

    return true;
  }

  async function handleQuickExtraClick() {
    await handleQuickTemplateClick("extra_quick");
  }

  async function requestSuggestedText(usage: AiTemplateUsage, fallbackUsage?: AiTemplateUsage | null): Promise<string | null> {
    try {
      const res = await fetch("/api/creator/ai/quick-extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: aiTone, fanId: id, usage, fallbackUsage, mode: aiTurnMode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 404 && data?.error === "NO_TEMPLATES_FOR_USAGE") {
          setIaMessage("No hay plantillas activas para este uso.");
          return null;
        }
        console.error("Error obteniendo sugerencia IA", data);
        setIaMessage("No se pudo generar la sugerencia de IA.");
        return null;
      }

      const data = await res.json();
      const suggestedText = typeof data?.suggestedText === "string" ? data.suggestedText : "";
      if (!suggestedText) {
        setIaMessage("No se pudo generar la sugerencia de IA.");
        return null;
      }
      return suggestedText;
    } catch (err) {
      console.error("Error obteniendo sugerencia IA", err);
      setIaMessage("No se pudo generar la sugerencia de IA.");
      return null;
    }
  }

  async function handleQuickTemplateClick(usage: AiTemplateUsage) {
    setIaMessage(null);
    const suggestedText = await requestSuggestedText(usage, plan.suggestedUsage ?? undefined);
    if (!suggestedText) return;
    const enriched =
      usage === "pack_offer" && conversation.extraLadderStatus?.suggestedTier
        ? suggestedText.replace(/Pack especial/gi, `Pack especial ${conversation.extraLadderStatus.suggestedTier}`)
        : suggestedText;
    await fillMessageForFan(enriched, `template:${usage}`);
    await logTemplateUsage(enriched, usage);
    if (usage === "extra_quick") {
      const nextFilter = timeOfDay === "NIGHT" ? "night" : "day";
      setTimeOfDayFilter(nextFilter as TimeOfDayFilter);
      const suggestedTier = (conversation.extraLadderStatus?.suggestedTier as "T0" | "T1" | "T2" | "T3" | "T4" | null) ?? null;
      openContentModal({ mode: "extras", tier: suggestedTier, defaultRegisterExtras: true, registerSource: "offer_flow" });
    }
    if (usage === "pack_offer") {
      openContentModal({ mode: "packs", packFocus: "SPECIAL" });
    }
  }

  function openContentModal(options?: {
    mode?: "packs" | "extras" | "catalog";
    tier?: "T0" | "T1" | "T2" | "T3" | "T4" | null;
    packFocus?: "WELCOME" | "MONTHLY" | "SPECIAL" | null;
    defaultRegisterExtras?: boolean;
    registerSource?: string | null;
    selectedIds?: string[];
  }) {
    const nextMode = options?.mode ?? "packs";
    setContentModalMode(nextMode);
    setExtraTierFilter(options?.tier ?? null);
    setContentModalPackFocus(options?.packFocus ?? null);
    setRegisterExtrasChecked(options?.defaultRegisterExtras ?? false);
    setRegisterExtrasSource(options?.registerSource ?? null);
    setTransactionPrices({});
    setOpenPanel("none");
    setShowPackSelector(false);
    setSelectedContentIds(options?.selectedIds ?? []);
    if (nextMode !== "catalog") {
      fetchContentItems(id);
      if (id) fetchAccessGrants(id);
    }
    setShowContentModal(true);
  }

  const resolveChatTierForItem = (item: ContentWithFlags): ChatPpvTierValue | null => {
    if (item.chatTier) return item.chatTier;
    return resolveChatTierFromExtraTier(item.extraTier ?? null);
  };

  const resolvePpvCopyForItem = (item: ContentWithFlags, fallbackTier: ChatPpvTierValue) => {
    const rawCopy = typeof item.defaultCopy === "string" ? item.defaultCopy.trim() : "";
    if (rawCopy) return rawCopy;
    const tier = resolveChatTierForItem(item) ?? fallbackTier;
    return CHAT_PPV_DEFAULT_COPY[tier] ?? CHAT_PPV_DEFAULT_COPY.CHAT_T1;
  };

  const handleSelectPpvItem = async (item: ContentWithFlags) => {
    const resolvedTier = resolveChatTierForItem(item) ?? ppvTierFilter;
    const copy = resolvePpvCopyForItem(item, ppvTierFilter);
    await fillMessageForFan(copy, `ppv:${item.id}`);
    const extraTier = item.extraTier ?? resolveExtraTierFromChatTier(resolvedTier);
    setPpvTierMenuOpen(false);
    openContentModal({
      mode: "extras",
      tier: extraTier ?? null,
      selectedIds: [item.id],
      defaultRegisterExtras: false,
      registerSource: "offer_flow",
    });
  };

  function handleOpenExtrasPanel() {
    const nextFilter = timeOfDay === "NIGHT" ? "night" : "day";
    setTimeOfDayFilter(nextFilter as TimeOfDayFilter);
    openContentModal({ mode: "extras", tier: null, defaultRegisterExtras: false, registerSource: null });
  }

  async function fillMessageFromPackType(type: "trial" | "monthly" | "special") {
    const pack = findPackByType(type);
    if (pack) {
      await fillMessageForFan(buildPackProposalMessage(pack), `pack:${type}`);
    }
  }

  type FollowUpTemplate = {
    id: string;
    label: string;
    text: string;
  };

  function getFollowUpTemplates({
    followUpTag,
    daysLeft,
    fanName,
  }: {
    followUpTag: FollowUpTag;
    daysLeft: number | null | undefined;
    fanName: string;
  }): FollowUpTemplate[] {
    const first = getFirstName(fanName);

    if (followUpTag === "trial_soon") {
      return [
        {
          id: "trial-main",
          label: "Seguimiento prueba",
          text: buildFollowUpTrialMessage(first),
        },
      ];
    }

    if (followUpTag === "monthly_soon") {
      return [
        {
          id: "monthly-main",
          label: "Seguimiento suscripción",
          text: buildFollowUpMonthlyMessage(first),
        },
      ];
    }

    if (followUpTag === "expired") {
      return [
        {
          id: "expired-main",
          label: "Seguimiento caducado",
          text: buildFollowUpExpiredMessage(first),
        },
      ];
    }

    return [];
  }

  const fetchAccessGrants = useCallback(async (fanId: string) => {
    try {
      setAccessGrantsLoading(true);
      const data = await fetchJsonDedupe<any>(
        `cd:${fanId}:grant`,
        () => fetch(`/api/access/grant?fanId=${fanId}`),
        { ttlMs: 1200 }
      );
      const grants = Array.isArray(data.activeGrants)
        ? data.activeGrants
        : Array.isArray(data.grants)
        ? data.grants
        : [];
      setAccessGrants(grants);
    } catch (_err) {
      setAccessGrants([]);
    } finally {
      setAccessGrantsLoading(false);
    }
  }, []);

  const fetchFanProfile = useCallback(async (fanId: string) => {
    try {
      setProfileLoading(true);
      setProfileError("");
      const data = await fetchJsonDedupe<any>(
        `cd:${fanId}:profile`,
        () => fetch(`/api/fans/profile?fanId=${fanId}`, { cache: "no-store" }),
        { ttlMs: 1200 }
      );
      if (!data?.ok) throw new Error("error");
      const nextProfile = typeof data.profileText === "string" ? data.profileText : "";
      setProfileText(nextProfile);
      if (!profileDraftEditedRef.current) {
        setProfileDraft(nextProfile);
      }
    } catch (_err) {
      setProfileError("Error cargando perfil");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const fetchFollowUpOpen = useCallback(async (fanId: string) => {
    try {
      setFollowUpLoading(true);
      setFollowUpError("");
      const data = await fetchJsonDedupe<any>(
        `cd:${fanId}:followup`,
        () => fetch(`/api/fans/follow-up?fanId=${fanId}`),
        { ttlMs: 1200 }
      );
      if (!data?.ok) throw new Error("error");
      setFollowUpOpen(data.followUp ?? null);
    } catch (_err) {
      setFollowUpError("Error cargando seguimiento");
      setFollowUpOpen(null);
    } finally {
      setFollowUpLoading(false);
    }
  }, []);

  const fetchFollowUpHistory = useCallback(async (fanId: string) => {
    try {
      setFollowUpHistoryLoading(true);
      setFollowUpHistoryError("");
      const data = await fetchJsonDedupe<any>(
        `cd:${fanId}:history`,
        () => fetch(`/api/fans/follow-up/history?fanId=${fanId}`),
        { ttlMs: 1200 }
      );
      if (!data?.ok) throw new Error("error");
      const history = Array.isArray(data.history) ? data.history : [];
      setFollowUpHistory(history);
    } catch (_err) {
      setFollowUpHistory([]);
      setFollowUpHistoryError("Error cargando historial");
    } finally {
      setFollowUpHistoryLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(
    async (fanId: string) => {
      try {
        setHistoryError("");
        setPurchaseHistoryLoading(true);
        const params = new URLSearchParams({ fanId });
        if (showArchivedPurchases) {
          params.set("includeArchived", "1");
        }
        const res = await fetch(`/api/fans/purchases?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error("error");
        const history = Array.isArray(data.history) ? data.history : [];
        setPurchaseHistory(history);
      } catch (_err) {
        setHistoryError("Error cargando historial");
        setPurchaseHistory([]);
      } finally {
        setPurchaseHistoryLoading(false);
      }
    },
    [showArchivedPurchases]
  );

  async function handleTogglePurchaseArchive(entry: { id: string; isArchived?: boolean }) {
    if (!entry?.id || purchaseArchiveBusyId === entry.id) return;
    const fanId = id;
    const nextArchived = !entry.isArchived;
    setPurchaseArchiveBusyId(entry.id);
    setPurchaseHistory((prev) =>
      prev.map((item) => (item.id === entry.id ? { ...item, isArchived: nextArchived } : item))
    );
    try {
      const res = await fetch(`/api/fans/purchases/${entry.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: nextArchived }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error("archive_failed");
      const finalArchived =
        typeof data?.purchase?.isArchived === "boolean" ? data.purchase.isArchived : nextArchived;
      setPurchaseHistory((prev) =>
        prev.map((item) => (item.id === entry.id ? { ...item, isArchived: finalArchived } : item))
      );
      if (fanId) {
        await refreshFanData(fanId);
        void fetchHistory(fanId);
      }
      if (typeof window !== "undefined") {
        emitCreatorDataChanged({ reason: "purchase_archived_or_restored", fanId });
      }
      showComposerToast(finalArchived ? "Compra archivada" : "Compra restaurada");
    } catch (err) {
      console.error("Error updating purchase archive", err);
      setHistoryError("No se pudo archivar la compra.");
      setPurchaseHistory((prev) =>
        prev.map((item) => (item.id === entry.id ? { ...item, isArchived: entry.isArchived } : item))
      );
    } finally {
      setPurchaseArchiveBusyId(null);
    }
  }

  const fetchContentItems = useCallback(async (targetFanId?: string) => {
    try {
      setContentLoading(true);
      setContentError("");
      const url = targetFanId ? `/api/content?fanId=${encodeURIComponent(targetFanId)}` : "/api/content";
      const dedupeKey = targetFanId ? `cd:${targetFanId}:content` : "cd:content";
      const data = await fetchJsonDedupe<any>(dedupeKey, () => fetch(url), { ttlMs: 1200 });
      const items = Array.isArray(data.items) ? (data.items as ContentWithFlags[]) : [];
      setContentItems(items);
    } catch (_err) {
      setContentError("Error cargando contenidos");
      setContentItems([]);
    } finally {
      setContentLoading(false);
    }
  }, []);

  const resolveCreatorId = useCallback(async () => {
    if (creatorId) return creatorId;
    try {
      const res = await fetch("/api/creator");
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      const idValue = typeof data?.creator?.id === "string" ? data.creator.id : null;
      if (idValue) {
        setCreatorId(idValue);
      }
      return idValue;
    } catch (_err) {
      return null;
    }
  }, [creatorId]);

  const fetchCatalogItems = useCallback(async () => {
    if (catalogLoadingRef.current) return;
    catalogLoadingRef.current = true;
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const resolvedCreatorId = await resolveCreatorId();
      if (!resolvedCreatorId) {
        setCatalogError("No se pudo cargar el catalogo.");
        setCatalogItems([]);
        return;
      }
      const res = await fetch(`/api/catalog?creatorId=${encodeURIComponent(resolvedCreatorId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("error");
      const rawItems = Array.isArray(data)
        ? (data as CatalogItem[])
        : Array.isArray(data.items)
        ? (data.items as CatalogItem[])
        : [];
      const items = rawItems.map((raw) => {
        const item = raw as CatalogItem;
        const includes = Array.isArray(item.includes)
          ? item.includes.filter((entry): entry is string => typeof entry === "string")
          : [];
        return {
          ...item,
          includes,
          isPublic: typeof item.isPublic === "boolean" ? item.isPublic : true,
        };
      });
      setCatalogItems(items as CatalogItem[]);
    } catch (_err) {
      setCatalogError("No se pudo cargar el catalogo.");
      setCatalogItems([]);
    } finally {
      catalogLoadingRef.current = false;
      setCatalogLoading(false);
    }
  }, [resolveCreatorId]);

  async function fetchExtrasHistory(fanId: string) {
    try {
      setExtraHistoryError("");
      setIsLoadingExtraHistory(true);
      const res = await fetch(`/api/extras?fanId=${fanId}`);
      if (!res.ok) {
        console.error("Error fetching extras", res.statusText);
        setExtraHistory([]);
        setExtraHistoryError("");
        return;
      }
      const data = await res.json();
      const history = Array.isArray(data.history) ? data.history : [];
      setExtraHistory(history);
    } catch (_err) {
      setExtraHistory([]);
      setExtraHistoryError("");
    } finally {
      setIsLoadingExtraHistory(false);
    }
  }

  async function refreshFanData(fanId: string) {
    try {
      const res = await fetch(`/api/fans?fanId=${encodeURIComponent(fanId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) return;
      if (!res.ok || !data?.ok) throw new Error("error");
      const rawFans = Array.isArray(data.items)
        ? (data.items as Fan[])
        : Array.isArray(data.fans)
        ? (data.fans as Fan[])
        : [];
      const targetFan = rawFans.find((fan) => fan.id === fanId);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("fanDataUpdated", { detail: { fans: rawFans } }));
      }

      if (targetFan) {
        const prev = conversation;
        setConversation({
          ...prev,
          id: targetFan.id,
          contactName: getFanDisplayNameForCreator(targetFan),
          displayName: targetFan.displayName ?? prev.displayName ?? null,
          creatorLabel: targetFan.creatorLabel ?? prev.creatorLabel ?? null,
          locale: targetFan.locale ?? prev.locale ?? null,
          preferredLanguage: normalizePreferredLanguage(targetFan.preferredLanguage) ?? null,
          membershipStatus: targetFan.membershipStatus,
          daysLeft: targetFan.daysLeft,
          activeGrantTypes: targetFan.activeGrantTypes ?? prev.activeGrantTypes,
          hasAccessHistory: targetFan.hasAccessHistory ?? prev.hasAccessHistory,
          lastSeen: targetFan.lastSeen || prev.lastSeen,
          lastSeenAt: (targetFan as any).lastSeenAt ?? prev.lastSeenAt ?? null,
          lastTime: targetFan.time || prev.lastTime,
          image: targetFan.avatar || prev.image,
          followUpTag: getFollowUpTag(targetFan.membershipStatus, targetFan.daysLeft, targetFan.activeGrantTypes),
          lastCreatorMessageAt: targetFan.lastCreatorMessageAt ?? prev.lastCreatorMessageAt,
          notesCount: targetFan.notesCount ?? prev.notesCount,
          profileText: targetFan.profileText ?? prev.profileText ?? null,
          quickNote: targetFan.quickNote ?? prev.quickNote ?? null,
          followUpOpen: targetFan.followUpOpen ?? prev.followUpOpen ?? null,
          nextAction: targetFan.nextAction ?? prev.nextAction,
          nextActionAt: targetFan.nextActionAt ?? prev.nextActionAt ?? null,
          nextActionNote: targetFan.nextActionNote ?? prev.nextActionNote ?? null,
          lastGrantType: (targetFan as any).lastGrantType ?? prev.lastGrantType ?? null,
          extrasCount: targetFan.extrasCount ?? prev.extrasCount,
          extrasSpentTotal: targetFan.extrasSpentTotal ?? prev.extrasSpentTotal,
          tipsCount: targetFan.tipsCount ?? (prev as any).tipsCount,
          tipsSpentTotal: targetFan.tipsSpentTotal ?? (prev as any).tipsSpentTotal,
          giftsCount: (targetFan as any).giftsCount ?? (prev as any).giftsCount,
          giftsSpentTotal: (targetFan as any).giftsSpentTotal ?? (prev as any).giftsSpentTotal,
          lifetimeSpend: targetFan.lifetimeSpend ?? (prev as any).lifetimeSpend ?? targetFan.lifetimeValue ?? prev.lifetimeValue,
          lifetimeValue: targetFan.lifetimeValue ?? prev.lifetimeValue,
          totalSpent:
            (targetFan as any).totalSpent ??
            targetFan.lifetimeSpend ??
            targetFan.lifetimeValue ??
            (prev as any).totalSpent,
          recent30dSpent: (targetFan as any).recent30dSpent ?? (prev as any).recent30dSpent,
          maxExtraTier: (targetFan as any).maxExtraTier ?? prev.maxExtraTier,
          novsyStatus: (targetFan as any).novsyStatus ?? prev.novsyStatus ?? null,
          isHighPriority: (targetFan as any).isHighPriority ?? prev.isHighPriority ?? false,
          highPriorityAt: (targetFan as any).highPriorityAt ?? prev.highPriorityAt ?? null,
          extraLadderStatus:
            "extraLadderStatus" in targetFan
              ? ((targetFan as any).extraLadderStatus ?? null)
              : prev.extraLadderStatus ?? null,
          extraSessionToday:
            "extraSessionToday" in targetFan
              ? ((targetFan as any).extraSessionToday ?? null)
              : (prev as any).extraSessionToday ?? null,
        });
      }
      setSchemaError(null);
    } catch (_err) {
      // silent fail; UI remains with previous data
    }
  }

  const messagesAbortRef = useRef<AbortController | null>(null);

  const handleCopySchemaFix = useCallback(async () => {
    if (!schemaError) return;
    const commands = schemaError.fix?.length ? schemaError.fix : DB_SCHEMA_OUT_OF_SYNC_FIX;
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setSchemaCopyState("copied");
    } catch (_err) {
      setSchemaCopyState("error");
    }
    if (schemaCopyTimer.current) {
      clearTimeout(schemaCopyTimer.current);
    }
    schemaCopyTimer.current = setTimeout(() => {
      setSchemaCopyState("idle");
    }, 1600);
  }, [schemaError]);

  const fetchMessages = useCallback(
    async (fanId: string, shouldShowLoading = false) => {
      if (!fanId) return;
      if (messagesAbortRef.current) {
        messagesAbortRef.current.abort();
      }
      const controller = new AbortController();
      messagesAbortRef.current = controller;
      try {
        if (shouldShowLoading) {
          setIsLoadingMessages(true);
        }
        setMessagesError("");
        const shouldMarkRead = true;
        const params = new URLSearchParams({ fanId, audiences: "FAN,CREATOR" });
        if (shouldMarkRead) {
          params.set("markRead", "1");
        }
        recordDevRequest("messages");
        const res = await fetch(`/api/messages?${params.toString()}`, {
          signal: controller.signal,
          headers: { "x-novsy-viewer": "creator" },
        });
        const data = await res.json().catch(() => ({}));
        if (handleSchemaOutOfSync(data)) return;
        if (!res.ok || !data?.ok) throw new Error(data?.error || "error");
        const source = Array.isArray(data.items)
          ? (data.items as ApiMessage[])
          : Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : [];
        const visible = source.filter((msg) => isVisibleToFan(msg));
        const mapped = mapApiMessagesToState(visible);
        setMessage((prev) => reconcileMessages(prev || [], mapped, fanId));
        if (shouldMarkRead) {
          publishChatEvent({ type: "thread_read", threadId: fanId });
        }
        setSchemaError(null);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setMessagesError("Error cargando mensajes");
      } finally {
        if (shouldShowLoading) {
          setIsLoadingMessages(false);
        }
      }
    },
    [handleSchemaOutOfSync, mapApiMessagesToState, setMessage]
  );

  const fetchInternalMessages = useCallback(
    async (shouldShowLoading = false) => {
      if (!id) return;
      if (internalMessagesAbortRef.current) {
        internalMessagesAbortRef.current.abort();
      }
      const controller = new AbortController();
      internalMessagesAbortRef.current = controller;
      try {
        if (shouldShowLoading) {
          setIsLoadingInternalMessages(true);
        }
        setInternalMessagesError("");
        const params = new URLSearchParams({ fanId: id, audiences: "INTERNAL" });
        recordDevRequest("messages");
        const res = await fetch(`/api/messages?${params.toString()}`, {
          signal: controller.signal,
          headers: { "x-novsy-viewer": "creator" },
        });
        const data = await res.json().catch(() => ({}));
        if (handleSchemaOutOfSync(data)) return;
        if (!res.ok || !data?.ok) throw new Error(data?.error || "error");
        const source = Array.isArray(data.items)
          ? (data.items as ApiMessage[])
          : Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : [];
        const internalOnly = source.filter((msg) => deriveAudience(msg) === "INTERNAL");
        setInternalMessages((prev) => reconcileApiMessages(prev, internalOnly, id));
        setSchemaError(null);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setInternalMessagesError("Error cargando mensajes internos");
      } finally {
        if (shouldShowLoading) {
          setIsLoadingInternalMessages(false);
        }
      }
    },
    [handleSchemaOutOfSync, id]
  );

  useEffect(() => {
    if (!id) return;
    setMessage([]);
    fetchMessages(id, true);
    return () => {
      if (messagesAbortRef.current) {
        messagesAbortRef.current.abort();
      }
    };
  }, [fetchMessages, id, setMessage]);

  useEffect(() => {
    setSchemaError(null);
    setSchemaCopyState("idle");
    setInternalToast(null);
    if (internalToastTimer.current) {
      clearTimeout(internalToastTimer.current);
    }
    setActionToast(null);
    if (actionToastTimer.current) {
      clearTimeout(actionToastTimer.current);
    }
    setVoiceNotice(null);
    if (voiceNoticeTimerRef.current) {
      clearTimeout(voiceNoticeTimerRef.current);
      voiceNoticeTimerRef.current = null;
    }
    setInlineAction(null);
    if (inlineActionTimerRef.current) {
      clearTimeout(inlineActionTimerRef.current);
      inlineActionTimerRef.current = null;
    }
  }, [id]);

  useEffect(() => {
    setInternalMessages([]);
    setInternalMessagesError("");
    if (internalMessagesAbortRef.current) {
      internalMessagesAbortRef.current.abort();
    }
  }, [id]);

  useEffect(() => {
    if (!id || !managerPanelOpen) return;
    if (managerPanelTab !== "manager") return;
    const includeContext = includeInternalContextByFan[id] ?? true;
    if (
      internalPanelTab !== "internal" &&
      !(internalPanelTab === "manager" && includeContext)
    ) {
      return;
    }
    fetchInternalMessages(true);
    return () => {
      if (internalMessagesAbortRef.current) {
        internalMessagesAbortRef.current.abort();
      }
    };
  }, [
    fetchInternalMessages,
    id,
    managerPanelTab,
    internalPanelTab,
    includeInternalContextByFan,
    managerPanelOpen,
  ]);

  useEffect(() => {
    if (draftAppliedFanIdRef.current && draftAppliedFanIdRef.current !== conversation.id) {
      draftAppliedFanIdRef.current = null;
    }
    const preserveDraft = draftAppliedFanIdRef.current === conversation.id;
    if (!preserveDraft) {
      setMessageSend("");
      setComposerActionKey(null);
    }
    setInternalDraftInput("");
    setShowPackSelector(false);
    setOpenPanel("none");
    setProfileText(conversation.profileText ?? "");
    setProfileDraft(conversation.profileText ?? "");
    setQuickNote(conversation.quickNote ?? "");
    setQuickNoteDraft(conversation.quickNote ?? "");
    setQuickNoteEditing(false);
    setFollowUpOpen(conversation.followUpOpen ?? null);
    setFollowUpHistory([]);
    profileDraftEditedRef.current = false;
    setProfileError("");
    setQuickNoteError("");
    setFollowUpError("");
    setFollowUpHistoryError("");
    setManagerSelectedText(null);
    const derivedPack = derivePackFromLabel(membershipStatus || accessLabel) || "monthly";
    setSelectedPackType(derivedPack);
  }, [accessLabel, conversation.id, conversation.followUpOpen, conversation.profileText, conversation.quickNote, membershipStatus]);

  useEffect(() => {
    if (!id) {
      setCortexFlow(null);
      return;
    }
    const stored = readCortexFlow();
    if (stored && stored.currentFanId === id) {
      setCortexFlow(stored);
      setCortexFlowAutoNext(stored.autoNext ?? true);
      return;
    }
    setCortexFlow(null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const pendingDraft = pendingComposerDraftRef.current;
    if (pendingDraft) {
      const targetFanId = pendingComposerDraftFanIdRef.current;
      if (!targetFanId || targetFanId === id) {
        pendingComposerDraftRef.current = null;
        pendingComposerDraftFanIdRef.current = null;
        if (applyComposerDraft(pendingDraft)) return;
      }
    }
    const storedDraft = consumeDraft({ target: "fan", fanId: id });
    if (storedDraft?.text) {
      applyComposerDraft(
        storedDraft.text,
        storedDraft.insertMode === "append" ? "append" : "replace",
        storedDraft.actionKey ?? null
      );
    }
  }, [applyComposerDraft, id]);

  useEffect(() => {
    const normalized = normalizePreferredLanguage(conversation.preferredLanguage) ?? null;
    setPreferredLanguage(normalized);
    setPreferredLanguageError(null);
  }, [conversation.preferredLanguage, showQuickSheet]);

  useEffect(() => {
    if (!id) return;
    fetchAccessGrants(id);
  }, [fetchAccessGrants, id]);

  useEffect(() => {
    if (id) {
      fetchContentItems(id);
    }
  }, [fetchContentItems, id]);

  useEffect(() => {
    if (!id) return;
    fetchFanProfile(id);
    fetchFollowUpOpen(id);
    fetchFollowUpHistory(id);
  }, [id, fetchFanProfile, fetchFollowUpOpen, fetchFollowUpHistory]);

  useEffect(() => {
    if (!id || openPanel !== "history") return;
    fetchHistory(id);
  }, [id, openPanel, fetchHistory]);

  useEffect(() => {
    if (!id || openPanel !== "extras") return;
    fetchExtrasHistory(id);
  }, [id, openPanel]);

  useEffect(() => {
    setInviteCopyState("idle");
    setInviteCopyError(null);
    setInviteCopyUrl(null);
  }, [id, showQuickSheet]);

  useEffect(() => {
    if (!showContentModal) return;
    if (contentModalMode !== "extras") return;
    if (selectedContentIds.length > 0) return;
    const firstMatch = contentItems.find((item) => {
      const isExtraItem = item.isExtra === true || item.visibility === "EXTRA";
      if (!isExtraItem) return false;
      const matchesTier =
        !extraTierFilter || item.extraTier === extraTierFilter || item.extraTier === null;
      const matchesTime =
        timeOfDayFilter === "all" ||
        item.timeOfDay === "ANY" ||
        (timeOfDayFilter === "day" && item.timeOfDay === "DAY") ||
        (timeOfDayFilter === "night" && item.timeOfDay === "NIGHT");
      return matchesTier && matchesTime;
    });
    if (firstMatch) {
      setSelectedContentIds([firstMatch.id]);
    }
  }, [showContentModal, contentModalMode, contentItems, extraTierFilter, timeOfDayFilter, selectedContentIds.length]);

  useEffect(() => {
    if (!showContentModal) return;
    if (contentModalMode !== "catalog") return;
    void fetchCatalogItems();
  }, [showContentModal, contentModalMode, fetchCatalogItems]);

  useEffect(() => {
    if (!showContentModal) return;
    if (contentModalMode !== "catalog") return;
    setCatalogSearch("");
    setCatalogTypeFilter("all");
  }, [showContentModal, contentModalMode]);

  useEffect(() => {
    if (!ppvTierMenuOpen) return;
    if (contentItems.length === 0 && !contentLoading) {
      fetchContentItems(id);
    }
  }, [ppvTierMenuOpen, contentItems.length, contentLoading, fetchContentItems, id]);

  useEffect(() => {
    if (!ppvTierMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (ppvTierMenuRef.current?.contains(target)) return;
      if (ppvTierButtonRef.current?.contains(target)) return;
      setPpvTierMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPpvTierMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ppvTierMenuOpen]);

  useEffect(() => {
    fetchAiStatus();
    fetchAiSettingsTone();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setTranslationPreviewOpen(false);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const loadFanTemplatePools = async () => {
      try {
        const data = await fetchJsonDedupe<any>("cd:templates", () => fetch("/api/creator/ai/templates"), {
          ttlMs: 1200,
        });
        if (!cancelled) {
          const merged = buildFanTemplatePoolsFromApi(data?.templates, LOCAL_FAN_TEMPLATE_POOLS);
          setFanTemplatePools(merged);
          setApiPlaybooks(buildPlaybooksFromApi(data?.templates));
        }
      } catch (err) {
        if (!cancelled) {
          setFanTemplatePools(LOCAL_FAN_TEMPLATE_POOLS);
          setApiPlaybooks([]);
        }
      }
    };
    loadFanTemplatePools();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!highlightDraftId) return;
    if (!managerPanelOpen || internalPanelTab !== "internal") return;
    const target = document.querySelector<HTMLElement>(`[data-draft-id="${highlightDraftId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("ring-2", "ring-[color:var(--ring)]", "ring-offset-2", "ring-offset-[color:var(--surface-1)]");
      setTimeout(() => {
        target.classList.remove("ring-2", "ring-[color:var(--ring)]", "ring-offset-2", "ring-offset-[color:var(--surface-1)]");
      }, 1600);
    }
    const timer = setTimeout(() => setHighlightDraftId(null), 1800);
    return () => clearTimeout(timer);
  }, [highlightDraftId, internalPanelTab, managerPanelOpen]);

  useEffect(() => {
    if (!managerPanelOpen || managerPanelTab !== "manager") return;
    if (internalPanelTab !== "manager") return;
    focusManagerComposer(true);
  }, [managerPanelOpen, managerPanelTab, internalPanelTab, focusManagerComposer]);

  useEffect(() => {
    if (!managerPanelOpen && !inlineAction) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (managerPanelOpen) {
          closeInlinePanel();
        }
        if (inlineAction) {
          clearInlineAction();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [managerPanelOpen, inlineAction, closeInlinePanel, clearInlineAction]);

  useEffect(() => {
    if (!managerPanelOpen) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      const sheet = dockOverlaySheetRef.current;
      if (!sheet || !target) return;
      if (sheet.contains(target)) return;
      closeInlinePanel({ focus: true });
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [managerPanelOpen, closeInlinePanel]);

  useEffect(() => {
    closeOverlays({ keepManagerPanel: true });
    setMessageActionSheet(null);
    setMessageTranslationPopover(null);
    setHighlightDraftId(null);
    if (!managerPanelOpen) {
      setInternalPanelTab("manager");
    }
  }, [conversation.id, closeOverlays, managerPanelOpen]);

  useEffect(() => {
    if (!conversation?.id) return;
    setComposerTarget("fan");
  }, [conversation.id, conversation.isManager]);

  useEffect(() => {
    profileDraftEditedRef.current = false;
    setProfileDraft("");
  }, [conversation.id]);

  useEffect(() => {
    managerPanelScrollTopRef.current = 0;
    managerPanelStickToBottomRef.current = false;
    internalChatScrollTopRef.current = 0;
    internalChatStickToBottomRef.current = true;
    internalChatForceScrollRef.current = false;
  }, [conversation.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleConversationChanging = () => {
      closeOverlays({ keepManagerPanel: true });
    };
    window.addEventListener("novsy:conversation:changing", handleConversationChanging as EventListener);
    return () => {
      window.removeEventListener("novsy:conversation:changing", handleConversationChanging as EventListener);
    };
  }, [closeOverlays]);

  const handleRealtimeMessage = useCallback(
    (detail: FanMessageSentPayload) => {
      if (!detail?.fanId || detail.fanId !== id) return;
      if (conversation.isManager) return;
      if (detail.eventId && messageEventIdsRef.current.has(detail.eventId)) return;
      const rawMessage = detail.message as ApiMessage | undefined;
      if (detail.kind === "audio" && detail.from === "fan") {
        const durationMs =
          typeof detail.durationMs === "number"
            ? detail.durationMs
            : typeof rawMessage?.audioDurationMs === "number"
            ? rawMessage.audioDurationMs
            : undefined;
        const fanName = (getFanDisplayNameForCreator(conversation) || contactName || "Fan").trim() || "Fan";
        showVoiceNotice({
          fanName,
          durationMs,
          createdAt: typeof detail.sentAt === "string" ? detail.sentAt : new Date().toISOString(),
        });
      }
      if (rawMessage) {
        if (deriveAudience(rawMessage) === "INTERNAL") return;
        if (detail.eventId) {
          messageEventIdsRef.current.add(detail.eventId);
        }
        const mapped = mapApiMessagesToState([rawMessage]);
        if (mapped.length > 0) {
          setMessage((prev) => reconcileMessages(prev || [], mapped, id));
          return;
        }
      }
      fetchMessages(detail.fanId, false);
    },
    [conversation, contactName, fetchMessages, id, mapApiMessagesToState, setMessage, showVoiceNotice]
  );

  const handleVoiceTranscriptUpdated = useCallback(
    (detail: {
      fanId?: string;
      messageId?: string;
      transcriptText?: string | null;
      transcriptStatus?: string;
      transcriptError?: string | null;
      transcribedAt?: string;
      transcriptLang?: string | null;
      intentJson?: unknown;
    }) => {
      if (!detail?.fanId || detail.fanId !== id) return;
      if (conversation.isManager) return;
      const messageId = typeof detail.messageId === "string" ? detail.messageId : "";
      if (!messageId) return;
      setMessage((prev) => {
        if (!prev || prev.length === 0) return prev;
        return prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const rawStatus = detail.transcriptStatus;
          const normalizedStatus =
            rawStatus === "OFF" || rawStatus === "PENDING" || rawStatus === "DONE" || rawStatus === "FAILED"
              ? rawStatus
              : undefined;
          return {
            ...msg,
            transcriptText: typeof detail.transcriptText === "string" ? detail.transcriptText : null,
            transcriptStatus: normalizedStatus ?? msg.transcriptStatus ?? null,
            transcriptError:
              typeof detail.transcriptError === "string" ? detail.transcriptError : msg.transcriptError ?? null,
            transcribedAt:
              typeof detail.transcribedAt === "string" ? detail.transcribedAt : msg.transcribedAt ?? null,
            transcriptLang:
              typeof detail.transcriptLang === "string" ? detail.transcriptLang : msg.transcriptLang ?? null,
            intentJson: detail.intentJson !== undefined ? (detail.intentJson as any) : msg.intentJson ?? null,
          };
        });
      });
    },
    [conversation.isManager, id, setMessage]
  );

  const requestTranscriptRetry = useCallback(
    async (messageId: string) => {
      if (!messageId) return;
      setMessage((prev) => {
        if (!prev) return prev;
        return prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                transcriptStatus: "PENDING",
                transcriptError: null,
                transcribedAt: null,
              }
            : msg
        );
      });
      const res = await fetch(`/api/voice-notes/transcribe/${messageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const errorMessage =
          typeof data?.error === "string" && data.error.trim().length > 0
            ? data.error
            : `Error ${res.status}`;
        setMessage((prev) => {
          if (!prev) return prev;
          return prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  transcriptStatus: "FAILED",
                  transcriptError: errorMessage,
                  transcribedAt: null,
                }
              : msg
          );
        });
        throw new Error(errorMessage);
      }
    },
    [setMessage]
  );

  const handleManualTranscriptSaved = useCallback(
    (messageId: string, transcript: string) => {
      const trimmed = transcript.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      setMessage((prev) => {
        if (!prev) return prev;
        return prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                transcriptText: trimmed,
                transcriptStatus: "DONE",
                transcriptError: null,
                transcribedAt: now,
              }
            : msg
        );
      });
    },
    [setMessage]
  );

  const handleVoiceAnalysisSaved = useCallback(
    (messageId: string, analysis: VoiceAnalysis) => {
      if (!messageId) return;
      const updatedAt = analysis.updatedAt ?? new Date().toISOString();
      setMessage((prev) => {
        if (!prev) return prev;
        return prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                voiceAnalysisJson: mergeVoiceInsightsJson(msg.voiceAnalysisJson, { analysis }),
                voiceAnalysisUpdatedAt: updatedAt,
              }
            : msg
        );
      });
    },
    [setMessage]
  );

  const handleVoiceTranslationSaved = useCallback(
    (messageId: string, translation: VoiceTranslation) => {
      if (!messageId) return;
      setMessage((prev) => {
        if (!prev) return prev;
        return prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                voiceTranslation: translation,
              }
            : msg
        );
      });
    },
    [setMessage]
  );

  const handleMessageTranslationSaved = useCallback(
    (messageId: string, translatedText: string, detectedSourceLang?: string | null, targetLang?: string | null) => {
      const trimmed = translatedText.trim();
      if (!messageId || !trimmed) return;
      setMessage((prev) => {
        if (!prev) return prev;
        return prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                translatedText: trimmed,
                translationSourceLang: detectedSourceLang ?? null,
                translationTargetLang: targetLang ?? msg.translationTargetLang ?? null,
              }
            : msg
        );
      });
    },
    [setMessage]
  );

  const handlePurchaseCreated = useCallback(
    (detail: PurchaseCreatedPayload) => {
      if (!detail?.fanId || typeof detail.amountCents !== "number" || !detail.kind) return;
      if (conversation.isManager || detail.fanId !== id) return;
      const eventId = resolvePurchaseEventId(detail);
      showPurchaseNotice({
        count: 1,
        totalAmountCents: detail.amountCents,
        kind: detail.kind?.toString().toUpperCase() ?? "EXTRA",
        title: detail.title,
        createdAt: detail.createdAt,
        fanName: typeof detail.fanName === "string" ? detail.fanName : undefined,
        purchaseIds: eventId ? [eventId] : [],
      });
    },
    [conversation.isManager, id, showPurchaseNotice]
  );

  useCreatorRealtime({
    onPurchaseCreated: handlePurchaseCreated,
    onFanMessageSent: handleRealtimeMessage,
    onVoiceTranscriptUpdated: handleVoiceTranscriptUpdated,
  });

  useEffect(() => {
    if (!id || conversation.isManager) {
      setPurchaseNotice(null);
      return;
    }
    const pending = consumePendingPurchaseNotice(id);
    const unseen = consumeUnseenPurchase(id);
    if (!pending && !unseen) {
      setPurchaseNotice(null);
      return;
    }
    const fallbackName = purchaseNoticeFallbackNameRef.current;
    const fanName = (pending?.fanName || unseen?.last?.fanName || "").trim() || fallbackName;
    const kind = (pending?.kind || unseen?.last?.kind || "EXTRA").toString().toUpperCase();
    const title = pending?.title ?? unseen?.last?.title;
    const createdAt = pending?.createdAt ?? unseen?.last?.createdAt;
    const totalAmountCents =
      typeof unseen?.totalAmountCents === "number"
        ? unseen.totalAmountCents
        : typeof pending?.amountCents === "number"
        ? pending.amountCents
        : 0;
    const purchaseIds =
      unseen?.purchaseIds && unseen.purchaseIds.length > 0
        ? unseen.purchaseIds
        : pending?.eventId
        ? [pending.eventId]
        : pending?.purchaseId
        ? [pending.purchaseId]
        : [];
    showPurchaseNotice({
      count: unseen?.count ?? 1,
      totalAmountCents,
      kind,
      title,
      createdAt,
      purchaseIds,
      fanName,
    });
    if (purchaseIds.length > 0) {
      emitPurchaseSeen({ fanId: id, purchaseIds });
    }
    return () => {
      if (purchaseNoticeTimerRef.current) {
        clearTimeout(purchaseNoticeTimerRef.current);
        purchaseNoticeTimerRef.current = null;
      }
    };
  }, [conversation.isManager, id, showPurchaseNotice]);

  useEffect(() => {
    if (!purchaseNotice) return;
    const handleDismiss = () => {
      if (Date.now() - purchaseNoticeShownAtRef.current < 300) return;
      setPurchaseNotice(null);
    };
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleDismiss, { passive: true });
      container.addEventListener("pointerdown", handleDismiss);
    }
    return () => {
      if (container) {
        container.removeEventListener("scroll", handleDismiss);
        container.removeEventListener("pointerdown", handleDismiss);
      }
    };
  }, [purchaseNotice]);

  useEffect(() => {
    const handleRouteChange = () => {
      closeOverlays({ keepManagerPanel: true });
    };
    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router.events, closeOverlays]);

  const managerChatMessages = managerChatByFan[id ?? ""] ?? [];
  const draftCards = useMemo(() => {
    if (!id) return EMPTY_DRAFTS;
    return draftCardsByFan[id] ?? EMPTY_DRAFTS;
  }, [draftCardsByFan, id]);
  const generatedDrafts = useMemo(() => {
    if (!id) return EMPTY_DRAFTS;
    return generatedDraftsByFan[id] ?? EMPTY_DRAFTS;
  }, [generatedDraftsByFan, id]);
  const internalNotes = internalMessages.filter((message) => deriveAudience(message) === "INTERNAL");
  const getMsgTs = useCallback((msg: unknown): number => {
    if (!msg || typeof msg !== "object") return 0;
    const data = msg as Record<string, unknown>;
    const candidates = [
      data.createdAt,
      data.time,
      data.sentAt,
      data.ts,
      data.created_at,
      data.timestamp,
      data.date,
    ];
    for (const value of candidates) {
      if (value == null) continue;
      if (value instanceof Date) {
        const ts = value.getTime();
        return Number.isFinite(ts) ? ts : 0;
      }
      if (typeof value === "number" || typeof value === "string") {
        const ts = new Date(value).getTime();
        if (Number.isFinite(ts)) return ts;
      }
    }
    return 0;
  }, []);
  const displayInternalNotes = useMemo(() => {
    return [...internalNotes].sort((a, b) => {
      const ta = getMsgTs(a);
      const tb = getMsgTs(b);
      return tb - ta;
    });
  }, [internalNotes, getMsgTs]);
  const displayGeneratedDrafts = useMemo(() => {
    return [...generatedDrafts].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });
  }, [generatedDrafts]);
  const internalContextKey = id ?? "global";
  const includeInternalContext = includeInternalContextByFan[internalContextKey] ?? true;
  const recentInternalDrafts = useMemo(() => {
    return displayInternalNotes
      .slice(-3)
      .map((msg) => {
        if (msg.type === "CONTENT") return msg.contentItem?.title || "Contenido interno";
        if (msg.type === "STICKER") {
          const sticker = getStickerById(msg.stickerId ?? null);
          return sticker?.label || "Sticker";
        }
        return msg.text || "";
      })
      .map((line) => line.trim())
      .filter(Boolean);
  }, [displayInternalNotes]);
  const normalizedProfileText = useMemo(() => (profileText || "").trim(), [profileText]);
  const detectAgeSignal = useCallback((text: string) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    const patterns = [
      /\b(tengo|cumplo)\s*1[0-7]\b/i,
      /\b(tengo|cumplo)\s*1[0-7]\s*(años|anos)\b/i,
      /\b1[0-7]\s*(años|anos)\b/i,
      /\bsoy\s*menor\b/i,
      /\bmenor\s+de\s+edad\b/i,
      /\bsoy\s*1[0-7]\b/i,
    ];
    return patterns.some((pattern) => pattern.test(normalized));
  }, []);
  const recentConversationLines = useMemo(() => {
    return (messages || [])
      .filter((msg) => msg.audience !== "INTERNAL")
      .filter((msg) => msg.kind === "text" || !msg.kind)
      .map((msg) => {
        const prefix = msg.me ? "Creador" : "Fan";
        return `${prefix}: ${(msg.message || "").trim()}`;
      })
      .filter((line) => line.length > 0)
      .slice(-6);
  }, [messages]);
  const lastFanMessage = useMemo(() => {
    const candidates = (messages || [])
      .filter((msg) => msg.audience !== "INTERNAL")
      .filter((msg) => msg.kind === "text" || !msg.kind)
      .filter((msg) => !msg.me)
      .map((msg) => (msg.message || "").trim())
      .filter(Boolean);
    return candidates.length > 0 ? candidates[candidates.length - 1] : "";
  }, [messages]);
  const ageSignalDetected = useMemo(() => {
    const combined = (messages || [])
      .filter((msg) => msg.audience !== "INTERNAL")
      .filter((msg) => msg.kind === "text" || !msg.kind)
      .filter((msg) => !msg.me)
      .map((msg) => (msg.message || "").trim())
      .filter(Boolean)
      .join("\n");
    return detectAgeSignal(combined);
  }, [detectAgeSignal, messages]);

  useEffect(() => {
    if (profileDraftEditedRef.current) return;
    setProfileDraft(profileText);
  }, [profileText]);
  const hasInternalThreadMessages = internalNotes.length > 0 || managerChatMessages.length > 0;
  const effectiveLanguage = (preferredLanguage ?? "en") as SupportedLanguage;
  const isTranslateConfigured = aiStatus?.translateConfigured !== false;
  const translateTargetLang = aiStatus?.creatorLang ?? "es";
  const translateTargetLabel = formatTranslationLang(translateTargetLang, "ES");
  const resolveSuggestReplyTargetLang = useCallback(
    (messageConversation: ConversationMessage) => {
      const rawPreferred =
        typeof conversation.preferredLanguage === "string" ? conversation.preferredLanguage.trim() : "";
      if (rawPreferred) return rawPreferred;
      if (preferredLanguage) return preferredLanguage;
      const detected = normalizeDetectedLang(messageConversation.translationSourceLang);
      if (detected) return detected;
      return translateTargetLang;
    },
    [conversation.preferredLanguage, preferredLanguage, translateTargetLang]
  );
  const isTranslationPreviewAvailable =
    !!id && !conversation.isManager && effectiveLanguage !== "es" && isTranslateConfigured;
  const hasComposerText = messageSend.trim().length > 0;
  const isFanTarget = composerTarget === "fan";
  const isInternalTarget = composerTarget === "internal";
  const isManagerTarget = composerTarget === "manager";
  const composerAudience = isFanTarget ? "CREATOR" : "INTERNAL";
  const isFanMode = !conversation.isManager;
  const canUseManagerActions = Boolean(id);
  const messageSheetTranslationStatus = messageActionSheet?.messageId
    ? messageTranslationState[messageActionSheet.messageId]?.status ?? "idle"
    : "idle";
  const messageSheetTranslateDisabled = messageSheetTranslationStatus === "loading";
  const messageSheetTranslateLabel = messageSheetTranslateDisabled ? "Traduciendo..." : "Traducir";
  const messageSheetSuggestStatus = messageActionSheet?.messageId
    ? messageSuggestReplyState[messageActionSheet.messageId]?.status ?? "idle"
    : "idle";
  const messageSheetSuggestDisabled = messageSheetSuggestStatus === "loading";
  const messageSheetSuggestLabel = messageSheetSuggestDisabled
    ? "Generando..."
    : `Responder con IA (${formatTranslationLang(messageActionSheet?.suggestTargetLang, translateTargetLabel)})`;
  const hasAutopilotContext = !!(lastAutopilotObjective && lastAutopilotTone);
  const purchaseNoticeUi = purchaseNotice
    ? formatPurchaseUI({
        kind: purchaseNotice.kind,
        amountCents: purchaseNotice.totalAmountCents,
        viewer: "creator",
      })
    : null;
  const purchaseNoticeAmountLabel = purchaseNoticeUi?.amountLabel ?? "";
  const purchaseNoticeLabel = purchaseNotice
    ? purchaseNotice.fanName
      ? `Has recibido ${purchaseNoticeAmountLabel} de ${purchaseNotice.fanName}`
      : `Has recibido ${purchaseNoticeAmountLabel}`
    : "";
  const purchaseNoticeIcon = purchaseNoticeUi?.icon ?? "";
  const purchaseNoticeTime = (() => {
    if (!purchaseNotice?.createdAt) return "hace un momento";
    const parsed = new Date(purchaseNotice.createdAt);
    if (Number.isNaN(parsed.getTime())) return "hace un momento";
    return formatDistanceToNow(parsed, { addSuffix: true, locale: es });
  })();
  const voiceNoticeLabel = voiceNotice
    ? (() => {
        const durationSeconds =
          typeof voiceNotice.durationMs === "number" ? Math.round(voiceNotice.durationMs / 1000) : 0;
        const durationLabel = durationSeconds > 0 ? formatAudioTime(durationSeconds) : "";
        const base = `Nota de voz de ${voiceNotice.fanName}`;
        return durationLabel ? `${base} (${durationLabel})` : base;
      })()
    : "";
  const voiceNoticeTime = (() => {
    if (!voiceNotice?.createdAt) return "hace un momento";
    const parsed = new Date(voiceNotice.createdAt);
    if (Number.isNaN(parsed.getTime())) return "hace un momento";
    return formatDistanceToNow(parsed, { addSuffix: true, locale: es });
  })();
  const voiceRecordingLabel = formatRecordingLabel(voiceRecordingMs);
  const openInternalPanel = useCallback(
    (
      tab: "manager" | "drafts" | "crm",
      options?: { forceScroll?: boolean; scrollToTop?: boolean; highlightDraftId?: string | null }
    ) => {
      const nextTab: InternalPanelTab = tab === "drafts" ? "internal" : tab === "crm" ? "note" : "manager";
      if (nextTab === "internal" && options?.forceScroll) {
        internalChatForceScrollRef.current = true;
      }
      if (nextTab === "internal" && options?.scrollToTop) {
        internalChatScrollTopRef.current = 0;
        internalChatStickToBottomRef.current = true;
      }
      if (nextTab === "manager" && options?.scrollToTop) {
        managerPanelScrollTopRef.current = 0;
        managerPanelStickToBottomRef.current = false;
        managerPanelSkipAutoScrollRef.current = true;
      }
      if (nextTab === "internal" && options?.highlightDraftId) {
        setHighlightDraftId(options.highlightDraftId);
      }
      setInternalPanelTab(nextTab);
      openManagerPanel({
        tab: "manager",
        targetFanId: activeFanId ?? null,
        source: "internal",
      });
    },
    [activeFanId, openManagerPanel]
  );

  const handleUseTranscript = useCallback(
    (transcript: string) => {
      if (!transcript) return;
      const fanName = (getFanDisplayNameForCreator(conversation) || contactName || "Fan").trim() || "Fan";
      const prompt = `Fan: ${fanName}\nAudio dice:\n${transcript}\n\nDame 3 respuestas cortas (cálida, directa, upsell suave).`;
      setManagerChatInput(prompt);
      setManagerSelectedText(null);
      openInternalPanel("manager", { scrollToTop: true });
      requestAnimationFrame(() => {
        managerChatInputRef.current?.focus();
      });
    },
    [conversation, contactName, openInternalPanel]
  );

  useEffect(() => {
    if (!id || conversation.isManager) return;
    const pending = consumePendingManagerTranscript(id);
    if (!pending?.transcript) return;
    handleUseTranscript(pending.transcript);
  }, [conversation.isManager, handleUseTranscript, id]);

  const openInternalPanelTab = useCallback(
    (tab: InternalPanelTab, options?: { forceScroll?: boolean; scrollToTop?: boolean }) => {
      const mapped = tab === "internal" ? "drafts" : tab === "note" ? "crm" : "manager";
      openInternalPanel(mapped, options);
    },
    [openInternalPanel]
  );

  useEffect(() => {
    const pendingFanId = pendingFollowUpPanelRef.current;
    if (!pendingFanId || !conversation?.id) return;
    if (pendingFanId !== conversation.id) return;
    pendingFollowUpPanelRef.current = null;
    openInternalPanelTab("note", { scrollToTop: true });
    setTimeout(() => {
      nextActionInputRef.current?.focus();
    }, 150);
  }, [conversation?.id, openInternalPanelTab]);

  const openInternalThread = useCallback(
    (options?: { forceScroll?: boolean }) => {
      openInternalPanel("drafts", options);
    },
    [openInternalPanel]
  );

  const handleManagerPanelTabClick = useCallback(
    (tab: InlineTab) => {
      if (managerPanelOpen && managerPanelTab === tab) {
        closeInlinePanel({ focus: true });
        return;
      }
      openManagerPanel({
        tab,
        targetFanId: activeFanId ?? null,
        source: "composer",
      });
    },
    [
      activeFanId,
      managerPanelOpen,
      managerPanelTab,
      openManagerPanel,
      closeInlinePanel,
    ]
  );

  const toggleIncludeInternalContext = useCallback(() => {
    const key = id ?? "global";
    setIncludeInternalContextByFan((prev) => {
      const current = prev[key];
      const nextValue = !(current ?? true);
      return { ...prev, [key]: nextValue };
    });
  }, [id]);

  const openFollowUpNote = useCallback(() => {
    openInternalPanel("crm");
    if (!nextActionDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setNextActionDate(tomorrow.toISOString().slice(0, 10));
    }
    if (id) {
      fetchFollowUpHistory(id);
    }
    setFollowUpError("");
    requestAnimationFrame(() => {
      nextActionInputRef.current?.focus();
    });
  }, [openInternalPanel, nextActionDate, id, fetchFollowUpHistory]);

  const applyCortexDraft = useCallback(
    (draftText: string, insertMode: "replace" | "append" = "replace") => {
      const trimmed = draftText.trim();
      if (!trimmed) return false;
      if (insertMode === "append") {
        setManagerChatInput((prev) => appendDraftText(prev, draftText));
      } else {
        setManagerChatInput(draftText);
      }
      setManagerSelectedText(null);
      openInternalPanel("manager");
      focusManagerComposer(true);
      return true;
    },
    [focusManagerComposer, openInternalPanel]
  );

  const handleAskManagerFromDraft = useCallback(
    (text: string, _options?: { selectedText?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      insertIntoCurrentComposer({
        target: "cortex",
        fanId: id ?? undefined,
        mode: "manager",
        text: trimmed,
      });
    },
    [id]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleComposerDraft = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as {
        target?: string;
        fanId?: string;
        text?: string;
        insertMode?: string;
      } | undefined;
      if (detail?.target !== "cortex") return;
      if (!id || !detail?.fanId || detail.fanId !== id) return;
      const stored = consumeDraft({ target: "cortex", fanId: id });
      const insertMode = stored?.insertMode === "append" || detail?.insertMode === "append" ? "append" : "replace";
      if (stored?.text) {
        applyCortexDraft(stored.text, insertMode);
        return;
      }
      if (typeof detail.text === "string" && detail.text.trim()) {
        applyCortexDraft(detail.text, insertMode);
      }
    };
    window.addEventListener(COMPOSER_DRAFT_EVENT, handleComposerDraft as EventListener);
    return () => {
      window.removeEventListener(COMPOSER_DRAFT_EVENT, handleComposerDraft as EventListener);
    };
  }, [applyCortexDraft, id]);

  useEffect(() => {
    if (!id) return;
    const storedDraft = consumeDraft({ target: "cortex", fanId: id });
    if (storedDraft?.text) {
      applyCortexDraft(storedDraft.text, storedDraft.insertMode === "append" ? "append" : "replace");
    }
  }, [applyCortexDraft, id]);

  const getMessageTranslationPosition = useCallback((messageId: string) => {
    if (typeof window === "undefined") return null;
    const container = messagesContainerRef.current;
    const overlay = chatOverlayRef.current;
    const chatRect = overlay?.getBoundingClientRect() ?? container?.getBoundingClientRect();
    if (!chatRect) return null;

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
    const maxWidth = Math.max(0, Math.min(TRANSLATION_POPOVER_MAX_WIDTH, chatRect.width - TOOLBAR_MARGIN * 2));
    const maxX = chatRect.width - maxWidth - TOOLBAR_MARGIN;
    const maxY = chatRect.height - TRANSLATION_POPOVER_HEIGHT - TOOLBAR_MARGIN;
    const fallbackX = clamp((chatRect.width - maxWidth) / 2, TOOLBAR_MARGIN, maxX);
    const fallbackY = clamp((chatRect.height - TRANSLATION_POPOVER_HEIGHT) / 2, TOOLBAR_MARGIN, maxY);

    const anchor = container?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!anchor) {
      return { x: fallbackX, y: fallbackY, maxWidth };
    }

    const rect = anchor.getBoundingClientRect();
    let x = clamp(rect.left - chatRect.left, TOOLBAR_MARGIN, maxX);
    let y = rect.bottom - chatRect.top + 8;
    if (y + TRANSLATION_POPOVER_HEIGHT > chatRect.height - TOOLBAR_MARGIN) {
      y = rect.top - chatRect.top - TRANSLATION_POPOVER_HEIGHT - 8;
    }
    y = clamp(y, TOOLBAR_MARGIN, maxY);
    return { x, y, maxWidth };
  }, []);

  const openMessageTranslationPopover = useCallback(
    (messageId: string, error: string) => {
      const position = getMessageTranslationPosition(messageId);
      if (!position) return;
      setMessageTranslationPopover({
        messageId,
        error,
        x: position.x,
        y: position.y,
        maxWidth: position.maxWidth,
      });
    },
    [getMessageTranslationPosition]
  );

  const showTranslateConfigToast = useCallback(() => {
    showActionToast("Traducción no configurada", "Configurar", "/creator/ai-settings#translation");
  }, [showActionToast]);

  useEffect(() => {
    const messageId = messageTranslationPopover?.messageId;
    if (!messageId) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleReposition = () => {
      const position = getMessageTranslationPosition(messageId);
      if (!position) return;
      setMessageTranslationPopover((prev) => {
        if (!prev || prev.messageId !== messageId) return prev;
        if (prev.x === position.x && prev.y === position.y && prev.maxWidth === position.maxWidth) return prev;
        return { ...prev, ...position };
      });
    };

    handleReposition();
    container.addEventListener("scroll", handleReposition, { passive: true });
    window.addEventListener("resize", handleReposition);
    return () => {
      container.removeEventListener("scroll", handleReposition);
      window.removeEventListener("resize", handleReposition);
    };
  }, [getMessageTranslationPosition, messageTranslationPopover?.messageId]);

  const handleTranslateMessage = useCallback(
    async (messageId: string) => {
      if (!messageId) return;
      if (messageTranslationInFlightRef.current.has(messageId)) return;
      if (aiStatus && aiStatus.translateConfigured === false) {
        showTranslateConfigToast();
        return;
      }
      setMessageTranslationState((prev) => ({
        ...prev,
        [messageId]: { status: "loading" },
      }));

      const request = fetch("/api/creator/messages/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        cache: "no-store",
        body: JSON.stringify({ messageId, targetLang: translateTargetLang, sourceKind: "text" }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const errorCode =
              typeof data?.code === "string"
                ? data.code
                : typeof data?.error === "string"
                ? data.error
                : "";
            const errorMessage =
              typeof data?.message === "string" && data.message.trim().length > 0
                ? data.message
                : errorCode || "translation_failed";
            const error = new Error(errorMessage) as Error & { code?: string };
            error.code = errorCode;
            throw error;
          }
        const translatedText =
          typeof data?.translatedText === "string" ? data.translatedText.trim() : "";
        if (!translatedText) {
          throw new Error("No se pudo traducir.");
        }
        return data as MessageTranslationResponse;
      })
      .finally(() => {
        messageTranslationInFlightRef.current.delete(messageId);
      });

      messageTranslationInFlightRef.current.set(messageId, request);

      try {
        const result = await request;
        handleMessageTranslationSaved(messageId, result.translatedText, result.detectedSourceLang, result.targetLang);
        setMessageTranslationState((prev) => ({
          ...prev,
          [messageId]: { status: "idle" },
        }));
        setMessageTranslationPopover((prev) => (prev?.messageId === messageId ? null : prev));
      } catch (err) {
        if (isTranslateNotConfiguredError(err)) {
          setMessageTranslationState((prev) => ({
            ...prev,
            [messageId]: { status: "idle" },
          }));
          showTranslateConfigToast();
          return;
        }
        const message = "No se pudo traducir.";
        setMessageTranslationState((prev) => ({
          ...prev,
          [messageId]: { status: "error", error: message },
        }));
        openMessageTranslationPopover(messageId, message);
      }
    },
    [aiStatus, handleMessageTranslationSaved, openMessageTranslationPopover, showTranslateConfigToast, translateTargetLang]
  );

  const handleSuggestReply = useCallback(
    async (messageId: string, targetLang: string) => {
      if (!messageId) return;
      if (messageSuggestReplyInFlightRef.current.has(messageId)) return;
      messageSuggestReplyInFlightRef.current.add(messageId);
      setMessageSuggestReplyState((prev) => ({
        ...prev,
        [messageId]: { status: "loading" },
      }));

      try {
        const res = await fetch("/api/creator/cortex/suggest-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
          cache: "no-store",
          body: JSON.stringify({ messageId, targetLang }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          const errorCode = typeof data?.error === "string" ? data.error : "";
          const errorMessage =
            typeof data?.message === "string" && data.message.trim().length > 0
              ? data.message
              : "";
          let fallback = "No se pudo generar la respuesta.";
          if (errorCode === "CORTEX_NOT_CONFIGURED") fallback = "IA no configurada.";
          if (errorCode === "CORTEX_FAILED") fallback = "IA local no disponible (Ollama).";
          if (errorCode === "POLICY_BLOCKED") fallback = "No permitido: menores o no consentimiento.";
          if (errorCode === "MODEL_NOT_FOUND") fallback = "Modelo no encontrado (AI_MODEL=...).";
          if (errorCode === "TIMEOUT") fallback = "Timeout hablando con Ollama.";
          if (errorCode === "PROVIDER_ERROR") fallback = "IA local no disponible (Ollama).";
          if (errorCode === "JSON_PARSE") fallback = "La IA respondió pero no en formato esperado (JSON).";
          throw new Error(errorMessage || fallback);
        }
        const suggestedText = typeof data?.message === "string" ? data.message.trim() : "";
        if (!suggestedText) {
          throw new Error("No se pudo generar la respuesta.");
        }
        insertComposerTextWithUndo(suggestedText, {
          title: "Sugerencia IA insertada",
          detail: `Idioma ${formatTranslationLang(targetLang, translateTargetLabel)}`,
        });
      } catch (err) {
        const message = err instanceof Error && err.message ? err.message : "No se pudo generar la respuesta.";
        showComposerToast(message);
      } finally {
        messageSuggestReplyInFlightRef.current.delete(messageId);
        setMessageSuggestReplyState((prev) => ({
          ...prev,
          [messageId]: { status: "idle" },
        }));
      }
    },
    [insertComposerTextWithUndo, showComposerToast, translateTargetLabel]
  );

  const buildManagerQuotePrompt = (text: string) => {
    return (
      `Texto del mensaje: «${text}»\n\n` +
      "Qué quiero: dime cómo responderle sin sonar vendedor, tono íntimo, CTA suave."
    );
  };

  const buildManagerRephrasePrompt = (text: string) => {
    const name = getFirstName(contactName) || contactName || "este fan";
    return (
      `Texto del mensaje: «${text}»\n\n` +
      `Reformula este mensaje para ${name}: íntimo, natural, cero presión, que parezca conversación real. ` +
      "Devuélveme 2 versiones."
    );
  };

  const copyTextToClipboard = useCallback(async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error(err);
      }
    }
    if (typeof document === "undefined") return false;
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      console.error(err);
      return false;
    }
  }, []);


  const mergeProfileDraft = (base: string, addition: string) => {
    const trimmedBase = base.trim();
    const trimmedAddition = addition.trim();
    if (!trimmedAddition) return trimmedBase;
    if (!trimmedBase) return trimmedAddition;
    if (trimmedBase.includes(trimmedAddition)) return trimmedBase;
    return `${trimmedBase}\n${trimmedAddition}`.trim();
  };

  const handleMessageQuote = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!id) {
      showComposerToast("Necesitas un fan activo para usar el Manager.");
      return;
    }
    requestDraftCardFromPrompt({
      prompt: buildManagerQuotePrompt(trimmed),
      source: "citar",
      label: "Citar al Manager",
      selectedText: trimmed,
      action: "quote_manager",
    });
  };

  const handleMessageRephrase = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!id) {
      showComposerToast("Necesitas un fan activo para usar el Manager.");
      return;
    }
    requestDraftCardFromPrompt({
      prompt: buildManagerRephrasePrompt(trimmed),
      source: "reformular",
      label: "Reformular",
      selectedText: trimmed,
      action: "rephrase_manager",
    });
  };

  const handleMessageCopy = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ok = await copyTextToClipboard(trimmed);
    showComposerToast(ok ? "Texto copiado" : "No se pudo copiar");
  };

  const handleMessageSaveProfile = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const merged = mergeProfileDraft(profileDraft, trimmed);
    profileDraftEditedRef.current = true;
    setProfileDraft(merged);
    openInternalPanel("crm");
    requestAnimationFrame(() => {
      profileInputRef.current?.focus();
    });
    showInlineAction({
      kind: "info",
      title: "Texto listo en perfil",
      detail: "Guárdalo para que el Manager lo use.",
      ttlMs: 2200,
    });
  };

  const handleMessageCreateFollowUp = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setNextActionDraft(trimmed);
    openFollowUpNote();
  };

  const handleToolbarPointerDown = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const closeMessageActionSheet = useCallback(() => {
    setMessageActionSheet(null);
  }, []);

  const openMessageActionSheet = useCallback(
    (options: {
      messageId?: string;
      text: string;
      canTranslate: boolean;
      canSuggestReply?: boolean;
      suggestTargetLang?: string;
    }) => {
      if (!isCoarsePointer) return;
      setMessageActionSheet({
        messageId: options.messageId,
        text: options.text,
        canTranslate: options.canTranslate,
        canSuggestReply: options.canSuggestReply,
        suggestTargetLang: options.suggestTargetLang,
      });
    },
    [isCoarsePointer]
  );

  const openAttachContent = (options?: { closeInline?: boolean }) => {
    if (isChatBlocked) return;
    openContentModal({ mode: "packs" });
    if (options?.closeInline ?? true) {
      if (managerPanelOpen) {
        closeInlinePanel();
      }
    }
  };

  const handleAttachContentClick = () => {
    if (!isFanTarget || isChatBlocked || isInternalPanelOpen) return;
    openAttachContent();
  };

  const renderComposerDock = () => {
    const managerAlert = fanManagerAnalysis.chips.some(
      (chip) => chip.tone === "danger" || chip.tone === "warning"
    );
    const dockOffset = Math.max(0, dockHeight) + 12;
    const internalDraftCount = includeInternalContext ? recentInternalDrafts.length : 0;
    const managerTemplateCount = managerPromptTemplate ? 1 : 0;
    const templatesCount: number = playbookCount + managerTemplateCount;
    const showManagerChip = true;
    const showTemplatesChip = isFanMode;
    const showToolsChip = isFanMode;
    const managerChipStatus = managerAlert ? "Riesgo" : "OK";
    const managerChipCount = managerSuggestions.length;
    const managerChipLabel = isFanMode ? (
      <span className="flex items-center gap-1.5">
        <span>Manager</span>
        <span
          className={clsx(
            "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
            managerAlert
              ? "border-[color:rgba(244,63,94,0.6)] bg-[color:rgba(244,63,94,0.08)] text-[color:var(--danger)]"
              : "border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
          )}
        >
          {managerChipStatus}
        </span>
        {managerChipCount > 0 && <span className="text-[10px] text-[color:var(--muted)]">· {managerChipCount}</span>}
      </span>
    ) : (
      "Manager IA"
    );

    if (!showManagerChip && !showTemplatesChip && !showToolsChip) {
      return null;
    }

    const chipBase =
      "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 active:scale-[0.98]";
    const chipInactiveClass =
      "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]";
    const chipActiveClass = isFanMode
      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)] ring-1 ring-[color:var(--ring)]"
      : "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.1)] text-[color:var(--text)] ring-1 ring-[color:var(--ring)]";

    const InlineEmptyState = ({
      icon,
      title,
      subtitle,
    }: {
      icon: IconName;
      title: string;
      subtitle?: string;
    }) => (
      <div className="flex items-center gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-3 text-xs text-[color:var(--muted)]">
        <IconGlyph name={icon} className="h-4 w-4 text-[color:var(--text)]" />
        <div>
          <div className="text-[11px] font-semibold text-[color:var(--text)]">{title}</div>
          {subtitle && <div className="text-[10px] text-[color:var(--muted)]">{subtitle}</div>}
        </div>
      </div>
    );

    const inlineActionButtonClass = clsx(
      "inline-flex h-7 items-center justify-center rounded-full border px-3.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2",
      isFanMode
        ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] focus-visible:ring-[color:var(--ring)]"
        : "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)] focus-visible:ring-[color:var(--ring)]"
    );
    const managerActionButtonClass = clsx(
      "inline-flex h-7 items-center justify-center rounded-full border px-3.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2",
      "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)] focus-visible:ring-[color:var(--ring)]"
    );

    const closeDockPanel = () => {
      closeInlinePanel({ focus: true });
    };

    const handlePanelWheel: WheelEventHandler<HTMLDivElement> = (event) => {
      event.stopPropagation();
    };
    const handlePanelTouchMove: TouchEventHandler<HTMLDivElement> = (event) => {
      event.stopPropagation();
    };
    const dockOverlayPanelClassName = "dockOverlayPanel";
    const dockOverlaySheetClassName = "dockOverlaySheet";
    const dockOverlayBodyScrollClassName = "dockOverlaySheetBody";

    const renderInlineToolsPanel = () => {
      const toolsDisabled = !isFanTarget;
      return (
        <InlinePanelShell
          title="Herramientas"
          onClose={closeDockPanel}
          containerClassName={dockOverlaySheetClassName}
          containerRef={dockOverlaySheetRef}
          bodyScrollClassName={dockOverlayBodyScrollClassName}
          bodyRef={overlayBodyRef}
          onBodyWheel={handlePanelWheel}
          onBodyTouchMove={handlePanelTouchMove}
          stickyHeader
        >
          {!conversation.isManager ? (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-[color:var(--muted)]">Acciones</div>
              <button
                type="button"
                onClick={() => handleAttachContentClick()}
                disabled={!canAttachContent}
                className={clsx(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
                  !canAttachContent
                    ? "cursor-not-allowed border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]"
                )}
              >
                <span className="flex items-center gap-2">
                  <IconGlyph name="paperclip" className="h-4 w-4" />
                  <span>Adjuntar contenido</span>
                </span>
                {toolsDisabled && (
                  <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                    Solo fan
                  </span>
                )}
              </button>
              <div className="text-[11px] font-semibold text-[color:var(--muted)]">Acciones rápidas</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    label: "Copiar enlace",
                    icon: "link",
                    onClick: async () => {
                      if (!id) {
                        showInlineAction({ kind: "warn", title: "Selecciona un fan primero" });
                        return;
                      }
                      const ok = await copyInviteLinkForTools();
                      showInlineAction({
                        kind: ok ? "ok" : "warn",
                        title: ok ? "Enlace copiado" : "No se pudo copiar el enlace",
                      });
                    },
                  },
                  {
                    label: "Abrir ficha",
                    icon: "folder",
                    onClick: () => {
                      if (!id) {
                        showInlineAction({ kind: "warn", title: "Selecciona un fan" });
                        return;
                      }
                      closeDockPanel();
                      handleViewProfile();
                      showInlineAction({ kind: "info", title: "Ficha abierta" });
                    },
                  },
                  {
                    label: "Marcar seguimiento",
                    icon: "clock",
                    onClick: () => {
                      if (!id) {
                        showInlineAction({ kind: "warn", title: "Selecciona un fan" });
                        return;
                      }
                      closeDockPanel();
                      openFollowUpNote();
                    },
                  },
                ].map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={clsx(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition",
                      "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]"
                    )}
                  >
                    <IconGlyph name={action.icon as IconName} className="h-4 w-4" />
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <InlineEmptyState
              icon="settings"
              title="Sin herramientas disponibles"
              subtitle="Solo disponibles en chats con fans."
            />
          )}
        </InlinePanelShell>
      );
    };

    const renderInternalManagerContent = () => (
      <div className="space-y-3">
        <div className="px-4 py-3 space-y-3">
          {!isManagerIaSimple && (
            <>
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[color:var(--muted)]">
              <span>Agency OS</span>
              {(agencyLoading || objectivesLoading) && (
                <span className="text-[10px] text-[color:var(--muted)]">Cargando…</span>
              )}
            </div>
            {agencyDraft ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--muted)]">
                  <label className="flex items-center gap-2">
                    <span>Stage</span>
                    <select
                      value={agencyDraft.stage}
                      onChange={(event) =>
                        setAgencyDraft((prev) =>
                          prev
                            ? { ...prev, stage: event.target.value as AgencyStage }
                            : prev
                        )
                      }
                      disabled={agencySaving}
                      className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 text-[11px] text-[color:var(--text)]"
                    >
                      {AGENCY_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {formatAgencyStageLabel(stage)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span>Objetivo</span>
                    <select
                      value={agencyDraft.objective}
                      onChange={(event) => handleObjectiveSelect(event.target.value)}
                      disabled={agencySaving}
                      className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 text-[11px] text-[color:var(--text)]"
                    >
                      {objectiveSelectOptions.map((objective) => (
                        <option key={objective.code} value={objective.code}>
                          {objective.active ? objective.label : `${objective.label} (inactivo)`}
                        </option>
                      ))}
                      <option value="__create__">+ Crear objetivo</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!objectivesLoading) {
                        void fetchObjectives();
                      }
                      setObjectiveDeleteError(null);
                      setObjectiveManagerOpen(true);
                    }}
                    disabled={agencySaving || objectivesLoading}
                    className={clsx(
                      "inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold transition",
                      agencySaving || objectivesLoading
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                    )}
                  >
                    Gestionar objetivos
                  </button>
                  <label className="flex items-center gap-2">
                    <span>Intensidad</span>
                    <select
                      value={agencyDraft.intensity}
                      onChange={(event) =>
                        setAgencyDraft((prev) =>
                          prev
                            ? { ...prev, intensity: event.target.value as AgencyIntensity }
                            : prev
                        )
                      }
                      disabled={agencySaving}
                      className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 text-[11px] text-[color:var(--text)]"
                    >
                      {AGENCY_INTENSITIES.map((intensity) => (
                        <option key={intensity} value={intensity}>
                          {AGENCY_INTENSITY_LABELS[intensity]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span>Estilo</span>
                    <select
                      value={agencyDraft.playbook}
                      onChange={(event) =>
                        setAgencyDraft((prev) =>
                          prev
                            ? { ...prev, playbook: event.target.value as AgencyPlaybook }
                            : prev
                        )
                      }
                      disabled={agencySaving}
                      className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 text-[11px] text-[color:var(--text)]"
                    >
                      {AGENCY_PLAYBOOKS.map((playbook) => (
                        <option key={playbook} value={playbook}>
                          {AGENCY_PLAYBOOK_LABELS[playbook]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {objectivesError && (
                  <div className="text-[10px] text-[color:var(--danger)]">{objectivesError}</div>
                )}
                {objectiveCreatorOpen && (
                  <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
                    <div className="text-[10px] font-semibold text-[color:var(--muted)]">Crear objetivo</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={objectiveNameDraft}
                        onChange={(event) => setObjectiveNameDraft(event.target.value)}
                        placeholder={`Nombre (${UI_LOCALE_LABELS[objectiveLocale] ?? objectiveLocale.toUpperCase()})`}
                        disabled={objectiveCreateSaving}
                        className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
                      />
                      <input
                        value={objectiveNameEnDraft}
                        onChange={(event) => setObjectiveNameEnDraft(event.target.value)}
                        placeholder="Nombre (EN, opcional)"
                        disabled={objectiveCreateSaving}
                        className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={objectiveCodeDraft}
                        onChange={(event) => setObjectiveCodeDraft(event.target.value)}
                        placeholder="Código (opcional)"
                        disabled={objectiveCreateSaving}
                        className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
                      />
                      <div className="flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[10px] text-[color:var(--muted)]">
                        Código sugerido:
                        <span className="ml-1 text-[color:var(--text)]">
                          {objectiveCodePreview || "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleObjectiveAutoTranslate}
                        disabled={objectiveTranslateLoading || !objectiveNameDraft.trim()}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                          objectiveTranslateLoading || !objectiveNameDraft.trim()
                            ? "cursor-not-allowed border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                        )}
                      >
                        {objectiveTranslateLoading ? "Traduciendo…" : "Auto-traducir"}
                      </button>
                      {objectiveTranslateError && (
                        <span className="text-[10px] text-[color:var(--danger)]">{objectiveTranslateError}</span>
                      )}
                    </div>
                    {Object.keys(objectiveTranslations).length > 0 && (
                      <div className="grid gap-1 text-[10px] text-[color:var(--muted)]">
                        {Object.entries(objectiveTranslations).map(([locale, label]) => (
                          <div key={locale} className="flex items-center gap-2">
                            <span className="min-w-[52px] uppercase">{locale}</span>
                            <span className="text-[color:var(--text)]">{label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCreateObjective}
                        disabled={objectiveCreateSaving}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                          objectiveCreateSaving
                            ? "cursor-not-allowed border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                            : "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                        )}
                      >
                        {objectiveCreateSaving ? "Guardando…" : "Guardar objetivo"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setObjectiveCreatorOpen(false)}
                        disabled={objectiveCreateSaving}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                          objectiveCreateSaving
                            ? "cursor-not-allowed border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                        )}
                      >
                        Cancelar
                      </button>
                    </div>
                    {objectiveCreateError && (
                      <div className="text-[10px] text-[color:var(--danger)]">{objectiveCreateError}</div>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={agencyDraft.nextAction}
                    onChange={(event) =>
                      setAgencyDraft((prev) =>
                        prev ? { ...prev, nextAction: event.target.value } : prev
                      )
                    }
                    placeholder="Siguiente acción…"
                    disabled={agencySaving}
                    className="flex-1 min-w-[180px] rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-[11px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
                  />
                  <button
                    type="button"
                    onClick={handleAgencySave}
                    disabled={!isAgencyDirty || agencySaving}
                    className={clsx(
                      "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                      !isAgencyDirty || agencySaving
                        ? "cursor-not-allowed border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)]"
                        : "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                    )}
                  >
                    {agencySaving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
                {agencyError && (
                  <div className="text-[10px] text-[color:var(--danger)]">{agencyError}</div>
                )}
              </>
            ) : (
              <div className="text-[11px] text-[color:var(--muted)]">
                Agency OS no disponible para este chat.
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[color:var(--muted)]">
              <span>Ofertas</span>
              {offersLoading && <span className="text-[10px] text-[color:var(--muted)]">Cargando…</span>}
            </div>
            {offersError && (
              <div className="text-[10px] text-[color:var(--danger)]">{offersError}</div>
            )}
            {offersForDropdown.length === 0 ? (
              <div className="text-[11px] text-[color:var(--muted)]">No hay ofertas activas.</div>
            ) : (
              <>
                <label className="flex flex-col gap-2 text-[11px] text-[color:var(--muted)]">
                  <span>Oferta recomendada</span>
                  <select
                    value={selectedOfferId ?? ""}
                    onChange={(event) =>
                      handleRecommendedOfferChange(event.target.value ? event.target.value : null)
                    }
                    disabled={offerSelectionSaving}
                    className="w-full rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] text-[color:var(--text)]"
                  >
                    <option value="">Sin oferta</option>
                    {offersForDropdown.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offer.title} · {OFFER_TIER_LABELS[offer.tier]} · {formatOfferPrice(offer.priceCents, offer.currency)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selectedOffer) return;
                      const message = buildOfferMessage(selectedOffer);
                      if (!message.trim()) return;
                      await fillMessageForFan(message, `offer:${selectedOffer.id}`);
                    }}
                    disabled={!selectedOffer || offerSelectionSaving}
                    className={clsx(
                      "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                      !selectedOffer || offerSelectionSaving
                        ? "cursor-not-allowed border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)]"
                        : "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                    )}
                  >
                    Insertar + Oferta
                  </button>
                  {selectedOffer && (
                    <span className="text-[10px] text-[color:var(--muted)]">
                      {AGENCY_INTENSITY_LABELS[selectedOffer.intensityMin]} · {OFFER_TIER_LABELS[selectedOffer.tier]}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="text-[11px] font-semibold text-[color:var(--muted)]">Insights y control</div>
          {normalizedProfileText && (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3">
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[color:var(--muted)]">
                <span>Perfil del fan (resumen)</span>
                <button
                  type="button"
                  onClick={() => openInternalPanelTab("note")}
                  className="rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                >
                  Editar
                </button>
              </div>
              <div className="mt-2 text-[11px] text-[color:var(--text)] whitespace-pre-wrap line-clamp-3">
                {normalizedProfileText}
              </div>
            </div>
          )}
            </>
          )}
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3">
            <FanManagerDrawer
              managerSuggestions={managerSuggestions}
              reengageSuggestions={reengageSuggestions}
              reengageLoading={reengageLoading}
              onApplySuggestion={handleApplyManagerSuggestion}
              onApplyReengage={handleApplyManagerSuggestion}
              draftCards={draftCards}
              onDraftAction={handleDraftCardVariant}
              currentObjective={currentObjective}
              suggestedObjective={fanManagerAnalysis.defaultObjective}
              fanManagerState={fanManagerAnalysis.state}
              fanManagerHeadline={fanManagerAnalysis.headline}
              fanManagerChips={fanManagerAnalysis.chips}
              daysLeft={typeof effectiveDaysLeft === "number" ? effectiveDaysLeft : null}
              tone={fanTone}
              onChangeTone={handleChangeFanTone}
              statusLine={statusLine}
              lapexSummary={lapexSummary}
              sessionSummary={sessionSummary}
              iaSummary={iaSummary}
              planSummary={planSummary}
              closedSummary={managerShortSummary}
              monetization={monetizationSummary}
              subscriptionLabel={subscriptionLabel}
              fanId={conversation.id}
              onManagerSummary={(s) => setManagerSummary(s)}
              onSuggestionClick={handleManagerSuggestion}
              onQuickGreeting={() => handleManagerQuickAction("romper_hielo")}
              onSendLink={handleSendLinkFromManager}
              onRenew={() => handleManagerQuickAction("reactivar_fan_frio")}
              onQuickExtra={() => handleManagerQuickAction("ofrecer_extra")}
              onPackOffer={() => handleManagerQuickAction("llevar_a_mensual")}
              onPhaseAction={handleManagerPhaseAction}
              onOpenOfferSelector={handleOpenExtrasPanel}
              onRequestSuggestionAlt={(text) => handleRequestSuggestionVariant("alternate", text)}
              onRequestSuggestionShorter={(text) => handleRequestSuggestionVariant("shorter", text)}
              onRequestReengageAlt={(suggestionId) => handleRequestReengageVariant("full", suggestionId)}
              onRequestReengageShorter={(suggestionId) => handleRequestReengageVariant("short", suggestionId)}
              onInsertOffer={(text, offer, detail) => handleInsertOffer(text, offer, detail, "manager_phase")}
              showRenewAction={showRenewAction}
              quickExtraDisabled={quickExtraDisabled}
              isRecommended={isRecommended}
              isBlocked={isChatBlocked}
              autoPilotEnabled={autoPilotEnabled}
              onToggleAutoPilot={handleToggleAutoPilot}
              isAutoPilotLoading={isAutoPilotLoading}
              hasAutopilotContext={hasAutopilotContext}
              onAutopilotSoften={handleAutopilotSoften}
              onAutopilotMakeBolder={handleAutopilotMakeBolder}
              agencyObjectiveLabel={agencyObjectiveLabel}
              agencyStyleLabel={agencyStyleLabel}
              fanLanguage={preferredLanguage ?? null}
              draftActionPhase={draftActionPhase}
              draftActionError={draftActionError}
              onDraftCancel={handleDraftCancel}
              onDraftRetry={handleDraftRetry}
              draftActionKey={draftActionState.key}
              draftActionLoading={draftActionState.status === "loading"}
              draftDirectnessById={draftDirectnessById}
              draftOutputLength={draftOutputLength}
              onDraftOutputLengthChange={(nextLength) => {
                if (!id) return;
                setDraftOutputLengthById((prev) => ({ ...prev, [id]: nextLength }));
              }}
              managerIaMode={managerIaMode}
              onManagerIaModeChange={setManagerIaMode}
            />
          </div>
          {!isManagerIaSimple && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-[color:var(--muted)]">Conversación con Manager IA</div>
              <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 space-y-4">
                {managerChatMessages.length === 0 && (
                  <div className="text-[11px] text-[color:var(--muted)]">Aún no has preguntado al Manager IA.</div>
                )}
                {managerChatMessages.map((msg) => {
                  const isCreator = msg.role === "creator";
                  const isManager = msg.role === "manager";
                  const isSystem = msg.role === "system";
                  const bubbleClass = clsx(
                    "rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                    "[&_a]:underline [&_a]:underline-offset-2",
                    isCreator
                      ? "bg-[color:var(--brand-weak)] text-[color:var(--text)] border border-[color:rgba(var(--brand-rgb),0.24)]"
                      : isManager
                      ? "bg-[color:var(--surface-1)] text-[color:var(--text)] border border-[color:var(--surface-border)]"
                      : "bg-[color:var(--surface-2)] text-[color:var(--muted)] border border-[color:var(--surface-border)]"
                  );
                  return (
                    <div
                      key={msg.id}
                      className={clsx(
                        "flex w-full",
                        isSystem ? "justify-center" : isCreator ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={clsx(
                          "flex flex-col gap-1",
                          isSystem ? "items-center max-w-[85%]" : "w-full",
                          isCreator ? "items-end" : "items-start"
                        )}
                      >
                        {!isSystem && (
                          <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                            {isCreator ? "Tú" : "Manager IA"}
                          </span>
                        )}
                        {isSystem ? (
                          <div className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)] text-center">
                            {msg.text}
                          </div>
                        ) : (
                          <div className={clsx(bubbleClass, "max-w-[75%]")}>{msg.text}</div>
                        )}
                        {isManager && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                handleUseManagerReplyAsMainMessage(msg.text, msg.title ?? "Manager IA", `manager:chat:${msg.id}`)
                              }
                              className={clsx("mt-1", inlineActionButtonClass)}
                            >
                              Usar en mensaje
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTemplateRewrite(msg.text)}
                              className={clsx("mt-1", inlineActionButtonClass)}
                            >
                              Rehacer con plantilla
                            </button>
                            {msg.qa && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                                <span className="font-semibold">QA: {msg.qa.score}/100</span>
                                {msg.qa.warnings.length > 0 && (
                                  <span>{msg.qa.warnings.slice(0, 2).join(" · ")}</span>
                                )}
                              </div>
                            )}
                            {msg.offer && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:rgba(var(--brand-rgb),0.12)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)]">
                                  {formatOfferLabel(msg.offer)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleInsertOffer(msg.text, msg.offer as PpvOffer, msg.title ?? "Manager IA", "manager_chat")}
                                  className="inline-flex items-center rounded-full border border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                                >
                                  Insertar + Oferta
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={managerChatEndRef} />
            </div>
          )}
        </div>
        {!isManagerIaSimple && (
          <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3">
          <label className="mb-2 flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
            <input
              type="checkbox"
              checked={includeInternalContext}
              onChange={toggleIncludeInternalContext}
              className="h-3 w-3 rounded border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--ring)]"
            />
            <span>Incluir borradores ({internalDraftCount})</span>
          </label>
          <ChatComposerBar
            value={managerChatInput}
            onChange={(e) => {
              setManagerChatInput(e.target.value);
              setManagerSelectedText(null);
              autoGrowTextarea(e.currentTarget, MAX_INTERNAL_COMPOSER_HEIGHT);
            }}
            onKeyDown={handleManagerChatKeyDown}
            onSend={handleSendManagerChat}
            sendDisabled={!managerChatInput.trim()}
            placeholder="Pregúntale al Manager…"
            actionLabel="Enviar"
            audience="INTERNAL"
            onAudienceChange={() => {}}
            canAttach={false}
            onAttach={() => {}}
            inputRef={managerChatInputRef}
            maxHeight={MAX_INTERNAL_COMPOSER_HEIGHT}
            isChatBlocked={false}
            isInternalPanelOpen={false}
            showAudienceToggle={false}
            showAttach={false}
            showEmoji
            onEmojiSelect={handleInsertManagerEmoji}
          />
          </div>
        )}
      </div>
    );

    const renderInternalChatContent = () => (
      <div className="space-y-3">
        <div className="px-4 pt-3 text-[11px] text-[color:var(--muted)]">
          Borradores tuyos. No se envía al fan.
        </div>
        <div className="px-4 pb-3 space-y-2">
          {isLoadingInternalMessages && (
            <div className="text-[11px] text-[color:var(--muted)]">Cargando mensajes internos...</div>
          )}
          {internalMessagesError && !isLoadingInternalMessages && (
            <div className="text-[11px] text-[color:var(--danger)]">{internalMessagesError}</div>
          )}
          {!internalNotes.length && displayGeneratedDrafts.length === 0 && !isLoadingInternalMessages && !internalMessagesError && (
            <div className="text-[11px] text-[color:var(--muted)]">
              Aún no hay borradores internos.
            </div>
          )}
          {displayGeneratedDrafts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[color:var(--muted)]">Borradores IA</div>
              {displayGeneratedDrafts.map((draft) => {
                const toneLabel = draft.tone ? formatToneLabel(draft.tone) : null;
                const sourceLabel = draftSourceLabel(draft.source);
                const showLabel = draft.label && draft.label !== sourceLabel ? draft.label : null;
                return (
                  <div
                    key={draft.id}
                    className="flex w-full max-w-none flex-col items-start rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 text-xs leading-relaxed"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                      <span>{formatNoteDate(draft.createdAt)}</span>
                      <span className="text-[color:var(--brand)]">{sourceLabel}</span>
                      {showLabel && <span className="text-[color:var(--text)]">{showLabel}</span>}
                      {toneLabel && <span className="text-[color:var(--text)]">Tono {toneLabel}</span>}
                    </div>
                    <div className="mt-2 text-[12px] text-[color:var(--text)] whitespace-pre-wrap">{draft.text}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleUseManagerReplyAsMainMessage(
                            draft.text,
                            draft.label ?? sourceLabel,
                            `draft:${draft.id}`
                          )
                        }
                        className={inlineActionButtonClass}
                      >
                        Usar en mensaje
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGeneratedDraft(draft.id)}
                        className="inline-flex items-center rounded-full border border-[color:rgba(244,63,94,0.6)] bg-[color:rgba(244,63,94,0.08)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.16)]"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {displayInternalNotes.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[color:var(--muted)]">Borradores</div>
              {displayInternalNotes.map((msg) => {
                const origin = normalizeFrom(msg.from);
                const isCreatorNote = origin === "creator";
                const label = isCreatorNote ? "Tú" : "Manager IA";
                const isStickerNote = msg.type === "STICKER";
                const sticker = isStickerNote ? getStickerById(msg.stickerId ?? null) : null;
                const stickerSrc = typeof sticker?.file === "string" ? sticker.file.trim() : "";
                const noteText =
                  msg.type === "CONTENT"
                    ? msg.contentItem?.title || "Contenido interno"
                    : isStickerNote
                    ? sticker?.label || "Sticker"
                    : msg.text || "";
                return (
                  <div
                    key={msg.id}
                    className={clsx(
                      "flex w-full max-w-none flex-col",
                      isCreatorNote ? "items-end" : "items-start"
                    )}
                    data-draft-id={msg.id}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">{label}</span>
                    <div
                      className={clsx(
                        "w-full rounded-2xl px-4 py-3 text-xs leading-relaxed",
                        isCreatorNote
                          ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]"
                          : "bg-[color:var(--surface-1)] text-[color:var(--text)] border border-[color:var(--surface-border)]",
                        highlightDraftId === msg.id &&
                          "ring-2 ring-[color:var(--ring)] ring-offset-2 ring-offset-[color:var(--surface-1)]"
                      )}
                    >
                      {isCreatorNote && (
                        <span className="mb-1 inline-flex items-center rounded-full border border-[color:rgba(245,158,11,0.7)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--warning)]">
                          INTERNO
                        </span>
                      )}
                      {isStickerNote ? (
                        <div className="flex items-center justify-center">
                          {sticker && stickerSrc ? (
                            <Image
                              src={stickerSrc}
                              alt={sticker.label}
                              width={96}
                              height={96}
                              unoptimized
                              className="h-24 w-24 object-contain"
                            />
                          ) : (
                            <span className="text-[11px] text-[color:var(--muted)]">Sticker</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <div>{noteText}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleUseManagerReplyAsMainMessage(
                                  noteText,
                                  "Borrador interno",
                                  `internal:draft:${msg.id}`
                                )
                              }
                              className={inlineActionButtonClass}
                            >
                              Usar en mensaje
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAskManagerFromDraft(noteText)}
                              className={inlineActionButtonClass}
                            >
                              Preguntar al Manager
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3">
          <div className="text-[11px] font-semibold text-[color:var(--muted)]">Nuevo borrador</div>
          <div className="mt-2 flex items-end gap-2">
            <textarea
              rows={1}
              className="flex-1 w-full rounded-xl bg-[color:var(--surface-2)] px-4 py-3 text-xs leading-6 text-[color:var(--text)] placeholder:text-[color:var(--muted)] resize-none overflow-y-auto whitespace-pre-wrap break-words focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
              placeholder="Guarda un borrador interno…"
              ref={internalDraftInputRef}
              value={internalDraftInput}
              onChange={(e) => {
                setInternalDraftInput(e.target.value);
                autoGrowTextarea(e.currentTarget, MAX_INTERNAL_COMPOSER_HEIGHT);
              }}
              onKeyDown={handleInternalDraftKeyDown}
            />
            <button
              type="button"
              onClick={handleSendInternalDraft}
              className="h-8 px-3 rounded-2xl border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[11px] font-semibold text-[color:var(--text)] transition hover:bg-[color:rgba(245,158,11,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!internalDraftInput.trim()}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    );

    const renderInternalNoteContent = () => {
      const trimmedProfile = profileDraft.trim();
      const profileChanged = trimmedProfile !== normalizedProfileText;
      const canSaveProfile = profileChanged;
      const hasNextActionDraft = Boolean(
        nextActionDraft.trim() || nextActionDate.trim() || nextActionTime.trim()
      );
      const hasSavedNextAction = Boolean(followUpOpen);
      const canClearNextAction = hasNextActionDraft || hasSavedNextAction;
      const canArchiveNextAction = hasSavedNextAction;

      const renderHistoryItem = (item: FanFollowUp) => {
        const timestamp = item.doneAt || item.updatedAt || item.createdAt || "";
        const statusLabel = item.status === "DONE" ? "Seguimiento hecho" : "Seguimiento borrado";
        const statusTone = item.status === "DONE" ? "text-[color:var(--warning)]" : "text-[color:var(--danger)]";
        const due = splitDueAt(item.dueAt ?? null);
        const dueLabel = formatWhen(item.dueAt ?? null);
        return (
          <div key={item.id} className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 text-[10px] text-[color:var(--muted)]">
              <span>{timestamp ? formatNoteDate(timestamp) : ""}</span>
              <span className={statusTone}>{statusLabel}</span>
            </div>
            <div className="text-[11px] whitespace-pre-wrap">{item.title}</div>
            {item.note && <div className="text-[11px] whitespace-pre-wrap text-[color:var(--muted)]">{item.note}</div>}
            {dueLabel && (
              <div className="text-[10px] text-[color:var(--muted)]">
                Para {dueLabel}
                {due.time ? ` · ${due.time}` : ""}
              </div>
            )}
          </div>
        );
      };

      return (
        <div className="px-4 py-3 space-y-4">
          <div className="text-[11px] text-[color:var(--muted)]">
            Perfil del fan + seguimiento. Se usa como contexto del Manager IA.
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-[color:var(--muted)]">Perfil del fan</div>
            </div>
            <textarea
              ref={profileInputRef}
              value={profileDraft}
              onChange={(e) => {
                profileDraftEditedRef.current = true;
                setProfileDraft(e.target.value);
              }}
              rows={3}
              className="w-full resize-none rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] placeholder:text-[color:var(--muted)] outline-none focus:border-[color:var(--border-a)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              placeholder="Perfil del fan: contexto, límites, preferencias, tono, etc."
            />
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!canSaveProfile}
                className="rounded-lg border border-[color:rgba(245,158,11,0.8)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-xs font-medium text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[color:rgba(245,158,11,0.16)]"
              >
                Guardar perfil
              </button>
              {!canSaveProfile && trimmedProfile.length > 0 && (
                <span>Sin cambios</span>
              )}
              {profileError && <span className="text-[color:var(--danger)]">{profileError}</span>}
              {profileLoading && <span>Actualizando...</span>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-[color:var(--muted)]">Nota rápida</div>
              {!quickNoteEditing && (
                <button
                  type="button"
                  onClick={openQuickNoteEditor}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:rgba(245,158,11,0.7)] hover:text-[color:var(--text)]"
                >
                  Editar
                </button>
              )}
            </div>
            {quickNoteEditing ? (
              <div className="space-y-2">
                <textarea
                  value={quickNoteDraft}
                  onChange={(e) => setQuickNoteDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] placeholder:text-[color:var(--muted)] outline-none focus:border-[color:var(--border-a)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  placeholder="Nota rápida..."
                />
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                  <button
                    type="button"
                    onClick={handleSaveQuickNote}
                    disabled={quickNoteLoading}
                    className="rounded-lg border border-[color:rgba(245,158,11,0.8)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-xs font-medium text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[color:rgba(245,158,11,0.16)]"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={cancelQuickNoteEditor}
                    className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-medium text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                  >
                    Cancelar
                  </button>
                  {quickNoteLoading && <span>Guardando...</span>}
                  {quickNoteError && <span className="text-[color:var(--danger)]">{quickNoteError}</span>}
                </div>
              </div>
            ) : quickNote.trim() ? (
              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text)] whitespace-pre-wrap">
                {quickNote}
              </div>
            ) : (
              <div className="text-[11px] text-[color:var(--muted)]">Sin nota rápida.</div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[color:var(--muted)]">Seguimiento</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                ref={nextActionInputRef}
                type="text"
                value={nextActionDraft}
                onChange={(e) => setNextActionDraft(e.target.value)}
                className="md:col-span-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] placeholder:text-[color:var(--muted)] outline-none focus:border-[color:var(--border-a)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                placeholder="Ej: Proponer pack especial cuando cobre"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] outline-none focus:border-[color:var(--border-a)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                />
                <input
                  type="time"
                  value={nextActionTime}
                  onChange={(e) => setNextActionTime(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] outline-none focus:border-[color:var(--border-a)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: "Seguimiento mañana", days: 1 },
                { label: "+3d", days: 3 },
                { label: "+7d", days: 7 },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleQuickFollowUp(item.days, "Seguimiento")}
                  disabled={followUpLoading}
                  className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveNextAction}
                disabled={!hasNextActionDraft}
                className="rounded-lg border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1 text-xs font-medium text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
              >
                Guardar seguimiento
              </button>
              <button
                type="button"
                onClick={handleClearNextAction}
                disabled={!canClearNextAction}
                className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-medium text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[color:var(--surface-1)]"
              >
                Borrar seguimiento
              </button>
              <button
                type="button"
                onClick={handleArchiveNextAction}
                disabled={!canArchiveNextAction}
                className="rounded-lg border border-[color:rgba(245,158,11,0.8)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-xs font-medium text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[color:rgba(245,158,11,0.16)]"
              >
                Marcar como hecho
              </button>
              {followUpError && <span className="text-[10px] text-[color:var(--danger)]">{followUpError}</span>}
              {followUpLoading && <span className="text-[10px] text-[color:var(--muted)]">Actualizando...</span>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[color:var(--muted)]">Historial</div>
            {followUpHistoryLoading && <div className="text-[11px] text-[color:var(--muted)]">Cargando historial…</div>}
            {followUpHistoryError && !followUpHistoryLoading && (
              <div className="text-[11px] text-[color:var(--danger)]">{followUpHistoryError}</div>
            )}
            {!followUpHistoryLoading && followUpHistory.length === 0 && (
              <div className="text-[11px] text-[color:var(--muted)]">Aún no hay entradas de historial.</div>
            )}
            {followUpHistory.map((item) => renderHistoryItem(item))}
          </div>
        </div>
      );
    };

    const renderInlinePanel = (tab: InlineTab | null) => {
      if (!tab) return null;

      if (tab === "manager") {
        const managerBodyRef = internalPanelTab === "internal" ? managerChatListRef : managerPanelScrollRef;
        const handleManagerBodyScroll =
          internalPanelTab === "internal" ? updateInternalChatScrollState : updateManagerPanelScrollState;
        const setManagerBodyRef = (node: HTMLDivElement | null) => {
          overlayBodyRef.current = node;
          managerBodyRef.current = node;
        };
        return (
          <InlinePanelShell
            title="Panel interno"
            onClose={closeDockPanel}
            onBodyWheel={handlePanelWheel}
            containerClassName={dockOverlaySheetClassName}
            containerRef={dockOverlaySheetRef}
            bodyScrollClassName={dockOverlayBodyScrollClassName}
            bodyRef={setManagerBodyRef}
            onBodyScroll={handleManagerBodyScroll}
            scrollable={false}
            bodyClassName="px-0 py-0"
            onBodyTouchMove={handlePanelTouchMove}
            stickyHeader
            headerSlot={(
              <div
                className="flex flex-wrap items-center gap-2"
                role="tablist"
                aria-label="Panel interno"
              >
                {[
                  { id: "manager", label: "Manager IA" },
                  { id: "internal", label: "Borradores" },
                  { id: "note", label: "Perfil + Seguimiento" },
                ].map((tabItem) => {
                  const isActive = internalPanelTab === tabItem.id;
                  return (
                    <button
                      key={tabItem.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setInternalPanelTab(tabItem.id as InternalPanelTab);
                      }}
                      className={clsx(
                        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                        isActive
                          ? "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.12)] text-[color:var(--text)]"
                          : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] hover:border-[color:var(--surface-border-hover)] hover:text-[color:var(--text)]"
                      )}
                    >
                      {tabItem.label}
                    </button>
                  );
                })}
              </div>
            )}
          >
            <div className="flex flex-col gap-3">
              {internalPanelTab === "manager" && renderInternalManagerContent()}
              {internalPanelTab === "internal" && renderInternalChatContent()}
              {internalPanelTab === "note" && renderInternalNoteContent()}
            </div>
          </InlinePanelShell>
        );
      }

      if (tab === "templates") {
        const hasPlaybooks = playbookCount > 0;
        const templateTabs = [
          { id: "fan", label: "Para el fan" },
          { id: "manager", label: "Para el Manager" },
        ] as const;
        const templateTabBase =
          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition";
        const templateTabInactive =
          "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] hover:border-[color:var(--surface-border-hover)] hover:text-[color:var(--text)]";
        const templateTabFanActive =
          "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]";
        const templateTabManagerActive = "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.12)] text-[color:var(--text)]";
        return (
          <InlinePanelShell
            title="Guiones"
            onClose={closeDockPanel}
            containerClassName={dockOverlaySheetClassName}
            containerRef={dockOverlaySheetRef}
            bodyScrollClassName={dockOverlayBodyScrollClassName}
            bodyRef={overlayBodyRef}
            onBodyWheel={handlePanelWheel}
            onBodyTouchMove={handlePanelTouchMove}
            stickyHeader
          >
            <div className="space-y-3">
              <div
                className="flex flex-wrap items-center gap-2"
                role="tablist"
                aria-label="Guiones"
              >
                {templateTabs.map((tabItem) => {
                  const isActive = templateScope === tabItem.id;
                  const activeClass = tabItem.id === "fan" ? templateTabFanActive : templateTabManagerActive;
                  return (
                    <button
                      key={tabItem.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setTemplateScope(tabItem.id);
                      }}
                      className={clsx(templateTabBase, isActive ? activeClass : templateTabInactive)}
                    >
                      {tabItem.label}
                    </button>
                  );
                })}
              </div>
              {templateScope === "fan" ? (
                hasPlaybooks ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={playbookSearch}
                        onChange={(event) => setPlaybookSearch(event.target.value)}
                        placeholder="Buscar guiones..."
                        className="w-full flex-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
                      />
                      <button
                        type="button"
                        onClick={() => setPlaybookProMode((prev) => !prev)}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                          playbookProMode
                            ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                        )}
                      >
                        {playbookProMode ? "Modo Pro ON" : "Modo Pro"}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--muted)]">
                      <label className="flex items-center gap-2">
                        <span>Tier</span>
                        <select
                          value={playbookTierFilter ?? "all"}
                          onChange={(event) =>
                            setPlaybookTierFilter(
                              event.target.value === "all" ? "all" : (event.target.value as PlaybookTier)
                            )
                          }
                          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] text-[color:var(--text)]"
                        >
                          <option value="all">Todos</option>
                          <option value="T0">T0</option>
                          <option value="T1">T1</option>
                          <option value="T2">T2</option>
                          <option value="T3">T3</option>
                        </select>
                      </label>
                      <div className="flex items-center gap-2">
                        <span>Momento</span>
                        <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
                          {(["DAY", "NIGHT", "ANY"] as const).map((moment) => (
                            <button
                              key={moment}
                              type="button"
                              onClick={() => setPlaybookMomentFilter(moment)}
                              className={clsx(
                                "px-2 py-1 rounded-full text-[10px] font-semibold",
                                playbookMomentFilter === moment
                                  ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)] border border-[color:var(--brand)]"
                                  : "text-[color:var(--text)]"
                              )}
                            >
                              {PLAYBOOK_MOMENT_LABELS[moment]}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setPlaybookMomentFilter("all")}
                            className={clsx(
                              "px-2 py-1 rounded-full text-[10px] font-semibold",
                              playbookMomentFilter === "all"
                                ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)] border border-[color:var(--brand)]"
                                : "text-[color:var(--text)]"
                            )}
                          >
                            Todos
                          </button>
                        </div>
                      </div>
                      <label className="flex items-center gap-2">
                        <span>Objetivo</span>
                        <select
                          value={playbookObjectiveFilter}
                          onChange={(event) =>
                            setPlaybookObjectiveFilter(
                              event.target.value === "all"
                                ? "all"
                                : (event.target.value as PlaybookObjective)
                            )
                          }
                          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] text-[color:var(--text)]"
                        >
                          <option value="all">Todos</option>
                          {Object.entries(PLAYBOOK_OBJECTIVE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="text-[10px] text-[color:var(--muted)]">
                      {playbookProMode
                        ? "Modo Pro activo: lista completa de guiones."
                        : "Recomendadas: selección corta para hoy."}
                    </div>
                    {visiblePlaybooks.length === 0 ? (
                      <InlineEmptyState icon="folder" title="Sin guiones con estos filtros" />
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {visiblePlaybooks.map((playbook) => {
                          const selectionIndex = playbookSelections[playbook.id] ?? 0;
                          const message =
                            playbook.messages[selectionIndex % playbook.messages.length] ?? playbook.messages[0] ?? "";
                          const tierLabel = playbook.tier ?? "—";
                          const momentLabel = PLAYBOOK_MOMENT_LABELS[playbook.moment];
                          const objectiveLabel = PLAYBOOK_OBJECTIVE_LABELS[playbook.objective];
                          return (
                            <div
                              key={playbook.id}
                              className="flex flex-col gap-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[12px] font-semibold text-[color:var(--text)]">
                                    {playbook.title}
                                  </div>
                                  <p className="text-[11px] text-[color:var(--muted)] line-clamp-2">
                                    {playbook.description}
                                  </p>
                                </div>
                                <div className="text-[10px] text-[color:var(--muted)] whitespace-nowrap">
                                  {tierLabel} · {momentLabel}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 text-[10px] text-[color:var(--muted)]">
                                <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5">
                                  {objectiveLabel}
                                </span>
                                {playbook.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={`${playbook.id}-${tag}`}
                                    className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[11px] text-[color:var(--text)] line-clamp-3">{message}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    insertComposerTextWithUndo(resolveFanTemplateText(message), {
                                      title: "Guion insertado",
                                      detail: playbook.title,
                                      actionKey: `playbook:${playbook.id}`,
                                    });
                                    closeDockPanel();
                                  }}
                                  className={inlineActionButtonClass}
                                >
                                  Insertar en mensaje
                                </button>
                                {playbook.messages.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPlaybookSelections((prev) => ({
                                        ...prev,
                                        [playbook.id]: (selectionIndex + 1) % playbook.messages.length,
                                      }))
                                    }
                                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]"
                                  >
                                    Otra opción
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <InlineEmptyState icon="folder" title="Sin guiones disponibles" />
                )
              ) : managerPromptTemplate ? (
                <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 space-y-2">
                  <div className="text-[11px] font-semibold text-[color:var(--muted)]">Guion sugerido</div>
                  <p className="text-[11px] text-[color:var(--text)] line-clamp-2">{managerPromptTemplate}</p>
                  <button
                    type="button"
                    onClick={() => handleAskManagerFromDraft(managerPromptTemplate)}
                    className={managerActionButtonClass}
                  >
                    Insertar en Manager
                  </button>
                </div>
              ) : (
                <InlineEmptyState icon="folder" title="Sin guiones para el Manager" />
              )}
            </div>
          </InlinePanelShell>
        );
      }

      if (tab === "tools") {
        return renderInlineToolsPanel();
      }

      return null;
    };

    const panelTab = managerPanelOpen ? managerPanelTab : null;
    const isPanelOpen = managerPanelOpen;
    const isDockOverlay = Boolean(panelTab);
    const panelContent = renderInlinePanel(panelTab);

    const panelId = "composer-inline-panel";

    const chips = (
      <>
        {showManagerChip && (
          <div
            className={clsx(
              chipBase,
              managerPanelOpen && managerPanelTab === "manager" ? chipActiveClass : chipInactiveClass
            )}
          >
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleManagerPanelTabClick("manager");
              }}
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              aria-expanded={managerPanelOpen && managerPanelTab === "manager"}
              aria-controls={panelId}
            >
              <span>{managerChipLabel}</span>
            </button>
            {managerPanelOpen && managerPanelTab === "manager" && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeDockPanel();
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--surface-2)] text-[9px] leading-none text-[color:var(--muted)] ring-1 ring-[color:var(--surface-ring)] transition hover:bg-[color:var(--surface-1)] hover:text-[color:var(--text)]"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            )}
          </div>
        )}
        {showTemplatesChip && (
          <div
            className={clsx(
              chipBase,
              managerPanelOpen && managerPanelTab === "templates" ? chipActiveClass : chipInactiveClass
            )}
          >
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleManagerPanelTabClick("templates");
              }}
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              aria-expanded={managerPanelOpen && managerPanelTab === "templates"}
              aria-controls={panelId}
            >
              <span className="flex items-center gap-1.5">
                <span>Guiones</span>
                {templatesCount > 0 && (
                  <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-1.5 py-0.5 text-[10px] text-[color:var(--muted)]">
                    {templatesCount}
                  </span>
                )}
              </span>
            </button>
            {managerPanelOpen && managerPanelTab === "templates" && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeDockPanel();
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--surface-2)] text-[9px] leading-none text-[color:var(--muted)] ring-1 ring-[color:var(--surface-ring)] transition hover:bg-[color:var(--surface-1)] hover:text-[color:var(--text)]"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            )}
          </div>
        )}
        {showToolsChip && (
          <div
            className={clsx(
              chipBase,
              managerPanelOpen && managerPanelTab === "tools" ? chipActiveClass : chipInactiveClass
            )}
          >
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleManagerPanelTabClick("tools");
              }}
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              aria-expanded={managerPanelOpen && managerPanelTab === "tools"}
              aria-controls={panelId}
            >
              <span>Herramientas</span>
            </button>
            {managerPanelOpen && managerPanelTab === "tools" && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeDockPanel();
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--surface-2)] text-[9px] leading-none text-[color:var(--muted)] ring-1 ring-[color:var(--surface-ring)] transition hover:bg-[color:var(--surface-1)] hover:text-[color:var(--text)]"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </>
    );

    const panel =
      isPanelOpen && panelContent ? (
        <InlinePanelContainer
          isOpen={isPanelOpen}
          panelId={panelId}
          bottomOffset={!isDockOverlay && !isFanMode ? dockOffset : undefined}
          isOverlay={isDockOverlay}
        >
          {isDockOverlay ? (
            <>
              <div
                className="dockOverlayBackdrop bg-[color:var(--surface-overlay)]"
              />
              <div className={dockOverlayPanelClassName}>{panelContent}</div>
            </>
          ) : (
            <div
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              {panelContent}
            </div>
          )}
        </InlinePanelContainer>
      ) : null;

    return {
      chips: <ComposerChipsRow ref={dockRef}>{chips}</ComposerChipsRow>,
      panel,
      isPanelOpen,
      isDockOverlay,
    };
  };

  useEffect(() => {
    setTranslationPreviewStatus("idle");
    setTranslationPreviewText(null);
    setTranslationPreviewNotice(null);
    translationPreviewKeyRef.current = null;
  }, [id, effectiveLanguage]);

  useEffect(() => {
    setIaMessage(null);
    setIaBlocked(false);
    fetchAiStatus();
    fetchAiSettingsTone();
  }, [conversation.id]);

  useEffect(() => {
    setManagerChatInput("");
  }, [conversation.id]);

  useEffect(() => {
    setHasManualManagerObjective(false);
    setCurrentObjective(null);
    setManagerSuggestions([]);
    const storedTone = id ? fanToneById[id] : null;
    setHasManualTone(Boolean(storedTone));
    setFanTone(storedTone ?? getDefaultFanTone(fanManagerAnalysis.state));
    setLastAutopilotObjective(null);
    setLastAutopilotTone(null);
    setIsAutoPilotLoading(false);
  }, [conversation.id, fanManagerAnalysis.state, fanToneById, id]);

  useEffect(() => {
    if (!isTranslationPreviewAvailable || !translationPreviewOpen || !isFanTarget) {
      if (translationPreviewTimer.current) {
        clearTimeout(translationPreviewTimer.current);
      }
      if (translationPreviewAbortRef.current) {
        translationPreviewAbortRef.current.abort();
      }
      translationPreviewKeyRef.current = null;
      setTranslationPreviewStatus("idle");
      setTranslationPreviewText(null);
      setTranslationPreviewNotice(null);
      return;
    }

    const trimmed = messageSend.trim();
    if (!trimmed) {
      if (translationPreviewTimer.current) {
        clearTimeout(translationPreviewTimer.current);
      }
      if (translationPreviewAbortRef.current) {
        translationPreviewAbortRef.current.abort();
      }
      translationPreviewKeyRef.current = null;
      setTranslationPreviewStatus("idle");
      setTranslationPreviewText(null);
      setTranslationPreviewNotice(null);
      return;
    }

    const previewKey = `${id || "none"}::${effectiveLanguage}::${trimmed}`;
    if (translationPreviewKeyRef.current === previewKey) return;

    if (translationPreviewTimer.current) {
      clearTimeout(translationPreviewTimer.current);
    }

    translationPreviewTimer.current = setTimeout(async () => {
      translationPreviewRequestId.current += 1;
      const requestId = translationPreviewRequestId.current;
      setTranslationPreviewStatus("loading");
      setTranslationPreviewText(null);
      setTranslationPreviewNotice(null);

      if (translationPreviewAbortRef.current) {
        translationPreviewAbortRef.current.abort();
      }
      const controller = new AbortController();
      translationPreviewAbortRef.current = controller;

      try {
        const res = await fetch("/api/messages/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fanId: id,
            text: trimmed,
            targetLanguage: effectiveLanguage,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (requestId !== translationPreviewRequestId.current) return;

        if (res.status === 501 && data?.code === "TRANSLATE_NOT_CONFIGURED") {
          setTranslationPreviewStatus("idle");
          setTranslationPreviewNotice(null);
          return;
        }

        if (!res.ok || !data?.ok) {
          setTranslationPreviewStatus("error");
          setTranslationPreviewNotice("No se pudo generar la traducción. Se enviará en español.");
          return;
        }

        if (typeof data.translatedText === "string" && data.translatedText.trim()) {
          setTranslationPreviewStatus("ready");
          setTranslationPreviewText(data.translatedText);
          setTranslationPreviewNotice(null);
          translationPreviewKeyRef.current = previewKey;
          return;
        }

        const reason = typeof data.reason === "string" ? data.reason : "";
        if (reason === "empty") {
          setTranslationPreviewNotice(null);
        } else {
          setTranslationPreviewNotice("No se pudo generar la traducción. Se enviará en español.");
        }
        setTranslationPreviewStatus("unavailable");
        translationPreviewKeyRef.current = previewKey;
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setTranslationPreviewStatus("error");
        setTranslationPreviewNotice("No se pudo generar la traducción. Se enviará en español.");
      }
    }, 650);

    return () => {
      if (translationPreviewTimer.current) {
        clearTimeout(translationPreviewTimer.current);
      }
    };
  }, [
    effectiveLanguage,
    id,
    isTranslationPreviewAvailable,
    isFanTarget,
    messageSend,
    translationPreviewOpen,
  ]);

  useEffect(() => {
    if (!hasManualTone) {
      setFanTone(getDefaultFanTone(fanManagerAnalysis.state));
    }
  }, [fanManagerAnalysis.state, hasManualTone]);

  const updateManagerPanelScrollState = useCallback(() => {
    const el = managerPanelScrollRef.current;
    if (!el) return;
    managerPanelScrollTopRef.current = el.scrollTop;
    const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    managerPanelStickToBottomRef.current = distanceToBottom < SCROLL_BOTTOM_THRESHOLD;
  }, [SCROLL_BOTTOM_THRESHOLD]);

  const syncManagerPanelScroll = useCallback(
    (options?: { forceToBottom?: boolean }) => {
      const el = managerPanelScrollRef.current;
      if (!el) return;
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const shouldStick = options?.forceToBottom || managerPanelStickToBottomRef.current;
      if (shouldStick) {
        el.scrollTop = maxScrollTop;
        return;
      }
      el.scrollTop = Math.min(managerPanelScrollTopRef.current, maxScrollTop);
    },
    []
  );

  const updateInternalChatScrollState = useCallback(() => {
    const el = managerChatListRef.current;
    if (!el) return;
    internalChatScrollTopRef.current = el.scrollTop;
    const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    internalChatStickToBottomRef.current = distanceToBottom < SCROLL_BOTTOM_THRESHOLD;
  }, [SCROLL_BOTTOM_THRESHOLD]);

  const syncInternalChatScroll = useCallback(
    (options?: { forceToBottom?: boolean }) => {
      const el = managerChatListRef.current;
      if (!el) return;
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const shouldStick =
        options?.forceToBottom || internalChatForceScrollRef.current || internalChatStickToBottomRef.current;
      if (shouldStick) {
        el.scrollTop = maxScrollTop;
        internalChatForceScrollRef.current = false;
        return;
      }
      el.scrollTop = Math.min(internalChatScrollTopRef.current, maxScrollTop);
    },
    []
  );

  useIsomorphicLayoutEffect(() => {
    if (!managerPanelOpen || managerPanelTab !== "manager" || internalPanelTab !== "manager") return;
    const frame = requestAnimationFrame(() => {
      syncManagerPanelScroll();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    managerPanelOpen,
    managerPanelTab,
    internalPanelTab,
    conversation.id,
    managerChatMessages.length,
    syncManagerPanelScroll,
  ]);

  useEffect(() => {
    if (!managerPanelOpen || managerPanelTab !== "manager" || internalPanelTab !== "manager") return;
    if (!managerChatEndRef.current) return;
    if (managerPanelSkipAutoScrollRef.current) {
      managerPanelSkipAutoScrollRef.current = false;
      return;
    }
    managerChatEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [managerPanelOpen, managerPanelTab, internalPanelTab, managerChatMessages.length]);

  useIsomorphicLayoutEffect(() => {
    if (!managerPanelOpen || managerPanelTab !== "manager" || internalPanelTab !== "internal") return;
    const frame = requestAnimationFrame(() => {
      syncInternalChatScroll();
    });
    return () => cancelAnimationFrame(frame);
  }, [managerPanelOpen, managerPanelTab, internalPanelTab, internalMessages.length, syncInternalChatScroll]);

  useEffect(() => {
    if (!managerPanelOpen) return;
    managerPanelScrollTopRef.current = 0;
    managerPanelStickToBottomRef.current = false;
    managerPanelSkipAutoScrollRef.current = true;
    internalChatScrollTopRef.current = 0;
    internalChatStickToBottomRef.current = false;
    internalChatForceScrollRef.current = false;
    let frame = 0;
    let frame2 = 0;
    frame = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        overlayBodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(frame2);
    };
  }, [managerPanelOpen, managerPanelTab, internalPanelTab, conversation.id]);

  useIsomorphicLayoutEffect(() => {
    autoGrowTextarea(managerChatInputRef.current, MAX_INTERNAL_COMPOSER_HEIGHT);
  }, [managerChatInput, autoGrowTextarea]);

  useIsomorphicLayoutEffect(() => {
    autoGrowTextarea(internalDraftInputRef.current, MAX_INTERNAL_COMPOSER_HEIGHT);
  }, [internalDraftInput, autoGrowTextarea]);

  const mapQuickIntentToSuggestionIntent = useCallback((intent?: ManagerQuickIntent): ManagerSuggestionIntent => {
    switch (intent) {
      case "romper_hielo":
      case "bienvenida":
        return "romper_hielo";
      case "llevar_a_mensual":
      case "renovacion":
        return "upsell_mensual_suave";
      case "reactivar_fan_frio":
      case "ofrecer_extra":
      default:
        return "pregunta_simple";
    }
  }, []);

  const inferSuggestionIntentFromPrompt = useCallback((prompt: string): ManagerSuggestionIntent => {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("mensual") || normalized.includes("suscrip") || normalized.includes("renov")) {
      return "upsell_mensual_suave";
    }
    if (normalized.includes("cierre") || normalized.includes("cerrar") || normalized.includes("desped")) {
      return "cierre_suave";
    }
    if (normalized.includes("pregunta") || normalized.includes("preguntar")) {
      return "pregunta_simple";
    }
    return "romper_hielo";
  }, []);

  const buildSimulatedManagerSuggestions = useCallback(({
    fanName,
    tone,
    intent,
  }: {
    fanName?: string;
    tone: FanTone;
    intent: ManagerSuggestionIntent;
  }): { title: string; suggestions: string[] } => {
    const nombre = getFirstName(fanName);
    const saludo = nombre ? `Hola ${nombre},` : "Hola,";
    const titles: Record<ManagerSuggestionIntent, string> = {
      romper_hielo: "Romper el hielo",
      pregunta_simple: "Pregunta simple",
      cierre_suave: "Cierre suave",
      upsell_mensual_suave: "Mensual suave",
    };
    const suggestionsByIntent: Record<ManagerSuggestionIntent, Record<FanTone, string[]>> = {
      romper_hielo: {
        suave: [
          `${saludo} ¿cómo estás hoy? Si te apetece, cuéntame en una frase qué buscas y preparo algo sencillo para empezar.`,
          `${saludo} ¿prefieres que te envíe una idea rápida o me cuentas qué te apetece?`,
          "Si te parece, empezamos con algo simple y cercano. Dime qué te apetece y lo preparo.",
        ],
        intimo: [
          `${saludo} qué gusto tenerte aquí. Dime en una frase qué te apetece y preparo algo a tu medida.`,
          `${saludo} si te parece, arrancamos con algo suave y cercano. ¿Qué te gustaría explorar primero?`,
          "Quiero que te sientas cómodo/a. ¿Te mando una idea corta para empezar o prefieres contarme qué buscas?",
        ],
        picante: [
          `${saludo} tengo ganas de darte algo con chispa. ¿Te apetece suave o más atrevido para empezar?`,
          "Dime el mood de hoy y preparo algo con un toque picante.",
          `${saludo} ¿quieres que arranquemos con una idea rápida y más intensa?`,
        ],
      },
      pregunta_simple: {
        suave: [
          "Pregunta rápida: ¿te apetece más un audio corto o una guía práctica?",
          "¿Prefieres algo breve para empezar o algo más completo?",
          "Para acertar mejor, dime qué te apetece hoy y lo preparo.",
        ],
        intimo: [
          "Solo para orientarme: ¿te apetece algo más íntimo o más ligero hoy?",
          "¿Qué te haría sentir más a gusto ahora mismo?",
          "¿Quieres que lo hagamos suave y cercano o prefieres algo más directo?",
        ],
        picante: [
          "Pregunta rápida: ¿te apetece un toque más atrevido hoy?",
          "¿Te va algo sugerente o prefieres algo más intenso?",
          "Dime en una palabra el mood de hoy y preparo algo con chispa.",
        ],
      },
      cierre_suave: {
        suave: [
          "Te dejo por aquí para no saturarte. Cuando te apetezca, seguimos.",
          "Cierro por ahora; si te apetece, me dices y retomo con más.",
          "Lo dejamos aquí y seguimos cuando quieras. Estoy pendiente.",
        ],
        intimo: [
          "Te dejo respirar un poco. Cuando te apetezca, retomamos con calma.",
          "Me quedo por aquí; cuando quieras, seguimos a tu ritmo.",
          "Lo dejamos suave por hoy. Si te apetece, volvemos luego.",
        ],
        picante: [
          "Te dejo con ganas y seguimos cuando quieras 😏",
          "Lo paro aquí para no quemarlo; cuando quieras, subimos un poco el tono.",
          "Cierro por ahora, pero me quedo con ganas. Dime y seguimos.",
        ],
      },
      upsell_mensual_suave: {
        suave: [
          `${saludo} si quieres que te acompañe cada semana, puedo pasarte el mensual y así tienes contenido fijo sin pedirlo cada vez. ¿Te interesa?`,
          "Si te encaja, pasamos a mensual y te preparo algo cada semana. ¿Quieres que te pase el enlace?",
          "Para no ir extra a extra, podemos pasar a mensual y mantener ritmo. ¿Te apetece?",
        ],
        intimo: [
          `${saludo} si te apetece seguir con calma y continuidad, el mensual me deja prepararte algo cada semana para ti. ¿Te paso el enlace?`,
          "Podemos hacerlo más cercano: mensual con contenido fijo y seguimiento, sin presión. ¿Te encaja?",
          "Si te gusta este espacio, el mensual nos permite ir más a tu ritmo y con contenido pensado para ti. ¿Quieres que lo activemos?",
        ],
        picante: [
          `${saludo} si te apetece subir un poco el ritmo, con el mensual puedo prepararte algo más intenso cada semana. ¿Te paso el enlace?`,
          "Podemos pasar a mensual y así te preparo algo con más chispa cada semana. ¿Lo quieres?",
          "Si quieres continuidad, el mensual nos da margen para ponernos más creativos. ¿Te encaja?",
        ],
      },
    };
    const suggestions = suggestionsByIntent[intent]?.[tone] ?? suggestionsByIntent[intent].suave;
    return { title: titles[intent], suggestions: suggestions.slice(0, 3) };
  }, []);

  const buildQuickIntentQuestion = (intent: ManagerQuickIntent, fanName?: string) => {
    const nombre = fanName || "este fan";
    switch (intent) {
      case "romper_hielo":
        return `Dame 2 opciones de mensaje breve y cálido para romper el hielo con ${nombre} sin vender nada todavía. Que suenen naturales.`;
      case "reactivar_fan_frio":
        return `Dame 2 opciones de mensaje para reactivar a ${nombre}, que antes era activo y ahora casi no escribe. Mezcla cercanía y curiosidad por su vida, sin sonar necesitado.`;
      case "ofrecer_extra":
        return `Dame un mensaje para ofrecerle un extra a ${nombre} basándote en lo que le suele gustar. Una sola propuesta clara, con sensación de detalle personalizado.`;
      case "llevar_a_mensual":
        return `Dame un mensaje para invitar a ${nombre} a pasar a suscripción mensual, reforzando 2 o 3 beneficios que una persona como ella suele valorar. Nada agresivo.`;
      case "renovacion":
        return `Redáctame un mensaje conciso para renovar cuanto antes a ${nombre}, insistiendo en que caduca en breve y ofreciendo cerrar ya la renovación.`;
      default:
        return "";
    }
  };

  const buildSuggestionsForObjective = useCallback(
    ({
      objective,
      fanName,
      tone,
      state,
      analysis,
    }: {
      objective: ManagerObjective;
      fanName?: string;
      tone: FanTone;
      state: FanManagerStateAnalysis["state"];
      analysis?: FanManagerStateAnalysis;
    }): ManagerSuggestion[] => {
      const nombre = fanName || "este fan";
      const daysLeft =
        typeof effectiveDaysLeft === "number" ? effectiveDaysLeft : analysis?.context.daysLeft ?? null;
      const inactivityDays = analysis?.context.inactivityDays ?? null;
      const extrasCount = analysis?.context.extrasCount ?? 0;
      const isVip = analysis?.context.isVip ?? false;
      const inactivityText =
        typeof inactivityDays === "number"
          ? inactivityDays === 0
            ? "hoy"
            : `${inactivityDays} días`
          : "tiempo";
      const renewalText =
        typeof daysLeft === "number"
          ? daysLeft <= 0
            ? "hoy"
            : `en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`
          : "en pocos días";
      const isCriticalExpiry = typeof daysLeft === "number" && daysLeft <= 0;
      const criticalRenewalSuggestions: ManagerSuggestion[] = [
        {
          id: "renovacion-hoy-1",
          label: "Renovación hoy",
          message: `Hola ${nombre}, tu acceso termina ${renewalText}. Si quieres seguir, te dejo el enlace y lo dejamos listo.`,
          intent: "renovacion",
        },
        {
          id: "renovacion-hoy-2",
          label: "Cerrar hoy",
          message: `${nombre}, si te apetece seguir, hoy mismo te paso el enlace y mantenemos el acceso sin cortes.`,
          intent: "renovacion",
        },
      ];

      const suggestions: Record<ManagerObjective, Record<FanTone, ManagerSuggestion[]>> = {
        bienvenida: {
          suave: [
            {
              id: "bienvenida-suave-1",
              label: "Bienvenida clara",
              message: `Hola ${nombre}, gracias por entrar. Cuéntame en una frase qué necesitas y preparo algo útil sin rodeos.`,
              intent: "romper_hielo",
            },
          ],
          intimo: [
            {
              id: "bienvenida-curioso-1",
              label: "Bienvenida guiada",
              message: `Hola ${nombre}, gracias por suscribirte 🖤 Dime en una frase qué esperas de este chat (ideas, acompañamiento o algo muy concreto) y preparo algo a tu medida.`,
              intent: "romper_hielo",
            },
            {
              id: "bienvenida-curioso-2",
              label: "Explorar intereses",
              message: `${nombre}, para guiarte bien necesito saber qué te mueve más: ¿mejorar algo concreto, probar algo nuevo o simplemente inspiración? Así te mando el primer contenido que encaje contigo.`,
              intent: "romper_hielo",
            },
          ],
          picante: [
            {
              id: "bienvenida-picante-1",
              label: "Bienvenida con chispa",
              message: `Hola ${nombre}, qué gusto tenerte aquí. Dime qué te apetece explorar primero y preparo algo que te pique la curiosidad desde ya.`,
              intent: "romper_hielo",
            },
          ],
        },
        romper_hielo: {
          suave: [
            {
              id: "romper-suave-1",
              label: "Primer paso",
              message: `Hola ${nombre}, veo que acabas de entrar. ¿Prefieres que te envíe una idea sencilla para empezar o contarme qué buscas y lo preparo?`,
              intent: "romper_hielo",
            },
          ],
          intimo: [
            {
              id: "romper-intimo-1",
              label: "Romper el hielo suave",
              message: `Hola ${nombre}, veo que acabas de entrar y no quiero saturarte. ¿Te mando una idea sencilla para empezar o prefieres contarme qué buscas?`,
              intent: "romper_hielo",
            },
            {
              id: "romper-intimo-2",
              label: "Pregunta sencilla",
              message: `${nombre}, cuéntame con una frase qué te gustaría recibir aquí (audio, guía corta, algo puntual) y preparo lo más fácil para que te estrenes.`,
              intent: "romper_hielo",
            },
          ],
          picante: [
            {
              id: "romper-picante-1",
              label: "Romper con guiño",
              message: `${nombre}, acabo de abrirte este espacio y quiero empezar con algo que te motive de verdad. Dime qué te apetece probar primero y lo preparo calentito.`,
              intent: "romper_hielo",
            },
          ],
        },
        reactivar_fan_frio: {
          suave: [
            {
              id: "reactivar-suave-1",
              label: "Retomar contacto",
              message: `Hola ${nombre}, hace ${inactivityText} que no hablamos. Si te apetece, retomamos con algo ligero y útil para ti.`,
              intent: "reactivar_fan_frio",
            },
          ],
          intimo: [
            {
              id: "reactivar-frio-1",
              label: "Reactivar fan frío",
              message: `Hola ${nombre}, hace ${inactivityText} que no hablamos y me pregunto cómo estás. Si te apetece retomamos con algo ligero y útil para ti, sin compromisos.`,
              intent: "reactivar_fan_frio",
            },
            {
              id: "reactivar-frio-2",
              label: "Motivo para volver",
              message: `${nombre}, sé que has estado desconectad@ y quiero darte un motivo sencillo para volver: te preparo un audio corto con una idea práctica para esta semana. ¿Te lo mando?`,
              intent: "reactivar_fan_frio",
            },
          ],
          picante: [
            {
              id: "reactivar-picante-1",
              label: "Recuperar chispa",
              message: `${nombre}, hace ${inactivityText} que no hablamos y me gustaría devolverte las ganas. Te preparo un detalle con un toque más atrevido para que vuelvas con ganas. ¿Te lo envío?`,
              intent: "reactivar_fan_frio",
            },
          ],
        },
        ofrecer_extra: {
          suave: [
            {
              id: "extra-suave-1",
              label: "Extra puntual",
              message: `${nombre}, puedo prepararte un extra concreto esta semana: un audio detallado + una idea práctica. Si te interesa, te paso el enlace y lo ajusto a ti.`,
              intent: "ofrecer_extra",
            },
          ],
          intimo: [
            {
              id: "extra-intimo-1",
              label: "Propuesta de extra",
              message: `${nombre}, se me ha ocurrido un extra muy a tu estilo para esta semana: algo más íntimo y personalizado que lo que suelo subir. Si te interesa, te cuento en detalle y lo adaptamos a lo que te apetezca ahora mismo.`,
              intent: "ofrecer_extra",
            },
          ],
          picante: [
            {
              id: "extra-picante-1",
              label: "Extra con picante",
              message: `${nombre}, tengo un extra más atrevido pensado para ti: algo personalizado y con ese toque que sé que te gusta. Si te apetece, te cuento y te paso el enlace.`,
              intent: "ofrecer_extra",
            },
          ],
        },
        llevar_a_mensual: {
          suave: [
            {
              id: "mensual-suave-1",
              label: "Invitar a mensual",
              message: `${nombre}, podemos pasar a mensual para que tengas contenido fijo cada semana sin pedirlo cada vez. ¿Te encaja que te pase el enlace?`,
              intent: "llevar_a_mensual",
            },
          ],
          intimo: [
            ...(state === "vip_comprador" || isVip || extrasCount >= 2
              ? [
                  {
                    id: "mensual-vip-1",
                    label: "Pasar a mensual",
                    message: `${nombre}, en vez de ir extra a extra podemos pasar a mensual y tener algo preparado cada semana solo para ti. Así no pierdes ritmo y puedo currarme más el contenido. ¿Te encaja probarlo?`,
                    intent: "llevar_a_mensual",
                  },
                  {
                    id: "mensual-vip-2",
                    label: "Mensual sin fricción",
                    message: `${nombre}, como siempre respondes a lo que te propongo, te ofrezco el plan mensual: recibes contenido fijo + seguimiento sin tener que pedir cada vez. ¿Quieres que te pase el enlace?`,
                    intent: "llevar_a_mensual",
                  },
                ]
              : state === "a_punto_de_caducar"
              ? [
                  {
                    id: "mensual-caduca-1",
                    label: "No perder ritmo",
                    message: `${nombre}, tu acceso caduca ${renewalText}. Si te interesa seguir, podemos pasar ya al mensual y aseguramos contenido semanal sin cortes. ¿Te lo dejo listo?`,
                    intent: "llevar_a_mensual",
                  },
                ]
              : [
                  {
                    id: "mensual-general-1",
                    label: "Invitar a mensual",
                    message: `${nombre}, te propongo pasar a mensual: cada semana tendrás algo preparado y no tendrás que estar pendiente de pedirme extras sueltos. ¿Lo probamos?`,
                    intent: "llevar_a_mensual",
                  },
                ]),
          ],
          picante: [
            {
              id: "mensual-picante-1",
              label: "Mensual con chispa",
              message: `${nombre}, si pasamos a mensual puedo prepararte algo especial cada semana, con un toque más intenso que lo que pides suelto. ¿Quieres que te pase el enlace?`,
              intent: "llevar_a_mensual",
            },
          ],
        },
        renovacion: {
          suave: isCriticalExpiry
            ? criticalRenewalSuggestions
            : [
                {
                  id: "renovacion-suave-1",
                  label: "Renovación clara",
                  message: `Hola ${nombre}, tu suscripción termina ${renewalText}. Si quieres seguir, te paso el enlace para mantener el acceso y preparo algo útil esta semana.`,
                  intent: "renovacion",
                },
              ],
          intimo: isCriticalExpiry
            ? criticalRenewalSuggestions
            : [
                {
                  id: "renovacion-urgente-1",
                  label: "Renovación clara",
                  message: `Oye ${nombre}, tu suscripción termina ${renewalText}. Si quieres seguir, te paso ahora el enlace para que mantengas el acceso al chat y esta semana preparo algo especial para ti.`,
                  intent: "renovacion",
                },
                {
                  id: "renovacion-urgente-2",
                  label: "Conservar valor",
                  message: `${nombre}, queda muy poco para que se cierre tu acceso (${renewalText}). Te propongo renovarlo ya para no perder lo que tienes y ajustar el contenido a lo que más te ha servido. ¿Te lo activo?`,
                  intent: "renovacion",
                },
              ],
          picante: isCriticalExpiry
            ? criticalRenewalSuggestions
            : [
                {
                  id: "renovacion-picante-1",
                  label: "Renovar con gancho",
                  message: `${nombre}, tu acceso acaba ${renewalText}. Si seguimos, preparo algo especial y más atrevido para este inicio. ¿Te paso el enlace para dejarlo cerrado ya?`,
                  intent: "renovacion",
                },
              ],
        },
      };

      const objectiveSuggestions = suggestions[objective] ?? suggestions.renovacion;
      const toneSuggestions = objectiveSuggestions?.[tone] || objectiveSuggestions?.intimo || [];
      return toneSuggestions.map((sug) => ({
        ...sug,
        message: sug.message.replace("{nombre}", nombre),
      }));
    },
    [effectiveDaysLeft]
  );

  useEffect(() => {
    if (hasManualManagerObjective) return;
    const objective = fanManagerAnalysis.defaultObjective;
    setCurrentObjective(objective);
  }, [fanManagerAnalysis, hasManualManagerObjective]);

  useEffect(() => {
    const previousObjective = previousObjectiveRef.current;
    if (previousObjective === "ofrecer_extra" && currentObjective !== "ofrecer_extra") {
      setPpvPhase("suave");
    }
    previousObjectiveRef.current = currentObjective;
  }, [currentObjective]);

  const buildManagerContextPrompt = useCallback(
    (options?: { selectedText?: string | null }) => {
      const name = getFirstName(contactName) || contactName || "este fan";
      const draftText = messageSend.trim();
      const followUpSummary = (() => {
        if (followUpOpen) {
          const due = splitDueAt(followUpOpen.dueAt ?? null);
          const dueLabel = due.date ? ` (para ${due.date}${due.time ? ` ${due.time}` : ""})` : "";
          const note = followUpOpen.note ? ` · ${followUpOpen.note}` : "";
          return `${followUpOpen.title}${dueLabel}${note}`.trim();
        }
        const scheduledNote = typeof conversation.nextActionNote === "string" ? conversation.nextActionNote.trim() : "";
        const scheduledAt = conversation.nextActionAt ?? null;
        if (scheduledNote || scheduledAt) {
          const due = splitDueAt(scheduledAt);
          const dueLabel = due.date ? ` (para ${due.date}${due.time ? ` ${due.time}` : ""})` : "";
          return `${scheduledNote || "Seguimiento"}${dueLabel}`.trim();
        }
        if (conversation.nextAction && conversation.nextAction.trim()) {
          return conversation.nextAction.trim();
        }
        return "Sin seguimiento activo";
      })();
      const selectedText = options?.selectedText?.trim() ?? "";
      const segments = [
        `Fan: ${name}`,
        `Perfil del fan: ${normalizedProfileText || "Sin perfil guardado"}`,
        `Seguimiento activo: ${followUpSummary}`,
        recentConversationLines.length
          ? `Últimos mensajes:\n${recentConversationLines.join("\n")}`
          : "Últimos mensajes: (sin historial reciente)",
      ];

      if (selectedText) {
        segments.push(`Texto seleccionado: «${selectedText}»`);
      }

      segments.push(`Borrador actual: ${draftText || "Sin borrador"}`);

      if (includeInternalContext && recentInternalDrafts.length) {
        segments.push(`Borradores internos:\n${recentInternalDrafts.map((line) => `- ${line}`).join("\n")}`);
      }

      return `\n\nContexto:\n${segments.join("\n\n")}`;
    },
    [
      contactName,
      conversation.nextAction,
      conversation.nextActionAt,
      conversation.nextActionNote,
      followUpOpen,
      includeInternalContext,
      messageSend,
      normalizedProfileText,
      recentConversationLines,
      recentInternalDrafts,
    ]
  );

  const askInternalManager = useCallback(
    async (
      question: string,
      intent?: ManagerQuickIntent,
      toneOverride?: FanTone,
      options?: {
        selectedText?: string | null;
        onSuggestions?: (payload: { title: string; suggestions: string[]; offer?: PpvOffer | null }) => void;
        skipChat?: boolean;
        skipContext?: boolean;
        skipHistory?: boolean;
        action?: string;
        ageSignal?: boolean;
        silentOnRefusal?: boolean;
      }
    ) => {
      if (!id) return;
      const trimmed = question.trim();
      if (!trimmed) return;
      const refusalBubbleText =
        "Se bloqueó la generación con este contexto. Prueba \"Otra versión\" o \"Suavizar\".";
      const contextPrompt = options?.skipContext
        ? ""
        : buildManagerContextPrompt({ selectedText: options?.selectedText ?? null });
      const promptForManager = contextPrompt ? `${trimmed}${contextPrompt}` : trimmed;
      const fanKey = id;
      managerPanelStickToBottomRef.current = true;
      if (!options?.skipChat) {
        const creatorMessage: ManagerChatMessage = {
          id: `${fanKey}-${Date.now()}-creator`,
          role: "creator",
          text: trimmed,
          createdAt: new Date().toISOString(),
        };
        setManagerChatByFan((prev) => {
          const prevMsgs = prev[fanKey] ?? [];
          return { ...prev, [fanKey]: [...prevMsgs, creatorMessage] };
        });
        setManagerChatInput("");
        setManagerSelectedText(null);
        openInternalPanelTab("manager");
        focusManagerComposer(true);
      }

      const resolvedCreatorId = await resolveCreatorId();
      if (!resolvedCreatorId) {
        showComposerToast("No se pudo detectar el creador.");
        return;
      }

      const priorMessages = options?.skipHistory ? [] : managerChatByFan[fanKey] ?? [];
      const normalizedHistory = priorMessages
        .map((msg) => {
          const content = msg.text.trim();
          if (!content) return null;
          const role = msg.role === "manager" ? "assistant" : msg.role === "creator" ? "user" : "system";
          return { role, content };
        })
        .filter(Boolean) as Array<{ role: "system" | "user" | "assistant"; content: string }>;
      const outgoingMessages = [...normalizedHistory, { role: "user", content: promptForManager }];
      const resolvedAgeSignal = options?.ageSignal ?? ageSignalDetected;
      const resolvedAgency = conversation.isManager
        ? null
        : agencyDraft ?? {
            stage: (conversation.agencyStage ?? "NEW") as AgencyStage,
            objective: normalizeObjectiveCode(conversation.agencyObjective) ?? "CONNECT",
            intensity: (conversation.agencyIntensity ?? "MEDIUM") as AgencyIntensity,
            playbook: (conversation.agencyPlaybook ?? "GIRLFRIEND") as AgencyPlaybook,
            nextAction: (conversation.agencyNextAction ?? "").toString(),
          };
      const agencyPayload = resolvedAgency
        ? {
            stage: resolvedAgency.stage,
            objective: resolvedAgency.objective,
            intensity: resolvedAgency.intensity,
            playbook: resolvedAgency.playbook,
            nextAction: resolvedAgency.nextAction?.trim() || undefined,
          }
        : undefined;

      let responseData: any = null;
      let responseStatus = 0;
      let replyContent = "";
      const extractReplyContent = (data: any) => {
        if (typeof data?.data?.reply?.content === "string") return data.data.reply.content.trim();
        if (typeof data?.reply?.content === "string") return data.reply.content.trim();
        if (typeof data?.message?.content === "string") return data.message.content.trim();
        if (typeof data?.items?.[0]?.content === "string") return data.items[0].content.trim();
        if (typeof data?.reply?.text === "string") return data.reply.text.trim();
        return "";
      };
      const extractOffer = (data: any): PpvOffer | null => {
        const raw = data?.offer ?? data?.data?.offer;
        if (!raw || typeof raw !== "object") return null;
        const record = raw as Record<string, unknown>;
        const contentId = typeof record.contentId === "string" ? record.contentId : "";
        const title = typeof record.title === "string" ? record.title : "";
        const tier = typeof record.tier === "string" ? record.tier : null;
        const dayPart = typeof record.dayPart === "string" ? record.dayPart : null;
        const slot = typeof record.slot === "string" ? record.slot : null;
        const priceCents = typeof record.priceCents === "number" ? record.priceCents : undefined;
        const currency = typeof record.currency === "string" ? record.currency : undefined;
        if (!tier && !dayPart && !slot && !contentId && !title) return null;
        return {
          contentId: contentId || undefined,
          title: title || undefined,
          tier,
          dayPart,
          slot,
          priceCents,
          currency,
        };
      };
      const pushManagerMessage = (text: string) => {
        if (options?.skipChat) return;
        const managerMessage: ManagerChatMessage = {
          id: `${fanKey}-${Date.now()}-manager`,
          role: "manager",
          text,
          createdAt: new Date().toISOString(),
        };
        setManagerChatByFan((prev) => {
          const prevMsgs = prev[fanKey] ?? [];
          return { ...prev, [fanKey]: [...prevMsgs, managerMessage] };
        });
      };
      try {
        const res = await fetch("/api/creator/ai-manager/chat", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorId: resolvedCreatorId,
            fanId: fanKey,
            messages: outgoingMessages,
            mode: "message",
            action: options?.action,
            ageSignal: resolvedAgeSignal,
            agency: agencyPayload,
          }),
        });
        responseStatus = res.status;
        responseData = await res.json().catch(() => ({}));
        replyContent = extractReplyContent(responseData);
        const responseOffer = extractOffer(responseData);
        const errorCode =
          typeof responseData?.error?.code === "string"
            ? responseData.error.code
            : typeof responseData?.code === "string"
            ? responseData.code
            : typeof responseData?.error === "string"
            ? responseData.error
            : "";
        const errorMessage =
          typeof responseData?.error?.message === "string"
            ? responseData.error.message
            : typeof responseData?.message === "string"
            ? responseData.message
            : "No se pudo consultar al Manager IA.";
        const statusValue =
          typeof responseData?.status === "string"
            ? responseData.status
            : typeof responseData?.data?.status === "string"
            ? responseData.data.status
            : "";
        const normalizedStatus = statusValue.trim().toLowerCase();
        const providerUnavailable =
          normalizedStatus === "provider_down" ||
          errorCode.toUpperCase() === "PROVIDER_UNAVAILABLE" ||
          responseStatus === 502;
        const isRefusal = normalizedStatus === "refusal" || errorCode.toUpperCase() === "REFUSAL";
        const isPolicyBlocked = errorCode.toUpperCase() === "POLICY_BLOCKED";
        const isModelNotFound = errorCode.toUpperCase() === "MODEL_NOT_FOUND";
        const isTimeout = errorCode.toUpperCase() === "TIMEOUT";
        const isProviderError = errorCode.toUpperCase() === "PROVIDER_ERROR";
        const isJsonParse = errorCode.toUpperCase() === "JSON_PARSE";
        const isCryptoMisconfigured =
          normalizedStatus === "crypto_misconfigured" || errorCode.toUpperCase() === "CRYPTO_MISCONFIGURED";
        const needsAgeGate = normalizedStatus === "needs_age_gate";
        if (responseData?.ok === false || providerUnavailable || isRefusal || isCryptoMisconfigured) {
          if (isCryptoMisconfigured) {
            const replyText = replyContent || errorMessage || "Crypto mal configurado.";
            if (options?.skipChat) {
              showComposerToast(replyText);
            } else {
              pushManagerMessage(replyText);
            }
            return { ok: false, errorCode: "CRYPTO_MISCONFIGURED", errorMessage: replyText };
          }
          if (isPolicyBlocked) {
            const policyMessage = errorMessage || "No permitido: menores o no consentimiento.";
            if (options?.skipChat) {
              showComposerToast(policyMessage);
            } else {
              pushManagerMessage(policyMessage);
            }
            return { ok: false, errorCode: "POLICY_BLOCKED", errorMessage: policyMessage };
          }
          if (isModelNotFound) {
            const modelMessage = errorMessage || "Modelo no encontrado (AI_MODEL=...).";
            if (options?.skipChat) {
              showComposerToast(modelMessage);
            } else {
              pushManagerMessage(modelMessage);
            }
            return { ok: false, errorCode: "MODEL_NOT_FOUND", errorMessage: modelMessage };
          }
          if (isTimeout) {
            const timeoutMessage = errorMessage || "Timeout hablando con Ollama.";
            if (options?.skipChat) {
              showComposerToast(timeoutMessage);
            } else {
              pushManagerMessage(timeoutMessage);
            }
            return { ok: false, errorCode: "TIMEOUT", errorMessage: timeoutMessage };
          }
          if (isProviderError || isJsonParse) {
            const providerMessage =
              errorMessage ||
              (isJsonParse ? "La IA respondió pero no en formato esperado (JSON)." : "IA local no disponible (Ollama).");
            if (options?.skipChat) {
              showComposerToast(providerMessage);
            } else {
              pushManagerMessage(providerMessage);
            }
            return { ok: false, errorCode: isJsonParse ? "JSON_PARSE" : "PROVIDER_ERROR", errorMessage: providerMessage };
          }
          if (providerUnavailable) {
            showComposerToast("IA local no disponible (Ollama).");
            if (replyContent && !options?.skipChat) {
              const managerMessage: ManagerChatMessage = {
                id: `${fanKey}-${Date.now()}-manager`,
                role: "manager",
                text: replyContent,
                createdAt: new Date().toISOString(),
                offer: responseOffer,
              };
              setManagerChatByFan((prev) => {
                const prevMsgs = prev[fanKey] ?? [];
                return { ...prev, [fanKey]: [...prevMsgs, managerMessage] };
              });
            }
            return { ok: false, errorCode: "PROVIDER_UNAVAILABLE", errorMessage };
          } else if (replyContent) {
            showComposerToast("Respuesta de seguridad / fallback.");
          } else if (isRefusal) {
            if (!options?.silentOnRefusal) {
              if (options?.skipChat) {
                showComposerToast(refusalBubbleText);
              } else {
                pushManagerMessage(refusalBubbleText);
              }
            }
            return { ok: false, errorCode: "REFUSAL", errorMessage };
          } else {
            showComposerToast(errorMessage);
            return { ok: false, errorCode: errorCode || "ERROR", errorMessage };
          }
        }
        if (needsAgeGate) {
          showComposerToast("Se requiere confirmar +18.");
        }
      } catch (err) {
        console.error("Error sending manager chat", err);
        showComposerToast("No se pudo consultar al Manager IA.");
        return { ok: false, errorCode: "NETWORK_ERROR", errorMessage: "No se pudo consultar al Manager IA." };
      }

      const assistantText = replyContent || extractReplyContent(responseData);
      const resolvedOffer = extractOffer(responseData);
      if (!assistantText) {
        const emptyMessage =
          typeof responseData?.error?.message === "string"
            ? responseData.error.message
            : "La IA no devolvió texto.";
        if (options?.skipChat) {
          showComposerToast(emptyMessage);
        } else {
          const managerMessage: ManagerChatMessage = {
            id: `${fanKey}-${Date.now()}-manager`,
            role: "manager",
            text: emptyMessage,
            createdAt: new Date().toISOString(),
            offer: resolvedOffer,
          };
          setManagerChatByFan((prev) => {
            const prevMsgs = prev[fanKey] ?? [];
            return { ...prev, [fanKey]: [...prevMsgs, managerMessage] };
          });
        }
        return { ok: false, errorCode: "EMPTY", errorMessage: emptyMessage };
      }

      const resolvedIntent = intent
        ? mapQuickIntentToSuggestionIntent(intent)
        : inferSuggestionIntentFromPrompt(promptForManager);
      const simulatedBundle = buildSimulatedManagerSuggestions({
        fanName: contactName,
        tone: toneOverride ?? fanTone,
        intent: resolvedIntent,
      });
      const bundle = {
        title: simulatedBundle.title,
        suggestions: [assistantText, ...simulatedBundle.suggestions.filter((s) => s !== assistantText)].slice(0, 3),
        offer: resolvedOffer,
      };

      if (!options?.skipChat) {
        const qa = scoreDraft(assistantText);
        const managerMessage: ManagerChatMessage = {
          id: `${fanKey}-${Date.now()}-manager`,
          role: "manager",
          text: assistantText,
          title: bundle.title,
          suggestions: bundle.suggestions,
          offer: resolvedOffer,
          qa,
          createdAt: new Date().toISOString(),
        };
        setManagerChatByFan((prev) => {
          const prevMsgs = prev[fanKey] ?? [];
          return { ...prev, [fanKey]: [...prevMsgs, managerMessage] };
        });
      }
      options?.onSuggestions?.(bundle);
      return { ok: true, text: assistantText, offer: resolvedOffer ?? undefined };
    },
    [
      ageSignalDetected,
      agencyDraft,
      buildManagerContextPrompt,
      buildSimulatedManagerSuggestions,
      contactName,
      conversation.agencyIntensity,
      conversation.agencyNextAction,
      conversation.agencyObjective,
      conversation.agencyPlaybook,
      conversation.agencyStage,
      conversation.isManager,
      fanTone,
      focusManagerComposer,
      id,
      inferSuggestionIntentFromPrompt,
      managerChatByFan,
      mapQuickIntentToSuggestionIntent,
      openInternalPanelTab,
      resolveCreatorId,
      setManagerChatByFan,
      setManagerChatInput,
      setManagerSelectedText,
      showComposerToast,
    ]
  );

  const requestTemplateDraft = useCallback(
    async (options: {
      mode: "full" | "short";
      avoidText?: string | null;
      stage?: AgencyStage;
      objective?: string;
      intensity?: AgencyIntensity;
      variant?: number;
      offerId?: string | null;
    }) => {
      if (!id) return null;
      const fallbackAgency = {
        stage: (conversation.agencyStage ?? "NEW") as AgencyStage,
        objective: normalizeObjectiveCode(conversation.agencyObjective) ?? "CONNECT",
        intensity: (conversation.agencyIntensity ?? "MEDIUM") as AgencyIntensity,
        playbook: (conversation.agencyPlaybook ?? "GIRLFRIEND") as AgencyPlaybook,
        nextAction: (conversation.agencyNextAction ?? "").toString(),
        recommendedOfferId: conversation.agencyRecommendedOfferId ?? null,
      };
      const resolvedAgency = agencyDraft ?? fallbackAgency;
      const resolvedStage = options.stage ?? resolvedAgency.stage;
      const resolvedObjective = options.objective ?? resolvedAgency.objective;
      const resolvedIntensity = options.intensity ?? resolvedAgency.intensity;
      const resolvedPlaybook = resolvedAgency.playbook ?? "GIRLFRIEND";
      const resolvedOfferId =
        options.offerId !== undefined ? options.offerId : resolvedAgency.recommendedOfferId ?? null;
      const resolvedLocale =
        (typeof conversation.locale === "string" && conversation.locale.trim()) ||
        normalizePreferredLanguage(conversation.preferredLanguage) ||
        "es";
      try {
        const res = await fetch("/api/creator/agency/template-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fanId: id,
            fanName: contactName,
            lastFanMsg: lastFanMessage,
            stage: resolvedStage,
            objectiveCode: resolvedObjective,
            intensity: resolvedIntensity,
            playbook: resolvedPlaybook,
            language: resolvedLocale,
            offerId: resolvedOfferId,
            mode: options.mode,
            avoidText: options.avoidText ?? null,
            variant: typeof options.variant === "number" ? options.variant : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          const message = typeof data?.error === "string" ? data.error : "No se pudo generar la plantilla.";
          showComposerToast(message);
          return null;
        }
        return {
          draft: typeof data.draft === "string" ? data.draft : "",
          qa: data.qa as DraftQaResult | undefined,
        };
      } catch (err) {
        console.error("Error building template draft", err);
        showComposerToast("No se pudo generar la plantilla.");
        return null;
      }
    },
    [
      agencyDraft,
      contactName,
      conversation.agencyIntensity,
      conversation.agencyNextAction,
      conversation.agencyObjective,
      conversation.agencyPlaybook,
      conversation.agencyRecommendedOfferId,
      conversation.agencyStage,
      conversation.locale,
      conversation.preferredLanguage,
      id,
      lastFanMessage,
      showComposerToast,
    ]
  );

  const buildTemplateVariants = useCallback(async () => {
    if (!id) return null;
    const variants: Array<{ label: string; intensity: AgencyIntensity }> = [
      { label: "SOFT", intensity: "SOFT" },
      { label: "FLIRTY", intensity: "MEDIUM" },
      { label: "SPICY", intensity: "INTENSE" },
    ];
    try {
      const results = await Promise.all(
        variants.map((variant) =>
          requestTemplateDraft({ mode: "full", intensity: variant.intensity })
        )
      );
      const suggestions = variants
        .map((variant, index) => {
          const draft = results[index]?.draft?.trim() ?? "";
          if (!draft) return null;
          return {
            id: `${id}-agency-${variant.label.toLowerCase()}`,
            label: variant.label,
            message: draft,
            intent: `template:${variant.intensity}`,
            intensity: variant.intensity,
          } as ManagerSuggestion;
        })
        .filter(Boolean) as ManagerSuggestion[];
      return suggestions.length > 0 ? suggestions : null;
    } catch (err) {
      console.error("Error building template variants", err);
      return null;
    }
  }, [id, requestTemplateDraft]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const suggestions = await buildTemplateVariants();
      if (cancelled || !suggestions) return;
      setManagerSuggestions(suggestions.slice(0, 3));
    })();
    return () => {
      cancelled = true;
    };
  }, [buildTemplateVariants, id]);

  const parseMessageDate = (value?: string | null) => {
    if (!value) return null;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? null : ts;
  };

  const reengageTouches = useMemo(() => {
    const lastCreatorAt = parseMessageDate(conversation.lastCreatorMessageAt ?? null);
    if (!lastCreatorAt) return [];
    const lastFanAt = parseMessageDate(conversation.lastMessageAt ?? null);
    if (lastFanAt && lastFanAt >= lastCreatorAt) return [];
    const silenceHours = (Date.now() - lastCreatorAt) / (1000 * 60 * 60);
    if (silenceHours < 0) return [];
    return REENGAGE_TOUCHES.filter((touch) => silenceHours >= touch.minHours);
  }, [conversation.lastCreatorMessageAt, conversation.lastMessageAt]);

  const reengageKey = useMemo(
    () => reengageTouches.map((touch) => touch.key).join("|"),
    [reengageTouches]
  );

  useEffect(() => {
    if (!managerPanelOpen || !id || conversation.isManager) return;
    if (reengageTouches.length === 0) {
      setReengageSuggestions([]);
      setReengageLoading(false);
      return;
    }
    let cancelled = false;
    setReengageLoading(true);
    (async () => {
      try {
        const results = await Promise.all(
          reengageTouches.map((touch) =>
            requestTemplateDraft({
              mode: "full",
              stage: "RECOVERY",
              objective: "RECOVER",
              intensity: touch.intensity,
            })
          )
        );
        if (cancelled) return;
        const suggestions = reengageTouches
          .map((touch, index) => {
            const draft = results[index]?.draft?.trim() ?? "";
            if (!draft) return null;
            return {
              id: `${id}-reengage-${touch.key}`,
              label: touch.label,
              message: draft,
              intent: `reengage:${touch.key}`,
              intensity: touch.intensity,
            } as ManagerSuggestion;
          })
          .filter(Boolean) as ManagerSuggestion[];
        setReengageSuggestions(suggestions);
      } catch (err) {
        console.error("Error building reengage drafts", err);
      } finally {
        if (!cancelled) setReengageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation.isManager, id, managerPanelOpen, reengageKey, reengageTouches, requestTemplateDraft]);

  const handleRequestSuggestionVariant = async (mode: SuggestionVariantMode, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const target = managerSuggestions.find((item) => item.message.trim() === trimmed);
    const intensityMatch = target?.intent?.toString().match(/template:(SOFT|MEDIUM|INTENSE)/i);
    const intensityOverride =
      target?.intensity || (intensityMatch ? (intensityMatch[1].toUpperCase() as AgencyIntensity) : null);
    const templateResult = await requestTemplateDraft({
      mode: mode === "shorter" ? "short" : "full",
      avoidText: trimmed,
      intensity: intensityOverride ?? undefined,
    });
    const nextMessage = templateResult?.draft?.trim();
    if (!nextMessage || !target) return;
    setManagerSuggestions((prev) =>
      prev.map((item) => (item.id === target.id ? { ...item, message: nextMessage } : item))
    );
  };

  const handleRequestReengageVariant = async (mode: "full" | "short", suggestionId: string) => {
    const target = reengageSuggestions.find((item) => item.id === suggestionId);
    if (!target) return;
    const trimmed = target.message.trim();
    if (!trimmed) return;
    const templateResult = await requestTemplateDraft({
      mode,
      avoidText: trimmed,
      stage: "RECOVERY",
      objective: "RECOVER",
      intensity: target.intensity ?? "SOFT",
    });
    const nextMessage = templateResult?.draft?.trim();
    if (!nextMessage) return;
    setReengageSuggestions((prev) =>
      prev.map((item) => (item.id === target.id ? { ...item, message: nextMessage } : item))
    );
  };

  const draftSourceLabel = useCallback((source: DraftSource) => {
    switch (source) {
      case "reformular":
        return "Reformular";
      case "citar":
        return "Citar al Manager";
      case "autosuggest":
        return "Auto-sugerir";
      default:
        return "Borrador IA";
    }
  }, []);

  const buildDraftActionKey = (scope: "objective" | "draft", id: string, action?: string) => {
    if (scope === "draft") return `draft:${id}:${action ?? "variant"}`;
    return `objective:${id}`;
  };

  const resolveDraftObjectiveKey = useCallback((objective: ManagerObjective | null) => {
    if (!objective) return "BREAK_ICE";
    return MANAGER_OBJECTIVE_TO_DRAFT_KEY[objective] ?? "BREAK_ICE";
  }, []);

  const buildPhasePrompt = useCallback((phase: "suave" | "picante" | "directo" | "final") => {
    const label =
      phase === "suave"
        ? "Suave (Día)"
        : phase === "picante"
        ? "Picante (Día)"
        : phase === "directo"
        ? "Directo (Noche)"
        : "Final (Noche)";
    return `Genera un borrador fase ${label}. 1–2 frases + 1 pregunta, tono sugerente adulto, sin ser explícita, y con CTA suave a PPV.`;
  }, []);

  const buildDraftMeta = useCallback(
    (params: {
      primaryObjective?: ManagerObjective | null;
      tone?: FanTone | null;
      outputLength?: DraftLength;
      ppvPhase?: PpvPhase | null;
    }): DraftMeta => {
      const stage = agencyDraft?.stage ?? agencyMeta?.stage ?? null;
      const intensity = agencyDraft?.intensity ?? agencyMeta?.intensity ?? null;
      const playbook =
        agencyDraft?.playbook ?? agencyMeta?.playbook ?? (conversation.agencyPlaybook as AgencyPlaybook | null);
      const stageLabel = stage ? formatAgencyStageLabel(stage) : "—";
      const resolvedObjective = params.primaryObjective ?? currentObjective ?? null;
      const objectiveLabel = formatObjectiveLabel(resolvedObjective) ?? agencyObjectiveLabel ?? "—";
      const intensityLabel = intensity ? AGENCY_INTENSITY_LABELS[intensity] ?? intensity : "—";
      const styleLabel = playbook ? AGENCY_PLAYBOOK_LABELS[playbook] ?? playbook : "—";
      const toneLabel = formatToneLabel(params.tone ?? fanTone) ?? "—";
      const lengthLabel = formatLengthLabel(params.outputLength ?? draftOutputLength) ?? "—";
      const ppvPhaseLabel =
        resolvedObjective === "ofrecer_extra"
          ? formatPpvPhaseLabel(params.ppvPhase ?? ppvPhase) ?? "Suave"
          : null;
      return {
        stageLabel,
        objectiveLabel,
        intensityLabel,
        styleLabel,
        toneLabel,
        lengthLabel,
        primaryActionLabel: formatObjectiveLabel(resolvedObjective) ?? null,
        ppvPhaseLabel,
      };
    },
    [
      agencyDraft?.intensity,
      agencyDraft?.playbook,
      agencyDraft?.stage,
      agencyMeta?.intensity,
      agencyMeta?.playbook,
      agencyMeta?.stage,
      agencyObjectiveLabel,
      conversation.agencyPlaybook,
      currentObjective,
      draftOutputLength,
      fanTone,
      ppvPhase,
    ]
  );

  const buildDraftCard = useCallback(
    (
      text: string,
      options: {
        source: DraftSource;
        label?: string;
        selectedText?: string | null;
        basePrompt?: string | null;
        tone?: FanTone | null;
        objective?: ManagerObjective | null;
        meta?: DraftMeta | null;
        offer?: PpvOffer | null;
      }
    ) => {
      return {
        id: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text,
        label: options.label ?? draftSourceLabel(options.source),
        source: options.source,
        createdAt: new Date().toISOString(),
        tone: options.tone ?? fanTone,
        objective: options.objective ?? currentObjective ?? null,
        meta: options.meta ?? null,
        selectedText: options.selectedText ?? null,
        basePrompt: options.basePrompt ?? null,
        offer: options.offer ?? null,
      };
    },
    [currentObjective, draftSourceLabel, fanTone]
  );

  const addDraftCard = useCallback((draft: DraftCard) => {
    if (!id) return;
    setDraftCardsByFan((prev) => {
      const existing = prev[id] ?? [];
      const next = [draft, ...existing].slice(0, 6);
      return { ...prev, [id]: next };
    });
  }, [id]);

  const addGeneratedDraft = useCallback((draft: DraftCard) => {
    if (!id) return;
    setGeneratedDraftsByFan((prev) => {
      const existing = prev[id] ?? [];
      return { ...prev, [id]: [draft, ...existing] };
    });
  }, [id]);

  const addDraftPair = useCallback(
    (
      text: string,
      options: {
        source: DraftSource;
        label?: string;
        selectedText?: string | null;
        basePrompt?: string | null;
        offer?: PpvOffer | null;
        tone?: FanTone | null;
        objective?: ManagerObjective | null;
        meta?: DraftMeta | null;
      }
    ) => {
      const resolvedObjective = options.objective ?? currentObjective ?? null;
      const resolvedMeta =
        options.meta ??
        buildDraftMeta({
          primaryObjective: resolvedObjective,
          tone: options.tone ?? fanTone,
          outputLength: draftOutputLength,
          ppvPhase: resolvedObjective === "ofrecer_extra" ? ppvPhase : null,
        });
      const card = buildDraftCard(text, { ...options, meta: resolvedMeta });
      addDraftCard(card);
      addGeneratedDraft(buildDraftCard(text, { ...options, meta: resolvedMeta }));
    },
    [addDraftCard, addGeneratedDraft, buildDraftCard, buildDraftMeta, currentObjective, draftOutputLength, fanTone, ppvPhase]
  );

  const requestManagerDraft = useCallback(
    async (options: DraftRequestOptions) => {
      if (!id) return null;
      if (draftActionState.status === "loading") return null;
      const requestId = draftActionRequestIdRef.current + 1;
      draftActionRequestIdRef.current = requestId;
      setDraftActionError(null);
      setDraftActionState({ status: "loading", key: options.actionKey });
      startDraftActionPhaseTimers();

      const controller = new AbortController();
      if (draftActionAbortRef.current) {
        draftActionAbortRef.current.abort();
      }
      draftActionAbortRef.current = controller;

      try {
        const styleKey =
          agencyDraft?.playbook?.toString() ||
          (typeof conversation.agencyPlaybook === "string" ? conversation.agencyPlaybook : "") ||
          null;
        const outputLength = options.outputLength ?? draftOutputLength;
        const resolvedOptions: DraftRequestOptions = {
          objectiveKey: options.objectiveKey,
          tone: options.tone ?? fanTone,
          directness: options.directness ?? "neutro",
          outputLength,
          variationOf: options.variationOf ?? null,
          actionKey: options.actionKey,
        };
        draftLastRequestRef.current = resolvedOptions;
        const res = await fetch("/api/creator/ai-manager/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            conversationId: id,
            objectiveKey: resolvedOptions.objectiveKey,
            actionKey: resolvedOptions.actionKey,
            styleKey: styleKey || undefined,
            tone: resolvedOptions.tone ?? fanTone,
            directness: resolvedOptions.directness ?? "neutro",
            outputLength: resolvedOptions.outputLength ?? outputLength,
            variationOf: resolvedOptions.variationOf ?? undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          const errorCode = typeof data?.error === "string" ? data.error : "";
          const errorMessage =
            typeof data?.message === "string" && data.message.trim().length > 0 ? data.message : "";
          let fallback = "No se pudo generar el borrador.";
          if (errorCode === "CORTEX_NOT_CONFIGURED") fallback = "IA no configurada.";
          if (errorCode === "CORTEX_FAILED") fallback = "No se pudo generar el borrador.";
          if (errorCode === "POLICY_BLOCKED") fallback = "No permitido: menores o no consentimiento.";
          if (errorCode === "MODEL_NOT_FOUND") fallback = "Modelo no encontrado (AI_MODEL=...).";
          if (errorCode === "TIMEOUT") fallback = "Timeout hablando con Ollama.";
          if (errorCode === "PROVIDER_ERROR") fallback = "IA local no disponible (Ollama).";
          throw new Error(errorMessage || fallback);
        }
        const draftText = typeof data?.draft === "string" ? data.draft.trim() : "";
        if (!draftText) {
          throw new Error("No se pudo generar el borrador.");
        }
        const detectedLanguage = normalizePreferredLanguage(data?.language);
        if (detectedLanguage) {
          setPreferredLanguage((prev) => (prev === detectedLanguage ? prev : detectedLanguage));
        }
        return draftText;
      } catch (err) {
        if (draftActionRequestIdRef.current !== requestId) {
          return null;
        }
        const isAbortError =
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError") ||
          ((err as { name?: string } | null)?.name === "AbortError");
        if (isAbortError) {
          return null;
        }
        const message = err instanceof Error && err.message ? err.message : "No se pudo generar el borrador.";
        showComposerToast(message);
        setDraftActionError("No se pudo generar. Reintentar.");
        return null;
      } finally {
        if (draftActionRequestIdRef.current !== requestId) {
          return;
        }
        clearDraftActionPhaseTimers();
        setDraftActionPhase(null);
        setDraftActionState({ status: "idle", key: null });
        draftActionAbortRef.current = null;
      }
    },
    [
      agencyDraft?.playbook,
      conversation.agencyPlaybook,
      clearDraftActionPhaseTimers,
      draftActionState.status,
      draftOutputLength,
      fanTone,
      id,
      showComposerToast,
      startDraftActionPhaseTimers,
    ]
  );

  const handleDraftCancel = useCallback(() => {
    if (draftActionState.status !== "loading") return;
    draftActionRequestIdRef.current += 1;
    if (draftActionAbortRef.current) {
      draftActionAbortRef.current.abort();
      draftActionAbortRef.current = null;
    }
    clearDraftActionPhaseTimers();
    setDraftActionPhase(null);
    setDraftActionError(null);
    setDraftActionState({ status: "idle", key: null });
    showComposerToast("Cancelado");
  }, [clearDraftActionPhaseTimers, draftActionState.status, showComposerToast]);

  const handleDraftRetry = useCallback(async () => {
    if (draftActionState.status === "loading") return;
    const lastRequest = draftLastRequestRef.current;
    if (!lastRequest) return;
    await requestManagerDraft(lastRequest);
  }, [draftActionState.status, requestManagerDraft]);

  const updateDraftCard = useCallback((draftId: string, nextText: string, meta?: DraftMeta | null) => {
    if (!id) return;
    setDraftCardsByFan((prev) => {
      const existing = prev[id] ?? [];
      const next = existing.map((item) =>
        item.id === draftId
          ? { ...item, text: nextText, createdAt: new Date().toISOString(), meta: meta ?? item.meta ?? null }
          : item
      );
      return { ...prev, [id]: next };
    });
  }, [id]);

  const requestDraftCardFromPrompt = useCallback(
    (options: {
      prompt: string;
      source: DraftSource;
      label?: string;
      selectedText?: string | null;
      action?: string;
      tone?: FanTone | null;
      objective?: ManagerObjective | null;
      meta?: DraftMeta | null;
    }) => {
      const trimmed = options.prompt.trim();
      if (!trimmed) return;
      const resolvedObjective = options.objective ?? currentObjective ?? null;
      const resolvedTone = options.tone ?? fanTone;
      const resolvedMeta =
        options.meta ??
        buildDraftMeta({
          primaryObjective: resolvedObjective,
          tone: resolvedTone,
          outputLength: draftOutputLength,
          ppvPhase: resolvedObjective === "ofrecer_extra" ? ppvPhase : null,
        });
      openInternalPanel("manager");
      askInternalManager(trimmed, undefined, undefined, {
        selectedText: options.selectedText ?? null,
        skipChat: true,
        action: options.action,
        onSuggestions: (bundle) => {
          const nextText = bundle.suggestions[0] ?? "";
          if (!nextText.trim()) return;
          addDraftPair(nextText, {
            source: options.source,
            label: options.label,
            selectedText: options.selectedText ?? null,
            basePrompt: trimmed,
            offer: bundle.offer ?? null,
            tone: resolvedTone,
            objective: resolvedObjective,
            meta: resolvedMeta,
          });
        },
      });
    },
    [addDraftPair, askInternalManager, buildDraftMeta, currentObjective, draftOutputLength, fanTone, openInternalPanel, ppvPhase]
  );

  const handleDraftCardVariant = useCallback(
    async (draftId: string, mode: DraftVariantMode) => {
      if (!id) return;
      if (draftActionState.status === "loading") return;
      const cards = draftCardsByFan[id] ?? [];
      const target = cards.find((item) => item.id === draftId);
      if (!target) return;
      const resolvedObjective = target.objective ?? currentObjective ?? null;
      const objectiveKey = resolveDraftObjectiveKey(resolvedObjective);
      const directness: DraftDirectness =
        mode === "bolder" ? "directo" : mode === "softer" ? "suave" : "neutro";
      const outputLength: DraftLength = mode === "shorter" ? "short" : draftOutputLength;
      const variationOf = mode === "alternate" ? target.text : null;
      const actionKey = buildDraftActionKey("draft", draftId, mode);
      const draftMeta = buildDraftMeta({
        primaryObjective: resolvedObjective,
        tone: target.tone ?? fanTone,
        outputLength,
        ppvPhase: resolvedObjective === "ofrecer_extra" ? ppvPhase : null,
      });
      const nextText = await requestManagerDraft({
        objectiveKey,
        tone: target.tone ?? fanTone,
        directness,
        outputLength,
        variationOf,
        actionKey,
      });
      if (!nextText) return;
      updateDraftCard(draftId, nextText, draftMeta);
      addGeneratedDraft(
        buildDraftCard(nextText, {
          source: target.source,
          label: target.label,
          selectedText: target.selectedText ?? null,
          basePrompt: target.basePrompt ?? null,
          offer: target.offer ?? null,
          tone: target.tone ?? fanTone,
          objective: resolvedObjective,
          meta: draftMeta,
        })
      );
      if (mode === "bolder") {
        setDraftDirectnessById((prev) => ({ ...prev, [draftId]: "directo" }));
      } else if (mode === "softer") {
        setDraftDirectnessById((prev) => ({ ...prev, [draftId]: "suave" }));
      }
    },
    [
      addGeneratedDraft,
      buildDraftCard,
      buildDraftActionKey,
      buildDraftMeta,
      currentObjective,
      draftCardsByFan,
      draftActionState.status,
      fanTone,
      id,
      resolveDraftObjectiveKey,
      requestManagerDraft,
      setDraftDirectnessById,
      updateDraftCard,
      draftOutputLength,
    ]
  );

  const handleDeleteGeneratedDraft = useCallback((draftId: string) => {
    if (!id) return;
    setGeneratedDraftsByFan((prev) => {
      const existing = prev[id] ?? [];
      const next = existing.filter((draft) => draft.id !== draftId);
      return { ...prev, [id]: next };
    });
  }, [id]);

  const handleSendManagerChat = () => {
    askInternalManager(managerChatInput, undefined, undefined, { selectedText: managerSelectedText });
    setManagerSelectedText(null);
  };

  const handleTemplateRewrite = useCallback(
    async (sourceText?: string | null) => {
      if (!id) return;
      const avoidText = sourceText?.trim() || null;
      const result = await requestTemplateDraft({ mode: "full", avoidText });
      const nextText = result?.draft?.trim();
      if (!nextText) return;
      const qa = scoreDraft(nextText);
      const managerMessage: ManagerChatMessage = {
        id: `${id}-${Date.now()}-manager-template`,
        role: "manager",
        text: nextText,
        title: "Plantilla",
        createdAt: new Date().toISOString(),
        qa,
      };
      setManagerChatByFan((prev) => {
        const prevMsgs = prev[id] ?? [];
        return { ...prev, [id]: [...prevMsgs, managerMessage] };
      });
      openInternalPanelTab("manager");
    },
    [id, openInternalPanelTab, requestTemplateDraft]
  );

  const handleManagerChatKeyDown = (evt: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      handleSendManagerChat();
    }
  };

  const handleSendInternalDraft = async () => {
    const trimmed = internalDraftInput.trim();
    if (!trimmed) return;
    setInternalDraftInput("");
    await sendMessageText(trimmed, "INTERNAL", { preserveComposer: true });
  };

  const handleInternalDraftKeyDown = (evt: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      void handleSendInternalDraft();
    }
  };

  const AUTOPILOT_OBJECTIVES: AutopilotObjective[] = ["reactivar_fan_frio", "ofrecer_extra", "llevar_a_mensual"];
  const isAutopilotObjective = (objective: ManagerQuickIntent): objective is AutopilotObjective =>
    AUTOPILOT_OBJECTIVES.includes(objective as AutopilotObjective);

  const logManagerUsage = async ({
    actionType,
    text,
  }: {
    actionType: string;
    text: string;
  }) => {
    try {
      await fetch("/api/creator/ai/log-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: conversation.id,
          actionType,
          suggestedText: text,
          outcome: "suggested",
          creditsUsed: 1,
        }),
      });
    } catch (err) {
      console.error("Error registrando uso de IA del Manager", err);
    }
  };

  const mapObjectiveToActionType = (objective: ManagerObjective | null): string => {
    switch (objective) {
      case "reactivar_fan_frio":
        return "reactivation_suggestion";
      case "ofrecer_extra":
        return "quick_extra_suggestion";
      case "llevar_a_mensual":
        return "pack_offer_suggestion";
      case "renovacion":
        return "renewal_suggestion";
      case "romper_hielo":
      case "bienvenida":
        return "warmup_suggestion";
      default:
        return "warmup_suggestion";
    }
  };

  const fanSummaryForAutopilot = useMemo(
    () => ({
      name: (contactName || "").trim() || "este fan",
      isVip: !!(conversation.isHighPriority || conversation.customerTier === "vip"),
      extrasCount: typeof conversation.extrasCount === "number" ? conversation.extrasCount : 0,
      daysLeft: typeof conversation.daysLeft === "number" ? conversation.daysLeft : null,
      totalSpent: typeof conversation.extrasSpentTotal === "number" ? conversation.extrasSpentTotal : 0,
    }),
    [
      contactName,
      conversation.customerTier,
      conversation.daysLeft,
      conversation.extrasCount,
      conversation.extrasSpentTotal,
      conversation.isHighPriority,
    ]
  );

  async function triggerAutopilotDraft(objective: AutopilotObjective, toneForDraft: FanTone) {
    setIsAutoPilotLoading(true);
    try {
      const draft = await getAutopilotDraft({
        tone: toneForDraft,
        objective,
        fan: fanSummaryForAutopilot,
      });
      setLastAutopilotObjective(objective);
      setLastAutopilotTone(toneForDraft);
      if (id) {
        insertIntoCurrentComposer({
          target: "fan",
          fanId: id,
          mode: "fan",
          text: draft,
          actionKey: `autopilot:${objective}`,
        });
      }
      addGeneratedDraft(
        buildDraftCard(draft, {
          source: "autosuggest",
          label: formatObjectiveLabel(objective) ?? "Auto-sugerir",
          tone: toneForDraft,
          objective,
        })
      );
      await logManagerUsage({
        actionType: mapObjectiveToActionType(objective),
        text: draft,
      });
    } catch (err) {
      console.error("Error generando borrador de autopiloto", err);
    } finally {
      setIsAutoPilotLoading(false);
    }
  }

  const handleManagerQuickAction = async (
    intent: ManagerQuickIntent,
    options?: { toneOverride?: FanTone; skipInternalChat?: boolean }
  ) => {
    if (isAutoPilotLoading) return;
    if (draftActionState.status === "loading") return;
    setHasManualManagerObjective(true);
    setCurrentObjective(intent);
    const toneToUse = options?.toneOverride ?? fanTone;
    if (options?.toneOverride) {
      setFanTone(options.toneOverride);
      setHasManualTone(true);
      if (id) {
        setFanToneById((prev) => ({ ...prev, [id]: options.toneOverride as FanTone }));
      }
    }
    const shouldGenerateDraft =
      !(options?.skipInternalChat && autoPilotEnabled && isAutopilotObjective(intent));
    const draftMeta = shouldGenerateDraft
      ? buildDraftMeta({
          primaryObjective: intent,
          tone: toneToUse,
          outputLength: draftOutputLength,
          ppvPhase: intent === "ofrecer_extra" ? ppvPhase : null,
        })
      : null;
    const draftPromise = shouldGenerateDraft
      ? requestManagerDraft({
          objectiveKey: resolveDraftObjectiveKey(intent),
          tone: toneToUse,
          directness: "neutro",
          outputLength: draftOutputLength,
          variationOf: null,
          actionKey: buildDraftActionKey("objective", intent),
        })
      : null;
    const newSuggestions = await buildTemplateVariants();
    if (newSuggestions) {
      setManagerSuggestions(newSuggestions.slice(0, 3));
    }
    const question = buildQuickIntentQuestion(intent, contactName);
    if (options?.skipInternalChat === false) {
      askInternalManager(question, intent, toneToUse);
    }
    if (draftPromise) {
      const draftText = await draftPromise;
      if (draftText) {
        addDraftPair(draftText, {
          source: "autosuggest",
          label: formatObjectiveLabel(intent) ?? "Borrador IA",
          tone: toneToUse,
          objective: intent,
          meta: draftMeta,
        });
      }
    }

    if (autoPilotEnabled && isAutopilotObjective(intent)) {
      await triggerAutopilotDraft(intent, toneToUse);
    }
  };

  const handleManagerPhaseAction = useCallback(
    (phase: "suave" | "picante" | "directo" | "final") => {
      const label =
        phase === "suave"
          ? "Suave"
          : phase === "picante"
          ? "Picante"
          : phase === "directo"
          ? "Directo"
          : "Final";
      setPpvPhase(phase);
      const draftMeta = buildDraftMeta({
        primaryObjective: "ofrecer_extra",
        tone: fanTone,
        outputLength: "short",
        ppvPhase: phase,
      });
      requestDraftCardFromPrompt({
        prompt: buildPhasePrompt(phase),
        source: "autosuggest",
        label: `Fase ${label}`,
        action: `phase_${phase}`,
        tone: fanTone,
        objective: "ofrecer_extra",
        meta: draftMeta,
      });
    },
    [buildDraftMeta, buildPhasePrompt, fanTone, requestDraftCardFromPrompt]
  );

  const handleAutopilotSoften = () => {
    if (!autoPilotEnabled || isAutoPilotLoading || !lastAutopilotObjective) return;
    const toneOverride: FanTone = "suave";
    setFanTone(toneOverride);
    setHasManualTone(true);
    if (id) {
      setFanToneById((prev) => ({ ...prev, [id]: toneOverride }));
    }
    handleManagerQuickAction(lastAutopilotObjective, { toneOverride, skipInternalChat: true });
  };

  const handleAutopilotMakeBolder = () => {
    if (!autoPilotEnabled || isAutoPilotLoading || !lastAutopilotObjective) return;
    const toneOverride: FanTone = "picante";
    setFanTone(toneOverride);
    setHasManualTone(true);
    if (id) {
      setFanToneById((prev) => ({ ...prev, [id]: toneOverride }));
    }
    handleManagerQuickAction(lastAutopilotObjective, { toneOverride, skipInternalChat: true });
  };


  async function handleSelectPack(packId: string) {
    const selectedPack = config.packs.find(pack => pack.id === packId);
    if (!selectedPack) return;

    const mappedType =
      selectedPack.name.toLowerCase().includes("bienvenida") ? "trial" :
      selectedPack.name.toLowerCase().includes("mensual") ? "monthly" :
      selectedPack.name.toLowerCase().includes("especial") ? "special" : selectedPackType;

    setSelectedPackType(mappedType as "trial" | "monthly" | "special");
    await fillMessageForFan(buildPackProposalMessage(selectedPack), `pack:${selectedPack.id}`);
    setShowPackSelector(true);
    setOpenPanel("none");
  }

  async function handleSelectPackChip(event: ReactMouseEvent<HTMLButtonElement>, type: "trial" | "monthly" | "special") {
    event.stopPropagation();
    setSelectedPackType(type);
    setShowPackSelector(true);
    setOpenPanel("none");
    await fillMessageFromPackType(type);
  }

  function changeHandler(evt: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const { key } = evt;

    if (isInternalPanelOpen) return;
    if ((evt.ctrlKey || evt.metaKey) && key.toLowerCase() === "j") {
      evt.preventDefault();
      if (composerTarget === "fan" && cortexFlow) {
        handleCortexFlowOpenNext();
      }
      return;
    }
    if (key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      if (isSendingRef.current || isInternalSending || isManagerSending) return;
      if (composerTarget === "fan" && id) {
        const cooldown = fanSendCooldownById[id];
        if (cooldown && cooldown.until > Date.now()) return;
      }
      if (messageSend.trim()) handleSendMessage();
    }
  }

  const startFanSendCooldown = useCallback((fanId: string) => {
    if (!fanId) return;
    const until = Date.now() + FAN_SEND_COOLDOWN_MS;
    setFanSendCooldownById((prev) => ({
      ...prev,
      [fanId]: { until, phase: "sent" },
    }));
    if (fanSendCooldownPhaseTimeoutsRef.current[fanId]) {
      clearTimeout(fanSendCooldownPhaseTimeoutsRef.current[fanId]);
    }
    fanSendCooldownPhaseTimeoutsRef.current[fanId] = setTimeout(() => {
      setFanSendCooldownById((prev) => {
        const current = prev[fanId];
        if (!current) return prev;
        return { ...prev, [fanId]: { ...current, phase: "cooldown" } };
      });
    }, 1500);
    if (fanSendCooldownTimeoutsRef.current[fanId]) {
      clearTimeout(fanSendCooldownTimeoutsRef.current[fanId]);
    }
    fanSendCooldownTimeoutsRef.current[fanId] = setTimeout(() => {
      setFanSendCooldownById((prev) => {
        const next = { ...prev };
        delete next[fanId];
        return next;
      });
    }, FAN_SEND_COOLDOWN_MS);
  }, []);

  const updateCortexFlowState = useCallback((nextFlow: CortexFlowState | null) => {
    if (!nextFlow) {
      clearCortexFlow();
      setCortexFlow(null);
      return;
    }
    writeCortexFlow(nextFlow);
    setCortexFlow(nextFlow);
  }, []);

  type CortexFlowAdvanceResult = "moved" | "no-next" | "inactive";

  const openNextFanFromFlow = useCallback(
    (flow: CortexFlowState): CortexFlowAdvanceResult => {
      if (!flow || !id || flow.currentFanId !== id) return "inactive";
      const { nextFanId } = getNextFanFromFlow(flow);
      if (!nextFanId) {
        return "no-next";
      }
      const draft = flow.draftsByFanId?.[nextFanId] ?? "";
      if (draft.trim()) {
        openFanChatAndPrefill(router, {
          fanId: nextFanId,
          text: draft,
          mode: "fan",
          actionKey: flow.actionKey,
        });
      } else {
        openFanChat(router, nextFanId);
      }
      updateCortexFlowState({ ...flow, currentFanId: nextFanId });
      return "moved";
    },
    [id, router, updateCortexFlowState]
  );

  const handleCortexFlowReturn = useCallback(() => {
    updateCortexFlowState(null);
    void router.push("/creator/manager");
  }, [router, updateCortexFlowState]);

  const handleCortexFlowOpenNext = useCallback(() => {
    if (!cortexFlow) return;
    const result = openNextFanFromFlow(cortexFlow);
    if (result === "no-next") {
      showInlineAction({
        kind: "info",
        title: "No hay más fans",
        detail: "Último fan del segmento.",
        undoLabel: "Volver a Cortex",
        onUndo: handleCortexFlowReturn,
      });
    }
  }, [cortexFlow, handleCortexFlowReturn, openNextFanFromFlow, showInlineAction]);

  const handleCortexFlowToggleAutoNext = useCallback(() => {
    if (!cortexFlow) return;
    const nextValue = !cortexFlowAutoNext;
    setCortexFlowAutoNext(nextValue);
    updateCortexFlowState({ ...cortexFlow, autoNext: nextValue });
  }, [cortexFlow, cortexFlowAutoNext, updateCortexFlowState]);

  const adjustMessageInputHeight = () => {
    autoGrowTextarea(messageInputRef.current, MAX_MAIN_COMPOSER_HEIGHT);
  };

  const getLastCreatorMessage = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (!msg?.me) continue;
      if (msg.audience === "INTERNAL") continue;
      if (msg.kind && msg.kind !== "text") continue;
      const text = (msg.message || "").trim();
      if (!text) continue;
      return msg;
    }
    return null;
  }, [messages]);

  const getMessageTimestamp = useCallback(
    (message: ConversationMessage | null) => {
      const candidate = message?.createdAt ?? lastCreatorMessageAt ?? null;
      if (!candidate) return null;
      const ts = new Date(candidate).getTime();
      if (Number.isNaN(ts)) return null;
      return ts;
    },
    [lastCreatorMessageAt]
  );

  const getStoredDuplicateWarning = useCallback(
    (candidate: string, actionKey?: string | null) => {
      if (!id) return null;
      const lastSent = readLastSentRecord(id);
      if (!lastSent) return null;
      const ageMs = Date.now() - lastSent.sentAt;
      if (ageMs > DUPLICATE_ACTION_WINDOW_MS || ageMs < 0) return null;
      const normalizedActionKey = normalizeActionKey(actionKey);
      const candidateHash = hashText(candidate);
      if (normalizedActionKey && lastSent.actionKey && normalizedActionKey === lastSent.actionKey) {
        return {
          reason: "intent" as const,
          actionKey: lastSent.actionKey,
          lastSentPreview: lastSent.preview,
          lastSentAt: lastSent.sentAt,
        };
      }
      if (candidateHash === lastSent.textHash) {
        return {
          reason: "hash" as const,
          actionKey: lastSent.actionKey ?? null,
          lastSentPreview: lastSent.preview,
          lastSentAt: lastSent.sentAt,
        };
      }
      return null;
    },
    [id]
  );

  const getDuplicateWarning = useCallback(
    (candidate: string) => {
      const lastMessage = getLastCreatorMessage();
      if (!lastMessage?.message) return null;
      const similarity = getNearDuplicateSimilarity(candidate, lastMessage.message);
      if (similarity < DUPLICATE_SIMILARITY_THRESHOLD) return null;
      const lastTs = getMessageTimestamp(lastMessage);
      if (!lastTs) return null;
      const diffHours = (Date.now() - lastTs) / (1000 * 60 * 60);
      const isRecent = diffHours <= DUPLICATE_RECENT_HOURS;
      const isStrictRecent = diffHours <= DUPLICATE_STRICT_HOURS && similarity >= DUPLICATE_STRICT_SIMILARITY;
      if (!isRecent && !isStrictRecent) return null;
      return { similarity, lastMessage: lastMessage.message };
    },
    [getLastCreatorMessage, getMessageTimestamp]
  );

  async function sendMessageText(
    text: string,
    audienceMode: MessageAudienceMode = "CREATOR",
    options?: { preserveComposer?: boolean; actionKey?: string | null }
  ): Promise<boolean> {
    if (!id) return false;
    const isInternal = audienceMode === "INTERNAL";
    if (isChatBlocked && !isInternal) {
      setMessagesError("Chat bloqueado. Desbloquéalo para escribir.");
      return false;
    }
    const trimmedMessage = text.trim();
    if (!trimmedMessage) return false;
    const tokenSticker = getStickerByToken(trimmedMessage);
    const isTokenSticker = Boolean(tokenSticker);

    const tempId = `temp-${Date.now()}`;
    if (!isInternal) {
      const tempMessage: ConversationMessage = {
        id: tempId,
        fanId: id,
        me: true,
        message: trimmedMessage,
        time: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false }),
        createdAt: new Date().toISOString(),
        status: "sending",
        kind: isTokenSticker ? "sticker" : "text",
        type: "TEXT",
        stickerSrc: isTokenSticker ? tokenSticker?.src ?? null : null,
        stickerAlt: isTokenSticker ? tokenSticker?.label ?? null : null,
      };
      setMessage((prev) => {
        if (!id) return prev || [];
        return [...(prev || []), tempMessage];
      });
      scrollToBottom("auto");
    }

    try {
      setMessagesError("");
      const payload: Record<string, unknown> = {
        fanId: id,
        text: trimmedMessage,
        from: "creator",
        type: "TEXT",
      };
      if (isInternal) {
        payload.audience = "INTERNAL";
      }
      const actionKey = normalizeActionKey(options?.actionKey);
      if (actionKey) {
        payload.actionKey = actionKey;
      }
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) {
        if (!isInternal) {
          setMessage((prev) =>
            (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
          );
        }
        return false;
      }
      if (!res.ok || !data?.ok) {
        console.error("Error enviando mensaje");
        setMessagesError(isInternal ? "Error guardando mensaje interno" : "Error enviando mensaje");
        return false;
      }
      const apiMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      if (isInternal) {
        const internalOnly = apiMessages.filter((msg) => deriveAudience(msg) === "INTERNAL");
        if (internalOnly.length > 0) {
          setInternalMessages((prev) => reconcileApiMessages(prev, internalOnly, id));
        }
        const newestInternalId = internalOnly[internalOnly.length - 1]?.id ?? null;
        showComposerToast("Borrador guardado");
        openInternalPanel("drafts", {
          forceScroll: true,
          scrollToTop: true,
          highlightDraftId: newestInternalId ?? undefined,
        });
      } else {
        const latestMessage = apiMessages[apiMessages.length - 1] ?? null;
        lastSentMessageIdRef.current = latestMessage?.id ?? null;
        lastSentMessageRef.current = latestMessage;
        if (latestMessage?.id) {
          messageEventIdsRef.current.add(latestMessage.id);
        }
        const mapped = mapApiMessagesToState(apiMessages);
        if (mapped.length > 0) {
          setMessage((prev) => {
            const withoutTemp = (prev || []).filter((m) => m.id !== tempId);
            return reconcileMessages(withoutTemp, mapped, id);
          });
        }
        void track(ANALYTICS_EVENTS.SEND_MESSAGE, { fanId: id });
        showComposerToast("Enviado al fan");
      }
      setSchemaError(null);
      if (!options?.preserveComposer) {
        setMessageSend("");
        setComposerActionKey(null);
        resetMessageInputHeight();
        requestAnimationFrame(() => messageInputRef.current?.focus());
      }
      return true;
    } catch (err) {
      console.error("Error enviando mensaje", err);
      setMessagesError(isInternal ? "Error guardando mensaje interno" : "Error enviando mensaje");
      if (!isInternal) {
        setMessage((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
        );
      }
      return false;
    }
  }

  async function sendStickerMessage(sticker: LegacyStickerItem) {
    if (!id) return;
    if (!sticker?.id) return;
    if (isChatBlocked) {
      setMessagesError("Chat bloqueado. Desbloquéalo para escribir.");
      return;
    }
    const stickerLabel = sticker.label || "Sticker";

    const tempId = `temp-sticker-${Date.now()}`;
    const timeLabel = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
    const tempMessage: ConversationMessage = {
      id: tempId,
      fanId: id,
      me: true,
      message: "",
      time: timeLabel,
      createdAt: new Date().toISOString(),
      status: "sending",
      kind: "sticker",
      type: "STICKER",
      stickerId: sticker.id,
      stickerSrc: sticker.file,
      stickerAlt: sticker.label,
    };
    setMessage((prev) => {
      if (!id) return prev || [];
      return [...(prev || []), tempMessage];
    });
    scrollToBottom("auto");

    try {
      setMessagesError("");
      const payload: Record<string, unknown> = {
        fanId: id,
        from: "creator",
        type: "STICKER",
        stickerId: sticker.id,
        text: stickerLabel,
      };
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) {
        setMessage((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
        );
        return;
      }
      if (!res.ok || !data?.ok) {
        setMessagesError("Error enviando sticker");
        setMessage((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
        );
        return;
      }
      const apiMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      const stickerMessageId = apiMessages[apiMessages.length - 1]?.id ?? null;
      if (stickerMessageId) {
        messageEventIdsRef.current.add(stickerMessageId);
      }
      const mapped = mapApiMessagesToState(apiMessages);
      if (mapped.length > 0) {
        setMessage((prev) => {
          const withoutTemp = (prev || []).filter((m) => m.id !== tempId);
          return reconcileMessages(withoutTemp, mapped, id);
        });
      }
      void track(ANALYTICS_EVENTS.SEND_MESSAGE, { fanId: id });
      showComposerToast("Sticker enviado");
      setSchemaError(null);
      startFanSendCooldown(id);
      emitFanMessageSent({
        fanId: id,
        text: stickerLabel,
        kind: "sticker",
        sentAt: new Date().toISOString(),
        from: "creator",
        eventId: stickerMessageId ?? undefined,
        message: apiMessages[apiMessages.length - 1] ?? undefined,
      });
      emitCreatorDataChanged({ reason: "fan_message_sent", fanId: id });
    } catch (err) {
      console.error("Error enviando sticker", err);
      setMessagesError("Error enviando sticker");
      setMessage((prev) =>
        (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
      );
    }
  }

  async function sendFanMessage(text: string, options?: { bypassDuplicateCheck?: boolean }) {
    if (isInternalPanelOpen) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    const currentActionKey = normalizeActionKey(composerActionKeyRef.current);
    const bypassWindowActive =
      duplicateBypassRef.current && duplicateBypassRef.current.expiresAt > Date.now();
    if (duplicateBypassRef.current && duplicateBypassRef.current.expiresAt <= Date.now()) {
      duplicateBypassRef.current = null;
    }
    if (!options?.bypassDuplicateCheck && !bypassWindowActive) {
      const storedDuplicate = getStoredDuplicateWarning(trimmed, currentActionKey);
      if (storedDuplicate) {
        setDuplicateConfirm({ candidate: trimmed, ...storedDuplicate });
        return false;
      }
      const duplicate = getDuplicateWarning(trimmed);
      if (duplicate) {
        setDuplicateConfirm({
          candidate: trimmed,
          reason: "similarity",
          lastSentPreview: duplicate.lastMessage,
          lastSentAt: getMessageTimestamp(getLastCreatorMessage()),
        });
        return false;
      }
    }
    if (id) {
      const cooldown = fanSendCooldownById[id];
      if (cooldown && cooldown.until > Date.now()) return false;
    }
    if (isSendingRef.current) return false;
    isSendingRef.current = true;
    setIsSending(true);
    const textHash = hashText(trimmed);
    const preview = trimmed.slice(0, 140);
    try {
      const ok = await sendMessageText(trimmed, "CREATOR", { actionKey: currentActionKey });
      if (ok && id) {
        writeLastSentRecord(id, {
          actionKey: currentActionKey,
          textHash,
          sentAt: Date.now(),
          preview,
        });
        startFanSendCooldown(id);
        const sentMessageId = lastSentMessageIdRef.current;
        lastSentMessageIdRef.current = null;
        const sentMessage = lastSentMessageRef.current;
        lastSentMessageRef.current = null;
        emitFanMessageSent({
          fanId: id,
          actionKey: currentActionKey ?? undefined,
          text: trimmed,
          kind: "text",
          sentAt: new Date().toISOString(),
          from: "creator",
          eventId: sentMessageId ?? undefined,
          message: sentMessage ?? undefined,
        });
        emitCreatorDataChanged({ reason: "fan_message_sent", fanId: id });
        const currentStage = (agencyMeta?.stage ?? agencyDraft?.stage ?? conversation.agencyStage ?? "NEW") as AgencyStage;
        const nextStage = getAutoAdvanceStage({ currentStage, actionKey: currentActionKey });
        if (nextStage && nextStage !== currentStage) {
          void applyAutoAdvanceStage(nextStage, currentActionKey);
        }
        const flow = readCortexFlow();
        if (flow && flow.currentFanId === id) {
          const autoNext = flow.autoNext ?? true;
          if (autoNext) {
            const result = openNextFanFromFlow(flow);
            if (result === "no-next") {
              showInlineAction({
                kind: "ok",
                title: "Enviado",
                detail: "Último fan del segmento.",
                undoLabel: "Volver a Cortex",
                onUndo: handleCortexFlowReturn,
              });
            }
          } else {
            const { nextFanId } = getNextFanFromFlow(flow);
            if (!nextFanId) {
              showInlineAction({
                kind: "ok",
                title: "Enviado",
                detail: "Último fan del segmento.",
                undoLabel: "Volver a Cortex",
                onUndo: handleCortexFlowReturn,
              });
            }
          }
        }
      }
      if (bypassWindowActive) {
        duplicateBypassRef.current = null;
      }
      return ok;
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  async function handleSendMessage() {
    const trimmed = messageSend.trim();
    if (!trimmed) {
      if (messageSend) {
        setMessageSend("");
        setComposerActionKey(null);
        resetMessageInputHeight();
        requestAnimationFrame(() => messageInputRef.current?.focus());
      }
      return;
    }
    dismissPurchaseNotice();
    setComposerError(null);
    if (messagesError) {
      setMessagesError("");
    }
    if (isInternalTarget) {
      if (isInternalSending) return;
      setIsInternalSending(true);
      const ok = await sendMessageText(trimmed, "INTERNAL");
      setIsInternalSending(false);
      if (!ok) {
        setComposerError("No se pudo guardar la nota.");
      }
      return;
    }
    if (isManagerTarget) {
      if (isManagerSending) return;
      setIsManagerSending(true);
      askInternalManager(trimmed, undefined, undefined, { selectedText: null });
      setMessageSend("");
      setComposerActionKey(null);
      adjustMessageInputHeight();
      requestAnimationFrame(() => messageInputRef.current?.focus());
      showInlineAction({
        kind: "info",
        title: "Enviado a Manager IA",
        detail: "No se envía al fan.",
        ttlMs: 2000,
      });
      setTimeout(() => {
        setIsManagerSending(false);
      }, 700);
      return;
    }
    const sentText = await sendFanMessage(trimmed);
    if (!sentText && messagesError) {
      setComposerError(messagesError || "No se pudo enviar el mensaje.");
    }
  }

  async function handleConfirmDuplicateSend() {
    if (!duplicateConfirm?.candidate) return;
    const candidate = duplicateConfirm.candidate;
    setDuplicateConfirm(null);
    await sendFanMessage(candidate, { bypassDuplicateCheck: true });
  }

  const buildDuplicateRephrasePrompt = (text: string) => {
    const name = getFirstName(contactName) || contactName || "este fan";
    return (
      `Mensaje base: «${text}»\n\n` +
      `Reformula este mensaje para ${name} con 2 versiones distintas. Cambia el arranque y la estructura.`
    );
  };

  const buildFallbackRephraseVariants = (text: string) => {
    const base = text.trim();
    if (!base) return [];
    const name = getFirstName(contactName) || contactName || "";
    const stripped = base.replace(/^(hola|hey|buenas|oye|ey)\b[, ]*/i, "");
    const keywordSwaps: Array<[RegExp, string]> = [
      [/\bextra\b/gi, "contenido extra"],
      [/\bmensual\b/gi, "plan mensual"],
      [/\bpack\b/gi, "pack especial"],
      [/\brenovaci[oó]n\b/gi, "renovar el acceso"],
    ];
    const withSwap = keywordSwaps.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), stripped);
    const starters = [
      name ? `Hola ${name}, ` : "Hola, ",
      name ? `Ey ${name}, ` : "Ey, ",
    ];
    const closers = ["¿Te encaja?", "¿Quieres que lo deje listo?", "¿Cómo lo ves?"];
    const variantA = `${starters[0]}${withSwap}`.trim();
    const variantB = `${starters[1]}${withSwap}`.trim();
    const withCloser = (value: string, closer: string) =>
      value.endsWith("?") || value.endsWith("!") ? value : `${value} ${closer}`;
    return [
      withCloser(variantA, closers[0]),
      withCloser(variantB, closers[1]),
    ];
  };

  const applyDuplicateRephrase = (nextText: string) => {
    const trimmed = nextText.trim();
    if (!trimmed) return;
    setComposerTarget("fan");
    setMessageSend(nextText);
    adjustMessageInputHeight();
    requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) return;
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    });
  };

  const handleDuplicateRephrase = () => {
    if (!duplicateConfirm?.candidate) return;
    const candidate = duplicateConfirm.candidate;
    setDuplicateConfirm(null);
    duplicateBypassRef.current = {
      actionKey: normalizeActionKey(composerActionKeyRef.current),
      expiresAt: Date.now() + DUPLICATE_BYPASS_WINDOW_MS,
    };
    let resolved = false;
    const fallbackVariants = buildFallbackRephraseVariants(candidate);
    const fallback = () => {
      if (resolved) return;
      resolved = true;
      applyDuplicateRephrase(fallbackVariants[0] ?? candidate);
    };
    const fallbackTimer = setTimeout(fallback, 900);
    askInternalManager(buildDuplicateRephrasePrompt(candidate), undefined, undefined, {
      selectedText: candidate,
      skipChat: true,
      onSuggestions: (bundle) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);
        const suggestion = bundle.suggestions?.[0] ?? bundle.title ?? "";
        if (suggestion.trim()) {
          applyDuplicateRephrase(suggestion);
        } else {
          fallback();
        }
      },
    });
  };

  async function handleCreatePaymentLink(item: ContentWithFlags) {
    if (!id) return;
    if (loadingPaymentId) return;
    setLoadingPaymentId(item.id);
      void track(ANALYTICS_EVENTS.PURCHASE_START, { fanId: id, meta: { contentId: item.id, title: item.title } });
    try {
      const res = await fetch("/api/payments/demo-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: id,
          contentId: item.id,
          price: 29,
          currency: "EUR",
        }),
      });

      if (!res.ok) {
        console.error("Error creando link de pago");
        setLoadingPaymentId(null);
        return;
      }

      const data = await res.json();
      const url = data?.url;
      if (typeof url === "string" && url.trim().length > 0) {
        await sendFanMessage(`Te dejo aquí el enlace para este pack: ${url}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPaymentId(null);
    }
  }

  async function handleGrant(type: "trial" | "monthly" | "special") {
    if (!id) return;

    try {
      setGrantLoadingType(type);
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, type }),
      });

      if (!res.ok) {
        console.error("Error actualizando acceso");
        alert("Error actualizando acceso");
        return;
      }

      const data = await res.json();
      if (Array.isArray(data.activeGrants)) {
        setAccessGrants(data.activeGrants);
      } else {
        await fetchAccessGrants(id);
      }
      setSelectedPackType(type);
      setShowPackSelector(true);
      await refreshFanData(id);
      const amount =
        type === "monthly" ? PACKS.monthly.price : type === "special" ? PACKS.special.price : PACKS.trial.price;
      emitPurchaseCreated({
        fanId: id,
        fanName: contactName || undefined,
        amountCents: Math.round(amount * 100),
        kind: "SUBSCRIPTION",
        title:
          type === "monthly"
            ? PACKS.monthly.name
            : type === "special"
            ? PACKS.special.name
            : PACKS.trial.name,
        purchaseId: typeof data?.purchaseId === "string" ? data.purchaseId : `grant-${id}-${Date.now()}`,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Error actualizando acceso", err);
      alert("Error actualizando acceso");
    } finally {
      setGrantLoadingType(null);
    }
  }

  function handleOfferPack(level: "monthly" | "special") {
    const text = level === "monthly" ? PACK_MONTHLY_UPSELL_TEXT : PACK_ESPECIAL_UPSELL_TEXT;
    void sendFanMessage(text);
    setShowContentModal(false);
    setSelectedContentIds([]);
  }

  async function saveQuickNote(content: string) {
    if (!id) return null;
    const res = await fetch("/api/fans/quick-note", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fanId: id, quickNote: content }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (!data?.ok) return null;
    return typeof data.quickNote === "string" ? data.quickNote : "";
  }

  async function saveFanProfile(content: string) {
    if (!id) return null;
    const res = await fetch("/api/fans/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fanId: id, profileText: content }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (!data?.ok) return null;
    return typeof data.profileText === "string" ? data.profileText : "";
  }

  async function upsertFollowUp(payload: { title: string; date: string; time: string }) {
    if (!id) return null;
    const res = await fetch("/api/fans/follow-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fanId: id, title: payload.title, date: payload.date, time: payload.time }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.followUp ?? null;
  }

  async function clearFollowUp() {
    if (!id) return false;
    const res = await fetch("/api/fans/follow-up/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fanId: id }),
    });
    return res.ok;
  }

  async function completeFollowUp() {
    if (!id) return false;
    const res = await fetch("/api/fans/follow-up/done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fanId: id }),
    });
    return res.ok;
  }

  function openQuickNoteEditor() {
    setQuickNoteEditing(true);
    setQuickNoteDraft(quickNote);
    setQuickNoteError("");
  }

  function cancelQuickNoteEditor() {
    setQuickNoteEditing(false);
    setQuickNoteDraft(quickNote);
    setQuickNoteError("");
  }

  async function handleSaveQuickNote() {
    if (!id) return;
    const content = quickNoteDraft.trim();
    const previous = quickNote;
    if (content === previous.trim()) {
      setQuickNoteEditing(false);
      setQuickNoteError("");
      return;
    }
    try {
      setQuickNoteLoading(true);
      setQuickNoteError("");
      setQuickNote(content);
      setQuickNoteEditing(false);
      const nextNote = await saveQuickNote(content);
      if (nextNote === null) {
        throw new Error("quick note save failed");
      }
      setQuickNote(nextNote);
      setQuickNoteDraft(nextNote);
      showComposerToast("Nota rápida guardada");
      await refreshFanData(id);
    } catch (err) {
      console.error("Error guardando nota rápida", err);
      setQuickNote(previous);
      setQuickNoteDraft(previous);
      setQuickNoteEditing(true);
      setQuickNoteError("Error guardando nota rápida");
      showComposerToast("No se pudo guardar la nota");
    } finally {
      setQuickNoteLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!id) return;
    const content = profileDraft.trim();
    if (content === normalizedProfileText) return;
    try {
      const nextProfile = await saveFanProfile(content);
      if (nextProfile === null) {
        setProfileError("Error guardando perfil");
        return;
      }
      setProfileText(nextProfile);
      profileDraftEditedRef.current = false;
      setProfileError("");
      showComposerToast("Perfil actualizado");
      await refreshFanData(id);
    } catch (err) {
      console.error("Error guardando perfil", err);
      setProfileError("Error guardando perfil");
    }
  }

  async function handleSaveNextAction() {
    if (!id) return;
    const title = nextActionDraft.trim();
    const date = nextActionDate.trim();
    const time = nextActionTime.trim();
    const hasExistingFollowUp = Boolean(
      followUpOpen ||
        conversation.nextActionAt ||
        (typeof conversation.nextActionNote === "string" && conversation.nextActionNote.trim()) ||
        (typeof conversation.nextAction === "string" && conversation.nextAction.trim())
    );
    if (!title) {
      if (hasExistingFollowUp) {
        await handleClearNextAction();
        return;
      }
      setFollowUpError("Escribe el seguimiento antes de guardar.");
      nextActionInputRef.current?.focus();
      return;
    }
    try {
      setFollowUpLoading(true);
      const followUp = await upsertFollowUp({ title, date, time });
      if (!followUp) {
        setFollowUpError("Error guardando seguimiento");
        return;
      }
      setFollowUpOpen(followUp);
      setFollowUpError("");
      showComposerToast("Seguimiento guardado");
      await refreshFanData(id);
    } catch (err) {
      console.error("Error guardando seguimiento", err);
      setFollowUpError("Error guardando seguimiento");
    } finally {
      setFollowUpLoading(false);
    }
  }

  function getSegmentFollowUpNote(fanId?: string | null) {
    if (!fanId) return "";
    return segmentNoteByFanRef.current[fanId] ?? "";
  }

  function getAutoFollowUpNote() {
    const objectiveNote = getObjectiveFollowUpNote(currentObjective ?? fanManagerAnalysis.defaultObjective);
    if (objectiveNote) return objectiveNote;
    const segmentNote = getSegmentFollowUpNote(conversation?.id ?? null);
    if (segmentNote) return segmentNote;
    return "Seguimiento: revisar y responder";
  }

  async function handleQuickFollowUp(days: number, fallbackLabel: string) {
    if (!id) return;
    const existingTitle = nextActionDraft.trim();
    const shouldAutofill = isGenericNextActionNote(existingTitle);
    const title = shouldAutofill ? getAutoFollowUpNote() : existingTitle || fallbackLabel;
    const date = formatDateInput(addDays(new Date(), days));
    const time = nextActionTime.trim();
    try {
      setFollowUpLoading(true);
      setFollowUpError("");
      const followUp = await upsertFollowUp({ title, date, time });
      if (!followUp) {
        setFollowUpError("Error guardando seguimiento");
        return;
      }
      setFollowUpOpen(followUp);
      setNextActionDraft(title);
      setNextActionDate(date);
      setNextActionTime(time);
      showComposerToast("Seguimiento guardado");
      await refreshFanData(id);
    } catch (err) {
      console.error("Error guardando seguimiento rápido", err);
      setFollowUpError("Error guardando seguimiento");
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function handleClearNextAction() {
    try {
      setFollowUpLoading(true);
      const ok = await clearFollowUp();
      if (!ok) {
        setFollowUpError("Error borrando seguimiento");
        return;
      }
      setNextActionDraft("");
      setNextActionDate("");
      setNextActionTime("");
      setFollowUpOpen(null);
      setFollowUpError("");
      showComposerToast("Seguimiento borrado");
      if (id) {
        await refreshFanData(id);
        await fetchFollowUpHistory(id);
      }
    } catch (err) {
      console.error("Error borrando seguimiento", err);
      setFollowUpError("Error borrando seguimiento");
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function handleArchiveNextAction() {
    if (!id) return;
    if (!nextActionDraft.trim() && !nextActionDate.trim() && !nextActionTime.trim() && !followUpOpen) return;
    try {
      setFollowUpLoading(true);
      const ok = await completeFollowUp();
      if (!ok) {
        setFollowUpError("Error archivando seguimiento");
        return;
      }
      setNextActionDraft("");
      setNextActionDate("");
      setNextActionTime("");
      setFollowUpOpen(null);
      setFollowUpError("");
      showComposerToast("Seguimiento archivado");
      await refreshFanData(id);
      await fetchFollowUpHistory(id);
    } catch (err) {
      console.error("Error archivando seguimiento", err);
      setFollowUpError("Error archivando seguimiento");
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function handleAttachContent(item: ContentWithFlags, options?: { keepOpen?: boolean }) {
    if (!id) return false;
    const keepOpen = options?.keepOpen ?? false;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        body: JSON.stringify({
          fanId: id,
          from: "creator",
          type: "CONTENT",
          contentItemId: item.id,
          text: "",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) return;
      if (!res.ok || !data?.ok) throw new Error("error");
      const apiMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      lastContentMessageIdRef.current = apiMessages[apiMessages.length - 1]?.id ?? null;
      const mapped = mapApiMessagesToState(apiMessages);
      if (mapped.length > 0) {
        setMessage((prev) => reconcileMessages(prev || [], mapped, id));
      }
      setMessagesError("");
      setSchemaError(null);
      if (!keepOpen) {
        setShowContentModal(false);
      }
      return true;
    } catch (err) {
      console.error("Error adjuntando contenido", err);
      setMessagesError("Error adjuntando contenido");
      if (!keepOpen) {
        setShowContentModal(false);
      }
      return false;
    }
  }

  const catalogExtrasById = useMemo(() => {
    const map = new Map<string, string>();
    catalogItems
      .filter((item) => item.type === "EXTRA")
      .forEach((item) => {
        map.set(item.id, item.title);
      });
    return map;
  }, [catalogItems]);

  const filteredCatalogItems = useMemo(() => {
    const query = normalizeSearchText(catalogSearch.trim());
    return catalogItems.filter((item) => {
      if (catalogTypeFilter !== "all" && item.type !== catalogTypeFilter) return false;
      if (!query) return true;
      const haystack = normalizeSearchText(`${item.title} ${item.description ?? ""}`);
      return haystack.includes(query);
    });
  }, [catalogItems, catalogSearch, catalogTypeFilter]);

  const buildCatalogIncludesPreview = useCallback(
    (item: CatalogItem) => {
      if (item.type !== "BUNDLE") return "";
      const includes = Array.isArray(item.includes) ? item.includes : [];
      const count = includes.length;
      if (count === 0) return "";
      const names = includes
        .map((id) => catalogExtrasById.get(id))
        .filter((title): title is string => Boolean(title));
      const preview = names.slice(0, 2).join(", ");
      const remaining = Math.max(0, count - 2);
      const label = count === 1 ? "extra" : "extras";
      const previewSuffix = preview ? ` · ${preview}${remaining > 0 ? ` +${remaining}` : ""}` : "";
      return `Incluye: ${count} ${label}${previewSuffix}`;
    },
    [catalogExtrasById]
  );

  const buildCatalogIncludesSummary = useCallback(
    (item: CatalogItem) => {
      if (item.type !== "BUNDLE") return "";
      const includes = Array.isArray(item.includes) ? item.includes : [];
      const names = includes
        .map((id) => catalogExtrasById.get(id))
        .filter((title): title is string => Boolean(title));
      if (names.length === 0 && includes.length > 0) {
        return `${includes.length} extras`;
      }
      return formatCatalogIncludesSummary(names);
    },
    [catalogExtrasById]
  );

  const handleCatalogInsert = (item: CatalogItem) => {
    const fanName = getFirstName(contactName || "") || getFirstName(conversation.displayName || "") || "alli";
    const includesSummary = buildCatalogIncludesSummary(item) || undefined;
    const draft = buildCatalogPitch({ fanName, item, includesSummary });
    setShowContentModal(false);
    setSelectedContentIds([]);
    setContentModalPackFocus(null);
    setRegisterExtrasChecked(false);
    setRegisterExtrasSource(null);
    setTransactionPrices({});
    if (!id || !draft.trim()) return;
    insertIntoCurrentComposer({
      target: "fan",
      fanId: id,
      mode: "fan",
      text: draft,
      actionKey: `catalog:${item.id}`,
    });
    showInlineAction({
      kind: "ok",
      title: "Sugerencia insertada",
      detail: "Catalogo",
      ttlMs: 1600,
    });
  };

  function getPresenceStatus(sourceLastSeenAt?: string | null, fallbackLabel?: string | null) {
    if (sourceLastSeenAt) {
      const last = new Date(sourceLastSeenAt);
      if (!Number.isNaN(last.getTime())) {
        const diffMinutes = (Date.now() - last.getTime()) / 60000;
        if (diffMinutes <= 3) {
          return { label: "En línea ahora", color: "online" as const };
        }
        if (diffMinutes <= 1440) {
          const relative = formatDistanceToNow(last, { addSuffix: true, locale: es });
          return { label: `Última conexión ${relative}`, color: "recent" as const };
        }
        const formatted = format(last, "d MMM, HH:mm", { locale: es });
        return { label: `Última conexión el ${formatted}`, color: "offline" as const };
      }
    }
    if (fallbackLabel) {
      return { label: `Última conexión: ${fallbackLabel}`, color: "offline" as const };
    }
    return { label: "Sin actividad reciente", color: "offline" as const };
  }

  const membershipDetails = packLabel
    ? `${packLabel}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : membershipStatus
    ? `${membershipStatus}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : "";
  const presenceStatus = getPresenceStatus(lastSeenAt, lastSeen);
  const presenceDotClass =
    presenceStatus.color === "online"
      ? "bg-[color:var(--brand)]"
      : presenceStatus.color === "recent"
      ? "bg-[color:var(--warning)]"
      : "bg-[color:var(--muted)]";
  const languageBadgeLabel =
    !conversation.isManager && preferredLanguage ? preferredLanguage.toUpperCase() : null;
  const languageSelectValue = preferredLanguage ?? "auto";
  const isInternalPanelOpen = managerPanelOpen && managerPanelTab === "manager";
  const cortexFlowNext = cortexFlow ? getNextFanFromFlow(cortexFlow) : { nextFanId: null, nextFanName: null };
  const cortexFlowLabel = cortexFlow?.segmentLabel || cortexFlow?.segmentKey || "Cortex";
  const showCortexFlowBanner = Boolean(cortexFlow && id && cortexFlow.currentFanId === id);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isInternalPanelOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isInternalPanelOpen]);

  const composerCopy = useMemo(() => {
    switch (composerTarget) {
      case "internal":
        return {
          placeholder: "Nota interna…",
          actionLabel: "Guardar nota",
          helpText: "Nota interna. No se envía.",
          sendingLabel: "Guardando...",
        };
      case "manager":
        return {
          placeholder: "Pide ayuda al Manager IA…",
          actionLabel: "Enviar a IA",
          helpText: "Mensaje para Manager IA. No se envía al fan.",
          sendingLabel: "Enviando...",
        };
      default:
        return {
          placeholder: "Mensaje al fan…",
          actionLabel: "Enviar a FAN",
          helpText: "Se enviará al fan.",
          sendingLabel: "Enviando...",
        };
    }
  }, [composerTarget]);

  const hasComposerPayload = messageSend.trim().length > 0;
  const isComposerSubmitting = isSending || isInternalSending || isManagerSending;
  const currentFanCooldown = id ? fanSendCooldownById[id] : null;
  const isFanCooldownActive =
    isFanTarget && !!currentFanCooldown && currentFanCooldown.until > Date.now();
  const cooldownLabel =
    isFanCooldownActive && currentFanCooldown?.phase === "sent"
      ? "Enviado"
      : isFanCooldownActive
      ? "Espera..."
      : null;
  const sendDisabled =
    isComposerSubmitting ||
    !hasComposerPayload ||
    isInternalPanelOpen ||
    (isFanTarget && isChatBlocked) ||
    isFanCooldownActive;
  const composerPlaceholder = isChatBlocked && isFanTarget
    ? "Has bloqueado este chat. Desbloquéalo para volver a escribir."
    : composerCopy.placeholder;
  const mainComposerPlaceholder = isInternalPanelOpen
    ? "Panel interno abierto. Usa el chat interno…"
    : composerPlaceholder;
  const composerActionLabel = cooldownLabel ?? composerCopy.actionLabel;
  const composerHelpText = isFanCooldownActive
    ? "Enviado recientemente. Espera unos segundos."
    : composerCopy.helpText;
  const composerSendingLabel = composerCopy.sendingLabel;
  const canAttachContent = isFanTarget && !isChatBlocked && !isInternalPanelOpen;
  const canUsePpvTiers = canAttachContent;
  const nextActionStatus = getFollowUpStatusFromDate(nextActionDate);
  const nextActionTone: BadgeTone =
    nextActionStatus?.tone === "overdue"
      ? "danger"
      : nextActionStatus
      ? "warn"
      : "muted";
  const tierLabel = formatTier(conversation.customerTier);
  const tierBadgeTone: BadgeTone = badgeToneForLabel(tierLabel);
  const packBadgeTone: BadgeTone = badgeToneForLabel(packLabel);
  const nextActionNoteValue =
    typeof conversation.nextActionNote === "string" ? conversation.nextActionNote.trim() : "";
  const followUpNoteRaw =
    nextActionNoteValue ||
    (typeof followUpOpen?.title === "string" ? followUpOpen.title.trim() : "") ||
    (typeof followUpOpen?.note === "string" ? followUpOpen.note.trim() : "") ||
    (conversation.nextAction?.trim() || "");
  const followUpDueAt = followUpOpen?.dueAt ?? conversation.nextActionAt ?? null;
  const followUpLabel = formatNextActionLabel(followUpDueAt, followUpNoteRaw);
  const isFollowUpNoteMissing = Boolean(followUpDueAt) && isGenericNextActionNote(followUpNoteRaw);
  const extrasCountDisplay = conversation.extrasCount ?? 0;
  const extrasAmount = typeof conversation.extrasSpentTotal === "number" ? conversation.extrasSpentTotal : 0;
  const tipsCountValue = conversation.tipsCount;
  const tipsSpentValue = conversation.tipsSpentTotal;
  const tipsCountDisplay = typeof tipsCountValue === "number" ? tipsCountValue : null;
  const tipsAmount = typeof tipsSpentValue === "number" ? tipsSpentValue : 0;
  const giftsAmount = typeof conversation.giftsSpentTotal === "number" ? conversation.giftsSpentTotal : 0;
  const giftsCountValue = conversation.giftsCount;
  const giftsCountDisplay = typeof giftsCountValue === "number" ? giftsCountValue : null;
  const summaryTotals = useMemo(
    () =>
      computeFanTotals([
        { kind: "EXTRA", amount: extrasAmount },
        { kind: "TIP", amount: tipsAmount },
        { kind: "GIFT", amount: giftsAmount },
      ]),
    [extrasAmount, tipsAmount, giftsAmount]
  );
  const extrasSpentDisplay = Math.round(summaryTotals.extrasAmount);
  const tipsSpentDisplay = typeof tipsSpentValue === "number" ? Math.round(tipsSpentValue) : null;
  const giftsSpentDisplay = Math.round(giftsAmount);
  const showGiftsRow = giftsAmount > 0;
  const tipsInlineLabel =
    tipsCountDisplay === null || tipsSpentDisplay === null ? "—" : `${tipsCountDisplay} · ${tipsSpentDisplay} €`;
  const showTipsInline = typeof tipsSpentDisplay === "number" && tipsSpentDisplay > 0;
  const purchaseKindMeta: Record<"EXTRA" | "TIP" | "GIFT", { label: string; icon: IconName; tone: string }> =
    {
      EXTRA: { label: "Extra", icon: "gem", tone: "text-[color:var(--brand)]" },
      TIP: { label: "Propina", icon: "coin", tone: "text-[color:var(--warning)]" },
      GIFT: { label: "Regalo", icon: "gift", tone: "text-[color:var(--brand)]" },
    };
  const historyFilters = [
    { id: "all", label: "Todo" },
    { id: "extra", label: "Extras" },
    { id: "tip", label: "Propinas" },
    { id: "gift", label: "Regalos" },
  ] as const;
  const lifetimeAmount = summaryTotals.totalSpent;
  const filteredPurchaseHistory = useMemo(() => {
    if (historyFilter === "all") return purchaseHistory;
    const targetKind = historyFilter.toUpperCase() as "EXTRA" | "TIP" | "GIFT";
    return purchaseHistory.filter((entry) => entry.kind === targetKind);
  }, [historyFilter, purchaseHistory]);
  const historyTotals = useMemo(() => computeFanTotals(purchaseHistory), [purchaseHistory]);
  const subsAmount = Math.max(0, lifetimeAmount - extrasAmount);
  const sessionToday = conversation.extraSessionToday ?? {
    todayCount: 0,
    todaySpent: 0,
    todayHighestTier: null,
    todayLastPurchaseAt: null,
  };
  const plan = getChatterProPlan({
    ladder: (conversation.extraLadderStatus as any) ?? null,
    sessionToday: (sessionToday as any) ?? null,
    turnMode: aiStatus?.turnMode ?? aiTurnMode ?? "auto",
    hasActivePaidAccess: hasMonthly || hasSpecial,
    accessSnapshot: getAccessSnapshot({
      activeGrantTypes: conversation.activeGrantTypes,
      daysLeft,
      membershipStatus,
      hasAccessHistory: conversation.hasAccessHistory,
      lastGrantType: conversation.lastGrantType,
    }),
    accessState: accessSummary.state,
    lastGrantType: conversation.lastGrantType ?? null,
  });
  const lapexPhaseLabel =
    isAccessExpired ? "Fase R – fan caducado" : conversation.extraLadderStatus?.phaseLabel ?? "Fase 0 – sin extras todavía";
  const lapexExtraNote = isAccessExpired ? " · Sin pack activo (caducado)" : "";
  const lapexSuggested = conversation.extraLadderStatus?.suggestedTier ?? "—";
  const vipAmountToday = Math.round(
    sessionToday.todaySpent ??
      (conversation.extraLadderStatus as any)?.sessionToday?.todaySpent ??
      (conversation.extraLadderStatus as any)?.sessionToday?.totalSpent ??
      0
  );
  const schemaFixCommands = schemaError?.fix?.length ? schemaError.fix : DB_SCHEMA_OUT_OF_SYNC_FIX;
  const schemaCopyLabel =
    schemaCopyState === "copied" ? "Copiado" : schemaCopyState === "error" ? "Error" : "Copiar comandos";

  function formatTier(tier?: "new" | "regular" | "priority" | "vip") {
    if (tier === "priority" || tier === "vip") return "Alta prioridad";
    if (tier === "regular") return "Habitual";
    return "Nuevo";
  }

  const handleViewProfile = () => {
    setShowQuickSheet(true);
  };

  const handleAddFollowUpNote = useCallback(() => {
    openInternalPanelTab("note", { scrollToTop: true });
    setTimeout(() => {
      nextActionInputRef.current?.focus();
    }, 150);
  }, [openInternalPanelTab]);

  const handleOpenEditName = () => {
    setShowQuickSheet(false);
    setEditNameValue(conversation.creatorLabel ?? conversation.displayName ?? "");
    setEditNameError(null);
    setIsEditNameOpen(true);
  };

  const handleSaveEditName = async () => {
    const fanId = typeof id === "string" && id.trim() ? id : getFanIdFromQuery(router.query) ?? "";
    if (!fanId) {
      console.error("Edit name failed: fanId is missing");
      setEditNameError("No se pudo identificar el fan.");
      return;
    }
    try {
      setEditNameSaving(true);
      setEditNameError(null);
      const patchUrl = `/api/fans/${fanId}`;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[EditName] PATCH ${patchUrl} fanId=${fanId}`);
      }
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorLabel: editNameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) return;
      if (!res.ok) {
        console.error("Error updating fan name", res.status, data?.error);
        setEditNameError(data?.error || "No se pudo guardar el nombre.");
        return;
      }
      const updatedFan = data?.fan;
      if (!updatedFan?.id) {
        console.error("Invalid fan response when updating name", data);
        setEditNameError("Respuesta inválida al guardar el nombre.");
        return;
      }
      await refreshFanData(fanId);
      setSchemaError(null);
      closeEditNameModal();
    } catch (err) {
      console.error("Error updating fan name", err);
      setEditNameError("No se pudo guardar el nombre.");
    } finally {
      setEditNameSaving(false);
    }
  };

  const handlePreferredLanguageChange = async (nextLanguage: SupportedLanguage) => {
    const fanId = typeof id === "string" && id.trim() ? id : getFanIdFromQuery(router.query) ?? "";
    if (!fanId) {
      setPreferredLanguageError("No se pudo identificar el fan.");
      return;
    }
    if (nextLanguage === preferredLanguage) {
      return;
    }
    const previousLanguage = preferredLanguage;
    try {
      setPreferredLanguage(nextLanguage);
      setPreferredLanguageSaving(true);
      setPreferredLanguageError(null);
      const res = await fetch(`/api/fans/${fanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: nextLanguage }),
      });
      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) {
        setPreferredLanguage(previousLanguage ?? null);
        return;
      }
      if (!res.ok) {
        setPreferredLanguageError(data?.error || "No se pudo guardar el idioma.");
        setPreferredLanguage(previousLanguage ?? null);
        return;
      }
      await refreshFanData(fanId);
      setSchemaError(null);
    } catch (_err) {
      setPreferredLanguageError("No se pudo guardar el idioma.");
      setPreferredLanguage(previousLanguage ?? null);
    } finally {
      setPreferredLanguageSaving(false);
    }
  };

  const closeEditNameModal = () => {
    setIsEditNameOpen(false);
    setEditNameError(null);
  };

  const handleOpenNotesFromSheet = () => {
    setShowQuickSheet(false);
    setOpenPanel("none");
    openInternalPanelTab("note");
  };

  const handleOpenHistoryFromSheet = () => {
    setShowQuickSheet(false);
    setOpenPanel("history");
    if (id) fetchHistory(id);
  };
  const handleOpenNotesPanel = () => {
    setOpenPanel("none");
    openInternalPanelTab("note");
  };

  const handleOpenHistoryPanel = () => {
    setOpenPanel("history");
    if (id) fetchHistory(id);
  };

  const updateConversationState = (patch: Partial<typeof conversation>) => {
    if (!conversation || conversation.id !== id) return;
    setConversation({ ...conversation, ...patch } as any);
  };


  const handleBlockChat = async () => {
    if (!id) return;
    setIsChatActionLoading(true);
    try {
      await fetch(`/api/conversations/${id}/block`, { method: "POST" });
      setIsChatBlocked(true);
      updateConversationState({ isBlocked: true });
      window.dispatchEvent(new Event("fanDataUpdated"));
    } catch (err) {
      console.error("Error blocking chat", err);
    } finally {
      setIsChatActionLoading(false);
    }
  };

  const handleUnblockChat = async () => {
    if (!id) return;
    setIsChatActionLoading(true);
    try {
      await fetch(`/api/conversations/${id}/unblock`, { method: "POST" });
      setIsChatBlocked(false);
      updateConversationState({ isBlocked: false });
      window.dispatchEvent(new Event("fanDataUpdated"));
    } catch (err) {
      console.error("Error unblocking chat", err);
    } finally {
      setIsChatActionLoading(false);
    }
  };

  const handleArchiveChat = async () => {
    if (!id) return;
    setIsChatActionLoading(true);
    try {
      await fetch(`/api/conversations/${id}/archive`, { method: "POST" });
      setIsChatArchived(true);
      updateConversationState({ isArchived: true });
      window.dispatchEvent(new Event("fanDataUpdated"));
    } catch (err) {
      console.error("Error archiving chat", err);
    } finally {
      setIsChatActionLoading(false);
    }
  };

  const handleToggleHighPriority = async () => {
    if (!id) return;
    const nextValue = !conversation.isHighPriority;
    setIsChatActionLoading(true);
    try {
      const res = await fetch(`/api/fans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHighPriority: nextValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Error updating high priority", data?.error || res.statusText);
        return;
      }
      await refreshFanData(id);
    } catch (err) {
      console.error("Error updating high priority", err);
    } finally {
      setIsChatActionLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!id) return;
    try {
      setInviteCopyState("loading");
      setInviteCopyError(null);
      const res = await fetch(`/api/fans/${id}/invite`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.inviteUrl) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[invite] generate failed", data?.error || res.statusText);
        }
        setInviteCopyState("error");
        setInviteCopyError("No se pudo generar el enlace.");
        return;
      }
      const inviteUrl = data.inviteUrl as string;
      setInviteCopyUrl(inviteUrl);
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopyState("copied");
      setInviteCopyToast("Invitación copiada");
      if (inviteCopyToastTimer.current) {
        clearTimeout(inviteCopyToastTimer.current);
      }
      inviteCopyToastTimer.current = setTimeout(() => setInviteCopyToast(""), 2000);
      setTimeout(() => setInviteCopyState("idle"), 1500);
    } catch (error) {
      console.error("Error copying invite link", error);
      setInviteCopyState("error");
      setInviteCopyError("No se pudo copiar el enlace.");
    }
  };

  const copyInviteLinkForTools = useCallback(async () => {
    if (!id) return false;
    try {
      const res = await fetch(`/api/fans/${id}/invite`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.inviteUrl) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[invite] generate failed", data?.error || res.statusText);
        }
        return false;
      }
      await navigator.clipboard.writeText(data.inviteUrl);
      return true;
    } catch (error) {
      console.error("Error copying invite link", error);
      return false;
    }
  }, [id]);

  const handleRenewAction = async () => {
    const first = getFirstName(contactName) || contactName;
    const text = buildFollowUpExpiredMessage(first);
    await fillMessageForFan(text, resolveIntentActionKey("renovacion"));
    adjustMessageInputHeight();
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  };

  const handleSendLinkFromManager = () => {
    closeInlinePanel();
    setComposerTarget("fan");
    handleSubscriptionLink({ focus: true });
  };

  const lifetimeValueDisplay = Math.round(conversation.lifetimeValue ?? 0);
  const notesCountDisplay = conversation.notesCount ?? 0;
  const novsyStatus = conversation.novsyStatus ?? null;
  const isQueueActive = activeQueueFilter === "ventas_hoy";
  const queueStatus = getQueuePosition();
  const isInQueue = isQueueActive && queueStatus.index >= 0;
  const hasPrevInQueue = isInQueue && queueStatus.index > 0;
  const isTodayLocal = useCallback((value?: string | null) => {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }, []);
  const attendedInQueueToday = useMemo(
    () =>
      queueFans.filter(
        (fan) =>
          isTodayLocal((fan as any).lastHandledAt as string | null) ||
          isTodayLocal((fan as any).lastCreatorMessageAt as string | null)
      ).length,
    [queueFans, isTodayLocal]
  );
  const queueTotal = queueFans.length;
  const currentQueuePosition = isInQueue ? queueStatus.index + 1 : 0;
  const recommendedFan = useMemo(() => {
    if (activeQueueFilter !== "ventas_hoy" || queueFans.length === 0) return null;
    const currentId = conversation?.id ?? null;
    if (!currentId) return queueFans[0];
    const idx = queueFans.findIndex((fan) => fan.id === currentId);
    if (idx >= 0) return queueFans[idx + 1] ?? null;
    return queueFans[0];
  }, [activeQueueFilter, conversation?.id, queueFans]);
  const statusTags: string[] = [];
  if (conversation.isHighPriority) {
    if (vipAmountToday > 0) statusTags.push(`Alta prioridad · ${vipAmountToday} €`);
    else statusTags.push("Alta prioridad");
  } else {
    statusTags.push(formatTier(conversation.customerTier));
  }
  if (!conversation.isHighPriority) {
    statusTags.push(`${Math.round(lifetimeAmount)} €`);
  }
  if (followUpLabel) {
    const shortNext =
      followUpLabel.length > 60 ? `${followUpLabel.slice(0, 57)}…` : followUpLabel;
    statusTags.push(shortNext);
  }
  const statusLine = statusTags.join(" · ");
  const tierLabels: Record<number, string> = {
    0: "T0 – calentamiento",
    1: "T1 – foto extra básica",
    2: "T2 – pack medio",
    3: "T3 – techo alto",
    4: "T4 – ultra premium",
  };

  function formatLastPurchase(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "hoy";
    if (diffDays === 1) return "hace 1 día";
    return `hace ${diffDays} días`;
  }

  function formatLastPurchaseToday(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return "hace instantes";
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) return "hace 1 min";
    if (diffMinutes < 60) return `hace ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 6) return `hace ${diffHours} h`;
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    if (d.toDateString() === now.toDateString()) return `hoy a las ${hours}:${minutes}`;
    return `${hours}:${minutes}`;
  }

  function getNextExtraTierLabel(status: Fan["extraLadderStatus"]): string | null {
    if (!status || !status.suggestedTier) return null;
    const tier = status.suggestedTier;
    if (tier === "T1") return "Propón un T1 (foto extra básica)";
    if (tier === "T2") return "Propón un T2 (pack medio)";
    if (tier === "T3" || tier === "T4") return "Propón el techo (pack caro)";
    return null;
  }
  const showRenewAction =
    isAccessExpired ||
    followUpTag === "trial_soon" ||
    followUpTag === "monthly_soon" ||
    followUpTag === "expired" ||
    followUpTag === "today";
  const renewButtonLabel = isAccessExpired ? "Reenganche" : "Renovación";

  function getTurnModeLabel(mode: AiTurnMode) {
    if (mode === "push_pack") return "Empujar pack";
    if (mode === "care_new") return "Cuidar nuevos";
    if (mode === "vip_focus") return "Mimar VIP";
    return "Automático (equilibrado)";
  }

  function getUsageLabelForPlan(usage: AiTemplateUsage | null): string | null {
    if (!usage) return null;
    if (usage === "welcome" || usage === "warmup") return "Saludo / calentar";
    if (usage === "extra_quick") return "Extra rápido";
    if (usage === "pack_offer") return "Pack especial";
    if (usage === "renewal") return "Reenganche";
    return usage;
  }

  const lapexSummary =
    conversation.extraLadderStatus && (conversation.extraLadderStatus.totalSpent ?? 0) > 0
      ? `${lapexPhaseLabel}${lapexExtraNote} · Ha gastado ${Math.round(
          conversation.extraLadderStatus.totalSpent ?? 0
        )} € en extras · Último pack ${formatLastPurchase(conversation.extraLadderStatus.lastPurchaseAt) || "—"} · Siguiente sugerencia: ${
          lapexSuggested || "—"
        }`
      : null;

  const sessionSummary =
    sessionToday.todayCount > 0
      ? `Sesión hoy: ${sessionToday.todayCount} extras — ${Math.round(sessionToday.todaySpent ?? 0)} € · Último ${
          formatLastPurchaseToday(sessionToday.todayLastPurchaseAt) || "—"
        }`
      : "Sesión hoy: sin extras todavía";

  const iaSummary = `IA hoy: ${aiStatus ? `${aiStatus.usedToday}/${aiStatus.hardLimitPerDay ?? "∞"}` : "–/–"} · Créditos: ${
    aiStatus ? aiStatus.creditsAvailable : "—"
  } · Modo IA: ${getTurnModeLabel(aiTurnMode)}`;

  const planSummary = plan.summaryLabel
    ? plan.summaryLabel
    : `Plan de hoy: ${plan.focusLabel || "—"}${plan.stepLabel ? ` — ${plan.stepLabel}` : ""}${
        plan.goalLabel ? ` — Objetivo: ${plan.goalLabel}` : ""
      }${
        getUsageLabelForPlan(plan.suggestedUsage)
          ? ` — Siguiente jugada: ${getUsageLabelForPlan(plan.suggestedUsage)}`
          : ""
      }`;

  const managerShortSummary = managerSummary?.priorityReason || fanManagerAnalysis.headline || plan.summaryLabel || statusLine;
  const quickExtraDisabled = iaBlocked || aiStatus?.limitReached;
  const messageListBottomPadding = Math.max(144, dockHeight + 48);
  const inlineActionTone = inlineAction
    ? ({
        ok: {
          icon: "check",
          iconClass:
            "border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--brand)]",
        },
        info: {
          icon: "info",
          iconClass: "border-[color:rgba(var(--brand-rgb),0.4)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--brand)]",
        },
        warn: {
          icon: "alert",
          iconClass: "border-[color:rgba(245,158,11,0.6)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--warning)]",
        },
      } as const)[inlineAction.kind]
    : null;
  const composerDock = renderComposerDock();
  const showHistory = openPanel === "history";
  const showExtraTemplates = openPanel === "extras";
  const getTransactionPriceFor = (item?: ContentWithFlags | null) => {
    if (!item) return 0;
    const custom = transactionPrices[item.id];
    if (custom === undefined || custom === null || Number.isNaN(custom)) {
      return getExtraPrice(item);
    }
    return Math.max(0, custom);
  };
  const selectedExtrasTotal = selectedContentIds.reduce((sum, selectedId) => {
    const item = contentItems.find((c) => c.id === selectedId);
    return sum + getTransactionPriceFor(item);
  }, 0);
  const handleMonthlyOfferFromManager = () => {
    handleSubscriptionLink({ focus: true });
    openContentModal({ mode: "packs", packFocus: "MONTHLY" });
  };

  const filteredItems = contentItems.filter((item) => {
    const tag = getTimeOfDayTag(item.title ?? "");

    if (timeOfDayFilter === "all") return true;
    if (timeOfDayFilter === "day") return tag === "day";
    if (timeOfDayFilter === "night") return tag === "night";

    return true;
  });
  const ppvTierFallback = useMemo(() => {
    const extras = contentItems.filter((item) => item.isExtra === true || item.visibility === "EXTRA");
    const resolveItemTier = (item: ContentWithFlags) =>
      item.chatTier ?? resolveChatTierFromExtraTier(item.extraTier ?? null);
    const resolveItemMoment = (item: ContentWithFlags): TimeOfDayValue => {
      const slot = item.extraSlot ?? "";
      if (slot.startsWith("DAY")) return "DAY";
      if (slot.startsWith("NIGHT")) return "NIGHT";
      if (slot === "ANY") return "ANY";
      return item.timeOfDay ?? "ANY";
    };
    const desiredMoment = timeOfDay === "NIGHT" ? "NIGHT" : timeOfDay === "ANY" ? "ANY" : "DAY";
    const tierOrder = CHAT_PPV_TIERS;
    const selectedIndex = tierOrder.indexOf(ppvTierFilter);
    const nearbyTiers = tierOrder
      .filter((tier) => tier !== ppvTierFilter)
      .sort((a, b) => Math.abs(tierOrder.indexOf(a) - selectedIndex) - Math.abs(tierOrder.indexOf(b) - selectedIndex));
    const byTierMoment = extras.filter(
      (item) => resolveItemTier(item) === ppvTierFilter && resolveItemMoment(item) === desiredMoment
    );
    if (byTierMoment.length > 0) {
      return { items: byTierMoment, stage: "tier_moment", totalExtras: extras.length };
    }
    const byTierAny = extras.filter(
      (item) => resolveItemTier(item) === ppvTierFilter && resolveItemMoment(item) === "ANY"
    );
    if (byTierAny.length > 0) {
      return { items: byTierAny, stage: "tier_any", totalExtras: extras.length };
    }
    const sortByTierDistance = (items: ContentWithFlags[]) => {
      return items
        .map((item, idx) => ({ item, idx }))
        .sort((a, b) => {
          const tierA = resolveItemTier(a.item);
          const tierB = resolveItemTier(b.item);
          const indexA = tierA ? tierOrder.indexOf(tierA) : Number.MAX_SAFE_INTEGER;
          const indexB = tierB ? tierOrder.indexOf(tierB) : Number.MAX_SAFE_INTEGER;
          const distanceA = Math.abs(indexA - selectedIndex);
          const distanceB = Math.abs(indexB - selectedIndex);
          if (distanceA !== distanceB) return distanceA - distanceB;
          if (indexA !== indexB) return indexA - indexB;
          return a.idx - b.idx;
        })
        .map((entry) => entry.item);
    };
    const byNearbyMoment = extras.filter((item) => {
      const tier = resolveItemTier(item);
      if (!tier || !nearbyTiers.includes(tier)) return false;
      return resolveItemMoment(item) === desiredMoment;
    });
    if (byNearbyMoment.length > 0) {
      return { items: sortByTierDistance(byNearbyMoment), stage: "near_moment", totalExtras: extras.length };
    }
    const byNearbyAny = extras.filter((item) => {
      const tier = resolveItemTier(item);
      if (!tier || !nearbyTiers.includes(tier)) return false;
      return resolveItemMoment(item) === "ANY";
    });
    if (byNearbyAny.length > 0) {
      return { items: sortByTierDistance(byNearbyAny), stage: "near_any", totalExtras: extras.length };
    }
    return { items: [] as ContentWithFlags[], stage: "none", totalExtras: extras.length };
  }, [contentItems, ppvTierFilter, timeOfDay]);
  const ppvTierItems = ppvTierFallback.items;

  const ppvTierCtaTier = resolveExtraTierFromChatTier(ppvTierFilter) ?? "T1";
  const ppvTierCtaMoment = timeOfDay === "NIGHT" ? "NIGHT" : timeOfDay === "ANY" ? "ANY" : "DAY";
  const ppvTierMenu = isFanTarget ? (
    <div className="relative inline-flex">
      <button
        ref={ppvTierButtonRef}
        type="button"
        onClick={() => {
          if (!canUsePpvTiers) return;
          setPpvTierMenuOpen((prev) => !prev);
        }}
        disabled={!canUsePpvTiers}
        className={clsx(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2",
          canUsePpvTiers
            ? "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--border-a)] hover:bg-[color:var(--surface-1)] focus-visible:ring-[color:var(--ring)]"
            : "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
        )}
        title={canUsePpvTiers ? "Tiers PPV" : "Solo disponible cuando escribes al fan."}
        aria-label="Tiers PPV"
      >
        <span>Tiers</span>
        <span className="text-[10px] text-[color:var(--muted)]">▾</span>
      </button>
      {ppvTierMenuOpen && (
        <div
          ref={ppvTierMenuRef}
          className="absolute bottom-11 left-0 z-50 w-72 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-xl"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
            <span>PPV tiers</span>
            <button
              type="button"
              onClick={() => setPpvTierMenuOpen(false)}
              className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[9px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
            >
              Cerrar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {CHAT_PPV_TIERS.map((tier) => {
              const isActive = tier === ppvTierFilter;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setPpvTierFilter(tier)}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                    isActive
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  )}
                >
                  {resolveChatTierLabel(tier)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {contentLoading && (
              <div className="text-xs text-[color:var(--muted)]">Cargando extras…</div>
            )}
            {!contentLoading && contentError && (
              <div className="text-xs text-[color:var(--danger)]">No se pudieron cargar los extras.</div>
            )}
            {!contentLoading && !contentError && ppvTierItems.length === 0 && (
              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted)] space-y-2">
                <div>No hay extras disponibles para este tier ahora mismo.</div>
                {ppvTierFallback.totalExtras === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      void router.push(
                        `/library?create=1&tier=${encodeURIComponent(ppvTierCtaTier)}&moment=${encodeURIComponent(ppvTierCtaMoment)}`
                      );
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.12)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.18)]"
                  >
                    Crear extra para este tier
                  </button>
                )}
              </div>
            )}
            {!contentLoading &&
              !contentError &&
              ppvTierItems.map((item) => {
                const timeLabel = formatExtraSlotLabel(item.extraSlot ?? null, item.timeOfDay ?? null);
                const itemTier = resolveChatTierForItem(item) ?? ppvTierFilter;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPpvItem(item)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-left text-xs text-[color:var(--text)] hover:border-[color:rgba(245,158,11,0.6)] hover:bg-[color:var(--surface-2)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold">{item.title}</div>
                      <div className="text-[10px] text-[color:var(--muted)]">{timeLabel}</div>
                    </div>
                    <span className="text-[10px] text-[color:var(--muted)]">{resolveChatTierLabel(itemTier)}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="relative flex flex-col w-full h-[100dvh] max-h-[100dvh]">
      {onBackToBoard && (
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-[color:var(--surface-2)] border-b border-[color:var(--border)] backdrop-blur">
          <button
            type="button"
            onClick={onBackToBoard}
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-xs font-medium text-[color:var(--text)] transition hover:border-[color:var(--border-a)] hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            ← Volver
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            <span className="truncate text-sm font-medium text-[color:var(--text)]">{contactName}</span>
            {languageBadgeLabel && (
              <Badge tone={badgeToneForLabel(languageBadgeLabel)} size="md">
                {languageBadgeLabel}
              </Badge>
            )}
            {(conversation.isHighPriority || (conversation.extrasCount ?? 0) > 0) && (
              conversation.isHighPriority ? (
                <Badge tone={badgeToneForLabel("Alta")} size="md" leftGlyph="pin">
                  Alta
                </Badge>
              ) : (
                <Badge tone={badgeToneForLabel("Extras")} size="md">
                  Extras
                </Badge>
              )
            )}
            {nextActionStatus && (
              <Badge tone={nextActionTone} size="md" leftGlyph="clock">
                {nextActionStatus.label}
              </Badge>
            )}
          </div>
        </header>
      )}
      <div className="flex flex-1 min-h-0 min-w-0">
        <div ref={rightPaneRef} className="relative flex flex-col flex-1 min-h-0 min-w-0 h-full">
          <header ref={fanHeaderRef} className="sticky top-0 z-20 backdrop-blur">
            <div className="max-w-4xl mx-auto w-full bg-[color:var(--surface-2)] border-b border-[color:var(--border)] px-4 py-3 md:px-6 md:py-4 flex flex-col gap-3">
          {/* Piso 1 */}
          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0 flex-1 order-1">
              <Avatar width="w-10" height="h-10" image={image} />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-base font-semibold text-[color:var(--text)] truncate">{contactName}</h1>
                  {languageBadgeLabel && (
                    <Badge tone={badgeToneForLabel(languageBadgeLabel)} size="md">
                      {languageBadgeLabel}
                    </Badge>
                  )}
                  {conversation.isHighPriority && (
                    <Badge tone={badgeToneForLabel("Alta")} size="md" leftGlyph="pin">
                      Alta
                    </Badge>
                  )}
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${presenceDotClass}`}
                    aria-label={presenceStatus.label}
                    title={presenceStatus.label}
                  />
                </div>
                <p className="text-xs text-[color:var(--muted)] truncate">
                  {membershipDetails || packLabel || "Suscripción"}
                </p>
              </div>
            </div>
            <div className="order-2 ml-auto sm:order-3 sm:ml-0">
              <ConversationActionsMenu
                conversation={conversation as ConversationListData}
                variant="header"
                align="right"
                onEditName={() => handleOpenEditName()}
                onToggleHighPriority={() => handleToggleHighPriority()}
                onOpenProfileFollowup={() => handleOpenNotesPanel()}
                onOpenHistory={() => handleOpenHistoryPanel()}
                onOpenSalesExtra={() => handleOpenExtrasPanel()}
                onBlockChat={() => handleBlockChat()}
                onUnblockChat={() => handleUnblockChat()}
                onArchiveChat={() => handleArchiveChat()}
                actionDisabled={isChatActionLoading}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 order-3 w-full sm:order-2 sm:w-auto sm:ml-auto sm:justify-end">
              <button
                type="button"
                onClick={handleViewProfile}
                aria-label="Ver ficha del fan"
                className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-xs font-medium text-[color:var(--text)] transition hover:border-[color:var(--border-a)] hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                Ver ficha
              </button>
            </div>
          </div>

          {/* Piso 2 */}
          <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
            <Badge tone={packBadgeTone} size="md">
              {packLabel}
            </Badge>
            <Badge tone={tierBadgeTone} size="md">
              {tierLabel}
            </Badge>
            {conversation.isHighPriority && (
              <Badge tone={badgeToneForLabel("Alta prioridad")} size="md" leftGlyph="pin">
                Alta prioridad
              </Badge>
            )}
            {extrasCountDisplay > 0 && (
              <Badge tone={badgeToneForLabel("Extras")} size="md">
                Extras
              </Badge>
            )}
            {nextActionStatus && (
              <Badge tone={nextActionTone} size="md" leftGlyph="clock">
                {nextActionStatus.label}
              </Badge>
            )}
          </div>

          {/* Piso 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 md:gap-x-6 text-xs text-[color:var(--text)] min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[color:var(--muted)]">Última conexión:</span>
              <span className="truncate">{presenceStatus.label || "Sin actividad reciente"}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[color:var(--muted)]">Extras:</span>
              <span className="truncate">
                {extrasCountDisplay} · {extrasSpentDisplay} €
                {showTipsInline ? ` · Propinas: ${tipsInlineLabel}` : ""}
              </span>
            </div>
            <div className="md:col-span-2 flex items-start gap-2 min-w-0">
              <span className="text-[color:var(--muted)]">Seguimiento:</span>
              <span
                className="min-w-0 line-clamp-1 md:line-clamp-2 text-[color:var(--text)]"
                title={followUpLabel || ""}
              >
                {followUpLabel || "Sin seguimiento definido"}
              </span>
              {isFollowUpNoteMissing && (
                <button
                  type="button"
                  onClick={handleAddFollowUpNote}
                  className="shrink-0 rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                >
                  Añadir nota
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      {isChatBlocked && (
        <div className="mx-4 mt-2 rounded-xl border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.08)] px-3 py-2 text-xs md:text-sm text-[color:var(--danger)] flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--danger)]" />
          <span>Chat bloqueado. No puedes enviar mensajes nuevos a este fan.</span>
        </div>
      )}
      {/* Avisos de acceso caducado o a punto de caducar */}
      {isAccessExpired && (
        <div className="mx-4 mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-[color:rgba(245,158,11,0.5)] bg-[color:rgba(245,158,11,0.08)] px-4 py-3 text-xs text-[color:var(--text)]">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[color:var(--warning)]">Acceso caducado · sin pack activo</span>
            <span className="text-[11px] text-[color:var(--text)]">
              Puedes enviarle un mensaje de reenganche y decidir después si le das acceso a nuevos contenidos.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
              onClick={handleRenewAction}
            >
              Mensaje de reenganche
            </button>
          </div>
        </div>
      )}
      {conversation.membershipStatus === "active" && typeof effectiveDaysLeft === "number" && effectiveDaysLeft <= 1 && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-xl border border-[color:rgba(245,158,11,0.5)] bg-[color:rgba(245,158,11,0.08)] px-4 py-2 text-[11px] text-[color:var(--text)]">
          {effectiveDaysLeft <= 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.16)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                  CADUCA HOY
                </span>
                <span className="inline-flex items-center rounded-full border border-[color:rgba(244,63,94,0.7)] bg-[color:rgba(244,63,94,0.16)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                  Crítico
                </span>
              </div>
              <span className="text-[11px] text-[color:var(--text)]">
                Es el momento de renovar hoy mismo para mantener el acceso.
              </span>
            </div>
          ) : (
            <span className="font-medium text-[color:var(--text)]">
              Le queda {effectiveDaysLeft === 1 ? "1 día" : `${effectiveDaysLeft} días`} de acceso. Buen momento para proponer el siguiente paso.
            </span>
          )}
        </div>
      )}
      {isQueueActive && (
        <div className="mt-2 mb-3 flex items-center justify-between rounded-xl border border-[color:rgba(245,158,11,0.6)] bg-[color:var(--surface-1)] px-3 py-2 text-xs">
          <div className="flex flex-col gap-1 truncate">
            <span className="font-semibold text-[color:var(--warning)] flex items-center gap-1">
              <IconGlyph name="spark" className="h-3.5 w-3.5" />
              <span>Siguiente recomendado</span>
              {recommendedFan && (recommendedFan.customerTier === "priority" || recommendedFan.customerTier === "vip") && (
                <span className="inline-flex items-center gap-1 text-[10px] rounded-full bg-[color:rgba(245,158,11,0.16)] px-2 text-[color:var(--warning)]">
                  <IconGlyph name="pin" className="h-3 w-3" />
                  <span>Alta prioridad</span>
                </span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--warning)]">
              <span>Atendidos: {attendedInQueueToday}/{queueTotal}</span>
              {queueTotal > 0 && currentQueuePosition > 0 && (
                <span>Actual: {currentQueuePosition}/{queueTotal}</span>
              )}
            </div>
            {queueFans.length === 0 && (
              <span className="text-[color:var(--muted)]">No hay cola activa.</span>
            )}
            {queueFans.length > 0 && !recommendedFan && (
              <span className="text-[color:var(--muted)]">Cola terminada · Atendidos {attendedInQueueToday}/{queueTotal}</span>
            )}
            {recommendedFan && recommendedFan.id !== id && (
              <>
                <span className="truncate text-[color:var(--text)]">
                  {recommendedFan.contactName} ·{" "}
                  {recommendedFan.customerTier === "priority" || recommendedFan.customerTier === "vip"
                    ? "Alta prioridad"
                    : recommendedFan.customerTier === "regular"
                    ? "Habitual"
                    : "Nuevo"}{" "}
                  · {Math.round(recommendedFan.lifetimeValue ?? 0)} € · {recommendedFan.notesCount ?? 0} nota
                  {(recommendedFan.notesCount ?? 0) === 1 ? "" : "s"}
                </span>
                {(() => {
                  const nextNote =
                    (typeof recommendedFan.nextActionNote === "string"
                      ? recommendedFan.nextActionNote.trim()
                      : "") ||
                    (typeof recommendedFan.followUpOpen?.title === "string"
                      ? recommendedFan.followUpOpen.title.trim()
                      : "") ||
                    (typeof recommendedFan.followUpOpen?.note === "string"
                      ? recommendedFan.followUpOpen.note.trim()
                      : "") ||
                    (recommendedFan.nextAction?.trim() || "");
                  const nextLabel = formatNextActionLabel(
                    recommendedFan.followUpOpen?.dueAt ?? recommendedFan.nextActionAt ?? null,
                    nextNote
                  );
                  if (!nextLabel) return null;
                  return (
                    <span className="text-[11px] text-[color:var(--muted)] truncate" title={nextLabel}>
                      {nextLabel}
                    </span>
                  );
                })()}
              </>
            )}
          </div>
          <div className="ml-3 flex items-center gap-2 shrink-0">
            {hasPrevInQueue && (
              <button
                type="button"
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                onClick={handlePrevInQueue}
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-[11px] font-semibold text-[color:var(--warning)] hover:bg-[color:rgba(245,158,11,0.16)] disabled:opacity-60"
              onClick={handleNextInQueue}
              disabled={!isQueueActive || queueFans.length === 0 || !recommendedFan}
            >
              Siguiente
            </button>
            {recommendedFan && recommendedFan.id !== id && (
              <button
                type="button"
                className="rounded-full border border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-[11px] font-semibold text-[color:var(--warning)] hover:bg-[color:rgba(245,158,11,0.16)]"
                onClick={() => handleSelectFanFromBanner(recommendedFan)}
              >
                Abrir
              </button>
            )}
            {!recommendedFan && queueFans.length > 0 && (
              <button
                type="button"
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                onClick={() => {
                  setActiveQueueFilter?.(null);
                }}
              >
                Volver a Todos
              </button>
            )}
          </div>
        </div>
      )}
      {showHistory && (
        <div className="mb-3 mx-4 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-3 text-xs text-[color:var(--text)] flex flex-col gap-3 max-h-64">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[color:var(--text)]">Historial de cobros</span>
              {purchaseHistoryLoading && <span className="text-[11px] text-[color:var(--muted)]">Cargando...</span>}
            </div>
            <button
              type="button"
              onClick={() => setOpenPanel("none")}
              className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              Cerrar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[color:var(--muted)]">Total gastado</span>
              <span className="text-[12px] font-semibold text-[color:var(--text)]">{Math.round(historyTotals.totalSpent)} €</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[color:var(--muted)]">Extras</span>
              <span className="text-[12px] font-semibold text-[color:var(--text)]">{Math.round(historyTotals.extrasAmount)} €</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[color:var(--muted)]">Propinas</span>
              <span className="text-[12px] font-semibold text-[color:var(--text)]">
                {Math.round(historyTotals.tipsAmount)} €
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[color:var(--muted)]">Regalos</span>
              <span className="text-[12px] font-semibold text-[color:var(--text)]">{Math.round(historyTotals.giftsAmount)} €</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {historyFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setHistoryFilter(filter.id)}
                className={clsx(
                  "rounded-full border px-3 py-1 font-semibold transition",
                  historyFilter === filter.id
                    ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] hover:border-[color:var(--surface-border-hover)] hover:text-[color:var(--text)]"
                )}
              >
                {filter.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowArchivedPurchases((prev) => !prev)}
              className={clsx(
                "rounded-full border px-3 py-1 font-semibold transition",
                showArchivedPurchases
                  ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] hover:border-[color:var(--surface-border-hover)] hover:text-[color:var(--text)]"
              )}
            >
              {showArchivedPurchases ? "Ocultar archivados" : "Mostrar archivados"}
            </button>
          </div>
          {historyError && <div className="text-[11px] text-[color:var(--danger)]">{historyError}</div>}
          {!historyError && !purchaseHistoryLoading && filteredPurchaseHistory.length === 0 && (
            <div className="text-[11px] text-[color:var(--muted)]">Sin movimientos.</div>
          )}
          {filteredPurchaseHistory.length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {filteredPurchaseHistory.map((entry) => {
                const meta = purchaseKindMeta[entry.kind] ?? {
                  label: "Compra",
                  icon: "receipt",
                  tone: "text-[color:var(--text)]",
                };
                const isArchived = entry.isArchived === true;
                const isArchiveBusy = purchaseArchiveBusyId === entry.id;
                const title =
                  entry.kind === "EXTRA"
                    ? entry.contentTitle
                      ? `Extra · ${entry.contentTitle}`
                      : "Extra"
                    : entry.kind === "TIP"
                    ? "Propina"
                    : entry.kind === "GIFT"
                    ? "Regalo"
                    : meta.label;
                return (
                  <div
                    key={entry.id}
                    className={clsx(
                      "rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-2",
                      isArchived && "opacity-70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <IconGlyph name={meta.icon} className={clsx("h-4 w-4", meta.tone)} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[12px] font-semibold text-[color:var(--text)] truncate">{title}</span>
                          <span className="text-[10px] text-[color:var(--muted)]">{formatNoteDate(entry.createdAt)}</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-semibold text-[color:var(--text)]">{Math.round(entry.amount)} €</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {isArchived ? (
                        <span className="rounded-full border border-[color:rgba(245,158,11,0.5)] bg-[color:rgba(245,158,11,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                          Archivado
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => handleTogglePurchaseArchive(entry)}
                        disabled={isArchiveBusy}
                        className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)] transition hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-2)] disabled:opacity-50"
                      >
                        {isArchived ? "Restaurar" : "Archivar"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {iaMessage && (
        <div className="mx-4 mb-2 rounded-lg border border-[color:rgba(245,158,11,0.6)] bg-[color:rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[color:var(--text)]">
          {iaMessage} {iaBlocked ? "Mañana se reiniciarán tus créditos diarios." : ""}
        </div>
      )}
      {false && (
        // Desactivado: el nuevo Manager IA cubre las sugerencias de próxima acción.
        (() => {
          const followUpTemplates = getFollowUpTemplates({
            followUpTag,
            daysLeft,
            fanName: firstName,
          });
          if (!followUpTemplates.length) return null;
          return (
            <div className="mb-3 mx-4 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {followUpTag === "trial_soon" &&
                    `Próxima acción · Prueba · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                  {followUpTag === "monthly_soon" &&
                    `Próxima acción · Suscripción · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                  {followUpTag === "expired" && "Próxima acción · Acceso caducado"}
                </span>
                {accessGrantsLoading && <span className="text-[10px] text-[color:var(--muted)]">Actualizando...</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {followUpTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => void fillMessageForFan(tpl.text)}
                    className="inline-flex items-center rounded-full border border-[color:rgba(245,158,11,0.8)] bg-[color:rgba(245,158,11,0.08)] px-3 py-1 text-[11px] font-medium text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)] transition"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()
      )}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="relative flex flex-col flex-1 min-h-0">
          <div
            ref={messagesContainerRef}
            className="flex flex-col w-full flex-1 min-h-0 overflow-y-auto"
            style={{ backgroundImage: "var(--chat-pattern)" }}
          >
            <div
              className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6"
              style={{ paddingBottom: messageListBottomPadding }}
            >
            {schemaError && (
              <div className="mb-4 rounded-xl border border-[color:rgba(244,63,94,0.6)] bg-[color:rgba(244,63,94,0.08)] px-4 py-3 text-[color:var(--text)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">DB fuera de sync</div>
                    <p className="text-xs text-[color:var(--text)]">{schemaError.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySchemaFix}
                    className="rounded-full border border-[color:rgba(244,63,94,0.7)] bg-[color:rgba(244,63,94,0.12)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.22)] transition"
                  >
                    {schemaCopyLabel}
                  </button>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-[color:var(--text)]">
                  {schemaFixCommands.map((cmd) => (
                    <code key={cmd} className="rounded-md bg-[color:rgba(244,63,94,0.08)] px-2 py-1 font-mono">
                      {cmd}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {purchaseNotice && (
              <div className="mb-3 flex justify-center">
                <div className="rounded-2xl border border-[color:rgba(34,197,94,0.4)] bg-[color:rgba(34,197,94,0.08)] px-4 py-2 text-[11px] text-[color:var(--text)] novsy-pop">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="text-base leading-none">{purchaseNoticeIcon}</span>
                    <span>{purchaseNoticeLabel}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-[color:var(--muted)]">{purchaseNoticeTime}</div>
                </div>
              </div>
            )}
            {voiceNotice && (
              <div className="mb-3 flex justify-center">
                <div className="rounded-2xl border border-[color:rgba(var(--brand-rgb),0.4)] bg-[color:rgba(var(--brand-rgb),0.12)] px-4 py-2 text-[11px] text-[color:var(--text)] novsy-pop">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="text-base leading-none">🎙️</span>
                    <span>{voiceNoticeLabel}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-[color:var(--muted)]">{voiceNoticeTime}</div>
                </div>
              </div>
            )}
            {messages.map((messageConversation, index) => {
              if (messageConversation.kind === "system") {
                return (
                  <div key={messageConversation.id || index} className="flex justify-center">
                    <div className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--muted)] text-center">
                      {messageConversation.message}
                    </div>
                  </div>
                );
              }
              if (messageConversation.kind === "audio") {
                return (
                  <AudioMessageBubble
                    key={messageConversation.id || index}
                    message={messageConversation}
                    onCopyTranscript={handleCopyTranscript}
                    onUseTranscript={handleUseTranscript}
                    onRetryTranscript={requestTranscriptRetry}
                    tone={fanTone}
                    onInsertText={(text) => handleUseManagerReplyAsMainMessage(text, "Análisis voz")}
                    onInsertManager={handleInsertManagerComposerText}
                    onTranscriptSaved={(text) =>
                      messageConversation.id && handleManualTranscriptSaved(messageConversation.id, text)
                    }
                    onAnalysisSaved={(analysis) =>
                      messageConversation.id && handleVoiceAnalysisSaved(messageConversation.id, analysis)
                    }
                    onTranslationSaved={(translation) =>
                      messageConversation.id && handleVoiceTranslationSaved(messageConversation.id, translation)
                    }
                    onToast={showComposerToast}
                    translateEnabled={isFanMode}
                    translateConfigured={isTranslateConfigured}
                    onTranslateNotConfigured={showTranslateConfigToast}
                    translateTargetLang={translateTargetLang}
                    fanId={id ?? ""}
                    onReact={(emoji) => {
                      if (!messageConversation.id) return;
                      handleReactToMessage(messageConversation.id, emoji);
                    }}
                  />
                );
              }
              if (messageConversation.kind === "content") {
                return (
                  <ContentAttachmentCard
                    key={`content-${messageConversation.contentItem?.id || index}`}
                    message={messageConversation}
                  />
                );
              }

              const { me, message, seen, time } = messageConversation;
              const isInternalMessage = messageConversation.audience === "INTERNAL";
              const isStickerMessage = messageConversation.kind === "sticker";
              const isLegacySticker = messageConversation.type === "STICKER";
              const retrySticker = isLegacySticker ? getStickerById(messageConversation.stickerId ?? null) : null;
              const messageKey = messageConversation.id ?? `temp-${index}`;
              const isTextMessage = messageConversation.kind === "text" || !messageConversation.kind;
              const messageText = message ?? "";
              const hasMessageText = messageText.trim().length > 0;
              const translatedText = !me ? messageConversation.translatedText ?? undefined : undefined;
              const translationSourceLabel = formatTranslationLang(messageConversation.translationSourceLang, "?");
              const translationTargetLabel = formatTranslationLang(messageConversation.translationTargetLang, translateTargetLabel);
              const isTranslationSourceUnknown = translationSourceLabel === "?";
              const translationBadgeTitle = `${getTranslationLanguageName(translationSourceLabel)} → ${getTranslationLanguageName(
                translationTargetLabel
              )}`;
              const reactionsSummary = messageConversation.reactionsSummary ?? [];
              const translationState = messageConversation.id ? messageTranslationState[messageConversation.id] : undefined;
              const translationStatus = translationState?.status ?? "idle";
              const suggestReplyState = messageConversation.id
                ? messageSuggestReplyState[messageConversation.id]
                : undefined;
              const suggestReplyStatus = suggestReplyState?.status ?? "idle";
              const suggestReplyLoading = suggestReplyStatus === "loading";
              const canTranslateText = Boolean(
                messageConversation.id &&
                  !me &&
                  !isInternalMessage &&
                  isTextMessage
              );
              const canShowTranslationBlock = Boolean(!me && !isInternalMessage && isTextMessage && translatedText);
              const canShowMessageActions = isFanMode && isTextMessage && !isInternalMessage && hasMessageText;
              const canSuggestReply =
                Boolean(messageConversation.id) && !me && canShowMessageActions;
              const suggestReplyTargetLang = canSuggestReply
                ? resolveSuggestReplyTargetLang(messageConversation)
                : translateTargetLang;
              const suggestReplyTargetLabel = formatTranslationLang(suggestReplyTargetLang, translateTargetLabel);
              const messageActionItems = canShowMessageActions
                ? [
                    {
                      label: "Copiar",
                      onClick: () => {
                        void handleMessageCopy(messageText);
                      },
                    },
                    ...(canTranslateText
                      ? [
                          {
                            label: "Traducir",
                            icon: "globe",
                            disabled: translationStatus === "loading",
                            onClick: () => handleTranslateMessage(messageConversation.id as string),
                          },
                        ]
                      : []),
                    ...(canSuggestReply
                      ? [
                          {
                            label: suggestReplyLoading
                              ? "Generando..."
                              : `Responder con IA (${suggestReplyTargetLabel})`,
                            disabled: suggestReplyLoading,
                            onClick: () =>
                              handleSuggestReply(
                                messageConversation.id as string,
                                suggestReplyTargetLang
                              ),
                          },
                        ]
                      : []),
                    {
                      label: "Citar al Manager",
                      disabled: !canUseManagerActions,
                      title: !canUseManagerActions ? "Necesitas un fan activo para usar el Manager." : undefined,
                      onClick: () => handleMessageQuote(messageText),
                    },
                    {
                      label: "Reformular",
                      disabled: !canUseManagerActions,
                      title: !canUseManagerActions ? "Necesitas un fan activo para usar el Manager." : undefined,
                      onClick: () => handleMessageRephrase(messageText),
                    },
                    {
                      label: "Guardar en perfil",
                      onClick: () => handleMessageSaveProfile(messageText),
                    },
                    {
                      label: "Crear seguimiento",
                      onClick: () => handleMessageCreateFollowUp(messageText),
                    },
                  ]
                : [];
              const showActionMenu = canShowMessageActions && !isCoarsePointer;
              const actionMenu = showActionMenu ? (
                <ContextMenu
                  buttonAriaLabel="Acciones del mensaje"
                  items={messageActionItems}
                  align={me ? "right" : "left"}
                  buttonIcon="dots"
                  buttonClassName="h-6 w-6 border border-[color:var(--surface-border)] bg-[color:var(--surface-0)] text-[color:var(--text)]"
                  buttonIconClassName="h-3.5 w-3.5"
                />
              ) : null;
              const canOpenActionSheet = isCoarsePointer && canShowMessageActions;
              return (
                <div key={messageConversation.id || index} className="space-y-1">
                  <MessageBalloon
                    me={me}
                    message={message}
                    messageId={messageConversation.id}
                    seen={seen}
                    time={time}
                    status={messageConversation.status}
                    badge={isInternalMessage ? "INTERNO" : undefined}
                    variant={isInternalMessage ? "internal" : "default"}
                    stickerSrc={isStickerMessage ? messageConversation.stickerSrc ?? null : null}
                    stickerAlt={isStickerMessage ? messageConversation.stickerAlt ?? "Sticker" : null}
                    enableReactions={!isInternalMessage}
                    reactionsSummary={isInternalMessage ? [] : reactionsSummary}
                    onReact={(emoji) => {
                      if (!messageConversation.id) return;
                      handleReactToMessage(messageConversation.id, emoji);
                    }}
                    actionMenu={actionMenu}
                    actionMenuAlign={me ? "right" : "left"}
                    onTouchLongPress={
                      canOpenActionSheet
                        ? () =>
                            openMessageActionSheet({
                              messageId: messageConversation.id ?? undefined,
                              text: messageText,
                              canTranslate: canTranslateText,
                              canSuggestReply,
                              suggestTargetLang: suggestReplyTargetLang,
                            })
                        : undefined
                    }
                    forceReactionButton={isCoarsePointer}
                    anchorId={messageKey}
                  />
                  {canShowTranslationBlock && (
                    <div className={clsx("flex flex-col gap-2", me ? "items-end" : "items-start")}>
                      {translatedText && (
                        <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                            <span>TRADUCCIÓN</span>
                            <span
                              className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[9px] font-semibold text-[color:var(--muted)]"
                              title={translationBadgeTitle}
                            >
                              {`DETECTADO: ${translationSourceLabel} → ${translationTargetLabel}`}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-[12px] text-[color:var(--text)]">
                            {translatedText}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                            <button
                              type="button"
                              className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                              onClick={() => {
                                void copyTextToClipboard(translatedText).then((ok) =>
                                  showComposerToast(ok ? "Texto copiado" : "No se pudo copiar")
                                );
                              }}
                            >
                              Copiar
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                              onClick={() =>
                                handleInsertManagerComposerText(
                                  buildManagerTranslationPayload(
                                    translationSourceLabel,
                                    translationTargetLabel,
                                    messageText,
                                    translatedText,
                                    isTranslationSourceUnknown
                                  )
                                )
                              }
                            >
                              Enviar al Manager
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {messageConversation.status === "failed" && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-[11px] text-[color:var(--danger)] hover:text-[color:var(--danger)] underline"
                        onClick={() => {
                          if (retrySticker) {
                            void sendStickerMessage(retrySticker);
                            return;
                          }
                          void sendFanMessage(messageConversation.message);
                        }}
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {isLoadingMessages && (
              <div className="text-center ui-muted text-sm mt-2">Cargando mensajes...</div>
            )}
            {messagesError && !isLoadingMessages && (
              <div className="text-center text-[color:var(--danger)] text-sm mt-2">{messagesError}</div>
            )}
            {inlineAction && (
              <div className="mt-3">
                <div className="relative flex items-start gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 text-xs text-[color:var(--text)] shadow-[0_8px_20px_rgba(0,0,0,0.25)] ring-1 ring-white/5 backdrop-blur">
                  <span
                    className={clsx(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-base",
                      inlineActionTone?.iconClass
                    )}
                  >
                    {inlineActionTone?.icon ? (
                      <IconGlyph name={inlineActionTone.icon} className="h-4 w-4" />
                    ) : null}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-6">
                    <div className="text-[12px] font-semibold text-[color:var(--text)]">{inlineAction.title}</div>
                    {inlineAction.detail && (
                      <div className="text-[11px] text-[color:var(--muted)] line-clamp-1">{inlineAction.detail}</div>
                    )}
                  </div>
                  {inlineAction.undoLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        inlineAction.onUndo?.();
                        clearInlineAction();
                      }}
                      className="inline-flex h-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 text-[11px] font-semibold text-[color:var(--text)] transition hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-2)]"
                    >
                      {inlineAction.undoLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearInlineAction}
                    className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--muted)] transition hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
                    aria-label="Cerrar aviso"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div ref={chatOverlayRef} className="absolute inset-0 z-[60] pointer-events-none" />
        </div>
        {process.env.NEXT_PUBLIC_DEBUG_CHAT === "1" && (
          <div className="fixed bottom-2 right-2 text-[11px] text-[color:var(--text)] bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-2 py-1 rounded">
            fanId={id || "none"} | loading={String(isLoadingMessages)} | msgs={messages.length} | error={messagesError || "none"}
          </div>
        )}
        <div className="flex flex-col bg-[color:var(--surface-1)] w-full h-auto py-3 px-4 text-[color:var(--muted)] gap-3 flex-shrink-0 overflow-visible">
          {showExtraTemplates && (
            <div className="flex flex-col gap-3 bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-lg p-3 w-full">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-[color:var(--text)]">Historial de ventas extra</h3>
                    <p className="text-[11px] text-[color:var(--muted)]">Registra las ventas desde el modal de Extras PPV. Aquí solo ajustes manuales.</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <h3 className="text-sm font-semibold text-[color:var(--text)]">Historial de ventas extra</h3>
                      <p className="text-[11px] text-[color:var(--muted)]">Registra las ventas desde el modal de Extras PPV. Aquí solo ajustes manuales.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[11px] text-[color:var(--muted)]">
                        <span>Modo</span>
                        <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
                          {(["DAY", "NIGHT"] as TimeOfDayValue[]).map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setTimeOfDay(val)}
                              className={clsx(
                                "px-2 py-0.5 text-[11px] font-semibold rounded-full",
                                timeOfDay === val
                                  ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)] border border-[color:rgba(245,158,11,0.7)]"
                                  : "text-[color:var(--text)]"
                              )}
                            >
                              {val === "DAY" ? "Día" : "Noche"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                        onClick={() => setOpenPanel("none")}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[color:var(--text)]">Historial de extras</h4>
                  {isLoadingExtraHistory && <span className="text-[11px] text-[color:var(--muted)]">Cargando...</span>}
                </div>
                <div className="text-[11px] text-[color:var(--muted)]">
                  {(conversation.extrasCount ?? 0) > 0 ? (
                    <span>
                      {`Este fan te ha comprado ${conversation.extrasCount} extra${(conversation.extrasCount ?? 0) !== 1 ? "s" : ""} por un total de ${Math.round(conversation.extrasSpentTotal ?? 0)} €.`}
                    </span>
                  ) : (
                    <span>Todavía no has vendido extras a este fan.</span>
                  )}
                </div>
                {extraHistoryError && <div className="text-xs text-[color:var(--danger)]">{extraHistoryError}</div>}
                {!extraHistoryError && extraHistory.length === 0 && (
                  <div className="text-xs text-[color:var(--muted)]">Todavía no hay extras registrados para este fan.</div>
                )}
                {!extraHistoryError && extraHistory.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {extraHistory.map((entry) => {
                      const dateStr = new Date(entry.createdAt).toLocaleDateString("es-ES");
                      const session =
                        entry.sessionTag && entry.sessionTag.includes("_")
                          ? entry.sessionTag.split("_")[0]
                          : entry.contentItem?.timeOfDay ?? "ANY";
                          const tier = entry.tier;
                      return (
                        <div
                          key={entry.id}
                          className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-2 text-xs text-[color:var(--text)]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{entry.contentItem?.title || "Extra"}</span>
                            <span className="text-[color:var(--muted)]">{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
                            <span>{session === "DAY" ? "Día" : session === "NIGHT" ? "Noche" : "Cualquiera"}</span>
                            <span>·</span>
                            <span>{`Tier ${tier}`}</span>
                            <span>·</span>
                            <span>{`${entry.amount} €`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="pt-2 border-t border-[color:var(--surface-border)] text-[11px] text-[color:var(--muted)]">
                  <div className="flex items-center justify-between">
                    <span>Ventas manuales</span>
                    <button
                      type="button"
                      className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      onClick={() => setShowManualExtraForm((prev) => !prev)}
                    >
                      {showManualExtraForm ? "Cerrar" : "Añadir venta manual"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-[color:var(--muted)]">
                    Uso avanzado: registra ventas que no pasaron por el flujo de Manager IA.
                  </p>
                  {showManualExtraForm && (
                    <div className="mt-2 space-y-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                      <div className="flex flex-col md:flex-row gap-2">
                        <select
                          className="flex-1 rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-xs text-[color:var(--text)]"
                          value={selectedExtraId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedExtraId(val);
                            const item = contentItems.find((c) => c.id === val);
                            const tier = getExtraTier(item);
                            const suggested = EXTRA_PRICES[tier] ?? EXTRA_PRICES.T1;
                            setExtraAmount(suggested);
                          }}
                        >
                          <option value="">Selecciona un extra</option>
                          {contentItems
                            .filter((item) => {
                              const isExtraItem = item.isExtra === true || item.visibility === "EXTRA";
                              const matchesTimeOfDay =
                                !item.timeOfDay || item.timeOfDay === "ANY" || item.timeOfDay === timeOfDay;
                              return isExtraItem && matchesTimeOfDay;
                            })
                            .map((item) => {
                              const tier = getExtraTier(item);
                              const suggested = EXTRA_PRICES[tier] ?? 0;
                              return (
                                <option key={item.id} value={item.id}>
                                  {`${item.title} · ${tier} · ${suggested} €`}
                                </option>
                              );
                            })}
                        </select>
                        <input
                          type="number"
                          className="w-32 rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-xs text-[color:var(--text)]"
                          value={extraAmount}
                          onChange={(e) => setExtraAmount(e.target.value === "" ? "" : Number(e.target.value))}
                          placeholder="Importe"
                        />
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] disabled:opacity-60"
                          disabled={isRegisteringExtra}
                          onClick={async () => {
                            if (registerExtraRef.current || isRegisteringExtra) return;
                            if (!id || !selectedExtraId) {
                              setExtraError("Selecciona fan y extra.");
                              return;
                            }
                            const item = contentItems.find((c) => c.id === selectedExtraId);
                            const tier = getExtraTier(item);
                            if (!item || !tier) {
                              setExtraError("El extra seleccionado no tiene tier asignado.");
                              return;
                            }
                            if (extraAmount === "" || typeof extraAmount !== "number" || Number.isNaN(extraAmount)) {
                              setExtraError("Introduce un importe válido.");
                              return;
                            }
                            const sessionTag = `${timeOfDay}_${new Date().toISOString().slice(0, 10)}`;
                            setExtraError("");
                            const amountNumber = Number(extraAmount);
                            const txnId = registerExtraTxnRef.current ?? generateClientTxnId();
                            registerExtraTxnRef.current = txnId;
                            setIsRegisteringExtra(true);
                            registerExtraRef.current = true;
                            try {
                              const result = await registerExtraSale({
                                fanId: id,
                                extraId: item.id,
                                amount: amountNumber,
                                tier,
                                sessionTag,
                                source: "manual_panel",
                                clientTxnId: txnId,
                                title: item.title,
                              });
                              if (!result.ok) {
                                setExtraError(result.error || "No se pudo registrar el extra.");
                                return;
                              }
                              setSelectedExtraId("");
                              setExtraAmount("");
                              setShowManualExtraForm(false);
                            } finally {
                              setIsRegisteringExtra(false);
                              registerExtraRef.current = false;
                              registerExtraTxnRef.current = null;
                            }
                          }}
                        >
                          {isRegisteringExtra ? "Procesando..." : "Registrar extra"}
                        </button>
                      </div>
                      {extraError && <div className="text-[11px] text-[color:var(--danger)]">{extraError}</div>}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[color:var(--text)]">Historial de extras</h4>
                  {isLoadingExtraHistory && <span className="text-[11px] text-[color:var(--muted)]">Cargando...</span>}
                </div>
                <div className="text-[11px] text-[color:var(--muted)]">
                  {(conversation.extrasCount ?? 0) > 0 ? (
                    <span>
                      {`Este fan te ha comprado ${conversation.extrasCount} extra${(conversation.extrasCount ?? 0) !== 1 ? "s" : ""} por un total de ${Math.round(conversation.extrasSpentTotal ?? 0)} €.`}
                    </span>
                  ) : (
                    <span>Todavía no has vendido extras a este fan.</span>
                  )}
                </div>
                {extraHistoryError && <div className="text-xs text-[color:var(--danger)]">{extraHistoryError}</div>}
                {!extraHistoryError && extraHistory.length === 0 && (
                  <div className="text-xs text-[color:var(--muted)]">Todavía no hay extras registrados para este fan.</div>
                )}
                {!extraHistoryError && extraHistory.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {extraHistory.map((entry) => {
                      const dateStr = new Date(entry.createdAt).toLocaleDateString("es-ES");
                      const session =
                        entry.sessionTag && entry.sessionTag.includes("_")
                          ? entry.sessionTag.split("_")[0]
                          : entry.contentItem?.timeOfDay ?? "ANY";
                      const tier = entry.tier;
                      return (
                        <div
                          key={entry.id}
                          className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-2 text-xs text-[color:var(--text)]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{entry.contentItem?.title || "Extra"}</span>
                            <span className="text-[color:var(--muted)]">{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
                            <span>{session === "DAY" ? "Día" : session === "NIGHT" ? "Noche" : "Cualquiera"}</span>
                            <span>·</span>
                            <span>{`Tier ${tier}`}</span>
                            <span>·</span>
                            <span>{`${entry.amount} €`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
          <div className="sticky bottom-0 z-30 border-t border-[color:var(--border)] bg-[color:var(--surface-1)] backdrop-blur-xl">
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-2.5">
              {actionToast && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:rgba(var(--brand-rgb),0.5)] bg-[color:rgba(var(--brand-rgb),0.08)] px-3 py-2 text-[11px] text-[color:var(--text)]">
                  <span>{actionToast.message}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActionToast(null);
                      router.push(actionToast.actionHref);
                    }}
                    className="rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
                  >
                    {actionToast.actionLabel}
                  </button>
                </div>
              )}
              {internalToast && <div className="mb-2 text-[11px] text-[color:var(--brand)]">{internalToast}</div>}
              {composerError && <div className="mb-2 text-[11px] text-[color:var(--danger)]">{composerError}</div>}
              {(isVoiceRecording || isVoiceUploading) && (
                <div className="mb-2 rounded-xl border border-[color:rgba(34,197,94,0.4)] bg-[color:rgba(34,197,94,0.08)] px-3 py-2 text-[11px] text-[color:var(--text)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <span>🎤</span>
                      <span>{isVoiceUploading ? "Subiendo nota de voz..." : `Grabando ${voiceRecordingLabel}`}</span>
                    </div>
                    {isVoiceRecording && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          className="rounded-full border border-[color:rgba(34,197,94,0.6)] bg-[color:rgba(34,197,94,0.16)] px-3 py-1 text-[10px] font-semibold hover:bg-[color:rgba(34,197,94,0.24)]"
                        >
                          Stop
                        </button>
                        <button
                          type="button"
                          onClick={cancelVoiceRecording}
                          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[10px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {voiceUploadError && (
                <div className="mb-2 rounded-xl border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.1)] px-3 py-2 text-[11px] text-[color:var(--text)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{voiceUploadError}</span>
                    {voiceRetryPayload ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={retryVoiceUpload}
                          className="rounded-full border border-[color:rgba(244,63,94,0.5)] bg-[color:rgba(244,63,94,0.12)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.2)]"
                        >
                          Reintentar
                        </button>
                        <button
                          type="button"
                          onClick={clearVoiceRetry}
                          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[10px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                        >
                          Descartar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              {composerDock?.chips}
              {showCortexFlowBanner && (
                <div className="mb-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-[11px] text-[color:var(--text)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Cortex</div>
                      <div className="text-[11px] text-[color:var(--text)] truncate">
                        Cortex · {cortexFlowLabel} · Siguiente: {cortexFlowNext.nextFanName ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCortexFlowOpenNext}
                        disabled={!cortexFlowNext.nextFanId}
                        className="rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] transition hover:bg-[color:rgba(var(--brand-rgb),0.2)] disabled:opacity-50"
                      >
                        Abrir siguiente
                      </button>
                      <button
                        type="button"
                        onClick={handleCortexFlowReturn}
                        className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] transition hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-2)]"
                      >
                        Volver a Cortex
                      </button>
                    </div>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[10px] text-[color:var(--muted)]">
                    <input
                      type="checkbox"
                      checked={cortexFlowAutoNext}
                      onChange={handleCortexFlowToggleAutoNext}
                      className="h-3 w-3 rounded border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--ring)]"
                    />
                    <span>Auto-siguiente tras enviar</span>
                  </label>
                </div>
              )}
              <ChatComposerBar
                value={messageSend}
                onChange={(evt) => {
                  dismissPurchaseNotice();
                  setMessageSend(evt.target.value);
                  if (composerError) setComposerError(null);
                  autoGrowTextarea(evt.currentTarget, MAX_MAIN_COMPOSER_HEIGHT);
                }}
                onKeyDown={(evt) => changeHandler(evt)}
                onSend={handleSendMessage}
                sendDisabled={sendDisabled}
                placeholder={mainComposerPlaceholder}
                actionLabel={composerActionLabel}
                sendingLabel={composerSendingLabel}
                isSending={isComposerSubmitting}
                actionMinWidth={140}
                audience={composerAudience}
                onAudienceChange={() => {}}
                mode={composerTarget}
                onModeChange={(mode) => {
                  setComposerTarget(mode);
                  if (composerError) setComposerError(null);
                }}
                modeDisabled={isComposerSubmitting || isInternalPanelOpen}
                modeHelpText={composerHelpText}
                canAttach={canAttachContent}
                onAttach={() => {
                  if (!canAttachContent) return;
                  openAttachContent({ closeInline: false });
                }}
                showVoice={isFanTarget}
                onVoiceStart={startVoiceRecording}
                voiceDisabled={
                  !isFanTarget ||
                  isChatBlocked ||
                  isInternalPanelOpen ||
                  isVoiceRecording ||
                  isVoiceUploading
                }
                isVoiceRecording={isVoiceRecording}
                showEmoji={isFanTarget}
                onEmojiSelect={handleInsertEmoji}
                showStickers={isFanTarget}
                onStickerSelect={handleInsertSticker}
                extraActions={ppvTierMenu}
                inputRef={messageInputRef}
                maxHeight={MAX_MAIN_COMPOSER_HEIGHT}
                isChatBlocked={isChatBlocked}
                isInternalPanelOpen={isInternalPanelOpen}
                showAudienceToggle
              />
            </div>
          </div>
        </div>
        {composerDock?.isDockOverlay && composerDock.panel}
        </div>
        </div>
      </div>
      {messageTranslationPopover && chatOverlayRef.current
        ? createPortal(
            <div
              className="absolute inset-0 pointer-events-none"
              onContextMenu={(event) => event.preventDefault()}
            >
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: messageTranslationPopover.x,
                  top: messageTranslationPopover.y,
                  maxWidth: messageTranslationPopover.maxWidth,
                }}
                onPointerDown={handleToolbarPointerDown}
              >
                <div className="w-full max-w-sm rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-xl">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                    <span>Traduccion</span>
                    <button
                      type="button"
                      onClick={() => setMessageTranslationPopover(null)}
                      className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[9px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-[color:var(--danger)] whitespace-pre-wrap">
                      {messageTranslationPopover.error}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleTranslateMessage(messageTranslationPopover.messageId);
                        setMessageTranslationPopover(null);
                      }}
                      className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            chatOverlayRef.current
          )
        : null}
      {messageActionSheet && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-[color:var(--surface-overlay)]" onClick={closeMessageActionSheet} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pb-6 pt-4">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80" />
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleMessageCopy(messageActionSheet.text);
                  closeMessageActionSheet();
                }}
                className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                <span>Copiar</span>
              </button>
              {messageActionSheet.canTranslate && messageActionSheet.messageId && (
                <button
                  type="button"
                  onClick={() => {
                    handleTranslateMessage(messageActionSheet.messageId as string);
                    closeMessageActionSheet();
                  }}
                  disabled={messageSheetTranslateDisabled}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                >
                  <span>{messageSheetTranslateLabel}</span>
                </button>
              )}
              {messageActionSheet.canSuggestReply && messageActionSheet.messageId && (
                <button
                  type="button"
                  onClick={() => {
                    handleSuggestReply(
                      messageActionSheet.messageId as string,
                      messageActionSheet.suggestTargetLang ?? translateTargetLang
                    );
                    closeMessageActionSheet();
                  }}
                  disabled={messageSheetSuggestDisabled}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                >
                  <span>{messageSheetSuggestLabel}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!canUseManagerActions) return;
                  handleMessageQuote(messageActionSheet.text);
                  closeMessageActionSheet();
                }}
                disabled={!canUseManagerActions}
                title={!canUseManagerActions ? "Necesitas un fan activo para usar el Manager." : undefined}
                className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>Citar al Manager</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canUseManagerActions) return;
                  handleMessageRephrase(messageActionSheet.text);
                  closeMessageActionSheet();
                }}
                disabled={!canUseManagerActions}
                title={!canUseManagerActions ? "Necesitas un fan activo para usar el Manager." : undefined}
                className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>Reformular</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleMessageSaveProfile(messageActionSheet.text);
                  closeMessageActionSheet();
                }}
                className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                <span>Guardar en perfil</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleMessageCreateFollowUp(messageActionSheet.text);
                  closeMessageActionSheet();
                }}
                className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                <span>Crear seguimiento</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingInsert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-overlay)] px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 shadow-2xl">
            <div className="text-sm font-semibold text-[color:var(--text)]">Ya tienes un mensaje escrito</div>
            <div className="mt-1 text-[11px] text-[color:var(--muted)]">
              ¿Cómo quieres insertar esta sugerencia?
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  applyComposerInsert(pendingInsert.text, "append", pendingInsert.detail);
                  setPendingInsert(null);
                }}
                className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-2 text-[12px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
              >
                Añadir abajo
              </button>
              <button
                type="button"
                onClick={() => {
                  applyComposerInsert(pendingInsert.text, "prepend", pendingInsert.detail);
                  setPendingInsert(null);
                }}
                className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-[12px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Añadir arriba
              </button>
              <button
                type="button"
                onClick={() => {
                  applyComposerInsert(pendingInsert.text, "replace", pendingInsert.detail);
                  setPendingInsert(null);
                }}
                className="inline-flex w-full items-center justify-center rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-4 py-2 text-[12px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
              >
                Reemplazar
              </button>
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="mt-1 inline-flex w-full items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-transparent px-4 py-2 text-[12px] font-semibold text-[color:var(--muted)] hover:bg-[color:var(--surface-2)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {showContentModal && (
        <div className="fixed inset-0 bg-[color:var(--surface-overlay)] flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-[color:var(--surface-1)] p-6 border border-[color:var(--surface-border)] shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--text)]">Adjuntar contenido</h3>
                <p className="text-sm text-[color:var(--muted)]">
                  {contentModalMode === "catalog"
                    ? "Elige un item del catalogo para insertar en el mensaje."
                    : "Elige que quieres enviar a este fan segun sus packs."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-1">
                  {(["packs", "extras", "catalog"] as const).map((mode) => {
                    const isActive = contentModalMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={clsx(
                          "px-3 py-1 text-[11px] font-semibold rounded-full transition",
                          isActive
                            ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)] border border-[color:var(--brand)]"
                            : "text-[color:var(--text)]"
                        )}
                        onClick={() => setContentModalMode(mode)}
                      >
                        {mode === "packs" ? "Packs" : mode === "extras" ? "Extras PPV" : "Catalogo"}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                onClick={() => {
                  setShowContentModal(false);
                  setContentModalPackFocus(null);
                  setRegisterExtrasChecked(false);
                  setRegisterExtrasSource(null);
                  setRegisterExtrasChecked(false);
                  setRegisterExtrasSource(null);
                  setTransactionPrices({});
                }}
                className="text-[color:var(--muted)] hover:text-[color:var(--text)]"
              >
                ✕
              </button>
              </div>
            </div>
            {contentModalMode === "extras" && (
              <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-[color:var(--muted)]">
                <div className="flex items-center gap-1">
                  <span>Momento</span>
                  <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
                    {(["day", "night"] as TimeOfDayFilter[]).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTimeOfDayFilter(val)}
                        className={clsx(
                          "px-2 py-1 rounded-full",
                          timeOfDayFilter === val
                            ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)] border border-[color:var(--brand)]"
                            : "text-[color:var(--text)]"
                        )}
                      >
                        {val === "day" ? "Día" : "Noche"}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTimeOfDayFilter("all")}
                      className={clsx(
                        "px-2 py-1 rounded-full",
                        timeOfDayFilter === "all"
                          ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)] border border-[color:var(--brand)]"
                          : "text-[color:var(--text)]"
                      )}
                    >
                      Todos
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-1">
                  <span>Tier</span>
                  <select
                    className="rounded-md bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-2 py-1 text-xs text-[color:var(--text)]"
                    value={extraTierFilter ?? ""}
                    onChange={(e) =>
                      setExtraTierFilter(e.target.value === "" ? null : (e.target.value as any))
                    }
                  >
                    <option value="">Todos</option>
                    <option value="T0">T0</option>
                    <option value="T1">T1</option>
                    <option value="T2">T2</option>
                    <option value="T3">T3</option>
                    <option value="T4">T4</option>
                  </select>
                </label>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {contentError && contentModalMode !== "catalog" && (
                <div className="text-sm text-[color:var(--danger)]">No se ha podido cargar la informacion de packs.</div>
              )}
              {!contentError && contentModalMode === "packs" && CONTENT_PACKS.map((packMeta) => {
                  const isUnlocked =
                    packMeta.code === "WELCOME"
                      ? hasWelcome
                      : packMeta.code === "MONTHLY"
                      ? hasMonthly || hasSpecial
                      : hasSpecial;
                  const badgeText = isUnlocked
                    ? "Incluido en su pack"
                    : packMeta.code === "SPECIAL" && !hasMonthly
                    ? "Pack superior (requiere suscripción mensual)"
                    : "Pack superior (no incluido)";
                  const badgeClass = isUnlocked
                    ? "border-[color:var(--brand)] text-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.1)]"
                    : "border-[color:var(--surface-border)] text-[color:var(--muted)]";
                  const packItems = contentItems.filter((item) => item.pack === packMeta.code);
                  return (
                    <div
                      key={packMeta.code}
                      className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3"
                      ref={contentModalPackFocus === packMeta.code ? (el) => {
                        if (el && showContentModal && contentModalMode === "packs") {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      } : undefined}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-[color:var(--text)]">{packMeta.label}</div>
                        <div className="flex items-center gap-2">
                          <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border", badgeClass)}>
                            {badgeText}
                          </span>
                          {!isUnlocked && packMeta.code === "MONTHLY" && canOfferMonthly && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-[color:var(--warning)] underline-offset-2 hover:underline"
                              onClick={() => handleOfferPack("monthly")}
                            >
                              Ofrecer suscripción mensual
                            </button>
                          )}
                          {!isUnlocked && packMeta.code === "SPECIAL" && canOfferSpecial && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-[color:var(--warning)] underline-offset-2 hover:underline"
                              onClick={() => handleOfferPack("special")}
                            >
                              Ofrecer Pack especial
                            </button>
                          )}
                        </div>
                      </div>
                      {contentLoading && packItems.length === 0 && (
                        <div className="text-xs text-[color:var(--muted)] mt-2">Cargando contenidos…</div>
                      )}
                      <div className="mt-2 flex flex-col gap-2">
                        {packItems.map((item) => {
                          const locked = !isUnlocked;
                          const selected = selectedContentIds.includes(item.id);
                          const typeIcon = getContentIconName(item.type);
                          return (
                            <label
                              key={item.id}
                              className={clsx(
                                "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                                locked
                                  ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] ui-muted cursor-not-allowed opacity-60"
                                  : selected
                                  ? "border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)]"
                                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:border-[color:rgba(245,158,11,0.6)]"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {locked ? (
                                  <IconGlyph name="lock" className="h-4 w-4" />
                                ) : (
                                  <IconGlyph name={typeIcon} className="h-4 w-4" />
                                )}
                                <span>{item.title}</span>
                                {item.hasBeenSentToFan && (
                                  <span className="text-[10px] text-[color:var(--brand)] border border-[color:rgba(var(--brand-rgb),0.5)] rounded-full px-2 py-[1px]">
                                    Enviado
                                  </span>
                                )}
                              </div>
                              {!locked && (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {
                                    setSelectedContentIds((prev) =>
                                      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                                    );
                                  }}
                                  className="h-4 w-4 accent-[color:var(--warning)]"
                                />
                              )}
                            </label>
                          );
                        })}
                        {!contentLoading && packItems.length === 0 && (
                          <div className="text-xs ui-muted">No hay contenidos en este pack.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              {!contentError && contentModalMode === "extras" && (
                <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
                  <div className="text-sm font-semibold text-[color:var(--text)]">Extras PPV</div>
                  <div className="mt-2 flex flex-col gap-2">
                    {contentItems
                      .filter((item) => {
                        const isExtraItem = item.isExtra === true || item.visibility === "EXTRA";
                        if (!isExtraItem) return false;
                        const matchesTier =
                          !extraTierFilter || item.extraTier === extraTierFilter || item.extraTier === null;
                        const matchesTime =
                          timeOfDayFilter === "all" ||
                          item.timeOfDay === "ANY" ||
                          (timeOfDayFilter === "day" && item.timeOfDay === "DAY") ||
                          (timeOfDayFilter === "night" && item.timeOfDay === "NIGHT");
                        return matchesTier && matchesTime;
                      })
                      .map((item) => {
                        const selected = selectedContentIds.includes(item.id);
                        const typeIcon = getContentIconName(item.type);
                        return (
                          <label
                            key={item.id}
                            className={clsx(
                              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                              selected
                                ? "border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)]"
                                : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:border-[color:rgba(245,158,11,0.6)]"
                            )}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <IconGlyph name={typeIcon} className="h-4 w-4" />
                                <span>{item.title}</span>
                                {item.hasBeenSentToFan && (
                                  <span className="text-[10px] text-[color:var(--brand)] border border-[color:rgba(var(--brand-rgb),0.5)] rounded-full px-2 py-[1px]">
                                    Enviado
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[color:var(--muted)] flex items-center gap-2">
                                <span>{item.extraTier ?? "T?"}</span>
                                <span>·</span>
                                <span>
                                  {item.timeOfDay === "DAY" ? "Día" : item.timeOfDay === "NIGHT" ? "Noche" : "Cualquier momento"}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {
                                  setSelectedContentIds((prev) =>
                                    prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                                  );
                                  if (!selected && transactionPrices[item.id] === undefined) {
                                    const defaultPrice = getExtraPrice(item);
                                    setTransactionPrices((prev) => ({ ...prev, [item.id]: defaultPrice }));
                                  }
                                }}
                                className="h-4 w-4 accent-[color:var(--warning)]"
                              />
                              {selected && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-[color:var(--text)]">
                                  <span>Precio:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={transactionPrices[item.id] ?? getExtraPrice(item)}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      if (Number.isNaN(val) || val < 0) {
                                        setTransactionPrices((prev) => {
                                          const next = { ...prev };
                                          delete next[item.id];
                                          return next;
                                        });
                                      } else {
                                        setTransactionPrices((prev) => ({ ...prev, [item.id]: val }));
                                      }
                                    }}
                                    className="w-20 rounded bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-2 py-1 text-right text-xs text-[color:var(--text)]"
                                  />
                                  <span>€</span>
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    {!contentLoading &&
                      contentItems.filter((item) => item.isExtra === true || item.visibility === "EXTRA").length === 0 && (
                        <div className="text-xs ui-muted">No hay extras PPV todavía.</div>
                      )}
                  </div>
                </div>
              )}
              {contentModalMode === "catalog" && (
                <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="Buscar..."
                      className="w-full sm:max-w-[240px] rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] placeholder:ui-muted"
                    />
                    <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-1 text-[10px] font-semibold">
                      {([
                        { id: "all", label: "Todos" },
                        { id: "EXTRA", label: "Extras" },
                        { id: "BUNDLE", label: "Bundles" },
                        { id: "PACK", label: "Packs" },
                      ] as const).map((entry) => {
                        const isActive = catalogTypeFilter === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setCatalogTypeFilter(entry.id)}
                            className={clsx(
                              "px-3 py-1 rounded-full transition",
                              isActive
                                ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)] border border-[color:var(--brand)]"
                                : "text-[color:var(--text)]"
                            )}
                          >
                            {entry.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {catalogLoading && <div className="text-xs text-[color:var(--muted)]">Cargando catalogo...</div>}
                  {catalogError && <div className="text-xs text-[color:var(--danger)]">{catalogError}</div>}
                  {!catalogLoading && !catalogError && filteredCatalogItems.length === 0 && (
                    <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-3 text-xs text-[color:var(--muted)] space-y-2">
                      <div>No tienes catalogo aun. Ve a Cortex → Catalogo para crear items.</div>
                      <button
                        type="button"
                        onClick={() => {
                          void router.push("/creator/manager");
                        }}
                        className="inline-flex items-center justify-center rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
                      >
                        Abrir Cortex
                      </button>
                    </div>
                  )}
                  {!catalogLoading && !catalogError && filteredCatalogItems.length > 0 && (
                    <div className="space-y-2">
                      {filteredCatalogItems.map((item) => {
                        const includesPreview = buildCatalogIncludesPreview(item);
                        return (
                          <div
                            key={item.id}
                            className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-sm text-[color:var(--text)]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                                    {item.type}
                                  </span>
                                  <span
                                    className={clsx(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                      item.isActive
                                        ? "border-[color:rgba(var(--brand-rgb),0.5)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                                        : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                                    )}
                                  >
                                    {item.isActive ? "Activo" : "Inactivo"}
                                  </span>
                                  <span
                                    className={clsx(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                      item.isPublic
                                        ? "border-[color:rgba(var(--brand-rgb),0.5)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                                        : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                                    )}
                                  >
                                    {item.isPublic ? "Publico" : "Oculto"}
                                  </span>
                                </div>
                                <div className="mt-1 text-[13px] font-semibold text-[color:var(--text)] truncate">{item.title}</div>
                                {item.description && (
                                  <div className="text-[11px] text-[color:var(--muted)] truncate">{item.description}</div>
                                )}
                                {includesPreview && (
                                  <div className="text-[11px] ui-muted truncate">{includesPreview}</div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className="text-[12px] font-semibold text-[color:var(--text)]">
                                  {formatCatalogPriceCents(item.priceCents, item.currency)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCatalogInsert(item)}
                                  className="inline-flex items-center justify-center rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
                                >
                                  Insertar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {contentModalMode === "extras" && selectedContentIds.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2">
                <label className="flex items-center gap-2 text-xs text-[color:var(--text)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[color:var(--warning)]"
                    checked={registerExtrasChecked}
                    onChange={(e) => setRegisterExtrasChecked(e.target.checked)}
                  />
                  <span>Registrar esta venta en &quot;Ventas extra&quot;</span>
                </label>
                <span className="text-[11px] text-[color:var(--muted)]">Total: {Math.round(selectedExtrasTotal)} €</span>
              </div>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                onClick={() => {
                  setShowContentModal(false);
                  setSelectedContentIds([]);
                  setContentModalPackFocus(null);
                  setRegisterExtrasChecked(false);
                  setRegisterExtrasSource(null);
                  setTransactionPrices({});
                }}
              >
                {contentModalMode === "catalog" ? "Cerrar" : "Cancelar"}
              </button>
              {contentModalMode !== "catalog" && (
                <button
                  type="button"
                  disabled={selectedContentIds.length === 0 || !!contentError || isContentSending}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selectedContentIds.length === 0 || !!contentError || isContentSending
                      ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] ui-muted cursor-not-allowed"
                      : "border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                  )}
                  onClick={async () => {
                    if (contentSendingRef.current || isContentSending) return;
                    if (selectedContentIds.length === 0) return;
                    const chosen = contentItems.filter((item) => selectedContentIds.includes(item.id));
                    if (chosen.length === 0) return;
                    contentSendingRef.current = true;
                    setIsContentSending(true);
                    setContentError("");
                    try {
                      // Enviamos cada contenido como mensaje CONTENT para mantener consistencia con /api/messages.
                      const sentItems: ContentWithFlags[] = [];
                      for (const item of chosen) {
                        // eslint-disable-next-line no-await-in-loop
                        const ok = await handleAttachContent(item, { keepOpen: true });
                        if (ok) {
                          sentItems.push(item);
                        }
                      }
                      if (contentModalMode === "extras" && registerExtrasChecked && sentItems.length > 0 && id) {
                        const sessionTag = `${timeOfDay}_${new Date().toISOString().slice(0, 10)}`;
                        const failed: string[] = [];
                        for (const item of sentItems) {
                          const tier = getExtraTier(item);
                          const amount = getTransactionPriceFor(item);
                          // eslint-disable-next-line no-await-in-loop
                          const result = await registerExtraSale({
                            fanId: id,
                            extraId: item.id,
                            amount,
                            tier,
                            sessionTag,
                            source: registerExtrasSource ?? "offer_flow",
                            clientTxnId: generateClientTxnId(),
                            title: item.title,
                          });
                          if (!result.ok) {
                            failed.push(item.title || "Extra");
                          }
                        }
                        if (failed.length > 0) {
                          setContentError(
                            "Contenido enviado, pero no se pudo registrar una o más ventas. Reinténtalo desde Ventas extra."
                          );
                        }
                      }
                      if (sentItems.length > 0 && id) {
                        const previewLabel =
                          sentItems.length === 1
                            ? sentItems[0]?.title || "Contenido compartido"
                            : `Contenido compartido (${sentItems.length})`;
                        startFanSendCooldown(id);
                        const contentEventId = lastContentMessageIdRef.current;
                        lastContentMessageIdRef.current = null;
                        emitFanMessageSent({
                          fanId: id,
                          text: previewLabel,
                          kind: "content",
                          sentAt: new Date().toISOString(),
                          from: "creator",
                          eventId: contentEventId ?? undefined,
                        });
                        emitCreatorDataChanged({ reason: "fan_message_sent", fanId: id });
                      }
                      setShowContentModal(false);
                      setSelectedContentIds([]);
                      setContentModalPackFocus(null);
                      setRegisterExtrasChecked(false);
                      setRegisterExtrasSource(null);
                      setTransactionPrices({});
                    } catch (_err) {
                      setContentError("No se pudo enviar el contenido. Inténtalo de nuevo.");
                    } finally {
                      contentSendingRef.current = false;
                      setIsContentSending(false);
                    }
                  }}
                >
                  {isContentSending
                    ? "Procesando..."
                    : selectedContentIds.length <= 1
                    ? "Enviar 1 elemento"
                    : `Enviar ${selectedContentIds.length} elementos`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {objectiveManagerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--surface-overlay)] px-4">
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[color:var(--text)]">Gestionar objetivos</h3>
              <button
                type="button"
                onClick={() => {
                  setObjectiveManagerOpen(false);
                  setObjectiveDeleteError(null);
                }}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-[color:var(--surface-2)] text-[color:var(--text)]"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>
            <p className="text-[11px] text-[color:var(--muted)]">
              Elimina objetivos duplicados o antiguos. No afecta a los objetivos predefinidos.
            </p>
            {objectiveOptions.length === 0 ? (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 text-[11px] text-[color:var(--muted)]">
                No hay objetivos personalizados.
              </div>
            ) : (
              <div className="max-h-60 space-y-2 overflow-auto pr-1">
                {objectiveOptions.map((objective) => {
                  const normalizedCode = normalizeObjectiveCode(objective.code) ?? objective.code;
                  const label =
                    resolveObjectiveLabel({
                      code: normalizedCode,
                      locale: objectiveLocale,
                      labelsByCode: objectiveLabelsByCode,
                    }) ?? normalizedCode;
                  return (
                    <div
                      key={objective.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[color:var(--text)] truncate">{label}</div>
                        <div className="text-[10px] text-[color:var(--muted)] truncate">{objective.id}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteObjective(objective)}
                        disabled={objectiveDeleteId === objective.id}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold transition",
                          objectiveDeleteId === objective.id
                            ? "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] cursor-not-allowed"
                            : "border-[color:rgba(244,63,94,0.6)] bg-[color:rgba(244,63,94,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.16)]"
                        )}
                      >
                        {objectiveDeleteId === objective.id ? "Eliminando…" : "Eliminar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {objectiveDeleteError && (
              <div className="text-[10px] text-[color:var(--danger)]">{objectiveDeleteError}</div>
            )}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setObjectiveManagerOpen(false);
                  setObjectiveDeleteError(null);
                }}
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {duplicateConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--surface-overlay)] px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[color:var(--text)]">Mensaje repetido recientemente</h3>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {duplicateConfirm.reason === "intent"
                ? "Vas a repetir la misma intención en menos de 6 horas."
                : duplicateConfirm.reason === "hash"
                ? "Vas a enviar el mismo texto otra vez."
                : "Este mensaje es muy parecido al último."}{" "}
              ¿Quieres reformularlo o enviarlo igual?
            </p>
            {duplicateConfirm.lastSentAt && (
              <div className="mt-2 text-xs text-[color:var(--muted)]">
                Último envío {formatDistanceToNow(new Date(duplicateConfirm.lastSentAt), { addSuffix: true, locale: es })}
              </div>
            )}
            {duplicateConfirm.lastSentPreview && (
              <div className="mt-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text)] line-clamp-3">
                {duplicateConfirm.lastSentPreview}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateConfirm(null)}
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDuplicateRephrase}
                className="rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
              >
                Reformular para variar
              </button>
              <button
                type="button"
                onClick={handleConfirmDuplicateSend}
                className="rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.2)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.3)]"
              >
                Enviar igual
              </button>
            </div>
          </div>
        </div>
      )}
      {showQuickSheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[color:var(--surface-overlay)] backdrop-blur-sm">
          <div className="w-full max-w-md ui-overlay rounded-t-3xl rounded-b-none p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[color:var(--muted)]">Ficha rápida</h2>
              <button
                type="button"
                onClick={() => setShowQuickSheet(false)}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-[color:var(--surface-2)] text-[color:var(--text)]"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Avatar width="w-10" height="h-10" image={image} />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-base font-semibold text-[color:var(--text)] truncate">{contactName}</div>
                  <button
                    type="button"
                    onClick={handleOpenEditName}
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-0.5 text-[11px] text-[color:var(--text)] hover:border-[color:var(--brand)]"
                  >
                    <IconGlyph name="edit" className="h-3.5 w-3.5" />
                    <span>Editar</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center rounded-full bg-[color:var(--surface-2)] text-[color:var(--warning)] px-2 py-[1px]">
                    {packLabel}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-[color:var(--surface-2)] text-[color:var(--text)] px-2 py-[1px]">
                    {formatTier(conversation.customerTier)}
                  </span>
                  {conversation.isHighPriority && (
                    <span className="inline-flex items-center rounded-full bg-[color:rgba(245,158,11,0.16)] text-[color:var(--warning)] px-2 py-[1px]">
                      <span className="inline-flex items-center gap-1">
                        <IconGlyph name="pin" className="h-3 w-3" />
                        <span>Alta prioridad</span>
                      </span>
                    </span>
                  )}
                  {extrasCountDisplay > 0 && (
                    <span className="inline-flex items-center rounded-full bg-[color:var(--brand-weak)] text-[color:var(--text)] px-2 py-[1px]">
                      Extras
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--muted)]">Total gastado</span>
                <span className="font-semibold text-[color:var(--text)]">{Math.round(lifetimeAmount)} €</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--muted)]">Extras</span>
                <span className="font-medium text-[color:var(--text)]">
                  {extrasCountDisplay} extra{extrasCountDisplay === 1 ? "" : "s"} · {extrasSpentDisplay} €
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--muted)]">Propinas</span>
                <span className="font-medium text-[color:var(--text)]">
                  {tipsCountDisplay === null || tipsSpentDisplay === null
                    ? "—"
                    : `${tipsCountDisplay} propina${tipsCountDisplay === 1 ? "" : "s"} · ${tipsSpentDisplay} €`}
                </span>
              </div>
              {showGiftsRow && (
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--muted)]">Regalos</span>
                  <span className="font-medium text-[color:var(--text)]">
                    {giftsCountDisplay === null
                      ? `${giftsSpentDisplay} €`
                      : `${giftsCountDisplay} regalo${giftsCountDisplay === 1 ? "" : "s"} · ${giftsSpentDisplay} €`}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[color:var(--muted)]">Idioma</span>
                <select
                  value={languageSelectValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "auto") return;
                    handlePreferredLanguageChange(value as SupportedLanguage);
                  }}
                  disabled={preferredLanguageSaving}
                  className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  <option value="auto" disabled>
                    Auto (EN por defecto)
                  </option>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang.toUpperCase()} · {LANGUAGE_LABELS[lang]}
                    </option>
                  ))}
                </select>
              </div>
              {preferredLanguageError && <p className="text-xs text-[color:var(--danger)]">{preferredLanguageError}</p>}
              <div className="flex flex-col gap-1 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2">
                <span className="text-[color:var(--muted)] text-xs">Seguimiento</span>
                <span className="text-[color:var(--text)] text-sm leading-snug" title={followUpLabel || ""}>
                  {followUpLabel || "Sin seguimiento definido"}
                </span>
                {isFollowUpNoteMissing && (
                  <button
                    type="button"
                    onClick={handleAddFollowUpNote}
                    className="self-start rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
                  >
                    Añadir nota
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleOpenNotesFromSheet}
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Perfil + seguimiento
              </button>
              <button
                type="button"
                onClick={handleOpenHistoryFromSheet}
                className="rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
              >
                Ver historial
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                disabled={inviteCopyState === "loading"}
                className={clsx(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  inviteCopyState === "loading"
                    ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                )}
              >
                {inviteCopyState === "copied"
                  ? "Enlace copiado"
                  : inviteCopyState === "loading"
                  ? "Generando enlace..."
                  : "Copiar enlace de invitación"}
              </button>
              {inviteCopyUrl && (
                <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-[11px] text-[color:var(--muted)] break-all">
                  {inviteCopyUrl}
                </div>
              )}
              {inviteCopyToast && <p className="text-xs text-[color:var(--brand)]">{inviteCopyToast}</p>}
              {inviteCopyError && <p className="text-xs text-[color:var(--danger)]">{inviteCopyError}</p>}
            </div>
          </div>
        </div>
      )}
      {isEditNameOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[color:var(--surface-overlay)] backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[color:var(--text)]">Editar nombre del fan</h2>
              <button
                type="button"
                onClick={closeEditNameModal}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-[color:var(--surface-2)] text-[color:var(--text)]"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>
            <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
              <span>Nombre o alias</span>
              <input
                className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                placeholder="Ej: Ana"
              />
            </label>
            {editNameError && <p className="text-xs text-[color:var(--danger)]">{editNameError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                onClick={closeEditNameModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={editNameSaving}
                className={clsx(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  editNameSaving
                    ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                    : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
                )}
                onClick={() => void handleSaveEditName()}
              >
                {editNameSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AudioMessageBubble({
  message,
  onCopyTranscript,
  onUseTranscript,
  onRetryTranscript,
  tone,
  onInsertText,
  onInsertManager,
  onTranscriptSaved,
  onAnalysisSaved,
  onTranslationSaved,
  onToast,
  translateEnabled,
  translateConfigured,
  onTranslateNotConfigured,
  translateTargetLang,
  fanId,
  onReact,
}: {
  message: ConversationMessage;
  onCopyTranscript?: (text: string) => void;
  onUseTranscript?: (text: string) => void;
  onRetryTranscript?: (messageId: string) => Promise<void> | void;
  tone?: FanTone;
  onInsertText?: (text: string) => void;
  onInsertManager?: (text: string) => void;
  onTranscriptSaved?: (text: string) => void;
  onAnalysisSaved?: (analysis: VoiceAnalysis) => void;
  onTranslationSaved?: (translation: VoiceTranslation) => void;
  onToast?: (message: string) => void;
  translateEnabled?: boolean;
  translateConfigured?: boolean;
  onTranslateNotConfigured?: () => void;
  translateTargetLang?: TranslationLanguage;
  fanId?: string;
  onReact?: (emoji: string) => void;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ isPlaying, setIsPlaying ] = useState(false);
  const [ currentTime, setCurrentTime ] = useState(0);
  const [ audioError, setAudioError ] = useState(false);
  const [ reloadToken, setReloadToken ] = useState(0);
  const { favorites } = useEmojiFavorites();
  const [ reactionRecents, setReactionRecents ] = useState<string[]>([]);
  const [ isReactionBarOpen, setIsReactionBarOpen ] = useState(false);
  const [ isReactionPickerOpen, setIsReactionPickerOpen ] = useState(false);
  const [ isHovered, setIsHovered ] = useState(false);
  const reactionBarRef = useRef<HTMLDivElement | null>(null);
  const reactionPickerAnchorRef = useRef<HTMLButtonElement | null>(null);
  const resolvedAudioSrc = resolveAudioUrl(message.audioUrl, router.basePath);
  const audioSrc =
    resolvedAudioSrc && reloadToken
      ? `${resolvedAudioSrc}${resolvedAudioSrc.includes("?") ? "&" : "?"}t=${reloadToken}`
      : resolvedAudioSrc;
  const totalSeconds = Math.max(0, Math.round((message.audioDurationMs ?? 0) / 1000));
  const totalLabel = formatAudioTime(totalSeconds);
  const currentLabel = formatAudioTime(Math.round(currentTime));
  const progress = totalSeconds > 0 ? Math.min(100, (currentTime / totalSeconds) * 100) : 0;
  const bubbleClass = message.me
    ? "bg-[color:var(--brand-weak)] text-[color:var(--text)] border border-[color:rgba(var(--brand-rgb),0.28)]"
    : "bg-[color:var(--surface-2)] text-[color:var(--text)] border border-[color:var(--border)]";
  const reactionAlign = message.me ? "right-0" : "left-0";
  const isSending = message.status === "sending";
  const transcriptText = typeof message.transcriptText === "string" ? message.transcriptText.trim() : "";
  const resolvedStatus = message.transcriptStatus ?? (transcriptText ? "DONE" : "OFF");
  const showIntentSection = resolvedStatus === "DONE" && Boolean(transcriptText);
  const isFromFan = !message.me;
  const intentData = message.intentJson && typeof message.intentJson === "object" ? (message.intentJson as any) : null;
  const intentLabel = typeof intentData?.intent === "string" ? intentData.intent.trim() : "";
  const intentTags = Array.isArray(intentData?.tags)
    ? intentData.tags
        .filter((tag: unknown) => typeof tag === "string" && tag.trim().length > 0)
        .map((tag: string) => tag.trim())
    : [];
  const needsReply = Boolean(intentData?.needsReply);
  const reactionsSummary = message.reactionsSummary ?? [];
  const actorReaction = getMineEmoji(reactionsSummary);
  const canShowReactions = Boolean(onReact && message.id && !isSending);
  const reactionChoices = useMemo(() => {
    const deduped = favorites.concat(reactionRecents.filter((emoji) => !favorites.includes(emoji)));
    return deduped.slice(0, 6);
  }, [favorites, reactionRecents]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    if (!canShowReactions) return;
    if (!isReactionBarOpen && !isReactionPickerOpen) return;
    setReactionRecents(readEmojiRecents());
  }, [canShowReactions, isReactionBarOpen, isReactionPickerOpen]);

  useEffect(() => {
    if (!canShowReactions) return;
    if (!isReactionBarOpen && !isReactionPickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const element = target as Element;
      if (reactionBarRef.current?.contains(target)) return;
      if (reactionPickerAnchorRef.current?.contains(target)) return;
      if (element.closest?.("[data-emoji-picker=\"true\"]")) return;
      setIsReactionBarOpen(false);
      setIsReactionPickerOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [canShowReactions, isReactionBarOpen, isReactionPickerOpen]);

  useEffect(() => {
    setAudioError(false);
  }, [resolvedAudioSrc]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !audioSrc || isSending || audioError) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (_err) {
      setIsPlaying(false);
    }
  };

  const handleSelectReaction = (emoji: string) => {
    if (!canShowReactions || !onReact) return;
    setReactionRecents((prev) => recordEmojiRecent(emoji, prev));
    onReact(emoji);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const handleClearReaction = () => {
    if (!canShowReactions || !onReact || !actorReaction) return;
    onReact(actorReaction);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const retryDownload = () => {
    setAudioError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setReloadToken(Date.now());
  };

  return (
    <div
      className={clsx(message.me ? "flex justify-end" : "flex justify-start")}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="max-w-[75%]">
        <p
          className={`mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)] ${message.me ? "text-right" : ""}`}
        >
          <span>{message.me ? "Tú" : "Fan"} • {message.time}</span>
        </p>
        <div className="relative">
          {canShowReactions && (
            <button
              type="button"
              onClick={() => {
                setIsReactionBarOpen((prev) => !prev);
                setIsReactionPickerOpen(false);
              }}
              className={clsx(
                "absolute -top-3 flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-0)] text-xs text-[color:var(--text)] shadow transition",
                reactionAlign,
                isHovered || isReactionBarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
              aria-label="Reaccionar"
            >
              <IconGlyph name="smile" className="h-3.5 w-3.5" />
            </button>
          )}
          {canShowReactions && isReactionBarOpen && (
            <div
              ref={reactionBarRef}
              className={clsx(
                "absolute z-20 -top-12 flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 shadow-xl",
                reactionAlign
              )}
            >
              {reactionChoices.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectReaction(emoji)}
                  className={clsx(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-sm",
                    actorReaction === emoji
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  )}
                >
                  {emoji}
                </button>
              ))}
              {actorReaction && (
                <button
                  type="button"
                  onClick={handleClearReaction}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  aria-label="Quitar reacción"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsReactionPickerOpen((prev) => !prev)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[12px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                aria-label="Más reacciones"
                ref={reactionPickerAnchorRef}
              >
                +
              </button>
            </div>
          )}
          {canShowReactions && (
            <EmojiPicker
              isOpen={isReactionPickerOpen}
              anchorRef={reactionPickerAnchorRef}
              onClose={() => setIsReactionPickerOpen(false)}
              onSelect={handleSelectReaction}
              mode="reaction"
            />
          )}
          <div className={clsx("rounded-2xl px-4 py-3", bubbleClass)}>
            <div className="flex items-center gap-3">
              <button
              type="button"
              onClick={togglePlayback}
              disabled={isSending || !audioSrc || audioError}
              className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition",
                isSending || !audioSrc || audioError
                  ? "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                  : "border-[color:var(--border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:border-[color:var(--border-a)]"
              )}
              aria-label={isPlaying ? "Pausar" : "Reproducir"}
            >
              {isPlaying ? "II" : "▶"}
            </button>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 w-full rounded-full bg-[color:var(--surface-1)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[color:var(--brand)] transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[color:var(--muted)]">
                <span>{isSending ? "Subiendo..." : currentLabel}</span>
                <span>{totalLabel}</span>
              </div>
            </div>
          </div>
          {audioSrc ? (
            <audio
              ref={audioRef}
              src={audioSrc}
              preload="metadata"
              controls
              className="sr-only"
              onError={() => {
                setAudioError(true);
                setIsPlaying(false);
              }}
            />
          ) : (
            <div className="mt-2 text-[11px] text-[color:var(--muted)]">Audio no disponible.</div>
          )}
          {audioError && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[color:var(--danger)]">
              <span>No se pudo reproducir el audio.</span>
              <button
                type="button"
                className="rounded-full border border-[color:rgba(244,63,94,0.7)] px-2 py-0.5 text-[10px] font-semibold hover:bg-[color:rgba(244,63,94,0.12)]"
                onClick={retryDownload}
              >
                Reintentar descarga
              </button>
            </div>
          )}
          {showIntentSection && (intentLabel || intentTags.length > 0 || needsReply) && (
            <div className="mt-3 border-t border-[color:var(--surface-border)] pt-2 text-[10px] text-[color:var(--muted)]">
              <div className="flex flex-wrap gap-2">
                {intentLabel && (
                  <span className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5">
                    Intento: {intentLabel}
                  </span>
                )}
                {needsReply && (
                  <span className="rounded-full border border-[color:rgba(234,88,12,0.6)] px-2 py-0.5 text-[color:var(--text)]">
                    Necesita respuesta
                  </span>
                )}
                {intentTags.map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          {message.type === "VOICE" && message.id && isFromFan && (
            <VoiceInsightsCard
              messageId={message.id}
              fanId={fanId || message.fanId || ""}
              transcriptText={transcriptText || null}
              transcriptStatus={message.transcriptStatus ?? null}
              transcriptError={message.transcriptError ?? null}
              isFromFan={isFromFan}
              tone={tone}
              initialAnalysis={safeParseVoiceAnalysis(message.voiceAnalysisJson)}
              initialTranslation={message.voiceTranslation ?? null}
              onInsertText={onInsertText}
              onInsertManager={onInsertManager}
              onCopyTranscript={onCopyTranscript}
              onUseTranscript={onUseTranscript}
              onTranscriptSaved={onTranscriptSaved}
              onAnalysisSaved={onAnalysisSaved}
              onTranslationSaved={onTranslationSaved}
              onTranscribe={onRetryTranscript}
              onToast={onToast}
              translateEnabled={translateEnabled}
              translateConfigured={translateConfigured}
              onTranslateNotConfigured={onTranslateNotConfigured}
              targetLang={translateTargetLang}
              disabled={isSending}
            />
          )}
          </div>
        </div>
        {reactionsSummary.length > 0 && (
          <div className={clsx("mt-1 flex flex-wrap gap-1", message.me ? "justify-end" : "justify-start")}>
            {reactionsSummary.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                onClick={() => handleSelectReaction(entry.emoji)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                  actorReaction === entry.emoji
                    ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                )}
                aria-label={`Reacción ${entry.emoji}`}
              >
                <span>{entry.emoji}</span>
                <span className="text-[10px] text-[color:var(--muted)]">{entry.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContentAttachmentCard({ message }: { message: ConversationMessage }) {
  const content = message.contentItem;
  const title = content?.title || message.message || "Contenido adjunto";
  const visibilityLabel = content ? getContentVisibilityLabel(content.visibility) : "";
  const typeLabel = content ? getContentTypeLabel(content.type) : "Contenido";
  const iconName = getContentIconName(content?.type);
  const alignItems = message.me ? "items-end" : "items-start";
  const externalUrl = content?.externalUrl;
  const isInternal = message.audience === "INTERNAL";

  const badgeClass = (() => {
    if (visibilityLabel.toLowerCase().includes("vip")) return "border-[color:rgba(245,158,11,0.8)] text-[color:var(--warning)]";
    if (visibilityLabel.toLowerCase().includes("extra"))
      return "border-[color:var(--brand)] text-[color:var(--brand)]";
    if (visibilityLabel.toLowerCase().includes("incluido"))
      return "border-[color:var(--brand)] text-[color:var(--brand)]";
    return "border-[color:var(--surface-border)] text-[color:var(--text)]";
  })();

  function openContent() {
    if (externalUrl) {
      window.open(externalUrl, "_blank");
    } else {
      alert("Demo: aquí se abriría el contenido real");
    }
  }

  return (
    <div className={`flex flex-col ${alignItems} w-full h-max`}>
      <div
        className={clsx(
          "flex flex-col min-w-[5%] max-w-[65%] p-3 text-[color:var(--text)] rounded-lg mb-3 shadow-sm border",
          isInternal ? "bg-[color:rgba(245,158,11,0.08)] border-[color:rgba(245,158,11,0.5)]" : "bg-[color:var(--surface-2)] border-[color:var(--border)]"
        )}
      >
        {isInternal && (
          <span className="mb-2 inline-flex w-fit items-center rounded-full border border-[color:rgba(245,158,11,0.7)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--warning)]">
            INTERNO
          </span>
        )}
        <div className="flex items-center gap-2 text-sm font-semibold">
          <IconGlyph name={iconName} className="h-4 w-4 text-[color:var(--text)]" />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--muted)] mt-1">
          <span>{typeLabel}</span>
          {visibilityLabel && <span className="w-1 h-1 rounded-full bg-[color:var(--muted)]" />}
          {visibilityLabel && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${badgeClass}`}>
              {visibilityLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className="mt-2 inline-flex w-fit items-center rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--warning)] hover:border-[color:rgba(245,158,11,0.7)] hover:text-[color:var(--text)] transition"
          onClick={openContent}
        >
          Ver contenido
        </button>
        <div className="flex justify-end items-center gap-2 text-[hsla(0,0%,100%,0.6)] text-xs mt-2">
          <span>{message.time}</span>
          {message.me && message.seen ? (
            <span className="inline-flex items-center gap-1 text-[color:var(--brand)] text-[11px]">
              <span className="inline-flex -space-x-1">
                <IconGlyph name="check" className="h-3 w-3" />
                <IconGlyph name="check" className="h-3 w-3" />
              </span>
              <span>Visto</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getContentIconName(type?: string): IconName {
  if (type === "IMAGE") return "image";
  if (type === "VIDEO") return "video";
  if (type === "AUDIO") return "audio";
  if (type === "TEXT") return "note";
  return "file";
}

function mapTypeToLabel(type?: string): string {
  if (type === "IMAGE") return "Foto";
  if (type === "VIDEO") return "Vídeo";
  if (type === "AUDIO") return "Audio";
  if (type === "TEXT") return "Texto";
  return type || "";
}

function formatContentDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatAudioTime(totalSeconds: number) {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolveAudioUrl(rawUrl: string | null | undefined, basePath?: string) {
  if (!rawUrl) return null;
  let resolved = rawUrl;
  if (resolved.startsWith("/uploads/voice-notes/")) {
    resolved = `/api/voice-notes/${resolved.slice("/uploads/voice-notes/".length)}`;
  }
  if (!basePath || basePath === "/" || !resolved.startsWith("/")) return resolved;
  if (resolved.startsWith(basePath)) return resolved;
  return `${basePath}${resolved}`;
}
