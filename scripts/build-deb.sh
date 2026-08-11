#!/usr/bin/env bash
# Builds a .deb package from the standalone binary.
# Requires dist/save-linux to already exist (npm run build:binary).
set -e

VERSION="$(node -p "require('./package.json').version")-1"
ARCH="amd64"
PKG_DIR="/tmp/save_${VERSION}_${ARCH}"
BINARY="dist/save-linux"

if [ ! -f "$BINARY" ]; then
  echo "Binary not found at $BINARY. Run 'npm run build:binary' first."
  exit 1
fi

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN" "$PKG_DIR/usr/local/bin"

cp "$BINARY" "$PKG_DIR/usr/local/bin/save"
chmod 755 "$PKG_DIR/usr/local/bin/save"
cp -r packaging/deb/save/DEBIAN/* "$PKG_DIR/DEBIAN/"

dpkg-deb --build --root-owner-group "$PKG_DIR"
mkdir -p dist
cp "${PKG_DIR}.deb" "dist/save_${VERSION}_${ARCH}.deb"

echo "Built: dist/save_${VERSION}_${ARCH}.deb"
echo "Install with: sudo apt install ./dist/save_${VERSION}_${ARCH}.deb"
