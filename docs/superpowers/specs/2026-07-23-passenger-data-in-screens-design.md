# Passenger Data in IncomingRequestScreen & NavigationScreen

**Issue:** #129
**Date:** 2026-07-23
**Status:** approved

## Overview

Show passenger data (name, avatar, rating, ETA) in `IncomingRequestScreen` and `NavigationScreen`. Currently neither screen displays any passenger information because the trip API responses don't include it.

## Architecture

### Backend: Enrich trip responses

- **Modified endpoint:** `GET /trips/active` (and `GET /trips/:id` for consistency)
- **Change:** `tripService.getActiveTrip` LEFT JOINs `users` table + aggregates `ratings` to add passenger fields
- **New response fields:** `passenger_name`, `passenger_avatar_url`, `passenger_rating`, `passenger_phone`

### Mobile: New UI components

1. **Avatar** — circular image with initials fallback
2. **RatingStars** — ★ display with numeric value

### Mobile: Screen changes

- **IncomingRequestScreen:** Add avatar + name + rating row inside the dark modal card, above route info. Add dynamic ETA to pickup via `/maps/directions`.
- **NavigationScreen:** Collapsible passenger card above the route card, toggleable by tap.

## Backend Details

### Query change in `tripService.getActiveTrip`

LEFT JOIN `users` on `trips.passenger_id = users.id`, LEFT JOIN subquery for average rating from `ratings` on `ratee_id = users.id`.

### New fields in trip response
```ts
passenger_name: string | null
passenger_avatar_url: string | null
passenger_rating: number | null   // avg of ratings.score
passenger_phone: string | null
```

Null when `passenger_id` is null (backward compatible).

### Mobile type update (`api/types.ts`)
Same 4 fields added to `tripSchema`.

## Component Specs

### Avatar
- Props: `uri: string | null`, `name: string`, `size: number`
- Shows `Image` with `borderRadius: size/2` if uri exists
- Falls back to initials circle (first char of name, uppercase, `mediumGray` bg, `white` text)
- Sizes: use `size` prop directly

### RatingStars
- Props: `rating: number`, `size?: number` (default 14)
- Shows filled stars (★) + value text
- Color: `theme.colors.amber`

## Screen Specs

### IncomingRequestScreen
Layout inside dark modal card (top to bottom):
1. **Passenger row:** Avatar (48px) + name + RatingStars — top section
2. **Route info:** origin → destination addresses + distance_km (existing, kept)
3. **ETA to pickup:** new line `{etaMinutes} min al pickup` — call `/maps/directions` on mount
4. **Earnings + buttons:** existing accept/reject

### NavigationScreen
- **Passenger card** positioned above the existing route card, collapsible
- **Collapsed state:** thin bar with small avatar (32px) + name, centered
- **Expanded state:** avatar (56px) + name + rating
- **Toggle:** tap anywhere on the card, use `LayoutAnimation` for smooth expand/collapse
- **Styling:** dark semi-transparent background, rounded corners, matches IncomingRequestScreen aesthetic

## Data Flow

1. Backend enriches `GET /trips/active` with passenger fields
2. Mobile `tripSchema` updated to include new fields
3. `IncomingRequestScreen` reads `trip.passenger_name`, etc.
4. `NavigationScreen` reads same fields from `useTripStore`
5. ETA in IncomingRequestScreen: fetched via `GET /maps/directions` on mount using `locationStore.current`
6. All new fields nullable — graceful fallback for trips without passenger_id
