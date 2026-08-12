# Passenger Home Screen Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the passenger home screen with minimalist header, shadowed search bar, map area with locate button, "How It Works" onboarding section, and improved tab bar contrast.

**Architecture:** Extract three focused components (`HomeHeader`, `QuickChips`, `HowItWorks`) from `HomeScreen.tsx` and rewrite the screen to assemble them. Follow existing patterns: `StyleSheet.create` at bottom, named exports, `theme` from `src/theme/index.ts`, Ionicons for icons from `@expo/vector-icons`.

**Tech Stack:** React Native, TypeScript, expo-location (already installed), Ionicons, theme tokens

## Global Constraints

- All colors/spacing/fonts must use `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*`, `theme.fontFamily.*`
- All interactive elements must have touch targets >= 44x44px
- Minimum font size 14px for secondary text (12px only for helper descriptions)
- Named exports only (no default exports)
- Styles via `StyleSheet.create()` at bottom of each file
- No backend changes, no expo-router tabs migration, no real map integration

---

### Task 1: Create `HomeHeader` component

**Files:**
- Create: `apps/mobile-passengers/src/components/HomeHeader.tsx`

**Interfaces:**
- Produces: `HomeHeader` named export, accepts no props (reads `useAuthStore` internally)

- [ ] **Step 1: Create the component file**

Write `apps/mobile-passengers/src/components/HomeHeader.tsx`:

```typescript
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export function HomeHeader() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const displayName = fullName || email?.split('@')[0] || 'Usuario';

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.greeting}>¡Hola, {displayName}!</Text>
        <Text style={styles.subtitle}>¿A dónde vamos hoy?</Text>
      </View>
      <TouchableOpacity
        style={styles.notifBtn}
        activeOpacity={0.7}
        accessibilityLabel="Notificaciones"
        hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
      >
        <View style={styles.notifIcon}>
          <View style={styles.notifOuter} />
          <View style={styles.notifDot} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.deepBlue,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  greeting: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.white,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  notifBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.white,
  },
  notifDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.white,
    top: 4,
    right: 4,
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter @lifty/mobile-passengers typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile-passengers/src/components/HomeHeader.tsx
git commit -m "feat(passenger): add HomeHeader component with greeting and notification icon"
```

---

### Task 2: Create `HowItWorks` component

**Files:**
- Create: `apps/mobile-passengers/src/components/HowItWorks.tsx`

**Interfaces:**
- Produces: `HowItWorks` named export, accepts no props

- [ ] **Step 1: Create the component file**

Write `apps/mobile-passengers/src/components/HowItWorks.tsx`:

```typescript
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface Step {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: 'locate-outline',
    title: 'Buscá tu destino',
    description: 'Elegí a dónde querés ir',
  },
  {
    icon: 'car-outline',
    title: 'Elegí tu vehículo',
    description: 'El que mejor se adapte',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Viajá seguro',
    description: 'Conductores verificados',
  },
];

export function HowItWorks() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>¿Cómo funciona?</Text>
      {STEPS.map((step) => (
        <View key={step.title} style={styles.step}>
          <View style={styles.iconCircle}>
            <Ionicons name={step.icon} size={18} color={theme.colors.deepBlue} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepDesc}>{step.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  stepTitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  stepDesc: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter @lifty/mobile-passengers typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile-passengers/src/components/HowItWorks.tsx
git commit -m "feat(passenger): add HowItWorks onboarding section component"
```

---

### Task 3: Create `QuickChips` component

**Files:**
- Create: `apps/mobile-passengers/src/components/QuickChips.tsx`

**Interfaces:**
- Consumes: none (standalone)
- Produces: `QuickChips` named export
  - Props: `{ onSelect: (address: string) => void }`

- [ ] **Step 1: Create the component file**

Write `apps/mobile-passengers/src/components/QuickChips.tsx`:

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../theme';

interface Chip {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  savedAddress: string | null;
}

const DEFAULT_CHIPS: Chip[] = [
  { name: 'Casa', icon: 'home-outline', savedAddress: null },
  { name: 'Trabajo', icon: 'briefcase-outline', savedAddress: null },
];

interface QuickChipsProps {
  onSelect: (address: string) => void;
}

export function QuickChips({ onSelect }: QuickChipsProps) {
  const [editingChip, setEditingChip] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');

  const handleChipPress = (chip: Chip) => {
    if (chip.savedAddress) {
      onSelect(chip.savedAddress);
      return;
    }
    setEditingChip(chip.name);
    setAddressInput('');
  };

  const handleSaveAddress = () => {
    const trimmed = addressInput.trim();
    if (!trimmed) {
      setEditingChip(null);
      return;
    }
    onSelect(trimmed);
    setEditingChip(null);
    setAddressInput('');
  };

  if (editingChip) {
    return (
      <View style={styles.editRow}>
        <TextInput
          style={styles.editInput}
          placeholder={`Dirección de ${editingChip}`}
          placeholderTextColor={theme.colors.mediumGray}
          value={addressInput}
          onChangeText={setAddressInput}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveAddress}
        />
        <TouchableOpacity
          style={styles.editSave}
          onPress={handleSaveAddress}
          activeOpacity={0.7}
        >
          <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      {DEFAULT_CHIPS.map((chip) => (
        <TouchableOpacity
          key={chip.name}
          style={styles.chip}
          onPress={() => handleChipPress(chip)}
          activeOpacity={0.7}
        >
          <Ionicons name={chip.icon} size={16} color={theme.colors.deepBlue} />
          <Text style={styles.chipLabel}>{chip.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    gap: theme.spacing.xs,
  },
  chipLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  editInput: {
    flex: 1,
    height: 40,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    fontFamily: theme.fontFamily.regular,
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  editSave: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter @lifty/mobile-passengers typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile-passengers/src/components/QuickChips.tsx
git commit -m "feat(passenger): add QuickChips component for home/work quick access"
```

---

### Task 4: Rewrite `HomeScreen` with new layout

**Files:**
- Modify: `apps/mobile-passengers/src/screens/HomeScreen.tsx` (entire file)

**Interfaces:**
- Consumes:
  - `HomeHeader` from `../components/HomeHeader` (Task 1)
  - `QuickChips` from `../components/QuickChips`, `{ onSelect: (address: string) => void }` (Task 3)
  - `HowItWorks` from `../components/HowItWorks` (Task 2)
  - `useAppNavigation` from `../hooks/useAppNavigation` (existing)

- [ ] **Step 1: Replace HomeScreen.tsx content entirely**

Write `apps/mobile-passengers/src/screens/HomeScreen.tsx`:

```typescript
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { HomeHeader } from '../components/HomeHeader';
import { HowItWorks } from '../components/HowItWorks';
import { QuickChips } from '../components/QuickChips';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export function HomeScreen() {
  const { navigate } = useAppNavigation();

  const [searchExpanded, setSearchExpanded] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');

  useEffect(() => {
    if (!searchExpanded) return;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      if (cancelled) return;
      const [addr] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (cancelled) return;
      const name =
        addr?.street && addr?.streetNumber
          ? `${addr.street} ${addr.streetNumber}`
          : (addr?.name ?? '');
      setPickupAddress(
        name || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [searchExpanded]);

  const handleOpenSearch = () => {
    setSearchExpanded(true);
  };

  const handleCloseSearch = () => {
    Keyboard.dismiss();
    setSearchExpanded(false);
    setDestAddress('');
  };

  const handleChipSelect = (address: string) => {
    setDestAddress(address);
  };

  const handleConfirmDestination = () => {
    if (!destAddress.trim()) return;
    Keyboard.dismiss();
    navigate('VehicleSelect', {
      pickup: pickupAddress,
      destination: destAddress.trim(),
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bodyWrap}>
        {searchExpanded ? (
          <KeyboardAvoidingView
            style={styles.expandedSearch}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.expandedHeader}>
              <TouchableOpacity onPress={handleCloseSearch} style={styles.expandedBack}>
                <Ionicons name="arrow-back" size={22} color={theme.colors.white} />
              </TouchableOpacity>
              <Text style={styles.expandedTitle}>Solicitar viaje</Text>
            </View>

            <ScrollView
              style={styles.expandedBody}
              contentContainerStyle={styles.expandedBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.searchFields}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldDotPickup} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Desde"
                    placeholderTextColor={theme.colors.mediumGray}
                    value={pickupAddress}
                    onChangeText={setPickupAddress}
                  />
                </View>

                <View style={styles.fieldDivider} />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldDotDest} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Hacia"
                    placeholderTextColor={theme.colors.mediumGray}
                    value={destAddress}
                    onChangeText={setDestAddress}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={handleConfirmDestination}
                  />
                </View>
              </View>

              <QuickChips onSelect={handleChipSelect} />

              <TouchableOpacity
                style={[styles.confirmBtn, !destAddress.trim() && styles.confirmBtnDisabled]}
                onPress={handleConfirmDestination}
                disabled={!destAddress.trim()}
                activeOpacity={0.85}
              >
                <Ionicons name="search" size={18} color={theme.colors.white} />
                <Text style={styles.confirmBtnText}>Buscar destino</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <HomeHeader />

            <TouchableOpacity
              style={styles.searchBar}
              onPress={handleOpenSearch}
              activeOpacity={0.9}
            >
              <Ionicons name="search" size={18} color={theme.colors.mediumGray} />
              <Text style={styles.searchPlaceholder}>¿A dónde vas?</Text>
            </TouchableOpacity>

            <View style={styles.mapArea}>
              <TouchableOpacity
                style={styles.locateBtn}
                activeOpacity={0.8}
                accessibilityLabel="Centrar ubicación"
              >
                <Ionicons name="locate-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            <HowItWorks />
          </ScrollView>
        )}

        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tab} activeOpacity={0.8}>
            <Ionicons name="home" size={20} color={theme.colors.primary} />
            <Text style={styles.tabActive}>Inicio</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={handleOpenSearch}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Buscar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => navigate('TripHistory')}
            activeOpacity={0.8}
          >
            <Ionicons name="list" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Viajes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => navigate('Profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Perfil</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  bodyWrap: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    backgroundColor: theme.colors.lightGray,
  },
  bodyContent: {
    paddingBottom: theme.spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 12,
    gap: 8,
    height: 48,
    ...theme.shadows.card,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  mapArea: {
    height: 200,
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: '#0D2B45',
    overflow: 'hidden',
  },
  locateBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  expandedSearch: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  expandedBody: {
    flex: 1,
  },
  expandedBodyContent: {
    paddingBottom: theme.spacing.md,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: theme.dimensions.navbarHeight,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  expandedBack: {
    padding: theme.spacing.sm,
  },
  expandedTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  searchFields: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
    gap: 12,
  },
  fieldDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  fieldDotDest: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.dangerRed,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: theme.colors.lightGray,
    marginHorizontal: 12,
  },
  fieldInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    padding: 0,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    height: 48,
    gap: 8,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  tabBar: {
    flexDirection: 'row',
    height: theme.dimensions.tabBarHeight,
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
  },
  tabActive: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  tabLabel: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
});
```

- [ ] **Step 2: Typecheck the full project**

```bash
bun --filter @lifty/mobile-passengers typecheck
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
bun run lint --filter @lifty/mobile-passengers
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile-passengers/src/screens/HomeScreen.tsx
git commit -m "refactor(passenger): redesign home screen with new header, map area, and how-it-works section"
```
