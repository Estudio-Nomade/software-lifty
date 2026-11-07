/**
 * Idempotent service_markets seed (VD + Tandil).
 * Drizzle marks 0055 applied once — if the lab volume only has VD, re-run this.
 *
 *   bun run db:seed-service-markets
 *   DATABASE_URL=... bun run db:seed-service-markets
 */
import { join } from 'node:path';
import { Pool } from 'pg';

const DEV_DB_URL = 'postgresql://lifty:lifty@localhost:5433/lifty';
const connectionString = process.env.DATABASE_URL?.trim() || DEV_DB_URL;

const SEED_SQL = `
INSERT INTO service_markets (
  slug, name, province, status,
  hub_lat, hub_lng,
  pickup_radius_km, dropoff_radius_km, match_radius_km, geo_bias_radius_km,
  timezone
) VALUES
  (
    'villa-dolores', 'Villa Dolores', 'Córdoba', 'active',
    -31.9449464, -65.1905677,
    8, 50, 8, 20,
    'America/Argentina/Cordoba'
  ),
  (
    'tandil', 'Tandil', 'Buenos Aires', 'active',
    -37.3217, -59.1332,
    8, 50, 8, 20,
    'America/Argentina/Buenos_Aires'
  )
ON CONFLICT (slug) DO UPDATE SET
  status = 'active',
  name = EXCLUDED.name,
  province = EXCLUDED.province,
  hub_lat = EXCLUDED.hub_lat,
  hub_lng = EXCLUDED.hub_lng,
  pickup_radius_km = EXCLUDED.pickup_radius_km,
  dropoff_radius_km = EXCLUDED.dropoff_radius_km,
  match_radius_km = EXCLUDED.match_radius_km,
  geo_bias_radius_km = EXCLUDED.geo_bias_radius_km,
  timezone = EXCLUDED.timezone,
  updated_at = now();

UPDATE service_markets m
SET default_district_id = d.id
FROM districts d
WHERE m.slug = 'villa-dolores'
  AND d.name = 'Villa Dolores'
  AND d.province = 'Córdoba'
  AND (m.default_district_id IS DISTINCT FROM d.id);

UPDATE service_markets m
SET default_district_id = d.id
FROM districts d
WHERE m.slug = 'tandil'
  AND d.name = 'Tandil'
  AND d.province = 'Buenos Aires'
  AND (m.default_district_id IS DISTINCT FROM d.id);

INSERT INTO service_market_aliases (market_id, alias, alias_normalized)
SELECT m.id, a.alias, a.alias_normalized
FROM service_markets m
CROSS JOIN (
  VALUES
    ('Villa Dolores', 'villa dolores'),
    ('VD', 'vd'),
    ('V. Dolores', 'v dolores'),
    ('Villa D', 'villa d')
) AS a(alias, alias_normalized)
WHERE m.slug = 'villa-dolores'
ON CONFLICT DO NOTHING;

INSERT INTO service_market_aliases (market_id, alias, alias_normalized)
SELECT m.id, a.alias, a.alias_normalized
FROM service_markets m
CROSS JOIN (
  VALUES
    ('Tandil', 'tandil'),
    ('Tandil centro', 'tandil centro'),
    ('TDI', 'tdi')
) AS a(alias, alias_normalized)
WHERE m.slug = 'tandil'
ON CONFLICT DO NOTHING;
`;

async function main() {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(SEED_SQL);
    const { rows } = await pool.query<{ slug: string; status: string }>(
      `SELECT slug, status FROM service_markets ORDER BY slug`,
    );
    console.log(
      `✅ service_markets seed OK (${rows.length}):`,
      rows.map((r) => `${r.slug}=${r.status}`).join(', '),
    );
  } catch (err) {
    console.error(
      '❌ seed-service-markets failed:',
      err instanceof Error ? err.message : err,
    );
    console.error('   SoT SQL also in src/shared/db/migrations/0055_service_markets.sql');
    console.error(`   script: ${join(import.meta.dir, 'seed-service-markets.ts')}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

await main();
