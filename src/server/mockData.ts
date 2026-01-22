import { Creator, Fan, Message, Pack } from "../types/chat";

export const mockCreator: Creator = {
  id: "creator-1",
  name: "Eusebiu",
  subtitle: "Responde en menos de 24h",
  description:
    "Bienvenido a mi espacio en NOVSY. Aquí comparto avances, envío audios personalizados y respondo tus ideas para crear contenido hecho a tu medida. Únete para acceder a sesiones 1:1, material exclusivo y priorizar tus pedidos.",
};

export const mockPacks: Pack[] = [
  {
    id: "welcome",
    name: "Pack bienvenida",
    price: "9 €",
    description: "Primer contacto + 3 audios base personalizados.",
  },
  {
    id: "monthly",
    name: "Pack mensual",
    price: "25 €",
    description: "Acceso al chat 1:1 y contenido nuevo cada semana.",
  },
  {
    id: "special",
    name: "Pack especial",
    price: "49 €",
    description: "Sesión intensiva + material extra para pareja.",
  },
];

export const mockFans: Fan[] = [
  {
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
  },
  {
    id: "javier",
    name: "Javier",
    avatar: "/avatar.jpg",
    preview: "Necesito un poco más de contexto para grabarlo",
    time: "18:10",
    unreadCount: 1,
    isNew: true,
    membershipStatus: "Contenido individual",
    daysLeft: 0,
    lastSeen: "hoy a las 18:05",
  },
  {
    id: "lucia",
    name: "Lucía",
    avatar: "/avatar.jpg",
    preview: "Te comparto un adelanto en exclusiva hoy",
    time: "12:48",
    unreadCount: 0,
    isNew: false,
    membershipStatus: "Prueba 7 días",
    daysLeft: 1,
    lastSeen: "ayer a las 22:34",
  },
  {
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
  },
];

export const mockMessagesByFanId: Record<string, Message[]> = {
  ana: [
    { id: "ana-1", fanId: "ana", from: "fan", text: "Hola, soy Ana. Acabo de suscribirme y me encanta tu contenido.", time: "19:05" },
    { id: "ana-2", fanId: "ana", from: "creator", text: "¡Bienvenida, Ana! Gracias por unirte a la comunidad, dime qué te gustaría ver primero.", time: "19:10", isLastFromCreator: true },
  ],
  javier: [
    { id: "javier-1", fanId: "javier", from: "fan", text: "¿Puedes grabar un audio personalizado diciendo mi nombre para un reel?", time: "18:02" },
    { id: "javier-2", fanId: "javier", from: "creator", text: "Claro, Javier. ¿Tienes alguna frase o tono específico? Si me das contexto, lo grabo hoy mismo.", time: "18:05", isLastFromCreator: true },
  ],
  lucia: [
    { id: "lucia-1", fanId: "lucia", from: "fan", text: "¿Puedes compartir un adelanto del detrás de cámaras?", time: "12:35" },
    { id: "lucia-2", fanId: "lucia", from: "creator", text: "Sí, estoy editando un clip exclusivo. Te envío el avance hoy en la tarde.", time: "12:48", isLastFromCreator: true },
  ],
  diego: [
    { id: "diego-1", fanId: "diego", from: "fan", text: "¿Harás live con el club de fans premium esta semana?", time: "09:20" },
    { id: "diego-2", fanId: "diego", from: "creator", text: "Sí, Diego. El live premium es este jueves a las 20h, te mando recordatorio por aquí.", time: "09:30", isLastFromCreator: true },
  ],
};
