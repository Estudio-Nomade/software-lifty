# Deferred work

- source_spec: none
  summary: Show verification_code on passenger in-trip / driver-found UI
  evidence: Split from Epic 5 batch; mobile-only after backend API paths land

- source_spec: none
  summary: SOS UI consuming POST /sos
  evidence: Split from Epic 5 batch; independent mobile feature

- source_spec: none
  summary: Wire TripComplete to real trip data + rateRide completion flow
  evidence: Depends on correct rate API path (this batch); ship after paths fixed

- source_spec: none
  summary: Live driver tracking, chat, call driver, cash payment, trip detail, favorites backend
  evidence: Later epics / action items; not part of dual-role + API path fix

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: Mutual passenger+driver rating — first rater sets trip to rated and blocks the other
  evidence: Both rate flows require status completed then set rated; product needs dual-rating or separate flags

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: DB unique (trip_id, rater_id) + driver row lock for rating_avg concurrency
  evidence: App-level FOR UPDATE does not lock empty rating rows; avg recomputed without locking driver

- source_spec: _bmad-output/implementation-artifacts/spec-dual-role-api-paths.md
  summary: Bound tags/comment lengths in rate body schemas to avoid DB 500s
  evidence: varchar limits in ratings table; TypeBox currently unbounded

## Deferred from: code review of spec-dual-role-api-paths.md (2026-08-13)

- Mutual passenger+driver rating blocked by shared completed→rated status (spec accepted passenger sets rated)
- No DB unique (trip_id, rater_id); concurrent insert race — pre-existing ratings pattern
- rating_avg mixes dual-role ratee scores — same as driver ratings path
- Concurrent rating_avg lost update without driver row lock — pre-existing
