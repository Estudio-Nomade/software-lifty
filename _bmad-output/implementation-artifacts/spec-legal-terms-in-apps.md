---
title: 'Legal terms content in driver and passenger apps'
type: 'feature'
created: '2026-09-24'
status: 'in-review'
review_loop_iteration: 0
context:
  - '{project-root}/docs/legal/terminos-y-condiciones-lifty-borrador.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Both apps show placeholder terms that contradict the legal draft (e.g. “Lifty is only an intermediary / not a transport company”). District terms for Villa Dolores may be empty or stub text, so drivers never see the jurisdictional annex.

**Approach:** Ship an in-app **summary** of the legal draft (general terms) in driver and passenger `TermsScreen`, and seed **Villa Dolores** `districts.terms_and_conditions` + short privacy stub with the jurisdictional annex summary. Full legal MD stays in `docs/legal/` for counsel review — not embedded verbatim.

## Boundaries & Constraints

**Always:**
- Spanish UI copy; English code identifiers.
- Align messaging with legal draft: Lifty is a mobility platform with obligations under applicable law; no absolute liability waivers; no claim that Lifty is “only an intermediary with no duties”.
- District annex content lives in DB (`districts.terms_*`); general terms live as app content modules (no new API this PR).
- Keep existing accept/read flows (`termsAccepted`, `DistrictTermsScreen`, passenger register accept).
- Banner/disclaimer: draft pending lawyer validation before production publish.

**Ask First:**
- Changing acceptance persistence to server-side `terms_version`.
- Publishing full MD body inside the apps.
- Editing the lawyer checklist conclusions as if they were final law.

**Never:**
- New `/legal` API or `terms_accepted_at` schema in this PR.
- Inventing ordinance number / license category / insurance sums.
- Hardcoding absolute “Lifty has zero responsibility for trips”.
- Touching admin panel or unrelated onboarding.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Driver opens Terms (login) | Unauthenticated accept path | Sees summary + draft notice; Accept continues post-auth route | Unchanged routing errors |
| Driver opens Terms (profile) | `from=profile` | Read mode; same summary | N/A |
| Passenger Terms register | `from=register` | Summary; Accept → LoginCredentials | Unchanged |
| Passenger Terms profile | authenticated / profile | Read mode “Volver” | Unchanged |
| Driver district Villa Dolores | GET `/districts/:id` | Non-null terms + privacy with VD annex summary | Existing 404/empty gates |
| District without terms | other cities | Still filtered out of selectable list if null | Unchanged |

</frozen-after-approval>

## Code Map

- `docs/legal/terminos-y-condiciones-lifty-borrador.md` — full legal draft (source of truth for counsel)
- `apps/mobile/src/screens/TermsScreen.tsx` — driver general terms (hardcoded placeholder)
- `apps/mobile-passengers/src/screens/TermsScreen.tsx` — passenger general terms (`TERMS_TEXT`)
- `apps/mobile/src/screens/DistrictTermsScreen.tsx` / `DistrictPickerSheet.tsx` — render district terms from API
- `apps/backend/src/shared/db/schema/districts.ts` — `terms_and_conditions`, `privacy_policy`
- `apps/backend/src/features/districts/service.ts` — list/detail; selectable only if terms non-null
- `apps/backend/src/shared/db/migrations/` + `supabase/migrations/` — dual migration paths
- `apps/mobile-passengers/src/__tests__/screens/TermsScreen.test.tsx` — accept/read behavior

## Tasks & Acceptance

**Execution:**
- [x] `apps/mobile/src/legal/generalTermsSummary.ts` — export versioned summary sections (driver-oriented tone OK; same legal core)
- [x] `apps/mobile-passengers/src/legal/generalTermsSummary.ts` — passenger-oriented summary (same structure)
- [x] `apps/mobile/src/screens/TermsScreen.tsx` — render summary module; remove “solo intermediario / no empresa de transporte”
- [x] `apps/mobile-passengers/src/screens/TermsScreen.tsx` — render summary module instead of `TERMS_TEXT`
- [x] `apps/backend/src/shared/db/migrations/0045_villa_dolores_legal_terms.sql` — UPDATE Villa Dolores terms + privacy summary
- [x] `apps/backend/supabase/migrations/20260924010000_villa_dolores_legal_terms.sql` — same SQL for Supabase CLI
- [x] `apps/mobile-passengers/src/__tests__/screens/TermsScreen.test.tsx` — assert a distinctive summary heading still works with accept flow
- [x] Keep `docs/legal/terminos-y-condiciones-lifty-borrador.md` on branch (already created)

**Acceptance Criteria:**
- Given driver or passenger opens Terms, when screen loads, then they see draft notice + multi-section summary consistent with legal draft (platform role, consumer rights, no absolute waiver).
- Given Villa Dolores row in DB after migration, when driver opens district terms, then annex summary is shown (not empty).
- Given passenger register terms accept, when pressing Aceptar, then still navigates to LoginCredentials.
- Given profile read mode, when pressing Volver, then goBack only.

## Design Notes

Summary sections (both apps, order fixed):
1. Draft notice + version `0.1-borrador`
2. Qué es Lifty (plataforma de movilidad; obligaciones según ley y municipio)
3. Cuenta y uso
4. Viajes, tarifas y pagos (precio por plataforma; info previa; medios electrónicos)
5. Conducta y seguridad / SOS
6. Datos personales → Política de Privacidad (separada; pending full doc)
7. Responsabilidad (reparto Lifty / conductor / pasajero; sin exoneración absoluta; LDC)
8. Jurisdicción inicial Villa Dolores + anexos municipales
9. Cambios de términos

District annex (DB text, plain): territorial scope, municipal registry, app-only trips, no street hails / taxi-bus stops, vehicle/driver requirements at high level, tariffs by platform, municipal sanctions independent of Lifty account actions, verify ordinance text with municipality.

Privacy stub: short pointer that full policy is separate and pending; lists data categories at high level only.

## Verification

**Commands:**
- `bun --filter @lifty/mobile-passengers test src/__tests__/screens/TermsScreen.test.tsx` — pass
- `bun --filter @lifty/mobile test src/__tests__/lib/termsReadMode.test.ts` — pass
- `bun run lint` on touched files if practical — no new biome errors

**Manual checks:**
- Open driver `/terms` and passenger `/terms` — summary visible, no old “no somos empresa de transporte”.
- After applying migration, GET district Villa Dolores returns non-null terms.
