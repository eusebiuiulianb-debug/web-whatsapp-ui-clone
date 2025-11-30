import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function addDays(base: Date, days: number) {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

async function main() {
  await prisma.message.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.accessGrant.deleteMany();
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

  await prisma.contentItem.createMany({
    data: [
      {
        id: "content-img-1",
        title: "Galería íntima · set 01",
        type: "IMAGE",
        visibility: "INCLUDED_MONTHLY",
        externalUrl: "https://example.com/galeria-01",
        creatorId: creator.id,
      },
      {
        id: "content-vid-1",
        title: "Clip VIP · noche en casa",
        type: "VIDEO",
        visibility: "VIP",
        externalUrl: "https://example.com/clip-vip",
        creatorId: creator.id,
      },
      {
        id: "content-aud-1",
        title: "Susurros para dormir",
        type: "AUDIO",
        visibility: "EXTRA",
        externalUrl: "https://example.com/audio-susurros",
        creatorId: creator.id,
      },
    ],
  });

  await prisma.$transaction([
    prisma.fan.create({
      data: {
        id: "ana",
        name: "Ana",
        avatar: "avatar.jpg",
        preview: "¡Bienvenida a la comunidad!",
        time: "19:15",
        unreadCount: 2,
        isNew: true,
        membershipStatus: "Suscripción mensual",
        daysLeft: 12,
        lastSeen: "hoy a las 19:10",
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
        creatorId: creator.id,
      },
    }),
    prisma.fan.create({
      data: {
        id: "diego",
        name: "Diego",
        avatar: "avatar.jpg",
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
