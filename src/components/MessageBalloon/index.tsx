import { useEffect, useState } from "react";

interface MessageBalloonProps {
  me: boolean;
  message: string;
  seen?: boolean;
  time?: string;
  fromLabel?: string;
  meLabel?: string;
  status?: "sending" | "failed" | "sent";
  translatedText?: string;
}

export default function MessageBalloon(props: MessageBalloonProps) {
  const [time, setTime] = useState("");
  const [isTranslationOpen, setIsTranslationOpen] = useState(false);
  const { me, message, seen, fromLabel, meLabel, status, translatedText } = props;

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
        {translatedText ? (
          <div className={`mt-1 text-[11px] text-slate-300 ${me ? "text-right" : ""}`}>
            <button
              type="button"
              onClick={() => setIsTranslationOpen((prev) => !prev)}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline"
            >
              {isTranslationOpen ? "Ocultar traducción" : "Ver traducción"}
            </button>
            {isTranslationOpen && (
              <div className="mt-1">
                <span className="font-semibold">Traducción:</span> {translatedText}
              </div>
            )}
          </div>
        ) : null}
        {status === "sending" && <div className="mt-1 text-[10px] text-slate-400 text-right">Enviando...</div>}
        {status === "failed" && <div className="mt-1 text-[10px] text-rose-300 text-right">Fallo al enviar</div>}
        {me && seen ? <div className="mt-1 text-[10px] text-[#8edafc] text-right">✔✔ Visto</div> : null}
      </div>
    </div>
  )
}
