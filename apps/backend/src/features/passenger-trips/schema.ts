import { t } from 'elysia';

export const requestTripBody = t.Object({
  origin_lat: t.Number(),
  origin_lng: t.Number(),
  dest_lat: t.Number(),
  dest_lng: t.Number(),
  origin_address: t.Optional(t.String()),
  dest_address: t.Optional(t.String()),
  pickup_instructions: t.Optional(t.String()),
  vehicle_type: t.Union([t.Literal('auto'), t.Literal('moto')]),
  distance_km: t.Number(),
  duration_minutes: t.Number(),
});

export const tripIdParams = t.Object({
  id: t.String(),
});

export const rateTripBody = t.Object({
  rating: t.Integer({ minimum: 1, maximum: 5 }),
  tags: t.Optional(t.String({ maxLength: 255 })),
  comment: t.Optional(t.String({ maxLength: 500 })),
});

export const sendMessageBody = t.Object({
  text: t.String({ minLength: 1, maxLength: 1000 }),
});
