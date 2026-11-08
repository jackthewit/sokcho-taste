// 디지털 명함 레이아웃 (90×50mm, 단위 = 0.1mm)
// 정보면 = 블록(로고 · 이름 · 연락처)을 9칸 위치에 배치하는 조립식. 패턴면 = 앱의 조합(크롭).
import { SEASONAL_COLORS } from '../constants/colors';
import { getGlyphPath } from './glyphs';
import { buildPatternDef, layersMarkup, esc, SVG_HEADER, resolveColor } from './svgBuilder';
import { aspectCrop, type Anchor, type CropRect, type SenseState } from '../context/SenseContext';
import type { TextSpec } from './textFonts';

export const CARD_W = 900;
export const CARD_H = 500;
export const BLEED = 20; // 2mm

export interface CardDoc {
  width: number;
  height: number;
  offset: number;
  bg: string;
  markup: string;
  texts: TextSpec[];
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const rr = (n >> 16) & 255, gg = (n >> 8) & 255, bb = n & 255;
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rr) + 0.7152 * f(gg) + 0.0722 * f(bb);
}

export function cardColors(state: SenseState) {
  const accent = SEASONAL_COLORS[state.season][state.card.accentTaste];
  let bg = '#ffffff';
  if (state.card.bg === 'black') bg = '#111111';
  if (state.card.bg === 'season') bg = accent;
  const dark = luminance(bg) < 0.35;
  const text = dark ? '#ffffff' : '#111111';
  const muted = dark ? 'rgba(255,255,255,0.7)' : 'rgba(17,17,17,0.62)';
  const point = state.card.bg === 'season' ? text : accent;
  return { bg, text, muted, accent, point, dark };
}

/** 글자 폭 어림값(em) — 한글 0.95, 대문자 0.68, 소문자·숫자 0.55, 공백 0.3 */
export function estimateWidth(text: string, size: number, letterSpacing = 0): number {
  let w = 0;
  for (const ch of text) {
    if (/[ㄱ-ㆎ가-힣一-鿿぀-ヿ]/.test(ch)) w += 0.95;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else if (/[a-z0-9@]/.test(ch)) w += 0.55;
    else if (ch === ' ') w += 0.3;
    else w += 0.4;
    w += letterSpacing;
  }
  return w * size;
}

export function fitSize(text: string, maxWidth: number, size: number, minSize: number, letterSpacing = 0): number {
  const w = estimateWidth(text, size, letterSpacing);
  if (w <= maxWidth) return size;
  return Math.max(minSize, Math.floor(size * maxWidth / w));
}

function resolveLayerColor(state: SenseState, layerId?: string): string {
  const layer = (layerId && state.layers.find(l => l.id === layerId)) || state.layers.find(l => l.visible);
  return layer ? resolveColor(layer, state.season) : '#999';
}

const lines = (s: string) => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

// ─── 블록 ────────────────────────────────────────────────
type Align = 'start' | 'middle' | 'end';
interface Line { text: string; size: number; weight: 400 | 700; fill: string; spacing?: number; lh: number; dx?: number; }
interface Block { w: number; h: number; place: (x: number, y: number, align: Align) => { texts: TextSpec[]; markup: string }; }

function alignX(x: number, w: number, align: Align) { return align === 'start' ? x : align === 'middle' ? x + w / 2 : x + w; }
function anchorAlign(a: Anchor): Align { return a.endsWith('l') ? 'start' : a.endsWith('c') ? 'middle' : 'end'; }

/** 여러 줄 텍스트 블록 */
function textBlock(ls: Line[], maxWidth: number): Block {
  const fitted = ls.map(l => ({ ...l, size: fitSize(l.text, maxWidth, l.size, Math.max(9, Math.round(l.size * 0.45)), l.spacing || 0) }));
  const w = Math.min(maxWidth, Math.max(0, ...fitted.map(l => estimateWidth(l.text, l.size, l.spacing || 0))));
  const h = fitted.reduce((a, l) => a + l.lh, 0);
  return {
    w, h,
    place(x, y, align) {
      const texts: TextSpec[] = []; let cy = y;
      for (const l of fitted) {
        cy += l.lh;
        texts.push({ text: l.text, x: alignX(x, w, align) + (l.dx || 0), y: cy - l.lh * 0.28, size: l.size, weight: l.weight, anchor: align, fill: l.fill, letterSpacing: l.spacing || 0 });
      }
      return { texts, markup: '' };
    },
  };
}

function glyphMarkup(state: SenseState, x: number, y: number, size: number, fill: string, opacity = 1, layerId?: string): string {
  const layer = (layerId && state.layers.find(l => l.id === layerId)) || state.layers.find(l => l.visible);
  if (!layer) return '';
  const g = getGlyphPath(layer.category, layer.type, layer.intensity);
  const s = size / Math.max(g.width, g.height);
  return `<path d="${g.d}" transform="translate(${(x + size / 2).toFixed(1)} ${(y + size / 2).toFixed(1)}) scale(${s.toFixed(3)})" fill="${fill}" opacity="${opacity}"/>`;
}

/** 패턴 크롭을 상자(사각/원/와이드)에 꽉 채워 넣은 마크 */
function patternMarkup(state: SenseState, x: number, y: number, w: number, h: number, shape: 'rect' | 'circle' | 'wide', uid: string): string {
  if (!state.layers.length) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape === 'circle' ? w / 2 : 8}" fill="none" stroke="#bbb" stroke-dasharray="4 4"/>`;
  const crop = state.crop ?? aspectCrop(w / h);
  const s = Math.max(w / crop.w, h / crop.h);
  const tx = x + (w - crop.w * s) / 2 - crop.x * s, ty = y + (h - crop.h * s) / 2 - crop.y * s;
  const clip = shape === 'circle'
    ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape === 'wide' ? 6 : 10}"/>`;
  const bg = state.background === 'transparent' ? '' : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${state.background}"/>`;
  return `<clipPath id="${uid}"> ${clip}</clipPath><g clip-path="url(#${uid})">${bg}<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">${layersMarkup(state)}</g></g>`;
}

// ─── 정보면 ─────────────────────────────────────────────
export function buildInfoDoc(state: SenseState, uid = 'info'): CardDoc {
  const { card } = state;
  const f = card.fields;
  const c = cardColors(state);
  const off = card.bleed ? BLEED : 0;
  const texts: TextSpec[] = [];
  let markup = '';

  const m = card.margin;
  const barW = card.accentBar ? 14 : 0;
  const x0 = off + m + barW, y0 = off + m;
  const W = CARD_W - m * 2 - barW, H = CARD_H - m * 2;
  if (card.accentBar) markup += `<rect x="${off}" y="${off}" width="14" height="${CARD_H}" fill="${c.point}"/>`;

  // 1) 마크 블록(패턴/글리프) + 소속 블록(글자) — 따로 배치하거나 소속을 마크에 붙임
  const orgText = f.org.trim();
  const L = card.logo;
  const O = card.orgBlock;
  let mark: Block | null = null;
  if (L.type === 'pattern' || L.type === 'glyph') {
    const markW = (L.shape === 'wide' && L.type === 'pattern' ? 190 : 100) * L.size, markH = 100 * L.size;
    const glyphFill = L.color === 'text' ? c.text : L.color === 'auto' ? resolveLayerColor(state, L.glyphLayerId) : c.point;
    mark = {
      w: markW, h: markH,
      place(x, y) {
        const mk = L.type === 'pattern'
          ? patternMarkup(state, x, y, markW, markH, L.shape, `${uid}-logo`)
          : glyphMarkup(state, x, y, Math.min(markW, markH), glyphFill, L.opacity ?? 1, L.glyphLayerId);
        return { texts: [], markup: mk };
      },
    };
  }
  let org: Block | null = null;
  if (O.show && (orgText || f.tagline || f.orgEn)) {
    const k = O.size;
    const ls: Line[] = [];
    if (f.tagline) ls.push({ text: f.tagline, size: 13 * k, weight: 400, fill: c.muted, lh: 18 * k });
    if (orgText) ls.push({ text: orgText, size: 30 * k, weight: 700, fill: c.text, lh: 38 * k });
    if (f.orgEn) ls.push({ text: f.orgEn, size: 12 * k, weight: 400, fill: c.muted, spacing: 0.14, lh: 18 * k });
    org = textBlock(ls, W * 0.6);
  }

  // 2) 이름 블록
  const N = card.name;
  const nameLines: Line[] = [];
  const titleLine: Line | null = f.title ? { text: f.title, size: 18 * N.size, weight: 400, fill: c.muted, lh: 26 * N.size } : null;
  const nameText = N.spacing > 0 ? f.name.replace(/\s+/g, '') : f.name;
  const nameSize = 42 * N.size;
  if (titleLine && N.titlePos === 'above') nameLines.push(titleLine);
  if (f.name) {
    if (N.en === 'inline' && f.nameEn) {
      // 이름 + 영문 한 줄: 두 텍스트를 한 줄로 합쳐 배치 (자간은 이름에만)
      nameLines.push({ text: nameText, size: nameSize, weight: 700, fill: c.text, spacing: N.spacing, lh: 50 * N.size });
    } else {
      nameLines.push({ text: nameText, size: nameSize, weight: 700, fill: c.text, spacing: N.spacing, lh: 50 * N.size });
    }
  }
  if (titleLine && N.titlePos === 'below') nameLines.push(titleLine);
  if (N.en === 'below' && f.nameEn) nameLines.push({ text: f.nameEn, size: 14 * N.size, weight: 400, fill: c.muted, spacing: 0.1, lh: 20 * N.size });
  let name: Block | null = nameLines.length ? textBlock(nameLines, W * 0.8) : null;
  if (name && N.en === 'inline' && f.nameEn && f.name) {
    // 영문을 이름 오른쪽에 덧붙임
    const base = name; const enSize = 24 * N.size; const enW = estimateWidth(f.nameEn, enSize);
    const nameW = estimateWidth(nameText, nameSize, N.spacing);
    name = {
      w: Math.max(base.w, nameW + 16 + enW), h: base.h,
      place(x, y, align) {
        const r = base.place(x, y, align);
        const nm = r.texts.find(t => t.text === nameText);
        if (nm) {
          const startX = align === 'start' ? x : align === 'middle' ? x + (name!.w - (nameW + 16 + enW)) / 2 : x + name!.w - (nameW + 16 + enW);
          nm.anchor = 'start'; nm.x = startX;
          r.texts.push({ text: f.nameEn, x: startX + nameW + 16, y: nm.y, size: enSize, weight: 400, anchor: 'start', fill: c.text });
        }
        return r;
      },
    };
  }
  if (name && N.titlePos === 'inline' && titleLine && f.name) {
    const base = name; const tW = estimateWidth(f.title, titleLine.size);
    name = {
      w: base.w + tW + 14, h: base.h,
      place(x, y, align) {
        const r = base.place(x + (align === 'start' ? tW + 14 : 0), y, align);
        const nm = r.texts.find(t => t.text === nameText);
        if (nm) r.texts.push({ text: f.title, x: (nm.anchor === 'start' ? nm.x : nm.anchor === 'middle' ? nm.x - estimateWidth(nameText, nm.size, N.spacing) / 2 : nm.x - estimateWidth(nameText, nm.size, N.spacing)) - 14, y: nm.y, size: titleLine.size, weight: 400, anchor: 'end', fill: c.muted });
        return r;
      },
    };
  }

  // 3) 연락처 블록
  const C = card.contacts;
  const lab = (word: string, short: string) => C.labels === 'word' ? `${word} : ` : C.labels === 'short' ? `${short} ` : '';
  const items: string[] = [];
  const addr = lines(f.address);
  if (C.addressFirst) items.push(...addr);
  if (f.tel) items.push(lab('Tel', 'T.') + f.tel);
  if (f.phone) items.push(lab('H.P', 'M.') + f.phone);
  if (f.fax) items.push(lab('Fax', 'F.') + f.fax);
  if (f.email) items.push(lab('E-mail', 'E.') + f.email);
  if (f.instagram) items.push((C.labels === 'none' ? '' : C.labels === 'word' ? 'Instagram : ' : '') + (f.instagram.startsWith('@') ? f.instagram : '@' + f.instagram));
  if (f.website) items.push(lab('Web', 'W.') + f.website.replace(/^https?:\/\//, ''));
  items.push(...lines(f.hours));
  if (!C.addressFirst) items.push(...addr);
  const cs = 16 * C.size, clh = 26 * C.size;
  let contacts: Block | null = null;
  if (items.length) {
    if (C.columns === 2 && items.length > 2) {
      const half = Math.ceil(items.length / 2);
      const a = textBlock(items.slice(0, half).map(t => ({ text: t, size: cs, weight: 400 as const, fill: c.text, lh: clh })), W * 0.5);
      const b = textBlock(items.slice(half).map(t => ({ text: t, size: cs, weight: 400 as const, fill: c.text, lh: clh })), W * 0.5);
      const gap = 36;
      contacts = {
        w: a.w + gap + b.w, h: Math.max(a.h, b.h),
        place(x, y) { const r1 = a.place(x, y, 'start'); const r2 = b.place(x + a.w + gap, y, 'start'); return { texts: [...r1.texts, ...r2.texts], markup: '' }; },
      };
    } else {
      contacts = textBlock(items.map(t => ({ text: t, size: cs, weight: 400 as const, fill: c.text, lh: clh })), W);
    }
  }

  // 4) 배치 — 위치 계산 → 세로로 겹치는 블록은 가운데 블록을 밀어 겹침을 피함 → 미세 이동 적용
  const GAP = 14;
  type Key = 'mark' | 'org' | 'name' | 'contacts';
  const entries: { b: Block; a: Anchor; x: number; y: number; key: Key; dx: number; dy: number }[] = [];
  const pos = (b: Block, a: Anchor) => ({
    x: a.endsWith('l') ? x0 : a.endsWith('c') ? x0 + (W - b.w) / 2 : x0 + W - b.w,
    y: a.startsWith('t') ? y0 : a.startsWith('m') ? y0 + (H - b.h) / 2 : y0 + H - b.h,
  });
  const attached = org && mark && O.attach !== 'free';
  if (mark && org && attached) {
    // 마크 + 소속을 한 덩어리로 배치
    const gap = 16;
    const horiz = O.attach === 'right';
    const w = horiz ? mark.w + gap + org.w : Math.max(mark.w, org.w);
    const h = horiz ? Math.max(mark.h, org.h) : mark.h + gap * 0.6 + org.h;
    const m = mark, o = org;
    const combo: Block = {
      w, h,
      place(x, y, align) {
        if (horiz) {
          const r1 = m.place(x, y + (h - m.h) / 2, 'start');
          const r2 = o.place(x + m.w + gap + O.dx, y + (h - o.h) / 2 + O.dy, 'start');
          return { texts: [...r1.texts, ...r2.texts], markup: r1.markup + r2.markup };
        }
        const mx = align === 'start' ? x : align === 'middle' ? x + (w - m.w) / 2 : x + w - m.w;
        const ox = align === 'start' ? x : align === 'middle' ? x + (w - o.w) / 2 : x + w - o.w;
        const r1 = m.place(mx, y, align);
        const r2 = o.place(ox + O.dx, y + m.h + gap * 0.6 + O.dy, align);
        return { texts: [...r1.texts, ...r2.texts], markup: r1.markup + r2.markup };
      },
    };
    entries.push({ b: combo, a: L.pos, ...pos(combo, L.pos), key: 'mark', dx: L.dx, dy: L.dy });
  } else {
    if (mark) entries.push({ b: mark, a: L.pos, ...pos(mark, L.pos), key: 'mark', dx: L.dx, dy: L.dy });
    if (org) entries.push({ b: org, a: O.pos, ...pos(org, O.pos), key: 'org', dx: O.dx, dy: O.dy });
  }
  if (name) entries.push({ b: name, a: N.pos, ...pos(name, N.pos), key: 'name', dx: N.dx, dy: N.dy });
  if (contacts) entries.push({ b: contacts, a: C.pos, ...pos(contacts, C.pos), key: 'contacts', dx: C.dx, dy: C.dy });

  const isWatermark = (e: typeof entries[0]) => e.key === 'mark' && L.type === 'glyph' && (L.opacity ?? 1) <= 0.5 && !attached;
  markup += `<clipPath id="${uid}-card"><rect x="${off}" y="${off}" width="${CARD_W}" height="${CARD_H}"/></clipPath>`;
  const overlapX = (p: typeof entries[0], q: typeof entries[0]) => p.x < q.x + q.b.w && q.x < p.x + p.b.w;
  const overlapY = (p: typeof entries[0], q: typeof entries[0]) => p.y < q.y + q.b.h + GAP && q.y < p.y + p.b.h + GAP;
  const vOrder = (a: Anchor) => (a.startsWith('t') ? 0 : a.startsWith('m') ? 1 : 2);
  for (let pass = 0; pass < 3; pass++) {
    for (const p of entries) for (const q of entries) {
      if (p === q || isWatermark(p) || isWatermark(q) || !overlapX(p, q) || !overlapY(p, q)) continue;
      const [top, bottom] = vOrder(p.a) <= vOrder(q.a) ? [p, q] : [q, p];
      if (vOrder(top.a) === vOrder(bottom.a)) continue; // 같은 칸은 사용자의 의도로 보고 둠
      if (vOrder(bottom.a) === 1) bottom.y = top.y + top.b.h + GAP;
      else if (vOrder(top.a) === 1) top.y = bottom.y - top.b.h - GAP;
      else top.y = Math.max(y0, bottom.y - top.b.h - GAP);
    }
  }
  // 워터마크를 먼저(뒤에) 그리고, 나머지를 그 위에
  entries.sort((a, b) => Number(isWatermark(b)) - Number(isWatermark(a)));
  for (const e of entries) {
    const r = e.b.place(e.x + e.dx, e.y + e.dy, anchorAlign(e.a));
    texts.push(...r.texts);
    markup += e.key === 'mark' ? `<g clip-path="url(#${uid}-card)">${r.markup}</g>` : r.markup;
    if (e.key === 'name' && card.divider) {
      const al = anchorAlign(e.a);
      const lx = al === 'start' ? e.x + e.dx : al === 'middle' ? e.x + e.dx + e.b.w / 2 - 20 : e.x + e.dx + e.b.w - 40;
      markup += `<rect x="${lx.toFixed(1)}" y="${(e.y + e.dy + e.b.h + 8).toFixed(1)}" width="40" height="3" fill="${c.point}"/>`;
    }
  }

  return { width: CARD_W + off * 2, height: CARD_H + off * 2, offset: off, bg: c.bg, markup, texts };
}

// ─── 패턴면 ─────────────────────────────────────────────
export function cardCrop(state: SenseState): CropRect {
  return state.crop ?? aspectCrop(CARD_W / CARD_H);
}

export function buildPatternDoc(state: SenseState, uid = 'pat'): CardDoc {
  const off = state.card.bleed ? BLEED : 0;
  const W = CARD_W + off * 2, H = CARD_H + off * 2;
  const crop = cardCrop(state);
  const bg = state.background === 'transparent' ? '#ffffff' : state.background;
  let markup = `<clipPath id="${uid}-clip"><rect width="${W}" height="${H}"/></clipPath>`;
  if (state.card.patternFit === 'cover') {
    const s = Math.max(W / crop.w, H / crop.h);
    const tx = (W - crop.w * s) / 2 - crop.x * s;
    const ty = (H - crop.h * s) / 2 - crop.y * s;
    markup += `<g clip-path="url(#${uid}-clip)"><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">${layersMarkup(state)}</g></g>`;
  } else {
    const def = buildPatternDef(state, { id: `${uid}-tile`, crop, mode: state.tile.mode, tileWidth: W / Math.max(1, state.card.patternScale), withBackground: false });
    markup += `<defs>${def}</defs><rect width="${W}" height="${H}" fill="url(#${uid}-tile)"/>`;
  }
  return { width: W, height: H, offset: off, bg, markup, texts: [] };
}

/** 문서 → SVG 문자열. textMarkup 은 텍스트를 패스로 바꾼 조각(없으면 <text>로 출력) */
export function cardDocToSvg(doc: CardDoc, textMarkup: string | null, fontFamily: string, opts: { pixelWidth?: number; trimMarks?: boolean } = {}): string {
  const pw = opts.pixelWidth ?? Math.round(doc.width / 10 / 25.4 * 300);
  const ph = Math.round(pw * doc.height / doc.width);
  const texts = textMarkup ?? doc.texts.map(t =>
    `<text x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" font-size="${t.size}" font-weight="${t.weight}" text-anchor="${t.anchor}" fill="${t.fill}" font-family="${fontFamily}"${t.letterSpacing ? ` letter-spacing="${t.letterSpacing}em"` : ''}>${esc(t.text)}</text>`
  ).join('\n  ');
  const marks = opts.trimMarks && doc.offset
    ? `<rect x="${doc.offset}" y="${doc.offset}" width="${doc.width - doc.offset * 2}" height="${doc.height - doc.offset * 2}" fill="none" stroke="#000" stroke-width="0.6" stroke-dasharray="6 4" opacity="0.5"/>`
    : '';
  return `${SVG_HEADER}<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${doc.width} ${doc.height}" width="${pw}" height="${ph}">
  <rect width="${doc.width}" height="${doc.height}" fill="${doc.bg}"/>
  ${doc.markup}
  ${texts}
  ${marks}
</svg>`;
}
