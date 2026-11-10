#!/usr/bin/env bash
# Deploy disparado por GitHub Actions (.github/workflows/deploy.yml).
#
# Se ejecuta como *forced command* de una clave SSH dedicada a CI:
#   restrict,command="/opt/lifty/deploy/lightsail/ci-deploy.sh" ssh-ed25519 AAAA... lifty-ci
# El único argumento llega en SSH_ORIGINAL_COMMAND: el SHA (40 hex) a desplegar.
# También se puede probar a mano:  ./ci-deploy.sh <sha>
#
# Garantías:
#   - un solo deploy a la vez (flock)
#   - solo despliega commits que están en origin/main
#   - si el cambio no toca backend/deploy, solo avanza el checkout (sin rebuild)
#   - si el deploy falla, vuelve al commit anterior y lo reconstruye
#
# Todo el cuerpo vive en main() y se termina con `exit`: bash ya parseó el script
# completo antes de que `git merge` lo reemplace en disco.

set -euo pipefail

main() {
  local sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
  if [[ ! "${sha}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "uso: ci-deploy.sh <sha de 40 hex>" >&2
    return 2
  fi

  local script_dir root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root="$(cd "${script_dir}/../.." && pwd)"

  exec 9>/tmp/lifty-deploy.lock
  if ! flock -n 9; then
    echo "Hay otro deploy en curso; abortando." >&2
    return 3
  fi

  cd "${root}"
  echo "==> $(date -u +%FT%TZ) deploy solicitado: ${sha}"

  git fetch --quiet origin main
  if ! git merge-base --is-ancestor "${sha}" origin/main; then
    echo "El commit ${sha} no está en origin/main; no se despliega." >&2
    return 4
  fi

  local old
  old="$(git rev-parse HEAD)"
  if git merge-base --is-ancestor "${sha}" "${old}"; then
    echo "==> ${sha:0:7} ya está incluido en ${old:0:7}; nada que hacer."
    return 0
  fi

  local changed
  changed="$(git diff --name-only "${old}" "${sha}")"
  if ! grep -qE '^(apps/backend/|deploy/lightsail/|bun\.lock$|package\.json$|scripts/vps-env\.sh$)' <<<"${changed}"; then
    echo "==> Sin cambios de backend/deploy entre ${old:0:7}..${sha:0:7}; solo avanzo el checkout."
    git merge --ff-only --quiet "${sha}"
    return 0
  fi

  git merge --ff-only --quiet "${sha}"
  echo "==> Desplegando ${old:0:7} -> ${sha:0:7}"
  if "${root}/deploy/lightsail/deploy.sh" --proxy; then
    echo "==> Deploy OK (${sha:0:7})"
    return 0
  fi

  echo "!! Deploy falló. Rollback a ${old:0:7}..." >&2
  git reset --hard --quiet "${old}"
  if "${root}/deploy/lightsail/deploy.sh" --proxy; then
    echo "!! Rollback OK: el server quedó en ${old:0:7}." >&2
  else
    echo "!! Rollback también falló. Intervención manual necesaria." >&2
  fi
  return 1
}

main "$@" 2>&1 | tee -a "${HOME}/lifty-deploy.log"
exit "${PIPESTATUS[0]}"
