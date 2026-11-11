// 저장된 작업 목록(JSON)에서 명함 앞면/뒷면 SVG를 일괄로 만든다.
// 사용: npx tsx scripts/export-cards.ts <works.json> <출력폴더>
// 앞면 = 정보면(글자는 모두 외곽선 패스), 뒷면 = 패턴면. 앱의 '명함' 탭에서 내려받는 것과 같은 결과.
import fs from 'node:fs';
import path from 'node:path';

// textFonts 가 fetch 로 woff 를 읽으므로, Node 에서는 public/ 폴더에서 읽도록 바꿔치기
const PUBLIC = path.join(process.cwd(), 'public');
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: string) => {
  const p = path.join(PUBLIC, String(url));
  if (!fs.existsSync(p)) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
  const buf = fs.readFileSync(p);
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response;
}) as typeof fetch;

async function main() {
  const [, , input, outDir] = process.argv;
  if (!input || !outDir) { console.error('사용: tsx scripts/export-cards.ts <works.json> <출력폴더>'); process.exit(1); }
  const { stateFromWorkData, FONT_FAMILIES } = await import('../app/context/SenseContext');
  const { buildInfoDoc, buildPatternDoc, cardDocToSvg } = await import('../app/lib/cardLayout');
  const { textsToPaths } = await import('../app/lib/textFonts');

  type Work = { id: string; who: string; org: string; data: Record<string, unknown> };
  const works: Work[] = JSON.parse(fs.readFileSync(input, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const used = new Map<string, number>();
  const rows: string[] = [];

  for (const w of works) {
    const state = stateFromWorkData(w.data as never);
    const card = state.card;
    // 파일 이름의 '성명': 명함의 이름 → 없으면 가게/소속 → 없으면 만든 사람
    const rawName = (card.fields.name || card.fields.org || w.who || w.id).trim();
    let base = rawName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') || w.id;
    const n = (used.get(base) || 0) + 1; used.set(base, n);
    if (n > 1) base = `${base}_${n}`;

    const infoDoc = buildInfoDoc(state);
    const patternDoc = buildPatternDoc(state);
    const fontFamily = FONT_FAMILIES[card.font];
    const textMarkup = await textsToPaths(card.font, infoDoc.texts);
    const front = cardDocToSvg(infoDoc, textMarkup, fontFamily);
    const back = cardDocToSvg(patternDoc, '', fontFamily);
    fs.writeFileSync(path.join(outDir, `${base}_앞면.svg`), front);
    fs.writeFileSync(path.join(outDir, `${base}_뒷면.svg`), back);
    const note = !card.fields.name ? (card.fields.org ? '이름 없음→소속 사용' : '이름·소속 없음→만든 사람 사용') : '';
    const empty = state.layers.length === 0 ? ' / 글리프 0개(뒷면 비어 있음)' : '';
    rows.push(`${base}\t만든 사람: ${w.who}${w.org ? ` (${w.org})` : ''}\t${note}${empty}`);
    console.log(`✓ ${base}_앞면.svg / ${base}_뒷면.svg  ${note}${empty}`);
  }
  fs.writeFileSync(path.join(outDir, '목록.txt'), rows.join('\n') + '\n');
  console.log(`완료: ${works.length}개 작업 → ${works.length * 2}개 SVG`);
}
main().catch(e => { console.error(e); process.exit(1); });
