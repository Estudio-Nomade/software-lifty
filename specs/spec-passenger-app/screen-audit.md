# Lifty Passenger App — Pantallas: Spec vs Diseño

> Auditoría generada sobre `App pasajeros.pen` después de la consolidación de tokens.

## Leyenda
- ✅ Coincide con el spec
- 🟡 Diferencia menor (más o menos scope del spec)
- ❌ Falta contra el spec
- ➕ Extra (no está en el spec, decisión de diseño)

## Pantallas del spec (18)

| # | Spec | Pantalla `.pen` | Status | Notas |
|---|---|---|---|---|
| 1 | Welcome | `splash-screen` + `auth-hub` | ✅ | Splash de carga + hub de entrada (más completo) |
| 2 | LoginPhone | `auth-login-phone` | ✅ | Conejo con prefijo +54 |
| 3 | LoginOTP | `auth-verify` | ✅ | 6 dígitos, code grande |
| 4 | RegisterName | `auth-register` | ✅ | **Simplificado**: solo nombre + apellido + T&C |
| 5 | Home | `home-main` | ✅ | Mapa + search + bottom dock + tabbar |
| 6 | SetPickup | `select-pickup` | ✅ | Recién creada. ¿Desde dónde salís? |
| 7 | SetDestination | `select-destination` | ✅ | ¿A dónde vas? |
| 8 | FareReview | `select-vehicle` | ✅ | nombre distinto, scope OK |
| 9 | SearchingDriver | `ride-searching`, `ride-connecting` | ✅ | 2 variantes (inicial + con retry) |
| 10 | DriverFound | `ride-driver-enroute` | ✅ | tarjeta + cancelar |
| 11 | VerificationCode | `ride-verification` | ✅ | 4 dígitos, code shareholder |
| 12 | DriverTracking | `ride-arrived` | ✅ | estado intermedio |
| 13 | InTrip | `ride-in-progress` | ✅ | Contraste de "Modificar destino" arreglado |
| 14 | SOS | `ride-sos` | ✅ | Recién creada. Selector 4 tipos + Enviar alerta + Llamar al 911 |
| 15 | TripSummary | `ride-completed` | ✅ | resumen + calificar |
| 16 | Rating | `ride-rate-driver` | ✅ | stars + tags + comment |
| 17 | TripHistoryList | `history-list` | ✅ | lista con cards |
| 18 | TripDetail | `trip-detail` | ✅ | Recién creada. Mapa + ruta + driver + tarifa + repetir/reportar |
| 19 | Profile | `profile-main`, `profile-edit` | ✅ | dos vistas |

## Pantallas extra (no en spec original)

| Pantalla | Razon |
|---|---|
| `auth-login` (email/password) | Login alternativo |
| `auth-forgot-password` | recovery |
| `auth-terms` | T&C como pantalla propia |
| `auth-location-permissions` | pedir GPS |
| `auth-complete-profile` | post-registro extendido |
| `auth-add-payment` | agregar medio de pago |
| `select-destination-empty` | empty state |
| `ride-share` | compartir viaje (safety) |
| `ride-change-destination` | cambiar destino en viaje |
| `ride-payment` | pantalla de pago con tip |
| `ride-payment-confirmed` | confirmacion |
| `ride-payment-error` | error de pago |
| `ride-receipt` | comprobante completo |
| `ride-confirm-pay` | confirmacion antes de pagar |
| `ride-objects-reminder` | check de objetos |
| `ride-objects-sent` | check enviado |
| `ride-cancel-modal` | modal de cancelacion |
| `ride-chat` | chat con conductor |

## Gaps prioritarios

1. **TripDetail** — spec lo lista, no existe. Necesario antes de dev.
2. **SOS ** — spec pide "selector de tipo de emergencia, confirmación". Hoy solo hay un boton Emergency. Falta el flujo.
3. **RegisterName over-spec** — `auth-register` pide email + phone + password + confirm. Spec original es solo nombre + T&C. Decidir si simplificar.
4. **Splash bug visual** — logo invisible (placeholder cuadriculado), tagline solapado.
5. **In-tTrip ** — "Modificar destino" sale con contraste pobre.

## Componentes reutilizables

- `Button/Primary`, `Button/Secondary`, `Button/Danger`, `Button/CTA`
- `Card`, `Input`, `OTPInput`, `OTPDigit`
- `Navbar`, `TabBar`, `TabBar/Main`, `TabBar` (sub)
- `Header/Back`, `Header/Close`, `Header/Root`
- `ChatBubble`, `ChatBubble/Driver`, `Toggle`, `ToggleThumb`
- `DriverCard/Full`, `DriverCard/Chip`
- `Spacer`, `Tag`, `TaglineRow`, `StatusBar`, `LogoMark`

> Estos componentes cubren todos los patrones de las pantallas. No falta ningún componente de base.
