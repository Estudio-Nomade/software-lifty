# Design: Selección de provincia y municipio para conductores

**Fecha:** 2026-07-21

## Contexto

Un conductor aprobado debe elegir en qué municipio va a trabajar antes de poder ir online.
Cada municipio tiene términos, condiciones y política de privacidad propios que el conductor
debe leer y aceptar. La selección es permanente (no se puede cambiar después).

Actualmente el backend tiene una tabla `districts` con 7 municipios de Córdoba y un endpoint
`GET /api/districts`, pero no hay relación entre drivers y districts, y el móvil nunca
consume esa API.

## Flujo nuevo

```
Aprobado → SelectProvince → SelectDistrict → DistrictTerms → Online
```

1. **SelectProvinceScreen**: Lista de provincias que tienen municipios activos
2. **SelectDistrictScreen**: Municipios activos dentro de la provincia elegida
3. **DistrictTermsScreen**: Términos + política de privacidad del municipio, con botón "Aceptar y continuar"
4. El conductor no puede ir al Online sin haber completado este flujo
5. Una vez elegido, el municipio no se puede cambiar

## Decisiones

### 1. Backend — Schema `districts`

Agregar dos columnas `text` a la tabla `districts`:

```sql
ALTER TABLE districts ADD COLUMN terms_and_conditions text;
ALTER TABLE districts ADD COLUMN privacy_policy text;
```

Valores iniciales: solo Villa Dolores tendrá contenido; el resto puede quedar NULL
y esos municipios no se mostrarán en el selector hasta que tengan TyC.

**Solo se muestran municipios con `status = 'active'` Y `terms_and_conditions IS NOT NULL`.**

### 2. Backend — Relación driver-district

Agregar columna `district_id` en la tabla `drivers`:

```sql
ALTER TABLE drivers ADD COLUMN district_id uuid REFERENCES districts(id);
```

- FK a `districts.id`, nullable, sin constraint UNIQUE (cada district puede tener muchos drivers)
- Una vez seteado, el backend rechaza cualquier intento de cambiarlo
- El endpoint `GET /api/drivers/me/status` devuelve `has_district: boolean`

### 3. Backend — Nuevos endpoints

**`GET /api/districts/provinces`** — sin cambios en schema, agrupa por provincia
```json
{ "provinces": ["Córdoba"] }
```
Se deriva de `SELECT DISTINCT province FROM districts WHERE status = 'active' AND terms_and_conditions IS NOT NULL`.

**`GET /api/districts?province=Córdoba`** — extiende el endpoint existente con query param opcional
```json
{
  "districts": [
    { "id": "...", "name": "Villa Dolores", "province": "Córdoba" }
  ]
}
```
Si no se pasa `province`, devuelve todos (comportamiento actual). Si se pasa, filtra por provincia.

**`GET /api/districts/:id`** — detalle de un municipio con TyC
```json
{
  "id": "...",
  "name": "Villa Dolores",
  "province": "Córdoba",
  "terms_and_conditions": "...",
  "privacy_policy": "..."
}
```

**`PUT /api/drivers/me/district`** — asignar municipio al conductor
- Body: `{ district_id: string }`
- Valida que el district existe, está activo y tiene TyC
- Si el driver ya tiene `district_id`, devuelve 409 (no se puede cambiar)
- Si el driver no está aprobado (`status !== 'approved'`), devuelve 400
- Actualiza `drivers.district_id` y devuelve el district asignado

### 4. Backend — Modificar `GET /api/drivers/me/status`

Agregar al response:
```json
{
  "has_district": true,
  "district": { "id": "...", "name": "Villa Dolores", "province": "Córdoba" }
}
```
- `has_district: false` si `district_id` es NULL
- `district` solo se incluye si `has_district: true`

### 5. Mobile — Nuevo step en postAuthRouting

Nuevo step `district` en la ruta de onboarding:

```
profile → kyc → vehicle → documents → review → approved → district → online
```

Cuando el backend devuelve `step: 'approved'` y `has_district: false`, el móvil rutea a
`SelectProvince` en vez de `Online`.

`STEP_ROUTE` en `postAuthRouting.ts`:
```ts
approved: { screen: 'Online', storeStatus: 'approved' },
```
Se mantiene igual para conductores que YA tienen district (has_district: true).

En `routeForDriverStatus`, si el step es `approved` pero `has_district` es false, se rutea a
`SelectProvince`. Si `has_district` es true, se rutea a `Online` como antes.

### 6. Mobile — Pantallas nuevas

**SelectProvinceScreen** (`/select-province`)
- Título: "¿Dónde querés trabajar?"
- Subtítulo: "Seleccioná tu provincia"
- Lista de provincias obtenidas de `GET /api/districts/provinces`
- Al tocar una, navega a `SelectDistrict` pasando la provincia como param

**SelectDistrictScreen** (`/select-district`)
- Título: "Municipios en {provincia}"
- Lista de municipios de `GET /api/districts?province=X`
- Al tocar uno, navega a `DistrictTerms` pasando el `district_id` como param

**DistrictTermsScreen** (`/district-terms`)
- Recibe `district_id`, obtiene detalle de `GET /api/districts/:id`
- Muestra términos y condiciones + política de privacidad en secciones scrollables
- Botón "Aceptar y continuar" al fondo
- Al aceptar, llama a `PUT /api/drivers/me/district` con el `district_id`
- Si la API devuelve éxito, navega a `Online` con `replace` (no puede volver atrás)
- Si la API devuelve error (409: ya tiene district, 400: no aprobado), muestra mensaje

### 7. Mobile — Modificar OnlineScreen

`OnlineScreen` ya existe. Agregar un check al montar: si el driver no tiene `district_id`
(según `/drivers/me/status`), redirigir a `SelectProvince`. Esto cubre el caso de un
conductor aprobado antes de que exista esta feature.

### 8. Mobile — Navegación

Agregar a `SCREEN_TO_ROUTE` en `useAppNavigation.ts`:
```ts
SelectProvince: '/select-province',
SelectDistrict: '/select-district',
DistrictTerms: '/district-terms',
```

Crear archivos de ruta en `app/`:
- `app/select-province.tsx`
- `app/select-district.tsx`
- `app/district-terms.tsx`

Agregar a `BACK_FALLBACK`:
```ts
'select-district': 'SelectProvince',
'district-terms': 'SelectDistrict',
```

### 9. Mobile — Schema Zod

Agregar tipos nuevos en `api/types.ts`:
```ts
export const districtSchema = z.object({
  id: z.string(),
  name: z.string(),
  province: z.string(),
});

export const districtDetailSchema = districtSchema.extend({
  terms_and_conditions: z.string(),
  privacy_policy: z.string(),
});

export type District = z.infer<typeof districtSchema>;
export type DistrictDetail = z.infer<typeof districtDetailSchema>;
```

Modificar `driverStatusSchema` para incluir `has_district` y `district`:
```ts
export const driverStatusSchema = z.object({
  // ... campos existentes
  has_district: z.boolean().optional(),
  district: z.object({
    id: z.string(),
    name: z.string(),
    province: z.string(),
  }).optional(),
});
```

### 10. Seed data — Villa Dolores

Migración SQL para agregar TyC a Villa Dolores y actualizar la columna en el schema:

```sql
-- Agregar columnas
ALTER TABLE districts ADD COLUMN IF NOT EXISTS terms_and_conditions text;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS privacy_policy text;

-- Villa Dolores
UPDATE districts
SET terms_and_conditions = '<h2>Términos y Condiciones — Villa Dolores</h2><p>Al operar como conductor en Villa Dolores, aceptás cumplir con las normativas municipales de transporte, mantener tu vehículo en condiciones óptimas, y respetar las tarifas establecidas por la plataforma.</p>',
    privacy_policy = '<h2>Política de Privacidad — Villa Dolores</h2><p>Tus datos personales y ubicación serán tratados conforme a la Ley 25.326 de Protección de Datos Personales. La información de tus viajes se comparte solo con fines operativos y de facturación.</p>'
WHERE name = 'Villa Dolores';
```

## Plan de implementación (orden)

1. **Backend: migración DB** — agregar columnas a districts, FK en drivers, seed Villa Dolores
2. **Backend: schema Drizzle** — actualizar `districts.ts` y `drivers.ts`
3. **Backend: endpoints** — modificar districts (provinces, filter, detail), agregar driver district
4. **Backend: tests** — testear nuevos endpoints
5. **Mobile: tipos y API** — agregar tipos, modificar driverStatusSchema
6. **Mobile: pantallas** — SelectProvince, SelectDistrict, DistrictTerms
7. **Mobile: routing** — postAuthRouting, useAppNavigation, archivos de ruta
8. **Mobile: OnlineScreen** — check de district pendiente
9. **Verificación** — typecheck + tests en ambos proyectos
