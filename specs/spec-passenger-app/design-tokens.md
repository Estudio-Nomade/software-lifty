# Lifty Passenger App — Design Tokens

Source of truth: `App pasajeros.pen` (Pencil). These are the canonical tokens after the consolidation (28 variables, one scale per type).

## Colors

| Token | Value | Usage |
|---|---|---|
| `primary` | `#00C2B3` | Brand teal — primary buttons, brand accents, links |
| `deepBlue` | `#0D2B45` | Navy — navbar background, primary text on light bg |
| `background` | `#EEF7F6` | Screen chrome / full-screen fill (off-white + soft teal tint) |
| `surface` | `#FFFFFF` | Cards and elevated panels on top of background |
| `surfaceMuted` | `#E3F0EE` | Soft wells, icon circles, empty plates |
| `lightGray` | `#F1F4F6` | Secondary fills — input fills, 1px borders (not full-screen chrome) |
| `mediumGray` | `#A8B1BA` | Muted text — labels, placeholders, captions |
| `white` | `#FFFFFF` | Alias of surface; primary text on dark |
| `black` | `#000000` | True black (rare) |
| `dangerRed` | `#E53935` | Destructive actions, errors, SOS |
| `amber` | `#FFB020` | Promotional banners, warnings |

## Spacing

| Token | Value |
|---|---|
| `spacing-xs` | `4` |
| `spacing-sm` | `8` |
| `spacing-md` | `16` |
| `spacing-lg` | `24` |
| `spacing-xl` | `32` |
| `spacing-2xl` | `48` |

## Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | `10` | Inputs |
| `radius-md` | `12` | Buttons, small cards |
| `radius-lg` | `16` | Cards, sheets |
| `radius-full` | `999` | Pill chips, avatars |

## Typography

| Token | Value |
|---|---|
| `font-family` | `Inter` |
| `font-xs` | `12` |
| `font-sm` | `14` |
| `font-md` | `16` |
| `font-lg` | `20` |
| `font-xl` | `24` |
| `font-2xl` | `28` |
| `font-3xl` | `32` |
| `font-4xl` | `40` |
| `font-5xl` | `48` |

## Status

The screens in `App pasajeros.pen` consistently use this token set. Text content referencing `$3.500`, `$1.500`, etc. is rendered as literal currency text (the `$` prefix is a Pencil variable convention; since no matching variable exists, the value falls back to the literal string).

## Discrepancy with `apps/mobile/src/theme/index.ts`

The mobile code theme uses different values than the design:

| Token | Design (`.pen`) | Mobile code (`theme/index.ts`) |
|---|---|---|
| Brand primary | `#00C2B3` (`primary`) | `#1BBFAE` (`turquoise`) |
| Brand navy | `#0D2B45` (`deepBlue`) | `#0F2A44` (`deepBlue`) |
| Light gray | `#F1F4F6` (`lightGray`) | `#EDF1F5` (`lightGray`) |
| Medium gray | `#A8B1BA` (`mediumGray`) | `#8A93A0` (`mediumGray`) |
| Danger | `#E53935` (`dangerRed`) | `#FF6B6B` (`dangerRed`) |
| Font family | `Inter` | `Nunito` |

**Decision needed before development:** align the mobile code theme to the design (`primary` teal=`#00C2B3`, `deepBlue`=`#0D2B45`, `Inter` font) or update the design to match the existing code. The design here is the more recent work and looks aligned to the Lifty brand.
