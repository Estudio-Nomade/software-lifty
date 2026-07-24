# Agregar pestaña "Viajes" al TabBar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th "Viajes" (🚗) tab to the TabBar that navigates to TripHistoryScreen, update all screens to support the new tab, and export a shared `TabKey` type.

**Architecture:** Extend the `TabKey` literal union in `TabBar.tsx` from 3 to 4 values, export it as a shared type, import it in all consuming screens. Adjust `paddingHorizontal` from `xl` to `md` for spacing. Add TabBar to `TripHistoryScreen`.

**Tech Stack:** React Native, TypeScript, expo-router, theme tokens from `src/theme/index.ts`

## Global Constraints

- Named exports only — no default exports
- All UI must use `theme.colors.*`, `theme.spacing.*`, etc. — never hardcode
- TabBar is a custom UI component — tab switching calls `navigation.navigate()`

---

### Task 1: Update TabBar component — add 'trips' tab + export TabKey type

**Files:**
- Modify: `apps/mobile/src/components/TabBar.tsx`

**Interfaces:**
- Produces: `export type TabKey = 'home' | 'earnings' | 'trips' | 'profile';`
- Produces: Updated `TabBarProps.activeTab: TabKey; onTabPress: (tab: TabKey) => void`
- Produces: Updated `TabItem.key: TabKey`
- Produces: Updated `tabs` array with 4th entry `{ key: 'trips', label: 'Viajes', icon: '🚗' }`

- [ ] **Step 1: Edit TabBar.tsx**

Replace the entire file content:

```typescript
import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

export type TabKey = 'home' | 'earnings' | 'trips' | 'profile';

interface TabBarProps {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
}

interface TabItem {
  key: TabKey;
  label: string;
  icon: string;
}

const tabs: TabItem[] = [
  { key: 'home', label: 'Inicio', icon: '🏠' },
  { key: 'earnings', label: 'Cobros', icon: '💰' },
  { key: 'trips', label: 'Viajes', icon: '🚗' },
  { key: 'profile', label: 'Perfil', icon: '👤' },
];

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.icon, !isActive && styles.inactiveIcon]}>{tab.icon}</Text>
            <Text style={[styles.label, isActive ? styles.activeLabel : styles.inactiveLabel]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.white,
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  tab: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    minWidth: 64,
    minHeight: 48,
  },
  icon: {
    fontSize: 22,
  },
  inactiveIcon: {
    opacity: 0.4,
  },
  label: {
    fontSize: 11,
    fontWeight: theme.fontWeight.medium,
  },
  activeLabel: {
    color: theme.colors.turquoise,
  },
  inactiveLabel: {
    color: theme.colors.mediumGray,
  },
  activeIndicator: {
    width: 24,
    height: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.turquoise,
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/TabBar.tsx
git commit -m "feat: add 'trips' tab and export TabKey type from TabBar"
```

---

### Task 2: Update OnlineScreen — use TabKey + navigate to TripHistory

**Files:**
- Modify: `apps/mobile/src/screens/OnlineScreen.tsx`

**Interfaces:**
- Consumes: `TabKey` from `../components/TabBar`
- Produces: Updated `useState<TabKey>('home')`, `handleTabPress` with `'trips' -> navigate('TripHistory')`

- [ ] **Step 1: Change import to include TabKey type**

Replace line 12:
```typescript
import { TabBar } from '../components/TabBar';
```
with:
```typescript
import { TabBar, type TabKey } from '../components/TabBar';
```

- [ ] **Step 2: Update useState generic (line 27)**

Replace:
```typescript
const [activeTab, setActiveTab] = useState<'home' | 'earnings' | 'profile'>('home');
```
with:
```typescript
const [activeTab, setActiveTab] = useState<TabKey>('home');
```

- [ ] **Step 3: Update handleTabPress (line 84)**

Replace:
```typescript
const handleTabPress = (tab: 'home' | 'earnings' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'profile') navigation.navigate('Profile');
  };
```
with:
```typescript
const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/OnlineScreen.tsx
git commit -m "feat: add trips tab navigation to OnlineScreen"
```

---

### Task 3: Update EarningsScreen — use TabKey + navigate to TripHistory

**Files:**
- Modify: `apps/mobile/src/screens/EarningsScreen.tsx`

**Interfaces:**
- Consumes: `TabKey` from `../components/TabBar`

- [ ] **Step 1: Change import (line 7)**

Replace:
```typescript
import { TabBar } from '../components/TabBar';
```
with:
```typescript
import { TabBar, type TabKey } from '../components/TabBar';
```

- [ ] **Step 2: Update useState generic (line 16)**

Replace:
```typescript
const [activeTab, setActiveTab] = React.useState<'home' | 'earnings' | 'profile'>('earnings');
```
with:
```typescript
const [activeTab, setActiveTab] = React.useState<TabKey>('earnings');
```

- [ ] **Step 3: Update handleTabPress (line 32)**

Replace:
```typescript
const handleTabPress = (tab: 'home' | 'earnings' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'profile') navigation.navigate('Profile');
  };
```
with:
```typescript
const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/EarningsScreen.tsx
git commit -m "feat: add trips tab navigation to EarningsScreen"
```

---

### Task 4: Update ProfileScreen — use TabKey + navigate to TripHistory

**Files:**
- Modify: `apps/mobile/src/screens/ProfileScreen.tsx`

**Interfaces:**
- Consumes: `TabKey` from `../components/TabBar`

- [ ] **Step 1: Change import (line 23)**

Replace:
```typescript
import { TabBar } from '../components/TabBar';
```
with:
```typescript
import { TabBar, type TabKey } from '../components/TabBar';
```

- [ ] **Step 2: Update useState generic (line 109)**

Replace:
```typescript
const [activeTab, setActiveTab] = useState<'home' | 'earnings' | 'profile'>('profile');
```
with:
```typescript
const [activeTab, setActiveTab] = useState<TabKey>('profile');
```

- [ ] **Step 3: Update handleTabPress (line 146)**

Replace:
```typescript
const handleTabPress = (tab: 'home' | 'earnings' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
  };
```
with:
```typescript
const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
  };
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/ProfileScreen.tsx
git commit -m "feat: add trips tab navigation to ProfileScreen"
```

---

### Task 5: Update TripCompleteScreen — use TabKey + navigate to TripHistory

**Files:**
- Modify: `apps/mobile/src/screens/TripCompleteScreen.tsx`

**Interfaces:**
- Consumes: `TabKey` from `../components/TabBar`

- [ ] **Step 1: Change import (line 6)**

Replace:
```typescript
import { TabBar } from '../components/TabBar';
```
with:
```typescript
import { TabBar, type TabKey } from '../components/TabBar';
```

- [ ] **Step 2: Update useState generic (line 17)**

Replace:
```typescript
const [activeTab, setActiveTab] = React.useState<'home' | 'earnings' | 'profile'>('home');
```
with:
```typescript
const [activeTab, setActiveTab] = React.useState<TabKey>('home');
```

- [ ] **Step 3: Add handleTabPress function, replace onTabPress callback (line 147)**

Add a `handleTabPress` function right before the return statement (before line 97). Insert after the `handleGoHome` function (after line 95):

```typescript
const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };
```

Wait — TripCompleteScreen doesn't have access to `isOnline`. Let me check... it imports `useOnlineStore`. Actually it doesn't currently. Let me add that import.

- [ ] **Step 3a: Add useOnlineStore import (after line 7)**

Add after `import { useTripStore } from '../store/tripStore';`:
```typescript
import { useOnlineStore } from '../store/onlineStore';
```

- [ ] **Step 3b: Add useOnlineStore hook (after line 17)**

After `const [collectingMP, setCollectingMP] = React.useState(false);`:
```typescript
const isOnline = useOnlineStore((s) => s.isOnline);
```

- [ ] **Step 3c: Add handleTabPress function (after line 95, after handleGoHome)**

Insert:
```typescript
const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };
```

- [ ] **Step 3d: Replace onTabPress callback (line 147)**

Replace:
```typescript
<TabBar activeTab={activeTab} onTabPress={setActiveTab} />
```
with:
```typescript
<TabBar activeTab={activeTab} onTabPress={handleTabPress} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/TripCompleteScreen.tsx
git commit -m "feat: add trips tab navigation to TripCompleteScreen"
```

---

### Task 6: Add TabBar to TripHistoryScreen

**Files:**
- Modify: `apps/mobile/src/screens/TripHistoryScreen.tsx`

**Interfaces:**
- Consumes: `TabKey`, `TabBar` from `../components/TabBar`, `useOnlineStore` from `../store/onlineStore`

- [ ] **Step 1: Add imports (lines 7, after TabBar import, and after useAppNavigation import)**

Add TabBar import after line 16 (`import { Navbar } from '../components/Navbar';`):
```typescript
import { TabBar, type TabKey } from '../components/TabBar';
```
Add useOnlineStore import after line 18 (`import { useAppNavigation } from '../hooks/useAppNavigation';`):
```typescript
import { useOnlineStore } from '../store/onlineStore';
```

- [ ] **Step 2: Add state + navigation handler (after line 97, after `const [allTrips, setAllTrips] = useState<Trip[]>([]);`)**

Insert:
```typescript
const isOnline = useOnlineStore((s) => s.isOnline);
  const [activeTab, setActiveTab] = useState<TabKey>('trips');

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'profile') navigation.navigate('Profile');
  };
```

- [ ] **Step 3: Add TabBar to the render (after line 191, before closing `</View>`)**

Replace the JSX return block (lines 186-192):
```tsx
return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Historial" onBack={() => navigation.goBack()} showBack />
      {renderContent()}
    </View>
  );
```
with:
```tsx
return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Historial" onBack={() => navigation.goBack()} showBack />
      {renderContent()}
      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/TripHistoryScreen.tsx
git commit -m "feat: add TabBar to TripHistoryScreen"
```

---

### Task 7: Typecheck and verify

**Files:**
- (none — verification only)

- [ ] **Step 1: Run typecheck**

```bash
bun --filter @lifty/mobile typecheck
```
Expected: Pass with no errors.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```
Expected: Pass with no errors.

- [ ] **Step 3: Run mobile tests**

```bash
bun --filter @lifty/mobile test
```
Expected: All tests pass.
