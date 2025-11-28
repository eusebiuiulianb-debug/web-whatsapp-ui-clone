interface Message {
  me: boolean;
  message: string;
  seen?: boolean;
}

interface Conversation {
  contactName: string;
  messageHistory: Message[];
  image: string;
  membershipStatus?: string;
  daysLeft?: number;
  unreadCount?: number;
  isNew?: boolean;
  lastSeen?: string;
}

interface ConversationListData {
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
}

export type { Message, Conversation, ConversationListData }
