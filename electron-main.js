// CULINARY CITY SOKCHO - 감각 시각화 시스템 / Electron 메인 프로세스
// Next.js 정적 빌드(out/)를 앱 내부의 작은 HTTP 서버로 띄워 BrowserWindow에 보여줍니다.

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'out');
const APP_TITLE = 'CULINARY CITY SOKCHO - 감각 시각화 시스템';

let server = null; // http.Server
let serverPort = 0;
let mainWindow = null;

// ─── 파일 형식(MIME) ──────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
};

// ─── 내부 정적 서버 ───────────────────────────────────────────
function sendFile(res, filePath, statusCode) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(statusCode, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
}

function resolveRequestPath(url) {
  let reqPath;
  try {
    reqPath = decodeURIComponent(url.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (reqPath === '' || reqPath === '/') reqPath = '/index.html';

  // out/ 밖으로 나가는 경로(../)는 거부
  const resolved = path.normalize(path.join(OUT_DIR, reqPath));
  if (!resolved.startsWith(OUT_DIR + path.sep) && resolved !== OUT_DIR) return null;
  return resolved;
}

function handleRequest(req, res) {
  const target = resolveRequestPath(req.url || '/');
  if (!target) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // 후보 순서: 그대로 → .html 붙이기 → 폴더면 index.html → 404.html
  const candidates = [target, `${target}.html`, path.join(target, 'index.html')];
  const tryNext = (i) => {
    if (i >= candidates.length) {
      const notFound = path.join(OUT_DIR, '404.html');
      fs.stat(notFound, (err, st) => {
        if (!err && st.isFile()) sendFile(res, notFound, 404);
        else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        }
      });
      return;
    }
    fs.stat(candidates[i], (err, st) => {
      if (!err && st.isFile()) sendFile(res, candidates[i], 200);
      else tryNext(i + 1);
    });
  };
  tryNext(0);
}

function startServer() {
  return new Promise((resolve, reject) => {
    if (server && server.listening) {
      resolve(serverPort);
      return;
    }
    server = http.createServer(handleRequest);
    server.on('error', reject);
    // 127.0.0.1 + 포트 0: 비어 있는 포트를 운영체제가 골라 줌 (외부 접근 불가)
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });
  });
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
    serverPort = 0;
  }
}

// ─── 창 ──────────────────────────────────────────────────────
function createWindow(port) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: APP_TITLE,
    show: false, // 로딩 끝난 뒤 보여줘서 흰 화면 깜빡임 방지
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 페이지가 제목을 바꿔도 앱 제목 유지
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  // 외부 링크는 앱 안이 아니라 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('페이지 로드 실패:', code, desc, url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

// ─── 메뉴 (맥은 메뉴가 있어야 Cmd+C/V/Q 등이 동작) ───────────────
function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `${app.name} 정보` },
        { type: 'separator' },
        { role: 'hide', label: '가리기' },
        { role: 'hideOthers', label: '다른 앱 가리기' },
        { role: 'unhide', label: '모두 보기' },
        { type: 'separator' },
        { role: 'quit', label: '종료' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '오려두기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'reload', label: '새로고침' },
        { role: 'togglefullscreen', label: '전체 화면' },
        { type: 'separator' },
        { role: 'resetZoom', label: '실제 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '개발자 도구' },
      ],
    },
    {
      label: '윈도우',
      submenu: [
        { role: 'minimize', label: '최소화' },
        { role: 'zoom', label: '확대/축소' },
        { role: 'close', label: '닫기' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── 앱 생명주기 ─────────────────────────────────────────────
// 한 번에 하나만 실행
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      if (!fs.existsSync(path.join(OUT_DIR, 'index.html'))) {
        throw new Error(`빌드 결과(out/index.html)가 없습니다.\n먼저 "npm run build" 를 실행하세요.\n경로: ${OUT_DIR}`);
      }
      buildMenu();
      const port = await startServer();
      createWindow(port);
    } catch (err) {
      console.error('앱 시작 실패:', err);
      dialog.showErrorBox('앱을 시작할 수 없습니다', String(err && err.message ? err.message : err));
      app.quit();
    }
  });

  // 맥: 창을 다 닫아도 앱은 Dock에 남음. 서버는 그대로 유지(재활성화 시 바로 재사용)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      stopServer();
      app.quit();
    }
  });

  // 맥: Dock 아이콘 클릭 시 창이 없으면 다시 생성 (서버가 꺼져 있으면 다시 켬)
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        const port = await startServer();
        createWindow(port);
      } catch (err) {
        console.error('창 재생성 실패:', err);
        dialog.showErrorBox('창을 열 수 없습니다', String(err && err.message ? err.message : err));
      }
    }
  });

  app.on('before-quit', () => stopServer());
}
