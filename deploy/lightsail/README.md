# Deploy Lifty backend → AWS Lightsail

Las apps Expo **no** van al server. Solo subís la **API** (`apps/backend`) + **Redis**.  
Postgres/Auth/Storage siguen en **Supabase**.

Turbo / `bun run dev` es solo local.

## Qué queda corriendo en la instancia

| Servicio | Rol |
|----------|-----|
| `api` | Bun + Elysia (`lifty-api` image) |
| `redis` | Rate limit + cache ubicación |
| `caddy` (opcional, `--proxy`) | TLS Let’s Encrypt en 80/443 |

## 0. Lightsail (consola AWS)

1. Instance Ubuntu 22.04/24.04 (1 GB RAM mínimo; 2 GB más cómodo para build).
2. **Static IP** adjunta.
3. Networking:
   - SSH `22`
   - Con proxy: `80` + `443`
   - Sin proxy: `3000` (o el `API_PUBLISH_PORT`)
4. DNS: `A` de `api.tudominio.com` → static IP (antes de Caddy/TLS).

## 1. Una vez en el server

```bash
# como usuario con sudo
sudo apt-get update && sudo apt-get install -y git
git clone <TU_REPO> /opt/lifty
cd /opt/lifty
bash deploy/lightsail/setup-server.sh
# si te agregó al group docker:
newgrp docker
```

## 2. Secrets

```bash
cp deploy/lightsail/.env.example deploy/lightsail/.env
nano deploy/lightsail/.env
```

Obligatorios:

- `DATABASE_URL` → pooler Supabase **:6543** (transaction)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`
- `REDIS_PASSWORD` (largo, random)
- `API_URL=https://api.tudominio.com/api`
- Con TLS: `DOMAIN=api.tudominio.com`

Generar password Redis:

```bash
openssl rand -hex 24
```

## 3. Deploy (día a día)

```bash
cd /opt/lifty

# HTTP directo :3000
./deploy/lightsail/deploy.sh

# HTTPS con Caddy (recomendado)
./deploy/lightsail/deploy.sh --proxy

# Tras cambios de schema (Drizzle migrations en la imagen)
./deploy/lightsail/deploy.sh --proxy --migrate

# Actualizar código desde git y redeploy
./deploy/lightsail/deploy.sh --proxy --pull --migrate
```

Verificación:

```bash
curl -sS https://api.tudominio.com/ready
curl -sS https://api.tudominio.com/health
```

Logs:

```bash
docker compose -f deploy/lightsail/docker-compose.yml --env-file deploy/lightsail/.env logs -f api
```

## 4. Mobile

En builds de Expo / `.env` de apps:

```text
EXPO_PUBLIC_API_URL=https://api.tudominio.com/api
```

No hace falta Turbo en el server.

## 5. Migraciones: dos caminos

1. **En el server** (script viejo Drizzle):  
   `./deploy/lightsail/deploy.sh --migrate`  
   → `bun run scripts/deploy.ts` dentro del container.

2. **Desde tu máquina / CI** (preferido si ya usás Supabase CLI):  
   `supabase db push` con session pooler **:5432**.  
   En ese caso no hace falta `--migrate` en cada deploy de código.

Si el transaction pooler se queja en migrate, corré migraciones con `DATABASE_URL` en puerto **5432** (session) solo para ese one-shot.

## 6. Actualizar sin drama

```bash
cd /opt/lifty
git pull
./deploy/lightsail/deploy.sh --proxy
```

Build usa el monorepo root + `bun.lock` de la raíz (no hace falta `bun install` en el host).

## 6b. TLS hacia Supabase (CA propia)

El backend usa `pg`, que con `sslmode=require` **verifica** el certificado. El pooler de
Supabase usa su propia CA, así que sin ella falla con `SELF_SIGNED_CERT_IN_CHAIN`.

- `deploy/lightsail/certs/supabase-ca.crt` es la *Supabase Root 2021 CA* (pública, vence 2031).
- `docker-compose.yml` la monta en `/certs/supabase-ca.crt` y setea `NODE_EXTRA_CA_CERTS`.
- Dejá `?sslmode=require` en `DATABASE_URL`. No uses `no-verify` ni quites `sslmode`.

## 6c. Gestionar envs en el server (`scripts/vps-env.sh`)

Edita `deploy/lightsail/.env` por SSH sin mostrar valores y recrea la api para recargarlo
(`docker compose restart` **no** relee `env_file`).

```bash
scripts/vps-env.sh list                # claves y si tienen valor
scripts/vps-env.sh set KEY             # pide el valor oculto, guarda y aplica
scripts/vps-env.sh unset KEY
scripts/vps-env.sh push                # mergea apps/backend/.env (no pisa NODE_ENV/PORT/API_URL/REDIS_*)
scripts/vps-env.sh edit                # nano en el server y aplica al salir
scripts/vps-env.sh rollback            # restaura el backup anterior (se guardan 10)
```

Variables: `VPS_HOST` (default `lifty-vps`, alias en `~/.ssh/config`), `VPS_DIR`, `NO_APPLY=1`.

## 6d. CD automático (GitHub Actions)

`.github/workflows/deploy.yml` despliega solo cuando el CI de `main` pasa (o a mano:
Actions → *Deploy VPS* → *Run workflow*). Entra por SSH con una clave de CI que en el
server está restringida a ejecutar **solo** `ci-deploy.sh`:

```text
# ~lifty/.ssh/authorized_keys
restrict,command="/opt/lifty/deploy/lightsail/ci-deploy.sh" ssh-ed25519 AAAA... lifty-ci
```

`ci-deploy.sh <sha>`: lock anti-concurrencia, solo acepta SHAs de `origin/main`, salta el
rebuild si no cambió backend/deploy, corre `deploy.sh --proxy` y, si falla, vuelve al commit
anterior. Log en `~lifty/lifty-deploy.log`.

Secrets del repo: `VPS_SSH_KEY` (privada), `VPS_KNOWN_HOSTS` (salida de
`ssh-keyscan -t ed25519 <ip>`), `VPS_HOST`, `VPS_USER`.

Rotar la clave de CI:

```bash
ssh-keygen -t ed25519 -N "" -C lifty-ci -f /tmp/lifty-ci
# server: reemplazar la línea `lifty-ci` en ~/.ssh/authorized_keys (conservar restrict,command=...)
gh secret set VPS_SSH_KEY < /tmp/lifty-ci && shred -u /tmp/lifty-ci /tmp/lifty-ci.pub
```

**No** corre migraciones: `supabase db push` sigue siendo manual.

## 7. Troubleshooting

| Síntoma | Qué mirar |
|---------|-----------|
| Build falla por lockfile | Estás buildeando desde root; no borres `bun.lock` de la raíz |
| `Missing required env var` | `RESEND_API_KEY` / `DATABASE_URL` / `SUPABASE_URL` en `.env` |
| DB `ENOTFOUND` | Usar pooler Supabase, no host `db.*.supabase.co` directo |
| Caddy no saca cert | DNS A apunta a la IP; ports 80/443 abiertos en Lightsail **y** UFW |
| `/ready` fail Redis | `REDIS_PASSWORD` coherente; `docker compose ps` |
| Mobile no conecta | `EXPO_PUBLIC_API_URL` con `https://…/api`; cert válido |

## Layout

```text
deploy/lightsail/
  Dockerfile          # context = monorepo root
  docker-compose.yml  # api + redis + caddy (profile proxy)
  Caddyfile
  .env.example
  setup-server.sh     # docker + ufw una vez
  deploy.sh           # build/up/health (+ migrate/pull/proxy)
  README.md
```
