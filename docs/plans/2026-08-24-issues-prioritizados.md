# Plan — Issues priorizados (pasajero + conductor)

Fecha: 2026-08-24
Autor: agente delegado (senior React Native + Elysia)

## Orden de trabajo (estricto)

| # | App | Issue | Estado |
|---|-----|-------|--------|
| 1 | Pasajero | Push notification cuando el conductor manda mensaje en el chat del viaje | ✅ hecho |
| 2 | Pasajero | Pantalla de pago (efectivo / transferencia) | ✅ hecho |
| 3 | Pasajero | Envío de calificación de estrellas al conductor | ✅ hecho |
| 4 | Pasajero | Supabase Realtime completo en el chat (ambos lados) | ✅ hecho |
| 5 | Conductor | Arreglar UI dropdown de viaje ("RUMBO AL PASAJERO") | ⏳ pendiente |
| 6 | Conductor | Push notification cuando el pasajero manda mensaje | ⏳ pendiente |
| 7 | Conductor | "Viaje completado": error "Rating already exists" | ⏳ pendiente |
| 8 | Conductor | Push notification cuando el pasajero califica | ✅ hecho (con Issue 3) |

---

## Issue 1 — Pasajero: push en chat (conductor → pasajero)

**User story:** Como pasajero, cuando el conductor me escribe en el chat del viaje y yo no
tengo la app en primer plano, quiero recibir una notificación push para no perder el mensaje.

**Hallazgos técnicos:**
- Backend ya tiene infraestructura de push completa: `apps/backend/src/shared/lib/push.ts`
  (`sendPushToUser`, FCM + Expo), tabla `push_tokens`, endpoint `POST /notifications/token`.
- El endpoint `sendMessage` (`apps/backend/src/features/trips/service.ts:971`) **solo**
  hace `broadcastTripMessage(tripId, row)` (Supabase Realtime). **No** envía push al otro
  participante.
- El conductor ya registra su push token (`apps/mobile/src/components/AppInitializer.tsx` →
  `NotificationSetup` + `src/lib/notifications.ts`).
- El pasajero **NO** registra push: no existe `apps/mobile-passengers/src/lib/notifications.ts`
  y su `AppInitializer.tsx` no tiene `NotificationSetup`.

**Tareas técnicas:**
1. Backend `sendMessage`: tras persistir + broadcast, resolver el usuario destinatario
   (si `role === 'driver'` → `trip.passenger_id`; si `role === 'passenger'` → `drivers.user_id`
   de `trip.driver_id`) y llamar `sendPushToUser(destinatario, { title, body, data })`.
2. Pasajero: crear `src/lib/notifications.ts` adaptando el del driver
   (`setupNotificationHandler`, `registerForPush`, `handleNotificationResponse`).
3. Pasajero: agregar `NotificationSetup` en `AppInitializer.tsx` (registrar token al
   `POST /notifications/token` + listener de respuesta → navegar al chat).

**Commit:** `feat(passenger): send/receive push on trip chat message` (+ backend).

---

## Issue 6 — Conductor: push en chat (pasajero → conductor)

**User story:** Como conductor, cuando el pasajero me escribe en el chat, quiero recibir push.

**Hallazgo:** Es el mismo cambio de backend que el Issue 1 (la rama destinataria opuesta).
El conductor ya registra push, así que no requiere cambios en `apps/mobile` salvo el manejo
de respuesta (navegar al chat).

**Tareas técnicas:**
1. (Compartida con Issue 1) Backend `sendMessage` envía push al destinatario.
2. Conductor: extender `handleNotificationResponse` para el caso `trip:message` → navegar al chat.

**Commit:** `feat(driver): push notification on trip chat message` (backend si no se incluyó
en el Issue 1; si ya quedó cubierto, solo la navegación del driver).

---

## Issue 4 — Supabase Realtime completo en chat (ambos lados)

**User story:** Como pasajero/conductor, quiero que los mensajes del chat lleguen en tiempo
real por Supabase Realtime (no solo al refrescar).

**Hallazgos técnicos:**
- Ambos lados ya tienen `subscribeToTripChannel` en `src/lib/realtime.ts` escuchando el evento
  `message:sent` en el topic `trip:{tripId}`. El backend ya hace `broadcastTripMessage`.
- Hay un commit previo `refactor(chat): unify Supabase Realtime chat in both apps (#282)`.

**Tareas técnicas (a confirmar durante la implementación):**
1. Verificar que la pantalla de chat del pasajero (`ChatScreen.tsx`) suscribe y mergea
   mensajes en tiempo real con `mergeMessages`/`mergeHistory` (paridad con el driver).
2. Cerrar cualquier gap de suscripción/cleanup y de envío (optimistic update + confirmación).

**Commit:** `fix(passenger): full Supabase Realtime in trip chat`.

---

## Issue 3 — Pasajero: calificación de estrellas al conductor

**User story:** Como pasajero, quiero calificar al conductor con estrellas al terminar el viaje.

**Hallazgos técnicos:**
- La UI ya existe (`apps/mobile-passengers/src/screens/TripCompleteScreen.tsx` llama
  `rateRide()` → `POST /passenger/trips/:id/rate`).
- El backend ya implementa `passenger-trips/service.ts:358 rateTrip` (rater = pasajero,
  ratee = `driver.user_id`, actualiza `drivers.rating_avg`).
- Posible problema: si el conductor califica primero (`/ratings/trips/:id` pasa el trip a
  `rated`), el pasajero recibe `Trip is not in completed status`. También puede haber un
  desfase de estado. A investigar durante la implementación.

**Tareas técnicas:**
1. Verificar el flujo real del pasajero (qué status tiene el viaje al calificar).
2. Asegurar manejo graceful de errores (rating ya existente, trip no completed) en UI.
3. Si corresponde, permitir calificar aun si el viaje ya pasó a `rated` (rating bidireccional).

**Commit:** `fix(passenger): passenger-to-driver star rating`.

---

## Issue 8 — Conductor: push al ser calificado por el pasajero

**User story:** Como conductor, quiero recibir push cuando el pasajero me califica.

**Hallazgo:** `passenger-trips/service.ts rateTrip` inserta el rating y actualiza
`drivers.rating_avg` pero **no** envía `sendPushToUser(driver.user_id, ...)`.

**Tareas técnicas:**
1. En `passengerTripService.rateTrip`, tras commit, `sendPushToUser(driver.user_id,
   { title: 'Nueva calificación', body: 'Recibiste X estrellas', data: { type: 'trip:rated' } })`.
2. Conductor: manejar `trip:rated` en `handleNotificationResponse` si se quiere navegar.

**Commit:** `feat(driver): push when passenger rates the trip`.

---

## Issue 7 — Conductor: "Viaje completado" error "Rating already exists"

**User story:** Como conductor, al terminar un viaje y enviar mi calificación, no quiero ver
un error feo ni poder enviarla dos veces.

**Hallazgos técnicos:**
- `apps/mobile/src/screens/TripCompleteScreen.tsx` `handleSubmitRating` hace
  `POST /ratings/trips/:id`. El backend `ratings/service.ts` lanza
  `ConflictError('Rating already exists for this trip')` si ya hay rating de ese rater.
- Causa probable: doble submit (botón no deshabilitado / re-render) o re-ingreso a la pantalla
  tras un primer envío; el error se muestra como `Alert.alert` con texto crudo.

**Tareas técnicas:**
1. Backend: revisar la constraint de unicidad `(trip_id, rater_id)` y hacer idempotente el
   endpoint (devolver el rating existente en vez de 409) o mantener 409 pero con código claro.
2. UI: deshabilitar botón durante el envío (ya hay `submitting`, verificar), marcar estado
   `rated` localmente, y manejar `ConflictError` como "ya calificaste" sin crashear.

**Commit:** `fix(driver): handle duplicate rating gracefully`.

---

## Issue 2 — Pasajero: pantalla de pago (efectivo / transferencia)

**User story:** Como pasajero, quiero elegir cómo pagar mi viaje (efectivo o transferencia,
solo esos dos el primer mes) en una pantalla simple.

**Hallazgos técnicos:**
- Ya existe `apps/mobile-passengers/src/screens/PaymentMethodScreen.tsx` (a revisar su estado).
- El conductor cobra vía `PUT /trips/:id/collect` con `payment_method` (cash/transfer).
- No hay (que se sepa) endpoint de pago del pasajero para "cómo voy a pagar".

**Tareas técnicas:**
1. Definir UI simple: selector efectivo/transferencia en la pantalla de pago (o en el flujo de
   solicitud). Reusar `theme` y componentes existentes.
2. Endpoint (si es necesario): persistir el método de pago elegido por el pasajero
   (campo `payment_method` del trip ya existe).
3. Mantenerlo mínimo (solo dos métodos).

**Commit:** `feat(passenger): payment method screen (cash/transfer)`.

---

## Issue 5 — Conductor: arreglar UI del dropdown de viaje

**User story:** Como conductor, al estar en ruta quiero ver bien la tarjeta inferior
("RUMBO AL PASAJERO") con su contenido arriba, padding correcto, botón "LLEGUE" visible y
scroll funcional.

**Hallazgos técnicos:**
- `apps/mobile/src/screens/NavigationScreen.tsx`: `bottomCard` con
  `maxHeight: SCREEN_HEIGHT * 0.48`; `bottomCardContent` (ScrollView) con `flexGrow: 0`;
  `bottomCardInner` con `paddingBottom` grande. El label "Rumbo al pasajero" (`styles.label`)
  y el botón "LLEGUE" (`arrivedButton`) quedan desplazados / fuera de pantalla.

**Tareas técnicas:**
1. Revisar el layout de `bottomCard`/`bottomCardContent`/`bottomCardInner` para que el contenido
   empiece arriba (quitar padding vertical excesivo), el `paddingBottom` respete safe area sin
   empujar el botón fuera, y el ScrollView scrollee correctamente (ajustar `maxHeight`/`flexGrow`).

**Commit:** `fix(driver): trip dropdown card layout & scrolling`.

---

## Definición de hecho (per issue)

- Código implementado siguiendo convenciones del proyecto (theme, safeCall, realtime pattern,
  Ley 2 de reuso).
- `bun run typecheck` y `bun run lint` pasan (o al menos sin nuevos errores).
- Tests existentes no rotos; si agrego lógica nueva relevante, agrego test.
- Commit con conventional commit + push de branch + aviso al usuario.
