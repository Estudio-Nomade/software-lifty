import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const BACKEND_DIR = join(REPO_ROOT, 'apps', 'backend');
const COMPOSE_FILE = join(REPO_ROOT, 'docker-compose.dev.yml');
const MIGRATIONS = join(BACKEND_DIR, 'src', 'shared', 'db', 'migrations');
// Matches docker-compose.dev.yml (postgres:16, user/password/db = lifty).
const DEV_DB_URL = 'postgresql://lifty:lifty@localhost:5433/lifty';

// 1. Start Postgres + Redis (idempotent). Fails fast if Docker is unavailable.
const proc = Bun.spawnSync(
  ['docker', 'compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait'],
  { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
);

if (proc.exitCode !== 0) {
  console.error('❌ Failed to start dev infrastructure (docker compose)');
  console.error('   API will not listen on :3001 until Postgres (:5433) + Redis (:6380) are up.');
  console.error('   Common causes:');
  console.error('   • Docker daemon not running');
  console.error(
    '   • DNS/pull de Docker Hub falló (auth.docker.io / registry-1.docker.io) — fijá DNS del host o:',
  );
  console.error('     docker compose -f docker-compose.dev.yml pull && docker compose -f docker-compose.dev.yml up -d --wait');
  console.error('   • Si las imágenes ya están locales: docker compose -f docker-compose.dev.yml up -d --wait');
  console.error('   Then: curl -sS http://127.0.0.1:3001/health  (after bun run dev:backend)');
  process.exit(proc.exitCode ?? 1);
}
// 2. Bring the dev DB up to date with the Drizzle migrations. Idempotent and
//    fast when nothing changed. Without this, a fresh or stale `lifty-pgdata`
//    volume drifts from the schema and the backend fails at startup with
//    "column does not exist" / "relation does not exist" on trips/platform_config.
const pool = new Pool({ connectionString: DEV_DB_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
} catch (err) {
  console.error('❌ Failed to migrate dev DB:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await pool.end();
}

// 3. Idempotent service_markets seed (VD + Tandil, insert-only). Migration 0055
//    only runs once; lab volumes that applied an older/partial 0055 stay VD-only
//    without this. Always same URL as migrate above (docker local) — pin
//    DATABASE_URL so a shell export aimed at cloud/prod cannot redirect the seed
//    while migrate still hits DEV_DB_URL.
const seed = Bun.spawnSync(['bun', 'run', 'scripts/seed-service-markets.ts'], {
  cwd: BACKEND_DIR,
  env: { ...process.env, DATABASE_URL: DEV_DB_URL },
  stdout: 'inherit',
  stderr: 'inherit',
});
if (seed.exitCode !== 0) {
  console.error('❌ Failed to seed service_markets (target:', DEV_DB_URL, ')');
  process.exit(seed.exitCode ?? 1);
}
