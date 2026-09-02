# Driver Home: Fullscreen Map + GO + Earnings Pill

**Date:** 2026-09-02  
**Status:** Approved design (pending implementation plan)  
**App:** `apps/mobile` (driver)  
**Approach:** A — unify home on `ActiveScreen`

## Problem

The driver home (`OnlineScreen`) shows a stacked layout: status toggle, small map card, and a large “Ganaste hoy” card. The fullscreen map experience already exists on `ActiveScreen` (opened by tapping the map or after going online), but offline drivers land on the stacked home. Drivers should open the app already in the map-first offline experience and only go online via an explicit GO action.

## Goal

Make **map-fullscreen offline** the default home. Connect via a floating **GO** button. Surface daily earnings as a **collapsed pill** that expands upward. When online, keep the existing Active online chrome (connected badge + status sheet). Unify navigation so home is always `Active`, not a split between Online and Active.

## Non-goals

- Redesign of full Earnings screen (`EarningsScreen`)
- Trip offer / navigation / in-trip flows
- Backend API changes (reuse existing online + earnings endpoints)
- Passenger app changes
- New analytics events (unless trivial and already patterned)

## Current state (baseline)

| Surface | Role today |
|---------|------------|
| `OnlineScreen` | Post-auth home: toggle, 240px map, earnings card; connect → `replace('Active')` |
| `ActiveScreen` | Fullscreen map; online → BottomSheet status/metrics; offline → bottom bar + toggle + “Volver al inicio” |
| Tab / menus | Home often branches `isOnline ? Active : Online` |
| `AuthRedirectWatcher` | No-active-trip bounce → `Online` |
| `/online` + `/active` | Both in `TAB_BAR_ROUTES` |

## Design decisions

1. **Single home:** `ActiveScreen` is the only driver home (online and offline).
2. **GO placement:** large circular floating button at map center; label **GO**.
3. **Earnings offline:** collapsed pill (handle + label + amount); expand for breakdown.
4. **Online UX:** retain connected badge (tap to disconnect) and online BottomSheet; no GO while online.
5. **Routing:** all “home” entry points → `Active`; `/online` thin-redirects to `/active`.
6. **Connect/disconnect in place:** no screen replace on toggle; stay on Active.

## UX specification

### Layers (z-order bottom → top)

1. Fullscreen `MapView` (`StyleSheet.absoluteFill`) + heatmap when available  
2. Location loading / error overlay when no coords  
3. Header overlay: `Navbar` (hamburger + avatar; online adds **Conectado** badge)  
4. Center: **GO** only when `!isOnline`  
5. Recenter FAB when map is off user location (above pill/sheet, not covered)  
6. Bottom: offline earnings pill/sheet **or** online status sheet  
7. App `TabBar` (existing global) — sheet/pill padding must clear tab bar  
8. `SideMenu`

### Offline

- Map full bleed; no stacked white main column from OnlineScreen.
- **GO** centered; press runs connect flow.
- Collapsed pill ~72–96px content height (plus safe/tab insets): drag handle, “Ganaste hoy”, formatted total (or `$0` / skeleton / error+Reintentar).
- Expanded (~45% screen): cash, transfer, platform debt if `shouldShowPlatformDebt`, CTA **Ver ganancias** → `Earnings`.
- No offline bar copy “Conectate, empeza a viajar”, no toggle as primary CTA, no “Volver al inicio”.

### Online

- GO hidden.
- Header badge **Conectado** (existing) disconnects on press.
- BottomSheet: “Estas conectado”, online timer, toggle optional/secondary, today’s metrics (existing pattern).
- Menu item **Desconectarse** remains when online.

### GO behavior

```
onPress GO:
  if documents_pending_review → show error, stay offline, do not call API
  else:
    show loading on GO
    PUT /drivers/me/online { is_online: true }
    best-effort PUT heartbeat with store lat/lng/heading
    set online store + ONLINE_SINCE_KEY (same as ActiveScreen.connect today)
    on failure → error under GO, remain offline
```

Disconnect (badge / sheet toggle / menu): same as today’s `disconnect` (online false, clear heartbeat interval, `stopTracking`, clear since key) — stay on Active.

### Earnings data

- Query `GET /drivers/me/earnings/daily` (existing schema) on home for offline pill, not only when `sheetExpanded && isOnline`.
- Prefer validated client (`getValidated` + `earningsDailySchema`) as on OnlineScreen.
- Refetch interval ~60s acceptable; can enable when sheet expanded or always while Active focused (implementation choice: always while mounted is fine and simpler).

### Location

- No coords: loading or error + Reintentar (`getCurrentPosition`) as OnlineScreen.
- GO: prefer enabled only when lat/lng present; if product wants connect without GPS, heartbeat remains best-effort (current Active behavior) — **default: disable GO until location available** to avoid useless online without position.
- Documents pending: GO disabled or press-guarded with existing copy.

### Microcopy (Spanish, existing voice)

- GO label: `GO`
- Pill: `Ganaste hoy`
- Empty: `Todavia no hiciste viajes hoy` (expanded or subtext)
- Docs: keep existing pending-review strings
- Errors: `Error al conectar` / load earnings messages as today

## Navigation changes

Update every home target to **Active** (non-exhaustive checklist for implementer):

- `AuthRedirectWatcher` trip-guard fallback: `Online` → `Active`
- TabBar / tab context “home” press
- Side menu **Inicio** on Active, Profile, Earnings, TripHistory, etc.
- `TripCompleteScreen` post-trip home
- `IncomingRequestScreen` decline/timeout home if it navigates Online
- `UnderReviewScreen` / any `replace('Online')` for approved drivers
- `postAuthRouting` / approved landing if it points to Online
- Tests that assert Online as home

**`/online` strategy:** keep route file; on focus/mount `replace('Active')` (or export Active and redirect in layout). Avoid deleting route in first PR if deep links/tests still reference it; mark OnlineScreen as redirect shell.

**Tab highlight:** `home` active for `/active` (and `/online` during brief redirect).

## Components

| Piece | Notes |
|-------|--------|
| `GoButton` | New small component or local in Active; circular; theme tokens only; loading + disabled |
| `BottomSheet` | Reuse; offline snap points: collapsed pill height, expanded ~45% |
| Earnings pill content | Extract presentational block from OnlineScreen card logic (cash/transfer/debt) to avoid duplicating formatters long-term — optional extract in same PR if thin |
| `OnlineScreen` | Redirect-only or delete after nav migration |

Theme: `theme.colors.turquoise` for GO fill; white label; `deepBlue` amounts; no hardcoded colors.

## Architecture / data flow

```
ActiveScreen
  ├─ useOnlineStore.isOnline
  ├─ MapView (locationStore + heatmap)
  ├─ !isOnline → GoButton → connect()
  ├─ isOnline → badge/sheet → disconnect()
  └─ earnings query → pill / sheet metrics
```

No new global store. No backend changes.

## Error handling summary

| Case | UI |
|------|-----|
| Connect API fail | Text under GO; offline |
| Docs pending | Banner/text; GO blocked |
| Earnings fail | Pill error + Reintentar |
| Location fail | Map overlay + Reintentar; GO disabled |
| Disconnect fail | Error on sheet/badge path; stay online |

## Testing

- Home after auth/approved → lands on Active (or Online immediately redirects).
- GO success → `isOnline true`, GO unmounts, online chrome shows; no navigation stack churn to Online.
- GO with docs pending → no online API success path.
- Disconnect stays on Active, GO returns.
- Pill expand shows breakdown; Ver ganancias → Earnings.
- Tab Inicio from Earnings/Profile → Active.
- Existing trip guard still sends abandoned trip screens home without looping.
- Regression: tab bar routes still include needed paths; Active remains a tab-bar route.

## Implementation notes

- Primary file: `apps/mobile/src/screens/ActiveScreen.tsx`
- Port earnings card states from `OnlineScreen.tsx`
- Port documents-pending check from OnlineScreen into Active connect path (Active today lacks it — **must add** on unify)
- Remove dead styles/offline bar from Active
- Adjust recenter `bottom` offset for pill vs online sheet heights
- Keep `StatusBar` light-content / deepBlue header pattern

## Open choices locked in design

| Topic | Choice |
|-------|--------|
| Approach | A — Active-only home |
| GO position | Center floating |
| Offline earnings | Collapsed pill + expand |
| Online sheet | Keep Active online pattern |
| GO without GPS | Disabled until location |
| `/online` | Thin redirect, don’t hard-break links in v1 |

## Success criteria

- Opening driver home offline shows fullscreen map without the old stacked Online layout.
- User can connect only via GO (or equivalent explicit control), not by “being on the map”.
- “Ganaste hoy” is a bottom pill that expands, not a permanent large card eating map.
- Online and offline share one screen; menus/tabs don’t send offline users to a different home chrome.
