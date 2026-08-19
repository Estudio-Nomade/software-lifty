# AGENTS.md - Lifty Passenger App

## Leyes del Pasajero (no negociables)

> Estas dos leyes rigen TODO el trabajo de la app pasajero. Cumplirlas es requisito; cuestionarlas es escalar.

### Ley 1 — Skills BMAD obligatorias

> Cualquier trabajo de diseño, planeación, documentación o cambios arquitecturales en esta app **debe** usar las skills BMAD instaladas.

**Cuándo invocar BMAD (no opcional):**

- Documentar product requirements → `bmad-prd` o `bmad-product-brief`
- Crear o actualizar architecture → `bmad-architecture`
- Documentar codebase o knowledge → `bmad-document-project` / `bmad-generate-project-context`
- Generar o revisar epics + stories → `bmad-create-epics-and-stories`
- Planificar sprints → `bmad-sprint-planning`
- Estado del sprint → `bmad-sprint-status`
- Crear/validar story individual → `bmad-create-story`
- Spec técnica → `bmad-spec`
- Decisiones de UI/UX → `bmad-ux`
- Reviews de código → `bmad-code-review`
- Retrospectivas → `bmad-retrospective`

**Cómo invocar:** usar el tool `skill` con el nombre correspondiente. Para routing, `bmad-help` lista todas las disponibles.

**Excepción:** cambios puramente mecánicos (typo fix, formateo, dependency bump menor) no requieren BMAD pero sí commit con conventional commit.

### Ley 2 — Reuso máximo de `apps/mobile` y `apps/backend`

> Antes de escribir código nuevo, **revisar si ya existe** en `apps/mobile` (driver) o `apps/backend`. Si existe, adaptarlo — no duplicarlo.

**Prohibido:**

- ❌ Crear un componente que ya existe en `apps/mobile/src/components/` (Button, Input, OTPInput, Card, Navbar, TabBar, Header, ChatBubble, DriverCard, Toggle).
- ❌ Definir un endpoint que ya existe en `apps/backend/src/features/<X>/routes.ts`.
- ❌ Inventar un error format distinto al que produce `apps/backend/src/shared/lib/route-utils.ts` (`safeCall`).
- ❌ Reimplementar realtime/websocket — usar el canal de Supabase Realtime que ya está en uso en `apps/mobile/src/lib/realtime.ts`.
- ❌ Crear un theme nuevo o duplicar tokens — usar `src/theme/index.ts` (28 tokens canónicos del `.pen`).

**Permitido sólo con justificación documentada:**

- Reutilizar con adaptación: si el código del driver usa `turquoise`/`Nunito` y el passenger usa `primary`/`Inter`, la adaptación es un find-replace consciente de tokens, no una reescritura.
- Reescritura: si la API del componente no encaja y la adaptación es > 50% del código, se documenta en el commit por qué se reescribió en vez de adaptar.

**Inventario de reuso (referencia rápida):**

| Origen | Elemento | Ubicación en passenger | Cómo se adaptó |
|---|---|---|---|
| `apps/mobile/src/components/Button.tsx` | 5 variants (`primary`/`secondary`/`danger`/`cta`/`outline`) | `src/components/Button.tsx` | Adaptar `theme.colors.turquoise` → `primary`, agregar `outline` variant |
| `apps/mobile/src/components/Input.tsx` | label + error + leftElement/rightElement | `src/components/Input.tsx` | Adaptar theme, agregar `icon` prop |
| `apps/mobile/src/lib/realtime.ts` | `subscribeToTripChannel` | `src/lib/realtime.ts` (a crear) | Copiar tal cual — eventos coinciden |
| `apps/backend/src/shared/lib/route-utils.ts` | `safeCall` error shape | `src/api/client.ts` interceptor | Matchear `{ error: { code, message, status }, meta: { timestamp } }` |
| `apps/backend/src/features/trips/routes.ts` | 14 endpoints | `src/api/passenger.ts` (a crear) | Consumir via `api.get/post/put` |
| `apps/backend/src/features/sos/routes.ts` | POST /sos | `src/api/passenger.ts` | Consumir |
| `apps/backend/src/features/ratings/routes.ts` | POST /ratings/trips/:id | `src/api/passenger.ts` | Consumir |
| `apps/backend/src/features/maps/` | autocomplete, geocode, directions | `src/api/passenger.ts` | Consumir |
| `apps/backend/src/features/location/` | WS /ws/location | `src/lib/websocket.ts` (a crear) | Consumir para tracking |
| `apps/backend/src/shared/lib/push.ts` | FCM send | futuro | Cuando hagamos push notifications |

**Theme no se unifica:** `apps/mobile` usa `turquoise #1BBFAE` + Nunito (identidad del driver). El passenger usa `primary #00C2B3` + Inter (identidad del pasajero). **No mergear.** Documentar la diferencia.

**Shared package futuro:** cuando tengamos 3+ componentes reusables en ambos apps, considerar `packages/lifty-ui` con extract. No antes.

## Vision General

Este documento sirve como guia principal para el desarrollo de la aplicacion de pasajeros de Lifty. Define la arquitectura, estandares, flujos de trabajo y expectativas para todos los agentes de IA y desarrolladores que trabajen en este proyecto.

## Indice

- Contexto del Proyecto
- Stack Tecnologico
- Estructura del Monorepo
- Arquitectura Backend
- Arquitectura Frontend
- Base de Datos
- Flujos de Usuario
- Estandares de Codigo
- Sistema de Diseno
- Integraciones Externas
- Ramas y Convenciones
- Comandos Utiles
- Checklist de Desarrollo

## Contexto del Proyecto

### Objetivo

Desarrollar la aplicacion de pasajeros para Lifty, un servicio de ride-hailing que conecta pasajeros con conductores verificados. La app debe proporcionar una experiencia fluida y segura para solicitar viajes, con tracking en tiempo real y multiples opciones de pago.

### Estado Actual

- App de conductor completamente funcional (`apps/mobile`)
- Backend con 49 endpoints operativos (`apps/backend`)
- Base de datos con 14 tablas
- App de pasajero en fase de diseno/desarrollo

### Publico Objetivo

- Usuarios que necesitan transporte urbano
- Edad: 18-65 anos
- Familiaridad con apps de ride-hailing (Uber, Didi)

## Stack Tecnologico

### Monorepo

| Herramienta | Version | Proposito |
|---|---|---|
| Bun | Latest | Runtime y package manager |
| Turborepo | Latest | Orchestration de builds |
| Workspaces | - | Gestion de paquetes internos |

### Backend

| Herramienta | Version | Proposito |
|---|---|---|
| Elysia | Latest | Framework API |
| Drizzle ORM | Latest | ORM para PostgreSQL |
| PostgreSQL | 16 | Base de datos principal |
| Redis | 7 | Cache y rate limiting |
| Supabase | Latest | Auth + Storage + Realtime |

### Frontend (Pasajero)

| Herramienta | Version | Proposito |
|---|---|---|
| Expo | SDK 54 | Framework React Native |
| React | 19.1 | UI Library |
| React Native | 0.81 | Mobile framework |
| expo-router | ~6.0.24 | File-based routing |
| React Query | 5 | Server state management |
| Zustand | 5 | Client state management |
| Axios | 1 | HTTP client |
| Zod | 4 | Schema validation |

### Servicios Externos

| Servicio | Proposito |
|---|---|
| Supabase | Auth + PostgreSQL + Storage |
| Redis | Rate limiting + cache |
| Resend | Emails transaccionales |
| Mercado Pago | Pagos y retiros |
| DIDIT | KYC (solo conductores) |
| Google Maps | Geocoding, direcciones |
| FCM | Push notifications |

## Estructura del Monorepo

```
software-lifty/
├── apps/
│   ├── backend/                     # @lifty/backend (EXISTENTE)
│   │   ├── src/
│   │   │   ├── features/           # 14 modulos feature-based
│   │   │   ├── shared/             # DB, libs, middleware
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mobile/                      # @lifty/mobile (EXISTENTE - Conductor)
│   │   ├── app/                    # expo-router routes
│   │   ├── src/
│   │   │   ├── api/               # Axios client
│   │   │   ├── components/        # UI components
│   │   │   ├── context/           # Auth context
│   │   │   ├── hooks/             # Custom hooks
│   │   │   ├── lib/               # Supabase, notifications
│   │   │   ├── screens/           # 34 screens
│   │   │   ├── store/             # Zustand stores
│   │   │   ├── theme/             # Design tokens
│   │   │   └── utils/             # Helpers
│   │   └── package.json
│   │
│   └── mobile-passengers/           # @lifty/mobile-passengers (NUEVA)
│       ├── app/                    # expo-router routes
│       │   ├── _layout.tsx
│       │   ├── index.tsx          # Welcome
│       │   ├── auth.tsx           # Auth screen
│       │   ├── login-phone.tsx    # Login con celular
│       │   ├── login-otp.tsx      # Verificacion OTP
│       │   ├── login-credentials.tsx # Login con email/contrasena
│       │   ├── forgot-password.tsx
│       │   ├── register.tsx       # Registro de pasajero
│       │   ├── terms.tsx          # Terminos y condiciones
│       │   ├── home.tsx           # Home (mapa + busqueda)
│       │   ├── trip-request.tsx   # Solicitud de viaje (pickup/destino/tarifa)
│       │   ├── trip-in-progress.tsx # Tracking del viaje
│       │   ├── trip-complete.tsx  # Viaje completado (calificar/pago)
│       │   ├── trip-history.tsx   # Historial de viajes
│       │   ├── profile.tsx        # Perfil del pasajero
│       │   ├── payment-method.tsx # Metodo de pago
│       │   └── chat.tsx           # Chat con el conductor
│       ├── src/
│       │   ├── api/
│       │   │   ├── client.ts      # Axios client config
│       │   │   ├── passenger.ts   # Passenger API calls
│       │   │   └── types.ts       # API response types
│       │   ├── components/
│       │   │   ├── Ride/
│       │   │   │   ├── VehicleSelector.tsx
│       │   │   │   ├── PriceEstimate.tsx
│       │   │   │   ├── DriverInfo.tsx
│       │   │   │   ├── RideStatus.tsx
│       │   │   │   └── RatingStars.tsx
│       │   │   ├── Map/
│       │   │   │   ├── PassengerMap.tsx
│       │   │   │   ├── RouteDisplay.tsx
│       │   │   │   └── DriverMarker.tsx
│       │   │   ├── BottomSheets/
│       │   │   │   ├── DestinationSheet.tsx
│       │   │   │   ├── VehicleSheet.tsx
│       │   │   │   └── RideStatusSheet.tsx
│       │   │   └── Shared/
│       │   │       ├── SearchBar.tsx
│       │   │       ├── AddressAutocomplete.tsx
│       │   │       └── PhoneInput.tsx
│       │   ├── context/
│       │   │   └── AuthContext.tsx
│       │   ├── hooks/
│       │   │   ├── usePassengerAuth.ts
│       │   │   ├── useRideRequest.ts
│       │   │   ├── useRideTracking.ts
│       │   │   ├── useChat.ts
│       │   │   └── useLocation.ts
│       │   ├── lib/
│       │   │   ├── supabase.ts
│       │   │   ├── queryClient.ts
│       │   │   ├── websocket.ts
│       │   │   └── notifications.ts
│       │   ├── store/
│       │   │   ├── authStore.ts
│       │   │   ├── rideStore.ts
│       │   │   ├── locationStore.ts
│       │   │   └── paymentStore.ts
│       │   ├── theme/
│       │   │   └── index.ts       # Single theme object
│       │   └── utils/
│       │       ├── validators.ts
│       │       ├── formatters.ts
│       │       └── geo.ts
│       ├── AGENTS.md
│       ├── package.json
│       ├── app.json
│       └── tsconfig.json
│
├── specs/
│   └── passenger/
│       ├── onboarding.md
│       ├── ride-flow.md
│       ├── payments.md
│       └── features.md
│
├── turbo.json                       # Pipeline config
├── biome.json                       # Linter + formatter
├── lefthook.yml                     # Pre-commit hooks
├── commitlint.config.js
└── package.json                     # Root workspace
```

## Arquitectura Backend

### Nuevos Modulos para Pasajero

```
apps/backend/src/features/

├── passengers/                     # Gestion de pasajeros
│   ├── passenger.service.ts
│   ├── passenger.controller.ts
│   ├── passenger.routes.ts
│   └── passenger.types.ts
│
├── ride-requests/                  # Solicitud de viajes
│   ├── request.service.ts
│   ├── request.controller.ts
│   ├── request.routes.ts
│   ├── matching.service.ts        # Algoritmo de matching
│   └── request.types.ts
│
├── favorites/                      # Direcciones favoritas
│   ├── favorites.service.ts
│   ├── favorites.controller.ts
│   └── favorites.routes.ts
│
├── search-history/                 # Historial de busquedas
│   ├── search.service.ts
│   ├── search.controller.ts
│   └── search.routes.ts
│
├── promotions/                     # Cupones y descuentos
│   ├── promotions.service.ts
│   ├── promotions.controller.ts
│   └── promotions.routes.ts
│
├── passenger-payments/             # Pagos de pasajeros
│   ├── payment.service.ts
│   ├── payment.controller.ts
│   └── payment.routes.ts
│
├── passenger-trips/                # Viajes de pasajeros
│   ├── trip.service.ts
│   ├── trip.controller.ts
│   └── trip.routes.ts
│
└── passenger-chat/                 # Chat con conductores
    ├── chat.service.ts
    ├── chat.controller.ts
    ├── chat.routes.ts
    └── chat.gateway.ts            # WebSocket
```

### API Endpoints - Pasajero

```
// Auth & Perfil
POST   /api/passenger/register
POST   /api/passenger/verify-email
POST   /api/passenger/verify-phone
POST   /api/passenger/resend-otp
GET    /api/passenger/profile
PUT    /api/passenger/profile
PUT    /api/passenger/default-address

// Direcciones Favoritas
GET    /api/passenger/favorites
POST   /api/passenger/favorites
PUT    /api/passenger/favorites/:id
DELETE /api/passenger/favorites/:id

// Historial de Busquedas
GET    /api/passenger/search/history
POST   /api/passenger/search/history
DELETE /api/passenger/search/history

// Solicitud de Viaje
POST   /api/passenger/rides/estimate
POST   /api/passenger/rides/request
GET    /api/passenger/rides/:id/status
POST   /api/passenger/rides/:id/cancel
PUT    /api/passenger/rides/:id/destination
GET    /api/passenger/rides/active
GET    /api/passenger/rides/history
GET    /api/passenger/rides/:id/details
POST   /api/passenger/rides/:id/rate

// Metodos de Pago
GET    /api/passenger/payments/methods
POST   /api/passenger/payments/methods
PUT    /api/passenger/payments/methods/:id/default
DELETE /api/passenger/payments/methods/:id
POST   /api/passenger/payments/:tripId/process

// Promociones
GET    /api/passenger/promotions/available
POST   /api/passenger/promotions/validate
GET    /api/passenger/promotions/history

// Chat (compartido con el conductor)
GET    /api/passenger/trips/:id/messages
POST   /api/passenger/trips/:id/messages
// Realtime: Supabase Broadcast topic `trip:{tripId}` event `message:sent`
```

## Base de Datos

### Nuevas Tablas para Pasajero

```sql
-- Perfil del pasajero (extiende users)
CREATE TABLE passenger_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  phone_verified BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  default_address TEXT,
  default_latitude DECIMAL(10,8),
  default_longitude DECIMAL(11,8),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Direcciones favoritas
CREATE TABLE favorite_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passenger_profiles(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL, -- 'Casa', 'Trabajo', 'Gimnasio'
  address TEXT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Historial de busquedas
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passenger_profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  address TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  searched_at TIMESTAMP DEFAULT NOW()
);

-- Metodos de pago del pasajero
CREATE TABLE passenger_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passenger_profiles(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- 'card', 'transfer', 'cash'
  provider VARCHAR(50), -- 'mercadopago', 'stripe'
  provider_payment_id VARCHAR(255),
  last_four VARCHAR(4),
  brand VARCHAR(50), -- 'visa', 'mastercard', 'amex'
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Modificaciones a trips
ALTER TABLE trips ADD COLUMN passenger_id UUID REFERENCES passenger_profiles(id);
ALTER TABLE trips ADD COLUMN passenger_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE trips ADD COLUMN cancellation_reason TEXT;
ALTER TABLE trips ADD COLUMN cancellation_fee DECIMAL(10,2) DEFAULT 0;
ALTER TABLE trips ADD COLUMN original_estimated_price DECIMAL(10,2);
ALTER TABLE trips ADD COLUMN final_price DECIMAL(10,2);
ALTER TABLE trips ADD COLUMN payment_method_id UUID REFERENCES passenger_payment_methods(id);
ALTER TABLE trips ADD COLUMN paid_at TIMESTAMP;

-- Promociones/Cupones
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL, -- 'percentage', 'fixed'
  value DECIMAL(10,2) NOT NULL,
  max_discount DECIMAL(10,2),
  min_trip_amount DECIMAL(10,2),
  valid_from TIMESTAMP NOT NULL,
  valid_to TIMESTAMP NOT NULL,
  usage_limit INT,
  used_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Uso de promociones
CREATE TABLE promotion_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id),
  passenger_id UUID NOT NULL REFERENCES passenger_profiles(id),
  trip_id UUID NOT NULL REFERENCES trips(id),
  discount_amount DECIMAL(10,2) NOT NULL,
  used_at TIMESTAMP DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_passenger_profiles_user_id ON passenger_profiles(user_id);
CREATE INDEX idx_favorite_addresses_passenger_id ON favorite_addresses(passenger_id);
CREATE INDEX idx_search_history_passenger_id ON search_history(passenger_id);
CREATE INDEX idx_trips_passenger_id ON trips(passenger_id);
CREATE INDEX idx_trips_status_passenger ON trips(status, passenger_id);
```

## Flujos de Usuario

### 1. Onboarding Flow

```
Registro
  ↓
Verificar email (OTP)
  ↓
Verificar telefono (OTP)
  ↓
Completar perfil (nombre, foto)
  ↓
Agregar metodo de pago (opcional, puede despues)
  ↓
Home (listo para solicitar viaje)
```

### 2. Solicitud de Viaje Flow

```
Home (mapa abierto)
  ↓
Tocar "A donde vas?"
  ↓
Escribir direccion de destino (autocomplete Google Maps)
  ↓
Confirmar pickup (GPS o escribir direccion)
  ↓
Seleccionar tipo de vehiculo (con precio estimado)
  ↓
Aplicar promocion (opcional)
  ↓
Confirmar solicitud
  ↓
Pantalla "Buscando conductor..."
  ↓
Conductor acepta → Ver info conductor + tracking en tiempo real
  ↓
Conductor llega → Notificacion
  ↓
Viaje en curso → Tracking hasta destino
  ↓
Llegada → Pantalla de resumen + calificar + pago
```

### 3. Cancelacion Flow (Regla de 5 minutos)

```
Viaje solicitado (< 5 min de espera)
  ↓
Tocar "Cancelar"
  ↓
Seleccionar motivo
  ↓
Sin costo → Vuelve al Home

Viaje solicitado (> 5 min de espera)
  ↓
Tocar "Cancelar"
  ↓
Seleccionar motivo
  ↓
Se cobra tarifa de cancelacion
  ↓
Vuelve al Home
```

### Navegacion Secundaria

- `Home` → `TripHistory` (historial de viajes)
- `Home` → `Profile` (perfil del pasajero)
- `Home` → `PaymentMethod` (metodo de pago)
- `TripInProgress` → `Chat` (chat con conductor)

## Estandares de Codigo

### TypeScript

```typescript
// Bueno
interface PassengerProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isVerified: boolean;
}

type RideStatus = 'requested' | 'accepted' | 'en_route' | 'in_trip' | 'completed';

// Malo
interface passenger_profile {
  ID: string;
  FullName: string;
  Email: string;
  Phone: string;
  verified: boolean;
}
```

### Nombrado de Archivos

```
✅ passenger.service.ts
✅ PassengerService.ts
✅ usePassengerAuth.ts
✅ PassengerAuthContext.tsx

❌ passengerService.ts
❌ passenger_service.ts
❌ use-passenger-auth.ts
```

### Estructura de Componentes

```typescript
// Bueno
import React from 'react';
import { View, Text } from 'react-native';
import { PassengerMap } from './PassengerMap';

interface Props {
  destination: string;
  onSelect: (location: string) => void;
}

export const DestinationSelector: React.FC<Props> = ({ destination, onSelect }) => {
  // 1. Hooks
  const [searchQuery, setSearchQuery] = useState('');

  // 2. Handlers
  const handleSelect = (location: string) => {
    onSelect(location);
  };

  // 3. Render
  return (
    <View>
      <Text>Select Destination</Text>
      <PassengerMap />
    </View>
  );
};

// Malo
export default function destSelector(props) {
  const [q, setQ] = useState('');
  return <View><Text>Select</Text></View>;
}
```

### Manejo de Estado

```typescript
// Zustand Store Pattern
import { create } from 'zustand';

interface RideStore {
  currentRide: Ride | null;
  status: RideStatus;
  setRide: (ride: Ride) => void;
  updateStatus: (status: RideStatus) => void;
  clearRide: () => void;
}

export const useRideStore = create<RideStore>((set) => ({
  currentRide: null,
  status: 'idle',
  setRide: (ride) => set({ currentRide: ride, status: 'requested' }),
  updateStatus: (status) => set({ status }),
  clearRide: () => set({ currentRide: null, status: 'idle' }),
}));
```

### API Calls

```typescript
// React Query Pattern
import { useQuery, useMutation } from '@tanstack/react-query';

export const usePassengerProfile = () => {
  return useQuery({
    queryKey: ['passenger', 'profile'],
    queryFn: () => api.get('/passenger/profile'),
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
};

export const useRequestRide = () => {
  return useMutation({
    mutationFn: (data: RideRequest) =>
      api.post('/passenger/rides/request', data),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['passenger', 'rides']);
    },
  });
};
```

## Sistema de Diseno

### Colores (Alineados con `apps/mobile-passengers/design/App-pasajeros.pen`)

```typescript
// src/theme/index.ts
export const colors = {
  primary: '#00C2B3',   // teal de marca
  deepBlue: '#0D2B45',  // navy — navbar, texto principal
  lightGray: '#F1F4F6', // bg secundario
  mediumGray: '#A8B1BA', // texto muted
  white: '#FFFFFF',
  black: '#000000',
  dangerRed: '#E53935', // errores, SOS
  amber: '#FFB020',     // promo, warning
} as const;
```

### Tipografia

```typescript
// src/theme/index.ts
export const typography = {
  fontFamily: 'Inter',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 32,
    '4xl': 40,
    '5xl': 48,
  },
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;
```

### Componentes UI

```typescript
// Variantes de Button:
// - primary: bg primary, text white
// - secondary: border primary, text primary
// - danger: bg dangerRed, text white
// - cta: bg primary, text white, height 52px
```

## Integraciones Externas

### Supabase Auth

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@email.com',
  password: 'password123',
});

// Registro
const { data, error } = await supabase.auth.signUp({
  email: 'user@email.com',
  password: 'password123',
  options: {
    data: {
      full_name: 'Juan Perez',
      phone: '+5491112345678',
    },
  },
});
```

### Mercado Pago

```typescript
// apps/backend/src/features/passenger-payments/mp-integration.service.ts
interface CardData {
  cardNumber: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
  cardholderName: string;
}

class MercadoPagoPassengerService {
  async createPaymentMethod(
    passengerId: string,
    cardData: CardData
  ): Promise<PaymentMethod> {
    // Implementar guardado de tarjeta
  }

  async processTripPayment(
    tripId: string,
    paymentMethodId: string,
    amount: number
  ): Promise<PaymentResult> {
    // Implementar cobro al finalizar viaje
  }
}
```

### Google Maps

```typescript
// src/components/Map/PassengerMap.tsx
interface PassengerMapProps {
  origin?: Location;
  destination?: Location;
  driverLocation?: Location;
  route?: Route;
  onLocationSelect?: (location: Location) => void;
}

// Usar Google Maps API via proxy interno
// - Autocomplete para busqueda de direcciones
// - Geocoding para coordenadas
// - Directions para rutas
// - Fare para estimacion de precio
```

## Ramas y Convenciones

### Estrategia de Ramas

```
main
├── develop
│   ├── feature/passenger-auth
│   ├── feature/passenger-ride-request
│   ├── feature/passenger-payments
│   ├── feature/passenger-tracking
│   └── feature/passenger-chat
├── release/v1.0.0
└── hotfix/critical-bug
```

### Convencion de Commits

```
Formato: <type>(<scope>): <subject>

Tipos:
feat: Nueva caracteristica
fix: Correccion de bug
docs: Documentacion
style: Estilos (formato, semicolons, etc)
refactor: Refactorizacion de codigo
test: Tests
chore: Tareas de mantenimiento

Ejemplos:
feat(passenger): add ride request flow
fix(passenger): fix OTP input validation
docs(passenger): update AGENTS.md
style(passenger): format with biome
test(passenger): add unit tests for ride service
```

## Comandos Utiles

```bash
# Instalacion
bun install

# Desarrollo
bun --filter @lifty/mobile-passengers dev    # App pasajero
bun --filter @lifty/backend dev              # Backend
bun run dev                                   # Todos los servicios

# Build
bun --filter @lifty/mobile-passengers build  # Build app pasajero
bun --filter @lifty/backend build            # Build backend

# Testing
bun --filter @lifty/mobile-passengers test   # Tests pasajero
bun --filter @lifty/backend test             # Tests backend
bun run test                                  # Todos los tests

# Linting
bun --filter @lifty/mobile-passengers lint   # Lint pasajero
bun --filter @lifty/backend lint             # Lint backend
bun run lint                                  # Todos los lint

# Type Checking
bun --filter @lifty/mobile-passengers typecheck # Type check pasajero
bun --filter @lifty/backend typecheck           # Type check backend
bun run typecheck                                # Todos los typecheck

# Base de datos
bun run db:migrate:passenger                  # Migrar tablas de pasajero
bun run db:seed:passenger                     # Seedear datos de prueba
```

## Checklist de Desarrollo

### Backend

- [ ] Crear modulo passengers con CRUD completo
- [ ] Crear modulo ride-requests con matching
- [ ] Crear modulo favorites (direcciones favoritas)
- [ ] Crear modulo search-history
- [ ] Crear modulo promotions (cupones)
- [ ] Crear modulo passenger-payments
- [ ] Crear modulo passenger-trips
- [ ] Crear modulo passenger-chat con WebSocket
- [ ] Implementar endpoint de estimacion de precio
- [ ] Implementar logica de cancelacion (5 minutos)
- [ ] Implementar actualizacion de destino en viaje
- [ ] Implementar algoritmo de matching
- [ ] Implementar caching con Redis
- [ ] Configurar rate limiting
- [ ] Agregar tests unitarios (cobertura > 80%)

### Frontend

- [x] Configurar proyecto Expo con expo-router
- [x] Configurar tema (colores, tipografia, espaciado)
- [ ] Implementar componentes UI (Button, Input, Card)
- [ ] Implementar autenticacion (login, registro, verificacion)
- [ ] Implementar onboarding (perfil, pago)
- [ ] Implementar pantalla principal con mapa
- [ ] Implementar busqueda de direcciones (autocomplete)
- [ ] Implementar seleccion de vehiculo
- [ ] Implementar solicitud de viaje
- [ ] Implementar tracking en tiempo real
- [ ] Implementar chat con conductor
- [ ] Implementar cancelacion (regla de 5 minutos)
- [ ] Implementar modificar destino en viaje
- [ ] Implementar historial de viajes
- [ ] Implementar favoritos
- [ ] Implementar metodos de pago
- [ ] Implementar promociones
- [ ] Implementar compartir viaje

### Integraciones

- [ ] Configurar Supabase Auth (email + password)
- [ ] Configurar verificacion OTP (email y telefono)
- [ ] Configurar Mercado Pago (guardar tarjetas, procesar pagos)
- [ ] Configurar Google Maps (autocomplete, geocoding, directions)
- [ ] Configurar FCM para push notifications
- [ ] Configurar WebSockets para tracking y chat

### Testing

- [ ] Tests unitarios backend
- [ ] Tests de integracion backend
- [ ] Tests unitarios frontend (React Testing Library)
- [ ] Tests E2E (Detox)
- [ ] Pruebas de carga (matching y tracking)
- [ ] Pruebas de seguridad (autenticacion)

### Documentacion

- [x] Crear AGENTS.md
- [ ] Crear documentacion de API (OpenAPI)
- [ ] Documentar flujos de usuario
- [ ] Crear guia de despliegue

## Recursos Adicionales

### Documentacion de Referencia

- [ElysiaJS](https://elysiajs.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [Expo](https://docs.expo.dev)
- [React Native](https://reactnative.dev)
- [Supabase](https://supabase.com/docs)
- [Mercado Pago](https://www.mercadopago.com.ar/developers)
- [Google Maps API](https://developers.google.com/maps)

### Apps de Referencia

- Uber: Flujo de solicitud y tracking
- Didi: Seleccion de vehiculo y precios
- Cabify: Onboarding y metodos de pago
- Waze: Diseno de mapa y navegacion

## Instrucciones para Agentes de IA

1. Siempre mantener consistencia con el stack y patrones existentes
2. Priorizar la experiencia de usuario sobre la complejidad tecnica
3. Escribir codigo legible y auto-documentado
4. Incluir tests para todas las funcionalidades nuevas
5. Actualizar la documentacion cuando sea necesario
6. Seguir el sistema de diseno establecido
7. Mantener el rendimiento (evitar renders innecesarios)
8. Usar TypeScript estricto (sin `any`)
9. Manejar errores de manera graceful
10. Pensar en la escalabilidad desde el inicio

## Troubleshooting Dev (Linux — ENOSPC file watchers)

**Síntoma:** al escanear el QR de Expo Go, Metro crashea con:

```
Error: ENOSPC: System limit for number of file watchers reached, watch '.../node_modules/.bun/...'
errno: -28
```

**Causa:** Bun hoistea los packages en `node_modules/.bun/` (~36k directorios). Metro usa `FallbackWatcher` (no hay Watchman) que consume un inotify watch por directorio. Con `turbo dev` levantando 3 apps a la vez se agota `fs.inotify.max_user_watches`.

**Fix (máquina local, NO es código del repo):**

```bash
# temporal
sudo sysctl -w fs.inotify.max_user_watches=524288
sudo sysctl -w fs.inotify.max_user_instances=1024

# permanente
echo -e 'fs.inotify.max_user_watches=524288\nfs.inotify.max_user_instances=1024' | sudo tee /etc/sysctl.d/99-inotify.conf
sudo sysctl --system
```

Alternativa: instalar Watchman (`sudo apt install watchman`) para que Metro deje de usar `FallbackWatcher`.

**No hacer:** no agregues `node_modules/.bun` a `blockList` en `metro.config.js`. Bun guarda los packages reales dentro de `.bun` (no hay symlinks top-level), así que bloquearlo rompe la resolución de módulos. `metro.config.js` ya maneja `.bun` correctamente vía `rewriteRequestUrl`.

Cuando solo se testea passengers, preferí correr `bun --filter @lifty/mobile-passengers dev` en vez de `bun run dev` (levanta un solo Metro).

## Proximos Pasos

### Sprint 1: Setup y Onboarding (3 dias)

- Configurar proyecto passenger
- Implementar autenticacion
- Implementar onboarding

### Sprint 2: Solicitud de Viaje (4 dias)

- Busqueda de direcciones
- Seleccion de vehiculo
- Solicitud y matching

### Sprint 3: Tracking y Viaje (4 dias)

- Tracking en tiempo real
- Chat con conductor
- Cancelacion y modificaciones

### Sprint 4: Pagos y Finalizacion (3 dias)

- Metodos de pago
- Procesamiento de pagos
- Historial y calificaciones

### Sprint 5: Testing y Pulido (3 dias)

- Tests E2E
- Optimizacion de rendimiento
- Pulido de UI/UX
