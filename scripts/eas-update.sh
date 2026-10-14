#!/usr/bin/env bash
# Publish an EAS Update (OTA) for one app + channel.
# Usage:
#   scripts/eas-update.sh apps/mobile production "fix: copy on home"
#   scripts/eas-update.sh apps/mobile-passengers preview "chore: preview OTA"
# Message: $3, or EAS_UPDATE_MESSAGE, or default timestamp.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_REL="${1:?Usage: $0 apps/mobile|apps/mobile-passengers <channel> [message]}"
CHANNEL="${2:?Usage: $0 <app> <channel> [message]}"
MESSAGE="${3:-${EAS_UPDATE_MESSAGE:-ota $(date -u +%Y-%m-%dT%H:%MZ)}}"
APP_DIR="$ROOT/$APP_REL"
if [[ ! -f "$APP_DIR/eas.json" ]]; then
  echo "Missing eas.json in $APP_DIR" >&2
  exit 1
fi
cd "$APP_DIR"
exec bunx eas-cli update --channel "$CHANNEL" --message "$MESSAGE" --non-interactive
