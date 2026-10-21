#!/usr/bin/env bun
/**
 * Pushes Supabase EXPO_PUBLIC_* vars from each app's local .env into EAS
 * environments (preview + production). API URL is set in each app's eas.json.
 *
 * Prerequisites: `bun run eas:login` as martiyaquinta
 *
 * Usage (from monorepo root):
 *   bun run eas:env:push
 *   bun run eas:env:push -- --app driver
 *   bun run eas:env:push -- --app passenger
 *   bun run eas:env:push -- --env preview
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

type AppDef = {
  id: 'driver' | 'passenger';
  dir: string;
  keys: string[];
};

const APPS: AppDef[] = [
  {
    id: 'driver',
    dir: 'apps/mobile',
    keys: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  },
  {
    id: 'passenger',
    dir: 'apps/mobile-passengers',
    keys: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  },
];

const ENVIRONMENTS = ['preview', 'production'] as const;

function parseArgs(argv: string[]) {
  let appFilter: 'driver' | 'passenger' | 'all' = 'all';
  let envFilter: (typeof ENVIRONMENTS)[number] | 'all' = 'all';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--app' && argv[i + 1]) {
      const v = argv[++i];
      if (v === 'driver' || v === 'passenger') appFilter = v;
      else throw new Error(`--app must be driver|passenger, got ${v}`);
    } else if (a === '--env' && argv[i + 1]) {
      const v = argv[++i];
      if (v === 'preview' || v === 'production') envFilter = v;
      else throw new Error(`--env must be preview|production, got ${v}`);
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: bun run scripts/eas-push-preview-env.ts [--app driver|passenger] [--env preview|production]',
      );
      process.exit(0);
    }
  }

  return { appFilter, envFilter };
}

function parseDotEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function isSensitive(name: string): boolean {
  return name.includes('KEY') || name.includes('ANON') || name.includes('SECRET');
}

function eas(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('bunx', ['eas-cli', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function ensureLoggedIn(cwd: string) {
  const who = eas(cwd, ['whoami']);
  if (!who.ok) {
    console.error('Not logged in to EAS. Run: bun run eas:login');
    console.error(who.stderr || who.stdout);
    process.exit(1);
  }
  console.log(`EAS user: ${who.stdout.trim()}`);
}

function pushVar(cwd: string, name: string, value: string, environment: string) {
  const visibility = isSensitive(name) ? 'sensitive' : 'plaintext';
  // eas env:set [ENVIRONMENT] --name --value --visibility
  const result = eas(cwd, [
    'env:set',
    environment,
    '--name',
    name,
    '--value',
    value,
    '--visibility',
    visibility,
    '--non-interactive',
  ]);

  if (result.ok) {
    console.log(`  ✓ ${name} → ${environment}`);
    return;
  }

  console.error(`  ✗ ${name} → ${environment}`);
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

function main() {
  const { appFilter, envFilter } = parseArgs(process.argv.slice(2));
  const apps = APPS.filter((a) => appFilter === 'all' || a.id === appFilter);
  const envs = ENVIRONMENTS.filter((e) => envFilter === 'all' || e === envFilter);

  if (apps.length === 0) {
    console.error('No apps selected');
    process.exit(1);
  }

  ensureLoggedIn(join(ROOT, apps[0].dir));

  for (const app of apps) {
    const appPath = join(ROOT, app.dir);
    const envPath = join(appPath, '.env');
    const local = parseDotEnv(envPath);

    console.log(`\n[${app.id}] ${app.dir}`);
    if (!existsSync(envPath)) {
      console.error(`  Missing ${envPath} — copy from .env.example and fill Supabase keys`);
      process.exit(1);
    }

    const missing = app.keys.filter((k) => !local[k]?.trim());
    if (missing.length) {
      console.error(`  Missing keys in .env: ${missing.join(', ')}`);
      process.exit(1);
    }

    for (const environment of envs) {
      console.log(`  environment: ${environment}`);
      for (const key of app.keys) {
        pushVar(appPath, key, local[key], environment);
      }
    }
  }

  console.log('\nDone. Next:');
  console.log('  bun run eas:build:android:preview');
}

main();
