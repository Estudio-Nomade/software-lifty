import { t } from 'elysia';

export const EXPO_TOKEN_PATTERN = '^Expo(nent)?PushToken\\[[^\\]\\s]+\\]$';

export const registerTokenBody = t.Object({
  // Both apps only ever obtain Expo push tokens (getExpoPushTokenAsync).
  token: t.String({ pattern: EXPO_TOKEN_PATTERN, maxLength: 512 }),
  // Native platforms only; admin web-push subscriptions use /admin routes.
  platform: t.Optional(t.Union([t.Literal('android'), t.Literal('ios')])),
  // Absent on old app builds -> stored as 'legacy' (delivered to both apps).
  app: t.Optional(t.Union([t.Literal('driver'), t.Literal('passenger')])),
});

export const removeTokenQuery = t.Object({
  token: t.Optional(t.String({ minLength: 1, maxLength: 512 })),
});
