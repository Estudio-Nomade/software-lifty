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
  pickup_instructions: t.Optional(t.String()),
  distance_km: t.Number(),
  duration_minutes: t.Number(),
  vehicle_type: t.String(),
  passenger_id: t.Optional(t.String()),
});

export const collectBody = t.Object({
  payment_method: t.Union([t.Literal('cash'), t.Literal('transfer')]),
});

export const startTripBody = t.Object({
  verification_code: t.String({ minLength: 4, maxLength: 4 }),
});

export const webhookTripRequestBody = t.Object({
  driver_id: t.String(),
  passenger_id: t.Optional(t.String()),
  origin_lat: t.Number(),
  origin_lng: t.Number(),
  dest_lat: t.Number(),
  dest_lng: t.Number(),
  origin_address: t.Optional(t.String()),
  dest_address: t.Optional(t.String()),
  pickup_instructions: t.Optional(t.String()),
  distance_km: t.Number(),
  duration_minutes: t.Number(),
  vehicle_type: t.String(),
});

export const arrivedBody = t.Object({
  lat: t.Number(),
  lng: t.Number(),
  gps_accuracy_m: t.Optional(t.Number()),
});

export const cancelTripBody = t.Object({
  reason: t.Optional(t.Union([t.Literal('driver_cancel'), t.Literal('no_show')])),
});

export const completeBody = t.Object({
  lat: t.Number(),
  lng: t.Number(),
});

export const respondBody = t.Object({
  action: t.Union([t.Literal('accept'), t.Literal('reject')]),
});

export const sendMessageBody = t.Object({
  text: t.String({ minLength: 1, maxLength: 1000 }),
});
