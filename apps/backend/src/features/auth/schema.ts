import { t } from 'elysia';

export const messageResponse = t.Object({
  message: t.String(),
});

export const meResponse = t.Object({
  id: t.String(),
  phone: t.Union([t.String(), t.Null()]),
  email: t.Union([t.String(), t.Null()]),
  role: t.String(),
  full_name: t.Union([t.String(), t.Null()]),
  avatar_url: t.Union([t.String(), t.Null()]),
  created_at: t.Union([t.String(), t.Null()]),
});

export const legalAcceptBody = t.Object({
  terms_version: t.String({ minLength: 1, maxLength: 64 }),
  privacy_version: t.String({ minLength: 1, maxLength: 64 }),
  user_type: t.Optional(t.Union([t.Literal('driver'), t.Literal('passenger')])),
});

export const legalAcceptResponse = t.Object({
  terms_accepted_at: t.String(),
  terms_version: t.String(),
  privacy_version: t.String(),
  role: t.String(),
});

export const loginHintBody = t.Object({
  email: t.String({ minLength: 3, maxLength: 320 }),
});

/** Single bit: google-only. No exists/methods list (anti-enumeration). */
export const loginHintResponse = t.Object({
  googleOnly: t.Boolean(),
});
