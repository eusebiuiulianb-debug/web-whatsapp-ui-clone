import { createContext, ReactNode, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Message, Conversation, ConversationListData } from "../types/Conversation";

export type QueueFilter = "ventas_hoy" | "seguimiento_hoy" | "caducados" | "alta_prioridad" | null;

interface ConversationProviderProps {
  children: ReactNode;
}

interface ConversationContextType {
  conversation: Conversation;
  message: Message[];
  setConversation: ( conversation: Conversation ) => void;
  setMessage: Dispatch<SetStateAction<Message[]>>;
  activeQueueFilter: QueueFilter;
  setActiveQueueFilter: (value: QueueFilter) => void;
  queueFans: ConversationListData[];
  setQueueFans: (list: ConversationListData[]) => void;
}

export const ConversationContext = createContext({} as ConversationContextType);

export const ConversationProvider = ({ children }: ConversationProviderProps) => {
  const [ conversation, setConversationData ] = useState<Conversation>({} as Conversation);
  const [ message, setMessageData ] = useState<Message[]>([]);
  const [ activeQueueFilter, setActiveQueueFilter ] = useState<QueueFilter>(null);
  const [ queueFans, setQueueFans ] = useState<ConversationListData[]>([]);

  const setConversation = useCallback((conversation: Conversation) => {
    setConversationData(conversation);
  }, []);

  const setMessage = useCallback((message: SetStateAction<Message[]>) => {
    setMessageData(message);
  }, []);

  const value = useMemo(
    () => ({
      conversation,
      message,
      setConversation,
      setMessage,
      activeQueueFilter,
      setActiveQueueFilter,
      queueFans,
      setQueueFans,
    }),
    [conversation, message, activeQueueFilter, queueFans, setConversation, setMessage]
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  )
}
