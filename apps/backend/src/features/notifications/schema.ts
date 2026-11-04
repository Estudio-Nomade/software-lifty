import { t } from 'elysia';

export const registerTokenBody = t.Object({
  token: t.String({ minLength: 1, maxLength: 512 }),
  platform: t.Optional(t.String({ maxLength: 20 })),
  // Absent on old app builds -> stored as 'legacy' (delivered to both apps).
  app: t.Optional(t.Union([t.Literal('driver'), t.Literal('passenger')])),
});

export const removeTokenQuery = t.Object({
  token: t.Optional(t.String({ minLength: 1, maxLength: 512 })),
});
