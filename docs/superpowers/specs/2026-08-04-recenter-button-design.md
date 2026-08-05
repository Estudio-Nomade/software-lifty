# Botón de Recentrado — ActiveScreen

## Resumen
Agregar un botón flotante de recentrado en el mapa de la pantalla ActiveScreen (Conectado) que permite al conductor volver a centrar el mapa en su ubicación GPS actual con animación fly-to.

## Enfoque
Botón overlay React Native sobre el mapa WebView, sin modificar la UI del WebView.

## Cambios

### 1. `ActiveScreen.tsx` — Nuevo botón overlay
- Posición: `position: absolute`, `bottom: 200`, `right: theme.spacing.md`
- Círculo 48x48 blanco con sombra, ícono Ionicons `locate-outline` turquesa 24px
- Visibilidad condicional: solo cuando el mapa está descentrado de la ubicación real (> ~10m)
- Handler: envía mensaje `recenter` al WebView con lat/lng actuales

### 2. `MapView.tsx` + `mapHtml.ts` — Nuevo mensaje `recenter`
- WebView recibe `{ type: 'recenter', lat, lng }` 
- Ejecuta `map.flyTo({ center: [lng, lat], zoom: 15, duration: 600 })`
- Ambos archivos (duplicación existente pre-refactor) deben recibir el cambio

### 3. Lógica de visibilidad
- El mapa ya emite `moveend` con `{ center: {lng, lat} }` a cada movimiento
- `ActiveScreen` almacena el último `center` del mapa en estado local
- Compara distancia entre `mapCenter` y `(locationLat, locationLng)` usando fórmula de Haversine
- Umbral: ~10m → mostrar botón si distancia > umbral

## No requiere
- No se modifica el generador HTML del mapa (sin nuevos elementos en el WebView)
- No se tocan iconos/estilos del WebView
- No cambios en librerías ni dependencias
