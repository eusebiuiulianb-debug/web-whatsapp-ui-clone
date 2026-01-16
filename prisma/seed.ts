import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function isSqliteDatabase() {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("file:") || url.includes("sqlite");
}

function addDays(base: Date, days: number) {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

const AGENCY_STAGES = [
  "NEW",
  "WARM_UP",
  "HEAT",
  "OFFER",
  "CLOSE",
  "AFTERCARE",
  "RECOVERY",
  "BOUNDARY",
] as const;

const AGENCY_INTENSITIES = ["SOFT", "MEDIUM", "INTENSE"] as const;
const AGENCY_PLAYBOOKS = ["GIRLFRIEND", "PLAYFUL", "ELEGANT", "SOFT_DOMINANT"] as const;

type AgencyStageSeed = (typeof AGENCY_STAGES)[number];
type AgencyIntensitySeed = (typeof AGENCY_INTENSITIES)[number];
type AgencyPlaybookSeed = (typeof AGENCY_PLAYBOOKS)[number];
const DEFAULT_PLAYBOOK: AgencyPlaybookSeed = "GIRLFRIEND";

const OPENERS_BY_INTENSITY: Record<AgencyIntensitySeed, string[]> = {
  SOFT: [
    "Hey {fanName}{hook} {style}",
    "Hola {fanName}{hook} {style}",
    "Ey {fanName}{hook} {style}",
    "{fanName}, te leo{hook} {style}",
    "Aquí estoy, {fanName}{hook} {style}",
  ],
  MEDIUM: [
    "Hey {fanName}{hook} {style}",
    "Ey {fanName}{hook} {style}",
    "{fanName}, me gusta leerte{hook} {style}",
    "Hey, {fanName}{hook} {style}",
    "{fanName}, te tengo en mente{hook} {style}",
  ],
  INTENSE: [
    "Ey {fanName}{hook} {style}",
    "{fanName}, me enciendes{hook} {style}",
    "Hey, {fanName}{hook} {style}",
    "{fanName}, me dejas con ganas{hook} {style}",
    "Ey {fanName}, ven{hook} {style}",
  ],
};

const STAGE_OPENER_HOOKS: Record<AgencyStageSeed, string[]> = {
  NEW: [", me encanta conocerte", ", vamos paso a paso", ", dime tu ritmo"],
  WARM_UP: [", vamos suave", ", me quedé con ganas", ", cerquita y sin prisa"],
  HEAT: [", subamos la tensión", ", me gusta cómo vamos", ", juguemos un poco más"],
  OFFER: [", tengo un plan en mente", ", puedo prepararte algo rico", ", se me ocurrió algo"],
  CLOSE: [", si quieres lo dejamos listo", ", lo cerramos cuando digas", ", lo dejamos hecho hoy"],
  AFTERCARE: [", me gusta cuidarte", ", te leo con calma", ", respiramos un poco"],
  RECOVERY: [", retomemos suave", ", sin presión", ", volvemos con calma"],
  BOUNDARY: [", con límites claros", ", sin ir a lo explícito", ", cuidando el ritmo"],
};

const BRIDGES_BY_INTENSITY: Record<AgencyIntensitySeed, string[]> = {
  SOFT: [
    "Sobre lo de {context}, me quedé pensando{hook} {style}",
    "Lo de {context} me dejó con curiosidad{hook} {style}",
    "Me quedé con {context}{hook} {style}",
    "Lo de {context} me gustó{hook} {style}",
    "Sobre {context}, me apetece seguir{hook} {style}",
  ],
  MEDIUM: [
    "Lo de {context} me dejó con ganas{hook} {style}",
    "Sobre {context}, me encendió la curiosidad{hook} {style}",
    "Me quedé con {context} en la cabeza{hook} {style}",
    "Lo de {context} me hizo sonreír{hook} {style}",
    "Sobre lo de {context}, me quedé con ganas{hook} {style}",
  ],
  INTENSE: [
    "Lo de {context} me dejó con tensión{hook} {style}",
    "Sobre {context}, me quedé con ganas de más{hook} {style}",
    "Me quedé con {context} muy en la piel{hook} {style}",
    "Lo de {context} me encendió{hook} {style}",
    "Sobre {context}, me quedé con fuego{hook} {style}",
  ],
};

const STAGE_BRIDGE_HOOKS: Record<AgencyStageSeed, string[]> = {
  NEW: [" y con calma", " para ir poco a poco", " sin prisa"],
  WARM_UP: [" y despacio", " con ganas", " a fuego lento"],
  HEAT: [" y subiendo", " con más chispa", " con un poco más"],
  OFFER: [" y se me ocurrió algo", " y te tengo un plan", " y puedo prepararte algo"],
  CLOSE: [" y lo dejamos listo", " y lo cerramos", " y lo resolvemos hoy"],
  AFTERCARE: [" y te cuido", " y te leo cerca", " y quedo pendiente"],
  RECOVERY: [" y retomamos suave", " sin presión", " y volvemos poco a poco"],
  BOUNDARY: [" con límites", " sin cruzar líneas", " con respeto"],
};

const TEASES_BY_INTENSITY: Record<AgencyIntensitySeed, string[]> = {
  SOFT: [
    "Podemos ir suave y subir si te apetece{hook} {sensory} {style}",
    "Te propongo algo suave y cercano{hook} {sensory} {style}",
    "Vamos con ritmo lento y rico{hook} {sensory} {style}",
    "Puedo guiarte con calma y picardía{hook} {sensory} {style}",
    "Me gusta empezar suave y jugar un poco{hook} {sensory} {style}",
  ],
  MEDIUM: [
    "Podemos subir un poco el tono{hook} {sensory} {style}",
    "Te preparo algo con chispa{hook} {sensory} {style}",
    "Subimos la tensión sin ir a lo explícito{hook} {sensory} {style}",
    "Me apetece jugar más contigo{hook} {sensory} {style}",
    "Vamos a un punto más atrevido{hook} {sensory} {style}",
  ],
  INTENSE: [
    "Puedo subir el tono con control{hook} {sensory} {style}",
    "Vamos con más fuego, sin pasarnos{hook} {sensory} {style}",
    "Te dejo en tensión y lo subo un paso{hook} {sensory} {style}",
    "Me apetece un punto más intenso{hook} {sensory} {style}",
    "Subimos claro y con cuidado{hook} {sensory} {style}",
  ],
};

const STAGE_TEASE_HOOKS: Record<AgencyStageSeed, string[]> = {
  NEW: [", para empezar bien", ", paso a paso", ", sin correr"],
  WARM_UP: [", calentando despacio", ", poco a poco", ", para ir entrando"],
  HEAT: [", con más chispa", ", sin frenar", ", subiendo rico"],
  OFFER: [", y lo dejo listo", ", si quieres te lo preparo", ", y te lo paso"],
  CLOSE: [", y lo cerramos ya", ", si quieres lo cerramos", ", y lo dejamos hecho"],
  AFTERCARE: [", y luego te cuido", ", y luego bajamos", ", con calma después"],
  RECOVERY: [", y retomamos bien", ", sin presión", ", cuidando el ritmo"],
  BOUNDARY: [", con límites claros", ", sin cruzar líneas", ", siempre con respeto"],
};

const CTAS_BY_INTENSITY: Record<AgencyIntensitySeed, string[]> = {
  SOFT: [
    "¿Te apetece seguir{hook}?",
    "¿Lo hacemos con calma{hook}?",
    "¿Te va algo suave{hook}?",
    "¿Quieres que lo lleve despacio{hook}?",
    "¿Te apetece que empecemos{hook}?",
  ],
  MEDIUM: [
    "¿Te apetece subir un poco{hook}?",
    "¿Lo dejamos suave o subimos{hook}?",
    "¿Te va un toque de chispa{hook}?",
    "¿Quieres que lo haga más intenso{hook}?",
    "¿Te apetece jugar un poco más{hook}?",
  ],
  INTENSE: [
    "¿Quieres que suba el tono{hook}?",
    "¿Te va algo más intenso{hook}?",
    "¿Subimos un paso más{hook}?",
    "¿Te apetece ir más fuerte{hook}?",
    "¿Lo llevamos a otro nivel{hook}?",
  ],
};

const STAGE_CTA_HOOKS: Record<AgencyStageSeed, string[]> = {
  NEW: [" ahora", " aquí", " conmigo"],
  WARM_UP: [" ahora", " aquí", " un poquito"],
  HEAT: [" ahora", " esta noche", " un poco más"],
  OFFER: [" ahora", " aquí", " hoy"],
  CLOSE: [" ya", " ahora", " hoy"],
  AFTERCARE: [" ahora", " aquí", " con calma"],
  RECOVERY: [" ahora", " aquí", " con calma"],
  BOUNDARY: [" ahora", " aquí", " con calma"],
};

const PLAYBOOK_STYLES: Record<
  AgencyPlaybookSeed,
  {
    openers: string[];
    bridges: string[];
    teases: string[];
    sensory: string[];
  }
> = {
  GIRLFRIEND: {
    openers: ["me encanta cuidarte", "te tengo cerquita", "me gusta estar contigo"],
    bridges: ["me nace seguirte", "me sale cuidarte", "me quedé con ganas"],
    teases: ["me apetece mimarte", "quiero ir despacio", "me gusta tu calma"],
    sensory: ["con tu voz cerquita", "con tu risa suave", "con ese calor en la piel"],
  },
  PLAYFUL: {
    openers: ["me apetece jugar", "hoy vengo traviesa", "me gusta provocarte"],
    bridges: ["me pica la curiosidad", "me dan ganas de jugar", "me pongo juguetona"],
    teases: ["te doy un guiño", "me apetece picarte", "quiero un toque travieso"],
    sensory: ["con tu risa de lado", "con tu mirada traviesa", "con ese guiño que imagino"],
  },
  ELEGANT: {
    openers: ["con calma y clase", "me gusta lo sutil", "te leo con cariño"],
    bridges: ["me inspira seguir", "me gusta tu tono", "me quedé con el detalle"],
    teases: ["con estilo suave", "me gusta lo lento", "quiero algo delicado"],
    sensory: ["con tu voz suave", "con tu ritmo tranquilo", "con esa calma elegante"],
  },
  SOFT_DOMINANT: {
    openers: ["déjame guiarte", "yo marco el ritmo", "sigue mi paso"],
    bridges: ["deja que te lleve", "confía en mí", "yo conduzco"],
    teases: ["te llevo despacio", "te marco el ritmo", "control suave y rico"],
    sensory: ["con tu respiración cerca", "con tu ritmo bajo control", "con ese calor que sube"],
  },
};

function buildFallbackPools(stage: AgencyStageSeed, intensity: AgencyIntensitySeed, playbook: AgencyPlaybookSeed) {
  const style = PLAYBOOK_STYLES[playbook] ?? PLAYBOOK_STYLES[DEFAULT_PLAYBOOK];
  return {
    openers: expandTemplates(OPENERS_BY_INTENSITY[intensity], {
      hooks: STAGE_OPENER_HOOKS[stage],
      styles: style.openers,
    }),
    bridges: expandTemplates(BRIDGES_BY_INTENSITY[intensity], {
      hooks: STAGE_BRIDGE_HOOKS[stage],
      styles: style.bridges,
    }),
    teases: expandTemplates(TEASES_BY_INTENSITY[intensity], {
      hooks: STAGE_TEASE_HOOKS[stage],
      styles: style.teases,
      sensory: style.sensory,
    }),
    ctas: expandTemplates(CTAS_BY_INTENSITY[intensity], {
      hooks: STAGE_CTA_HOOKS[stage],
    }),
  };
}

function expandTemplates(
  base: string[],
  replacements: { hooks?: string[]; styles?: string[]; sensory?: string[] }
): string[] {
  const hooks = replacements.hooks && replacements.hooks.length > 0 ? replacements.hooks : [""];
  const styles = replacements.styles && replacements.styles.length > 0 ? replacements.styles : [""];
  const sensory = replacements.sensory && replacements.sensory.length > 0 ? replacements.sensory : [""];
  const results: string[] = [];

  for (const baseItem of base) {
    const hookVariants = baseItem.includes("{hook}") ? hooks : [""];
    for (const hook of hookVariants) {
      const withHook = baseItem.replace("{hook}", hook).trim();
      const styleVariants = withHook.includes("{style}") ? styles : [""];
      for (const style of styleVariants) {
        const withStyle = withHook.replace("{style}", style).trim();
        const sensoryVariants = withStyle.includes("{sensory}") ? sensory : [""];
        for (const sense of sensoryVariants) {
          const combined = withStyle.replace("{sensory}", sense);
          const normalized = normalizePhrase(combined);
          if (normalized.length > 0) results.push(normalized);
        }
      }
    }
  }
  return uniquePool(results);
}

function normalizePhrase(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

function uniquePool(pool: string[]) {
  const seen = new Set<string>();
  return pool.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function buildAgencyTemplateSeeds() {
  const seeds: Array<{
    stage: AgencyStageSeed;
    objective: "CONNECT";
    intensity: AgencyIntensitySeed;
    playbook: AgencyPlaybookSeed;
    language: string;
    blocksJson: ReturnType<typeof buildFallbackPools>;
    active: boolean;
  }> = [];

  for (const stage of AGENCY_STAGES) {
    for (const intensity of AGENCY_INTENSITIES) {
      seeds.push({
        stage,
        objective: "CONNECT",
        intensity,
        playbook: DEFAULT_PLAYBOOK,
        language: "es",
        blocksJson: buildFallbackPools(stage, intensity, DEFAULT_PLAYBOOK),
        active: true,
      });
    }
  }
  return seeds;
}

async function main() {
  const isSqlite = isSqliteDatabase();
  if (isSqlite) {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF;");
  }
  let wipeOk = false;
  try {
    await prisma.$transaction([
      prisma.managerAiMessage.deleteMany(),
      prisma.managerMessage.deleteMany(),
      prisma.managerConversation.deleteMany(),
      prisma.contentManagerMessage.deleteMany(),
      prisma.contentManagerConversation.deleteMany(),
      prisma.message.deleteMany(),
      prisma.fanFollowUp.deleteMany(),
      prisma.fanNote.deleteMany(),
      prisma.accessGrant.deleteMany(),
      prisma.extraPurchase.deleteMany(),
      prisma.aiUsageLog.deleteMany(),
      prisma.analyticsEvent.deleteMany(),
      prisma.campaignLink.deleteMany(),
      prisma.discoveryFeedback.deleteMany(),
      prisma.creatorAiTemplate.deleteMany(),
      prisma.agencyTemplate.deleteMany(),
      prisma.creatorAiSettings.deleteMany(),
      prisma.generatedAsset.deleteMany(),
      prisma.popClip.deleteMany(),
      prisma.catalogItem.deleteMany(),
      prisma.contentItem.deleteMany(),
      prisma.offer.deleteMany(),
      prisma.campaignMeta.deleteMany(),
      prisma.creatorDiscoveryProfile.deleteMany(),
      prisma.creatorProfile.deleteMany(),
      prisma.fan.deleteMany(),
      prisma.pack.deleteMany(),
      prisma.creator.deleteMany(),
    ]);
    wipeOk = true;
  } finally {
    if (isSqlite) {
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
      if (wipeOk) {
        console.log("Seeding: wiped DB (sqlite FK OFF/ON)");
      }
    }
  }

  const creator = await prisma.creator.create({
    data: {
      id: "creator-1",
      name: "Eusebiu",
      subtitle: "Responde en menos de 24h",
      description:
        "Bienvenido a mi espacio en NOVSY. Aquí comparto avances, envío audios personalizados y respondo tus ideas para crear contenido hecho a tu medida. Únete para acceder a sesiones 1:1, material exclusivo y priorizar tus pedidos.",
      bioLinkAvatarUrl: "/avatar.jpg",
    },
  });

  const agencyTemplateSeeds = buildAgencyTemplateSeeds();

  await prisma.agencyTemplate.createMany({
    data: agencyTemplateSeeds.map((tpl) => ({
      ...tpl,
      creatorId: creator.id,
    })),
  });

  const extraCreators = await Promise.all(
    [
      {
        id: "creator-2",
        name: "Clara Ríos",
        subtitle: "Cálida y cercana, responde en el día",
        description:
          "Sesiones 1:1 para fans que buscan conversación auténtica, audio-notas y retos suaves. Sin prisas, pero con presencia.",
        bioLinkAvatarUrl: "/avatar2.jpg",
      },
      {
        id: "creator-3",
        name: "Mateo Torres",
        subtitle: "Directo y claro, con ideas accionables",
        description:
          "Te doy feedback honesto y guiones concretos. Ideal si quieres planes, retos y cero rodeos.",
        bioLinkAvatarUrl: "/avatar3.png",
      },
      {
        id: "creator-4",
        name: "Vega Noir",
        subtitle: "Elegante, responde con detalle",
        description:
          "Experiencias premium: guías largas, sesiones planeadas y propuestas cuidadas para fans exigentes.",
        bioLinkAvatarUrl: "/avatar.jpg",
      },
    ].map((data) =>
      prisma.creator.create({
        data,
      })
    )
  );

  await prisma.pack.createMany({
    data: [
      {
        id: "welcome",
        name: "Pack bienvenida",
        price: "9 €",
        description: "Primer contacto + 3 audios base personalizados.",
        creatorId: creator.id,
      },
      {
        id: "monthly",
        name: "Pack mensual",
        price: "25 €",
        description: "Acceso al chat 1:1 y contenido nuevo cada semana.",
        creatorId: creator.id,
      },
      {
        id: "special",
        name: "Pack especial",
        price: "49 €",
        description: "Sesión intensiva + material extra para pareja.",
        creatorId: creator.id,
      },
    ],
  });

  const welcomeContent = [
    {
      creatorId: creator.id,
      pack: "WELCOME",
      slug: "bienvenida-carta",
      type: "TEXT",
      title: "Carta de bienvenida",
      description: "Quién soy, qué haremos aquí y cómo funciona tu espacio privado conmigo.",
      order: 10,
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "WELCOME",
      slug: "bienvenida-como-aprovechar",
      type: "TEXT",
      title: "Cómo aprovechar tu espacio privado",
      description: "Reglas básicas, tiempos de respuesta y cómo pedirme lo que necesitas.",
      order: 20,
      isPreview: false,
    },
    {
      id: "content-vid-1",
      creatorId: creator.id,
      pack: "WELCOME",
      slug: "video-presentacion-creador",
      type: "VIDEO",
      title: "Quién soy y qué haremos aquí",
      description: "Vídeo corto donde me ves y te cuento qué vamos a cuidar en este chat.",
      order: 30,
      durationSec: 60,
      mediaPath: "/media/welcome/video_presentacion.mp4",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "WELCOME",
      slug: "video-tour-contenido",
      type: "VIDEO",
      title: "Cómo funciona el contenido dentro",
      description: "Pequeño tour por los packs y tipos de contenido que vas a encontrar.",
      order: 40,
      durationSec: 120,
      mediaPath: "/media/welcome/video_tour.mp4",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "audio-calibracion",
      type: "AUDIO",
      title: "Audio 1 · Calibrar cómo llegas hoy",
      description: "Unos minutos para que notes cómo llegas antes de empezar a escribir.",
      order: 50,
      durationSec: 240,
      mediaPath: "/media/welcome/audio_calibracion.mp3",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "audio-ritual-antes-de-escribir",
      type: "AUDIO",
      title: "Audio 2 · Ritual rápido antes de escribir",
      description: "Pequeño ritual sensorial para bajar revoluciones y escribir desde otro lugar.",
      order: 60,
      durationSec: 300,
      mediaPath: "/media/welcome/audio_ritual.mp3",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "audio-muestra-experiencia",
      type: "AUDIO",
      title: "Audio 3 · Muestra de experiencia íntima",
      description: "Mini experiencia que adelanta cómo son mis audios profundos de pareja.",
      order: 70,
      durationSec: 420,
      mediaPath: "/media/welcome/audio_muestra.mp3",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "foto-escena-1-casa",
      type: "IMAGE",
      title: "Escena 1 · Nosotros en casa",
      description: "Foto realista de pareja cotidiana en casa.",
      order: 80,
      mediaPath: "/media/welcome/foto_escena1.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "foto-detalle-manos",
      type: "IMAGE",
      title: "Escena 2 · Detalle de manos",
      description: "Manos y gesto íntimo sin ser explícito.",
      order: 90,
      mediaPath: "/media/welcome/foto_manos.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "foto-escena-miradas",
      type: "IMAGE",
      title: "Escena 3 · Miradas",
      description: "Foto centrada en la mirada y la conexión.",
      order: 100,
      mediaPath: "/media/welcome/foto_miradas.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "foto-cineritual-1",
      type: "IMAGE",
      title: "Cine-ritual 1",
      description: "Foto con tu estética más cuidada.",
      order: 110,
      mediaPath: "/media/welcome/foto_cineritual1.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "SPECIAL",
      slug: "foto-cineritual-2",
      type: "IMAGE",
      title: "Cine-ritual 2",
      description: "Segunda variación de la escena cine-ritual.",
      order: 120,
      mediaPath: "/media/welcome/foto_cineritual2.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "SPECIAL",
      slug: "foto-cineritual-3",
      type: "IMAGE",
      title: "Cine-ritual 3",
      description: "Tercera variación, jugando con otro ángulo o luz.",
      order: 130,
      mediaPath: "/media/welcome/foto_cineritual3.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "foto-detalle-ritual",
      type: "IMAGE",
      title: "Detalle · Objetos del ritual",
      description: "Velas, manta, cama; el entorno donde puede ocurrir la intimidad.",
      order: 140,
      mediaPath: "/media/welcome/foto_detalle_ritual.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "foto-detalle-espacio-chat",
      type: "IMAGE",
      title: "Detalle · Espacio de conversación",
      description: "Sofá o rincón donde imaginamos las conversaciones profundas.",
      order: 150,
      mediaPath: "/media/welcome/foto_espacio_chat.jpg",
      isPreview: false,
    },
    {
      creatorId: creator.id,
      pack: "MONTHLY",
      slug: "foto-nosotros-de-espaldas",
      type: "IMAGE",
      title: "Detalle · Nosotros de espaldas",
      description: "Presencia de pareja, cuidando intimidad y anonimato.",
      order: 160,
      mediaPath: "/media/welcome/foto_espaldas.jpg",
      isPreview: false,
    },
  ];

  await Promise.all(
    welcomeContent.map(({ id, ...item }) =>
      prisma.contentItem.upsert({
        where: {
          creatorId_slug: { creatorId: creator.id, slug: item.slug ?? "" },
        },
        update: {
          ...item,
          creatorId: creator.id,
        },
        create: {
          ...item,
          id,
          creatorId: creator.id,
        },
      })
    )
  );

  await prisma.$transaction([
    prisma.fan.create({
      data: {
        id: "ana",
        name: "Ana",
        avatar: "/avatar.jpg",
        preview: "¡Bienvenida a la comunidad!",
        time: "19:15",
        unreadCount: 2,
        isNew: true,
        membershipStatus: "Suscripción mensual",
        daysLeft: 12,
        lastSeen: "hoy a las 19:10",
        profileText: "Le gustan los mensajes cálidos y directos. Prefiere propuestas suaves y sin presión.",
        creatorId: creator.id,
      },
    }),
    prisma.fan.create({
      data: {
        id: "javier",
        name: "Javier",
        avatar: "/avatar3.png",
        preview: "Necesito un poco más de contexto para grabarlo",
        time: "18:10",
        unreadCount: 1,
        isNew: true,
        membershipStatus: "Contenido individual",
        daysLeft: 0,
        lastSeen: "hoy a las 18:05",
        creatorId: creator.id,
      },
    }),
    prisma.fan.create({
      data: {
        id: "lucia",
        name: "Lucía",
        avatar: "/avatar2.jpg",
        preview: "Te comparto un adelanto en exclusiva hoy",
        time: "12:48",
        unreadCount: 0,
        isNew: false,
        membershipStatus: "Prueba 7 días",
        daysLeft: 1,
        lastSeen: "ayer a las 22:34",
        profileText: "Responde mejor cuando el tono es íntimo pero breve. Le gusta el humor suave.",
        creatorId: creator.id,
      },
    }),
    prisma.fan.create({
      data: {
        id: "diego",
        name: "Diego",
        avatar: "/avatar.jpg",
        preview: "Live premium este jueves a las 20h",
        time: "09:30",
        unreadCount: 0,
        isNew: false,
        membershipStatus: "Suscripción mensual",
        daysLeft: 5,
        lastSeen: "en línea ahora",
        creatorId: creator.id,
      },
    }),
  ]);

  const seededFans = await prisma.fan.findMany({ select: { id: true } });
  if (seededFans.length > 0) {
    const now = new Date();
    await (prisma as any).wallet.createMany({
      data: seededFans.map((fan) => ({
        fanId: fan.id,
        currency: "EUR",
        balanceCents: 0,
        updatedAt: now,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.fanFollowUp.createMany({
    data: [
      {
        fanId: "ana",
        creatorId: creator.id,
        title: "Proponer pack especial",
        note: "Le interesa contenido más intenso si hay contexto.",
        dueAt: addDays(new Date(), 1),
        status: "OPEN",
      },
      {
        fanId: "lucia",
        creatorId: creator.id,
        title: "Reactivar después de la prueba",
        dueAt: addDays(new Date(), -1),
        status: "DONE",
        doneAt: new Date(),
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        id: "ana-1",
        fanId: "ana",
        from: "fan",
        text: "Hola, soy Ana. Acabo de suscribirme y me encanta tu contenido.",
        time: "19:05",
        isLastFromCreator: false,
      },
      {
        id: "ana-2",
        fanId: "ana",
        from: "creator",
        text: "¡Bienvenida, Ana! Gracias por unirte a la comunidad, dime qué te gustaría ver primero.",
        time: "19:10",
        isLastFromCreator: true,
        type: "TEXT",
      },
      {
        id: "diego-3",
        fanId: "diego",
        from: "creator",
        text: "Contenido adjunto",
        time: "10:15",
        isLastFromCreator: true,
        type: "CONTENT",
        contentItemId: "content-vid-1",
      },
    ],
  });

  const now = new Date();
  await prisma.accessGrant.createMany({
    data: [
      {
        fanId: "ana",
        type: "monthly",
        createdAt: now,
        expiresAt: addDays(now, 12),
      },
      {
        fanId: "javier",
        type: "special",
        createdAt: now,
        expiresAt: addDays(now, 1),
      },
      {
        fanId: "lucia",
        type: "trial",
        createdAt: now,
        expiresAt: addDays(now, 7),
      },
      {
        fanId: "diego",
        type: "monthly",
        createdAt: now,
        expiresAt: addDays(now, 5),
      },
    ],
  });

  if (process.env.NODE_ENV !== "production") {
    await prisma.contentItem.createMany({
      data: [
        {
          id: "extra-ana-1",
          creatorId: creator.id,
          pack: "SPECIAL",
          slug: "extra-ana-1",
          type: "IMAGE",
          title: "Extra demo Ana 1",
          description: "Extra de prueba para validar monetización.",
          order: 999,
          isPreview: false,
          visibility: "EXTRA",
          isExtra: true,
          extraTier: "T2",
        },
        {
          id: "extra-ana-2",
          creatorId: creator.id,
          pack: "SPECIAL",
          slug: "extra-ana-2",
          type: "IMAGE",
          title: "Extra demo Ana 2",
          description: "Extra de prueba para validar monetización.",
          order: 1000,
          isPreview: false,
          visibility: "EXTRA",
          isExtra: true,
          extraTier: "T3",
        },
      ],
    });

    await prisma.extraPurchase.createMany({
      data: [
        {
          fanId: "ana",
          contentItemId: "extra-ana-1",
          tier: "T2",
          amount: 29,
          kind: "EXTRA",
          productId: "extra-ana-1",
          productType: "EXTRA",
          createdAt: addDays(new Date(), -5),
        },
        {
          fanId: "ana",
          contentItemId: "extra-ana-2",
          tier: "T3",
          amount: 40,
          kind: "EXTRA",
          productId: "extra-ana-2",
          productType: "EXTRA",
          createdAt: addDays(new Date(), -2),
        },
      ],
    });
  }

  const discoveryProfiles = [
    {
      creatorId: creator.id,
      isDiscoverable: true,
      niches: "compania,conversacion,contenido",
      communicationStyle: "calido",
      limits: "Sin contenido explícito, foco en conversación y audio-notas.",
      priceMin: 20,
      priceMax: 60,
      responseHours: 24,
      allowLocationMatching: true,
      showCountry: true,
      showCityApprox: false,
      country: "España",
      cityApprox: "Madrid",
    },
    {
      creatorId: extraCreators[0].id,
      isDiscoverable: true,
      niches: "conversacion,compania,coaching,support",
      communicationStyle: "calido",
      limits: "Sin fotos explícitas; audio y texto cercano.",
      priceMin: 10,
      priceMax: 35,
      responseHours: 12,
      allowLocationMatching: true,
      showCountry: true,
      showCityApprox: true,
      country: "España",
      cityApprox: "Barcelona",
    },
    {
      creatorId: extraCreators[1].id,
      isDiscoverable: true,
      niches: "contenido,ideas,guiones,juego",
      communicationStyle: "directo",
      limits: "Mensajes concretos, sin roleplay explícito.",
      priceMin: 25,
      priceMax: 70,
      responseHours: 18,
      allowLocationMatching: false,
      showCountry: false,
      showCityApprox: false,
      country: "España",
      cityApprox: "Valencia",
    },
    {
      creatorId: extraCreators[2].id,
      isDiscoverable: true,
      niches: "premium,elegante,asesoria,juego",
      communicationStyle: "elegante",
      limits: "Solo propuestas premium y guías largas, sin spam.",
      priceMin: 60,
      priceMax: 140,
      responseHours: 6,
      allowLocationMatching: true,
      showCountry: true,
      showCityApprox: true,
      country: "México",
      cityApprox: "CDMX",
    },
  ];

  await prisma.creatorDiscoveryProfile.createMany({ data: discoveryProfiles });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
