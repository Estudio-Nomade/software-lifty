# Passenger Home Screen Redesign

**Date**: 2026-08-12
**Status**: Approved by user
**Scope**: `apps/mobile-passengers/src/screens/HomeScreen.tsx`

## Goal

Redesign the passenger home screen with a minimalist, mobile-first layout, clear visual hierarchy, and cohesive sections (not stacked disconnected blocks). Fix the empty map placeholder, replace the passive empty suggestions state, and improve the tab bar contrast.

## Visual System

### Colors (unchanged from existing `theme.colors`)

| Token | Hex | Role |
|---|---|---|
| `primary` | `#00C2B3` | Actions, tab active, links |
| `deepBlue` | `#0D2B45` | Header bg, primary text |
| `white` | `#FFFFFF` | Card/search bg |
| `lightGray` | `#F1F4F6` | Page bg (scroll) |
| `mediumGray` | `#A8B1BA` | Secondary text, tabs inactive, placeholders |
| `dangerRed` | `#E53935` | Errors, SOS |
| `amber` | `#FFB020` | Promos, badges |

### Spacing (8px system)

Use `theme.spacing`: `xs(4)` → keep existing, `sm(8)`, `md(16)`, `lg(24)`, `xl(32)`.

Consistent section gaps: `spacing.lg` (24px) between major sections.

### Typography

- **Heading**: `lg (20px)` semibold deepBlue — greeting
- **Title**: `md (16px)` semibold deepBlue — section titles
- **Body**: `md (16px)` regular deepBlue — labels, chips
- **Caption**: `sm (14px)` regular mediumGray — subtitles, helper text
- Minimum 14px for all secondary text (AA contrast).

## Sections

### 1. Header

- Background: `deepBlue`, bottom corners rounded (`borderBottomLeftRadius: 20, borderBottomRightRadius: 20`).
- Greeting: `lg (20px)` semibold `white` — "¡Hola, [nombre]!"
- Subtitle: `sm (14px)` regular `mediumGray` — "¿A dónde vamos hoy?"
- Notifications icon (top-right): custom circle + dot minimal icon, 22px, inside a `TouchableOpacity` with `hitSlop` ensuring 44x44px touch area. Purple/amber badge dot if unread notifications. Opens /notifications.
- No logo, no avatar icon (removed as redundant with tab bar).

### 2. Search Bar

- White card, `elevation: 4` / `shadowOpacity: 0.10`, `borderRadius: 12`, height 48px.
- `search` icon (Ionicons, 18px, mediumGray) on the left.
- Placeholder "¿A dónde vas?" in mediumGray body.
- On tap: expands to search view (existing behavior).

### 3. Quick Chips

- Visible only when search is expanded.
- Horizontal `ScrollView`, `showsHorizontalScrollIndicator: false`.
- Each chip: pill shape (`borderRadius: 999`), height 36px, padding horizontal 16px.
- Background `white`, border `lightGray`, text `sm (14px)` medium.
- Ionicons for icons: `home-outline` (Casa), `briefcase-outline` (Trabajo), `time-outline` (Reciente).
- Default chips: Casa, Trabajo.
- Reciente: only shown if the user has recent destinations.
- On tap Casa/Trabajo without saved address: the chip row is replaced by a compact TextInput (height 40px) with placeholder "Dirección de Casa" / "Dirección de Trabajo" and a checkmark button to save. On save, it navigates to search with that destination pre-filled. With saved address: taps navigates directly.

### 4. Map Area

- Height: 200px (reduced from 320px).
- Background: subtle `deepBlue` → `primary` (15% opacity) gradient.
- Floating button (bottom-right, `absolute`): white circle 40x40, `borderRadius: 999`, `locate-outline` icon from Ionicons in `primary`, shadow matching `theme.shadows.card`. Centers on user location via `expo-location`.
- Ready for real map integration later (same pattern as driver's MapView component).

### 5. How It Works Section

- Replaces the empty "Sugerencias para vos" section for new users without trips.
- Title: "¿Cómo funciona?" — `md (16px)` semibold deepBlue.
- Three steps, each as a row:
  - Icon in a `lightGray` circle (36x36, `borderRadius: 999`).
  - Title `sm (14px)` semibold deepBlue + description `xs (12px)` regular mediumGray.
  - No cards, no shadows — integrated layout.
  1. `locate-outline` — "Buscá tu destino" / "Elegí a dónde querés ir"
  2. `car-outline` — "Elegí tu vehículo" / "El que mejor se adapte"
  3. `shield-checkmark-outline` — "Viajá seguro" / "Conductores verificados"
- When user has trips, this section is replaced by real suggestions (future).

### 6. Tab Bar

- Unchanged structure: Home (`home`), Search (`search`), Trips (`list`/`receipt-outline`), Profile (`person-outline`).
- Improved contrast: active tab uses `primary` + bold label, inactive tabs use `mediumGray` + regular label.
- No dot indicator.
- Touch targets ≥44px via padding.
- `borderTopWidth: 1`, `borderTopColor: lightGray` (as current).

## Component Changes

### New components to create
- `HomeHeader` — greeting + notification icon extract into its own component
- `QuickChips` — horizontal scrollable chip list with Ionicons
- `HowItWorks` — three-step onboarding section

### Modified components
- `HomeScreen.tsx` — full section reorganization

### Reused components (from `apps/mobile/`)
- Button → already adapted in `src/components/Button.tsx`
- MapView pattern → from driver's `src/components/MapView.tsx` (future, not now)

## States

| State | Behavior |
|---|---|
| **Loading** | Skeleton shimmer for map area, greeting with name placeholder |
| **Empty (no trips)** | "¿Cómo funciona?" section visible |
| **With trips** | Suggestions section replaces "¿Cómo funciona?" |
| **No recent places** | Chips show only Casa + Trabajo |
| **With saved address** | Casa/Trabajo chip navigates directly to destination |
| **Search expanded** | Chips visible, existing expanded search view |
| **Error** | No special error state for home — errors bubble to ErrorBoundary |

## Accessibility

- All text ≥14px except helper descriptions (12px, acceptable for non-critical supplementary content).
- All interactive elements ≥44x44px touch targets.
- Color contrast: deepBlue (#0D2B45) on white = AAA. Primary (#00C2B3) on white = AA (needs ≥18px for AA, but primary is used on icons/buttons with bold, not body text). MediumGray (#A8B1BA) on white = AA for 14px+.
- `accessibilityLabel` on all icon buttons.

## Non-goals (out of scope)
- Real map integration (future work)
- Notifications screen implementation
- Backend changes (address saving)
- expo-router tabs migration
