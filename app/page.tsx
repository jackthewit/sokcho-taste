'use client';

import { useState } from 'react';
import { SenseProvider } from './context/SenseContext';
import SeasonSelector from './components/SeasonSelector';
import PreviewCard from './components/PreviewCard';
import Keypad from './components/Keypad';
import ControlPanel from './components/ControlPanel';
import PatternView from './components/PatternView';
import CardView from './components/CardView';

type Mode = 'compose' | 'pattern' | 'card';
const MODES: { id: Mode; label: string; sub: string }[] = [
  { id: 'compose', label: '조합', sub: 'COMPOSE' },
  { id: 'pattern', label: '패턴화', sub: 'PATTERN' },
  { id: 'card', label: '명함', sub: 'CARD' },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>('compose');

  return (
    <SenseProvider>
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">
            <span className="title-top">CULINARY CITY SOKCHO</span>
            <strong>DO-ABLE BRAND SYSTEM</strong>
          </h1>
          <p className="app-subtitle">음식문화도시 속초 · 감각 시각화 시스템</p>
        </header>

        <div className="top-controls">
          <SeasonSelector />
          <nav className="mode-tabs" aria-label="작업 모드">
            {MODES.map(m => (
              <button key={m.id} className={`mode-tab ${mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)}>
                <span className="mode-label">{m.label}</span>
                <span className="mode-sub">{m.sub}</span>
              </button>
            ))}
          </nav>
        </div>

        {mode === 'compose' && (
          <div className="dashboard-grid">
            <section className="left-panel">
              <div className="dashboard-box output-box"><PreviewCard /></div>
            </section>
            <aside className="right-panel">
              <div className="dashboard-box keypad-box">
                <h2 className="box-section-title">KEYPAD</h2>
                <Keypad />
              </div>
              <div className="dashboard-box control-box"><ControlPanel /></div>
            </aside>
          </div>
        )}

        {mode === 'pattern' && (
          <div className="dashboard-box output-box full-box"><PatternView /></div>
        )}

        {mode === 'card' && (
          <div className="dashboard-box output-box full-box"><CardView /></div>
        )}

        <footer className="app-footer">v1.0 | CREATED BY 붉은모자</footer>
      </div>
    </SenseProvider>
  );
}
