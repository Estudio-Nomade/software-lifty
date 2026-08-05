# Plan: Notificar al admin cuando un conductor solicita retiro de ganancias

Issue: https://github.com/martiyaquinta/software-lifty/issues/159
Branch: feature/issue-159-withdrawal-admin-notification

## Global Constraints

- Fire-and-forget notifications: email/push failures are logged but never block the API response.
- Admin check: `user.role === 'admin'`, return HTTP 403 if not.
- All backend files follow existing patterns: feature in `src/features/<name>/` with `routes.ts`, `service.ts`, `schema.ts`.
- Email recipients: all users with `role='admin'` in `users` table + any emails from `ADMIN_EMAIL` env var (comma-separated).
- Use `sendEmail()` from `shared/lib/email.ts` for email delivery.
- In non-production envs, `sendEmail()` logs instead of sending — no actual Resend calls in test/development.
- Tests use `bun test`. Run with `bun test` from `apps/backend`.
- Mobile confirmation message: exact text specified in each task.

---

## Task 1: Admin notification on withdrawal + call from withdraw()

### Requirements
1. Add `notifyAdminWithdrawal()` function in `apps/backend/src/features/admin/notifications.ts`.
2. The function receives `{ driverName, driverId, amount, withdrawalId, payoutMethodInfo }`.
3. It queries all admin emails (users with `role='admin'` + `ADMIN_EMAIL` env var) using the same pattern as `notifyAdminNewDriver()`.
4. It sends a rich HTML email with: driver name, driver ID, withdrawal amount, withdrawal ID, payout method account number, and timestamp.
5. If no admin recipients exist, log `[ADMIN-NOTIFY] No admin recipients configured` and return.
6. All wrapped in try/catch with error logging (fire-and-forget pattern).
7. Call `notifyAdminWithdrawal()` from `payments/service.ts:withdraw()` after the withdrawal is committed and MercadoPago responds — specifically after line 184 (insert succeeds) and before the return. The notification is fire-and-forget (not awaited, or awaited in a `.catch()` block).

### Files to modify
- `apps/backend/src/features/admin/notifications.ts` — add function
- `apps/backend/src/features/payments/service.ts` — add import and call

### Tests
- Add test in `apps/backend/src/features/admin/admin.test.ts` for the notification function (verify it selects admin emails and calls sendEmail).
- Verify the existing withdrawal tests still pass after the integration changes.

---

## Task 2: GET /admin/withdrawals/pending endpoint

### Requirements
1. Add a new route `GET /admin/withdrawals/pending` inside the admin feature.
2. Admin-only: if `user.role !== 'admin'`, return HTTP 403.
3. Optional query params: `status` (string, filter by withdrawal status) and `from` / `to` (ISO date strings, filter by created_at range).
4. Returns a list of pending withdrawals with:
   - withdrawal id, amount, status, created_at
   - driver name (from users.full_name via drivers.user_id join)
   - driver phone (from users.phone)
   - payout method account_number (from payout_methods join)
   - MercadoPago withdrawal ID (mp_withdrawal_id)
5. Ordered by created_at ascending (oldest first).
6. Add Elysia schema validation for query params (all optional).
7. Default status filter: `'processing'` (the status set immediately in withdraw()).

### Files to modify
- `apps/backend/src/features/admin/routes.ts` — add new route
- `apps/backend/src/features/admin/service.ts` — add `listPendingWithdrawals()` method
- `apps/backend/src/features/admin/schema.ts` — add query params schema

### Tests
- Add test in `apps/backend/src/features/admin/admin.test.ts` for the endpoint.

---

## Task 3: Mobile — mejorar mensaje de confirmacion post-retiro

### Requirements
1. In `apps/mobile/src/screens/WithdrawScreen.tsx`, update the success confirmation message.
2. Change the `successBody` text from:
   "Tu retiro de {formatCurrency(parsedAmount)} esta siendo procesado."
   to:
   "Tu retiro de {formatCurrency(parsedAmount)} sera procesado. El admin te entregara el efectivo en el proximo horario de pago."
3. Only the success body text changes. No new components, no API calls, no new logic.

### Files to modify
- `apps/mobile/src/screens/WithdrawScreen.tsx` — line 98, update successBody text
