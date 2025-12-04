# Arquitectura del chat (NOVSY)

## Modelos y tipos clave
- **Message** (backend/API Prisma): campos principales `id`, `fanId`, `from` ("creator" | "fan"), `text`, `time` (HH:MM), `type` ("TEXT" | "CONTENT"), `contentItemId`, `isLastFromCreator`, `contentItem` (relación).
- **Message** (frontend tipos `src/types/Conversation.ts` y `src/types/chat.ts`): mismos campos básicos; `time` es string, `contentItem` opcional con `id/title/type/visibility/externalUrl`.
- **Conversation / ConversationListData**: datos de fan/chat (id, nombre, avatar, membershipStatus, daysLeft, followUpTag, extras, isHighPriority, etc.) usados en Sidebar y ConversationDetails.
- **Fan** (API fans): incluye métricas de seguimiento, extras, prioridad, notas, etc., pero el chat se centra en `id/name/time/preview/notesCount/followUpTag/isHighPriority`.

## API de mensajes `/api/messages`
- **GET**: recibe `fanId`, devuelve mensajes ordenados por `time` ascendente (`orderBy: { time: "asc" }`), incluye `contentItem` si aplica. Sin filtros adicionales.
- **POST**: cuerpo `{ fanId, text, from, type, contentItemId }`. Normaliza `type` a TEXT o CONTENT, genera `time` con `toLocaleTimeString`, guarda `isLastFromCreator` según `from`. Devuelve el mensaje creado (con `contentItem` si aplica).

## Flujo de carga y envío
- **ConversationDetails (creador)**: `fetchMessages` llama a `/api/messages?fanId=...`, mapea a estado local `message` y ordena cronológicamente. Enviar texto: `handleSendMessage` → POST `/api/messages` con `{ fanId, text, from: "creator", type: "TEXT" }`, añade la respuesta al estado y limpia `messageSend`.
- **Chat público fan** (`/fan/[fanId].tsx`): `fetchMessages` GET `/api/messages`, `handleSendMessage` envía `{ fanId, from: "fan", type: "TEXT", text }`, agrega la respuesta a `messages` y limpia el draft.

## Layout del chat (creador)
- Raíz: `div.flex.flex-col.h-full.min-h-0` en `ConversationDetails`.
- **Header** (`shrink-0`): avatar, nombre, badges (pack, extras, prioridad), info de suscripción, botón “Siguiente venta” si cola activa, botones rápidos superiores (Saludo rápido, Pack bienvenida, etc.).
- **Mensajes**: `div.flex-1.min-h-0.overflow-y-auto` con `ref={messagesContainerRef}`; renderiza burbujas `MessageBalloon` y adjuntos `ContentAttachmentCard` en orden ascendente.
- **Footer** (`shrink-0`): línea de estado (statusLine), barra de acciones rápidas (Saludo, Renovación opcional, Extra rápido, Pack especial, Abrir extras), y debajo input con iconos de adjuntar/enviar.

## Layout del chat público del fan
- Página `/fan/[fanId].tsx`: raíz `min-h-screen flex flex-col`.
- Header: avatar inicial del creador + título/subtítulo.
- Bloques superiores: banners de acceso y contenidos incluidos.
- Main: `main.flex.flex-col.flex-1.overflow-hidden.min-h-0`.
  - Mensajes: `div.flex-1.min-h-0.overflow-y-auto` (con background), lista de mensajes en orden ascendente.
  - Footer: `form` con input y botón Enviar, fijo en el flujo (no hace scroll).

## Lógica de scroll actual
- **Refs/estado**: `messagesContainerRef` + `isAtBottom` en ambos chats.
- **Handlers**: `scrollToBottom(behavior)` hace scroll al fondo del contenedor de mensajes.
- **Listeners**: `useLayoutEffect` añade listener de scroll al contenedor; calcula `distanceToBottom` (umbral ~80px) y actualiza `isAtBottom`.
- **Efectos**:
  - Al cambiar de conversación (`conversation.id` o `fanId`): `scrollToBottom('auto')` (siempre al fondo).
  - Al cambiar `messages.length`: si `isAtBottom` es true → `scrollToBottom('smooth')`; si el usuario está arriba, no se mueve.
- Mensajes se renderizan en orden ascendente; no se usa `flex-col-reverse`.

## Puntos seguros de modificar
- Textos de estado/`statusLine` (sin tocar la lógica de cola o prioridad).
- Botones rápidos y sus etiquetas; callbacks usan `insertTemplate` y `setShowExtraTemplates`.
- Layout del header/footer (clases Tailwind) mientras se preserve `shrink-0` para header/footer y `flex-1 overflow-y-auto` para mensajes.
- Comportamiento de auto-scroll: ajustar umbral o comportamiento en `scrollToBottom`, listener `onScroll` y efectos que dependen de `messages.length`/`conversation.id`.
