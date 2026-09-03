#!/usr/bin/env bash
# Build + (re)start Lifty API on this machine (Lightsail instance).
#
# Usage (from anywhere):
#   ./deploy/lightsail/deploy.sh              # API :3000 + Redis
#   ./deploy/lightsail/deploy.sh --proxy      # + Caddy on 80/443 (needs DOMAIN)
#   ./deploy/lightsail/deploy.sh --migrate    # also run drizzle migrate/seed script
#   ./deploy/lightsail/deploy.sh --pull       # git pull before build
#   ./deploy/lightsail/deploy.sh --no-build   # only recreate containers
#
# Requires: Docker Compose v2, deploy/lightsail/.env filled in.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"

DO_PROXY=0
DO_MIGRATE=0
DO_PULL=0
DO_BUILD=1

for arg in "$@"; do
  case "${arg}" in
    --proxy) DO_PROXY=1 ;;
    --migrate) DO_MIGRATE=1 ;;
    --pull) DO_PULL=1 ;;
    --no-build) DO_BUILD=0 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: ${arg}" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  echo "Copy the example and fill secrets:" >&2
  echo "  cp ${SCRIPT_DIR}/.env.example ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

missing=()
for key in DATABASE_URL SUPABASE_URL SUPABASE_PUBLISHABLE_KEY RESEND_API_KEY; do
  if [[ -z "${!key:-}" ]]; then
    missing+=("${key}")
  fi
done
if ((${#missing[@]})); then
  echo "Missing required vars in .env: ${missing[*]}" >&2
  exit 1
fi

if [[ -z "${REDIS_PASSWORD:-}" || "${REDIS_PASSWORD}" == "changeme" || "${REDIS_PASSWORD}" == "generate-a-long-random-string" ]]; then
  echo "Set a real REDIS_PASSWORD in ${ENV_FILE}" >&2
  exit 1
fi

if [[ "${DO_PROXY}" -eq 1 ]]; then
  if [[ -z "${DOMAIN:-}" || "${DOMAIN}" == "api.example.com" || "${DOMAIN}" == "localhost" ]]; then
    echo "--proxy requires DOMAIN=your.public.hostname in .env" >&2
    exit 1
  fi
  if [[ -z "${API_URL:-}" ]]; then
    echo "Warning: API_URL empty; approve emails may point to localhost" >&2
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found. Run setup-server.sh first." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin not found. Run setup-server.sh first." >&2
  exit 1
fi

cd "${ROOT_DIR}"

if [[ "${DO_PULL}" -eq 1 ]]; then
  echo "==> git pull"
  git pull --ff-only
fi

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
PROFILES=()
if [[ "${DO_PROXY}" -eq 1 ]]; then
  PROFILES+=(--profile proxy)
  # When Caddy publishes 80/443, avoid binding host:3000 publicly if user left default —
  # still OK to publish 3000 for debugging; document in README.
fi

echo "==> Project root: ${ROOT_DIR}"

if [[ "${DO_BUILD}" -eq 1 ]]; then
  echo "==> Build image"
  "${COMPOSE[@]}" "${PROFILES[@]}" build api
fi

echo "==> Up"
"${COMPOSE[@]}" "${PROFILES[@]}" up -d --remove-orphans

if [[ "${DO_MIGRATE}" -eq 1 ]]; then
  echo "==> Migrate + seed (apps/backend/scripts/deploy.ts)"
  # One-shot on the running image / network. Prefer session pooler :5432 for migrations
  # if transaction pooler misbehaves — override DATABASE_URL for this step if needed.
  "${COMPOSE[@]}" "${PROFILES[@]}" run --rm --no-deps api bun run scripts/deploy.ts
fi

echo "==> Wait for healthy api"
ok=0
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" "${PROFILES[@]}" exec -T api \
    bun -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    2>/dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "${ok}" -ne 1 ]]; then
  echo "API not ready. Logs:" >&2
  "${COMPOSE[@]}" "${PROFILES[@]}" logs --tail=80 api >&2 || true
  exit 1
fi

echo ""
echo "Deploy OK."
if [[ "${DO_PROXY}" -eq 1 ]]; then
  echo "  Public:  https://${DOMAIN}/ready"
  echo "  API:     https://${DOMAIN}/api/..."
else
  echo "  Local:   http://127.0.0.1:${API_PUBLISH_PORT:-3000}/ready"
  echo "  Open Lightsail firewall for port ${API_PUBLISH_PORT:-3000} (or put Caddy with --proxy)."
fi
echo "  Logs:    docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} logs -f api"
echo ""
