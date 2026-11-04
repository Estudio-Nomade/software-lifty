# Didit KYC session failures

## Symptom

Driver app onboarding step **kyc** → tap verification → UI shows a verification error
(or historically opaque `Internal server error` on production).

App lab often points at Railway via `apps/mobile/.env.local` `EXPO_PUBLIC_API_URL`.

## Quick check

```bash
# Health only means DIDIT_API_KEY is set — not that Didit accepts sessions.
curl -sS https://liftybackend-production.up.railway.app/health | jq .checks.didit

# With a lab driver Bearer token (do not commit tokens):
curl -sS -D- -H "Authorization: Bearer $TOKEN" \
  https://liftybackend-production.up.railway.app/api/kyc/me/session
```

Typed API codes from `createSession` (after fix):

| code | HTTP | Meaning |
|------|------|---------|
| `DIDIT_CREDITS_EXHAUSTED` | 503 | Didit account out of credits — top up |
| `DIDIT_UNAUTHORIZED` | 502 | Bad/missing API key on Railway |
| `DIDIT_WORKFLOW_INVALID` | 502 | Bad/unpublished `DIDIT_WORKFLOW_ID` |
| `DIDIT_NOT_CONFIGURED` | 503 | Missing `DIDIT_WORKFLOW_ID` |
| `DIDIT_TIMEOUT` | 503 | Didit timed out |
| `DIDIT_SESSION_FAILED` | 502 | Other Didit/upstream failure |

Logs: `[DIDIT] createSession failed` with `diditStatus` + redacted body (no API keys).

## Ops: credits exhausted (confirmed 2026-11-04)

Didit `POST /v3/session/` returned **400**:

> You don't have enough credits to perform this request. Please top up at https://business.didit.me

1. Sign in to [Didit Business](https://business.didit.me).
2. Top up credits for the API key used in Railway (`DIDIT_API_KEY`).
3. Confirm workflow UUID in Railway matches a **published** workflow (`DIDIT_WORKFLOW_ID`).
4. Re-test `GET /api/kyc/me/session` → 200 + `session_url`.

Do **not** put API keys in git, PRs, or chat logs.

## Env checklist (Railway)

- `DIDIT_API_KEY` — required (health `didit: configured`)
- `DIDIT_WORKFLOW_ID` — required for real sessions
- `DIDIT_CALLBACK_URL` — e.g. `https://liftyviajes.com/kyc/callback`
- `DIDIT_API_URL` — default `https://verification.didit.me/v3`
- `DIDIT_WEBHOOK_SECRET` — required for webhook HMAC in production (not for create session)

## Not this bug

- Camera / WebView permissions (different ES copy on mobile)
- Dual-role staff 403 on other routes
- Webhook / decision refresh after Didit UI completes
