import ConversationList from "../ConversationList";
import { useEffect, useState } from "react";
import CreatorHeader from "../CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import CreatorSettingsPanel from "../CreatorSettingsPanel";
import { Fan } from "../../types/chat";
import { ConversationListData } from "../../types/Conversation";

export default function SideBar() {
  const [ search, setSearch ] = useState("");
  const [ isSettingsOpen, setIsSettingsOpen ] = useState(false);
  const [ fans, setFans ] = useState<ConversationListData[]>([]);
  const [ loadingFans, setLoadingFans ] = useState(true);
  const [ fansError, setFansError ] = useState("");
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const filteredConversationsList = search.length > 0
    ? fans.filter(fan => fan.contactName.toLowerCase().includes(search.toLowerCase()))
    : fans;

  useEffect(() => {
    async function fetchFans() {
      try {
        setLoadingFans(true);
        const res = await fetch("/api/fans");
        if (!res.ok) throw new Error("Error fetching fans");
        const data = await res.json();
        const mapped: ConversationListData[] = (data.fans as Fan[]).map((fan) => ({
          id: fan.id,
          contactName: fan.name,
          lastMessage: fan.preview,
          lastTime: fan.time,
          image: fan.avatar || "avatar.jpg",
          messageHistory: [],
          membershipStatus: fan.membershipStatus,
          daysLeft: fan.daysLeft,
          unreadCount: fan.unreadCount,
          isNew: fan.isNew,
          lastSeen: fan.lastSeen,
        }));
        setFans(mapped);
        setFansError("");
      } catch (_err) {
        setFansError("Error cargando fans");
      } finally {
        setLoadingFans(false);
      }
    }
    fetchFans();
  }, []);

  return (
    <div className="flex flex-col w-full md:w-[480px] bg-[#202c33] min-h-[320px] md:h-full" style={{borderRight: "1px solid rgba(134,150,160,0.15)"}}>
      <CreatorSettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <CreatorHeader
        name={config.creatorName}
        role="Creador"
        subtitle={config.creatorSubtitle}
        initial={creatorInitial}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="flex bg-[#111b21] w-full h-max px-3 py-2">
        <div className="relative w-[95%] h-max">
          <div className="absolute text-[#AEBAC1] h-full w-9">
            <svg viewBox="0 0 24 24" width="24" height="24" className="left-[50%] right-[50%] ml-auto mr-auto h-full">
              <path fill="currentColor" d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z">
              </path>
            </svg>
          </div>
          <div className="">
            <input className="w-[96%] h-9 rounded-lg bg-[#202c33] text-white text-sm px-10" placeholder="Buscar o iniciar un nuevo chat" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex w-[5%] h-full items-center justify-center">
          <svg viewBox="0 0 24 24" width="20" height="20" preserveAspectRatio="xMidYMid meet" className="text-[#778690]">
            <path fill="currentColor" d="M10 18.1h4v-2h-4v2zm-7-12v2h18v-2H3zm3 7h12v-2H6v2z">
            </path>
          </svg>
        </div>
      </div>
      <div className="flex flex-col w-full flex-1 overflow-y-auto" id="conversation">
        {loadingFans && (
          <div className="text-center text-[#aebac1] py-4 text-sm">Cargando fans...</div>
        )}
        {fansError && !loadingFans && (
          <div className="text-center text-red-400 py-4 text-sm">{fansError}</div>
        )}
        {!loadingFans && !fansError && filteredConversationsList.map((conversation, index) => {
          return (
            <ConversationList key={conversation.id || index} isFirstConversation={index == 0} data={conversation} />
          )
        })}
      </div>
    </div>
  )
}
