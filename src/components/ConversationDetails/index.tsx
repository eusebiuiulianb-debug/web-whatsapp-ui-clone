import {
  type CSSProperties,
  forwardRef,
  KeyboardEvent,
  MouseEvent,
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
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import MessageBalloon from "../MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { Message as ApiMessage, Fan, FanFollowUp } from "../../types/chat";
import { Message as ConversationMessage, ConversationListData } from "../../types/Conversation";
import { getAccessLabel, getAccessState, getAccessSummary } from "../../lib/access";
import { FollowUpTag, getFollowUpTag, getUrgencyLevel } from "../../utils/followUp";
import { PACKS } from "../../config/packs";
import { ChatComposerBar } from "../ChatComposerBar";
import { getFanDisplayNameForCreator } from "../../utils/fanDisplayName";
import { ContentItem, getContentTypeLabel, getContentVisibilityLabel } from "../../types/content";
import { getTimeOfDayTag } from "../../utils/contentTags";
import { EXTRAS_UPDATED_EVENT } from "../../constants/events";
import { AiTone, normalizeTone, ACTION_TYPE_FOR_USAGE } from "../../lib/aiQuickExtra";
import { AiTemplateUsage, AiTurnMode } from "../../lib/aiTemplateTypes";
import { normalizeAiTurnMode } from "../../lib/aiSettings";
import { getAccessSnapshot, getChatterProPlan } from "../../lib/chatPlaybook";
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
import { buildStickerToken, getStickerByToken, type StickerItem as PickerStickerItem } from "../../lib/stickers";
import { parseReactionsRaw, useReactions } from "../../lib/emoji/reactions";
import { computeFanTotals } from "../../lib/fanTotals";
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
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, normalizePreferredLanguage, type SupportedLanguage } from "../../lib/language";
import clsx from "clsx";
import { useRouter } from "next/router";
import { useIsomorphicLayoutEffect } from "../../hooks/useIsomorphicLayoutEffect";
import Image from "next/image";
import { IconGlyph, type IconName } from "../ui/IconGlyph";
import { ConversationActionsMenu } from "../conversations/ConversationActionsMenu";

type ManagerQuickIntent = ManagerObjective;
type ManagerSuggestionIntent = "romper_hielo" | "pregunta_simple" | "cierre_suave" | "upsell_mensual_suave";
type SuggestionVariantMode = "alternate" | "shorter";
type DraftVariantMode = "alternate" | "shorter" | "softer" | "bolder";
type DraftSource = "reformular" | "citar" | "autosuggest";
type DraftCard = {
  id: string;
  text: string;
  label: string;
  source: DraftSource;
  createdAt: string;
  tone?: FanTone | null;
  objective?: ManagerObjective | null;
  selectedText?: string | null;
  basePrompt?: string | null;
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
type ComposerTarget = "fan" | "manager";
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

type ConversationDetailsProps = {
  onBackToBoard?: () => void;
};

const PACK_ESPECIAL_UPSELL_TEXT =
  "Veo que lo que estás pidiendo entra ya en el terreno de mi Pack especial: incluye todo lo de tu suscripción mensual + fotos y escenas extra más intensas. Si quieres subir de nivel, son 49 € y te lo dejo desbloqueado en este chat.";
const PACK_MONTHLY_UPSELL_TEXT =
  'Te propongo subir al siguiente nivel: la suscripción mensual. Incluye fotos, vídeos y guías extra para seguir trabajando en tu relación. Si te interesa, dime "MENSUAL" y te paso el enlace.';
const DUPLICATE_SIMILARITY_THRESHOLD = 0.88;
const DUPLICATE_STRICT_SIMILARITY = 0.93;
const DUPLICATE_RECENT_HOURS = 6;
const DUPLICATE_STRICT_HOURS = 24;
const TOOLBAR_MARGIN = 12;

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
const TRANSLATION_PREVIEW_KEY_PREFIX = "novsy.creatorTranslationPreview";

type ApiAiTemplate = {
  id?: string;
  name?: string;
  category?: string;
  tone?: string | null;
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
        "w-full rounded-2xl border border-slate-800/60 bg-gradient-to-b from-slate-950/70 via-slate-900/80 to-slate-900/70 backdrop-blur-xl shadow-[0_12px_30px_rgba(0,0,0,0.25)] ring-1 ring-white/5",
        containerClassName
      )}
    >
      <div
        className={clsx(
          "shrink-0 border-b border-slate-800/50",
          stickyHeader && "dockOverlayHeader backdrop-blur"
        )}
      >
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[11px] font-semibold text-slate-300">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800/80 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
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
          "px-4 py-3 text-[12px] text-slate-200",
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
  const reactionsRaw = useReactions(activeFanId || "");
  const reactionsStore = useMemo(() => parseReactionsRaw(reactionsRaw), [reactionsRaw]);
  const [ messageSend, setMessageSend ] = useState("");
  const [ pendingInsert, setPendingInsert ] = useState<{ text: string; detail?: string } | null>(null);
  const [ isSending, setIsSending ] = useState(false);
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
  const [ purchaseHistory, setPurchaseHistory ] = useState<
    {
      id: string;
      kind: "EXTRA" | "TIP" | "GIFT";
      amount: number;
      createdAt: string;
      contentItemId?: string | null;
      contentTitle?: string | null;
    }[]
  >([]);
  const [ purchaseHistoryLoading, setPurchaseHistoryLoading ] = useState(false);
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
  const [ historyError, setHistoryError ] = useState("");
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
  const [ internalToast, setInternalToast ] = useState<string | null>(null);
  const [ inlineAction, setInlineAction ] = useState<InlineAction | null>(null);
  const [ translationPreviewOpen, setTranslationPreviewOpen ] = useState(false);
  const [ templateScope, setTemplateScope ] = useState<"fan" | "manager">("fan");
  const [ fanTemplatePools, setFanTemplatePools ] = useState<FanTemplatePools>(LOCAL_FAN_TEMPLATE_POOLS);
  const [ fanTemplateSelection, setFanTemplateSelection ] = useState<FanTemplateSelection>({
    greeting: null,
    question: null,
    closing: null,
  });
  const [ draftCardsByFan, setDraftCardsByFan ] = useState<Record<string, DraftCard[]>>({});
  const [ generatedDraftsByFan, setGeneratedDraftsByFan ] = useState<Record<string, DraftCard[]>>({});
  const [ internalPanelTab, setInternalPanelTab ] = useState<InternalPanelTab>("manager");
  const [ translationPreviewStatus, setTranslationPreviewStatus ] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const [ translationPreviewText, setTranslationPreviewText ] = useState<string | null>(null);
  const [ translationPreviewNotice, setTranslationPreviewNotice ] = useState<string | null>(null);
  const [ inviteCopyState, setInviteCopyState ] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [ inviteCopyError, setInviteCopyError ] = useState<string | null>(null);
  const [ inviteCopyUrl, setInviteCopyUrl ] = useState<string | null>(null);
  const [ inviteCopyToast, setInviteCopyToast ] = useState("");
  const inviteCopyToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileDraftEditedRef = useRef(false);
  const [ dockHeight, setDockHeight ] = useState(0);
  const schemaCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSendingRef = useRef(false);
  const internalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inlineActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingComposerDraftRef = useRef<string | null>(null);
  const pendingComposerDraftFanIdRef = useRef<string | null>(null);
  const draftAppliedFanIdRef = useRef<string | null>(null);
  const translationPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationPreviewAbortRef = useRef<AbortController | null>(null);
  const translationPreviewRequestId = useRef(0);
  const translationPreviewKeyRef = useRef<string | null>(null);
  const [ showContentModal, setShowContentModal ] = useState(false);
  const [ duplicateConfirm, setDuplicateConfirm ] = useState<{ candidate: string } | null>(null);
  const [ selectionToolbar, setSelectionToolbar ] = useState<{
    x: number;
    y: number;
    text: string;
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
    timeOfDay?: TimeOfDayValue;
  };
  const [ contentItems, setContentItems ] = useState<ContentWithFlags[]>([]);
  const [ contentLoading, setContentLoading ] = useState(false);
  const [ contentError, setContentError ] = useState("");
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
  const [ showManualExtraForm, setShowManualExtraForm ] = useState(false);
  const [ isChatBlocked, setIsChatBlocked ] = useState(conversation.isBlocked ?? false);
  const [ isChatArchived, setIsChatArchived ] = useState(conversation.isArchived ?? false);
  const [ isChatActionLoading, setIsChatActionLoading ] = useState(false);
  const router = useRouter();
  const selectionToolbarRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef(false);
  const templatePanelOpenRef = useRef(false);
  const MAX_MAIN_COMPOSER_HEIGHT = 140;
  const MAX_INTERNAL_COMPOSER_HEIGHT = 220;
  const SCROLL_BOTTOM_THRESHOLD = 48;
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
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
  };
  type ManagerSuggestion = {
    id: string;
    label: string;
    message: string;
    intent?: ManagerQuickIntent | string;
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
  const [ hasManualTone, setHasManualTone ] = useState(false);
  const fanTemplateCount = useMemo(
    () =>
      FAN_TEMPLATE_CATEGORIES.reduce(
        (sum, category) => sum + (fanTemplatePools[category.id]?.length ? 1 : 0),
        0
      ),
    [fanTemplatePools]
  );
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatPanelScrollTopRef = useRef(0);
  const chatPanelRestorePendingRef = useRef(false);
  const previousPanelOpenRef = useRef(false);
  const fanHeaderRef = useRef<HTMLDivElement | null>(null);
  const { config } = useCreatorConfig();
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

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight - el.clientHeight,
      behavior,
    });
  };

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

  const showComposerToast = useCallback((message: string) => {
    setInternalToast(message);
    if (internalToastTimer.current) {
      clearTimeout(internalToastTimer.current);
    }
    internalToastTimer.current = setTimeout(() => {
      setInternalToast(null);
    }, 1800);
  }, []);

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

  useEffect(() => {
    if (!router.isReady) return;
    const rawFanId = router.query.fanId;
    const fanIdValue = Array.isArray(rawFanId) ? rawFanId[0] : rawFanId;
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
        pendingComposerDraftFanIdRef.current = typeof fanIdValue === "string" ? fanIdValue : null;
      }
      delete nextQuery.draft;
      shouldReplace = true;
    }

    const rawSegmentNote = router.query.segmentNote;
    if (typeof rawSegmentNote !== "undefined") {
      const noteValue = Array.isArray(rawSegmentNote) ? rawSegmentNote[0] : rawSegmentNote;
      if (typeof noteValue === "string" && typeof fanIdValue === "string" && fanIdValue.trim()) {
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
      if (panelValue === "followup" && typeof fanIdValue === "string" && fanIdValue.trim()) {
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

  function fillMessage(template: string) {
    setComposerTarget("fan");
    setMessageSend(template);
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
  const focusMainMessageInput = (text: string) => {
    setComposerTarget("fan");
    setMessageSend(text);
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
    options: { title: string; detail?: string; forceFan?: boolean }
  ) => {
    const previousText = messageSend;
    if (options.forceFan) {
      setComposerTarget("fan");
    }
    focusMainMessageInput(nextText);
    showInlineAction({
      kind: "ok",
      title: options.title,
      detail: options.detail,
      undoLabel: "Deshacer",
      onUndo: () => focusMainMessageInput(previousText),
      ttlMs: 9000,
    });
  };
  const handleApplyManagerSuggestion = (text: string, detail?: string) => {
    const filled = text.replace("{nombre}", getFirstName(contactName) || contactName || "");
    handleUseManagerReplyAsMainMessage(filled, detail);
  };
  const handleSelectFanFromBanner = useCallback(
    (fan: ConversationListData | null) => {
      if (!fan?.id) return;
      void router.push(
        {
          pathname: router.pathname || "/",
          query: { fanId: fan.id },
        },
        undefined,
        { shallow: true }
      );
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

  function handleUseManagerReplyAsMainMessage(text: string, detail?: string) {
    const nextText = text || "";
    if (messageSend.trim()) {
      setPendingInsert({ text: nextText, detail });
      return;
    }
    applyComposerInsert(nextText, "replace", detail);
  }

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

  function handleWelcomePack() {
    const welcomePackMessage =
      "Te propongo el Pack bienvenida (9 €): primer contacto + 3 audios base personalizados. Si te encaja, te envío el enlace de pago.";
    fillMessage(welcomePackMessage);
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

  function handleSubscriptionLink(options?: { focus?: boolean }) {
    const subscriptionLinkMessage =
      "Aquí tienes el enlace para la suscripción mensual (25 €):\n\n" +
      "👉 [pega aquí tu enlace]\n\n" +
      "Incluye: acceso al chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vas viviendo.\n" +
      "Si tienes alguna duda antes de entrar, dímelo y lo aclaramos.";
    if (options?.focus) {
      focusMainMessageInput(subscriptionLinkMessage);
    } else {
      fillMessage(subscriptionLinkMessage);
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
  } | null>(null);
  const [aiTone, setAiTone] = useState<AiTone>("cercano");
  const [aiTurnMode, setAiTurnMode] = useState<AiTurnMode>("auto");

  async function fetchAiStatus() {
    try {
      const res = await fetch("/api/creator/ai/status");
      if (!res.ok) throw new Error("status failed");
      const data = await res.json();
      setAiStatus({
        creditsAvailable: data.creditsAvailable ?? 0,
        hardLimitPerDay: data.hardLimitPerDay ?? null,
        usedToday: data.usedToday ?? 0,
        remainingToday: data.remainingToday ?? null,
        limitReached: Boolean(data.limitReached),
        turnMode: data.turnMode as AiTurnMode | undefined,
      });
      setIaBlocked(Boolean(data.limitReached));
      if (typeof data.turnMode === "string") {
        setAiTurnMode(normalizeAiTurnMode(data.turnMode));
      }
    } catch (err) {
      console.error("Error obteniendo estado de IA", err);
    }
  }

  async function fetchAiSettingsTone() {
    try {
      const res = await fetch("/api/creator/ai-settings");
      if (!res.ok) throw new Error("settings failed");
      const data = await res.json();
      const tone = data?.settings?.tone;
      if (typeof tone === "string" && tone.trim().length > 0) {
        setAiTone(normalizeTone(tone));
      }
      const mode = data?.settings?.turnMode;
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
  }: {
    fanId: string;
    extraId: string;
    amount: number;
    tier: "T0" | "T1" | "T2" | "T3";
    sessionTag?: string | null;
    source?: string | null;
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
      };
      const res = await fetch("/api/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, error: errText || "No se pudo registrar el extra." };
      }
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
      await refreshFanData(fanId);
      await fetchExtrasHistory(fanId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(EXTRAS_UPDATED_EVENT, {
            detail: {
              fanId,
              totals: {
                extrasCount: updatedExtrasCount,
                extrasSpentTotal: updatedExtrasTotal,
                lifetimeSpend: updatedLifetime,
                lifetimeValue: updatedLifetime,
                customerTier: updatedTier,
                isHighPriority: updatedHighPriority,
              },
            },
          })
        );
      }
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
    setMessageSend(enriched);
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
    setSelectedContentIds([]);
    if (nextMode !== "catalog") {
      fetchContentItems(id);
      if (id) fetchAccessGrants(id);
    }
    setShowContentModal(true);
  }

  function handleOpenExtrasPanel() {
    const nextFilter = timeOfDay === "NIGHT" ? "night" : "day";
    setTimeOfDayFilter(nextFilter as TimeOfDayFilter);
    openContentModal({ mode: "extras", tier: null, defaultRegisterExtras: false, registerSource: null });
  }

  function fillMessageFromPackType(type: "trial" | "monthly" | "special") {
    const pack = findPackByType(type);
    if (pack) {
      fillMessage(buildPackProposalMessage(pack));
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
      const res = await fetch(`/api/access/grant?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
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
      const res = await fetch(`/api/fans/profile?fanId=${fanId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error("error");
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
      const res = await fetch(`/api/fans/follow-up?fanId=${fanId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error("error");
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
      const res = await fetch(`/api/fans/follow-up/history?fanId=${fanId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error("error");
      const history = Array.isArray(data.history) ? data.history : [];
      setFollowUpHistory(history);
    } catch (_err) {
      setFollowUpHistory([]);
      setFollowUpHistoryError("Error cargando historial");
    } finally {
      setFollowUpHistoryLoading(false);
    }
  }, []);

  async function fetchHistory(fanId: string) {
    try {
      setHistoryError("");
      setPurchaseHistoryLoading(true);
      const res = await fetch(`/api/fans/purchases?fanId=${fanId}`);
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
  }

  const fetchContentItems = useCallback(async (targetFanId?: string) => {
    try {
      setContentLoading(true);
      setContentError("");
      const url = targetFanId ? `/api/content?fanId=${encodeURIComponent(targetFanId)}` : "/api/content";
      const res = await fetch(url);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
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

  const mapApiMessagesToState = useCallback((apiMessages: ApiMessage[]): ConversationMessage[] => {
    return apiMessages.map((msg) => {
      const isContent = msg.type === "CONTENT";
      const isLegacySticker = msg.type === "STICKER";
      const tokenSticker = !isContent && !isLegacySticker ? getStickerByToken(msg.text ?? "") : null;
      const isSticker = isLegacySticker || Boolean(tokenSticker);
      const sticker = isLegacySticker ? getStickerById(msg.stickerId ?? null) : null;
      const stickerSrc = isLegacySticker ? sticker?.file ?? null : tokenSticker?.src ?? null;
      const stickerAlt = isLegacySticker ? sticker?.label ?? null : tokenSticker?.label ?? null;
      return {
        id: msg.id,
        fanId: msg.fanId,
        me: msg.from === "creator",
        message: msg.text ?? "",
        translatedText: isSticker ? undefined : msg.creatorTranslatedText ?? undefined,
        audience: deriveAudience(msg),
        seen: !!msg.isLastFromCreator,
        time: msg.time || "",
        createdAt: (msg as any)?.createdAt ?? undefined,
        status: "sent",
        kind: isContent ? "content" : isSticker ? "sticker" : "text",
        type: msg.type,
        stickerId: isLegacySticker ? msg.stickerId ?? null : null,
        stickerSrc,
        stickerAlt,
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

  const messagesAbortRef = useRef<AbortController | null>(null);
  const messagesPollRef = useRef<NodeJS.Timeout | null>(null);

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
  }, []);

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
    async (shouldShowLoading = false) => {
      if (!id) return;
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
        const params = new URLSearchParams({ fanId: id, markRead: "1", audiences: "FAN,CREATOR" });
        const res = await fetch(`/api/messages?${params.toString()}`, { signal: controller.signal });
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
        setMessage((prev) => reconcileMessages(prev || [], mapped, id));
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
    [handleSchemaOutOfSync, id, mapApiMessagesToState, setMessage]
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
        const res = await fetch(`/api/messages?${params.toString()}`, { signal: controller.signal });
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
    fetchMessages(true);
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
    if (!id) return undefined;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchMessages(false);
    }, 1800);
    messagesPollRef.current = interval as any;
    return () => {
      if (messagesPollRef.current) clearInterval(messagesPollRef.current as any);
      if (messagesAbortRef.current) messagesAbortRef.current.abort();
    };
  }, [fetchMessages, id]);
  useEffect(() => {
    if (draftAppliedFanIdRef.current && draftAppliedFanIdRef.current !== conversation.id) {
      draftAppliedFanIdRef.current = null;
    }
    const preserveDraft = draftAppliedFanIdRef.current === conversation.id;
    if (!preserveDraft) {
      setMessageSend("");
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
    if (!id) return;
    const pendingDraft = pendingComposerDraftRef.current;
    if (!pendingDraft) return;
    const targetFanId = pendingComposerDraftFanIdRef.current;
    if (targetFanId && targetFanId !== id) return;
    const trimmed = pendingDraft.trim();
    pendingComposerDraftRef.current = null;
    pendingComposerDraftFanIdRef.current = null;
    if (!trimmed) return;
    setComposerTarget("fan");
    setMessageSend(pendingDraft);
    draftAppliedFanIdRef.current = id;
    requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) return;
      input.focus();
      const len = pendingDraft.length;
      input.setSelectionRange(len, len);
      autoGrowTextarea(input, MAX_MAIN_COMPOSER_HEIGHT);
    });
  }, [autoGrowTextarea, id]);

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
  }, [id, openPanel]);

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
    fetchAiStatus();
    fetchAiSettingsTone();
  }, []);

  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`${TRANSLATION_PREVIEW_KEY_PREFIX}:${id}`);
    setTranslationPreviewOpen(stored === "1");
  }, [id]);

  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    window.localStorage.setItem(
      `${TRANSLATION_PREVIEW_KEY_PREFIX}:${id}`,
      translationPreviewOpen ? "1" : "0"
    );
  }, [id, translationPreviewOpen]);

  useEffect(() => {
    let cancelled = false;
    const loadFanTemplatePools = async () => {
      try {
        const res = await fetch("/api/creator/ai/templates");
        if (!res.ok) throw new Error("failed to load templates");
        const data = await res.json();
        if (!cancelled) {
          const merged = buildFanTemplatePoolsFromApi(data?.templates, LOCAL_FAN_TEMPLATE_POOLS);
          setFanTemplatePools(merged);
        }
      } catch (err) {
        if (!cancelled) {
          setFanTemplatePools(LOCAL_FAN_TEMPLATE_POOLS);
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
      target.classList.add("ring-2", "ring-emerald-400/60", "ring-offset-2", "ring-offset-slate-900");
      setTimeout(() => {
        target.classList.remove("ring-2", "ring-emerald-400/60", "ring-offset-2", "ring-offset-slate-900");
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

  useEffect(() => {
    if (profileDraftEditedRef.current) return;
    setProfileDraft(profileText);
  }, [profileText]);
  const hasInternalThreadMessages = internalNotes.length > 0 || managerChatMessages.length > 0;
  const effectiveLanguage = (preferredLanguage ?? "en") as SupportedLanguage;
  const isTranslationPreviewAvailable =
    !!id && !conversation.isManager && effectiveLanguage !== "es";
  const hasComposerText = messageSend.trim().length > 0;
  const isFanTarget = composerTarget === "fan";
  const composerAudience = isFanTarget ? "CREATOR" : "INTERNAL";
  const translateEnabled = translationPreviewOpen && !conversation.isManager && isFanTarget;
  const isFanMode = !conversation.isManager;
  const hasAutopilotContext = !!(lastAutopilotObjective && lastAutopilotTone);
  const disableTranslationPreview = () => {
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
    setTranslationPreviewOpen(false);
  };

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

  const handleAskManagerFromDraft = useCallback(
    (text: string, options?: { selectedText?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setManagerChatInput(trimmed);
      setManagerSelectedText(options?.selectedText ?? null);
      openInternalPanel("manager");
      focusManagerComposer(true);
    },
    [openInternalPanel, focusManagerComposer]
  );

  const clampToolbarPosition = useCallback(
    (x: number, y: number, options?: { containerRect?: DOMRect | null; maxWidth?: number }) => {
    if (typeof window === "undefined") return { x, y };
    const toolbarHeight = 48;
    const margin = TOOLBAR_MARGIN;
    const maxY = window.innerHeight - toolbarHeight - margin;
    const clampedY = Math.max(margin, Math.min(y - toolbarHeight, maxY));
    const containerRect = options?.containerRect ?? null;
    const maxWidth = Math.max(0, options?.maxWidth ?? 0);
    if (containerRect) {
      const leftBound = containerRect.left + margin;
      const rightBound = containerRect.right - maxWidth - margin;
      const safeRight = Math.max(leftBound, rightBound);
      const centeredX = x - maxWidth / 2;
      return {
        x: Math.max(leftBound, Math.min(centeredX, safeRight)),
        y: clampedY,
      };
    }
    const fallbackWidth = 320;
    const maxX = window.innerWidth - fallbackWidth - margin;
    return {
      x: Math.max(margin, Math.min(x - fallbackWidth / 2, maxX)),
      y: clampedY,
    };
  }, []);

  const updateSelectionToolbar = useCallback((options?: { force?: boolean }) => {
    if (isPointerDownRef.current && !options?.force) return;
    if (typeof window === "undefined") return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionToolbar(null);
      return;
    }
    const selectedText = selection.toString().trim();
    if (!selectedText) {
      setSelectionToolbar(null);
      return;
    }
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range) {
      setSelectionToolbar(null);
      return;
    }
    const commonNode = range.commonAncestorContainer;
    const commonElement =
      commonNode.nodeType === Node.ELEMENT_NODE ? (commonNode as Element) : commonNode.parentElement;
    if (!commonElement || !container.contains(commonElement)) {
      setSelectionToolbar(null);
      return;
    }
    if (commonElement.closest("input, textarea, [contenteditable=\"true\"]")) {
      setSelectionToolbar(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setSelectionToolbar(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const maxWidth = Math.max(0, containerRect.width - TOOLBAR_MARGIN * 2);
    const position = clampToolbarPosition(rect.left + rect.width / 2, rect.top, {
      containerRect,
      maxWidth,
    });
    setSelectionToolbar({ x: position.x, y: position.y, text: selectedText, maxWidth });
  }, [clampToolbarPosition]);

  const clearSelectionRanges = useCallback(() => {
    if (typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection) return;
    try {
      selection.removeAllRanges();
    } catch (_err) {
      // noop
    }
  }, []);

  const closeSelectionToolbar = useCallback(() => {
    setSelectionToolbar(null);
    clearSelectionRanges();
  }, [clearSelectionRanges]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let raf = 0;
    const scheduleUpdate = (force = false) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => updateSelectionToolbar({ force }));
    };
    const clearOnScroll = () => setSelectionToolbar(null);
    const handleSelectionChange = () => scheduleUpdate(false);
    const handleKeyUp = () => scheduleUpdate(false);
    const handlePointerDown = () => {
      isPointerDownRef.current = true;
      setSelectionToolbar(null);
    };
    const handlePointerUp = () => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      scheduleUpdate(true);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("scroll", clearOnScroll, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("scroll", clearOnScroll, true);
    };
  }, [updateSelectionToolbar]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!selectionToolbar) return;
      closeSelectionToolbar();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeSelectionToolbar, selectionToolbar]);

  const getSelectionInsideMessagesContainer = useCallback(() => {
    if (typeof window === "undefined") return null;
    const container = messagesContainerRef.current;
    if (!container) return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;
    const selectedText = selection.toString().trim();
    if (!selectedText) return null;
    const anchorNode = selection.anchorNode;
    if (!anchorNode || !container.contains(anchorNode)) return null;
    const anchorElement =
      anchorNode.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode.parentElement;
    if (anchorElement?.closest("input, textarea, [contenteditable=\"true\"]")) return null;
    return selectedText;
  }, []);

  const handleMessageContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (selectionToolbar?.text || getSelectionInsideMessagesContainer()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [getSelectionInsideMessagesContainer, selectionToolbar]
  );

  const buildManagerQuotePrompt = (text: string) => {
    return (
      `Texto seleccionado: «${text}»\n\n` +
      "Qué quiero: dime cómo responderle sin sonar vendedor, tono íntimo, CTA suave."
    );
  };

  const buildManagerRephrasePrompt = (text: string) => {
    const name = getFirstName(contactName) || contactName || "este fan";
    return (
      `Texto seleccionado: «${text}»\n\n` +
      `Reformula este mensaje para ${name}: íntimo, natural, cero presión, que parezca conversación real. ` +
      "Devuélveme 2 versiones."
    );
  };

  const buildManagerVariantPrompt = useCallback((mode: SuggestionVariantMode, text: string) => {
    const base = text.trim();
    if (mode === "shorter") {
      return (
        "Reescribe este mensaje en una versión más corta y directa, manteniendo el tono y la intención:\n\n" +
        `«${base}»`
      );
    }
    return (
      "Dame otra versión de este mensaje manteniendo el tono y la intención, con palabras distintas:\n\n" +
      `«${base}»`
    );
  }, []);

  const shortenSuggestionText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;
    const sentenceMatch = trimmed.match(/^[^.!?]+[.!?]?/);
    const candidate = (sentenceMatch ? sentenceMatch[0] : trimmed).trim();
    const maxLen = 140;
    if (candidate.length <= maxLen) return candidate;
    const clipped = candidate.slice(0, maxLen).trim().replace(/[.,;:!?]$/, "");
    return `${clipped}...`;
  };

  const copyTextToClipboard = async (text: string) => {
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
  };


  const mergeProfileDraft = (base: string, addition: string) => {
    const trimmedBase = base.trim();
    const trimmedAddition = addition.trim();
    if (!trimmedAddition) return trimmedBase;
    if (!trimmedBase) return trimmedAddition;
    if (trimmedBase.includes(trimmedAddition)) return trimmedBase;
    return `${trimmedBase}\n${trimmedAddition}`.trim();
  };

  const handleSelectionQuote = () => {
    if (!selectionToolbar) return;
    requestDraftCardFromPrompt({
      prompt: buildManagerQuotePrompt(selectionToolbar.text),
      source: "citar",
      label: "Citar al Manager",
      selectedText: selectionToolbar.text,
    });
    closeSelectionToolbar();
  };

  const handleSelectionRephrase = () => {
    if (!selectionToolbar) return;
    requestDraftCardFromPrompt({
      prompt: buildManagerRephrasePrompt(selectionToolbar.text),
      source: "reformular",
      label: "Reformular",
      selectedText: selectionToolbar.text,
    });
    closeSelectionToolbar();
  };

  const handleSelectionCopy = async () => {
    if (!selectionToolbar) return;
    const ok = await copyTextToClipboard(selectionToolbar.text);
    showComposerToast(ok ? "Texto copiado" : "No se pudo copiar");
    closeSelectionToolbar();
  };

  const handleSelectionSaveProfile = () => {
    if (!selectionToolbar) return;
    const merged = mergeProfileDraft(profileDraft, selectionToolbar.text);
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
    closeSelectionToolbar();
  };

  const handleSelectionCreateFollowUp = () => {
    if (!selectionToolbar) return;
    setNextActionDraft(selectionToolbar.text.trim());
    openFollowUpNote();
    closeSelectionToolbar();
  };

  const handleToolbarPointerDown = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

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
    const templatesCount: number = fanTemplateCount + managerTemplateCount;
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
              ? "border-rose-400/60 bg-rose-500/10 text-rose-200"
              : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
          )}
        >
          {managerChipStatus}
        </span>
        {managerChipCount > 0 && <span className="text-[10px] text-slate-400">· {managerChipCount}</span>}
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
      "border-slate-800/70 bg-slate-900/50 text-slate-200 hover:border-slate-600/70 hover:bg-slate-800/60";
    const chipActiveClass = isFanMode
      ? "border-emerald-400/70 bg-emerald-500/12 text-emerald-100 ring-1 ring-emerald-400/20"
      : "border-amber-400/70 bg-amber-500/12 text-amber-100 ring-1 ring-amber-400/20";

    const InlineEmptyState = ({
      icon,
      title,
      subtitle,
    }: {
      icon: IconName;
      title: string;
      subtitle?: string;
    }) => (
      <div className="flex items-center gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-3 text-xs text-slate-400">
        <IconGlyph name={icon} className="h-4 w-4 text-slate-200" />
        <div>
          <div className="text-[11px] font-semibold text-slate-200">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
        </div>
      </div>
    );

    const inlineActionButtonClass = clsx(
      "inline-flex h-7 items-center justify-center rounded-full border px-3.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2",
      isFanMode
        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 focus-visible:ring-emerald-400/50"
        : "border-amber-400/70 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 focus-visible:ring-amber-400/40"
    );
    const managerActionButtonClass = clsx(
      "inline-flex h-7 items-center justify-center rounded-full border px-3.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2",
      "border-amber-400/70 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 focus-visible:ring-amber-400/40"
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
      const translationDisabled = !isFanTarget || isInternalPanelOpen;
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
              <div className="text-[11px] font-semibold text-slate-400">Acciones</div>
              <button
                type="button"
                onClick={() => handleAttachContentClick()}
                disabled={!canAttachContent}
                className={clsx(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
                  !canAttachContent
                    ? "cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-500"
                    : "border-slate-800/70 bg-slate-950/40 text-slate-200 hover:border-slate-600/80 hover:bg-slate-900/60"
                )}
              >
                <span className="flex items-center gap-2">
                  <IconGlyph name="paperclip" className="h-4 w-4" />
                  <span>Adjuntar contenido</span>
                </span>
                {toolsDisabled && (
                  <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                    Solo fan
                  </span>
                )}
              </button>
              <div className="text-[11px] font-semibold text-slate-400">Traducción</div>
              {isTranslationPreviewAvailable ? (
                <div
                  className={clsx(
                    "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                    translationPreviewOpen
                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-800/70 bg-slate-950/40 text-slate-200",
                    translationDisabled && "opacity-60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <IconGlyph name="globe" className="h-4 w-4" />
                    <span>Traducir</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {translationDisabled && (
                      <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                        Solo fan
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (translateEnabled) {
                          disableTranslationPreview();
                          showInlineAction({ kind: "info", title: "Traducción desactivada" });
                        } else {
                          setTranslationPreviewOpen(true);
                          showInlineAction({ kind: "info", title: "Traducción activada" });
                        }
                      }}
                      disabled={translationDisabled}
                      className={clsx(
                        "relative inline-flex h-5 w-10 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                        translationPreviewOpen
                          ? "border-emerald-400/70 bg-emerald-500/20"
                          : "border-slate-600 bg-slate-900/70",
                        translationDisabled && "cursor-not-allowed"
                      )}
                      aria-pressed={translationPreviewOpen}
                    >
                      <span
                        className={clsx(
                          "inline-block h-4 w-4 rounded-full transition",
                          translationPreviewOpen ? "translate-x-5 bg-emerald-200" : "translate-x-1 bg-slate-400"
                        )}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-[12px] font-semibold text-slate-500">
                  <span className="flex items-center gap-2">
                    <IconGlyph name="globe" className="h-4 w-4" />
                    <span>Traducir</span>
                  </span>
                  <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-slate-400">
                    Próximamente
                  </span>
                </div>
              )}
              {isTranslationPreviewAvailable && translationPreviewOpen && isFanTarget && (
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <div className="text-[11px] font-semibold text-slate-400">Traducción automática</div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-200">
                    <span className="text-slate-400">Idioma</span>
                    <select
                      value={languageSelectValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "auto") return;
                        handlePreferredLanguageChange(value as SupportedLanguage);
                      }}
                      disabled={preferredLanguageSaving}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-100 focus:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                    >
                      <option value="auto" disabled>
                        Auto (EN por defecto)
                      </option>
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!isTranslationPreviewAvailable && (
                    <div className="text-[10px] text-slate-500">
                      Selecciona un idioma distinto de ES para activar preview.
                    </div>
                  )}
                </div>
              )}
              <div className="text-[11px] font-semibold text-slate-400">Acciones rápidas</div>
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
                      "border-slate-800/70 bg-slate-950/40 text-slate-200 hover:border-slate-600/80 hover:bg-slate-900/60"
                    )}
                  >
                    <IconGlyph name={action.icon} className="h-4 w-4" />
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
          <div className="text-[11px] font-semibold text-slate-400">Insights y control</div>
          {normalizedProfileText && (
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
                <span>Perfil del fan (resumen)</span>
                <button
                  type="button"
                  onClick={() => openInternalPanelTab("note")}
                  className="rounded-full border border-amber-400/70 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/20"
                >
                  Editar
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-200 whitespace-pre-wrap line-clamp-3">
                {normalizedProfileText}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
            <FanManagerDrawer
              managerSuggestions={managerSuggestions}
              onApplySuggestion={handleApplyManagerSuggestion}
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
              onRequestSuggestionAlt={(text) => handleRequestSuggestionVariant("alternate", text)}
              onRequestSuggestionShorter={(text) => handleRequestSuggestionVariant("shorter", text)}
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
            />
          </div>
          <div className="space-y-3">
            <div className="text-[11px] font-semibold text-slate-400">Conversación con Manager IA</div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-3 space-y-4">
              {managerChatMessages.length === 0 && (
                <div className="text-[11px] text-slate-500">Aún no has preguntado al Manager IA.</div>
              )}
              {managerChatMessages.map((msg) => {
                const isCreator = msg.role === "creator";
                const isManager = msg.role === "manager";
                const isSystem = msg.role === "system";
                const bubbleClass = clsx(
                  "rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                  "[&_a]:underline [&_a]:underline-offset-2",
                  isCreator
                    ? "bg-emerald-600/80 text-white"
                    : isManager
                    ? "bg-slate-800/80 text-slate-100"
                    : "bg-slate-900/70 text-slate-300"
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
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {isCreator ? "Tú" : "Manager IA"}
                        </span>
                      )}
                      {isSystem ? (
                        <div className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400 text-center">
                          {msg.text}
                        </div>
                      ) : (
                        <div className={clsx(bubbleClass, "max-w-[75%]")}>{msg.text}</div>
                      )}
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => handleUseManagerReplyAsMainMessage(msg.text, msg.title ?? "Manager IA")}
                          className={clsx("mt-1", inlineActionButtonClass)}
                        >
                          Usar en mensaje
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={managerChatEndRef} />
          </div>
        </div>
        <div className="border-t border-slate-800/70 bg-slate-950/80 px-4 py-3">
          <label className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={includeInternalContext}
              onChange={toggleIncludeInternalContext}
              className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-emerald-400 focus:ring-2 focus:ring-emerald-400/40"
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
      </div>
    );

    const renderInternalChatContent = () => (
      <div className="space-y-3">
        <div className="px-4 pt-3 text-[11px] text-slate-400">
          Borradores tuyos. No se envía al fan.
        </div>
        <div className="px-4 pb-3 space-y-2">
          {isLoadingInternalMessages && (
            <div className="text-[11px] text-slate-500">Cargando mensajes internos...</div>
          )}
          {internalMessagesError && !isLoadingInternalMessages && (
            <div className="text-[11px] text-rose-300">{internalMessagesError}</div>
          )}
          {!internalNotes.length && displayGeneratedDrafts.length === 0 && !isLoadingInternalMessages && !internalMessagesError && (
            <div className="text-[11px] text-slate-500">
              Aún no hay borradores internos.
            </div>
          )}
          {displayGeneratedDrafts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-400">Borradores IA</div>
              {displayGeneratedDrafts.map((draft) => {
                const toneLabel = draft.tone ? formatToneLabel(draft.tone) : null;
                const sourceLabel = draftSourceLabel(draft.source);
                const showLabel = draft.label && draft.label !== sourceLabel ? draft.label : null;
                return (
                  <div
                    key={draft.id}
                    className="flex w-full max-w-none flex-col items-start rounded-2xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-xs leading-relaxed"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                      <span>{formatNoteDate(draft.createdAt)}</span>
                      <span className="text-emerald-200">{sourceLabel}</span>
                      {showLabel && <span className="text-slate-300">{showLabel}</span>}
                      {toneLabel && <span className="text-slate-300">Tono {toneLabel}</span>}
                    </div>
                    <div className="mt-2 text-[12px] text-slate-100 whitespace-pre-wrap">{draft.text}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleUseManagerReplyAsMainMessage(draft.text, draft.label ?? sourceLabel)}
                        className={inlineActionButtonClass}
                      >
                        Usar en mensaje
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGeneratedDraft(draft.id)}
                        className="inline-flex items-center rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/20"
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
              <div className="text-[11px] font-semibold text-slate-400">Borradores</div>
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
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
                    <div
                      className={clsx(
                        "w-full rounded-2xl px-4 py-3 text-xs leading-relaxed",
                        isCreatorNote
                          ? "bg-amber-500/20 text-amber-50"
                          : "bg-slate-800/80 text-slate-100",
                        highlightDraftId === msg.id && "ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-slate-900"
                      )}
                    >
                      {isCreatorNote && (
                        <span className="mb-1 inline-flex items-center rounded-full border border-amber-400/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
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
                            <span className="text-[11px] text-slate-300">Sticker</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <div>{noteText}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleUseManagerReplyAsMainMessage(noteText, "Borrador interno")}
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
        <div className="border-t border-slate-800/70 bg-slate-950/80 px-4 py-3">
          <div className="text-[11px] font-semibold text-slate-400">Nuevo borrador</div>
          <div className="mt-2 flex items-end gap-2">
            <textarea
              rows={1}
              className="flex-1 w-full rounded-xl bg-slate-900/80 px-4 py-3 text-xs leading-6 text-slate-100 placeholder:text-slate-400 resize-none overflow-y-auto whitespace-pre-wrap break-words focus:outline-none focus:ring-2 focus:ring-amber-400/60"
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
              className="h-8 px-3 rounded-2xl border border-amber-400/70 bg-amber-500/10 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
        const statusTone = item.status === "DONE" ? "text-amber-200" : "text-rose-200";
        const due = splitDueAt(item.dueAt ?? null);
        const dueLabel = formatWhen(item.dueAt ?? null);
        return (
          <div key={item.id} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{timestamp ? formatNoteDate(timestamp) : ""}</span>
              <span className={statusTone}>{statusLabel}</span>
            </div>
            <div className="text-[11px] whitespace-pre-wrap">{item.title}</div>
            {item.note && <div className="text-[11px] whitespace-pre-wrap text-slate-300">{item.note}</div>}
            {dueLabel && (
              <div className="text-[10px] text-slate-500">
                Para {dueLabel}
                {due.time ? ` · ${due.time}` : ""}
              </div>
            )}
          </div>
        );
      };

      return (
        <div className="px-4 py-3 space-y-4">
          <div className="text-[11px] text-slate-400">
            Perfil del fan + seguimiento. Se usa como contexto del Manager IA.
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-slate-400">Perfil del fan</div>
            </div>
            <textarea
              ref={profileInputRef}
              value={profileDraft}
              onChange={(e) => {
                profileDraftEditedRef.current = true;
                setProfileDraft(e.target.value);
              }}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
              placeholder="Perfil del fan: contexto, límites, preferencias, tono, etc."
            />
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!canSaveProfile}
                className="rounded-lg border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500/20"
              >
                Guardar perfil
              </button>
              {!canSaveProfile && trimmedProfile.length > 0 && (
                <span>Sin cambios</span>
              )}
              {profileError && <span className="text-rose-300">{profileError}</span>}
              {profileLoading && <span>Actualizando...</span>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-slate-400">Nota rápida</div>
              {!quickNoteEditing && (
                <button
                  type="button"
                  onClick={openQuickNoteEditor}
                  className="rounded-lg border border-slate-600/80 bg-slate-900/60 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
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
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
                  placeholder="Nota rápida..."
                />
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <button
                    type="button"
                    onClick={handleSaveQuickNote}
                    disabled={quickNoteLoading}
                    className="rounded-lg border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500/20"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={cancelQuickNoteEditor}
                    className="rounded-lg border border-slate-600/80 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800/80"
                  >
                    Cancelar
                  </button>
                  {quickNoteLoading && <span>Guardando...</span>}
                  {quickNoteError && <span className="text-rose-300">{quickNoteError}</span>}
                </div>
              </div>
            ) : quickNote.trim() ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap">
                {quickNote}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">Sin nota rápida.</div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-400">Seguimiento</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                ref={nextActionInputRef}
                type="text"
                value={nextActionDraft}
                onChange={(e) => setNextActionDraft(e.target.value)}
                className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
                placeholder="Ej: Proponer pack especial cuando cobre"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:text-amber-300"
                />
                <input
                  type="time"
                  value={nextActionTime}
                  onChange={(e) => setNextActionTime(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:text-amber-300"
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
                  className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="rounded-lg border border-emerald-400/80 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-500/20"
              >
                Guardar seguimiento
              </button>
              <button
                type="button"
                onClick={handleClearNextAction}
                disabled={!canClearNextAction}
                className="rounded-lg border border-slate-600/80 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-200 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-800/80"
              >
                Borrar seguimiento
              </button>
              <button
                type="button"
                onClick={handleArchiveNextAction}
                disabled={!canArchiveNextAction}
                className="rounded-lg border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500/20"
              >
                Marcar como hecho
              </button>
              {followUpError && <span className="text-[10px] text-rose-300">{followUpError}</span>}
              {followUpLoading && <span className="text-[10px] text-slate-400">Actualizando...</span>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-400">Historial</div>
            {followUpHistoryLoading && <div className="text-[11px] text-slate-400">Cargando historial…</div>}
            {followUpHistoryError && !followUpHistoryLoading && (
              <div className="text-[11px] text-rose-300">{followUpHistoryError}</div>
            )}
            {!followUpHistoryLoading && followUpHistory.length === 0 && (
              <div className="text-[11px] text-slate-500">Aún no hay entradas de historial.</div>
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
                          ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
                          : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500/80"
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
        const hasFanTemplates = fanTemplateCount > 0;
        const templateTabs = [
          { id: "fan", label: "Para el fan" },
          { id: "manager", label: "Para el Manager" },
        ] as const;
        const templateTabBase =
          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition";
        const templateTabInactive =
          "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500/80";
        const templateTabFanActive = "border-emerald-400/70 bg-emerald-500/15 text-emerald-100";
        const templateTabManagerActive = "border-amber-400/70 bg-amber-500/15 text-amber-100";
        return (
          <InlinePanelShell
            title="Plantillas"
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
                aria-label="Plantillas"
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
                hasFanTemplates ? (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => syncFanTemplateSelection(true)}
                        className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/50 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500/80"
                      >
                        Barajar todo
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {FAN_TEMPLATE_CATEGORIES.map((category) => {
                        const pool = getTemplatePoolForTone(category.id, templateTone);
                        const selected =
                          pool.find((item) => item.id === fanTemplateSelection[category.id]) ?? pool[0] ?? null;
                        if (!selected) {
                          return (
                            <div
                              key={category.id}
                              className="flex flex-col gap-2 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2"
                            >
                              <div className="text-[12px] font-semibold text-slate-100">{category.label}</div>
                              <p className="text-[11px] text-slate-500">Sin opciones disponibles.</p>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={selected.id}
                            className="flex flex-col gap-2 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2"
                          >
                            <div className="text-[12px] font-semibold text-slate-100">{selected.title}</div>
                            <p className="text-[11px] text-slate-400 line-clamp-2">{selected.text}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  insertComposerTextWithUndo(resolveFanTemplateText(selected.text), {
                                    title: "Plantilla insertada",
                                    detail: selected.title,
                                  });
                                  closeDockPanel();
                                }}
                                className={inlineActionButtonClass}
                              >
                                Insertar en mensaje
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFanTemplateRotate(category.id)}
                                className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/50 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500/80"
                              >
                                Otra opción
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <InlineEmptyState icon="folder" title="Sin plantillas para el fan" />
                )
              ) : managerPromptTemplate ? (
                <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400">Plantilla sugerida</div>
                  <p className="text-[11px] text-slate-200 line-clamp-2">{managerPromptTemplate}</p>
                  <button
                    type="button"
                    onClick={() => handleAskManagerFromDraft(managerPromptTemplate)}
                    className={managerActionButtonClass}
                  >
                    Insertar en Manager
                  </button>
                </div>
              ) : (
                <InlineEmptyState icon="folder" title="Sin plantillas para el Manager" />
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
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
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
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/60 text-[9px] leading-none text-slate-300 ring-1 ring-slate-700/60 transition hover:bg-slate-800/80 hover:text-slate-100"
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
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
              aria-expanded={managerPanelOpen && managerPanelTab === "templates"}
              aria-controls={panelId}
            >
              <span className="flex items-center gap-1.5">
                <span>Plantillas</span>
                {templatesCount > 0 && (
                  <span className="rounded-full border border-slate-600/80 bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-slate-300">
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
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/60 text-[9px] leading-none text-slate-300 ring-1 ring-slate-700/60 transition hover:bg-slate-800/80 hover:text-slate-100"
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
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
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
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/60 text-[9px] leading-none text-slate-300 ring-1 ring-slate-700/60 transition hover:bg-slate-800/80 hover:text-slate-100"
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
                className="dockOverlayBackdrop bg-slate-950/70"
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
        if (reason === "ai_not_configured") {
          setTranslationPreviewNotice("Sin traducción (IA no configurada). Se enviará en español.");
        } else if (reason === "empty") {
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
    const suggestions = buildSuggestionsForObjective({
      objective,
      fanName: contactName,
      tone: fanTone,
      state: fanManagerAnalysis.state,
      analysis: fanManagerAnalysis,
    });
    setManagerSuggestions(suggestions.slice(0, 3));
  }, [contactName, fanManagerAnalysis, buildSuggestionsForObjective, fanTone, hasManualManagerObjective]);

  useEffect(() => {
    if (!currentObjective) return;
    const suggestions = buildSuggestionsForObjective({
      objective: currentObjective,
      fanName: contactName,
      tone: fanTone,
      state: fanManagerAnalysis.state,
      analysis: fanManagerAnalysis,
    });
    setManagerSuggestions(suggestions.slice(0, 3));
  }, [fanTone, currentObjective, contactName, fanManagerAnalysis, buildSuggestionsForObjective]);

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
    (
      question: string,
      intent?: ManagerQuickIntent,
      toneOverride?: FanTone,
      options?: {
        selectedText?: string | null;
        onSuggestions?: (payload: { title: string; suggestions: string[] }) => void;
        skipChat?: boolean;
      }
    ) => {
      if (!id) return;
      const trimmed = question.trim();
      if (!trimmed) return;
      const contextPrompt = buildManagerContextPrompt({ selectedText: options?.selectedText ?? null });
      const promptForManager = `${trimmed}${contextPrompt}`;
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

      setTimeout(() => {
        const resolvedIntent = intent
          ? mapQuickIntentToSuggestionIntent(intent)
          : inferSuggestionIntentFromPrompt(promptForManager);
        const bundle = buildSimulatedManagerSuggestions({
          fanName: contactName,
          tone: toneOverride ?? fanTone,
          intent: resolvedIntent,
        });
        if (!options?.skipChat) {
          const managerMessage: ManagerChatMessage = {
            id: `${fanKey}-${Date.now()}-manager`,
            role: "manager",
            text: bundle.suggestions[0] ?? bundle.title,
            title: bundle.title,
            suggestions: bundle.suggestions,
            createdAt: new Date().toISOString(),
          };
          setManagerChatByFan((prev) => {
            const prevMsgs = prev[fanKey] ?? [];
            return { ...prev, [fanKey]: [...prevMsgs, managerMessage] };
          });
        }
        options?.onSuggestions?.(bundle);
      }, 700);
    },
    [
      buildManagerContextPrompt,
      buildSimulatedManagerSuggestions,
      contactName,
      fanTone,
      focusManagerComposer,
      id,
      inferSuggestionIntentFromPrompt,
      mapQuickIntentToSuggestionIntent,
      openInternalPanelTab,
      setManagerChatByFan,
      setManagerChatInput,
      setManagerSelectedText,
    ]
  );

  const handleRequestSuggestionVariant = (mode: SuggestionVariantMode, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const label = mode === "shorter" ? "Más corta" : "Otra versión";
    const prompt = buildManagerVariantPrompt(mode, trimmed);
    askInternalManager(prompt, undefined, undefined, {
      selectedText: trimmed,
      onSuggestions: (bundle) => {
        const baseSuggestion = bundle.suggestions[0] ?? trimmed;
        const nextMessage = mode === "shorter" ? shortenSuggestionText(baseSuggestion) : baseSuggestion;
        if (!nextMessage.trim()) return;
        setManagerSuggestions((prev) => {
          const filtered = prev.filter((item) => item.message !== nextMessage);
          return [
            {
              id: `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              label,
              message: nextMessage,
            },
            ...filtered,
          ].slice(0, 3);
        });
      },
    });
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

  const buildDraftVariantPrompt = useCallback((mode: DraftVariantMode, basePrompt: string) => {
    const normalized = basePrompt.trim();
    if (!normalized) return basePrompt;
    const suffix =
      mode === "shorter"
        ? "Haz una versión más corta y directa, en 1-2 frases."
        : mode === "softer"
        ? "Reescribe en un tono más suave y cercano, menos directo."
        : mode === "bolder"
        ? "Reescribe en un tono más directo y claro, sin sonar agresivo."
        : "Dame otra versión distinta manteniendo el tono e intención.";
    return `${normalized}\n\n${suffix}`;
  }, []);

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
        selectedText: options.selectedText ?? null,
        basePrompt: options.basePrompt ?? null,
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
    (text: string, options: { source: DraftSource; label?: string; selectedText?: string | null; basePrompt?: string | null }) => {
      const card = buildDraftCard(text, options);
      addDraftCard(card);
      addGeneratedDraft(buildDraftCard(text, options));
    },
    [addDraftCard, addGeneratedDraft, buildDraftCard]
  );

  const updateDraftCard = useCallback((draftId: string, nextText: string) => {
    if (!id) return;
    setDraftCardsByFan((prev) => {
      const existing = prev[id] ?? [];
      const next = existing.map((item) =>
        item.id === draftId ? { ...item, text: nextText, createdAt: new Date().toISOString() } : item
      );
      return { ...prev, [id]: next };
    });
  }, [id]);

  const requestDraftCardFromPrompt = useCallback(
    (options: { prompt: string; source: DraftSource; label?: string; selectedText?: string | null }) => {
      const trimmed = options.prompt.trim();
      if (!trimmed) return;
      openInternalPanel("manager");
      askInternalManager(trimmed, undefined, undefined, {
        selectedText: options.selectedText ?? null,
        skipChat: true,
        onSuggestions: (bundle) => {
          const nextText = bundle.suggestions[0] ?? "";
          if (!nextText.trim()) return;
          addDraftPair(nextText, {
            source: options.source,
            label: options.label,
            selectedText: options.selectedText ?? null,
            basePrompt: trimmed,
          });
        },
      });
    },
    [addDraftPair, askInternalManager, openInternalPanel]
  );

  const handleDraftCardVariant = useCallback(
    (draftId: string, mode: DraftVariantMode) => {
      if (!id) return;
      const cards = draftCardsByFan[id] ?? [];
      const target = cards.find((item) => item.id === draftId);
      if (!target) return;
      const basePrompt = target.basePrompt?.trim();
      const fallbackMode: SuggestionVariantMode = mode === "shorter" ? "shorter" : "alternate";
      const prompt = basePrompt
        ? buildDraftVariantPrompt(mode, basePrompt)
        : buildManagerVariantPrompt(fallbackMode, target.text);
      askInternalManager(prompt, undefined, undefined, {
        selectedText: target.selectedText ?? null,
        skipChat: true,
        onSuggestions: (bundle) => {
          const nextText = bundle.suggestions[0] ?? target.text;
          if (!nextText.trim()) return;
          updateDraftCard(draftId, nextText);
          addGeneratedDraft(
            buildDraftCard(nextText, {
              source: target.source,
              label: target.label,
              selectedText: target.selectedText ?? null,
              basePrompt: target.basePrompt ?? null,
            })
          );
        },
      });
    },
    [addGeneratedDraft, askInternalManager, buildDraftCard, buildDraftVariantPrompt, buildManagerVariantPrompt, draftCardsByFan, id, updateDraftCard]
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

  const handleManagerChatKeyDown = (evt: KeyboardEvent<HTMLTextAreaElement>) => {
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

  const handleInternalDraftKeyDown = (evt: KeyboardEvent<HTMLTextAreaElement>) => {
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
      focusMainMessageInput(draft);
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
    const newSuggestions = buildSuggestionsForObjective({
      objective: intent,
      fanName: contactName,
      tone: toneToUse,
      state: fanManagerAnalysis.state,
      analysis: fanManagerAnalysis,
    });
    setManagerSuggestions(newSuggestions.slice(0, 3));
    const question = buildQuickIntentQuestion(intent, contactName);
    if (options?.skipInternalChat === false) {
      askInternalManager(question, intent, toneToUse);
    }

    if (autoPilotEnabled && isAutopilotObjective(intent)) {
      await triggerAutopilotDraft(intent, toneToUse);
    }
  };

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


  function handleSelectPack(packId: string) {
    const selectedPack = config.packs.find(pack => pack.id === packId);
    if (!selectedPack) return;

    const mappedType =
      selectedPack.name.toLowerCase().includes("bienvenida") ? "trial" :
      selectedPack.name.toLowerCase().includes("mensual") ? "monthly" :
      selectedPack.name.toLowerCase().includes("especial") ? "special" : selectedPackType;

    setSelectedPackType(mappedType as "trial" | "monthly" | "special");
    fillMessage(buildPackProposalMessage(selectedPack));
    setShowPackSelector(true);
    setOpenPanel("none");
  }

  function handleSelectPackChip(event: MouseEvent<HTMLButtonElement>, type: "trial" | "monthly" | "special") {
    event.stopPropagation();
    setSelectedPackType(type);
    setShowPackSelector(true);
    setOpenPanel("none");
    fillMessageFromPackType(type);
  }

  function changeHandler(evt: KeyboardEvent<HTMLTextAreaElement>) {
    const { key } = evt;

    if (isInternalPanelOpen) return;
    if (key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      if (isSendingRef.current) return;
      if (messageSend.trim()) handleSendMessage();
    }
  }

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
    options?: { preserveComposer?: boolean }
  ) {
    if (!id) return;
    const isInternal = audienceMode === "INTERNAL";
    if (isChatBlocked && !isInternal) {
      setMessagesError("Chat bloqueado. Desbloquéalo para escribir.");
      return;
    }
    const trimmedMessage = text.trim();
    if (!trimmedMessage) return;
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
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) {
        if (!isInternal) {
          setMessage((prev) =>
            (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
          );
        }
        return;
      }
      if (!res.ok || !data?.ok) {
        console.error("Error enviando mensaje");
        setMessagesError(isInternal ? "Error guardando mensaje interno" : "Error enviando mensaje");
        return;
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
        setComposerTarget("fan");
      } else {
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
        resetMessageInputHeight();
        requestAnimationFrame(() => messageInputRef.current?.focus());
      }
    } catch (err) {
      console.error("Error enviando mensaje", err);
      setMessagesError(isInternal ? "Error guardando mensaje interno" : "Error enviando mensaje");
      if (!isInternal) {
        setMessage((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
        );
      }
    }
  }

  async function sendStickerMessage(sticker: LegacyStickerItem) {
    if (!id) return;
    if (!sticker?.id) return;
    if (isChatBlocked) {
      setMessagesError("Chat bloqueado. Desbloquéalo para escribir.");
      return;
    }

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
        text: sticker.label,
      };
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    if (!options?.bypassDuplicateCheck) {
      const duplicate = getDuplicateWarning(trimmed);
      if (duplicate) {
        setDuplicateConfirm({ candidate: trimmed });
        return false;
      }
    }
    if (isSendingRef.current) return false;
    isSendingRef.current = true;
    setIsSending(true);
    try {
      await sendMessageText(trimmed, "CREATOR");
      return true;
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
        resetMessageInputHeight();
        requestAnimationFrame(() => messageInputRef.current?.focus());
      }
      return;
    }
    if (!isFanTarget) {
      setManagerChatInput(trimmed);
      setManagerSelectedText(null);
      setMessageSend("");
      adjustMessageInputHeight();
      openInternalPanelTab("manager");
      focusManagerComposer(true);
      showInlineAction({
        kind: "info",
        title: "Texto listo en Manager IA",
        detail: "No se envía al fan.",
        ttlMs: 2000,
      });
      return;
    }
    const sentText = await sendFanMessage(trimmed);
    if (!sentText) return;
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

  const handleDuplicateRephrase = () => {
    if (!duplicateConfirm?.candidate) return;
    const candidate = duplicateConfirm.candidate;
    setDuplicateConfirm(null);
    askInternalManager(buildDuplicateRephrasePrompt(candidate), undefined, undefined, {
      selectedText: candidate,
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
    if (!id) return;
    const keepOpen = options?.keepOpen ?? false;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const mapped = mapApiMessagesToState(apiMessages);
      if (mapped.length > 0) {
        setMessage((prev) => reconcileMessages(prev || [], mapped, id));
      }
      setMessagesError("");
      setSchemaError(null);
      if (!keepOpen) {
        setShowContentModal(false);
      }
    } catch (err) {
      console.error("Error adjuntando contenido", err);
      setMessagesError("Error adjuntando contenido");
      if (!keepOpen) {
        setShowContentModal(false);
      }
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
    if (messageSend.trim()) {
      setPendingInsert({ text: draft, detail: "Catalogo" });
      return;
    }
    applyComposerInsert(draft, "replace", "Catalogo");
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
      ? "bg-[#25d366]"
      : presenceStatus.color === "recent"
      ? "bg-[#f5c065]"
      : "bg-[#7d8a93]";
  const languageBadgeLabel =
    !conversation.isManager && preferredLanguage ? preferredLanguage.toUpperCase() : null;
  const languageSelectValue = preferredLanguage ?? "auto";
  const isInternalPanelOpen = managerPanelOpen && managerPanelTab === "manager";

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isInternalPanelOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isInternalPanelOpen]);

  const hasComposerPayload = messageSend.trim().length > 0;
  const sendDisabled =
    isSending ||
    !hasComposerPayload ||
    isInternalPanelOpen ||
    (isFanTarget && isChatBlocked);
  const composerPlaceholder = isChatBlocked && isFanTarget
    ? "Has bloqueado este chat. Desbloquéalo para volver a escribir."
    : isFanTarget
    ? "Mensaje al fan..."
    : "Pregúntale al Manager…";
  const mainComposerPlaceholder = isInternalPanelOpen
    ? "Panel interno abierto. Usa el chat interno…"
    : composerPlaceholder;
  const composerActionLabel = isFanTarget ? "Enviar a FAN" : "Enviar al Manager";
  const canAttachContent = isFanTarget && !isChatBlocked && !isInternalPanelOpen;
  const nextActionStatus = getFollowUpStatusFromDate(nextActionDate);
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
  const purchaseKindMeta = {
    EXTRA: { label: "Extra", icon: "gem", tone: "text-emerald-200" },
    TIP: { label: "Propina", icon: "coin", tone: "text-amber-200" },
    GIFT: { label: "Regalo", icon: "gift", tone: "text-sky-200" },
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
    const fanId =
      typeof id === "string" && id.trim()
        ? id
        : typeof router.query.fanId === "string"
        ? router.query.fanId
        : "";
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
    const fanId =
      typeof id === "string" && id.trim()
        ? id
        : typeof router.query.fanId === "string"
        ? router.query.fanId
        : "";
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

  const handleRenewAction = () => {
    const first = getFirstName(contactName) || contactName;
    const text = buildFollowUpExpiredMessage(first);
    fillMessage(text);
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
    ? {
        ok: {
          icon: "check",
          iconClass: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
        },
        info: {
          icon: "info",
          iconClass: "border-sky-400/50 bg-sky-500/10 text-sky-200",
        },
        warn: {
          icon: "alert",
          iconClass: "border-amber-400/60 bg-amber-500/10 text-amber-200",
        },
      }[inlineAction.kind]
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

  return (
    <div className="relative flex flex-col w-full h-[100dvh] max-h-[100dvh]">
      {onBackToBoard && (
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-slate-950/95 border-b border-slate-800 backdrop-blur">
          <button
            type="button"
            onClick={onBackToBoard}
            className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            ← Volver
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            <span className="truncate text-sm font-medium text-slate-50">{contactName}</span>
            {languageBadgeLabel && (
              <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                {languageBadgeLabel}
              </span>
            )}
            {(conversation.isHighPriority || (conversation.extrasCount ?? 0) > 0) && (
              <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                {conversation.isHighPriority ? (
                  <span className="inline-flex items-center gap-1">
                    <IconGlyph name="pin" className="h-3.5 w-3.5" />
                    <span>Alta</span>
                  </span>
                ) : (
                  "Extras"
                )}
              </span>
            )}
            {nextActionStatus && (
              <span
                className={clsx(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  nextActionStatus.tone === "overdue" &&
                    "border-rose-400/70 bg-rose-500/15 text-rose-100",
                  nextActionStatus.tone === "today" &&
                    "border-amber-400/70 bg-amber-500/15 text-amber-100",
                  nextActionStatus.tone === "tomorrow" &&
                    "border-sky-400/70 bg-sky-500/15 text-sky-100"
                )}
              >
                <span className="inline-flex items-center gap-1">
                  <IconGlyph name="clock" className="h-3.5 w-3.5" />
                  <span>{nextActionStatus.label}</span>
                </span>
              </span>
            )}
          </div>
        </header>
      )}
      <div className="flex flex-1 min-h-0 min-w-0">
        <div ref={rightPaneRef} className="relative flex flex-col flex-1 min-h-0 min-w-0 h-full">
          <header ref={fanHeaderRef} className="sticky top-0 z-20 backdrop-blur">
            <div className="max-w-4xl mx-auto w-full bg-slate-950/70 border-b border-slate-800 px-4 py-3 md:px-6 md:py-4 flex flex-col gap-3">
          {/* Piso 1 */}
          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0 flex-1 order-1">
              <Avatar width="w-10" height="h-10" image={image} />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-base font-semibold text-slate-50 truncate">{contactName}</h1>
                  {languageBadgeLabel && (
                    <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                      {languageBadgeLabel}
                    </span>
                  )}
                  {conversation.isHighPriority && (
                    <span className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-100 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <IconGlyph name="pin" className="h-3.5 w-3.5" />
                        <span>Alta</span>
                      </span>
                    </span>
                  )}
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${presenceDotClass}`}
                    aria-label={presenceStatus.label}
                    title={presenceStatus.label}
                  />
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {membershipDetails || packLabel || "Suscripción"}
                </p>
              </div>
            </div>
            <div className="order-2 ml-auto sm:order-3 sm:ml-0">
              <ConversationActionsMenu
                conversation={conversation}
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
                className="inline-flex items-center rounded-full border border-emerald-500/70 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
              >
                Ver ficha
              </button>
            </div>
          </div>

          {/* Piso 2 */}
          <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-amber-200 whitespace-nowrap">
              {packLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-200 whitespace-nowrap">
              {formatTier(conversation.customerTier)}
            </span>
            {conversation.isHighPriority && (
              <span className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-100 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <IconGlyph name="pin" className="h-3.5 w-3.5" />
                  <span>Alta prioridad</span>
                </span>
              </span>
            )}
            {extrasCountDisplay > 0 && (
              <span className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 whitespace-nowrap">
                Extras
              </span>
            )}
            {nextActionStatus && (
              <span
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold whitespace-nowrap",
                  nextActionStatus.tone === "overdue" &&
                    "border-rose-400/70 bg-rose-500/15 text-rose-100",
                  nextActionStatus.tone === "today" &&
                    "border-amber-400/70 bg-amber-500/15 text-amber-100",
                  nextActionStatus.tone === "tomorrow" &&
                    "border-sky-400/70 bg-sky-500/15 text-sky-100"
                )}
              >
                <span className="inline-flex items-center gap-1">
                  <IconGlyph name="clock" className="h-3.5 w-3.5" />
                  <span>{nextActionStatus.label}</span>
                </span>
              </span>
            )}
          </div>

          {/* Piso 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 md:gap-x-6 text-xs text-slate-300 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-slate-400">Última conexión:</span>
              <span className="truncate">{presenceStatus.label || "Sin actividad reciente"}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-slate-400">Extras:</span>
              <span className="truncate">
                {extrasCountDisplay} · {extrasSpentDisplay} €
                {showTipsInline ? ` · Propinas: ${tipsInlineLabel}` : ""}
              </span>
            </div>
            <div className="md:col-span-2 flex items-start gap-2 min-w-0">
              <span className="text-slate-400">Seguimiento:</span>
              <span
                className="min-w-0 line-clamp-1 md:line-clamp-2 text-slate-200"
                title={followUpLabel || ""}
              >
                {followUpLabel || "Sin seguimiento definido"}
              </span>
              {isFollowUpNoteMissing && (
                <button
                  type="button"
                  onClick={handleAddFollowUpNote}
                  className="shrink-0 rounded-full border border-amber-400/70 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/20"
                >
                  Añadir nota
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      {isChatBlocked && (
        <div className="mx-4 mt-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs md:text-sm text-red-200 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
          <span>Chat bloqueado. No puedes enviar mensajes nuevos a este fan.</span>
        </div>
      )}
      {/* Avisos de acceso caducado o a punto de caducar */}
      {isAccessExpired && (
        <div className="mx-4 mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-amber-200">Acceso caducado · sin pack activo</span>
            <span className="text-[11px] text-amber-100/90">
              Puedes enviarle un mensaje de reenganche y decidir después si le das acceso a nuevos contenidos.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20"
              onClick={handleRenewAction}
            >
              Mensaje de reenganche
            </button>
          </div>
        </div>
      )}
      {conversation.membershipStatus === "active" && typeof effectiveDaysLeft === "number" && effectiveDaysLeft <= 1 && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-100">
          {effectiveDaysLeft <= 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                  CADUCA HOY
                </span>
                <span className="inline-flex items-center rounded-full border border-rose-400/70 bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-100">
                  Crítico
                </span>
              </div>
              <span className="text-[11px] text-amber-100/90">
                Es el momento de renovar hoy mismo para mantener el acceso.
              </span>
            </div>
          ) : (
            <span className="font-medium text-amber-100">
              Le queda {effectiveDaysLeft === 1 ? "1 día" : `${effectiveDaysLeft} días`} de acceso. Buen momento para proponer el siguiente paso.
            </span>
          )}
        </div>
      )}
      {isQueueActive && (
        <div className="mt-2 mb-3 flex items-center justify-between rounded-xl border border-amber-500/60 bg-slate-900/70 px-3 py-2 text-xs">
          <div className="flex flex-col gap-1 truncate">
            <span className="font-semibold text-amber-300 flex items-center gap-1">
              <IconGlyph name="spark" className="h-3.5 w-3.5" />
              <span>Siguiente recomendado</span>
              {recommendedFan && (recommendedFan.customerTier === "priority" || recommendedFan.customerTier === "vip") && (
                <span className="inline-flex items-center gap-1 text-[10px] rounded-full bg-amber-500/20 px-2 text-amber-200">
                  <IconGlyph name="pin" className="h-3 w-3" />
                  <span>Alta prioridad</span>
                </span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-200">
              <span>Atendidos: {attendedInQueueToday}/{queueTotal}</span>
              {queueTotal > 0 && currentQueuePosition > 0 && (
                <span>Actual: {currentQueuePosition}/{queueTotal}</span>
              )}
            </div>
            {queueFans.length === 0 && (
              <span className="text-slate-400">No hay cola activa.</span>
            )}
            {queueFans.length > 0 && !recommendedFan && (
              <span className="text-slate-400">Cola terminada · Atendidos {attendedInQueueToday}/{queueTotal}</span>
            )}
            {recommendedFan && recommendedFan.id !== id && (
              <>
                <span className="truncate text-slate-200">
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
                    <span className="text-[11px] text-slate-400 truncate" title={nextLabel}>
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
                className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                onClick={handlePrevInQueue}
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/20 disabled:opacity-60"
              onClick={handleNextInQueue}
              disabled={!isQueueActive || queueFans.length === 0 || !recommendedFan}
            >
              Siguiente
            </button>
            {recommendedFan && recommendedFan.id !== id && (
              <button
                type="button"
                className="rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/20"
                onClick={() => handleSelectFanFromBanner(recommendedFan)}
              >
                Abrir
              </button>
            )}
            {!recommendedFan && queueFans.length > 0 && (
              <button
                type="button"
                className="rounded-full border border-slate-600 bg-slate-800/70 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
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
        <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-xs text-slate-100 flex flex-col gap-3 max-h-64">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100">Historial de cobros</span>
              {purchaseHistoryLoading && <span className="text-[11px] text-slate-400">Cargando...</span>}
            </div>
            <button
              type="button"
              onClick={() => setOpenPanel("none")}
              className="rounded-full border border-slate-600 bg-slate-800/80 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
            >
              Cerrar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">Total gastado</span>
              <span className="text-[12px] font-semibold text-slate-50">{Math.round(historyTotals.totalSpent)} €</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">Extras</span>
              <span className="text-[12px] font-semibold text-slate-50">{Math.round(historyTotals.extrasAmount)} €</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">Propinas</span>
              <span className="text-[12px] font-semibold text-slate-50">
                {Math.round(historyTotals.tipsAmount)} €
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">Regalos</span>
              <span className="text-[12px] font-semibold text-slate-50">{Math.round(historyTotals.giftsAmount)} €</span>
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
                    ? "border-emerald-400/80 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-500/80 hover:text-slate-100"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {historyError && <div className="text-[11px] text-rose-300">{historyError}</div>}
          {!historyError && !purchaseHistoryLoading && filteredPurchaseHistory.length === 0 && (
            <div className="text-[11px] text-slate-400">Sin movimientos.</div>
          )}
          {filteredPurchaseHistory.length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {filteredPurchaseHistory.map((entry) => {
                const meta = purchaseKindMeta[entry.kind] ?? {
                  label: "Compra",
                  icon: "receipt",
                  tone: "text-slate-200",
                };
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
                  <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <IconGlyph name={meta.icon} className={clsx("h-4 w-4", meta.tone)} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[12px] font-semibold text-slate-100 truncate">{title}</span>
                          <span className="text-[10px] text-slate-400">{formatNoteDate(entry.createdAt)}</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-semibold text-slate-100">{Math.round(entry.amount)} €</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {iaMessage && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
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
            <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {followUpTag === "trial_soon" &&
                    `Próxima acción · Prueba · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                  {followUpTag === "monthly_soon" &&
                    `Próxima acción · Suscripción · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                  {followUpTag === "expired" && "Próxima acción · Acceso caducado"}
                </span>
                {accessGrantsLoading && <span className="text-[10px] text-slate-400">Actualizando...</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {followUpTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => fillMessage(tpl.text)}
                    className="inline-flex items-center rounded-full border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/20 transition"
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
        <div
          ref={messagesContainerRef}
          className="flex flex-col w-full flex-1 min-h-0 overflow-y-auto"
          style={{ backgroundImage: "url('/assets/images/background.jpg')" }}
        >
          <div
            className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6"
            style={{ paddingBottom: messageListBottomPadding }}
          >
            {schemaError && (
              <div className="mb-4 rounded-xl border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-rose-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">DB fuera de sync</div>
                    <p className="text-xs text-rose-100/80">{schemaError.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySchemaFix}
                    className="rounded-full border border-rose-400/70 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/30 transition"
                  >
                    {schemaCopyLabel}
                  </button>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-rose-100/90">
                  {schemaFixCommands.map((cmd) => (
                    <code key={cmd} className="rounded-md bg-rose-950/50 px-2 py-1 font-mono">
                      {cmd}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {messages.map((messageConversation, index) => {
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
              const translatedText = !me ? messageConversation.translatedText ?? undefined : undefined;
              const messageId = messageConversation.id || `message-${index}`;
              const messageReactions = reactionsStore[messageId] ?? [];
              return (
                <div key={messageConversation.id || index} className="space-y-1">
                  <MessageBalloon
                    me={me}
                    message={message}
                    messageId={messageId}
                    seen={seen}
                    time={time}
                    status={messageConversation.status}
                    translatedText={isStickerMessage ? undefined : translatedText}
                    badge={isInternalMessage ? "INTERNO" : undefined}
                    variant={isInternalMessage ? "internal" : "default"}
                    onContextMenu={handleMessageContextMenu}
                    stickerSrc={isStickerMessage ? messageConversation.stickerSrc ?? null : null}
                    stickerAlt={isStickerMessage ? messageConversation.stickerAlt ?? "Sticker" : null}
                    enableReactions={!isInternalMessage}
                    reactionFanId={activeFanId || undefined}
                    reactions={isInternalMessage ? [] : messageReactions}
                  />
                  {messageConversation.status === "failed" && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-[11px] text-rose-300 hover:text-rose-200 underline"
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
              <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>
            )}
            {messagesError && !isLoadingMessages && (
              <div className="text-center text-red-400 text-sm mt-2">{messagesError}</div>
            )}
            {inlineAction && (
              <div className="mt-3">
                <div className="relative flex items-start gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-xs text-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.25)] ring-1 ring-white/5 backdrop-blur">
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
                    <div className="text-[12px] font-semibold text-slate-100">{inlineAction.title}</div>
                    {inlineAction.detail && (
                      <div className="text-[11px] text-slate-400 line-clamp-1">{inlineAction.detail}</div>
                    )}
                  </div>
                  {inlineAction.undoLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        inlineAction.onUndo?.();
                        clearInlineAction();
                      }}
                      className="inline-flex h-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900/60 px-3 text-[11px] font-semibold text-slate-100 transition hover:border-slate-500/80 hover:bg-slate-800/80"
                    >
                      {inlineAction.undoLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearInlineAction}
                    className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800/80 hover:text-slate-100"
                    aria-label="Cerrar aviso"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {process.env.NEXT_PUBLIC_DEBUG_CHAT === "1" && (
          <div className="fixed bottom-2 right-2 text-[11px] text-slate-200 bg-slate-900/80 border border-slate-700 px-2 py-1 rounded">
            fanId={id || "none"} | loading={String(isLoadingMessages)} | msgs={messages.length} | error={messagesError || "none"}
          </div>
        )}
        <div className="flex flex-col bg-[#202c33] w-full h-auto py-3 px-4 text-[#8696a0] gap-3 flex-shrink-0 overflow-visible">
          {showExtraTemplates && (
            <div className="flex flex-col gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3 w-full">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-white">Historial de ventas extra</h3>
                    <p className="text-[11px] text-slate-400">Registra las ventas desde el modal de Extras PPV. Aquí solo ajustes manuales.</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <h3 className="text-sm font-semibold text-white">Historial de ventas extra</h3>
                      <p className="text-[11px] text-slate-400">Registra las ventas desde el modal de Extras PPV. Aquí solo ajustes manuales.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[11px] text-slate-300">
                        <span>Modo</span>
                        <div className="inline-flex rounded-full border border-slate-600 bg-slate-900">
                          {(["DAY", "NIGHT"] as TimeOfDayValue[]).map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setTimeOfDay(val)}
                              className={clsx(
                                "px-2 py-0.5 text-[11px] font-semibold rounded-full",
                                timeOfDay === val
                                  ? "bg-amber-500/20 text-amber-100 border border-amber-400/70"
                                  : "text-slate-200"
                              )}
                            >
                              {val === "DAY" ? "Día" : "Noche"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-slate-600 bg-slate-800/80 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                        onClick={() => setOpenPanel("none")}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Historial de extras</h4>
                  {isLoadingExtraHistory && <span className="text-[11px] text-slate-400">Cargando...</span>}
                </div>
                <div className="text-[11px] text-slate-400">
                  {(conversation.extrasCount ?? 0) > 0 ? (
                    <span>
                      {`Este fan te ha comprado ${conversation.extrasCount} extra${(conversation.extrasCount ?? 0) !== 1 ? "s" : ""} por un total de ${Math.round(conversation.extrasSpentTotal ?? 0)} €.`}
                    </span>
                  ) : (
                    <span>Todavía no has vendido extras a este fan.</span>
                  )}
                </div>
                {extraHistoryError && <div className="text-xs text-rose-300">{extraHistoryError}</div>}
                {!extraHistoryError && extraHistory.length === 0 && (
                  <div className="text-xs text-slate-400">Todavía no hay extras registrados para este fan.</div>
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
                          className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{entry.contentItem?.title || "Extra"}</span>
                            <span className="text-slate-400">{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-300">
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
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Ventas manuales</span>
                    <button
                      type="button"
                      className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                      onClick={() => setShowManualExtraForm((prev) => !prev)}
                    >
                      {showManualExtraForm ? "Cerrar" : "Añadir venta manual"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Uso avanzado: registra ventas que no pasaron por el flujo de Manager IA.
                  </p>
                  {showManualExtraForm && (
                    <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                      <div className="flex flex-col md:flex-row gap-2">
                        <select
                          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
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
                          className="w-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                          value={extraAmount}
                          onChange={(e) => setExtraAmount(e.target.value === "" ? "" : Number(e.target.value))}
                          placeholder="Importe"
                        />
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                          onClick={async () => {
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
                            const result = await registerExtraSale({
                              fanId: id,
                              extraId: item.id,
                              amount: amountNumber,
                              tier,
                              sessionTag,
                              source: "manual_panel",
                            });
                            if (!result.ok) {
                              setExtraError(result.error || "No se pudo registrar el extra.");
                              return;
                            }
                            setSelectedExtraId("");
                            setExtraAmount("");
                            setShowManualExtraForm(false);
                          }}
                        >
                          Registrar extra
                        </button>
                      </div>
                      {extraError && <div className="text-[11px] text-rose-300">{extraError}</div>}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Historial de extras</h4>
                  {isLoadingExtraHistory && <span className="text-[11px] text-slate-400">Cargando...</span>}
                </div>
                <div className="text-[11px] text-slate-400">
                  {(conversation.extrasCount ?? 0) > 0 ? (
                    <span>
                      {`Este fan te ha comprado ${conversation.extrasCount} extra${(conversation.extrasCount ?? 0) !== 1 ? "s" : ""} por un total de ${Math.round(conversation.extrasSpentTotal ?? 0)} €.`}
                    </span>
                  ) : (
                    <span>Todavía no has vendido extras a este fan.</span>
                  )}
                </div>
                {extraHistoryError && <div className="text-xs text-rose-300">{extraHistoryError}</div>}
                {!extraHistoryError && extraHistory.length === 0 && (
                  <div className="text-xs text-slate-400">Todavía no hay extras registrados para este fan.</div>
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
                          className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{entry.contentItem?.title || "Extra"}</span>
                            <span className="text-slate-400">{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-300">
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
          <div className="sticky bottom-0 z-30 border-t border-slate-800/60 bg-gradient-to-b from-slate-950/90 via-slate-950/80 to-slate-950/70 backdrop-blur-xl">
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-2.5">
              {internalToast && <div className="mb-2 text-[11px] text-emerald-300">{internalToast}</div>}
              {composerDock?.chips}
              <ChatComposerBar
                value={messageSend}
                onChange={(evt) => {
                  setMessageSend(evt.target.value);
                  autoGrowTextarea(evt.currentTarget, MAX_MAIN_COMPOSER_HEIGHT);
                }}
                onKeyDown={(evt) => changeHandler(evt)}
                onSend={handleSendMessage}
                sendDisabled={sendDisabled}
                placeholder={mainComposerPlaceholder}
                actionLabel={composerActionLabel}
                audience={composerAudience}
                onAudienceChange={(mode) => {
                  setComposerTarget(mode === "CREATOR" ? "fan" : "manager");
                }}
                canAttach={canAttachContent}
                onAttach={() => {
                  if (!canAttachContent) return;
                  openAttachContent({ closeInline: false });
                }}
                showEmoji={isFanTarget}
                onEmojiSelect={handleInsertEmoji}
                showStickers={isFanTarget}
                onStickerSelect={handleInsertSticker}
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
      {selectionToolbar && (
        <div
          className="fixed inset-0 z-40 pointer-events-none"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            ref={selectionToolbarRef}
            className="absolute pointer-events-auto"
            style={{
              left: selectionToolbar.x,
              top: selectionToolbar.y,
              maxWidth: selectionToolbar.maxWidth,
            }}
            onPointerDown={handleToolbarPointerDown}
          >
            <div
              className={clsx(
                "flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/95 px-3 py-2 shadow-xl",
                "whitespace-nowrap overflow-x-auto",
                "[-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden"
              )}
            >
              <button
                type="button"
                onClick={handleSelectionQuote}
                onPointerDown={handleToolbarPointerDown}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/70"
              >
                Citar al Manager
              </button>
              <button
                type="button"
                onClick={handleSelectionRephrase}
                onPointerDown={handleToolbarPointerDown}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/70"
              >
                Reformular
              </button>
              <button
                type="button"
                onClick={handleSelectionCopy}
                onPointerDown={handleToolbarPointerDown}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/70"
              >
                Copiar
              </button>
              <button
                type="button"
                onClick={handleSelectionSaveProfile}
                onPointerDown={handleToolbarPointerDown}
                className="inline-flex items-center gap-1 rounded-full border border-amber-400/70 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Guardar en Perfil
              </button>
              <button
                type="button"
                onClick={handleSelectionCreateFollowUp}
                onPointerDown={handleToolbarPointerDown}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
              >
                Crear seguimiento
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingInsert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl">
            <div className="text-sm font-semibold text-slate-100">Ya tienes un mensaje escrito</div>
            <div className="mt-1 text-[11px] text-slate-400">
              ¿Cómo quieres insertar esta sugerencia?
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  applyComposerInsert(pendingInsert.text, "append", pendingInsert.detail);
                  setPendingInsert(null);
                }}
                className="inline-flex w-full items-center justify-center rounded-full border border-emerald-500/70 bg-emerald-500/15 px-4 py-2 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-500/25"
              >
                Añadir abajo
              </button>
              <button
                type="button"
                onClick={() => {
                  applyComposerInsert(pendingInsert.text, "prepend", pendingInsert.detail);
                  setPendingInsert(null);
                }}
                className="inline-flex w-full items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-[12px] font-semibold text-slate-100 hover:bg-slate-800/70"
              >
                Añadir arriba
              </button>
              <button
                type="button"
                onClick={() => {
                  applyComposerInsert(pendingInsert.text, "replace", pendingInsert.detail);
                  setPendingInsert(null);
                }}
                className="inline-flex w-full items-center justify-center rounded-full border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-[12px] font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Reemplazar
              </button>
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="mt-1 inline-flex w-full items-center justify-center rounded-full border border-slate-700/70 bg-transparent px-4 py-2 text-[12px] font-semibold text-slate-300 hover:bg-slate-900/40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {showContentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-white">Adjuntar contenido</h3>
                <p className="text-sm text-slate-300">
                  {contentModalMode === "catalog"
                    ? "Elige un item del catalogo para insertar en el mensaje."
                    : "Elige que quieres enviar a este fan segun sus packs."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-700 bg-slate-800/60 p-1">
                  {(["packs", "extras", "catalog"] as const).map((mode) => {
                    const isActive = contentModalMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={clsx(
                          "px-3 py-1 text-[11px] font-semibold rounded-full transition",
                          isActive
                            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                            : "text-slate-200"
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
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
              </div>
            </div>
            {contentModalMode === "extras" && (
              <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-1">
                  <span>Momento</span>
                  <div className="inline-flex rounded-full border border-slate-600 bg-slate-900">
                    {(["day", "night"] as TimeOfDayFilter[]).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTimeOfDayFilter(val)}
                        className={clsx(
                          "px-2 py-1 rounded-full",
                          timeOfDayFilter === val
                            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                            : "text-slate-200"
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
                          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                          : "text-slate-200"
                      )}
                    >
                      Todos
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-1">
                  <span>Tier</span>
                  <select
                    className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white"
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
                <div className="text-sm text-rose-300">No se ha podido cargar la informacion de packs.</div>
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
                    ? "border-emerald-400 text-emerald-200 bg-emerald-500/10"
                    : "border-slate-600 text-slate-300";
                  const packItems = contentItems.filter((item) => item.pack === packMeta.code);
                  return (
                    <div
                      key={packMeta.code}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"
                      ref={contentModalPackFocus === packMeta.code ? (el) => {
                        if (el && showContentModal && contentModalMode === "packs") {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      } : undefined}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-white">{packMeta.label}</div>
                        <div className="flex items-center gap-2">
                          <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border", badgeClass)}>
                            {badgeText}
                          </span>
                          {!isUnlocked && packMeta.code === "MONTHLY" && canOfferMonthly && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-amber-200 underline-offset-2 hover:underline"
                              onClick={() => handleOfferPack("monthly")}
                            >
                              Ofrecer suscripción mensual
                            </button>
                          )}
                          {!isUnlocked && packMeta.code === "SPECIAL" && canOfferSpecial && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-amber-200 underline-offset-2 hover:underline"
                              onClick={() => handleOfferPack("special")}
                            >
                              Ofrecer Pack especial
                            </button>
                          )}
                        </div>
                      </div>
                      {contentLoading && packItems.length === 0 && (
                        <div className="text-xs text-slate-400 mt-2">Cargando contenidos…</div>
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
                                  ? "border-slate-800 bg-slate-900/40 text-slate-500 cursor-not-allowed opacity-60"
                                  : selected
                                  ? "border-amber-400 bg-amber-500/10 text-amber-100"
                                  : "border-slate-800 bg-slate-900/80 text-slate-100 hover:border-amber-400/60"
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
                                  <span className="text-[10px] text-emerald-300 border border-emerald-400/60 rounded-full px-2 py-[1px]">
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
                                  className="h-4 w-4 accent-amber-400"
                                />
                              )}
                            </label>
                          );
                        })}
                        {!contentLoading && packItems.length === 0 && (
                          <div className="text-xs text-slate-500">No hay contenidos en este pack.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              {!contentError && contentModalMode === "extras" && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
                  <div className="text-sm font-semibold text-white">Extras PPV</div>
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
                                ? "border-amber-400 bg-amber-500/10 text-amber-100"
                                : "border-slate-800 bg-slate-900/80 text-slate-100 hover:border-amber-400/60"
                            )}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <IconGlyph name={typeIcon} className="h-4 w-4" />
                                <span>{item.title}</span>
                                {item.hasBeenSentToFan && (
                                  <span className="text-[10px] text-emerald-300 border border-emerald-400/60 rounded-full px-2 py-[1px]">
                                    Enviado
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2">
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
                                className="h-4 w-4 accent-amber-400"
                              />
                              {selected && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-200">
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
                                    className="w-20 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-right text-xs text-white"
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
                        <div className="text-xs text-slate-500">No hay extras PPV todavía.</div>
                      )}
                  </div>
                </div>
              )}
              {contentModalMode === "catalog" && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="Buscar..."
                      className="w-full sm:max-w-[240px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    />
                    <div className="inline-flex rounded-full border border-slate-700 bg-slate-800/60 p-1 text-[10px] font-semibold">
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
                                ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                                : "text-slate-200"
                            )}
                          >
                            {entry.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {catalogLoading && <div className="text-xs text-slate-400">Cargando catalogo...</div>}
                  {catalogError && <div className="text-xs text-rose-300">{catalogError}</div>}
                  {!catalogLoading && !catalogError && filteredCatalogItems.length === 0 && (
                    <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-3 text-xs text-slate-400 space-y-2">
                      <div>No tienes catalogo aun. Ve a Cortex → Catalogo para crear items.</div>
                      <button
                        type="button"
                        onClick={() => {
                          void router.push("/creator/manager");
                        }}
                        className="inline-flex items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25"
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
                            className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-slate-700/70 bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                                    {item.type}
                                  </span>
                                  <span
                                    className={clsx(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                      item.isActive
                                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                                        : "border-slate-700/70 bg-slate-950/60 text-slate-300"
                                    )}
                                  >
                                    {item.isActive ? "Activo" : "Inactivo"}
                                  </span>
                                  <span
                                    className={clsx(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                      item.isPublic
                                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                                        : "border-slate-700/70 bg-slate-950/60 text-slate-300"
                                    )}
                                  >
                                    {item.isPublic ? "Publico" : "Oculto"}
                                  </span>
                                </div>
                                <div className="mt-1 text-[13px] font-semibold text-slate-100 truncate">{item.title}</div>
                                {item.description && (
                                  <div className="text-[11px] text-slate-400 truncate">{item.description}</div>
                                )}
                                {includesPreview && (
                                  <div className="text-[11px] text-slate-500 truncate">{includesPreview}</div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className="text-[12px] font-semibold text-slate-100">
                                  {formatCatalogPriceCents(item.priceCents, item.currency)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCatalogInsert(item)}
                                  className="inline-flex items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25"
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
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                <label className="flex items-center gap-2 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-400"
                    checked={registerExtrasChecked}
                    onChange={(e) => setRegisterExtrasChecked(e.target.checked)}
                  />
                  <span>Registrar esta venta en &quot;Ventas extra&quot;</span>
                </label>
                <span className="text-[11px] text-slate-400">Total: {Math.round(selectedExtrasTotal)} €</span>
              </div>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
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
                  disabled={selectedContentIds.length === 0 || !!contentError}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selectedContentIds.length === 0 || !!contentError
                      ? "border-slate-700 bg-slate-800/60 text-slate-500 cursor-not-allowed"
                      : "border-amber-400 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                  )}
                  onClick={async () => {
                    if (selectedContentIds.length === 0) return;
                    const chosen = contentItems.filter((item) => selectedContentIds.includes(item.id));
                    if (chosen.length === 0) return;
                    // Enviamos cada contenido como mensaje CONTENT para mantener consistencia con /api/messages.
                    const sentItems: ContentWithFlags[] = [];
                    for (const item of chosen) {
                      // eslint-disable-next-line no-await-in-loop
                      await handleAttachContent(item, { keepOpen: true });
                      sentItems.push(item);
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
                        });
                        if (!result.ok) {
                          failed.push(item.title || "Extra");
                        }
                      }
                      if (failed.length > 0) {
                        alert('Contenido enviado, pero no se ha podido registrar la venta. Inténtalo desde "Ventas extra".');
                      }
                    }
                    setShowContentModal(false);
                    setSelectedContentIds([]);
                    setContentModalPackFocus(null);
                    setRegisterExtrasChecked(false);
                    setRegisterExtrasSource(null);
                    setTransactionPrices({});
                  }}
                >
                  {selectedContentIds.length <= 1
                    ? "Enviar 1 elemento"
                    : `Enviar ${selectedContentIds.length} elementos`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {duplicateConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">Este mensaje se parece mucho al anterior</h3>
            <p className="mt-2 text-sm text-slate-300">
              Puede sonar repetido. ¿Quieres enviarlo igualmente?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateConfirm(null)}
                className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500/80 hover:bg-slate-800/70"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDuplicateRephrase}
                className="rounded-full border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Reformular para variar
              </button>
              <button
                type="button"
                onClick={handleConfirmDuplicateSend}
                className="rounded-full border border-emerald-500/60 bg-emerald-600/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/30"
              >
                Enviar igual
              </button>
            </div>
          </div>
        </div>
      )}
      {showQuickSheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl bg-slate-900 border border-slate-700 shadow-xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-300">Ficha rápida</h2>
              <button
                type="button"
                onClick={() => setShowQuickSheet(false)}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Avatar width="w-10" height="h-10" image={image} />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-base font-semibold text-slate-50 truncate">{contactName}</div>
                  <button
                    type="button"
                    onClick={handleOpenEditName}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-100"
                  >
                    <IconGlyph name="edit" className="h-3.5 w-3.5" />
                    <span>Editar</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center rounded-full bg-slate-800/80 text-amber-200 px-2 py-[1px]">
                    {packLabel}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-800/80 text-slate-200 px-2 py-[1px]">
                    {formatTier(conversation.customerTier)}
                  </span>
                  {conversation.isHighPriority && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/20 text-amber-200 px-2 py-[1px]">
                      <span className="inline-flex items-center gap-1">
                        <IconGlyph name="pin" className="h-3 w-3" />
                        <span>Alta prioridad</span>
                      </span>
                    </span>
                  )}
                  {extrasCountDisplay > 0 && (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-100 px-2 py-[1px]">
                      Extras
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Total gastado</span>
                <span className="font-semibold text-slate-50">{Math.round(lifetimeAmount)} €</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Extras</span>
                <span className="font-medium text-slate-50">
                  {extrasCountDisplay} extra{extrasCountDisplay === 1 ? "" : "s"} · {extrasSpentDisplay} €
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Propinas</span>
                <span className="font-medium text-slate-50">
                  {tipsCountDisplay === null || tipsSpentDisplay === null
                    ? "—"
                    : `${tipsCountDisplay} propina${tipsCountDisplay === 1 ? "" : "s"} · ${tipsSpentDisplay} €`}
                </span>
              </div>
              {showGiftsRow && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Regalos</span>
                  <span className="font-medium text-slate-50">
                    {giftsCountDisplay === null
                      ? `${giftsSpentDisplay} €`
                      : `${giftsCountDisplay} regalo${giftsCountDisplay === 1 ? "" : "s"} · ${giftsSpentDisplay} €`}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Idioma</span>
                <select
                  value={languageSelectValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "auto") return;
                    handlePreferredLanguageChange(value as SupportedLanguage);
                  }}
                  disabled={preferredLanguageSaving}
                  className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-[11px] font-semibold text-slate-100 focus:border-emerald-400"
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
              {preferredLanguageError && <p className="text-xs text-rose-300">{preferredLanguageError}</p>}
              <div className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <span className="text-slate-400 text-xs">Seguimiento</span>
                <span className="text-slate-50 text-sm leading-snug" title={followUpLabel || ""}>
                  {followUpLabel || "Sin seguimiento definido"}
                </span>
                {isFollowUpNoteMissing && (
                  <button
                    type="button"
                    onClick={handleAddFollowUpNote}
                    className="self-start rounded-full border border-amber-400/70 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/20"
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
                className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 hover:bg-slate-800"
              >
                Perfil + seguimiento
              </button>
              <button
                type="button"
                onClick={handleOpenHistoryFromSheet}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
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
                    ? "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                    : "border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800"
                )}
              >
                {inviteCopyState === "copied"
                  ? "Enlace copiado"
                  : inviteCopyState === "loading"
                  ? "Generando enlace..."
                  : "Copiar enlace de invitación"}
              </button>
              {inviteCopyUrl && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300 break-all">
                  {inviteCopyUrl}
                </div>
              )}
              {inviteCopyToast && <p className="text-xs text-emerald-300">{inviteCopyToast}</p>}
              {inviteCopyError && <p className="text-xs text-rose-300">{inviteCopyError}</p>}
            </div>
          </div>
        </div>
      )}
      {isEditNameOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl bg-slate-900 border border-slate-700 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-200">Editar nombre del fan</h2>
              <button
                type="button"
                onClick={closeEditNameModal}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span>Nombre o alias</span>
              <input
                className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                placeholder="Ej: Ana"
              />
            </label>
            {editNameError && <p className="text-xs text-rose-300">{editNameError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
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
                    ? "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                    : "border-emerald-400 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
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
    if (visibilityLabel.toLowerCase().includes("vip")) return "border-amber-400/80 text-amber-200";
    if (visibilityLabel.toLowerCase().includes("extra")) return "border-sky-400/70 text-sky-200";
    if (visibilityLabel.toLowerCase().includes("incluido")) return "border-emerald-400/70 text-emerald-200";
    return "border-slate-600 text-slate-200";
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
          "flex flex-col min-w-[5%] max-w-[65%] p-3 text-white rounded-lg mb-3 shadow-sm border",
          isInternal ? "bg-amber-500/10 border-amber-400/50" : "bg-[#202c33] border-slate-800"
        )}
      >
        {isInternal && (
          <span className="mb-2 inline-flex w-fit items-center rounded-full border border-amber-400/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
            INTERNO
          </span>
        )}
        <div className="flex items-center gap-2 text-sm font-semibold">
          <IconGlyph name={iconName} className="h-4 w-4 text-slate-200" />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-1">
          <span>{typeLabel}</span>
          {visibilityLabel && <span className="w-1 h-1 rounded-full bg-slate-600" />}
          {visibilityLabel && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${badgeClass}`}>
              {visibilityLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className="mt-2 inline-flex w-fit items-center rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-amber-200 hover:border-amber-400/70 hover:text-amber-100 transition"
          onClick={openContent}
        >
          Ver contenido
        </button>
        <div className="flex justify-end items-center gap-2 text-[hsla(0,0%,100%,0.6)] text-xs mt-2">
          <span>{message.time}</span>
          {message.me && message.seen ? (
            <span className="inline-flex items-center gap-1 text-[#8edafc] text-[11px]">
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
