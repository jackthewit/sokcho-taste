'use client';

// 패턴화 시연: 크롭 영역을 타일로 반복해 원단·옷 실루엣에 적용
import { useMemo, useState } from 'react';
import { useSense, aspectCrop, type TileMode } from '../context/SenseContext';
import { buildGarmentSVG, buildTileSheetSVG, downloadText, downloadPng, stamp, GARMENT_LABELS, type GarmentId } from '../lib/svgBuilder';

const MODES: { id: TileMode; label: string; desc: string }[] = [
  { id: 'grid', label: '격자', desc: '같은 타일을 가로·세로로 반복' },
  { id: 'brick', label: '엇갈림', desc: '옆 열을 반 칸 내려 벽돌처럼' },
  { id: 'mirror', label: '거울', desc: '뒤집어 이어 붙여 이음새 없이' },
];
const GARMENTS: GarmentId[] = ['swatch', 'tshirt', 'apron', 'tote', 'vest'];

export default function PatternView() {
  const { state, dispatch } = useSense();
  const [garment, setGarment] = useState<GarmentId>('tshirt');
  const [busy, setBusy] = useState(false);
  const crop = state.crop ?? aspectCrop(1);
  const hasLayers = state.layers.length > 0;

  const mainSvg = useMemo(
    () => (hasLayers ? (garment === 'swatch' ? buildTileSheetSVG(state, crop, { uid: 'main' }) : buildGarmentSVG(state, garment, crop, { uid: 'main' })) : ''),
    [state, crop, garment, hasLayers],
  );
  const thumbs = useMemo(
    () => (hasLayers ? GARMENTS.map(g => ({ g, svg: g === 'swatch' ? buildTileSheetSVG(state, crop, { pixelWidth: 300, uid: `th-${g}` }) : buildGarmentSVG(state, g, crop, { pixelWidth: 300, uid: `th-${g}` }) })) : []),
    [state, crop, hasLayers],
  );

  const file = `SOKCHO_PATTERN_${state.season.toUpperCase()}_${garment.toUpperCase()}_${stamp()}`;

  return (
    <div className="pattern-view">
      <div className="pattern-main">
        <div className="preview-card pattern-stage">
          {hasLayers ? (
            <div className="svg-host" dangerouslySetInnerHTML={{ __html: mainSvg }} />
          ) : (
            <div className="preview-empty"><p className="empty-text" style={{ color: '#aaa' }}>조합 탭에서 글리프를 먼저 배치하세요</p></div>
          )}
        </div>
        <div className="garment-strip">
          {thumbs.map(t => (
            <button key={t.g} className={`garment-thumb ${garment === t.g ? 'on' : ''}`} onClick={() => setGarment(t.g)} title={GARMENT_LABELS[t.g]}>
              <div className="svg-host" dangerouslySetInnerHTML={{ __html: t.svg }} />
              <span>{GARMENT_LABELS[t.g]}</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="pattern-side">
        <div className="panel-subtitle">타일 소스</div>
        <p className="side-note">
          {state.crop
            ? `조합 탭의 크롭 영역(${Math.round(crop.w)}×${Math.round(crop.h)})을 타일로 씁니다.`
            : '크롭을 지정하지 않아 캔버스 가운데 정사각형을 타일로 씁니다. 조합 탭에서 ✂ 크롭으로 원하는 부분을 고를 수 있습니다.'}
        </p>
        <div className="tile-source" dangerouslySetInnerHTML={{ __html: hasLayers ? buildTileSheetSVG({ ...state, tile: { mode: 'grid', scale: 1 } }, crop, { width: crop.w, height: crop.h, pixelWidth: 240, uid: 'src' }) : '' }} />

        <div className="panel-subtitle">반복 방식</div>
        <div className="mode-list">
          {MODES.map(m => (
            <button key={m.id} className={`mode-btn ${state.tile.mode === m.id ? 'on' : ''}`} onClick={() => dispatch({ type: 'SET_TILE', payload: { mode: m.id } })}>
              <b>{m.label}</b><span>{m.desc}</span>
            </button>
          ))}
        </div>

        <label className="prop">
          <span>반복 밀도 <b>가로 {state.tile.scale}칸</b></span>
          <input type="range" min="1" max="12" step="1" value={state.tile.scale} onChange={e => dispatch({ type: 'SET_TILE', payload: { scale: Number(e.target.value) } })} />
        </label>

        <div className="panel-subtitle">다운로드</div>
        <div className="export-bar vertical">
          <button className="output-btn svg-btn compact" disabled={!hasLayers} onClick={() => downloadText(`${file}.svg`, mainSvg)}>{GARMENT_LABELS[garment]} SVG</button>
          <button className="output-btn db-btn compact" disabled={!hasLayers || busy} onClick={async () => { setBusy(true); try { await downloadPng(`${file}.png`, mainSvg, 2000, 2000); } finally { setBusy(false); } }}>{GARMENT_LABELS[garment]} PNG</button>
          <button className="output-btn db-btn compact" disabled={!hasLayers} onClick={() => downloadText(`SOKCHO_TILE_${state.season.toUpperCase()}_${stamp()}.svg`, buildTileSheetSVG({ ...state, tile: { mode: 'grid', scale: 1 } }, crop, { width: crop.w, height: crop.h, pixelWidth: 2000 }))}>타일 1장 SVG</button>
        </div>
        <p className="export-note">타일 1장 SVG는 의류 제작업체에 넘길 때 반복 단위로 쓰면 됩니다. 패턴 전체도 벡터로 저장됩니다.</p>
      </aside>
    </div>
  );
}
