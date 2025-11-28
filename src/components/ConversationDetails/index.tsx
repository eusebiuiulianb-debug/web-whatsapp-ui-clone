import { KeyboardEvent, useContext, useEffect, useState } from "react";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import MessageBalloon from "../MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { Message as ApiMessage } from "../../types/chat";

export default function ConversationDetails() {
  const { conversation, message, setMessage } = useContext(ConversationContext);
  const { contactName, image, membershipStatus, daysLeft, lastSeen, id } = conversation;
  const [ messageSend, setMessageSend ] = useState("");
  const [ isPackListOpen, setIsPackListOpen ] = useState(false);
  const [ isLoadingMessages, setIsLoadingMessages ] = useState(false);
  const [ messagesError, setMessagesError ] = useState("");
  const { config } = useCreatorConfig();

  useEffect( () => {
    if (!id) return;
    async function fetchMessages() {
      try {
        setIsLoadingMessages(true);
        setMessagesError("");
        setMessage([]);
        const res = await fetch(`/api/messages?fanId=${id}`);
        if (!res.ok) throw new Error("error");
        const data = await res.json();
        const mapped = (data.messages as ApiMessage[]).map(msg => ({
          me: msg.from === "creator",
          message: msg.text,
          seen: !!msg.isLastFromCreator,
          time: msg.time,
        }));
        setMessage(mapped);
      } catch (_err) {
        setMessagesError("Error cargando mensajes");
      } finally {
        setIsLoadingMessages(false);
      }
    }
    fetchMessages();
  }, [id]);
  useEffect(() => {
    setMessageSend("");
  }, [conversation]);

  function membershipLabel() {
    const status = membershipStatus || "Contenido individual";
    if (daysLeft === undefined || daysLeft === null || daysLeft === 0) {
      return `${status} · sin suscripción activa`;
    }
    if (daysLeft === 1) {
      return `${status} · expira mañana`;
    }
    return `${status} · ${daysLeft} días restantes`;
  }

  function handleQuickReply(template?: string) {
    const text = template || "";
    setMessageSend(text);
    setIsPackListOpen(false);
  }

  function handleSelectPack(packId: string) {
    const selectedPack = config.packs.find(pack => pack.id === packId);
    if (!selectedPack) return;

    const template = `Te propongo el ${selectedPack.name} (${selectedPack.price}): ${selectedPack.description} Si te encaja, te envío el enlace de pago: [pega aquí tu enlace].`;
    setMessageSend(template);
    setIsPackListOpen(false);
  }

  function changeHandler(evt: KeyboardEvent<HTMLInputElement>) {
    const { key } = evt;

    if ( key ==="Enter" && messageSend.trim().length > 0) {
      const teste = { "me": true, "message": messageSend };
      setMessage([...message, teste]);
      setMessageSend("");
    }
  }

  function lastSeenLabel() {
    if (!lastSeen) return null;
    if (lastSeen.toLowerCase() === "en línea ahora") {
      return (
        <div className="flex items-center gap-2 text-xs text-[#53bdeb]">
          <span className="w-2 h-2 rounded-full bg-[#25d366]" />
          <span>En línea ahora</span>
        </div>
      );
    }
    return <span className="text-[#8696a0] text-xs">Última conexión: {lastSeen}</span>;
  }

  return (
    <div className="flex flex-col w-full h-full min-h-[60vh]">
      <div className="flex justify-between w-full px-4">
        <div className="flex justify-between bg-[#202c33] w-full h-14">
          <div className="flex items-center gap-4 h-full">
            <Avatar width="w-10" height="h-10" image={image} />
            <div className="flex flex-col leading-tight">
              <h1 className="text-white font-normal">{contactName}</h1>
              <span className="text-[#8696a0] text-xs">{membershipLabel()}</span>
              {lastSeenLabel()}
            </div>
          </div>
          <div className="flex items-center text-[#8696a0] gap-2">
            <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
              <path fill="currentColor" d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-5-5.2zm-6.2 0c-2.6 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2 4.6-4.6 4.6z">
              </path>
            </svg>
            <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
              <path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"></path>
            </svg>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full bg-[#111b21] px-4 md:px-6 py-3 gap-2 border-b border-[rgba(134,150,160,0.15)]">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            className="flex-shrink-0 bg-[#2a3942] hover:bg-[#3b4a54] text-white text-sm px-3 py-2 rounded-lg border border-[rgba(134,150,160,0.2)] whitespace-nowrap"
            onClick={() => handleQuickReply(config.quickReplies.saludoRapido)}
          >
            Saludo rápido
          </button>
          <button
            type="button"
            className="flex-shrink-0 bg-[#2a3942] hover:bg-[#3b4a54] text-white text-sm px-3 py-2 rounded-lg border border-[rgba(134,150,160,0.2)] whitespace-nowrap"
            onClick={() => handleQuickReply(config.quickReplies.packBienvenida)}
          >
            Pack bienvenida
          </button>
          <button
            type="button"
            className="flex-shrink-0 bg-[#2a3942] hover:bg-[#3b4a54] text-white text-sm px-3 py-2 rounded-lg border border-[rgba(134,150,160,0.2)] whitespace-nowrap"
            onClick={() => handleQuickReply(config.quickReplies.enlaceSuscripcion)}
          >
            Enlace suscripción
          </button>
          <button
            type="button"
            className="flex-shrink-0 bg-[#2a3942] hover:bg-[#3b4a54] text-white text-sm px-3 py-2 rounded-lg border border-[rgba(134,150,160,0.2)] whitespace-nowrap"
            onClick={() => setIsPackListOpen(!isPackListOpen)}
          >
            Elegir pack
          </button>
        </div>
        {
          isPackListOpen && (
            <div className="flex flex-col gap-2 bg-[#0c1317] border border-[rgba(134,150,160,0.2)] rounded-lg p-3 w-full">
              {
                config.packs.map(pack => (
                  <button
                    key={pack.id}
                    type="button"
                    className="text-left bg-[#1f2c33] hover:bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-[rgba(134,150,160,0.15)]"
                    onClick={() => handleSelectPack(pack.id)}
                  >
                    <div className="flex justify-between text-sm font-medium">
                      <span>{pack.name}</span>
                      <span className="text-[#53bdeb]">{pack.price}</span>
                    </div>
                    <p className="text-[#8696a0] text-xs mt-1">{pack.description}</p>
                  </button>
                ))
              }
            </div>
          )
        }
      </div>
      <div className="flex flex-col w-full flex-1 px-4 md:px-24 py-6 overflow-y-auto" style={{ backgroundImage: "url('/assets/images/background.jpg')" }}>
        {
          message.map( ( messageConversation, index ) => {
            const { me, message, seen, time } = messageConversation;

            return (
              <MessageBalloon key={index} me={me} message={message} seen={seen} time={time} />
            )
          } )
        }
        {isLoadingMessages && <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>}
        {messagesError && !isLoadingMessages && <div className="text-center text-red-400 text-sm mt-2">{messagesError}</div>}
      </div>
      <footer className="flex items-center bg-[#202c33] w-full h-16 py-3 text-[#8696a0]">
        <div className="flex py-1 pl-5 gap-3">
          <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
            <path fill="currentColor" d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159zm3.108-9.751c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962z">
            </path>
          </svg>
          <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
            <path fill="currentColor" d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 4.36a.572.572 0 0 0-.834.018l-7.205 7.207a5.577 5.577 0 0 0-1.645 3.971z">
            </path>
          </svg>
        </div>
        <div className="flex w-[85%] h-12 ml-3">
          <input type={"text"} className="bg-[#2a3942] rounded-lg w-full px-3 py-3 text-white" placeholder="Mensaje" onKeyDown={(evt) => changeHandler(evt) } onChange={ (evt) => setMessageSend(evt.target.value) } value={messageSend} />
        </div>
        <div className="flex justify-center items-center w-[5%] h-12">
          <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer">
            <path fill="currentColor" d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2z">
            </path>
          </svg>
        </div>
      </footer>
    </div>
  )
}
