/**
 * Idempotent service_markets seed (VD + Tandil).
 * Inserts missing rows only — never overwrites status/hub/radii (admin SoT).
 * Drizzle marks 0055 applied once; lab volumes that only got VD need this.
 *
 *   bun run db:seed-service-markets
 *   DATABASE_URL=... bun run db:seed-service-markets
 *
 * If a market exists as draft/paused, activate via admin API — not this script.
 */
import { join } from 'node:path';
import { Pool } from 'pg';

const DEV_DB_URL = 'postgresql://lifty:lifty@localhost:5433/lifty';
const connectionString = process.env.DATABASE_URL?.trim() || DEV_DB_URL;

const SEED_SQL = `
-- Legal district required for municipality_status=operational (matchDistrict + pickup).
INSERT INTO districts (name, province, status, terms_and_conditions, privacy_policy)
SELECT
  'Tandil',
  'Buenos Aires',
  'active',
  '<h2>Términos y Condiciones — Tandil</h2><p>Al operar como conductor en Tandil, aceptás cumplir con las normativas municipales de transporte y las tarifas Lifty.</p>',
  '<h2>Política de Privacidad — Tandil</h2><p>Datos de conductor según política general Lifty y legislación argentina.</p>'
WHERE NOT EXISTS (
  SELECT 1 FROM districts WHERE name = 'Tandil' AND province = 'Buenos Aires'
);

UPDATE districts
SET status = 'active'
WHERE name = 'Tandil' AND province = 'Buenos Aires' AND status IS DISTINCT FROM 'active';

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
ON CONFLICT (slug) DO NOTHING;

-- Link default district only when unset (do not clobber admin choice).
UPDATE service_markets m
SET default_district_id = d.id
FROM districts d
WHERE m.slug = 'villa-dolores'
  AND m.default_district_id IS NULL
  AND d.name = 'Villa Dolores'
  AND d.province = 'Córdoba';

UPDATE service_markets m
SET default_district_id = d.id
FROM districts d
WHERE m.slug = 'tandil'
  AND m.default_district_id IS NULL
  AND d.name = 'Tandil'
  AND d.province = 'Buenos Aires';

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
      `✅ service_markets seed OK (${rows.length}, insert-only):`,
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
