import type { FollowUpTag, UrgencyLevel } from "../utils/followUp";
import type { ContentType, ContentVisibility } from "./content";

interface Message {
  me: boolean;
  message: string;
  seen?: boolean;
  time?: string;
  kind?: "text" | "content";
  type?: "TEXT" | "CONTENT";
  contentItem?: {
    id: string;
    title: string;
    type: ContentType;
    visibility: ContentVisibility;
    externalUrl?: string;
  } | null;
}

interface Conversation {
  id?: string;
  contactName: string;
  messageHistory: Message[];
  image: string;
  membershipStatus?: string;
  accessState?: "ACTIVE" | "EXPIRED" | "NONE";
  accessType?: string | null;
  accessLabel?: string | null;
  daysLeft?: number;
  unreadCount?: number;
  isNew?: boolean;
  lastSeen?: string;
  lastSeenAt?: string | null;
  lastTime?: string;
  followUpTag?: FollowUpTag;
  lastCreatorMessageAt?: string | null;
  notesCount?: number;
  urgencyLevel?: UrgencyLevel;
  paidGrantsCount?: number;
  lifetimeValue?: number;
  customerTier?: "new" | "regular" | "vip" | "priority";
  nextAction?: string | null;
  activeGrantTypes?: string[];
  hasAccessHistory?: boolean;
  priorityScore?: number;
  lastNoteSnippet?: string | null;
  nextActionSnippet?: string | null;
  lastNoteSummary?: string | null;
  nextActionSummary?: string | null;
  lifetimeSpend?: number;
  extrasCount?: number;
  extrasSpentTotal?: number;
  maxExtraTier?: string | null;
  novsyStatus?: "NOVSY" | null;
  isHighPriority?: boolean;
  segment?: string | null;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  healthScore?: number | null;
  lastGrantType?: string | null;
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
  isBlocked?: boolean;
  isArchived?: boolean;
  isManager?: boolean;
  firstUtmSource?: string | null;
  firstUtmMedium?: string | null;
  firstUtmCampaign?: string | null;
  firstUtmContent?: string | null;
  firstUtmTerm?: string | null;
}

interface ConversationListData {
  id?: string;
  contactName: string;
  lastMessage: string;
  lastTime: string;
  image: string;
  messageHistory: Message[];
  membershipStatus?: string;
  accessState?: "ACTIVE" | "EXPIRED" | "NONE";
  accessType?: string | null;
  accessLabel?: string | null;
  daysLeft?: number;
  unreadCount?: number;
  isNew?: boolean;
  lastSeen?: string;
  lastSeenAt?: string | null;
  followUpTag?: FollowUpTag;
  lastCreatorMessageAt?: string | null;
  notesCount?: number;
  urgencyLevel?: UrgencyLevel;
  paidGrantsCount?: number;
  lifetimeValue?: number;
  customerTier?: "new" | "regular" | "vip" | "priority";
  nextAction?: string | null;
  activeGrantTypes?: string[];
  hasAccessHistory?: boolean;
  priorityScore?: number;
  lastNoteSnippet?: string | null;
  nextActionSnippet?: string | null;
  lastNoteSummary?: string | null;
  nextActionSummary?: string | null;
  lifetimeSpend?: number;
  extrasCount?: number;
  extrasSpentTotal?: number;
  maxExtraTier?: string | null;
  novsyStatus?: "NOVSY" | null;
  isHighPriority?: boolean;
  segment?: string | null;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  healthScore?: number | null;
  lastGrantType?: string | null;
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
  isBlocked?: boolean;
  isArchived?: boolean;
  isManager?: boolean;
  firstUtmSource?: string | null;
  firstUtmMedium?: string | null;
  firstUtmCampaign?: string | null;
  firstUtmContent?: string | null;
  firstUtmTerm?: string | null;
}

export type { Message, Conversation, ConversationListData }
