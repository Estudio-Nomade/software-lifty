# Lifty Passenger App — Design Handoff

> Estado al cierre de la sesión de diseño. Source-of-truth: `apps/mobile-passengers/design/App-pasajeros.pen`.

## Archivos generados

| Archivo | Propósito |
|---|---|
| `design-tokens.md` | Tabla de tokens final (color, spacing, radius, typography) |
| `tokens.json` | Tokens en JSON listo para importar al theme TS |
| `screen-audit.md` | Mapeo de las 36+ pantallas del `.pen` vs las 18 del spec |

## Pantallas del spec — cobertura

| # | Pantalla | `.pen` | Estado |
|---|---|---|---|
| 1 | Welcome | `splash-screen` + `auth-hub` | ✅ |
| 2 | LoginPhone | `auth-login-phone` | ✅ |
| 3 | LoginOTP | `auth-verify` | ✅ |
| 4 | RegisterName | `auth-register` | ✅ (over-spec: pide email/phone/pass) |
| 5 | Home | `home-main` | ✅ |
| 6 | SetDestination | `select-destination` | ✅ |
| 7 | FareReview | `select-vehicle` | ✅ |
| 8 | SearchingDriver | `ride-searching` + `ride-connecting` | ✅ |
| 9 | DriverFound | `ride-driver-enroute` | ✅ |
| 10 | VerificationCode | `ride-verification` | ✅ |
| 11 | DriverTracking | `ride-arrived` | ✅ |
| 12 | InTrip | `ride-in-progress` | ✅ (contraste arreglado) |
| 13 | SOS | `ride-in-progress` (botón EMERGENCIA) | ⚠️ sin pantalla dedicada |
| 14 | TripSummary | `ride-completed` | ✅ |
| 15 | Rating | `ride-rate-driver` | ✅ |
| 16 | TripHistoryList | `history-list` | ✅ |
| 17 | TripDetail | `trip-detail` | ✅ (recién creada) |
| 18 | Profile | `profile-main` + `profile-edit` | ✅ |

## Cambios hechos en esta sesión

1. **Consolidación de tokens**: 70+ vars → 28 (sin shadcn-style, sin duplicados)
2. **Splash**: logo invisible + tagline solapado → ahora usa un "L" mark + texto centrado
3. **In-trip**: "Modificar destino" subió de 14/normal a 16/bold, mejor contraste
4. **TripDetail**: nueva pantalla con mapa + ruta + driver + tarifa + acciones
5. **SOS**: nueva pantalla con selector de tipo de emergencia + Enviar alerta + Llamar al 911
6. **auth-register**: simplificado a spec (solo nombre + apellido + T&C)
7. **select-pickup**: nueva pantalla separada de select-destination (spec dice que son 2)

## Tokens canónicos (resumen)

```ts
colors: {
  primary:    '#00C2B3',  // teal — botones primarios, marca
  deepBlue:   '#0D2B45',  // navy — navbar, texto principal
  lightGray:  '#F1F4F6',  // bg secundario
  mediumGray: '#A8B1BA',  // texto muted
  white:      '#FFFFFF',  // card surface
  dangerRed:  '#E53935',  // errores, SOS
  amber:      '#FFB020',  // promo, warning
}

spacing: { xs:4, sm:8, md:16, lg:24, xl:32, '2xl':48 }
radius:  { sm:10, md:12, lg:16, full:999 }
font:    { family: 'Inter', size: { xs:12 .. 5xl:48 } }
```

## Pendientes para próxima sesión

1. **Alinear theme del código** (`apps/mobile/src/theme/index.ts`) con los tokens del `.pen`:
   - `turquoise` → `primary` (#1BBFAE → #00C2B3)
   - `deepBlue` (#0F2A44 → #0D2B45)
   - `lightGray` (#EDF1F5 → #F1F4F6)
   - `mediumGray` (#8A93A0 → #A8B1BA)
   - `dangerRed` (#FF6B6B → #E53935)
   - `Nunito` → `Inter`
2. **Decidir si las 17 referencias a `$3.500`, `$1.500` etc.** quedan como están (rendering literal) o se arreglan formalmente

## Notas técnicas

- `.pen` usa variables tipo `$primary`. Cada token mapea 1:1 a un nombre de variable.
- Las pantallas están en 390x844 (iPhone 14 Pro). Para Android, escalable.
- Componentes reutilizables: `Button/(Primary|Secondary|Danger|CTA)`, `Card`, `Input`, `OTPInput`, `Navbar`, `TabBar`, `Header/(Back|Close|Root)`, `DriverCard/(Full|Chip)`, `ChatBubble`, `Toggle`.
- Hay 2 temas definidos (`Light`, `Dark`) pero solo `Light` se renderiza en las pantallas. Implementar dark mode cubriendo solo colores (no typography/spacing).
