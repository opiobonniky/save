#!/usr/bin/env bash
# Removes a dependency-free standalone installation.
set -e

TARGET_DIR="/usr/local/lib/save-video-cli"
TARGET_LINK="/usr/local/bin/save-video-cli"
SAVE_LINK="/usr/local/bin/save"
SHORT_LINK="/usr/local/bin/save-video"
LEGACY_LINK="/usr/local/bin/download-me"

command_exists() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    echo "Root privileges are needed to remove the installation."
    exit 1
  fi
}

if [ ! -e "$TARGET_LINK" ] && [ ! -d "$TARGET_DIR" ]; then
  echo "vidfetch is not installed under /usr/local."
  exit 0
fi

as_root rm -f "$TARGET_LINK"
as_root rm -f "$SAVE_LINK"
as_root rm -f "$SHORT_LINK"
as_root rm -f "$LEGACY_LINK"
as_root rm -rf "$TARGET_DIR"
echo "Removed vidfetch and its bundled tools."
