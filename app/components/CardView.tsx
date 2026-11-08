'use client';

// 디지털 명함 만들기: 패턴면(조합 크롭) + 정보면(독자 레이아웃)
import { useMemo, useState } from 'react';
import { useSense, FONT_LABELS, FONT_FAMILIES, type CardFields, type CardLayout, type CardBg, type FontId, type TasteKey } from '../context/SenseContext';
import { SEASONAL_COLORS, TASTE_LABELS } from '../constants/colors';
import { buildInfoDoc, buildPatternDoc, cardDocToSvg, cardColors } from '../lib/cardLayout';
import { textsToPaths } from '../lib/textFonts';
import { downloadText, downloadPng, stamp } from '../lib/svgBuilder';

const TASTE_KEYS: TasteKey[] = ['sweet', 'salty', 'spicy', 'sour', 'bitter', 'umami'];
const LAYOUTS: { id: CardLayout; label: string; desc: string }[] = [
  { id: 'A', label: '왼쪽 정렬', desc: '이름 위, 연락처 아래' },
  { id: 'B', label: '가운데 정렬', desc: '대칭 구성' },
  { id: 'C', label: '포인트 바', desc: '세로 색 띠 + 흐린 글리프' },
];
const BGS: { id: CardBg; label: string }[] = [
  { id: 'white', label: '흰색' },
  { id: 'black', label: '검정' },
  { id: 'season', label: '계절색' },
];

function Field({ k, label, placeholder, multiline }: { k: keyof CardFields; label: string; placeholder?: string; multiline?: boolean }) {
  const { state, dispatch } = useSense();
  const v = state.card.fields[k];
  const on = (value: string) => dispatch({ type: 'SET_CARD_FIELD', payload: { key: k, value } });
  return (
    <label className="field">
      <span>{label}</span>
      {multiline
        ? <textarea rows={2} value={v} placeholder={placeholder} onChange={e => on(e.target.value)} />
        : <input type="text" value={v} placeholder={placeholder} onChange={e => on(e.target.value)} />}
    </label>
  );
}

export default function CardView() {
  const { state, dispatch } = useSense();
  const { card } = state;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const hasLayers = state.layers.length > 0;
  const fontFamily = FONT_FAMILIES[card.font];

  const infoDoc = useMemo(() => buildInfoDoc(state), [state]);
  const patternDoc = useMemo(() => buildPatternDoc(state), [state]);
  const infoSvg = useMemo(() => cardDocToSvg(infoDoc, null, fontFamily, { pixelWidth: 900, trimMarks: card.bleed }), [infoDoc, fontFamily, card.bleed]);
  const patternSvg = useMemo(() => cardDocToSvg(patternDoc, null, fontFamily, { pixelWidth: 900, trimMarks: card.bleed }), [patternDoc, fontFamily, card.bleed]);

  const base = `SOKCHO_CARD_${(card.kind === 'store' ? card.fields.storeName : card.fields.name).replace(/\s+/g, '_') || 'card'}_${stamp()}`;

  // 인쇄용: 텍스트를 모두 패스로 변환해 저장
  const exportSide = async (side: 'info' | 'pattern', fmt: 'svg' | 'png') => {
    setBusy(`${side}-${fmt}`); setMsg(null);
    try {
      const doc = side === 'info' ? infoDoc : patternDoc;
      const textMarkup = side === 'info' ? await textsToPaths(card.font, doc.texts) : '';
      const svg = cardDocToSvg(doc, textMarkup, fontFamily);
      const name = `${base}_${side === 'info' ? 'INFO' : 'PATTERN'}`;
      if (fmt === 'svg') downloadText(`${name}.svg`, svg);
      else {
        const w = Math.round(doc.width / 10 / 25.4 * 300); // 300dpi
        await downloadPng(`${name}.png`, svg, w, Math.round(w * doc.height / doc.width));
      }
      setMsg(`${side === 'info' ? '정보면' : '패턴면'} ${fmt.toUpperCase()} 저장 완료${side === 'info' ? ' (글자는 모두 외곽선으로 변환됨)' : ''}`);
    } catch (e) {
      setMsg(`저장 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const setCard = (p: Partial<typeof card>) => dispatch({ type: 'SET_CARD', payload: p });
  const colors = cardColors(state);

  return (
    <div className="card-view">
      <div className="card-main">
        <div className="card-previews">
          <figure className="card-figure">
            <figcaption>패턴면 {card.bleed && <small>· 점선 = 재단선</small>}</figcaption>
            <div className={`card-paper ${hasLayers ? '' : 'empty'}`}>
              {hasLayers
                ? <div className="svg-host" dangerouslySetInnerHTML={{ __html: patternSvg }} />
                : <p className="empty-text">조합 탭에서 글리프를 배치하면 여기에 들어갑니다</p>}
            </div>
            <div className="export-bar">
              <button className="output-btn svg-btn compact" disabled={!hasLayers || !!busy} onClick={() => exportSide('pattern', 'svg')}>SVG</button>
              <button className="output-btn db-btn compact" disabled={!hasLayers || !!busy} onClick={() => exportSide('pattern', 'png')}>PNG 300dpi</button>
            </div>
          </figure>
          <figure className="card-figure">
            <figcaption>정보면</figcaption>
            <div className="card-paper">
              <div className="svg-host" dangerouslySetInnerHTML={{ __html: infoSvg }} />
            </div>
            <div className="export-bar">
              <button className="output-btn svg-btn compact" disabled={!!busy} onClick={() => exportSide('info', 'svg')}>{busy === 'info-svg' ? '변환 중…' : 'SVG'}</button>
              <button className="output-btn db-btn compact" disabled={!!busy} onClick={() => exportSide('info', 'png')}>{busy === 'info-png' ? '변환 중…' : 'PNG 300dpi'}</button>
            </div>
          </figure>
        </div>
        {msg && <p className="export-note status">{msg}</p>}
        <p className="export-note">규격 90×50mm. 인쇄소에 넘길 때는 ‘재단 여백 포함’을 켜고 SVG(또는 PNG 300dpi)를 전달하세요. 정보면 SVG의 글자는 외곽선(패스)으로 변환되어 글꼴이 없어도 깨지지 않습니다.</p>
      </div>

      <aside className="card-side">
        <div className="seg">
          <button className={card.kind === 'personal' ? 'on' : ''} onClick={() => setCard({ kind: 'personal' })}>개인용</button>
          <button className={card.kind === 'store' ? 'on' : ''} onClick={() => setCard({ kind: 'store' })}>가게용</button>
        </div>

        <div className="panel-subtitle">내용</div>
        <div className="fields">
          {card.kind === 'store' && (
            <>
              <Field k="storeName" label="가게 이름" placeholder="예: 속초 바다식당" />
              <Field k="storeNameEn" label="영문 이름" placeholder="SOKCHO BADA" />
              <Field k="storeSub" label="한 줄 소개 / 업종" placeholder="예: 물회 · 섭국 전문" />
            </>
          )}
          <Field k="name" label={card.kind === 'store' ? '대표/담당자 이름' : '이름'} placeholder="홍길동" />
          {card.kind === 'personal' && <Field k="nameEn" label="영문 이름" placeholder="Hong Gildong" />}
          <Field k="title" label="직함" placeholder={card.kind === 'store' ? '대표' : '사무국장'} />
          {card.kind === 'personal' && <Field k="org" label="소속" placeholder="속초문화관광재단" />}
          <Field k="phone" label="전화번호" placeholder="010-1234-5678" />
          <Field k="email" label="메일" placeholder="hello@sokcho.kr" />
          <Field k="instagram" label="인스타그램" placeholder="@sokcho_food" />
          <Field k="website" label="웹사이트" placeholder="sokchocf.or.kr" />
          <Field k="address" label="주소 (줄바꿈 가능)" placeholder="강원특별자치도 속초시 번영로 155" multiline />
          {card.kind === 'store' && <Field k="hours" label="영업시간 등 (줄바꿈 가능)" placeholder="11:00–21:00 · 매주 화요일 휴무" multiline />}
        </div>

        <div className="panel-subtitle">정보면 스타일</div>
        <div className="mode-list">
          {LAYOUTS.map(l => (
            <button key={l.id} className={`mode-btn ${card.layout === l.id ? 'on' : ''}`} onClick={() => setCard({ layout: l.id })}>
              <b>{l.label}</b><span>{l.desc}</span>
            </button>
          ))}
        </div>

        <div className="prop">
          <span>바탕</span>
          <div className="seg">
            {BGS.map(b => <button key={b.id} className={card.bg === b.id ? 'on' : ''} onClick={() => setCard({ bg: b.id })}>{b.label}</button>)}
          </div>
        </div>

        <div className="prop">
          <span>포인트 색 <b>{TASTE_LABELS[card.accentTaste]}</b></span>
          <div className="swatches">
            {TASTE_KEYS.map(k => {
              const c = SEASONAL_COLORS[state.season][k];
              return <button key={k} className={`swatch ${card.accentTaste === k ? 'on' : ''}`} style={{ background: c }} title={TASTE_LABELS[k]} onClick={() => setCard({ accentTaste: k })} />;
            })}
            <span className="swatch-preview" style={{ background: colors.bg, color: colors.text }}>가</span>
          </div>
        </div>

        <label className="prop">
          <span>글꼴</span>
          <select value={card.font} onChange={e => setCard({ font: e.target.value as FontId })}>
            {(Object.keys(FONT_LABELS) as FontId[]).map(f => <option key={f} value={f}>{FONT_LABELS[f]}</option>)}
          </select>
          <span className="font-sample" style={{ fontFamily }}>속초 음식문화도시 Sokcho 0123</span>
        </label>

        <div className="panel-subtitle">패턴면</div>
        <div className="prop">
          <span>채우기</span>
          <div className="seg">
            <button className={card.patternFit === 'cover' ? 'on' : ''} onClick={() => setCard({ patternFit: 'cover' })}>크롭 그대로 꽉 채움</button>
            <button className={card.patternFit === 'tile' ? 'on' : ''} onClick={() => setCard({ patternFit: 'tile' })}>타일 반복</button>
          </div>
        </div>
        {card.patternFit === 'tile' && (
          <label className="prop">
            <span>반복 밀도 <b>가로 {card.patternScale}칸</b> · 방식은 패턴화 탭 설정을 따름</span>
            <input type="range" min="1" max="10" step="1" value={card.patternScale} onChange={e => setCard({ patternScale: Number(e.target.value) })} />
          </label>
        )}
        <p className="side-note">{state.crop ? '조합 탭의 크롭 영역을 사용합니다. 명함 비율(9:5)로 크롭하면 잘림 없이 들어갑니다.' : '크롭이 없어 캔버스 가운데를 명함 비율로 잘라 씁니다. 조합 탭 ✂ 크롭 → "명함 9:5"를 선택해 원하는 부분을 고를 수 있습니다.'}</p>

        <label className="check">
          <input type="checkbox" checked={card.bleed} onChange={e => setCard({ bleed: e.target.checked })} />
          재단 여백 2mm 포함 (인쇄소 제출용)
        </label>
      </aside>
    </div>
  );
}
