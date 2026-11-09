#!/usr/bin/env bash
# Gestión ágil de las envs del backend en el VPS (sin pegar secretos en el chat/historial).
#
#   scripts/vps-env.sh list                 # claves y si tienen valor (nunca muestra valores)
#   scripts/vps-env.sh set KEY [VALUE]      # sin VALUE: lo pide oculto (read -s). Aplica solo.
#   scripts/vps-env.sh unset KEY            # borra la clave. Aplica solo.
#   scripts/vps-env.sh push [archivo]       # mergea un .env local (default apps/backend/.env)
#   scripts/vps-env.sh edit                 # abre nano en el server y aplica al salir
#   scripts/vps-env.sh apply                # recrea el contenedor api para recargar el .env
#   scripts/vps-env.sh rollback             # vuelve al backup anterior y aplica
#
# Variables: VPS_HOST (default lifty-vps), VPS_DIR (default /opt/lifty/deploy/lightsail),
#            NO_APPLY=1 para no reiniciar la api tras set/unset/push.
#
# Nota: `docker compose restart` NO relee el env_file; hay que recrear el contenedor (apply).

set -euo pipefail

HOST="${VPS_HOST:-lifty-vps}"
DIR="${VPS_DIR:-/opt/lifty/deploy/lightsail}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Edita el .env remoto: lee KEY=VALUE (líneas) desde stdin y hace upsert; con DELETE=KEY borra.
read -r -d '' PY <<'PYEOF' || true
import os, re, shutil, sys, time
path = ".env"
delete = os.environ.get("DELETE")
safe = re.compile(r"^[A-Za-z0-9_@%+=:,./-]*$")

def fmt(v):
    if v == "" or safe.match(v):
        return v
    if "'" in v or "\n" in v:
        sys.exit("valor con comilla simple o salto de línea no soportado")
    return "'" + v + "'"

shutil.copy(path, f"{path}.bak.{int(time.time())}")
baks = sorted(f for f in os.listdir(".") if f.startswith(".env.bak."))
for old in baks[:-10]:
    os.remove(old)

lines = open(path).read().splitlines()
if delete:
    lines = [l for l in lines if not re.match(rf"^{re.escape(delete)}=", l)]
    changed = [delete]
else:
    new = {}
    for l in sys.stdin.read().splitlines():
        m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", l)
        if m:
            k, v = m.groups()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            new[k] = f"{k}={fmt(v)}"
    out, seen = [], set()
    for l in lines:
        m = re.match(r"^([A-Z_][A-Z0-9_]*)=", l)
        if m and m.group(1) in new:
            out.append(new[m.group(1)]); seen.add(m.group(1))
        else:
            out.append(l)
    out += [new[k] for k in new if k not in seen]
    lines, changed = out, list(new)
open(path, "w").write("\n".join(lines) + "\n")
os.chmod(path, 0o600)
print("OK:", ", ".join(changed))
PYEOF

remote() { ssh "${HOST}" "cd ${DIR} && $*"; }

check_remote() {
  remote 'bash -c "set -a; source ./.env; set +a" >/dev/null 2>&1 && docker compose --env-file .env -f docker-compose.yml config -q' \
    || { echo "!! el .env remoto no es válido; usá: $0 rollback" >&2; exit 1; }
}

apply() {
  if [[ -n "${NO_APPLY:-}" ]]; then echo "(NO_APPLY: no se reinició la api)"; return; fi
  check_remote
  if [[ -z "$(remote 'docker compose --env-file .env -f docker-compose.yml ps -q api')" ]]; then
    echo "(la api todavía no está desplegada; corré deploy.sh --proxy cuando esté lista)"; return
  fi
  remote 'docker compose --env-file .env -f docker-compose.yml --profile proxy up -d --force-recreate --no-deps api >/dev/null 2>&1'
  echo -n "esperando /ready"
  for _ in $(seq 1 30); do
    if remote "docker compose --env-file .env -f docker-compose.yml exec -T api bun -e \"fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" 2>/dev/null; then
      echo " ✓ api lista"; return
    fi
    echo -n "."; sleep 2
  done
  echo; echo "!! la api no quedó lista; revisá: ssh ${HOST} 'cd ${DIR} && docker compose logs --tail=50 api' o usá rollback" >&2
  exit 1
}

remote_py() { # $1 = DELETE (opcional); stdin = líneas KEY=VALUE
  local q; q=$(printf '%q' "$PY")
  ssh "${HOST}" "cd ${DIR} && DELETE='${1:-}' python3 -c ${q}"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  list)
    remote "awk -F= '/^[A-Z_][A-Z0-9_]*=/{v=substr(\$0,length(\$1)+2); printf \"%-34s %s\n\", \$1, (v==\"\"?\"<vacío>\":\"definido\")}' .env"
    ;;
  set)
    key="${1:?uso: $0 set KEY [VALUE]}"
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || { echo "KEY inválida" >&2; exit 1; }
    if [[ $# -ge 2 ]]; then val="$2"; else read -r -s -p "Valor para ${key}: " val; echo; fi
    printf '%s=%s\n' "$key" "$val" | remote_py ""
    apply
    ;;
  unset)
    key="${1:?uso: $0 unset KEY}"
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || { echo "KEY inválida" >&2; exit 1; }
    remote_py "$key" </dev/null
    apply
    ;;
  push)
    file="${1:-${ROOT}/apps/backend/.env}"
    [[ -f "$file" ]] || { echo "no existe $file" >&2; exit 1; }
    # No pisa claves propias del server.
    grep -E '^[A-Z_][A-Z0-9_]*=' "$file" \
      | grep -Ev '^(NODE_ENV|PORT|API_URL|REDIS_URL|DOMAIN|REDIS_PASSWORD|API_PUBLISH_PORT)=' \
      | grep -Ev '^[A-Z_0-9]+=$' | remote_py ""
    apply
    ;;
  edit)
    ssh -t "${HOST}" "cd ${DIR} && cp .env .env.bak.\$(date +%s) && nano .env"
    apply
    ;;
  apply)
    apply
    ;;
  rollback)
    remote 'f=$(ls -1t .env.bak.* 2>/dev/null | head -1); [ -n "$f" ] || { echo "sin backups"; exit 1; }; cp "$f" .env && chmod 600 .env && echo "restaurado desde $f"'
    apply
    ;;
  *)
    sed -n '2,15p' "$0"; exit 1
    ;;
esac
