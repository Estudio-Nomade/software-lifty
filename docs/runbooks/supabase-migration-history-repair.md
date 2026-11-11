# Reparar el historial de migraciones de Supabase (wabdd…)

## Problema

`supabase_migrations.schema_migrations` en el proyecto `wabddbkwugepkwrgzhpk` solo registra hasta
`20250101000020`. Las migraciones posteriores se aplicaron por fuera de la CLI (SQL editor / scripts),
así que `supabase db push` intentaría correrlas de nuevo. Algunas fallarían (por ejemplo
`20260724120000_pickup_instructions`, que no usa `IF NOT EXISTS`) y otras volverían a cargar seeds.

Verificado el 2026-11-11 contra el esquema real: todas las columnas y tablas de esas migraciones existen,
y también sus efectos (drops, `NOT NULL`, FK de `trips.passenger_id`, seeds de Villa Dolores, San Pedro,
Villa Sarmiento y Tandil).

**Excepción:** `20260715172805_drop_auth_columns` **no** está aplicada del todo. Siguen
`users.password_hash` (5 usuarios con valor) y la tabla `refresh_tokens` (vacía). El código actual no usa
ninguna de las dos. Queda pendiente a propósito: el próximo `db push` la corre y **borra esos datos**.

## Pasos

Usar el session pooler (puerto **5432**) con la contraseña de la DB.

```bash
cd apps/backend
DB='postgresql://postgres.wabddbkwugepkwrgzhpk:<pass>@aws-1-us-west-2.pooler.supabase.com:5432/postgres'

# 1. Marcar como aplicadas las que ya están en el esquema (todas menos 20260715172805)
bunx supabase migration repair --db-url "$DB" --status applied \
  20250101000021 20260719202023 20260721000000 20260721000001 20260722120000 \
  20260724120000 20260724121214 20260726120000 20260806010000 20260810010000 \
  20260810020000 20260811010000 20260813020000 20260814010000 20260818220000 \
  20260820010000 20260913010000 20260915010000 20260917010000 20260924010000 \
  20260924120000 20260929010000 20261023010000 20261024010000 20261025010000 \
  20261025020000 20261026010000 20261028010000 20261029010000 20261031193000 \
  20261102120000 20261103120000 20261104120000 20261105120000 20261107120000

# 2. Verificar: solo debería quedar pendiente 20260715172805
bunx supabase migration list --db-url "$DB"

# 3. Cuando se decida borrar password_hash / refresh_tokens:
bunx supabase db push --db-url "$DB"
```

`repair` solo escribe en la tabla de historial; no ejecuta el SQL de las migraciones.

## Notas

- `20260721_district_terms_and_driver_district.sql` y `20260721_seed_villa_dolores_terms.sql`
  compartían la versión `20260721`. Se renombraron a `20260721000000_…` y `20260721000001_…` (mismo orden)
  porque la CLI necesita versiones únicas.
- `supabase/config.toml` usaba `[inbucket]`, que la CLI 3.x rechaza; ahora es `[local_smtp]`.
