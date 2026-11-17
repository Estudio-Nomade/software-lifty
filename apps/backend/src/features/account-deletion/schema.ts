import { t } from 'elysia';

export const appRequestBody = t.Object({
  confirm: t.Optional(t.Boolean()),
});

export const webRequestBody = t.Object({
  email: t.String({ minLength: 3, maxLength: 255 }),
  role_hint: t.Optional(t.Union([t.Literal('passenger'), t.Literal('driver'), t.Literal('both')])),
  full_name: t.Optional(t.String({ maxLength: 255 })),
});

export const webVerifyBody = t.Object({
  token: t.String({ minLength: 16, maxLength: 512 }),
});

export const internalProcessBody = t.Object({
  request_id: t.String({ minLength: 1, maxLength: 64 }),
});
