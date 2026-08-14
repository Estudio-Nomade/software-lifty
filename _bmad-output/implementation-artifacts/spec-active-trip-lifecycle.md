---
title: 'Active trip lifecycle — wait for accept + re-enter trip'
type: 'bugfix'
created: '2026-08-14'
status: 'ready-for-dev'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Passenger leaves "waiting" as soon as matching assigns a driver (`offered`), so they see the driver before accept. After the driver accepts, IncomingRequest races (timer reject + poll goBack) and dumps them to home with no way back.

**Approach:** Passenger stays on ConnectingDriver until trip status is `accepted` or later. Driver accept must not be undone by timer/poll. Both apps resume the active trip from home if one exists.

## Boundaries & Constraints

**Always:**
- Passenger UI stays on waiting for `pending` and `offered`.
- Passenger advances only on `accepted` | `en_route` | `waiting` | `in_trip`.
- Driver IncomingRequest must not reject or goBack after accept starts/succeeds.
- Home/Active/Online resume the current non-terminal trip.

**Ask First:**
- Changing offer timeout (20s) or search timeout (30s).

**Never:**
- Matching algorithm rewrite, payments, chat, SOS.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Offer assigned | trip `offered` + driver_id | Passenger stays on ConnectingDriver | N/A |
| Driver accepts | trip `accepted` | Passenger → TripInProgress; driver → Navigation | Accept error: stay on IncomingRequest |
| Accept race | timer hits 0 during POST accept | Do not reject; do not go home | Ignore timer |
| Poll after accept | GET /trips/active null briefly | Do not goBack | Keep Navigation / accepted state |
| Reopen app | active trip exists | Route to the screen for that status | API error: stay on home |

</frozen-after-approval>

## Code Map

- `apps/mobile-passengers/src/screens/ConnectingDriverScreen.tsx` -- gate on status, not driver_id
- `apps/mobile-passengers/src/screens/HomeScreen.tsx` -- resume active ride
- `apps/mobile-passengers/src/api/passenger.ts` -- getActiveRide
- `apps/mobile-passengers/src/__tests__/screens/ConnectingDriver.test.tsx` -- offered vs accepted
- `apps/mobile/src/screens/IncomingRequestScreen.tsx` -- accept races
- `apps/mobile/src/components/AppInitializer.tsx` -- recover `offered`
- `apps/mobile/src/screens/ActiveScreen.tsx` -- resume accepted+ from home
- `apps/mobile/src/screens/OnlineScreen.tsx` -- resume active trip

## Tasks & Acceptance

**Execution:**
- [x] `ConnectingDriverScreen.tsx` -- wait until accepted+ -- AC1
- [x] `ConnectingDriver.test.tsx` -- offered does not navigate; accepted does -- AC1
- [x] `IncomingRequestScreen.tsx` -- block reject/goBack while accepting -- AC2
- [x] `AppInitializer.tsx` + Active/Online -- resume offered/accepted+ -- AC3
- [x] `HomeScreen.tsx` -- resume passenger active trip -- AC3

**Acceptance Criteria:**
- Given trip is `offered`, when passenger polls/receives realtime, then they stay on ConnectingDriver
- Given driver taps accept, when timer or poll fires, then they stay in the accepted trip flow
- Given an active trip, when either app opens home, then they are routed back into that trip

## Verification

- `bunx jest src/__tests__/screens/ConnectingDriver.test.tsx` in mobile-passengers
- Incoming-request tests in mobile if present
- typecheck + lint
