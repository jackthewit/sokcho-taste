// 종합 자동 테스트: 데스크톱/모바일(터치)/데스크톱 앱(Electron)에서 조합·패턴화·명함 시나리오를 반복 실행
// 사용: node scripts/e2e.js [out 폴더] [반복 횟수]
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium, _electron } = require('playwright');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || 'out');
const ROUNDS = Number(process.argv[3] || 2);
const PROJECT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sokcho-e2e-'));
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff': 'font/woff', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.ico': 'image/x-icon', '.png': 'image/png' };

const results = []; // {env, scenario, round, ok, detail}
function record(env, scenario, round, ok, detail = '') { results.push({ env, scenario, round, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} [${env}] ${scenario} #${round}${detail ? ' — ' + detail : ''}`); }
const assert = (c, m) => { if (!c) throw new Error(m); };

function serve(root, base = '/') {
  return new Promise(res => {
    const srv = http.createServer((req, r) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (!u.startsWith(base)) { r.writeHead(404); r.end(); return; }
      let p = u.slice(base.length); if (p === '') p = 'index.html';
      const f = path.join(root, p);
      fs.stat(f, (e, s) => { if (e || !s.isFile()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}${base}` }));
  });
}

// ─── 검증 도우미 ─────────────────────────────────────────
function checkSvg(file, { expectText = false, minPaths = 1 } = {}) {
  const s = fs.readFileSync(file, 'utf8');
  execFileSync('xmllint', ['--noout', file]); // XML 문법 검증
  const paths = (s.match(/<path\b/g) || []).length;
  assert(paths >= minPaths, `path 요소 ${paths}개 (${minPaths} 이상 필요)`);
  if (!expectText) assert(!/<text\b/.test(s), '외곽선 변환 안 된 <text> 남음');
  assert(!/undefined|NaN/.test(s), 'SVG 에 undefined/NaN 포함');
  return { paths, bytes: s.length };
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert(b.slice(1, 4).toString() === 'PNG', 'PNG 아님');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ─── 페이지 조작 도우미 ─────────────────────────────────
function helpers(pg, touch, electronDir) {
  const key = (l) => pg.locator(`button.keypad-key:has(.key-label:text-is("${l}"))`).first();
  const tab = (l) => pg.locator('.mode-tab', { hasText: l }).click();
  const state = async () => { await pg.waitForTimeout(80); return pg.evaluate(() => JSON.parse(localStorage.getItem('sokcho-bi-composer-v2') || 'null')); };
  const selected = async () => { const s = await state(); return s && s.layers.find(l => l.id === s.selectedId); };
  const canvasBox = () => pg.locator('svg.composer-svg').boundingBox();
  const toPx = async (x, y) => { const b = await canvasBox(); return [b.x + b.width * x / 1000, b.y + b.height * y / 1000]; };
  async function drag(x1, y1, x2, y2, steps = 8) {
    if (touch) {
      // 터치 끌기: pointer 이벤트로 흉내 (CDP 터치 → pointer 변환이 안정적이지 않아 직접 dispatch)
      // 손가락이 닿은 지점의 실제 요소에 pointerdown (글리프·크롭 손잡이 등)
      await pg.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); el && el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true })); }, [x1, y1]);
      for (let i = 1; i <= steps; i++) { const t = i / steps; await pg.evaluate(([x, y]) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true })), [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]); }
      await pg.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true })));
    } else {
      await pg.mouse.move(x1, y1); await pg.mouse.down(); await pg.mouse.move(x2, y2, { steps }); await pg.mouse.up();
    }
  }
  const fill = (label, v) => pg.locator(`.field:has(span:text-is("${label}")) :is(input,textarea)`).fill(v);
  /** 시작 대화창이 떠 있으면 이름을 넣고 시작 */
  async function boot(author = '테스터') {
    const dlg = pg.locator('.modal:has-text("새 작업 시작")');
    if (await dlg.count()) { await dlg.locator('input').first().fill(author); await dlg.locator('button', { hasText: '시작하기' }).click(); await dlg.waitFor({ state: 'detached', timeout: 15000 }); }
  }
  async function download(trigger) {
    if (electronDir) {
      // Electron: will-download 로 저장 폴더에 바로 저장되므로 새 파일이 생길 때까지 기다림
      const before = new Set(fs.readdirSync(electronDir));
      await trigger();
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const now = fs.readdirSync(electronDir).filter(f => !before.has(f) && !f.endsWith('.crdownload'));
        if (now.length) { const fp = path.join(electronDir, now[0]); const s1 = fs.statSync(fp).size; await pg.waitForTimeout(300); if (fs.statSync(fp).size === s1 && s1 > 0) return fp; }
        await pg.waitForTimeout(200);
      }
      throw new Error('Electron 다운로드 파일이 생기지 않음');
    }
    const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), trigger()]);
    const fn = path.join(TMP, `${Date.now()}-${Math.random().toString(36).slice(2)}-${d.suggestedFilename()}`);
    await d.saveAs(fn); return fn;
  }
  return { key, tab, state, selected, canvasBox, toPx, drag, fill, download, boot };
}

// ─── 시나리오 ─────────────────────────────────────────────
const scenarios = {
  // S1: 키패드 12키 전부 → 선택 순환 → +/− → 지우기
  async keypad(pg, h) {
    const keys = ['단맛', '짠맛', '매운맛', '신맛', '쓴맛', '감칠맛', '부드러움', '꾸덕함', '촉촉함', '쫀득함', '바삭함', '아삭함'];
    for (const k of keys) await h.key(k).click();
    let s = await h.state(); assert(s.layers.length === 12, `12개 추가 기대, ${s.layers.length}`);
    await h.key('단맛').click(); s = await h.state(); assert(s.layers.length === 12, '재클릭 시 추가되면 안 됨');
    await h.key('단맛').locator('.key-mini-actions span').first().click(); s = await h.state(); assert(s.layers.length === 13, '+ 로 추가');
    await h.key('단맛').locator('.key-mini-actions span').nth(1).click(); s = await h.state(); assert(s.layers.length === 12, '− 로 삭제');
    pg.once('dialog', d => d.accept().catch(() => {}));
    await h.key('지우기').click(); s = await h.state(); assert(s.layers.length === 0, '지우기');
    await pg.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); s = await h.state(); assert(s.layers.length === 12, '되돌리기로 복구');
  },
  // S2: 이동·스냅·회전·크기·키보드
  async canvasOps(pg, h) {
    await h.key('단맛').click(); await h.key('바삭함').click();
    let sel = await h.selected();
    let [sx, sy] = await h.toPx(sel.x, sel.y); let [tx, ty] = await h.toPx(506, 495);
    await h.drag(sx, sy, tx, ty); sel = await h.selected();
    assert(Math.round(sel.x) === 500 && Math.round(sel.y) === 500, `중심 스냅 기대, 실제 ${sel.x},${sel.y}`);
    // 회전 손잡이 → 정각 스냅
    await pg.locator('svg.composer-svg').scrollIntoViewIfNeeded();
    const rh = await pg.locator('.rotate-handle').boundingBox(); const b = await h.canvasBox();
    const cx = b.x + b.width * sel.x / 1000, cy = b.y + b.height * sel.y / 1000; const r = Math.hypot(rh.x + rh.width / 2 - cx, rh.y + rh.height / 2 - cy);
    const a = (-90 + 93) * Math.PI / 180;
    await h.drag(rh.x + rh.width / 2, rh.y + rh.height / 2, cx + r * Math.cos(a), cy + r * Math.sin(a)); sel = await h.selected();
    assert(Math.round(sel.rotation) === 90, `90° 스냅 기대, ${sel.rotation}`);
    // 크기 손잡이
    await pg.locator('.scale-handle').scrollIntoViewIfNeeded();
    const sh = await pg.locator('.scale-handle').boundingBox(); const before = sel.size;
    { const b2 = await h.canvasBox(); var cx2 = b2.x + b2.width * sel.x / 1000, cy2 = b2.y + b2.height * sel.y / 1000; }
    { // 중심에서 손잡이 방향으로 60px 더 바깥쪽으로 끌기
      const hx = sh.x + sh.width / 2, hy = sh.y + sh.height / 2; const d = Math.hypot(hx - cx2, hy - cy2) || 1;
      await h.drag(hx, hy, hx + (hx - cx2) / d * 60, hy + (hy - cy2) / d * 60);
    }
    sel = await h.selected();
    assert(sel.size > before, '크기 손잡이로 확대');
    // 휠: 페이지는 안 움직이고 크기만 변함
    { const b3 = await h.canvasBox(); await pg.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2); const y0 = await pg.evaluate(() => window.scrollY); const s0 = (await h.selected()).size;
      await pg.mouse.wheel(0, 300); await pg.waitForTimeout(150);
      const y1 = await pg.evaluate(() => window.scrollY); const s1 = (await h.selected()).size;
      assert(y1 === y0, `휠 시 페이지 스크롤됨 (${y0}→${y1})`); assert(s1 < s0, '휠로 크기 축소'); }
    // 키보드: 이동·복제·순서·삭제
    await pg.locator('svg.composer-svg').click({ position: { x: 40, y: 40 } }); // 빈 곳 → 선택 해제
    await pg.locator('.layer-row').first().click(); sel = await h.selected(); const x0 = sel.x;
    await pg.keyboard.press('ArrowRight'); sel = await h.selected(); assert(sel.x === x0 + 4, '방향키 이동');
    await pg.keyboard.press(process.platform === 'darwin' ? 'Meta+d' : 'Control+d'); let s = await h.state(); assert(s.layers.length === 3, '복제');
    await pg.keyboard.press('['); s = await h.state(); assert(s.layers.findIndex(l => l.id === s.selectedId) === 1, '순서 아래로');
    await pg.keyboard.press('Delete'); s = await h.state(); assert(s.layers.length === 2, '삭제');
  },
  // S3: 속성 패널·레이어 목록·배경·계절
  async inspector(pg, h) {
    await h.key('감칠맛').click(); await h.key('꾸덕함').click();
    await pg.locator('.inspector .swatch').nth(2).click(); let sel = await h.selected(); assert(sel.color !== 'auto', '색 변경');
    await pg.locator('.inspector .swatch.auto').click(); sel = await h.selected(); assert(sel.color === 'auto', '자동 색 복귀');
    await pg.locator('.prop-grid input[type=range]').nth(1).fill('45'); sel = await h.selected(); assert(sel.rotation === 45, '회전 슬라이더');
    await pg.locator('.premium-intensity-range').fill('6'); sel = await h.selected(); assert(sel.intensity === 6, '강도 6');
    // 레이어 목록 버튼: 숨기기/복제/위로/삭제
    const row = pg.locator('.layer-row').first();
    await row.locator('button[title="숨기기"]').click(); let s = await h.state(); assert(s.layers.some(l => !l.visible), '숨김');
    await row.locator('button[title="보이기"]').click();
    await row.locator('button[title="복제"]').click(); s = await h.state(); assert(s.layers.length === 3, '목록 복제');
    await pg.locator('.layer-row').nth(1).locator('button[title="위로"]').click();
    await pg.locator('.layer-row').last().locator('button[title="삭제"]').click(); s = await h.state(); assert(s.layers.length === 2, '목록 삭제');
    // 배경·계절
    await pg.locator('.control-panel-inner > .swatches .swatch').nth(2).click(); s = await h.state(); assert(s.background === '#111111', '배경 검정');
    await pg.locator('.season-tab').nth(3).click(); s = await h.state(); assert(s.season === 'winter', '계절 겨울');
    const fill = await pg.locator('svg.composer-svg .layer-path').first().getAttribute('fill'); assert(fill === '#4d373e' || fill === '#9A9A9A', `겨울 감칠맛 색 적용 (${fill})`);
  },
  // S4: 크롭 + 내보내기(전체/크롭 SVG·PNG) + 새로고침 유지
  async cropExport(pg, h) {
    await h.key('단맛').click(); await h.key('신맛').click(); await h.key('쫀득함').click();
    await pg.locator('.chip', { hasText: '크롭' }).first().click();
    await pg.locator('.chip', { hasText: '명함 9:5' }).click();
    let s = await h.state(); assert(s.crop && Math.abs(s.crop.w / s.crop.h - 1.8) < 0.01, '9:5 비율');
    // 크롭 손잡이 끌기(비율 유지)
    const hd = await pg.locator('.crop-se').boundingBox();
    await h.drag(hd.x + 12, hd.y + 12, hd.x - 60, hd.y - 60); s = await h.state(); assert(Math.abs(s.crop.w / s.crop.h - 1.8) < 0.02, '비율 유지된 크기 조절');
    // 크롭 이동
    await pg.locator('svg.composer-svg').scrollIntoViewIfNeeded();
    const c = s.crop; const [mx, my] = await h.toPx(c.x + c.w * 0.3, c.y + c.h * 0.3);
    await h.drag(mx, my, mx + 30, my + 30); const s2 = await h.state(); assert(s2.crop.x !== c.x, '크롭 이동');
    const f1 = await h.download(() => pg.locator('.export-group:has-text("전체") .svg-btn').click()); checkSvg(f1, { minPaths: 3 });
    const f2 = await h.download(() => pg.locator('.export-group:has-text("크롭 영역") .svg-btn').click()); const svg = fs.readFileSync(f2, 'utf8'); assert(/viewBox="[\d.]+ [\d.]+ [\d.]+ [\d.]+"/.test(svg) && !svg.includes('viewBox="0 0 1000 1000"'), '크롭 viewBox');
    const f3 = await h.download(() => pg.locator('.export-group:has-text("크롭 영역") .db-btn').click()); const ps = pngSize(f3); assert(ps.w === 2400 && Math.abs(ps.h - 2400 / 1.8) <= 2, `PNG 크기 ${ps.w}x${ps.h}`);
    await pg.waitForFunction(() => /저장됨/.test(document.querySelector('.save-status')?.textContent || ''), null, { timeout: 20000 });
    await pg.reload({ waitUntil: 'networkidle' }); await pg.locator('.work-info b').waitFor({ timeout: 15000 }); assert((await pg.locator('.modal').count()) === 0, '이어하기: 시작 창이 다시 뜨면 안 됨'); const s3 = await h.state(); assert(s3.layers.length === 3 && s3.crop, '새로고침 후 유지');
  },
  // S5: 패턴화 — 옷 5종 × 반복 3종, 밀도, 다운로드
  async pattern(pg, h) {
    await h.key('매운맛').click(); await h.key('아삭함').click();
    await h.tab('패턴화');
    for (const g of ['원단 샘플', '티셔츠', '앞치마', '에코백', '조끼']) {
      await pg.locator('.garment-thumb', { hasText: g }).click();
      for (const m of ['격자', '엇갈림', '거울']) {
        await pg.locator('.mode-btn', { hasText: m }).click();
        const cnt = await pg.locator('.pattern-stage svg pattern').count(); assert(cnt === 1, `${g}/${m} 패턴 정의`);
      }
    }
    await pg.locator('.pattern-side input[type=range]').fill('8');
    const f = await h.download(() => pg.locator('.pattern-side .svg-btn').click()); checkSvg(f, { minPaths: 2 });
    const t = await h.download(() => pg.locator('.pattern-side .db-btn').nth(1).click()); checkSvg(t, { minPaths: 1 });
    const p = await h.download(() => pg.locator('.pattern-side .db-btn').first().click()); const ps = pngSize(p); assert(ps.w === 2000, 'PNG 2000px');
    await h.tab('조합');
  },
  // S6: 명함 — 개인/가게 × 프리셋 4 × 바탕 3 × 글꼴 4(순환) × 로고 종류, 긴 입력, 블록 위치 임의 조합, 재단 여백, 외곽선 SVG/PNG
  async card(pg, h, round) {
    await h.key('단맛').click(); await h.key('부드러움').click();
    await h.tab('명함');
    const fonts = ['noto-sans-kr', 'noto-serif-kr', 'nanum-myeongjo', 'gowun-batang'];
    const long = round % 2 === 0;
    const preset = (l) => pg.locator(`.mode-btn:has(b:text-is("${l}"))`).click();
    await h.fill('이름', long ? '남궁민수아름다운' : '홍길동'); await h.fill('영문 이름', long ? 'Namgung Minsu Areumdaun' : 'Hong gil dong');
    await h.fill('직함', long ? '사무국장 겸 콘텐츠기획총괄' : '대표 이사');
    await h.fill('Tel (가게/사무실)', '033)636-0664'); await h.fill('H.P (휴대전화)', '010-1234-5678'); await h.fill('E-mail', long ? 'very.long.email.address@sokchoculture.or.kr' : 'hi@sokcho.kr');
    await h.fill('인스타그램', '@sokcho_food'); await h.fill('웹사이트', 'https://sokchocf.or.kr');
    await h.fill('주소 (줄바꿈 가능)', long ? '강원특별자치도 속초시 번영로 155 속초문화예술회관 별관 2층\n속초문화관광재단 문화도시센터 사무국\n(우) 24821' : '속초시 번영로 155');
    let n = 0;
    const checkFits = async (tag) => {
      const texts = await pg.locator('.card-figure:has-text("정보면") svg text').count(); assert(texts >= 4, `${tag} 텍스트 ${texts}`);
      const over = await pg.evaluate(() => { const svg = document.querySelector('.card-figure svg'); const vb = svg.viewBox.baseVal; return [...svg.querySelectorAll('text')].some(t => { const b = t.getBBox(); return b.x < -1 || b.y < -1 || b.x + b.width > vb.width + 1 || b.y + b.height > vb.height + 1; }); });
      assert(!over, `${tag} 텍스트 넘침`);
    };
    for (const kind of ['개인용', '가게용']) {
      await pg.locator('.seg button', { hasText: kind }).click();
      const orgLabel = kind === '가게용' ? '가게 이름 (로고 자리)' : '소속 (로고 자리)';
      await h.fill(orgLabel, kind === '가게용' ? (long ? '속초 아바이 바다식당 본점' : '바다식당') : (long ? '속초문화관광재단 문화도시센터' : '속초문화관광재단'));
      await h.fill('영문 소속/가게명', 'SOKCHO BADA'); await h.fill('로고 옆 짧은 문구', '물회 · 섭국 전문');
      if (kind === '가게용') await h.fill('영업시간 등 (줄바꿈 가능)', '11:00–21:00\n화요일 휴무');
      for (const pr of ['기본 · 왼쪽', '기본 · 오른쪽', '가운데', '포인트 바']) {
        await preset(pr);
        for (const bg of ['흰색', '검정', '계절색']) {
          await pg.locator('.seg button', { hasText: bg }).click();
          await pg.locator('select').selectOption(fonts[n % 4]);
          const logo = ['글리프 마크', '패턴 크롭', '없음'][n % 3]; n++;
          await pg.locator('.seg.wrap button', { hasText: logo }).click();
          await checkFits(`${kind}/${pr}/${bg}/${logo}`);
        }
      }
      // 블록 위치 임의 조합 6가지
      const cells = pg.locator('.anchor-picker');
      for (let i = 0; i < 6; i++) {
        const pick = (gi, idx) => cells.nth(gi).locator('.anchor-cell').nth(idx).click();
        const a = (round * 7 + i * 3) % 9, b = (round * 5 + i * 4 + 2) % 9, c2 = (round * 3 + i * 5 + 4) % 9;
        const cc = await cells.count();
        if (cc >= 3) { await pick(0, a); await pick(1, b); await pick(2, c2); if (cc >= 4) await pick(3, (a + 4) % 9); }
        else if (cc === 2) { await pick(0, b); await pick(1, c2); }
        await checkFits(`${kind}/위치조합${i}`);
      }
      await pg.locator('.prop-grid, .card-side input[type=range]').first().fill('1.4').catch(() => {});
    }
    await pg.locator('.card-side > .check input').check();
    await pg.locator('details:has(summary:text-is("패턴면")) summary').click(); // 접힌 섹션 열기
    await pg.locator('.seg button', { hasText: '타일 반복' }).click();
    const fi = await h.download(() => pg.locator('.card-figure:has-text("정보면") .svg-btn').click()); const r1 = checkSvg(fi, { minPaths: 10 });
    const fp = await h.download(() => pg.locator('.card-figure:has-text("패턴면") .svg-btn').click()); checkSvg(fp, { minPaths: 1 });
    const pi = await h.download(() => pg.locator('.card-figure:has-text("정보면") .db-btn').click()); const ps = pngSize(pi); assert(ps.w === 1110 && ps.h === 638, `300dpi+재단 크기 ${ps.w}x${ps.h}`);
    await pg.locator('.card-side > .check input').uncheck();
    const pp = await h.download(() => pg.locator('.card-figure:has-text("패턴면") .db-btn').click()); const ps2 = pngSize(pp); assert(ps2.w === 1063 && ps2.h === 591, `300dpi 크기 ${ps2.w}x${ps2.h}`);
    await h.tab('조합');
    return `정보면 패스 ${r1.paths}개`;
  },
  // S7: 무작위 조작(원숭이 테스트) — 오류 없이 버티는지
  async monkey(pg, h, round) {
    let seed = 1234 + round * 97; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const keys = ['단맛', '짠맛', '매운맛', '신맛', '쓴맛', '감칠맛', '부드러움', '꾸덕함', '촉촉함', '쫀득함', '바삭함', '아삭함'];
    for (let i = 0; i < 60; i++) {
      const r = rnd();
      if (r < 0.3) await h.key(keys[Math.floor(rnd() * 12)]).click();
      else if (r < 0.5) { const b = await h.canvasBox(); const [x1, y1] = [b.x + rnd() * b.width, b.y + rnd() * b.height]; await h.drag(x1, y1, b.x + rnd() * b.width, b.y + rnd() * b.height, 4); }
      else if (r < 0.6) await pg.keyboard.press(['ArrowLeft', 'ArrowUp', ']', '[', 'Delete'][Math.floor(rnd() * 5)]);
      else if (r < 0.7) { const rows = await pg.locator('.layer-row').count(); if (rows) await pg.locator('.layer-row').nth(Math.floor(rnd() * rows)).click(); }
      else if (r < 0.78) await pg.locator('.chip', { hasText: '크롭' }).first().click();
      else if (r < 0.85) { const sw = pg.locator('.inspector .swatch'); const c = await sw.count(); if (c) await sw.nth(Math.floor(rnd() * c)).click(); }
      else if (r < 0.92) await pg.locator('.season-tab').nth(Math.floor(rnd() * 4)).click();
      else { await h.tab(['패턴화', '명함', '조합'][Math.floor(rnd() * 3)]); await pg.waitForTimeout(100); await h.tab('조합'); }
    }
    const s = await h.state(); assert(s && Array.isArray(s.layers), '상태 보존');
  },
  // S9: 작업 저장 — 시작 기록 → 자동 저장 → 새로 만들기 → 기존 작업 열기
  async works(pg, h) {
    await h.key('단맛').click(); await h.key('짠맛').click();
    await pg.waitForFunction(() => /저장됨/.test(document.querySelector('.save-status')?.textContent || ''), null, { timeout: 15000 });
    const info = await pg.locator('.work-info').textContent(); assert(info.includes('테스터') && info.includes('시작'), `작업 정보 표시: ${info}`);
    // 새로 만들기 → 다른 사람 이름
    await pg.locator('.work-bar button', { hasText: '새로 만들기' }).click();
    const dlg = pg.locator('.modal:has-text("새 작업 시작")'); await dlg.locator('input').first().fill('두번째'); await dlg.locator('input').nth(1).fill('속초식당');
    await dlg.locator('button', { hasText: '시작하기' }).click(); await dlg.waitFor({ state: 'detached' });
    let s = await h.state(); assert(s.layers.length === 0, '새 작업은 빈 캔버스');
    await h.key('매운맛').click();
    await pg.waitForFunction(() => /저장됨/.test(document.querySelector('.save-status')?.textContent || ''), null, { timeout: 15000 });
    // 기존 작업 열기 → 첫 작업 선택
    await pg.locator('.work-bar button', { hasText: '기존 작업 열기' }).click();
    const list = pg.locator('.work-item'); await list.first().waitFor({ timeout: 15000 });
    const n = await list.count(); assert(n >= 2, `목록에 2개 이상 (${n})`);
    const first = pg.locator('.work-item:has-text("테스터")').first(); assert(await first.count() === 1, '첫 작업이 목록에 있음');
    await first.locator('button').click(); await pg.locator('.modal').waitFor({ state: 'detached' });
    s = await h.state(); assert(s.layers.length === 2, '첫 작업 복원(글리프 2개)');
    const info2 = await pg.locator('.work-info').textContent(); assert(info2.includes('테스터'), '작업 정보가 첫 작업으로 바뀜');
    // 새로고침 → 이어서
    await pg.reload({ waitUntil: 'networkidle' }); await pg.locator('.work-info b').waitFor({ timeout: 15000 });
    assert((await pg.locator('.modal').count()) === 0, '시작 창 없이 이어서');
    s = await h.state(); assert(s.layers.length === 2, '새로고침 후 유지');
  },
  // S8: 모바일 전용 — 가로 스크롤 없음, 탭 전환, 터치로 추가/선택
  async mobile(pg, h) {
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth), vw = await pg.evaluate(() => window.innerWidth);
    assert(sw <= vw + 1, `가로 넘침 ${sw} > ${vw}`);
    await h.key('짠맛').tap(); await h.key('촉촉함').tap();
    assert((await h.state()).layers.length === 2, '터치로 추가');
    for (const t of ['패턴화', '명함', '조합']) { await pg.locator('.mode-tab', { hasText: t }).tap(); await pg.waitForTimeout(150); const sw2 = await pg.evaluate(() => document.documentElement.scrollWidth); assert(sw2 <= vw + 1, `${t} 탭 가로 넘침`); }
    const vis = await pg.locator('svg.composer-svg').isVisible(); assert(vis, '캔버스 표시');
    const sel = await h.selected(); const [sx, sy] = await h.toPx(sel.x, sel.y); await h.drag(sx, sy, sx + 40, sy + 40);
    const sel2 = await h.selected(); assert(sel2.x !== sel.x || sel2.y !== sel.y, '터치 끌기 이동');
  },
};

// ─── 실행 환경 ─────────────────────────────────────────
const ENVS = [
  { name: '데스크톱 1920', viewport: { width: 1920, height: 1080 } },
  { name: '노트북 1366', viewport: { width: 1366, height: 768 } },
  { name: '태블릿 820 터치', viewport: { width: 820, height: 1180 }, touch: true, mobile: true },
  { name: '폰 390 터치', viewport: { width: 390, height: 844 }, touch: true, mobile: true, deviceScaleFactor: 3 },
  { name: '하위경로 배포(Pages)', viewport: { width: 1440, height: 900 }, subpath: true },
];

async function runWeb() {
  const root = await serve(ROOT, '/');
  // 하위 경로 환경은 실제 배포와 같이 make-relative 를 거친 결과를 서비스
  const SITE = path.join(TMP, 'site');
  execFileSync('node', [path.join(__dirname, 'make-relative.js'), ROOT, SITE], { stdio: 'inherit' });
  const sub = await serve(SITE, '/sokcho-taste/');
  const browser = await chromium.launch();
  for (const env of ENVS) {
    for (let round = 1; round <= ROUNDS; round++) {
      const ctx = await browser.newContext({ viewport: env.viewport, hasTouch: !!env.touch, isMobile: !!env.mobile, deviceScaleFactor: env.deviceScaleFactor || 1, acceptDownloads: true });
      const pg = await ctx.newPage();
      const ignorable = (t) => /ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|firestore|googleapis|WebChannel|net::ERR/.test(t);
      const errors = []; pg.on('pageerror', e => { if (!ignorable(String(e))) errors.push(String(e)); }); pg.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
      const bad = []; pg.on('response', r => { if (r.status() >= 400 && !/googleapis|firestore/.test(r.url())) bad.push(r.status() + ' ' + r.url()); });
      await pg.goto(env.subpath ? sub.url : root.url, { waitUntil: 'networkidle' });
      const h = helpers(pg, !!env.touch);
      const list = env.mobile ? ['mobile', 'keypad', 'cropExport', 'card', 'works', 'monkey'] : ['keypad', 'canvasOps', 'inspector', 'cropExport', 'pattern', 'card', 'works', 'monkey'];
      for (const name of list) {
        await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle' });
        await h.boot();
        errors.length = 0; bad.length = 0;
        try {
          const detail = await scenarios[name](pg, h, round);
          assert(errors.length === 0, `콘솔 오류: ${errors[0]}`); assert(bad.length === 0, `실패 요청: ${bad[0]}`);
          record(env.name, name, round, true, detail || '');
        } catch (e) {
          await pg.screenshot({ path: path.join(TMP, `fail-${env.name}-${name}-${round}.png`) }).catch(() => {});
          record(env.name, name, round, false, e.message.split('\n')[0].slice(0, 160));
        }
      }
      await ctx.close();
    }
  }
  await browser.close(); root.srv.close(); sub.srv.close();
}

async function runElectron() {
  for (let round = 1; round <= ROUNDS; round++) {
    let app;
    try {
      app = await _electron.launch({ executablePath: require(path.join(PROJECT, 'node_modules', 'electron')), args: [PROJECT, '--no-sandbox', '--disable-gpu'], cwd: PROJECT, timeout: 90000, env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } });
      const dlDir = fs.mkdtempSync(path.join(TMP, 'electron-dl-'));
      await app.evaluate(({ session }, dir) => {
        session.defaultSession.on('will-download', (_e, item) => { try { item.setSavePath(dir + '/' + Date.now() + '-' + item.getFilename()); } catch (err) { console.error('will-download', err); } });
      }, dlDir);
      app.process().stderr?.on('data', d => { const t = String(d); if (/FATAL|Error|crash/i.test(t) && !/ERROR:.*(dbus|gpu|vaapi|viz|angle)/i.test(t)) console.log('  [electron stderr]', t.trim().slice(0, 200)); });
      const pg = await app.firstWindow();
      await pg.waitForLoadState('networkidle');
      pg.on('dialog', d => d.accept().catch(() => {}));
      const h = helpers(pg, false, dlDir);
      for (const name of ['keypad', 'canvasOps', 'cropExport', 'pattern', 'card', 'works']) {
        await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle' });
        await h.boot();
        const errors = []; pg.on('pageerror', e => errors.push(String(e)));
        try { const d = await scenarios[name](pg, h, round); assert(errors.length === 0, `오류: ${errors[0]}`); record('데스크톱 앱(Electron)', name, round, true, d || ''); }
        catch (e) { await pg.screenshot({ path: path.join(TMP, `fail-electron-${name}-${round}.png`) }).catch(() => {}); record('데스크톱 앱(Electron)', name, round, false, e.message.split('\n').slice(0, 3).join(' | ').slice(0, 300)); }
      }
    } catch (e) { record('데스크톱 앱(Electron)', 'launch', round, false, e.message.slice(0, 160)); }
    finally { if (app) await app.close().catch(() => {}); }
  }
}

(async () => {
  console.log(`테스트 시작: ${ROOT}, 반복 ${ROUNDS}회, 임시 폴더 ${TMP}`);
  if (!process.argv.includes('--only-electron')) await runWeb();
  if (!process.argv.includes('--no-electron')) await runElectron();
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패 (총 ${results.length})`);
  fs.writeFileSync(path.join(TMP, 'results.json'), JSON.stringify(results, null, 2));
  if (fail) { console.log('실패 목록:'); results.filter(r => !r.ok).forEach(r => console.log(` - [${r.env}] ${r.scenario} #${r.round}: ${r.detail}`)); }
  console.log('RESULTS_DIR=' + TMP);
  process.exit(fail ? 1 : 0);
})();
