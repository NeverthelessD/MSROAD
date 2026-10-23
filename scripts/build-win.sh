#!/bin/bash
# MSROAD Windows 빌드 — 리눅스에서 바로 만들어요 (맥 빌드 서버 필요 없음)
#   MSROAD.exe 하나 = 실행기 + 엔진 (engine/launcher_windows.go). 아이콘 · 매니페스트는 go-winres 로 넣어요.
#   → releases/MSROAD-win-<v>.zip (업데이트용: MSROAD.exe + version.txt) · releases/latest-win.json
#   → dist/MSROAD-Windows.zip (처음 설치용: MSROAD 폴더 안에 MSROAD.exe + 사용 가이드)
#
#   scripts/build-win.sh --notes "바뀐 점 1" "바뀐 점 2"
# 필요: Go 1.24+, python3, go-winres (go install github.com/tc-hib/go-winres@latest)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d ' \n' < "$ROOT/VERSION")"
NOTES=()
if [ "${1:-}" = "--notes" ]; then shift; NOTES=("$@"); fi
WIN="$ROOT/dist/win"
rm -rf "$WIN"; mkdir -p "$WIN/stage" "$WIN/MSROAD" "$ROOT/releases"

echo "▶ 엔진 테스트 · 빌드 (windows/amd64, v$VERSION)"
( cd "$ROOT/engine" && go test ./... )
WINRES="${GO_WINRES:-$(go env GOPATH)/bin/go-winres}"
( cd "$ROOT/engine" && "$WINRES" simply --arch amd64 --manifest gui --icon "$ROOT/app/AppIcon.png" \
    --product-name MSROAD --file-description "MSROAD - sheet music sorter, editor and printer" \
    --product-version "$VERSION.0" --file-version "$VERSION.0" --original-filename MSROAD.exe \
    --copyright "made by. Nevertheless_D" --out rsrc )
( cd "$ROOT/engine" && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
    go build -trimpath -ldflags "-s -w -H windowsgui -X main.build=$VERSION" -o "$WIN/stage/MSROAD.exe" . )
rm -f "$ROOT/engine/rsrc_windows_amd64.syso"
printf '%s' "$VERSION" > "$WIN/stage/version.txt"

ZIP="MSROAD-win-$VERSION.zip"
python3 "$ROOT/scripts/zipdir.py" "$WIN/stage" "$ROOT/releases/$ZIP"
python3 "$ROOT/scripts/feed.py" "$ROOT/releases/latest-win.json" "$VERSION" "$ROOT/releases/$ZIP" "${NOTES[@]+"${NOTES[@]}"}"
ls -1t "$ROOT"/releases/MSROAD-win-*.zip | tail -n +4 | xargs -r rm -f

cp "$WIN/stage/MSROAD.exe" "$WIN/MSROAD/MSROAD.exe"
[ -f "$ROOT/docs/MSROAD_Windows_사용가이드.png" ] && cp "$ROOT/docs/MSROAD_Windows_사용가이드.png" "$WIN/MSROAD/"
python3 "$ROOT/scripts/zipdir.py" "$WIN" "$ROOT/dist/MSROAD-Windows.zip" MSROAD
echo "✔ releases/$ZIP · latest-win.json · dist/MSROAD-Windows.zip"
