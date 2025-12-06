import { KeyboardEvent, MouseEvent, useContext, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import MessageBalloon from "../MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { Message as ApiMessage, Fan } from "../../types/chat";
import { Message as ConversationMessage, ConversationListData } from "../../types/Conversation";
import { getAccessLabel, getAccessState, getAccessSummary } from "../../lib/access";
import { FollowUpTag, getFollowUpTag, getUrgencyLevel } from "../../utils/followUp";
import { PACKS } from "../../config/packs";
import { getRecommendedFan } from "../../utils/recommendedFan";
import { ContentItem, getContentTypeLabel, getContentVisibilityLabel } from "../../types/content";
import { EditExtraPresetsModal } from "../conversation/EditExtraPresetsModal";
import { loadUnreadMap, saveUnreadMap, updateLastReadForFan } from "../../utils/unread";
import { getTimeOfDayTag } from "../../utils/contentTags";
import {
  buildExtraText,
  ExtraPresetKind,
  ExtraPresetsConfig,
  getPresetKeyFor,
  loadExtraPresets,
  saveExtraPresets,
} from "../../config/extrasPresets";
import { HIGH_PRIORITY_LIMIT } from "../../config/customers";
import { EXTRAS_UPDATED_EVENT } from "../../constants/events";
import { AiTone, normalizeTone, ACTION_TYPE_FOR_USAGE } from "../../lib/aiQuickExtra";
import { AiTemplateUsage, AiTurnMode } from "../../lib/aiTemplateTypes";
import { getAccessSnapshot, getChatterProPlan } from "../../lib/chatPlaybook";
import FanManagerPanel from "../chat/FanManagerPanel";
import type { FanManagerSummary } from "../../server/manager/managerService";

type ConversationDetailsProps = {
  onBackToBoard?: () => void;
};

const PACK_ESPECIAL_UPSELL_TEXT =
  "Veo que lo que estás pidiendo entra ya en el terreno de mi Pack especial: incluye todo lo de tu suscripción mensual + fotos y escenas extra más intensas. Si quieres subir de nivel, son 49 € y te lo dejo desbloqueado en este chat.";
const PACK_MONTHLY_UPSELL_TEXT =
  'Te propongo subir al siguiente nivel: la suscripción mensual. Incluye fotos, vídeos y guías extra para seguir trabajando en tu relación. Si te interesa, dime "MENSUAL" y te paso el enlace.';

const CONTENT_PACKS = [
  { code: "WELCOME" as const, label: "Pack bienvenida" },
  { code: "MONTHLY" as const, label: "Suscripción mensual" },
  { code: "SPECIAL" as const, label: "Pack especial pareja" },
] as const;

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
    queueMode,
    todayQueue,
    queueIndex,
    setQueueIndex,
  } = useContext(ConversationContext);
  const {
    contactName,
    image,
    membershipStatus,
    daysLeft,
    lastSeen,
    id,
    followUpTag: conversationFollowUpTag,
    lastCreatorMessageAt,
  } = conversation;
  const [ messageSend, setMessageSend ] = useState("");
  const [ showPackSelector, setShowPackSelector ] = useState(false);
  const [ isLoadingMessages, setIsLoadingMessages ] = useState(false);
  const [ messagesError, setMessagesError ] = useState("");
  const [ grantLoadingType, setGrantLoadingType ] = useState<"trial" | "monthly" | "special" | null>(null);
  const [ selectedPackType, setSelectedPackType ] = useState<"trial" | "monthly" | "special">("monthly");
  const [ accessGrants, setAccessGrants ] = useState<
    { id: string; fanId: string; type: string; createdAt: string; expiresAt: string }[]
  >([]);
  const [ accessGrantsLoading, setAccessGrantsLoading ] = useState(false);
  const [ showNotes, setShowNotes ] = useState(false);
  const [ notesLoading, setNotesLoading ] = useState(false);
  const [ notes, setNotes ] = useState<FanNote[]>([]);
  const [ noteDraft, setNoteDraft ] = useState("");
  const [ notesError, setNotesError ] = useState("");
  const [ showHistory, setShowHistory ] = useState(false);
  const [ historyError, setHistoryError ] = useState("");
  const [ showExtraTemplates, setShowExtraTemplates ] = useState(false);
  const [ nextActionDraft, setNextActionDraft ] = useState("");
  const [ nextActionDate, setNextActionDate ] = useState("");
  const [ nextActionTime, setNextActionTime ] = useState("");
  const [ recommendedFan, setRecommendedFan ] = useState<ConversationListData | null>(null);
  const [ showContentModal, setShowContentModal ] = useState(false);
  const [ contentModalMode, setContentModalMode ] = useState<"packs" | "extras">("packs");
  const [ extraTierFilter, setExtraTierFilter ] = useState<"T0" | "T1" | "T2" | "T3" | "T4" | null>(null);
  const [ contentModalPackFocus, setContentModalPackFocus ] = useState<"WELCOME" | "MONTHLY" | "SPECIAL" | null>(null);
  const [ isAttachmentMenuOpen, setIsAttachmentMenuOpen ] = useState(false);
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
  const [ extraPresets, setExtraPresets ] = useState<ExtraPresetsConfig>(() => loadExtraPresets());
  const [ showEditExtra, setShowEditExtra ] = useState(false);
  const [ managerSummary, setManagerSummary ] = useState<FanManagerSummary | null>(null);
  const fanHeaderRef = useRef<HTMLDivElement | null>(null);
  const { config } = useCreatorConfig();
  const accessSummary = getAccessSummary({
    membershipStatus,
    daysLeft,
    hasAccessHistory: conversation.hasAccessHistory,
    activeGrantTypes: conversation.activeGrantTypes,
  });
  const accessState = getAccessState({ membershipStatus, daysLeft });
  const accessLabel = getAccessLabel({ membershipStatus, daysLeft });
  const packLabel = selectedPackType ? PACKS[selectedPackType].name : accessLabel;
  const followUpTag: FollowUpTag =
    conversationFollowUpTag ?? getFollowUpTag(membershipStatus, daysLeft, conversation.activeGrantTypes);
  const normalizedGrants = (conversation.activeGrantTypes ?? []).map((t) => t.toLowerCase());
  const EXTRA_PRICES: Record<"T0" | "T1" | "T2" | "T3", number> = {
    T0: 0,
    T1: 9,
    T2: 25,
    T3: 60,
  }; // TODO: leer estos precios desde config
  const EXTRA_CARD_LABELS: Record<ExtraPresetKind, { title: string; subtitle: string }> = {
    PHOTO: { title: "Foto extra", subtitle: "1 foto nueva solo para ti" },
    VIDEO: { title: "Vídeo extra", subtitle: "Vídeo corto grabado ahora" },
    COMBO: { title: "Combo foto + vídeo", subtitle: "3 fotos + 1 vídeo más intenso" },
  };
  const EXTRA_KIND_TIER: Record<ExtraPresetKind, "T1" | "T2" | "T3"> = {
    PHOTO: "T1",
    VIDEO: "T2",
    COMBO: "T3",
  };
  const [ showQuickSheet, setShowQuickSheet ] = useState(false);
  const [ isDesktop, setIsDesktop ] = useState(false);
  const hasWelcome = normalizedGrants.includes("welcome") || normalizedGrants.includes("trial");
  const hasMonthly = normalizedGrants.includes("monthly");
  const hasSpecial = normalizedGrants.includes("special");
  const isAccessExpired = accessSummary.state === "EXPIRED";
  const canOfferMonthly = hasWelcome && !hasMonthly;
  const canOfferSpecial = hasMonthly && !hasSpecial;
  const isRecommended = (id: string) => managerSummary?.recommendedButtons?.includes(id);

  type FanNote = {
    id: string;
    fanId: string;
    creatorId: string;
    content: string;
    createdAt: string;
  };

  function parseNextActionValue(value?: string | null) {
    if (!value) return { text: "", date: "", time: "" };
    const match = value.match(/\(para\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?\)/i);
    const date = match?.[1] ?? "";
    const time = match?.[2] ?? "";
    const text = value.replace(/\(para\s+(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?\)/i, "").trim();
    return { text, date, time };
  }

  function derivePackFromLabel(label?: string | null) {
    const lower = (label || "").toLowerCase();
    if (lower.includes("prueba")) return "trial";
    if (lower.includes("mensual")) return "monthly";
    if (lower.includes("individual")) return "special";
    return null;
  }

  const firstName = (contactName || "").split(" ")[0] || contactName || "";

  useEffect(() => {
    const parsed = parseNextActionValue(conversation.nextAction);
    setNextActionDraft(parsed.text);
    setNextActionDate(parsed.date);
    setNextActionTime(parsed.time);
  }, [conversation.id, conversation.nextAction]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewport = () => setIsDesktop(window.innerWidth >= 1024);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

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

  function mapFansForRecommendation(rawFans: Fan[]): ConversationListData[] {
    return rawFans.map((fan) => ({
      id: fan.id,
      contactName: fan.name,
      lastMessage: fan.preview,
      lastTime: fan.time,
      image: fan.avatar || "avatar.jpg",
      messageHistory: [],
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      activeGrantTypes: fan.activeGrantTypes ?? [],
      hasAccessHistory: fan.hasAccessHistory ?? false,
      unreadCount: fan.unreadCount,
      isNew: fan.isNew,
      lastSeen: fan.lastSeen,
      lastCreatorMessageAt: fan.lastCreatorMessageAt,
      followUpTag: getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
      notesCount: fan.notesCount,
      lifetimeValue: fan.lifetimeValue,
      customerTier: fan.customerTier,
      priorityScore: fan.priorityScore,
      nextAction: fan.nextAction,
      lastNoteSnippet: fan.lastNoteSnippet,
      nextActionSnippet: fan.nextActionSnippet,
      lastNoteSummary: fan.lastNoteSummary,
      nextActionSummary: fan.nextActionSummary,
      urgencyLevel: getUrgencyLevel(getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes), fan.daysLeft),
      paidGrantsCount: fan.paidGrantsCount,
      extrasCount: fan.extrasCount ?? 0,
      extrasSpentTotal: fan.extrasSpentTotal ?? 0,
      lastGrantType: (fan as any).lastGrantType ?? null,
      maxExtraTier: fan.maxExtraTier ?? null,
      novsyStatus: fan.novsyStatus ?? null,
      isHighPriority: fan.isHighPriority ?? false,
      extraLadderStatus: fan.extraLadderStatus ?? null,
    }));
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
    if (!queueMode || !conversation?.id) return { index: -1, size: todayQueue.length };
    const idx = todayQueue.findIndex((f) => f.id === conversation.id);
    return { index: idx, size: todayQueue.length };
  }

  function fillMessage(template: string) {
    setMessageSend(template);
  }
  function handleManagerSuggestion(text: string) {
    const filled = text.replace("{nombre}", getFirstName(contactName) || contactName || "");
    setMessageSend(filled);
  }

  function getFirstName(name?: string | null) {
    if (!name) return "";
    const first = name.trim().split(" ")[0];
    return first;
  }

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
    setShowExtraTemplates(false);
  }

  function handleChoosePack(defaultType?: "trial" | "monthly" | "special") {
    if (defaultType) {
      setSelectedPackType(defaultType);
    }
    setShowPackSelector((prev) => (defaultType ? true : !prev));
    setShowExtraTemplates(false);
  }

  function handleNextInQueue() {
    if (!queueMode) return;
    const currentIdx = queueStatus.index >= 0 ? queueStatus.index : queueIndex;
    const nextIdx = Math.min(currentIdx + 1, todayQueue.length - 1);
    if (nextIdx <= currentIdx || nextIdx < 0 || nextIdx >= todayQueue.length) return;
    const nextFan = todayQueue[nextIdx];
    setQueueIndex(nextIdx);
    if (nextFan) {
      setConversation(nextFan as any);
    }
  }

  function handleSubscriptionLink() {
    const subscriptionLinkMessage =
      "Aquí tienes el enlace para la suscripción mensual (25 €):\n\n" +
      "👉 [pega aquí tu enlace]\n\n" +
      "Incluye: acceso al chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vas viviendo.\n" +
      "Si tienes alguna duda antes de entrar, dímelo y lo aclaramos.";
    fillMessage(subscriptionLinkMessage);
    setShowPackSelector(false);
    setShowExtraTemplates(false);
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
  const [aiTurnMode, setAiTurnMode] = useState<AiTurnMode>("HEATUP");

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
        setAiTurnMode(normalizeTurnMode(data.turnMode));
      }
    } catch (err) {
      console.error("Error obteniendo estado de IA", err);
    }
  }

  function normalizeTurnMode(value: string | null | undefined): AiTurnMode {
    const upper = (value || "").toUpperCase();
    if (upper === "PACK_PUSH") return "PACK_PUSH";
    if (upper === "VIP_CARE") return "VIP_CARE";
    return "HEATUP";
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
        setAiTurnMode(normalizeTurnMode(mode));
      }
    } catch (err) {
      console.error("Error obteniendo ajustes de IA", err);
    }
  }

  async function handleSendQuickExtra(kind: ExtraPresetKind) {
    const mode = timeOfDay === "NIGHT" ? "NIGHT" : "DAY";
    const key = getPresetKeyFor(kind, mode);
    const tier = EXTRA_KIND_TIER[kind];
    const price = EXTRA_PRICES[tier] ?? EXTRA_PRICES.T1;
    const text = buildExtraText(key, extraPresets, price);

    const ok = await logTemplateUsage(text, "extra_quick");
    if (!ok) return;

    await sendMessageText(text);
    setShowExtraTemplates(false);
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
      openContentModal({ mode: "extras", tier: suggestedTier });
    }
    if (usage === "pack_offer") {
      openContentModal({ mode: "packs", packFocus: "SPECIAL" });
    }
  }

  function openContentModal(options?: { mode?: "packs" | "extras"; tier?: "T0" | "T1" | "T2" | "T3" | "T4" | null; packFocus?: "WELCOME" | "MONTHLY" | "SPECIAL" | null }) {
    const nextMode = options?.mode ?? "packs";
    setContentModalMode(nextMode);
    setExtraTierFilter(options?.tier ?? null);
    setContentModalPackFocus(options?.packFocus ?? null);
    setShowExtraTemplates(false);
    setShowPackSelector(false);
    setShowNotes(false);
    setShowHistory(false);
    setSelectedContentIds([]);
    fetchContentItems(id);
    if (id) fetchAccessGrants(id);
    setShowContentModal(true);
  }

  function handleOpenExtrasPanel() {
    const nextFilter = timeOfDay === "NIGHT" ? "night" : "day";
    setTimeOfDayFilter(nextFilter as TimeOfDayFilter);
    openContentModal({ mode: "extras", tier: null });
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

  async function fetchAccessGrants(fanId: string) {
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
  }

  async function fetchFanNotes(fanId: string) {
    try {
      setNotesLoading(true);
      setNotesError("");
      const res = await fetch(`/api/fan-notes?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const sorted = Array.isArray(data.notes)
        ? [...data.notes].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        : [];
      setNotes(sorted);
    } catch (_err) {
      setNotes([]);
      setNotesError("Error cargando notas");
    } finally {
      setNotesLoading(false);
    }
  }

  async function fetchHistory(fanId: string) {
    try {
      setHistoryError("");
      const res = await fetch(`/api/fans/history?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const history = Array.isArray(data.history) ? data.history : [];
      setAccessGrants(history);
    } catch (_err) {
      setHistoryError("Error cargando historial");
    }
  }

  async function fetchContentItems(targetFanId?: string) {
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
  }

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

  async function fetchRecommendedFan(rawFans?: Fan[]) {
    try {
      const fansData = rawFans
        ? rawFans
        : await (async () => {
            const res = await fetch("/api/fans");
            if (!res.ok) throw new Error("error");
            const data = await res.json();
            const payloadFans = Array.isArray(data.items)
              ? (data.items as Fan[])
              : Array.isArray(data.fans)
              ? (data.fans as Fan[])
              : [];
            return payloadFans;
          })();
      const mapped = mapFansForRecommendation(fansData);
      const rec = getRecommendedFan(mapped);
      setRecommendedFan(rec ?? null);
    } catch (_err) {
      setRecommendedFan(null);
    }
  }

  async function refreshFanData(fanId: string) {
    try {
      const res = await fetch(`/api/fans?fanId=${encodeURIComponent(fanId)}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
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
        setConversation((prev) => ({
          ...prev,
          id: targetFan.id,
          contactName: targetFan.name || prev.contactName,
          membershipStatus: targetFan.membershipStatus,
          daysLeft: targetFan.daysLeft,
          activeGrantTypes: targetFan.activeGrantTypes ?? prev.activeGrantTypes,
          hasAccessHistory: targetFan.hasAccessHistory ?? prev.hasAccessHistory,
          lastSeen: targetFan.lastSeen || prev.lastSeen,
          lastTime: targetFan.time || prev.lastTime,
          image: targetFan.avatar || prev.image,
          followUpTag: getFollowUpTag(targetFan.membershipStatus, targetFan.daysLeft, targetFan.activeGrantTypes),
          lastCreatorMessageAt: targetFan.lastCreatorMessageAt ?? prev.lastCreatorMessageAt,
          notesCount: targetFan.notesCount ?? prev.notesCount,
          nextAction: targetFan.nextAction ?? prev.nextAction,
          lastGrantType: (targetFan as any).lastGrantType ?? prev.lastGrantType ?? null,
          extrasCount: targetFan.extrasCount ?? prev.extrasCount,
          extrasSpentTotal: targetFan.extrasSpentTotal ?? prev.extrasSpentTotal,
          maxExtraTier: (targetFan as any).maxExtraTier ?? prev.maxExtraTier,
          novsyStatus: (targetFan as any).novsyStatus ?? prev.novsyStatus ?? null,
          isHighPriority: (targetFan as any).isHighPriority ?? prev.isHighPriority ?? false,
          extraLadderStatus:
            "extraLadderStatus" in targetFan
              ? ((targetFan as any).extraLadderStatus ?? null)
              : prev.extraLadderStatus ?? null,
          extraSessionToday:
            "extraSessionToday" in targetFan
              ? ((targetFan as any).extraSessionToday ?? null)
              : (prev as any).extraSessionToday ?? null,
        }));
        await fetchRecommendedFan();
      }
    } catch (_err) {
      // silent fail; UI remains with previous data
    }
  }

  function mapApiMessagesToState(apiMessages: ApiMessage[]): ConversationMessage[] {
    return apiMessages.map((msg) => {
      const isContent = msg.type === "CONTENT";
      return {
        me: msg.from === "creator",
        message: msg.text,
        seen: !!msg.isLastFromCreator,
        time: msg.time || "",
        kind: isContent ? "content" : "text",
        type: msg.type,
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
  }

  async function fetchMessages(shouldShowLoading = false) {
    if (!id) return;
    try {
      if (shouldShowLoading) {
        setIsLoadingMessages(true);
        setMessage([]);
      }
      setMessagesError("");
      const res = await fetch(`/api/messages?fanId=${id}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const mapped = mapApiMessagesToState(data.messages as ApiMessage[]);
      setMessage(mapped);
    } catch (_err) {
      setMessagesError("Error cargando mensajes");
    } finally {
      if (shouldShowLoading) {
        setIsLoadingMessages(false);
      }
    }
  }

  useEffect(() => {
    if (!id) return;
    fetchMessages(true);
    const timer = setInterval(() => {
      fetchMessages(false);
    }, 4000);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => {
    setMessageSend("");
    setShowPackSelector(false);
    setShowNotes(false);
    setShowHistory(false);
    setNotes([]);
    setNoteDraft("");
    setNotesError("");
    setNextActionDraft(conversation.nextAction || "");
    const derivedPack = derivePackFromLabel(membershipStatus || accessLabel) || "monthly";
    setSelectedPackType(derivedPack);
  }, [conversation, membershipStatus, accessLabel]);

  useEffect(() => {
    if (!id) return;
    fetchAccessGrants(id);
    fetchRecommendedFan();
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchContentItems(id);
    }
  }, [id]);

  useEffect(() => {
    if (!queueMode) return;
    if (!conversation?.id) return;
    const idx = todayQueue.findIndex((f) => f.id === conversation.id);
    // Si el fan actual no está en la cola, mantenemos queueMode activo pero ocultamos el botón de siguiente.
    if (idx >= 0 && idx !== queueIndex) {
      setQueueIndex(idx);
    }
  }, [conversation?.id, queueMode, todayQueue, queueIndex, setQueueIndex]);

  useEffect(() => {
    const loaded = loadExtraPresets();
    setExtraPresets(loaded);
  }, []);

  useEffect(() => {
    if (!id) return;
    const map = loadUnreadMap();
    const updated = updateLastReadForFan(map, id, new Date());
    saveUnreadMap(updated);
    window.dispatchEvent(new Event("unreadUpdated"));
  }, [id]);

  useEffect(() => {
    if (!id || !showNotes) return;
    fetchFanNotes(id);
  }, [id, showNotes]);

useEffect(() => {
  if (!id || !showHistory) return;
  fetchHistory(id);
}, [id, showHistory]);

useEffect(() => {
  if (!id || !showExtraTemplates) return;
  fetchExtrasHistory(id);
}, [id, showExtraTemplates]);

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
  fetchAiStatus();
  fetchAiSettingsTone();
}, []);

useEffect(() => {
  setIaMessage(null);
  setIaBlocked(false);
  fetchAiStatus();
  fetchAiSettingsTone();
}, [conversation.id]);


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
    setShowExtraTemplates(false);
  }

  function handleSelectPackChip(event: MouseEvent<HTMLButtonElement>, type: "trial" | "monthly" | "special") {
    event.stopPropagation();
    setSelectedPackType(type);
    setShowPackSelector(true);
    setShowExtraTemplates(false);
    fillMessageFromPackType(type);
  }

  function changeHandler(evt: KeyboardEvent<HTMLInputElement>) {
    const { key } = evt;

    if (key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      handleSendMessage();
    }
  }

  async function sendMessageText(text: string) {
    if (!id) return;
    const trimmedMessage = text.trim();
    if (!trimmedMessage) return;

    try {
      setMessagesError("");
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, text: trimmedMessage, from: "creator", type: "TEXT" }),
      });

      if (!res.ok) {
        console.error("Error enviando mensaje");
        setMessagesError("Error enviando mensaje");
        return;
      }

      const data = await res.json();
      const apiMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      const mapped = mapApiMessagesToState(apiMessages);
      if (mapped.length > 0) {
        setMessage((prev) => [...(prev || []), ...mapped]);
      }
      setMessageSend("");
    } catch (err) {
      console.error("Error enviando mensaje", err);
      setMessagesError("Error enviando mensaje");
    }
  }

  async function handleSendMessage() {
    await sendMessageText(messageSend);
  }

  async function handleCreatePaymentLink(item: ContentWithFlags) {
    if (!id) return;
    if (loadingPaymentId) return;
    setLoadingPaymentId(item.id);
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
        await sendMessageText(`Te dejo aquí el enlace para este pack: ${url}`);
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
    sendMessageText(text);
    setShowContentModal(false);
    setSelectedContentIds([]);
  }

  function buildNextActionPayload() {
    const text = nextActionDraft.trim();
    const date = nextActionDate.trim();
    const time = nextActionTime.trim();
    if (!text && !date && !time) return null;
    if (date) {
      const suffix = time ? ` ${time}` : "";
      return `${text || "Seguimiento"} (para ${date}${suffix})`.trim();
    }
    return text || null;
  }

  async function handleAddNote() {
    if (!id) return;
    const content = noteDraft.trim();
    const nextActionPayload = buildNextActionPayload();
    try {
      // Update next action first
      const resNext = await fetch("/api/fans/next-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, nextAction: nextActionPayload || null }),
      });
      if (!resNext.ok) {
        console.error("Error guardando próxima acción");
        setNotesError("Error guardando próxima acción");
        return;
      }

      if (content) {
        const res = await fetch("/api/fan-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fanId: id, content }),
        });
        if (!res.ok) {
          console.error("Error guardando nota");
          setNotesError("Error guardando nota");
          return;
        }
        const data = await res.json();
        if (data.note) {
          setNotes((prev) => [data.note as FanNote, ...prev]);
          setNoteDraft("");
          setNotesError("");
        }
      }

      await refreshFanData(id);
      // sincroniza contadores y próxima acción en la conversación actual
      setConversation({
        ...conversation,
        notesCount: (conversation.notesCount ?? 0) + (content ? 1 : 0),
        nextAction: nextActionPayload || null,
      });
    } catch (err) {
      console.error("Error guardando nota", err);
      setNotesError("Error guardando nota");
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

      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const apiMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      const mapped = mapApiMessagesToState(apiMessages);
      if (mapped.length > 0) {
        setMessage((prev) => [...(prev || []), ...mapped]);
      }
      setMessagesError("");
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

  function lastSeenLabel() {
    if (!lastSeen) return null;
    if (lastSeen.toLowerCase() === "en línea ahora") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-[#53bdeb]">
          <span className="w-2 h-2 rounded-full bg-[#25d366]" />
          <span>En línea ahora</span>
        </span>
      );
    }
    return <span className="text-[11px] text-slate-400">Última conexión: {lastSeen}</span>;
  }

  const selectedPackStatus = getPackStatusForType(selectedPackType);
  const effectiveDaysLeft = selectedPackStatus.daysLeft ?? daysLeft;

  const membershipDetails = packLabel
    ? `${packLabel}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : membershipStatus
    ? `${membershipStatus}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : "";
  const extrasCountDisplay = conversation.extrasCount ?? 0;
  const extrasSpentDisplay = Math.round(conversation.extrasSpentTotal ?? 0);
  const extrasAmount = conversation.extrasSpentTotal ?? 0;
  const lifetimeAmount = conversation.lifetimeSpend ?? 0;
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
    turnMode: aiStatus?.turnMode ?? aiTurnMode ?? "HEATUP",
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

  function formatTier(tier?: "new" | "regular" | "priority" | "vip") {
    if (tier === "priority" || tier === "vip") return "Alta prioridad";
    if (tier === "regular") return "Habitual";
    return "Nuevo";
  }

  const handleViewProfile = () => {
    if (isDesktop) {
      fanHeaderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setShowQuickSheet(true);
  };

  const handleOpenNotesFromSheet = () => {
    setShowQuickSheet(false);
    setShowNotes(true);
    setShowExtraTemplates(false);
    setShowHistory(false);
    if (id) fetchFanNotes(id);
  };

  const handleOpenHistoryFromSheet = () => {
    setShowQuickSheet(false);
    setShowHistory(true);
    setShowNotes(false);
    setShowExtraTemplates(false);
    if (id) fetchHistory(id);
  };
  const handleRenewAction = async () => {
    await handleQuickTemplateClick("renewal");
  };

  const lifetimeValueDisplay = Math.round(conversation.lifetimeValue ?? 0);
  const notesCountDisplay = conversation.notesCount ?? 0;
  const novsyStatus = conversation.novsyStatus ?? null;
  const queueStatus = getQueuePosition();
  const isInQueue = queueMode && queueStatus.index >= 0;
  const hasNextInQueue = isInQueue && queueStatus.index < (queueStatus.size - 1);
  const statusTags: string[] = [];
  if (conversation.isHighPriority) {
    if (vipAmountToday > 0) statusTags.push(`VIP · ${vipAmountToday} €`);
    else statusTags.push("VIP");
  } else {
    statusTags.push(formatTier(conversation.customerTier));
  }
  if (!conversation.isHighPriority) {
    statusTags.push(`${Math.round(lifetimeAmount)} €`);
  }
  if (conversation.nextAction) {
    const shortNext = conversation.nextAction.length > 60 ? `${conversation.nextAction.slice(0, 57)}…` : conversation.nextAction;
    statusTags.push(`Próxima acción: ${shortNext}`);
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
    if (mode === "PACK_PUSH") return "Empujar pack";
    if (mode === "VIP_CARE") return "Cuidar VIP";
    return "Calentar";
  }

  function getUsageLabelForPlan(usage: AiTemplateUsage | null): string | null {
    if (!usage) return null;
    if (usage === "welcome" || usage === "warmup") return "Saludo / calentar";
    if (usage === "extra_quick") return "Extra rápido";
    if (usage === "pack_offer") return "Pack especial";
    if (usage === "renewal") return "Reenganche";
    return usage;
  }

  const filteredItems = contentItems.filter((item) => {
    const tag = getTimeOfDayTag(item.title ?? "");

    if (timeOfDayFilter === "all") return true;
    if (timeOfDayFilter === "day") return tag === "day";
    if (timeOfDayFilter === "night") return tag === "night";

    return true;
  });

  return (
    <div className="flex flex-col w-full h-full min-h-[60vh]">
      {onBackToBoard && (
        <div className="md:hidden flex items-center justify-between gap-3 px-4 pt-3">
          <button
            type="button"
            onClick={onBackToBoard}
            className="rounded-full px-3 py-1 text-sm bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            ← Volver
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
            <span className="font-semibold truncate">{contactName}</span>
            {(conversation.isHighPriority || (conversation.extrasCount ?? 0) > 0) && (
              <span className="inline-flex items-center rounded-full bg-slate-800/80 text-[11px] text-amber-200 px-2 py-[1px]">
                {conversation.isHighPriority ? "VIP" : "Extras"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleViewProfile}
            className="rounded-full px-3 py-1 text-sm bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            Ver ficha
          </button>
        </div>
      )}
      <header
        ref={fanHeaderRef}
        className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3"
      >
        {/* Mini ficha solo móvil, bajo la barra superior */}
        <div className="md:hidden mt-1 rounded-2xl bg-slate-900/80 px-3 py-2 shadow-lg shadow-black/40 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-3">
            <Avatar width="w-9" height="h-9" image={image} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-50 truncate">{contactName}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    accessState === "active"
                      ? "bg-[#25d366]"
                      : accessState === "expiring"
                      ? "bg-[#f5c065]"
                      : "bg-[#7d8a93]"
                  }`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                <span className="inline-flex items-center rounded-full bg-slate-800/80 text-amber-200 px-2 py-[1px]">
                  {packLabel}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-800/80 text-slate-200 px-2 py-[1px]">
                  {formatTier(conversation.customerTier)}
                </span>
                {conversation.isHighPriority && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/20 text-amber-200 px-2 py-[1px]">
                    🔥 Alta prioridad
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
          <div className="flex flex-col gap-1 text-[11px] text-slate-300">
            <div className="flex justify-between gap-2">
              <span className="truncate">Total gastado: {Math.round(lifetimeAmount)} €</span>
              <span className="truncate text-right">
                Extras: {extrasCountDisplay} · {extrasSpentDisplay} €
              </span>
            </div>
            {conversation.nextAction && (
              <p className="leading-snug text-slate-200">
                Próxima acción: <span className="text-slate-100">{conversation.nextAction}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Avatar width="w-10" height="h-10" image={image} />
              <div className="flex flex-col gap-1 leading-tight">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm font-semibold text-slate-50">{contactName}</h1>
                  <span className="inline-flex items-center rounded-full bg-slate-800/80 text-[11px] text-amber-200 px-2 py-[1px]">
                    {packLabel}
                  </span>
                  {novsyStatus === "NOVSY" && (
                    <span className="inline-flex items-center rounded-full border border-emerald-400/80 bg-emerald-500/10 text-[11px] text-emerald-100 px-2 py-[1px]">
                      Extras
                    </span>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full ${
                      accessState === "active"
                        ? "bg-[#25d366]"
                        : accessState === "expiring"
                      ? "bg-[#f5c065]"
                      : "bg-[#7d8a93]"
                  }`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {membershipDetails && <span>{membershipDetails}</span>}
                {membershipDetails && lastSeen && <span className="w-1 h-1 rounded-full bg-slate-500" />}
                {lastSeenLabel()}
              </div>
              {extrasCountDisplay > 0 && (
                <div className="text-[11px] text-slate-400">
                  Extras: {extrasCountDisplay} · {extrasSpentDisplay} €
                </div>
              )}
              <div className="text-xs text-slate-400">
                <span className={conversation.customerTier === "priority" || conversation.customerTier === "vip" ? "text-amber-300 font-semibold" : ""}>
                  {formatTier(conversation.customerTier)}
                </span>
                {` · ${lifetimeValueDisplay} € gastados · ${notesCountDisplay} nota${notesCountDisplay === 1 ? "" : "s"}`}
              </div>
              <div className="text-[11px] text-slate-400">
                Total gastado: {Math.round(lifetimeAmount)} € · Suscripciones: {Math.round(subsAmount)} € · Extras: {Math.round(extrasAmount)} €
              </div>
              {conversation.nextAction && (
                <div className="text-[11px] text-slate-400">
                  ⚡ Próxima acción: {conversation.nextAction}
                </div>
              )}
              <div className="text-[11px] text-slate-400">
                Último mensaje tuyo: {formatLastCreatorMessage(lastCreatorMessageAt)}
              </div>
            </div>
        </div>
          <div className="flex items-center text-[#8696a0] gap-2">
            {queueMode && todayQueue.length > 1 && queueStatus.index >= 0 && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-200 mr-2">
                <span>{`Ventas de hoy: ${queueStatus.index + 1} de ${queueStatus.size}`}</span>
                <button
                  type="button"
                  disabled={!hasNextInQueue}
                  onClick={handleNextInQueue}
                  className={clsx(
                    "rounded-full border px-2 py-1 text-xs font-semibold transition",
                    hasNextInQueue
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                      : "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                  )}
                >
                  {hasNextInQueue ? "▶ Siguiente venta" : "Última venta"}
                </button>
              </div>
            )}
            <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
              <path fill="currentColor" d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-5-5.2zm-6.2 0c-2.6 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2 4.6-4.6 4.6z">
              </path>
            </svg>
            <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
              <path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"></path>
            </svg>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleQuickGreeting}
          >
            Saludo rápido
          </button>
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleWelcomePack}
          >
            Pack bienvenida
          </button>
          <button
            type="button"
          className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleSubscriptionLink}
          >
            Enlace suscripción
          </button>
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleChoosePack}
          >
            Elegir pack
          </button>
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-slate-700"
            onClick={() => {
              setShowNotes((prev) => {
                const next = !prev;
                if (next && id) {
                  fetchFanNotes(id);
                }
                return next;
              });
              setShowExtraTemplates(false);
              setShowHistory(false);
            }}
          >
            Notas
          </button>
          <button
            type="button"
            className={`text-xs font-medium rounded-full border px-3 py-1 transition ${
              showHistory
                ? "border-amber-400 bg-amber-500/10 text-amber-100"
                : "border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
            }`}
            onClick={() => {
              setShowHistory((prev) => !prev);
              setShowNotes(false);
              setShowExtraTemplates(false);
              if (!showHistory && id) {
                fetchHistory(id);
              }
            }}
          >
            Historial
          </button>
          <button
            type="button"
            className={`text-xs font-medium rounded-full border px-3 py-1 transition ${
              showExtraTemplates
                ? "border-amber-400 bg-amber-500/10 text-amber-100"
                : "border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
            }`}
            onClick={() => {
              setShowExtraTemplates((prev) => !prev);
              setShowPackSelector(false);
              setShowNotes(false);
              setShowHistory(false);
            }}
          >
            Extra
          </button>
        </div>
        {showPackSelector && (
          <div className="flex flex-col gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3 w-full">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight transition shadow-sm",
                  selectedPackType === "trial"
                    ? "bg-amber-500 text-slate-900 border-amber-300"
                    : "bg-slate-800/80 border-slate-600 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
                )}
                onClick={(e) => handleSelectPackChip(e, "trial")}
              >
                Prueba 7 días
              </button>
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight transition shadow-sm",
                  selectedPackType === "monthly"
                    ? "bg-amber-500 text-slate-900 border-amber-300"
                    : "bg-slate-800/80 border-slate-600 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
                )}
                onClick={(e) => handleSelectPackChip(e, "monthly")}
              >
                1 mes
              </button>
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight transition shadow-sm",
                  selectedPackType === "special"
                    ? "bg-amber-500 text-slate-900 border-amber-300"
                    : "bg-slate-800/80 border-slate-600 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
                )}
                onClick={(e) => handleSelectPackChip(e, "special")}
              >
                Especial
              </button>
            </div>
            {config.packs.map((pack) => {
              const packType = pack.name.toLowerCase().includes("bienvenida")
                ? "trial"
                : pack.name.toLowerCase().includes("mensual")
                ? "monthly"
                : "special";
              const hasActiveMonthlyPack = getPackStatusForType("monthly").status === "active";
              const isSelected = packType === selectedPackType;
              const packStatus = getPackStatusForType(packType as "trial" | "monthly" | "special");
              const isSpecialBlocked = packType === "special" && !hasActiveMonthlyPack;
              const isIncludedByHigher =
                packType === "trial"
                  ? hasMonthly || hasSpecial
                  : packType === "monthly"
                  ? hasSpecial
                  : false;
              const isActive = packStatus.status === "active";
              const showActiveBadge = isActive;
              const showExpiredBadge = packStatus.status === "expired" && !isIncludedByHigher && !isActive;
              const disableButton =
                isIncludedByHigher || isActive || (packType === "special" && !hasMonthly) || grantLoadingType === packType;
              const buttonLabel =
                packType === "trial"
                  ? isIncludedByHigher
                    ? hasSpecial
                      ? "Incluido en tu Pack especial"
                      : "Incluido en tu suscripción mensual"
                    : "Conceder acceso"
                  : packType === "monthly"
                  ? isIncludedByHigher
                    ? "Incluido en tu Pack especial"
                    : "Conceder acceso"
                  : "Conceder acceso";
              const helperText =
                packType === "special" && !hasMonthly
                  ? "Solo disponible para fans con suscripción mensual activa."
                  : isIncludedByHigher && packType === "trial" && hasMonthly
                  ? "Incluido en tu suscripción mensual."
                  : isIncludedByHigher && packType === "trial" && hasSpecial
                  ? "Incluido en tu Pack especial."
                  : isIncludedByHigher && packType === "monthly" && hasSpecial
                  ? "Incluido en tu Pack especial."
                  : null;
              return (
                <button
                  key={pack.id}
                  type="button"
                  className={clsx(
                    "text-left bg-slate-900/60 hover:bg-slate-800 text-white px-3 py-2 rounded-lg border transition",
                    isSelected ? "border-amber-400 shadow-sm" : "border-slate-700"
                  )}
                  onClick={() => handleSelectPack(pack.id)}
                >
                  <div className="flex justify-between text-sm font-medium">
                    <span>{pack.name}</span>
                    <span className="text-[#53bdeb]">{pack.price}</span>
                  </div>
                    <p className="text-[#a1b0b7] text-xs mt-1">{pack.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {showActiveBadge && (
                      <span className="inline-flex items-center rounded-full border border-amber-400/80 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                        Activo{packStatus.daysLeft ? ` · ${packStatus.daysLeft} días restantes` : ""}
                      </span>
                    )}
                    {showExpiredBadge && (
                      <span className="inline-flex items-center rounded-full border border-slate-500/70 bg-slate-800/50 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                        Expirado
                      </span>
                    )}
                    {helperText && (
                      <span className="text-[11px] text-slate-400">{helperText}</span>
                    )}
                    {!disableButton && (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-amber-400/90 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/15 hover:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400/60 transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSpecialBlocked) return;
                          handleGrant(packType as "trial" | "monthly" | "special");
                        }}
                        disabled={disableButton}
                      >
                        {grantLoadingType === packType ? "Concediendo..." : buttonLabel}
                      </button>
                    )}
                    {(disableButton && !showActiveBadge && !showExpiredBadge && !helperText && isIncludedByHigher) && (
                      <span className="text-[11px] text-slate-400">
                        Incluido en tu pack actual.
                      </span>
                    )}
                    {isSpecialBlocked && (
                      <p className="text-[11px] text-slate-400">
                        Solo disponible para fans con suscripción mensual activa.
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {showExtraTemplates && (
          <div className="flex flex-col gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3 w-full">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Extras · PPV</h3>
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
                  className="text-xs text-slate-300 hover:text-white underline-offset-2 hover:underline"
                  onClick={() => setShowEditExtra(true)}
                >
                  Editar textos
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 space-y-2">
              <h4 className="text-sm font-semibold text-white">Registrar venta de extra</h4>
              <div className="flex flex-col md:flex-row gap-2">
                <select
                  className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                  value={selectedExtraId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedExtraId(val);
                    const item = contentItems.find((c) => c.id === val);
                    const DEFAULT_EXTRA_TIER: "T0" | "T1" | "T2" | "T3" = "T1";
                    const tier = (item?.extraTier as "T0" | "T1" | "T2" | "T3") ?? DEFAULT_EXTRA_TIER;
                    if (tier && EXTRA_PRICES[tier] !== undefined) {
                      setExtraAmount(EXTRA_PRICES[tier]);
                    }
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
                      const DEFAULT_EXTRA_TIER: "T0" | "T1" | "T2" | "T3" = "T1"; // TODO: permitir editar extraTier en la biblioteca
                      const tier = (item.extraTier as "T0" | "T1" | "T2" | "T3") ?? DEFAULT_EXTRA_TIER;
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
                    const DEFAULT_EXTRA_TIER: "T0" | "T1" | "T2" | "T3" = "T1";
                    const tier = (item?.extraTier as "T0" | "T1" | "T2" | "T3") ?? DEFAULT_EXTRA_TIER;
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
                    try {
                    const amountNumber = Number(extraAmount);
                    const payload = {
                      fanId: id,
                      contentItemId: item.id,
                      tier,
                      amount: amountNumber,
                      sessionTag,
                    };
                    const res = await fetch("/api/extras", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      if (!res.ok) {
                        const errText = await res.text();
                        console.error("Error registering extra", res.status, errText);
                        setExtraError(errText || "No se pudo registrar el extra.");
                        return;
                      }
                      setSelectedExtraId("");
                      setExtraAmount("");
                      const prevExtrasCount = conversation.extrasCount ?? 0;
                      const prevExtrasTotal = conversation.extrasSpentTotal ?? 0;
                      const prevLifetime = conversation.lifetimeSpend ?? 0;
                      const updatedExtrasCount = prevExtrasCount + 1;
                      const updatedExtrasTotal = prevExtrasTotal + amountNumber;
                      const updatedLifetime = prevLifetime + amountNumber;
                      const updatedTier = getCustomerTierFromSpend(updatedLifetime);
                      const updatedHighPriority = updatedLifetime >= HIGH_PRIORITY_LIMIT;
                      setConversation({
                        ...conversation,
                        extrasCount: updatedExtrasCount,
                        extrasSpentTotal: updatedExtrasTotal,
                        lifetimeSpend: updatedLifetime,
                        lifetimeValue: updatedLifetime,
                        customerTier: updatedTier,
                        isHighPriority: updatedHighPriority,
                      });
                      await refreshFanData(id);
                      await fetchExtrasHistory(id);
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(
                          new CustomEvent(EXTRAS_UPDATED_EVENT, {
                            detail: {
                              fanId: id,
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
                    } catch (_err) {
                      setExtraError("No se pudo registrar el extra.");
                    }
                  }}
                >
                  Registrar extra
                </button>
              </div>
              {extraError && <div className="text-[11px] text-rose-300">{extraError}</div>}
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

            <div className="grid gap-3 md:grid-cols-3">
              {(["PHOTO", "VIDEO", "COMBO"] as ExtraPresetKind[]).map((key) => {
                const preset = EXTRA_CARD_LABELS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className="flex flex-col items-start rounded-xl bg-slate-900/60 p-4 text-left ring-1 ring-slate-800 hover:bg-slate-800"
                    onClick={() => handleSendQuickExtra(key)}
                  >
                    <p className="text-sm font-semibold text-white">{preset.title}</p>
                    <p className="mt-1 text-xs text-slate-300">{preset.subtitle}</p>
                    <p className="mt-3 text-[11px] text-slate-400">Envía mensaje predefinido</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>
      {/* Avisos de acceso caducado o a punto de caducar */}
      {isAccessExpired && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-amber-200">Acceso caducado · sin pack activo</span>
            <span className="text-[11px] text-amber-100/90">
              Puedes enviarle un mensaje de cierre o reenganche y concederle un nuevo pack cuando quieras.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20"
              onClick={() => handleChoosePack(mapLastGrantToPackType(conversation.lastGrantType))}
            >
              Elegir pack
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
              onClick={handleRenewAction}
            >
              Mensaje de reenganche
            </button>
          </div>
        </div>
      )}
      {conversation.membershipStatus === "active" && typeof conversation.daysLeft === "number" && conversation.daysLeft <= 1 && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-100">
          <span className="font-medium text-amber-100">
            Le queda {conversation.daysLeft === 1 ? "1 día" : `${conversation.daysLeft} días`} de acceso. Buen momento para proponer el siguiente paso.
          </span>
        </div>
      )}
      {showEditExtra && (
        <EditExtraPresetsModal
          presets={extraPresets}
          onSave={(next) => {
            setExtraPresets(next);
            saveExtraPresets(next);
            setShowEditExtra(false);
          }}
          onClose={() => setShowEditExtra(false)}
        />
      )}
      {showNotes && (
        <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-xs text-slate-100 flex flex-col gap-3 max-h-64">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Notas internas de {contactName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">Próxima acción</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="text"
                value={nextActionDraft}
                onChange={(e) => setNextActionDraft(e.target.value)}
                className="md:col-span-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none border border-slate-700 focus:border-amber-400"
                placeholder="Ej: Proponer pack especial cuando cobre"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none border border-slate-700 focus:border-amber-400 focus:text-amber-300"
                />
                <input
                  type="time"
                  value={nextActionTime}
                  onChange={(e) => setNextActionTime(e.target.value)}
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none border border-slate-700 focus:border-amber-400 focus:text-amber-300"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={2}
              className="flex-1 resize-none rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none border border-slate-700 focus:border-amber-400"
              style={{ backgroundColor: '#0f172a' }}
              placeholder="Añade una nota para recordar detalles, límites, miedos, etc."
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={!noteDraft.trim()}
              className="self-start rounded-lg border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-500/20"
            >
              Guardar
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
              {notesLoading && <div className="text-[11px] text-slate-400">Cargando notas…</div>}
              {notesError && !notesLoading && (
                <div className="text-[11px] text-rose-300">{notesError}</div>
              )}
              {!notesLoading && notes.length === 0 && (
                <div className="text-[11px] text-slate-500">Aún no hay notas para este fan.</div>
              )}
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
                <div className="text-[10px] text-slate-500">{formatNoteDate(note.createdAt)}</div>
                <div className="text-[11px] whitespace-pre-wrap">{note.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {recommendedFan && recommendedFan.id !== id && (
        <div className="mt-2 mb-3 flex items-center justify-between rounded-xl border border-amber-500/60 bg-slate-900/70 px-3 py-2 text-xs">
          <div className="flex flex-col gap-1 truncate">
            <span className="font-semibold text-amber-300 flex items-center gap-1">
              ⚡ Siguiente recomendado
              {(recommendedFan.customerTier === "priority" || recommendedFan.customerTier === "vip") && (
                <span className="text-[10px] rounded-full bg-amber-500/20 px-2 text-amber-200">🔥 Alta prioridad</span>
              )}
            </span>
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
            {recommendedFan.nextAction && (
              <span className="text-[11px] text-slate-400 truncate">Próx.: {recommendedFan.nextAction}</span>
            )}
          </div>
          <button
            type="button"
            className="ml-3 rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/20"
            onClick={() => setConversation(recommendedFan)}
          >
            Abrir chat
          </button>
        </div>
      )}
      {showHistory && (
        <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-xs text-slate-100 flex flex-col gap-3 max-h-64">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Historial de compras</span>
          </div>
          {extrasCountDisplay > 0 && (
            <div className="text-[11px] text-slate-400">
              Este fan ha comprado {extrasCountDisplay} extra{extrasCountDisplay !== 1 ? "s" : ""} por un total de {extrasSpentDisplay} € (detalle en la pestaña "Extra").
            </div>
          )}
          {historyError && <div className="text-[11px] text-rose-300">{historyError}</div>}
          {!historyError && accessGrants.length === 0 && (
            <div className="text-[11px] text-slate-400">Sin historial de compras todavía.</div>
          )}
          <div className="flex-1 overflow-y-auto space-y-2">
            {accessGrants.map((grant) => {
              const mapped = mapGrantType(grant.type);
              const status = getGrantStatus(grant.expiresAt);
              return (
                <div key={grant.id} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
                    <span>{formatGrantDate(grant.createdAt)}</span>
                    <span>·</span>
                    <span>{mapped.label}</span>
                    <span>·</span>
                    <span>{mapped.amount} €</span>
                    <span>·</span>
                    <span className={status === "Activo" ? "text-emerald-300" : "text-slate-400"}>{status}</span>
                  </div>
                  {grant.expiresAt && (
                    <div className="text-[10px] text-slate-400">Vence el {formatGrantDate(grant.expiresAt)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {iaMessage && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {iaMessage} {iaBlocked ? "Mañana se reiniciarán tus créditos diarios." : ""}
        </div>
      )}
      {(() => {
        const followUpTemplates = getFollowUpTemplates({
          followUpTag,
          daysLeft,
          fanName: firstName,
        });
        if (!followUpTemplates.length) return null;
        // Nota: followUpTag es el mismo dato que alimenta el filtro "Seguimiento hoy" (via getFollowUpTag + shouldFollowUpToday en el sidebar); aquí solo cambiamos el texto visible.
        return (
          <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {followUpTag === "trial_soon" && `Próxima acción · Prueba · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                {followUpTag === "monthly_soon" && `Próxima acción · Suscripción · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
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
      })()}
      <div className="flex flex-col w-full flex-1 px-4 md:px-24 py-6 overflow-y-auto" style={{ backgroundImage: "url('/assets/images/background.jpg')" }}>
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
          return (
            <MessageBalloon key={index} me={me} message={message} seen={seen} time={time} />
          );
        })}
        {isLoadingMessages && <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>}
        {messagesError && !isLoadingMessages && <div className="text-center text-red-400 text-sm mt-2">{messagesError}</div>}
      </div>
      <footer className="flex flex-col bg-[#202c33] w-full h-auto py-3 px-4 text-[#8696a0] gap-3">
        <div className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
          <div className="text-[11px] font-semibold text-slate-100 truncate">{statusLine}</div>
          {conversation.extraLadderStatus && (conversation.extraLadderStatus.totalSpent ?? 0) > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-100">
                <span className="flex h-5 min-w-[42px] items-center justify-center rounded-full bg-amber-400/70 px-2 text-[10px] font-black uppercase tracking-wide text-slate-900">
                  LAPEX
                </span>
                <span className="text-amber-100/90">
                  {lapexPhaseLabel}
                  {lapexExtraNote} · Ha gastado {Math.round(conversation.extraLadderStatus.totalSpent ?? 0)} € en extras ·
                  Último pack {formatLastPurchase(conversation.extraLadderStatus.lastPurchaseAt) || "—"} · Siguiente
                  sugerencia: {lapexSuggested}
                </span>
              </div>
            </div>
          )}
          <div className="text-[11px] text-slate-400">
            {sessionToday.todayCount > 0 ? (
              <>
                Sesión hoy: {sessionToday.todayCount} extras — {Math.round(sessionToday.todaySpent ?? 0)} € · Último{" "}
                {formatLastPurchaseToday(sessionToday.todayLastPurchaseAt) || "—"}
              </>
            ) : (
              "Sesión hoy: sin extras todavía"
            )}
          </div>
          <div className="text-[11px] text-slate-300">
            IA hoy: {aiStatus ? `${aiStatus.usedToday}/${aiStatus.hardLimitPerDay ?? "∞"}` : "–/–"} · Créditos:{" "}
            {aiStatus ? aiStatus.creditsAvailable : "—"} · Modo IA: {getTurnModeLabel(aiTurnMode)}
          </div>
          <div className="text-[11px] text-slate-200">
            <FanManagerPanel
              fanId={conversation.id}
              onSummary={(s) => setManagerSummary(s)}
              onSuggestionClick={handleManagerSuggestion}
            />
          </div>
          <div className="text-[11px] text-slate-300">
            {plan.summaryLabel
              ? plan.summaryLabel
              : `Plan de hoy: ${plan.focusLabel || "—"}${plan.stepLabel ? ` — ${plan.stepLabel}` : ""}${
                  plan.goalLabel ? ` — Objetivo: ${plan.goalLabel}` : ""
                }${
                  getUsageLabelForPlan(plan.suggestedUsage)
                    ? ` — Siguiente jugada: ${getUsageLabelForPlan(plan.suggestedUsage)}`
                    : ""
                }`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={clsx(
                "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                isRecommended("saludo_rapido")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100"
              )}
              onClick={handleQuickGreeting}
            >
              Saludo
            </button>
            {showRenewAction && (
              <button
                type="button"
                className={clsx(
                  "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                  isRecommended("renenganche")
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                    : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100"
                )}
                onClick={handleRenewAction}
              >
                {renewButtonLabel}
              </button>
            )}
            <button
              type="button"
              className={clsx(
                "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                isRecommended("extra_rapido")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100"
              )}
              onClick={handleQuickExtraClick}
              disabled={iaBlocked || aiStatus?.limitReached}
            >
              Extra rápido
            </button>
            <button
              type="button"
              className={clsx(
                "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                isRecommended("elegir_pack")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-emerald-400 hover:text-emerald-100"
              )}
              onClick={() => handleQuickTemplateClick("pack_offer")}
            >
              Pack especial
            </button>
            <button
              type="button"
              className={clsx(
                "whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                isRecommended("abrir_extras")
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-emerald-400 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
              )}
              onClick={handleOpenExtrasPanel}
            >
              Abrir extras
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 py-1">
            <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
              <path fill="currentColor" d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159zm3.108-9.751c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962z">
              </path>
            </svg>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAttachmentMenuOpen((prev) => !prev)}
                className="flex items-center justify-center"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
                  <path fill="currentColor" d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 4.36a.572.572 0 0 0-.834.018l-7.205 7.207a5.577 5.577 0 0 0-1.645 3.971z">
                  </path>
                </svg>
              </button>
              {isAttachmentMenuOpen && (
                <div className="absolute bottom-12 left-0 z-20 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                    onClick={() => {
                      setIsAttachmentMenuOpen(false);
                      openContentModal({ mode: "packs" });
                    }}
                  >
                    <span>Adjuntar contenido</span>
                  </button>
                  {false && (
                    <button
                      type="button"
                      disabled
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                    >
                      Subir archivo (próximamente)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-1 h-12">
            <input
              type={"text"}
              className="bg-[#2a3942] rounded-lg w-full px-3 py-3 text-white"
              placeholder="Mensaje"
              onKeyDown={(evt) => changeHandler(evt) }
              onChange={ (evt) => setMessageSend(evt.target.value) }
              value={messageSend}
              disabled={accessState === "expired"}
            />
          </div>
          <div className="flex justify-center items-center h-12">
            <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer" onClick={handleSendMessage}>
              <path fill="currentColor" d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2z">
              </path>
            </svg>
          </div>
        </div>
      </footer>
      {showContentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-white">Adjuntar contenido</h3>
                <p className="text-sm text-slate-300">Elige qué quieres enviar a este fan según sus packs.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-700 bg-slate-800/60 p-1">
                  {(["packs", "extras"] as const).map((mode) => {
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
                        {mode === "packs" ? "Packs" : "Extras PPV"}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                onClick={() => {
                  setShowContentModal(false);
                  setContentModalPackFocus(null);
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
              {contentError && (
                <div className="text-sm text-rose-300">No se ha podido cargar la información de packs.</div>
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
                          const typeEmoji =
                            item.type === "IMAGE" ? "🖼️" : item.type === "VIDEO" ? "🎬" : item.type === "AUDIO" ? "🎧" : "📄";
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
                                <span className="text-base">{locked ? "🔒" : typeEmoji}</span>
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
                        const typeEmoji =
                          item.type === "IMAGE" ? "🖼️" : item.type === "VIDEO" ? "🎬" : item.type === "AUDIO" ? "🎧" : "📄";
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
                                <span className="text-base">{typeEmoji}</span>
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
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                onClick={() => {
                  setShowContentModal(false);
                  setSelectedContentIds([]);
                  setContentModalPackFocus(null);
                }}
              >
                Cancelar
              </button>
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
                  for (const item of chosen) {
                    // eslint-disable-next-line no-await-in-loop
                    await handleAttachContent(item, { keepOpen: true });
                  }
                  setShowContentModal(false);
                  setSelectedContentIds([]);
                  setContentModalPackFocus(null);
                }}
              >
                {selectedContentIds.length <= 1
                  ? "Enviar 1 elemento"
                  : `Enviar ${selectedContentIds.length} elementos`}
              </button>
            </div>
          </div>
        </div>
      )}
      {showQuickSheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm lg:hidden">
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
                <div className="text-base font-semibold text-slate-50 truncate">{contactName}</div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center rounded-full bg-slate-800/80 text-amber-200 px-2 py-[1px]">
                    {packLabel}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-800/80 text-slate-200 px-2 py-[1px]">
                    {formatTier(conversation.customerTier)}
                  </span>
                  {conversation.isHighPriority && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/20 text-amber-200 px-2 py-[1px]">
                      🔥 Alta prioridad
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
              <div className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <span className="text-slate-400 text-xs">Próxima acción</span>
                <span className="text-slate-50 text-sm leading-snug">
                  {conversation.nextAction ? conversation.nextAction : "Sin próxima acción definida"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleOpenNotesFromSheet}
                className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 hover:bg-slate-800"
              >
                Abrir notas
              </button>
              <button
                type="button"
                onClick={handleOpenHistoryFromSheet}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Ver historial
              </button>
            </div>
          </div>
        </div>
      )}
      {accessState === "expired" && (
        <div className="px-4 md:px-6 py-2 text-xs text-[#f5c065] bg-[#2a1f16]">
          El acceso de {contactName} ha caducado. Renueva su pack para seguir respondiendo.
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
  const emoji = getContentEmoji(content?.type);
  const alignItems = message.me ? "items-end" : "items-start";
  const externalUrl = content?.externalUrl;

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
      <div className="flex flex-col min-w-[5%] max-w-[65%] bg-[#202c33] border border-slate-800 p-3 text-white rounded-lg mb-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">{emoji}</span>
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
          {message.me && message.seen ? <span className="text-[#8edafc] text-[11px]">✔✔ Visto</span> : null}
        </div>
      </div>
    </div>
  );
}

function getContentEmoji(type?: string) {
  if (type === "VIDEO") return "🎥";
  if (type === "AUDIO") return "🎧";
  return "📷";
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
