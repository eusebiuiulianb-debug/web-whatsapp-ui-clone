# Fix "Abrir chat" - Resumen de cambios

## Problema identificado
- Botón "Abrir chat" navegaba a `/fan/fan-XXXXXXXX` en lugar de `/c/{handle}`
- Causado por uso de `/go/{handle}` que redirigía incorrectamente
- Click requería múltiples intentos o no navegaba

## Solución implementada

### 1. Nuevo helper de chat href ✅
**Archivo:** `src/lib/chatHref.ts` (NUEVO)

```typescript
export function buildCreatorChatHref(creatorHandle: string, returnTo?: string): string
```

- Siempre genera `/c/{handle}?returnTo=...`
- NUNCA usa `/fan/` o `/go/`
- Incluye returnTo para navegación de retorno

### 2. PopClipTile - Botón en cards ✅
**Archivo:** `src/components/popclips/PopClipTile.tsx`

**Cambios:**
- ❌ Eliminado: `<Link href={chatHref}>` (navegación inconsistente)
- ✅ Agregado: `<button onClick={...}>` con stopPropagation
- ✅ Usa `buildCreatorChatHref(item.creator.handle, window.location.pathname)`
- ✅ Integra gating +18: si `creator.isAdult && !adultOk` → modal → confirma → navega
- ✅ Debug log en desarrollo: `[PopClipTile] Abrir chat { handle, href }`

**Código del botón:**
```typescript
onClick={(e) => {
  e.preventDefault();
  e.stopPropagation();
  
  const correctChatHref = buildCreatorChatHref(
    item.creator.handle,
    window.location.pathname
  );
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[PopClipTile] Abrir chat', { handle, href: correctChatHref });
  }
  
  const requiresGating = Boolean(item.creator.isAdult);
  
  if (requiresGating && !adultOk) {
    setChatGateOpen(true); // Modal → confirma → navega
  } else {
    void router.push(correctChatHref);
  }
}}
```

### 3. PopClipViewer - Botón en modal ✅
**Archivo:** `src/components/popclips/PopClipViewer.tsx`

**Cambios:**
- ✅ Usa `buildCreatorChatHref(activeItem.creator.handle, returnPath)`
- ✅ NO llama `handleClose()` antes de navegar (evita race condition)
- ✅ Deja que el cambio de ruta desmonte el viewer automáticamente
- ✅ Debug log en desarrollo: `[PopClipViewer] Abrir chat { handle, href }`

**Código del handler:**
```typescript
const handleChatClick = () => {
  const correctChatHref = buildCreatorChatHref(
    activeItem.creator.handle,
    getViewerReturnPath() || window.location.pathname
  );
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[PopClipViewer] Abrir chat', { handle, href: correctChatHref });
  }
  
  if (requiresAdultGate) {
    requireAdultGate(() => {
      void router.push(correctChatHref); // NO handleClose
    });
    return;
  }
  
  void router.push(correctChatHref);
};
```

### 4. Explore page - Props corregidas ✅
**Archivo:** `src/pages/explore/index.tsx`

**Cambios:**
- ❌ Eliminado: `appendReturnTo(\`/go/${handle}\`, returnToPath)`
- ✅ Reemplazado: `buildCreatorChatHref(item.creator.handle, returnToPath)`

**En PopClipTile:**
```typescript
chatHref={buildCreatorChatHref(item.creator.handle, returnToPath)}
```

**En PopClipViewer:**
```typescript
buildChatHref={(item) => buildCreatorChatHref(item.creator.handle, returnToPath)}
```

## Criterios de aceptación - CUMPLIDOS ✅

### ✅ 1. Click navega siempre con 1 solo click
- Botón con `preventDefault()` y `stopPropagation()`
- No interferencia con onClick del card
- `z-index: 20` relativo para estar por encima de overlays

### ✅ 2. Ruta correcta SIEMPRE
- **ANTES:** `/fan/fan-XXXXXXXX` o `/go/{handle}`
- **AHORA:** `/c/{handle}?returnTo=%2Fexplore`
- Verificado en cards Y en viewer

### ✅ 3. Gating +18 integrado
- Si `creator.isAdult && !adultOk`: muestra modal
- Al confirmar: persiste en store + navega
- Al cancelar: cierra sin navegar
- Funciona en cards y viewer

### ✅ 4. Debug logs en desarrollo
- Console logs activos en NODE_ENV=development
- Muestra: `{ handle, href, propChatHref }`
- Permite verificar rutas en tiempo real

### ✅ 5. Thumbnail sigue abriendo viewer
- No afectado por cambios
- onClick del media container intacto
- Botón "Abrir chat" stopPropagation previene conflicto

### ✅ 6. Build exitoso
- `npm run build` pasa sin errores
- TypeScript válido
- No regresiones

## Verificación en navegador (desarrollo)

Abrir consola y verificar:
1. Click "Abrir chat" en card → log muestra `/c/{handle}?returnTo=...`
2. URL cambia a `/c/{handle}` y renderiza página de chat
3. Si creator isAdult y !adultOk → aparece modal 18+
4. Confirmar modal → log muestra href → navega correctamente
5. **NUNCA** aparece `/fan/fan-...` en URL

## Archivos modificados

### Nuevos:
- `src/lib/chatHref.ts` - Helper centralizado para chat hrefs

### Modificados:
- `src/components/popclips/PopClipTile.tsx` - Botón con stopPropagation + gating
- `src/components/popclips/PopClipViewer.tsx` - Handler corregido sin handleClose
- `src/pages/explore/index.tsx` - Props usan buildCreatorChatHref

## Gating +18 - Estado actual

### Archivos del sistema completo:
1. `src/store/useAdultGate.ts` - Store persistente con TTL (7 días)
2. `src/components/gating/AdultGateHydrator.tsx` - Hidrata al montar app
3. `src/components/gating/AdultGate.tsx` - Wrapper que previene render de children
4. `src/components/modals/AdultGateModal.tsx` - Modal confirmación 18+
5. `src/hooks/useAdultGate.tsx` - Hook que integra store + cookie
6. `src/lib/navigation.ts` - Helpers para scroll + returnTo
7. `src/lib/chatHref.ts` - Helper para chat hrefs correctos

### Características:
✅ Persistencia localStorage con TTL 7 días
✅ No pide 18+ múltiples veces
✅ Video NO se precarga si shouldGate=true
✅ preload="none" en todos los videos
✅ videoSrc vacío cuando gating activo
✅ Navegación preserva scroll y estado
