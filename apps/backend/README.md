# Lifty — Backend (Driver-Side API)

API del lado conductor para Lifty, una plataforma de ride-hailing en Argentina.

**Stack:** [Bun](https://bun.sh) + [Elysia](https://elysiajs.com) + [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL + Redis

## Requisitos

- [Bun](https://bun.sh) >= 1.x
- PostgreSQL 16+
- Redis 7+ (opcional en dev, requerido en prod para rate limiting y OTP)

## Primeros pasos

```bash
# 1. Instalar dependencias
bun install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales (ver sección Configuración)

# 3. Crear la base de datos
createdb lifty
createdb lifty_test   # para tests

# 4. Ejecutar migraciones y seed
bun run deploy

# 5. Iniciar servidor de desarrollo
bun run dev            # http://localhost:3000
```

## Configuración

Copiar `.env.example` a `.env` y completar las credenciales según el entorno.

### Variables requeridas

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `REDIS_URL` | Conexión a Redis |

### Auth (Supabase)

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key (sb_publishable_...) para verificar tokens de usuario |

### Servicios externos (opcionales en dev)

| Variable | Servicio | Se usa para |
|---|---|---|
| `TWILIO_*` | Twilio | Envío de SMS (OTP). En dev se muestra por consola. |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` | DIDIT | Verificación de identidad (KYC). |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Supabase Storage | Almacenamiento de documentos del conductor. |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase | Notificaciones push. |
| `PHOTON_URL`, `OSRM_URL` | Komoot / OSRM | Geocodificación y cálculo de rutas. Tienen defaults públicos. |

## Endpoints

La API documenta **49 endpoints** en 15 módulos. Swagger UI disponible en `http://localhost:3000/docs`.

| Módulo | Endpoints | Descripción |
|---|---|---|
| Auth | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/change-password`, `/auth/send-password-reset`, `/auth/reset-password` | Registro con OTP por SMS, login, JWT |
| Onboarding | `/onboarding/vehicle`, `/onboarding/documents`, `/onboarding/payment-method`, etc. | Onboarding de conductores en 5 pasos |
| KYC | `/kyc/session`, `/kyc/webhook` | Verificación de identidad con DIDIT |
| Trips | `/trips`, `/trips/accept`, `/trips/arrive`, `/trips/start`, `/trips/complete`, `/trips/cancel` | Máquina de estados de viajes |
| Location | `GET/PUT /location`, `WS /location/ws` | Ubicación en tiempo real (HTTP + WebSocket) |
| Maps | `/maps/geocode`, `/maps/route` | Proxy de geocodificación y rutas |
| Earnings | `/earnings`, `/earnings/stats` | Ganancias y estadísticas del conductor |
| Ratings | `/ratings` | Calificaciones de viajes |
| SOS | `/sos` | Eventos de emergencia |
| Notifications | `/notifications/token` | Registro de token FCM para push |
| Drivers | `/drivers/me`, `/drivers/public/:id` | Perfil público/privado del conductor |
| Districts | `/districts` | Zonas operativas |
| Payment Methods | `/payment-methods` | Métodos de cobro del conductor |

## Health & monitoreo

| Endpoint | Descripción |
|---|---|
| `GET /health` | Health check (DB, Redis, Supabase, DIDIT) |
| `GET /ready` | Ready check (la app puede servir tráfico) |
| `GET /metrics` | Métricas en formato Prometheus |

## Testing

```bash
# Requiere base de datos lifty_test
createdb lifty_test

# Ejecutar todos los tests
bun test

# Ejecutar tests de un módulo específico
bun test src/features/auth/auth.test.ts
```

**111 tests** que cubren integration tests, property-based tests (fast-check) y tests de race conditions.

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `bun run dev` | Iniciar servidor con hot reload |
| `bun run deploy` | Ejecutar migraciones + seed de datos |
| `bun run db:seed` | Sembrar 7 distritos (Córdoba, Argentina) |
| `bun run generate-secrets` | Generar secrets JWT aleatorios |
| `bun run backup` | Backup de base de datos (pg_dump + opcional S3) |

## Docker

### Desarrollo

```bash
docker compose up          # Postgres + Redis + App en puerto 3000
```

### Producción

```bash
# 1. Configurar .env.production (basado en .env.production.example)
cp .env.production.example .env.production

# 2. Iniciar
docker compose -f docker-compose.prod.yml up -d

# 3. Con Postgres self-hosted
docker compose -f docker-compose.prod.yml --profile self-hosted up -d
```

## Estructura del proyecto

```
src/
├── index.ts                  # Entry point, setup del servidor Elysia
├── features/                 # Módulos de negocio
│   ├── auth/                 #   routes.ts, service.ts, schema.ts, *.test.ts
│   ├── onboarding/
│   ├── kyc/
│   ├── trips/
│   ├── location/
│   ├── maps/
│   ├── payments/
│   ├── earnings/
│   ├── ratings/
│   ├── sos/
│   ├── notifications/
│   ├── drivers/
│   ├── districts/
│   └── payment-methods/
└── shared/
    ├── db/                   # Cliente DB, esquemas Drizzle, migraciones
    ├── lib/                  # JWT, Redis, bcrypt, DIDIT, SMS, etc.
    ├── middleware/            # Auth, security (CORS), rate limiting, metrics
    └── testing/              # Helpers para tests de integración
```

## CI/CD

GitHub Actions ejecuta en cada push a `main` y `develop`:
- **typecheck**: `tsc --noEmit`
- **test**: `bun test` (con PostgreSQL 16 + Redis 7 como service containers)

## Licencia

Propietario — Lifty.
