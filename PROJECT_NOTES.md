> **이 파일을 읽은 Claude는 작업이 끝날 때마다 이 파일을 업데이트할 것.**
> (구조가 바뀌면 「구조」, 새로 정한 것은 「결정 사항」, 한 일·남은 일은 「진행 사항」에 적고 커밋·푸시까지 할 것)

# MSROAD — 프로젝트 노트

악보 분류 · 미리보기 · 편집 · 인쇄 앱. macOS (Apple Silicon) + Windows 10/11 (1.2.1~). made by. Nevertheless_D
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
- [x] 실제 맥(macOS 27)에서 1.1.0 실행 확인 (2026-10-22, 사용자)
- [ ] 1.2.0~1.3.0 편집 · 인쇄를 사용자 맥에서 확인 (실제 프린터 인쇄 · A3 · 양면 · 여백 글자가 프린터 인쇄 가능 영역 안에 들어가는지)
- [x] Windows 버전 1.2.1 (2026-10-23, Wine 에서 확인)
- [ ] 실제 Windows PC 에서 확인: SmartScreen, Edge 앱 창, PDF 인쇄 창(Edge PDF 보기) · Ctrl+P, 탐색기 /select, 한글 경로 · OneDrive 폴더

### 작업 기록
- 2026-10-23 v1.3.2 (맥 · Windows) — 사용자 요청: 4곡을 **한 줄에 4칸**으로도. set.grid = 'row' (frame 4 일 때만). 틀 열쇠 '1' '2' '3' '4' '4r' '0'
  (frameKey · fromKey · gridOf(set) · frameLabel · frameShort). 2×2 ↔ 한 줄은 칸 수가 같아서 자리 그대로(reflow 없음). 프리셋에도 grid 저장.
  틀 고르기 창 카드 6개(그림 조금 작게). 위쪽 도구가 1440px 창에서 한 줄에 들어가도록 간격을 줄이고, 1500px 아래에선 '글자 상자'를 아이콘만.
- 2026-10-23 v1.3.1 (맥 · Windows) — 사용자 요청: 틀에 **4곡 분할** 추가. 2줄 × 2칸(gridOf: 4 → cols 2 · rows 2, 칸 번호는 왼쪽 위부터 가로로).
  slotsOf · dividersOf(세로 · 가로 구분선) · frameLabel · 틀 고르기 창(카드 5개, 원본 대비 %) · 아이콘(.g4). A3 가로 4곡 = 원본 대비 약 46%.
- 2026-10-23 v1.3.0 (맥 · Windows) — 사용자 요청: 편집 · 인쇄 페이지 여백에 글자(예: 20261003 금요기도회) + 글자 상자.
  **여백 글자**: 위 왼쪽 · 가운데 · 오른쪽, 아래 왼쪽 · 오른쪽(아래 가운데는 페이지 번호를 끄면 쓸 수 있음). set.marks(모든 페이지) ·
  page.marks(이 페이지만, 있으면 이것을 씀) = { tl: { t, size: s|m|l, bold } }. {쪽} {전체} 는 쪽마다 바뀜. '+ 날짜'는 오늘(YYYYMMDD)을 글자로 넣음.
  여백보다 크면 글자를 줄이고, 그래도 넘치면 …. 페이지 여백을 누르면(.mz) 오른쪽 입력 칸으로. '지금 틀 저장'에 여백 글자도 함께(프리셋 marks).
  **글자 상자**: page.texts = [{ id, x, y, w(mm), t, pt, bold, align, color, bg }], 높이는 글자에 맞춰 자동. 끌어 옮기기 · 좌우 손잡이로 폭 ·
  두 번 눌러 페이지에서 바로 고치기(빈 채로 마치면 빠짐) · 크기 6~96pt · 색 4가지 · 흰 바탕(밑의 악보 가림) · 복제 · 화살표로 1mm(shift 5mm).
  화면과 PDF 가 같은 줄 나누기를 쓰도록 글자 폭은 canvas measureText(Pretendard)로 재고, PDF 에는 300dpi PNG 로 넣음(엔진 변경 없음).
  틀을 바꿔도(reflow) 글자 상자 · 이 페이지만 여백 글자는 같은 쪽에 남김. 미리보기에서 L(글자 도우미)이 가려져 'undefinedP'로 보이던 버그 고침.
- 2026-10-23 Windows 1.2.1 — 사용자 요청: 맥과 같은 기능의 Windows 버전, **HEIC 는 빼기**. YTROAD 방식:
  MSROAD.exe 하나 = 실행기 + 엔진(`--engine`), `%LOCALAPPDATA%\MSROAD` 에 엔진 복사 · Edge/Chrome `--app` 창. 폴더 고르기 · PDF 저장 위치는
  앱 안 폴더 목록(pickFolder, /api/fs/list · /api/fs/mkdir), 썸네일은 Go(gothumb.go, JPG · PNG · GIF, EXIF 회전), WEBP 는 원본 그대로,
  인쇄 = PDF 를 새 창(/api/print/file)으로 열고 Ctrl+P, 화면 글자 Finder→탐색기 · ⌘→Ctrl(core.js `L`, settings.os).
  Wine 에서 확인: 켜기, 악보 8개(HEIC 빠짐), 썸네일, 편집 → PDF 를 고른 폴더에 저장(A3 3쪽), 업데이트 1.2.1→1.2.9 교체 · 같은 주소로 재시작 · 되돌리기.
  맥 release.sh 정리 패턴을 `MSROAD-[0-9]*.zip` 으로 바꿔 Windows zip 을 지우지 않게 함.
- 2026-10-23 v1.2.1 — 사용자 요청: 악보를 늘리면 칸 밖으로 나가 잘림 → ① 칸은 그대로, 악보 크기만 칸 안에서 바뀜(넘지 않음)
  ② 가로 · 세로를 따로 늘리고 줄이기. 크기 방식: 칸에 맞추기(fit) · 칸 가득 늘리기(stretch) · 직접 조절(manual, mrect = 칸 안 자리 0~1).
  손잡이 8개(모서리 = 크기, 가장자리 = 가로나 세로만), 가로 · 세로 막대(맞춤 대비 %), 비율 유지 켜고 끄기(item.lock), '원래 비율로'.
  자유 배치도 가장자리로 한 방향만. 1.2.0 의 '칸 채우기' · 확대(zoom/ox/oy, 칸 밖은 가림)는 열 때 같은 모습의 '자르기 + 직접 조절'로 바꿈
  (migrateSet — 예전 엔진과 화면을 픽셀 비교해 같음 확인). 자르기를 적용하면 직접 조절은 칸에 맞추기로 돌아가 남은 부분이 커짐.
- 2026-10-23 v1.2.0 — **편집 · 인쇄** (사용자 요청 · 디자인 시안 확정 뒤 제작). 위쪽 '악보 보기 | 편집 · 인쇄' 전환.
  용지 A4/A3 · 세로/가로 · 여백(5/10/15mm) · 틀(1곡 · 2곡 나란히 · 3곡 나란히 · 자유 배치), 왼쪽 목록에서 끌어 놓기/두 번 누르기,
  칸끼리 자리 바꾸기, 칸에 맞추기/칸 채우기/직접 조절(확대 · 축소 막대, 트랙패드 핀치, 끌어서 위치), 자르기(빈 여백 자동 포함),
  다른 키로 바꾸기, 곡 제목 · 페이지 번호 · 칸 사이 구분선, 미리보기(매수 · 전체/지금 쪽 · 양면 · 파일 이름), 인쇄(맥 인쇄 창), PDF 저장(저장 창),
  세트(자동 저장 · 열기 · 복제 · 이름 바꾸기 · 지우기 · 바로 인쇄), 자주 쓰는 틀(프리셋), ⌘Z/⇧⌘Z. 원본 악보 파일은 바꾸지 않음.
  리눅스 Playwright 로 전 과정 + PDF 결과(pdftoppm 렌더, EXIF 회전 · PDF 악보 · 자르기 · 확대) 확인. 인쇄 창 · 저장 창은 맥 빌드 서버(--test-print)로 확인.
  릴리스 완료: 맥 빌드 서버 21/21 (P1~P4 편집 · 인쇄 포함). 사용자가 Windows 버전도 물어봄 → 가능, 맥 1.2.0 확인 뒤 진행하기로 제안.
- 2026-10-22 사용자: 1.1.0 이 macOS 27 에서 잘 실행됨을 확인. 같은 Dock 앱 구조를 SROAD(1.1.0)와 YTROAD(맥 1.2.0, Apple Silicon · Intel 겸용
  universal 껍데기)에 옮김 — 각 저장소 CLAUDE.md 참고.
  릴리스 완료: SROAD v1.1.0(실제 맥 시험 19/19), YTROAD 맥 v1.2.0(21/21, Rosetta 로 Intel 도 확인). GitHub Actions 장애로 맥 기계가
  배정되지 않은 실행이 두 번 있었음 → 워크플로 파일을 바꿔 다시 푸시하면 다시 돈다(workflow_dispatch 도 추가했지만 API 는 세션에서 막혀 있음). MSROAD 쪽 변경: release.sh 가 ci-results 를 명시적 refspec 으로 받도록 수정.
  시험용 `ci-probe` 브랜치는 사용자가 저장소 화면에서 지우기로 함(세션 권한으로는 브랜치 삭제 불가).
- 2026-10-22 v1.1.0 — **근본 해결: Dock 에 보이는 정식 맥 앱**. MSROAD.app 본체 = Swift 껍데기(app/shell/main.swift):
  Dock 아이콘 · 메뉴 · 앱 창(WKWebView, Chrome 필요 없음). 엔진(지킴이)은 이 앱의 자식이라 macOS 27 '백그라운드 앱 활동'의 예외
  ("켠 앱이 Dock 에 있음")에 해당 → 우회 없음. 1.0.2~1.0.4 의 도우미 앱 · '켜진 직후 종료 신호 무시'는 모두 없앰
  (지킴이는 이제 종료 신호를 언제나 따르고, 앱이 사라지면 엔진도 끔). 실행기 bash(app/launcher.sh)는 삭제.
  앱은 맥에서만 만들 수 있어서 **맥 빌드 서버**(.github/workflows/build-mac.yml → scripts/ci-mac.sh)가 빌드 · 임시 서명 · 실제 맥 시험(17개 항목)을 하고
  결과를 `ci-results` 브랜치에 올린다(이 세션의 프록시는 Actions 화면/API 를 막아서 결과를 git 으로 받음). 1차 시험에서 1.0.4→1.1.0
  업데이트 경로의 '끝없이 다시 열림' 버그를 잡음(NSWorkspace 가 환경 변수를 물려줌 → MSROAD_RELAUNCHED 로 막음). 좁은 창 위쪽 버튼 잘림도 수정.
  남은 것: 사용자 맥(macOS 27)에서 확인 → 괜찮으면 SROAD · YTROAD 에 같은 구조 적용. 프록시가 브랜치 삭제를 막아서 `ci-probe` 브랜치(실행 안 됨)가 남아 있음.
- 2026-10-22 (조사) macOS 27 의 원인 재검토 — 보안 구멍을 막은 게 아니라 새 기능 **'백그라운드 앱 활동(Background App Activity)'** 때문:
  앱을 종료한 뒤에도 창·메뉴 막대 아이콘·Dock 없이 계속 도는 프로세스를 사용자에게 보여 주고, 사용자가 앱별로 끌 수 있으며
  꺼져 있으면 시스템이 종료시킨다(설정 › 일반 › 로그인 항목 및 확장 프로그램 › 백그라운드 앱 활동). 예외: 그 프로세스를 켠 앱이 Dock 에 남아 있을 때.
  참고: Squirrel.Mac#336, anthropics/claude-code#95559, support.apple.com/125671.
  우리 앱(LSUIElement, 실행기가 곧바로 끝남)은 '종료된 앱이 몰래 남긴 백그라운드 작업'으로 분류된 것. 1.0.4 의 도우미 앱은 지금은 되지만
  ① 켜진 직후 SIGTERM 을 20초 무시·재시작하는 안전망은 시스템(또는 사용자의 선택)을 거스르는 우회라 없애야 하고,
  ② 도우미 앱도 사용자가 백그라운드 활동을 끄면 꺼질 수 있다.
  **근본 해결안(사용자에게 제안함, 결정 대기)**: MSROAD.app 을 Dock 에 보이는 진짜 맥 앱(작은 Swift 껍데기: Dock 아이콘·다시 열기·종료 처리,
  엔진은 그 자식으로 앱이 켜져 있는 동안만)으로 바꾼다 → 예외 규칙에 정확히 해당, 우회 없음. 빌드는 맥이 필요 → 맥 빌드 서버(CI) 가능 여부 확인 필요.
  선택: Apple 개발자 서명·공증, 정말 종료 후에도 돌아야 하면 SMAppService(사용자 승인). 그 전에 1.0.4 의 launcher.log 로 도우미 앱이 SIGTERM 을 받는지 확인할 것.
- 2026-10-22 SROAD v1.0.1 에도 같은 해결책(도우미 앱 + 지킴이 + launcher.log)을 적용함. SROAD 는 엔진(자식)도 켜진 직후 20초 동안 SIGTERM 을
  받아서 버려서 다시 켜질 필요조차 없게 했다(작업 목록을 메모리에 들고 있어서). 그때 발견: `signal.Ignore` 는 `signal.Reset` 으로 안 풀린다 → Notify 후 Reset.
  YTROAD 도 같은 실행 방식이라 macOS 27 에서 같은 문제가 날 수 있음(아직 미적용).
- 2026-10-22 v1.0.4 — **연결 끊김 진짜 원인 확인** (사용자가 보내 준 launcher.log): 맥은 macOS 27.0.1. 실행기(MSROAD.app 의 본체)가
  Chrome 창을 열고 끝나는 순간 1초 안에 시스템이 그 앱이 켠 프로세스(지킴이·엔진)에 SIGTERM 을 보낸다 — setsid 로 세션을 바꿔도 소용없음.
  1.0.2 는 지킴이가 그걸 크래시로 보고 다시 켜서 '우연히' 됐고, 1.0.3 은 그걸 고쳐서 다시 안 됐다. (YTROAD·SROAD 도 macOS 27 에서 새로 켜면 같은 문제가 날 수 있음)
  고침: ① 엔진을 Support/bin/MSROAD Engine.app(LSBackgroundOnly 도우미 앱)으로 만들어 `open -g -j -n -a … --args --env MSROAD_X=…` 로 켠다
  (LaunchServices 가 켠 별도 앱이라 MSROAD.app 이 끝나도 같이 꺼지지 않음). 엔진은 `--env` 인자를 환경 변수로 받는다.
  ② 안전망: 지킴이는 켜진 뒤 20초(graceWindow, 테스트용 MSROAD_GRACE_SEC) 안에 오는 종료 신호를 무시하고, 그 사이 엔진이 종료 신호로 꺼지면 다시 켠다.
  그 뒤의 종료 신호(로그아웃·종료)는 그대로 따른다. ③ 도우미 앱으로 8초 안에 안 켜지면 예전 방식(nohup)으로 켠다.
  리눅스에서 가짜 open(별도 세션으로 실제 실행) + 모든 엔진에 SIGTERM 을 보내는 방식으로 macOS 27 동작을 흉내 내 3회 반복 확인.
  **새 기능**(사용자 요청): 폴더마다 본 파일 목록(Support/seen/<해시>.json: 경로 + 크기|수정시각)을 저장해서, 앱을 켤 때나 다시 읽을 때 새로 들어온
  악보를 알아본다(코드를 붙여 이름만 바뀐 건 제외). 시작할 때 "지난번 이후 새 악보 N개" 알림 + '보기' → 왼쪽 NEW 목록, 카드에 '새 악보' 표시
  (그 실행 동안만). 위쪽 새로고침 버튼에 글자를 붙이고 결과(새 악보 N개 / 새로 들어온 악보가 없어요)를 알려 준다. 기존: 켤 때·창 포커스·60초마다 자동 다시 읽기.
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

## 구조 (1.1.0~ : Dock 에 보이는 맥 앱)

```
app/shell/main.swift   MSROAD.app 본체(Swift/AppKit): Dock 아이콘 · 메뉴(편집/보기/윈도우) · WKWebView 창 · 엔진 실행/종료 ·
                       Dock 다시 열기 · 업데이트 후 다시 열기(restart-requested 표시 → NSWorkspace) · launcher.log 기록
app/Info.plist         LSUIElement 없음(= Dock 에 보임), NSAllowsLocalNetworking(127.0.0.1), 자동/갑작스런 종료 끔
engine/                Go 엔진. MSROAD_SHELL=native 일 때: 쉬기(idle) 끔, 업데이트 재시작은 표시 파일만 남기고 종료
engine/supervise.go    지킴이: 엔진을 자식으로 켜고 '고장'일 때만 다시 켬. 종료 신호는 항상 따름. 부모(앱)가 사라지면 끝
scripts/build-mac.sh   (맥 전용) Go+Swift 빌드 → 번들 → codesign --deep -s - → zip 2개(업데이트용 · 처음 설치용)
scripts/smoke-mac.sh   (맥 전용) 실제 실행 시험 A~H: 켜기·화면·자식 관계·다시 열기·고장 복구·⌘Q·종료 버튼·앱 강제 종료·업데이트 재실행·1.0.4 경로
scripts/ci-mac.sh      빌드 서버 진입점: 빌드 → 시험 → ci-results 브랜치에 결과(status.json · results.txt · 스크린샷 · zip · 기록) 강제 푸시
scripts/release.sh     ci-results 가 지금 VERSION/통과인지 확인 → releases/MSROAD-<v>.zip · latest.json · dist/MSROAD.zip
scripts/build.sh       (1.1.0 부터 쓰지 않음 — 안내만 출력)
engine/pdfout.go       (1.2.0) 배치 → PDF: JPEG 은 그대로(DCTDecode) · PNG/GIF 무손실(Flate, 투명도 SMask) · EXIF 회전 · clip(자르기/칸 밖 가림) · 같은 그림은 한 번만
engine/sets.go         (1.2.0) 세트 Support/sets/<id>.json · 프리셋 _presets.json · /api/print/pdf → Support/print/<시각>/<이름>.pdf(최근 12개만)
                       · 껍데기 없을 때 대신: /api/print/open(미리보기 앱) · /api/print/save(osascript 저장 위치, 시험은 MSROAD_TEST_SAVE_DIR)
engine/web/js/studio.js (1.2.0) 편집 화면 전체. 모양 계산(mm): slotsOf/placeIn/placeFree. PDF 악보 쪽 · 곡 제목 · 쪽 번호는 화면이 300dpi 그림으로 그려 보냄
app/shell/main.swift   (1.2.0) Bridge(WKScriptMessageHandlerWithReply 'msroad'): print → NSPrintOperation(PDFKit, A3/A4 · 방향 · 매수 · 양면),
                       savePDF → NSSavePanel. Support/print 안의 .pdf 만 받음. `MSROAD --test-print <pdf> <out>` 은 시험용(창 없이 파일로 인쇄)
```
엔진 실행 사슬: MSROAD.app(Swift, Dock) → msroad-engine(지킴이, MSROAD_SUPERVISOR=1) → msroad-engine(엔진, MSROAD_CHILD=1). 주소 127.0.0.1:47917.

### Windows (1.2.1~)
```
engine/launcher_windows.go  MSROAD.exe 를 두 번 누르면: 이미 켜져 있으면 창만 → 아니면 자기 자신을 %LOCALAPPDATA%\MSROAD\bin\msroad-engine.exe 로 복사,
                            --engine 으로 숨겨 켜고(MSROAD_VIA=windows), Edge/Chrome --app 창(1380×900). 사용자의 MSROAD.exe 는 실행 중이 아니라서 업데이트가 바로 교체 가능
engine/platform.go          isWindows · uiOS()(MSROAD_FAKE_OS 로 리눅스에서 Windows 화면 시험) · noHEIC()
engine/fsapi.go             앱 안 폴더 고르기: 바탕 화면 · 문서 · 다운로드 · 사진 · 음악 · OneDrive · 드라이브(C~Z), 새 폴더
engine/gothumb.go           sips 없을 때 썸네일(JPG · PNG · GIF → JPEG, EXIF 회전). 그 밖은 원본을 그대로 보냄
engine/update.go            Windows: releases/latest-win.json → MSROAD-win-<v>.zip(MSROAD.exe + version.txt), 백업 Support/backup/MSROAD.exe
scripts/build-win.sh        리눅스에서 빌드(go-winres 아이콘) → releases/MSROAD-win-<v>.zip · latest-win.json · dist/MSROAD-Windows.zip(+ 사용 가이드)
docs/guide-win.html         Windows 사용 가이드 원본 → `python3 scripts/guide.py win`
```
Wine 시험: `apt-get install wine64 wine xvfb`, `WINEDEBUG=-all LC_ALL=C.UTF-8 xvfb-run -a env MSROAD_SUPPORT='Z:\tmp\x\sup' wine MSROAD.exe`
(Edge 가 없어 창은 안 뜨지만 엔진은 뜸 → Support\token · port 로 Playwright 접속). 업데이트 시험은 MSROAD_UPDATE_URL 에 로컬 http 서버의 latest-win.json.
끌 때는 `wineserver -k`.

### 아래는 1.0.x 시절 구조 (참고용)

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
- 엔진 구조(1.0.4~): 실행기 → `open` → `Support/bin/MSROAD Engine.app`(백그라운드 도우미 앱, 지킴이 MSROAD_SUPERVISOR=1) → `msroad-engine`(MSROAD_CHILD=1, 진짜 엔진).
  macOS 27 은 앱 본체가 끝나면 그 앱이 켠 프로세스를 SIGTERM 으로 끄기 때문에 엔진은 반드시 도우미 앱으로 따로 켠다.
  지킴이는 엔진 종료 코드 0(종료 버튼·오래 쉼·업데이트 재시작)이면 함께 끝나고, 그 밖에는 기록 후 재시작한다.
  기록 파일(Support 폴더): launcher.log(실행기·지킴이) · requests.log(요청·화면 문제, 크래시 직전 포함) · engine.log/engine.prev.log
  · engine.out/engine.prev.out(Go 런타임 출력) · alive/clean-exit(지난번이 어떻게 끝났는지).
- 진단 페이지 `http://127.0.0.1:47917/diag` (토큰 불필요, 읽기 전용, 토큰·악보 내용 없음). 사용자 맥은 Claude가 내장 브라우저로 직접 열어 볼 수 있다.
- 커밋 작성자: `Nevertheless_D <NeverthelessD@users.noreply.github.com>`

- 편집 · 인쇄 디자인(2026-10-23 확정, 시안: Design 캔버스 'MSROAD 악보 편집 · 인쇄 시안'): 기존 MSROAD 색(보라 #6c5cff, ROAD 일곱 색) ·
  Pretendard 본문 + Unbounded 로고/문구. 편집 화면 = 왼쪽 악보 목록 · 가운데 페이지(위 도구: 용지/방향/틀/여백, 아래 페이지 줄, 오른쪽 아래 확대 버튼)
  · 오른쪽 '고른 악보' 설정. 자르기는 어두운 화면, 세트 목록 · 틀 고르기 · 미리보기는 별도 화면. 기본 틀 A3 가로 · 2곡 나란히(곡마다 A4 그대로).
  칸 사이 6mm, 곡 제목 자리 8mm(글자 4.2mm), 쪽 번호 3.2mm. 세트 id 는 [a-z0-9]{6,40}.
- 세트 안의 악보는 (id, 파일 번호, PDF 쪽) + 제목 · 코드 · 폴더 · song 을 함께 저장 → 코드를 바꿔 id 가 바뀌어도 같은 곡 · 코드 · 폴더로 다시 찾음.

## 업데이트 내보내는 법 (Claude용, 1.1.0~)

1. 수정 → `VERSION` 올리기 → 커밋 · 푸시 (app/ · engine/ · VERSION 이 바뀌면 맥 빌드 서버가 자동으로 돎, 5~10분)
2. `git ls-remote origin ci-results` 가 바뀔 때까지 기다린 뒤 결과 확인:
   `git fetch origin +refs/heads/ci-results:refs/remotes/origin/ci-results && git archive origin/ci-results | tar -x -C <임시폴더>`
   → status.json(build/smoke 모두 ok), results.txt, shot-app.png 확인
3. `scripts/release.sh --notes "바뀐 점 1" "바뀐 점 2"` → 커밋 · 푸시. 처음 설치용은 dist/MSROAD.zip.
4. Windows 도 같이 낼 때: `scripts/build-win.sh --notes …` → releases/MSROAD-win-<v>.zip · latest-win.json 커밋 · 푸시. 처음 설치용은 dist/MSROAD-Windows.zip.
   맥과 Windows 는 피드가 따로라서 한쪽만 내도 돼요. 엔진/화면 공통 코드를 고쳤으면 둘 다 내는 게 좋아요.

## 업데이트 내보내는 법 (1.0.x, 참고용)

1. 수정 → `VERSION` 올리기 (예: 1.0.1)
2. `scripts/build.sh --notes "바뀐 점 1" "바뀐 점 2"` (한국어, 사용자용 문구)
3. zip 과 latest.json 포함해서 커밋 → main에 푸시. 설치된 앱은 6시간 안에, 또는 버전 배지 → '업데이트 확인'으로 받음.
4. `releases/`에는 최신 zip 3개만 남긴다.
5. zip이 없거나 `version.txt`가 다른 latest.json은 절대 올리지 않는다 (앱이 둘 다 검사함).
