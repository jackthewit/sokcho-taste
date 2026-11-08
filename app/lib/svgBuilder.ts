// 조합 → SVG 문자열 빌더 (화면 미리보기와 다운로드가 같은 함수를 공유)
import { SEASONAL_COLORS } from '../constants/colors';
import { TEXTURE_COLOR } from '../constants/keymap';
import { getGlyphPath } from './glyphs';
import { CANVAS, type CropRect, type Layer, type SenseState, type TasteKey, type TileMode } from '../context/SenseContext';
import { noteExport } from './works';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function resolveColor(layer: Layer, season: SenseState['season']): string {
  if (layer.color && layer.color !== 'auto') return layer.color;
  if (layer.category === 'taste') return SEASONAL_COLORS[season][layer.type as TasteKey];
  return TEXTURE_COLOR;
}

export interface LayerRender {
  id: string;
  d: string;
  transform: string;
  fill: string;
  opacity: number;
  /** 회전 전 바운딩 박스 (캔버스 단위) */
  bbox: { x: number; y: number; w: number; h: number };
}

export function renderLayer(layer: Layer, season: SenseState['season']): LayerRender {
  const g = getGlyphPath(layer.category, layer.type, layer.intensity);
  const w = g.width * layer.size;
  const h = g.height * layer.size;
  return {
    id: layer.id,
    d: g.d,
    transform: `translate(${r(layer.x)} ${r(layer.y)}) rotate(${r(layer.rotation)}) scale(${r(layer.size)})`,
    fill: resolveColor(layer, season),
    opacity: layer.opacity,
    bbox: { x: layer.x - w / 2, y: layer.y - h / 2, w, h },
  };
}

const r = (n: number) => Math.round(n * 100) / 100;

export function layersMarkup(state: SenseState): string {
  return state.layers
    .filter(l => l.visible)
    .map(l => {
      const lr = renderLayer(l, state.season);
      return `<path d="${lr.d}" transform="${lr.transform}" fill="${lr.fill}" opacity="${r(lr.opacity)}" fill-rule="nonzero"/>`;
    })
    .join('\n    ');
}

export const SVG_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** 전체 또는 크롭 영역의 조합 SVG */
export function buildCompositionSVG(state: SenseState, opts: { region?: CropRect | null; pixelWidth?: number; transparent?: boolean; uid?: string } = {}): string {
  const cid = `${opts.uid ?? 'c'}-crop`;
  const region = opts.region ?? { x: 0, y: 0, w: CANVAS, h: CANVAS };
  const pw = opts.pixelWidth ?? 2000;
  const ph = Math.round(pw * region.h / region.w);
  const bg = opts.transparent || state.background === 'transparent'
    ? ''
    : `<rect x="${r(region.x)}" y="${r(region.y)}" width="${r(region.w)}" height="${r(region.h)}" fill="${state.background}"/>`;
  return `${SVG_HEADER}<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(region.x)} ${r(region.y)} ${r(region.w)} ${r(region.h)}" width="${pw}" height="${ph}">
  <defs><clipPath id="${cid}"><rect x="${r(region.x)}" y="${r(region.y)}" width="${r(region.w)}" height="${r(region.h)}"/></clipPath></defs>
  ${bg}
  <g clip-path="url(#${cid})">
    ${layersMarkup(state)}
  </g>
</svg>`;
}

// ─── 패턴(타일) ─────────────────────────────────────────
export interface TileOpts {
  id: string;
  crop: CropRect;
  mode: TileMode;
  tileWidth: number;      // 대상 좌표계에서 타일 하나의 가로 크기
  withBackground: boolean;
  offsetX?: number;
  offsetY?: number;
}

/** <pattern> 정의 문자열. 크롭 영역을 타일로 반복 */
export function buildPatternDef(state: SenseState, o: TileOpts): string {
  const { crop } = o;
  const s = o.tileWidth / crop.w;
  const tw = crop.w * s;
  const th = crop.h * s;
  const clipId = `${o.id}-clip`;
  const unitId = `${o.id}-unit`;
  const bg = o.withBackground && state.background !== 'transparent'
    ? `<rect x="${r(crop.x)}" y="${r(crop.y)}" width="${r(crop.w)}" height="${r(crop.h)}" fill="${state.background}"/>`
    : '';
  const unit = `<g id="${unitId}" clip-path="url(#${clipId})">${bg}${layersMarkup(state)}</g>`;
  const place = (tx: number, ty: number, flipX = false, flipY = false) =>
    `<use href="#${unitId}" transform="translate(${r(tx)} ${r(ty)}) scale(${s * (flipX ? -1 : 1)} ${s * (flipY ? -1 : 1)}) translate(${r(-crop.x - (flipX ? crop.w : 0))} ${r(-crop.y - (flipY ? crop.h : 0))})"/>`;

  let pw = tw, ph = th, body = '';
  if (o.mode === 'grid') {
    body = place(0, 0);
  } else if (o.mode === 'brick') {
    // 엇갈림(하프드롭): 옆 열을 반 칸 내림
    pw = tw * 2;
    body = place(0, 0) + place(tw, th / 2) + place(tw, -th / 2);
  } else {
    // 거울: 가로·세로로 뒤집어 이어 붙임
    pw = tw * 2; ph = th * 2;
    body = place(0, 0) + place(tw, 0, true) + place(0, th, false, true) + place(tw, th, true, true);
  }
  return `<clipPath id="${clipId}"><rect x="${r(crop.x)}" y="${r(crop.y)}" width="${r(crop.w)}" height="${r(crop.h)}"/></clipPath>
    <defs>${unit}</defs>
    <pattern id="${o.id}" patternUnits="userSpaceOnUse" x="${r(o.offsetX ?? 0)}" y="${r(o.offsetY ?? 0)}" width="${r(pw)}" height="${r(ph)}">${body}</pattern>`;
}

// ─── 옷 실루엣 ───────────────────────────────────────────
export type GarmentId = 'swatch' | 'tshirt' | 'apron' | 'tote' | 'vest';
export const GARMENT_LABELS: Record<GarmentId, string> = {
  swatch: '원단 샘플',
  tshirt: '티셔츠',
  apron: '앞치마',
  tote: '에코백',
  vest: '조끼',
};

interface Garment {
  fillPaths: string[];                      // 패턴으로 채울 면
  strokes?: string[];                       // 선 디테일
  stroke?: string;
}

const GARMENTS: Record<GarmentId, Garment> = {
  swatch: { fillPaths: ['M60,60 H940 V940 H60 Z'] },
  tshirt: {
    fillPaths: ['M400,215 Q500,330 600,215 L745,275 L880,490 L770,555 L705,480 L705,905 Q705,925 685,925 L315,925 Q295,925 295,905 L295,480 L230,555 L120,490 L255,275 Z'],
    strokes: ['M400,215 Q500,330 600,215', 'M705,480 L770,555', 'M295,480 L230,555', 'M420,235 Q500,345 580,235'],
  },
  apron: {
    fillPaths: ['M375,150 L625,150 L645,415 Q830,430 830,480 L830,905 Q830,935 800,935 L200,935 Q170,935 170,905 L170,480 Q170,430 355,415 Z'],
    strokes: ['M395,150 C395,40 605,40 605,150', 'M170,485 L50,575', 'M830,485 L950,575', 'M395,560 H605 V730 Q605,745 590,745 H410 Q395,745 395,730 Z'],
  },
  tote: {
    fillPaths: ['M230,350 Q230,330 250,330 L750,330 Q770,330 770,350 L770,905 Q770,930 745,930 L255,930 Q230,930 230,905 Z'],
    strokes: ['M335,330 C335,120 665,120 665,330', 'M380,330 C380,175 620,175 620,330', 'M230,420 H770'],
  },
  vest: {
    fillPaths: ['M500,345 L385,170 Q335,165 300,185 L215,270 Q200,420 240,480 L240,900 Q240,925 265,925 L480,895 Q500,892 520,895 L735,925 Q760,925 760,900 L760,480 Q800,420 785,270 L700,185 Q665,165 615,170 Z'],
    strokes: ['M500,345 L500,895', 'M300,660 H420 V800 H300 Z', 'M580,660 H700 V800 H580 Z', 'M500,470 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0', 'M500,600 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0', 'M500,730 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0'],
  },
};

/** 옷 실루엣에 패턴을 적용한 SVG (1000×1000) */
export function buildGarmentSVG(state: SenseState, garment: GarmentId, crop: CropRect, opts: { pixelWidth?: number; fabric?: string; uid?: string } = {}): string {
  const g = GARMENTS[garment];
  const pw = opts.pixelWidth ?? 1600;
  const tid = `${opts.uid ?? 'g'}-tile`;
  const tileWidth = 1000 / Math.max(1, state.tile.scale);
  const def = buildPatternDef(state, { id: tid, crop, mode: state.tile.mode, tileWidth, withBackground: true });
  const base = opts.fabric ?? (state.background === 'transparent' ? '#f4f4f4' : state.background);
  const fill = g.fillPaths.map(d => `<path d="${d}" fill="${base}"/><path d="${d}" fill="url(#${tid})" stroke="#111" stroke-width="5" stroke-linejoin="round"/>`).join('\n  ');
  const strokes = (g.strokes || []).map(d => `<path d="${d}" fill="none" stroke="${g.stroke ?? '#111'}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');
  return `${SVG_HEADER}<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1000 1000" width="${pw}" height="${pw}">
  <defs>${def}</defs>
  ${fill}
  ${strokes}
</svg>`;
}

/** 평면 타일 미리보기(원단) — 크기 비율 유지 */
export function buildTileSheetSVG(state: SenseState, crop: CropRect, opts: { width?: number; height?: number; pixelWidth?: number; uid?: string } = {}): string {
  const W = opts.width ?? 1000, H = opts.height ?? 1000;
  const pw = opts.pixelWidth ?? 1600;
  const tid = `${opts.uid ?? 's'}-tile`;
  const tileWidth = W / Math.max(1, state.tile.scale);
  const def = buildPatternDef(state, { id: tid, crop, mode: state.tile.mode, tileWidth, withBackground: true });
  const bg = state.background === 'transparent' ? '' : `<rect width="${W}" height="${H}" fill="${state.background}"/>`;
  return `${SVG_HEADER}<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${pw}" height="${Math.round(pw * H / W)}">
  <defs>${def}</defs>
  ${bg}
  <rect width="${W}" height="${H}" fill="url(#${tid})"/>
</svg>`;
}

// ─── 다운로드 도우미 ─────────────────────────────────────
export function downloadText(filename: string, content: string, mime = 'image/svg+xml;charset=utf-8') {
  noteExport(filename);
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('SVG 렌더 실패')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('PNG 변환 실패'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(filename: string, svg: string, width: number, height: number) {
  noteExport(filename);
  const blob = await svgToPngBlob(svg, width, height);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
