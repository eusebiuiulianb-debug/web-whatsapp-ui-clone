import { forwardRef, ReactNode, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import Link from "next/link";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";
import { readEmojiRecents, recordEmojiRecent } from "../../lib/emoji/recents";
import MessageBalloon from "../MessageBalloon";
import { ChatComposerBar } from "../ChatComposerBar";
import { EmojiPicker } from "../EmojiPicker";
import { PillButton } from "../ui/PillButton";
import {
  CreatorPlatformKey,
  CreatorPlatforms,
  formatPlatformLabel,
  getEnabledPlatforms,
  normalizeCreatorPlatforms,
} from "../../lib/creatorPlatforms";

type ManagerChatMessage = {
  id: string;
  role: "CREATOR" | "ASSISTANT";
  content: string;
  createdAt: string;
};

type ManagerChatGetResponse = {
  messages: ManagerChatMessage[];
};

type ManagerChatPostResponse = {
  reply: { text: string };
  creditsUsed: number;
  creditsRemaining: number;
  usedFallback?: boolean;
  settingsStatus?: "ok" | "settings_missing";
};

type ManagerActionIntent = "ROMPER_EL_HIELO" | "REACTIVAR_FAN_FRIO" | "OFRECER_UN_EXTRA" | "LLEVAR_A_MENSUAL" | "RESUMEN_PULSO_HOY";

const defaultSuggestions = [
  "¿A qué fans debería escribir hoy?",
  "Resúmeme mis números clave de esta semana.",
  "Dame una acción concreta para aumentar ingresos hoy.",
];
const MAX_MAIN_COMPOSER_HEIGHT = 140;
const FAVORITES_KEY_PREFIX = "cortex_quick_prompts_pinned:v1";
const LEGACY_FAVORITES_KEY = "cortex_quick_prompts_pinned";
const MAX_VISIBLE_CHIPS = 4;
const CHIP_GAP = 8;

type CortexTab = "hoy" | "ventas" | "catalogo" | "crecimiento";

const CORTEX_TAB_LABELS: Record<CortexTab, string> = {
  hoy: "Hoy",
  ventas: "Ventas",
  catalogo: "Catálogo",
  crecimiento: "Crecimiento",
};

const GROWTH_PROMPT_IDS = [
  "ideas_plataforma",
  "calendario_7",
  "publicar_hoy",
  "hooks_guiones",
  "plan_14d",
];

const DEFAULT_PINNED_BY_TAB: Record<CortexTab, string[]> = {
  hoy: ["priorizo_hoy", "diagnostico_3", "acciones_rapidas", "plan_7", "rescatar"],
  ventas: ["empuje_mensual", "oferta_dia", "ctas_listos", "optimizar_precios", "vender_vip"],
  catalogo: ["falta_grabar", "extras_nuevos", "mejorar_packs", "bundles", "copy_catalogo"],
  crecimiento: GROWTH_PROMPT_IDS,
};

const PROMPT_LABEL_TO_ID_BY_TAB: Record<Exclude<CortexTab, "crecimiento">, Record<string, string>> = {
  hoy: {
    "¿Qué priorizo hoy?": "priorizo_hoy",
    "Diagnóstico 3 bullets": "diagnostico_3",
    "3 acciones rápidas": "acciones_rapidas",
    "Plan 7 días": "plan_7",
    "Rescatar caducan pronto": "rescatar",
  },
  ventas: {
    "Empuje a mensual (hoy)": "empuje_mensual",
    "Oferta del día": "oferta_dia",
    "3 CTAs listos": "ctas_listos",
    "Optimizar precios": "optimizar_precios",
    "Qué vender a VIP": "vender_vip",
  },
  catalogo: {
    "Qué falta grabar": "falta_grabar",
    "5 extras nuevos": "extras_nuevos",
    "Mejorar packs": "mejorar_packs",
    Bundles: "bundles",
    "Copy de catálogo": "copy_catalogo",
  },
};

const GROWTH_PROMPT_MATCHERS: Array<{ id: string; match: (label: string) => boolean }> = [
  { id: "ideas_plataforma", match: (label) => label.toLowerCase().startsWith("3 ideas") },
  { id: "calendario_7", match: (label) => label.toLowerCase().startsWith("calendario 7") },
  { id: "publicar_hoy", match: (label) => label.toLowerCase().startsWith("qué publicar hoy") },
  { id: "hooks_guiones", match: (label) => label.toLowerCase().startsWith("hooks") },
  {
    id: "plan_14d",
    match: (label) =>
      label.toLowerCase().startsWith("plan crecimiento 14") ||
      label.toLowerCase().startsWith("plan de crecimiento"),
  },
];

function toCortexTab(mode: GlobalMode): CortexTab {
  if (mode === "VENTAS") return "ventas";
  if (mode === "CATALOGO") return "catalogo";
  if (mode === "CRECIMIENTO") return "crecimiento";
  return "hoy";
}

function normalizePromptId(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolvePromptId(tab: CortexTab, label: string) {
  if (tab === "crecimiento") {
    const match = GROWTH_PROMPT_MATCHERS.find((item) => item.match(label));
    if (match) return match.id;
    return normalizePromptId(label);
  }
  const mapped = PROMPT_LABEL_TO_ID_BY_TAB[tab]?.[label];
  return mapped ?? normalizePromptId(label);
}

function normalizePinnedIds(tab: CortexTab, values: unknown) {
  if (!Array.isArray(values)) return [];
  const knownIds = new Set([
    ...DEFAULT_PINNED_BY_TAB[tab],
    ...(tab === "crecimiento" ? GROWTH_PROMPT_IDS : Object.values(PROMPT_LABEL_TO_ID_BY_TAB[tab] ?? {})),
  ]);
  const next = values
    .map((item) => {
      if (typeof item !== "string") return null;
      const resolved = knownIds.has(item) ? item : resolvePromptId(tab, item);
      return knownIds.has(resolved) ? resolved : null;
    })
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(next));
}

type GlobalMode = "HOY" | "VENTAS" | "CATALOGO" | "CRECIMIENTO";

type Props = {
  businessSnapshot?: CreatorBusinessSnapshot | null;
  hideTitle?: boolean;
  embedded?: boolean;
  suggestions?: string[];
  density?: "comfortable" | "compact";
  variant?: "card" | "chat";
  onBackToBoard?: () => void;
  title?: string;
  avatarUrl?: string;
  statusText?: string;
  contextContent?: ReactNode;
  scope?: "global" | "fan";
  platforms?: CreatorPlatforms | null;
};

export type ManagerChatCardHandle = {
  sendQuickPrompt: (message: string, action?: ManagerActionIntent) => void;
  setDraft: (message: string) => void;
};

export const ManagerChatCard = forwardRef<ManagerChatCardHandle, Props>(function ManagerChatCard(
  {
    businessSnapshot,
    hideTitle = false,
    embedded = false,
    suggestions,
    density = "comfortable",
    variant = "card",
    onBackToBoard,
    title,
    avatarUrl,
    statusText,
    contextContent,
    platforms,
    scope = "fan",
  }: Props,
  ref
) {
  const [messages, setMessages] = useState<ManagerChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<"ok" | "settings_missing" | null>(null);
  const [globalMode, setGlobalMode] = useState<GlobalMode>("HOY");
  const [growthPlatform, setGrowthPlatform] = useState<CreatorPlatformKey>("tiktok");
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [emojiRecents, setEmojiRecents] = useState<string[]>([]);
  const [isFavoritesEditorOpen, setIsFavoritesEditorOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [pinnedPromptIds, setPinnedPromptIds] = useState<string[]>(() => DEFAULT_PINNED_BY_TAB.hoy);
  const [didLoadPinned, setDidLoadPinned] = useState(false);
  const [hasUsedQuickAccess, setHasUsedQuickAccess] = useState(false);
  const [actionsWidth, setActionsWidth] = useState(0);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE_CHIPS);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const favoritesModalRef = useRef<HTMLDivElement | null>(null);
  const favoritesSheetRef = useRef<HTMLDivElement | null>(null);
  const quickAccessActionsRef = useRef<HTMLDivElement | null>(null);
  const quickAccessScrollerRef = useRef<HTMLDivElement | null>(null);
  const quickAccessMeasureRef = useRef<HTMLDivElement | null>(null);
  const overflowModalRef = useRef<HTMLDivElement | null>(null);
  const overflowSheetRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<CreatorBusinessSnapshot | null>(businessSnapshot ?? null);
  const isDemo = !process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  const activeTabKey = useMemo(() => (scope === "global" ? toCortexTab(globalMode) : "hoy"), [globalMode, scope]);
  const favoritesStorageKey = useMemo(() => `${FAVORITES_KEY_PREFIX}:${activeTabKey}`, [activeTabKey]);
  const scrollerPaddingRight = Math.max(actionsWidth + 12, 64);
  const resizeComposer = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, MAX_MAIN_COMPOSER_HEIGHT);
    el.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    void loadMessages();
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (businessSnapshot) {
      setSnapshot(businessSnapshot);
    }
  }, [businessSnapshot]);

  useEffect(() => {
    resizeComposer(inputRef.current);
  }, [input, resizeComposer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDidLoadPinned(false);
    const raw = window.localStorage.getItem(favoritesStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 0) {
          setPinnedPromptIds([]);
        } else {
          const normalized = normalizePinnedIds(activeTabKey, parsed);
          const next = normalized.length > 0 ? normalized : DEFAULT_PINNED_BY_TAB[activeTabKey];
          setPinnedPromptIds(next);
        }
      } catch {
        setPinnedPromptIds(DEFAULT_PINNED_BY_TAB[activeTabKey]);
      }
      setDidLoadPinned(true);
      return;
    }

    let legacyValues: unknown = null;
    const legacyRaw = window.localStorage.getItem(LEGACY_FAVORITES_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as Record<string, unknown> | unknown[];
        if (Array.isArray(parsed)) {
          legacyValues = parsed;
        } else if (parsed && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>;
          if (Array.isArray(record.global)) {
            legacyValues = record.global;
          } else if (Array.isArray(record[activeTabKey])) {
            legacyValues = record[activeTabKey];
          }
        }
      } catch {
        legacyValues = null;
      }
    }

    if (Array.isArray(legacyValues) && legacyValues.length === 0) {
      setPinnedPromptIds([]);
      window.localStorage.setItem(favoritesStorageKey, JSON.stringify([]));
      if (legacyRaw) {
        window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
      }
      setDidLoadPinned(true);
      return;
    }

    const normalizedLegacy = normalizePinnedIds(activeTabKey, legacyValues);
    const next = normalizedLegacy.length > 0 ? normalizedLegacy : DEFAULT_PINNED_BY_TAB[activeTabKey];
    setPinnedPromptIds(next);
    window.localStorage.setItem(favoritesStorageKey, JSON.stringify(next));
    if (legacyRaw) {
      window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
    }
    setDidLoadPinned(true);
  }, [activeTabKey, favoritesStorageKey]);

  useEffect(() => {
    if (!didLoadPinned || typeof window === "undefined") return;
    window.localStorage.setItem(favoritesStorageKey, JSON.stringify(pinnedPromptIds));
  }, [didLoadPinned, favoritesStorageKey, pinnedPromptIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasUsedQuickAccess(window.localStorage.getItem("cortex_used_quick_access") === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const node = quickAccessActionsRef.current;
    if (!node) return;
    const updateWidth = () => setActionsWidth(node.offsetWidth);
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTabKey, pinnedPromptIds.length]);

  useEffect(() => {
    if (!isEmojiOpen) return;
    setEmojiRecents(readEmojiRecents());
  }, [isEmojiOpen]);

  useEffect(() => {
    if (!isFavoritesEditorOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (favoritesModalRef.current?.contains(target)) return;
      if (favoritesSheetRef.current?.contains(target)) return;
      setIsFavoritesEditorOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFavoritesEditorOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFavoritesEditorOpen]);

  useEffect(() => {
    if (!overflowOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (overflowModalRef.current?.contains(target)) return;
      if (overflowSheetRef.current?.contains(target)) return;
      setOverflowOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [overflowOpen]);

  async function loadMessages(opts?: { silent?: boolean }) {
    try {
      if (!opts?.silent) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch("/api/creator/ai-manager/messages?tab=STRATEGY");
      if (!res.ok) {
        throw new Error("No se pudo cargar el historial");
      }
      const data = (await res.json()) as ManagerChatGetResponse;
      setMessages((data?.messages ?? []).slice(-50));
      if (!opts?.silent) {
        setUsedFallback(false);
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar el chat del Manager IA.");
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }

  function buildDemoReply(text: string) {
    const lower = text.toLowerCase();
    if (lower.includes("fans") && lower.includes("escribir")) {
      return "Hoy prioriza:\n• Marta (VIP, caduca en 2d): haz un check-in rápido.\n• Luis (nuevo): da la bienvenida y ofrece pack mensual.\n• Ana (en riesgo): pregúntale qué contenido quiere ver.";
    }
    if (lower.includes("números") || lower.includes("resúmeme mis números")) {
      return "Tus números demo:\n• Ingresos 7d: 652 €\n• Ingresos 30d: 1.930 €\n• Extras 30d: 48 ventas\n• Fans nuevos 30d: 12\n• Riesgo 7d: 25 €";
    }
    if (lower.includes("acción concreta") || lower.includes("ingresos")) {
      return "Acción demo:\n1) Envía un upsell a tus 3 VIP sobre el pack mensual.\n2) Comparte un extra de 15 € con fans en riesgo.\n3) Cierra con un CTA claro a compra hoy.";
    }
    return "Modo demo activo: conecta tu OPENAI_API_KEY para respuestas con tus datos reales.";
  }

  function inferAction(message: string): ManagerActionIntent | null {
    const normalized = message.toLowerCase();
    if (normalized.includes("hielo") || normalized.includes("primer") || normalized.includes("rompe")) return "ROMPER_EL_HIELO";
    if (normalized.includes("frío") || normalized.includes("frio") || normalized.includes("reactivar") || normalized.includes("riesgo")) return "REACTIVAR_FAN_FRIO";
    if (normalized.includes("extra") || normalized.includes("upsell")) return "OFRECER_UN_EXTRA";
    if (normalized.includes("mensual")) return "LLEVAR_A_MENSUAL";
    if (normalized.includes("pulso") || normalized.includes("resumen") || normalized.includes("prioridad")) return "RESUMEN_PULSO_HOY";
    return null;
  }

  async function handleSend(externalMessage?: string, forcedAction?: ManagerActionIntent | null) {
    const text = typeof externalMessage === "string" ? externalMessage.trim() : input.trim();
    if (!text || sending) return;
    const action = forcedAction ?? inferAction(text);
    try {
      setSending(true);
      setError(null);
      const now = new Date().toISOString();
      const optimisticId = `local-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: optimisticId, role: "CREATOR", content: text, createdAt: now },
      ]);

      if (isDemo) {
        const demoReply = buildDemoReply(text);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          {
            id: `assistant-${Date.now()}`,
            role: "ASSISTANT",
            content: demoReply,
            createdAt: new Date().toISOString(),
          },
        ]);
        setUsedFallback(true);
        setInput("");
        setSending(false);
        return;
      }

      const res = await fetch("/api/creator/ai-manager/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "STRATEGY", message: text, action }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Error enviando mensaje");
      }

      const data = (await res.json()) as ManagerChatPostResponse;
      const assistantMessage: ManagerChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "ASSISTANT",
        content: data?.reply?.text ?? "Sin respuesta",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) =>
        [...prev.filter((m) => m.id !== optimisticId), assistantMessage].slice(-50)
      );
      setUsedFallback(Boolean(data?.usedFallback));
      setSettingsStatus(data?.settingsStatus ?? null);
      void loadMessages({ silent: true });
      setInput("");
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("local-")));
      setError("No se pudo enviar el mensaje al Manager IA.");
    } finally {
      setSending(false);
    }
  }

  useImperativeHandle(ref, () => ({
    sendQuickPrompt: (message: string, action?: ManagerActionIntent) => {
      setInput(message);
      void handleSend(message, action);
    },
    setDraft: (message: string) => {
      setInput(message);
      requestAnimationFrame(() => resizeComposer(inputRef.current));
      inputRef.current?.focus();
    },
  }));

  const normalizedPlatforms = useMemo(() => normalizeCreatorPlatforms(platforms), [platforms]);
  const enabledPlatforms = useMemo(() => getEnabledPlatforms(normalizedPlatforms), [normalizedPlatforms]);

  useEffect(() => {
    if (enabledPlatforms.length > 0 && !enabledPlatforms.includes(growthPlatform)) {
      setGrowthPlatform(enabledPlatforms[0]);
    }
  }, [enabledPlatforms, growthPlatform]);

  const activeGrowthPlatform: CreatorPlatformKey =
    globalMode === "CRECIMIENTO" && enabledPlatforms.length > 0
      ? enabledPlatforms.includes(growthPlatform)
        ? growthPlatform
        : enabledPlatforms[0]
      : growthPlatform;

  const globalModePrompts: Record<GlobalMode, Record<string, string>> = {
    HOY: {
      "¿Qué priorizo hoy?":
        "Con mis datos de hoy (cola, en riesgo, caducan pronto, VIP activos, ventas 7/30d), dime: 1) top 3 prioridades, 2) por qué, 3) próxima acción concreta para cada una.",
      "Diagnóstico 3 bullets":
        "Haz un diagnóstico en 3 bullets: qué va bien, qué bloquea ingresos, y el cambio mínimo que haría hoy.",
      "3 acciones rápidas":
        "Dame 3 acciones rápidas (15 min c/u) para generar ingresos hoy, sin ser agresivo con los fans.",
      "Plan 7 días":
        "Plan de 7 días: objetivo diario + acción + mensaje sugerido + KPI a mirar.",
      "Rescatar caducan pronto":
        "Redacta mensajes cortos para fans que caducan pronto: 1 suave, 1 directo, 1 juguetón. Sin presión.",
    },
    VENTAS: {
      "Empuje a mensual (hoy)": "Dame un plan rápido para empujar suscripciones mensuales hoy: a quién escribir, 2 plantillas de mensaje (suave/directo) y un CTA claro.",
      "Oferta del día": "Propón una oferta del día convincente: qué producto, precio/bonus, mensaje breve y urgencia sin sonar agresivo.",
      "3 CTAs listos": "Redacta 3 CTAs listos para enviar hoy, cada uno con tono distinto (cálido, directo, juguetón).",
      "Optimizar precios": "Analiza mis precios actuales y sugiere ajustes simples (subir/bajar/crear escalón) con racional y riesgo.",
      "Qué vender a VIP": "Dime qué debería ofrecer a mis VIP hoy: producto, precio, argumento y CTA específico.",
    },
    CATALOGO: {
      "Qué falta grabar": "Dame 5 ideas concretas de contenido que faltan en mi catálogo y por qué ayudarían a vender más.",
      "5 extras nuevos": "Propón 5 extras nuevos con título, precio sugerido y a quién ofrecerlos.",
      "Mejorar packs": "Sugiere mejoras a mis packs actuales: qué añadir/quitar, precio y copy principal.",
      Bundles: "Diseña 2 bundles atractivos con precio, qué incluyen y el mensaje de venta.",
      "Copy de catálogo": "Reescribe el copy del catálogo para subir conversión: 3 versiones cortas con enfoques distintos.",
    },
    CRECIMIENTO: {},
  };

  const fallbackBanner = settingsStatus === "settings_missing"
    ? (
        <span>
          Revisar ajustes: falta `OPENAI_API_KEY` o no se pudo descifrar.{" "}
          <Link href="/creator/ai-settings">
            <a className="underline hover:text-amber-100">Abrir ajustes</a>
          </Link>
        </span>
      )
    : "Modo demo activo: conecta tu OPENAI_API_KEY para respuestas con tus datos reales.";
  const globalModes: GlobalMode[] = ["HOY", "VENTAS", "CATALOGO", "CRECIMIENTO"];
  const growthActiveList = enabledPlatforms.length
    ? enabledPlatforms
        .map((key) => {
          const handle = normalizedPlatforms[key]?.handle?.trim();
          const cleanHandle = handle ? handle.replace(/^@+/, "") : "";
          const suffix = cleanHandle ? ` (@${cleanHandle})` : "";
          return `${formatPlatformLabel(key)}${suffix}`;
        })
        .join(", ")
    : "TikTok, Instagram, YouTube o X";

  const baseGlobalModeContent: Record<GlobalMode, { actions: readonly string[]; suggestions: readonly string[] }> = {
    HOY: {
      actions: ["¿Qué priorizo hoy?", "Diagnóstico 3 bullets", "3 acciones rápidas"],
      suggestions: ["Plan 7 días", "Rescatar caducan pronto"],
    },
    VENTAS: {
      actions: ["Empuje a mensual (hoy)", "Oferta del día", "3 CTAs listos"],
      suggestions: ["Optimizar precios", "Qué vender a VIP"],
    },
    CATALOGO: {
      actions: ["Qué falta grabar", "5 extras nuevos", "Mejorar packs"],
      suggestions: ["Bundles", "Copy de catálogo"],
    },
    CRECIMIENTO: { actions: [], suggestions: [] },
  };

  const growthContent = useMemo(() => {
    const primaryLabel = `3 ideas para ${formatPlatformLabel(activeGrowthPlatform)}`;
    const actions = [primaryLabel, "Calendario 7 días", "Qué publicar hoy"] as const;
    const suggestions = ["Hooks + guiones", "Plan crecimiento 14d"] as const;
    return { actions, suggestions };
  }, [activeGrowthPlatform]);

  const globalModeContent = globalMode === "CRECIMIENTO" ? growthContent : baseGlobalModeContent[globalMode];

  const getGlobalPrompt = (label: string) => {
    if (globalMode === "CRECIMIENTO") {
      const platformLabel = formatPlatformLabel(activeGrowthPlatform);
      const handle = normalizedPlatforms[activeGrowthPlatform]?.handle?.trim();
      const cleanHandle = handle ? handle.replace(/^@+/, "") : "";
      const focusLabel = cleanHandle ? `${platformLabel} (@${cleanHandle})` : platformLabel;
      const objective = "Objetivo: traer tráfico al bio-link y vender packs/extras.";
      if (label.toLowerCase().startsWith("3 ideas")) {
        return `Dame 3 ideas para ${focusLabel}: hook, guion (6-8 líneas) y CTA al bio-link. Plataformas activas: ${growthActiveList}. ${objective}`;
      }
      if (label.toLowerCase().startsWith("calendario")) {
        return `Arma un calendario de 7 días priorizando ${focusLabel} pero usando lo mejor de (${growthActiveList}). Incluye objetivo diario, formato y CTA claro a packs/bio-link. ${objective}`;
      }
      if (label.toLowerCase().startsWith("qué publicar hoy")) {
        return `Dime qué publicar hoy en ${focusLabel}: tema, ángulo y CTA corto. Ten en cuenta mis plataformas activas (${growthActiveList}) y prioriza mover bio-link o packs.`;
      }
      if (label.toLowerCase().startsWith("hooks")) {
        return `Genera 5 hooks + mini guiones (15-25s) listos para grabar en ${focusLabel}. Usa mis plataformas activas (${growthActiveList}) y orienta a tráfico y conversión.`;
      }
      if (label.toLowerCase().startsWith("plan crecimiento 14d") || label.toLowerCase().startsWith("plan de crecimiento")) {
        return `Crea un plan de crecimiento de 14 días combinando ${growthActiveList}. Resume foco semanal, tipo de contenido y meta (tráfico al bio-link / ventas de packs).`;
      }
      return label;
    }
    return globalModePrompts[globalMode]?.[label] ?? label;
  };

  const quickSuggestions =
    scope === "global"
      ? [ ...(globalModeContent?.actions ?? []), ...(globalModeContent?.suggestions ?? []) ]
      : suggestions && suggestions.length > 0
      ? suggestions
      : defaultSuggestions;
  const availablePrompts = quickSuggestions;
  const promptCatalog = useMemo(
    () =>
      availablePrompts.map((label) => ({
        id: resolvePromptId(activeTabKey, label),
        label,
      })),
    [availablePrompts, activeTabKey]
  );
  const promptLabelById = useMemo(() => {
    const map = new Map<string, string>();
    promptCatalog.forEach((item) => {
      map.set(item.id, item.label);
    });
    return map;
  }, [promptCatalog]);
  const resolvedPinnedIds = useMemo(
    () => pinnedPromptIds.filter((id) => promptLabelById.has(id)),
    [pinnedPromptIds, promptLabelById]
  );
  const visiblePrompts = useMemo(
    () => resolvedPinnedIds
      .map((id) => promptLabelById.get(id))
      .filter((label): label is string => Boolean(label)),
    [resolvedPinnedIds, promptLabelById]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scroller = quickAccessScrollerRef.current;
    const measurer = quickAccessMeasureRef.current;
    if (!scroller || !measurer) return;

    const measure = () => {
      const available = scroller.clientWidth - scrollerPaddingRight;
      if (available <= 0) {
        setVisibleCount(0);
        return;
      }
      const items = Array.from(measurer.querySelectorAll("[data-measure-chip]")) as HTMLElement[];
      if (items.length === 0) {
        setVisibleCount(0);
        return;
      }
      let total = 0;
      let count = 0;
      for (const item of items) {
        const width = item.offsetWidth;
        const nextTotal = count === 0 ? width : total + CHIP_GAP + width;
        if (nextTotal > available) break;
        total = nextTotal;
        count += 1;
      }
      const nextCount = Math.min(count, MAX_VISIBLE_CHIPS);
      setVisibleCount((prev) => (prev === nextCount ? prev : nextCount));
    };

    const raf = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(raf);
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(scroller);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [resolvedPinnedIds, scrollerPaddingRight, visiblePrompts]);

  const chipRowClass = clsx("flex flex-wrap items-center gap-2 pb-1", scope === "fan" ? "px-3 py-2" : "");
  const modeRowClass =
    "flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const applyPrompt = (prompt: string, autoSend: boolean) => {
    setInput((prev) => {
      if (!prev || !prev.trim()) return prompt;
      return `${prev.trim()}\n\n${prompt}`;
    });
    inputRef.current?.focus();
    if (autoSend) {
      void handleSend(prompt);
    }
  };
  const sendDisabled = sending || !input.trim();
  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };
  const handleInsertEmoji = useCallback(
    (emoji: string) => {
      const inputEl = inputRef.current;
      if (!inputEl) {
        setInput((prev) => `${prev}${emoji}`);
        return;
      }
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? inputEl.value.length;
      const nextValue = `${inputEl.value.slice(0, start)}${emoji}${inputEl.value.slice(end)}`;
      setInput(nextValue);
      requestAnimationFrame(() => {
        inputEl.focus();
        const cursor = start + emoji.length;
        inputEl.setSelectionRange(cursor, cursor);
        resizeComposer(inputEl);
      });
    },
    [resizeComposer]
  );
  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      handleInsertEmoji(emoji);
      setEmojiRecents((prev) => recordEmojiRecent(emoji, prev));
    },
    [handleInsertEmoji]
  );
  const handleRecentEmojiInsert = (emoji: string) => {
    handleEmojiSelect(emoji);
    setIsEmojiOpen(false);
  };
  const handleEmojiToggle = () => {
    setIsEmojiOpen((prev) => !prev);
  };
  const handleEmojiPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };
  const markQuickAccessUsed = useCallback(() => {
    if (hasUsedQuickAccess || typeof window === "undefined") return;
    window.localStorage.setItem("cortex_used_quick_access", "true");
    setHasUsedQuickAccess(true);
  }, [hasUsedQuickAccess]);
  const handleFavoritesEditorClose = () => {
    setIsFavoritesEditorOpen(false);
  };
  const togglePinnedPrompt = (id: string) => {
    setPinnedPromptIds((prev) => {
      const isPinned = prev.includes(id);
      return isPinned ? prev.filter((item) => item !== id) : [ ...prev, id ];
    });
  };

  if (variant === "chat") {
    const headerLabel = title || "Manager IA";
    const tabLabel = scope === "global" ? CORTEX_TAB_LABELS[activeTabKey] : "Cortex";
    const quickAccessLabel = scope === "global" ? `Atajos · ${tabLabel}` : "Atajos";
    const editorTitle = scope === "global" ? `Editar atajos · ${tabLabel}` : "Editar atajos";
    const editorList = promptCatalog;
    const visibleCountCapped = Math.min(visibleCount, MAX_VISIBLE_CHIPS, visiblePrompts.length);
    const visibleChipLabels = visiblePrompts.slice(0, visibleCountCapped);
    const overflowChipLabels = visiblePrompts.slice(visibleCountCapped);
    const overflowCount = overflowChipLabels.length;
    const emojiPickerTopContent = emojiRecents.length ? (
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-slate-800/70 bg-slate-900/60 px-2 py-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Recientes</span>
        {emojiRecents.map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            type="button"
            onClick={() => handleRecentEmojiInsert(emoji)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 text-sm text-slate-100 hover:bg-slate-800/80"
            aria-label={`Emoji reciente ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    ) : null;
    const editorListContent = (
      <div className="mt-4 space-y-2 max-h-none sm:max-h-[60vh] overflow-y-auto pr-1">
        {editorList.length === 0 && (
          <div className="text-[12px] text-slate-400">No hay prompts disponibles.</div>
        )}
        {editorList.map((item) => {
          const isPinned = pinnedPromptIds.includes(item.id);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2"
            >
              <span className="text-[13px] text-slate-100">{item.label}</span>
              <button
                type="button"
                onClick={() => togglePinnedPrompt(item.id)}
                className={clsx(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                  isPinned
                    ? "bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                    : "bg-slate-800/70 text-slate-200 hover:bg-slate-800"
                )}
              >
                {isPinned ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          );
        })}
      </div>
    );
    const editorFooter = (
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPinnedPromptIds(DEFAULT_PINNED_BY_TAB[activeTabKey])}
          className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
        >
          Recomendados
        </button>
        <button
          type="button"
          onClick={handleFavoritesEditorClose}
          className="h-9 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40"
        >
          Listo
        </button>
      </div>
    );
    const overflowPanel =
      overflowOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center bg-black/60 px-4 py-6">
                <div
                  ref={overflowModalRef}
                  className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Atajos ocultos"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Atajos · {tabLabel}</h3>
                      <p className="text-[11px] text-slate-400">
                        Toca uno para insertarlo. No cambia tus atajos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOverflowOpen(false)}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {overflowChipLabels.length === 0 && (
                      <div className="text-[12px] text-slate-400">No hay atajos ocultos.</div>
                    )}
                    {overflowChipLabels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          markQuickAccessUsed();
                          applyPrompt(scope === "global" ? getGlobalPrompt(label) : label, false);
                          setOverflowOpen(false);
                        }}
                        className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800/70"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOverflowOpen(false);
                        setIsEmojiOpen(false);
                        setIsFavoritesEditorOpen(true);
                      }}
                      className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                    >
                      Editar atajos
                    </button>
                  </div>
                </div>
              </div>
              <div className="sm:hidden fixed inset-0 z-[9999] flex items-end justify-center bg-black/60">
                <div
                  ref={overflowSheetRef}
                  className="w-full max-w-lg rounded-t-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl max-h-[80vh] overflow-y-auto"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Atajos ocultos"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Atajos · {tabLabel}</h3>
                      <p className="text-[11px] text-slate-400">
                        Toca uno para insertarlo. No cambia tus atajos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOverflowOpen(false)}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {overflowChipLabels.length === 0 && (
                      <div className="text-[12px] text-slate-400">No hay atajos ocultos.</div>
                    )}
                    {overflowChipLabels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          markQuickAccessUsed();
                          applyPrompt(scope === "global" ? getGlobalPrompt(label) : label, false);
                          setOverflowOpen(false);
                        }}
                        className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800/70"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOverflowOpen(false);
                        setIsEmojiOpen(false);
                        setIsFavoritesEditorOpen(true);
                      }}
                      className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                    >
                      Editar atajos
                    </button>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null;
    const favoritesEditor =
      isFavoritesEditorOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center bg-black/60 px-4 py-6">
                <div
                  ref={favoritesModalRef}
                  className="w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editar favoritos"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{editorTitle}</h3>
                      <p className="text-[11px] text-slate-400">
                        Elige qué botones aparecen abajo.{" "}
                        <span className="text-slate-500">(máx recomendado 6)</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleFavoritesEditorClose}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  {editorListContent}
                  {editorFooter}
                </div>
              </div>
              <div className="sm:hidden fixed inset-0 z-[9999] flex items-end justify-center bg-black/60">
                <div
                  ref={favoritesSheetRef}
                  className="w-full max-w-lg rounded-t-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl max-h-[80vh] overflow-y-auto"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editar favoritos"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{editorTitle}</h3>
                      <p className="text-[11px] text-slate-400">
                        Elige qué botones aparecen abajo.{" "}
                        <span className="text-slate-500">(máx recomendado 6)</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleFavoritesEditorClose}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  {editorListContent}
                  {editorFooter}
                </div>
              </div>
            </>,
            document.body
          )
        : null;
    const desktopHeaderClass = clsx(
      "hidden md:flex items-center gap-3 bg-slate-950/70 border-b border-slate-800 px-4 md:px-6",
      hideTitle ? "py-2 justify-end" : "py-3 md:py-4 justify-between"
    );
    return (
      <div className="flex flex-col w-full h-full min-h-0">
        {onBackToBoard && (
          <header className="md:hidden sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 bg-slate-950/90 border-b border-slate-800 backdrop-blur">
            <button
              type="button"
              onClick={onBackToBoard}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
            >
              ← Volver
            </button>
            {!hideTitle && (
              <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
                <span className="truncate text-sm font-semibold text-slate-50">{headerLabel}</span>
                <span className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">
                  IA
                </span>
              </div>
            )}
          </header>
        )}
        <div className={desktopHeaderClass}>
          {!hideTitle && (
            <div className="flex items-center gap-3 min-w-0">
              {avatarUrl ? (
                <div className="w-12 h-12 rounded-full overflow-hidden border border-[rgba(134,150,160,0.2)] bg-[#2a3942] shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt={headerLabel} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#2a3942] text-white font-semibold shadow-md">
                  {headerLabel.trim().charAt(0)}
                </div>
              )}
              <div className="flex flex-col">
                <h1 className="text-base font-semibold text-slate-50">{headerLabel}</h1>
                <p className="text-sm text-slate-300">{statusText || "Chat interno. No se envía nada a tus fans."}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {contextContent ? (
            <div className="bg-slate-950/80 border-b border-slate-800 px-4 py-2.5">{contextContent}</div>
          ) : null}
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto bg-slate-950/90 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(rgba(8, 14, 20, 0.85), rgba(8, 14, 20, 0.85)), url('/assets/images/background.jpg')",
            }}
          >
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 space-y-3">
              {loading && <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>}
              {error && !loading && <div className="text-center text-red-400 text-sm mt-2">{error}</div>}
              {!loading && !error && messages.length === 0 && (
                <MessageBalloon
                  me={false}
                  message="Hola, soy tu Manager IA en Cortex. Pregúntame qué priorizar, pídeme diagnóstico o un plan de 7 días y te ayudo."
                  time={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  fromLabel="Manager IA"
                  meLabel="Tú"
                />
              )}
              {messages.map((msg) => {
                const isCreator = msg.role === "CREATOR";
                const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return (
                  <MessageBalloon
                    key={msg.id}
                    me={isCreator}
                    message={msg.content}
                    time={time}
                    fromLabel="Manager IA"
                    meLabel="Tú"
                  />
                );
              })}
            </div>
          </div>
          {usedFallback && (
            <div className="px-4 pt-2 text-[12px] text-amber-200 bg-amber-500/10 border-t border-amber-500/30">
              {fallbackBanner}
            </div>
          )}
          <div className="sticky bottom-0 z-20 border-t border-slate-800/60 bg-gradient-to-b from-slate-950/90 via-slate-950/80 to-slate-950/70 backdrop-blur-xl">
            <div className="px-4 sm:px-6 lg:px-8 py-3">
              <div
                className={clsx(
                  "mt-1.5 flex flex-col gap-2 rounded-2xl border px-3 py-2.5 transition backdrop-blur",
                  "shadow-[0_-12px_22px_-16px_rgba(0,0,0,0.55)]",
                  "bg-gradient-to-r from-slate-900/55 via-slate-900/75 to-slate-900/55 border-slate-700/70",
                  "focus-within:border-emerald-400/70 focus-within:ring-1 focus-within:ring-emerald-400/25"
                )}
              >
                <div className="flex flex-col gap-2 px-1 pt-1">
                  {scope === "global" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {globalModes.map((mode) => {
                          const isActive = globalMode === mode;
                          return (
                            <PillButton
                              key={mode}
                              intent={isActive ? "primary" : "ghost"}
                              size="sm"
                              className="h-7 px-2.5 text-[11px]"
                              onClick={() => setGlobalMode(mode)}
                            >
                              {mode === "HOY"
                                ? "Hoy"
                                : mode === "VENTAS"
                                ? "Ventas"
                                : mode === "CATALOGO"
                                ? "Catálogo"
                                : "Crecimiento"}
                            </PillButton>
                          );
                        })}
                      </div>
                      {globalMode === "CRECIMIENTO" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">Plataforma</span>
                          {(enabledPlatforms.length > 1
                            ? enabledPlatforms
                            : enabledPlatforms.length === 1
                            ? enabledPlatforms
                            : [activeGrowthPlatform]
                          ).map((platform) => (
                            <PillButton
                              key={platform}
                              intent={platform === activeGrowthPlatform ? "primary" : "ghost"}
                              size="sm"
                              className="h-7 px-2.5 text-[11px]"
                              onClick={() => setGrowthPlatform(platform)}
                            >
                              {formatPlatformLabel(platform)}
                            </PillButton>
                          ))}
                          <span className="text-[10px] text-slate-500">Activas: {growthActiveList}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-nowrap items-center gap-3 min-w-0">
                    <span className="text-[11px] font-semibold text-slate-300 shrink-0">
                      <span className="mr-1">⚡</span>
                      {quickAccessLabel}
                    </span>
                    <div className="relative flex items-center gap-2 flex-1 min-w-0">
                      <div
                        ref={quickAccessScrollerRef}
                        className="flex-1 min-w-0 flex flex-nowrap items-center gap-2 whitespace-nowrap overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        style={{ paddingRight: `${scrollerPaddingRight}px`, WebkitOverflowScrolling: "touch" }}
                      >
                        {visibleChipLabels.map((label, idx) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              markQuickAccessUsed();
                              applyPrompt(scope === "global" ? getGlobalPrompt(label) : label, false);
                            }}
                            title={label}
                            className={clsx(
                              "shrink-0 max-w-[160px] truncate rounded-full border px-2 py-1 text-[11px] font-semibold transition",
                              idx === 0
                                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                                : "border-slate-700/70 bg-slate-900/60 text-slate-200 hover:text-slate-100"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                        {visiblePrompts.length === 0 && (
                          <span className="text-[11px] text-slate-500 whitespace-nowrap">
                            Sin atajos. Pulsa Editar.
                          </span>
                        )}
                      </div>
                      <div
                        ref={quickAccessActionsRef}
                        className="shrink-0 flex items-center gap-2"
                      >
                        {overflowCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEmojiOpen(false);
                              setOverflowOpen(true);
                            }}
                            title="Ver atajos"
                            aria-label="Más atajos"
                            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-slate-600/70 bg-slate-900/40 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/70"
                          >
                            <span>Más</span>
                            <span className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-slate-800 px-1 text-[10px] text-slate-200">
                              +{overflowCount}
                            </span>
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsEmojiOpen(false);
                          setOverflowOpen(false);
                          setIsFavoritesEditorOpen(true);
                        }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/90"
                        >
                          Editar
                        </button>
                      </div>
                      <div
                        ref={quickAccessMeasureRef}
                        className="pointer-events-none absolute left-[-9999px] top-0 opacity-0 whitespace-nowrap"
                        aria-hidden="true"
                      >
                        {visiblePrompts.map((label, idx) => (
                          <span
                            key={`measure-${label}-${idx}`}
                            data-measure-chip
                            className="shrink-0 max-w-[160px] truncate rounded-full border px-2 py-1 text-[11px] font-semibold"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {!hasUsedQuickAccess && visibleChipLabels.length > 0 && (
                    <div className="pl-1 text-[11px] text-slate-500">
                      Pulsa un atajo para insertarlo en el mensaje.
                    </div>
                  )}
                </div>
                <textarea
                  ref={inputRef}
                  rows={1}
                  className={clsx(
                    "w-full min-h-[44px] resize-none overflow-y-auto bg-transparent border-0 outline-none ring-0",
                    "px-1 pt-2 pb-1 text-sm leading-6 text-slate-50 whitespace-pre-wrap break-words",
                    "placeholder:text-slate-300/95 caret-emerald-400"
                  )}
                  placeholder="Mensaje a Cortex..."
                  onKeyDown={handleComposerKeyDown}
                  onChange={(event) => {
                    setInput(event.target.value);
                    resizeComposer(event.currentTarget);
                  }}
                  value={input}
                  style={{ maxHeight: `${MAX_MAIN_COMPOSER_HEIGHT}px` }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/50 bg-slate-900/30 text-slate-500 cursor-not-allowed"
                      title="Adjuntar"
                      aria-label="Adjuntar"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        ref={emojiButtonRef}
                        onPointerDown={handleEmojiPointerDown}
                        onClick={handleEmojiToggle}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/70 bg-slate-900/50 text-slate-200 transition hover:border-slate-600/80 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
                        title="Insertar emoji"
                        aria-label="Insertar emoji"
                      >
                        <span className="text-lg leading-none">🙂</span>
                      </button>
                      <EmojiPicker
                        isOpen={isEmojiOpen}
                        anchorRef={emojiButtonRef}
                        onClose={() => setIsEmojiOpen(false)}
                        onSelect={handleEmojiSelect}
                        mode="insert"
                        topContent={emojiPickerTopContent}
                        perLine={9}
                      />
                    </div>
                    <button
                      type="button"
                      disabled
                      className="h-9 px-3 rounded-full border text-[11px] font-semibold transition border-slate-800/50 bg-slate-900/30 text-slate-500 cursor-not-allowed"
                      title="Stickers"
                      aria-label="Stickers"
                    >
                      Stickers
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSend();
                    }}
                    disabled={sendDisabled}
                    aria-label="Enviar"
                    className={clsx(
                      "h-9 px-4 rounded-full text-sm font-semibold shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2",
                      "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    Enviar
                  </button>
                </div>
              </div>
              {overflowPanel}
              {favoritesEditor}
              {error && <div className="text-sm text-rose-300 mt-2">{error}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const containerClass = clsx(
    "rounded-2xl border border-slate-800 bg-slate-900/80",
    density === "compact" ? "p-3" : "p-4",
    "flex flex-col h-full min-h-0",
    density === "compact" ? "space-y-2.5" : "space-y-3"
  );
  return (
    <section className={containerClass}>
        <div className={clsx(density === "compact" ? "space-y-2.5" : "space-y-3")}>
          {!hideTitle && (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Manager IA – Estrategia y números</h2>
                <p className="text-xs text-slate-400">
                  Dime qué quieres conseguir hoy y te digo con quién hablar y qué hacer para no perder dinero.
                </p>
                <p className="text-[11px] text-slate-500">Chat interno entre tú y tu manager IA (no visible para fans).</p>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-100 space-y-2">
            <div>
              {snapshot ? (
                <p className="space-x-1">
                  <strong className="text-emerald-100">{snapshot.newFansLast30Days}</strong> fans nuevos ·{" "}
                  <strong className="text-emerald-100">{snapshot.fansAtRisk}</strong> en riesgo ·{" "}
                  <strong className="text-emerald-100">{snapshot.vipActiveCount}</strong> VIP activos ·{" "}
                  <strong className="text-emerald-100">{formatCurrency(snapshot.ingresosUltimos30Dias)}</strong> en 30 días
                </p>
              ) : (
                <span className="text-slate-500">Preparando resumen del negocio...</span>
              )}
            </div>
            {usedFallback && (
              <div className="text-[11px] text-amber-200">
                {fallbackBanner}
              </div>
            )}
          </div>
        </div>

      <div
        className={clsx(
          "mt-3 flex flex-col rounded-xl border border-slate-900 bg-slate-950/50 flex-1 min-h-0",
          density === "compact" ? "gap-2.5 px-3 py-2.5" : "gap-3 px-4 py-3"
        )}
      >
        <div
          className={clsx(
            "flex-1 min-h-0 overflow-y-auto pr-1 pb-24 md:pb-4",
            density === "compact" ? "space-y-2" : "space-y-3",
            "min-h-[220px]"
          )}
          ref={listRef}
        >
          {loading && <div className="text-[12px] text-slate-400">Cargando chat…</div>}
          {!loading && messages.length === 0 && <div className="text-[12px] text-slate-400">Aún no hay mensajes.</div>}
          {!loading &&
            messages.map((msg) => {
              const isCreator = msg.role === "CREATOR";
              const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              if (isCreator) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[75%]">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400 text-right">Tú • {time}</p>
                      <div className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm text-white shadow">{msg.content}</div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[75%]">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Manager • {time}</p>
                    <div className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-50 shadow">{msg.content}</div>
                  </div>
                </div>
              );
            })}
        </div>
        {error && <div className="text-[11px] text-rose-300 mt-2">{error}</div>}
        {scope === "global" && (
          <div className={modeRowClass}>
            {globalModes.map((mode) => {
              const isActive = globalMode === mode;
              return (
                <PillButton
                  key={mode}
                  intent={isActive ? "primary" : "ghost"}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setGlobalMode(mode)}
                >
                  {mode === "HOY" ? "Hoy" : mode === "VENTAS" ? "Ventas" : mode === "CATALOGO" ? "Catálogo" : "Crecimiento"}
                </PillButton>
              );
            })}
          </div>
        )}
        <div className={chipRowClass}>
          {quickSuggestions.map((sugg) => (
            <PillButton
              key={sugg}
              intent="secondary"
              size="sm"
              className={clsx(scope === "global" && "shrink-0")}
              onClick={() => {
                const prompt = scope === "global" ? getGlobalPrompt(sugg) : sugg;
                setInput((prev) => {
                  if (!prev || !prev.trim()) return prompt;
                  return `${prev.trim()}\n\n${prompt}`;
                });
                inputRef.current?.focus();
              }}
              disabled={sending}
            >
              {sugg}
            </PillButton>
          ))}
        </div>
        <div className="pt-2 border-t border-slate-800">
          <ChatComposerBar
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              resizeComposer(event.currentTarget);
            }}
            onKeyDown={handleComposerKeyDown}
            onSend={() => {
              void handleSend();
            }}
            sendDisabled={sendDisabled}
            placeholder="Cuéntale al Manager IA en qué necesitas ayuda."
            actionLabel="Enviar"
            audience="CREATOR"
            onAudienceChange={() => {}}
            canAttach={false}
            onAttach={() => {}}
            inputRef={inputRef}
            maxHeight={MAX_MAIN_COMPOSER_HEIGHT}
            isChatBlocked={false}
            isInternalPanelOpen={false}
            showAudienceToggle={false}
          />
        </div>
      </div>
    </section>
  );
});

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

function formatExpire(days: number | null | undefined) {
  if (typeof days !== "number") return "Caducidad: n/d";
  if (days <= 0) return "Caduca: hoy";
  if (days === 1) return "Caduca: en 1 día";
  return `Caduca: en ${Math.round(days)} días`;
}
