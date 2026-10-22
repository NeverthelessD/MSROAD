#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  MSROAD — 악보 분류 · 미리보기 (macOS, Apple Silicon)
#  made by. Nevertheless_D
#
#  더블클릭하면 이 스크립트가 실행됩니다.
#  1) 앱 안의 엔진을 앱 전용 폴더로 복사하고  2) 엔진을 켠 뒤  3) 앱 화면을 창으로 엽니다.
#  악보 파일은 사용자가 고른 폴더에서 바로 읽고, 원본은 그대로 둡니다 (코드 붙이기를 할 때만 이름을 바꿔요).
# ─────────────────────────────────────────────────────────────
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/../.." && pwd)"
RES="$HERE/../Resources"
SUPPORT="$HOME/Library/Application Support/MSROAD"
BIN="$SUPPORT/bin"
BUILD="$(cat "$RES/version.txt" 2>/dev/null)"
mkdir -p "$BIN"

# 실행 기록 (문제가 생겼을 때 원인을 찾으려고 남겨요 · 설정 › 문제 기록에서 볼 수 있어요)
LOG="$SUPPORT/launcher.log"
log() {
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 262144 ]; then mv -f "$LOG" "$SUPPORT/launcher.prev.log"; fi
  printf '%s [실행기 %s] %s\n' "$(date '+%m-%d %H:%M:%S')" "$$" "$*" >> "$LOG" 2>/dev/null
}
log "시작 v$BUILD · $(sw_vers -productVersion 2>/dev/null) $(uname -m) · $APP${MSROAD_RESTART:+ (업데이트 후 다시 시작)}"

dialog() {
  osascript -e 'on run argv' \
    -e 'display dialog (item 1 of argv) with title "MSROAD" buttons {"확인"} default button 1 with icon caution' \
    -e 'end run' "$1" >/dev/null 2>&1
}

# 앱 창 열기: Chrome·Edge·Brave가 있으면 주소창 없는 "앱 창"으로, 없으면 기본 브라우저(Safari 등)로 엽니다.
open_ui() {
  local url="http://127.0.0.1:$1/?t=$2" b
  for b in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
    if [ -d "/Applications/$b.app" ] || [ -d "$HOME/Applications/$b.app" ]; then
      log "창 열기: $b (앱 창)"
      open -na "$b" --args --app="$url" --window-size=1380,900 && return
    fi
  done
  log "창 열기: 기본 브라우저"
  open "$url"
}

ping_engine() { # port token
  curl -fs -m 2 -H "x-token: $2" "http://127.0.0.1:$1/api/ping" 2>/dev/null
}

if [ "$(uname -m)" != "arm64" ] && [ -z "${MSROAD_TEST_ANYARCH:-}" ]; then
  dialog "MSROAD는 Apple Silicon(M1·M2·M3·M4…) 맥 전용이에요.
이 맥에서는 실행할 수 없어요."
  exit 1
fi

RESTART="${MSROAD_RESTART:-}"
PREF_PORT=""
TOKEN=""

# 1) 이미 실행 중이면 창만 다시 열기 (다른 버전이 켜져 있으면 끄고 새로 시작)
if [ -z "$RESTART" ] && [ -s "$SUPPORT/port" ] && [ -s "$SUPPORT/token" ]; then
  P="$(cat "$SUPPORT/port")"; T="$(cat "$SUPPORT/token")"
  R="$(ping_engine "$P" "$T")"
  case "$R" in
    *"\"build\":\"$BUILD\""*) log "이미 켜져 있음 (포트 $P) → 창만 열기"; open_ui "$P" "$T"; exit 0 ;;
    *"\"ok\":true"*)
      log "다른 버전이 켜져 있음 → 끄고 새로 시작"
      curl -fs -m 3 -X POST -H "x-token: $T" "http://127.0.0.1:$P/api/quit" >/dev/null 2>&1
      sleep 1.2 ;;
  esac
fi

# 업데이트 후 다시 시작: 같은 포트·토큰을 써서 열려 있던 창이 그대로 이어지게 합니다
if [ -n "$RESTART" ]; then
  PREF_PORT="${MSROAD_PORT:-}"
  TOKEN="${MSROAD_TOKEN:-}"
  for _ in $(seq 1 30); do
    [ -n "$PREF_PORT" ] && [ -n "$(ping_engine "$PREF_PORT" "$TOKEN")" ] || break
    sleep 0.3
  done
fi

# 2) 엔진을 앱 전용 폴더로 복사해서 실행
#    (다운로드 폴더에서 바로 실행하거나, 나중에 앱을 옮기거나 지워도 영향을 받지 않도록)
ENGINE="$BIN/msroad-engine"
if [ ! -x "$ENGINE" ] || [ "$(cat "$BIN/build" 2>/dev/null)" != "$BUILD" ]; then
  rm -f "$ENGINE.new"
  if cat "$RES/msroad-engine" > "$ENGINE.new" && chmod 755 "$ENGINE.new" && mv -f "$ENGINE.new" "$ENGINE"; then
    printf '%s' "$BUILD" > "$BIN/build"
  fi
fi
xattr -c "$ENGINE" 2>/dev/null
if [ ! -x "$ENGINE" ]; then
  dialog "😢 MSROAD를 준비하지 못했어요.
MSROAD를 응용 프로그램 폴더로 옮긴 뒤 다시 실행해 주세요."
  exit 1
fi

# 3) 엔진 켜기
#    엔진이 쉬다가 꺼졌던 거라면 지난번과 같은 주소(포트·토큰)로 켜요.
#    그러면 열어 두었던 MSROAD 창이 스스로 다시 이어져요.
#    주소는 늘 47917 (엔진이 정해요), 토큰만 지난번 것을 다시 써요.
REUSED=""
if [ -z "$RESTART" ] && [ -s "$SUPPORT/token" ]; then
  TOKEN="$(cat "$SUPPORT/token")"
  REUSED=1
fi
WAIT=""; { [ -n "$RESTART" ] || [ -n "$REUSED" ]; } && WAIT=1
[ -n "$TOKEN" ] || TOKEN="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 32)"
rm -f "$SUPPORT/port"
MSROAD_TOKEN="$TOKEN" MSROAD_SUPPORT="$SUPPORT" MSROAD_APP="$APP" MSROAD_PORT="$PREF_PORT" MSROAD_RESTART="$RESTART" \
  MSROAD_SUPERVISOR=1 MSROAD_PORT_WAIT="$WAIT" \
  nohup "$ENGINE" > /dev/null 2>&1 < /dev/null &
disown
log "엔진 지킴이 켬 (pid $!, 원하는 포트 ${PREF_PORT:-기본})"

for _ in $(seq 1 75); do [ -s "$SUPPORT/port" ] && break; sleep 0.2; done
if [ ! -s "$SUPPORT/port" ]; then
  log "⚠️ 15초 안에 엔진이 준비되지 않음"
  dialog "😢 MSROAD를 시작하지 못했어요. 앱을 다시 실행해 보세요.
계속 안 되면 컴퓨터를 재시동한 뒤 시도해 주세요."
  exit 1
fi
PORT="$(cat "$SUPPORT/port")"
log "엔진 준비됨 (포트 $PORT)"

# 4) 앱 창 열기 (다시 시작이고 같은 포트라면 열려 있던 창이 스스로 새로고침해요)
if [ -n "$RESTART" ] && [ "$PORT" = "$PREF_PORT" ]; then
  exit 0
fi
# 쉬고 있던 창이 화면에 열려 있었다면 그 창이 저절로 이어지니까, 새 창은 열지 않아요
if [ -n "$REUSED" ]; then
  for _ in 1 2 3 4 5 6 7 8; do
    sleep 0.2
    case "$(curl -fs -m 1 -H "x-token: $TOKEN" "http://127.0.0.1:$PORT/api/attached" 2>/dev/null)" in
      *'"visible":true'*) log "열려 있던 창이 다시 이어짐 → 새 창은 열지 않음"; exit 0 ;;
    esac
  done
fi
open_ui "$PORT" "$TOKEN"
exit 0
