# Lazy Loading de Mapas - Implementación

## Resumen

Se ha implementado lazy loading para los mapas usando Intersection Observer API. Los mapas ahora solo se cargan cuando son visibles en la pantalla, mejorando significativamente el rendimiento.

## Cambios Realizados

### 1. LocationMap.tsx (Componente Wrapper)

**Archivo**: `src/components/public-profile/LocationMap.tsx`

Se transformó de un simple wrapper de `next/dynamic` a un componente completo con lazy loading:

```typescript
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

const LocationMapClient = dynamic(() => import("./LocationMapClient"), { ssr: false });
```

**Características implementadas**:

- ✅ **Intersection Observer**: Detecta cuando el mapa entra en el viewport
- ✅ **Preload anticipado**: Carga el mapa 50px antes de ser visible (`rootMargin: "50px"`)
- ✅ **Estado persistente**: Una vez cargado, el mapa permanece renderizado
- ✅ **Fallback gracioso**: Carga inmediata si IntersectionObserver no está disponible
- ✅ **Placeholder elegante**: Muestra un skeleton animado mientras carga

### 2. Flujo de Carga

```
Usuario abre página
    ↓
Mapa NO visible → Muestra placeholder
    ↓
Usuario hace scroll
    ↓
Mapa entra en zona de carga (50px antes)
    ↓
IntersectionObserver detecta visibilidad
    ↓
Se carga LocationMapClient (Leaflet)
    ↓
Mapa se renderiza
    ↓
Observer se desconecta (optimización)
```

### 3. Beneficios de Rendimiento

**Antes**:
- Leaflet se cargaba inmediatamente al abrir la página
- ~200KB+ de JavaScript cargados sin necesidad
- Múltiples mapas en discover.tsx se cargaban todos a la vez

**Después**:
- Leaflet solo se carga cuando el mapa es visible
- Carga diferida reduce el bundle inicial
- Mejora en tiempo de carga de página inicial
- Reduce uso de memoria en páginas con múltiples mapas

### 4. Uso en la Aplicación

El componente se usa en dos lugares principales:

1. **PublicLocationBadge.tsx**: Modal de ubicación del perfil público
2. **discover.tsx**: Panel de filtros con mapa de búsqueda por distancia

En ambos casos, el lazy loading funciona automáticamente:

```tsx
<LocationMap 
  geohash={geohash} 
  radiusKm={radiusKm} 
  onMapReady={handleMapReady} 
/>
```

### 5. Configuración de IntersectionObserver

```typescript
{
  rootMargin: "50px",    // Carga 50px antes de ser visible
  threshold: 0.01,       // Activa cuando el 1% es visible
}
```

### 6. Compatibilidad

- ✅ Navegadores modernos con IntersectionObserver
- ✅ Fallback automático para navegadores antiguos
- ✅ Funciona tanto en desktop como mobile
- ✅ Compatible con SSR (Next.js)

## Componentes Relacionados

### LocationMapClient.tsx
- Componente que renderiza el mapa Leaflet
- Incluye optimizaciones de invalidación
- Manejo seguro de errores de geohash

### LocationMap.tsx
- Wrapper con lazy loading
- Gestión de visibilidad
- Placeholder durante carga

## Testing

Para probar la implementación:

1. Abrir `/discover` en el navegador
2. Abrir DevTools → Network tab
3. Filtrar por "chunk" o "leaflet"
4. Observar que Leaflet NO se carga hasta hacer scroll al mapa
5. Hacer scroll hasta el panel de filtros
6. Ver cómo Leaflet se carga justo antes de que el mapa sea visible

## Próximas Mejoras Posibles

1. **Prefetch en hover**: Cargar el mapa cuando el usuario hace hover sobre el botón
2. **Cache de tiles**: Implementar service worker para cachear tiles del mapa
3. **Progressive loading**: Cargar primero una versión estática, luego interactiva
4. **Analytics**: Medir cuántos usuarios realmente ven los mapas

## Conclusión

La implementación de lazy loading reduce significativamente el tamaño del bundle inicial y mejora la experiencia del usuario al cargar recursos solo cuando son necesarios.
