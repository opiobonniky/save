#!/usr/bin/env bash
# One-shot installer for vidfetch.
# Run this once: bash install.sh
# It handles the global install and PATH setup via npm. The package includes
# managed yt-dlp and ffmpeg binaries, so no system packages are required.
# The user never has to configure anything manually.

set -e

echo "Installing vidfetch..."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but wasn't found."
  echo "Install it first: https://nodejs.org (or 'sudo apt install nodejs npm')"
  exit 1
fi

# npm refuses to replace a bin owned by an older package name. Remove only
# known save-video-cli aliases; never overwrite an unrelated command.
PROJECT_BIN="$(readlink -f "$(dirname "$0")/bin/save-video-cli.js")"
GLOBAL_ROOT="$(npm root -g)"
REMOVE_OLD=false
for COMMAND_NAME in save save-video-cli save-video download-me; do
  if ! command -v "$COMMAND_NAME" >/dev/null 2>&1; then
    continue
  fi
  EXISTING_BIN="$(readlink -f "$(command -v "$COMMAND_NAME")")"
  case "$EXISTING_BIN" in
    "$PROJECT_BIN"|\
    "$GLOBAL_ROOT/download-me/bin/download-me.js"|\
    "$GLOBAL_ROOT/video-download-cli/bin/download-me.js"|\
    "$GLOBAL_ROOT/save-video-cli/bin/download-me.js"|\
    "$GLOBAL_ROOT/save-video-cli/bin/save-video-cli.js"|\
    "$GLOBAL_ROOT/@opiobonniky/download-me/bin/download-me.js"|\
    "$GLOBAL_ROOT/@opiobonniky/vidfetch/bin/save-video-cli.js"|\
    "$GLOBAL_ROOT/@opiobonniky/vidfetch/bin/download-me.js")
      REMOVE_OLD=true
      ;;
    *)
      echo "Cannot install: '$COMMAND_NAME' already belongs to another program:"
      echo "  $EXISTING_BIN"
      echo "Remove that program explicitly, then run this installer again."
      echo "Refusing to use npm --force because it could overwrite unrelated software."
      exit 1
      ;;
  esac
done

if [ "$REMOVE_OLD" = true ]; then
  echo "Removing an older vidfetch package link..."
  npm uninstall -g download-me video-download-cli save-video-cli \
    @opiobonniky/download-me @opiobonniky/vidfetch >/dev/null 2>&1 || true
fi

# Installing globally from the local folder:
# - registers save plus the existing compatibility aliases on PATH
npm install -g .

echo ""
echo "Installed. Try it from anywhere:"
echo "  save <url>"
