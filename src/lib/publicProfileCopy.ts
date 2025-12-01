import { PublicProfileCopy, PublicProfileMode } from "../types/publicProfile";

type CreatorCopy = {
  hero: {
    title: string;
    subtitle: string;
    paragraph?: string;
    chips: string[];
  };
  packs: {
    welcome: { badge: string; description: string[]; cta: string };
    monthly: { badge: string; description: string[]; cta: string };
    special: { badge: string; description: string[]; cta: string };
  };
  freebies: { items: { title: string; description: string; cta: string }[] };
  faq: { items: { question: string; answer: string }[] };
};

export const PROFILE_COPY: Record<PublicProfileMode, CreatorCopy> = {
  coach: {
    hero: {
      title: "Creador",
      subtitle: "Para parejas que se quieren, pero ya no se tocan igual.",
      paragraph:
        "Te acompaño a reactivar el deseo, salir de la rutina y volver a miraros con ganas.\nTrabajo con audios, escenas guiadas y chat 1:1 para que volváis a sentir química… sin terapias eternas.",
      chips: ["Parejas · Online", "No es terapia clásica", "Confidencialidad total"],
    },
    packs: {
      welcome: { badge: "Primera vez", description: ["Primer contacto", "3 audios base personalizados."], cta: "Elegir este pack" },
      monthly: { badge: "Recomendado", description: ["Acceso al chat 1:1", "Contenido nuevo cada semana."], cta: "Elegir este pack" },
      special: { badge: "Intensivo", description: ["Sesión intensiva", "Material extra para pareja."], cta: "Elegir este pack" },
    },
    freebies: {
      items: [
        { title: "Mini audio gratis: 3 ideas para reactivar el deseo", description: "Lo escucháis en 10 minutos y veis si mi forma de trabajar encaja con vosotros.", cta: "Escuchar ahora" },
        { title: "Guía rápida: 5 cosas que enfrían la relación", description: "Un PDF corto para leer juntos y detectar qué os está apagando sin daros cuenta.", cta: "Descargar" },
        { title: "Clips recientes en redes", description: "Pequeñas píldoras de contenido para ver mi estilo antes de entrar al chat privado.", cta: "Ver clips" },
      ],
    },
    faq: {
      items: [
        { question: "¿Esto es terapia?", answer: "No. Aquí no hay diván ni diagnósticos. Hay chat directo y audios que vais a usar en la vida real." },
        { question: "¿Tenemos que contar toda nuestra vida?", answer: "No. Solo lo justo para que esta semana hagáis algo diferente en la cama y fuera de ella." },
        { question: "¿Y si mi pareja pasa del tema?", answer: "Puedes empezar tú. No necesitas permiso para cuidar tu deseo. Muchas veces uno arranca y el otro se contagia." },
        { question: "¿Y si tiramos el dinero?", answer: "Por eso existe el Pack bienvenida. Lo probáis una vez, sin permanencias. Si no sentís cambio, no seguís y listo." },
      ],
    },
  },
  fanclub: {
    hero: {
      title: "Creador",
      subtitle: "Contenido exclusivo, stories privadas y chat 1:1 en un solo lugar.",
      paragraph:
        "Aquí no hay algoritmos ni feeds infinitos. Solo tú, yo y un chat privado donde puedo cuidarte mejor que en cualquier red social.",
      chips: ["Contenido exclusivo", "Chat 1:1", "Comunidad adulta"],
    },
    packs: {
      welcome: {
        badge: "Primera vez",
        description: [
          "Mensaje de bienvenida personalizado.",
          "Algunas publicaciones privadas para empezar a conocernos.",
        ],
        cta: "Elegir este pack",
      },
      monthly: {
        badge: "Recomendado",
        description: [
          "Acceso a todo mi contenido exclusivo del mes.",
          "Chat 1:1 conmigo mientras dure la suscripción.",
        ],
        cta: "Elegir este pack",
      },
      special: {
        badge: "VIP",
        description: [
          "Día con prioridad total en el chat (leo y respondo tus mensajes primero).",
          "Contenido extra pensado solo para ti.",
        ],
        cta: "Elegir este pack",
      },
    },
    freebies: {
      items: [
        {
          title: "Mini feed público",
          description: "Algunas publicaciones abiertas para que veas mi estilo y mi energía.",
          cta: "Ver feed",
        },
        {
          title: "Carta para nuevos fans",
          description: "Una carta donde te explico cómo uso el chat y qué puedes esperar de mí aquí dentro.",
          cta: "Leer carta",
        },
        {
          title: "Clips recientes",
          description: "Pequeños clips de redes para que me pongas cara y voz antes de entrar al privado.",
          cta: "Ver clips",
        },
      ],
    },
    faq: {
      items: [
        { question: "¿Esto es lo mismo que mi página de Only/Fansly?", answer: "No. Aquí el foco es el chat 1:1 y unos pocos packs claros. No hay un feed infinito ni mil niveles distintos. Entras, eliges cómo quieres estar conmigo y hablamos en privado." },
        { question: "¿El chat es realmente privado?", answer: "Sí. Tus mensajes y los míos solo los vemos tú y yo dentro de NOVSY. Nada de comentarios públicos ni capturas de pantalla en la plataforma." },
        { question: "¿La suscripción se renueva sola?", answer: "Depende del pack que elijas, pero siempre verás cuántos días de acceso te quedan. Antes de que termine podrás decidir si sigues, cambias de pack o paras." },
        { question: "¿Puedo cancelar o cambiar de pack?", answer: "Sí. Si ves que otro pack encaja mejor contigo, podemos cambiarlo para el siguiente periodo. Aquí no vas a quedar atrapado en suscripciones raras." },
      ],
    },
  },
};

export function mapToPublicProfileCopy(
  copy: CreatorCopy,
  mode: PublicProfileMode,
  config: { packs: Array<{ id: string; name: string; price: string }> }
): PublicProfileCopy {
  const getPackData = (id: "welcome" | "monthly" | "special") => {
    const fallback = config.packs.find((p) => p.id === id) || config.packs[0];
    const packCopy = (copy.packs as any)[id] as { badge?: string; description?: string[]; cta?: string } | undefined;
    return {
      id,
      title: fallback?.name || id,
      badge: packCopy?.badge || "",
      price: fallback?.price || "",
      bullets: (packCopy?.description || []).slice(0, 3),
      ctaLabel: packCopy?.cta || "Elegir este pack",
    };
  };

  return {
    mode,
    hero: {
      tagline: copy.hero.subtitle,
      description: copy.hero.paragraph || "",
      chips: copy.hero.chips || [],
    },
    recommendedPackId: "monthly",
    packs: [getPackData("welcome"), getPackData("monthly"), getPackData("special")],
    freebies: copy.freebies.items.map((item, idx) => ({
      id: `freebie-${idx}`,
      title: item.title,
      description: item.description,
      ctaLabel: item.cta,
    })),
    faq: copy.faq.items.map((item, idx) => ({ id: `faq-${idx}`, question: item.question, answer: item.answer })),
  };
}
