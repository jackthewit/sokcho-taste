# TODO — macOS 버전 빌드 설정

- [x] (철회) A안 디자인 리뉴얼 — 사용자 요청으로 취소, 코드 변경 없음
- [x] `package.json`에 `mac`(dmg, universal) 설정 및 `electron:build:mac` 스크립트 추가
- [x] Mac 아이콘 `build/icon.png`(1024×1024) 생성 (`app/favicon.ico` 256px에서 확대)
- [x] GitHub Actions 워크플로 `.github/workflows/build-mac.yml` 추가
- [ ] 실제 `.dmg` 빌드 및 Mac 실행 확인 (Mac 또는 GitHub Actions 필요)
