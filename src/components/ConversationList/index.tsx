import { useContext, useState } from "react";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import { ConversationListData } from "../../types/Conversation"

interface ConversationListProps {
  isFirstConversation?: boolean;
  data: ConversationListData
}

export default function ConversationList(props: ConversationListProps) {
  const { isFirstConversation, data } = props;
  const { setConversation } = useContext(ConversationContext);
  const { contactName, lastMessage, lastTime, image, unreadCount, isNew } = data;
  const borderHeight = isFirstConversation ? "0px" : "1px"
  const [ isHover, seHover ] = useState(false);
  const hasUnread = !!unreadCount && unreadCount > 0;
  const nameClasses = hasUnread ? "text-white text-base font-semibold" : "text-white text-base";
  const previewClasses = hasUnread ? "text-white text-sm font-medium" : "text-[#aebac1] text-sm";

  return (
    <div 
      className="flex items-center w-full h-[4.5rem] bg-[#111B21] pl-3 pr-4 hover:bg-[#2A3942] cursor-pointer"
      onMouseMove={ () => seHover(true) }
      onMouseLeave={ () => seHover(false) }
      onClick={ () => setConversation(data) }
    >
      <div className="flex w-[4.8rem]">
        <Avatar  width="w-12" height="h-12" image={image} />
      </div>
      <div className="flex flex-col w-full">
        <hr style={{borderTop: `${borderHeight} solid rgba(134,150,160,0.15)`}} />
        <div className="flex py-2">
          <div className="flex flex-col w-full h-full ">
            <div className="flex items-center gap-2">
              <span className={`overflow-y-hidden text-ellipsis ${nameClasses}`}>{contactName}</span>
              {isNew ? <span className="text-[11px] px-2 py-[2px] rounded-full border border-[#53bdeb] text-[#53bdeb]">Nuevo</span> : null}
            </div>
            <span className={`overflow-y-hidden text-ellipsis ${previewClasses}`}>{lastMessage}</span>
          </div>
          <div className="flex flex-col w-auto text-[#aebac1]">
            <h1 className="text-xs">{lastTime}</h1>
            {hasUnread && (
              <span className="mt-2 self-end min-w-[20px] h-5 px-2 rounded-full bg-[#53bdeb] text-[#0b141a] text-xs font-semibold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
            {
              isHover ? (
                <span className="flex cursor-pointer h-full items-center justify-center">
                  <svg viewBox="0 0 19 20" width="19" height="20" className="">
                    <path fill="currentColor" d="m3.8 6.7 5.7 5.7 5.7-5.7 1.6 1.6-7.3 7.2-7.3-7.2 1.6-1.6z"></path>
                  </svg>
                </span>
              ) : null
            }
            
          </div>
        </div>
      </div>
    </div>
  )
}
