// 디지털 명함 레이아웃 (90×50mm, 단위 = 0.1mm)
// 정보면은 가이드의 명함 디자인을 따르지 않는 독자 레이아웃. 패턴면은 앱의 조합(크롭)을 사용.
import { SEASONAL_COLORS } from '../constants/colors';
import { getGlyphPath } from './glyphs';
import { buildPatternDef, layersMarkup, esc, SVG_HEADER } from './svgBuilder';
import { aspectCrop, type CropRect, type SenseState } from '../context/SenseContext';
import type { TextSpec } from './textFonts';

export const CARD_W = 900;
export const CARD_H = 500;
export const BLEED = 20; // 2mm

export interface CardDoc {
  width: number;        // 전체(재단 여백 포함) 크기
  height: number;
  offset: number;       // 재단 여백
  bg: string;
  markup: string;       // 텍스트 외 도형(패턴, 선, 글리프 마크)
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
  const muted = dark ? 'rgba(255,255,255,0.65)' : 'rgba(17,17,17,0.6)';
  const point = state.card.bg === 'season' ? text : accent;
  return { bg, text, muted, accent, point, dark };
}

function lines(s: string): string[] {
  return s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function glyphMark(state: SenseState, x: number, y: number, size: number, fill: string, opacity = 1): string {
  const layer = state.layers.find(l => l.visible);
  if (!layer) return '';
  const g = getGlyphPath(layer.category, layer.type, layer.intensity);
  const s = size / Math.max(g.width, g.height);
  return `<path d="${g.d}" transform="translate(${x} ${y}) scale(${s.toFixed(3)})" fill="${fill}" opacity="${opacity}"/>`;
}

/** 연락처 줄 목록 (빈 값은 건너뜀) */
function contactLines(state: SenseState): { label: string; value: string }[] {
  const f = state.card.fields;
  const out: { label: string; value: string }[] = [];
  if (f.phone) out.push({ label: 'M', value: f.phone });
  if (f.email) out.push({ label: 'E', value: f.email });
  if (f.instagram) out.push({ label: '@', value: f.instagram.replace(/^@/, '') });
  if (f.website) out.push({ label: 'W', value: f.website.replace(/^https?:\/\//, '') });
  return out;
}

// ─── 정보면 ─────────────────────────────────────────────
export function buildInfoDoc(state: SenseState, uid = 'info'): CardDoc {
  const { card } = state;
  const c = cardColors(state);
  const off = card.bleed ? BLEED : 0;
  const texts: TextSpec[] = [];
  let markup = '';
  const f = card.fields;
  const isStore = card.kind === 'store';

  const T = (text: string, x: number, y: number, size: number, weight: 400 | 700, anchor: TextSpec['anchor'] = 'start', fill = c.text, letterSpacing = 0) => {
    if (text && text.trim()) texts.push({ text, x: x + off, y: y + off, size, weight, anchor, fill, letterSpacing });
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x + off}" y="${y + off}" width="${w}" height="${h}" fill="${fill}"/>`;

  const contacts = contactLines(state);
  const addr = lines(f.address);

  if (!isStore) {
    const headline = f.name;
    const sub = [f.title, f.org].filter(Boolean).join(' · ');

    if (card.layout === 'A') {
      // 왼쪽 정렬 · 상단 이름, 하단 연락처
      T(headline, 60, 150, 46, 700);
      T(f.nameEn, 60, 186, 15, 400, 'start', c.muted, 0.1);
      T(sub, 60, 226, 18, 400, 'start', c.muted);
      markup += rect(60, 250, 56, 3, c.point);
      let y = 500 - 60 - (contacts.length + addr.length - 1) * 27;
      y = Math.max(y, 300);
      contacts.forEach(l => { T(l.label, 60, y, 15, 700, 'start', c.point); T(l.value, 86, y, 17, 400); y += 27; });
      addr.forEach(a => { T(a, 60, y, 15, 400, 'start', c.muted); y += 24; });
      markup += glyphMark(state, 790, 90, 74, c.point);
    } else if (card.layout === 'B') {
      // 가운데 정렬
      T(headline, 450, 212, 48, 700, 'middle');
      T(f.nameEn, 450, 246, 14, 400, 'middle', c.muted, 0.14);
      T(sub, 450, 284, 18, 400, 'middle', c.muted);
      markup += rect(430, 312, 40, 3, c.point);
      const row1 = contacts.filter(l => l.label === 'M' || l.label === 'E').map(l => l.value).join('   ·   ');
      const row2 = contacts.filter(l => l.label === '@' || l.label === 'W').map(l => (l.label === '@' ? '@' : '') + l.value).join('   ·   ');
      let y = 372;
      if (row1) { T(row1, 450, y, 16, 400, 'middle'); y += 26; }
      if (row2) { T(row2, 450, y, 16, 400, 'middle'); y += 26; }
      addr.forEach(a => { T(a, 450, y, 14, 400, 'middle', c.muted); y += 22; });
      markup += glyphMark(state, 450, 100, 56, c.point);
    } else {
      // 세로 포인트 바 + 흐린 큰 글리프
      markup += `<rect x="${off}" y="${off}" width="14" height="${CARD_H}" fill="${c.point}"/>`;
      markup += `<clipPath id="${uid}-clip"><rect x="${off}" y="${off}" width="${CARD_W}" height="${CARD_H}"/></clipPath>`;
      markup += `<g clip-path="url(#${uid}-clip)">${glyphMark(state, 800 + off, 430 + off, 300, c.point, c.dark ? 0.22 : 0.14)}</g>`;
      T(headline, 72, 124, 44, 700);
      T(f.nameEn, 72, 158, 14, 400, 'start', c.muted, 0.1);
      T(sub, 72, 196, 18, 400, 'start', c.muted);
      let y = 500 - 56 - (contacts.length + addr.length - 1) * 26;
      y = Math.max(y, 260);
      contacts.forEach(l => { T(l.label, 72, y, 14, 700, 'start', c.point); T(l.value, 96, y, 16, 400); y += 26; });
      addr.forEach(a => { T(a, 72, y, 14, 400, 'start', c.muted); y += 22; });
    }
  } else {
    // ─── 가게용: 가게 이름을 크게 ───
    const owner = [f.name, f.title].filter(Boolean).join(' ');
    const extra = lines(f.hours);
    if (card.layout === 'A') {
      T(f.storeName, 60, 182, 72, 700);
      T(f.storeNameEn, 60, 218, 15, 400, 'start', c.muted, 0.14);
      T(f.storeSub, 60, 256, 18, 400, 'start', c.muted);
      markup += rect(60, 282, 56, 3, c.point);
      const total = (owner ? 1 : 0) + contacts.length + addr.length + extra.length;
      let y = Math.max(320, 500 - 56 - (total - 1) * 26);
      if (owner) { T(owner, 60, y, 17, 700); y += 26; }
      contacts.forEach(l => { T(l.label, 60, y, 14, 700, 'start', c.point); T(l.value, 84, y, 16, 400); y += 26; });
      addr.forEach(a => { T(a, 60, y, 14, 400, 'start', c.muted); y += 22; });
      extra.forEach(a => { T(a, 60, y, 14, 400, 'start', c.muted); y += 22; });
      markup += glyphMark(state, 790, 90, 74, c.point);
    } else if (card.layout === 'B') {
      markup += glyphMark(state, 450, 92, 60, c.point);
      T(f.storeName, 450, 228, 76, 700, 'middle');
      T(f.storeNameEn, 450, 262, 14, 400, 'middle', c.muted, 0.16);
      T(f.storeSub, 450, 298, 18, 400, 'middle', c.muted);
      markup += rect(430, 324, 40, 3, c.point);
      let y = 372;
      const row1 = [owner, ...contacts.filter(l => l.label === 'M').map(l => l.value)].filter(Boolean).join('   ·   ');
      const row2 = contacts.filter(l => l.label !== 'M').map(l => (l.label === '@' ? '@' : '') + l.value).join('   ·   ');
      if (row1) { T(row1, 450, y, 16, 400, 'middle'); y += 26; }
      if (row2) { T(row2, 450, y, 16, 400, 'middle'); y += 26; }
      [...addr, ...extra].forEach(a => { T(a, 450, y, 14, 400, 'middle', c.muted); y += 22; });
    } else {
      markup += `<rect x="${off}" y="${off}" width="14" height="${CARD_H}" fill="${c.point}"/>`;
      markup += `<clipPath id="${uid}-clip"><rect x="${off}" y="${off}" width="${CARD_W}" height="${CARD_H}"/></clipPath>`;
      markup += `<g clip-path="url(#${uid}-clip)">${glyphMark(state, 800 + off, 430 + off, 300, c.point, c.dark ? 0.22 : 0.14)}</g>`;
      T(f.storeName, 72, 150, 64, 700);
      T(f.storeNameEn, 72, 184, 14, 400, 'start', c.muted, 0.14);
      T(f.storeSub, 72, 222, 18, 400, 'start', c.muted);
      const total = (owner ? 1 : 0) + contacts.length + addr.length + extra.length;
      let y = Math.max(280, 500 - 56 - (total - 1) * 26);
      if (owner) { T(owner, 72, y, 16, 700); y += 26; }
      contacts.forEach(l => { T(l.label, 72, y, 14, 700, 'start', c.point); T(l.value, 96, y, 16, 400); y += 26; });
      [...addr, ...extra].forEach(a => { T(a, 72, y, 14, 400, 'start', c.muted); y += 22; });
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
  const pw = opts.pixelWidth ?? Math.round(doc.width / 10 / 25.4 * 300); // 300dpi 기준 픽셀
  const ph = Math.round(pw * doc.height / doc.width);
  const texts = textMarkup ?? doc.texts.map(t =>
    `<text x="${t.x}" y="${t.y}" font-size="${t.size}" font-weight="${t.weight}" text-anchor="${t.anchor}" fill="${t.fill}" font-family="${fontFamily}"${t.letterSpacing ? ` letter-spacing="${t.letterSpacing}em"` : ''}>${esc(t.text)}</text>`
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
