# Design: District picker on GO (in-place sheet)

**Date:** 2026-09-03  
**Status:** Approved for planning  
**App:** Driver mobile (`apps/mobile`) + existing districts API (`apps/backend`)

## Problem

When an approved driver taps **GO** without a municipality (`district_id`), the backend returns `DISTRICT_REQUIRED` and the app surfaces an error snackbar. That blocks connection without offering a way to fix it in context.

Municipality assignment still matters: drivers must be tied to an operating district (e.g. Villa Dolores vs other regions) so matching/ops can stay local. Removing the gate is not acceptable.

## Goal

When the driver needs a municipality at connect time, show a **Lifty-styled in-place sheet** on the Active map home: pick an active municipality, accept that district’s terms, assign it, then **automatically retry GO** so they end up online without a dead-end error.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| UX pattern | Approach A: bottom/modal sheet on Active (list + TyC in the same overlay) |
| After accept | Auto-retry GO (same connect path) |
| Post-auth routing | Approved drivers always land on **Active**, even without district |
| District permanence | Unchanged: once set, cannot change (`409 DISTRICT_ALREADY_SET`) |
| Backend contracts | Reuse existing districts/driver endpoints; no new APIs |
| Matching by district | Out of scope for this change (district still gets set for future use) |

## Current system (context)

### Data

- Table `districts`: `id`, `name`, `province`, `status`, `terms_and_conditions`, `privacy_policy`
- Seed: 7 Córdoba municipalities; selectable only if `status = 'active'` **and** `terms_and_conditions IS NOT NULL`
- `drivers.district_id` FK → `districts.id` (nullable until set)

### API (unchanged)

- `GET /api/districts` — selectable list  
- `GET /api/districts/:id` — detail including TyC + privacy  
- `PUT /api/drivers/me/district` — `{ district_id }` (approved only; permanent)  
- `PUT /api/drivers/me/online` — requires `district_id` when going online (`DISTRICT_REQUIRED`)  
- `GET /api/drivers/me/status` — includes `has_district` and optional `district`

### Existing mobile paths (today)

- Full-screen: `SelectProvince` → `SelectDistrict` → `DistrictTerms` (post-auth when `!has_district`)
- Active `connect()`: `PUT /drivers/me/online`; errors via snackbar (`feedbackFromConnectError`)
- Gate modal pattern reference: `PayoutMethodGateModal`

## Behavior

1. Driver is **approved** and opens the app → route to **Active** (map + GO), regardless of `has_district`.
2. Driver taps **GO**.
3. Client prechecks other gates first (approval, payout method, docs pending, location) — unchanged.
4. If `has_district === false` **or** online call fails with `DISTRICT_REQUIRED`:
   - **Do not** show the old “elegí un municipio” dead-end as the primary UX.
   - Open **DistrictPickerSheet**.
5. Sheet **step 1 — list**
   - Title: e.g. “Elegí tu municipio”
   - Load `GET /districts` (active + terms)
   - Rows: `name` + `province`, Lifty tokens (deepBlue / turquoise / surface / Nunito)
6. Sheet **step 2 — terms**
   - On row tap: load `GET /districts/:id`
   - Show terms + privacy (scrollable)
   - Primary CTA: “Aceptar y continuar” (disabled while submitting)
   - Back returns to list without assigning
7. On accept:
   - `PUT /drivers/me/district` with selected id
   - On success: close sheet, refresh local `has_district` if cached, **call the same connect() path again** so `PUT /me/online` (+ heartbeat) runs
   - On success of online: driver is online as today
8. Dismiss sheet (backdrop / close) → no assignment; driver stays offline; can tap GO again later.
9. Selection remains permanent server-side.

## Architecture

### Mobile

| Piece | Change |
|-------|--------|
| `postAuthRouting.routeForDriverStatus` | Remove branches that send approved + `!has_district` to `SelectProvince`. Approved → `Active`. |
| `ActiveScreen` | Own sheet visibility state; on connect: open sheet when no district / `DISTRICT_REQUIRED`; after assign, retry connect once. |
| `DistrictPickerSheet` (new component) | Self-contained: fetch list, pick, fetch detail, accept TyC, invoke `onAssigned` / `onDismiss`. Theme via `theme.*` only. |
| `connectBlockedFeedback` | `DISTRICT_REQUIRED` should not be the happy path (sheet handles it). Keep a safe fallback message only if sheet cannot open. |
| Full-screen district routes | **Keep files** (`select-province`, `select-district`, `district-terms`) but they are no longer the default post-auth path. No requirement to delete in this work. |

### Data flow

```
GO
  → other gates (approval / payout / docs / location)
  → has_district?
       no  → DistrictPickerSheet
              → GET /districts
              → pick
              → GET /districts/:id
              → Accept → PUT /drivers/me/district
              → onAssigned → connect() again
       yes → PUT /drivers/me/online (+ heartbeat)
  → DISTRICT_REQUIRED (stale client) → same sheet path
```

### Backend

No schema or route changes required for MVP of this UX. Server remains source of truth for:

- Which districts are selectable
- Permanent assignment
- Online gate without district

## Edge cases

| Case | Handling |
|------|----------|
| Empty selectable list | In-sheet empty state: no municipalities available; contact support. No accept CTA. |
| `409 DISTRICT_ALREADY_SET` | Close sheet; treat as has district; retry connect. |
| Double-tap accept | Disable CTA + ignore re-entry while request in flight. |
| Network error loading list/detail | In-sheet error + retry; map stays usable. |
| Accept fails (4xx/5xx other) | In-sheet error; stay on terms step. |
| Second connect fails (location, docs, etc.) | Existing snackbar / feedback path. |
| Stale `has_district` on client | Backend `DISTRICT_REQUIRED` still opens sheet. |
| User closes sheet mid-flow | No `PUT` district; offline. |

## UI guidelines

- Match driver app chrome: `theme.colors.deepBlue`, `turquoise`, `white`, `surface`, `mediumGray`, Nunito via `Text` / theme font tokens.
- Backdrop similar to `PayoutMethodGateModal` (`rgba(15, 42, 68, 0.55)`).
- Prefer bottom sheet or tall card with scroll for terms (list + long TyC need vertical space more than a tiny dropdown).
- Primary button component existing `Button` (`primary`).
- Accessibility: modal semantics, focusable rows, disabled state on submit.

## Testing

- **Unit:** `routeForDriverStatus` — approved + `has_district: false` → `Active` (not `SelectProvince`).
- **Unit:** connect error mapping — `DISTRICT_REQUIRED` does not rely on snackbar-as-only-UX (sheet path); fallback text acceptable if needed.
- **Manual / integration (dev):** approved driver without district → Active → GO → sheet → pick (e.g. Villa Dolores) → accept → online.
- Backend district tests remain green without API changes.

## Out of scope

- Deleting full-screen district selection screens
- Filtering trip matching by `district_id`
- Allowing district change after set
- New backend endpoints or geofencing
- Passenger app changes

## Success criteria

1. Approved driver without municipality reaches Active without forced SelectProvince flow.  
2. Tapping GO without municipality opens the picker sheet instead of a dead-end error.  
3. After accept TyC, driver becomes online without a second manual GO (unless another gate blocks).  
4. District assignment remains permanent and server-enforced.  
5. Existing online gates (docs, approval, location, payout) still work.

## Implementation notes (for plan)

Suggested order:

1. Routing bypass for approved-without-district → Active  
2. `DistrictPickerSheet` UI + API wiring  
3. Wire into `ActiveScreen.connect` + auto-retry  
4. Soften/remove DISTRICT_REQUIRED snackbar-primary path  
5. Tests + manual check on device/web  

No DB migration expected.
