import type { FollowUpTag, UrgencyLevel } from "../utils/followUp";
import type { ReactionSummaryEntry } from "../lib/messageReactions";
import type { ContentType, ContentVisibility } from "./content";
import type { AgencyIntensity, AgencyPlaybook, AgencyStage } from "../lib/agency/types";

export interface Creator {
  id: string;
  name: string;
  subtitle: string;
  description: string;
}

export interface Pack {
  id: string;
  name: string;
  price: string;
  description: string;
}

export interface Fan {
  id: string;
  name: string;
  displayName?: string | null;
  creatorLabel?: string | null;
  avatar?: string;
  preview: string;
  time: string;
  unreadCount: number;
  isNew: boolean;
  isNew30d?: boolean;
  membershipStatus: string;
  accessState?: "ACTIVE" | "EXPIRED" | "NONE";
  accessType?: string | null;
  accessLabel?: string | null;
  hasActiveAccess?: boolean;
  daysLeft?: number;
  lastSeen: string;
  lastSeenAt?: string | null;
  lastCreatorMessageAt?: string | null;
  lastActivityAt?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string;
  threadId?: string;
  notesCount?: number;
  notePreview?: string | null;
  profileText?: string | null;
  quickNote?: string | null;
  followUpOpen?: FanFollowUp | null;
  followUpTag?: FollowUpTag;
  urgencyLevel?: UrgencyLevel;
  paidGrantsCount?: number;
  lifetimeValue?: number;
  customerTier?: "new" | "regular" | "vip" | "priority";
  nextAction?: string | null;
  nextActionAt?: string | null;
  nextActionNote?: string | null;
  activeGrantTypes?: string[];
  hasAccessHistory?: boolean;
  priorityScore?: number;
  lastNoteSnippet?: string | null;
  nextActionSnippet?: string | null;
  lastNoteSummary?: string | null;
  nextActionSummary?: string | null;
  agencyStage?: AgencyStage | null;
  agencyObjective?: string | null;
  agencyObjectiveLabel?: string | null;
  agencyIntensity?: AgencyIntensity | null;
  agencyPlaybook?: AgencyPlaybook | null;
  agencyNextAction?: string | null;
  agencyRecommendedOfferId?: string | null;
  lifetimeSpend?: number;
  totalSpent?: number;
  recent30dSpent?: number;
  extrasCount?: number;
  extrasSpentTotal?: number;
  tipsCount?: number;
  tipsSpentTotal?: number;
  giftsCount?: number;
  giftsSpentTotal?: number;
  maxExtraTier?: string | null;
  novsyStatus?: "NOVSY" | null;
  isHighPriority?: boolean;
  inviteUsedAt?: string | Date | null;
  highPriorityAt?: string | null;
  segment?: string | null;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  healthScore?: number | null;
  temperatureScore?: number | null;
  temperatureBucket?: "COLD" | "WARM" | "HOT" | string | null;
  heatScore?: number | null;
  heatLabel?: "COLD" | "WARM" | "HOT" | string | null;
  heatUpdatedAt?: string | null;
  heatMeta?: unknown;
  lastIntentKey?: string | null;
  lastIntentConfidence?: number | null;
  lastIntentAt?: string | null;
  lastInboundAt?: string | null;
  signalsUpdatedAt?: string | null;
  extraLadderStatus?: {
    totalSpent: number;
    lastPurchaseAt: string | null;
    maxTierBought: string | null;
    suggestedTier: string | null;
    phaseLabel: string;
    sessionToday?: {
      todayCount: number;
      todaySpent: number;
      todayHighestTier: string | null;
      todayLastPurchaseAt: string | null;
    } | null;
  } | null;
  extraSessionToday?: {
    todayCount: number;
    todaySpent: number;
    todayHighestTier: string | null;
    todayLastPurchaseAt: string | null;
  } | null;
  needsAction?: boolean;
  nextActionKey?: string | null;
  nextActionLabel?: string | null;
  nextActionText?: string | null;
  nextActionSource?: "reply" | "manual" | "suggested" | "none" | null;
  isBlocked?: boolean;
  isArchived?: boolean;
  locale?: string | null;
  preferredLanguage?: "es" | "en" | "ro" | null;
  firstUtmSource?: string | null;
  firstUtmMedium?: string | null;
  firstUtmCampaign?: string | null;
  firstUtmContent?: string | null;
  firstUtmTerm?: string | null;
}

export interface FanFollowUp {
  id: string;
  title: string;
  note?: string | null;
  dueAt?: string | null;
  status: "OPEN" | "DONE" | "DELETED";
  createdAt?: string | null;
  updatedAt?: string | null;
  doneAt?: string | null;
}

export interface MessageTranslation {
  id: string;
  messageId: string;
  targetLang: string;
  sourceKind: "text" | "voice_transcript";
  sourceHash: string;
  translatedText: string;
  detectedSourceLang?: string | null;
  provider?: string | null;
  createdAt: string;
  createdByCreatorId?: string | null;
}

export interface Message {
  id: string;
  fanId: string;
  from: "creator" | "fan";
  audience?: "FAN" | "CREATOR" | "INTERNAL";
  text: string;
  originalText?: string | null;
  originalLang?: string | null;
  deliveredText?: string | null;
  deliveredLang?: string | null;
  creatorTranslatedText?: string | null;
  creatorLang?: string | null;
  time: string;
  isLastFromCreator?: boolean;
  type?: "TEXT" | "CONTENT" | "STICKER" | "SYSTEM" | "AUDIO" | "VOICE";
  stickerId?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  audioMime?: string | null;
  audioSizeBytes?: number | null;
  transcriptText?: string | null;
  transcriptStatus?: "OFF" | "PENDING" | "DONE" | "FAILED" | null;
  transcriptError?: string | null;
  transcribedAt?: string | null;
  transcriptLang?: string | null;
  intentKey?: string | null;
  intentConfidence?: number | null;
  intentMeta?: unknown;
  intentUpdatedAt?: string | null;
  intentJson?: {
    intent?: string;
    tags?: string[];
    needsReply?: boolean;
    replyDraft?: string;
  } | null;
  voiceAnalysisJson?: string | null;
  voiceAnalysisUpdatedAt?: string | null;
  messageTranslations?: MessageTranslation[];
  reactionsSummary?: ReactionSummaryEntry[];
  contentItem?: {
    id: string;
    title: string;
    type: ContentType;
    visibility: ContentVisibility;
    externalUrl: string;
    createdAt: string;
  } | null;
}
