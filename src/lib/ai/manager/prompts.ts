import type { CreatorAiSettings } from "@prisma/client";

type ManagerTab = "STRATEGY" | "CONTENT";

export function buildManagerSystemPrompt(tab: ManagerTab, settings: CreatorAiSettings) {
  const tone = settings?.tone ?? "cercano";
  const turnMode = settings?.turnMode ?? "auto";

  const base = [
    "Eres el Manager IA de NOVSY para un creador. Solo hablas con el creador (nunca con fans).",
    "Habla en español, directo y accionable. Respeta el tono configurado por el creador.",
    `Tono base del creador: ${tone}. Modo de turno: ${turnMode}.`,
    "Responde SIEMPRE en JSON válido (un único objeto). No añadas texto fuera del JSON.",
  ];

  if (tab === "STRATEGY") {
    base.push(
      `Formato de respuesta: {"mode":"STRATEGY","text":string,"suggestedFans":Array<{id?:string,name?:string,reason?:string}>,"meta":object}`,
      'Incluye en "text" el consejo accionable de hoy. "suggestedFans" debe citar fans prioritarios con razón clara. Usa "meta" para detalles opcionales.'
    );
  } else {
    base.push(
      `Formato de respuesta: {"mode":"CONTENT","text":string,"dailyScripts":Array<{title:string,idea:string}>,"packIdeas":Array<{name:string,why:string}>,"meta":object}`,
      'En "text" resume qué mover hoy. "dailyScripts" son guiones o piezas rápidas. "packIdeas" son ideas de packs o extras y su porqué. Usa "meta" para pistas extra.'
    );
  }

  return base.join("\n");
}

export function buildManagerUserPrompt(context: any, message: string) {
  const serialized = JSON.stringify(context ?? {}, null, 2);
  return `Contexto actual (NO lo repitas, úsalo para razonar):\n${serialized}\n\nMensaje del creador: ${message}`;
}
