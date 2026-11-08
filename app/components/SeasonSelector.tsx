'use client';

import React from 'react';
import { useSense } from '../context/SenseContext';
import { Season, SEASON_LABELS } from '../constants/colors';

const SEASON_ICONS: Record<Season, string> = {
  spring: '🌸',
  summer: '☀',
  autumn: '🍂',
  winter: '❄',
};

export default function SeasonSelector() {
  const { state, dispatch } = useSense();

  const handleSeasonChange = (season: Season) => {
    dispatch({ type: 'SET_SEASON', payload: season });
  };

  return (
    <div className="season-selector-container">
      <div className="season-tabs">
        {(['spring', 'summer', 'autumn', 'winter'] as Season[]).map((s) => (
          <button
            key={s}
            className={`season-tab ${state.season === s ? 'active' : ''}`}
            onClick={() => handleSeasonChange(s)}
          >
            <span className="season-icon">{SEASON_ICONS[s]}</span>
            <span className="season-label">{SEASON_LABELS[s]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
