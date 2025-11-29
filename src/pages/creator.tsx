import Head from "next/head";
import Link from "next/link";
import { useCreatorConfig } from "../context/CreatorConfigContext";

const previewResourcesByMode = {
  coach: [
    {
      icon: "🎧",
      title: "Mini audio gratis: 3 ideas para reactivar el deseo",
      description:
        "Lo escucháis en 10 minutos y veis si mi forma de trabajar encaja con vosotros.",
      ctaLabel: "Escuchar ahora",
      href: "#",
    },
    {
      icon: "📄",
      title: "Guía rápida: 5 cosas que enfrían la relación",
      description:
        "Un PDF corto para leer juntos y detectar qué os está apagando sin daros cuenta.",
      ctaLabel: "Descargar",
      href: "#",
    },
    {
      icon: "🎥",
      title: "Clips recientes en redes",
      description:
        "Pequeñas píldoras de contenido para ver mi estilo antes de entrar al chat privado.",
      ctaLabel: "Ver clips",
      href: "#",
    },
  ],
  adult: [
    {
      icon: "🎧",
      title: "Preview de galería (tapada)",
      description: "Un vistazo suave a algunas fotos, con partes ocultas.",
      ctaLabel: "Ver preview",
      href: "#",
    },
    {
      icon: "📄",
      title: "Preguntas frecuentes",
      description: "Cómo funciona la suscripción, privacidad y pagos.",
      ctaLabel: "Ver FAQ",
      href: "#",
    },
    {
      icon: "🎥",
      title: "Clips públicos en redes",
      description: "Algunos clips abiertos para que veas mi estilo.",
      ctaLabel: "Ver clips",
      href: "#",
    },
  ],
};

function getPackBadgeLabel(packName: string) {
  const normalized = packName.toLowerCase();

  if (normalized.includes("bienvenida")) return "Para empezar";
  if (normalized.includes("mensual")) return "Más elegido";
  if (normalized.includes("especial") || normalized.includes("pareja")) return "Intensivo";

  return null;
}

function getPackDisplay(
  pack: { name: string; description: string; price: string; id: string; duration?: string },
  index: number,
  profileMode: "coach" | "adult"
) {
  const duration = (pack as { duration?: string }).duration;

  if (profileMode === "adult") {
    const adultTitles = ["Acceso 7 días", "Membresía mensual", "Acceso VIP"];
    const adultDescriptions = [
      "Prueba el contenido completo durante una semana.",
      "Fotos y vídeos nuevos cada semana + chat 1:1.",
      "Contenido más atrevido y prioridad en mensajes.",
    ];
    const adultBadges = ["Para probar", "Más elegido", "EXTRA"];

    return {
      title: adultTitles[index] || pack.name,
      description: adultDescriptions[index] || pack.description,
      badgeLabel: adultBadges[index] || null,
      price: pack.price,
      duration,
    };
  }

  const coachTitles = ["Pack bienvenida", "Pack mensual", "Pack especial pareja"];
  const coachDescriptions = [
    "Primera toma de contacto para vosotros dos. 1 mini evaluación + audios base y una escena sencilla para romper la rutina esta semana.",
    "Chat 1:1 conmigo durante el mes y ejercicios cortos para ir probando cosas nuevas en la cama y en el día a día. Ideal si queréis un acompañamiento real, pero sin sesiones infinitas.",
    "Un mes centrado en un tema que os duele: deseo bajo, celos, bloqueo con el cuerpo… Incluye escenas guiadas más profundas y seguimiento cercano para que no se quede en “un intento más”.",
  ];
  const coachBadges = ["Para empezar", "Más elegido", "Intensivo"];

  return {
    title: coachTitles[index] || pack.name,
    description: coachDescriptions[index] || pack.description,
    badgeLabel: coachBadges[index] || getPackBadgeLabel(pack.name),
    price: pack.price,
    duration,
  };
}

const coachBullets = [
  "🔹 Menos tensión, más juego.",
  "🔹 Ideas concretas para esta semana, no teoría.",
  "🔹 Todo por chat y audios privados, sin exponeros.",
];

const faqItems = [
  {
    question: "¿Esto es terapia?",
    answer:
      "No. Aquí no hay diván ni diagnósticos. Hay chat directo y audios que vais a usar en la vida real.",
  },
  {
    question: "¿Tenemos que contar toda nuestra vida?",
    answer:
      "No. Solo lo justo para que esta semana hagáis algo diferente en la cama y fuera de ella.",
  },
  {
    question: "¿Y si mi pareja pasa del tema?",
    answer:
      "Puedes empezar tú. No necesitas permiso para cuidar tu deseo. Muchas veces uno arranca y el otro se contagia.",
  },
  {
    question: "¿Y si tiramos el dinero?",
    answer:
      "Por eso existe el Pack bienvenida. Lo probáis una vez, sin permanencias. Si no sentís cambio, no seguís y listo.",
  },
];

export default function CreatorPage() {
  // profileMode: 'coach' para terapeutas/creadores educativos, 'adult' para creadores +18 (solo texto demo).
  const profileMode: "coach" | "adult" = "coach";
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const coachSubtitle = "Para parejas que se quieren, pero ya no se tocan igual.";
  const subtitle = profileMode === "adult" ? "18+ · Contenido exclusivo · Chat 1:1" : coachSubtitle;
  const coachDescription =
    "Te acompaño a reactivar el deseo, salir de la rutina y volver a miraros con ganas.\nTrabajo con audios, escenas guiadas y chat 1:1 para que volváis a sentir química… sin terapias eternas.";
  const adultDescription =
    "Aquí comparto contenido exclusivo, fotos y vídeos privados y respondo tus mensajes 1:1. Únete para ver mis publicaciones completas y tener acceso directo al chat.";
  const description = profileMode === "adult" ? adultDescription : coachDescription;
  const statsLine = "245 fotos · 63 vídeos · 3 lives al mes";
  const previewResources = previewResourcesByMode[profileMode];
  const primaryCtaLabel = profileMode === "adult" ? "Ver contenido exclusivo" : "Entrar al chat privado";
  const secondaryCtaLabel =
    profileMode === "adult" ? "Entrar al chat privado" : "Seguir gratis";

  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>NOVSY – Perfil público</title>
      </Head>
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-8 md:gap-10">
        <header className="rounded-xl bg-slate-900/70 border border-slate-800 p-6 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4 md:gap-5 w-full">
            <div className="flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-[#2a3942] text-white text-3xl font-semibold">
              {creatorInitial}
            </div>
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-semibold leading-tight">
                  {config.creatorName} · Creador
                </h1>
                <p className="text-sm text-slate-300">{subtitle}</p>
              </div>
              <p className="text-[#cfd6db] text-base leading-relaxed whitespace-pre-line">
                {description}
              </p>
              {profileMode === "coach" && (
                <ul className="text-sm text-slate-200 space-y-1">
                  {coachBullets.map(point => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}
              {profileMode === "adult" && (
                <p className="text-xs text-slate-400">{statsLine}</p>
              )}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors"
                >
                  {primaryCtaLabel}
                </Link>
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center px-4 py-2 rounded-lg border border-amber-400 text-amber-300 bg-transparent hover:bg-amber-400/10 font-semibold transition-colors"
                >
                  {secondaryCtaLabel}
                </Link>
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">Packs disponibles</h2>
          <div className="flex flex-col gap-3">
            {config.packs.map((pack, index) => {
              const { title, description: packDescription, badgeLabel, price, duration } = getPackDisplay(
                pack,
                index,
                profileMode
              );

              return (
                <div
                  key={pack.id}
                  className="rounded-xl bg-slate-800/70 border border-slate-700 px-5 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{title}</h3>
                      {badgeLabel && (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-300 text-xs px-2 py-0.5">
                          {badgeLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[#aebac1] text-sm leading-relaxed">{packDescription}</p>
                    {duration && <p className="text-slate-400 text-xs">{duration}</p>}
                  </div>
                  <span className="text-lg font-semibold text-amber-300 md:ml-4">{price}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">Para los que aún estáis curioseando 👀</h2>
          <div className="flex flex-col gap-3">
            {previewResources.map(resource => (
              <div
                key={resource.title}
                className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between text-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="text-lg">{resource.icon}</div>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">{resource.title}</p>
                    <p className="text-slate-300 leading-relaxed">{resource.description}</p>
                  </div>
                </div>
                <a
                  href={resource.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full md:w-auto items-center justify-center px-3 py-2 rounded-lg border border-amber-400 text-amber-300 bg-transparent hover:bg-amber-400/10 font-semibold transition-colors"
                >
                  {resource.ctaLabel}
                </a>
              </div>
            ))}
          </div>
        </section>

        {profileMode === "coach" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold">Dudas rápidas antes de entrar</h2>
            <div className="flex flex-col gap-3">
              {faqItems.map(item => (
                <div
                  key={item.question}
                  className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 flex flex-col gap-1"
                >
                  <p className="font-semibold text-slate-100">{item.question}</p>
                  <p className="text-slate-300 text-sm leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
