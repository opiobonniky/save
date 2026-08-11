#!/usr/bin/env bash
# Optional installer for an extracted Linux or macOS dependency-free archive.
set -e

SOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TARGET_DIR="/usr/local/lib/save"
TARGET_LINK="/usr/local/bin/save"

command_exists() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    echo "Root privileges are needed to install under /usr/local."
    echo "You can run $SOURCE_DIR/save directly without installing it."
    exit 1
  fi
}

case "$(uname -s)" in
  Linux|Darwin) ;;
  *)
    echo "This installer supports Linux and macOS. On Windows, run save.cmd."
    exit 1
    ;;
esac

for executable in save libexec/yt-dlp libexec/ffmpeg libexec/ffprobe libexec/deno; do
  if [ ! -x "$SOURCE_DIR/$executable" ]; then
    echo "Missing bundled executable: $executable"
    echo "Run this installer from inside an extracted dependency-free archive."
    exit 1
  fi
done

echo "Installing the self-contained save application..."
as_root mkdir -p "$TARGET_DIR" /usr/local/bin
if [ "$SOURCE_DIR" != "$TARGET_DIR" ]; then
  as_root cp -R "$SOURCE_DIR/." "$TARGET_DIR/"
fi
as_root chmod +x "$TARGET_DIR/save" "$TARGET_DIR/libexec/"*
as_root ln -sf "$TARGET_DIR/save" "$TARGET_LINK"

echo "Installed to $TARGET_DIR"
echo "Run: save <url>"
