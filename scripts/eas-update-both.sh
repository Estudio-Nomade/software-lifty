#!/usr/bin/env bash
# Publish EAS Update to both apps on the same channel.
# Usage:
#   scripts/eas-update-both.sh production "fix: copy on home"
#   scripts/eas-update-both.sh preview
# Message: $2, or EAS_UPDATE_MESSAGE, or default timestamp.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHANNEL="${1:?Usage: $0 <channel> [message]}"
MESSAGE="${2:-${EAS_UPDATE_MESSAGE:-}}"
if [[ -n "$MESSAGE" ]]; then
  bash "$ROOT/scripts/eas-update.sh" apps/mobile "$CHANNEL" "$MESSAGE"
  bash "$ROOT/scripts/eas-update.sh" apps/mobile-passengers "$CHANNEL" "$MESSAGE"
else
  bash "$ROOT/scripts/eas-update.sh" apps/mobile "$CHANNEL"
  bash "$ROOT/scripts/eas-update.sh" apps/mobile-passengers "$CHANNEL"
fi
