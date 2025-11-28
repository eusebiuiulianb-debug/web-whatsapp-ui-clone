interface Message {
  me: boolean;
  message: string;
}

interface Conversation {
  contactName: string;
  messageHistory: Message[];
  image: string;
  membershipStatus?: string;
  daysLeft?: number;
}

interface ConversationListData {
  contactName: string;
  lastMessage: string;
  lastTime: string;
  image: string;
  messageHistory: Message[];
  membershipStatus?: string;
  daysLeft?: number;
}

export type { Message, Conversation, ConversationListData }
