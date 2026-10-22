> **이 파일을 읽은 Claude는 작업이 끝날 때마다 이 파일을 업데이트할 것.**
> (구조가 바뀌면 「구조」, 새로 정한 것은 「결정 사항」, 한 일·남은 일은 「진행 사항」에 적고 커밋·푸시까지 할 것)

# MSROAD — 프로젝트 노트

악보 분류 · 미리보기 macOS 앱 (Apple Silicon). made by. Nevertheless_D
사용자는 개발자가 아니에요. 한국어로 쉽게 설명하고, 터미널 사용을 요구하지 말 것. 결과물은 더블클릭으로 쓸 수 있게.

---

## 진행 사항

작업이 중간에 끊기면 아래 체크리스트에서 **처음으로 체크 안 된 항목부터** 이어서 하면 돼요.
각 단계가 끝날 때마다 커밋 · 푸시해 둡니다.

- [x] 0. 참고 앱(YTROAD · SROAD) 구조 · 업데이트 · 디자인 분석, 계획 세우기
- [x] 1. 저장소 뼈대 (이 파일, CLAUDE.md, VERSION, .gitignore)
- [x] 2. 엔진: 폴더 읽기 · 파일명 → 곡/코드/쪽 해석 · 썸네일/HEIC 변환 · 코드 붙이기(파일 이름 바꾸기) · 설정
- [x] 3. 자동 업데이트(update.go) · 실행기(launcher.sh) · Info.plist · 아이콘 · build.sh
- [x] 4. 화면: 로드/차선 탐색, 갈림길(코드 없음) 정리, 검색, 미리보기(확대·축소·화살표·전체 화면·다른 키 바로 바꾸기), 라이트/다크, 버전 배지
- [x] 5. 사용 가이드 이미지 (docs/MSROAD_사용가이드.png)
- [x] 6. 리눅스에서 Playwright로 화면 · 업데이트 흐름 테스트
- [x] 7. v1.0.0 빌드 · releases/latest.json 게시

### 다음에 할 수 있는 일
- [ ] 실제 맥에서 확인 (아래 「맥에서만 확인되는 것」) — 사용자 피드백 받기
- [ ] Windows 버전 (사용자가 나중에 요청 예정): YTROAD의 `launcher_windows.go` 방식(하나의 .exe가 실행기 겸 엔진),
      폴더 고르기는 앱 안 탐색 화면, 썸네일/HEIC 변환은 Windows 도구로 바꾸기, `releases/latest-win.json`

### 작업 기록
- 2026-10-22 v1.0.3 — 1.0.2 를 사용자 맥에서 열었는데 47917 진단 페이지가 안 열림. 원인: 실행기가 1.0.1 의 lastport(예전 무작위 주소)를
  다시 써서 엔진이 47917 이 아닌 곳에서 켜짐. 고침: 실행기는 토큰만 다시 쓰고 주소는 늘 47917, 엔진이 다른 주소에서 켜져도
  /diag 는 47917 에서 따로 연다. 또 지킴이가 SIGTERM(로그아웃·시스템 종료)을 받아도 엔진을 다시 켜던 버그 수정 —
  지킴이나 엔진이 종료 신호(TERM/INT/HUP)로 꺼지면 다시 켜지 않고, 크래시(코드 2, SEGV, KILL 등)일 때만 다시 켠다.
- 2026-10-22 v1.0.2 — 사용자: "처음부터" 연결 끊김, YTROAD·SROAD는 괜찮고 SCOREROAD부터 그랬음. 컴퓨터 사용은 거절함.
  맥 엔진 서명은 정상 확인(손상 페이지 0). 원인을 아직 모르니: ① 엔진 지킴이(supervise.go, MSROAD_SUPERVISOR=1) — 새 세션으로 떨어져
  나와 엔진을 자식으로 켜고, 비정상 종료 시 같은 포트·토큰으로 재시작(5분에 5번까지), ② 고정 포트 47917, ③ 토큰 없이 보는
  읽기 전용 진단 페이지 http://127.0.0.1:47917/diag (실행기·지킴이 기록, requests.log, 지난번 엔진 출력) — 내장 브라우저로 직접 읽을 계획,
  ④ 화면 오류를 /api/clientlog 로 기록, 새로 고침 반복 방지. 리허설 통과: SIGKILL·SIGABRT 크래시 → 1초 안에 같은 주소로 재시작,
  창은 그대로 이어짐(카드 유지), 업데이트 → 다시 시작도 지킴이와 함께 정상. 남은 일: 사용자 맥에서 /diag 읽고 진짜 원인 찾기.
  테스트 주의: `pkill -f msroad-engine` 은 내 셸 명령줄과도 맞아서 셸이 죽음 → `pkill -x msroad-engine` 사용.
- 2026-10-22 v1.0.1 — 사용자 제보: "MSROAD 엔진과 연결이 끊겼어요" 때문에 테스트 불가. 로그를 읽을 수 없어 원인 확정은 못 함.
  가장 유력한 원인: 맥 잠자기/뒤에 둔 창 때문에 10분 쉬기 타이머가 지나 엔진이 꺼짐(잠자는 시간도 세고 있었음).
  고친 것: 잠자기 시간을 빼는 90분 타이머, 끊기면 안내 화면 + 앱 다시 열면 같은 창 자동 연결, 요청 실패 시 한 번 더 시도,
  panic 기록 · 설정의 문제 기록, settings.UI 맵 동시 접근 수정, 로고를 인라인 SVG로(엔진 꺼져도 보이게).
  테스트 주의: 가짜 앱 버전이 실제 최신보다 낮으면 자동 업데이트가 진짜 맥용 엔진을 깔아 버림 → 테스트 빌드는 9.9.9 같은 높은 버전으로.
- 2026-10-22 v1.0.0 — 첫 버전. 엔진 · 화면 · 자동 업데이트 · 사용 가이드. 리눅스에서 Playwright로 화면, 코드 붙이기/되돌리기,
  여러 장 · PDF 보기, 1,500개 폴더(전체 보기 약 0.8초), 업데이트 → 다시 시작 → 되돌리기까지 확인.

## 구조

```
engine/          Go 엔진 (표준 라이브러리만). web/ 을 내장 (go:embed)
  main.go        라우트 · 설정(settings.json) · 폴더 고르기(osascript) · Finder 보기/열기 · 10분 쉬면 스스로 종료
  library.go     폴더 스캔(하위 폴더, 최대 30,000개) · 파일명 해석 parseStem · 묶기(악보 = 폴더+제목+코드, 쪽 = _1,_2)
                 · 같은 곡 키(songKey: 공백·기호 뺀 소문자) · NFD 한글 합치기(composeHangul)
  thumbs.go      썸네일(sips -Z 640) · HEIC → JPEG, 캐시 Support/cache/{thumb,full} (크기+수정시각 키 → 이름 바꿔도 재사용)
                 sips 가 없으면(리눅스) 브라우저가 읽는 원본을 그대로, PDF 는 화면에서 pdf.js 로 그림
  rename.go      코드 붙이기 / 바꾸기 / 빼기 (모든 쪽 함께, 실패하면 전부 되돌림) + 직전 1회 되돌리기
  update.go      자동 업데이트 (SROAD 것과 같음: sha256 확인, .app 교체, Support/backup 에 이전 버전, 되돌리기)
  proc_*.go      OS별 도우미 (windows 는 자리만)
  parse_test.go  파일명 해석 테스트 (build.sh 가 빌드 전에 돌림)
  web/
    index.html · css/app.css (토큰: 7 ROAD 색 --rA~--rG, 라이트/다크)
    js/core.js     API · 상태 S · 초성 검색 · 코드 정규화 · 모달/토스트
    js/main.js     왼쪽 ROAD 목록 · 가운데 카드 · 검색 · 오른쪽 클릭 · 단축키 · 2.5초마다 poll, 창 포커스/60초마다 다시 읽기
    js/viewer.js   미리보기 (확대·축소·끌기·핀치, ←→, ↑↓ 다른 키, 펼쳐 보기, 전체 화면, PDF 쪽)
    js/picker.js   코드 정하기 팝업 (A~G · ♭/♯ · 장/단조, 직접 입력, 새 파일 이름 미리보기)
    js/panels.js   폴더 고르기 · 설정 · 버전/업데이트 · 종료
    vendor/pdfjs/  PDF.js 4.10.38 (+ cmaps, standard_fonts)
app/             MSROAD.app 껍데기 (launcher.sh · Info.plist · AppIcon.svg/png/icns)
scripts/         build.sh (darwin/arm64) · zipapp.py · feed.py · guide.py (가이드 이미지 만들기)
releases/        MSROAD-x.y.z.zip · latest.json (앱이 이걸 보고 업데이트)
docs/            MSROAD_사용가이드.png · guide.html (이미지 원본, 고친 뒤 scripts/guide.py)
```

### 리눅스에서 테스트하는 법
`cd engine && go build -o /tmp/msroad .` 후 환경 변수로 실행:
`MSROAD_SUPPORT`(데이터 폴더) `MSROAD_TOKEN` `MSROAD_PORT` `MSROAD_TEST_CHOOSE`(가짜 폴더 고르기 결과) `MSROAD_APP`(가짜 .app 경로)
`MSROAD_UPDATE_URL`(로컬 latest.json) `MSROAD_NO_SIPS`. 실행기는 `MSROAD_TEST_ANYARCH=1` 이면 arm64 가 아니어도 돌아가요.
화면은 Playwright(Chromium)로. 업데이트 테스트: 리눅스 엔진을 `msroad-engine` 이름으로 넣은 가짜 MSROAD.app + HOME 을 임시 폴더로.

### 맥에서만 확인되는 것
osascript 폴더 선택 창, sips 썸네일/HEIC 변환(특히 WEBP · PDF 첫 쪽), Finder 보기, Chrome 앱 창, Gatekeeper 경고, 실제 iCloud 폴더 이름 바꾸기.

## 결정 사항

- 방식: YTROAD/SROAD와 동일. `MSROAD.app/Contents/MacOS/MSROAD` = bash 실행기 → Go 엔진을
  `~/Library/Application Support/MSROAD/bin/`에 복사해 127.0.0.1 + 무작위 토큰으로 띄우고, Chrome/Edge/Brave `--app` 창(없으면 기본 브라우저)으로 화면을 연다.
- Apple Silicon 전용 (arm64). Windows 버전은 나중에 따로 요청 예정 → 엔진은 OS 의존 부분을 분리해 둔다.
- 업데이트: 이 저장소의 `releases/latest.json`을 6시간마다 + 켤 때 확인, 자동 설치(기본 켬). 수동 '업데이트 확인' 버튼, 버전 배지, 이전 버전 되돌리기.
- 화면 모드: 시스템 설정 따르기(기본) / 라이트 / 다크.
- 사용자에게 보이는 곳(앱 화면 · 업데이트 문구 · 가이드 이미지)에는 GitHub나 저장소 이름을 쓰지 않는다. ("새 버전이 나오면 앱이 알아서 받아요")
- 지원 파일: jpg, jpeg, png, heic, heif, gif, webp, pdf
- 파일명 규칙
  - 코드 = 확장자 바로 앞의 영어 글자: 대문자 A~G + (b|#) + (m). 예) `구주의십자가보혈로Ab.jpg` → Ab, `광야를지나며F#m.jpg` → F#m
  - 영어 제목은 코드 앞에 `_`. 예) `Amazing Grace_G.jpg` → G (코드 바로 앞이 영어 알파벳이면 코드로 보지 않음)
  - 여러 장 악보는 끝에 `_1`, `_2` … 예) `주의은혜라A_1.jpg`, `주의은혜라A_2.jpg`
  - ♭/♯ 기호도 b/#로 읽어 준다.
- 코드 없는 악보에 코드를 정하면 → **파일 이름의 확장자 바로 앞에 코드를 붙인다** (여러 장이면 `_1` 앞에 붙여 모든 장을 함께 바꿈). 영어 제목이면 `_` + 코드. 바로 '되돌리기' 가능.
- '선반' 대신 쓰는 표현: **ROAD(로드)** — A ROAD ~ G ROAD 일곱 길, 길 안의 세부 코드(Ab · A · Am …)는 **차선**, 코드 없는 악보는 **갈림길**(어느 길로 갈지 정해 주길 기다리는 곳). 앱 이름 MSROAD(Music Sheet ROAD)와 맞춤.
- 화면 아래 `made by. Nevertheless_D`.
- 엔진 쉬기(1.0.1): 마지막 요청 뒤 **90분**(잠자기 시간은 빼고, 단조 시계 `time.Since(started)`) 동안 조용하면 엔진이 꺼진다.
  창은 연결이 끊기면 '잠시 쉬고 있어요' 안내를 띄우고 1초마다 다시 연결을 시도한다. 실행기는 `lastport` + `token` 으로
  **같은 주소**에 엔진을 다시 켜서 열려 있던 창이 저절로 이어지고, 그 창이 화면에 보이면(`/api/attached`) 새 창을 열지 않는다.
- 문제 기록(1.0.1): 실행기가 엔진 출력을 `engine.out`(지난번은 `engine.prev.out`)에 남기고, 엔진은 panic 을 스택과 함께
  `engine.log` 에 적는다. 다음 실행 때 '멈춘 기록이 있어요' 알림 → 설정 › 문제 기록 › 기록 복사 로 사용자가 보내 줄 수 있다.
  (Claude는 ~/Library/Application Support 를 직접 읽을 수 없음 — macOS 보호 폴더)
- 엔진 구조(1.0.2~): 실행기 → `msroad-engine`(MSROAD_SUPERVISOR=1, 지킴이, setsid) → `msroad-engine`(MSROAD_CHILD=1, 진짜 엔진).
  지킴이는 엔진 종료 코드 0(종료 버튼·오래 쉼·업데이트 재시작)이면 함께 끝나고, 그 밖에는 기록 후 재시작한다.
  기록 파일(Support 폴더): launcher.log(실행기·지킴이) · requests.log(요청·화면 문제, 크래시 직전 포함) · engine.log/engine.prev.log
  · engine.out/engine.prev.out(Go 런타임 출력) · alive/clean-exit(지난번이 어떻게 끝났는지).
- 진단 페이지 `http://127.0.0.1:47917/diag` (토큰 불필요, 읽기 전용, 토큰·악보 내용 없음). 사용자 맥은 Claude가 내장 브라우저로 직접 열어 볼 수 있다.
- 커밋 작성자: `Nevertheless_D <NeverthelessD@users.noreply.github.com>`

## 업데이트 내보내는 법 (Claude용)

1. 수정 → `VERSION` 올리기 (예: 1.0.1)
2. `scripts/build.sh --notes "바뀐 점 1" "바뀐 점 2"` (한국어, 사용자용 문구)
3. zip 과 latest.json 포함해서 커밋 → main에 푸시. 설치된 앱은 6시간 안에, 또는 버전 배지 → '업데이트 확인'으로 받음.
4. `releases/`에는 최신 zip 3개만 남긴다.
5. zip이 없거나 `version.txt`가 다른 latest.json은 절대 올리지 않는다 (앱이 둘 다 검사함).
