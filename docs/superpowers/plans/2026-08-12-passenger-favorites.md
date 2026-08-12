# Passenger Address Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Casa/Trabajo quick chips into a persistent, dynamic favorites list (custom names, local storage, "Agregar a favorito" button, edit/delete controls).

**Architecture:** A Zustand store (`favoritesStore`) persisted to AsyncStorage is the single source of truth. `QuickChips` reads/writes that store and renders chips + a `+ Agregar` chip. A new `FavoriteEditor` component handles the add/edit form (name + address with autocomplete + save button), reusing the existing `Input`, `Button`, and `usePlaceAutocomplete`.

**Tech Stack:** React Native 0.81, Expo SDK 54, Zustand 5 (`persist`), AsyncStorage, `@testing-library/react-native` + `jest-expo`.

## Global Constraints

- All UI uses `theme.*` tokens (import from `src/theme/index.ts`); never hardcode colors/sizes.
- Named exports only (no default exports); styles via `StyleSheet.create()` at bottom of file.
- Relative imports (no `@/` alias in this app).
- Touch targets ≥ 44px (`height`/`width` on interactive elements).
- Copy (exact): button `Agregar a favorito` (add) / `Guardar cambios` (edit); editor title `Nuevo favorito` / `Editar favorito`; chip label `Agregar`; Alert title `Eliminar favorito`, body `` ¿Querés eliminar "${label}"? ``, buttons `Cancelar` / `Eliminar`.
- Commits follow Conventional Commits with scope `passenger` (e.g. `feat(passenger): ...`).
- Test command: `bun --filter @lifty/mobile-passengers test`. Typecheck: `bun --filter @lifty/mobile-passengers typecheck`.

---

### Task 1: Favorites store + Jest setup

**Files:**
- Create: `apps/mobile-passengers/jest.config.js`
- Create: `apps/mobile-passengers/jest.setup.js`
- Create: `apps/mobile-passengers/src/store/favoritesStore.ts`
- Test: `apps/mobile-passengers/src/__tests__/store/favoritesStore.test.ts`

**Interfaces:**
- Produces (consumed by Task 2 & 3):
  - `export interface Favorite { id: string; label: string; address: string }`
  - `export const SEED_FAVORITES: Favorite[]`
  - `export const useFavoritesStore` with state `favorites: Favorite[]` and actions `addFavorite(label: string, address: string) => void`, `updateFavorite(id: string, label: string, address: string) => void`, `removeFavorite(id: string) => void`.

- [ ] **Step 1: Create Jest config**

`apps/mobile-passengers/jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/.bun/(?!.*(react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@tanstack))',
  ],
};
```

- [ ] **Step 2: Create Jest setup (AsyncStorage mock)**

`apps/mobile-passengers/jest.setup.js`:

```js
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
```

- [ ] **Step 3: Write the failing store test**

`apps/mobile-passengers/src/__tests__/store/favoritesStore.test.ts`:

```ts
import { SEED_FAVORITES, useFavoritesStore } from '../../store/favoritesStore';

const reset = () =>
  useFavoritesStore.setState({ favorites: SEED_FAVORITES.map((f) => ({ ...f })) });

describe('favoritesStore', () => {
  beforeEach(reset);

  test('seeds with Casa and Trabajo (empty addresses)', () => {
    const { favorites } = useFavoritesStore.getState();
    expect(favorites).toEqual([
      { id: 'casa', label: 'Casa', address: '' },
      { id: 'trabajo', label: 'Trabajo', address: '' },
    ]);
  });

  test('addFavorite appends a new favorite with trimmed fields', () => {
    useFavoritesStore.getState().addFavorite('  Gimnasio  ', '  Av. Corrientes 1234  ');
    const { favorites } = useFavoritesStore.getState();
    expect(favorites).toHaveLength(3);
    expect(favorites[2].label).toBe('Gimnasio');
    expect(favorites[2].address).toBe('Av. Corrientes 1234');
    expect(favorites[2].id).toBeTruthy();
  });

  test('updateFavorite edits label and address by id', () => {
    useFavoritesStore.getState().updateFavorite('casa', 'Hogar', 'Cabildo 200');
    const { favorites } = useFavoritesStore.getState();
    expect(favorites[0]).toEqual({ id: 'casa', label: 'Hogar', address: 'Cabildo 200' });
  });

  test('removeFavorite deletes by id', () => {
    useFavoritesStore.getState().removeFavorite('trabajo');
    const { favorites } = useFavoritesStore.getState();
    expect(favorites).toHaveLength(1);
    expect(favorites[0].id).toBe('casa');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun --filter @lifty/mobile-passengers test`
Expected: FAIL — `Cannot find module '../../store/favoritesStore'`.

- [ ] **Step 5: Write the store**

`apps/mobile-passengers/src/store/favoritesStore.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Favorite {
  id: string;
  label: string;
  address: string;
}

interface FavoritesState {
  favorites: Favorite[];
  addFavorite: (label: string, address: string) => void;
  updateFavorite: (id: string, label: string, address: string) => void;
  removeFavorite: (id: string) => void;
}

export const SEED_FAVORITES: Favorite[] = [
  { id: 'casa', label: 'Casa', address: '' },
  { id: 'trabajo', label: 'Trabajo', address: '' },
];

const generateId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      favorites: SEED_FAVORITES,
      addFavorite: (label, address) =>
        set((state) => ({
          favorites: [
            ...state.favorites,
            { id: generateId(), label: label.trim(), address: address.trim() },
          ],
        })),
      updateFavorite: (id, label, address) =>
        set((state) => ({
          favorites: state.favorites.map((f) =>
            f.id === id ? { ...f, label: label.trim(), address: address.trim() } : f,
          ),
        })),
      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((f) => f.id !== id),
        })),
    }),
    {
      name: 'lifty-passenger-favorites',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun --filter @lifty/mobile-passengers test`
Expected: PASS — 4 tests.

- [ ] **Step 7: Typecheck + commit**

Run: `bun --filter @lifty/mobile-passengers typecheck` (expected: exit 0)

```bash
git add apps/mobile-passengers/jest.config.js apps/mobile-passengers/jest.setup.js apps/mobile-passengers/src/store/favoritesStore.ts apps/mobile-passengers/src/__tests__/store/favoritesStore.test.ts
git commit -m "feat(passenger): add favorites store with local persistence"
```

---

### Task 2: FavoriteEditor component

**Files:**
- Create: `apps/mobile-passengers/src/components/FavoriteEditor.tsx`
- Test: `apps/mobile-passengers/src/__tests__/components/FavoriteEditor.test.tsx`

**Interfaces:**
- Consumes: `usePlaceAutocomplete` from `../hooks/usePlaceAutocomplete` (existing, returns `PlaceSuggestion[]`), `Input` from `./Input`, `Button` from `./Button`, `theme` from `../theme`.
- Produces: `export function FavoriteEditor({ initial, onSave, onCancel }: FavoriteEditorProps)` where `interface FavoriteEditorProps { initial?: { label: string; address: string }; onSave: (label: string, address: string) => void; onCancel: () => void }`.

- [ ] **Step 1: Write the failing component test**

`apps/mobile-passengers/src/__tests__/components/FavoriteEditor.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { FavoriteEditor } from '../../components/FavoriteEditor';

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => [],
}));

describe('FavoriteEditor', () => {
  test('shows "Agregar a favorito" in add mode', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = await render(<FavoriteEditor onSave={onSave} onCancel={onCancel} />);
    expect(getByText('Agregar a favorito')).toBeTruthy();
  });

  test('shows "Guardar cambios" when editing a saved favorite', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = await render(
      <FavoriteEditor
        initial={{ label: 'Casa', address: 'Cabildo 200' }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(getByText('Guardar cambios')).toBeTruthy();
  });

  test('does not save when fields are empty', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = await render(<FavoriteEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.press(getByText('Agregar a favorito'));
    expect(onSave).not.toHaveBeenCalled();
  });

  test('saves trimmed label and address when filled', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByPlaceholderText, getByText } = await render(
      <FavoriteEditor onSave={onSave} onCancel={onCancel} />,
    );
    fireEvent.changeText(getByPlaceholderText('Ej: Casa, Trabajo, Gimnasio'), 'Gimnasio');
    fireEvent.changeText(getByPlaceholderText('Escribí la dirección'), '  Av. Corrientes  ');
    fireEvent.press(getByText('Agregar a favorito'));
    expect(onSave).toHaveBeenCalledWith('Gimnasio', 'Av. Corrientes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @lifty/mobile-passengers test FavoriteEditor`
Expected: FAIL — `Cannot find module '../../components/FavoriteEditor'`.

- [ ] **Step 3: Write the component**

`apps/mobile-passengers/src/components/FavoriteEditor.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import { theme } from '../theme';
import { Button } from './Button';
import { Input } from './Input';

interface FavoriteEditorProps {
  initial?: { label: string; address: string };
  onSave: (label: string, address: string) => void;
  onCancel: () => void;
}

export function FavoriteEditor({ initial, onSave, onCancel }: FavoriteEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const suggestions = usePlaceAutocomplete(address);

  const isEditing = initial != null && initial.address !== '';
  const canSave = label.trim().length > 0 && address.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave(label.trim(), address.trim());
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backBtn} accessibilityLabel="Cancelar">
          <Ionicons name="arrow-back" size={22} color={theme.colors.deepBlue} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? 'Editar favorito' : 'Nuevo favorito'}</Text>
      </View>

      <Text style={styles.fieldLabel}>Nombre</Text>
      <Input placeholder="Ej: Casa, Trabajo, Gimnasio" value={label} onChangeText={setLabel} />

      <Text style={styles.fieldLabel}>Dirección</Text>
      <Input
        placeholder="Escribí la dirección"
        value={address}
        onChangeText={setAddress}
        autoFocus
      />

      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.place_id}
              style={styles.suggestionItem}
              onPress={() => setAddress(suggestion.description)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={18} color={theme.colors.mediumGray} />
              <Text style={styles.suggestionText} numberOfLines={1}>
                {suggestion.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Button variant="primary" onPress={handleSave} disabled={!canSave} style={styles.saveBtn}>
        {isEditing ? 'Guardar cambios' : 'Agregar a favorito'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  backBtn: {
    padding: theme.spacing.xs,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  suggestions: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 44,
  },
  suggestionText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  saveBtn: {
    marginTop: theme.spacing.lg,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --filter @lifty/mobile-passengers test FavoriteEditor`
Expected: PASS — 4 tests.

- [ ] **Step 5: Typecheck + commit**

Run: `bun --filter @lifty/mobile-passengers typecheck` (expected: exit 0)

```bash
git add apps/mobile-passengers/src/components/FavoriteEditor.tsx apps/mobile-passengers/src/__tests__/components/FavoriteEditor.test.tsx
git commit -m "feat(passenger): add FavoriteEditor with address autocomplete"
```

---

### Task 3: Refactor QuickChips to use the favorites store

**Files:**
- Modify: `apps/mobile-passengers/src/components/QuickChips.tsx`
- Test: `apps/mobile-passengers/src/__tests__/components/QuickChips.test.tsx`

**Interfaces:**
- Consumes: `useFavoritesStore` (`favorites`, `addFavorite`, `updateFavorite`, `removeFavorite`), `Favorite` and `SEED_FAVORITES` from `../store/favoritesStore`; `FavoriteEditor` from `./FavoriteEditor`.
- Produces: `export function QuickChips({ onSelect }: { onSelect: (address: string) => void })` — unchanged public API (HomeScreen needs no changes).

- [ ] **Step 1: Write the failing component test**

`apps/mobile-passengers/src/__tests__/components/QuickChips.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QuickChips } from '../../components/QuickChips';
import { SEED_FAVORITES, useFavoritesStore } from '../../store/favoritesStore';

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => [],
}));

describe('QuickChips', () => {
  beforeEach(() => {
    useFavoritesStore.setState({ favorites: SEED_FAVORITES.map((f) => ({ ...f })) });
  });

  test('renders Casa, Trabajo and Agregar chips', async () => {
    const { getByText } = await render(<QuickChips onSelect={jest.fn()} />);
    expect(getByText('Casa')).toBeTruthy();
    expect(getByText('Trabajo')).toBeTruthy();
    expect(getByText('Agregar')).toBeTruthy();
  });

  test('tapping a saved favorite calls onSelect with its address', async () => {
    useFavoritesStore.getState().updateFavorite('casa', 'Casa', 'Cabildo 200');
    const onSelect = jest.fn();
    const { getByText } = await render(<QuickChips onSelect={onSelect} />);
    fireEvent.press(getByText('Casa'));
    expect(onSelect).toHaveBeenCalledWith('Cabildo 200');
  });

  test('tapping Casa without an address opens the editor', async () => {
    const { getByText } = await render(<QuickChips onSelect={jest.fn()} />);
    fireEvent.press(getByText('Casa'));
    expect(getByText('Nuevo favorito')).toBeTruthy();
    expect(getByText('Agregar a favorito')).toBeTruthy();
  });

  test('deleting a favorite confirms and removes it', async () => {
    useFavoritesStore.getState().updateFavorite('casa', 'Casa', 'Cabildo 200');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = await render(<QuickChips onSelect={jest.fn()} />);
    fireEvent.press(getByLabelText('Eliminar Casa'));
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2];
    const eliminar = buttons?.find((b) => b?.text === 'Eliminar');
    eliminar?.onPress?.();
    expect(useFavoritesStore.getState().favorites).toHaveLength(1);
    alertSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @lifty/mobile-passengers test QuickChips`
Expected: FAIL — existing QuickChips renders no `Agregar` chip and no edit/delete icons.

- [ ] **Step 3: Rewrite QuickChips**

`apps/mobile-passengers/src/components/QuickChips.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFavoritesStore, type Favorite } from '../store/favoritesStore';
import { theme } from '../theme';
import { FavoriteEditor } from './FavoriteEditor';

interface QuickChipsProps {
  onSelect: (address: string) => void;
}

type EditorTarget = { mode: 'add'; label?: string } | { mode: 'edit'; favorite: Favorite };

const ICON_BY_LABEL: Record<string, keyof typeof Ionicons.glyphMap> = {
  casa: 'home-outline',
  trabajo: 'briefcase-outline',
};

function chipIcon(label: string): keyof typeof Ionicons.glyphMap {
  return ICON_BY_LABEL[label.toLowerCase()] ?? 'location-outline';
}

export function QuickChips({ onSelect }: QuickChipsProps) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const addFavorite = useFavoritesStore((s) => s.addFavorite);
  const updateFavorite = useFavoritesStore((s) => s.updateFavorite);
  const removeFavorite = useFavoritesStore((s) => s.removeFavorite);

  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const handleChipPress = (favorite: Favorite) => {
    if (favorite.address) {
      onSelect(favorite.address);
      return;
    }
    setEditor({ mode: 'add', label: favorite.label });
  };

  const handleEditPress = (favorite: Favorite) => setEditor({ mode: 'edit', favorite });

  const handleDeletePress = (favorite: Favorite) => {
    Alert.alert('Eliminar favorito', `¿Querés eliminar "${favorite.label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => removeFavorite(favorite.id) },
    ]);
  };

  const handleSave = (label: string, address: string) => {
    if (editor?.mode === 'edit') {
      updateFavorite(editor.favorite.id, label, address);
    } else {
      addFavorite(label, address);
    }
    setEditor(null);
    onSelect(address);
  };

  if (editor) {
    const initial =
      editor.mode === 'edit'
        ? { label: editor.favorite.label, address: editor.favorite.address }
        : { label: editor.label ?? '', address: '' };
    return (
      <FavoriteEditor initial={initial} onSave={handleSave} onCancel={() => setEditor(null)} />
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      {favorites.map((favorite) => (
        <View key={favorite.id} style={styles.favoriteGroup}>
          <TouchableOpacity
            style={styles.chip}
            onPress={() => handleChipPress(favorite)}
            activeOpacity={0.7}
          >
            <Ionicons name={chipIcon(favorite.label)} size={16} color={theme.colors.deepBlue} />
            <Text style={styles.chipLabel}>{favorite.label}</Text>
          </TouchableOpacity>

          {favorite.address ? (
            <>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleEditPress(favorite)}
                accessibilityLabel={`Editar ${favorite.label}`}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil" size={16} color={theme.colors.mediumGray} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleDeletePress(favorite)}
                accessibilityLabel={`Eliminar ${favorite.label}`}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.dangerRed} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ))}

      <TouchableOpacity
        style={styles.addChip}
        onPress={() => setEditor({ mode: 'add' })}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={16} color={theme.colors.primary} />
        <Text style={styles.addLabel}>Agregar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    marginTop: theme.spacing.md,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  favoriteGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    gap: theme.spacing.xs,
  },
  chipLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    gap: theme.spacing.xs,
  },
  addLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --filter @lifty/mobile-passengers test`
Expected: PASS — 12 tests total (4 store + 4 editor + 4 chips).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `bun --filter @lifty/mobile-passengers typecheck` (expected: exit 0)
Run: `bun --filter @lifty/mobile-passengers lint` (expected: no errors)

```bash
git add apps/mobile-passengers/src/components/QuickChips.tsx apps/mobile-passengers/src/__tests__/components/QuickChips.test.tsx
git commit -m "feat(passenger): wire QuickChips to favorites store with edit/delete"
```

---

## Verification (final)

- [ ] Run full suite: `bun --filter @lifty/mobile-passengers test` → all pass.
- [ ] `bun --filter @lifty/mobile-passengers typecheck` → exit 0.
- [ ] Manual smoke (Expo): open Home → search → chips show Casa/Trabajo/Agregar; tap Casa → editor; fill address → "Agregar a favorito"; chip now shows pencil/trash; tap chip fills destination.
