# Auth signup confirmation email (Supabase Auth)

## Two email paths (do not confuse)

| Path | Who sends | When | Code |
|------|-----------|------|------|
| **A. Signup OTP / confirm account** | **Supabase Auth** (built-in SMTP or Custom SMTP on the project) | `signUp`, `resend({ type: 'signup' })` | Mobile clients → `supabase.auth.*` |
| **B. App transactional** | Backend **Resend** via `sendEmail()` | Admin/KYC/driver notifs | `apps/backend` + `SEND_EMAILS_IN_DEV` / `RESEND_API_KEY` |

Registration confirmation codes are **path A only**. Turning on `SEND_EMAILS_IN_DEV` does **not** deliver signup OTPs.

## Client contract (passenger + driver)

After `signUp`:

1. `session` present → email confirmation disabled; user is logged in.
2. `user.identities.length > 0` → new (or unconfirmed) user; Supabase should have sent confirmation. Navigate to VerifyEmail / verify step.
3. Empty `identities` → email already registered (anti-enumeration); **no mail**; show “iniciá sesión”.

Verify OTP: try `type: 'signup'` first, then `type: 'email'` (driver + passenger).

Resend after signup: `auth.resend({ type: 'signup', email })` — **not** `signInWithOtp` (that is magic/login OTP).

## Dashboard checklist (human)

Project: Supabase URL from mobile `.env` (`EXPO_PUBLIC_SUPABASE_URL`).

1. **Authentication → Providers → Email** enabled; “Confirm email” ON if you want the VerifyEmail OTP UI.
2. **Authentication → Email templates → Confirm signup** must include the **6-digit token** (`{{ .Token }}`) if the apps show OTP inputs (not only a magic link).
3. **Authentication → Users**: latest signup shows unconfirmed + recent activity.
4. **Authentication → Logs** (or Auth logs): look for send failures / rate limit (`email rate limit exceeded`).
5. **Project Settings → Authentication → SMTP**:
   - Default Supabase mailer is limited and often lands in spam (especially Hotmail/Outlook).
   - For reliable delivery: **Custom SMTP** with a verified domain (Resend, Postmark, SES, etc.).
   - Resend as **Supabase Auth SMTP** is valid and **separate** from backend `sendEmail()` (path B).

### Custom SMTP via Resend (Auth only)

1. Resend → Domain → verify DNS for your from-domain.
2. Supabase → Auth → SMTP:
   - Host: `smtp.resend.com`
   - Port: `465` (or provider docs)
   - User: `resend`
   - Pass: Resend API key (store only in Dashboard; never commit)
   - Sender: e.g. `Lifty <noreply@your-domain>`
3. Send a test signup to a fresh **Gmail**; check spam. Note Hotmail/Outlook often need a warm, verified domain.

## Local apps

- Driver: `apps/mobile` — `useAuth.ts` (`useVerifyEmail`, `useResendCode`) + `RegisterScreen`.
- Passenger: `apps/mobile-passengers` — `lib/signupEmail.ts` + `VerifyEmailScreen` + `LoginCredentialsScreen`.
- Backend path B flags: `apps/backend/.env.example` (`RESEND_API_KEY`, `SEND_EMAILS_IN_DEV`).

## Manual test plan

1. Fresh Gmail → passenger register → code arrives (or spam) → verify → session OK.
2. Resend on VerifyEmail → second code arrives; rate-limit message if hammered.
3. Same flow on driver register.
4. Already-registered email → “iniciá sesión”, no eternal verify screen.
5. Hotmail: if Gmail works and Hotmail does not → spam/domain (SMTP), not client OTP type.
