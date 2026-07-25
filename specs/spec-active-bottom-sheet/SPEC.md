---
id: SPEC-active-bottom-sheet
issue: https://github.com/org/lifty/issues/132
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.

# Bottom sheet deslizable con metricas en ActiveScreen

## Why

`ActiveScreen.tsx` tiene un `floatingCard` fijo con solo el toggle online/offline y texto "Conectado"/"Desconectado". Como conductora en viaje, deberias poder ver metricas rapidas (viajes, ganancias, tiempo online) sin salir del mapa.

## What changes

### Nueva dependencia: `react-native-reanimated`

Se instala `react-native-reanimated` (compatible con Expo SDK 54) para animaciones en el UI thread. No se instala `@gorhom/bottom-sheet` ni `react-native-gesture-handler`.

### Nuevo componente: `BottomSheet`

Archivo: `src/components/BottomSheet.tsx`

Componente generico de bottom sheet con dos snap points configurables:
- Usa `useSharedValue`, `useAnimatedStyle`, `withSpring` de reanimated
- Gesture: `Gesture.Pan()` de reanimated (v2+)
- Props: `snapPoints: [collapsed, expanded]`, `children`, callbacks opcionales
- Snap points en valores absolutos (px) calculados desde el bottom
- El sheet se renderiza como `Animated.View` con `position: absolute`, anclado al bottom
- No usa `PanResponder` de RN core — usa el API gestural de reanimated

### Sheet en ActiveScreen — comportamiento

| Estado | Altura | Contenido |
|--------|--------|-----------|
| Colapsado | ~100px | Fila con badge "Conectado" + Toggle online/offline |
| Expandido | 45% pantalla | 4 metricas + boton "Ver ganancias" |

**Colapsado**: el sheet muestra solo la fila del toggle. El resto del contenido esta oculto (opacity 0) o recortado por la altura.
**Expandido**: al deslizar hacia arriba, el sheet crece hasta 45% de la pantalla. Muestra las metricas completas.
**Fondo**: overlay semi-transparente (rgba negro) que aparece/desaparece con la expansion.

### Metricas (panel expandido)

1. **Viajes completados hoy** — `trip_count` de `GET /drivers/me/earnings/daily`
2. **Ganancias acumuladas hoy** — `total` del mismo endpoint, formateado como `$X.XXX,XX`
3. **Tiempo online** — calculado localmente desde timestamp persistido, formato `HH:MM`
4. **Tasa de aceptacion** — placeholder con "--" (pendiente para otro issue)

### Boton "Ver ganancias"

Al pie del panel expandido, boton `primary` que navega a `Earnings`.

### Persistencia del tiempo online

Cambios en `src/store/onlineStore.ts`:

```typescript
interface OnlineState {
  isOnline: boolean;
  onlineSince: number | null; // timestamp Unix ms
  heartbeatIntervalRef: ReturnType<typeof setInterval> | null;
  setOnline: (value: boolean) => void;
  setOnlineSince: (ts: number | null) => void;
  setHeartbeatRef: (ref: ReturnType<typeof setInterval> | null) => void;
}
```

**Al conectarse** (OnlineScreen → navigate Active): se guarda `onlineSince = Date.now()` en el store y en `AsyncStorage.setItem('onlineSince', String(ts))`.

**Al desconectarse** (toggle off): se limpia `onlineSince = null` en store y `AsyncStorage.removeItem('onlineSince')`.

**Reconciliacion en mount de ActiveScreen**: si `isOnline === true` pero `onlineSince === null`:
1. Leer `AsyncStorage.getItem('onlineSince')`
2. Si hay valor → restaurarlo en el store
3. Si no hay valor → `onlineSince = Date.now()` y persistir

Esto cubre el caso de crash/cierre de app: el timestamp persiste en AsyncStorage y se restaura al reabrir.

### Actualizacion de metricas

Uso de `useQuery` de tanstack/react-query:
- `queryKey: ['earnings-daily']` — mismo que `EarningsScreen`, comparte cache
- `refetchInterval: 60_000`
- Solo se ejecuta cuando el sheet esta expandido (evitar fetch innecesario en estado colapsado)

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `package.json` | Agregar `react-native-reanimated` |
| `src/components/BottomSheet.tsx` | **Nuevo** — componente generico |
| `src/screens/ActiveScreen.tsx` | Reemplazar `floatingCard` por BottomSheet |
| `src/store/onlineStore.ts` | Agregar `onlineSince` y `setOnlineSince` |

### Archivos NO modificados

- `EarningsScreen.tsx` — sin cambios, la cache de react-query se comparte
- `Toggle.tsx` — sin cambios, se reusa dentro del sheet
- `api/client.ts`, `api/types.ts` — sin cambios, el endpoint ya existe
