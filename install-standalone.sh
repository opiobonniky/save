#!/usr/bin/env bash
# Optional installer for an extracted Linux or macOS dependency-free archive.
set -e

SOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
INSTALL_PREFIX="${SAVE_INSTALL_PREFIX:-/usr/local}"
while [ "$INSTALL_PREFIX" != '/' ] && [ "${INSTALL_PREFIX%/}" != "$INSTALL_PREFIX" ]; do
  INSTALL_PREFIX="${INSTALL_PREFIX%/}"
done
TARGET_DIR="$INSTALL_PREFIX/lib/save"
TARGET_LINK="$INSTALL_PREFIX/bin/save"
STATE_FILE="$TARGET_DIR/.installed-command-links"
STAGING_DIR="$INSTALL_PREFIX/lib/.save-install.$$"
BACKUP_DIR="$INSTALL_PREFIX/lib/.save-backup.$$"
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

if [ "$(id -u)" -eq 0 ] || [ -w "$INSTALL_PREFIX" ] || { [ ! -e "$INSTALL_PREFIX" ] && [ -w "$(dirname "$INSTALL_PREFIX")" ]; }; then
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
    echo "Root privileges are needed to install under /usr/local."
    echo "You can run $SOURCE_DIR/save directly without installing it."
    exit 1
  fi
}

resolve_link_target() {
  local link_path="$1"
  local link_target target_dir
  [ -L "$link_path" ] || return 1
  link_target="$(readlink "$link_path")" || return 1
  case "$link_target" in
    /*) ;;
    *) link_target="$(dirname "$link_path")/$link_target" ;;
  esac
  target_dir="$(CDPATH= cd -P -- "$(dirname "$link_target")" 2>/dev/null && pwd)" || return 1
  printf '%s/%s\n' "$target_dir" "$(basename "$link_target")"
}

is_our_npm_link() {
  local resolved package_dir manifest
  resolved="$(resolve_link_target "$1")" || return 1
  [ "$(basename "$resolved")" = 'save.js' ] || return 1
  package_dir="$(dirname "$(dirname "$resolved")")"
  manifest="$package_dir/package.json"
  [ -f "$manifest" ] && grep -Eq '^[[:space:]]{0,2}"name"[[:space:]]*:[[:space:]]*"@opiobonniky/save"' "$manifest"
}

is_managed_target_dir() {
  [ -f "$TARGET_DIR/.standalone-package" ] && grep -Fqx "$PACKAGE_MARKER" "$TARGET_DIR/.standalone-package" && return 0
  # Releases before the package marker was introduced used this exact layout.
  [ -x "$TARGET_DIR/save" ] && [ -x "$TARGET_DIR/libexec/yt-dlp" ] && [ -f "$TARGET_DIR/install.sh" ]
}

discover_existing_command() {
  local found='' user_shell
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != 'root' ] && command_exists sudo; then
    user_shell="${SHELL:-/bin/bash}"
    [ -x "$user_shell" ] || user_shell='/bin/sh'
    found="$(sudo -u "$SUDO_USER" -H "$user_shell" -ic 'command -v save 2>/dev/null' 2>/dev/null || true)"
  else
    found="$(command -v save 2>/dev/null || true)"
  fi
  found="${found##*$'\n'}"
  case "$found" in
    /*) printf '%s\n' "$found" ;;
  esac
}

case "$(uname -s)" in
  Linux|Darwin) ;;
  *)
    echo "This installer supports Linux and macOS. On Windows, run save.cmd."
    exit 1
    ;;
esac

for executable in save; do
  if [ ! -x "$SOURCE_DIR/$executable" ]; then
    echo "Missing bundled executable: $executable"
    echo "Run this installer from inside an extracted dependency-free archive."
    exit 1
  fi
done

if [ ! -f "$SOURCE_DIR/.standalone-package" ] || ! grep -Fqx "$PACKAGE_MARKER" "$SOURCE_DIR/.standalone-package"; then
  echo "This installer is missing its standalone package marker."
  echo "Run it from inside an official extracted archive."
  exit 1
fi

EXISTING_COMMAND="$(discover_existing_command)"
COMPATIBILITY_LINK=''

if [ -n "$EXISTING_COMMAND" ] && [ "$EXISTING_COMMAND" != "$TARGET_LINK" ]; then
  EXISTING_RAW_TARGET="$(readlink "$EXISTING_COMMAND" 2>/dev/null || true)"
  if [ "$EXISTING_RAW_TARGET" = "$TARGET_DIR/save" ] || is_our_npm_link "$EXISTING_COMMAND"; then
    COMPATIBILITY_LINK="$EXISTING_COMMAND"
  else
    echo "Cannot install because another 'save' command appears earlier in PATH:"
    echo "  $EXISTING_COMMAND"
    echo "It was not modified because it could not be verified as @opiobonniky/save."
    exit 1
  fi
fi

if [ -e "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
  RAW_TARGET="$(readlink "$TARGET_LINK" 2>/dev/null || true)"
  CURRENT_TARGET="$(resolve_link_target "$TARGET_LINK" || true)"
  if [ "$RAW_TARGET" != "$TARGET_DIR/save" ] && [ "$CURRENT_TARGET" != "$TARGET_DIR/save" ] && ! is_our_npm_link "$TARGET_LINK"; then
    echo "Cannot install because $TARGET_LINK belongs to another program."
    exit 1
  fi
fi

if [ -L "$TARGET_DIR" ]; then
  echo "Cannot install through a symlinked directory: $TARGET_DIR"
  exit 1
fi

if [ -e "$TARGET_DIR" ] && ! is_managed_target_dir; then
  echo "Cannot install because $TARGET_DIR is not a managed save installation."
  exit 1
fi

echo "Installing the self-contained save application..."
as_root mkdir -p "$INSTALL_PREFIX/lib" "$INSTALL_PREFIX/bin"
as_root rm -rf "$STAGING_DIR" "$BACKUP_DIR"
as_root mkdir -p "$STAGING_DIR"
as_root cp -R "$SOURCE_DIR/." "$STAGING_DIR/"
if [ -f "$STATE_FILE" ]; then
  as_root cp "$STATE_FILE" "$STAGING_DIR/.installed-command-links"
fi
as_root chmod +x "$STAGING_DIR/save"

if ! "$STAGING_DIR/save" --version >/dev/null; then
  as_root rm -rf "$STAGING_DIR"
  echo "Installation verification failed; the existing installation was not changed."
  exit 1
fi

if [ -d "$TARGET_DIR" ]; then
  as_root mv "$TARGET_DIR" "$BACKUP_DIR"
fi
if ! as_root mv "$STAGING_DIR" "$TARGET_DIR"; then
  [ -d "$BACKUP_DIR" ] && as_root mv "$BACKUP_DIR" "$TARGET_DIR"
  echo "Could not activate the new installation; the previous installation was restored."
  exit 1
fi
as_root rm -rf "$BACKUP_DIR"
as_root ln -sf "$TARGET_DIR/save" "$TARGET_LINK"

if [ -n "$COMPATIBILITY_LINK" ]; then
  as_root ln -sf "$TARGET_DIR/save" "$COMPATIBILITY_LINK"
  if [ ! -f "$STATE_FILE" ] || ! grep -Fqx "$COMPATIBILITY_LINK" "$STATE_FILE"; then
    printf '%s\n' "$COMPATIBILITY_LINK" | as_root tee -a "$STATE_FILE" >/dev/null
  fi
  as_root chmod 644 "$STATE_FILE"
fi

if ! "$TARGET_LINK" --version >/dev/null; then
  echo "Installation verification failed: $TARGET_LINK could not start."
  exit 1
fi

echo "Installed to $TARGET_DIR"
if [ -n "$COMPATIBILITY_LINK" ]; then
  echo "Updated older command link: $COMPATIBILITY_LINK"
fi
echo "Run: save <url>"
echo "If this shell still remembers an older command, run: hash -r"
