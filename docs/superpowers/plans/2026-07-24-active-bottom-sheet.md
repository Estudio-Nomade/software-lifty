# Bottom Sheet + Metricas en ActiveScreen — Implementation Plan

> **Para agentes:** Usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan paso a paso. Cada paso usa checkbox (`- [ ]`) para tracking.

**Goal:** Reemplazar el floatingCard fijo de ActiveScreen por un bottom sheet deslizable con dos snap points (colapsado ~100px, expandido 45%), que muestra toggle online/offline colapsado y metricas (viajes, ganancias, tiempo online) al expandirse.

**Architecture:** Un componente generico `BottomSheet` usa `react-native-reanimated` (Gesture.Pan + useAnimatedStyle + withSpring) para animar entre dos snap points. `ActiveScreen` reemplaza su `floatingCard` por este sheet. El tiempo online se persiste en `onlineStore` + `AsyncStorage` para sobrevivir crashes.

**Tech Stack:** React Native `Animated` → `react-native-reanimated`, zustand, AsyncStorage, tanstack/react-query, expo-router

**Spec:** `specs/spec-active-bottom-sheet/SPEC.md`
**Issue:** #132

## Global Constraints

- Expo SDK 54, react-native-reanimated (sin @gorhom/bottom-sheet ni react-native-gesture-handler adicional)
- Sheet colapsado: ~100px. Expandido: 45% pantalla (via `Dimensions.get('window').height`)
- Tiempo online persiste en AsyncStorage, se reconcilia en mount
- Metricas usan `useQuery` con `queryKey: ['earnings-daily']` (comparte cache con EarningsScreen)
- Estilos: solo `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*`, `theme.radius.*`
- Named exports, `StyleSheet.create()`, sin default exports

---

### Task 1: Instalar react-native-reanimated

**Files:**
- Modify: `apps/mobile/package.json`

**Produces:** `react-native-reanimated` disponible como dependencia.

- [ ] **Step 1: Instalar la dependencia**

```bash
bun --filter @lifty/mobile add react-native-reanimated
```

- [ ] **Step 2: Verificar instalacion**

```bash
grep reanimated apps/mobile/package.json
```

Expected: muestra la linea con `"react-native-reanimated"` en `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/bun.lockb
git commit -m "chore(mobile): add react-native-reanimated for bottom sheet"
```

---

### Task 2: Agregar onlineSince al onlineStore con persistencia en AsyncStorage

**Files:**
- Modify: `apps/mobile/src/store/onlineStore.ts`

**Interfaces:**
- Consumes: `AsyncStorage` from `@react-native-async-storage/async-storage` (ya instalado)
- Produces: `useOnlineStore` expone `onlineSince: number | null`, `setOnlineSince(ts: number | null)`, `setOnline` actualizado para guardar/limpiar AsyncStorage

- [ ] **Step 1: Actualizar onlineStore.ts**

Leer el archivo actual y reemplazar todo su contenido:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const ONLINE_SINCE_KEY = 'lifty_online_since';

interface OnlineState {
  isOnline: boolean;
  onlineSince: number | null;
  heartbeatIntervalRef: ReturnType<typeof setInterval> | null;
  setOnline: (value: boolean) => void;
  setOnlineSince: (ts: number | null) => void;
  setHeartbeatRef: (ref: ReturnType<typeof setInterval> | null) => void;
}

export const useOnlineStore = create<OnlineState>()((set) => ({
  isOnline: false,
  onlineSince: null,
  heartbeatIntervalRef: null,
  setOnline: (isOnline) => {
    if (isOnline) {
      const now = Date.now();
      AsyncStorage.setItem(ONLINE_SINCE_KEY, String(now)).catch(() => {});
      set({ isOnline: true, onlineSince: now });
    } else {
      AsyncStorage.removeItem(ONLINE_SINCE_KEY).catch(() => {});
      set({ isOnline: false, onlineSince: null });
    }
  },
  setOnlineSince: (onlineSince) => set({ onlineSince }),
  setHeartbeatRef: (heartbeatIntervalRef) => set({ heartbeatIntervalRef }),
}));
```

- [ ] **Step 2: Verificar que compila**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: sin errores de tipo.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/store/onlineStore.ts
git commit -m "feat(mobile): add onlineSince to onlineStore with AsyncStorage persistence"
```

---

### Task 3: Crear componente BottomSheet

**Files:**
- Create: `apps/mobile/src/components/BottomSheet.tsx`

**Interfaces:**
- Consumes: `react-native-reanimated` (Gesture, useSharedValue, useAnimatedStyle, withSpring, runOnJS)
- Produces: `<BottomSheet snapPoints={[collapsed, expanded]} onSnapChange={(idx) => ...}>`

- [ ] **Step 1: Crear el componente BottomSheet.tsx**

```typescript
import type React from 'react';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-reanimated';
import { theme } from '../theme';

interface BottomSheetProps {
  snapPoints: [number, number];
  children: React.ReactNode;
  onSnapChange?: (index: number) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SPRING_CONFIG = {
  damping: 50,
  stiffness: 300,
  mass: 0.5,
};

export const BottomSheet: React.FC<BottomSheetProps> = ({
  snapPoints,
  children,
  onSnapChange,
}) => {
  const [collapsedHeight, expandedHeight] = snapPoints;
  const maxTranslateY = SCREEN_HEIGHT - collapsedHeight;
  const minTranslateY = SCREEN_HEIGHT - expandedHeight;

  const translateY = useSharedValue(maxTranslateY);
  const [snapIndex, setSnapIndex] = useState(0);

  const snapTo = (index: number) => {
    'worklet';
    const target = index === 0 ? maxTranslateY : minTranslateY;
    translateY.value = withSpring(target, SPRING_CONFIG);
  };

  const onSnap = (index: number) => {
    'worklet';
    runOnJS(setSnapIndex)(index);
    if (onSnapChange) {
      runOnJS(onSnapChange)(index);
    }
  };

  const contextY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      const candidate = contextY.value + event.translationY;
      translateY.value = Math.max(minTranslateY, Math.min(maxTranslateY, candidate));
    })
    .onEnd((event) => {
      const currentY = translateY.value;
      const threshold = (maxTranslateY + minTranslateY) / 2;

      if (event.velocityY < -500) {
        snapTo(1);
        onSnap(1);
      } else if (event.velocityY > 500) {
        snapTo(0);
        onSnap(0);
      } else if (currentY < threshold) {
        snapTo(1);
        onSnap(1);
      } else {
        snapTo(0);
        onSnap(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: (maxTranslateY - translateY.value) / (maxTranslateY - minTranslateY),
  }));

  const sheetHeight = expandedHeight;

  const handleOverlayPress = () => {
    snapTo(0);
    onSnap(0);
  };

  const tapGesture = Gesture.Tap().onEnd(handleOverlayPress);

  return (
    <>
      <GestureDetector gesture={tapGesture}>
        <Animated.View
          style={[
            styles.overlay,
            overlayStyle,
            { pointerEvents: snapIndex === 1 ? 'auto' : 'none' },
          ]}
        />
      </GestureDetector>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheet, animatedStyle, { height: sheetHeight }]}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.mediumGray,
  },
});
```

- [ ] **Step 2: Verificar typecheck**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: sin errores. Si falla por imports de `react-native-reanimated`, verificar que `Gesture` y `GestureDetector` se importen correctamente.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/BottomSheet.tsx
git commit -m "feat(mobile): add BottomSheet component with reanimated gesture"
```

---

### Task 4: Reemplazar floatingCard por BottomSheet en ActiveScreen

**Files:**
- Modify: `apps/mobile/src/screens/ActiveScreen.tsx`

**Interfaces:**
- Consumes: `BottomSheet`, `useOnlineStore` (con `onlineSince`), `useQuery` de tanstack, `apiClient`
- Produces: Sheet colapsado con toggle + "Conectado", expandido con metricas + boton "Ver ganancias"

- [ ] **Step 1: Escribir el nuevo ActiveScreen.tsx**

Reemplazar el contenido completo de `apps/mobile/src/screens/ActiveScreen.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import type { EarningsDaily } from '../api/types';
import { BottomSheet } from '../components/BottomSheet';
import { MapView } from '../components/MapView';
import { SideMenu } from '../components/SideMenu';
import { Toggle } from '../components/Toggle';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { startTracking, stopTracking } from '../lib/location';
import { subscribeToDriverChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 100;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.45;
const ONLINE_SINCE_KEY = 'lifty_online_since';

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatOnlineTime = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const ActiveScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const setOnline = useOnlineStore((s) => s.setOnline);
  const onlineSince = useOnlineStore((s) => s.onlineSince);
  const setOnlineSince = useOnlineStore((s) => s.setOnlineSince);
  const driverId = useAuthStore((s) => s.driverId);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [onlineTime, setOnlineTime] = useState(0);
  const disconnectedRef = useRef(false);
  const signOut = useSignOut();

  useEffect(() => {
    const reconcile = async () => {
      if (onlineSince) return;
      try {
        const stored = await AsyncStorage.getItem(ONLINE_SINCE_KEY);
        if (stored) {
          const ts = Number(stored);
          if (!Number.isNaN(ts)) setOnlineSince(ts);
        } else {
          const now = Date.now();
          setOnlineSince(now);
          AsyncStorage.setItem(ONLINE_SINCE_KEY, String(now)).catch(() => {});
        }
      } catch {}
    };
    reconcile();
  }, []);

  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      apiClient.put('/drivers/me/heartbeat').catch(() => {});
    }, 30_000);
    useOnlineStore.getState().setHeartbeatRef(heartbeatInterval);

    startTracking();

    return () => {
      if (!disconnectedRef.current) {
        clearInterval(heartbeatInterval);
        useOnlineStore.getState().setHeartbeatRef(null);
        stopTracking();
      }
    };
  }, []);

  useEffect(() => {
    if (!driverId) return;

    const unsubscribe = subscribeToDriverChannel(driverId, () => {
      navigation.navigate('IncomingRequest');
    });

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await apiClient.get('/trips/active');
        if (data && data.status === 'request_received') {
          navigation.navigate('IncomingRequest');
        }
      } catch {}
    }, 5_000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [driverId, navigation]);

  useEffect(() => {
    if (!onlineSince) return;
    setOnlineTime(Date.now() - onlineSince);
    const interval = setInterval(() => {
      setOnlineTime(Date.now() - onlineSince);
    }, 30_000);
    return () => clearInterval(interval);
  }, [onlineSince]);

  const handleToggle = useCallback(
    async (newValue: boolean) => {
      if (newValue) return;

      setToggleError(null);

      try {
        await apiClient.put('/drivers/me/online', { is_online: false });
        setOnline(false);
        disconnectedRef.current = true;

        const ref = useOnlineStore.getState().heartbeatIntervalRef;
        if (ref) clearInterval(ref);
        useOnlineStore.getState().setHeartbeatRef(null);

        stopTracking();

        navigation.replace('Online');
      } catch (err: unknown) {
        setToggleError(err instanceof Error ? err.message : 'Error al cambiar estado');
      }
    },
    [setOnline, navigation],
  );

  const { data: earnings } = useQuery<EarningsDaily>({
    queryKey: ['earnings-daily'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/earnings/daily');
      return response.data.data ?? response.data;
    },
    refetchInterval: 60_000,
    enabled: sheetExpanded,
  });

  const handleSnapChange = useCallback((index: number) => {
    setSheetExpanded(index === 1);
  }, []);

  const menuItems = useMemo(
    () => [
      {
        label: 'Inicio',
        icon: '🏠',
        onPress: () => {},
      },
      {
        label: 'Ganancias',
        icon: '💰',
        onPress: () => navigation.navigate('Earnings'),
      },
      {
        label: 'Metodo de cobro',
        icon: '💳',
        onPress: () => navigation.navigate('PaymentMethod'),
      },
      {
        label: 'Perfil',
        icon: '👤',
        onPress: () => navigation.navigate('Profile'),
      },
      {
        label: 'Historial de viajes',
        icon: '📋',
        onPress: () => navigation.navigate('TripHistory'),
      },
      {
        label: 'Cerrar sesion',
        icon: '🚪',
        onPress: () => signOut.mutateAsync(),
        danger: true,
        dividerTop: true,
      },
    ],
    [navigation, signOut],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />

      <MapView style={StyleSheet.absoluteFill as any} followUserLocation />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.menuButton}
          activeOpacity={0.7}
          onPress={() => setMenuVisible(true)}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <View style={styles.connectedBadge}>
            <Text style={styles.connectedBadgeText}>Conectado</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarButton}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.avatarText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <BottomSheet snapPoints={[COLLAPSED_HEIGHT, EXPANDED_HEIGHT]} onSnapChange={handleSnapChange}>
        <View style={styles.sheetContent}>
          <View style={styles.toggleRow}>
            <Text style={styles.statusOnline}>Estas conectado</Text>
            <Toggle value={true} onToggle={handleToggle} />
          </View>
          <Text style={styles.statusOffline}>Desconectado</Text>
          {toggleError && <Text style={styles.errorText}>{toggleError}</Text>}

          <View style={styles.metricsContainer}>
            <Text style={styles.metricsTitle}>Resumen de hoy</Text>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Viajes completados</Text>
              <Text style={styles.metricValue}>{earnings?.trip_count ?? '--'}</Text>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Ganancias acumuladas</Text>
              <Text style={styles.metricValue}>
                {earnings ? formatCurrency(earnings.total) : '--'}
              </Text>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Tiempo online</Text>
              <Text style={styles.metricValue}>{formatOnlineTime(onlineTime)}</Text>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Tasa de aceptacion</Text>
              <Text style={[styles.metricValue, { color: theme.colors.mediumGray }]}>--</Text>
            </View>

            <TouchableOpacity
              style={styles.earningsButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Earnings')}
            >
              <Text style={styles.earningsButtonText}>Ver ganancias</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} menuItems={menuItems} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    zIndex: 10,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  connectedBadge: {
    backgroundColor: theme.colors.turquoise,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 4,
  },
  connectedBadgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: theme.fontWeight.medium,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  statusOnline: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  statusOffline: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  metricsContainer: {
    width: '100%',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  metricsTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  metricLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  metricValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  earningsButton: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.turquoise,
    borderRadius: theme.radius.buttonRadius,
    height: theme.dimensions.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
});
```

- [ ] **Step 2: Verificar typecheck**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: sin errores de tipo.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/ActiveScreen.tsx
git commit -m "feat(mobile): replace floatingCard with bottom sheet + metrics in ActiveScreen"
```

---

### Task 5: Verificacion final

- [ ] **Step 1: Correr typecheck completo**

```bash
bun run typecheck
```

Expected: ambos proyectos pasan.

- [ ] **Step 2: Correr lint**

```bash
bun run lint
```

Expected: sin errores de biome.

- [ ] **Step 3: Correr tests**

```bash
bun run test
```

Expected: todos los tests pasan.
