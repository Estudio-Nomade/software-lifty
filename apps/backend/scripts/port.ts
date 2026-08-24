/**
 * Backend API port for local dev.
 *
 * Lifty pins the backend to a single stable port (:3001) and keeps both mobile
 * apps pointed at it via `EXPO_PUBLIC_API_PORT`. No dynamic reassignment, no
 * process killing — if :3001 is taken by something else, the backend fails to
 * bind and prints a clear error (which is the honest signal) instead of
 * silently moving and rewriting every `.env`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BACKEND_DIR = join(import.meta.dir, '..');
const REPO_ROOT = join(BACKEND_DIR, '..', '..');
const BACKEND_ENV = join(BACKEND_DIR, '.env');
const MOBILE_ENVS = [
  join(REPO_ROOT, 'apps', 'mobile', '.env'),
  join(REPO_ROOT, 'apps', 'mobile-passengers', '.env'),
];

export const DEV_API_PORT = 3001;

function upsertKey(content: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, `${key}=${value}`);
  return `${content.trimEnd()}\n${key}=${value}\n`;
}

/**
 * Ensures `apps/backend/.env` has `PORT=3001` and both mobile apps have
 * `EXPO_PUBLIC_API_PORT=3001`. Idempotent — safe on every `bun run dev`.
 */
export async function syncDevPorts(): Promise<number> {
  const content = existsSync(BACKEND_ENV) ? await Bun.file(BACKEND_ENV).text() : '';
  const updated = upsertKey(content, 'PORT', String(DEV_API_PORT));
  if (updated !== content) await Bun.write(BACKEND_ENV, updated);

  for (const envPath of MOBILE_ENVS) {
    const existing = existsSync(envPath) ? await Bun.file(envPath).text() : '';
    const next = upsertKey(existing, 'EXPO_PUBLIC_API_PORT', String(DEV_API_PORT));
    if (next !== existing) await Bun.write(envPath, next);
  }

  return DEV_API_PORT;
}

/** Backwards-compatible alias used by `dev-setup.ts`. */
export const ensureBackendPort = syncDevPorts;
