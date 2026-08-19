---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: [_bmad-output/planning-artifacts/passenger-app/prd.md, _bmad-output/planning-artifacts/passenger-app/architecture-spine.md]
---

# Lifty Passenger App — Epic Breakdown

## Overview

This document decomposes the PRD (`_bmad-output/planning-artifacts/passenger-app/prd.md`) and Architecture spine into implementable stories, organized by user value. Already-completed phases (Phase 0, Phase 1) are marked as such with their implementation status.

## Requirements Inventory

### Functional Requirements

- **FR-1**: Phone-based auth (OTP via SMS, +54 prefix)
- **FR-2**: Email auth (deferred, v2)
- **FR-3**: Session persistence via Supabase
- **FR-4**: T&C acceptance
- **FR-5**: Set pickup location (GPS or map)
- **FR-6**: Set destination (autocomplete + recent)
- **FR-7**: Fare estimate
- **FR-8**: Vehicle selection (auto / moto)
- **FR-9**: Trip request
- **FR-10**: Driver search (30s polling)
- **FR-11**: Driver card
- **FR-12**: Verification code (4 digits)
- **FR-13**: Real-time tracking
- **FR-14**: In-trip controls (chat, modify, cancel)
- **FR-15**: SOS (4 types + 911)
- **FR-16**: Trip summary
- **FR-17**: Rating (1-5 stars, tags, comment)
- **FR-18**: Payment (cash + MP)
- **FR-19**: Trip history list
- **FR-20**: Trip detail
- **FR-21**: Profile view
- **FR-22**: Edit profile (deferred, v2) — name+phone shipped #263; photo still open
- **FR-23**: Sign out

### Non-functional Requirements

- Real-time tracking: polling interval ≤ 5s (v1)
- Map rendering: 16ms/frame for polylines
- OTP delivery: SMS within 30s
- Cold-start: < 2s to Home
- Theme alignment with design tokens (AD-1, AD-6)

### UX Design Requirements

- 18 screens in `App-pasajeros.pen`
- 28 tokens
- Inter font
- Component library: Button (4 variants), Input, OTPInput, Card, Navbar, TabBar, DriverCard, ChatBubble, Toggle

### FR Coverage Map

- **FR-1, FR-3, FR-4**: Epic 1 (Auth)
- **FR-5..FR-9**: Epic 3 (Trip Request)
- **FR-10..FR-15**: Epic 4 (Trip Lifecycle + SOS)
- **FR-16..FR-18**: Epic 5 (Post-Trip)
- **FR-19, FR-20**: Epic 6 (History)
- **FR-21, FR-23**: Epic 7 (Profile)

## Epic List

1. **Epic 1** — Foundation (Phase 0) [DONE]
2. **Epic 2** — Auth (Phase 1) [DONE]
3. **Epic 3** — Home + Map Shell [DONE]
4. **Epic 4** — Trip Request [DONE]
5. **Epic 5** — Trip Lifecycle + SOS [IN PROGRESS] — verification done; SOS backend ready (#255); chat/call wired; SOS POST /sos + live tracking open
6. **Epic 6** — Post-Trip (Rating + Payment) [IN PROGRESS] — TripComplete + rateRide wired (no longer mock); tags/comment + payment-confirm open
7. **Epic 7** — Trip History + Detail [IN PROGRESS] — list done; detail open
8. **Epic 8** — Profile + Sign Out [DONE] — edit name/phone #263
9. **Epic 9** — Polish + Tests (Buffer) [IN PROGRESS] — #264 clear address, #265 tabbar inset, #266 fare-by-geo on main

> **Status SoT:** `_bmad-output/implementation-artifacts/sprint-status.yaml` (last resync 2026-08-19, PRs #254–#267).

---

## Epic 1: Foundation (Phase 0) — DONE

**Goal**: Build the reusable UI components, infrastructure (stores, API client, Supabase), and theme foundation that every subsequent epic depends on.

### Story 1.1: Theme tokens aligned with design

As a developer,
I want a single `theme/index.ts` object with the 28 design tokens from `App-pasajeros.pen`,
So that every UI component uses the same color, spacing, radius, and font values.

**Acceptance Criteria:**
- **Given** the theme file is imported
- **When** a screen accesses `theme.colors.primary`
- **Then** it returns `#00C2B3`
- **And** `theme.colors.deepBlue` returns `#0D2B45`
- **And** Inter is the font family
- **And** all 28 tokens from `design-tokens.md` are present

**[DONE]** — `src/theme/index.ts` shipped.

### Story 1.2: Button component with 4 variants

As a developer,
I want a Button component with `primary`, `secondary`, `danger`, `cta` variants,
So that auth and trip screens share consistent buttons.

**Acceptance Criteria:**
- **Given** a Button with `variant="primary"`
- **When** rendered
- **Then** it has teal background, white text, 52px height, 12px radius
- **And** with `variant="cta"` it has 56px height
- **And** with `loading` it shows ActivityIndicator
- **And** with `disabled` it has 0.5 opacity

**[DONE]** — `src/components/Button.tsx` shipped.

### Story 1.3: Input component with icon and error states

As a developer,
I want an Input component that handles phone, text, email, and password inputs,
So that auth screens have a consistent input.

**Acceptance Criteria:**
- **Given** an Input with `icon="📱"`
- **When** rendered
- **Then** the icon appears to the left of the input
- **And** with `error="invalid"` the border turns red
- **And** with `keyboardType="phone-pad"` the right keyboard appears

**[DONE]** — `src/components/Input.tsx` shipped.

### Story 1.4: OTPInput with 6-cell auto-focus

As a developer,
I want an OTPInput component that shows 6 cells and auto-focuses the next one,
So that the Login OTP screen is intuitive.

**Acceptance Criteria:**
- **Given** a 6-digit OTP being entered
- **When** the user types "1" in the first cell
- **Then** focus moves to the second cell
- **And** when "Backspace" is pressed in an empty cell, focus moves back
- **And** each filled cell has a teal border

**[DONE]** — `src/components/OTPInput.tsx` shipped.

### Story 1.5: Card component

As a developer,
I want a Card component with configurable padding and shadow,
So that cards throughout the app are consistent.

**Acceptance Criteria:**
- **Given** a Card with `padding="lg"`
- **When** rendered
- **Then** it has 24px padding, 16px radius, white background, and card shadow

**[DONE]** — `src/components/Card.tsx` shipped.

### Story 1.6: Auth Context + Auth Store

As a developer,
I want a Zustand auth store and a React Context that listens to Supabase auth state,
So that screens can read the session.

**Acceptance Criteria:**
- **Given** a user logs in
- **When** the Supabase session changes
- **Then** `useAuthStore.getState().session` is updated
- **And** on app launch, the existing session is restored from storage

**[DONE]** — `src/store/authStore.ts`, `src/context/AuthContext.tsx`, `src/hooks/usePassengerAuth.ts` shipped.

### Story 1.7: Supabase client

As a developer,
I want a Supabase client configured for React Native with session persistence,
So that the app can call supabase.auth.* and persist sessions.

**Acceptance Criteria:**
- **Given** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set
- **When** the app opens
- **Then** `supabase` is initialized and ready to use
- **And** sessions persist across app restarts

**[DONE]** — `src/lib/supabase.ts` shipped.

### Story 1.8: API client with JWT interceptor

As a developer,
I want an axios client that attaches the Supabase JWT to every request,
So that backend endpoints can identify the user.

**Acceptance Criteria:**
- **Given** a user is logged in
- **When** any axios request is made
- **Then** the Authorization header contains `Bearer <jwt>`
- **And** a 401 response triggers `supabase.auth.signOut()`

**[DONE]** — `src/api/client.ts` shipped.

### Story 1.9: Ride and Location stores

As a developer,
I want ride and location stores for cross-screen state,
So that trip state survives navigation between screens.

**Acceptance Criteria:**
- **Given** a trip is requested
- **When** the user navigates between screens
- **Then** `useRideStore.getState().activeTrip` is preserved
- **And** `useLocationStore.getState().current` reflects the latest GPS

**[DONE]** — `src/store/rideStore.ts`, `src/store/locationStore.ts` shipped.

---

## Epic 2: Auth (Phase 1) — DONE

**Goal**: Implement the auth flow (Welcome → LoginPhone → LoginOTP → Home) with Supabase OTP, so the user can register and log in.

### Story 2.1: Welcome screen

As a user opening the app,
I want a clean welcome screen with branded logo and 3 actions,
So that I can choose how to enter the app.

**Acceptance Criteria:**
- **Given** the app is opened for the first time
- **When** the Welcome screen renders
- **Then** I see a Lifty logo, "Movilidad que te eleva" tagline, and 2 buttons: "Ingresar con celular" (primary) and "Crear cuenta" (secondary)
- **And** a "Términos y condiciones" link
- **And** the background is deepBlue

**[DONE]** — `src/screens/WelcomeScreen.tsx` shipped.

### Story 2.2: LoginPhone screen

As a user,
I want to enter my phone number with the +54 prefix,
So that I can receive an OTP via SMS.

**Acceptance Criteria:**
- **Given** I'm on LoginPhone
- **When** I enter a 10+ digit phone number
- **Then** the "Enviar código" button enables
- **And** tapping it calls `supabase.auth.signInWithOtp`
- **And** on success, I navigate to LoginOTP with the phone in params

**[DONE]** — `src/screens/LoginPhoneScreen.tsx` shipped.

### Story 2.3: LoginOTP screen

As a user,
I want to enter the 6-digit OTP I received,
So that I can verify my phone and access the app.

**Acceptance Criteria:**
- **Given** I'm on LoginOTP with the phone from the previous screen
- **When** I enter the 6 digits
- **Then** the "Verificar" button enables
- **And** tapping it calls `supabase.auth.verifyOtp`
- **And** on success, I navigate to /home with `replace` (no back to login)
- **And** a "Reenviar en 30s" cooldown appears

**[DONE]** — `src/screens/LoginOTPScreen.tsx` shipped.

### Story 2.4: Register screen

As a new user,
I want to enter my name, surname, and accept T&C,
So that I can register before verifying my phone.

**Acceptance Criteria:**
- **Given** I'm on Register
- **When** I enter name + surname and check the T&C checkbox
- **Then** the "Continuar" button enables
- **And** tapping it saves the name to `registrationDraftStore` and navigates to LoginPhone
- **And** after OTP verify, the name is applied to `supabase.auth.updateUser({ data: full_name })`

**[DONE]** — `src/screens/RegisterScreen.tsx` shipped.

### Story 2.5: Terms screen

As a user,
I want to read the terms and conditions before accepting,
So that I know what I'm agreeing to.

**Acceptance Criteria:**
- **Given** I'm on Terms
- **When** I scroll through the content
- **Then** I see 8+ sections of terms
- **And** tapping "Aceptar" returns to the previous screen

**[DONE]** — `src/screens/TermsScreen.tsx` shipped.

### Story 2.6: Registration draft flow

As a new user going through Register → LoginPhone → LoginOTP,
I want my name from Register to be saved after OTP verification,
So that my profile has the correct name.

**Acceptance Criteria:**
- **Given** I completed Register with full name
- **When** I complete OTP verify
- **Then** `supabase.auth.updateUser({ data: { full_name: <name> } })` is called
- **And** the draft is cleared after success
- **And** if `updateUser` fails, the user is still authenticated (non-blocking)

**[DONE]** — `src/store/registrationDraftStore.ts`, fix in `LoginOTPScreen.tsx` shipped.

---

## Epic 3: Home + Map Shell [DONE]

**Goal**: Build the post-auth Home screen with a map, location awareness, and the navigation shell (TabBar) so users can request trips.

### Story 3.1: Map provider installed and configured

As a developer,
I want a working map provider (Google Maps or react-native-maps),
So that the Home screen can render a map.

**Acceptance Criteria:**
- **Given** the app is on Home
- **When** the Home screen renders
- **Then** a map fills the body area
- **And** the user's current GPS is shown as a marker (when permission granted)

**Decisions needed**: Map provider (OQ-1). Mock map for MVP if decision deferred.

### Story 3.2: Location permission flow

As a developer,
I want to request foreground location permission on first Home visit,
So that the app can show the user's location on the map.

**Acceptance Criteria:**
- **Given** the user is on Home for the first time
- **When** the screen mounts
- **Then** it calls `Location.requestForegroundPermissionsAsync()`
- **And** if granted, the user's GPS is fetched and stored in `locationStore`
- **And** if denied, the app shows a default city center

### Story 3.3: Home screen with bottom CTA

As a passenger,
I want to see a map of my area with a "A dónde vas?" button at the bottom,
So that I can start a trip request.

**Acceptance Criteria:**
- **Given** I'm on Home
- **When** the screen renders
- **Then** I see a map (filling most of the screen), a Navbar at top, and a "A dónde vas?" button at the bottom
- **And** the button navigates to `select-pickup`

### Story 3.4: TabBar component (Home / Historial / Perfil)

As a user,
I want a bottom navigation bar with 3 tabs (Home, Historial, Perfil),
So that I can switch between main sections.

**Acceptance Criteria:**
- **Given** I'm on any non-trip screen
- **When** the screen renders
- **Then** the TabBar is visible at the bottom
- **And** tapping a tab navigates to that section

### Story 3.5: Navbar component

As a user,
I want a top navigation bar with title and optional back/close button,
So that I can navigate consistently.

**Acceptance Criteria:**
- **Given** a screen needs a Navbar
- **When** the Navbar is rendered
- **Then** it shows the title and a back arrow (if applicable)
- **And** the back arrow calls `useAppNavigation().goBack()`

---

## Epic 4: Trip Request [DONE]

**Goal**: Implement the trip request flow: select pickup, select destination, get fare estimate, confirm.

### Story 4.1: SetPickup screen (separate from destination)

As a passenger,
I want to set my pickup location (either current GPS or by selecting on a map),
So that the driver knows where to pick me up.

**Acceptance Criteria:**
- **Given** I'm on SetPickup
- **When** the screen renders
- **Then** I see a map and a search bar
- **And** "Confirmar ubicación actual" CTA uses GPS
- **And** tapping a place on the map sets the pickup to that location
- **And** "Confirmar" navigates to SetDestination

### Story 4.2: SetDestination screen

As a passenger,
I want to search for a destination via Google Places autocomplete,
So that I can pick where to go.

**Acceptance Criteria:**
- **Given** I'm on SetDestination
- **When** I type in the search bar
- **Then** autocomplete suggestions appear
- **And** tapping a suggestion selects that destination
- **And** "Lugares recientes" shows places I've been before
- **And** "Confirmar" navigates to FareReview

### Story 4.3: FareReview screen with vehicle selector

As a passenger,
I want to see the fare estimate, distance, time, and select a vehicle type,
So that I can confirm the trip.

**Acceptance Criteria:**
- **Given** I have a pickup and destination
- **When** the FareReview screen renders
- **Then** I see a map with the route, distance, time, fare breakdown
- **And** I can select `auto` or `moto`
- **And** tapping "Confirmar" creates a trip and navigates to SearchingDriver

### Story 4.4: SearchingDriver screen with polling

As a passenger,
I want to see a "Buscando conductor..." screen while the driver accepts,
So that I know the request is in progress.

**Acceptance Criteria:**
- **Given** a trip is requested
- **When** the screen renders
- **Then** I see a pulsing animation and "Conectando con conductor..."
- **And** the app polls `GET /api/trips/active` every 5s
- **And** when a driver accepts, navigate to DriverFound
- **And** if 30s passes without a driver, show "Sin conductores disponibles" with retry

### Story 4.5: Trip request API integration

As a developer,
I want the trip request flow to call the backend API correctly,
So that trips are persisted.

**Acceptance Criteria:**
- **Given** a user confirms a trip in FareReview
- **When** "Confirmar" is tapped
- **Then** `POST /api/trips/request` is called with origin, destination, vehicle_type
- **And** the trip ID is stored in `rideStore`
- **And** the user navigates to SearchingDriver

---

## Epic 5: Trip Lifecycle + SOS [IN PROGRESS]

**Goal**: After a driver accepts, show the driver card, verification code, and in-trip tracking. Implement SOS with 4 emergency types.

**Progress (2026-08-13):** 5.1–5.3 + 5.6 largely shipped; 5.2 verification UI done (#254); SOS backend passenger-capable (#255); 5.5 SOS UI + 5.4 live tracking still open.

**Progress (2026-08-19):** Chat + `tel:` wired from TripInProgress (#260/#261). #263 WhatsApp SOS prefill on Profile is not story 5.5. #267 cancellation engine on main; in-trip uses cancel-preview. 5.4 still missing live `driver:location`, route polyline, Emergencia button.

### Story 5.1: DriverFound card

As a passenger,
I want to see the driver's photo, name, rating, vehicle, and plate when they accept,
So that I know who is coming.

**Acceptance Criteria:**
- **Given** a driver has accepted the trip
- **When** the screen renders
- **Then** I see photo, name, rating, vehicle brand, model, plate, and ETA
- **And** a "Cancelar" button is available

### Story 5.2: VerificationCode screen

As a passenger,
I want to see a 4-digit code when the driver arrives,
So that I can give it to the driver to start the trip.

**Acceptance Criteria:**
- **Given** the driver has arrived
- **When** the screen renders
- **Then** I see a 4-digit code in large font
- **And** the driver can enter this code to start the trip

### Story 5.3: Driver en-route tracking

As a passenger,
I want to see the driver's location on a map as they come to me,
So that I know when they'll arrive.

**Acceptance Criteria:**
- **Given** the driver is on the way
- **When** the screen renders
- **Then** the map shows the driver's location
- **And** the ETA to pickup is shown
- **And** the driver's location updates every 5s (polling)

### Story 5.4: InTrip screen with real-time tracking

As a passenger,
I want to see the route and ETA to my destination during the trip,
So that I know when I'll arrive.

**Acceptance Criteria:**
- **Given** the trip is in progress
- **When** the screen renders
- **Then** the map shows the route, current driver location, and ETA
- **And** a "Emergencia" button is visible
- **And** the location updates every 5s

**[PARTIAL 2026-08-19]** — Chat, call, cancel-preview, status realtime exist. Missing live `driver:location`, route polyline, ETA, Emergencia/SOS button.

### Story 5.5: SOS screen with 4 types

As a passenger,
I want to report an emergency during a trip,
So that I can get help quickly.

**Acceptance Criteria:**
- **Given** I'm on a trip
- **When** I tap the SOS button
- **Then** I see 4 options: Accidente, Emergencia médica, Situación de riesgo, Otra
- **And** I can select one and confirm
- **And** a "Llamar al 911" button is available
- **And** tapping the SOS confirmation calls `POST /api/sos` with trip_id and type

**[OPEN 2026-08-19]** — Backend `POST /api/sos` ready (#255). Profile WhatsApp SOS (#263) is not this story.

### Story 5.6: Cancel trip with rule

As a passenger,
I want to cancel a trip with a reason,
So that I can cancel if the driver is taking too long.

**Acceptance Criteria:**
- **Given** I'm on a trip or waiting for driver
- **When** I tap "Cancelar"
- **Then** I see 5 reasons to choose from
- **And** if cancelled within 5 minutes of request, no fee
- **And** if cancelled after 5 minutes, a cancellation fee is shown

**[DONE engine 2026-08-19 / leftover UI]** — #267 replaced the 5-min early/late model. In-trip uses cancel-preview. ConnectingDriver still blind cancel; driver no-show amount still hardcoded. Do not delete this AC; new policy lives in `docs/superpowers/specs/2026-08-18-cancellation-policy-design.md`.

---

## Epic 6: Post-Trip (Rating + Payment) [IN PROGRESS]

**Progress (2026-08-13):** `POST /passenger/trips/:id/rate` shipped (#254). TripComplete still mock; payment cash open.

**Progress (2026-08-19):** TripComplete is no longer mock (real trip + `rateRide`). Cash paymentStore done. 6.1 missing map/breakdown/payment method. 6.2 stars only (no tags/comment). 6.4 payment-confirm still open.

**Goal**: After the trip completes, show the summary, collect rating, and process payment.

### Story 6.1: TripComplete screen

As a passenger,
I want to see the trip summary (route, distance, time, fare, payment method),
So that I can review what I paid for.

**Acceptance Criteria:**
- **Given** the driver has completed the trip
- **When** the screen renders
- **Then** I see the route map, distance, time, fare breakdown, payment method
- **And** a "Calificar conductor" button is visible

**[PARTIAL 2026-08-19]** — Real trip + fare/distance/duration/driver. Missing route map, fare breakdown, payment method. Rating is inline stars, not a separate screen.

### Story 6.2: Rating screen

As a passenger,
I want to rate the driver 1-5 stars with optional tags and comment,
So that I can give feedback.

**Acceptance Criteria:**
- **Given** I'm on the rating screen
- **When** I tap a star
- **Then** the rating is selected
- **And** I can optionally select tags ("Buena música", "Auto limpio", etc.)
- **And** I can add a comment
- **And** "Enviar calificación" calls `POST /api/ratings/trips/:trip_id`

**[PARTIAL 2026-08-19]** — Stars + `POST /passenger/trips/:id/rate`. Tags, comment, required-to-leave still missing.

### Story 6.3: Payment method selection (cash only in MVP)

As a passenger,
I want to pay cash to the driver,
So that I don't need to enter card details.

**Acceptance Criteria:**
- **Given** the trip is complete
- **When** the payment screen renders
- **Then** "Efectivo" is the default payment method
- **And** "MercadoPago" is shown as "próximamente"
- **And** tapping "Confirmar pago" marks the trip as paid

**[DONE local 2026-08-19]** — paymentStore cash default + transfer form. No passenger payments table. MP still ai-15.

### Story 6.4: Trip completion flow

As a passenger,
I want the trip to be marked as completed after payment,
So that I can return to Home and the trip appears in history.

**Acceptance Criteria:**
- **Given** I confirm payment
- **When** the flow completes
- **Then** the trip is marked `completed`
- **And** I navigate to Home
- **And** the trip appears in TripHistory

---

## Epic 7: Trip History + Detail [IN PROGRESS]

**Progress (2026-08-13):** History list wired; trip detail open.

**Progress (2026-08-19):** Still no trip-detail route; history cards not pressable. Backend `GET /passenger/trips/:id` exists.

**Goal**: Implement the trip history list and trip detail screens so users can review past trips.

### Story 7.1: History list

As a passenger,
I want to see a paginated list of my past trips,
So that I can review my trip history.

**Acceptance Criteria:**
- **Given** I'm on TripHistory
- **When** the screen renders
- **Then** I see trips grouped by month
- **And** each card shows: from → to, date, fare, rating
- **And** scrolling triggers pagination with `GET /api/trips/history`

### Story 7.2: Trip detail

As a passenger,
I want to see the full details of a past trip,
So that I can review the cost, driver, and report issues.

**Acceptance Criteria:**
- **Given** I tap a trip in the history
- **When** the TripDetail screen renders
- **Then** I see: route map, driver info, fare breakdown, payment method, date
- **And** I can tap "Repetir viaje" to start a new trip with the same route
- **And** I can tap "Reportar problema" to file a complaint

---

## Epic 8: Profile + Sign Out [DONE]

**Goal**: Implement the profile view and sign-out flow.

### Story 8.1: Profile view

As a passenger,
I want to see my profile (avatar, name, phone, email),
So that I can verify my info.

**Acceptance Criteria:**
- **Given** I'm on Profile
- **When** the screen renders
- **Then** I see avatar, name, phone, email
- **And** a menu: Editar perfil, Métodos de pago, Historial de viajes, Términos y condiciones, Cerrar sesión

**[DONE + extra 2026-08-19]** — #263: edit name/phone, Support, WhatsApp SOS prefill. Avatar upload still open.

### Story 8.2: Sign out

As a passenger,
I want to sign out of the app,
So that I can log in with a different account.

**Acceptance Criteria:**
- **Given** I'm on Profile
- **When** I tap "Cerrar sesión"
- **Then** `supabase.auth.signOut()` is called
- **And** `useAuthStore.setSession(null)` is called
- **And** I navigate to Welcome with `replace`

---

## Epic 9: Polish + Tests (Buffer) [IN PROGRESS]

**Progress (2026-08-13):** Partial component/screen tests (favorites, ConnectingDriver, TripInProgress).

**Progress (2026-08-19):** #264 clear address, #265 tab bar safe-area, #266 fare-by-geo shipped on main.

**Goal**: Polish the app, add tests, and address edge cases.

### Story 9.1: Component unit tests

As a developer,
I want unit tests for the core components (Button, Input, OTPInput, Card),
So that regressions are caught.

**Acceptance Criteria:**
- **Given** the test suite runs
- **When** testing Button
- **Then** all 4 variants render correctly
- **And** loading and disabled states work

### Story 9.2: Hook unit tests

As a developer,
I want unit tests for `useAppNavigation` and `usePassengerAuth`,
So that store and navigation logic is reliable.

**Acceptance Criteria:**
- **Given** the test suite runs
- **When** testing useAppNavigation
- **Then** SCREEN_TO_ROUTE mapping is correct
- **And** goBack, navigate, replace all work

### Story 9.3: Keyboard handling polish

As a user,
I want the keyboard to never cover the input I'm typing in,
So that I can type without distraction.

**Acceptance Criteria:**
- **Given** the keyboard is open
- **When** I tap an input
- **Then** the screen scrolls to keep the input visible
- **And** the back button dismisses the keyboard

### Story 9.4: Loading states

As a user,
I want to see a loading indicator when actions take time,
So that I know the app is working.

**Acceptance Criteria:**
- **Given** an API call is in progress
- **When** the user is waiting
- **Then** a loading indicator is visible
- **And** the action button is disabled

### Story 9.5: Error boundaries

As a user,
I want to see a friendly error message if something breaks,
So that I can try again or report the issue.

**Acceptance Criteria:**
- **Given** an unexpected error occurs
- **When** the app tries to recover
- **Then** a clear error message is shown
- **And** the app doesn't crash

### Story 9.6: i18n groundwork (Spanish only for MVP)

As a developer,
I want all user-facing strings to be in a single place,
So that i18n can be added later.

**Acceptance Criteria:**
- **Given** a developer needs to change a string
- **When** they look for it
- **Then** it's in a central constants file (not inline in components)
- **And** the language is Spanish (MVP)
