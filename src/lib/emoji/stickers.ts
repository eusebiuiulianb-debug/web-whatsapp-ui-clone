export const STICKER_PACKS = [
  { id: "flirt_v1", label: "Flirt (v1)", order: 1 },
  { id: "elegant_v2", label: "Elegante (v2)", order: 2 },
] as const;

export type StickerPack = (typeof STICKER_PACKS)[number];
export type StickerPackId = StickerPack["id"];
export type StickerIntent = "mirada" | "cita" | "cierre";
export type StickerKind = "text" | "icon";

export type StickerItem = {
  id: string;
  packId: StickerPackId;
  label: string;
  file: string;
  kind: StickerKind;
  intent: StickerIntent;
  tags: string[];
};

type StickerItemInput = Omit<StickerItem, "packId" | "intent" | "tags"> &
  Partial<Pick<StickerItem, "packId" | "intent" | "tags">>;

const DEFAULT_PACK_ID: StickerPackId = "flirt_v1";
const DEFAULT_INTENT: StickerIntent = "mirada";

const RAW_STICKERS: StickerItemInput[] = [
  // -------------------------
  // FLIRT (v1) — 30
  // -------------------------
  { id:"f1_mirada_01", packId:"flirt_v1", label:"Te vi.", file:"/stickers/flirt/f1_mirada_01.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_02", packId:"flirt_v1", label:"Me quedé mirándote.", file:"/stickers/flirt/f1_mirada_02.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_03", packId:"flirt_v1", label:"Esa sonrisa…", file:"/stickers/flirt/f1_mirada_03.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_04", packId:"flirt_v1", label:"No sé qué tienes.", file:"/stickers/flirt/f1_mirada_04.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_05", packId:"flirt_v1", label:"Ojos peligrosos.", file:"/stickers/flirt/f1_mirada_05.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_06", packId:"flirt_v1", label:"Qué bien te queda eso.", file:"/stickers/flirt/f1_mirada_06.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_07", packId:"flirt_v1", label:"Hoy estás… distinta.", file:"/stickers/flirt/f1_mirada_07.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_08", packId:"flirt_v1", label:"No me distraigas así.", file:"/stickers/flirt/f1_mirada_08.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_09", packId:"flirt_v1", label:"Me gusta tu vibra.", file:"/stickers/flirt/f1_mirada_09.svg", kind:"text", intent:"mirada" },
  { id:"f1_mirada_10", packId:"flirt_v1", label:"Te queda la noche.", file:"/stickers/flirt/f1_mirada_10.svg", kind:"text", intent:"mirada" },

  { id:"f1_cita_01", packId:"flirt_v1", label:"Te robo 10 min.", file:"/stickers/flirt/f1_cita_01.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_02", packId:"flirt_v1", label:"¿Un café y me cuentas?", file:"/stickers/flirt/f1_cita_02.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_03", packId:"flirt_v1", label:"Dame una excusa.", file:"/stickers/flirt/f1_cita_03.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_04", packId:"flirt_v1", label:"¿Te escapas un rato?", file:"/stickers/flirt/f1_cita_04.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_05", packId:"flirt_v1", label:"Hoy: plan secreto.", file:"/stickers/flirt/f1_cita_05.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_06", packId:"flirt_v1", label:"Pásame tu hora libre.", file:"/stickers/flirt/f1_cita_06.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_07", packId:"flirt_v1", label:"Elige: dulce o travieso.", file:"/stickers/flirt/f1_cita_07.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_08", packId:"flirt_v1", label:"¿Hablamos en privado?", file:"/stickers/flirt/f1_cita_08.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_09", packId:"flirt_v1", label:"Te dejo elegir el ritmo.", file:"/stickers/flirt/f1_cita_09.svg", kind:"text", intent:"cita" },
  { id:"f1_cita_10", packId:"flirt_v1", label:"Te sigo… si tú guías.", file:"/stickers/flirt/f1_cita_10.svg", kind:"text", intent:"cita" },

  { id:"f1_cierre_01", packId:"flirt_v1", label:"No me olvides.", file:"/stickers/flirt/f1_cierre_01.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_02", packId:"flirt_v1", label:"Te guardo.", file:"/stickers/flirt/f1_cierre_02.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_03", packId:"flirt_v1", label:"Luego seguimos.", file:"/stickers/flirt/f1_cierre_03.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_04", packId:"flirt_v1", label:"Me quedo cerquita.", file:"/stickers/flirt/f1_cierre_04.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_05", packId:"flirt_v1", label:"Cuando quieras, vuelvo.", file:"/stickers/flirt/f1_cierre_05.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_06", packId:"flirt_v1", label:"Te dejo con ganas.", file:"/stickers/flirt/f1_cierre_06.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_07", packId:"flirt_v1", label:"Cierra bonito.", file:"/stickers/flirt/f1_cierre_07.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_08", packId:"flirt_v1", label:"Pausa… pero no final.", file:"/stickers/flirt/f1_cierre_08.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_09", packId:"flirt_v1", label:"Me avisas y sigo.", file:"/stickers/flirt/f1_cierre_09.svg", kind:"text", intent:"cierre" },
  { id:"f1_cierre_10", packId:"flirt_v1", label:"Hasta pronto.", file:"/stickers/flirt/f1_cierre_10.svg", kind:"text", intent:"cierre" },

  // -------------------------
  // ELEGANTE (v2) — 30
  // -------------------------
  { id:"e2_mirada_01", packId:"elegant_v2", label:"Te miro y se nota.", file:"/stickers/elegante/e2_mirada_01.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_02", packId:"elegant_v2", label:"Qué calma contigo.", file:"/stickers/elegante/e2_mirada_02.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_03", packId:"elegant_v2", label:"Esa presencia tuya…", file:"/stickers/elegante/e2_mirada_03.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_04", packId:"elegant_v2", label:"Hoy te ves impecable.", file:"/stickers/elegante/e2_mirada_04.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_05", packId:"elegant_v2", label:"Me gustas sin prisa.", file:"/stickers/elegante/e2_mirada_05.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_06", packId:"elegant_v2", label:"Qué bien sostienes la mirada.", file:"/stickers/elegante/e2_mirada_06.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_07", packId:"elegant_v2", label:"Hay algo fino en ti.", file:"/stickers/elegante/e2_mirada_07.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_08", packId:"elegant_v2", label:"Tu energía llena la sala.", file:"/stickers/elegante/e2_mirada_08.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_09", packId:"elegant_v2", label:"Me intrigas.", file:"/stickers/elegante/e2_mirada_09.svg", kind:"text", intent:"mirada" },
  { id:"e2_mirada_10", packId:"elegant_v2", label:"Qué gusto verte aquí.", file:"/stickers/elegante/e2_mirada_10.svg", kind:"text", intent:"mirada" },

  { id:"e2_cita_01", packId:"elegant_v2", label:"¿Te apetece un plan suave?", file:"/stickers/elegante/e2_cita_01.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_02", packId:"elegant_v2", label:"Te propongo algo sencillo.", file:"/stickers/elegante/e2_cita_02.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_03", packId:"elegant_v2", label:"Ven, lo hacemos fácil.", file:"/stickers/elegante/e2_cita_03.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_04", packId:"elegant_v2", label:"¿Tienes 5 minutos para mí?", file:"/stickers/elegante/e2_cita_04.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_05", packId:"elegant_v2", label:"Elige el tono y lo preparo.", file:"/stickers/elegante/e2_cita_05.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_06", packId:"elegant_v2", label:"Te acompaño paso a paso.", file:"/stickers/elegante/e2_cita_06.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_07", packId:"elegant_v2", label:"Dime qué buscas hoy.", file:"/stickers/elegante/e2_cita_07.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_08", packId:"elegant_v2", label:"¿Te apetece algo más íntimo?", file:"/stickers/elegante/e2_cita_08.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_09", packId:"elegant_v2", label:"Lo hacemos a tu ritmo.", file:"/stickers/elegante/e2_cita_09.svg", kind:"text", intent:"cita" },
  { id:"e2_cita_10", packId:"elegant_v2", label:"Te cuido el ambiente.", file:"/stickers/elegante/e2_cita_10.svg", kind:"text", intent:"cita" },

  { id:"e2_cierre_01", packId:"elegant_v2", label:"Gracias por estar.", file:"/stickers/elegante/e2_cierre_01.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_02", packId:"elegant_v2", label:"Lo dejamos suave por hoy.", file:"/stickers/elegante/e2_cierre_02.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_03", packId:"elegant_v2", label:"Aquí sigo.", file:"/stickers/elegante/e2_cierre_03.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_04", packId:"elegant_v2", label:"Cuando quieras, retomamos.", file:"/stickers/elegante/e2_cierre_04.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_05", packId:"elegant_v2", label:"Descansa. Yo me quedo.", file:"/stickers/elegante/e2_cierre_05.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_06", packId:"elegant_v2", label:"Te espero sin presión.", file:"/stickers/elegante/e2_cierre_06.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_07", packId:"elegant_v2", label:"Cierro contigo.", file:"/stickers/elegante/e2_cierre_07.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_08", packId:"elegant_v2", label:"Me encantó este momento.", file:"/stickers/elegante/e2_cierre_08.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_09", packId:"elegant_v2", label:"Hasta luego.", file:"/stickers/elegante/e2_cierre_09.svg", kind:"text", intent:"cierre" },
  { id:"e2_cierre_10", packId:"elegant_v2", label:"Buenas noches.", file:"/stickers/elegante/e2_cierre_10.svg", kind:"text", intent:"cierre" },
];

export const STICKERS: StickerItem[] = RAW_STICKERS.map((item) => ({
  ...item,
  packId: item.packId ?? DEFAULT_PACK_ID,
  intent: item.intent ?? DEFAULT_INTENT,
  tags: item.tags ?? [],
}));

const STICKER_LOOKUP = new Map(STICKERS.map((item) => [item.id, item]));

export function getStickerById(id?: string | null): StickerItem | null {
  if (!id) return null;
  return STICKER_LOOKUP.get(id) ?? null;
}
