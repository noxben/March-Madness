import React, { useState, useCallback } from 'react';
import DataSetup from './components/DataSetup';
import BracketView from './components/BracketView';
import MatchupExplorer from './components/MatchupExplorer';
import './App.css';

export default function App() {
  const [view, setView] = useState('data');
  const [teams, setTeams] = useState([]); // all 68 bracket teams with seed/region
  const [allTeams, setAllTeams] = useState([]); // raw Torvik data (all ~360 teams)
  const [simResults, setSimResults] = useState(null);

  const handleDataReady = useCallback((bracketTeams, rawTeams) => {
    setTeams(bracketTeams);
    setAllTeams(rawTeams);
    setView('bracket');
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-bracket">&#123;</span>
            <span className="logo-text">COOPER<span className="logo-accent">cast</span></span>
            <span className="logo-bracket">&#125;</span>
          </div>
          <p className="logo-sub">Silver Bulletin COOPER methodology · 10,000 simulations</p>
          <nav className="nav">
            <button
              className={`nav-btn ${view === 'data' ? 'active' : ''}`}
              onClick={() => setView('data')}
            >
              <span className="nav-num">01</span> Data Setup
            </button>
            <button
              className={`nav-btn ${view === 'bracket' ? 'active' : ''} ${teams.length === 0 ? 'disabled' : ''}`}
              onClick={() => teams.length > 0 && setView('bracket')}
            >
              <span className="nav-num">02</span> Bracket Sim
            </button>
            <button
              className={`nav-btn ${view === 'matchup' ? 'active' : ''} ${allTeams.length === 0 ? 'disabled' : ''}`}
              onClick={() => allTeams.length > 0 && setView('matchup')}
            >
              <span className="nav-num">03</span> Matchup Lab
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {view === 'data' && (
          <DataSetup onReady={handleDataReady} existingTeams={teams} />
        )}
        {view === 'bracket' && teams.length > 0 && (
          <BracketView
            teams={teams}
            simResults={simResults}
            onSimComplete={setSimResults}
            onUpdateTeams={setTeams}
          />
        )}
        {view === 'matchup' && allTeams.length > 0 && (
          <MatchupExplorer teams={allTeams} />
        )}
        {view === 'bracket' && teams.length === 0 && (
          <div className="empty-state">
            <p>Load your bracket data first →</p>
            <button className="btn-primary" onClick={() => setView('data')}>Go to Data Setup</button>
          </div>
        )}
      </main>
    </div>
  );
}
