#!/bin/bash
# MSROAD 실제 맥 시험 (맥 빌드 서버에서 dist/MSROAD.app 을 /Applications 에 깔고 여러 상황을 시험해요)
# 결과: $OUT/results.txt (PASS/FAIL 한 줄씩), 스크린샷, 기록 파일
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/ci-out}"
mkdir -p "$OUT"
APPDIR="/Applications/MSROAD.app"
SUP="$HOME/Library/Application Support/MSROAD"
RES="$OUT/results.txt"
: > "$RES"

pass() { echo "PASS  $*" | tee -a "$RES"; }
fail() { echo "FAIL  $*" | tee -a "$RES"; }
check() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }

app_pid() { pgrep -x MSROAD | head -1; }
engines() { pgrep -x msroad-engine | tr '\n' ' '; }
tok() { cat "$SUP/token" 2>/dev/null; }
port() { cat "$SUP/port" 2>/dev/null; }
ping_ok() { curl -fs -m 2 -H "x-token: $(tok)" "http://127.0.0.1:$(port)/api/ping" >/dev/null 2>&1; }
wait_ready() { for _ in $(seq 1 60); do [ -s "$SUP/port" ] && ping_ok && return 0; sleep 0.5; done; return 1; }
wait_gone() { for _ in $(seq 1 30); do [ -z "$(app_pid)" ] && [ -z "$(engines)" ] && return 0; sleep 0.5; done; return 1; }
snap() { echo "--- $1"; ps -axo pid,ppid,stat,comm | grep -E "MSROAD|msroad-engine" | grep -v grep; } >> "$OUT/procs.txt"
launch() { open "$APPDIR"; wait_ready; }

echo "▶ 준비: 앱 설치 · 시험용 악보 폴더 · 설정"
rm -rf "$APPDIR"; ditto "$ROOT/dist/MSROAD.app" "$APPDIR"
SHEETS="$HOME/MSROAD-test-sheets"; rm -rf "$SHEETS"; mkdir -p "$SHEETS"
for n in "구주의십자가보혈로Ab" "구주의십자가보혈로A" "광야를지나며F#m" "Amazing Grace_G" "주의은혜라A_1" "주의은혜라A_2" "코드없는악보"; do
  cp "$ROOT/app/AppIcon.png" "$SHEETS/$n.png"
done
mkdir -p "$SUP"
printf '{"appearance":"light","folder":"%s","recent":["%s"],"subfolders":true,"autoUpdate":false,"ui":{}}' "$SHEETS" "$SHEETS" > "$SUP/settings.json"

echo "▶ A. 켜기 · 화면"
launch; check "A1 앱을 열면 엔진이 준비됨" ping_ok
check "A2 엔진이 Dock 앱 방식으로 켜짐(shell=native)" bash -c "curl -fs -H 'x-token: $(tok)' http://127.0.0.1:$(port)/api/ping | grep -q '\"shell\":\"native\"'"
check "A3 주소가 47917" test "$(port)" = "47917"
N=$(curl -fs -H "x-token: $(tok)" "http://127.0.0.1:$(port)/api/library" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['sheets']))" 2>/dev/null)
check "A4 악보 6개를 읽음 (읽은 수: ${N:-?})" test "${N:-0}" = "6"
sleep 8
screencapture -x "$OUT/shot-app.png"
check "A5 화면이 앱 창(WKWebView)에서 열림" grep -q "MSROADShell" "$SUP/requests.log"
APID=$(app_pid); snap "A 실행 중"
# (맥의 프로그램 경로에는 빈칸이 있어서 줄 전체에서 찾아요)
SUPPID=$(ps -axo pid=,ppid=,comm= | awk -v a="$APID" '$2==a && /msroad-engine/ {print $1}' | head -1)
CHILD=$(ps -axo pid=,ppid=,comm= | awk -v s="$SUPPID" '$2==s && /msroad-engine/ {print $1}' | head -1)
check "A6 엔진이 MSROAD 앱의 자식 (앱 $APID → 지킴이 ${SUPPID:-없음} → 엔진 ${CHILD:-없음})" test -n "$SUPPID" -a -n "$CHILD"

echo "▶ B. Dock 아이콘 다시 누르기(reopen)"
osascript -e 'tell application "MSROAD" to reopen' >/dev/null 2>&1; sleep 1
check "B1 다시 열기 뒤에도 앱·엔진 그대로" test "$(app_pid)" = "$APID"

echo "▶ C. 엔진이 고장으로 꺼지면 지킴이가 다시 켬"
kill -SEGV "$CHILD" 2>/dev/null; sleep 4
check "C1 엔진 다시 켜짐" ping_ok
check "C2 앱은 그대로" test "$(app_pid)" = "$APID"

echo "▶ P. 편집 · 인쇄 (세트 저장 · PDF 만들기 · 인쇄)"
API="http://127.0.0.1:$(port)"
SID=$(curl -fs -H "x-token: $(tok)" "$API/api/library" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sheets'][0]['id'])")
python3 - "$SID" > "$OUT/spec.json" <<'SPEC'
import json, sys
sid = sys.argv[1]
print(json.dumps({"name": "시험 세트", "w": 420, "h": 297, "pages": [
  {"ops": [{"type": "image", "id": sid, "p": 0, "box": [10, 10, 197, 277], "clip": [10, 10, 197, 200]},
           {"type": "image", "id": sid, "p": 0, "box": [213, 10, 197, 277]},
           {"type": "line", "line": [210, 10, 210, 287], "width": 0.3, "gray": 0.6}]},
  {"ops": [{"type": "image", "id": sid, "p": 0, "box": [100, 20, 200, 200]}]}]}))
SPEC
RESP=$(curl -fs -X POST -H "x-token: $(tok)" -H 'content-type: application/json' --data @"$OUT/spec.json" "$API/api/print/pdf")
PDF=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('path',''))" 2>/dev/null)
echo "$RESP" | head -c 300; echo
check "P1 배치를 PDF로 만듦" test -n "$PDF" -a "$(head -c 5 "$PDF" 2>/dev/null)" = "%PDF-"
[ -n "$PDF" ] && cp "$PDF" "$OUT/made.pdf"
"$APPDIR/Contents/MacOS/MSROAD" --test-print "$PDF" "$OUT/printed.pdf" > "$OUT/test-print.log" 2>&1; PRC=$?
check "P2 맥 인쇄 기능으로 인쇄됨 (파일로 인쇄, 코드 $PRC)" test "$PRC" = "0" -a -s "$OUT/printed.pdf"
curl -fs -X POST -H "x-token: $(tok)" -H 'content-type: application/json' --data '{"set":{"v":1,"id":"smoketest01","name":"시험 세트","paper":"A3","orient":"landscape","margin":10,"frame":2,"pages":[{"items":[]}]}}' "$API/api/sets/save" > /dev/null
check "P3 세트를 저장하고 다시 읽음" bash -c "curl -fs -H 'x-token: $(tok)' '$API/api/sets' | grep -q smoketest01"
sleep 1
check "P4 인쇄 시험 뒤에도 앱은 1개" test "$(pgrep -x MSROAD | wc -l | tr -d ' ')" = "1"

echo "▶ D. 앱 종료(⌘Q) → 엔진까지 모두 꺼짐"
osascript -e 'tell application "MSROAD" to quit' >/dev/null 2>&1
check "D1 앱·엔진 모두 꺼짐" wait_gone
snap "D 종료 뒤"
cp "$SUP/clean-exit" "$OUT/clean-exit-D.txt" 2>/dev/null

echo "▶ E. 화면의 '종료' 버튼(= /api/quit) → 앱도 꺼짐"
launch
curl -fs -X POST -H "x-token: $(tok)" "http://127.0.0.1:$(port)/api/quit" >/dev/null
check "E1 앱·엔진 모두 꺼짐" wait_gone

echo "▶ F. 앱이 강제로 꺼지면 엔진도 스스로 꺼짐"
launch; kill -9 "$(app_pid)"; sleep 1
check "F1 남은 엔진 없음" bash -c 'for i in $(seq 1 20); do [ -z "$(pgrep -x msroad-engine)" ] && exit 0; sleep 0.5; done; exit 1'

echo "▶ G. 업데이트 뒤 다시 열기 (/api/update/restart)"
launch; OLD=$(app_pid)
curl -fs -X POST -H "x-token: $(tok)" "http://127.0.0.1:$(port)/api/update/restart" >/dev/null
sleep 3
check "G1 새로 열린 앱이 엔진을 켬" wait_ready
NEW=$(app_pid)
check "G2 앱이 새로 열림 ($OLD → ${NEW:-없음})" test -n "$NEW" -a "$NEW" != "$OLD"
osascript -e 'tell application "MSROAD" to quit' >/dev/null 2>&1; wait_gone

echo "▶ H. 1.0.4 이하에서 업데이트된 경우 (앱 파일을 직접 실행) → 정식 방법으로 다시 열림"
MSROAD_RESTART=1 "$APPDIR/Contents/MacOS/MSROAD" >/dev/null 2>&1 &
sleep 4
check "H1 다시 열린 앱이 엔진을 켬" wait_ready
check "H2 앱 하나만 떠 있음 ($(pgrep -x MSROAD | wc -l | tr -d ' ')개)" test "$(pgrep -x MSROAD | wc -l | tr -d ' ')" = "1"
screencapture -x "$OUT/shot-after-legacy-update.png"
osascript -e 'tell application "MSROAD" to quit' >/dev/null 2>&1
check "H3 끝나면 모두 꺼짐" wait_gone

echo "▶ 기록 모으기"
for f in launcher.log requests.log engine.log engine.prev.log engine.out engine.prev.out settings.json; do
  [ -f "$SUP/$f" ] && cp "$SUP/$f" "$OUT/$f"
done
sw_vers > "$OUT/macos.txt"
echo
echo "== 결과 =="; cat "$RES"
! grep -q '^FAIL' "$RES"
