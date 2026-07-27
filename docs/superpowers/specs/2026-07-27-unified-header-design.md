# Unified Header Component

**Issue**: [#165 — Header no unificado entre pantallas](https://github.com/nodo-studio/software-lifty/issues/165)
**Date**: 2026-07-27
**Status**: Ready for implementation

## Problem

No unified header component exists. Each screen implements its own header inconsistently:
- `OnlineScreen` and `ActiveScreen` have inline deepBlue headers with hamburger + avatar (use SafeAreaInsets)
- `ProfileScreen` and `EarningsScreen` have `height: 56` headers without SafeAreaInsets
- `Navbar` component exists but only supports back button + title (used by 15 screens)
- Height is inconsistent: some use `navbarHeight`, some hardcode `56`, some omit insets

## Solution

Extend the existing `Navbar` component to support hamburger menu, avatar, and custom left/right elements, then replace all inline deepBlue headers in tab screens.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Component strategy | Extend Navbar | Avoid maintaining two header components |
| Base height | 64px (was 56px) | Meets issue requirement of ~120px total with notch |
| Scope | deepBlue headers only | Issue scope is tab screens; white/black headers are different contexts |
| Backward compatibility | Full | Existing 15 usages unchanged |

## Navbar — Extended API

### New Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `leftElement` | `ReactNode` | — | Custom left element (overrides back/hamburger) |
| `showHamburger` | `boolean` | `false` | Show ☰ hamburger icon on left |
| `onHamburgerPress` | `() => void` | — | Callback when hamburger is pressed |
| `showAvatar` | `boolean` | `false` | Show avatar circle (👤) on right |

### Render Logic

**Left side** (priority order):
1. `leftElement` is defined → render `leftElement`
2. `showHamburger` is true → render ☰ TouchableOpacity (44x44, white, fontSize xl)
3. `showBack` is true → render ← (existing behavior)
4. Otherwise → placeholder View (minWidth 40)

**Right side** (priority order):
1. `rightElement` is defined → render `rightElement`
2. `showAvatar` is true → render 👤 TouchableOpacity (44x44, rounded, bg mediumGray)
3. Otherwise → placeholder View (minWidth 40)

## Theme Change

`theme.dimensions.navbarHeight`: `56` → `64`

## Screens to Modify

### 1. OnlineScreen
```tsx
// Before: inline header with hamburger + avatar
// After:
<Navbar showHamburger onHamburgerPress={openSideMenu} showAvatar />
```

### 2. ActiveScreen
```tsx
// Before: inline absolute-positioned header with hamburger + connected badge + avatar
// After:
<Navbar
  showHamburger
  onHamburgerPress={openSideMenu}
  showAvatar
  rightElement={<ConnectedBadge />}
/>
```
Note: `rightElement` takes priority over `showAvatar`, so the badge is rendered and avatar must be wrapped in the rightElement.

**ActiveScreen fix**: the rightElement must wrap both the badge AND the avatar:
```tsx
rightElement={
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <ConnectedBadge />
    <AvatarButton onPress={...} />
  </View>
}
```

### 3. ProfileScreen
```tsx
// Before: View with height 56, centered "Perfil" text
// After:
<Navbar title="Perfil" showHamburger onHamburgerPress={openSideMenu} />
```

### 4. EarningsScreen
```tsx
// Before: View with height 56, spacers + "Cobros" text
// After:
<Navbar title="Cobros" showHamburger onHamburgerPress={openSideMenu} />
```

## Not Changing

- All 15 existing `Navbar` usages (back button + title screens): backward compatible
- `ChatScreen`, `LoginCredentialsScreen`, `LoginOTPScreen`, `ForgotPasswordScreen`, `RegisterScreen`: white backgrounds, different design language
- `DNIScanScreen`, `SelfieScreen`: black backgrounds, camera UI

## Verification

- `bun run typecheck` must pass
- `bun run test` must pass
- Visual: all 4 tab screens (Online, Active, Profile, Earnings) show consistent deepBlue header with correct height
