# NOVSY

Chat tipo WhatsApp para creadores y fans (versión preliminar).

## Cómo arrancar el proyecto

```bash
npm install
npm run dev
```

La app se levanta en modo desarrollo en `http://localhost:3000`.

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
- Incluye botón “Entrar al chat privado” que navega a `/`.

## Ajustes del creador
- La barra superior de la app ahora es la barra del creador (avatar, nombre, estado, enlace al perfil público y menú de ajustes).
- El panel es accesible desde el menú de tres puntos de esa barra (arriba a la izquierda) para editar nombre, subtítulo y descripción del creador.
- Permite cambiar textos de respuestas rápidas y editar nombre, precio y descripción de los packs.
- Los cambios se guardan en `localStorage` bajo la clave `novsy_creator_config` y afectan tanto al chat (`/`) como a la página pública (`/creator`) en ese navegador.
