import { t } from 'elysia';

export const marketIdParams = t.Object({
  id: t.String(),
});

export const createServiceMarketBody = t.Object({
  slug: t.String({ minLength: 2, maxLength: 80 }),
  name: t.String({ minLength: 2, maxLength: 120 }),
  province: t.String({ minLength: 2, maxLength: 100 }),
  hub_lat: t.Number(),
  hub_lng: t.Number(),
  pickup_radius_km: t.Optional(t.Number()),
  dropoff_radius_km: t.Optional(t.Number()),
  match_radius_km: t.Optional(t.Number()),
  geo_bias_radius_km: t.Optional(t.Number()),
  default_district_id: t.Optional(t.Nullable(t.String())),
  timezone: t.Optional(t.String()),
  status: t.Optional(t.Union([t.Literal('draft'), t.Literal('active'), t.Literal('paused')])),
  aliases: t.Optional(t.Array(t.String())),
});

export const patchServiceMarketBody = t.Object({
  name: t.Optional(t.String({ minLength: 2, maxLength: 120 })),
  province: t.Optional(t.String({ minLength: 2, maxLength: 100 })),
  hub_lat: t.Optional(t.Number()),
  hub_lng: t.Optional(t.Number()),
  pickup_radius_km: t.Optional(t.Number()),
  dropoff_radius_km: t.Optional(t.Number()),
  match_radius_km: t.Optional(t.Number()),
  geo_bias_radius_km: t.Optional(t.Number()),
  default_district_id: t.Optional(t.Nullable(t.String())),
  timezone: t.Optional(t.String()),
  status: t.Optional(t.Union([t.Literal('draft'), t.Literal('active'), t.Literal('paused')])),
  aliases: t.Optional(t.Array(t.String())),
});
