import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import type { CreatorBusinessSnapshot, CreatorManagerSummary } from "../../lib/creatorManager";
import { getCreatorBusinessSnapshot } from "../../lib/creatorManager";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { getCreatorContentSnapshot } from "../../lib/creatorContentManager";
import type { FanManagerRow } from "../../server/manager/managerService";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import { IaWorkspaceCard } from "../../components/creator/IaWorkspaceCard";
import { openCreatorChat } from "../../lib/navigation/openCreatorChat";

type Props = {
  initialSnapshot: CreatorBusinessSnapshot | null;
  initialContentSnapshot: CreatorContentSnapshot | null;
};

export default function CreatorManagerPage({ initialSnapshot, initialContentSnapshot }: Props) {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const [summary, setSummary] = useState<CreatorManagerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [queue, setQueue] = useState<FanManagerRow[]>([]);
  const [queueError, setQueueError] = useState("");
  const [advisorInput, setAdvisorInput] = useState<CreatorAiAdvisorInput | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [advisorError, setAdvisorError] = useState(false);

  useEffect(() => {
    fetchSummary();
    fetchQueue();
    fetchAdvisorInput();
  }, []);

  async function fetchSummary() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/manager/overview");
      if (!res.ok) throw new Error("Error fetching summary");
      const data = (await res.json()) as any;
      setSummary(data as CreatorManagerSummary);
    } catch (_err) {
      setError("No se pudo cargar el panel del creador.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAdvisorInput() {
    try {
      setAdvisorLoading(true);
      setAdvisorError(false);
      const res = await fetch("/api/creator/ai-advisor-input");
      if (!res.ok) throw new Error("Error fetching advisor input");
      const data = (await res.json()) as CreatorAiAdvisorInput;
      setAdvisorInput(data);
    } catch (_err) {
      setAdvisorError(true);
      setAdvisorInput(null);
    } finally {
      setAdvisorLoading(false);
    }
  }

  async function fetchQueue() {
    try {
      setQueueError("");
      const res = await fetch("/api/manager/queue");
      if (!res.ok) throw new Error("Error fetching queue");
      const data = (await res.json()) as FanManagerRow[];
      setQueue(data);
    } catch (_err) {
      setQueueError("No se pudo cargar la cola de fans.");
      setQueue([]);
    }
  }

  function formatCurrency(amount: number) {
    return `${Math.round(amount)} €`;
  }

  function navigateToChats(filter: {
    followUpFilter?: "all" | "today" | "expired";
    tierFilter?: "all" | "new" | "regular" | "vip";
    onlyWithExtras?: boolean;
    segment?: string;
  }) {
    if (typeof window !== "undefined") {
      const payload = {
        followUpFilter: filter.followUpFilter ?? "all",
        tierFilter: filter.tierFilter ?? "all",
        onlyWithExtras: filter.onlyWithExtras ?? false,
        segment: filter.segment ?? null,
      };
      sessionStorage.setItem("novsy:pendingChatFilter", JSON.stringify(payload));
    }
    void router.push("/");
  }

  function handleOpenFanChat(fanId: string) {
    if (!fanId) return;
    openCreatorChat(router, fanId);
  }

  const Info = ({ text }: { text: string }) => (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-300 cursor-help hover:text-slate-100"
      title={text}
      aria-label="Info"
    >
      ⓘ
    </span>
  );

  return (
    <div className="min-h-screen bg-[#0b141a] text-white overflow-hidden">
      <Head>
        <title>Panel del creador · NOVSY</title>
      </Head>
      <CreatorHeader
        name={config.creatorName || "Creador"}
        role="Panel del creador"
        subtitle="Resumen de actividad y segmentos"
        initial={creatorInitial}
        avatarUrl={config.avatarUrl}
        onOpenSettings={() => router.push("/creator/edit")}
      />
      <main className="w-full max-w-6xl xl:max-w-7xl mx-auto px-4 lg:px-6 pb-6 lg:pb-10 flex flex-col space-y-6 h-[calc(100vh-140px)] min-h-0 overflow-hidden">
        <div className="shrink-0">
          {loading && <div className="text-sm text-slate-300">Cargando panel...</div>}
          {error && !loading && <div className="text-sm text-rose-300">{error}</div>}
        </div>
        {!loading && !error && summary && (
          <div className="flex-1 min-h-0">
            <IaWorkspaceCard
              businessSnapshot={initialSnapshot}
              contentSnapshot={initialContentSnapshot}
              summary={summary}
              queue={queue}
              queueError={queueError}
              advisorInput={advisorInput ?? undefined}
              advisorError={advisorError}
              advisorLoading={advisorLoading}
              onOpenFanChat={handleOpenFanChat}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  let initialSnapshot: CreatorBusinessSnapshot | null = null;
  let initialContentSnapshot: CreatorContentSnapshot | null = null;

  try {
    initialSnapshot = await getCreatorBusinessSnapshot(creatorId);
  } catch (err) {
    console.error("Error loading business snapshot for manager chat", err);
    initialSnapshot = null;
  }

  try {
    initialContentSnapshot = await getCreatorContentSnapshot(creatorId);
  } catch (err) {
    console.error("Error loading content snapshot for content manager chat", err);
    initialContentSnapshot = null;
  }

  return {
    props: {
      initialSnapshot,
      initialContentSnapshot,
    },
  };
};
