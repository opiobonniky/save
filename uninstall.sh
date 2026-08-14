#!/usr/bin/env bash
# Removes a dependency-free standalone installation.
set -e

INSTALL_PREFIX="${SAVE_INSTALL_PREFIX:-/usr/local}"
while [ "$INSTALL_PREFIX" != '/' ] && [ "${INSTALL_PREFIX%/}" != "$INSTALL_PREFIX" ]; do
  INSTALL_PREFIX="${INSTALL_PREFIX%/}"
done
TARGET_DIR="$INSTALL_PREFIX/lib/save"
TARGET_LINK="$INSTALL_PREFIX/bin/save"
STATE_FILE="$TARGET_DIR/.installed-command-links"
PACKAGE_MARKER='@opiobonniky/save standalone'

command_exists() { command -v "$1" >/dev/null 2>&1; }

case "$INSTALL_PREFIX" in
  /|*'/../'*|*/..|*'/./'*)
    echo "Unsafe install prefix: $INSTALL_PREFIX"
    exit 1
    ;;
  /*) ;;
  *)
    echo "Install prefix must be an absolute path: $INSTALL_PREFIX"
    exit 1
    ;;
esac

if [ "$(id -u)" -eq 0 ] || [ -w "$INSTALL_PREFIX" ]; then
  NEEDS_SUDO=false
else
  NEEDS_SUDO=true
fi

as_root() {
  if [ "$NEEDS_SUDO" = false ]; then
    "$@" && return 0
  fi
  if command_exists sudo; then
    sudo "$@"
  else
    echo "Root privileges are needed to remove the installation."
    exit 1
  fi
}

is_managed_target_dir() {
  [ -f "$TARGET_DIR/.standalone-package" ] && grep -Fqx "$PACKAGE_MARKER" "$TARGET_DIR/.standalone-package" && return 0
  [ -x "$TARGET_DIR/save" ] && [ -x "$TARGET_DIR/libexec/yt-dlp" ] && [ -f "$TARGET_DIR/install.sh" ]
}

remove_managed_link() {
  local link_path="$1"
  if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$TARGET_DIR/save" ]; then
    as_root rm -f "$link_path"
  elif [ -e "$link_path" ] || [ -L "$link_path" ]; then
    echo "Preserving changed command: $link_path"
  fi
}

if [ ! -e "$TARGET_LINK" ] && [ ! -L "$TARGET_LINK" ] && [ ! -d "$TARGET_DIR" ]; then
  echo "save is not installed under /usr/local."
  exit 0
fi

if [ -L "$TARGET_DIR" ]; then
  echo "Refusing to remove symlinked directory: $TARGET_DIR"
  exit 1
fi

if [ -d "$TARGET_DIR" ] && ! is_managed_target_dir; then
  echo "Refusing to remove unrecognized directory: $TARGET_DIR"
  exit 1
fi

if [ -f "$STATE_FILE" ]; then
  while IFS= read -r compatibility_link; do
    [ -n "$compatibility_link" ] && remove_managed_link "$compatibility_link"
  done < "$STATE_FILE"
fi
remove_managed_link "$TARGET_LINK"
as_root rm -rf "$TARGET_DIR"
echo "Removed save and its bundled tools."
echo "If this shell remembers the removed command, run: hash -r"
