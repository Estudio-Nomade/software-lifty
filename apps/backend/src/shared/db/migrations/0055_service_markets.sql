-- Service markets: multi-city operational geo (hub + radii).
-- Separate from legal districts (TyC / transit). See docs/architecture/service-markets-multi-city.md

CREATE TABLE IF NOT EXISTS "service_markets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(80) NOT NULL UNIQUE,
  "name" varchar(120) NOT NULL,
  "province" varchar(100) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "hub_lat" double precision NOT NULL,
  "hub_lng" double precision NOT NULL,
  "pickup_radius_km" double precision NOT NULL DEFAULT 8,
  "dropoff_radius_km" double precision NOT NULL DEFAULT 50,
  "match_radius_km" double precision NOT NULL DEFAULT 8,
  "geo_bias_radius_km" double precision NOT NULL DEFAULT 20,
  "default_district_id" uuid REFERENCES "districts"("id") ON DELETE SET NULL,
  "timezone" varchar(64) NOT NULL DEFAULT 'America/Argentina/Cordoba',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_markets_status_check CHECK (status IN ('draft', 'active', 'paused')),
  CONSTRAINT service_markets_pickup_positive CHECK (pickup_radius_km > 0),
  CONSTRAINT service_markets_dropoff_positive CHECK (dropoff_radius_km > 0),
  CONSTRAINT service_markets_match_positive CHECK (match_radius_km > 0),
  CONSTRAINT service_markets_bias_positive CHECK (geo_bias_radius_km > 0)
);

CREATE INDEX IF NOT EXISTS service_markets_status_idx ON "service_markets" ("status");

CREATE TABLE IF NOT EXISTS "service_market_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "market_id" uuid NOT NULL REFERENCES "service_markets"("id") ON DELETE CASCADE,
  "alias" varchar(120) NOT NULL,
  "alias_normalized" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_market_aliases_norm_uidx
  ON "service_market_aliases" ("alias_normalized");

CREATE INDEX IF NOT EXISTS service_market_aliases_market_idx
  ON "service_market_aliases" ("market_id");

-- Seed launch hub Villa Dolores (LOCK D). Link default district when present.
INSERT INTO "service_markets" (
  slug, name, province, status,
  hub_lat, hub_lng,
  pickup_radius_km, dropoff_radius_km, match_radius_km, geo_bias_radius_km,
  default_district_id
)
SELECT
  'villa-dolores',
  'Villa Dolores',
  'Córdoba',
  'active',
  -31.9449464,
  -65.1905677,
  8,
  50,
  8,
  20,
  d.id
FROM (SELECT 1) _
LEFT JOIN "districts" d
  ON d.name = 'Villa Dolores' AND d.province = 'Córdoba'
WHERE NOT EXISTS (
  SELECT 1 FROM "service_markets" WHERE slug = 'villa-dolores'
);

INSERT INTO "service_market_aliases" (market_id, alias, alias_normalized)
SELECT m.id, a.alias, a.alias_normalized
FROM "service_markets" m
CROSS JOIN (
  VALUES
    ('Villa Dolores', 'villa dolores'),
    ('VD', 'vd'),
    ('V. Dolores', 'v dolores'),
    ('Villa D', 'villa d')
) AS a(alias, alias_normalized)
WHERE m.slug = 'villa-dolores'
ON CONFLICT DO NOTHING;

-- Seed Tandil (lab + launch multi-city). No default_district unless row exists.
INSERT INTO "service_markets" (
  slug, name, province, status,
  hub_lat, hub_lng,
  pickup_radius_km, dropoff_radius_km, match_radius_km, geo_bias_radius_km,
  default_district_id,
  timezone
)
SELECT
  'tandil',
  'Tandil',
  'Buenos Aires',
  'active',
  -37.3217,
  -59.1332,
  8,
  50,
  8,
  20,
  d.id,
  'America/Argentina/Buenos_Aires'
FROM (SELECT 1) _
LEFT JOIN "districts" d
  ON d.name = 'Tandil' AND d.province = 'Buenos Aires'
WHERE NOT EXISTS (
  SELECT 1 FROM "service_markets" WHERE slug = 'tandil'
);

INSERT INTO "service_market_aliases" (market_id, alias, alias_normalized)
SELECT m.id, a.alias, a.alias_normalized
FROM "service_markets" m
CROSS JOIN (
  VALUES
    ('Tandil', 'tandil'),
    ('Tandil centro', 'tandil centro'),
    ('TDI', 'tdi')
) AS a(alias, alias_normalized)
WHERE m.slug = 'tandil'
ON CONFLICT DO NOTHING;
