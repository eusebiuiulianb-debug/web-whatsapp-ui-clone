import "dotenv/config";

process.env.PRISMA_CLIENT_ENGINE_TYPE = "binary";
process.env.PRISMA_ENGINE_TYPE = "binary";
process.env.PRISMA_QUERY_ENGINE_TYPE = "binary";
process.env.PRISMA_USE_DRIVER_ADAPTERS = "0";

const { PrismaClient } = await import("@prisma/client");

const prisma = new PrismaClient({
  __internal: {
    configOverride: (c) => ({
      ...c,
      engineType: "binary",
    }),
  },
});

async function main() {
  await prisma.message.deleteMany();
  await prisma.fanFollowUp.deleteMany();
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
    },
  });

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

  const [ana, javier, lucia, diego] = await prisma.$transaction([
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
        avatar: "avatar3.png",
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
        avatar: "avatar2.jpg",
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
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "OPEN",
      },
      {
        fanId: "lucia",
        creatorId: creator.id,
        title: "Reactivar después de la prueba",
        dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        status: "DONE",
        doneAt: new Date(),
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        id: "ana-1",
        fanId: ana.id,
        from: "fan",
        text: "Hola, soy Ana. Acabo de suscribirme y me encanta tu contenido.",
        time: "19:05",
        isLastFromCreator: false,
      },
      {
        id: "ana-2",
        fanId: ana.id,
        from: "creator",
        text: "¡Bienvenida, Ana! Gracias por unirte a la comunidad, dime qué te gustaría ver primero.",
        time: "19:10",
        isLastFromCreator: true,
      },
      {
        id: "javier-1",
        fanId: javier.id,
        from: "fan",
        text: "¿Puedes grabar un audio personalizado diciendo mi nombre para un reel?",
        time: "18:02",
        isLastFromCreator: false,
      },
      {
        id: "javier-2",
        fanId: javier.id,
        from: "creator",
        text: "Claro, Javier. ¿Tienes alguna frase o tono específico? Si me das contexto, lo grabo hoy mismo.",
        time: "18:05",
        isLastFromCreator: true,
      },
      {
        id: "lucia-1",
        fanId: lucia.id,
        from: "fan",
        text: "¿Puedes compartir un adelanto del detrás de cámaras?",
        time: "12:35",
        isLastFromCreator: false,
      },
      {
        id: "lucia-2",
        fanId: lucia.id,
        from: "creator",
        text: "Sí, estoy editando un clip exclusivo. Te envío el avance hoy en la tarde.",
        time: "12:48",
        isLastFromCreator: true,
      },
      {
        id: "diego-1",
        fanId: diego.id,
        from: "fan",
        text: "¿Harás live con el club de fans premium esta semana?",
        time: "09:20",
        isLastFromCreator: false,
      },
      {
        id: "diego-2",
        fanId: diego.id,
        from: "creator",
        text: "Sí, Diego. El live premium es este jueves a las 20h, te mando recordatorio por aquí.",
        time: "09:30",
        isLastFromCreator: true,
      },
    ],
  });
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
