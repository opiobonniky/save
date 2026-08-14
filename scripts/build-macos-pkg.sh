#!/usr/bin/env bash
# Builds an unsigned macOS installer package from the self-contained archive.
set -e

if [ "$(uname -s)" != 'Darwin' ]; then
  echo "macOS packages must be built on macOS with Apple's pkgbuild tool."
  exit 1
fi

if ! command -v pkgbuild >/dev/null 2>&1; then
  echo "pkgbuild was not found. Install the Xcode command-line tools first."
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
case "$(uname -m)" in
  x86_64) ARCH='x64' ;;
  arm64) ARCH='arm64' ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)"
    exit 1
    ;;
esac

STANDALONE="dist/save-${VERSION}-macos-${ARCH}"
PKG_ROOT="dist/.macos-pkg-root-${ARCH}"
PKG_PATH="dist/save-${VERSION}-macos-${ARCH}.pkg"

if [ ! -d "$STANDALONE" ]; then
  echo "Standalone package not found at $STANDALONE."
  echo "Run 'npm run build:standalone' first."
  exit 1
fi

rm -rf "$PKG_ROOT" "$PKG_PATH"
mkdir -p "$PKG_ROOT/usr/local/bin" "$PKG_ROOT/usr/local/lib"
chmod 755 "$PKG_ROOT" "$PKG_ROOT/usr" "$PKG_ROOT/usr/local" \
  "$PKG_ROOT/usr/local/bin" "$PKG_ROOT/usr/local/lib"

cp -a "$STANDALONE" "$PKG_ROOT/usr/local/lib/save"
rm -f "$PKG_ROOT/usr/local/lib/save/install.sh" "$PKG_ROOT/usr/local/lib/save/uninstall.sh"
find "$PKG_ROOT/usr/local/lib/save" -type d -exec chmod 755 {} +
find "$PKG_ROOT/usr/local/lib/save" -type f -exec chmod 644 {} +
chmod 755 "$PKG_ROOT/usr/local/lib/save/save" "$PKG_ROOT/usr/local/lib/save/libexec/"*
ln -s ../lib/save/save "$PKG_ROOT/usr/local/bin/save"

pkgbuild \
  --root "$PKG_ROOT" \
  --identifier com.opiobonniky.save \
  --version "$VERSION" \
  --install-location / \
  "$PKG_PATH"

pkgutil --payload-files "$PKG_PATH" >/dev/null
echo "Built: $PKG_PATH"
echo "Install with: sudo installer -pkg $PKG_PATH -target /"
