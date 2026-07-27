# Button: add `outline` variant with configurable `outlineColor`

**Issue**: #175
**Date**: 2026-07-27

## Problem

The "EDITAR PERFIL" button in `ProfileScreen.tsx:296` uses `variant="secondary"`, which applies `mediumGray` border and text. The spec requires a turquoise outline button with uppercase text.

## Design

### Button changes (`apps/mobile/src/components/Button.tsx`)

1. Add `'outline'` to `ButtonVariant` union type
2. Add optional `outlineColor?: string` prop (defaults to `theme.colors.turquoise`)
3. Add `outline` entry in `variantStyles`:
   - `container`: transparent bg, 1.5px border with `outlineColor`, same height/radius as secondary
   - `text`: color = `outlineColor`, **uppercase**
4. Uppercase applied via `textTransform: 'uppercase'` in the variant's text style

### ProfileScreen change

Line 296: `variant="secondary"` → `variant="outline"`. No other props needed (turquoise is the default).

### No breaking changes

- `secondary` variant is untouched
- `outlineColor` is optional — callers can omit it and get turquoise by default
- Future screens can pass `outlineColor={theme.colors.dangerRed}` etc. for different outline colors
