---
title: Lifty Passenger App
created: 2026-08-10
updated: 2026-08-10
status: draft
---

# PRD: Lifty Passenger App

## 0. Document Purpose

This PRD is the source of truth for the passenger-side product of Lifty, a ride-hailing platform. It is for the PM, the design owner, the mobile engineers, and the backend team that builds the passenger-facing endpoints. The PRD is structured around globally numbered FRs and UJs that downstream artifacts (UX, architecture, epics, stories) reference by ID.

Companion artifacts:
- Design source: `apps/mobile-passengers/design/App-pasajeros.pen` (Pencil)
- Design tokens: `specs/spec-passenger-app/design-tokens.md`
- Spec flows: `specs/spec-passenger-app/FLOWS.md`
- Screen audit: `specs/spec-passenger-app/screen-audit.md`
- Handoff: `specs/spec-passenger-app/handoff.md`
- Backend AGENTS: `apps/backend/AGENTS.md`
- Passenger app AGENTS: `apps/mobile-passengers/AGENTS.md`

## 1. Vision

Lifty is a ride-hailing platform that connects passengers with verified drivers in urban areas. The passenger app is the entry point for riders to request, monitor, and pay for trips. The product must feel simple, trustworthy, and fast — three properties that determine whether a user chooses Lifty over the alternative.

The passenger app is the consumer-facing surface of a two-sided marketplace. The driver side (`apps/mobile`) is already functional. The passenger side is in active development. The MVP demonstrates a complete end-to-end trip flow with real-time tracking, payment, and history.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional**: Get from point A to point B reliably, see the fare upfront, track the driver, pay without friction.
- **Emotional**: Feel safe. Know the driver is verified. Have a way to reach help in an emergency.
- **Social**: Avoid the awkwardness of negotiating fares or haggling over routes.
- **Contextual**: Use the app in transit, on cellular, with one hand, often at night.

### 2.2 Non-Users (v1)

- Children (under 18) — separate flow and consent required.
- Users without a smartphone or stable cellular — out of scope.
- Cross-border or intercity travel — out of scope (intra-urban only).
- Scheduled rides, multi-stop trips, ride-sharing — out of scope for v1.

### 2.3 Key User Journeys

- **UJ-1. Martín pide un viaje al trabajo (commute).**
  - **Persona + context**: Martín, 32, comprobante上班族, abre Lifty cada mañana desde su casa.
  - **Entry state**: Already authenticated (biometric on prior session). App opens to Home map.
  - **Path**: Tap "A dónde vas?" → search "Trabajo" → select from "Lugares recientes" → app shows route + fare estimate → confirm Auto → searching 30s → driver accepts → driver card en route → verification code 4 digits en pickup → driver starts trip → ETA updates → arrive at destination → payment summary → rate 5 stars → Home.
  - **Climax**: Martín llega a su trabajo dentro del ETA estimado, paga automáticamente, no necesita hablar con el conductor.
  - **Resolution**: Rating submitted, trip in history, suggested repeat for tomorrow.
  - **Edge case**: Si no hay conductores en 30s, app muestra "Sin conductores disponibles" con opción de reintentar.

- **UJ-2. Lucía activa SOS durante un viaje.**
  - **Persona + context**: Lucía, 26, rides alone at night. Trip is in progress.
  - **Entry state**: In an active trip, InTrip screen visible.
  - **Path**: Taps red SOS button → modal shows 4 emergency types (Accidente, Médica, Riesgo, Otra) → selects "Riesgo" → confirms → app sends alert to support team and emergency contacts → "Llamar al 911" button visible.
  - **Climax**: En 30s, support contacta Lucía. Conductores no son notificados.
  - **Resolution**: Trip continues or ends depending on emergency type.
  - **Edge case**: Si no hay connectivity, app stores alert locally and sends when online.

- **UJ-3. Carlos revisa el costo de un viaje pasado.**
  - **Persona + context**: Carlos, 41, forgot how much last week's trip cost.
  - **Entry state**: Authenticated, Home screen.
  - **Path**: Tap Historial tab → list of past trips → tap "Av. Corrientes → Av. 9 de Julio" → TripDetail opens with route map, fare breakdown, driver info, rating.
  - **Climax**: Carlos ve el desglose: $3.500 + $1.000 tip = $4.500 total.
  - **Resolution**: Carlos puede reportar un problema o repetir el viaje.
  - **Edge case**: Si el viaje está cancelado, muestra el fee de cancelación.

- **UJ-4. Sofía se registra por primera vez.**
  - **Persona + context**: Sofía, 22, primera vez con Lifty (recomendada por un amigo).
  - **Entry state**: Unauthenticated, opens app.
  - **Path**: Welcome screen → tap "Crear cuenta" → enters Nombre + Apellido → accepts T&C → enters phone → receives SMS OTP → enters 6 digits → Home.
  - **Climax**: Sofía está autenticada y su perfil tiene su nombre.
  - **Resolution**: Puede pedir un viaje inmediatamente.
  - **Edge case**: Si el OTP expira, puede reenviar con cooldown de 30s.

## 3. Glossary

- **Trip** — A single ride request from pickup to dropoff. Has a unique ID, status, fare, driver, and timestamp.
- **Passenger** — The user requesting a trip. Identified by phone or email.
- **Driver** — The other party in a trip. Identified by employee ID. Lives in `apps/mobile`.
- **Vehicle Type** — `auto` or `moto`. Drives fare calculation.
- **Fare Estimate** — Predicted trip cost shown before confirmation. Includes base + per-km + per-minute.
- **Verification Code** — 4-digit code shown to passenger at pickup. Driver must enter to start trip.
- **Status** — Trip lifecycle state: `requested`, `driver_assigned`, `driver_en_route`, `driver_arrived`, `in_trip`, `completed`, `cancelled`.
- **SOS** — Emergency alert. Triggers support contact + notifies emergency contacts.
- **TabBar** — Bottom navigation (Home, Historial, Perfil).
- **Token** — Supabase JWT attached to every API request.
- **Driver Tracking** — Real-time location of the driver, polled/streamed during an active trip.

## 4. Features

### 4.1 Authentication

**Description**: User registers or logs in via phone (OTP via SMS) or email (password). Sessions persist across app restarts via Supabase.

**Functional Requirements:**

#### FR-1: Phone-based auth
The passenger can log in or register using a phone number (Argentina +54 prefix). The system sends a 6-digit OTP via SMS.

**Consequences (testable):**
- Phone number must be valid E.164 format (`+54` + 10 digits).
- OTP expires after 5 minutes.
- Cooldown of 30s between resends.
- Invalid OTP returns error, not crash.

#### FR-2: Email auth (deferred, v2)
The passenger can alternatively log in with email + password. Out of scope for MVP.

#### FR-3: Session persistence
The auth session persists across app restarts via Supabase's secure storage.

**Consequences:**
- App launch with valid session → lands on Home, not Welcome.
- App launch with no session → lands on Welcome.

#### FR-4: T&C acceptance
Before completing registration, the user must accept terms and conditions.

**Consequences:**
- Registration cannot complete without T&C checked.
- T&C version recorded in user metadata.

Realizes UJ-4.

### 4.2 Trip Request

**Description**: From Home, the user sets a pickup location, a destination, sees a fare estimate, and requests a trip.

#### FR-5: Set pickup location
The user can set pickup to "current location" (GPS) or search/select from a map.

**Consequences:**
- Default pickup: current GPS (after permission).
- Map fallback if GPS unavailable.
- Pickup persisted in `useRideStore` for the session.

#### FR-6: Set destination
The user searches for a destination via Google Places autocomplete, or picks from "Lugares recientes" (recent places stored locally).

**Consequences:**
- Recent places stored in `useRideStore` or AsyncStorage.
- Fare estimate recalculated on destination change.

#### FR-7: Fare estimate
The app displays a fare estimate broken down by base + distance + time.

**Consequences:**
- Calls `POST /api/trips/estimate` (or equivalent).
- Result cached for 30s while user reviews.

#### FR-8: Vehicle selection
The user selects `auto` or `moto`. Default: auto.

#### FR-9: Trip request
The user confirms the request. The app creates a Trip and enters "searching" state.

**Consequences:**
- Calls `POST /api/trips/request` with origin, destination, vehicle_type.
- Returns Trip ID + ETA for driver acceptance.
- Polling begins for driver assignment.

Realizes UJ-1.

### 4.3 Trip Lifecycle

#### FR-10: Driver search
The app polls `GET /api/trips/active` every 5s until a driver accepts or 30s timeout.

**Consequences:**
- After 30s without driver, show "Sin conductores disponibles" with retry option.

#### FR-11: Driver card
When a driver accepts, show their photo, name, rating, vehicle, and plate.

#### FR-12: Verification code
When the driver arrives, show a 4-digit code that the passenger must give to the driver.

**Consequences:**
- Code generated driver-side, synced to passenger.
- Driver must enter passenger's code to start trip.

#### FR-13: Real-time tracking
During the trip, show driver location on a map, ETA to destination, and current address.

**Consequences:**
- Location updated via polling (v1) or WebSocket (v2).
- ETA updated on each location update.

#### FR-14: In-trip controls
The user can: contact the driver via chat, modify the destination, cancel (with fee if > 5min).

#### FR-15: SOS
The user can trigger SOS at any time during the trip. SOS shows 4 types (Accidente, Médica, Riesgo, Otra) and offers a "Llamar al 911" button.

**Consequences:**
- SOS subscribes all 4 emergency contacts in user profile.
- Calls `POST /api/sos` with trip_id and type.
- "Llamar al 911" opens system phone dialer.

Realizes UJ-2.

### 4.4 Post-Trip

#### FR-16: Trip summary
After driver completes, show route, distance, duration, fare breakdown, payment method.

#### FR-17: Rating
Show 1-5 stars + optional tags ("Buena música", "Auto limpio", etc.) + comment.

**Consequences:**
- Calls `POST /api/ratings/trips/:trip_id`.
- Rating required to leave the trip-complete screen.

#### FR-18: Payment
Show payment method (cash or MercadoPago). Cash: pay driver directly. MercadoPago: opens checkout.

**Consequences:**
- Webhook from MP confirms payment.
- Trip moves to `completed` only after payment confirmed.

### 4.5 History

#### FR-19: Trip history list
A paginated list of past trips, grouped by month, with route + date + fare + rating.

#### FR-20: Trip detail
Tapping a trip opens TripDetail with route map, driver, fare breakdown, payment method.

Realizes UJ-3.

### 4.6 Profile

#### FR-21: Profile view
Show avatar, name, phone, email. Menu: Edit profile, Payment methods, Trip history, T&C, Sign out.

#### FR-22: Edit profile
Edit name, photo, emergency contacts.

#### FR-23: Sign out
Clear session, return to Welcome.

### 4.7 Feature-Specific NFRs

- **Real-time tracking**: polling interval ≤ 5s during an active trip (v1), WebSocket target ≤ 1s (v2).
- **Map rendering**: pick-up-to-destination polylines render at ≤ 16ms/frame.
- **OTP delivery**: SMS sent within 30s of request.

## 5. Non-Goals (Explicit)

- Cross-border or intercity trips.
- Scheduled rides (book for later).
- Multi-stop trips (A → B → C).
- Ride-sharing (multiple passengers, splitting).
- Driver-side flows (separate app).
- Admin / operations dashboards.
- Promo codes / discounts (place in v2).
- Driver ratings by passenger (already exists in reverse — passenger rates driver).
- In-app chat media (images, voice notes) — text-only in v1.

## 6. MVP Scope

### 6.1 In Scope

- Phone-based auth (FR-1, FR-3, FR-4).
- Trip request with pickup (current GPS) + destination (search + recent) + fare estimate + auto/moto + confirm (FR-5 to FR-9).
- Trip lifecycle: searching → driver card → verification code → in-trip tracking → trip complete (FR-10 to FR-14).
- SOS with 4 types + 911 button (FR-15).
- Trip summary + rating + cash payment (FR-16, FR-17; FR-18 partial).
- Trip history list + trip detail (FR-19, FR-20).
- Profile view + sign out (FR-21, FR-23).

### 6.2 Out of Scope for MVP

- Email auth (FR-2). [NON-GOAL for MVP]
- Edit profile (FR-22). [NON-GOAL for MVP]
- Modify destination in trip (FR-14 partial). [NON-GOAL for MVP]
- Cash + MP payment (FR-18). Cash only in MVP; MP deferred.
- Modify destination in trip. [NON-GOAL for MVP]
- Real-time WebSocket tracking. Polling in MVP; WS deferred.
- Push notifications. [NON-GOAL for MVP]
- Dark mode. [NON-GOAL for MVP]
- Accessibility audits (WCAG 2.1 AA). [NON-GOAL for MVP]
- Internationalization (i18n). Spanish only in MVP.

## 7. Success Metrics

**Primary**

- **SM-1**: Trip completion rate — Trips completed / Trips requested ≥ 85%. Validates FR-9, FR-10.
- **SM-2**: Average driver acceptance time from request — ≤ 30s. Validates FR-10.
- **SM-3**: Active rides per day per registered passenger (≥ 0.1) within 60 days of launch. Validates FR-1, FR-5.

**Secondary**

- **SM-4**: Average rating ≥ 4.2 stars. Validates FR-17.
- **SM-5**: SOS false-alert rate ≤ 10%. Validates FR-15.

**Counter-metrics (do not optimize)**

- **SM-C1**: Driver assignment rate without cancel — do not optimize for 100% (drives aggressive acceptance). Counterbalances SM-2.
- **SM-C2**: Average trip duration — do not optimize for shorter (encourages unsafe driving). Counterbalances SM-3.

## 8. Open Questions

- OQ-1: Map provider — `react-native-maps` with Google vs `expo-maps` vs mock. Affects API key management and SDK licensing.
- OQ-2: Payment provider — MercadoPago only, or also Stripe? Affects onboarding complexity.
- OQ-3: Push notification provider — FCM vs Expo push notifications vs none.
- OQ-4: Driver tracking transport — long polling vs WebSocket via Supabase Realtime vs custom.
- OQ-5: Phone number validation — strip `15` prefix? Handle international formats beyond Argentina?

## 9. Assumptions Index

- Inline `[ASSUMPTION: Argentina-only]` in FR-1 — phone validation hardcoded to +54.
- Inline `[ASSUMPTION: Polling in MVP]` in FR-10 — WebSocket deferred.
- Inline `[ASSUMPTION: Cash payment in MVP]` in §6.2 — MP deferred.
- Inline `[ASSUMPTION: Single passenger]` in §2.2 — group rides deferred.
- Inline `[ASSUMPTION: Single trip per session]` in FR-14 — multi-trip deferred.
