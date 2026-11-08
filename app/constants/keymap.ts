// 키패드 매핑 정의
// 3×4 그리드: 맛(Taste) 키 + 식감(Texture) 키

import { TasteType } from './colors';

export type TextureType = 'soft' | 'rich' | 'moist' | 'chewy' | 'crispy' | 'crunchy';

export const TEXTURE_LABELS: Record<TextureType, string> = {
  soft:    '부드러움',
  rich:    '꾸덕함',
  moist:   '촉촉함',
  chewy:   '쫀득함',
  crispy:  '바삭함',
  crunchy: '아삭함',
};

export const TEXTURE_LABELS_EN: Record<TextureType, string> = {
  soft:    'Soft',
  rich:    'Rich',
  moist:   'Moist',
  chewy:   'Chewy',
  crispy:  'Crispy',
  crunchy: 'Crunchy',
};

// ─── SOKCHO Culinary 폰트 글리프 매핑 ─────────────────────────────────────
// 분석 결과: SOKCHOCulinary 폰트는 아래 문자에만 커스텀 심볼이 있음:
//   숫자: 0 1 2 3 4 5 6 7 8 9
//   특수: * + -  (U+002A, U+002B, U+002D)
//
// 키패드 번호와 글리프를 1:1 매핑:
//   맛(Taste):    1=단, 2=감칠, 3=촉촉, 4=매, 5=신, 6=쓴, 7=단(2), 8=짠
//   식감(Texture): 9=부드러움, *=쫀득함, -=바삭함, +=아삭아삭함
// ────────────────────────────────────────────────────────────────────────────

// 맛 글리프: 숫자 키가 곧 SOKCHOCulinary 심볼
export const TASTE_GLYPHS: Record<Exclude<TasteType, 'bland'>, string> = {
  sweet:  '7',
  salty:  '8',
  spicy:  '4',
  sour:   '5',
  bitter: '1',
  umami:  '2',
};

// 식감 글리프: 각 식감에 고정 문자 배정, 강도는 font-weight로 표현
export const TEXTURE_GLYPHS: Record<TextureType, string[]> = {
  soft:    ['9', '9', '9', '9', '9', '9'],
  chewy:   ['*', '*', '*', '*', '*', '*'],
  moist:   ['3', '3', '3', '3', '3', '3'],
  rich:    ['6', '6', '6', '6', '6', '6'],
  crispy:  ['-', '-', '-', '-', '-', '-'],
  crunchy: ['+', '+', '+', '+', '+', '+'],
};

// 강도(Intensity) → 폰트 Weight 매핑
export const INTENSITY_WEIGHTS = [400, 500, 600, 700, 800, 900] as const;
export type IntensityLevel = 1 | 2 | 3 | 4 | 5 | 6;

export function getWeightForIntensity(level: IntensityLevel): number {
  return INTENSITY_WEIGHTS[level - 1];
}

// 키패드 그리드 정의 (3열 × 4행)
export interface KeypadItem {
  key: string;           
  type: 'taste' | 'texture' | 'functional' | 'spacer';
  value: TasteType | TextureType | string;
  label: string;
  rowSpan?: number;
}

export const KEYPAD_LAYOUT: KeypadItem[][] = [
  // Row 1: /, *, -
  [
    { key: '',  type: 'spacer',     value: '',        label: '' },
    { key: '/', type: 'functional', value: 'clear',   label: '' },
    { key: '*', type: 'texture',    value: 'chewy',   label: '쫀득함' },
    { key: '-', type: 'texture',    value: 'crispy',  label: '바삭함' },
  ],
  // Row 2: 7, 8, 9, + (span 2)
  [
    { key: '7', type: 'taste',      value: 'sweet',   label: '단맛' },
    { key: '8', type: 'taste',      value: 'salty',   label: '짠맛' },
    { key: '9', type: 'texture',    value: 'soft',    label: '부드러움' },
    { key: '+', type: 'texture',    value: 'crunchy', label: '아삭함', rowSpan: 2 },
  ],
  // Row 3: 4, 5, 6
  [
    { key: '4', type: 'taste',      value: 'spicy',   label: '매운맛' },
    { key: '5', type: 'taste',      value: 'sour',    label: '신맛' },
    { key: '6', type: 'texture',    value: 'rich',    label: '꾸덕함' },
    // + is spanning from above
  ],
  // Row 4: 1, 2, 3
  [
    { key: '1', type: 'taste',      value: 'bitter',  label: '쓴맛' },
    { key: '2', type: 'taste',      value: 'umami',   label: '감칠맛' },
    { key: '3', type: 'texture',    value: 'moist',   label: '촉촉함' },
    { key: '',  type: 'spacer',     value: '',        label: '' },
  ],
  // Row 5: 00, 0, .
  [
    { key: '00', type: 'functional', value: '00',     label: '' },
    { key: '0',  type: 'functional', value: '0',      label: '' },
    { key: '.',  type: 'functional', value: '.',      label: '' },
    { key: '',   type: 'spacer',     value: '',       label: '' },
  ],
];

// 무채색 (Texture용)
export const TEXTURE_COLOR = '#9A9A9A';
export const TEXTURE_WEIGHT = 600;

