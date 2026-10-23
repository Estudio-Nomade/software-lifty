#!/usr/bin/env bun
/**
 * Lifty dev orchestrator.
 *
 * Starts the backend, the driver app (Expo) and the passenger app (Expo) in
 * parallel, with labeled logs and scannable QR codes.
 *
 * Why not `turbo dev`? Turbo prefixes every line with `pkg:task:` and pipes
 * stdout without a TTY. Both break QR codes: a per-line prefix destroys the QR
 * quiet zone, and a missing TTY flips Expo into non-interactive mode (no QR,
 * `localhost` URL). So we orchestrate the three dev servers here and print the
 * two QR codes ourselves from the LAN URL.
 *
 * Expo must advertise the same LAN host the phone will hit. We force:
 *   - `--lan` on every `expo start`
 *   - `REACT_NATIVE_PACKAGER_HOSTNAME=<lan-ip>` so the manifest's `hostUri`,
 *     `debuggerHost` and bundle URLs never fall back to 127.0.0.1
 *
 * We only print QRs after Metro answers `/status`, and we pre-warm the Android
 * bundle so the first Expo Go scan does not time out on a cold transform.
 *
 * On ~8GB hosts dual Expo cold-start races CPU/RAM: passenger often binds
 * `/status` first while driver (heavier plugins) lands past 90s. We wait longer,
 * stagger passenger spawn, soft-fail then late-retry, and pre-warm the real
 * monorepo `expo-router/entry` path (not bare `/index.bundle`, which 404s).
 *
 * Idempotent: any leftover process still holding one of our three ports is
 * terminated before starting, so `bun run dev` can be re-run freely. Cleanup
 * is scoped to our own ports — no blanket `pkill`.
 */
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import { syncDevPorts } from '../apps/backend/scripts/port';

const ROOT = new URL('..', import.meta.url).pathname;
const BACKEND_PORT = 3001;
const DRIVER_PORT = 8081;
const PASSENGER_PORT = 8083;
const PORTS = [BACKEND_PORT, DRIVER_PORT, PASSENGER_PORT];
/** First wait — covers slow driver cold start on low-RAM hosts. */
const METRO_READY_TIMEOUT_MS = 180_000;
/** After soft fail, keep polling so a late-ready Metro still gets a QR. */
const METRO_LATE_RETRY_MS = 120_000;
const METRO_POLL_MS = 400;
/** Let driver bind before passenger steals CPU on dual cold start. */
const PASSENGER_SPAWN_STAGGER_MS = 5_000;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};

type Proc = ReturnType<typeof Bun.spawn>;

const children: Proc[] = [];
const recentLogs = new Map<string, string[]>();
const LOG_RING = 40;
let shuttingDown = false;

function pushLog(label: string, line: string): void {
  const ring = recentLogs.get(label) ?? [];
  ring.push(line);
  if (ring.length > LOG_RING) ring.shift();
  recentLogs.set(label, ring);
}

function dumpRecentLogs(label: string): void {
  const ring = recentLogs.get(label) ?? [];
  if (ring.length === 0) {
    process.stdout.write(`${C.dim}${pad(label)}${C.reset} (no child logs captured)\n`);
    return;
  }
  process.stdout.write(`${C.dim}${pad(label)}${C.reset} last ${ring.length} log lines:\n`);
  for (const line of ring) {
    process.stdout.write(`${C.dim}  | ${line}${C.reset}\n`);
  }
}

function pad(label: string, width = 11): string {
  return label.length >= width ? label : label.padEnd(width);
}

/**
 * Best-effort LAN IPv4 for Expo Go on the phone.
 * Prefer real wifi/ethernet ifaces; skip waydroid/docker/bridges and the
 * Waydroid default 192.168.240.0/24 (not reachable from home Wi-Fi).
 */
function lanIp(): string {
  type Cand = { address: string; name: string };
  const preferred: Cand[] = [];
  const others: Cand[] = [];

  for (const [name, ifaces] of Object.entries(networkInterfaces())) {
    if (/^(waydroid|docker|br-|lxcbr|veth|virbr|vmnet|vboxnet)/i.test(name)) {
      continue;
    }
    const isWifiOrEth = /^(wlan|wlp|wl|eth|en)/i.test(name);
    for (const iface of ifaces ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (iface.address.startsWith('192.168.240.')) continue;
      if (/^(127\.|169\.254\.|172\.1[7-9]\.|172\.2\d\.|172\.3[01]\.)/.test(iface.address)) {
        continue;
      }
      const cand = { address: iface.address, name };
      if (isWifiOrEth) preferred.push(cand);
      else others.push(cand);
    }
  }

  const pool = [...preferred, ...others];
  return (
    pool.find((c) => c.address.startsWith('192.168.'))?.address ??
    pool.find((c) => c.address.startsWith('10.'))?.address ??
    pool[0]?.address ??
    'localhost'
  );
}

function qrString(url: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(url, { small: true }, (code: string) => resolve(code));
  });
}

function listenersOnPort(port: number): number[] {
  const res = Bun.spawnSync(['lsof', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const out = res.stdout.toString().trim();
  if (!out) return [];
  return out
    .split('\n')
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p) && p > 0);
}

async function clearPort(port: number, label: string): Promise<void> {
  let pids = listenersOnPort(port);
  if (pids.length === 0) return;
  process.stdout.write(
    `${C.dim}${label} freeing port ${port} (pid ${pids.join(', ')})${C.reset}\n`,
  );
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  await Bun.sleep(600);
  pids = listenersOnPort(port);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

async function pipeStream(
  stream: ReadableStream<Uint8Array>,
  label: string,
  color: string,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf('\n');
      while (idx !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line.length === 0) {
          idx = buffer.indexOf('\n');
          continue;
        }
        pushLog(label, line);
        process.stdout.write(`${color}${pad(label)}${C.reset} ${line}\n`);
        idx = buffer.indexOf('\n');
      }
    }
    if (buffer.length > 0) {
      const tail = buffer.replace(/\r$/, '');
      pushLog(label, tail);
      process.stdout.write(`${color}${pad(label)}${C.reset} ${tail}\n`);
    }
  } catch {
    // stream closed
  }
}

function spawn(
  cmd: string[],
  cwd: string,
  label: string,
  color: string,
  env: Record<string, string> = {},
): Proc {
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    env: {
      ...process.env,
      ...env,
    },
  });
  children.push(proc);
  pipeStream(proc.stdout, label, color);
  pipeStream(proc.stderr, label, color);
  proc.exited
    .then((code) => {
      const tone = code === 0 || code === null ? C.dim : C.red;
      process.stdout.write(
        `${tone}${pad(label)}${C.reset} exited (code ${code})${
          code && code !== 0 ? ' — Metro on this port is DOWN' : ''
        }\n`,
      );
    })
    .catch(() => {});
  return proc;
}

async function probeMetro(host: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/status`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = await res.text();
    return res.ok && body.includes('packager-status:running');
  } catch {
    return false;
  }
}

async function waitForMetro(
  port: number,
  label: string,
  host: string,
  timeoutMs: number,
): Promise<boolean> {
  // Probe LAN first (QR host), then loopback — covers bind-only-localhost misconfig.
  const hosts = host === '127.0.0.1' || host === 'localhost' ? [host] : [host, '127.0.0.1'];
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(
    `${C.dim}${pad(label)}${C.reset} waiting for Metro on ${hosts.map((h) => `${h}:${port}`).join(' | ')} (${timeoutMs / 1000}s)...\n`,
  );
  while (Date.now() < deadline) {
    for (const h of hosts) {
      if (await probeMetro(h, port)) {
        process.stdout.write(
          `${C.green}${pad(label)}${C.reset} Metro ready (http://${h}:${port})\n`,
        );
        return true;
      }
    }
    await Bun.sleep(METRO_POLL_MS);
  }
  process.stdout.write(
    `${C.yellow}${pad(label)}${C.reset} Metro not ready after ${timeoutMs / 1000}s (will late-retry if still booting)\n`,
  );
  return false;
}

/** Soft-fail path: keep polling so a late driver still prints QR. */
async function waitForMetroLate(port: number, label: string, host: string): Promise<boolean> {
  process.stdout.write(
    `${C.dim}${pad(label)}${C.reset} late-retry Metro up to ${METRO_LATE_RETRY_MS / 1000}s more...\n`,
  );
  return waitForMetro(port, label, host, METRO_LATE_RETRY_MS);
}

function reportMetroFailure(label: string, name: string, port: number, host: string): void {
  process.stderr.write(
    [
      `${C.red}${pad(label)}${C.reset} ${name} Metro never became ready on :${port}.`,
      '  QR for this app will NOT be printed (Expo Go would fail).',
      `  curl -sS http://127.0.0.1:${port}/status`,
      `  curl -sS http://${host}:${port}/status`,
      `  Solo esta app: bun run ${port === DRIVER_PORT ? 'dev:driver' : 'dev:passenger'}`,
      '  Si ves PluginError / missing app.plugin.js: bun install (root) y revisá plugins en app.json.',
      '',
    ].join('\n'),
  );
  dumpRecentLogs(label);
}

/**
 * Pre-warm the real monorepo expo-router entry (bare /index.bundle 404s under
 * workspace Metro serverRoot). Hit loopback so LAN firewall does not matter.
 */
async function prewarmBundle(
  port: number,
  label: string,
  appSlug: 'mobile' | 'mobile-passengers',
): Promise<void> {
  const entryPath = `apps/${appSlug}/node_modules/expo-router/entry.bundle`;
  const url = `http://127.0.0.1:${port}/${entryPath}?platform=android&dev=true&hot=false&lazy=true&minify=false`;
  process.stdout.write(`${C.dim}${pad(label)}${C.reset} pre-warming Android bundle...\n`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    // Drain body so Metro finishes the transform.
    await res.arrayBuffer().catch(() => null);
    process.stdout.write(
      `${C.green}${pad(label)}${C.reset} bundle warm-up done (HTTP ${res.status})\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`${C.yellow}${pad(label)}${C.reset} bundle warm-up skipped (${msg})\n`);
  }
}

async function printAppQr(
  label: string,
  color: string,
  name: string,
  port: number,
  host: string,
): Promise<void> {
  // exp:// is what Expo Go expects when scanning a LAN packager.
  const url = `exp://${host}:${port}`;
  const qr = await qrString(url);
  const browserUrl = `http://${host}:${port}`;
  process.stdout.write(
    [
      '',
      `${C.bold}${color}${pad(label)}${C.reset} ${name} — escanea con Expo Go`,
      `  ${color}${url}${C.reset}`,
      `  ${C.dim}mismo Wi-Fi · Metro en 0.0.0.0 · hostUri=${host}:${port}${C.reset}`,
      `  ${C.dim}browser (dev web, HTTP only): ${browserUrl}${C.reset}`,
      `  ${C.dim}web dedicado: bun run dev:driver:web  /  bun run dev:passenger:web${C.reset}`,
      qr,
      '',
    ].join('\n'),
  );
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`\n${C.dim}Shutting down Lifty dev servers...${C.reset}\n`);
  for (const proc of children) {
    try {
      proc.kill();
    } catch {
      // already gone
    }
  }
  await Bun.sleep(700);
  for (const port of PORTS) {
    for (const pid of listenersOnPort(port)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main(): Promise<void> {
  const host = lanIp();
  process.stdout.write(`${C.bold}${C.cyan}Lifty dev${C.reset} — backend + conductor + pasajeros\n`);
  process.stdout.write(`  ${C.dim}LAN host: ${host}${C.reset}\n`);

  if (host === 'localhost') {
    process.stdout.write(
      `${C.yellow}⚠ No se detectó IP LAN. Expo Go en el teléfono no podrá conectar.${C.reset}
  Conectá Wi-Fi o usá túnel: cd apps/mobile && bunx expo start --tunnel --port 8081
`,
    );
  }

  // Idempotency: free our ports from any previous run.
  await Promise.all([
    clearPort(BACKEND_PORT, '[backend]'),
    clearPort(DRIVER_PORT, '[conductor]'),
    clearPort(PASSENGER_PORT, '[pasajeros]'),
  ]);

  // Pin PORT=3001 and EXPO_PUBLIC_API_PORT=3001 across .env files.
  await syncDevPorts();

  process.stdout.write(
    `\n  ${C.yellow}[backend]  ${C.reset}http://localhost:${BACKEND_PORT}  (API + Swagger /docs)\n`,
  );
  process.stdout.write(`${C.dim}── logs ──${C.reset}\n\n`);

  const expoEnv = {
    REACT_NATIVE_PACKAGER_HOSTNAME: host,
    // Ensure Metro is reachable from other devices on the LAN.
    EXPO_DEVTOOLS_LISTEN_ADDRESS: '0.0.0.0',
  };

  // Backend first (its predev brings up docker Postgres/Redis).
  spawn(['bun', 'run', 'dev'], join(ROOT, 'apps', 'backend'), '[backend]', C.yellow);

  // Driver Metro first — heavier cold start (image-picker/location plugins).
  spawn(
    ['node_modules/.bin/expo', 'start', '--lan', '--port', String(DRIVER_PORT)],
    join(ROOT, 'apps', 'mobile'),
    '[conductor]',
    C.cyan,
    expoEnv,
  );

  process.stdout.write(
    `${C.dim}${pad('[pasajeros]')}${C.reset} staggering ${PASSENGER_SPAWN_STAGGER_MS / 1000}s so conductor binds first...\n`,
  );
  await Bun.sleep(PASSENGER_SPAWN_STAGGER_MS);

  spawn(
    ['node_modules/.bin/expo', 'start', '--lan', '--port', String(PASSENGER_PORT)],
    join(ROOT, 'apps', 'mobile-passengers'),
    '[pasajeros]',
    C.magenta,
    expoEnv,
  );

  // Wait for both Metros (long first window), late-retry soft fails, warm, THEN QRs.
  let [driverReady, passengerReady] = await Promise.all([
    waitForMetro(DRIVER_PORT, '[conductor]', host, METRO_READY_TIMEOUT_MS),
    waitForMetro(PASSENGER_PORT, '[pasajeros]', host, METRO_READY_TIMEOUT_MS),
  ]);

  if (!driverReady) {
    driverReady = await waitForMetroLate(DRIVER_PORT, '[conductor]', host);
  }
  if (!passengerReady) {
    passengerReady = await waitForMetroLate(PASSENGER_PORT, '[pasajeros]', host);
  }

  if (!driverReady) {
    reportMetroFailure('[conductor]', 'Conductor (driver)', DRIVER_PORT, host);
  }
  if (!passengerReady) {
    reportMetroFailure('[pasajeros]', 'Pasajero (passenger)', PASSENGER_PORT, host);
  }

  await Promise.all([
    driverReady ? prewarmBundle(DRIVER_PORT, '[conductor]', 'mobile') : Promise.resolve(),
    passengerReady
      ? prewarmBundle(PASSENGER_PORT, '[pasajeros]', 'mobile-passengers')
      : Promise.resolve(),
  ]);

  if (driverReady) {
    await printAppQr('[conductor]', C.cyan, 'Conductor (driver)', DRIVER_PORT, host);
  }
  if (passengerReady) {
    await printAppQr('[pasajeros]', C.magenta, 'Pasajero (passenger)', PASSENGER_PORT, host);
  }

  if (!driverReady || !passengerReady) {
    process.stdout.write(
      `${C.yellow}${C.bold}⚠ Dev stack parcialmente listo${C.reset} — faltó QR de ${[
        !driverReady ? 'conductor' : null,
        !passengerReady ? 'pasajero' : null,
      ]
        .filter(Boolean)
        .join(' + ')}. Revisá logs rojos arriba.\n\n`,
    );
  }

  process.stdout.write(
    [
      `${C.dim}Si Expo Go no conecta:${C.reset}`,
      `  1. Mismo Wi-Fi que esta máquina (${host})`,
      '  2. Cache limpia:  bun run dev:driver:clear   /   bun run dev:passenger:clear',
      '  3. Túnel (otra red):  cd apps/mobile && bunx expo start --tunnel --port 8081',
      '',
      `${C.dim}Browser vs Expo Go:${C.reset}`,
      '  - QR / exp://… = Expo Go en el teléfono (camino principal)',
      `  - http://${host}:8081 = shell web del conductor (solo si Metro está up; NUNCA https://)`,
      '  - Si Chrome dice "No se puede acceder": curl http://127.0.0.1:8081/status',
      '    → si falla, el packager no está corriendo (bun run dev / bun run dev:driver:web)',
      '',
    ].join('\n'),
  );

  // Keep the orchestrator alive until a signal triggers shutdown.
  await new Promise<void>(() => {});
}

main();
