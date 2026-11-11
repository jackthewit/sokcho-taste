'use client';

// 작업 관리 표시줄 + 시작/열기 창: 만든 사람·일시 기록, 자동 저장 상태, 새로 만들기, 기존 작업 열기
import { useEffect, useState } from 'react';
import { useSense } from '../context/SenseContext';
import { listWorks, lastAuthor, formatDate, cloudEnabled, recentWorksByAuthor, type WorkMeta } from '../lib/works';
import { SEASON_LABELS, type Season } from '../constants/colors';

function StatusDot() {
  const { saveStatus, lastSavedAt } = useSense();
  const label = saveStatus === 'saving' ? '저장 중…'
    : saveStatus === 'cloud' ? '클라우드 저장됨'
    : saveStatus === 'local' ? (cloudEnabled ? '이 기기에 저장됨 (연결되면 올라감)' : '이 기기에 저장됨')
    : saveStatus === 'remote' ? '다른 기기의 변경을 반영했습니다'
    : saveStatus === 'error' ? '저장 실패' : '';
  return (
    <span className={`save-status ${saveStatus}`} title={lastSavedAt ? `마지막 저장 ${formatDate(lastSavedAt)}` : ''}>
      <i /> {label}
    </span>
  );
}

export function StartDialog({ onOpenExisting, onCancel }: { onOpenExisting: () => void; onCancel?: () => void }) {
  const { startNewWork, openWork } = useSense();
  const remembered = lastAuthor();
  const [author, setAuthor] = useState(remembered?.author || '');
  const [org, setOrg] = useState(remembered?.org || '');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<WorkMeta[]>([]);
  const ok = author.trim().length > 0;
  // 이름을 넣으면 같은 이름의 최근 작업을 찾아 '이어하기' 제안 (다른 기기에서 만든 것 포함)
  useEffect(() => {
    let alive = true; const a = author.trim();
    if (!a) { setRecent([]); return; }
    const t = setTimeout(() => { recentWorksByAuthor(a).then(l => { if (alive) setRecent(l); }); }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [author]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="새 작업 시작">
      <div className="modal">
        <h2>새 작업 시작</h2>
        <p className="modal-desc">만든 사람과 시작 시각이 기록되고, 이후 모든 변경은 자동으로 저장됩니다.</p>
        <label className="field"><span>만든 사람 *</span><input autoFocus type="text" value={author} placeholder="이름 또는 별명" onChange={e => setAuthor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ok) { setBusy(true); startNewWork(author.trim(), org.trim()).finally(() => setBusy(false)); } }} /></label>
        <label className="field"><span>소속 / 가게 (선택)</span><input type="text" value={org} placeholder="예: 속초문화관광재단" onChange={e => setOrg(e.target.value)} /></label>
        {recent.length > 0 && (
          <div className="recent-box">
            <div className="panel-subtitle" style={{ margin: '4px 0 6px' }}>{author.trim()} 님의 최근 작업 — 이어서 하기</div>
            <ul className="recent-list">
              {recent.map(w => (
                <li key={w.id}>
                  <button disabled={busy} onClick={async () => { setBusy(true); const okk = await openWork(w.id); setBusy(false); if (!okk) alert('작업을 불러오지 못했습니다'); }}>
                    <b>{w.title || '(제목 없음)'}</b><small>{formatDate(w.updatedAt)} · 글리프 {w.layerCount}개{w.cloud ? '' : ' · 이 기기'}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="modal-actions">
          <button className="output-btn db-btn compact" onClick={onOpenExisting}>기존 작업 열기</button>
          {onCancel && <button className="mini-btn" onClick={onCancel}>취소</button>}
          <button className="output-btn svg-btn compact" disabled={!ok || busy} onClick={async () => { setBusy(true); try { await startNewWork(author.trim(), org.trim()); } finally { setBusy(false); } }}>{busy ? '만드는 중…' : '시작하기'}</button>
        </div>
        {!cloudEnabled && <p className="side-note">클라우드 설정이 없어 이 기기에만 저장됩니다.</p>}
      </div>
    </div>
  );
}

export function OpenDialog({ onClose }: { onClose: () => void }) {
  const { openWork, work } = useSense();
  const [items, setItems] = useState<WorkMeta[] | null>(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { let alive = true; listWorks().then(l => { if (alive) setItems(l); }); return () => { alive = false; }; }, []);
  const filtered = (items || []).filter(w => !q || `${w.author} ${w.org} ${w.title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="기존 작업 열기" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>기존 작업 열기</h2>
          <input className="search" type="search" placeholder="이름 · 소속 · 음식 검색" value={q} onChange={e => setQ(e.target.value)} />
          <button className="mini-btn" onClick={onClose}>닫기</button>
        </div>
        {items === null ? <p className="modal-desc">불러오는 중…</p>
          : filtered.length === 0 ? <p className="modal-desc">저장된 작업이 없습니다.</p>
          : (
            <ul className="work-list">
              {filtered.map(w => (
                <li key={w.id} className={`work-item ${work?.id === w.id ? 'current' : ''}`}>
                  <button disabled={busyId !== null} onClick={async () => { setBusyId(w.id); const ok = await openWork(w.id); setBusyId(null); if (ok) onClose(); }}>
                    <div className="work-thumb">{w.thumb ? <div className="svg-host" dangerouslySetInnerHTML={{ __html: w.thumb }} /> : <span className="work-thumb-empty">비어 있음</span>}</div>
                    <div className="work-meta">
                      <b>{w.title || '(제목 없음)'}</b>
                      <span>{w.author}{w.org ? ` · ${w.org}` : ''}</span>
                      <small>{SEASON_LABELS[w.season as Season] || w.season} · 글리프 {w.layerCount}개 · 수정 {formatDate(w.updatedAt)}{w.cloud ? '' : ' · 이 기기'}</small>
                      {work?.id === w.id && <em>지금 작업 중</em>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}

export default function WorkBar() {
  const { work, ready, closeWork } = useSense();
  const [showOpen, setShowOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  if (!ready) return <div className="work-bar"><span className="work-info">불러오는 중…</span></div>;
  return (
    <>
      <div className="work-bar">
        {work ? (
          <span className="work-info"><b>{work.author}</b>{work.org ? ` · ${work.org}` : ''} <small>시작 {formatDate(work.createdAt)}</small> <StatusDot /></span>
        ) : <span className="work-info">작업을 시작하면 자동으로 저장됩니다</span>}
        <span className="work-actions">
          <button className="mini-btn" onClick={() => setShowOpen(true)}>기존 작업 열기</button>
          <button className="mini-btn primary" onClick={() => setShowNew(true)}>새로 만들기</button>
        </span>
      </div>
      {(!work && !showOpen) && <StartDialog onOpenExisting={() => setShowOpen(true)} />}
      {showNew && <StartDialogWrapper onDone={() => setShowNew(false)} onOpenExisting={() => { setShowNew(false); setShowOpen(true); }} />}
      {showOpen && <OpenDialog onClose={() => { setShowOpen(false); }} />}
      {/* closeWork 는 현재 미사용(새로 만들기 시 새 작업으로 교체) */}
      {void closeWork}
    </>
  );
}

function StartDialogWrapper({ onDone, onOpenExisting }: { onDone: () => void; onOpenExisting: () => void }) {
  const { work } = useSense();
  const [startId] = useState(work?.id);
  // 새 작업이 만들어지면(ID 변경) 창 닫기
  useEffect(() => { if (work?.id && work.id !== startId) onDone(); }, [work, startId, onDone]);
  return <StartDialog onOpenExisting={onOpenExisting} onCancel={onDone} />;
}
