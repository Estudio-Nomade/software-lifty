---
project_name: 'software-lifty'
user_name: 'Marti'
date: '2026-08-10'
sections_completed: ['technology_stack', 'critical_implementation_rules']
existing_patterns_found: 8
---

# Project Context for AI Agents

_Critical rules and patterns AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Repository
- **Monorepo manager**: Bun Workspaces (`apps/*`)
- **Build orchestration**: Turborepo (`turbo.json`)
- **Package manager**: `bun@1.3.14`
- **Lint/format**: Biome (`biome.json`)
- **Pre-commit**: Lefthook (biome + commitlint)
- **CI**: GitHub Actions (lint + typecheck + test via turbo)

### Backend (`apps/backend`)
- **Runtime**: Bun
- **Framework**: Elysia
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL 16 (hosted on Supabase)
- **Auth**: Supabase Auth SDK (`supabase.auth.getUser()`)
- **Cache / rate-limit**: Redis (ioredis)
- **Email**: Resend
- **Connection mode**: Transaction pooler (port 6543) for runtime, session pooler (5432) for migrations
- **Migrations**: Supabase CLI (`supabase db push`)

### Passenger App (`apps/mobile-passengers`)
- **Expo SDK**: 54
- **React**: 19.1
- **React Native**: 0.81
- **Routing**: expo-router (~6.0.24) — file-based
- **React Compiler**: enabled (`experiments.reactCompiler: true`)
- **State (client)**: Zustand 5
- **State (server)**: React Query 5
- **HTTP**: Axios 1
- **Validation**: Zod 4
- **Auth**: Supabase JS SDK 2.x
- **Location**: expo-location
- **Notifications**: expo-notifications
- **Fonts**: `@expo-google-fonts/inter` (font family: Inter)
- **Testing**: Jest + jest-expo + @testing-library/react-native

### Driver App (`apps/mobile`)
- Same Expo SDK 54 family as passenger app
- **Fonts**: `@expo-google-fonts/nunito` (font family: Nunito)
- KYC, maps, route tracking

### Design (`apps/mobile-passengers/design/App-pasajeros.pen`)
- **Tool**: Pencil
- **Source of truth** for the passenger app's design tokens and screen layouts
- **Tokens**: 28 variables (color, spacing, radius, typography)
- **Screens**: 18 (per spec) + 38 extras (edge cases)

### Conventions
- **Commits**: Conventional Commits (`feat|fix|docs|...: subject`), enforced via commitlint
- **GPG signing**: ALL commits must be signed with `-S` (no exceptions)
- **Branch protection**: `main` is protected, all changes via PR
- **PRs**: created via `gh` CLI

---

## Critical Implementation Rules

### Theme tokens (DO NOT hardcode colors/sizes)
- All UI must use `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*`, `theme.radius.*`, `theme.dimensions.*`
- Match the 28 design tokens in `App-pasajeros.pen`:
  - `colors.primary = #00C2B3` (teal)
  - `colors.deepBlue = #0D2B45` (navy)
  - `colors.lightGray = #F1F4F6`, `colors.mediumGray = #A8B1BA`
  - `colors.dangerRed = #E53935`, `colors.amber = #FFB020`
  - `spacing: xs=4, sm=8, md=16, lg=24, xl=32, 2xl=48`
  - `radius: sm=10, md=12, lg=16, full=999`
  - `font: family=Inter, sizes xs=12 ... 5xl=48`
- Driver app uses Nunito + `#1BBFAE` turquoise (older convention, do not import to passenger app)

### Fonts (Inter in passenger app)
- **All new screens** use `theme.fontFamily.regular/medium/semibold/bold` (Inter)
- `@expo-google-fonts/inter` is the font package (NOT Nunito)
- Loaded in `app/_layout.tsx` via `useFonts`
- `app.json` plugins must include `expo-font`

### Expo SDK version disambiguation
- **This project uses Expo SDK 54** (not 53, not 56)
- Compatible versions:
  - `expo: ~54.0.36`
  - `expo-splash-screen: ~31.0.13` (NOT 57.x which is SDK 56)
  - `react-native-gesture-handler: ~2.28.0` (NOT 3.x)
  - `react-native-reanimated: ~4.1.1` (NOT 3.x)
  - `react-native: 0.81.5`
- When installing new deps, run `bunx expo install <pkg>` to get compatible versions

### Conventions
- **Named exports only** — no default exports for components, hooks, utils
- **kebab-case** for file names (`login-phone.tsx`, `useAppNavigation.ts`)
- **PascalCase** for component names (`LoginPhoneScreen`, `useAppNavigation`)
- **No `React.FC`** — use function components with explicit props interfaces
- **StyleSheet.create()** at bottom of each file
- **import { theme } from '../theme'** or `'@/theme'` — never hardcode

### Navigation
- **Never import from `@react-navigation/*`** — removed in SDK 56 migration
- Use `useAppNavigation()` hook which wraps `expo-router`'s `useRouter` + `useSegments`
- Routes mapped in `src/hooks/useAppNavigation.ts` `SCREEN_TO_ROUTE`
- Add new routes by:
  1. Creating `app/<kebab-case>.tsx` that re-exports the screen component
  2. Adding the PascalCase → path mapping in `SCREEN_TO_ROUTE`

### Auth flow (Supabase OTP)
- `supabase.auth.signInWithOtp({ phone })` — sends SMS code
- `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` — verifies
- `supabase.auth.updateUser({ data: { full_name } })` — sets metadata after verify
- Sessions auto-managed by `AuthProvider` (zustand `authStore`)
- After successful auth, ALWAYS `router.replace('/home')` (not `push`) to prevent back navigation to OTP

### API client
- All requests go through `src/api/client.ts` (axios)
- Base URL: `EXPO_PUBLIC_API_URL` (default `http://localhost:3000`)
- Supabase JWT attached via request interceptor
- 401 response triggers `supabase.auth.signOut()` automatically
- API types live in `src/api/types.ts`

### State management
- **Client state**: Zustand stores in `src/store/*Store.ts`
- **Server state**: React Query, never mix with Zustand
- Available stores: `authStore`, `rideStore`, `locationStore`, `registrationDraftStore`
- Cross-screen data flow: use stores (e.g., `registrationDraftStore` carries name from Register → LoginOTP)

### File structure (passenger app)
```
src/
├── api/          # axios client, types
├── components/   # reusable UI (Button, Input, OTPInput, Card)
├── context/      # React Contexts (AuthContext)
├── hooks/        # useAppNavigation, usePassengerAuth
├── lib/          # supabase, queryClient
├── screens/      # Screen components (PascalCase + Screen suffix)
├── store/        # Zustand stores
├── theme/        # Single theme object
├── types/        # .d.ts files
└── utils/        # (TODO: helpers, validators, formatters)
```

### Backend conventions
- Auth via Supabase Auth SDK
- `authGuard` middleware on protected routes
- Use `safeCall` from `shared/lib/route-utils` to handle try/catch in routes
- Rate limits via `rateLimit` middleware (configurable via env)
- `DATABASE_URL` must use Supabase transaction pooler (port 6543), never direct host

### Environment variables
- Always prefix with `EXPO_PUBLIC_` for client-side access
- Declare types in `src/types/global.d.ts`
- Document in `.env.example` (committable)
- Never commit `.env` (in `.gitignore`)

### Testing
- Jest + jest-expo for unit tests
- Co-locate test files with `__tests__/` subfolder
- Use `@testing-library/react-native` for component tests
- Run with `bun --filter @lifty/<pkg> test`

### Linting
- Biome for all formatting and linting
- Run `bun run lint` (root) or `bun --filter @lifty/<pkg> lint`
- Auto-fix with `--fix` when safe
- Imports are auto-sorted (don't manually reorder)

### Git
- Branch names: `feat|fix|chore|docs|refactor/<descriptive-name>`
- Commit format: `<type>(<scope>): <subject>` (conventional)
- **Always sign with `-S`**: `git commit -S -m "..."`
- PRs via `gh pr create --base main --head <branch>`
- Squash or merge commits depend on PR review preference

### Common pitfalls to avoid
- ❌ Don't use `process.env` directly without `EXPO_PUBLIC_` prefix
- ❌ Don't use percentages in `width`/`height` — use `fill_container` or `fit_content`
- ❌ Don't use `margin` (not supported in Pencil schema → translated to react-native)
- ❌ Don't hardcode colors/sizes — use theme tokens
- ❌ Don't use Nunito in passenger app (use Inter)
- ❌ Don't hardcode hex codes — use `theme.colors.primary` etc.
- ❌ Don't add duplicate dependency trees (single version per package)
- ❌ Don't use non-Expo-SDK-54 versions of splash-screen, gesture-handler, reanimated
- ❌ Don't import `@react-navigation/*` (removed)
- ❌ Don't use `React.FC` — explicit props interfaces
- ❌ Don't use default exports for components
- ❌ Don't run `git commit` without `-S` flag
