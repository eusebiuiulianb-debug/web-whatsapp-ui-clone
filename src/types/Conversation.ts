import type { FollowUpTag, UrgencyLevel } from "../utils/followUp";

interface Message {
  me: boolean;
  message: string;
  seen?: boolean;
  time?: string;
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
  customerTier?: "new" | "regular" | "priority";
  nextAction?: string | null;
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
  customerTier?: "new" | "regular" | "priority";
  nextAction?: string | null;
}

export type { Message, Conversation, ConversationListData }
