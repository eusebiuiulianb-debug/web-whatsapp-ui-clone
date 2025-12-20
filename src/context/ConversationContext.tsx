import { createContext, ReactNode, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Message, Conversation, ConversationListData } from "../types/Conversation";

interface ConversationProviderProps {
  children: ReactNode;
}

interface ConversationContextType {
  conversation: Conversation;
  message: Message[];
  setConversation: ( conversation: Conversation ) => void;
  setMessage: Dispatch<SetStateAction<Message[]>>;
  queueMode: boolean;
  setQueueMode: (value: boolean) => void;
  todayQueue: ConversationListData[];
  setTodayQueue: (list: ConversationListData[]) => void;
  queueIndex: number;
  setQueueIndex: (idx: number) => void;
}

export const ConversationContext = createContext({} as ConversationContextType);

export const ConversationProvider = ({ children }: ConversationProviderProps) => {
  const [ conversation, setConversationData ] = useState<Conversation>({} as Conversation);
  const [ message, setMessageData ] = useState<Message[]>([]);
  const [ queueMode, setQueueMode ] = useState(false);
  const [ todayQueue, setTodayQueue ] = useState<ConversationListData[]>([]);
  const [ queueIndex, setQueueIndex ] = useState(0);

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
      queueMode,
      setQueueMode,
      todayQueue,
      setTodayQueue,
      queueIndex,
      setQueueIndex,
    }),
    [conversation, message, queueMode, todayQueue, queueIndex, setConversation, setMessage]
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  )
}
