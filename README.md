# NOVSY

Chat tipo WhatsApp para creadores y fans (versión preliminar).

## Cómo arrancar el proyecto

```bash
npm install
npm run dev
```

La app se levanta en modo desarrollo en `http://localhost:3000`.

### Windows – Watchpack
Si ves errores tipo `Watchpack Error (initial scan) EINVAL lstat C:\DumpStack.log.tmp` (o hiberfil.sys/pagefile.sys/swapfile.sys) al hacer `npm run dev`, crea un `.env.local` con:
```
WATCHPACK_POLLING=true
```
Reinicia el dev-server. Esto activa polling y evita que el watcher intente leer esos ficheros de sistema.

### Base de datos (SQLite)
- Usa una única base en `prisma/dev.db` con `DATABASE_URL="file:./prisma/dev.db"` (CLI y runtime comparten la misma ruta).
- Si cambias la ruta, apunta siempre a un único fichero y vuelve a ejecutar `npx prisma migrate deploy && npx prisma generate`.

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
