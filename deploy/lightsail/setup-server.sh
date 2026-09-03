#!/usr/bin/env bash
# One-time bootstrap on a fresh Ubuntu Lightsail instance (22.04/24.04).
# Run as a sudo-capable user (not necessarily root):
#   curl -fsSL … | bash   OR   bash deploy/lightsail/setup-server.sh
#
# Installs: Docker Engine + Compose plugin, git, curl, ufw basics.
# Does NOT clone the repo or start the app — see deploy.sh / README.

set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Need root or sudo" >&2
    exit 1
  fi
  SUDO="sudo"
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> apt update + base packages"
$SUDO apt-get update -y
$SUDO apt-get install -y ca-certificates curl git ufw jq

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Install Docker Engine (official apt repo)"
  $SUDO install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO tee /etc/apt/keyrings/docker.asc >/dev/null
    $SUDO chmod a+r /etc/apt/keyrings/docker.asc
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  $SUDO systemctl enable --now docker
else
  echo "==> Docker already installed: $(docker --version)"
fi

if [[ -n "${SUDO}" ]]; then
  if ! groups "${USER}" | grep -q docker; then
    echo "==> Add ${USER} to docker group (re-login required)"
    $SUDO usermod -aG docker "${USER}"
    echo "    Run: newgrp docker   OR logout/login, then continue with deploy.sh"
  fi
fi

echo "==> UFW: allow OpenSSH + HTTP/HTTPS (enable only if not already active carefully)"
$SUDO ufw allow OpenSSH || true
$SUDO ufw allow 80/tcp || true
$SUDO ufw allow 443/tcp || true
# Optional direct API port when not using Caddy:
$SUDO ufw allow 3000/tcp || true
if ! $SUDO ufw status | grep -qi "Status: active"; then
  echo "    UFW is inactive. To enable: sudo ufw --force enable"
fi

echo ""
echo "Setup OK."
echo "Next:"
echo "  1. Clone monorepo (or rsync) to e.g. /opt/lifty"
echo "  2. cp deploy/lightsail/.env.example deploy/lightsail/.env  && edit secrets"
echo "  3. ./deploy/lightsail/deploy.sh --proxy    # or without --proxy for :3000 only"
echo ""
