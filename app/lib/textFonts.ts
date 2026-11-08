// 명함 텍스트를 벡터 패스로 변환 (인쇄용 SVG: 글꼴이 없어도 깨지지 않음)
import opentype from 'opentype.js';
import type { FontId } from '../context/SenseContext';

const cache: Record<string, Promise<opentype.Font>> = {};

export function loadTextFont(font: FontId, weight: 400 | 700): Promise<opentype.Font> {
  const key = `${font}-${weight}`;
  if (!cache[key]) {
    cache[key] = fetch(`fonts/text/${key}.woff`)
      .then(res => { if (!res.ok) throw new Error(`글꼴 파일을 불러올 수 없습니다: ${key}`); return res.arrayBuffer(); })
      .then(buf => opentype.parse(buf));
  }
  return cache[key];
}

export interface TextSpec {
  text: string;
  x: number;
  y: number;              // 베이스라인
  size: number;
  weight: 400 | 700;
  anchor: 'start' | 'middle' | 'end';
  fill: string;
  letterSpacing?: number; // em 단위
  opacity?: number;
}

/** 텍스트 한 줄을 패스 d로 변환 (anchor 반영) */
export function textToPathD(font: opentype.Font, spec: TextSpec): string {
  const ls = (spec.letterSpacing ?? 0) * spec.size;
  const glyphs = font.stringToGlyphs(spec.text);
  const scale = spec.size / font.unitsPerEm;
  let width = 0;
  glyphs.forEach((g, i) => { width += (g.advanceWidth ?? 0) * scale + (i < glyphs.length - 1 ? ls : 0); });
  let x = spec.x;
  if (spec.anchor === 'middle') x -= width / 2;
  if (spec.anchor === 'end') x -= width;
  const parts: string[] = [];
  glyphs.forEach(g => {
    const p = g.getPath(x, spec.y, spec.size);
    const d = p.toPathData(2);
    if (d) parts.push(d);
    x += (g.advanceWidth ?? 0) * scale + ls;
  });
  return parts.join(' ');
}

export function measureText(font: opentype.Font, text: string, size: number, letterSpacing = 0): number {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let w = 0;
  glyphs.forEach((g, i) => { w += (g.advanceWidth ?? 0) * scale + (i < glyphs.length - 1 ? letterSpacing * size : 0); });
  return w;
}

/** 여러 텍스트를 모두 패스로 바꾼 SVG 조각 */
export async function textsToPaths(fontId: FontId, specs: TextSpec[]): Promise<string> {
  const need = new Set(specs.map(s => s.weight));
  const fonts: Partial<Record<400 | 700, opentype.Font>> = {};
  for (const w of need) fonts[w] = await loadTextFont(fontId, w);
  return specs
    .filter(s => s.text.trim().length > 0)
    .map(s => {
      const d = textToPathD(fonts[s.weight]!, s);
      return d ? `<path d="${d}" fill="${s.fill}"${s.opacity !== undefined ? ` opacity="${s.opacity}"` : ''}/>` : '';
    })
    .join('\n  ');
}
