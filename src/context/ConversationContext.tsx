import { createContext, ReactNode, useState } from "react";
import { Message, Conversation, ConversationListData } from "../types/Conversation";

interface ConversationProviderProps {
  children: ReactNode;
}

interface ConversationContextType {
  conversation: Conversation;
  message: Message[];
  setConversation: ( conversation: Conversation ) => void;
  setMessage: ( message: Message[] ) => void;
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

  function setConversation(conversation: Conversation) {
    setConversationData(conversation);
  }

  function setMessage( message: Message[] ) {
    console.log(message);
    setMessageData(message)
  }

  return (
    <ConversationContext.Provider value={{
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
    }}>
      {children}
    </ConversationContext.Provider>
  )
}
