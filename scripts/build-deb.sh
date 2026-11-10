#!/usr/bin/env bash
# Builds a self-contained .deb package from the dependency-free standalone
# backend client with embedded runtime; media tools run only on the server.
set -e

VERSION="$(node -p "require('./package.json').version")"
PKG_VER="${VERSION}-1"
ARCH="amd64"
PKG_DIR="/tmp/save_${PKG_VER}_${ARCH}"
STANDALONE="dist/save-${VERSION}-linux-x64"

if [ ! -d "$STANDALONE" ]; then
  echo "Standalone package not found at $STANDALONE."
  echo "Run 'npm run build:standalone' first."
  exit 1
fi

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN" "$PKG_DIR/usr/bin" "$PKG_DIR/usr/lib"
chmod 755 "$PKG_DIR" "$PKG_DIR/DEBIAN" "$PKG_DIR/usr" "$PKG_DIR/usr/bin" "$PKG_DIR/usr/lib"

# The backend-only executable is installed under /usr/lib/save.
cp -a "$STANDALONE" "$PKG_DIR/usr/lib/save"
rm -f "$PKG_DIR/usr/lib/save/install.sh" "$PKG_DIR/usr/lib/save/uninstall.sh"
find "$PKG_DIR/usr/lib/save" -type d -exec chmod 755 {} +
find "$PKG_DIR/usr/lib/save" -type f -exec chmod 644 {} +
chmod 755 "$PKG_DIR/usr/lib/save/save"
ln -s ../lib/save/save "$PKG_DIR/usr/bin/save"

cp -r packaging/deb/save/DEBIAN/* "$PKG_DIR/DEBIAN/"
sed -i "s/^Version: .*/Version: ${PKG_VER}/" "$PKG_DIR/DEBIAN/control"

dpkg-deb --build --root-owner-group "$PKG_DIR"
mkdir -p dist
cp "${PKG_DIR}.deb" "dist/save_${PKG_VER}_${ARCH}.deb"

echo "Built: dist/save_${PKG_VER}_${ARCH}.deb"
echo "Install with: sudo apt install ./dist/save_${PKG_VER}_${ARCH}.deb"
echo "Backend client: no Node.js or local media tools required."
