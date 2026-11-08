# 속초 BI 감각화 시스템 (SokchoTasteBI)

음식문화도시 속초 DO-ABLE 브랜드 시스템 — 맛·식감 글리프 조합, 패턴화 시연, 디지털 명함 제작 도구.

- 웹: GitHub Pages 로 자동 배포 (`main` 에 올리면 갱신)
- 데스크톱: GitHub Actions 가 맥(.dmg, 유니버설)·윈도우(설치형 .exe, 포터블 .exe)를 빌드 → Actions 탭 → 해당 실행 → Artifacts 에서 내려받기
- 인터넷 없이 동작 (폰트·글리프 모두 내장)

## 개발
```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # out/ 정적 빌드
npm run electron:dev   # 데스크톱 앱으로 실행 (build 후)
```

## 폴더
- `app/` Next.js 앱 (조합 캔버스 · 패턴화 · 명함)
- `app/lib/svgBuilder.ts` SVG 생성(화면과 다운로드가 같은 코드) · `cardLayout.ts` 명함 레이아웃 · `textFonts.ts` 한글 외곽선 변환
- `public/fonts/` SOKCHOCulinary 딩벳, 한글 글꼴(Noto Sans/Serif KR, 나눔명조, 고운바탕 — OFL)
- `electron-main.js` 데스크톱 래퍼
- `scripts/make-relative.js` 하위 경로 배포용 상대 경로 변환
