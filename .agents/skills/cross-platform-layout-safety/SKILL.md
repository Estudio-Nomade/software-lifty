---
name: cross-platform-layout-safety
description: "Use when fixing layout, chrome, safe-area, tab bar, map, keyboard, StatusBar, navigation bar, deep links, or any UI that looks correct on one of iOS or Android but wrong on the other — in apps/mobile or apps/mobile-passengers (Expo Go / native)."
---

# Cross-Platform Layout Safety (iOS ↔ Android)

## Overview

**Core principle:** A one-OS fix is unfinished. Prefer the **smallest platform-local delta** that leaves the other OS unchanged.

Lifty already burned a 21-commit cascade (EAS Android → floating tab bar → peeker → map chrome → OAuth) that “fixed Android” and regressed iOS-stable UX. Do not repeat that.

**Stack:** Expo SDK 57, RN 0.86, expo-router, custom `TabBar`, `react-native-safe-area-context`, MapLibre WebView.

## When to Use

- Works on iOS / broken on Android (or reverse)
- Tab bar gaps, peeker/sheet overlap, map chrome under system bars
- KeyboardAvoidingView, StatusBar, Android nav bar, edge-to-edge
- Deep links / OAuth / permissions that differ by OS
- PRs touching `TabBar`, `BottomSheet`, absolute bottom chrome, or `app.json` android/ios

**Not for:** pure backend; pure web Metro quirks (see AGENTS.md).

## Iron Laws

1. **Both OS or it did not ship.** Verify iOS **and** Android on the same change (or block merge on human dual-check).
2. **No shared-layout rewrite for one OS.** Prefer `Platform.select` / narrow `Platform.OS` / inset math.
3. **Insets before magic numbers.** `useSafeAreaInsets()` only — never hardcode home-indicator / nav-bar heights.
4. **One surface per PR.** Tab bar **or** sheet **or** map **or** auth — not a cascade.
5. **Third patch fighting the first → revert** to last dual-OS-good commit; redesign with a plan.

## Decision flow

1. Reproduce on OS-A; confirm OS-B still good (baseline).
2. Classify root cause (table below).
3. Fixable with insets / `Platform.select` / `*.ios.tsx|android.tsx`?  
   - Yes → minimal delta.  
   - No → stop; plan. Do not Uber-ify chrome mid-hotfix.
4. Implement smallest change.
5. Re-check OS-A fixed **and** OS-B unchanged.
6. Only then done / PR.

## Root-cause classes (Lifty)

| Symptom | Likely cause | Safe fix |
|--------|--------------|----------|
| Under gesture/nav bar | Missing bottom inset; Android edge-to-edge | `paddingBottom: Math.max(insets.bottom, N)` on chrome |
| Gap / double pad under tabs | Root SafeArea + tab both apply bottom | Root `edges={['left','right']}`; tab owns bottom |
| Sheet/peeker wrong | Sheet on `bottom:0` ignores tab height | Anchor to **tab height + inset**, not hardcoded |
| Map controls under chrome | Abs children ignore safe area | Offset by tab+inset; don’t strip controls “tabs cover them” without dual check |
| Keyboard covers inputs | KAV behavior | Existing: `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` |
| StatusBar wrong one OS | barStyle | Per-screen; avoid global translucent experiments mid-hotfix |
| OAuth blank on APK | Missing scheme route | Add route + recovery; **don’t** couple to layout |
| Only APK fails | Expo Go ≠ production native | Test preview path; still re-check iOS shared JS |

## Lifty conventions

- **Safe area:** `react-native-safe-area-context` only. Never RN core `<SafeAreaView>` (deprecated, iOS-biased).
- **Driver root:** `SafeAreaView` `edges={['left','right']}` — bottom owned by tab/chrome.
- **TabBar:** absolute bottom; `paddingBottom: Math.max(insets.bottom, 8)`. Mirror on passenger.
- **Tokens:** `theme.dimensions.tabBarHeight` / spacing — no scattered pixel constants.
- **Branches:** small `Platform.OS` / `Platform.select`; file splits only when branches dominate.
- **Maps:** fix MapLibre ready/postMessage gates; don’t assume WebView timing is OS-identical.
- **`app.json` `android.navigationBar`:** dual-OS visual event — call out in PR.

## Forbidden (cascade killers)

| Move | Why |
|------|-----|
| Redesign tab bar “like Uber” while fixing a gap | Shared structure; high iOS blast radius |
| Hide chrome on scroll as hotfix | Interaction model change |
| Strip map zoom/attribution because tabs cover it | Breaks the OS where they don’t |
| Global sheet math rewrite without measuring tab | Peeker wars |
| OAuth fix + layout refactor same PR | Bisect hell |
| “Works on my Android” without iOS re-check | How the cascade started |
| 3rd layout commit same surface same day | Stop → revert → plan |

## PR checklist

```markdown
### Cross-platform layout safety
- [ ] Root cause classified (inset / platform API / deep link / map / other)
- [ ] Minimal delta — not a chrome redesign
- [ ] Verified **iOS**: bug fixed, no new gap/overlap
- [ ] Verified **Android**: bug fixed, no new gap/overlap
- [ ] No drive-by TabBar + Sheet + map + auth in one PR
- [ ] If only one OS available: blocked on human dual-check before merge
```

## Red flags — STOP

- “Fix Android first, iOS later”
- “Just padding, can’t break iOS”
- “While here, make the tab bar floating”
- “iOS was fine last week, didn’t open it”
- Third layout commit on the same component today

→ Park redesign. Smallest dual-safe fix, or revert.

## Docs (Context7 when unsure)

- Expo safe areas → `useSafeAreaInsets` / `react-native-safe-area-context`
- Expo system bars + Android edge-to-edge → content under system bars needs insets
- RN `Platform.OS` / `Platform.select`
- RN legacy `SafeAreaView` deprecated — do not use

## Related

- `apps/mobile/AGENTS.md`, `apps/mobile-passengers/AGENTS.md`
- systematic-debugging before layout rewrite
