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
- [ ] 5. 사용 가이드 이미지 (docs/MSROAD_사용가이드.png)
- [~] 6. 리눅스에서 Playwright로 화면 · 업데이트 흐름 테스트
- [ ] 7. v1.0.0 빌드 · releases/latest.json 게시

## 구조 (예정 — 참고 앱과 같은 '스크립트형 앱')

```
engine/        Go 엔진 (표준 라이브러리만). web/ 을 내장
  main.go      라우트 · 설정 · 폴더 고르기(osascript) · Finder 보기
  library.go   폴더 스캔 · 파일명 해석 · 그룹(곡 → 악보 → 쪽)
  thumbs.go    썸네일 · HEIC/PDF 미리보기 변환 (macOS sips), 캐시
  rename.go    코드 붙이기 / 바꾸기 (파일 이름 바꾸기 + 되돌리기)
  update.go    자동 업데이트 (releases/latest.json)
  web/         화면 (index.html · css · js · 글꼴 · pdf.js)
app/           MSROAD.app 껍데기 (launcher.sh · Info.plist · 아이콘)
scripts/       build.sh · zipapp.py · feed.py
releases/      MSROAD-x.y.z.zip · latest.json (앱이 이걸 보고 업데이트)
docs/          사용 가이드 이미지
```

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
- 커밋 작성자: `Nevertheless_D <NeverthelessD@users.noreply.github.com>`

## 업데이트 내보내는 법 (Claude용)

1. 수정 → `VERSION` 올리기 (예: 1.0.1)
2. `scripts/build.sh --notes "바뀐 점 1" "바뀐 점 2"` (한국어, 사용자용 문구)
3. zip 과 latest.json 포함해서 커밋 → main에 푸시. 설치된 앱은 6시간 안에, 또는 버전 배지 → '업데이트 확인'으로 받음.
4. `releases/`에는 최신 zip 3개만 남긴다.
5. zip이 없거나 `version.txt`가 다른 latest.json은 절대 올리지 않는다 (앱이 둘 다 검사함).
