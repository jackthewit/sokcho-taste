# 구현 계획 — macOS 버전

(이전 A안 디자인 계획은 사용자 요청으로 철회됨.)

## 변경
1. `package.json`: `build.mac`(dmg, universal, 서명 생략) + `electron:build:mac` 스크립트
2. `build/icon.png`: 1024×1024 앱 아이콘
3. `.github/workflows/build-mac.yml`: macOS 러너에서 `.dmg` 생성

## 제약
- `.dmg`는 macOS에서만 빌드 가능 → Windows에서는 빌드 불가
- 코드 서명/공증 없음 → 첫 실행 시 우클릭 → 열기 필요
- `electron-main.js`는 이미 `darwin` 처리가 있어 수정 불필요
