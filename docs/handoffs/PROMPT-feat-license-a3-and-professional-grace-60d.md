# PROMPT — feat: license A3 + 60d professional carnet grace (first online)

**ClickUp:** https://app.clickup.com/t/1dfc7p9vqx1  
**Branch:** `feat/license-a3-and-professional-grace-60d`  
**Title:** `feat(backend+mobile): license a3 and 60d professional grace from first online`

## Product locks
- Moto: categorías **A2 / A3 / A4** (A1 no — 50 cc fuera de producto).
- Auto: B = pending profesional; Profesional = satisfied.
- **60 días empiezan en el primer `is_online=true` exitoso** (no approve). One-shot.
- v1: banner only — **no** hard-block online día 61.

## Shipped in this branch
- Migration `0049` + supabase twin
- `professional-license-grace.ts` + unit tests
- `toggleOnline` stamps grace on first online
- `updateProfile` accepts `license_category`
- `getMyStatus` / `getMyProfile` expose grace fields
- Mobile vehicle onboarding license chips
- ActiveScreen banner

## Verify
```bash
bun test apps/backend/src/shared/lib/professional-license-grace.test.ts
cd apps/backend && bun run typecheck
cd apps/mobile && bun run typecheck
# apply migration on local/wabdd before device smoke
```

## Out of scope
- 150cc · insurance todo-riesgo · photo lock · hard-block d61 · stickers clock
