# Deferred work

Last resync: 2026-08-19 (post PR #263–#267). Previous resync 2026-08-13 kept below; no entries deleted.

## Resolved

- source_spec: none
  summary: Show verification_code on passenger in-trip UI
  status: done
  evidence: PR #254 — TripInProgressScreen

- source_spec: none
  summary: Dual-role requirePassenger + rate/estimate API paths
  status: done
  evidence: PR #254

- source_spec: none
  summary: SOS backend passenger-capable
  status: done
  evidence: PR #255 — no getDriverId; trip ownership passenger|driver

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: Bound tags/comment lengths in passenger rate body
  status: done
  evidence: PR #254 — maxLength 255/500 on rateTripBody

- source_spec: none
  summary: Wire TripComplete to real trip data + rateRide
  status: done
  evidence: TripCompleteScreen reads activeTrip and calls rateRide. Map/breakdown/tags still open on 6-1/6-2.

- source_spec: none
  summary: Chat + call driver (were shells)
  status: done
  evidence: ChatScreen + useTripChat + tel: from TripInProgress. Live tracking still open (split below).

- source_spec: none
  summary: Cash payment MVP (local paymentStore)
  status: done
  evidence: paymentStore cash default + PaymentMethodScreen. Backend passenger payments table still wontfix.

- source_spec: none
  summary: Passenger edit profile name + phone
  status: done
  evidence: PR #263 — PUT /passenger/profile. Avatar still open (ai-13).

- source_spec: none
  summary: Cancellation policy engine
  status: done
  evidence: PR #267 — backend engine + migrations. Leftover UI listed under Open.

- source_spec: none
  summary: Clear address / tabbar safe-area / fare-by-geo
  status: done
  evidence: PRs #264 #265 #266

## Open

- source_spec: none
  summary: SOS UI consuming POST /sos (mobile)
  evidence: Backend ready (#255). #263 Profile WhatsApp SOS prefill is NOT this item.

- source_spec: none
  summary: TripComplete leftover AC (route map, fare breakdown, payment method, tags/comment)
  evidence: Screen is no longer mock; 6-1 review / 6-2 in-progress. Former "UI still mock" claim retired.

- source_spec: none
  summary: Live driver tracking on passenger map
  evidence: Backend broadcasts driver:location; passenger does not subscribe or poll. Split out of old "chat, call, tracking" bundle.

- source_spec: none
  summary: Live driver tracking, chat, call driver
  evidence: SUPERSEDED 2026-08-19 — chat/call done; tracking remains in the item above. Kept so prior references stay valid.

- source_spec: none
  summary: Cash payment MVP + trip detail + favorites backend sync
  evidence: Cash slice done (see Resolved). Trip detail (ai-9) and favorites backend (ai-10) still open. Kept as original bundle.

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: Mutual passenger+driver rating — first rater sets trip to rated and blocks the other
  evidence: Both rate flows require status completed then set rated; product decision needed

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: DB unique (trip_id, rater_id) + driver row lock for rating_avg concurrency
  evidence: App-level FOR UPDATE does not lock empty rating rows; avg recomputed without locking driver

- source_spec: none
  summary: Trip detail screen from history
  evidence: No trip-detail route; history cards not pressable. GET /passenger/trips/:id exists.

- source_spec: none
  summary: Favorites backend sync
  evidence: favoritesStore is AsyncStorage only.

- source_spec: none
  summary: Passenger avatar upload
  evidence: Initials only; avatar_url unused. Left out of #263.

- source_spec: none
  summary: Support tickets / canonical support email backend
  evidence: SupportScreen is mailto + WhatsApp + static FAQ.

- source_spec: none
  summary: Mercado Pago / card tokenization for passengers
  evidence: Out of scope. #257 removed MP from passenger request path.

- source_spec: none
  summary: ActiveTripRecovery always router.replace('/home')
  evidence: Does not restore in-trip on session restore (ai-16).

- source_spec: none
  summary: Cancellation policy leftover UI
  evidence: ConnectingDriver cancel has no preview; driver no-show still hardcoded $600; getPassengerDebt unused.
