'use client';

// 레이어 목록: 순서 바꾸기 / 복제 / 숨기기 / 삭제
import { useSense, type Layer } from '../context/SenseContext';
import { TASTE_LABELS, type TasteType } from '../constants/colors';
import { TEXTURE_LABELS, type TextureType } from '../constants/keymap';
import { getGlyphPath } from '../lib/glyphs';
import { resolveColor } from '../lib/svgBuilder';

function LayerThumb({ layer, season }: { layer: Layer; season: Parameters<typeof resolveColor>[1] }) {
  const g = getGlyphPath(layer.category, layer.type, layer.intensity);
  const s = 36 / Math.max(g.width, g.height);
  return (
    <svg viewBox="-24 -24 48 48" className="layer-thumb" aria-hidden>
      <path d={g.d} transform={`rotate(${layer.rotation}) scale(${s})`} fill={resolveColor(layer, season)} />
    </svg>
  );
}

export function layerLabel(layer: Layer): string {
  return layer.category === 'taste'
    ? TASTE_LABELS[layer.type as TasteType]
    : TEXTURE_LABELS[layer.type as TextureType];
}

export default function LayerPanel() {
  const { state, dispatch } = useSense();
  const layers = [...state.layers].reverse(); // 위에 있는 것이 목록 위로

  if (!layers.length) {
    return <div className="layer-empty">레이어가 없습니다. 키패드에서 맛·식감을 눌러 추가하세요.</div>;
  }

  return (
    <ul className="layer-list">
      {layers.map((l, i) => {
        const isTop = i === 0;
        const isBottom = i === layers.length - 1;
        const selected = l.id === state.selectedId;
        return (
          <li
            key={l.id}
            className={`layer-row ${selected ? 'selected' : ''} ${l.visible ? '' : 'hidden-layer'}`}
            onClick={() => dispatch({ type: 'SELECT_LAYER', payload: l.id })}
          >
            <LayerThumb layer={l} season={state.season} />
            <div className="layer-meta">
              <span className="layer-name">{layerLabel(l)}</span>
              <span className="layer-sub">Lv.{l.intensity} · {Math.round(l.size * 10)}% · {Math.round(l.rotation)}°</span>
            </div>
            <div className="layer-actions" onClick={e => e.stopPropagation()}>
              <button title="위로" disabled={isTop} onClick={() => dispatch({ type: 'MOVE_LAYER', payload: { id: l.id, dir: 'up' } })}>↑</button>
              <button title="아래로" disabled={isBottom} onClick={() => dispatch({ type: 'MOVE_LAYER', payload: { id: l.id, dir: 'down' } })}>↓</button>
              <button title={l.visible ? '숨기기' : '보이기'} onClick={() => dispatch({ type: 'UPDATE_LAYER', payload: { id: l.id, patch: { visible: !l.visible } } })}>{l.visible ? '◉' : '○'}</button>
              <button title="복제" onClick={() => dispatch({ type: 'DUPLICATE_LAYER', payload: l.id })}>⧉</button>
              <button title="삭제" className="danger" onClick={() => dispatch({ type: 'REMOVE_LAYER', payload: l.id })}>✕</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
