#!/usr/bin/env bash
# One-shot installer for save.
# Run this once: bash install.sh
# Developer/source installer using npm. For Node-free end-user installation,
# use install.sh from the standalone archive instead. Media tools run remotely.

set -e

echo "Installing save..."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but wasn't found."
  echo "Use the standalone release archive for installation without Node.js."
  exit 1
fi

# npm refuses to replace a bin owned by an existing installation. Remove only
# this package's link; never overwrite an unrelated command.
PROJECT_BIN="$(readlink -f "$(dirname "$0")/bin/save.js")"
GLOBAL_ROOT="$(npm root -g)"
REMOVE_OLD=false
for COMMAND_NAME in save; do
  if ! command -v "$COMMAND_NAME" >/dev/null 2>&1; then
    continue
  fi
  EXISTING_BIN="$(readlink -f "$(command -v "$COMMAND_NAME")")"
  case "$EXISTING_BIN" in
    "$PROJECT_BIN"|"$GLOBAL_ROOT/@opiobonniky/save/"*)
      REMOVE_OLD=true
      ;;
    *)
      echo "Cannot install: '$COMMAND_NAME' already belongs to another program:"
      echo "  $EXISTING_BIN"
      echo "Remove that program explicitly, then run this installer again."
      echo "Refusing to use npm --force because it could overwrite unrelated software."
      exit 1
      ;;
  esac
done

if [ "$REMOVE_OLD" = true ]; then
  echo "Removing an older save package link..."
  npm uninstall -g @opiobonniky/save >/dev/null 2>&1 || true
fi

# Installing globally from the local folder:
# - installs the runtime dependencies beside this checkout because npm links
#   local folders rather than installing their dependencies globally
# - registers save on PATH
npm install --omit=dev
npm install -g .

echo ""
echo "Installed. Try it from anywhere:"
echo "  save <url>"
