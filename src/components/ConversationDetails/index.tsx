import { KeyboardEvent, MouseEvent, useContext, useEffect, useState } from "react";
import clsx from "clsx";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import MessageBalloon from "../MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { Message as ApiMessage, Fan } from "../../types/chat";
import { Message as ConversationMessage, ConversationListData } from "../../types/Conversation";
import { getAccessLabel, getAccessState } from "../../lib/access";
import { FollowUpTag, getFollowUpTag } from "../../utils/followUp";
import { getRecommendedFan } from "../../utils/recommendedFan";

export default function ConversationDetails() {
  const { conversation, message: messages, setMessage, setConversation } = useContext(ConversationContext);
  const {
    contactName,
    image,
    membershipStatus,
    daysLeft,
    lastSeen,
    id,
    followUpTag: conversationFollowUpTag,
    lastCreatorMessageAt,
  } = conversation;
  const [ messageSend, setMessageSend ] = useState("");
  const [ showPackSelector, setShowPackSelector ] = useState(false);
  const [ isLoadingMessages, setIsLoadingMessages ] = useState(false);
  const [ messagesError, setMessagesError ] = useState("");
  const [ grantLoadingType, setGrantLoadingType ] = useState<"trial" | "monthly" | "special" | null>(null);
  const [ selectedPackType, setSelectedPackType ] = useState<"trial" | "monthly" | "special">("monthly");
  const [ accessGrants, setAccessGrants ] = useState<
    { id: string; fanId: string; type: string; createdAt: string; expiresAt: string }[]
  >([]);
  const [ accessGrantsLoading, setAccessGrantsLoading ] = useState(false);
  const [ showNotes, setShowNotes ] = useState(false);
  const [ notesLoading, setNotesLoading ] = useState(false);
  const [ notes, setNotes ] = useState<FanNote[]>([]);
  const [ noteDraft, setNoteDraft ] = useState("");
  const [ notesError, setNotesError ] = useState("");
  const [ showHistory, setShowHistory ] = useState(false);
  const [ historyError, setHistoryError ] = useState("");
  const [ nextActionDraft, setNextActionDraft ] = useState("");
  const [ recommendedFan, setRecommendedFan ] = useState<ConversationListData | null>(null);
  const { config } = useCreatorConfig();
  const accessState = getAccessState({ membershipStatus, daysLeft });
  const accessLabel = getAccessLabel({ membershipStatus, daysLeft });
  const packLabelMap = {
    trial: "Prueba 7 días",
    monthly: "Suscripción mensual",
    special: "Contenido individual",
  } as const;
  const packLabel = selectedPackType ? packLabelMap[selectedPackType] : accessLabel;
  const followUpTag: FollowUpTag =
    conversationFollowUpTag ?? getFollowUpTag(membershipStatus, daysLeft);

  type FanNote = {
    id: string;
    fanId: string;
    creatorId: string;
    content: string;
    createdAt: string;
  };

  function derivePackFromLabel(label?: string | null) {
    const lower = (label || "").toLowerCase();
    if (lower.includes("prueba")) return "trial";
    if (lower.includes("mensual")) return "monthly";
    if (lower.includes("individual")) return "special";
    return null;
  }

  const firstName = (contactName || "").split(" ")[0] || contactName || "";

  function getPackTypeFromName(name: string) {
    const lower = name.toLowerCase();
    if (lower.includes("bienvenida")) return "trial";
    if (lower.includes("mensual")) return "monthly";
    if (lower.includes("especial")) return "special";
    return null;
  }

  function findPackByType(type: "trial" | "monthly" | "special") {
    return config.packs.find((pack) => getPackTypeFromName(pack.name) === type);
  }

  function computeDaysLeft(expiresAt: string | Date) {
    const now = new Date();
    const exp = new Date(expiresAt);
    const diff = exp.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function mapFansForRecommendation(rawFans: Fan[]): ConversationListData[] {
    return rawFans.map((fan) => ({
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
      lastCreatorMessageAt: fan.lastCreatorMessageAt,
      followUpTag: getFollowUpTag(fan.membershipStatus, fan.daysLeft),
      notesCount: fan.notesCount,
      lifetimeValue: fan.lifetimeValue,
      customerTier: fan.customerTier,
      nextAction: fan.nextAction,
      urgencyLevel: getUrgencyLevel(getFollowUpTag(fan.membershipStatus, fan.daysLeft), fan.daysLeft),
      paidGrantsCount: fan.paidGrantsCount,
    }));
  }

  function formatLastCreatorMessage(lastMessage?: string | null) {
    if (!lastMessage) return "Nunca";
    const last = new Date(lastMessage);
    const now = new Date();
    const sameDay =
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate();
    if (sameDay) return "Hoy";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      last.getFullYear() === yesterday.getFullYear() &&
      last.getMonth() === yesterday.getMonth() &&
      last.getDate() === yesterday.getDate();
    if (isYesterday) return "Ayer";

    const diffDays = Math.ceil((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;

    return last.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  }

  function formatNoteDate(dateStr: string) {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
  }

  type PackStatus = "active" | "expired" | "never";

  function getPackStatusForType(type: "trial" | "monthly" | "special"): { status: PackStatus; daysLeft?: number } {
    const grantsForType = accessGrants.filter((g) => g.type === type);
    if (!grantsForType.length) return { status: "never" };

    const now = new Date();
    const activeGrant = grantsForType.find((g) => new Date(g.expiresAt) > now);
    if (activeGrant) {
      return { status: "active", daysLeft: computeDaysLeft(activeGrant.expiresAt) };
    }

    return { status: "expired" };
  }

  function buildPackProposalMessage(pack: { name: string; price: string; description: string }) {
    return `Te propongo el ${pack.name} (${pack.price}): ${pack.description} Si te encaja, te envío el enlace de pago: [pega aquí tu enlace].`;
  }

  function mapGrantType(type: string) {
    if (type === "trial") return { label: "Prueba 7 días", amount: 0 };
    if (type === "monthly") return { label: "Suscripción mensual", amount: 25 };
    if (type === "special") return { label: "Pack especial pareja", amount: 49 };
    return { label: type, amount: 0 };
  }

  function formatGrantDate(dateString: string) {
    const d = new Date(dateString);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function getGrantStatus(expiresAt?: string | null) {
    if (!expiresAt) return "Sin fecha";
    const now = new Date();
    const exp = new Date(expiresAt);
    return exp > now ? "Activo" : "Caducado";
  }

  function fillMessage(template: string) {
    setMessageSend(template);
  }

  function getFirstName(name?: string | null) {
    if (!name) return "";
    const first = name.trim().split(" ")[0];
    return first;
  }

  function buildFollowUpTrialMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} ¿cómo te han sentado estos días de prueba?\n\n` +
      "Tu período de prueba termina en breve. Si quieres que sigamos trabajando juntos, la suscripción mensual (25 €) incluye chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vais viviendo.\n\n" +
      "¿Quieres que te pase el enlace para entrar ya o prefieres primero contarme cómo te has sentido con estos días de prueba?"
    );
  }

  function buildFollowUpMonthlyMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} vengo a hacer un check rápido contigo.\n\n` +
      "Tu suscripción está a punto de renovarse. Antes de que eso pase, cuéntame en una frase: ¿qué ha sido lo más útil para ti este mes?\n\n" +
      "Si quieres que sigamos, te dejo el enlace de renovación: [pega aquí tu enlace].\n" +
      "Si sientes que hay algo que ajustar (ritmo, enfoque, tipo de contenido), dímelo y lo acomodamos."
    );
  }

  function buildFollowUpExpiredMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} he visto que tu acceso ya ha caducado y quería preguntarte algo antes de dejarlo aquí.\n\n` +
      "En estos días, ¿qué fue lo que más te movió o te ayudó de lo que hemos trabajado juntos?\n\n" +
      "Si notas que aún queda tema pendiente y quieres retomar, puedo proponerte tres opciones sencillas (audio puntual, pack especial o un mes de suscripción) y eliges lo que mejor encaje."
    );
  }

  function handleQuickGreeting() {
    const first = getFirstName(contactName);
    const greetingName = first ? `Hola ${first},` : "Hola,";
    const quickGreeting =
      `${greetingName} qué gusto verte por aquí.\n\n` +
      "Soy Eusebiu. Este es tu espacio privado conmigo: puedes contarme qué te trae y qué te gustaría cambiar ahora mismo en tu relación o en tu vida sexual, sin filtros.\n\n" +
      'Si quieres, dime en una frase: “Lo que más me pesa ahora es ______”.';
    fillMessage(quickGreeting);
    setShowPackSelector(false);
  }

  function handleWelcomePack() {
    const welcomePackMessage =
      "Te dejo aquí el Pack de bienvenida (9 €): primer contacto + 3 audios base personalizados para ti.\n\n" +
      "👉 [pega aquí tu enlace]\n\n" +
      "Cuando los escuches, respóndeme con una frase: “Lo que más me ha removido es ______”. Así sé por dónde seguir contigo.";
    fillMessage(welcomePackMessage);
    setShowPackSelector(true);
  }

  function handleChoosePack() {
    const choosePackMessage =
      "Te resumo rápido las opciones que tengo ahora mismo:\n\n" +
      "1️⃣ Pack bienvenida – 9 €\n" +
      "   Primer contacto + 3 audios base personalizados.\n\n" +
      "2️⃣ Suscripción mensual – 25 €/mes\n" +
      "   Chat 1:1 conmigo + contenido nuevo cada semana.\n\n" +
      "3️⃣ Pack especial pareja – 49 €\n" +
      "   Sesión intensiva + material extra para pareja.\n\n" +
      "Dime con cuál te resuena más (1, 2 o 3) y te paso el enlace directo.";
    fillMessage(choosePackMessage);
    setShowPackSelector((prev) => !prev);
  }

  function handleSubscriptionLink() {
    const subscriptionLinkMessage =
      "Aquí tienes el enlace para la suscripción mensual (25 €):\n\n" +
      "👉 [pega aquí tu enlace]\n\n" +
      "Incluye: acceso al chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vas viviendo.\n" +
      "Si tienes alguna duda antes de entrar, dímelo y lo aclaramos.";
    fillMessage(subscriptionLinkMessage);
    setShowPackSelector(false);
  }

  function fillMessageFromPackType(type: "trial" | "monthly" | "special") {
    const pack = findPackByType(type);
    if (pack) {
      fillMessage(buildPackProposalMessage(pack));
    }
  }

  type FollowUpTemplate = {
    id: string;
    label: string;
    text: string;
  };

  function getFollowUpTemplates({
    followUpTag,
    daysLeft,
    fanName,
  }: {
    followUpTag: FollowUpTag;
    daysLeft: number | null | undefined;
    fanName: string;
  }): FollowUpTemplate[] {
    const first = getFirstName(fanName);

    if (followUpTag === "trial_soon") {
      return [
        {
          id: "trial-main",
          label: "Seguimiento prueba",
          text: buildFollowUpTrialMessage(first),
        },
      ];
    }

    if (followUpTag === "monthly_soon") {
      return [
        {
          id: "monthly-main",
          label: "Seguimiento suscripción",
          text: buildFollowUpMonthlyMessage(first),
        },
      ];
    }

    if (followUpTag === "expired") {
      return [
        {
          id: "expired-main",
          label: "Seguimiento caducado",
          text: buildFollowUpExpiredMessage(first),
        },
      ];
    }

    return [];
  }

  async function fetchAccessGrants(fanId: string) {
    try {
      setAccessGrantsLoading(true);
      const res = await fetch(`/api/access/grant?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      setAccessGrants(Array.isArray(data.grants) ? data.grants : []);
    } catch (_err) {
      setAccessGrants([]);
    } finally {
      setAccessGrantsLoading(false);
    }
  }

  async function fetchFanNotes(fanId: string) {
    try {
      setNotesLoading(true);
      setNotesError("");
      const res = await fetch(`/api/fan-notes?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch (_err) {
      setNotes([]);
      setNotesError("Error cargando notas");
    } finally {
      setNotesLoading(false);
    }
  }

  async function fetchHistory(fanId: string) {
    try {
      setHistoryError("");
      const res = await fetch(`/api/access/grant?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      setAccessGrants(Array.isArray(data.grants) ? data.grants : []);
    } catch (_err) {
      setHistoryError("Error cargando historial");
    }
  }

  async function fetchRecommendedFan(rawFans?: Fan[]) {
    try {
      const fansData = rawFans
        ? rawFans
        : await (async () => {
            const res = await fetch("/api/fans");
            if (!res.ok) throw new Error("error");
            const data = await res.json();
            return Array.isArray(data.fans) ? (data.fans as Fan[]) : [];
          })();
      const mapped = mapFansForRecommendation(fansData);
      const rec = getRecommendedFan(mapped);
      setRecommendedFan(rec ?? null);
    } catch (_err) {
      setRecommendedFan(null);
    }
  }

  async function refreshFanData(fanId: string) {
    try {
      const res = await fetch("/api/fans");
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const rawFans = Array.isArray(data.fans) ? (data.fans as Fan[]) : [];
      const targetFan = rawFans.find((fan) => fan.id === fanId);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("fanDataUpdated", { detail: { fans: rawFans } }));
      }

      if (targetFan) {
        setConversation({
          ...conversation,
          id: targetFan.id,
          contactName: targetFan.name || conversation.contactName,
          membershipStatus: targetFan.membershipStatus,
          daysLeft: targetFan.daysLeft,
          lastSeen: targetFan.lastSeen || conversation.lastSeen,
          lastTime: targetFan.time || conversation.lastTime,
          image: targetFan.avatar || conversation.image,
          followUpTag: getFollowUpTag(targetFan.membershipStatus, targetFan.daysLeft),
          lastCreatorMessageAt: targetFan.lastCreatorMessageAt ?? conversation.lastCreatorMessageAt,
          notesCount: targetFan.notesCount ?? conversation.notesCount,
          nextAction: targetFan.nextAction ?? conversation.nextAction,
        });
        await fetchRecommendedFan(rawFans);
      }
    } catch (_err) {
      // silent fail; UI remains with previous data
    }
  }

  function mapApiMessagesToState(apiMessages: ApiMessage[]): ConversationMessage[] {
    return apiMessages.map((msg) => ({
      me: msg.from === "creator",
      message: msg.text,
      seen: !!msg.isLastFromCreator,
      time: msg.time,
    }));
  }

  useEffect(() => {
    if (!id) return;
    async function fetchMessages() {
      try {
        setIsLoadingMessages(true);
        setMessagesError("");
        setMessage([]);
        const res = await fetch(`/api/messages?fanId=${id}`);
        if (!res.ok) throw new Error("error");
        const data = await res.json();
        const mapped = mapApiMessagesToState(data.messages as ApiMessage[]);
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
    setShowPackSelector(false);
    setShowNotes(false);
    setShowHistory(false);
    setNotes([]);
    setNoteDraft("");
    setNotesError("");
    setNextActionDraft(conversation.nextAction || "");
    const derivedPack = derivePackFromLabel(membershipStatus || accessLabel) || "monthly";
    setSelectedPackType(derivedPack);
  }, [conversation, membershipStatus, accessLabel]);

  useEffect(() => {
    if (!id) return;
    fetchAccessGrants(id);
    fetchRecommendedFan();
  }, [id]);

  useEffect(() => {
    if (!id || !showNotes) return;
    fetchFanNotes(id);
  }, [id, showNotes]);

  useEffect(() => {
    if (!id || !showHistory) return;
    fetchHistory(id);
  }, [id, showHistory]);


  function handleSelectPack(packId: string) {
    const selectedPack = config.packs.find(pack => pack.id === packId);
    if (!selectedPack) return;

    const mappedType =
      selectedPack.name.toLowerCase().includes("bienvenida") ? "trial" :
      selectedPack.name.toLowerCase().includes("mensual") ? "monthly" :
      selectedPack.name.toLowerCase().includes("especial") ? "special" : selectedPackType;

    setSelectedPackType(mappedType as "trial" | "monthly" | "special");
    fillMessage(buildPackProposalMessage(selectedPack));
    setShowPackSelector(true);
  }

  function handleSelectPackChip(event: MouseEvent<HTMLButtonElement>, type: "trial" | "monthly" | "special") {
    event.stopPropagation();
    setSelectedPackType(type);
    setShowPackSelector(true);
    fillMessageFromPackType(type);
  }

  function changeHandler(evt: KeyboardEvent<HTMLInputElement>) {
    const { key } = evt;

    if (key === "Enter") {
      evt.preventDefault();
      handleSendMessage();
    }
  }

  async function handleSendMessage() {
    if (!id) return;
    const trimmedMessage = messageSend.trim();
    if (!trimmedMessage) return;

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, text: trimmedMessage, from: "creator" }),
      });

      if (!res.ok) {
        console.error("Error enviando mensaje");
        return;
      }

      const data = await res.json();
      const mapped = mapApiMessagesToState(data.messages as ApiMessage[]);
      setMessage(mapped);
      setMessageSend("");
    } catch (err) {
      console.error("Error enviando mensaje", err);
    }
  }

  async function handleGrant(type: "trial" | "monthly" | "special") {
    if (!id) return;

    try {
      setGrantLoadingType(type);
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, type }),
      });

      if (!res.ok) {
        console.error("Error actualizando acceso");
        alert("Error actualizando acceso");
        return;
      }

      await fetchAccessGrants(id);
      setSelectedPackType(type);
      setShowPackSelector(true);
      await refreshFanData(id);
    } catch (err) {
      console.error("Error actualizando acceso", err);
      alert("Error actualizando acceso");
    } finally {
      setGrantLoadingType(null);
    }
  }

  async function handleAddNote() {
    if (!id) return;
    const content = noteDraft.trim();
    const nextActionPayload = nextActionDraft.trim();
    try {
      // Update next action first
      const resNext = await fetch("/api/fans/next-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, nextAction: nextActionPayload || null }),
      });
      if (!resNext.ok) {
        console.error("Error guardando próxima acción");
        setNotesError("Error guardando próxima acción");
        return;
      }

      if (content) {
        const res = await fetch("/api/fan-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fanId: id, content }),
        });
        if (!res.ok) {
          console.error("Error guardando nota");
          setNotesError("Error guardando nota");
          return;
        }
        const data = await res.json();
        if (data.note) {
          setNotes((prev) => [data.note as FanNote, ...prev]);
          setNoteDraft("");
          setNotesError("");
        }
      }

      await refreshFanData(id);
    } catch (err) {
      console.error("Error guardando nota", err);
      setNotesError("Error guardando nota");
    }
  }

  function lastSeenLabel() {
    if (!lastSeen) return null;
    if (lastSeen.toLowerCase() === "en línea ahora") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-[#53bdeb]">
          <span className="w-2 h-2 rounded-full bg-[#25d366]" />
          <span>En línea ahora</span>
        </span>
      );
    }
    return <span className="text-[11px] text-slate-400">Última conexión: {lastSeen}</span>;
  }

  const selectedPackStatus = getPackStatusForType(selectedPackType);
  const effectiveDaysLeft = selectedPackStatus.daysLeft ?? daysLeft;

  const membershipDetails = packLabel
    ? `${packLabel}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : membershipStatus
    ? `${membershipStatus}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : "";

  function formatTier(tier?: "new" | "regular" | "priority") {
    if (tier === "priority") return "Alta prioridad";
    if (tier === "regular") return "Habitual";
    return "Nuevo";
  }

  const lifetimeValueDisplay = Math.round(conversation.lifetimeValue ?? 0);
  const notesCountDisplay = conversation.notesCount ?? 0;

  return (
    <div className="flex flex-col w-full h-full min-h-[60vh]">
      <header className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar width="w-10" height="h-10" image={image} />
            <div className="flex flex-col gap-1 leading-tight">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-semibold text-slate-50">{contactName}</h1>
                <span className="inline-flex items-center rounded-full bg-slate-800/80 text-[11px] text-amber-200 px-2 py-[1px]">
                  {packLabel}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    accessState === "active"
                      ? "bg-[#25d366]"
                      : accessState === "expiring"
                      ? "bg-[#f5c065]"
                      : "bg-[#7d8a93]"
                  }`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {membershipDetails && <span>{membershipDetails}</span>}
                {membershipDetails && lastSeen && <span className="w-1 h-1 rounded-full bg-slate-500" />}
                {lastSeenLabel()}
              </div>
              <div className="text-xs text-slate-400">
                <span className={conversation.customerTier === "priority" ? "text-amber-300 font-semibold" : ""}>
                  {formatTier(conversation.customerTier)}
                </span>
                {` · ${lifetimeValueDisplay} € gastados · ${notesCountDisplay} nota${notesCountDisplay === 1 ? "" : "s"}`}
              </div>
              {conversation.nextAction && (
                <div className="text-[11px] text-slate-400">
                  ⚡ Próxima acción: {conversation.nextAction}
                </div>
              )}
              <div className="text-[11px] text-slate-400">
                Último mensaje tuyo: {formatLastCreatorMessage(lastCreatorMessageAt)}
              </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleQuickGreeting}
          >
            Saludo rápido
          </button>
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleWelcomePack}
          >
            Pack bienvenida
          </button>
          <button
            type="button"
          className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleSubscriptionLink}
          >
            Enlace suscripción
          </button>
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-emerald-600 hover:border-emerald-500 hover:text-slate-50"
            onClick={handleChoosePack}
          >
            Elegir pack
          </button>
          <button
            type="button"
            className="text-xs font-medium rounded-full border border-slate-600 bg-slate-800/80 text-slate-100 px-3 py-1 transition hover:bg-slate-700"
            onClick={() => setShowNotes((prev) => !prev)}
          >
            Notas
          </button>
          <button
            type="button"
            className={`text-xs font-medium rounded-full border px-3 py-1 transition ${
              showHistory
                ? "border-amber-400 bg-amber-500/10 text-amber-100"
                : "border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
            }`}
            onClick={() => {
              setShowHistory((prev) => !prev);
              setShowNotes(false);
              if (!showHistory && id) {
                fetchHistory(id);
              }
            }}
          >
            Historial
          </button>
        </div>
        {showPackSelector && (
          <div className="flex flex-col gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3 w-full">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight transition shadow-sm",
                  selectedPackType === "trial"
                    ? "bg-amber-500 text-slate-900 border-amber-300"
                    : "bg-slate-800/80 border-slate-600 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
                )}
                onClick={(e) => handleSelectPackChip(e, "trial")}
              >
                Prueba 7 días
              </button>
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight transition shadow-sm",
                  selectedPackType === "monthly"
                    ? "bg-amber-500 text-slate-900 border-amber-300"
                    : "bg-slate-800/80 border-slate-600 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
                )}
                onClick={(e) => handleSelectPackChip(e, "monthly")}
              >
                1 mes
              </button>
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight transition shadow-sm",
                  selectedPackType === "special"
                    ? "bg-amber-500 text-slate-900 border-amber-300"
                    : "bg-slate-800/80 border-slate-600 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
                )}
                onClick={(e) => handleSelectPackChip(e, "special")}
              >
                Especial
              </button>
            </div>
            {config.packs.map((pack) => {
              const packType = pack.name.toLowerCase().includes("bienvenida")
                ? "trial"
                : pack.name.toLowerCase().includes("mensual")
                ? "monthly"
                : "special";
              const isSelected = packType === selectedPackType;
              const packStatus = getPackStatusForType(packType as "trial" | "monthly" | "special");
              return (
                <button
                  key={pack.id}
                  type="button"
                  className={clsx(
                    "text-left bg-slate-900/60 hover:bg-slate-800 text-white px-3 py-2 rounded-lg border transition",
                    isSelected ? "border-amber-400 shadow-sm" : "border-slate-700"
                  )}
                  onClick={() => handleSelectPack(pack.id)}
                >
                  <div className="flex justify-between text-sm font-medium">
                    <span>{pack.name}</span>
                    <span className="text-[#53bdeb]">{pack.price}</span>
                  </div>
                    <p className="text-[#a1b0b7] text-xs mt-1">{pack.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {packStatus.status === "active" && (
                      <span className="inline-flex items-center rounded-full border border-amber-400/80 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                        Activo{packStatus.daysLeft ? ` · ${packStatus.daysLeft} días restantes` : ""}
                      </span>
                    )}
                    {packStatus.status === "expired" && (
                      <span className="inline-flex items-center rounded-full border border-slate-500/70 bg-slate-800/50 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                        Expirado
                      </span>
                    )}
                    {packStatus.status !== "active" && (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-amber-400/90 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/15 hover:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400/60 transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGrant(packType as "trial" | "monthly" | "special");
                        }}
                        disabled={grantLoadingType === packType}
                      >
                        {grantLoadingType === packType ? "Concediendo..." : "Conceder acceso"}
                      </button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </header>
      {showNotes && (
        <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-xs text-slate-100 flex flex-col gap-3 max-h-64">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Notas internas de {contactName}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={nextActionDraft}
              onChange={(e) => setNextActionDraft(e.target.value)}
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none border border-slate-700 focus:border-amber-400"
              placeholder="Ej: Enviar audio 2 · Ofrecer Pack especial"
            />
          </div>
          <div className="flex gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={2}
              className="flex-1 resize-none rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none border border-slate-700 focus:border-amber-400"
              style={{ backgroundColor: '#0f172a' }}
              placeholder="Añade una nota para recordar detalles, límites, miedos, etc."
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={!noteDraft.trim()}
              className="self-start rounded-lg border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-500/20"
            >
              Guardar
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
              {notesLoading && <div className="text-[11px] text-slate-400">Cargando notas…</div>}
              {notesError && !notesLoading && (
                <div className="text-[11px] text-rose-300">{notesError}</div>
              )}
              {!notesLoading && notes.length === 0 && (
                <div className="text-[11px] text-slate-500">Aún no hay notas para este fan.</div>
              )}
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
                <div className="text-[10px] text-slate-500">{formatNoteDate(note.createdAt)}</div>
                <div className="text-[11px] whitespace-pre-wrap">{note.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {recommendedFan && recommendedFan.id !== id && (
        <div className="mt-2 mb-3 flex items-center justify-between rounded-xl border border-amber-500/60 bg-slate-900/70 px-3 py-2 text-xs">
          <div className="flex flex-col gap-1 truncate">
            <span className="font-semibold text-amber-300 flex items-center gap-1">
              ⚡ Siguiente recomendado
              {recommendedFan.customerTier === "priority" && (
                <span className="text-[10px] rounded-full bg-amber-500/20 px-2 text-amber-200">🔥 Alta prioridad</span>
              )}
            </span>
            <span className="truncate text-slate-200">
              {recommendedFan.contactName} ·{" "}
              {recommendedFan.customerTier === "priority"
                ? "Alta prioridad"
                : recommendedFan.customerTier === "regular"
                ? "Habitual"
                : "Nuevo"}{" "}
              · {Math.round(recommendedFan.lifetimeValue ?? 0)} € · {recommendedFan.notesCount ?? 0} nota
              {(recommendedFan.notesCount ?? 0) === 1 ? "" : "s"}
            </span>
            {recommendedFan.nextAction && (
              <span className="text-[11px] text-slate-400 truncate">Próx.: {recommendedFan.nextAction}</span>
            )}
          </div>
          <button
            type="button"
            className="ml-3 rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/20"
            onClick={() => setConversation(recommendedFan)}
          >
            Abrir chat
          </button>
        </div>
      )}
      {showHistory && (
        <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-xs text-slate-100 flex flex-col gap-3 max-h-64">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Historial de compras</span>
          </div>
          {historyError && <div className="text-[11px] text-rose-300">{historyError}</div>}
          {!historyError && accessGrants.length === 0 && (
            <div className="text-[11px] text-slate-400">Sin historial de compras todavía.</div>
          )}
          <div className="flex-1 overflow-y-auto space-y-2">
            {accessGrants.map((grant) => {
              const mapped = mapGrantType(grant.type);
              const status = getGrantStatus(grant.expiresAt);
              return (
                <div key={grant.id} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
                    <span>{formatGrantDate(grant.createdAt)}</span>
                    <span>·</span>
                    <span>{mapped.label}</span>
                    <span>·</span>
                    <span>{mapped.amount} €</span>
                    <span>·</span>
                    <span className={status === "Activo" ? "text-emerald-300" : "text-slate-400"}>{status}</span>
                  </div>
                  {grant.expiresAt && (
                    <div className="text-[10px] text-slate-400">Vence el {formatGrantDate(grant.expiresAt)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {(() => {
        const followUpTemplates = getFollowUpTemplates({
          followUpTag,
          daysLeft,
          fanName: firstName,
        });
        if (!followUpTemplates.length) return null;
        return (
          <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {followUpTag === "trial_soon" && `Seguimiento · Prueba · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                {followUpTag === "monthly_soon" && `Seguimiento · Suscripción · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                {followUpTag === "expired" && "Seguimiento · Acceso caducado"}
              </span>
              {accessGrantsLoading && <span className="text-[10px] text-slate-400">Actualizando...</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {followUpTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => fillMessage(tpl.text)}
                  className="inline-flex items-center rounded-full border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/20 transition"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      <div className="flex flex-col w-full flex-1 px-4 md:px-24 py-6 overflow-y-auto" style={{ backgroundImage: "url('/assets/images/background.jpg')" }}>
        {messages.map((messageConversation, index) => {
          const { me, message, seen, time } = messageConversation;

          return (
            <MessageBalloon key={index} me={me} message={message} seen={seen} time={time} />
          )
        })}
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
          <input
            type={"text"}
            className="bg-[#2a3942] rounded-lg w-full px-3 py-3 text-white"
            placeholder="Mensaje"
            onKeyDown={(evt) => changeHandler(evt) }
            onChange={ (evt) => setMessageSend(evt.target.value) }
            value={messageSend}
            disabled={accessState === "expired"}
          />
        </div>
        <div className="flex justify-center items-center w-[5%] h-12">
          <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-pointer" onClick={handleSendMessage}>
            <path fill="currentColor" d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2z">
            </path>
          </svg>
        </div>
      </footer>
      {accessState === "expired" && (
        <div className="px-4 md:px-6 py-2 text-xs text-[#f5c065] bg-[#2a1f16]">
          El acceso de {contactName} ha caducado. Renueva su pack para seguir respondiendo.
        </div>
      )}
    </div>
  )
}
