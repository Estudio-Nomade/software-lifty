import { t } from 'elysia';

export const tripIdParams = t.Object({
  id: t.String(),
});

export const createTripBody = t.Object({
  origin_lat: t.Number(),
  origin_lng: t.Number(),
  dest_lat: t.Number(),
  dest_lng: t.Number(),
  origin_address: t.Optional(t.String()),
  dest_address: t.Optional(t.String()),
  distance_km: t.Number(),
  duration_minutes: t.Number(),
  vehicle_type: t.String(),
  passenger_id: t.Optional(t.String()),
});

export const collectBody = t.Object({
  payment_method: t.Union([t.Literal('cash'), t.Literal('mercadopago')]),
  mp_payment_id: t.Optional(t.String()),
});

export const startTripBody = t.Object({
  verification_code: t.String({ minLength: 4, maxLength: 4 }),
});
