// 딩벳 글리프 → 벡터 패스 변환 (화면 렌더링과 SVG 내보내기가 같은 데이터를 씀)
import opentype from 'opentype.js';
import { FONTS_BASE64 } from './dingbatFonts';
import { TASTE_GLYPHS, TEXTURE_GLYPHS, type TextureType, type IntensityLevel } from '../constants/keymap';
import type { TasteType } from '../constants/colors';

export type GlyphCategory = 'taste' | 'texture';
export type TasteKey = Exclude<TasteType, 'bland'>;

const FONT_CACHE: Record<string, opentype.Font> = {};

export const WEIGHT_NAMES = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'] as const;

export function weightNameForIntensity(level: IntensityLevel): string {
  return WEIGHT_NAMES[Math.min(6, Math.max(1, level)) - 1];
}

function getFont(name: string): opentype.Font {
  if (FONT_CACHE[name]) return FONT_CACHE[name];
  const base64 = FONTS_BASE64[name];
  if (!base64) throw new Error(`딩벳 폰트 없음: ${name}`);
  const bin = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  FONT_CACHE[name] = opentype.parse(bytes.buffer);
  return FONT_CACHE[name];
}

export function glyphChar(category: GlyphCategory, type: string, intensity: IntensityLevel): string {
  if (category === 'taste') return TASTE_GLYPHS[type as TasteKey];
  return TEXTURE_GLYPHS[type as TextureType][intensity - 1];
}

export interface GlyphPath {
  d: string;        // 중심이 (0,0), 기준 크기 100 단위
  width: number;    // 바운딩 박스 크기 (기준 100)
  height: number;
}

const PATH_CACHE: Record<string, GlyphPath> = {};

/** 글리프를 기준 크기 100으로 만든 패스. 중심이 원점에 오도록 이동되어 있음 */
export function getGlyphPath(category: GlyphCategory, type: string, intensity: IntensityLevel): GlyphPath {
  const weight = weightNameForIntensity(intensity);
  const ch = glyphChar(category, type, intensity);
  const key = `${weight}:${ch}`;
  if (PATH_CACHE[key]) return PATH_CACHE[key];

  const font = getFont(weight);
  const path = font.getPath(ch, 0, 0, 100);
  const bb = path.getBoundingBox();
  const cx = (bb.x1 + bb.x2) / 2;
  const cy = (bb.y1 + bb.y2) / 2;
  // 중심 이동을 패스 좌표에 직접 반영
  for (const cmd of path.commands) {
    const c = cmd as unknown as Record<string, number | string>;
    if (typeof c.x === 'number') { c.x -= cx; c.y = (c.y as number) - cy; }
    if (typeof c.x1 === 'number') { c.x1 -= cx; c.y1 = (c.y1 as number) - cy; }
    if (typeof c.x2 === 'number') { c.x2 -= cx; c.y2 = (c.y2 as number) - cy; }
  }
  const result: GlyphPath = {
    d: path.toPathData(2),
    width: bb.x2 - bb.x1,
    height: bb.y2 - bb.y1,
  };
  PATH_CACHE[key] = result;
  return result;
}
