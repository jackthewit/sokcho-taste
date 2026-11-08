// 조합 내보내기 (전체 / 크롭)
import type { SenseState } from '../context/SenseContext';
import { buildCompositionSVG, downloadText, downloadPng, stamp } from './svgBuilder';

function baseName(state: SenseState): string {
  const food = state.foodName ? `-${state.foodName.replace(/\s+/g, '_')}` : '';
  return `SOKCHO_BI_${state.season.toUpperCase()}${food}_${stamp()}`;
}

export function exportCompositionSVG(state: SenseState, cropped: boolean) {
  if (!state.layers.length) return;
  const region = cropped ? state.crop : null;
  const svg = buildCompositionSVG(state, { region, pixelWidth: 2000 });
  downloadText(`${baseName(state)}${cropped ? '_CROP' : ''}.svg`, svg);
}

export async function exportCompositionPNG(state: SenseState, cropped: boolean, pixelWidth = 2400) {
  if (!state.layers.length) return;
  const region = cropped && state.crop ? state.crop : { x: 0, y: 0, w: 1000, h: 1000 };
  const svg = buildCompositionSVG(state, { region, pixelWidth });
  await downloadPng(`${baseName(state)}${cropped ? '_CROP' : ''}.png`, svg, pixelWidth, Math.round(pixelWidth * region.h / region.w));
}

// 이전 이름 호환
export const exportToSVG = (state: SenseState) => exportCompositionSVG(state, false);
