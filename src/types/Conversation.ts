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
  daysLeft?: number;
  unreadCount?: number;
  isNew?: boolean;
  lastSeen?: string;
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
}

interface ConversationListData {
  id?: string;
  contactName: string;
  lastMessage: string;
  lastTime: string;
  image: string;
  messageHistory: Message[];
  membershipStatus?: string;
  daysLeft?: number;
  unreadCount?: number;
  isNew?: boolean;
  lastSeen?: string;
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
}

export type { Message, Conversation, ConversationListData }
