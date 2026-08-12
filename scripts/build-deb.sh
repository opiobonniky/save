#!/usr/bin/env bash
# Builds a self-contained .deb package from the dependency-free standalone
# application. The package bundles the app runtime plus its own yt-dlp,
# ffmpeg, ffprobe, and Deno binaries, so target systems do not need those
# tools (or Node.js, Python, etc.) installed separately.
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
mkdir -p "$PKG_DIR/DEBIAN" "$PKG_DIR/usr/local/bin" "$PKG_DIR/usr/local/lib"

# App + private tools installed under /usr/local/lib/save; /usr/local/bin/save
# is a symlink to it. The application resolves its libexec tools relative to
# its own location, so the two directories must stay together.
cp -a "$STANDALONE" "$PKG_DIR/usr/local/lib/save"
chmod 755 "$PKG_DIR/usr/local/lib/save/save" "$PKG_DIR/usr/local/lib/save/libexec/"*
ln -s ../lib/save/save "$PKG_DIR/usr/local/bin/save"

cp -r packaging/deb/save/DEBIAN/* "$PKG_DIR/DEBIAN/"
sed -i "s/^Version: .*/Version: ${PKG_VER}/" "$PKG_DIR/DEBIAN/control"

dpkg-deb --build --root-owner-group "$PKG_DIR"
mkdir -p dist
cp "${PKG_DIR}.deb" "dist/save_${PKG_VER}_${ARCH}.deb"

echo "Built: dist/save_${PKG_VER}_${ARCH}.deb"
echo "Install with: sudo apt install ./dist/save_${PKG_VER}_${ARCH}.deb"
echo "Self-contained: bundles yt-dlp, ffmpeg, ffprobe, and Deno — no system media packages required."
