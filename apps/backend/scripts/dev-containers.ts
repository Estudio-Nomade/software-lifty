/**
 * Shared local Postgres + Redis bootstrap for worktrees / branches.
 *
 * docker-compose.dev.yml pins `name: lifty-dev`, container_name
 * (lifty-dev-pg / lifty-dev-redis) and ports (5433 / 6380) so the whole
 * monorepo shares one stack. Compose project name alone is not enough: a
 * container created from another worktree still owns the global name, and
 * `compose up` fails with "name is already in use".
 *
 * Strategy:
 *  1. If both named containers are healthy → no-op.
 *  2. If they exist but are stopped → `docker start` + wait healthy.
 *  3. If some are missing → `docker compose up` only the missing services.
 *  4. On name-conflict from compose → start existing containers + wait.
 */
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
export const COMPOSE_FILE = join(REPO_ROOT, 'docker-compose.dev.yml');

const STACK = [
  { container: 'lifty-dev-pg', service: 'postgres' },
  { container: 'lifty-dev-redis', service: 'redis' },
] as const;

const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 500;

type ContainerState = {
  exists: boolean;
  running: boolean;
  /** Docker health status, or null when the container has no healthcheck. */
  health: string | null;
};

function run(
  cmd: string[],
  opts: { cwd?: string; inherit?: boolean } = {},
): { exitCode: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(cmd, {
    cwd: opts.cwd ?? REPO_ROOT,
    stdout: opts.inherit ? 'inherit' : 'pipe',
    stderr: opts.inherit ? 'inherit' : 'pipe',
  });
  const read = (chunk: unknown): string => {
    if (chunk == null) return '';
    if (typeof chunk === 'string') return chunk;
    if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
    return String(chunk);
  };
  return {
    exitCode: proc.exitCode ?? 1,
    stdout: opts.inherit ? '' : read(proc.stdout),
    stderr: opts.inherit ? '' : read(proc.stderr),
  };
}

function inspectContainer(name: string): ContainerState {
  const { exitCode, stdout } = run([
    'docker',
    'inspect',
    '-f',
    '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}',
    name,
  ]);
  if (exitCode !== 0) {
    return { exists: false, running: false, health: null };
  }
  const [runningRaw, healthRaw] = stdout.trim().split(/\s+/);
  const health = !healthRaw || healthRaw === '-' ? null : healthRaw;
  return {
    exists: true,
    running: runningRaw === 'true',
    health,
  };
}

function isReady(state: ContainerState): boolean {
  if (!state.exists || !state.running) return false;
  // No healthcheck → running is enough; with healthcheck require healthy.
  return state.health === null || state.health === 'healthy';
}

function allReady(): boolean {
  return STACK.every(({ container }) => isReady(inspectContainer(container)));
}

function existingNames(): string[] {
  return STACK.map(({ container }) => container).filter((name) => inspectContainer(name).exists);
}

function missingServices(): string[] {
  return STACK.filter(({ container }) => !inspectContainer(container).exists).map(
    ({ service }) => service,
  );
}

function startExisting(): void {
  const names = existingNames();
  if (names.length === 0) return;
  // `docker start` is a no-op for already-running containers.
  run(['docker', 'start', ...names], { inherit: true });
}

async function waitUntilReady(timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (allReady()) return true;
    await Bun.sleep(HEALTH_POLL_MS);
  }
  return allReady();
}

function composeUp(services?: string[]): { ok: boolean; output: string } {
  const args = ['docker', 'compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait'];
  if (services && services.length > 0) args.push(...services);
  const { exitCode, stdout, stderr } = run(args, { inherit: false });
  const output = `${stdout}${stderr}`;
  // Still stream useful lines so predev stays visible.
  if (output.trim()) process.stderr.write(output.endsWith('\n') ? output : `${output}\n`);
  return { ok: exitCode === 0, output };
}

function isNameConflict(output: string): boolean {
  return /name .* is already in use|Conflict\. The container name/i.test(output);
}

/**
 * Ensures lifty-dev-pg (:5433) + lifty-dev-redis (:6380) are up and healthy.
 * Returns false on failure so callers can print context + exit.
 */
export async function ensureDevContainers(): Promise<boolean> {
  if (allReady()) {
    console.log('🐳 Dev infra already up (lifty-dev-pg + lifty-dev-redis)');
    return true;
  }

  const existing = existingNames();
  if (existing.length > 0) {
    console.log(`🐳 Starting existing containers: ${existing.join(', ')}…`);
    startExisting();
    if (await waitUntilReady()) return true;
  }

  const missing = missingServices();
  const label = missing.length === STACK.length ? 'all services' : missing.join(', ');
  console.log(`🐳 docker compose up (${label})…`);
  const result = composeUp(missing.length === STACK.length ? undefined : missing);
  if (result.ok) return true;
  if (await waitUntilReady()) {
    // Race: foreign project already brought them healthy while compose failed.
    console.log('🐳 Compose reported an error but lifty-dev containers are healthy — continuing');
    return true;
  }

  // Worktree / foreign compose project left containers with the same names.
  if (isNameConflict(result.output) && existingNames().length > 0) {
    console.log('🐳 Compose name conflict — reusing existing lifty-dev containers…');
    startExisting();
    if (await waitUntilReady()) return true;
  }

  return false;
}

export function printDevInfraFailure(): void {
  console.error('❌ Failed to start dev infrastructure (docker compose)');
  console.error('   API will not listen on :3001 until Postgres (:5433) + Redis (:6380) are up.');
  console.error('   Common causes:');
  console.error('   • Docker daemon not running');
  console.error(
    '   • DNS/pull de Docker Hub falló (auth.docker.io / registry-1.docker.io) — fijá DNS del host o:',
  );
  console.error(
    '     docker compose -f docker-compose.dev.yml pull && docker compose -f docker-compose.dev.yml up -d --wait',
  );
  console.error('   • Name conflict leftover: docker start lifty-dev-pg lifty-dev-redis');
  console.error(
    '   • Nuclear (keeps PG volume): docker rm -f lifty-dev-pg lifty-dev-redis && docker compose -f docker-compose.dev.yml up -d --wait',
  );
  console.error('   Then: curl -sS http://127.0.0.1:3001/health  (after bun run dev:backend)');
}
