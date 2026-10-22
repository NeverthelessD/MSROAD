#!/bin/bash
# MSROAD 맥 빌드 (맥에서만 돌아요 — 맥 빌드 서버 scripts/ci-mac.sh 가 불러요)
#   Go 엔진(darwin/arm64) + Swift 앱 껍데기(app/shell/main.swift) → dist/MSROAD.app
#   → 앱 전체에 임시 서명(ad-hoc) → dist/MSROAD-<버전>.zip (업데이트용) · dist/MSROAD.zip (처음 설치용, 사용 가이드 포함)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d ' \n' < "$ROOT/VERSION")"
DIST="$ROOT/dist"
APP="$DIST/MSROAD.app"
rm -rf "$DIST"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "▶ 엔진 테스트 · 빌드 (darwin/arm64, v$VERSION)"
( cd "$ROOT/engine" && go test ./... )
( cd "$ROOT/engine" && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 \
    go build -trimpath -ldflags "-s -w -X main.build=$VERSION" -o "$APP/Contents/Resources/msroad-engine" . )
chmod 755 "$APP/Contents/Resources/msroad-engine"

echo "▶ 앱 껍데기 빌드 (Swift)"
xcrun swiftc --version
xcrun swiftc -O -target arm64-apple-macos12.0 \
  -o "$APP/Contents/MacOS/MSROAD" "$ROOT/app/shell/main.swift" \
  -framework AppKit -framework WebKit
chmod 755 "$APP/Contents/MacOS/MSROAD"

sed "s/__VERSION__/$VERSION/g" "$ROOT/app/Info.plist" > "$APP/Contents/Info.plist"
plutil -lint "$APP/Contents/Info.plist"
cp "$ROOT/app/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
printf '%s' "$VERSION" > "$APP/Contents/Resources/version.txt"
printf 'APPL????' > "$APP/Contents/PkgInfo"

echo "▶ 임시 서명 (ad-hoc) · 확인"
codesign --force --deep --sign - --timestamp=none "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv "$APP" 2>&1 | sed 's/^/  /'

echo "▶ 압축"
ditto -c -k --norsrc --keepParent "$APP" "$DIST/MSROAD-$VERSION.zip"
mkdir -p "$DIST/first/MSROAD"
ditto "$APP" "$DIST/first/MSROAD/MSROAD.app"
[ -f "$ROOT/docs/MSROAD_사용가이드.png" ] && cp "$ROOT/docs/MSROAD_사용가이드.png" "$DIST/first/MSROAD/"
ditto -c -k --norsrc --keepParent "$DIST/first/MSROAD" "$DIST/MSROAD.zip"

echo "▶ 업데이트 파일을 풀어도 서명이 그대로인지 확인 (앱의 업데이트 기능처럼 unzip)"
CHECK="$DIST/check"; rm -rf "$CHECK"; mkdir -p "$CHECK"
( cd "$CHECK" && unzip -q "$DIST/MSROAD-$VERSION.zip" )
codesign --verify --deep --strict "$CHECK/MSROAD.app"
[ "$(cat "$CHECK/MSROAD.app/Contents/Resources/version.txt")" = "$VERSION" ]
rm -rf "$CHECK"
echo "✔ dist/MSROAD-$VERSION.zip · dist/MSROAD.zip"
