# 속초 BI 감각화 시스템 – macOS 실행 매뉴얼

Mac에서 이 앱을 실행하는 방법입니다. 방법은 두 가지이며, 처음에는 **방법 1**을 권장합니다.

## 0. 준비 (최초 1회)

1. 받은 ZIP 파일을 더블클릭해서 압축을 풉니다. (예: `~/Documents/sokcho-taste_MAC`)
2. **Node.js (LTS 버전)** 를 설치합니다.
   - https://nodejs.org 에서 LTS 버전을 받아 설치하거나,
   - Homebrew가 있다면 터미널에서 `brew install node`
3. 터미널(Terminal) 앱을 열고 설치를 확인합니다.
   ```bash
   node -v
   npm -v
   ```
   버전 번호가 출력되면 정상입니다.

> 인터넷 연결이 필요합니다. (패키지 설치 시)

## 방법 1. 바로 실행하기 (가장 간단)

터미널에서 아래 명령을 순서대로 실행합니다.

```bash
cd ~/Documents/sokcho-taste_MAC     # 압축을 푼 폴더 경로로 이동
npm install                          # 최초 1회 (수 분 소요)
npm run build                        # 웹앱 빌드 (out/ 폴더 생성)
npm run electron:dev                 # 앱 창 실행
```

- 두 번째 실행부터는 `npm install`, `npm run build` 없이 `npm run electron:dev` 만 실행하면 됩니다. (소스를 수정했다면 `npm run build` 를 다시 실행)
- 폴더 경로를 모르면 터미널에 `cd ` (뒤에 공백) 입력 후 Finder의 폴더를 터미널 창으로 끌어다 놓으면 경로가 자동 입력됩니다.

### 브라우저로 보고 싶을 때
```bash
npm run dev
```
이후 브라우저에서 http://localhost:3000 접속. 종료는 터미널에서 `Ctrl + C`.

## 방법 2. 더블클릭 앱(.app / .dmg) 만들기

```bash
cd ~/Documents/sokcho-taste_MAC
npm install
npm run electron:build:mac
```

- 완료 후 `dist/` 폴더에 `.dmg` 와 `SokchoTasteBI.app` 이 생성됩니다.
- `.dmg` 를 열고 앱을 **Applications** 폴더로 끌어다 놓으면 설치 완료입니다.
- 이후에는 Launchpad 또는 Applications에서 더블클릭으로 실행합니다.

### "확인되지 않은 개발자" 경고가 뜰 때
이 앱은 Apple 서명이 되어 있지 않아 처음 실행 시 경고가 뜹니다.
- 앱을 **우클릭(또는 Control+클릭) → 열기 → 열기** 를 선택합니다. (최초 1회)
- 그래도 안 되면: 시스템 설정 → 개인정보 보호 및 보안 → 하단의 "그래도 열기" 클릭.
- 터미널로 해결하려면:
  ```bash
  xattr -cr /Applications/SokchoTasteBI.app
  ```

## 문제 해결

| 증상 | 해결 |
|------|------|
| `command not found: npm` | Node.js 설치 후 터미널을 완전히 종료했다가 다시 엽니다. |
| 창이 뜨지만 흰 화면 / 404 | `npm run build` 를 먼저 실행했는지 확인합니다. (`out/` 폴더 필요) |
| `npm install` 중 오류 | 인터넷 연결 확인 후 `rm -rf node_modules package-lock.json` 하고 다시 `npm install` |
| Firebase 관련 기능이 동작하지 않음 | 폴더에 숨김 파일 `.env.local` 이 있는지 확인합니다. (Finder에서 `Cmd + Shift + .` 로 숨김 파일 표시) |
| 포트 3000 사용 중 (`npm run dev`) | 다른 프로그램을 종료하거나 `npx next dev -p 3001` 로 실행합니다. |
| 한글 폴더 경로에서 오류 | 영문 경로(예: `~/sokcho`)로 옮겨서 다시 시도합니다. |

## 참고
- `node_modules`, `.next`, `out`, `dist` 폴더는 포함되어 있지 않으며, 위 명령 실행 시 Mac에서 자동 생성됩니다. (Windows에서 만든 이 폴더들을 복사하지 마세요.)
- 이 매뉴얼은 macOS 12 이상, Node.js LTS 기준입니다.
