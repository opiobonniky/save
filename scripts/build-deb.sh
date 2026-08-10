#!/usr/bin/env bash
# Builds a .deb package from the standalone binary.
# Requires dist/download-me-linux to already exist (npm run build:binary).
set -e

VERSION="1.0.0-1"
ARCH="amd64"
PKG_DIR="/tmp/download-me_${VERSION}_${ARCH}"
BINARY="dist/download-me-linux"

if [ ! -f "$BINARY" ]; then
  echo "Binary not found at $BINARY. Run 'npm run build:binary' first."
  exit 1
fi

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN" "$PKG_DIR/usr/local/bin"

cp "$BINARY" "$PKG_DIR/usr/local/bin/download-me"
chmod 755 "$PKG_DIR/usr/local/bin/download-me"
cp -r packaging/deb/download-me_1.0.0-1_amd64/DEBIAN/* "$PKG_DIR/DEBIAN/"

dpkg-deb --build --root-owner-group "$PKG_DIR"
mkdir -p dist
cp "${PKG_DIR}.deb" "dist/download-me_${VERSION}_${ARCH}.deb"

echo "Built: dist/download-me_${VERSION}_${ARCH}.deb"
echo "Install with: sudo apt install ./dist/download-me_${VERSION}_${ARCH}.deb"
