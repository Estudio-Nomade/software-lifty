# Deferred work

Last resync: 2026-08-13 (post PR #254, #255)

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

## Open

- source_spec: none
  summary: SOS UI consuming POST /sos (mobile)
  evidence: Backend ready (#255); screen + client wire still missing

- source_spec: none
  summary: Wire TripComplete to real trip data + rateRide completion flow
  evidence: Rate API exists; UI still mock

- source_spec: none
  summary: Live driver tracking, chat, call driver
  evidence: Epic 5 partial shells

- source_spec: none
  summary: Cash payment MVP + trip detail + favorites backend sync
  evidence: Later epics / action items

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: Mutual passenger+driver rating — first rater sets trip to rated and blocks the other
  evidence: Both rate flows require status completed then set rated; product decision needed

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: DB unique (trip_id, rater_id) + driver row lock for rating_avg concurrency
  evidence: App-level FOR UPDATE does not lock empty rating rows; avg recomputed without locking driver
