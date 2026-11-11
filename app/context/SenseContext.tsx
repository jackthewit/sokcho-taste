'use client';

// 조합(레이어) · 크롭 · 패턴화 · 명함 상태를 한곳에서 관리
import React, { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { Season, TasteType } from '../constants/colors';
import { TextureType, IntensityLevel } from '../constants/keymap';
import { createWork, loadWork, loadWorkLocal, loadWorkRemoteIfNewer, saveWork, subscribeWork, currentWorkId, setCurrentWorkId, setActiveWorkId, type WorkData, type WorkDoc } from '../lib/works';

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
export type CardBg = 'white' | 'black' | 'season';
export type FontId = 'noto-sans-kr' | 'noto-serif-kr' | 'nanum-myeongjo' | 'gowun-batang';
/** 9칸 위치: 위/가운데/아래 × 왼쪽/가운데/오른쪽 */
export type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
export type LogoType = 'org' | 'pattern' | 'glyph' | 'none'; // 'org' 는 이전 버전 호환용(불러올 때 변환)
export type CardPreset = 'classic-left' | 'classic-right' | 'center' | 'watermark' | 'bar';

export interface CardFields {
  name: string;
  nameEn: string;
  title: string;
  org: string;        // 소속 (가게용에서는 가게 이름)
  orgEn: string;      // 소속 영문
  tagline: string;    // 로고 옆 짧은 문구 (예: 함께하여 아름다운 / 물회·섭국 전문)
  phone: string;      // H.P
  tel: string;        // Tel
  fax: string;
  email: string;
  instagram: string;
  website: string;
  address: string;
  hours: string;
  // 이전 버전 호환
  storeName: string;
  storeNameEn: string;
  storeSub: string;
}

export interface CardState {
  kind: CardKind;
  preset: CardPreset;
  bg: CardBg;
  accentTaste: TasteKey;
  font: FontId;
  bleed: boolean;
  patternFit: 'cover' | 'tile';
  patternScale: number;
  margin: number;                 // 안쪽 여백 (0.1mm 단위)
  divider: boolean;               // 이름 아래 짧은 구분선
  accentBar: boolean;             // 왼쪽 세로 포인트 띠
  /** 마크(패턴 크롭 / 글리프) 블록 */
  logo: { type: LogoType; pos: Anchor; size: number; shape: 'rect' | 'circle' | 'wide'; glyphLayerId?: string; color: 'point' | 'text' | 'auto'; opacity: number; dx: number; dy: number; };
  /** 소속/가게 이름 블록 — 마크에 붙이거나 자유 위치 */
  orgBlock: { show: boolean; attach: 'right' | 'below' | 'free'; pos: Anchor; size: number; dx: number; dy: number; };
  name: { pos: Anchor; size: number; spacing: number; en: 'inline' | 'below' | 'hidden'; titlePos: 'above' | 'inline' | 'below'; dx: number; dy: number; };
  contacts: { pos: Anchor; columns: 1 | 2; labels: 'word' | 'short' | 'none'; size: number; addressFirst: boolean; dx: number; dy: number; };
  fields: CardFields;
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

/** 프리셋 → 블록 배치 */
export const CARD_PRESETS: Record<CardPreset, { label: string; desc: string; apply: Partial<CardState> }> = {
  'classic-left': {
    label: '기본 · 왼쪽', desc: '소속 왼쪽 위 · 이름 가운데 · 연락처 아래 (1단)',
    apply: { logo: { type: 'glyph', pos: 'tl', size: 0.8, shape: 'rect', color: 'point', opacity: 1, dx: 0, dy: 0 }, orgBlock: { show: true, attach: 'right', pos: 'tl', size: 1, dx: 0, dy: 0 }, name: { pos: 'ml', size: 1, spacing: 0.3, en: 'hidden', titlePos: 'above', dx: 0, dy: 0 }, contacts: { pos: 'bl', columns: 1, labels: 'word', size: 1, addressFirst: true, dx: 0, dy: 0 }, divider: false, accentBar: false },
  },
  'classic-right': {
    label: '기본 · 오른쪽', desc: '소속 오른쪽 위 · 이름+영문 · 연락처 2단',
    apply: { logo: { type: 'none', pos: 'tr', size: 0.8, shape: 'rect', color: 'point', opacity: 1, dx: 0, dy: 0 }, orgBlock: { show: true, attach: 'free', pos: 'tr', size: 1, dx: 0, dy: 0 }, name: { pos: 'ml', size: 1, spacing: 0.3, en: 'inline', titlePos: 'above', dx: 0, dy: 0 }, contacts: { pos: 'bl', columns: 2, labels: 'word', size: 1, addressFirst: false, dx: 0, dy: 0 }, divider: false, accentBar: false },
  },
  center: {
    label: '가운데', desc: '패턴 마크 위 가운데 · 이름 가운데 · 연락처 아래 가운데',
    apply: { logo: { type: 'pattern', pos: 'tc', size: 0.9, shape: 'circle', color: 'point', opacity: 1, dx: 0, dy: 0 }, orgBlock: { show: true, attach: 'below', pos: 'tc', size: 0.9, dx: 0, dy: 0 }, name: { pos: 'mc', size: 1, spacing: 0.2, en: 'below', titlePos: 'above', dx: 0, dy: 30 }, contacts: { pos: 'bc', columns: 1, labels: 'short', size: 0.95, addressFirst: false, dx: 0, dy: 0 }, divider: true, accentBar: false },
  },
  watermark: {
    label: '워터마크', desc: '큰 글리프를 흐리게 깔고 · 이름 왼쪽 위 · 연락처 아래',
    apply: { logo: { type: 'glyph', pos: 'mr', size: 3.6, shape: 'rect', color: 'point', opacity: 0.14, dx: 40, dy: 0 }, orgBlock: { show: true, attach: 'free', pos: 'tr', size: 0.9, dx: 0, dy: 0 }, name: { pos: 'tl', size: 1, spacing: 0.2, en: 'below', titlePos: 'above', dx: 0, dy: 0 }, contacts: { pos: 'bl', columns: 1, labels: 'short', size: 1, addressFirst: false, dx: 0, dy: 0 }, divider: false, accentBar: false },
  },
  bar: {
    label: '포인트 바', desc: '세로 색 띠 · 마크+소속 오른쪽 아래 · 이름 왼쪽 위',
    apply: { logo: { type: 'glyph', pos: 'br', size: 1.1, shape: 'rect', color: 'point', opacity: 1, dx: 0, dy: 0 }, orgBlock: { show: true, attach: 'right', pos: 'br', size: 1, dx: 0, dy: 0 }, name: { pos: 'tl', size: 1, spacing: 0.1, en: 'below', titlePos: 'below', dx: 0, dy: 0 }, contacts: { pos: 'bl', columns: 1, labels: 'short', size: 1, addressFirst: false, dx: 0, dy: 0 }, divider: false, accentBar: true },
  },
};

const defaultCard: CardState = {
  kind: 'personal',
  preset: 'classic-left',
  bg: 'white',
  accentTaste: 'sweet',
  font: 'noto-sans-kr',
  bleed: false,
  patternFit: 'cover',
  patternScale: 3,
  margin: 60,
  divider: false,
  accentBar: false,
  ...(CARD_PRESETS['classic-left'].apply as Pick<CardState, 'logo' | 'orgBlock' | 'name' | 'contacts'>),
  fields: {
    name: '', nameEn: '', title: '', org: '', orgEn: '', tagline: '',
    phone: '', tel: '', fax: '', email: '', instagram: '', website: '', address: '', hours: '',
    storeName: '', storeNameEn: '', storeSub: '',
  },
};

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
  | { type: 'SET_CARD'; payload: Partial<Omit<CardState, 'logo' | 'orgBlock' | 'name' | 'contacts'>> & { logo?: Partial<CardState['logo']>; orgBlock?: Partial<CardState['orgBlock']>; name?: Partial<CardState['name']>; contacts?: Partial<CardState['contacts']> } }
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

    case 'SET_CARD': {
      const p = action.payload;
      return { ...state, card: {
        ...state.card, ...p,
        logo: { ...state.card.logo, ...(p.logo || {}) },
        orgBlock: { ...state.card.orgBlock, ...(p.orgBlock || {}) },
        name: { ...state.card.name, ...(p.name || {}) },
        contacts: { ...state.card.contacts, ...(p.contacts || {}) },
      } };
    }

    case 'SET_CARD_FIELD':
      return { ...state, card: { ...state.card, fields: { ...state.card.fields, [action.payload.key]: action.payload.value } } };

    case 'RESET':
      return { ...initialState, season: state.season, card: state.card };

    case 'LOAD': {
      const c = (action.payload.card || {}) as Partial<CardState> & { layout?: string };
      const fields = { ...defaultCard.fields, ...(c.fields || {}) };
      // 이전 버전(가게 이름 별도 필드) → 소속/문구로 옮김
      if (!fields.org && fields.storeName) fields.org = fields.storeName;
      if (!fields.orgEn && fields.storeNameEn) fields.orgEn = fields.storeNameEn;
      if (!fields.tagline && fields.storeSub) fields.tagline = fields.storeSub;
      const card: CardState = {
        ...defaultCard, ...c,
        logo: { ...defaultCard.logo, ...(c.logo || {}) },
        orgBlock: { ...defaultCard.orgBlock, ...(c.orgBlock || {}) },
        name: { ...defaultCard.name, ...(c.name || {}) },
        contacts: { ...defaultCard.contacts, ...(c.contacts || {}) },
        fields,
      };
      if (card.logo.type === 'org') { // 이전 버전: 글자 로고 → 마크 없음 + 소속 블록 자유 위치
        card.logo = { ...card.logo, type: 'none' };
        card.orgBlock = { ...card.orgBlock, show: true, attach: 'free', pos: card.logo.pos };
      }
      return { ...initialState, ...action.payload, card };
    }

    default:
      return state;
  }
}

// ─── 되돌리기(Undo) 지원 ─────────────────────────────────
interface HistoryState { present: SenseState; past: SenseState[]; }
const UNDOABLE = new Set(['ADD_LAYER', 'REMOVE_LAYER', 'DUPLICATE_LAYER', 'MOVE_LAYER', 'RESET', 'SET_CROP', 'SET_CROP_ASPECT', 'SET_SEASON']);

/** 저장된 작업 데이터를 앱이 여는 것과 똑같이 복원 (일괄 내보내기 스크립트 등에서 사용) */
export function stateFromWorkData(data: Partial<SenseState>): SenseState {
  return coreReducer(initialState, { type: 'LOAD', payload: { ...initialState, ...data, selectedId: null } as SenseState });
}

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
export interface WorkInfo { id: string; author: string; org: string; createdAt: number; }
export type SaveStatus = 'idle' | 'saving' | 'cloud' | 'local' | 'error' | 'remote';

interface SenseContextType {
  state: SenseState;
  dispatch: React.Dispatch<SenseAction>;
  canUndo: boolean;
  /** 드래그 시작 시점을 히스토리에 남기고 싶을 때 */
  snapshot: () => void;
  // 작업(저장) 관리
  work: WorkInfo | null;
  ready: boolean;              // 시작 시 불러오기가 끝났는지
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  startNewWork: (author: string, org: string) => Promise<void>;
  openWork: (id: string) => Promise<boolean>;
  closeWork: () => void;
}

const SenseContext = createContext<SenseContextType | undefined>(undefined);
const STORAGE_KEY = 'sokcho-bi-composer-v2'; // 작업이 없을 때의 임시 상태 보관용

export function pickWorkData(s: SenseState): WorkData {
  return { season: s.season, layers: s.layers, foodName: s.foodName, background: s.background, crop: s.crop, cropAspect: s.cropAspect, tile: s.tile, card: s.card };
}

export function SenseProvider({ children }: { children: ReactNode }) {
  const [h, dispatch] = useReducer(historyReducer, { present: initialState, past: [] });
  const [work, setWork] = React.useState<WorkInfo | null>(null);
  const [ready, setReady] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const lastSavedJson = React.useRef<string>('');
  const suppressSave = React.useRef(false); // 작업 전환 중 이전 작업에 저장되지 않도록
  const pendingRef = React.useRef<{ id: string; data: WorkData } | null>(null);

  const applyWork = React.useCallback((w: WorkDoc) => {
    dispatch({ type: 'LOAD', payload: { ...initialState, ...w.data } as SenseState });
    lastSavedJson.current = JSON.stringify(w.data);
    setWork({ id: w.id, author: w.author, org: w.org, createdAt: w.createdAt });
    setSaveStatus(w.cloud ? 'cloud' : 'local'); setLastSavedAt(w.updatedAt);
  }, []);

  // 시작: 이어서 할 작업이 있으면 기기 저장본을 즉시 열고, 클라우드에 더 최근 것이 있으면 뒤이어 반영
  useEffect(() => {
    let alive = true;
    (async () => {
      const id = currentWorkId();
      if (id) {
        const local = loadWorkLocal(id);
        if (local) { applyWork(local); setReady(true); }
        const w = local ? await loadWorkRemoteIfNewer(id, local.updatedAt) : await loadWork(id);
        if (!alive) return;
        if (w) applyWork(w);
        if (local || w) { setReady(true); return; }
        setCurrentWorkId(null);
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) { const parsed = JSON.parse(raw) as SenseState; if (parsed && Array.isArray(parsed.layers)) dispatch({ type: 'LOAD', payload: parsed }); }
      } catch { /* 무시 */ }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [applyWork]);

  // 자동 저장 (변경 후 1.2초 뒤)
  useEffect(() => {
    if (!ready) return;
    const data = pickWorkData(h.present);
    const json = JSON.stringify(data);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h.present)); } catch { /* 무시 */ } // 임시 상태(작업이 없을 때 복구용)
    if (!work || suppressSave.current) return;
    if (json === lastSavedJson.current) return;
    setSaveStatus('saving');
    pendingRef.current = { id: work.id, data };
    const t = setTimeout(async () => {
      pendingRef.current = null;
      let thumb: string | undefined;
      try {
        const { buildCompositionSVG } = await import('../lib/svgBuilder');
        if (data.layers.length) { const svg = buildCompositionSVG(h.present, { region: data.crop, pixelWidth: 160 }); if (svg.length < 60000) thumb = svg; }
      } catch { /* 썸네일 실패는 무시 */ }
      const r = await saveWork(work.id, data, thumb);
      lastSavedJson.current = json;
      setSaveStatus(r.cloud ? 'cloud' : 'local'); setLastSavedAt(Date.now());
    }, 1200);
    return () => clearTimeout(t);
  }, [h.present, work, ready]);

  const startNewWork = React.useCallback(async (author: string, org: string) => {
    const fresh: SenseState = { ...initialState, season: h.present.season };
    suppressSave.current = true; // 이전 작업에 빈 상태가 저장되지 않도록
    pendingRef.current = null;
    dispatch({ type: 'LOAD', payload: fresh });
    const data = pickWorkData(fresh);
    lastSavedJson.current = JSON.stringify(data);
    try {
      const w = await createWork(author, org, data);
      applyWork({ ...w, data });
    } finally { suppressSave.current = false; }
  }, [h.present.season, applyWork]);

  const openWork = React.useCallback(async (id: string) => {
    const local = loadWorkLocal(id);
    const w = local ? ((await loadWorkRemoteIfNewer(id, local.updatedAt)) || local) : await loadWork(id);
    if (!w) return false;
    pendingRef.current = null;
    applyWork(w);
    setCurrentWorkId(id);
    return true;
  }, [applyWork]);

  useEffect(() => {
    const flush = () => { const p = pendingRef.current; if (p) { pendingRef.current = null; void saveWork(p.id, p.data); } };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    return () => { window.removeEventListener('pagehide', flush); };
  }, []);

  const closeWork = React.useCallback(() => { setWork(null); setCurrentWorkId(null); setSaveStatus('idle'); }, []);
  useEffect(() => { setActiveWorkId(work?.id ?? null); }, [work]);

  // 다른 기기에서 같은 작업을 저장하면 반영 (내 쪽에 저장 대기 중인 변경이 있으면 내 저장이 뒤따르므로 최신 저장이 이김)
  useEffect(() => {
    if (!work) return;
    const unsub = subscribeWork(work.id, remote => {
      const json = JSON.stringify(remote.data);
      if (json === lastSavedJson.current) return;
      if (pendingRef.current) return; // 내 변경을 곧 저장할 예정 → 그쪽이 더 최신
      suppressSave.current = true;
      dispatch({ type: 'LOAD', payload: { ...initialState, ...remote.data, selectedId: null } as SenseState });
      lastSavedJson.current = json;
      setLastSavedAt(remote.updatedAt);
      setSaveStatus('remote');
      setTimeout(() => { suppressSave.current = false; setSaveStatus(s => (s === 'remote' ? 'cloud' : s)); }, 1500);
    });
    return unsub;
  }, [work]);

  const snapshot = React.useCallback(() => dispatch({ type: 'SNAPSHOT' }), []);

  return (
    <SenseContext.Provider value={{ state: h.present, dispatch, canUndo: h.past.length > 0, snapshot, work, ready, saveStatus, lastSavedAt, startNewWork, openWork, closeWork }}>
      {children}
    </SenseContext.Provider>
  );
}

export function useSense(): SenseContextType {
  const context = useContext(SenseContext);
  if (!context) throw new Error('useSense must be used within a SenseProvider');
  return context;
}
