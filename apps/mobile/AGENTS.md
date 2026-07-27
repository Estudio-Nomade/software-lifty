# Lifty — Frontend (Expo SDK 56)

## Stack
- **Expo SDK 56**, React 19.2, React Native 0.85, TypeScript 6.0 strict
- **expo-router** (file-based routing, SDK 56 migration from @react-navigation)
- React Compiler enabled (`experiments.reactCompiler: true` in app.json)
- Entry: `expo-router/entry` in `package.json` main → `App.tsx` re-exports `expo-router/entry`

## Commands (use `bun`, never `npx`)
```bash
bun run start         # expo start
bun run android        # expo start --android
bun run ios            # expo start --ios
bunx tsc --noEmit      # type check
bunx expo-doctor       # diagnostics
```

## Project layout
```
LiftyApp/
├── App.tsx                    # Re-exports expo-router/entry
├── app/                       # File-based routes (expo-router)
│   ├── _layout.tsx            # Root Stack layout + StatusBar
│   ├── index.tsx              # Welcome screen (initial route)
│   ├── login-phone.tsx        # Each screen = one file, kebab-case
│   ├── login-otp.tsx          # All re-export from ../src/screens/
│   └── ... (21 routes total)
├── src/
│   ├── theme/index.ts         # Single theme object — always import from here
│   ├── hooks/useAppNavigation.ts   # Adapter hook: old navigation.navigate() → router.push()
│   ├── components/            # Button, Card, Input, OTPInput, TabBar, Toggle, ChatBubble, Navbar
│   └── screens/               # Screen components — imported by app/ route files
└── assets/                    # Empty — icon not yet added
```

## Routing (expo-router)
- **File-based routing**: `app/` directory. File name = route path (kebab-case).
- **Root layout**: `app/_layout.tsx` defines the Stack navigator with `headerShown: false`.
- **Adding a screen**: create `app/screen-name.tsx` that re-exports the screen component, then add the route mapping in `useAppNavigation.ts`.
- **Navigating**: screens use `useAppNavigation()` hook → `navigate('ScreenName')` (same API as before). The hook maps old PascalCase names to kebab-case routes.
- **Never** import from `@react-navigation/*` — removed in SDK 56 migration.

## Theme
Import from `src/theme/index.ts`. All UI must use `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*`, `theme.radius.*`, `theme.dimensions.*`. Never hardcode colors or sizes.

Key colors: `deepBlue` (#0F2A44), `turquoise` (#1BBFAE), `white`, `lightGray` (#EDF1F5), `mediumGray` (#8A93A0), `dangerRed` (#FF6B6B).

## TypeScript
- `@/*` path alias mapped to `./src/*` in tsconfig paths
- `noEmit: true` — type checking only
- TypeScript 6.0: `baseUrl` removed (deprecated), paths use `./` prefix

## Components & Screens
- **Named exports** only — no default exports
- Styles: `StyleSheet.create()` at bottom of each file
- `Button` variants: `primary`, `secondary`, `danger`, `cta`
- `TabBar` is a **custom UI component**, not a navigator. Tab switching calls `navigation.navigate()`.
- `Navbar` uses `deepBlue` background by default

## Key changes from SDK 53 → 56
- `@react-navigation/*` → expo-router (file-based routing)
- React Compiler enabled in app.json
- `babel.config.js` deleted (babel-preset-expo is now implicit)
- `@babel/core` removed from devDependencies (implicit in Expo 56)
- `StyleSheet.absoluteFillObject` → `StyleSheet.absoluteFill`
- `splash` config removed from app.json (schema changed)
- TypeScript 6.0, `baseUrl` deprecated — removed
