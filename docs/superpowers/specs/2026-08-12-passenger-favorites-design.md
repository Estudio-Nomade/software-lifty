# Passenger Address Favorites (Quick Chips)

**Date**: 2026-08-12
**Status**: Approved by user
**Scope**: `apps/mobile-passengers/src/components/QuickChips.tsx`, new `src/store/favoritesStore.ts`, new `src/components/FavoriteEditor.tsx`

## Goal

Turn the Casa/Trabajo quick chips into a real, persistent favorites list: dynamic favorites with custom names, saved locally on the device, an explicit "Agregar a favorito" button, and visible edit/delete controls.

## Background

Today `QuickChips.tsx` hardcodes two chips (`Casa`, `Trabajo`) with `savedAddress: null`. Tapping one opens an inline input with a checkmark icon that only fills the destination field — nothing is persisted. There is no favorites store and no backend favorites module (backend was descoped; persistence is local).

## Data Model

```ts
interface Favorite {
  id: string;       // 'casa' | 'trabajo' (seed) or generated for new favorites
  label: string;    // "Casa", "Trabajo", "Gimnasio"...
  address: string;  // description returned by autocomplete ('' = not configured)
}
```

## Store — `src/store/favoritesStore.ts`

- Zustand `persist` + AsyncStorage (`createJSONStorage`), same pattern as `authStore` / `registrationDraftStore`.
- Seed: `[{ id: 'casa', label: 'Casa', address: '' }, { id: 'trabajo', label: 'Trabajo', address: '' }]`.
- Actions: `addFavorite(label, address)`, `updateFavorite(id, label, address)`, `removeFavorite(id)`.
- New favorite id generated via `Date.now().toString(36) + Math.random().toString(36).slice(2)`.

## Components

### `QuickChips.tsx` (refactor)

- Reads/writes `useFavoritesStore` (drops the hardcoded `DEFAULT_CHIPS`/`savedAddress`; keeps transient editor state local).
- Renders one chip per favorite plus a trailing `+ Agregar` chip.
- Chip with empty `address` → tap opens the editor (add mode, label prefilled for Casa/Trabajo).
- Chip with saved `address` → tap calls `onSelect(address)`; shows pencil + trash icons.
- Trash → `Alert.alert` confirmation → `removeFavorite(id)`.

### `FavoriteEditor.tsx` (new)

- Props: `initial?: Favorite`, `onSave(label, address)`, `onCancel`.
- Fields: name (`Input`) + address (`Input` with `usePlaceAutocomplete` suggestion list).
- Reuses `Input`, `Button`, `usePlaceAutocomplete`, and `theme` tokens.
- Button label: **"Agregar a favorito"** (add mode) / **"Guardar cambios"** (edit mode).
- Disabled while name or address is empty.

## Flows

| State | Behavior |
|---|---|
| Chip sin dirección | Tap → editor (nombre prellenado si es Casa/Trabajo) |
| Chip con dirección | Tap → rellena destino; lápiz → editor prefilled; papelera → `Alert` confirm → borra |
| `+ Agregar` | Editor con nombre vacío |
| Guardar | Persiste en AsyncStorage, rellena destino (`onSelect(address)`), cierra el editor |

## Testing

- `favoritesStore` unit: add/update/remove + rehydrate from persist.
- `QuickChips` unit: renders seeded chips, tap uses saved address, editor saves, delete confirms.

## Non-goals (out of scope)

- Backend favorites / cross-device sync (local only).
- Storing coordinates (only the address string; coordinates come later with the ride-request flow).
- Navigation on save (only persists + fills the destination, as today).
