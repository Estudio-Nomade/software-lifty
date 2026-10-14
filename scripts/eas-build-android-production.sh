#!/usr/bin/env bash
# Run EAS Android production build (AAB) from an app directory.
# Usage: scripts/eas-build-android-production.sh apps/mobile
#        scripts/eas-build-android-production.sh apps/mobile-passengers
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_REL="${1:?Usage: $0 apps/mobile|apps/mobile-passengers}"
APP_DIR="$ROOT/$APP_REL"
if [[ ! -f "$APP_DIR/eas.json" ]]; then
  echo "Missing eas.json in $APP_DIR" >&2
  exit 1
fi
cd "$APP_DIR"
exec bunx eas-cli build -p android --profile production --non-interactive
