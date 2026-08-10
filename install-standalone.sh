#!/usr/bin/env bash
# Installer for the STANDALONE binary — no Node.js required on this machine.
# Run this from inside the extracted project folder: bash install-standalone.sh
set -e

BINARY="dist/download-me-linux"
TARGET="/usr/local/bin/download-me"

command_exists() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    echo "✗ Need root privileges to install to $TARGET, and 'sudo' isn't available."
    echo "  Re-run this script as root, or install 'sudo' first."
    exit 1
  fi
}

OS="$(uname -s)"
ARCH="$(uname -m)"
if [ "$OS" != "Linux" ] || [ "$ARCH" != "x86_64" ]; then
  echo "✗ dist/download-me-linux is a Linux x86_64 binary — detected ${OS}/${ARCH}, which isn't supported."
  echo "  Build one for your platform: npm run build:binary (see package.json 'pkg' targets)."
  exit 1
fi

if [ ! -f "$BINARY" ]; then
  echo "Binary not found at $BINARY."
  echo "Build it first with: npm run build:binary  (requires Node.js on the BUILD machine only)"
  exit 1
fi

if [ "$(wc -c < "$BINARY")" -lt 1000000 ]; then
  echo "✗ $BINARY looks incomplete or corrupted (too small). Rebuild it before installing."
  exit 1
fi

echo "Installing download-me (standalone, no Node.js needed)..."

as_root cp "$BINARY" "$TARGET"
as_root chmod +x "$TARGET"

echo "Installed to $TARGET"

# Install yt-dlp and ffmpeg automatically, same as the npm path.
bash "$(dirname "$0")/scripts/install-deps.sh"

echo ""
echo "Done. Try it from anywhere:"
echo "  download-me <url>"
