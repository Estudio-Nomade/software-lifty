# Lifty — Monorepo

**IMPORTANT — PROJECT STATUS**: Lifty is in **active development**. There is NO production deployment, NO MVP, NO staging environment. No CD pipeline exists. All infrastructure is local/dev-only. Do NOT attempt to deploy or configure production services. The backend runs on `localhost`, the mobile app uses Expo Go in development mode. This status applies until explicitly changed in this file.

## Stack
- **Monorepo**: Bun Workspaces + Turborepo
- **Backend**: Bun + Elysia + Drizzle ORM + PostgreSQL (Supabase) — `apps/backend`
- **Mobile (driver)**: Expo SDK 54 + React 19 + react-native 0.81 — `apps/mobile`
- **Mobile (passenger)**: Expo SDK 54 + React 19 + react-native 0.81 — `apps/mobile-passengers`
- **Pre-commit**: Lefthook (biome on staged files) + Commitlint (conventional commits)
- **CI**: GitHub Actions (lint, typecheck, test via turbo)

## Development Workflow

### Branch protection
- `main` is **protected** — never push directly. All changes via PR.
- CI must pass before merge (lint + typecheck + test).
- Deletion and force push are blocked.
- Configured via GitHub Rulesets.

### Commit conventions
All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add driver onboarding flow
fix: correct trip fare calculation
docs: update API endpoints
chore: upgrade dependencies
refactor: extract auth middleware
test: add SOS endpoint coverage
```
Enforced by commitlint via Lefthook on `commit-msg`. Invalid messages are rejected.

### Pre-commit hooks (Lefthook)
On every commit, Lefthook runs:
- `biome check --fix` on staged `*.ts`, `*.tsx`, `*.js`, `*.json` files
- `commitlint` validates the commit message format

Hooks are skipped on merge and rebase.

## Commands (from root)
```bash
bun install            # install all deps
bun run dev            # backend (3001) + conductor (8081) + pasajeros (8083), con los 2 QR
bun run dev:backend    # solo backend
bun run dev:driver     # solo app conductor (Expo Go / Metro LAN)
bun run dev:driver:web # conductor en browser (Metro --web, puerto 8081)
bun run dev:passenger  # solo app pasajeros (Expo Go / Metro LAN)
bun run dev:passenger:web # pasajero en browser (puerto 8083)
bun run typecheck      # turbo typecheck (both apps)
bun run test           # turbo test (both apps)
bun run lint           # biome check all
bun run format         # biome format all
bun run check          # lint + typecheck
bun run clean          # turbo clean
```

> `bun run dev` usa `scripts/dev-all.ts` (orquestador dedicado), **no** `turbo dev`.
> Turbo antepone `pkg:task:` a cada línea y pipea el stdout sin TTY, lo que rompe
> los QR. El orquestador imprime él mismo los dos QR (desde la URL `exp://<ip-lan>:<puerto>`,
> con `qrcode-terminal`) y arranca los 3 servicios en paralelo con logs etiquetados
> `[backend]` / `[conductor]` / `[pasajeros]`.
>
> Expo se lanza con `--lan` + `REACT_NATIVE_PACKAGER_HOSTNAME=<ip-lan>` para que el
> manifest (`hostUri` / bundle URL) nunca apunte a `127.0.0.1`. Los QR se imprimen
> **después** de que Metro responda `/status` y de un pre-warm del bundle Android
> (evita "Could not connect to development server" por cold transform).
>
> **Expo Go vs browser (no confundir):**
> - Camino principal del conductor: escanear el QR (`exp://<lan-ip>:8081`) con **Expo Go**.
> - `http://<lan-ip>:8081` en Chrome es la shell **web de desarrollo** (Metro). Solo funciona
>   mientras el packager está up (`bun run dev` o `bun run dev:driver:web`). Siempre **HTTP**,
>   nunca `https://` (Metro no sirve TLS → "No se puede acceder a este sitio").
> - Si Chrome muestra ERR_CONNECTION_REFUSED: Metro no está escuchando en 8081. Verificá con
>   `curl -sS http://127.0.0.1:8081/status` → debe decir `packager-status:running`.
> - Web dedicado (abre browser): `bun run dev:driver:web` / `bun run dev:passenger:web`.
>   No mezclar `--web` dentro de `dev-all` (rompe el flujo Expo Go).
>
> Si el QR no conecta:
> ```bash
> bun run dev:driver:clear          # conductor con cache limpia
> bun run dev:passenger:clear       # pasajero con cache limpia
> # otra red / guest Wi-Fi:
> cd apps/mobile && bunx expo start --tunnel --port 8081
> ```

### Per-app commands
```bash
bun --filter @lifty/backend dev
bun --filter @lifty/mobile dev
bun --filter @lifty/mobile web
bun --filter @lifty/mobile-passengers dev
bun --filter @lifty/mobile-passengers web
```

## Directory layout
```
software-lifty/
├── apps/
│   ├── backend/            # @lifty/backend — Elysia API
│   ├── mobile/             # @lifty/mobile — Expo driver app
│   └── mobile-passengers/  # @lifty/mobile-passengers — Expo passenger app
├── specs/             # Product specs
├── turbo.json         # Turborepo pipeline
├── biome.json         # Linter + formatter config
├── lefthook.yml       # Pre-commit hooks config
├── commitlint.config.js
├── .github/workflows/ci.yml
└── package.json       # Root workspace config
```

## CI/CD

### What CI does (GitHub Actions)
- **lint**: Biome check on every push/PR
- **typecheck**: `tsc --noEmit` on both projects
- **test**: Backend tests with PostgreSQL + Redis services (depends on lint + typecheck passing first)
- **Turbo cache**: Cached between runs via `actions/cache`

### What we DON'T have (by design — no production yet)
- No CD pipeline (no Docker registry, no EAS builds, no deployment)
- No staging/production environments
- No versioned releases
- No changelog automation

## Per-project details

### Backend (`apps/backend`)
See `apps/backend/AGENTS.md` for full backend docs.
Quick ref:
- `bun run dev` — hot reload
- Auth: JWT propio (jose), refresh tokens en DB
- DB: Supabase + Drizzle, migraciones via Supabase CLI
- Redis para rate limiting y cache de ubicacion
- Resend para emails

### Mobile driver (`apps/mobile`)
See `apps/mobile/AGENTS.md` for full mobile docs.
Quick ref:
- Expo SDK 54, React 19.2, react-native 0.81, TypeScript 6.0
- expo-router (file-based routing)
- React Compiler enabled
- Theme: `src/theme/index.ts`, usar siempre `theme.colors.*`, etc.

### Mobile passenger (`apps/mobile-passengers`)
See `apps/mobile-passengers/AGENTS.md` for full passenger docs.
Quick ref:
- Same Expo SDK 54 family as the driver app
- expo-router (file-based routing)
- Theme tokens from `App-pasajeros.pen` via `src/theme/index.ts`

## Tech Debt
1. ~~**Backend test script**: `"test": "echo \"Error: no test specified\"` — arreglar para que corra los 194 tests existentes~~ ✅ arreglado (`"test": "bun test"`, 206 tests)
2. ~~**Frontend test script**: Jest instalado pero sin script `test` en package.json — agregarlo~~ ✅ arreglado (PR #28: `"test": "jest"`, 6/6 tests pasando)
3. **Shared tsconfig**: `tsconfig.base.json` en root para extender en ambos proyectos
