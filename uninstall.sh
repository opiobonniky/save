#!/usr/bin/env bash
# Removes a dependency-free standalone installation.
set -e

TARGET_DIR="/usr/local/lib/download-me"
TARGET_LINK="/usr/local/bin/download-me"

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
  echo "download-me is not installed under /usr/local."
  exit 0
fi

as_root rm -f "$TARGET_LINK"
as_root rm -rf "$TARGET_DIR"
echo "Removed download-me and its bundled tools."
