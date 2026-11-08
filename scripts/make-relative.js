// out/ 를 복사해 모든 절대 경로(/_next, /fonts …)를 상대 경로로 바꾼 배포본을 만든다.
// 하위 경로(예: https://host/some/path/)에 올려도 동작하게 하기 위함. 사용: node scripts/make-relative.js [src] [dest]
const fs = require('fs');
const path = require('path');

const src = path.resolve(process.argv[2] || 'out');
const dest = path.resolve(process.argv[3] || 'out-relative');

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

// JS 는 건드리지 않음: Next 런타임이 자기 script src 로 경로를 알아냄
// .txt(RSC 페이로드)와 인라인 __next_f 데이터는 건드리지 않음(청크 이름 매칭에 쓰임)
const TEXT_EXT = new Set(['.html', '.css']);
let count = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    const ext = path.extname(p).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    let s = fs.readFileSync(p, 'utf8');
    const before = s;
    if (ext === '.css') {
      // CSS 는 CSS 파일 위치(_next/static/css/) 기준 상대 경로
      s = s.replace(/url\((['"]?)\/fonts\//g, 'url($1../../../fonts/');
      s = s.replace(/url\((['"]?)\/_next\/static\/media\//g, 'url($1../media/');
    } else {
      // HTML 속성(href/src)만 상대 경로로
      s = s.replace(/(href|src)="\/_next\//g, '$1="./_next/');
      s = s.replace(/(href|src)="\/fonts\//g, '$1="./fonts/');
      s = s.replace(/(href|src)="\/([a-zA-Z0-9_.~-]+\.(?:ico|svg|png|txt|html))"/g, '$1="./$2"');
    }
    if (s !== before) { fs.writeFileSync(p, s); count++; }
  }
}
walk(dest);
console.log(`상대 경로 변환 완료: ${count}개 파일 수정 → ${dest}`);

// ─── 선택: 게시 서비스가 '_'로 시작하는 최상위 이름을 허용하지 않을 때 `_next` → `nxt` 로 바꿈 ───
if (process.argv.includes('--rename-next')) {
  const from = path.join(dest, '_next'), to = path.join(dest, 'nxt');
  if (fs.existsSync(from)) fs.renameSync(from, to);
  let n = 0;
  (function walk2(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk2(p); continue; }
      if (!['.html', '.js', '.css', '.txt'].includes(path.extname(p))) continue;
      const s = fs.readFileSync(p, 'utf8');
      const r = s.split('_next/').join('nxt/');
      if (r !== s) { fs.writeFileSync(p, r); n++; }
    }
  })(dest);
  console.log(`_next → nxt 이름 변경: ${n}개 파일 수정`);
}

// ─── 선택: 게시 서비스용 정리 (구형 브라우저 폴리필 스크립트 제거, CSS 의 깨진 문자 규칙 제거) ───
if (process.argv.includes('--artifact')) {
  const idx = path.join(dest, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  html = html.replace(/<script src="[^"]*" noModule=""><\/script>/g, '');
  fs.writeFileSync(idx, html);
  const cssDir = path.join(dest, fs.existsSync(path.join(dest, 'nxt')) ? 'nxt' : '_next', 'static', 'chunks');
  for (const f of fs.readdirSync(cssDir)) {
    if (!f.endsWith('.css')) continue;
    const p = path.join(cssDir, f);
    const buf = fs.readFileSync(p);
    const cleaned = buf.toString('utf8').replace(/\.\\\[abi\\:�\\\]\{abi:�\}/g, '');
    fs.writeFileSync(p, cleaned);
  }
  console.log('게시용 정리 완료');
}
