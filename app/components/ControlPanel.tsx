'use client';

// 선택한 레이어의 속성 조절 + 레이어 목록 + 배경색
import React from 'react';
import { useSense, type TasteKey, type Layer } from '../context/SenseContext';
import { IntensityLevel, TEXTURE_COLOR } from '../constants/keymap';
import { SEASONAL_COLORS, TASTE_LABELS } from '../constants/colors';
import { resolveColor } from '../lib/svgBuilder';
import LayerPanel, { layerLabel } from './LayerPanel';

const TASTE_KEYS: TasteKey[] = ['sweet', 'salty', 'spicy', 'sour', 'bitter', 'umami'];

export default function ControlPanel() {
  const { state, dispatch, snapshot, canUndo } = useSense();
  const sel = state.layers.find(l => l.id === state.selectedId) || null;
  const color = sel ? resolveColor(sel, state.season) : '#999';

  const patch = (p: Partial<Layer>) => {
    if (sel) dispatch({ type: 'UPDATE_LAYER', payload: { id: sel.id, patch: p } });
  };

  return (
    <div className="control-panel-inner">
      <div className="channel-rack-header">
        <div className="rack-title">{sel ? `${layerLabel(sel)} 조절` : '레이어 속성'}</div>
        <div className="rack-status">
          <button className="mini-btn" disabled={!canUndo} onClick={() => dispatch({ type: 'UNDO' })} title="되돌리기 (Cmd/Ctrl+Z)">↶ 되돌리기</button>
        </div>
      </div>

      {sel ? (
        <div className="inspector">
          {/* 강도 */}
          <div className="slider-group master-intensity-strip">
            <div className="intensity-slider-wrapper">
              <input
                type="range" min="1" max="6" step="1"
                value={sel.intensity}
                onPointerDown={snapshot}
                onChange={e => patch({ intensity: Number(e.target.value) as IntensityLevel })}
                className="premium-intensity-range"
                style={{ '--accent-color': color, '--thumb-pos': `${((sel.intensity - 1) / 5) * 100}%` } as React.CSSProperties}
              />
              <div className="discrete-step-labels">
                {[1, 2, 3, 4, 5, 6].map((step, idx) => (
                  <div key={step} className={`step-label-item ${step === sel.intensity ? 'active' : ''}`} style={{ '--pos': `${idx * 20}%` } as React.CSSProperties}>
                    <span className="step-num">{step === 6 ? '본질' : `0${step}`}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="focus-brand-header">
              <div className="focus-pill" style={{ backgroundColor: color }}>
                <span className="focus-text">{sel.category === 'taste' ? '맛의 강도' : '식감의 정도'}</span>
                <span className="label-text">Lv.{sel.intensity}</span>
              </div>
            </div>
          </div>

          {/* 크기 / 회전 / 투명도 */}
          <div className="prop-grid">
            <label className="prop">
              <span>크기 <b>{Math.round(sel.size * 10)}%</b></span>
              <input type="range" min="0.3" max="20" step="0.1" value={sel.size} onPointerDown={snapshot} onChange={e => patch({ size: Number(e.target.value) })} />
            </label>
            <label className="prop">
              <span>회전 <b>{Math.round(sel.rotation)}°</b></span>
              <input type="range" min="0" max="360" step="1" value={sel.rotation} onPointerDown={snapshot} onChange={e => patch({ rotation: Number(e.target.value) })} />
            </label>
            <label className="prop">
              <span>불투명도 <b>{Math.round(sel.opacity * 100)}%</b></span>
              <input type="range" min="0.05" max="1" step="0.05" value={sel.opacity} onPointerDown={snapshot} onChange={e => patch({ opacity: Number(e.target.value) })} />
            </label>
          </div>

          {/* 색 */}
          <div className="prop">
            <span>색 <b>{sel.color === 'auto' ? '자동(계절 팔레트)' : sel.color}</b></span>
            <div className="swatches">
              <button className={`swatch auto ${sel.color === 'auto' ? 'on' : ''}`} title="자동" onClick={() => patch({ color: 'auto' })}>A</button>
              {TASTE_KEYS.map(k => {
                const c = SEASONAL_COLORS[state.season][k];
                return <button key={k} className={`swatch ${sel.color === c ? 'on' : ''}`} style={{ background: c }} title={TASTE_LABELS[k]} onClick={() => patch({ color: c })} />;
              })}
              <button className={`swatch ${sel.color === TEXTURE_COLOR ? 'on' : ''}`} style={{ background: TEXTURE_COLOR }} title="무채색" onClick={() => patch({ color: TEXTURE_COLOR })} />
              <button className={`swatch ${sel.color === '#111111' ? 'on' : ''}`} style={{ background: '#111111' }} title="검정" onClick={() => patch({ color: '#111111' })} />
              <button className={`swatch ${sel.color === '#ffffff' ? 'on' : ''}`} style={{ background: '#ffffff' }} title="흰색" onClick={() => patch({ color: '#ffffff' })} />
              <label className="swatch custom" title="직접 고르기">
                <input type="color" value={sel.color === 'auto' ? color : sel.color} onChange={e => patch({ color: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="inspector-actions">
            <button className="mini-btn" onClick={() => dispatch({ type: 'DUPLICATE_LAYER', payload: sel.id })}>복제</button>
            <button className="mini-btn" onClick={() => dispatch({ type: 'MOVE_LAYER', payload: { id: sel.id, dir: 'top' } })}>맨 앞으로</button>
            <button className="mini-btn" onClick={() => dispatch({ type: 'MOVE_LAYER', payload: { id: sel.id, dir: 'bottom' } })}>맨 뒤로</button>
            <button className="mini-btn danger" onClick={() => dispatch({ type: 'REMOVE_LAYER', payload: sel.id })}>삭제</button>
          </div>
        </div>
      ) : (
        <div className="console-idle-msg">캔버스나 아래 목록에서 레이어를 선택하면 강도·크기·회전·색을 조절할 수 있습니다.</div>
      )}

      <div className="panel-subtitle">레이어 ({state.layers.length})</div>
      <LayerPanel />

      <div className="panel-subtitle">배경</div>
      <div className="swatches">
        {['#ffffff', '#f4f1ea', '#111111', 'transparent'].map(c => (
          <button
            key={c}
            className={`swatch ${state.background === c ? 'on' : ''} ${c === 'transparent' ? 'transparent' : ''}`}
            style={c !== 'transparent' ? { background: c } : undefined}
            title={c === 'transparent' ? '투명' : c}
            onClick={() => dispatch({ type: 'SET_BACKGROUND', payload: c })}
          />
        ))}
        {TASTE_KEYS.map(k => {
          const c = SEASONAL_COLORS[state.season][k];
          return <button key={k} className={`swatch ${state.background === c ? 'on' : ''}`} style={{ background: c }} title={TASTE_LABELS[k]} onClick={() => dispatch({ type: 'SET_BACKGROUND', payload: c })} />;
        })}
        <label className="swatch custom" title="직접 고르기">
          <input type="color" value={state.background === 'transparent' ? '#ffffff' : state.background} onChange={e => dispatch({ type: 'SET_BACKGROUND', payload: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
