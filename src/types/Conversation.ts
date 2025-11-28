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
}

export type { Message, Conversation, ConversationListData }
