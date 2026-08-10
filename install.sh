#!/usr/bin/env bash
# One-shot installer for download-me.
# Run this once: bash install.sh
# It handles everything — global install, PATH setup (via npm), and
# automatic installation of yt-dlp/ffmpeg.
# The user never has to configure anything manually.

set -e

echo "Installing download-me..."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but wasn't found."
  echo "Install it first: https://nodejs.org (or 'sudo apt install nodejs npm')"
  exit 1
fi

# npm refuses to replace a bin owned by an older package name. Remove only
# known download-me installations; never force-overwrite an unrelated command.
if command -v download-me >/dev/null 2>&1; then
  EXISTING_BIN="$(readlink -f "$(command -v download-me)")"
  PROJECT_BIN="$(readlink -f "$(dirname "$0")/bin/download-me.js")"
  GLOBAL_ROOT="$(npm root -g)"

  case "$EXISTING_BIN" in
    "$PROJECT_BIN"|\
    "$GLOBAL_ROOT/download-me/bin/download-me.js"|\
    "$GLOBAL_ROOT/video-download-cli/bin/download-me.js"|\
    "$GLOBAL_ROOT/save-video-cli/bin/download-me.js"|\
    "$GLOBAL_ROOT/@opiobonniky/download-me/bin/download-me.js"|\
    "$GLOBAL_ROOT/@opiobonniky/vidfetch/bin/download-me.js")
      echo "Removing an older download-me package link..."
      npm uninstall -g download-me video-download-cli save-video-cli \
        @opiobonniky/download-me @opiobonniky/vidfetch >/dev/null 2>&1 || true
      ;;
    *)
      echo "Cannot install: 'download-me' already belongs to another program:"
      echo "  $EXISTING_BIN"
      echo "Remove that program explicitly, then run this installer again."
      echo "Refusing to use npm --force because it could overwrite unrelated software."
      exit 1
      ;;
  esac
fi

# Installing globally from the local folder:
# - registers the 'download-me' command on PATH automatically (npm's "bin" field)
npm install -g .

# Keep system package installation explicit rather than hiding sudo/apt calls
# inside npm's postinstall lifecycle.
bash "$(dirname "$0")/scripts/install-deps.sh"

echo ""
echo "Installed. Try it from anywhere:"
echo "  download-me <url>"
