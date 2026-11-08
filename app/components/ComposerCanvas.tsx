'use client';

// 조합 캔버스: 글리프 레이어를 드래그로 옮기고, 크기 손잡이로 키우고, 크롭 영역을 지정
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSense, CANVAS, type CropRect } from '../context/SenseContext';
import { renderLayer } from '../lib/svgBuilder';

type DragMode =
  | { kind: 'move'; id: string; dx: number; dy: number }
  | { kind: 'scale'; id: string; cx: number; cy: number; startDist: number; startSize: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number; startAngle: number; startRot: number }
  | { kind: 'crop-move'; dx: number; dy: number }
  | { kind: 'crop-resize'; handle: string; start: CropRect }
  | null;

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const SNAP_POS = 14;   // 위치 자석 범위 (캔버스 단위)
const SNAP_ROT = 6;    // 회전 자석 범위 (도)

/** 0/45/90… 근처면 딱 맞춤 */
function snapRotation(deg: number, strong = false): number {
  const step = strong ? 15 : 45;
  const near = Math.round(deg / step) * step;
  return Math.abs(deg - near) <= SNAP_ROT || strong ? ((near % 360) + 360) % 360 : ((deg % 360) + 360) % 360;
}

export default function ComposerCanvas({ showCrop = true }: { showCrop?: boolean }) {
  const { state, dispatch, snapshot } = useSense();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  // 위치 자석: 캔버스 중심·가장자리, 크롭 중심·가장자리, 다른 레이어 중심
  const snapPoint = useCallback((x: number, y: number, selfId: string, disabled: boolean) => {
    if (disabled) { setGuides({ v: [], h: [] }); return { x, y }; }
    const vs = [CANVAS / 2, 0, CANVAS], hs = [CANVAS / 2, 0, CANVAS];
    if (state.crop) {
      vs.push(state.crop.x, state.crop.x + state.crop.w / 2, state.crop.x + state.crop.w);
      hs.push(state.crop.y, state.crop.y + state.crop.h / 2, state.crop.y + state.crop.h);
    }
    for (const l of state.layers) if (l.id !== selfId && l.visible) { vs.push(l.x); hs.push(l.y); }
    let bx = x, by = y; const gv: number[] = [], gh: number[] = [];
    let dx = SNAP_POS, dy = SNAP_POS;
    for (const v of vs) if (Math.abs(x - v) < dx) { dx = Math.abs(x - v); bx = v; }
    for (const h of hs) if (Math.abs(y - h) < dy) { dy = Math.abs(y - h); by = h; }
    if (bx !== x) gv.push(bx);
    if (by !== y) gh.push(by);
    setGuides({ v: gv, h: gh });
    return { x: bx, y: by };
  }, [state.crop, state.layers]);

  const toSvg = useCallback((e: React.PointerEvent | PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const selected = state.layers.find(l => l.id === state.selectedId) || null;
  const selectedRender = selected ? renderLayer(selected, state.season) : null;

  // ─── 레이어 드래그 ───
  const onLayerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const layer = state.layers.find(l => l.id === id);
    if (!layer) return;
    const p = toSvg(e);
    dispatch({ type: 'SELECT_LAYER', payload: id });
    snapshot();
    setDrag({ kind: 'move', id, dx: layer.x - p.x, dy: layer.y - p.y });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onScaleDown = (e: React.PointerEvent) => {
    if (!selected) return;
    e.stopPropagation();
    const p = toSvg(e);
    snapshot();
    setDrag({ kind: 'scale', id: selected.id, cx: selected.x, cy: selected.y, startDist: Math.hypot(p.x - selected.x, p.y - selected.y) || 1, startSize: selected.size });
  };

  const onRotateDown = (e: React.PointerEvent) => {
    if (!selected) return;
    e.stopPropagation();
    const p = toSvg(e);
    snapshot();
    setDrag({ kind: 'rotate', id: selected.id, cx: selected.x, cy: selected.y, startAngle: Math.atan2(p.y - selected.y, p.x - selected.x), startRot: selected.rotation });
  };

  // ─── 크롭 드래그 ───
  const onCropDown = (e: React.PointerEvent) => {
    if (!state.crop) return;
    e.stopPropagation();
    const p = toSvg(e);
    snapshot();
    setDrag({ kind: 'crop-move', dx: state.crop.x - p.x, dy: state.crop.y - p.y });
  };
  const onHandleDown = (e: React.PointerEvent, handle: string) => {
    if (!state.crop) return;
    e.stopPropagation();
    snapshot();
    setDrag({ kind: 'crop-resize', handle, start: { ...state.crop } });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const p = toSvg(e);
      if (drag.kind === 'move') {
        const sp = snapPoint(p.x + drag.dx, p.y + drag.dy, drag.id, e.altKey);
        dispatch({ type: 'UPDATE_LAYER', payload: { id: drag.id, patch: { x: clamp(sp.x, -200, CANVAS + 200), y: clamp(sp.y, -200, CANVAS + 200) } } });
      } else if (drag.kind === 'scale') {
        const d = Math.hypot(p.x - drag.cx, p.y - drag.cy);
        dispatch({ type: 'UPDATE_LAYER', payload: { id: drag.id, patch: { size: clamp(drag.startSize * d / drag.startDist, 0.3, 30) } } });
      } else if (drag.kind === 'rotate') {
        const a = Math.atan2(p.y - drag.cy, p.x - drag.cx);
        const rot = drag.startRot + (a - drag.startAngle) * 180 / Math.PI;
        dispatch({ type: 'UPDATE_LAYER', payload: { id: drag.id, patch: { rotation: e.altKey ? ((rot % 360) + 360) % 360 : snapRotation(rot, e.shiftKey) } } });
      } else if (drag.kind === 'crop-move' && state.crop) {
        dispatch({ type: 'SET_CROP', payload: { ...state.crop, x: p.x + drag.dx, y: p.y + drag.dy } });
      } else if (drag.kind === 'crop-resize') {
        dispatch({ type: 'SET_CROP', payload: resizeCrop(drag.start, drag.handle, p, state.cropAspect) });
      }
    };
    const up = () => { setDrag(null); setGuides({ v: [], h: [] }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, dispatch, toSvg, state.crop, state.cropAspect, snapPoint]);

  // ─── 키보드 ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
      if (!state.selectedId) return;
      const id = state.selectedId;
      const sel = state.layers.find(l => l.id === id);
      if (!sel) return;
      const step = e.shiftKey ? 20 : 4;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); dispatch({ type: 'REMOVE_LAYER', payload: id }); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'UPDATE_LAYER', payload: { id, patch: { x: sel.x - step } } }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); dispatch({ type: 'UPDATE_LAYER', payload: { id, patch: { x: sel.x + step } } }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'UPDATE_LAYER', payload: { id, patch: { y: sel.y - step } } }); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'UPDATE_LAYER', payload: { id, patch: { y: sel.y + step } } }); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); dispatch({ type: 'DUPLICATE_LAYER', payload: id }); }
      else if (e.key === ']') { dispatch({ type: 'MOVE_LAYER', payload: { id, dir: e.shiftKey ? 'top' : 'up' } }); }
      else if (e.key === '[') { dispatch({ type: 'MOVE_LAYER', payload: { id, dir: e.shiftKey ? 'bottom' : 'down' } }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selectedId, state.layers, dispatch]);

  // 휠로 선택 레이어 크기 조절 — 캔버스 위에서는 페이지 스크롤을 막아야 하므로 passive 가 아닌 리스너로 직접 등록
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // 캔버스 위에서는 브라우저 스크롤 금지
      const sel = selectedRef.current;
      if (!sel) return;
      const factor = e.deltaY < 0 ? 1.05 : 0.95;
      dispatch({ type: 'UPDATE_LAYER', payload: { id: sel.id, patch: { size: clamp(sel.size * factor, 0.3, 30) } } });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [dispatch]);

  const crop = showCrop ? state.crop : null;
  const transparent = state.background === 'transparent';

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      className={`composer-svg ${drag ? 'dragging' : ''}`}
      onPointerDown={() => dispatch({ type: 'SELECT_LAYER', payload: null })}
    >
      <defs>
        <pattern id="checker" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#f3f3f3" />
          <rect width="20" height="20" fill="#e2e2e2" />
          <rect x="20" y="20" width="20" height="20" fill="#e2e2e2" />
        </pattern>
      </defs>
      <rect width={CANVAS} height={CANVAS} fill={transparent ? 'url(#checker)' : state.background} />

      {/* 레이어 */}
      {state.layers.map(l => {
        if (!l.visible) return null;
        const lr = renderLayer(l, state.season);
        return (
          <g key={l.id} transform={lr.transform} opacity={lr.opacity}>
            <path d={lr.d} fill={lr.fill} className={`layer-path ${hoverId === l.id ? 'hover' : ''}`} pointerEvents="none" />
            {/* 잡기 쉬운 투명 히트 영역 (얇은 선 글리프도 넉넉하게) */}
            <path
              d={lr.d}
              fill="transparent"
              stroke="transparent"
              strokeWidth={18 / l.size}
              className="layer-hit"
              onPointerDown={e => onLayerDown(e, l.id)}
              onPointerEnter={() => setHoverId(l.id)}
              onPointerLeave={() => setHoverId(null)}
            />
          </g>
        );
      })}

      {/* 선택 표시 */}
      {selected && selectedRender && (
        <g transform={`translate(${selected.x} ${selected.y}) rotate(${selected.rotation})`} className="selection">
          <rect
            x={-selectedRender.bbox.w / 2 - 10} y={-selectedRender.bbox.h / 2 - 10}
            width={selectedRender.bbox.w + 20} height={selectedRender.bbox.h + 20}
            fill="transparent" stroke="#111" strokeWidth="2" strokeDasharray="8 6" vectorEffect="non-scaling-stroke"
            className="selection-box"
            onPointerDown={e => onLayerDown(e, selected.id)}
          />
          {/* 크기 손잡이 */}
          <circle cx={selectedRender.bbox.w / 2 + 10} cy={selectedRender.bbox.h / 2 + 10} r="14" className="handle scale-handle" onPointerDown={onScaleDown} />
          {/* 회전 손잡이 */}
          <line x1="0" y1={-selectedRender.bbox.h / 2 - 10} x2="0" y2={-selectedRender.bbox.h / 2 - 50} stroke="#111" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle cx="0" cy={-selectedRender.bbox.h / 2 - 50} r="14" className="handle rotate-handle" onPointerDown={onRotateDown} />
        </g>
      )}

      {/* 자석 가이드선 */}
      {guides.v.map(v => <line key={`gv${v}`} x1={v} y1={0} x2={v} y2={CANVAS} className="snap-guide" />)}
      {guides.h.map(h => <line key={`gh${h}`} x1={0} y1={h} x2={CANVAS} y2={h} className="snap-guide" />)}

      {/* 크롭 영역 */}
      {crop && (
        <g className="crop-layer">
          <path
            d={`M0,0 H${CANVAS} V${CANVAS} H0 Z M${crop.x},${crop.y} H${crop.x + crop.w} V${crop.y + crop.h} H${crop.x} Z`}
            fill="rgba(0,0,0,0.45)" fillRule="evenodd" pointerEvents="none"
          />
          <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="transparent" stroke="#dfff00" strokeWidth="3" vectorEffect="non-scaling-stroke" className="crop-rect" onPointerDown={onCropDown} />
          {/* 3분할 안내선 */}
          <g stroke="#dfff00" strokeWidth="1" opacity="0.5" pointerEvents="none" vectorEffect="non-scaling-stroke">
            <line x1={crop.x + crop.w / 3} y1={crop.y} x2={crop.x + crop.w / 3} y2={crop.y + crop.h} />
            <line x1={crop.x + crop.w * 2 / 3} y1={crop.y} x2={crop.x + crop.w * 2 / 3} y2={crop.y + crop.h} />
            <line x1={crop.x} y1={crop.y + crop.h / 3} x2={crop.x + crop.w} y2={crop.y + crop.h / 3} />
            <line x1={crop.x} y1={crop.y + crop.h * 2 / 3} x2={crop.x + crop.w} y2={crop.y + crop.h * 2 / 3} />
          </g>
          {HANDLES.map(h => {
            const { x, y } = handlePos(crop, h);
            return <rect key={h} x={x - 12} y={y - 12} width="24" height="24" className={`handle crop-handle crop-${h}`} onPointerDown={e => onHandleDown(e, h)} />;
          })}
        </g>
      )}
    </svg>
  );
}

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function handlePos(c: CropRect, h: string) {
  const mx = c.x + c.w / 2, my = c.y + c.h / 2;
  switch (h) {
    case 'nw': return { x: c.x, y: c.y };
    case 'n': return { x: mx, y: c.y };
    case 'ne': return { x: c.x + c.w, y: c.y };
    case 'e': return { x: c.x + c.w, y: my };
    case 'se': return { x: c.x + c.w, y: c.y + c.h };
    case 's': return { x: mx, y: c.y + c.h };
    case 'sw': return { x: c.x, y: c.y + c.h };
    default: return { x: c.x, y: my };
  }
}

function resizeCrop(start: CropRect, handle: string, p: { x: number; y: number }, aspect: number | null): CropRect {
  let x1 = start.x, y1 = start.y, x2 = start.x + start.w, y2 = start.y + start.h;
  if (handle.includes('w')) x1 = Math.min(p.x, x2 - 40);
  if (handle.includes('e')) x2 = Math.max(p.x, x1 + 40);
  if (handle.includes('n')) y1 = Math.min(p.y, y2 - 40);
  if (handle.includes('s')) y2 = Math.max(p.y, y1 + 40);
  let w = x2 - x1, h = y2 - y1;
  if (aspect) {
    // 비율 고정: 더 많이 바뀐 축을 기준으로 맞춤
    const onlyX = handle === 'e' || handle === 'w';
    const onlyY = handle === 'n' || handle === 's';
    if (onlyY || (!onlyX && Math.abs(w / aspect - h) < Math.abs(h * aspect - w))) w = h * aspect; else h = w / aspect;
    if (handle.includes('w')) x1 = x2 - w; else x2 = x1 + w;
    if (handle.includes('n')) y1 = y2 - h; else y2 = y1 + h;
    if (onlyX) { const my = start.y + start.h / 2; y1 = my - h / 2; y2 = my + h / 2; }
    if (onlyY) { const mx = start.x + start.w / 2; x1 = mx - w / 2; x2 = mx + w / 2; }
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
