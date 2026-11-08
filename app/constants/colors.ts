// 계절별 컬러 매트릭스 (Page 48 기반)
// Season × Taste → HEX Color

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TasteType = 'sweet' | 'salty' | 'spicy' | 'sour' | 'bitter' | 'umami' | 'bland';

export const SEASON_LABELS: Record<Season, string> = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  winter: '겨울',
};

export const TASTE_LABELS: Record<TasteType, string> = {
  sweet: '단맛',
  salty: '짠맛',
  spicy: '매운맛',
  sour: '신맛',
  bitter: '쓴맛',
  umami: '감칠맛',
  bland: '무맛',
};

export const TASTE_LABELS_EN: Record<TasteType, string> = {
  sweet: 'Sweet',
  salty: 'Salty',
  spicy: 'Spicy',
  sour: 'Sour',
  bitter: 'Bitter',
  umami: 'Umami',
  bland: 'Bland',
};

export const SEASONAL_COLORS: Record<Season, Record<TasteType, string>> = {
  spring: {
    sweet:  '#ff69df',
    spicy:  '#ff6d64',
    sour:   '#fff143',
    salty:  '#a4daff',
    bitter: '#d1f589',
    umami:  '#e7d8c1',
    bland:  '#aaaaaa',
  },
  summer: {
    sweet:  '#ffceff',
    spicy:  '#ff3500',
    sour:   '#f3ff00',
    salty:  '#00f9ff',
    bitter: '#00ff00',
    umami:  '#886829',
    bland:  '#888888',
  },
  autumn: {
    sweet:  '#ffb3a1',
    spicy:  '#ea2e00',
    sour:   '#ffcc83',
    salty:  '#7d9aaa',
    bitter: '#d8e0a4',
    umami:  '#966855',
    bland:  '#777777',
  },
  winter: {
    sweet:  '#ff00ff',
    spicy:  '#fb3f59',
    sour:   '#edecd1',
    salty:  '#0019ff',
    bitter: '#c1ff00',
    umami:  '#4d373e',
    bland:  '#555555',
  },
};


// 계절별 대표 그라디언트 배경 (UI 분위기용)
export const SEASON_GRADIENTS: Record<Season, string> = {
  spring: 'linear-gradient(135deg, #ff69df20, #ff6d6420)',
  summer: 'linear-gradient(135deg, #ff350020, #00f9ff20)',
  autumn: 'linear-gradient(135deg, #ea2e0020, #ffb3a120)',
  winter: 'linear-gradient(135deg, #ff00ff20, #0019ff20)',
};

// 계절별 대표색 (탭 인디케이터용)
export const SEASON_ACCENT: Record<Season, string> = {
  spring: '#ff69df',
  summer: '#ff3500',
  autumn: '#ea2e00',
  winter: '#0019ff',
};
