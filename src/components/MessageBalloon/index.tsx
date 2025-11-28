import { useEffect, useState } from "react";

interface MessageBalloonProps {
  me: boolean;
  message: string;
  seen?: boolean;
  time?: string;
}

export default function MessageBalloon(props: MessageBalloonProps) {
  const [time, setTime] = useState("");
  const { me, message, seen } = props;
  const flexAlignItems = me ? "items-end" : "items-start";
  const backgroundColor = me ? "bg-[#005c4b]" : "bg-[#202c33]";
  const borderRounded = me ? "rounded-tr-none" : "rounded-tl-none";

  useEffect(() => {
    if (props.time) {
      setTime(props.time);
    } else {
      setTime(refreshTime());
    }
  }, [props.time])

  function refreshTime() {
    const date = new Date();
    const formattedString = date.getHours() + ":" + date.getMinutes();
    return formattedString;
  }

  return (
    <div className={`flex flex-col ${flexAlignItems} w-full h-max`}>
      <div className={`flex flex-col min-w-[5%] max-w-[65%] h-max ${backgroundColor} p-2 text-white rounded-lg ${borderRounded} mb-3`}>
        <div className="flex flex-col w-full break-words">
          <span>{message}</span>
        </div>
        <div className="flex justify-end items-center gap-2 text-[hsla(0,0%,100%,0.6)] text-xs mt-1">
          <span>{time}</span>
          {me && seen ? <span className="text-[#8edafc] text-[11px]">✔✔ Visto</span> : null}
        </div>
      </div>
    </div>
  )
}
