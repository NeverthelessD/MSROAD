#!/bin/bash
# MSROAD 빌드 스크립트 — MSROAD.app(Apple Silicon)을 만들고
# 업데이트용 releases/MSROAD-<버전>.zip 과 releases/latest.json 을 씁니다.
#
#   scripts/build.sh                                  # VERSION 파일의 버전으로 빌드
#   scripts/build.sh --notes "바뀐 점 1" "바뀐 점 2"   # 업데이트 안내 문구 (사용자에게 보여요)
#
# 필요: Go 1.24+, python3. Linux/macOS 어디서든 크로스 빌드됩니다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d ' \n' < "$ROOT/VERSION")"
NOTES=()
if [ "${1:-}" = "--notes" ]; then shift; NOTES=("$@"); fi

DIST="$ROOT/dist"
APP="$DIST/MSROAD.app"
rm -rf "$DIST"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$ROOT/releases"

echo "▶ 테스트"
( cd "$ROOT/engine" && go test ./... >/dev/null )

echo "▶ 엔진 빌드 (darwin/arm64, v$VERSION)"
( cd "$ROOT/engine" && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 \
    go build -trimpath -ldflags "-s -w -X main.build=$VERSION" -o "$APP/Contents/Resources/msroad-engine" . )
chmod 755 "$APP/Contents/Resources/msroad-engine"

cp "$ROOT/app/launcher.sh" "$APP/Contents/MacOS/MSROAD"
chmod 755 "$APP/Contents/MacOS/MSROAD"
sed "s/__VERSION__/$VERSION/g" "$ROOT/app/Info.plist" > "$APP/Contents/Info.plist"
cp "$ROOT/app/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
printf '%s' "$VERSION" > "$APP/Contents/Resources/version.txt"
printf 'APPL????' > "$APP/Contents/PkgInfo"

ZIP="MSROAD-$VERSION.zip"
python3 "$ROOT/scripts/zipapp.py" "$DIST" "MSROAD.app" "$ROOT/releases/$ZIP"
python3 "$ROOT/scripts/feed.py" "$ROOT/releases/latest.json" "$VERSION" "$ROOT/releases/$ZIP" "${NOTES[@]+"${NOTES[@]}"}"

# 처음 설치용: MSROAD 폴더 안에 앱 + 사용 가이드
mkdir -p "$DIST/first/MSROAD"
cp -R "$APP" "$DIST/first/MSROAD/"
if [ -f "$ROOT/docs/MSROAD_사용가이드.png" ]; then cp "$ROOT/docs/MSROAD_사용가이드.png" "$DIST/first/MSROAD/"; fi
python3 "$ROOT/scripts/zipapp.py" "$DIST/first" "MSROAD" "$DIST/MSROAD.zip"

# releases/ 에는 최신 zip 3개만 남겨요
ls -1t "$ROOT"/releases/MSROAD-*.zip 2>/dev/null | tail -n +4 | xargs -r rm -f
echo "✔ releases/$ZIP · releases/latest.json · dist/MSROAD.zip (처음 설치용)"
