# MSROAD

악보 분류 · 미리보기 (macOS · Apple Silicon) — made by. Nevertheless_D

악보 폴더를 고르면 파일 이름 끝의 코드를 읽어서 **A ROAD ~ G ROAD** 일곱 길로 나누고, 길 안에서는 Ab · A · Am 같은 세부 코드별로 보여 줘요.
코드를 못 찾은 악보는 **갈림길**에 모이고, 앱에서 코드를 정하면 파일 이름 끝에 붙여 줘요.

- **읽는 파일**: JPG · PNG · HEIC · GIF · WEBP · PDF (하위 폴더까지)
- **파일 이름**: `구주의십자가보혈로Ab.jpg` → Ab, `광야를지나며F#m.png` → F#m, `Amazing Grace_G.jpg` → G, 여러 장은 `주의은혜라A_1.jpg`, `_2.jpg`
- **찾기**: 곡 이름 · 초성(ㄱㅇㄹ) · 코드(Ab, F#m)
- **미리보기**: 확대 · 축소, ←→ 넘기기, ↑↓ 같은 곡의 다른 키, 여러 장 펼쳐 보기, 전체 화면
- **화면**: 시스템 설정 따르기(기본) / 라이트 / 다크
- **자동 업데이트**: 새 버전이 나오면 앱이 알아서 받아요. 오른쪽 위 버전 표시에서 수동 확인 · 이전 버전 되돌리기

## 설치

1. [`releases/`](releases) 폴더에서 가장 최신 `MSROAD-x.y.z.zip`을 받아 압축을 풀어요.
2. `MSROAD.app`을 **응용 프로그램** 폴더로 옮겨요. (업데이트가 동작하려면 꼭 옮겨 주세요)
3. 처음 열 때 경고가 뜨면 **시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기"**.

사용 가이드: [`docs/MSROAD_사용가이드.png`](docs/MSROAD_사용가이드.png)

앱 설정은 `~/Library/Application Support/MSROAD` 한 폴더에만 저장돼요. 지우려면 앱을 휴지통에 버리고 그 폴더도 지우면 끝이에요.

## 사용한 오픈소스

- [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) — PDF 악보 보기
- 글꼴: [Pretendard](https://github.com/orioncactus/pretendard), [Unbounded](https://github.com/googlefonts/unbounded) (SIL OFL)

## 폴더 구조

```
engine/     Go 엔진 (로컬 서버 · 폴더 읽기 · 파일 이름 해석 · 썸네일 · 코드 붙이기 · 업데이트)
engine/web/ 앱 화면 (HTML · CSS · JS · 글꼴 · PDF.js)
app/        MSROAD.app 껍데기 (실행 스크립트 · Info.plist · 아이콘)
scripts/    빌드 · 사용 가이드 이미지 스크립트
releases/   업데이트 파일 (MSROAD-x.y.z.zip · latest.json)
docs/       사용 가이드 이미지와 원본(guide.html)
```

자세한 구조 · 결정 사항 · 진행 상황은 [`PROJECT_NOTES.md`](PROJECT_NOTES.md)에 있어요.
