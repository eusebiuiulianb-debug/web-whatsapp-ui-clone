import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function addDays(base: Date, days: number) {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

async function main() {
  await prisma.managerAiMessage.deleteMany();
  await prisma.aiUsageLog.deleteMany();
  await prisma.extraPurchase.deleteMany();
  await prisma.contentManagerMessage.deleteMany();
  await prisma.contentManagerConversation.deleteMany();
  await prisma.managerMessage.deleteMany();
  await prisma.managerConversation.deleteMany();
  await prisma.message.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.fanFollowUp.deleteMany();
  await prisma.fanNote.deleteMany();
  await prisma.accessGrant.deleteMany();
  await prisma.creatorAiTemplate.deleteMany();
  await prisma.creatorAiSettings.deleteMany();
  await prisma.fan.deleteMany();
  await prisma.pack.deleteMany();
  await prisma.creator.deleteMany();

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
