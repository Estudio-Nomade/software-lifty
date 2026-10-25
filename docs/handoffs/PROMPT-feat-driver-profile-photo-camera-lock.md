# PROMPT — feat(mobile+backend): driver profile photo camera-only + required

**Modo:** IMPLEMENTAR (ya en curso en esta rama).  
**Branch:** `feat/driver-profile-photo-camera-lock`  
**Base tip:** `7347cb8` (#453 insurance en main)  
**ClickUp:** https://app.clickup.com/t/1dfc7p9vqx2  
**Título CU:** `feat(mobile+backend): driver profile photo camera lock`  
**GH:** `gh auth switch --user martiyaquinta`  
**1:1:1:** solo este issue. No insurance reopen · no engine_cc · no license/grace · no passenger · no KYC Didit Selfie rewrite · no docs Step2 gallery.

## Pack
| # | CU | Tema | Estado |
|---|----|------|--------|
| 0 | vqx1 | License A3+60d | DONE #451 |
| 1 | vqwz | engine_cc≥150 | DONE #452 |
| 2 | vqx0 | insurance coverage | DONE #453 |
| 3 | **vqx2** | **foto cámara + lock (ESTE)** | AHORA |

## Product lock
- Paso 1 onboarding: foto de perfil **obligatoria**.
- Fuente: **solo cámara** (no galería) en Paso 1 y en Editar perfil conductor.
- BE: al completar perfil saliendo de `step1` → exige `users.avatar_url` o 400 `AVATAR_REQUIRED`.
- Selfie KYC / Didit **out of scope**.

## AS-IS → cambio
- `OnboardingStep1Screen`: gallery optional → camera required + hard fail upload.
- `ProfileScreen` edit: gallery → camera.
- `drivers/service.updateProfile` profile-completion gate + avatar check.
- Helper `apps/mobile/src/lib/driverProfilePhoto.ts`.

## Verify
```bash
bun --filter @lifty/mobile test -- driverProfilePhoto
bun --filter @lifty/backend test -- drivers.test
bun run typecheck
```

## PR
```
feat(backend+mobile): require driver profile photo via camera
```
ClickUp link + `/review` post-create. Complete CU solo post-merge.
