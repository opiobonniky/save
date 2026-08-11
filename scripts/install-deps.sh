#!/usr/bin/env bash
# Ensures yt-dlp and ffmpeg are installed, auto-installing them via
# whichever package manager is available. Used by:
#   - install-standalone.sh (when installed via the bundled binary, no Node needed)
#   - Debian/standalone build environments that need system executables
set -u

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

command_exists() { command -v "$1" >/dev/null 2>&1; }

# Use sudo only if it exists and we're not already root.
as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    echo -e "${RED}✗ Need root privileges and 'sudo' isn't available. Run as root or install sudo.${RESET}"
    return 1
  fi
}

install_pkg() {
  local pkg="$1"
  if command_exists apt-get; then
    as_root apt-get update -qq && as_root apt-get install -y "$pkg"
  elif command_exists dnf; then
    as_root dnf install -y "$pkg"
  elif command_exists pacman; then
    as_root pacman -Sy --noconfirm "$pkg"
  elif command_exists brew; then
    brew install "$pkg"
  else
    echo -e "${YELLOW}⚠ No supported package manager found. Install ${pkg} manually.${RESET}"
    return 1
  fi
}

ensure_dep() {
  local name="$1"
  local package_name="${2:-$1}"
  if command_exists "$name"; then
    echo -e "${GREEN}✓ ${name} already installed${RESET}"
    return 0
  fi

  echo -e "${YELLOW}${name} not found — installing automatically...${RESET}"
  if install_pkg "$package_name"; then
    echo -e "${GREEN}✓ ${name} installed successfully${RESET}"
  else
    echo -e "${RED}✗ Could not auto-install ${name}. Install it manually, e.g.:\n  sudo apt install ${package_name}${RESET}"
  fi
}

echo ""
echo "Setting up save dependencies..."
echo ""

ensure_dep yt-dlp
ensure_dep ffmpeg

echo ""
echo "Checking optional speed booster..."
ensure_dep aria2c aria2   # optional: multi-connection mode for large direct files

echo ""
echo "Checking YouTube JavaScript runtime..."
if command_exists deno; then
  echo -e "${GREEN}✓ Deno runtime available${RESET}"
elif command_exists node && [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ]; then
  echo -e "${GREEN}✓ Node.js 22+ runtime available${RESET}"
else
  echo -e "${YELLOW}⚠ Install Deno 2.3+ for full YouTube support: https://deno.com/${RESET}"
fi

echo ""
echo -e "${GREEN}Setup complete.${RESET} You can now run: save <url>"
echo ""
