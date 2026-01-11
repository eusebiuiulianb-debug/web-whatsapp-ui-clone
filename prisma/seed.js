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

const AGENCY_STAGES = [
  "NEW",
  "WARM_UP",
  "HEAT",
  "OFFER",
  "CLOSE",
  "AFTERCARE",
  "RECOVERY",
  "BOUNDARY",
];

const AGENCY_INTENSITIES = ["SOFT", "MEDIUM", "INTENSE"];

const OPENERS_BY_INTENSITY = {
  SOFT: [
    "Hey {fanName}{hook}",
    "Hola {fanName}{hook}",
    "Ey {fanName}{hook}",
    "{fanName}, te leo{hook}",
    "Aquí estoy, {fanName}{hook}",
  ],
  MEDIUM: [
    "Hey {fanName}{hook}",
    "Ey {fanName}{hook}",
    "{fanName}, me gusta leerte{hook}",
    "Hey, {fanName}{hook}",
    "{fanName}, te tengo en mente{hook}",
  ],
  INTENSE: [
    "Ey {fanName}{hook}",
    "{fanName}, me enciendes{hook}",
    "Hey, {fanName}{hook}",
    "{fanName}, me dejas con ganas{hook}",
    "Ey {fanName}, ven{hook}",
  ],
};

const STAGE_OPENER_HOOKS = {
  NEW: [", me encanta conocerte", ", vamos paso a paso", ", dime tu ritmo"],
  WARM_UP: [", vamos suave", ", me quedé con ganas", ", cerquita y sin prisa"],
  HEAT: [", subamos la tensión", ", me gusta cómo vamos", ", juguemos un poco más"],
  OFFER: [", tengo un plan en mente", ", puedo prepararte algo rico", ", se me ocurrió algo"],
  CLOSE: [", si quieres lo dejamos listo", ", lo cerramos cuando digas", ", lo dejamos hecho hoy"],
  AFTERCARE: [", me gusta cuidarte", ", te leo con calma", ", respiramos un poco"],
  RECOVERY: [", retomemos suave", ", sin presión", ", volvemos con calma"],
  BOUNDARY: [", con límites claros", ", sin ir a lo explícito", ", cuidando el ritmo"],
};

const BRIDGES_BY_INTENSITY = {
  SOFT: [
    "Sobre lo de {context}, me quedé pensando{hook}",
    "Lo de {context} me dejó con curiosidad{hook}",
    "Me quedé con {context}{hook}",
    "Lo de {context} me gustó{hook}",
    "Sobre {context}, me apetece seguir{hook}",
  ],
  MEDIUM: [
    "Lo de {context} me dejó con ganas{hook}",
    "Sobre {context}, me encendió la curiosidad{hook}",
    "Me quedé con {context} en la cabeza{hook}",
    "Lo de {context} me hizo sonreír{hook}",
    "Sobre lo de {context}, me quedé con ganas{hook}",
  ],
  INTENSE: [
    "Lo de {context} me dejó con tensión{hook}",
    "Sobre {context}, me quedé con ganas de más{hook}",
    "Me quedé con {context} muy en la piel{hook}",
    "Lo de {context} me encendió{hook}",
    "Sobre {context}, me quedé con fuego{hook}",
  ],
};

const STAGE_BRIDGE_HOOKS = {
  NEW: [" y con calma", " para ir poco a poco", " sin prisa"],
  WARM_UP: [" y despacio", " con ganas", " a fuego lento"],
  HEAT: [" y subiendo", " con más chispa", " con un poco más"],
  OFFER: [" y se me ocurrió algo", " y te tengo un plan", " y puedo prepararte algo"],
  CLOSE: [" y lo dejamos listo", " y lo cerramos", " y lo resolvemos hoy"],
  AFTERCARE: [" y te cuido", " y te leo cerca", " y quedo pendiente"],
  RECOVERY: [" y retomamos suave", " sin presión", " y volvemos poco a poco"],
  BOUNDARY: [" con límites", " sin cruzar líneas", " con respeto"],
};

const TEASES_BY_INTENSITY = {
  SOFT: [
    "Podemos ir suave y subir si te apetece{hook}",
    "Te propongo algo suave y cercano{hook}",
    "Vamos con ritmo lento y rico{hook}",
    "Puedo guiarte con calma y picardía{hook}",
    "Me gusta empezar suave y jugar un poco{hook}",
  ],
  MEDIUM: [
    "Podemos subir un poco el tono{hook}",
    "Te preparo algo con chispa{hook}",
    "Subimos la tensión sin ir a lo explícito{hook}",
    "Me apetece jugar más contigo{hook}",
    "Vamos a un punto más atrevido{hook}",
  ],
  INTENSE: [
    "Puedo subir el tono con control{hook}",
    "Vamos con más fuego, sin pasarnos{hook}",
    "Te dejo en tensión y lo subo un paso{hook}",
    "Me apetece un punto más intenso{hook}",
    "Subimos claro y con cuidado{hook}",
  ],
};

const STAGE_TEASE_HOOKS = {
  NEW: [", para empezar bien", ", paso a paso", ", sin correr"],
  WARM_UP: [", calentando despacio", ", poco a poco", ", para ir entrando"],
  HEAT: [", con más chispa", ", sin frenar", ", subiendo rico"],
  OFFER: [", y lo dejo listo", ", si quieres te lo preparo", ", y te lo paso"],
  CLOSE: [", y lo cerramos ya", ", si quieres lo cerramos", ", y lo dejamos hecho"],
  AFTERCARE: [", y luego te cuido", ", y luego bajamos", ", con calma después"],
  RECOVERY: [", y retomamos bien", ", sin presión", ", cuidando el ritmo"],
  BOUNDARY: [", con límites claros", ", sin cruzar líneas", ", siempre con respeto"],
};

const CTAS_BY_INTENSITY = {
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

const STAGE_CTA_HOOKS = {
  NEW: [" ahora", " aquí", " conmigo"],
  WARM_UP: [" ahora", " aquí", " un poquito"],
  HEAT: [" ahora", " esta noche", " un poco más"],
  OFFER: [" ahora", " aquí", " hoy"],
  CLOSE: [" ya", " ahora", " hoy"],
  AFTERCARE: [" ahora", " aquí", " con calma"],
  RECOVERY: [" ahora", " aquí", " con calma"],
  BOUNDARY: [" ahora", " aquí", " con calma"],
};

function buildFallbackPools(stage, intensity) {
  return {
    openers: combineWithHooks(OPENERS_BY_INTENSITY[intensity], STAGE_OPENER_HOOKS[stage]),
    bridges: combineWithHooks(BRIDGES_BY_INTENSITY[intensity], STAGE_BRIDGE_HOOKS[stage]),
    teases: combineWithHooks(TEASES_BY_INTENSITY[intensity], STAGE_TEASE_HOOKS[stage]),
    ctas: combineWithHooks(CTAS_BY_INTENSITY[intensity], STAGE_CTA_HOOKS[stage]),
  };
}

function combineWithHooks(base, hooks) {
  const results = [];
  base.forEach((baseItem) => {
    hooks.forEach((hook) => {
      const combined = baseItem.replace("{hook}", hook);
      const normalized = combined.replace(/\s+/g, " ").trim();
      if (normalized) results.push(normalized);
    });
  });
  return uniquePool(results);
}

function uniquePool(pool) {
  const seen = new Set();
  return pool.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function buildAgencyTemplateSeeds() {
  const seeds = [];
  AGENCY_STAGES.forEach((stage) => {
    AGENCY_INTENSITIES.forEach((intensity) => {
      seeds.push({
        stage,
        objective: "CONNECT",
        intensity,
        language: "es",
        blocksJson: buildFallbackPools(stage, intensity),
        active: true,
      });
    });
  });
  return seeds;
}

async function main() {
  await prisma.message.deleteMany();
  await prisma.fanFollowUp.deleteMany();
  await prisma.agencyTemplate.deleteMany();
  await prisma.offer.deleteMany();
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

  const agencyTemplateSeeds = buildAgencyTemplateSeeds();

  await prisma.agencyTemplate.createMany({
    data: agencyTemplateSeeds.map((tpl) => ({
      ...tpl,
      creatorId: creator.id,
    })),
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
