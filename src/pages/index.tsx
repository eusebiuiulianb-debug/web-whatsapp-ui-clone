import Head from "next/head";
import { useContext, useEffect, useRef, useState } from "react";
import ConversationDetails from "../components/ConversationDetails";
import SideBar from "../components/SideBar";
import { CreatorShell } from "../components/creator/CreatorShell";
import { ChatSkeleton } from "../components/skeletons/ChatSkeleton";
import { PillButton } from "../components/ui/PillButton";
import { ConversationContext } from "../context/ConversationContext";
import { useRouter } from "next/router";
import { track } from "../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../lib/analyticsEvents";
import { AI_ENABLED } from "../lib/features";
import { getFanIdFromQuery } from "../lib/navigation/openCreatorChat";

export default function Home() {
  const { conversation, openManagerPanel, chatListStatus } = useContext(ConversationContext);
  const aiEnabled = AI_ENABLED;
  const hasConversation = Boolean(conversation?.id);
  const hasContactName = Boolean(conversation?.contactName);
  const router = useRouter();
  const queryFan = router.query.fan;
  const queryFanId = router.query.fanId;
  const [mobileView, setMobileView] = useState<"board" | "chat">("board");
  const conversationSectionRef = useRef<HTMLDivElement>(null!);
  const lastTrackedFanRef = useRef<string | null>(null);
  const showChatSkeleton = chatListStatus === "loading";

  useEffect(() => {
    if (!hasConversation) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) return;
    setMobileView("chat");
    conversationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasConversation]);

  useEffect(() => {
    if (!aiEnabled) return;
    if (typeof window === "undefined") return;
    const handleOpenInternalPanel = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as
        | { fanId?: string; source?: string }
        | undefined;
      const targetFanId = detail?.fanId ?? null;
      openManagerPanel({
        tab: "manager",
        targetFanId: targetFanId ?? null,
        source: detail?.source ?? "event",
      });
    };
    window.addEventListener("novsy:openInternalPanel", handleOpenInternalPanel as EventListener);
    return () => {
      window.removeEventListener("novsy:openInternalPanel", handleOpenInternalPanel as EventListener);
    };
  }, [aiEnabled, openManagerPanel]);

  useEffect(() => {
    if (!hasConversation || !conversation?.id) return;
    if (lastTrackedFanRef.current === conversation.id) return;
    lastTrackedFanRef.current = conversation.id;
    track(ANALYTICS_EVENTS.OPEN_CHAT, { fanId: conversation.id });
  }, [hasConversation, conversation?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fanIdFromQuery = getFanIdFromQuery({ fan: queryFan, fanId: queryFanId });
    if (!fanIdFromQuery) return;
    if (window.innerWidth < 1024) {
      setMobileView("chat");
      conversationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [queryFan, queryFanId]);

  useEffect(() => {
    if (hasConversation) return;
    setMobileView("board");
  }, [hasConversation]);

  return (
    <>
      <Head>
        <title>IntimiPop – Panel</title>
      </Head>
      <div className="relative min-h-screen">
        <div className={showChatSkeleton ? "pointer-events-none opacity-0" : ""}>
          <CreatorShell
            mobileView={mobileView}
            onBackToBoard={() => setMobileView("board")}
            sidebar={<SideBar />}
            showChat={hasContactName}
            renderChat={({ onBackToBoard }) => (
              <ConversationDetails onBackToBoard={onBackToBoard} />
            )}
            fallback={<ChatEmptyState />}
            conversationSectionRef={conversationSectionRef}
          />
        </div>
        {showChatSkeleton ? (
          <div className="absolute inset-0 pointer-events-none">
            <ChatSkeleton mobileView={mobileView} />
          </div>
        ) : null}
      </div>
    </>
  );
}

function ChatEmptyState() {
  const router = useRouter();

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-[color:var(--text)]">Selecciona un chat</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">O descubre creadores en el Explorador.</p>
        <div className="mt-4 flex justify-center">
          <PillButton intent="primary" size="md" onClick={() => void router.push("/explore")}>
            Ir al Explorador
          </PillButton>
        </div>
      </div>
    </div>
  );
}
