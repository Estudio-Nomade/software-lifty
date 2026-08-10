import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const COMPOSE_FILE = join(REPO_ROOT, 'docker-compose.dev.yml');

const proc = Bun.spawnSync(
  ['docker', 'compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait'],
  { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
);

if (proc.exitCode !== 0) {
  console.error('❌ Failed to start dev infrastructure (docker compose)');
  process.exit(proc.exitCode ?? 1);
}
