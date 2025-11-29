import { useContext, useState } from "react";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import { ConversationListData } from "../../types/Conversation"
import { getAccessState } from "../../lib/access";
import { getFollowUpTag } from "../../utils/followUp";
import clsx from "clsx";
import { PACKS } from "../../config/packs";

interface ConversationListProps {
  isFirstConversation?: boolean;
  data: ConversationListData
}

export default function ConversationList(props: ConversationListProps) {
  const { isFirstConversation, data } = props;
  const { setConversation } = useContext(ConversationContext);
  const { contactName, lastMessage, lastTime, image, unreadCount, isNew, membershipStatus, daysLeft, urgencyLevel } = data;
  const borderClass = isFirstConversation ? "border-transparent" : "border-[rgba(134,150,160,0.15)]";
  const [ isHover, seHover ] = useState(false);
  const hasUnread = !!unreadCount && unreadCount > 0;
  const nameClasses = hasUnread ? "text-slate-50 text-sm font-semibold" : "text-slate-50 text-sm font-medium";
  const previewClasses = hasUnread ? "text-slate-50 text-xs font-medium" : "text-slate-400 text-xs";
  const accessState = getAccessState({ membershipStatus, daysLeft });

  const badgeStyles = {
    active: "bg-[#1f3d33] text-[#8de0c3] border border-[rgba(77,208,173,0.4)]",
    expiring: "bg-[#3d321f] text-[#f5c065] border border-[rgba(245,192,101,0.4)]",
    expired: "bg-[#2a2f32] text-[#9aa1a7] border border-[rgba(154,161,167,0.3)]",
  } as const;

  const chosenBadge = badgeStyles[accessState];
  const daysLabel = daysLeft !== undefined && daysLeft !== null ? `${daysLeft} d` : "";
  const nameTint = accessState === "expired" ? "text-[#7d8a93]" : nameClasses;
  const followUpTag = getFollowUpTag(membershipStatus, daysLeft);
  const notesCount = data.notesCount ?? 0;
  const customerTier = data.customerTier ?? "new";
  const lifetimeValue = data.lifetimeValue ?? 0;

  function renderFanSummary(fan: ConversationListData) {
    const tier = fan.customerTier ?? "new";
    const lv = Math.round(fan.lifetimeValue ?? 0);
    const notes = fan.notesCount ?? 0;
    const notesLabel = `${notes} nota${notes === 1 ? "" : "s"}`;
    const next = fan.nextAction && fan.nextAction.trim().length > 0 ? ` · ⚡ Próx.: ${shorten(fan.nextAction, 40)}` : "";
    if (tier === "priority") {
      return { label: "🔥 Alta prioridad", rest: ` · ${lv} € · ${notesLabel}${next}`, isPriority: true };
    }
    if (tier === "regular") {
      return { label: "Habitual", rest: ` · ${lv} € · ${notesLabel}${next}`, isPriority: false };
    }
    return { label: "Nuevo", rest: ` · ${lv} € · ${notesLabel}${next}`, isPriority: false };
  }

  const summary = renderFanSummary(data);
  function shorten(text: string, max = 70) {
    if (!text) return "";
    const trimmed = text.trim();
    if (trimmed.length <= max) return trimmed;
    return trimmed.slice(0, max - 1) + "…";
  }


  return (
    <div 
      className={`flex items-center w-full bg-[#111B21] px-3 py-3.5 hover:bg-[#2A3942] cursor-pointer border-t ${borderClass}`}
      onMouseMove={ () => seHover(true) }
      onMouseLeave={ () => seHover(false) }
      onClick={ () => setConversation(data) }
    >
      <div className="flex items-center gap-3 w-full">
        <Avatar width="w-12" height="h-12" image={image} />
        <div className="flex w-full items-start gap-3 min-w-0">
          <div className="flex flex-col gap-[2px] min-w-0 w-full">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`truncate ${nameTint}`}>{contactName}</span>
              {isNew ? <span className="text-[11px] px-2 py-[2px] rounded-full border border-[#53bdeb] text-[#53bdeb]">Nuevo</span> : null}
              {followUpTag !== "none" && (
                <span
                  className={clsx(
                    "ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    followUpTag === "trial_soon" && "border border-amber-400/70 bg-amber-500/10 text-amber-200",
                    followUpTag === "monthly_soon" && "border border-sky-400/70 bg-sky-500/10 text-sky-200",
                    followUpTag === "expired" && "border border-rose-400/70 bg-rose-500/10 text-rose-200"
                  )}
                >
                  {followUpTag === "trial_soon" && `Prueba · ${daysLeft ?? ""} d`}
                  {followUpTag === "monthly_soon" && `Renueva en ${daysLeft ?? ""} d`}
                  {followUpTag === "expired" && "Caducado"}
                </span>
              )}
            </div>
            <span className={`truncate ${previewClasses}`}>{lastMessage}</span>
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <span className={summary.isPriority ? "text-amber-300" : undefined}>{summary.label}</span>
              <span>{summary.rest}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {membershipStatus ? (
                <span className="inline-flex items-center rounded-full bg-slate-800/80 text-[10px] text-amber-200 px-2 py-[1px] w-fit">
                  {(() => {
                    const statusLower = membershipStatus.toLowerCase();
                    if (statusLower.includes("prueba")) return PACKS.trial.shortLabel;
                    if (statusLower.includes("suscripción")) return PACKS.monthly.shortLabel;
                    if (statusLower.includes("especial")) return PACKS.special.shortLabel;
                    return membershipStatus;
                  })()}
                </span>
              ) : null}
              {daysLabel ? (
                <span
                  className={
                    urgencyLevel === "high"
                      ? "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] border-red-500 text-red-300"
                      : urgencyLevel === "medium"
                      ? "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] border-amber-400 text-amber-200"
                      : "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] border-slate-600 text-slate-300"
                  }
                >
                  {daysLabel}
                </span>
              ) : null}
              {notesCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <span className="text-xs">📝</span>
                  <span>{notesCount}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 w-auto text-[#aebac1]">
            <h1 className="text-[10px] text-slate-500">{lastTime}</h1>
            {hasUnread && (
              <span className="self-end min-w-[20px] h-5 px-2 rounded-full bg-[#53bdeb] text-[#0b141a] text-xs font-semibold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
            {isHover ? (
              <span className="flex cursor-pointer h-full items-center justify-center">
                <svg viewBox="0 0 19 20" width="19" height="20" className="">
                  <path fill="currentColor" d="m3.8 6.7 5.7 5.7 5.7-5.7 1.6 1.6-7.3 7.2-7.3-7.2 1.6-1.6z"></path>
                </svg>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
