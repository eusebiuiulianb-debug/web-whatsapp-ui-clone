# NOVSY

Chat tipo WhatsApp para creadores y fans (versión preliminar).

## Estado (28 Dic)

- Bug resuelto: PopClips no aparecía en `/creator` porque el perfil público usaba handle="creator".
- Ahora `/creator` resuelve el handle real desde `/api/creator` y lo pasa a `PublicProfileView`.
- `PublicProfileView`: fetch `/api/public/popclips?handle=...` + estados loading/empty/error con retry visible.
- PopClips feed ya renderiza el clip y “Ver pack” navega a landing pública del pack.
- Migrations SQLite: `init` refleja el schema actual; historial previo movido a `prisma/migrations_legacy/2025_12_29_pre_squash` (incluye la antigua `20250309120000_add_extra_purchase_product_fields`).

Checklist verificación (migrations):
- [ ] `npx prisma migrate reset` completa sin errores.
- [ ] `npx prisma generate` completa sin EPERM/P2021.
- [ ] `npm run dev` arranca sin P2021 (AccessGrant).
- [ ] Abrir `/creator` y el perfil público sin errores en stats.
- [ ] `/api/popclips` responde sin errores.

Cambios recientes (6 archivos):
- `src/components/public-profile/PublicProfileView.tsx`
- `src/config/creatorConfig.ts`
- `src/context/CreatorConfigContext.tsx`
- `src/pages/creator.tsx`
- `src/pages/api/creator.ts`
- `src/pages/creator/edit.tsx`

Siguiente prioridad:
1. Validación dura en editor: Video URL solo `.mp4`/`.webm` (bloquear YouTube y mostrar mensaje).
2. Mejorar landing pública del pack (hero/cover placeholder, CTA Pedir más claro, volver al perfil).
3. Pulir UX del feed: icono audio, overlay tap-to-play cuando falle autoplay, skeletons bonitos.

## Cómo arrancar el proyecto

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Por defecto: `npm run dev` (abre en `http://localhost:3005`).
Si `3005` está ocupado: `npm run dev -- -p 3007` (o `3008` si también está ocupado).

Para pasos completos y troubleshooting en Windows, revisa el runbook de abajo.

En Windows, si ves errores raros de `.next` (p. ej. `__webpack_require__.a is not a function`), usa: `npm run dev:reset`.

## Runbook de desarrollo (Windows)

### Limpiar .next corrupto (ENOENT en dev)
- Síntoma: `ENOENT ...\\.next\\server\\pages\\*.js` o HMR roto al arrancar.
- Solución rápida: `npm run dev:clean` (borra `.next` y arranca dev).
- El predev ya borra `.next` si detecta `BUILD_ID` o `pages-manifest.json` ausentes.

### Quickstart
1. Copia `.env.example` a `.env` y ajusta `DATABASE_URL` si necesitas otra ruta local.
2. `npm install`
3. `npx prisma generate`
4. `npx prisma migrate dev`
5. `npm run dev` (http://localhost:3005)
6. `npm run build` para validar que el build pasa.

## Traducción (LibreTranslate local)
1. `npm run lt:up`
2. Abre `http://127.0.0.1:5000` para verificar que responde.
3. En `/creator/ai-settings`, selecciona "LibreTranslate" y URL `http://127.0.0.1:5000`.
4. Si usas `.env.local`, asegúrate de tener `LIBRETRANSLATE_URL=http://127.0.0.1:5000`.
5. Usa "Probar conexión" y luego "Traducir" en el chat.

### Puerto ocupado (Windows)
- Detectar proceso: `netstat -ano | findstr :3005`
- Forzar cierre: `taskkill /PID <pid> /F`
- Alternativa temporal: `npm run dev -- -p 3007`

### Contrato de APIs
- Todas las listas devuelven `{ ok, items }` (ej: `/api/fans`, `/api/messages` devuelve `items` y `messages` para compatibilidad temporal).

### Diagnóstico rápido
- Antes de marcar “arreglado”: `npm run diagnose` (lint + typecheck + build + smoke API).

### Base de datos (SQLite)
- La base local vive en `./prisma/dev.db` y no se commitea.
- Para regenerarla desde cero: borra `prisma/dev.db` (solo local), ejecuta `npx prisma migrate dev` y, si hay seed disponible, `npx prisma db seed`.
- Si `npx prisma migrate dev` falla por shadow DB (P3006) o por historia desalineada, en dev usa uno de estos flujos:
  - `npx prisma migrate reset` (borra y re-aplica migraciones).
  - `npx prisma db push --force-reset` (solo dev, ignora historial).

### Watchpack EINVAL en Windows
- Síntoma: al arrancar `npm run dev`, error `Watchpack Error (initial scan) EINVAL lstat C:\\hiberfil.sys` (o `pagefile.sys`/`swapfile.sys`).
- Solución: crea `.env.local` con:
  ```
  WATCHPACK_POLLING=true
  WATCHPACK_POLL_INTERVAL=1000
  ```
- Reinicia el dev-server. `.env.local` no se commitea.

## Incluye ahora
- Header de creador con avatar inicial, nombre y tiempo de respuesta.
- Conversaciones de ejemplo con fans (Ana, Javier, Lucía, Diego) y estado de suscripción estático (tipo y días restantes).
- Acciones rápidas del creador que rellenan el mensaje con plantillas.
- Mejora básica de vista móvil: lista y chat se apilan en pantallas pequeñas.

## Packs de ejemplo
- Catálogo estático de packs (bienvenida, mensual y especial) con nombre, precio y descripción.
- El botón “Elegir pack” despliega la lista y al seleccionar uno se pre-llena el mensaje con la plantilla correspondiente (sin enviarlo automáticamente).

## Página pública de creador
- Ruta `/creator` como landing pública con avatar, descripción y listado de packs.
- Incluye bnpm run devotón “Entrar al chat privado” que navega a `/`.

## Ajustes del creador
- La barra superior de la app ahora es la barra del creador (avatar, nombre, estado, enlace al perfil público y menú de ajustes).
- El panel es accesible desde el menú de tres puntos de esa barra (arriba a la izquierda) para editar nombre, subtítulo y descripción del creador.
- Permite cambiar textos de respuestas rápidas y editar nombre, precio y descripción de los packs.
- Los cambios se guardan en `localStorage` bajo la clave `novsy_creator_config` y afectan tanto al chat (`/`) como a la página pública (`/creator`) en ese navegador.

## Detalles de demo
- Contadores de no leídos en la lista de fans y vista en negrita cuando hay mensajes pendientes.
- Etiqueta “Nuevo fan” para los más recientes.
- Información de última conexión / en línea en el header del chat.
- Indicador “✔✔ Visto” en el último mensaje enviado por el creador.

## API interna mock
- Endpoints Next.js disponibles:
  - `/api/creator` devuelve creador y packs mock desde `src/server/mockData`.
  - `/api/fans` devuelve la lista de fans con estados de demo.
  - `/api/messages?fanId=...` devuelve los mensajes mock de cada fan.
- La UI consume estos endpoints vía `fetch`, combinando los datos del creador con la configuración local (localStorage) cuando exista.

## Notas de desarrollo (Windows)
- Si aparece `webpack.cache.PackFileCacheStrategy` con `EPERM` al renombrar `.next/cache`, elimina la carpeta `.next/cache` y reinicia con `npm run dev:clean`. Excluir `.next/cache` del antivirus/Defender ayuda a evitar el bloqueo de archivos.
- También puedes usar `npm run clean` para limpiar `.next` y su cache de forma cross‑platform antes de volver a arrancar el servidor.
