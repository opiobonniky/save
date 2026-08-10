#!/usr/bin/env bash
# Removes download-me. Does NOT remove yt-dlp/ffmpeg/aria2c, since those
# are general-purpose tools the user may rely on for other things.
set -e

TARGET="/usr/local/bin/download-me"

command_exists() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    echo "✗ Need root privileges to remove $TARGET, and 'sudo' isn't available."
    exit 1
  fi
}

if [ ! -f "$TARGET" ]; then
  echo "download-me doesn't appear to be installed at $TARGET — nothing to do."
  exit 0
fi

as_root rm -f "$TARGET"
echo "Removed $TARGET."
echo ""
echo "yt-dlp, ffmpeg, and aria2c were left installed, since other tools may use them."
echo "Remove them manually if you no longer need them, e.g.: sudo apt remove yt-dlp ffmpeg aria2c"
