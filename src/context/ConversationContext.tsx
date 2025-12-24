import { createContext, ReactNode, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Message, Conversation, ConversationListData } from "../types/Conversation";

export type QueueFilter = "ventas_hoy" | "seguimiento_hoy" | "caducados" | "alta_prioridad" | null;
export type ManagerPanelMode = "fan" | "general";
export type ManagerPanelTab = "manager" | "templates" | "tools";
export type OpenManagerPanelOptions = {
  mode?: ManagerPanelMode;
  targetFanId?: string | null;
  tab?: ManagerPanelTab;
  source?: string;
};

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
  managerPanelOpen: boolean;
  managerPanelTab: ManagerPanelTab;
  managerPanelTargetFanId: string | null;
  managerPanelMode: ManagerPanelMode;
  openManagerPanel: (options?: OpenManagerPanelOptions) => void;
  closeManagerPanel: () => void;
}

export const ConversationContext = createContext({} as ConversationContextType);

export const ConversationProvider = ({ children }: ConversationProviderProps) => {
  const [ conversation, setConversationData ] = useState<Conversation>({} as Conversation);
  const [ message, setMessageData ] = useState<Message[]>([]);
  const [ activeQueueFilter, setActiveQueueFilter ] = useState<QueueFilter>(null);
  const [ queueFans, setQueueFans ] = useState<ConversationListData[]>([]);
  const [ managerPanelOpen, setManagerPanelOpen ] = useState(false);
  const [ managerPanelTab, setManagerPanelTab ] = useState<ManagerPanelTab>("manager");
  const [ managerPanelTargetFanId, setManagerPanelTargetFanId ] = useState<string | null>(null);
  const [ managerPanelMode, setManagerPanelMode ] = useState<ManagerPanelMode>("general");

  const setConversation = useCallback((conversation: Conversation) => {
    setConversationData(conversation);
  }, []);

  const setMessage = useCallback((message: SetStateAction<Message[]>) => {
    setMessageData(message);
  }, []);

  const openManagerPanel = useCallback(
    (options: OpenManagerPanelOptions = {}) => {
      const requestedFanId =
        typeof options.targetFanId === "string" && options.targetFanId.trim().length > 0
          ? options.targetFanId
          : null;
      const resolvedMode: ManagerPanelMode = options.mode ?? (requestedFanId ? "fan" : "general");
      const fallbackFanId =
        resolvedMode === "fan" && !requestedFanId && conversation?.id && !conversation.isManager
          ? conversation.id
          : null;
      const resolvedFanId = resolvedMode === "fan" ? requestedFanId ?? fallbackFanId : null;
      const resolvedTab: ManagerPanelTab = options.tab ?? "manager";

      setManagerPanelTargetFanId(resolvedFanId);
      setManagerPanelMode(resolvedMode);
      setManagerPanelTab(resolvedTab);
      setManagerPanelOpen(true);

      if (process.env.NODE_ENV !== "production") {
        console.trace("OPEN_MANAGER_PANEL", {
          tab: resolvedTab,
          targetFanId: resolvedFanId,
        });
        console.debug("[openManagerPanel]", {
          requestedFanId: requestedFanId ?? null,
          resolvedFanId,
          mode: resolvedMode,
          tab: resolvedTab,
          source: options.source ?? null,
        });
      }
    },
    [conversation]
  );

  const closeManagerPanel = useCallback(() => {
    if (process.env.NODE_ENV !== "production") {
      console.trace("CLOSE_MANAGER_PANEL");
    }
    setManagerPanelOpen(false);
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
      managerPanelOpen,
      managerPanelTab,
      managerPanelTargetFanId,
      managerPanelMode,
      openManagerPanel,
      closeManagerPanel,
    }),
    [
      conversation,
      message,
      activeQueueFilter,
      queueFans,
      managerPanelOpen,
      managerPanelTab,
      managerPanelTargetFanId,
      managerPanelMode,
      openManagerPanel,
      closeManagerPanel,
      setConversation,
      setMessage,
    ]
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  )
}
