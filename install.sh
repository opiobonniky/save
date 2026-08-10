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

# Installing globally from the local folder:
# - registers the 'download-me' command on PATH automatically (npm's "bin" field)
npm install -g .

# Keep system package installation explicit rather than hiding sudo/apt calls
# inside npm's postinstall lifecycle.
bash "$(dirname "$0")/scripts/install-deps.sh"

echo ""
echo "Installed. Try it from anywhere:"
echo "  download-me <url>"
