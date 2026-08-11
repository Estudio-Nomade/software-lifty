# Data Model — Unified User Identity

## Current state

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar phone UK
        varchar role "DEFAULT 'driver'"
        varchar full_name
        varchar avatar_url
    }
    drivers {
        uuid id PK
        uuid user_id FK,UNIQUE "→ users.id"
        varchar status
        varchar kyc_status
        boolean is_online
        real rating_avg
        integer total_trips
    }
    trips {
        uuid id PK
        uuid driver_id FK "→ drivers.id"
        uuid passenger_id "bare UUID, no FK"
        varchar status
        real total_fare
    }
    users ||--o| drivers : user_id
    drivers ||--o{ trips : driver_id
    users ||--o{ trips : "passenger_id (no FK)"
```

## Target state

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar phone UK
        varchar full_name
        varchar avatar_url
    }
    driver_profiles {
        uuid id PK
        uuid user_id FK,UNIQUE "→ users.id"
        varchar status
        varchar kyc_status
        boolean is_online
        real rating_avg
        integer total_trips
    }
    passenger_profiles {
        uuid id PK
        uuid user_id FK,UNIQUE "→ users.id"
        timestamp created_at
    }
    trips {
        uuid id PK
        uuid driver_id FK "→ driver_profiles.id"
        uuid passenger_id FK "→ passenger_profiles.user_id"
        varchar status
        real total_fare
    }
    users ||--o| driver_profiles : user_id
    users ||--o| passenger_profiles : user_id
    driver_profiles ||--o{ trips : driver_id
    passenger_profiles ||--o{ trips : "passenger_id (FK → user_id)"
```

## Migration steps

1. **Create `passenger_profiles` table**
```sql
CREATE TABLE passenger_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_passenger_profiles_user_id ON passenger_profiles(user_id);
```

2. **Backfill driver profiles** — for every existing `users` row with `role = 'driver'`, ensure a `drivers` row exists (most already do).

3. **Add `deriveRole` function** (application-level, in `auth.ts`):
```ts
async function deriveRole(userId: string): Promise<string | null> {
  const [driver] = await db.select({ id: drivers.user_id })
    .from(drivers).where(eq(drivers.user_id, userId)).limit(1);
  const [passenger] = await db.select({ id: passengerProfiles.user_id })
    .from(passengerProfiles).where(eq(passengerProfiles.user_id, userId)).limit(1);
  
  if (driver && passenger) return 'both';
  if (driver) return 'driver';
  if (passenger) return 'passenger';
  return null;
}
```

4. **Update `findOrCreateUser`** — remove `role: 'driver'` from the INSERT. Call `deriveRole` on read.

5. **Update `requireRole`** — accept `'both'` where `'driver'` or `'passenger'` is required.

6. **Keep `users.role` column** — populated via trigger or application code as a denormalized cache. Remove in a future cleanup migration.
