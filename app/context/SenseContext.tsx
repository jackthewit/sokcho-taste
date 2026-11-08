'use client';

// 조합(레이어) · 크롭 · 패턴화 · 명함 상태를 한곳에서 관리
import React, { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { Season, TasteType } from '../constants/colors';
import { TextureType, IntensityLevel } from '../constants/keymap';

export const CANVAS = 1000; // 조합 캔버스 좌표계 (정사각형)

export type TasteKey = Exclude<TasteType, 'bland'>;
export type LayerCategory = 'taste' | 'texture';

export interface Layer {
  id: string;
  category: LayerCategory;
  type: TasteKey | TextureType;
  intensity: IntensityLevel;
  x: number;         // 중심 좌표 (캔버스 단위)
  y: number;
  size: number;      // 글리프 기준 크기(100) 대비 배율 → 실제 크기 단위
  rotation: number;  // 도(deg)
  color: string;     // 'auto' = 계절 팔레트(맛) / 무채색(식감), 그 외 hex
  opacity: number;   // 0~1
  visible: boolean;
}

export interface CropRect { x: number; y: number; w: number; h: number; }
export type TileMode = 'grid' | 'brick' | 'mirror';

export type CardKind = 'personal' | 'store';
export type CardLayout = 'A' | 'B' | 'C';
export type CardBg = 'white' | 'black' | 'season';
export type FontId = 'noto-sans-kr' | 'noto-serif-kr' | 'nanum-myeongjo' | 'gowun-batang';

export interface CardFields {
  name: string;
  nameEn: string;
  title: string;
  org: string;
  phone: string;
  email: string;
  instagram: string;
  website: string;
  address: string;
  storeName: string;
  storeNameEn: string;
  storeSub: string;   // 가게 한 줄 소개 / 업종
  hours: string;
}

export interface CardState {
  kind: CardKind;
  layout: CardLayout;
  bg: CardBg;
  accentTaste: TasteKey;   // 계절색 바탕/포인트 색에 쓸 맛
  font: FontId;
  bleed: boolean;          // 재단 여백 2mm 포함
  patternFit: 'cover' | 'tile';
  patternScale: number;    // tile 모드일 때 가로 반복 수
  fields: CardFields;
}

export interface SenseState {
  season: Season;
  layers: Layer[];        // 배열 뒤쪽이 위(앞)에 그려짐
  selectedId: string | null;
  foodName: string;
  background: string;     // 'transparent' 또는 hex
  crop: CropRect | null;
  cropAspect: number | null; // 가로/세로 비율 고정 (null = 자유)
  tile: { mode: TileMode; scale: number; };
  card: CardState;
}

export const FONT_LABELS: Record<FontId, string> = {
  'noto-sans-kr': 'Noto Sans KR (고딕)',
  'noto-serif-kr': 'Noto Serif KR (명조)',
  'nanum-myeongjo': '나눔명조',
  'gowun-batang': '고운바탕',
};

export const FONT_FAMILIES: Record<FontId, string> = {
  'noto-sans-kr': "'Noto Sans KR', sans-serif",
  'noto-serif-kr': "'Noto Serif KR', serif",
  'nanum-myeongjo': "'Nanum Myeongjo', serif",
  'gowun-batang': "'Gowun Batang', serif",
};

const defaultCard: CardState = {
  kind: 'personal',
  layout: 'A',
  bg: 'white',
  accentTaste: 'sweet',
  font: 'noto-sans-kr',
  bleed: false,
  patternFit: 'cover',
  patternScale: 3,
  fields: {
    name: '', nameEn: '', title: '', org: '',
    phone: '', email: '', instagram: '', website: '', address: '',
    storeName: '', storeNameEn: '', storeSub: '', hours: '',
  },
};

const initialState: SenseState = {
  season: 'spring',
  layers: [],
  selectedId: null,
  foodName: '',
  background: '#ffffff',
  crop: null,
  cropAspect: null,
  tile: { mode: 'grid', scale: 3 },
  card: defaultCard,
};

// ─── Actions ─────────────────────────────────────────────
type SenseAction =
  | { type: 'SET_SEASON'; payload: Season }
  | { type: 'ADD_LAYER'; payload: { category: LayerCategory; type: TasteKey | TextureType } }
  | { type: 'UPDATE_LAYER'; payload: { id: string; patch: Partial<Layer> } }
  | { type: 'REMOVE_LAYER'; payload: string }
  | { type: 'DUPLICATE_LAYER'; payload: string }
  | { type: 'MOVE_LAYER'; payload: { id: string; dir: 'up' | 'down' | 'top' | 'bottom' } }
  | { type: 'SELECT_LAYER'; payload: string | null }
  | { type: 'SET_FOOD_NAME'; payload: string }
  | { type: 'SET_BACKGROUND'; payload: string }
  | { type: 'SET_CROP'; payload: CropRect | null }
  | { type: 'SET_CROP_ASPECT'; payload: number | null }
  | { type: 'SET_TILE'; payload: Partial<SenseState['tile']> }
  | { type: 'SET_CARD'; payload: Partial<CardState> }
  | { type: 'SET_CARD_FIELD'; payload: { key: keyof CardFields; value: string } }
  | { type: 'RESET' }
  | { type: 'UNDO' }
  | { type: 'SNAPSHOT' }
  | { type: 'LOAD'; payload: SenseState };

let idSeq = 1;
const newId = () => `L${Date.now().toString(36)}${(idSeq++).toString(36)}`;

function clampCrop(c: CropRect): CropRect {
  const w = Math.max(40, Math.min(CANVAS, c.w));
  const h = Math.max(40, Math.min(CANVAS, c.h));
  const x = Math.max(0, Math.min(CANVAS - w, c.x));
  const y = Math.max(0, Math.min(CANVAS - h, c.y));
  return { x, y, w, h };
}

export function aspectCrop(aspect: number | null, base?: CropRect | null): CropRect {
  // 비율에 맞는 기본 크롭(캔버스 중앙, 가능한 크게)
  const cx = base ? base.x + base.w / 2 : CANVAS / 2;
  const cy = base ? base.y + base.h / 2 : CANVAS / 2;
  let w = base ? base.w : CANVAS * 0.7;
  let h = base ? base.h : CANVAS * 0.7;
  if (aspect) {
    if (w / h > aspect) w = h * aspect; else h = w / aspect;
    if (w > CANVAS) { w = CANVAS; h = w / aspect; }
    if (h > CANVAS) { h = CANVAS; w = h * aspect; }
  }
  return clampCrop({ x: cx - w / 2, y: cy - h / 2, w, h });
}

function coreReducer(state: SenseState, action: SenseAction): SenseState {
  switch (action.type) {
    case 'SET_SEASON':
      return { ...state, season: action.payload };

    case 'ADD_LAYER': {
      const n = state.layers.length;
      const jitter = (n % 5) * 60 - 120;
      const layer: Layer = {
        id: newId(),
        category: action.payload.category,
        type: action.payload.type,
        intensity: 3,
        x: CANVAS / 2 + jitter,
        y: CANVAS / 2 + ((n * 37) % 240) - 120,
        size: action.payload.category === 'taste' ? 5.5 : 4.5,
        rotation: 0,
        color: 'auto',
        opacity: action.payload.category === 'taste' ? 0.9 : 0.75,
        visible: true,
      };
      return { ...state, layers: [...state.layers, layer], selectedId: layer.id };
    }

    case 'UPDATE_LAYER':
      return {
        ...state,
        layers: state.layers.map(l => (l.id === action.payload.id ? { ...l, ...action.payload.patch } : l)),
      };

    case 'REMOVE_LAYER': {
      const layers = state.layers.filter(l => l.id !== action.payload);
      const selectedId = state.selectedId === action.payload
        ? (layers.length ? layers[layers.length - 1].id : null)
        : state.selectedId;
      return { ...state, layers, selectedId };
    }

    case 'DUPLICATE_LAYER': {
      const idx = state.layers.findIndex(l => l.id === action.payload);
      if (idx < 0) return state;
      const src = state.layers[idx];
      const copy: Layer = { ...src, id: newId(), x: Math.min(CANVAS - 20, src.x + 40), y: Math.min(CANVAS - 20, src.y + 40) };
      const layers = [...state.layers];
      layers.splice(idx + 1, 0, copy);
      return { ...state, layers, selectedId: copy.id };
    }

    case 'MOVE_LAYER': {
      const idx = state.layers.findIndex(l => l.id === action.payload.id);
      if (idx < 0) return state;
      const layers = [...state.layers];
      const [item] = layers.splice(idx, 1);
      let to = idx;
      if (action.payload.dir === 'up') to = Math.min(layers.length, idx + 1);
      if (action.payload.dir === 'down') to = Math.max(0, idx - 1);
      if (action.payload.dir === 'top') to = layers.length;
      if (action.payload.dir === 'bottom') to = 0;
      layers.splice(to, 0, item);
      return { ...state, layers };
    }

    case 'SELECT_LAYER':
      return { ...state, selectedId: action.payload };

    case 'SET_FOOD_NAME':
      return { ...state, foodName: action.payload };

    case 'SET_BACKGROUND':
      return { ...state, background: action.payload };

    case 'SET_CROP':
      return { ...state, crop: action.payload ? clampCrop(action.payload) : null };

    case 'SET_CROP_ASPECT':
      return { ...state, cropAspect: action.payload, crop: aspectCrop(action.payload, state.crop) };

    case 'SET_TILE':
      return { ...state, tile: { ...state.tile, ...action.payload } };

    case 'SET_CARD':
      return { ...state, card: { ...state.card, ...action.payload } };

    case 'SET_CARD_FIELD':
      return { ...state, card: { ...state.card, fields: { ...state.card.fields, [action.payload.key]: action.payload.value } } };

    case 'RESET':
      return { ...initialState, season: state.season, card: state.card };

    case 'LOAD':
      return { ...initialState, ...action.payload, card: { ...defaultCard, ...action.payload.card, fields: { ...defaultCard.fields, ...(action.payload.card?.fields || {}) } } };

    default:
      return state;
  }
}

// ─── 되돌리기(Undo) 지원 ─────────────────────────────────
interface HistoryState { present: SenseState; past: SenseState[]; }
const UNDOABLE = new Set(['ADD_LAYER', 'REMOVE_LAYER', 'DUPLICATE_LAYER', 'MOVE_LAYER', 'RESET', 'SET_CROP', 'SET_CROP_ASPECT', 'SET_SEASON']);

function historyReducer(h: HistoryState, action: SenseAction): HistoryState {
  if (action.type === 'UNDO') {
    if (!h.past.length) return h;
    const past = [...h.past];
    const present = past.pop()!;
    return { present, past };
  }
  if (action.type === 'SNAPSHOT') {
    // 드래그/슬라이더 조작 시작 시점을 되돌리기 지점으로 기록
    return { present: h.present, past: [...h.past.slice(-49), h.present] };
  }
  const next = coreReducer(h.present, action);
  if (next === h.present) return h;
  const past = UNDOABLE.has(action.type) ? [...h.past.slice(-49), h.present] : h.past;
  return { present: next, past };
}

// ─── Context ─────────────────────────────────────────────
interface SenseContextType {
  state: SenseState;
  dispatch: React.Dispatch<SenseAction>;
  canUndo: boolean;
  /** 드래그 시작 시점을 히스토리에 남기고 싶을 때 */
  snapshot: () => void;
}

const SenseContext = createContext<SenseContextType | undefined>(undefined);
const STORAGE_KEY = 'sokcho-bi-composer-v2';

export function SenseProvider({ children }: { children: ReactNode }) {
  const [h, dispatch] = useReducer(historyReducer, { present: initialState, past: [] });

  // 저장된 작업 불러오기
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SenseState;
        if (parsed && Array.isArray(parsed.layers)) dispatch({ type: 'LOAD', payload: parsed });
      }
    } catch { /* 저장소를 못 읽어도 동작에는 지장 없음 */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h.present)); } catch { /* 무시 */ }
  }, [h.present]);

  const snapshot = React.useCallback(() => dispatch({ type: 'SNAPSHOT' }), []);

  return (
    <SenseContext.Provider value={{ state: h.present, dispatch, canUndo: h.past.length > 0, snapshot }}>
      {children}
    </SenseContext.Provider>
  );
}

export function useSense(): SenseContextType {
  const context = useContext(SenseContext);
  if (!context) throw new Error('useSense must be used within a SenseProvider');
  return context;
}
