'use client';

// 조합 화면: 캔버스 + 크롭 도구 + 내보내기
import { useState } from 'react';
import { useSense, aspectCrop } from '../context/SenseContext';
import { SEASON_LABELS } from '../constants/colors';
import ComposerCanvas from './ComposerCanvas';
import { exportCompositionSVG, exportCompositionPNG } from '../lib/exportUtils';

const ASPECTS: { label: string; value: number | null }[] = [
  { label: '자유', value: null },
  { label: '1:1', value: 1 },
  { label: '명함 9:5', value: 9 / 5 },
  { label: '세로 5:9', value: 5 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

export default function PreviewCard() {
  const { state, dispatch } = useSense();
  const hasLayers = state.layers.length > 0;
  const [busy, setBusy] = useState(false);

  const toggleCrop = () => {
    if (state.crop) dispatch({ type: 'SET_CROP', payload: null });
    else dispatch({ type: 'SET_CROP', payload: aspectCrop(state.cropAspect) });
  };

  const png = async (cropped: boolean) => {
    setBusy(true);
    try { await exportCompositionPNG(state, cropped); } finally { setBusy(false); }
  };

  return (
    <div className="preview-container">
      <div className="preview-card-wrap">
        <div className="preview-topbar">
          <div className="preview-season-badge">{SEASON_LABELS[state.season]} COLLECTION</div>
          <div className="crop-toolbar">
            <button className={`chip ${state.crop ? 'on' : ''}`} onClick={toggleCrop}>
              {state.crop ? '✂ 크롭 끄기' : '✂ 크롭'}
            </button>
            {state.crop && ASPECTS.map(a => (
              <button
                key={a.label}
                className={`chip small ${state.cropAspect === a.value ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'SET_CROP_ASPECT', payload: a.value })}
              >{a.label}</button>
            ))}
            {state.crop && (
              <button className="chip small" onClick={() => dispatch({ type: 'SET_CROP', payload: aspectCrop(state.cropAspect) })}>가운데로</button>
            )}
          </div>
        </div>

        <div className="preview-card composer-wrap">
          <ComposerCanvas />
          {!hasLayers && (
            <div className="preview-empty">
              <p className="empty-text" style={{ color: '#aaa' }}>BRANDING CONSOLE READY<br />SELECT SENSORY INPUT</p>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-food-name-input-centered">
        <input
          type="text"
          placeholder="여기에 음식 이름을 입력하세요"
          value={state.foodName}
          onChange={e => dispatch({ type: 'SET_FOOD_NAME', payload: e.target.value })}
          className="food-name-input"
          maxLength={20}
        />
      </div>

      <div className="export-bar">
        <div className="export-group">
          <span className="export-label">전체</span>
          <button className="output-btn svg-btn compact" disabled={!hasLayers} onClick={() => exportCompositionSVG(state, false)}>SVG</button>
          <button className="output-btn db-btn compact" disabled={!hasLayers || busy} onClick={() => png(false)}>PNG</button>
        </div>
        <div className="export-group">
          <span className="export-label">크롭 영역</span>
          <button className="output-btn svg-btn compact" disabled={!hasLayers || !state.crop} onClick={() => exportCompositionSVG(state, true)}>SVG</button>
          <button className="output-btn db-btn compact" disabled={!hasLayers || !state.crop || busy} onClick={() => png(true)}>PNG</button>
        </div>
        <p className="export-note">SVG는 글리프가 모두 벡터 패스로 저장되어 인쇄·확대에 안전합니다.</p>
      </div>
    </div>
  );
}
