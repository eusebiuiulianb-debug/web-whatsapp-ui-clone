import { useEffect, useState } from "react";

interface MessageBalloonProps {
  me: boolean;
  message: string;
  seen?: boolean;
  time?: string;
  fromLabel?: string;
  meLabel?: string;
  status?: "sending" | "failed" | "sent";
}

export default function MessageBalloon(props: MessageBalloonProps) {
  const [time, setTime] = useState("");
  const { me, message, seen, fromLabel, meLabel, status } = props;

  useEffect(() => {
    if (props.time) {
      setTime(props.time);
    } else {
      setTime(refreshTime());
    }
  }, [props.time])

  function refreshTime() {
    const date = new Date();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const formattedString = `${hours}:${minutes}`;
    return formattedString;
  }

  return (
    <div className={me ? "flex justify-end" : "flex justify-start"}>
      <div className="max-w-[75%]">
        <p
          className={`mb-1 text-[10px] uppercase tracking-wide text-slate-400 ${me ? "text-right" : ""}`}
        >
          {me ? meLabel || "Tú" : fromLabel || "Fan"} • {time}
        </p>
        <div
        className={`rounded-2xl px-4 py-2 text-sm shadow whitespace-pre-wrap ${
          me ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-50"
        }`}
      >
        {message}
      </div>
        {status === "sending" && <div className="mt-1 text-[10px] text-slate-400 text-right">Enviando...</div>}
        {status === "failed" && <div className="mt-1 text-[10px] text-rose-300 text-right">Fallo al enviar</div>}
        {me && seen ? <div className="mt-1 text-[10px] text-[#8edafc] text-right">✔✔ Visto</div> : null}
      </div>
    </div>
  )
}
