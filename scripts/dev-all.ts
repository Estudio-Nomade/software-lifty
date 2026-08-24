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
 * two QR codes ourselves from the LAN URL (Expo's Metro always binds to all
 * interfaces, so `exp://<lan-ip>:<port>` is reachable from Expo Go).
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
let shuttingDown = false;

function pad(label: string, width = 11): string {
  return label.length >= width ? label : label.padEnd(width);
}

/** Best-effort LAN IPv4 address (same WiFi as Expo Go). Skips docker/loopback. */
function lanIp(): string {
  const candidates: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (/^(127\.|169\.254\.|172\.1[7-9]\.|172\.2\d\.|172\.3[01]\.)/.test(iface.address)) {
        continue;
      }
      candidates.push(iface.address);
    }
  }
  return (
    candidates.find((ip) => ip.startsWith('192.168.')) ??
    candidates.find((ip) => ip.startsWith('10.')) ??
    candidates[0] ??
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
        process.stdout.write(`${color}${pad(label)}${C.reset} ${line}\n`);
        idx = buffer.indexOf('\n');
      }
    }
    if (buffer.length > 0) {
      process.stdout.write(`${color}${pad(label)}${C.reset} ${buffer.replace(/\r$/, '')}\n`);
    }
  } catch {
    // stream closed
  }
}

function spawn(cmd: string[], cwd: string, label: string, color: string): Proc {
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  children.push(proc);
  pipeStream(proc.stdout, label, color);
  pipeStream(proc.stderr, label, color);
  proc.exited
    .then((code) => {
      process.stdout.write(`${C.dim}${pad(label)}${C.reset} exited (code ${code})\n`);
    })
    .catch(() => {});
  return proc;
}

async function printAppQr(label: string, color: string, name: string, port: number): Promise<void> {
  const url = `exp://${lanIp()}:${port}`;
  const qr = await qrString(url);
  process.stdout.write(
    [
      '',
      `${C.bold}${color}${pad(label)}${C.reset} ${name} — escanea con Expo Go`,
      `  ${color}${url}${C.reset}`,
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
  process.stdout.write(`${C.bold}${C.cyan}Lifty dev${C.reset} — backend + conductor + pasajeros\n`);

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

  await printAppQr('[conductor]', C.cyan, 'Conductor (driver)', DRIVER_PORT);
  await printAppQr('[pasajeros]', C.magenta, 'Pasajero (passenger)', PASSENGER_PORT);

  process.stdout.write(`${C.dim}── logs ──${C.reset}\n\n`);

  // Backend first (its predev brings up docker Postgres/Redis), Expo apps in parallel.
  spawn(['bun', 'run', 'dev'], join(ROOT, 'apps', 'backend'), '[backend]', C.yellow);
  spawn(
    ['node_modules/.bin/expo', 'start', '--port', String(DRIVER_PORT)],
    join(ROOT, 'apps', 'mobile'),
    '[conductor]',
    C.cyan,
  );
  spawn(
    ['node_modules/.bin/expo', 'start', '--port', String(PASSENGER_PORT)],
    join(ROOT, 'apps', 'mobile-passengers'),
    '[pasajeros]',
    C.magenta,
  );

  // Keep the orchestrator alive until a signal triggers shutdown.
  await new Promise<void>(() => {});
}

main();
