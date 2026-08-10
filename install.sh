#!/usr/bin/env bash
# One-shot installer for download-me.
# Run this once: bash install.sh
# It handles everything — global install, PATH setup (via npm), and
# automatic installation of yt-dlp/ffmpeg (via the postinstall hook).
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
# - triggers scripts/postinstall.js automatically, which installs
#   yt-dlp and ffmpeg if they're not already present
npm install -g .

echo ""
echo "Installed. Try it from anywhere:"
echo "  download-me <url>"
