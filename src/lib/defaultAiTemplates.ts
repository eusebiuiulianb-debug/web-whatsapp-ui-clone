import { AiTemplateUsage, AiTurnMode } from "./aiTemplateTypes";

export type DefaultAiTemplate = {
  name: string;
  usage: AiTemplateUsage;
  tone: "cercano" | "profesional" | "jugueton" | null;
  content: string;
  isActive: boolean;
  tier?: "T0" | "T1" | "T2" | "T3" | "T4" | null;
  mode?: AiTurnMode | null;
};

export const DEFAULT_AI_TEMPLATES: DefaultAiTemplate[] = [
  // Welcome
  {
    name: "Bienvenida cálida 01",
    usage: "welcome",
    tone: "cercano",
    content: "Hola {nombre_fan} 💫\nMe alegra verte por aquí. Gracias por suscribirte.\nCuéntame qué te apetece ver primero y lo vamos acomodando a tu gusto.",
    isActive: true,
    mode: "auto",
  },
  {
    name: "Bienvenida juguetona 01",
    usage: "welcome",
    tone: "jugueton",
    content: "{nombre_fan} 😈 ya te vi entrar…\nAquí dentro subo cosas más íntimas que en ningún otro sitio.\nDime si eres más de foto, vídeo o voz y empezamos por ahí.",
    isActive: true,
    mode: "auto",
  },
  {
    name: "Bienvenida profesional 01",
    usage: "welcome",
    tone: "profesional",
    content: "Hola {nombre_fan}, gracias por suscribirte.\nCada semana subo contenido nuevo y extras personalizados.\nSi tienes alguna petición concreta, puedes escribirme por aquí.",
    isActive: true,
    mode: "auto",
  },
  {
    name: "Bienvenida + extra suave",
    usage: "welcome",
    tone: "cercano",
    content:
      "Hola {nombre_fan} 💕 bienvenido/a.\nPara empezar, tengo un extra solo para los nuevos, más íntimo que lo del muro, por {precio_extra} €.\nSi te apetece, dime “quiero” y te lo dejo listo.",
    isActive: true,
    mode: "auto",
  },

  // Warmup
  {
    name: "Warmup cercano 01",
    usage: "warmup",
    tone: "cercano",
    content: "Oye {nombre_fan}, hace rato que te veo por aquí en silencio 😊\nTengo curiosidad: ¿qué es lo que más te gusta ver o recibir por aquí?",
    isActive: true,
    mode: "auto",
  },
  {
    name: "Warmup juguetón 01",
    usage: "warmup",
    tone: "jugueton",
    content: "Me encanta la gente tímida como tú, {nombre_fan} 🙊\nSuelen ser los que luego más se lanzan…\n¿Te dejo yo la primera idea o me dices tú qué te apetece?",
    isActive: true,
    mode: "auto",
  },
  {
    name: "Warmup profesional 01",
    usage: "warmup",
    tone: "profesional",
    content: "Hola {nombre_fan}, solo paso a comprobar que todo te funciona bien.\nSi hay algo que eches de menos en el contenido o tengas en mente, puedes decírmelo sin problema.",
    isActive: true,
    mode: "auto",
  },

  // Extra quick
  {
    name: "Extra rápido caliente 01",
    usage: "extra_quick",
    tone: "jugueton",
    content:
      "{nombre_fan} 😏 tengo una foto extra algo más íntima que las del muro, solo para ti, por {precio_extra} €.\nSi te encaja, dime “quiero” y te explico cómo desbloquearla.",
    isActive: true,
    tier: "T2",
    mode: "push_pack",
  },
  {
    name: "Extra rápido reacción 01",
    usage: "extra_quick",
    tone: "cercano",
    content:
      "Vale, ahora me has dejado con la cabeza dando vueltas…\nTengo un {nombre_extra} que encaja perfecto con lo que acabas de decir.\nLo dejo en {precio_extra} € solo para ti. ¿Te lo mando?",
    isActive: true,
    tier: "T1",
    mode: "auto",
  },
  {
    name: "Extra rápido profesional 01",
    usage: "extra_quick",
    tone: "profesional",
    content:
      "Si te apetece algo más personal, tengo preparado un extra de hoy por {precio_extra} €.\nEs contenido que no publico en ningún otro sitio.\nSi lo quieres, dime y te paso los detalles.",
    isActive: true,
    tier: "T1",
    mode: "auto",
  },
  {
    name: "Bienvenida cálida + extra suave",
    usage: "extra_quick",
    tone: "cercano",
    content:
      "Hola {nombre_fan} 💫\nMe alegra verte por aquí.\nPara empezar fuerte tengo una foto extra solo para los nuevos, más íntima que las del muro, por {precio_extra} €.\n¿Te la envío ahora mismo?",
    isActive: true,
    tier: "T0",
    mode: "auto",
  },
  {
    name: "Bienvenida juguetona + extra",
    usage: "extra_quick",
    tone: "jugueton",
    content:
      "{nombre_fan} 😈 ya te vi entrar…\nTengo un {nombre_extra} que solo mando a los que se atreven el primer día, por {precio_extra} €.\nSi me dices \"quiero\", te lo dejo listo para desbloquear.",
    isActive: true,
    tier: "T1",
    mode: "auto",
  },
  {
    name: "Bienvenida profesional + extra",
    usage: "extra_quick",
    tone: "profesional",
    content:
      "Hola {nombre_fan}, gracias por suscribirte 🖤\nTengo un extra de bienvenida preparado: {nombre_extra} por {precio_extra} €.\nEs contenido que no publico en ningún otro sitio.\nSi te interesa, dime \"sí\" y te lo envío como PPV.",
    isActive: true,
    tier: "T1",
    mode: "auto",
  },
  {
    name: "Chat caliente – cercano",
    usage: "extra_quick",
    tone: "cercano",
    content:
      "Me encanta cómo hablas de esto, {nombre_fan} 🙈\nJusto tengo un extra donde se ve mucho más ese lado, por {precio_extra} €.\n¿Te lo ofrezco ahora y te lo dejo para desbloquear cuando quieras?",
    isActive: true,
    tier: "T2",
    mode: "push_pack",
  },
  {
    name: "Chat caliente – juguetón",
    usage: "extra_quick",
    tone: "jugueton",
    content:
      "Vale, ahora me has dejado con la cabeza dando vueltas 😏\nTengo un {nombre_extra} que encaja PERFECTO con lo que acabas de decir.\nLo dejo a {precio_extra} € solo para ti. ¿Te lo mando?",
    isActive: true,
    tier: "T2",
    mode: "push_pack",
  },
  {
    name: "Chat caliente – profesional",
    usage: "extra_quick",
    tone: "profesional",
    content:
      "{nombre_fan}, como sé que te gustan los extras cuidados, acabo de preparar un {nombre_extra} específico para ti.\nPrecio: {precio_extra} €.\nSi te cuadra, te lo envío ahora mismo como PPV y lo tienes al instante.",
    isActive: true,
    tier: "T2",
    mode: "push_pack",
  },
  {
    name: "Recordatorio suave – cercano",
    usage: "extra_quick",
    tone: "cercano",
    content:
      "Oye {nombre_fan}, antes de que cierre por hoy:\nSigo dejando disponible el {nombre_extra} de antes por {precio_extra} €.\nSi te apetece terminar el día con algo más íntimo, te lo dejo listo y tú decides cuándo desbloquearlo 💫",
    isActive: true,
    tier: "T1",
    mode: "push_pack",
  },
  {
    name: "Última llamada traviesa",
    usage: "extra_quick",
    tone: "jugueton",
    content:
      "Último aviso travieso del día 😇\nEl {nombre_extra} sigue a {precio_extra} € y luego lo voy a subir.\n¿Lo pillas ahora o te espero para el siguiente?",
    isActive: true,
    tier: "T2",
    mode: "push_pack",
  },
  {
    name: "Recordatorio profesional",
    usage: "extra_quick",
    tone: "profesional",
    content:
      "Te recuerdo que aún tienes disponible el {nombre_extra} por {precio_extra} €.\nSi no te encaja, dime qué tipo de contenido prefieres y te propongo otra cosa antes de archivarlo.",
    isActive: true,
    tier: "T1",
    mode: "push_pack",
  },
  {
    name: "Reenganche suave – cercano",
    usage: "extra_quick",
    tone: "cercano",
    content:
      "Hola {nombre_fan}, hace tiempo que no hablamos y me acordé de ti hoy.\nHe preparado un {nombre_extra} nuevo que creo que te puede encajar, por {precio_extra} €.\n¿Quieres que te lo envíe y nos ponemos al día un poco?",
    isActive: true,
    tier: "T1",
    mode: "auto",
  },

  // Pack offer
  {
    name: "Pack especial + resumen",
    usage: "pack_offer",
    tone: "cercano",
    content:
      "Veo que estás pidiendo entrar ya en el terreno del pack especial 😏\nHe preparado {nombre_pack}, con varias fotos/vídeos más intensos que lo del muro.\nEstá a {precio_pack} € solo para los que ya estáis suscritos. ¿Te paso el enlace?",
    isActive: true,
    tier: "T3",
    mode: "push_pack",
  },
  {
    name: "Pack escalón siguiente",
    usage: "pack_offer",
    tone: "jugueton",
    content:
      "{nombre_fan}, tú ya no estás en “modo básico” 😂\nTengo un pack armado para subir un nivel: {nombre_pack}.\nSi te animas, te lo dejo en {precio_pack} € hoy y lo dejamos desbloqueado.",
    isActive: true,
    tier: "T3",
    mode: "push_pack",
  },
  {
    name: "Pack especial profesional",
    usage: "pack_offer",
    tone: "profesional",
    content:
      "Para los que queréis más material junto, tengo el pack {nombre_pack}.\nIncluye varios contenidos agrupados y está a {precio_pack} €.\nSi te interesa, te envío el enlace directo para comprarlo.",
    isActive: true,
    tier: "T4",
    mode: "push_pack",
  },

  // Renewal
  {
    name: "Renovación cercana 01",
    usage: "renewal",
    tone: "cercano",
    content:
      "Hola {nombre_fan}, tu suscripción se renueva en {dias_restantes} días.\nSi quieres seguir, no tienes que hacer nada, se renueva sola 😊\nSi hay algo que quieras cambiar (más fotos, más vídeos, otro enfoque), dime y lo ajustamos.",
    isActive: true,
    mode: "vip_focus",
  },
  {
    name: "Renovación juguetona 01",
    usage: "renewal",
    tone: "jugueton",
    content:
      "Oye {nombre_fan}, tu suscripción está a puntito de renovarse 👀\nSi te quedas, esta semana preparo algo especial solo para los que siguen dentro.\n¿Te apetece que cuente contigo?",
    isActive: true,
    mode: "vip_focus",
  },
  {
    name: "Renovación profesional 01",
    usage: "renewal",
    tone: "profesional",
    content:
      "Te recuerdo que tu suscripción se renueva en {dias_restantes} días.\nSi no quieres renovarla, revisa antes los ajustes de tu cuenta.\nSi sigues, yo encantada/o de que te quedes; cualquier duda me la puedes escribir por aquí.",
    isActive: true,
    mode: "vip_focus",
  },

  // Reactivation
  {
    name: "Reactivación te echo de menos",
    usage: "reactivation",
    tone: "cercano",
    content:
      "Echo de menos verte por aquí, {nombre_fan} 💭\nEsta semana estoy preparando contenido nuevo y me gustaría que lo vieras.\nSi te apetece volver, tengo un detalle de bienvenida de vuelta con {descuento}% para ti.",
    isActive: true,
    mode: "auto",
  },
  {
    name: "Reactivación juguetona",
    usage: "reactivation",
    tone: "jugueton",
    content:
      "¿Es cosa mía o te has perdido un poco, {nombre_fan}? 😜\nTengo varias cosillas nuevas desde la última vez que pasaste.\nSi quieres, te cuento qué ha cambiado y te mando una idea para tu vuelta.",
    isActive: true,
    mode: "auto",
  },
  {
    name: "Reactivación profesional",
    usage: "reactivation",
    tone: "profesional",
    content:
      "Hace tiempo que no te veo activo por aquí, {nombre_fan}.\nSi dejaste la suscripción por algo concreto, me ayuda saberlo para mejorar.\nY si estás pensando en volver, dime qué tipo de contenido te sería más útil ahora.",
    isActive: true,
    mode: "auto",
  },

  // Boundaries
  {
    name: "Límites claros cercano",
    usage: "boundaries",
    tone: "cercano",
    content:
      "Te leo, {nombre_fan}, y por confianza prefiero dejar algo claro 🤍\nEl contenido personalizado (fotos o vídeos hechos a medida) siempre es de pago.\nNo envío nada gratis ni por fuera de la plataforma; así cuidamos los límites y la seguridad de los dos.",
    isActive: true,
    mode: "vip_focus",
  },
  {
    name: "Límites profesionales",
    usage: "boundaries",
    tone: "profesional",
    content:
      "Para que no haya malentendidos, {nombre_fan}:\n— El contenido personalizado va siempre por extra o pack.\n— No comparto contenido fuera de la plataforma ni por otros canales.\nSi quieres algo a medida, dime qué tienes en mente y te digo si puedo hacerlo y el precio.",
    isActive: true,
    mode: "vip_focus",
  },

  // Support
  {
    name: "Soporte problema técnico",
    usage: "support",
    tone: "profesional",
    content:
      "Si algo no te funciona (pago, enlace, vídeo que no carga), dime exactamente qué te sale en pantalla y si estás en móvil o PC.\nIntento ayudarte desde aquí y, si hace falta, lo reporto al soporte de la plataforma.",
    isActive: true,
    mode: "vip_focus",
  },
  {
    name: "Soporte confirmación de envío",
    usage: "support",
    tone: "profesional",
    content:
      "He enviado ya el contenido/pack.\nSi no lo ves, prueba a cerrar y abrir la app o actualizar la página.\nSi aún así no aparece, avísame y lo revisamos juntos.",
    isActive: true,
    mode: "vip_focus",
  },
];
