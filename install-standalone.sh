#!/usr/bin/env bash
# Optional installer for an extracted Linux or macOS dependency-free archive.
set -e

SOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TARGET_DIR="/usr/local/lib/download-me"
TARGET_LINK="/usr/local/bin/download-me"

command_exists() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    echo "Root privileges are needed to install under /usr/local."
    echo "You can run $SOURCE_DIR/download-me directly without installing it."
    exit 1
  fi
}

case "$(uname -s)" in
  Linux|Darwin) ;;
  *)
    echo "This installer supports Linux and macOS. On Windows, run download-me.exe directly."
    exit 1
    ;;
esac

for executable in download-me libexec/yt-dlp libexec/ffmpeg libexec/ffprobe libexec/deno; do
  if [ ! -x "$SOURCE_DIR/$executable" ]; then
    echo "Missing bundled executable: $executable"
    echo "Run this installer from inside an extracted dependency-free archive."
    exit 1
  fi
done

echo "Installing the self-contained download-me application..."
as_root mkdir -p "$TARGET_DIR" /usr/local/bin
if [ "$SOURCE_DIR" != "$TARGET_DIR" ]; then
  as_root cp -R "$SOURCE_DIR/." "$TARGET_DIR/"
fi
as_root chmod +x "$TARGET_DIR/download-me" "$TARGET_DIR/libexec/"*
as_root ln -sf "$TARGET_DIR/download-me" "$TARGET_LINK"

echo "Installed to $TARGET_DIR"
echo "Run: download-me <url>"
