'use client';

// 디지털 명함 만들기: 패턴면(조합 크롭) + 정보면(블록 조립식)
import { useMemo, useState } from 'react';
import {
  useSense, FONT_LABELS, FONT_FAMILIES, CARD_PRESETS,
  type CardFields, type CardBg, type FontId, type TasteKey, type Anchor, type LogoType, type CardPreset,
} from '../context/SenseContext';
import { SEASONAL_COLORS, TASTE_LABELS } from '../constants/colors';
import { buildInfoDoc, buildPatternDoc, cardDocToSvg, cardColors } from '../lib/cardLayout';
import { textsToPaths } from '../lib/textFonts';
import { downloadText, downloadPng, stamp } from '../lib/svgBuilder';

const TASTE_KEYS: TasteKey[] = ['sweet', 'salty', 'spicy', 'sour', 'bitter', 'umami'];
const BGS: { id: CardBg; label: string }[] = [{ id: 'white', label: '흰색' }, { id: 'black', label: '검정' }, { id: 'season', label: '계절색' }];
const ANCHORS: Anchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const LOGO_TYPES: { id: LogoType; label: string }[] = [
  { id: 'org', label: '소속 이름(글자)' }, { id: 'pattern', label: '패턴 크롭' }, { id: 'glyph', label: '글리프 마크' }, { id: 'none', label: '없음' },
];

function Field({ k, label, placeholder, multiline }: { k: keyof CardFields; label: string; placeholder?: string; multiline?: boolean }) {
  const { state, dispatch } = useSense();
  const v = state.card.fields[k];
  const on = (value: string) => dispatch({ type: 'SET_CARD_FIELD', payload: { key: k, value } });
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea rows={2} value={v} placeholder={placeholder} onChange={e => on(e.target.value)} /> : <input type="text" value={v} placeholder={placeholder} onChange={e => on(e.target.value)} />}
    </label>
  );
}

function AnchorPicker({ value, onChange, label }: { value: Anchor; onChange: (a: Anchor) => void; label: string }) {
  return (
    <div className="anchor-picker" role="group" aria-label={label}>
      {ANCHORS.map(a => <button key={a} type="button" className={`anchor-cell ${value === a ? 'on' : ''}`} title={a} onClick={() => onChange(a)} />)}
    </div>
  );
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="side-section" open={open}>
      <summary>{title}</summary>
      <div className="side-section-body">{children}</div>
    </details>
  );
}

export default function CardView() {
  const { state, dispatch } = useSense();
  const { card } = state;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const hasLayers = state.layers.length > 0;
  const fontFamily = FONT_FAMILIES[card.font];
  const isStore = card.kind === 'store';

  const infoDoc = useMemo(() => buildInfoDoc(state), [state]);
  const patternDoc = useMemo(() => buildPatternDoc(state), [state]);
  const infoSvg = useMemo(() => cardDocToSvg(infoDoc, null, fontFamily, { pixelWidth: 900, trimMarks: card.bleed }), [infoDoc, fontFamily, card.bleed]);
  const patternSvg = useMemo(() => cardDocToSvg(patternDoc, null, fontFamily, { pixelWidth: 900, trimMarks: card.bleed }), [patternDoc, fontFamily, card.bleed]);

  const base = `SOKCHO_CARD_${(card.fields.name || card.fields.org || 'card').replace(/\s+/g, '_')}_${stamp()}`;

  const exportSide = async (side: 'info' | 'pattern', fmt: 'svg' | 'png') => {
    setBusy(`${side}-${fmt}`); setMsg(null);
    try {
      const doc = side === 'info' ? infoDoc : patternDoc;
      const textMarkup = side === 'info' ? await textsToPaths(card.font, doc.texts) : '';
      const svg = cardDocToSvg(doc, textMarkup, fontFamily);
      const name = `${base}_${side === 'info' ? 'INFO' : 'PATTERN'}`;
      if (fmt === 'svg') downloadText(`${name}.svg`, svg);
      else { const w = Math.round(doc.width / 10 / 25.4 * 300); await downloadPng(`${name}.png`, svg, w, Math.round(w * doc.height / doc.width)); }
      setMsg(`${side === 'info' ? '정보면' : '패턴면'} ${fmt.toUpperCase()} 저장 완료${side === 'info' ? ' (글자는 모두 외곽선으로 변환됨)' : ''}`);
    } catch (e) { setMsg(`저장 실패: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  type SetCardPayload = Extract<Parameters<typeof dispatch>[0], { type: 'SET_CARD' }>['payload'];
  const setCard = (p: SetCardPayload) => dispatch({ type: 'SET_CARD', payload: p });
  const applyPreset = (id: CardPreset) => setCard({ preset: id, ...CARD_PRESETS[id].apply });
  const colors = cardColors(state);

  return (
    <div className="card-view">
      <div className="card-main">
        <div className="card-previews">
          <figure className="card-figure">
            <figcaption>정보면 <small>90×50mm{card.bleed ? ' · 점선 = 재단선' : ''}</small></figcaption>
            <div className="card-paper"><div className="svg-host" dangerouslySetInnerHTML={{ __html: infoSvg }} /></div>
            <div className="export-bar">
              <button className="output-btn svg-btn compact" disabled={!!busy} onClick={() => exportSide('info', 'svg')}>{busy === 'info-svg' ? '변환 중…' : 'SVG'}</button>
              <button className="output-btn db-btn compact" disabled={!!busy} onClick={() => exportSide('info', 'png')}>{busy === 'info-png' ? '변환 중…' : 'PNG 300dpi'}</button>
            </div>
          </figure>
          <figure className="card-figure">
            <figcaption>패턴면</figcaption>
            <div className={`card-paper ${hasLayers ? '' : 'empty'}`}>
              {hasLayers ? <div className="svg-host" dangerouslySetInnerHTML={{ __html: patternSvg }} /> : <p className="empty-text">조합 탭에서 글리프를 배치하면 여기에 들어갑니다</p>}
            </div>
            <div className="export-bar">
              <button className="output-btn svg-btn compact" disabled={!hasLayers || !!busy} onClick={() => exportSide('pattern', 'svg')}>SVG</button>
              <button className="output-btn db-btn compact" disabled={!hasLayers || !!busy} onClick={() => exportSide('pattern', 'png')}>PNG 300dpi</button>
            </div>
          </figure>
        </div>
        {msg && <p className="export-note status">{msg}</p>}
        <p className="export-note">인쇄소에 넘길 때는 ‘재단 여백 포함’을 켜고 SVG(또는 PNG 300dpi)를 전달하세요. 정보면 SVG의 글자는 외곽선(패스)으로 변환되어 글꼴이 없어도 깨지지 않습니다.</p>
      </div>

      <aside className="card-side">
        <div className="seg">
          <button className={!isStore ? 'on' : ''} onClick={() => setCard({ kind: 'personal' })}>개인용</button>
          <button className={isStore ? 'on' : ''} onClick={() => setCard({ kind: 'store' })}>가게용</button>
        </div>

        <Section title="프리셋">
          <div className="mode-list">
            {(Object.keys(CARD_PRESETS) as CardPreset[]).map(id => (
              <button key={id} className={`mode-btn ${card.preset === id ? 'on' : ''}`} onClick={() => applyPreset(id)}>
                <b>{CARD_PRESETS[id].label}</b><span>{CARD_PRESETS[id].desc}</span>
              </button>
            ))}
          </div>
          <p className="side-note">프리셋을 고른 뒤 아래에서 블록마다 위치·크기를 바꿀 수 있습니다.</p>
        </Section>

        <Section title="내용">
          <div className="fields">
            <Field k="org" label={isStore ? '가게 이름 (로고 자리)' : '소속 (로고 자리)'} placeholder={isStore ? '속초 바다식당' : '속초문화관광재단'} />
            <Field k="orgEn" label="영문 소속/가게명" placeholder={isStore ? 'SOKCHO BADA' : 'Sokcho Culture & Tourism Foundation'} />
            <Field k="tagline" label="로고 옆 짧은 문구" placeholder={isStore ? '물회 · 섭국 전문' : '함께하여 아름다운'} />
            <Field k="title" label="직함" placeholder={isStore ? '대표' : '대표 이사'} />
            <Field k="name" label="이름" placeholder="홍길동" />
            <Field k="nameEn" label="영문 이름" placeholder="Hong gil dong" />
            <Field k="tel" label="Tel (가게/사무실)" placeholder="033)636-0664" />
            <Field k="phone" label="H.P (휴대전화)" placeholder="010-1234-5678" />
            <Field k="fax" label="Fax" placeholder="033)636-0665" />
            <Field k="email" label="E-mail" placeholder="hello@sokcho.kr" />
            <Field k="instagram" label="인스타그램" placeholder="@sokcho_food" />
            <Field k="website" label="웹사이트" placeholder="sokchocf.or.kr" />
            <Field k="address" label="주소 (줄바꿈 가능)" placeholder="강원특별자치도 속초시 번영로 155" multiline />
            <Field k="hours" label={isStore ? '영업시간 등 (줄바꿈 가능)' : '기타 한 줄 (줄바꿈 가능)'} placeholder={isStore ? '11:00–21:00 · 화요일 휴무' : ''} multiline />
          </div>
        </Section>

        <Section title="로고 자리">
          <div className="seg wrap">
            {LOGO_TYPES.map(t => <button key={t.id} className={card.logo.type === t.id ? 'on' : ''} onClick={() => setCard({ logo: { type: t.id } })}>{t.label}</button>)}
          </div>
          {card.logo.type !== 'none' && (
            <div className="block-controls">
              <div className="prop"><span>위치</span><AnchorPicker label="로고 위치" value={card.logo.pos} onChange={pos => setCard({ logo: { pos } })} /></div>
              <label className="prop"><span>크기 <b>{Math.round(card.logo.size * 100)}%</b></span><input type="range" min="0.5" max="2" step="0.05" value={card.logo.size} onChange={e => setCard({ logo: { size: Number(e.target.value) } })} /></label>
              {card.logo.type === 'pattern' && (
                <div className="prop"><span>모양</span>
                  <div className="seg">
                    {(['wide', 'rect', 'circle'] as const).map(s => <button key={s} className={card.logo.shape === s ? 'on' : ''} onClick={() => setCard({ logo: { shape: s } })}>{s === 'wide' ? '가로형' : s === 'rect' ? '정사각' : '원형'}</button>)}
                  </div>
                </div>
              )}
              {(card.logo.type === 'pattern' || card.logo.type === 'glyph') && <p className="side-note">마크 옆에 소속/가게 이름과 문구가 함께 붙습니다(비우면 마크만).</p>}
            </div>
          )}
        </Section>

        <Section title="이름 블록">
          <div className="block-controls">
            <div className="prop"><span>위치</span><AnchorPicker label="이름 위치" value={card.name.pos} onChange={pos => setCard({ name: { pos } })} /></div>
            <label className="prop"><span>크기 <b>{Math.round(card.name.size * 100)}%</b></span><input type="range" min="0.6" max="1.6" step="0.05" value={card.name.size} onChange={e => setCard({ name: { size: Number(e.target.value) } })} /></label>
            <label className="prop"><span>자간 <b>{card.name.spacing === 0 ? '없음' : card.name.spacing}</b></span><input type="range" min="0" max="0.8" step="0.1" value={card.name.spacing} onChange={e => setCard({ name: { spacing: Number(e.target.value) } })} /></label>
            <div className="prop"><span>영문 이름</span>
              <div className="seg">{(['inline', 'below', 'hidden'] as const).map(v => <button key={v} className={card.name.en === v ? 'on' : ''} onClick={() => setCard({ name: { en: v } })}>{v === 'inline' ? '옆에' : v === 'below' ? '아래에' : '숨김'}</button>)}</div>
            </div>
            <div className="prop"><span>직함 위치</span>
              <div className="seg">{(['above', 'inline', 'below'] as const).map(v => <button key={v} className={card.name.titlePos === v ? 'on' : ''} onClick={() => setCard({ name: { titlePos: v } })}>{v === 'above' ? '이름 위' : v === 'inline' ? '이름 앞' : '이름 아래'}</button>)}</div>
            </div>
            <label className="check"><input type="checkbox" checked={card.divider} onChange={e => setCard({ divider: e.target.checked })} /> 이름 아래 짧은 구분선</label>
          </div>
        </Section>

        <Section title="연락처 블록">
          <div className="block-controls">
            <div className="prop"><span>위치</span><AnchorPicker label="연락처 위치" value={card.contacts.pos} onChange={pos => setCard({ contacts: { pos } })} /></div>
            <label className="prop"><span>크기 <b>{Math.round(card.contacts.size * 100)}%</b></span><input type="range" min="0.7" max="1.4" step="0.05" value={card.contacts.size} onChange={e => setCard({ contacts: { size: Number(e.target.value) } })} /></label>
            <div className="prop"><span>단 구성</span>
              <div className="seg"><button className={card.contacts.columns === 1 ? 'on' : ''} onClick={() => setCard({ contacts: { columns: 1 } })}>1단</button><button className={card.contacts.columns === 2 ? 'on' : ''} onClick={() => setCard({ contacts: { columns: 2 } })}>2단</button></div>
            </div>
            <div className="prop"><span>항목 이름 표기</span>
              <div className="seg">{(['word', 'short', 'none'] as const).map(v => <button key={v} className={card.contacts.labels === v ? 'on' : ''} onClick={() => setCard({ contacts: { labels: v } })}>{v === 'word' ? 'Tel : / H.P :' : v === 'short' ? 'T. / M.' : '없음'}</button>)}</div>
            </div>
            <label className="check"><input type="checkbox" checked={card.contacts.addressFirst} onChange={e => setCard({ contacts: { addressFirst: e.target.checked } })} /> 주소를 맨 위에</label>
          </div>
        </Section>

        <Section title="스타일">
          <div className="prop"><span>바탕</span>
            <div className="seg">{BGS.map(b => <button key={b.id} className={card.bg === b.id ? 'on' : ''} onClick={() => setCard({ bg: b.id })}>{b.label}</button>)}</div>
          </div>
          <div className="prop"><span>포인트 색 <b>{TASTE_LABELS[card.accentTaste]}</b></span>
            <div className="swatches">
              {TASTE_KEYS.map(k => { const c = SEASONAL_COLORS[state.season][k]; return <button key={k} className={`swatch ${card.accentTaste === k ? 'on' : ''}`} style={{ background: c }} title={TASTE_LABELS[k]} onClick={() => setCard({ accentTaste: k })} />; })}
              <span className="swatch-preview" style={{ background: colors.bg, color: colors.text }}>가</span>
            </div>
          </div>
          <label className="prop"><span>글꼴</span>
            <select value={card.font} onChange={e => setCard({ font: e.target.value as FontId })}>
              {(Object.keys(FONT_LABELS) as FontId[]).map(f => <option key={f} value={f}>{FONT_LABELS[f]}</option>)}
            </select>
            <span className="font-sample" style={{ fontFamily }}>속초 음식문화도시 Sokcho 0123</span>
          </label>
          <label className="prop"><span>안쪽 여백 <b>{(card.margin / 10).toFixed(1)}mm</b></span><input type="range" min="30" max="110" step="5" value={card.margin} onChange={e => setCard({ margin: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={card.accentBar} onChange={e => setCard({ accentBar: e.target.checked })} /> 왼쪽 세로 포인트 띠</label>
        </Section>

        <Section title="패턴면" open={false}>
          <div className="prop"><span>채우기</span>
            <div className="seg">
              <button className={card.patternFit === 'cover' ? 'on' : ''} onClick={() => setCard({ patternFit: 'cover' })}>크롭 그대로 꽉 채움</button>
              <button className={card.patternFit === 'tile' ? 'on' : ''} onClick={() => setCard({ patternFit: 'tile' })}>타일 반복</button>
            </div>
          </div>
          {card.patternFit === 'tile' && (
            <label className="prop"><span>반복 밀도 <b>가로 {card.patternScale}칸</b> · 방식은 패턴화 탭 설정을 따름</span><input type="range" min="1" max="10" step="1" value={card.patternScale} onChange={e => setCard({ patternScale: Number(e.target.value) })} /></label>
          )}
          <p className="side-note">{state.crop ? '조합 탭의 크롭 영역을 사용합니다. 명함 비율(9:5)로 크롭하면 잘림 없이 들어갑니다.' : '크롭이 없어 캔버스 가운데를 명함 비율로 잘라 씁니다. 조합 탭 ✂ 크롭 → "명함 9:5"를 선택해 원하는 부분을 고를 수 있습니다.'}</p>
        </Section>

        <label className="check"><input type="checkbox" checked={card.bleed} onChange={e => setCard({ bleed: e.target.checked })} /> 재단 여백 2mm 포함 (인쇄소 제출용)</label>
      </aside>
    </div>
  );
}
