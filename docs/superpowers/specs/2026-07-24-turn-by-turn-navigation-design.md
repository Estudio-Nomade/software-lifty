# Turn-by-turn navigation instructions

**Issue**: [#139](https://github.com/martiyaquinta/software-lifty/issues/139)
**Date**: 2026-07-24

## Contexto

Actualmente el backend (`GET /maps/directions`) retorna solo `{distance_km, duration_minutes, polyline}`. El frontend dibuja la polyline en el mapa, muestra ETA y distancia, pero no hay indicaciones paso a paso ("gira a la derecha en 200m", etc.). Las maniobras se delegan a Waze/Google Maps.

El backend consulta OSRM con `steps=true` (para scoring de rutas), pero no expone los steps al frontend.

## Objetivo

Mostrar la instrucción de navegación actual en ambos flujos (rumbo al pasajero y viaje en curso), actualizada en tiempo real según la posición GPS del conductor.

## Diseño

### Backend — `GET /maps/directions`

Ampliar la respuesta con un campo `steps: ManeuverStep[]`.

#### Tipo nuevo — `ManeuverStep`

```ts
interface ManeuverStep {
  maneuver_type: string;       // OSRM: 'turn', 'roundabout', 'merge', 'fork', 'depart', 'arrive'...
  maneuver_modifier?: string;  // OSRM: 'left', 'right', 'slight left', 'sharp right', 'straight'...
  name: string;                // nombre de calle (vacio si no hay)
  distance: number;            // metros de este step
  geometry: string;            // polyline codificada del step (OSRM encoded polyline)
}
```

#### Cambios en `src/shared/lib/geo.ts`

- Extender `DirectionsResult` con `steps: ManeuverStep[]`.
- Extender `OSRMStep` con `geometry: string`.
- En `directions()`, despues de seleccionar la mejor ruta con `scoreRoute()`, extraer `legs[0].steps` y filtrar steps con `distance < 50m`.
- Mapear cada step a `ManeuverStep`.
- Si no hay steps (ej. fallback haversine), devolver `steps: []`.

#### Tests

Actualizar `maps.test.ts` — verificar que el mock de direcciones incluye steps.

### Mobile — `src/lib/maneuver.ts` (NUEVO)

Módulo con dos funciones:

```ts
function maneuverToText(type: string, modifier?: string): string
// Mapea tipo OSRM → texto en espanol.
// Ej: ('turn', 'left') → "Girar a la izquierda"
//     ('turn', 'right') → "Girar a la derecha"
//     ('turn', 'slight left') → "Girar ligeramente a la izquierda"
//     ('roundabout', undefined) → "Tomar la rotonda"
//     ('merge', undefined) → "Incorporarse"
//     ('fork', 'left') → "Mantenerse a la izquierda"
//     ('depart', undefined) → ""
//     ('arrive', 'left') → "Destino a la izquierda"
//     ('arrive', 'right') → "Destino a la derecha"
//     ('arrive', undefined) → "Llegando a destino"
//     (default) → "Continuar"

function getStepEndpoint(encodedGeometry: string): [number, number]
// Decodifica la polyline del step y retorna la ULTIMA coordenada [lng, lat].
// Ese punto es donde ocurre la maniobra.
```

### Mobile — `src/hooks/useManeuverInstructions.ts` (NUEVO)

```ts
interface ManeuverStep {
  maneuver_type: string;
  maneuver_modifier?: string;
  name: string;
  distance: number;
  geometry: string;
}

function useManeuverInstructions(
  steps: ManeuverStep[],
  lat: number | null,
  lng: number | null,
): { instruction: string | null }
```

**Lógica:**

1. Si `steps` esta vacio o `lat`/`lng` es null → `{ instruction: null }`.
2. Mantiene `currentStepIndex` via `useRef(0)`.
3. En cada render:
   - Toma el step actual (`steps[currentStepIndex]`).
   - Calcula el endpoint de la maniobra con `getStepEndpoint(step.geometry)`.
   - Calcula distancia del conductor al endpoint con `haversineDistance`.
   - Si distancia < 20m → incrementa `currentStepIndex` para el proximo render.
   - Construye instruction: `"En {X}m, {accion} en {calle}"` (o sin calle si `name` esta vacio).
   - Si no hay mas steps, retorna `null`.
4. El hook no tiene estado React propio (usa `useRef` para el indice), por lo que no causa re-renders extra. La instruction se recalcula en cada render (cuando `lat`/`lng` cambian, el componente padre re-renderea).

**Casos borde:**
- Step `depart` (indice 0): se saltea automaticamente, arranca en indice 1.
- Step `arrive` (ultimo): muestra "Llegando a destino" y no avanza mas.
- Steps sin `geometry`: se ignoran (el endpoint es null, no se puede calcular distancia).
- GPS perdido (`lat`/`lng` null): mantiene la ultima instruccion conocida (no resetea `currentStepIndex`).
- Nuevo fetch de directions (cambio de ruta): resetea `currentStepIndex` a 0 cuando la cantidad de steps del array cambia (se detecta con un length previo guardado en ref).

### Mobile — Cambios en pantallas

#### `NavigationScreen.tsx`

1. Extraer `steps` de la respuesta de `fetchDirections`:
   ```ts
   const steps = data.steps ?? [];
   ```
2. Usar el hook:
   ```ts
   const { instruction } = useManeuverInstructions(steps, locationLat, locationLng);
   ```
3. Mostrar en `bottomCard`, entre ETA y los botones de accion:
   ```tsx
   {instruction ? <Text style={styles.instruction}>{instruction}</Text> : null}
   ```

#### `TripInProgressScreen.tsx`

Idem a NavigationScreen. La instruccion se muestra entre la direccion destino y la barra de progreso.

#### Estilos

```ts
instruction: {
  fontSize: theme.fontSize.md,
  fontWeight: theme.fontWeight.medium,
  color: theme.colors.turquoise,
  backgroundColor: 'rgba(0, 194, 179, 0.08)',
  borderRadius: theme.radius.sm,
  paddingVertical: theme.spacing.sm,
  paddingHorizontal: theme.spacing.md,
  marginTop: theme.spacing.xs,
}
```

### No incluido

- Sintesis de voz (TTS) — scope futuro.
- Iconos de maniobra — se evalua despues del feedback inicial.

## Archivos modificados/creados

| Archivo | Accion |
|---------|--------|
| `apps/backend/src/shared/lib/geo.ts` | Modificar — agregar `ManeuverStep`, extender `DirectionsResult`, exponer steps |
| `apps/backend/src/features/maps/maps.test.ts` | Modificar — actualizar mock y asserts para steps |
| `apps/mobile/src/lib/maneuver.ts` | Crear |
| `apps/mobile/src/lib/polyline.ts` | Sin cambios (reusar `decodePolyline`) |
| `apps/mobile/src/hooks/useManeuverInstructions.ts` | Crear |
| `apps/mobile/src/screens/NavigationScreen.tsx` | Modificar — integrar hook y mostrar instruccion |
| `apps/mobile/src/screens/TripInProgressScreen.tsx` | Modificar — integrar hook y mostrar instruccion |
