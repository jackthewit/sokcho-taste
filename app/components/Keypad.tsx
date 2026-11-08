'use client';

// 키패드: 키를 누를 때마다 글리프 레이어가 하나씩 추가됨 (같은 글리프 여러 개 가능)
import { useSense, type TasteKey } from '../context/SenseContext';
import { SEASONAL_COLORS, TasteType, TASTE_LABELS_EN } from '../constants/colors';
import { KEYPAD_LAYOUT, TextureType, TEXTURE_COLOR, TEXTURE_LABELS_EN } from '../constants/keymap';

export default function Keypad() {
  const { state, dispatch } = useSense();

  const countOf = (type: string) => state.layers.filter(l => l.type === type).length;
  const selectedType = state.layers.find(l => l.id === state.selectedId)?.type;

  return (
    <div className="keypad-container">
      <div className="keypad-grid">
        {KEYPAD_LAYOUT.flat().map((item, idx) => {
          if (item.type === 'spacer') return <div key={`spacer-${idx}`} className="keypad-spacer" />;

          const isGlyph = item.type === 'taste' || item.type === 'texture';
          const count = isGlyph ? countOf(item.value as string) : 0;
          const active = count > 0;
          const focused = isGlyph && selectedType === item.value;
          const color = item.type === 'taste'
            ? SEASONAL_COLORS[state.season][item.value as TasteType]
            : item.type === 'texture' ? TEXTURE_COLOR : 'transparent';
          const labelEn = item.type === 'taste'
            ? TASTE_LABELS_EN[item.value as TasteType]
            : item.type === 'texture' ? TEXTURE_LABELS_EN[item.value as TextureType] : '';
          const isClear = item.type === 'functional' && item.value === 'clear';

          return (
            <button
              key={`${idx}-${item.key}`}
              className={`keypad-key ${item.type} ${active ? 'active' : ''} ${focused ? 'selected' : ''} ${isClear ? 'clear-key' : ''}`}
              title={isGlyph ? `${item.label} 추가 (현재 ${count}개)` : isClear ? '모든 레이어 지우기' : ''}
              onClick={() => {
                if (isClear) {
                  if (state.layers.length && window.confirm('모든 레이어를 지울까요? (Cmd/Ctrl+Z로 되돌릴 수 있음)')) dispatch({ type: 'RESET' });
                } else if (isGlyph) {
                  const same = state.layers.filter(l => l.type === item.value);
                  if (same.length === 0) {
                    dispatch({ type: 'ADD_LAYER', payload: { category: item.type as 'taste' | 'texture', type: item.value as TasteKey | TextureType } });
                  } else {
                    // 이미 있으면 추가하지 않고 그 글리프들을 차례로 선택
                    const idx = same.findIndex(l => l.id === state.selectedId);
                    const next = same[(idx + 1) % same.length];
                    dispatch({ type: 'SELECT_LAYER', payload: next.id });
                  }
                }
              }}
              style={{
                '--key-color': color,
                '--key-glow': color !== 'transparent' ? `${color}60` : 'transparent',
                gridRow: item.rowSpan ? `span ${item.rowSpan}` : 'auto',
              } as React.CSSProperties}
            >
              <div className="key-labels">
                <span className="key-label">{isClear ? '지우기' : item.label}</span>
                {labelEn && <span className="key-label-en">{labelEn}</span>}
              </div>
              <span className="key-number" style={{ color: active ? 'var(--color-neon)' : '#000' }}>{item.key}</span>
              {active && (
                <span className="key-active-dot key-count" style={{ backgroundColor: color }}>{count > 1 ? count : ''}</span>
              )}
              {isGlyph && (
                <span className="key-mini-actions" onClick={e => e.stopPropagation()}>
                  <span role="button" tabIndex={0} title="하나 더 추가" onClick={() => dispatch({ type: 'ADD_LAYER', payload: { category: item.type as 'taste' | 'texture', type: item.value as TasteKey | TextureType } })}>+</span>
                  {active && (
                    <span role="button" tabIndex={0} title="선택한(또는 마지막) 것 삭제" onClick={() => {
                      const same = state.layers.filter(l => l.type === item.value);
                      const target = same.find(l => l.id === state.selectedId) ?? same[same.length - 1];
                      dispatch({ type: 'REMOVE_LAYER', payload: target.id });
                    }}>−</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="keypad-hint">키 클릭 = 추가(없을 때) / 선택(있을 때) · 키의 + − 로 추가·삭제 · 캔버스에서 끌어 이동, 정각·중심선 근처에서 자석처럼 붙음 (Alt 누르면 해제)</p>
    </div>
  );
}
