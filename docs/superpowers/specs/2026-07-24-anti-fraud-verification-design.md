# Anti-fraud verification before starting trip

**Issue**: [#130](https://github.com/anomalyco/software-lifty/issues/130)
**Date**: 2026-07-24
**Status**: Approved

## Context

No existe paso de verificación de identidad entre la llegada al pickup y el inicio del viaje. Se necesita un código de verificación (estilo Uber/Didi) que el conductor debe confirmar antes de iniciar.

## Design decisions

| Decisión | Valor |
|----------|-------|
| Momento de generación | Al aceptar el viaje (`request_received → accepted`) |
| Formato del código | 4 dígitos numéricos (ej: `4821`) |
| Manejo de error | Reintentos ilimitados con mensaje "El código no coincide" |
| Entrega al pasajero | Push notification + pantalla mock en app del driver |
| Mock pasajero | Pantalla en la app del conductor accesible desde `WaitingPassengerScreen` |
| Enfoque | Validación completa en backend |

## Backend

### DB Migration

```sql
ALTER TABLE trips ADD COLUMN verification_code CHAR(4);
```

- Nulo por defecto. Solo se asigna cuando el driver acepta.

### Drizzle Schema (`trips.ts`)

Agregar:
```ts
verification_code: char('verification_code', { length: 4 }),
```

### Trip Service

#### `acceptTrip` — generación del código

Después de transicionar a `accepted`:
1. Generar: `Math.floor(1000 + Math.random() * 9000).toString()`
2. UPDATE en la misma transacción que la transición de estado
3. Enviar push al pasajero:
   ```ts
   sendPushToUser(passengerId, {
     title: 'Tu conductor llegó',
     body: `Código: ${verificationCode}`,
     data: { type: 'trip:verification', trip_id: tripId, code: verificationCode }
   })
   ```
4. Incluir `verification_code` en la respuesta del trip

#### `startTrip` — validación del código

- Body schema: `{ verification_code: t.String({ minLength: 4, maxLength: 4 }) }`
- Antes de `transitionTrip`, comparar `verification_code` enviado con el almacenado en DB
- Si no coincide → `BadRequestError('El código de verificación no coincide')`
- Si coincide → transicionar a `in_trip`

### Trip Routes

```ts
.post(
  '/:id/start',
  ({ user, params, body, set }) => safeCall(() => tripService.startTrip(user, params.id, body.verification_code), set),
  { params: tripIdParams, body: t.Object({ verification_code: t.String() }), requireAuth: true, rateLimit: { max: 10, windowMs: 60000 } },
)
```

### Push notification

Usar `sendPushToUser()` existente (`src/shared/lib/push.ts`). El pasajero recibe una push con el código cuando el driver acepta. No hay app de pasajero en el monorepo, pero la notificación se envía para cuando exista.

## Mobile

### Tipo Trip (`types.ts`)

Agregar al schema:
```ts
verification_code: z.string().length(4).nullable(),
```

### Modal de verificación (`WaitingPassengerScreen.tsx`)

Flujo modificado:
```
[Botón "INICIAR VIAJE"] → [Modal verificación] → [POST /trips/:id/start con código]
                                                        ↓
                                            ✓ éxito → TripInProgress
                                            ✗ error → mostrar "no coincide"
```

El modal usa el mismo patrón inline que el modal de cancelar ya existente:
- Overlay con fondo semi-transparente
- Card con título "Código de verificación"
- Subtítulo: "Pedile al pasajero el código de 4 dígitos"
- `OTPInput` con `length={4}` (componente ya existente)
- Botón "CONFIRMAR" (deshabilitado hasta completar 4 dígitos, loading durante request)
- Botón "CANCELAR" secundario (cierra el modal)
- Mensaje de error debajo del OTPInput si el código no coincide

### Pantalla mock del pasajero (`PassengerCodeScreen.tsx`)

- Ruta: `/passenger-code`
- Muestra `verification_code` del viaje activo en grande
- Acceso: botón flotante en `WaitingPassengerScreen`, solo visible en `__DEV__`
- Agregar a `useAppNavigation.ts`: `'PassengerCode': '/passenger-code'`
- Archivo: `apps/mobile/src/screens/PassengerCodeScreen.tsx` + `apps/mobile/app/passenger-code.tsx`

## Edge cases

| Caso | Comportamiento |
|------|---------------|
| Código vacío/incompleto | Botón CONFIRMAR deshabilitado hasta 4 dígitos |
| Viaje sin código (legacy) | Backend 400. Mobile muestra error genérico |
| Modal abierto/cerrado | OTPInput se reinicia al reabrir |
| Doble tap en CONFIRMAR | Botón con loading state durante request |
| Viaje cancelado con modal abierto | Realtime channel notifica → redirigir a Online |
| Pasajero sin push token | `sendPushToUser` maneja graceful (no tokens = no push) |

## Testing

### Backend (`trips.test.ts`)

- `POST /trips/:id/start` con código correcto → 200, status `in_trip`
- `POST /trips/:id/start` con código incorrecto → 400, "no coincide"
- `POST /trips/:id/start` sin código → 400 (Elysia validation errors remapped by global onError)
- `acceptTrip` genera y guarda `verification_code` de 4 dígitos
- `acceptTrip` envía push al pasajero con el código

### Mobile

- Verificar que `tripSchema` parsea el nuevo campo `verification_code`

## Files to modify

| Archivo | Cambio |
|---------|--------|
| `apps/backend/src/shared/db/schema/trips.ts` | Agregar `verification_code` |
| `apps/backend/src/features/trips/service.ts` | Generar código en `acceptTrip`, validar en `startTrip` |
| `apps/backend/src/features/trips/routes.ts` | Body schema + rate limit en `start` |
| `apps/backend/src/features/trips/schema.ts` | Agregar `verification_code` a respuestas |
| `apps/backend/src/features/trips/trips.test.ts` | Tests de verificación |
| Migración SQL | Nueva columna `verification_code` |
| `apps/mobile/src/api/types.ts` | Agregar `verification_code` al `tripSchema` |
| `apps/mobile/src/screens/WaitingPassengerScreen.tsx` | Modal de verificación |
| `apps/mobile/src/screens/PassengerCodeScreen.tsx` | Nueva pantalla mock |
| `apps/mobile/app/passenger-code.tsx` | Nueva ruta |
| `apps/mobile/src/hooks/useAppNavigation.ts` | Nueva entrada PassengerCode |
