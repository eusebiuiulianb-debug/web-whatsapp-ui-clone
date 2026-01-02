import {
  forwardRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/router";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";
import {
  CORTEX_ATAJO_TABS,
  CORTEX_ATAJOS_BY_ID,
  CORTEX_ATAJOS_BY_TAB,
  CORTEX_ATAJOS_STATE_KEY,
  DEFAULT_PINNED_BY_TAB,
  RESCUE_ACTION_ID,
  type CortexAtajo,
  type CortexAtajoPromptContext,
  type CortexAtajoTab,
  type CortexAtajosState,
  getDefaultPinnedByTab,
  mapLegacyAtajoId,
  normalizePinnedByTab,
} from "../../lib/cortexAtajos";
import { readEmojiRecents, recordEmojiRecent } from "../../lib/emoji/recents";
import {
  CATALOG_ITEM_TYPE_LABELS,
  CATALOG_ITEM_TYPES,
  buildCatalogPitch,
  formatCatalogIncludesSummary,
  type CatalogItem,
  type CatalogItemType,
} from "../../lib/catalog";
import type { PopClip } from "../../lib/popclips";
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
  drafts?: CortexDraftGroup[];
  actions?: CortexActionCard[];
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

type SalesRange = "today" | "7d" | "30d";

type CreatorSalesResponse = {
  ok: boolean;
  error?: string;
  totals: { totalAmount: number; count: number; uniqueFans: number };
  breakdown: {
    subscriptionsAmount: number;
    giftsAmount: number;
    packsAmount: number;
    bundlesAmount: number;
    extrasAmount: number;
    tipsAmount: number;
  };
  counts: {
    subscriptionsCount: number;
    giftsCount: number;
    packsCount: number;
    bundlesCount: number;
    extrasCount: number;
    tipsCount: number;
  };
  topProducts: Array<{
    productId: string;
    title: string;
    type: string;
    amount: number;
    count: number;
    isGift?: boolean;
  }>;
  topFans: Array<{ fanId: string; displayName: string; amount: number; count: number }>;
  insights: string[];
};

type CortexSegmentFanPreview = {
  fanId: string;
  displayName: string;
  totalSpent: number;
  extrasCount: number;
  giftsCount: number;
  tipsCount: number;
  hasActiveSub: boolean;
  followUpAt: string | null;
  notesCount: number;
};

type CortexSegmentEntry = {
  id: string;
  title: string;
  reason: string;
  fanIds: string[];
  fanPreview: CortexSegmentFanPreview[];
  potentialAmount: number;
  suggestedAction: string;
};

type CortexSegmentsResponse = {
  segments: CortexSegmentEntry[];
};

export type CortexOverviewMetrics = {
  todayCount?: number;
  queueCount?: number;
  expiringSoonCount?: number;
  atRiskCount?: number;
  revenue7d?: number;
  revenue30d?: number;
  extras30d?: number;
  extrasRevenueToday?: number;
  extrasCountToday?: number;
  extrasRevenue7d?: number;
  extrasCount7d?: number;
  extrasRevenue30d?: number;
  extrasCount30d?: number;
  tipsRevenueToday?: number;
  tipsCountToday?: number;
  tipsRevenue7d?: number;
  tipsCount7d?: number;
  tipsRevenue30d?: number;
  tipsCount30d?: number;
  giftedCountToday?: number;
  giftedCount30d?: number;
  newFans30d?: number;
};

export type CortexOverviewFan = {
  fanId: string;
  displayName: string;
  expiresInDays?: number | null;
  flags?: {
    expired?: boolean;
    expiredSoon?: boolean;
    isNew30d?: boolean;
    atRisk7d?: boolean;
  };
};

export type CortexOverviewData = {
  metrics: CortexOverviewMetrics;
  expiringFans: CortexOverviewFan[];
};

export type CortexCatalogFans = {
  priority: CortexOverviewFan[];
  rest: CortexOverviewFan[];
};

type CortexDraftGroup = {
  fanId: string;
  fanName: string;
  drafts: string[];
};

type CatalogEditorDraft = {
  id?: string;
  type: CatalogItemType;
  title: string;
  description: string;
  price: string;
  currency: string;
  isActive: boolean;
  isPublic: boolean;
  includes: string[];
};

type PopClipEditorDraft = {
  id?: string;
  catalogItemId: string;
  title: string;
  videoUrl: string;
  posterUrl: string;
  durationSec: string;
  isActive: boolean;
};

type CortexActionCard = {
  id: string;
  actionId: string;
  label: string;
  description?: string;
  category: CortexAtajoTab;
};

const numberFormatter = new Intl.NumberFormat("es-ES");

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatCurrencyCompact(amount: number) {
  return `${Math.round(amount)}€`;
}

function formatPriceCents(cents: number, currency = "EUR") {
  const amount = cents / 100;
  const hasDecimals = cents % 100 !== 0;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    const fixed = hasDecimals ? amount.toFixed(2) : Math.round(amount).toString();
    return `${fixed} ${currency}`;
  }
}

function getFirstName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.split(" ")[0];
}

function formatExpireBadge(fan: CortexOverviewFan) {
  if (fan.flags?.expired) return "caducado";
  if (!isFiniteNumber(fan.expiresInDays)) return "";
  if (fan.expiresInDays <= 0) return "caduca hoy";
  if (fan.expiresInDays === 1) return "caduca en 1 día";
  return `caduca en ${Math.round(fan.expiresInDays)} días`;
}

function buildMetricsLine(metrics?: CortexOverviewMetrics | null) {
  if (!metrics) {
    return "Datos: hoy=n/d, cola=n/d, caducan=n/d, riesgo=n/d, 7d=n/d, 30d=n/d";
  }
  const today = isFiniteNumber(metrics.todayCount) ? metrics.todayCount : 0;
  const queue = isFiniteNumber(metrics.queueCount) ? metrics.queueCount : 0;
  const expiring = isFiniteNumber(metrics.expiringSoonCount) ? metrics.expiringSoonCount : 0;
  const atRisk = isFiniteNumber(metrics.atRiskCount) ? metrics.atRiskCount : 0;
  const revenue7d = isFiniteNumber(metrics.revenue7d) ? metrics.revenue7d : 0;
  const revenue30d = isFiniteNumber(metrics.revenue30d) ? metrics.revenue30d : 0;
  return `Datos: hoy=${formatCount(today)}, cola=${formatCount(queue)}, caducan=${formatCount(expiring)}, riesgo=${formatCount(atRisk)}, 7d=${formatCurrencyCompact(revenue7d)}, 30d=${formatCurrencyCompact(revenue30d)}`;
}

function buildExpiringFansContext(fans?: CortexOverviewFan[] | null) {
  if (!fans || fans.length === 0) return "";
  const items = fans.slice(0, 5).map((fan) => {
    const name = fan.displayName?.trim() || "Fan";
    const badge = formatExpireBadge(fan);
    return badge ? `${name} (${badge})` : name;
  });
  return `Fans con caducidad cercana: ${items.join(", ")}.`;
}

function sortCatalogItems(items: CatalogItem[]) {
  return [ ...items ].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function sortPopClips(items: PopClip[]) {
  return [ ...items ].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const defaultSuggestions = [
  "¿A qué fans debería escribir hoy?",
  "Resúmeme mis números clave de esta semana.",
  "Dame una acción concreta para aumentar ingresos hoy.",
];
const MAX_MAIN_COMPOSER_HEIGHT = 140;
const MAX_VISIBLE_CHIPS = 4;
const MAX_CATALOG_ITEMS_VISIBLE = 10;
const CHIP_GAP = 8;
const LEGACY_FAVORITES_KEY = "cortex_quick_prompts_pinned";
const LEGACY_FAVORITES_PREFIX = "cortex_quick_prompts_pinned:v1";
const ACTIVE_TAB_KEY_PREFIX = "cortex_active_tab:v1";

const DEFAULT_CATALOG_ITEM: Record<CatalogItemType, { title: string; description: string; priceCents: number }> = {
  EXTRA: {
    title: "Extra rápido",
    description: "Extra sencillo de producir.",
    priceCents: 1500,
  },
  BUNDLE: {
    title: "Bundle sugerido",
    description: "Bundle con buen valor percibido.",
    priceCents: 2900,
  },
  PACK: {
    title: "Pack recomendado",
    description: "Pack con buen valor percibido.",
    priceCents: 3500,
  },
};

const CORTEX_TAB_LABELS: Record<CortexAtajoTab, string> = {
  hoy: "Hoy",
  ventas: "Ventas",
  catalogo: "Catálogo",
  crecimiento: "Crecimiento",
};

function toCortexTab(mode: GlobalMode): CortexAtajoTab {
  if (mode === "VENTAS") return "ventas";
  if (mode === "CATALOGO") return "catalogo";
  if (mode === "CRECIMIENTO") return "crecimiento";
  return "hoy";
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
  overviewData?: CortexOverviewData | null;
  creatorId?: string;
  catalogItems?: CatalogItem[];
  catalogLoading?: boolean;
  catalogError?: string | null;
  catalogFans?: CortexCatalogFans;
  setCatalogItems?: Dispatch<SetStateAction<CatalogItem[]>>;
  refreshCatalogItems?: () => Promise<void>;
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
    overviewData,
    creatorId,
    catalogItems,
    catalogLoading,
    catalogError,
    catalogFans,
    setCatalogItems,
    refreshCatalogItems,
  }: Props,
  ref
) {
  const router = useRouter();
  const [messages, setMessages] = useState<ManagerChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<"ok" | "settings_missing" | null>(null);
  const [globalMode, setGlobalMode] = useState<GlobalMode>("HOY");
  const [growthPlatform, setGrowthPlatform] = useState<CreatorPlatformKey>("tiktok");
  const [salesRange, setSalesRange] = useState<SalesRange>("7d");
  const [salesData, setSalesData] = useState<CreatorSalesResponse | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [salesUpdated, setSalesUpdated] = useState(false);
  const [salesRetry, setSalesRetry] = useState(0);
  const [segmentsData, setSegmentsData] = useState<CortexSegmentsResponse | null>(null);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);
  const [segmentsExpanded, setSegmentsExpanded] = useState<Record<string, boolean>>({});
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [emojiRecents, setEmojiRecents] = useState<string[]>([]);
  const [isFavoritesEditorOpen, setIsFavoritesEditorOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [atajosState, setAtajosState] = useState<CortexAtajosState>(() => ({
    version: 1,
    pinnedByTab: getDefaultPinnedByTab(),
  }));
  const [didLoadAtajos, setDidLoadAtajos] = useState(false);
  const [atajosToast, setAtajosToast] = useState<string | null>(null);
  const [hasUsedQuickAccess, setHasUsedQuickAccess] = useState(false);
  const [actionsWidth, setActionsWidth] = useState(0);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE_CHIPS);
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastQuickPromptRef = useRef<string | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const favoritesModalRef = useRef<HTMLDivElement | null>(null);
  const favoritesSheetRef = useRef<HTMLDivElement | null>(null);
  const quickAccessActionsRef = useRef<HTMLDivElement | null>(null);
  const quickAccessScrollerRef = useRef<HTMLDivElement | null>(null);
  const quickAccessMeasureRef = useRef<HTMLDivElement | null>(null);
  const overflowModalRef = useRef<HTMLDivElement | null>(null);
  const overflowSheetRef = useRef<HTMLDivElement | null>(null);
  const catalogGapsRef = useRef<HTMLDivElement | null>(null);
  const atajosToastTimeoutRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<CreatorBusinessSnapshot | null>(businessSnapshot ?? null);
  const salesUpdatedTimeoutRef = useRef<number | null>(null);
  const [localCatalogItems, setLocalCatalogItems] = useState<CatalogItem[]>(() => catalogItems ?? []);
  const [showAllCatalogItems, setShowAllCatalogItems] = useState(false);
  const [catalogToast, setCatalogToast] = useState<string | null>(null);
  const [popClips, setPopClips] = useState<PopClip[]>([]);
  const [popClipsLoading, setPopClipsLoading] = useState(false);
  const [popClipsError, setPopClipsError] = useState<string | null>(null);
  const [isPopClipEditorOpen, setIsPopClipEditorOpen] = useState(false);
  const [popClipDraft, setPopClipDraft] = useState<PopClipEditorDraft | null>(null);
  const [popClipDraftItem, setPopClipDraftItem] = useState<CatalogItem | null>(null);
  const [popClipSaving, setPopClipSaving] = useState(false);
  const [popClipDeleting, setPopClipDeleting] = useState(false);
  const [popClipEditorError, setPopClipEditorError] = useState<string | null>(null);
  const [isCatalogEditorOpen, setIsCatalogEditorOpen] = useState(false);
  const [catalogEditorMode, setCatalogEditorMode] = useState<"create" | "edit">("create");
  const [catalogDraft, setCatalogDraft] = useState<CatalogEditorDraft | null>(null);
  const [bundleSearch, setBundleSearch] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogDraftItem, setCatalogDraftItem] = useState<CatalogItem | null>(null);
  const [catalogFanPickerOpen, setCatalogFanPickerOpen] = useState(false);
  const catalogEditorTitleRef = useRef<HTMLInputElement | null>(null);
  const catalogEditorModalRef = useRef<HTMLDivElement | null>(null);
  const catalogEditorSheetRef = useRef<HTMLDivElement | null>(null);
  const popClipEditorVideoRef = useRef<HTMLInputElement | null>(null);
  const popClipEditorModalRef = useRef<HTMLDivElement | null>(null);
  const popClipEditorSheetRef = useRef<HTMLDivElement | null>(null);
  const catalogFanPickerModalRef = useRef<HTMLDivElement | null>(null);
  const catalogFanPickerSheetRef = useRef<HTMLDivElement | null>(null);
  const catalogToastTimeoutRef = useRef<number | null>(null);
  const isDemo = !process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  const activeTabKey = useMemo(() => (scope === "global" ? toCortexTab(globalMode) : "hoy"), [globalMode, scope]);
  const activeTabStorageKey = useMemo(
    () => `${ACTIVE_TAB_KEY_PREFIX}:${creatorId ?? "default"}`,
    [creatorId]
  );
  const atajosForTab = CORTEX_ATAJOS_BY_TAB[activeTabKey] ?? [];
  const pinnedIdsForTab = useMemo(
    () => atajosState.pinnedByTab[activeTabKey] ?? [],
    [atajosState.pinnedByTab, activeTabKey]
  );
  const pinnedAtajos = useMemo(
    () =>
      pinnedIdsForTab
        .map((id) => CORTEX_ATAJOS_BY_ID[id])
        .filter((atajo): atajo is CortexAtajo => Boolean(atajo)),
    [pinnedIdsForTab]
  );
  const catalogItemsState = catalogItems ?? localCatalogItems;
  const updateCatalogItems =
    setCatalogItems ??
    ((updater: SetStateAction<CatalogItem[]>) => {
      setLocalCatalogItems(updater);
    });
  const popClipsByCatalogItemId = useMemo(
    () => new Map(popClips.map((clip) => [clip.catalogItemId, clip] as const)),
    [popClips]
  );
  const scrollerPaddingRight = isNarrowMobile ? 12 : Math.max(actionsWidth + 12, 64);
  const expiringFans = overviewData?.expiringFans ?? [];
  const resizeComposer = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, MAX_MAIN_COMPOSER_HEIGHT);
    el.style.height = `${nextHeight}px`;
  }, []);
  const fetchPopClips = useCallback(async () => {
    if (!creatorId) return;
    try {
      setPopClipsLoading(true);
      setPopClipsError(null);
      const res = await fetch(`/api/popclips?creatorId=${encodeURIComponent(creatorId)}`);
      if (!res.ok) throw new Error("Error fetching popclips");
      const data = await res.json().catch(() => ({}));
      const clips = Array.isArray(data?.clips)
        ? (data.clips as PopClip[])
        : Array.isArray(data)
        ? (data as PopClip[])
        : [];
      setPopClips(sortPopClips(clips));
    } catch (_err) {
      setPopClipsError("No se pudo cargar PopClips.");
    } finally {
      setPopClipsLoading(false);
    }
  }, [creatorId]);
  const closePopClipEditor = useCallback(() => {
    setIsPopClipEditorOpen(false);
    setPopClipDraft(null);
    setPopClipDraftItem(null);
    setPopClipEditorError(null);
  }, []);

  useEffect(() => {
    void loadMessages();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 480px)");
    const update = () => setIsNarrowMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
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
    if (catalogItems) {
      setLocalCatalogItems(catalogItems);
    }
  }, [catalogItems]);

  useEffect(() => {
    void fetchPopClips();
  }, [fetchPopClips]);

  useEffect(() => {
    resizeComposer(inputRef.current);
  }, [input, resizeComposer]);

  useEffect(() => {
    if (scope !== "global" || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(activeTabStorageKey);
    if (!stored) return;
    const normalized = stored.toUpperCase();
    const allowed = ["HOY", "VENTAS", "CATALOGO", "CRECIMIENTO"];
    if (allowed.includes(normalized)) {
      setGlobalMode(normalized as GlobalMode);
    }
  }, [activeTabStorageKey, scope]);

  useEffect(() => {
    if (scope !== "global" || typeof window === "undefined") return;
    window.localStorage.setItem(activeTabStorageKey, globalMode);
  }, [activeTabStorageKey, globalMode, scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(CORTEX_ATAJOS_STATE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<CortexAtajosState>;
        const normalized = normalizePinnedByTab(parsed?.pinnedByTab ?? {});
        setAtajosState({ version: 1, pinnedByTab: normalized });
        setDidLoadAtajos(true);
        return;
      } catch {
        setDidLoadAtajos(false);
      }
    }

    const legacyByTab: Partial<Record<CortexAtajoTab, string[]>> = {};
    let hasLegacy = false;
    CORTEX_ATAJO_TABS.forEach((tab) => {
      const legacyRaw = window.localStorage.getItem(`${LEGACY_FAVORITES_PREFIX}:${tab}`);
      if (!legacyRaw) return;
      try {
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed)) {
          legacyByTab[tab] = parsed.filter((item): item is string => typeof item === "string");
          hasLegacy = true;
        }
      } catch {
        // ignore
      }
    });

    const legacyRaw = window.localStorage.getItem(LEGACY_FAVORITES_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as Record<string, unknown> | unknown[];
        if (Array.isArray(parsed)) {
          const sanitized = parsed.filter((item): item is string => typeof item === "string");
          legacyByTab.hoy = legacyByTab.hoy?.length ? legacyByTab.hoy : sanitized;
          hasLegacy = true;
        } else if (parsed && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>;
          CORTEX_ATAJO_TABS.forEach((tab) => {
            const value = record[tab] ?? (tab === "hoy" ? record.global : undefined);
            if (Array.isArray(value)) {
              legacyByTab[tab] = value.filter((item): item is string => typeof item === "string");
              hasLegacy = true;
            }
          });
        }
      } catch {
        // ignore
      }
    }

    const normalized = normalizePinnedByTab(legacyByTab);
    setAtajosState({ version: 1, pinnedByTab: normalized });
    setDidLoadAtajos(true);
    if (hasLegacy) {
      window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
      CORTEX_ATAJO_TABS.forEach((tab) => {
        window.localStorage.removeItem(`${LEGACY_FAVORITES_PREFIX}:${tab}`);
      });
    }
  }, []);

  useEffect(() => {
    if (!didLoadAtajos || typeof window === "undefined") return;
    window.localStorage.setItem(CORTEX_ATAJOS_STATE_KEY, JSON.stringify(atajosState));
  }, [atajosState, didLoadAtajos]);

  useEffect(() => {
    if (!atajosToast || typeof window === "undefined") return;
    if (atajosToastTimeoutRef.current) {
      window.clearTimeout(atajosToastTimeoutRef.current);
    }
    atajosToastTimeoutRef.current = window.setTimeout(() => {
      setAtajosToast(null);
      atajosToastTimeoutRef.current = null;
    }, 2400);
    return () => {
      if (atajosToastTimeoutRef.current) {
        window.clearTimeout(atajosToastTimeoutRef.current);
      }
    };
  }, [atajosToast]);

  useEffect(() => {
    if (!catalogToast || typeof window === "undefined") return;
    if (catalogToastTimeoutRef.current) {
      window.clearTimeout(catalogToastTimeoutRef.current);
    }
    catalogToastTimeoutRef.current = window.setTimeout(() => {
      setCatalogToast(null);
      catalogToastTimeoutRef.current = null;
    }, 2400);
    return () => {
      if (catalogToastTimeoutRef.current) {
        window.clearTimeout(catalogToastTimeoutRef.current);
      }
    };
  }, [catalogToast]);

  useEffect(() => {
    return () => {
      if (salesUpdatedTimeoutRef.current && typeof window !== "undefined") {
        window.clearTimeout(salesUpdatedTimeoutRef.current);
      }
    };
  }, []);

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
  }, [activeTabKey, pinnedAtajos.length]);

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

  useEffect(() => {
    if (!isCatalogEditorOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (catalogEditorModalRef.current?.contains(target)) return;
      if (catalogEditorSheetRef.current?.contains(target)) return;
      setIsCatalogEditorOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCatalogEditorOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCatalogEditorOpen]);

  useEffect(() => {
    if (!isPopClipEditorOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popClipEditorModalRef.current?.contains(target)) return;
      if (popClipEditorSheetRef.current?.contains(target)) return;
      closePopClipEditor();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopClipEditor();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePopClipEditor, isPopClipEditorOpen]);

  useEffect(() => {
    if (!catalogFanPickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (catalogFanPickerModalRef.current?.contains(target)) return;
      if (catalogFanPickerSheetRef.current?.contains(target)) return;
      setCatalogFanPickerOpen(false);
      setCatalogDraftItem(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCatalogFanPickerOpen(false);
        setCatalogDraftItem(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [catalogFanPickerOpen]);

  useEffect(() => {
    if (!isCatalogEditorOpen) return;
    const raf = requestAnimationFrame(() => {
      catalogEditorTitleRef.current?.focus();
      catalogEditorTitleRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [isCatalogEditorOpen]);

  useEffect(() => {
    if (!isPopClipEditorOpen) return;
    const raf = requestAnimationFrame(() => {
      popClipEditorVideoRef.current?.focus();
      popClipEditorVideoRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [isPopClipEditorOpen]);

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

  function buildRescueDrafts() {
    if (expiringFans.length === 0) return [];
    return expiringFans.slice(0, 5).map((fan) => {
      const firstName = getFirstName(fan.displayName || "");
      const safeName = firstName || "allí";
      const fanLabel = fan.displayName?.trim() || safeName || "Fan";
      const expiresIn = fan.expiresInDays;
      const isExpired = Boolean(fan.flags?.expired);
      const isExpiringSoon =
        Boolean(fan.flags?.expiredSoon) ||
        (isFiniteNumber(expiresIn) && expiresIn <= 7);
      const when =
        isFiniteNumber(expiresIn)
          ? expiresIn <= 0
            ? "hoy"
            : expiresIn === 1
            ? "en 1 día"
            : `en ${Math.round(expiresIn)} días`
          : "pronto";
      let drafts: string[];
      if (isExpired) {
        drafts = [
          `Hola ${safeName}, vi que tu acceso terminó.\nSi quieres, lo reactivamos hoy y te preparo algo especial.`,
          `Hola ${safeName}, se cerró tu acceso.\n¿Quieres que lo dejemos activo otra vez?`,
          `Hola ${safeName}, si te apetece volver, lo activamos hoy mismo.\nTe paso lo nuevo al reactivar.`,
        ];
      } else if (isExpiringSoon) {
        drafts = [
          `Hola ${safeName}, tu acceso vence ${when}.\nSi te apetece, lo renovamos y te guardo lo nuevo.`,
          `Hola ${safeName}, te queda poco de acceso.\n¿Quieres que lo deje activo y te preparo algo especial?`,
          `Hola ${safeName}, si te viene bien renovamos ahora y así no pierdes nada.`,
        ];
      } else {
        drafts = [
          `Hola ${safeName}, ¿cómo vas?\nSi te apetece, te cuento lo nuevo que tengo.`,
          `Hola ${safeName}, quería hacer un check-in rápido.\n¿Te apetece ver algo nuevo hoy?`,
          `Hola ${safeName}, si te apetece, te paso una recomendación personalizada.`,
        ];
      }
      return {
        fanId: fan.fanId,
        fanName: fanLabel,
        drafts,
      };
    });
  }

  const buildActionCard = (actionId: string): CortexActionCard | null => {
    const resolvedId = mapLegacyAtajoId(actionId);
    const entry = CORTEX_ATAJOS_BY_ID[resolvedId];
    if (!entry) return null;
    return {
      id: resolvedId,
      actionId: resolvedId,
      label: entry.label,
      description: entry.description,
      category: entry.tab,
    };
  };

  function buildRecommendationActions(tab: CortexAtajoTab) {
    const metrics = overviewData?.metrics;
    const expiringCount = isFiniteNumber(metrics?.expiringSoonCount) ? metrics?.expiringSoonCount : 0;
    const atRiskCount = isFiniteNumber(metrics?.atRiskCount) ? metrics?.atRiskCount : 0;
    const queueCount = isFiniteNumber(metrics?.queueCount) ? metrics?.queueCount : 0;
    const revenue7d = isFiniteNumber(metrics?.revenue7d) ? metrics?.revenue7d : null;
    const revenue30d = isFiniteNumber(metrics?.revenue30d) ? metrics?.revenue30d : null;
    const extras30d = isFiniteNumber(metrics?.extras30d) ? metrics?.extras30d : null;
    const newFans30d = isFiniteNumber(metrics?.newFans30d) ? metrics?.newFans30d : null;
    const lowRevenue = revenue7d !== null && revenue7d < 100;
    const lowRevenue30 = revenue30d !== null && revenue30d < 300;
    const noExtras = extras30d !== null && extras30d <= 0;
    const catalogWeak = (extras30d !== null && extras30d < 2) || lowRevenue30;
    const lowNewFans = newFans30d !== null && newFans30d < 3;

    const pickActions = (primaryId: string, candidates: Array<string | null | undefined>) => {
      const selected: string[] = [];
      if (primaryId) selected.push(primaryId);
      for (const candidate of candidates) {
        if (!candidate || selected.includes(candidate)) continue;
        selected.push(candidate);
        if (selected.length >= 3) break;
      }
      return selected;
    };

    let selectedIds: string[] = [];
    if (tab === "ventas") {
      let primaryId = "cta_cierre_hoy";
      if (atRiskCount > 0) {
        primaryId = "rescate_riesgo_7d";
      } else if (lowRevenue || queueCount > 0) {
        primaryId = "upsell_vip_mensual";
      }
      selectedIds = pickActions(primaryId, [
        "cta_cierre_hoy",
        "upsell_vip_mensual",
        "rescate_riesgo_7d",
        expiringCount > 0 ? RESCUE_ACTION_ID : null,
        noExtras ? "ideas_extra_rapido" : null,
      ]);
    } else if (tab === "catalogo") {
      let primaryId = "mejorar_oferta_beneficio";
      if (noExtras) {
        primaryId = "ideas_extra_rapido";
      } else if (catalogWeak) {
        primaryId = "bundle_sugerido";
      }
      selectedIds = pickActions(primaryId, [
        "ideas_extra_rapido",
        "bundle_sugerido",
        "gap_catalogo",
        "mejorar_oferta_beneficio",
      ]);
    } else if (tab === "crecimiento") {
      selectedIds = ["calendario_7", "ideas_contenido_viral", "retencion_3_toques"];
    } else {
      let primaryId = "diagnostico_3_bullets";
      if (expiringCount > 0) {
        primaryId = RESCUE_ACTION_ID;
      } else if (atRiskCount > 0) {
        primaryId = "rescate_riesgo_7d";
      } else if (queueCount > 0) {
        primaryId = "atender_cola";
      }
      selectedIds = pickActions(primaryId, [
        "diagnostico_3_bullets",
        "plan_7_dias",
        "3_acciones_rapidas",
        lowRevenue ? "upsell_vip_mensual" : null,
        noExtras ? "ideas_extra_rapido" : null,
        lowNewFans ? "ideas_contenido_viral" : null,
        "atender_cola",
        "rescate_riesgo_7d",
        RESCUE_ACTION_ID,
      ]);
    }

    return selectedIds
      .map((actionId) => buildActionCard(actionId))
      .filter((item): item is CortexActionCard => Boolean(item));
  }

  function buildRecommendationMessage(actions: CortexActionCard[], tab: CortexAtajoTab) {
    const lines = actions.map((action, index) => `${index + 1}. ${action.label}`);
    const header = `Plan recomendado · ${CORTEX_TAB_LABELS[tab]}:`;
    return `${header}\n${lines.join("\n")}\n${metricsLine}`.trim();
  }

  function isRescueRequest(text: string) {
    if (lastQuickPromptRef.current === RESCUE_ACTION_ID) return true;
    const normalized = normalizeText(text);
    if (normalized.includes("rescatar") && normalized.includes("caducan pronto")) return true;
    return normalized.includes("redacta mensajes") && normalized.includes("caducan pronto");
  }

  function isRecommendationRequest(text: string) {
    const normalized = normalizeText(text);
    if (normalized.includes("accion concreta")) return true;
    if (normalized.includes("accion para subir ingresos")) return true;
    if (normalized.includes("subir ingresos")) return true;
    if (normalized.includes("ingresos hoy")) return true;
    return false;
  }

  function buildDemoReply(text: string, rescueDrafts?: CortexDraftGroup[]) {
    const metrics = overviewData?.metrics;
    let cleanedText = text;
    if (metricsLine) cleanedText = cleanedText.replace(metricsLine, "");
    if (expiringFansContext) cleanedText = cleanedText.replace(expiringFansContext, "");
    const normalized = normalizeText(cleanedText);
    const contextLine = metricsLine ? `\n${metricsLine}` : "";
    const expiringCount = isFiniteNumber(metrics?.expiringSoonCount) ? metrics?.expiringSoonCount : null;
    const atRiskCount = isFiniteNumber(metrics?.atRiskCount) ? metrics?.atRiskCount : null;
    const queueCount = isFiniteNumber(metrics?.queueCount) ? metrics?.queueCount : null;
    const todayCount = isFiniteNumber(metrics?.todayCount) ? metrics?.todayCount : null;
    const revenue7d = isFiniteNumber(metrics?.revenue7d) ? metrics?.revenue7d : null;
    const revenue30d = isFiniteNumber(metrics?.revenue30d) ? metrics?.revenue30d : null;
    const extras30d = isFiniteNumber(metrics?.extras30d) ? metrics?.extras30d : null;
    const newFans30d = isFiniteNumber(metrics?.newFans30d) ? metrics?.newFans30d : null;

    if (isRescueRequest(cleanedText)) {
      const names = expiringFans
        .slice(0, 3)
        .map((fan) => getFirstName(fan.displayName || fan.fanId))
        .filter(Boolean)
        .join(", ");
      const summary = rescueDrafts?.length
        ? `Preparé borradores para ${rescueDrafts.length} fan${rescueDrafts.length === 1 ? "" : "s"}.`
        : "No tengo caducidades próximas para preparar borradores.";
      const lines = [
        names ? `Fans prioritarios: ${names}.` : null,
        expiringCount !== null ? `Caducan pronto: ${formatCount(expiringCount)}.` : null,
      ].filter((line): line is string => Boolean(line));
      return {
        text: `${summary}${lines.length ? `\n${lines.join("\n")}` : ""}${contextLine}`.trim(),
        drafts: rescueDrafts?.length ? rescueDrafts : undefined,
      };
    }

    if (normalized.includes("numeros") || normalized.includes("resumen") || normalized.includes("resumeme")) {
      const lines = [
        revenue7d !== null ? `• Ingresos 7d: ${formatCurrency(revenue7d)}` : null,
        revenue30d !== null ? `• Ingresos 30d: ${formatCurrency(revenue30d)}` : null,
        extras30d !== null ? `• Extras 30d: ${formatCount(extras30d)}` : null,
        newFans30d !== null ? `• Fans nuevos 30d: ${formatCount(newFans30d)}` : null,
        atRiskCount !== null ? `• En riesgo: ${formatCount(atRiskCount)}` : null,
      ].filter((line): line is string => Boolean(line));
      const header = lines.length ? "Tus números actuales:" : "No tengo suficientes datos para un resumen ahora mismo.";
      return { text: `${header}${lines.length ? `\n${lines.join("\n")}` : ""}${contextLine}`.trim() };
    }

    if (normalized.includes("diagnostico")) {
      const bullets = [
        revenue7d !== null
          ? `• Va bien: ingresos 7d en ${formatCurrency(revenue7d)}.`
          : "• Va bien: actividad estable.",
        expiringCount !== null && expiringCount > 0
          ? `• Bloquea: ${formatCount(expiringCount)} caducidades próximas.`
          : atRiskCount !== null && atRiskCount > 0
          ? `• Bloquea: ${formatCount(atRiskCount)} fans en riesgo.`
          : "• Bloquea: falta de reactivación reciente.",
        "• Cambio mínimo: envía 3 mensajes cortos a caducan pronto y 2 a en riesgo.",
      ];
      return { text: `Diagnóstico rápido:\n${bullets.join("\n")}${contextLine}`.trim() };
    }

    if (normalized.includes("plan 7 dias") || normalized.includes("plan de 7 dias")) {
      const planLines = [
        "Días 1-2: rescate caducan pronto + CTA de renovación suave.",
        "Días 3-4: reactivar en riesgo con mensaje corto y personalizado.",
        "Días 5-7: empuja extras y mensual con oferta simple.",
      ];
      return { text: `Plan 7 días (demo):\n${planLines.join("\n")}${contextLine}`.trim() };
    }

    if (isRecommendationRequest(cleanedText)) {
      const actions = buildRecommendationActions(activeTabKey);
      return {
        text: buildRecommendationMessage(actions, activeTabKey),
        actions,
      };
    }

    if (normalized.includes("priorizo") || normalized.includes("prioridad")) {
      const priorities = [
        expiringCount !== null ? `1) Caducan pronto (${formatCount(expiringCount)}).` : "1) Caducan pronto.",
        atRiskCount !== null ? `2) En riesgo (${formatCount(atRiskCount)}).` : "2) En riesgo.",
        queueCount !== null ? `3) Cola (${formatCount(queueCount)}).` : "3) Cola.",
      ];
      const todayLine = todayCount !== null ? `Hoy: ${formatCount(todayCount)} prioridades.` : null;
      return {
        text: `Prioridades de hoy:\n${priorities.join("\n")}${todayLine ? `\n${todayLine}` : ""}${contextLine}`.trim(),
      };
    }

    return {
      text: `Modo demo activo: conecta tu OPENAI_API_KEY para respuestas con tus datos reales.${contextLine}`.trim(),
    };
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
    const shouldRecommend = scope === "global" && isRecommendationRequest(text);
    const rescueDrafts = isRescueRequest(text) ? buildRescueDrafts() : undefined;
    try {
      setSending(true);
      setError(null);
      const now = new Date().toISOString();
      const optimisticId = `local-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: optimisticId, role: "CREATOR", content: text, createdAt: now },
      ]);

      if (shouldRecommend) {
        const actions = buildRecommendationActions(activeTabKey);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          {
            id: `assistant-${Date.now()}`,
            role: "ASSISTANT",
            content: buildRecommendationMessage(actions, activeTabKey),
            createdAt: new Date().toISOString(),
            actions,
          },
        ]);
        setUsedFallback(isDemo);
        setInput("");
        lastQuickPromptRef.current = null;
        setSending(false);
        return;
      }

      if (isDemo) {
        const demoReply = buildDemoReply(text, rescueDrafts);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          {
            id: `assistant-${Date.now()}`,
            role: "ASSISTANT",
            content: demoReply.text,
            createdAt: new Date().toISOString(),
            drafts: demoReply.drafts,
            actions: demoReply.actions,
          },
        ]);
        setUsedFallback(true);
        setInput("");
        lastQuickPromptRef.current = null;
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
        drafts: rescueDrafts?.length ? rescueDrafts : undefined,
      };
      setMessages((prev) =>
        [...prev.filter((m) => m.id !== optimisticId), assistantMessage].slice(-50)
      );
      setUsedFallback(Boolean(data?.usedFallback));
      setSettingsStatus(data?.settingsStatus ?? null);
      if (!rescueDrafts?.length) {
        void loadMessages({ silent: true });
      }
      setInput("");
      lastQuickPromptRef.current = null;
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
      lastQuickPromptRef.current = null;
      setInput(message);
      void handleSend(message, action);
    },
    setDraft: (message: string) => {
      lastQuickPromptRef.current = null;
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
  const metricsLine = buildMetricsLine(overviewData?.metrics);
  const expiringFansContext = buildExpiringFansContext(overviewData?.expiringFans);
  const growthPlatformLabel = formatPlatformLabel(activeGrowthPlatform);
  const growthContextLine = `Plataforma foco: ${growthPlatformLabel}.`;
  const growthPlatformsLine = growthActiveList ? `Plataformas activas: ${growthActiveList}.` : "";
  const promptContext = useMemo<CortexAtajoPromptContext>(
    () => ({
      metricsLine,
      expiringFansLine: expiringFansContext || undefined,
      growthContextLine,
      growthPlatformsLine: growthPlatformsLine || undefined,
    }),
    [metricsLine, expiringFansContext, growthContextLine, growthPlatformsLine]
  );
  const isSalesTab = scope === "global" && activeTabKey === "ventas";
  const isCatalogTab = scope === "global" && activeTabKey === "catalogo";
  const handleSalesRetry = useCallback(() => {
    setSalesError(null);
    setSalesRetry((value) => value + 1);
  }, []);
  const triggerSalesUpdated = useCallback(() => {
    setSalesUpdated(true);
    if (typeof window === "undefined") return;
    if (salesUpdatedTimeoutRef.current) {
      window.clearTimeout(salesUpdatedTimeoutRef.current);
    }
    salesUpdatedTimeoutRef.current = window.setTimeout(() => {
      setSalesUpdated(false);
      salesUpdatedTimeoutRef.current = null;
    }, 1600);
  }, []);
  useEffect(() => {
    if (!isSalesTab) return;
    const controller = new AbortController();
    let alive = true;
    const loadSales = async () => {
      try {
        setSalesLoading(true);
        setSalesError(null);
        setSalesUpdated(false);
        if (typeof window !== "undefined" && salesUpdatedTimeoutRef.current) {
          window.clearTimeout(salesUpdatedTimeoutRef.current);
          salesUpdatedTimeoutRef.current = null;
        }
        const res = await fetch(`/api/creator/cortex/sales?range=${salesRange}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await res.json()) as CreatorSalesResponse;
        if (!res.ok) throw new Error(data.error ?? "sales_fetch_failed");
        if (!alive) return;
        if (!data.ok) {
          setSalesError("Datos no disponibles");
          setSalesData(null);
          return;
        }
        setSalesData(data);
        triggerSalesUpdated();
      } catch (err) {
        if (!alive) return;
        console.error("Error loading sales data", err);
        setSalesError("Datos no disponibles");
        setSalesData(null);
      } finally {
        if (alive) setSalesLoading(false);
      }
    };
    void loadSales();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [isSalesTab, salesRange, salesRetry, triggerSalesUpdated]);
  useEffect(() => {
    if (!isSalesTab) return;
    const controller = new AbortController();
    let alive = true;
    const loadSegments = async () => {
      try {
        setSegmentsLoading(true);
        setSegmentsError(null);
        const res = await fetch("/api/creator/cortex/segments", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("segments_fetch_failed");
        const data = (await res.json()) as CortexSegmentsResponse;
        if (!alive) return;
        setSegmentsData(data);
      } catch (err) {
        if (!alive) return;
        console.error("Error loading cortex segments", err);
        setSegmentsError("No se pudieron cargar los segmentos.");
        setSegmentsData(null);
      } finally {
        if (alive) setSegmentsLoading(false);
      }
    };
    void loadSegments();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [isSalesTab]);
  const catalogItemsSorted = useMemo(
    () => sortCatalogItems(catalogItemsState),
    [catalogItemsState]
  );
  const visibleCatalogItems = useMemo(
    () =>
      showAllCatalogItems
        ? catalogItemsSorted
        : catalogItemsSorted.slice(0, MAX_CATALOG_ITEMS_VISIBLE),
    [catalogItemsSorted, showAllCatalogItems]
  );
  const catalogGaps = useMemo(() => {
    const activeItems = catalogItemsSorted.filter((item) => item.isActive);
    const extras = activeItems.filter((item) => item.type === "EXTRA").length;
    const bundles = activeItems.filter((item) => item.type === "BUNDLE").length;
    const packs = activeItems.filter((item) => item.type === "PACK").length;
    return {
      extras,
      bundles,
      packs,
      extrasOk: extras >= 3,
      bundlesOk: bundles >= 1,
      packsOk: packs >= 1,
    };
  }, [catalogItemsSorted]);
  const catalogExtras = useMemo(
    () => catalogItemsSorted.filter((item) => item.type === "EXTRA"),
    [catalogItemsSorted]
  );
  const catalogExtrasById = useMemo(
    () => new Map(catalogExtras.map((item) => [item.id, item])),
    [catalogExtras]
  );
  const filteredCatalogExtras = useMemo(() => {
    const query = normalizeText(bundleSearch.trim());
    if (!query) return catalogExtras;
    return catalogExtras.filter((item) => normalizeText(item.title).includes(query));
  }, [bundleSearch, catalogExtras]);
  const buildPrompt = useCallback(
    (actionId: string) => {
      const resolvedId = mapLegacyAtajoId(actionId);
      const atajo = CORTEX_ATAJOS_BY_ID[resolvedId];
      if (!atajo) {
        return `${actionId}\n${metricsLine}`.trim();
      }
      return atajo.promptTemplate(promptContext);
    },
    [metricsLine, promptContext]
  );
  const quickSuggestions =
    scope === "global"
      ? pinnedAtajos
      : suggestions && suggestions.length > 0
      ? suggestions
      : defaultSuggestions;
  const quickAccessItems = useMemo(
    () =>
      scope === "global"
        ? pinnedAtajos.map((atajo) => ({
            id: atajo.id,
            label: atajo.label,
            actionId: atajo.id,
          }))
        : (suggestions && suggestions.length > 0 ? suggestions : defaultSuggestions).map((label) => ({
            id: label,
            label,
            actionId: undefined,
          })),
    [pinnedAtajos, scope, suggestions]
  );
  const quickAccessLabels = useMemo(() => quickAccessItems.map((item) => item.label), [quickAccessItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scroller = quickAccessScrollerRef.current;
    const measurer = quickAccessMeasureRef.current;
    if (!scroller || !measurer) return;

    const measure = () => {
      const minVisible = quickAccessLabels.length > 0 ? 1 : 0;
      const available = scroller.clientWidth - scrollerPaddingRight;
      if (available <= 0) {
        setVisibleCount((prev) => (prev === minVisible ? prev : minVisible));
        return;
      }
      const items = Array.from(measurer.querySelectorAll("[data-measure-chip]")) as HTMLElement[];
      if (items.length === 0) {
        setVisibleCount((prev) => (prev === minVisible ? prev : minVisible));
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
      const maxAllowed = Math.min(MAX_VISIBLE_CHIPS, quickAccessLabels.length);
      let nextCount = Math.min(count, maxAllowed);
      if (nextCount < minVisible) nextCount = minVisible;
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
  }, [quickAccessLabels, scrollerPaddingRight]);

  const chipRowClass = clsx("flex flex-wrap items-center gap-2 pb-1", scope === "fan" ? "px-3 py-2" : "");
  const modeRowClass =
    "flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const insertAndFocus = (prompt: string, autoSend = false, sourceActionId?: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    setInput((prev) => {
      if (!prev || !prev.trim()) return trimmedPrompt;
      return `${prev.trim()}\n\n${trimmedPrompt}`;
    });
    lastQuickPromptRef.current = sourceActionId ?? null;
    requestAnimationFrame(() => {
      const inputEl = inputRef.current;
      inputEl?.focus();
      resizeComposer(inputEl);
      inputEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    if (autoSend) {
      void handleSend(trimmedPrompt);
    }
  };
  const sendDisabled = sending || !input.trim();
  const recommendationActions = buildRecommendationActions(activeTabKey);
  const recommendationMessage = buildRecommendationMessage(recommendationActions, activeTabKey);
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
  const parsePriceToCents = (value: string) => {
    const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100);
  };
  const bundleSelection = useMemo(() => {
    if (!catalogDraft || catalogDraft.type !== "BUNDLE") {
      return { selectedItems: [] as CatalogItem[], totalCents: 0, savingsPercent: null, count: 0 };
    }
    const selectedItems = catalogDraft.includes
      .map((id) => catalogExtrasById.get(id))
      .filter((item): item is CatalogItem => Boolean(item));
    const totalCents = selectedItems.reduce((sum, item) => sum + item.priceCents, 0);
    const bundlePriceCents = parsePriceToCents(catalogDraft.price);
    const savingsPercent =
      bundlePriceCents !== null && totalCents > 0 && bundlePriceCents < totalCents
        ? Math.round(((totalCents - bundlePriceCents) / totalCents) * 100)
        : null;
    return {
      selectedItems,
      totalCents,
      savingsPercent,
      count: selectedItems.length,
    };
  }, [catalogDraft, catalogExtrasById]);
  const bundleSummaryLine = useMemo(() => {
    if (!catalogDraft || catalogDraft.type !== "BUNDLE") return "";
    const parts = [`Seleccionados: ${bundleSelection.count}`];
    if (bundleSelection.count > 0) {
      parts.push(
        `Suma extras: ${formatPriceCents(bundleSelection.totalCents, catalogDraft.currency || "EUR")}`
      );
    }
    if (bundleSelection.savingsPercent) {
      parts.push(`Ahorro ${bundleSelection.savingsPercent}%`);
    }
    return parts.join(" · ");
  }, [bundleSelection, catalogDraft]);
  const getBundleIncludeNames = (item: CatalogItem) => {
    const includes = item.includes ?? [];
    if (includes.length === 0) return [];
    return includes
      .map((id) => catalogExtrasById.get(id)?.title)
      .filter((title): title is string => Boolean(title));
  };
  const buildBundleIncludesPreview = (item: CatalogItem) => {
    const includeIds = item.includes ?? [];
    const names = getBundleIncludeNames(item);
    const count = includeIds.length;
    const label = count === 1 ? "extra" : "extras";
    if (count === 0) return `Incluye: 0 ${label}`;
    const preview = names.slice(0, 2).join(", ");
    const remaining = Math.max(0, names.length - 2);
    const previewSuffix = remaining > 0 ? ` +${remaining}` : "";
    const previewLine = preview ? ` · ${preview}${previewSuffix}` : "";
    return `Incluye: ${count} ${label}${previewLine}`;
  };
  const buildCatalogDraft = (item: CatalogItem, fanName: string) => {
    let includesSummary: string | undefined;
    if (item.type === "BUNDLE") {
      const names = getBundleIncludeNames(item);
      if (names.length > 0) {
        includesSummary = formatCatalogIncludesSummary(names);
      } else if (item.includes && item.includes.length > 0) {
        includesSummary = `${item.includes.length} extras`;
      }
    }
    return buildCatalogPitch({ fanName: getFirstName(fanName) || fanName, item, includesSummary });
  };
  const openCatalogEditor = (draft: CatalogEditorDraft, mode: "create" | "edit") => {
    setCatalogEditorMode(mode);
    setCatalogDraft(draft);
    setBundleSearch("");
    setIsCatalogEditorOpen(true);
  };
  const openCatalogEditorForItem = (item: CatalogItem) => {
    openCatalogEditor(
      {
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description ?? "",
        price: (item.priceCents / 100).toString(),
        currency: item.currency,
        isActive: item.isActive,
        isPublic: item.isPublic,
        includes: Array.isArray(item.includes) ? item.includes : [],
      },
      "edit"
    );
  };
  const openNewCatalogEditor = (type: CatalogItemType) => {
    const defaults = DEFAULT_CATALOG_ITEM[type];
    openCatalogEditor(
      {
        type,
        title: defaults.title,
        description: defaults.description,
        price: (defaults.priceCents / 100).toString(),
        currency: "EUR",
        isActive: true,
        isPublic: true,
        includes: [],
      },
      "create"
    );
  };
  const openPopClipEditor = (item: CatalogItem) => {
    if (item.type !== "PACK") return;
    const existing = popClipsByCatalogItemId.get(item.id);
    setPopClipEditorError(null);
    setPopClipDraftItem(item);
    setPopClipDraft({
      id: existing?.id,
      catalogItemId: item.id,
      title: existing?.title ?? "",
      videoUrl: existing?.videoUrl ?? "",
      posterUrl: existing?.posterUrl ?? "",
      durationSec: existing?.durationSec ? String(existing.durationSec) : "",
      isActive: existing?.isActive ?? true,
    });
    setIsPopClipEditorOpen(true);
  };
  const createCatalogItemAndEdit = async (type: CatalogItemType) => {
    if (!creatorId) {
      setCatalogToast("No hay creatorId para crear el ítem.");
      return;
    }
    const defaults = DEFAULT_CATALOG_ITEM[type];
    const nowIso = new Date().toISOString();
    const tempId = `temp-${Date.now()}`;
    const optimisticItem: CatalogItem = {
      id: tempId,
      creatorId,
      type,
      title: defaults.title,
      description: defaults.description,
      priceCents: defaults.priceCents,
      currency: "EUR",
      isActive: true,
      isPublic: true,
      sortOrder: 0,
      includes: type === "BUNDLE" ? [] : null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    updateCatalogItems((prev) => sortCatalogItems([optimisticItem, ...prev]));
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId,
          type,
          title: defaults.title,
          description: defaults.description,
          priceCents: defaults.priceCents,
          currency: "EUR",
          isPublic: true,
          ...(type === "BUNDLE" ? { includes: [] } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error("Error creating catalog item");
      }
      const data = (await res.json()) as { item: CatalogItem };
      updateCatalogItems((prev) =>
        sortCatalogItems(prev.map((item) => (item.id === tempId ? data.item : item)))
      );
      refreshCatalogItems?.();
      openCatalogEditorForItem(data.item);
    } catch (err) {
      console.error(err);
      updateCatalogItems((prev) => prev.filter((item) => item.id !== tempId));
      setCatalogToast("No se pudo crear el ítem.");
    }
  };
  const handleCatalogSave = async () => {
    if (!catalogDraft) return;
    if (!creatorId) {
      setCatalogToast("No hay creatorId para guardar.");
      return;
    }
    const title = catalogDraft.title.trim();
    if (!title) {
      setCatalogToast("El título es obligatorio.");
      return;
    }
    const priceCents = parsePriceToCents(catalogDraft.price);
    if (priceCents === null || priceCents < 0) {
      setCatalogToast("El precio debe ser válido.");
      return;
    }
    setCatalogSaving(true);
    const payload = {
      creatorId,
      type: catalogDraft.type,
      title,
      description: catalogDraft.description.trim() || null,
      priceCents,
      currency: catalogDraft.currency || "EUR",
      isActive: catalogDraft.isActive,
      isPublic: catalogDraft.isPublic,
      ...(catalogDraft.type === "BUNDLE" ? { includes: catalogDraft.includes } : {}),
    };
    const nextIncludes = catalogDraft.type === "BUNDLE" ? catalogDraft.includes : null;

    if (catalogEditorMode === "create") {
      const nowIso = new Date().toISOString();
      const tempId = `temp-${Date.now()}`;
      const optimisticItem: CatalogItem = {
        id: tempId,
        creatorId,
        type: payload.type,
        title: payload.title,
        description: payload.description,
        priceCents: payload.priceCents,
        currency: payload.currency,
        isActive: payload.isActive,
        isPublic: payload.isPublic,
        sortOrder: 0,
        includes: nextIncludes,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      updateCatalogItems((prev) => sortCatalogItems([optimisticItem, ...prev]));
      try {
        const res = await fetch("/api/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error("Error creating catalog item");
        }
        const data = (await res.json()) as { item: CatalogItem };
        updateCatalogItems((prev) =>
          sortCatalogItems(prev.map((item) => (item.id === tempId ? data.item : item)))
        );
        refreshCatalogItems?.();
        setCatalogToast("Ítem creado.");
        setIsCatalogEditorOpen(false);
      } catch (err) {
        console.error(err);
        updateCatalogItems((prev) => prev.filter((item) => item.id !== tempId));
        setCatalogToast("No se pudo crear el ítem.");
      } finally {
        setCatalogSaving(false);
      }
      return;
    }

    if (!catalogDraft.id) {
      setCatalogToast("No se encontró el ítem.");
      setCatalogSaving(false);
      return;
    }
    const originalItem = catalogItemsState.find((item) => item.id === catalogDraft.id);
    updateCatalogItems((prev) =>
      sortCatalogItems(
        prev.map((item) =>
          item.id === catalogDraft.id
            ? {
                ...item,
                type: payload.type,
                title: payload.title,
                description: payload.description,
                priceCents: payload.priceCents,
                currency: payload.currency,
                isActive: payload.isActive,
                isPublic: payload.isPublic,
                includes: nextIncludes,
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      )
    );
    try {
      const res = await fetch(`/api/catalog/${catalogDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Error updating catalog item");
      }
      const data = (await res.json()) as { item: CatalogItem };
      updateCatalogItems((prev) =>
        sortCatalogItems(prev.map((item) => (item.id === data.item.id ? data.item : item)))
      );
      refreshCatalogItems?.();
      setCatalogToast("Ítem actualizado.");
      setIsCatalogEditorOpen(false);
    } catch (err) {
      console.error(err);
      if (originalItem) {
        updateCatalogItems((prev) =>
          sortCatalogItems(prev.map((item) => (item.id === originalItem.id ? originalItem : item)))
        );
      }
      setCatalogToast("No se pudo actualizar.");
    } finally {
      setCatalogSaving(false);
    }
  };
  const handleCatalogToggle = async (item: CatalogItem) => {
    if (!creatorId) {
      setCatalogToast("No hay creatorId para actualizar.");
      return;
    }
    const nextActive = !item.isActive;
    updateCatalogItems((prev) =>
      sortCatalogItems(prev.map((entry) => (entry.id === item.id ? { ...entry, isActive: nextActive } : entry)))
    );
    try {
      const res = await fetch(`/api/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, isActive: nextActive }),
      });
      if (!res.ok) {
        throw new Error("Error updating catalog item");
      }
      const data = (await res.json()) as { item: CatalogItem };
      updateCatalogItems((prev) =>
        sortCatalogItems(prev.map((entry) => (entry.id === data.item.id ? data.item : entry)))
      );
      refreshCatalogItems?.();
    } catch (err) {
      console.error(err);
      updateCatalogItems((prev) =>
        sortCatalogItems(prev.map((entry) => (entry.id === item.id ? item : entry)))
      );
      setCatalogToast("No se pudo actualizar.");
    }
  };
  const handlePopClipSave = async () => {
    if (!popClipDraft) return;
    if (!creatorId) {
      setPopClipEditorError("No hay creatorId para guardar.");
      return;
    }
    const videoUrl = popClipDraft.videoUrl.trim();
    if (!videoUrl) {
      setPopClipEditorError("El video es obligatorio.");
      return;
    }
    const durationRaw = popClipDraft.durationSec.trim();
    const durationValue = durationRaw.length > 0 ? Number(durationRaw) : null;
    if (durationValue !== null && (!Number.isFinite(durationValue) || durationValue < 0)) {
      setPopClipEditorError("La duración debe ser válida.");
      return;
    }
    setPopClipSaving(true);
    setPopClipEditorError(null);
    const payload = {
      creatorId,
      catalogItemId: popClipDraft.catalogItemId,
      title: popClipDraft.title.trim() || null,
      videoUrl,
      posterUrl: popClipDraft.posterUrl.trim() || null,
      durationSec: durationValue === null ? null : Math.round(durationValue),
      isActive: popClipDraft.isActive,
    };

    try {
      if (popClipDraft.id) {
        const res = await fetch(`/api/popclips/${popClipDraft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error("Error updating popclip");
        }
        const data = (await res.json()) as { clip: PopClip };
        setPopClips((prev) => sortPopClips(prev.map((clip) => (clip.id === data.clip.id ? data.clip : clip))));
        closePopClipEditor();
        return;
      }

      const res = await fetch("/api/popclips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Error creating popclip");
      }
      const data = (await res.json()) as { clip: PopClip };
      setPopClips((prev) => sortPopClips([data.clip, ...prev]));
      closePopClipEditor();
    } catch (_err) {
      setPopClipEditorError("No se pudo guardar el clip.");
    } finally {
      setPopClipSaving(false);
    }
  };
  const handlePopClipDelete = async () => {
    if (!popClipDraft?.id) {
      closePopClipEditor();
      return;
    }
    if (!creatorId) {
      setPopClipEditorError("No hay creatorId para eliminar.");
      return;
    }
    setPopClipDeleting(true);
    setPopClipEditorError(null);
    try {
      const res = await fetch(
        `/api/popclips/${popClipDraft.id}?creatorId=${encodeURIComponent(creatorId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error("Error deleting popclip");
      }
      setPopClips((prev) => prev.filter((clip) => clip.id !== popClipDraft.id));
      closePopClipEditor();
    } catch (_err) {
      setPopClipEditorError("No se pudo eliminar el clip.");
    } finally {
      setPopClipDeleting(false);
    }
  };
  const handleCatalogQuickAction = (actionId?: string) => {
    if (!actionId || !isCatalogTab) return;
    if (actionId === "ideas_extra_rapido") {
      void createCatalogItemAndEdit("EXTRA");
      return;
    }
    if (actionId === "bundle_sugerido") {
      void createCatalogItemAndEdit("BUNDLE");
      return;
    }
    if (actionId === "gap_catalogo") {
      catalogGapsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const handleCatalogDraftStart = (item: CatalogItem) => {
    setCatalogDraftItem(item);
    setCatalogFanPickerOpen(true);
  };
  const closeCatalogFanPicker = useCallback(() => {
    setCatalogFanPickerOpen(false);
    setCatalogDraftItem(null);
  }, []);
  const handleCatalogDraftFanSelect = (fan: CortexOverviewFan) => {
    if (!catalogDraftItem) return;
    const draft = buildCatalogDraft(catalogDraftItem, fan.displayName || "Fan");
    handleSendDraftToFan(fan.fanId, draft);
    closeCatalogFanPicker();
  };
  const handleFavoritesEditorClose = () => {
    setIsFavoritesEditorOpen(false);
  };
  const ensurePinnedMinimum = useCallback(
    (tab: CortexAtajoTab, nextIds: string[]) => {
      if (nextIds.length > 0) return nextIds;
      const fallback = DEFAULT_PINNED_BY_TAB[tab]?.[0];
      if (fallback) {
        setAtajosToast("Debe quedar al menos 1 atajo visible.");
        return [fallback];
      }
      return [];
    },
    [setAtajosToast]
  );
  const togglePinnedPrompt = (id: string) => {
    setAtajosState((prev) => {
      const current = prev.pinnedByTab[activeTabKey] ?? [];
      const isPinned = current.includes(id);
      const nextRaw = isPinned ? current.filter((item) => item !== id) : [ ...current, id ];
      const next = ensurePinnedMinimum(activeTabKey, nextRaw);
      return {
        ...prev,
        pinnedByTab: normalizePinnedByTab({ ...prev.pinnedByTab, [activeTabKey]: next }),
      };
    });
  };
  const movePinnedPrompt = (id: string, direction: "up" | "down") => {
    setAtajosState((prev) => {
      const current = prev.pinnedByTab[activeTabKey] ?? [];
      const index = current.indexOf(id);
      if (index < 0) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return prev;
      const next = [ ...current ];
      [next[index], next[target]] = [next[target], next[index]];
      return {
        ...prev,
        pinnedByTab: { ...prev.pinnedByTab, [activeTabKey]: next },
      };
    });
  };
  const restoreDefaultsForTab = () => {
    setAtajosState((prev) => ({
      ...prev,
      pinnedByTab: {
        ...prev.pinnedByTab,
        [activeTabKey]: [ ...DEFAULT_PINNED_BY_TAB[activeTabKey] ],
      },
    }));
  };
  const restoreAllAtajos = () => {
    setAtajosState((prev) => ({
      ...prev,
      pinnedByTab: getDefaultPinnedByTab(),
    }));
  };
  const handleSendDraftToFan = useCallback(
    (fanId: string, draft: string) => {
      if (!fanId || !draft) return;
      const fanParam = encodeURIComponent(fanId);
      const draftParam = encodeURIComponent(draft);
      void router.push(`/?fanId=${fanParam}&draft=${draftParam}`);
    },
    [router]
  );
  const handleOpenFanChat = useCallback(
    (fanId: string) => {
      if (!fanId) return;
      void router.push(`/?fanId=${encodeURIComponent(fanId)}`);
    },
    [router]
  );
  const buildSegmentSuggestedAction = useCallback(
    (segment: CortexSegmentEntry, fan?: CortexSegmentFanPreview) => {
      const name = fan?.displayName ? getFirstName(fan.displayName) : "";
      const trimmed = segment.suggestedAction.trim();
      if (!name) return trimmed;
      if (!trimmed) return `Hola ${name}`;
      return `Hola ${name}, ${trimmed}`;
    },
    []
  );
  const toggleSegmentExpanded = (segmentId: string) => {
    setSegmentsExpanded((prev) => ({ ...prev, [segmentId]: !prev[segmentId] }));
  };
  const renderDraftGroups = (drafts: CortexDraftGroup[] | undefined, className?: string) => {
    if (!drafts || drafts.length === 0) return null;
    return (
      <div className={clsx("mt-2 w-full space-y-3", className)}>
        {drafts.map((group) => (
          <div
            key={`${group.fanId}-${group.fanName}`}
            className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Borradores · {group.fanName}
            </div>
            <div className="mt-2 space-y-2">
              {group.drafts.map((draft, index) => (
                <div
                  key={`${group.fanId}-draft-${index}`}
                  className="rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2"
                >
                  <p className="text-[12px] text-slate-100 whitespace-pre-wrap">{draft}</p>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSendDraftToFan(group.fanId, draft);
                      }}
                      className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
                    >
                      Enviar borrador
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };
  const renderActionCards = (actions: CortexActionCard[] | undefined, className?: string) => {
    if (!actions || actions.length === 0) return null;
    return (
      <div className={clsx("mt-2 w-full space-y-2", className)}>
        {actions.map((action) => (
          <div
            key={action.id}
            className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-slate-100">{action.label}</div>
                {action.description && (
                  <div className="text-[11px] text-slate-400">{action.description}</div>
                )}
              </div>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  handleCatalogQuickAction(action.actionId);
                  insertAndFocus(buildPrompt(action.actionId), false, action.actionId);
                }}
                className="shrink-0 inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
              >
                Insertar
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (variant === "chat") {
    const headerLabel = title || "Manager IA";
    const tabLabel = scope === "global" ? CORTEX_TAB_LABELS[activeTabKey] : "Cortex";
    const quickAccessLabel = scope === "global" ? `Atajos · ${tabLabel}` : "Atajos";
    const editorTitle = scope === "global" ? `Editar atajos · ${tabLabel}` : "Editar atajos";
    const canEditAtajos = scope === "global";
    const editorList = canEditAtajos ? atajosForTab : [];
    const visibleCountCapped = Math.min(visibleCount, MAX_VISIBLE_CHIPS, quickAccessItems.length);
    const visibleChipItems = quickAccessItems.slice(0, visibleCountCapped);
    const overflowChipItems = quickAccessItems.slice(visibleCountCapped);
    const overflowCount = overflowChipItems.length;
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
          <div className="text-[12px] text-slate-400">No hay atajos disponibles.</div>
        )}
        {editorList.map((item) => {
          const isPinned = pinnedIdsForTab.includes(item.id);
          const pinnedIndex = pinnedIdsForTab.indexOf(item.id);
          const isFirst = pinnedIndex <= 0;
          const isLast = pinnedIndex === pinnedIdsForTab.length - 1;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2"
            >
              <div>
                <div className="text-[13px] text-slate-100">{item.label}</div>
                {item.description && <div className="text-[11px] text-slate-400">{item.description}</div>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    movePinnedPrompt(item.id, "up");
                  }}
                  disabled={!isPinned || isFirst}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center rounded-full border px-2 text-[10px] font-semibold transition",
                    !isPinned || isFirst
                      ? "border-slate-700/60 text-slate-500 cursor-not-allowed"
                      : "border-slate-700/70 text-slate-200 hover:bg-slate-800/80"
                  )}
                  aria-label="Subir atajo"
                >
                  Subir
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    movePinnedPrompt(item.id, "down");
                  }}
                  disabled={!isPinned || isLast}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center rounded-full border px-2 text-[10px] font-semibold transition",
                    !isPinned || isLast
                      ? "border-slate-700/60 text-slate-500 cursor-not-allowed"
                      : "border-slate-700/70 text-slate-200 hover:bg-slate-800/80"
                  )}
                  aria-label="Bajar atajo"
                >
                  Bajar
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePinnedPrompt(item.id);
                  }}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                    isPinned
                      ? "bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                      : "bg-slate-800/70 text-slate-200 hover:bg-slate-800"
                  )}
                >
                  {isPinned ? "Quitar" : "Fijar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
    const editorFooter = (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={restoreDefaultsForTab}
            className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
          >
            Restaurar {tabLabel}
          </button>
          <button
            type="button"
            onClick={restoreAllAtajos}
            className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
          >
            Restaurar todo
          </button>
        </div>
        <button
          type="button"
          onClick={handleFavoritesEditorClose}
          className="h-9 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40"
        >
          Cerrar
        </button>
      </div>
    );
    const segmentPreviewLimit = 4;
    const salesPanel = isSalesTab ? (
      <div className="mb-4 space-y-3">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Ventas</div>
              <div className="text-sm font-semibold text-slate-100">De dónde viene el dinero</div>
            </div>
            <div className="flex items-center gap-2">
              {[
                { id: "today" as const, label: "Hoy" },
                { id: "7d" as const, label: "7d" },
                { id: "30d" as const, label: "30d" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSalesRange(option.id);
                  }}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                    salesRange === option.id
                      ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-100"
                      : "border-slate-700/70 bg-slate-900/60 text-slate-200 hover:bg-slate-800/80"
                  )}
                >
                  {option.label}
                </button>
              ))}
              {(salesLoading || salesUpdated) && (
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  {salesLoading ? "Actualizando..." : "Actualizado"}
                </span>
              )}
            </div>
          </div>
          {salesLoading && <div className="text-[12px] text-slate-400">Cargando ventas...</div>}
          {salesError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <div className="text-[12px] text-amber-100">{salesError}</div>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  handleSalesRetry();
                }}
                className="rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Reintentar
              </button>
            </div>
          )}
          {!salesLoading && !salesError && salesData && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Total</div>
                  <div className="text-base font-semibold text-slate-100">
                    {formatCurrency(salesData.totals.totalAmount)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatCount(salesData.totals.count)} cobros · {formatCount(salesData.totals.uniqueFans)} fans
                  </div>
                </div>
                {[
                  {
                    id: "subscriptions",
                    label: "Suscripciones",
                    amount: salesData.breakdown.subscriptionsAmount,
                    count: salesData.counts.subscriptionsCount,
                  },
                  {
                    id: "extras",
                    label: "Extras",
                    amount: salesData.breakdown.extrasAmount,
                    count: salesData.counts.extrasCount,
                  },
                  {
                    id: "tips",
                    label: "Propinas",
                    amount: salesData.breakdown.tipsAmount,
                    count: salesData.counts.tipsCount,
                  },
                  {
                    id: "gifts",
                    label: "Regalos",
                    amount: salesData.breakdown.giftsAmount,
                    count: salesData.counts.giftsCount,
                  },
                  {
                    id: "packs",
                    label: "Packs",
                    amount: salesData.breakdown.packsAmount,
                    count: salesData.counts.packsCount,
                  },
                  {
                    id: "bundles",
                    label: "Bundles",
                    amount: salesData.breakdown.bundlesAmount,
                    count: salesData.counts.bundlesCount,
                  },
                ].map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{item.label}</div>
                    <div className="text-sm font-semibold text-slate-100">{formatCurrency(item.amount)}</div>
                    <div className="text-[11px] text-slate-500">
                      {formatCount(item.count)} cobro{item.count === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Top productos</div>
                  <div className="mt-2 space-y-1 text-[12px] text-slate-200">
                    {salesData.topProducts.length === 0 && <div className="text-slate-500">Sin ventas aún.</div>}
                    {salesData.topProducts.map((product) => (
                      <div key={product.productId} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{product.title}</span>
                          {product.isGift && (
                            <span className="shrink-0 rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                              Regalo
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-slate-400">
                          {formatCurrency(product.amount)} · {formatCount(product.count)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Top fans</div>
                  <div className="mt-2 space-y-1 text-[12px] text-slate-200">
                    {salesData.topFans.length === 0 && <div className="text-slate-500">Sin ventas aún.</div>}
                    {salesData.topFans.map((fan) => (
                      <div key={fan.fanId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{fan.displayName}</span>
                        <span className="shrink-0 text-slate-400">
                          {formatCurrency(fan.amount)} · {formatCount(fan.count)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-amber-200">Oportunidades</div>
                <div className="mt-2 space-y-1 text-[12px] text-amber-100">
                  {salesData.insights.length === 0 && <div className="text-amber-200/70">Sin alertas.</div>}
                  {salesData.insights.map((insight, idx) => (
                    <div key={`${insight}-${idx}`}>• {insight}</div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Segmentos accionables</div>
                  {segmentsLoading && <div className="text-[10px] text-slate-500">Cargando...</div>}
                </div>
                {segmentsError && <div className="mt-2 text-[12px] text-rose-300">{segmentsError}</div>}
                {!segmentsLoading && !segmentsError && segmentsData && segmentsData.segments.length === 0 && (
                  <div className="mt-2 text-[12px] text-slate-500">Sin segmentos aún.</div>
                )}
                {!segmentsLoading && !segmentsError && segmentsData && segmentsData.segments.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {segmentsData.segments.map((segment) => {
                      const isExpanded = Boolean(segmentsExpanded[segment.id]);
                      const previewFans = isExpanded
                        ? segment.fanPreview
                        : segment.fanPreview.slice(0, segmentPreviewLimit);
                      const hasMore = segment.fanPreview.length > segmentPreviewLimit;
                      const suggestedFan = segment.fanPreview[0];
                      return (
                        <div
                          key={segment.id}
                          className="rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-3 space-y-2"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[12px] font-semibold text-slate-100">{segment.title}</div>
                              <div className="text-[11px] text-slate-400">{segment.reason}</div>
                            </div>
                            <div className="text-right text-[11px] text-slate-400">
                              <div>{formatCount(segment.fanIds.length)} fans</div>
                              <div className="text-slate-200">{formatCurrency(segment.potentialAmount)}</div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {previewFans.length === 0 && (
                              <div className="text-[12px] text-slate-500">Sin fans en este segmento.</div>
                            )}
                            {previewFans.map((fan) => (
                              <div key={fan.fanId} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-[12px] text-slate-100">{fan.displayName}</div>
                                  <div className="text-[11px] text-slate-500">
                                    {formatCurrency(fan.totalSpent)} · {formatCount(fan.extrasCount)} extras ·{" "}
                                    {formatCount(fan.tipsCount)} propinas · {formatCount(fan.giftsCount)} regalos
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenFanChat(fan.fanId);
                                  }}
                                  className="shrink-0 rounded-full border border-slate-700/70 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                                >
                                  Abrir chat
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {hasMore && (
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSegmentExpanded(segment.id);
                                }}
                                className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                              >
                                {isExpanded ? "Ver menos" : "Ver todos"}
                              </button>
                            )}
                            <button
                              type="button"
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                insertAndFocus(buildSegmentSuggestedAction(segment, suggestedFan));
                              }}
                              className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
                            >
                              Insertar mensaje sugerido
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    ) : null;
    const catalogPanel = isCatalogTab ? (
      <div className="mb-4 space-y-3">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Tu catálogo</div>
              <div className="text-sm font-semibold text-slate-100">Extras, bundles y packs activos</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  openNewCatalogEditor("EXTRA");
                }}
                className="rounded-full border border-emerald-500/60 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25"
              >
                + Extra
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  openNewCatalogEditor("BUNDLE");
                }}
                className="rounded-full border border-slate-700/70 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
              >
                + Bundle
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  openNewCatalogEditor("PACK");
                }}
                className="rounded-full border border-slate-700/70 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
              >
                + Pack
              </button>
            </div>
          </div>
          {catalogLoading && <div className="mt-3 text-[12px] text-slate-400">Cargando catálogo...</div>}
          {catalogError && <div className="mt-3 text-[12px] text-rose-300">{catalogError}</div>}
          {popClipsLoading && <div className="mt-2 text-[12px] text-slate-500">Cargando PopClips...</div>}
          {popClipsError && <div className="mt-2 text-[12px] text-rose-300">{popClipsError}</div>}
          {!catalogLoading && visibleCatalogItems.length === 0 && (
            <div className="mt-3 text-[12px] text-slate-400">Aún no tienes ítems en el catálogo.</div>
          )}
          <div className="mt-3 space-y-2">
            {visibleCatalogItems.map((item) => {
              const includesPreview = item.type === "BUNDLE" ? buildBundleIncludesPreview(item) : "";
              const popClip = popClipsByCatalogItemId.get(item.id);
              const hasActivePopClip = Boolean(popClip?.isActive);
              const hasPopClip = Boolean(popClip);
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                  <span className="rounded-full border border-slate-700/70 bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                    {CATALOG_ITEM_TYPE_LABELS[item.type]}
                  </span>
                  <span
                    className={clsx(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      item.isPublic
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700/70 bg-slate-950/60 text-slate-300"
                    )}
                  >
                    {item.isPublic ? "Público" : "Oculto"}
                  </span>
                  {item.type === "PACK" && hasActivePopClip && (
                    <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                      PopClips público
                    </span>
                  )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-slate-100 truncate">{item.title}</div>
                      {item.description && (
                        <div className="text-[11px] text-slate-400 truncate">{item.description}</div>
                      )}
                      {includesPreview && (
                        <div className="text-[11px] text-slate-500 truncate">{includesPreview}</div>
                      )}
                    </div>
                  </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-100">
                    {formatPriceCents(item.priceCents, item.currency)}
                  </span>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleCatalogToggle(item);
                    }}
                    className={clsx(
                      "rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                      item.isActive
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                        : "border-slate-700/70 bg-slate-950/60 text-slate-300 hover:text-slate-100"
                    )}
                  >
                    {item.isActive ? "Activo" : "Inactivo"}
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      openCatalogEditorForItem(item);
                    }}
                    className="rounded-full border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800/80"
                  >
                    Editar
                  </button>
                  {item.type === "PACK" && (
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        openPopClipEditor(item);
                      }}
                      className="rounded-full border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800/80"
                    >
                      {hasPopClip ? "Editar clip" : "Añadir clip"}
                    </button>
                  )}
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCatalogDraftStart(item);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800/80"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 11l18-8-8 18-2-7-8-3z" />
                    </svg>
                    Borrador
                  </button>
                </div>
                </div>
              );
            })}
          </div>
          {catalogItemsSorted.length > MAX_CATALOG_ITEMS_VISIBLE && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setShowAllCatalogItems((prev) => !prev);
              }}
              className="mt-3 text-[11px] font-semibold text-emerald-200 hover:text-emerald-100"
            >
              {showAllCatalogItems ? "Ver menos" : `Ver todos (${catalogItemsSorted.length})`}
            </button>
          )}
          {catalogToast && (
            <div className="mt-2 text-[11px] text-amber-300">{catalogToast}</div>
          )}
        </div>
        <div
          ref={catalogGapsRef}
          className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3"
        >
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Huecos del catálogo</div>
          <div className="mt-2 space-y-1 text-[12px] text-slate-200">
            <div>{catalogGaps.extrasOk ? "✅" : "⚠️"} Extras activos (mínimo 3)</div>
            <div>{catalogGaps.bundlesOk ? "✅" : "⚠️"} Bundles activos (mínimo 1)</div>
            <div>{catalogGaps.packsOk ? "✅" : "⚠️"} Packs activos (mínimo 1)</div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {!catalogGaps.extrasOk && (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void createCatalogItemAndEdit("EXTRA");
                }}
                className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-left text-[12px] font-semibold text-slate-100 hover:bg-slate-800/70"
              >
                Crear extra
              </button>
            )}
            {!catalogGaps.bundlesOk && (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void createCatalogItemAndEdit("BUNDLE");
                }}
                className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-left text-[12px] font-semibold text-slate-100 hover:bg-slate-800/70"
              >
                Crear bundle
              </button>
            )}
            {!catalogGaps.packsOk && (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void createCatalogItemAndEdit("PACK");
                }}
                className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-left text-[12px] font-semibold text-slate-100 hover:bg-slate-800/70"
              >
                Crear pack
              </button>
            )}
            {catalogGaps.extrasOk && catalogGaps.bundlesOk && catalogGaps.packsOk && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-100">
                Catálogo completo por ahora.
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;
    const catalogEditor =
      isCatalogEditorOpen && catalogDraft && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center bg-black/60 px-4 py-6">
                <div
                  ref={catalogEditorModalRef}
                  className="w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editor de catálogo"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {catalogEditorMode === "create" ? "Crear ítem" : "Editar ítem"}
                      </h3>
                      <p className="text-[11px] text-slate-400">Ajusta título, precio y estado.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCatalogEditorOpen(false)}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className="block text-[11px] text-slate-400">
                      Tipo
                      <select
                        value={catalogDraft.type}
                        onChange={(event) => {
                          const nextType = event.target.value as CatalogItemType;
                          setCatalogDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  type: nextType,
                                  includes: nextType === "BUNDLE" ? prev.includes : [],
                                }
                              : prev
                          );
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      >
                        {CATALOG_ITEM_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {CATALOG_ITEM_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Título
                      <input
                        ref={catalogEditorTitleRef}
                        value={catalogDraft.title}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="Nombre del ítem"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Precio (€)
                      <input
                        value={catalogDraft.price}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, price: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="15"
                        inputMode="decimal"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Descripción
                      <textarea
                        value={catalogDraft.description}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        rows={3}
                        placeholder="Texto corto para el ítem"
                      />
                    </label>
                    {catalogDraft.type === "BUNDLE" && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Incluye</div>
                        <input
                          value={bundleSearch}
                          onChange={(event) => setBundleSearch(event.target.value)}
                          className="mt-2 w-full rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-[12px] text-slate-100"
                          placeholder="Buscar extras..."
                        />
                        <div className="mt-2 space-y-2 max-h-32 overflow-y-auto pr-1">
                          {filteredCatalogExtras.length > 0 ? (
                            filteredCatalogExtras.map((extra) => {
                              const checked = catalogDraft.includes.includes(extra.id);
                              return (
                                <label
                                  key={extra.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-100"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setCatalogDraft((prev) => {
                                          if (!prev) return prev;
                                          const next = checked
                                            ? prev.includes.filter((id) => id !== extra.id)
                                            : [ ...prev.includes, extra.id ];
                                          return { ...prev, includes: next };
                                        })
                                      }
                                      className="h-4 w-4 accent-emerald-500"
                                    />
                                    <span className="truncate">{extra.title}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {formatPriceCents(extra.priceCents, extra.currency)}
                                  </span>
                                </label>
                              );
                            })
                          ) : (
                            <div className="text-[11px] text-slate-500">No hay extras disponibles.</div>
                          )}
                        </div>
                        {bundleSummaryLine && (
                          <div className="mt-2 text-[11px] text-slate-400">{bundleSummaryLine}</div>
                        )}
                      </div>
                    )}
                    <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200">
                      Activo
                      <input
                        type="checkbox"
                        checked={catalogDraft.isActive}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, isActive: event.target.checked } : prev))
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200">
                      Visible en perfil público
                      <input
                        type="checkbox"
                        checked={catalogDraft.isPublic}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, isPublic: event.target.checked } : prev))
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCatalogEditorOpen(false)}
                      className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCatalogSave}
                      disabled={catalogSaving}
                      className="h-9 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40 disabled:opacity-60"
                    >
                      {catalogSaving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="sm:hidden fixed inset-0 z-[9999] flex items-end justify-center bg-black/60">
                <div
                  ref={catalogEditorSheetRef}
                  className="w-full max-w-lg rounded-t-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl max-h-[85vh] overflow-y-auto"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editor de catálogo"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {catalogEditorMode === "create" ? "Crear ítem" : "Editar ítem"}
                      </h3>
                      <p className="text-[11px] text-slate-400">Ajusta título, precio y estado.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCatalogEditorOpen(false)}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className="block text-[11px] text-slate-400">
                      Tipo
                      <select
                        value={catalogDraft.type}
                        onChange={(event) => {
                          const nextType = event.target.value as CatalogItemType;
                          setCatalogDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  type: nextType,
                                  includes: nextType === "BUNDLE" ? prev.includes : [],
                                }
                              : prev
                          );
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      >
                        {CATALOG_ITEM_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {CATALOG_ITEM_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Título
                      <input
                        ref={catalogEditorTitleRef}
                        value={catalogDraft.title}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="Nombre del ítem"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Precio (€)
                      <input
                        value={catalogDraft.price}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, price: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="15"
                        inputMode="decimal"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Descripción
                      <textarea
                        value={catalogDraft.description}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        rows={3}
                        placeholder="Texto corto para el ítem"
                      />
                    </label>
                    {catalogDraft.type === "BUNDLE" && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Incluye</div>
                        <input
                          value={bundleSearch}
                          onChange={(event) => setBundleSearch(event.target.value)}
                          className="mt-2 w-full rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-[12px] text-slate-100"
                          placeholder="Buscar extras..."
                        />
                        <div className="mt-2 space-y-2 max-h-32 overflow-y-auto pr-1">
                          {filteredCatalogExtras.length > 0 ? (
                            filteredCatalogExtras.map((extra) => {
                              const checked = catalogDraft.includes.includes(extra.id);
                              return (
                                <label
                                  key={extra.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-100"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setCatalogDraft((prev) => {
                                          if (!prev) return prev;
                                          const next = checked
                                            ? prev.includes.filter((id) => id !== extra.id)
                                            : [ ...prev.includes, extra.id ];
                                          return { ...prev, includes: next };
                                        })
                                      }
                                      className="h-4 w-4 accent-emerald-500"
                                    />
                                    <span className="truncate">{extra.title}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {formatPriceCents(extra.priceCents, extra.currency)}
                                  </span>
                                </label>
                              );
                            })
                          ) : (
                            <div className="text-[11px] text-slate-500">No hay extras disponibles.</div>
                          )}
                        </div>
                        {bundleSummaryLine && (
                          <div className="mt-2 text-[11px] text-slate-400">{bundleSummaryLine}</div>
                        )}
                      </div>
                    )}
                    <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200">
                      Activo
                      <input
                        type="checkbox"
                        checked={catalogDraft.isActive}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, isActive: event.target.checked } : prev))
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200">
                      Visible en perfil público
                      <input
                        type="checkbox"
                        checked={catalogDraft.isPublic}
                        onChange={(event) =>
                          setCatalogDraft((prev) => (prev ? { ...prev, isPublic: event.target.checked } : prev))
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCatalogEditorOpen(false)}
                      className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCatalogSave}
                      disabled={catalogSaving}
                      className="h-9 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40 disabled:opacity-60"
                    >
                      {catalogSaving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null;
    const popClipEditor =
      isPopClipEditorOpen && popClipDraft && popClipDraftItem && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center bg-black/60 px-4 py-6">
                <div
                  ref={popClipEditorModalRef}
                  className="w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editor PopClips"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {popClipDraft.id ? "Editar PopClip" : "Añadir PopClip"}
                      </h3>
                      <p className="text-[11px] text-slate-400">Clip público para este pack.</p>
                    </div>
                    <button
                      type="button"
                      onClick={closePopClipEditor}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Pack</div>
                      <div className="mt-1 text-[12px] font-semibold text-slate-100">{popClipDraftItem.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {formatPriceCents(popClipDraftItem.priceCents, popClipDraftItem.currency)}
                      </div>
                    </div>
                    {!popClipDraftItem.isPublic && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                        Este pack está oculto en el perfil. PopClips es público: actívalo en “Visible en perfil público” o el
                        clip no se mostrará.
                      </div>
                    )}
                    <label className="block text-[11px] text-slate-400">
                      Título (opcional)
                      <input
                        value={popClipDraft.title}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="Título del clip"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Video URL
                      <input
                        ref={popClipEditorVideoRef}
                        value={popClipDraft.videoUrl}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, videoUrl: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="https://..."
                        inputMode="url"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Poster URL (opcional)
                      <input
                        value={popClipDraft.posterUrl}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, posterUrl: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="https://..."
                        inputMode="url"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Duración (segundos)
                      <input
                        value={popClipDraft.durationSec}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, durationSec: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="8"
                        inputMode="numeric"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200">
                      Activo
                      <input
                        type="checkbox"
                        checked={popClipDraft.isActive}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, isActive: event.target.checked } : prev))
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </label>
                    {popClipEditorError && <div className="text-[11px] text-rose-300">{popClipEditorError}</div>}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Preview</div>
                      {popClipDraft.videoUrl.trim() ? (
                        <video
                          src={popClipDraft.videoUrl.trim()}
                          poster={popClipDraft.posterUrl.trim() || undefined}
                          muted
                          loop
                          playsInline
                          controls
                          className="mt-2 w-full rounded-lg border border-slate-800/70 bg-black/40"
                        />
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-500">Añade un video URL para previsualizar.</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    {popClipDraft.id ? (
                      <button
                        type="button"
                        onClick={handlePopClipDelete}
                        disabled={popClipDeleting || popClipSaving}
                        className="rounded-full border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                      >
                        {popClipDeleting ? "Eliminando..." : "Eliminar"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={closePopClipEditor}
                        className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                      >
                        Cancelar
                      </button>
                    )}
                    <div className="flex items-center gap-2">
                      {popClipDraft.id && (
                        <button
                          type="button"
                          onClick={closePopClipEditor}
                          className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handlePopClipSave}
                        disabled={popClipSaving || popClipDeleting}
                        className="h-9 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40 disabled:opacity-60"
                      >
                        {popClipSaving ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="sm:hidden fixed inset-0 z-[9999] flex items-end justify-center bg-black/60">
                <div
                  ref={popClipEditorSheetRef}
                  className="w-full max-w-lg rounded-t-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl max-h-[85vh] overflow-y-auto"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editor PopClips"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {popClipDraft.id ? "Editar PopClip" : "Añadir PopClip"}
                      </h3>
                      <p className="text-[11px] text-slate-400">Clip público para este pack.</p>
                    </div>
                    <button
                      type="button"
                      onClick={closePopClipEditor}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Pack</div>
                      <div className="mt-1 text-[12px] font-semibold text-slate-100">{popClipDraftItem.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {formatPriceCents(popClipDraftItem.priceCents, popClipDraftItem.currency)}
                      </div>
                    </div>
                    {!popClipDraftItem.isPublic && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                        Este pack está oculto en el perfil. PopClips es público: actívalo en “Visible en perfil público” o el
                        clip no se mostrará.
                      </div>
                    )}
                    <label className="block text-[11px] text-slate-400">
                      Título (opcional)
                      <input
                        value={popClipDraft.title}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="Título del clip"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Video URL
                      <input
                        ref={popClipEditorVideoRef}
                        value={popClipDraft.videoUrl}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, videoUrl: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="https://..."
                        inputMode="url"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Poster URL (opcional)
                      <input
                        value={popClipDraft.posterUrl}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, posterUrl: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="https://..."
                        inputMode="url"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      Duración (segundos)
                      <input
                        value={popClipDraft.durationSec}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, durationSec: event.target.value } : prev))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="8"
                        inputMode="numeric"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200">
                      Activo
                      <input
                        type="checkbox"
                        checked={popClipDraft.isActive}
                        onChange={(event) =>
                          setPopClipDraft((prev) => (prev ? { ...prev, isActive: event.target.checked } : prev))
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </label>
                    {popClipEditorError && <div className="text-[11px] text-rose-300">{popClipEditorError}</div>}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Preview</div>
                      {popClipDraft.videoUrl.trim() ? (
                        <video
                          src={popClipDraft.videoUrl.trim()}
                          poster={popClipDraft.posterUrl.trim() || undefined}
                          muted
                          loop
                          playsInline
                          controls
                          className="mt-2 w-full rounded-lg border border-slate-800/70 bg-black/40"
                        />
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-500">Añade un video URL para previsualizar.</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    {popClipDraft.id ? (
                      <button
                        type="button"
                        onClick={handlePopClipDelete}
                        disabled={popClipDeleting || popClipSaving}
                        className="rounded-full border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                      >
                        {popClipDeleting ? "Eliminando..." : "Eliminar"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={closePopClipEditor}
                        className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                      >
                        Cancelar
                      </button>
                    )}
                    <div className="flex items-center gap-2">
                      {popClipDraft.id && (
                        <button
                          type="button"
                          onClick={closePopClipEditor}
                          className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handlePopClipSave}
                        disabled={popClipSaving || popClipDeleting}
                        className="h-9 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40 disabled:opacity-60"
                      >
                        {popClipSaving ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null;
    const fanCandidates = catalogFans ?? { priority: [], rest: [] };
    const catalogFanPicker =
      catalogFanPickerOpen && catalogDraftItem && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center bg-black/60 px-4 py-6">
                <div
                  ref={catalogFanPickerModalRef}
                  className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Elegir fan"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Enviar borrador</h3>
                      <p className="text-[11px] text-slate-400">
                        {catalogDraftItem.title} · {formatPriceCents(catalogDraftItem.priceCents, catalogDraftItem.currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeCatalogFanPicker}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {fanCandidates.priority.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Prioridad</div>
                        <div className="mt-2 space-y-2">
                          {fanCandidates.priority.map((fan) => (
                            <button
                              key={fan.fanId}
                              type="button"
                              onClick={() => handleCatalogDraftFanSelect(fan)}
                              className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[12px] text-slate-100 hover:bg-slate-800/70"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{fan.displayName}</span>
                                <span className="text-[10px] text-slate-400">{formatExpireBadge(fan)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {fanCandidates.rest.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Cola</div>
                        <div className="mt-2 space-y-2">
                          {fanCandidates.rest.map((fan) => (
                            <button
                              key={fan.fanId}
                              type="button"
                              onClick={() => handleCatalogDraftFanSelect(fan)}
                              className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[12px] text-slate-100 hover:bg-slate-800/70"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{fan.displayName}</span>
                                <span className="text-[10px] text-slate-400">{formatExpireBadge(fan)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {fanCandidates.priority.length === 0 && fanCandidates.rest.length === 0 && (
                      <div className="text-[12px] text-slate-400">No hay fans disponibles.</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="sm:hidden fixed inset-0 z-[9999] flex items-end justify-center bg-black/60">
                <div
                  ref={catalogFanPickerSheetRef}
                  className="w-full max-w-lg rounded-t-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl max-h-[85vh] overflow-y-auto"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Elegir fan"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Enviar borrador</h3>
                      <p className="text-[11px] text-slate-400">
                        {catalogDraftItem.title} · {formatPriceCents(catalogDraftItem.priceCents, catalogDraftItem.currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeCatalogFanPicker}
                      className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {fanCandidates.priority.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Prioridad</div>
                        <div className="mt-2 space-y-2">
                          {fanCandidates.priority.map((fan) => (
                            <button
                              key={fan.fanId}
                              type="button"
                              onClick={() => handleCatalogDraftFanSelect(fan)}
                              className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[12px] text-slate-100 hover:bg-slate-800/70"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{fan.displayName}</span>
                                <span className="text-[10px] text-slate-400">{formatExpireBadge(fan)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {fanCandidates.rest.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Cola</div>
                        <div className="mt-2 space-y-2">
                          {fanCandidates.rest.map((fan) => (
                            <button
                              key={fan.fanId}
                              type="button"
                              onClick={() => handleCatalogDraftFanSelect(fan)}
                              className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[12px] text-slate-100 hover:bg-slate-800/70"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{fan.displayName}</span>
                                <span className="text-[10px] text-slate-400">{formatExpireBadge(fan)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {fanCandidates.priority.length === 0 && fanCandidates.rest.length === 0 && (
                      <div className="text-[12px] text-slate-400">No hay fans disponibles.</div>
                    )}
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null;
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
                    {overflowChipItems.length === 0 && (
                      <div className="text-[12px] text-slate-400">No hay atajos ocultos.</div>
                    )}
                    {overflowChipItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          markQuickAccessUsed();
                          const prompt = item.actionId ? buildPrompt(item.actionId) : item.label;
                          handleCatalogQuickAction(item.actionId);
                          insertAndFocus(prompt, false, item.actionId);
                          setOverflowOpen(false);
                        }}
                        className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800/70"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    {canEditAtajos && (
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
                    )}
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
                    {overflowChipItems.length === 0 && (
                      <div className="text-[12px] text-slate-400">No hay atajos ocultos.</div>
                    )}
                    {overflowChipItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          markQuickAccessUsed();
                          const prompt = item.actionId ? buildPrompt(item.actionId) : item.label;
                          handleCatalogQuickAction(item.actionId);
                          insertAndFocus(prompt, false, item.actionId);
                          setOverflowOpen(false);
                        }}
                        className="w-full text-left rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800/70"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    {canEditAtajos && (
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
                    )}
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
              {salesPanel}
              {catalogPanel}
              {!loading && !error && messages.length === 0 && (
                <div className="flex flex-col items-start gap-2">
                  <MessageBalloon
                    me={false}
                    message={recommendationMessage}
                    time={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    fromLabel="Manager IA"
                    meLabel="Tú"
                  />
                  {renderActionCards(recommendationActions, "max-w-2xl")}
                </div>
              )}
              {messages.map((msg) => {
                const isCreator = msg.role === "CREATOR";
                const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={msg.id} className={clsx("flex flex-col", isCreator ? "items-end" : "items-start")}>
                    <MessageBalloon
                      me={isCreator}
                      message={msg.content}
                      time={time}
                      fromLabel="Manager IA"
                      meLabel="Tú"
                    />
                    {!isCreator && (
                      <>
                        {renderActionCards(msg.actions, "max-w-2xl")}
                        {renderDraftGroups(msg.drafts, "max-w-2xl")}
                      </>
                    )}
                  </div>
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
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setGlobalMode(mode);
                              }}
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
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setGrowthPlatform(platform);
                              }}
                            >
                              {formatPlatformLabel(platform)}
                            </PillButton>
                          ))}
                          <span className="text-[10px] text-slate-500">Activas: {growthActiveList}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3 min-w-0 [@media(max-width:480px)]:grid-cols-[auto,1fr] [@media(max-width:480px)]:grid-rows-[auto,auto] [@media(max-width:480px)]:gap-2">
                    <span className="text-[11px] font-semibold text-slate-300 shrink-0 [@media(max-width:480px)]:col-start-1 [@media(max-width:480px)]:row-start-1">
                      <span className="mr-1">⚡</span>
                      {quickAccessLabel}
                    </span>
                    <div className="relative flex items-center gap-2 min-w-0 [@media(max-width:480px)]:col-span-2 [@media(max-width:480px)]:row-start-2">
                      <div
                        ref={quickAccessScrollerRef}
                        className="flex-1 min-w-0 flex flex-nowrap items-center gap-2 whitespace-nowrap overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        style={{ paddingRight: `${scrollerPaddingRight}px`, WebkitOverflowScrolling: "touch" }}
                      >
                        {visibleChipItems.map((item, idx) => (
                          <button
                            key={item.id}
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              markQuickAccessUsed();
                              const prompt = item.actionId ? buildPrompt(item.actionId) : item.label;
                              handleCatalogQuickAction(item.actionId);
                              insertAndFocus(prompt, false, item.actionId);
                            }}
                            title={item.label}
                            className={clsx(
                              "shrink-0 max-w-[160px] truncate rounded-full border px-2 py-1 text-[11px] font-semibold transition",
                              idx === 0
                                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                                : "border-slate-700/70 bg-slate-900/60 text-slate-200 hover:text-slate-100"
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                        {quickAccessItems.length === 0 && (
                          <span className="text-[11px] text-slate-500 whitespace-nowrap">
                            {canEditAtajos ? "Sin atajos. Pulsa Editar." : "Sin atajos."}
                          </span>
                        )}
                      </div>
                      <div
                        ref={quickAccessMeasureRef}
                        className="pointer-events-none absolute left-[-9999px] top-0 opacity-0 whitespace-nowrap"
                        aria-hidden="true"
                      >
                        {quickAccessItems.map((item, idx) => (
                          <span
                            key={`measure-${item.id}-${idx}`}
                            data-measure-chip
                            className="shrink-0 max-w-[160px] truncate rounded-full border px-2 py-1 text-[11px] font-semibold"
                          >
                            {item.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div
                      ref={quickAccessActionsRef}
                      className="shrink-0 flex items-center gap-2 [@media(max-width:480px)]:col-start-2 [@media(max-width:480px)]:row-start-1 [@media(max-width:480px)]:justify-self-end"
                    >
                      {overflowCount > 0 && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
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
                      {canEditAtajos && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setIsEmojiOpen(false);
                            setOverflowOpen(false);
                            setIsFavoritesEditorOpen(true);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/90"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                  {!hasUsedQuickAccess && visibleChipItems.length > 0 && (
                    <div className="pl-1 text-[11px] text-slate-500">
                      Pulsa un atajo para insertarlo en el mensaje.
                    </div>
                  )}
                  {atajosToast && (
                    <div className="pl-1 text-[11px] text-amber-300">
                      {atajosToast}
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
                    lastQuickPromptRef.current = null;
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
              {catalogEditor}
              {popClipEditor}
              {catalogFanPicker}
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
                    {renderActionCards(msg.actions)}
                    {renderDraftGroups(msg.drafts)}
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
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setGlobalMode(mode);
                  }}
                >
                  {mode === "HOY" ? "Hoy" : mode === "VENTAS" ? "Ventas" : mode === "CATALOGO" ? "Catálogo" : "Crecimiento"}
                </PillButton>
              );
            })}
          </div>
        )}
        <div className={chipRowClass}>
          {quickSuggestions.map((sugg) => {
            const label = typeof sugg === "string" ? sugg : sugg.label;
            const actionId = typeof sugg === "string" ? undefined : sugg.id;
            return (
              <PillButton
                key={typeof sugg === "string" ? sugg : sugg.id}
                intent="secondary"
                size="sm"
                className={clsx(scope === "global" && "shrink-0")}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  const prompt = actionId ? buildPrompt(actionId) : label;
                  handleCatalogQuickAction(actionId);
                  insertAndFocus(prompt, false, actionId);
                }}
                disabled={sending}
              >
                {label}
              </PillButton>
            );
          })}
        </div>
        <div className="pt-2 border-t border-slate-800">
          <ChatComposerBar
            value={input}
            onChange={(event) => {
              lastQuickPromptRef.current = null;
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
