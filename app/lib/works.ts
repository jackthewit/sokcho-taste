// 작업(Work) 저장소: 클라우드(Firestore) + 기기(localStorage) 거울 저장
// - 시작 시 만든 사람·일시를 기록하고, 이후 변경은 자동 저장
// - 인터넷이 없으면 기기에만 저장되고, 연결되면 Firestore 오프라인 캐시가 올려 줌
import { db, CLOUD_ENABLED } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, orderBy, limit, serverTimestamp, Timestamp, arrayUnion,
} from 'firebase/firestore';
import type { SenseState } from '../context/SenseContext';

export type WorkData = Pick<SenseState, 'season' | 'layers' | 'foodName' | 'background' | 'crop' | 'cropAspect' | 'tile' | 'card'>;

export interface WorkMeta {
  id: string;
  author: string;
  org: string;
  title: string;          // 음식 이름 또는 소속/가게 이름
  season: string;
  createdAt: number;      // epoch ms
  updatedAt: number;
  layerCount: number;
  thumb?: string;         // 작은 SVG
  device: string;         // 만든 기기 구분(익명)
  cloud: boolean;         // 클라우드에 올라간 적이 있는지
}

export interface WorkDoc extends WorkMeta { data: WorkData; exports?: { type: string; at: number }[]; }

const COL = 'works';
const LS_INDEX = 'sokcho-works-index-v1';
const LS_DOC = (id: string) => `sokcho-work-${id}`;
const LS_CURRENT = 'sokcho-current-work';
const LS_DEVICE = 'sokcho-device-id';
const LS_AUTHOR = 'sokcho-last-author';

const now = () => Date.now();
/** 클라우드 응답이 늦으면(오프라인 등) 기다리지 않고 기기 저장본으로 진행 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export function deviceId(): string {
  return safe(() => {
    let id = localStorage.getItem(LS_DEVICE);
    if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS_DEVICE, id); }
    return id;
  }, 'unknown');
}
export const lastAuthor = () => safe(() => JSON.parse(localStorage.getItem(LS_AUTHOR) || 'null'), null) as { author: string; org: string } | null;
export const rememberAuthor = (author: string, org: string) => safe(() => localStorage.setItem(LS_AUTHOR, JSON.stringify({ author, org })), undefined);
export const currentWorkId = () => safe(() => localStorage.getItem(LS_CURRENT), null);
export const setCurrentWorkId = (id: string | null) => safe(() => (id ? localStorage.setItem(LS_CURRENT, id) : localStorage.removeItem(LS_CURRENT)), undefined);

// ─── 기기 저장 ───
function readIndex(): WorkMeta[] { return safe(() => JSON.parse(localStorage.getItem(LS_INDEX) || '[]'), []); }
function writeIndex(list: WorkMeta[]) { safe(() => localStorage.setItem(LS_INDEX, JSON.stringify(list.slice(0, 200))), undefined); }
function localSave(docu: WorkDoc) {
  safe(() => localStorage.setItem(LS_DOC(docu.id), JSON.stringify(docu)), undefined);
  const { data: _d, exports: _e, ...meta } = docu; void _d; void _e;
  const list = readIndex().filter(w => w.id !== docu.id);
  list.unshift(meta);
  writeIndex(list);
}
function localLoad(id: string): WorkDoc | null { return safe(() => JSON.parse(localStorage.getItem(LS_DOC(id)) || 'null'), null); }

// ─── 변환 ───
const toMillis = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : now());
function fromSnapshot(id: string, d: Record<string, unknown>): WorkDoc {
  return {
    id,
    author: String(d.author || ''), org: String(d.org || ''), title: String(d.title || ''), season: String(d.season || 'spring'),
    createdAt: toMillis(d.createdAt), updatedAt: toMillis(d.updatedAt),
    layerCount: Number(d.layerCount || 0), thumb: typeof d.thumb === 'string' ? d.thumb : undefined,
    device: String(d.device || ''), cloud: true,
    data: d.data as WorkData, exports: (d.exports as WorkDoc['exports']) || [],
  };
}

export const newWorkId = () => `w${now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ─── 공개 API ───
export async function createWork(author: string, org: string, data: WorkData, thumb?: string): Promise<WorkDoc> {
  const id = newWorkId();
  const t = now();
  const docu: WorkDoc = { id, author, org, title: titleOf(data), season: data.season, createdAt: t, updatedAt: t, layerCount: data.layers.length, thumb, device: deviceId(), cloud: false, data, exports: [] };
  localSave(docu);
  setCurrentWorkId(id);
  rememberAuthor(author, org);
  if (db) {
    try {
      const payload: Record<string, unknown> = { author, org, title: docu.title, season: docu.season, layerCount: docu.layerCount, device: docu.device, data, exports: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdAtMs: t, updatedAtMs: t };
      if (thumb) payload.thumb = thumb;
      await withTimeout(setDoc(doc(db, COL, id), payload), 8000);
      docu.cloud = true; localSave(docu);
    } catch (e) { console.warn('클라우드 저장 실패(기기에만 저장됨):', e); }
  }
  return docu;
}

export async function saveWork(id: string, data: WorkData, thumb?: string): Promise<{ cloud: boolean }> {
  const prev = localLoad(id);
  const t = now();
  const meta: WorkMeta = {
    id, author: prev?.author || '', org: prev?.org || '', title: titleOf(data), season: data.season,
    createdAt: prev?.createdAt || t, updatedAt: t, layerCount: data.layers.length, thumb: thumb ?? prev?.thumb, device: prev?.device || deviceId(), cloud: prev?.cloud || false,
  };
  const docu: WorkDoc = { ...meta, data, exports: prev?.exports || [] };
  localSave(docu);
  if (!db) return { cloud: false };
  try {
    const payload: Record<string, unknown> = { data, title: meta.title, season: meta.season, layerCount: meta.layerCount, updatedAt: serverTimestamp(), updatedAtMs: t };
    if (thumb) payload.thumb = thumb;
    if (!meta.cloud) {
      await withTimeout(setDoc(doc(db, COL, id), { ...payload, author: meta.author, org: meta.org, device: meta.device, createdAt: Timestamp.fromMillis(meta.createdAt), createdAtMs: meta.createdAt, exports: docu.exports }, { merge: true }), 8000);
    } else {
      await withTimeout(updateDoc(doc(db, COL, id), payload), 8000);
    }
    if (!meta.cloud) { docu.cloud = true; localSave(docu); }
    return { cloud: true };
  } catch (e) {
    console.warn('클라우드 저장 실패(기기에만 저장됨):', e);
    return { cloud: false };
  }
}

export async function logExport(id: string, type: string) {
  const t = now();
  const prev = localLoad(id);
  if (prev) { prev.exports = [...(prev.exports || []).slice(-49), { type, at: t }]; localSave(prev); }
  if (db) { try { await updateDoc(doc(db, COL, id), { exports: arrayUnion({ type, at: t }) }); } catch { /* 무시 */ } }
}

export function loadWorkLocal(id: string): WorkDoc | null { return localLoad(id); }

/** 클라우드에 더 최근 저장본이 있으면 돌려줌(없거나 오프라인이면 null) */
export async function loadWorkRemoteIfNewer(id: string, localUpdatedAt: number): Promise<WorkDoc | null> {
  if (!db) return null;
  try {
    const snap = await withTimeout(getDoc(doc(db, COL, id)), 6000);
    if (!snap.exists()) return null;
    const remote = fromSnapshot(snap.id, snap.data() as Record<string, unknown>);
    if (remote.updatedAt > localUpdatedAt) { localSave(remote); return remote; }
  } catch { /* 오프라인 */ }
  return null;
}

export async function loadWork(id: string): Promise<WorkDoc | null> {
  const local = localLoad(id);
  if (db) {
    try {
      const snap = await withTimeout(getDoc(doc(db, COL, id)), 5000);
      if (snap.exists()) {
        const remote = fromSnapshot(snap.id, snap.data() as Record<string, unknown>);
        // 더 최근 것을 택함
        if (!local || remote.updatedAt >= local.updatedAt) { localSave(remote); return remote; }
      }
    } catch (e) { console.warn('클라우드에서 불러오기 실패, 기기 저장본 사용:', e); }
  }
  return local;
}

/** 모든 작업 목록(클라우드 + 이 기기) — 최근 수정 순 */
export async function listWorks(max = 100): Promise<WorkMeta[]> {
  const localList = readIndex();
  const merged = new Map<string, WorkMeta>();
  for (const w of localList) merged.set(w.id, w);
  if (db) {
    try {
      const q = query(collection(db, COL), orderBy('updatedAtMs', 'desc'), limit(max));
      const snap = await withTimeout(getDocs(q), 6000);
      snap.forEach(s => {
        const d = s.data() as Record<string, unknown>;
        const m: WorkMeta = {
          id: s.id, author: String(d.author || ''), org: String(d.org || ''), title: String(d.title || ''), season: String(d.season || 'spring'),
          createdAt: Number(d.createdAtMs) || toMillis(d.createdAt), updatedAt: Number(d.updatedAtMs) || toMillis(d.updatedAt),
          layerCount: Number(d.layerCount || 0), thumb: typeof d.thumb === 'string' ? d.thumb : undefined, device: String(d.device || ''), cloud: true,
        };
        const l = merged.get(s.id);
        if (!l || m.updatedAt >= l.updatedAt) merged.set(s.id, m);
      });
    } catch (e) { console.warn('클라우드 목록 불러오기 실패:', e); }
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function titleOf(data: WorkData): string {
  return data.foodName?.trim() || data.card?.fields?.org?.trim() || data.card?.fields?.name?.trim() || '';
}

export const cloudEnabled = CLOUD_ENABLED;

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── 내보내기 기록 (다운로드 함수에서 호출) ───
let activeWorkId: string | null = null;
export const setActiveWorkId = (id: string | null) => { activeWorkId = id; };
export function noteExport(filename: string) {
  if (activeWorkId) void logExport(activeWorkId, filename.replace(/\d{8}/, '').slice(0, 60));
}
