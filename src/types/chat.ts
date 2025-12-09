import type { FollowUpTag, UrgencyLevel } from "../utils/followUp";
import type { ContentType, ContentVisibility } from "./content";

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
  avatar?: string;
  preview: string;
  time: string;
  unreadCount: number;
  isNew: boolean;
  membershipStatus: string;
  daysLeft?: number;
  lastSeen: string;
  lastSeenAt?: string | null;
  lastCreatorMessageAt?: string | null;
  notesCount?: number;
  followUpTag?: FollowUpTag;
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
}

export interface Message {
  id: string;
  fanId: string;
  from: "creator" | "fan";
  text: string;
  time: string;
  isLastFromCreator?: boolean;
  type?: "TEXT" | "CONTENT";
  contentItem?: {
    id: string;
    title: string;
    type: ContentType;
    visibility: ContentVisibility;
    externalUrl: string;
    createdAt: string;
  } | null;
}
