import type { FollowUpTag, UrgencyLevel } from "../utils/followUp";

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
  lastCreatorMessageAt?: string | null;
  notesCount?: number;
  followUpTag?: FollowUpTag;
  urgencyLevel?: UrgencyLevel;
  paidGrantsCount?: number;
  lifetimeValue?: number;
  customerTier?: "new" | "regular" | "priority";
  nextAction?: string | null;
}

export interface Message {
  id: string;
  fanId: string;
  from: "creator" | "fan";
  text: string;
  time: string;
  isLastFromCreator?: boolean;
}
