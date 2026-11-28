import { t } from 'elysia';

export const locationUpdateBody = t.Object({
  lat: t.Number(),
  lng: t.Number(),
  heading: t.Optional(t.Number()),
  accuracy: t.Optional(t.Number()),
  speed: t.Optional(t.Number()),
  timestamp: t.Optional(t.Number()),
});
