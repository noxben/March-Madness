import React, { useState, useCallback } from 'react';
import { analyzeMatchup, compositeElo } from '../utils/simulator';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

export default function MatchupExplorer({ teams }) {
  const [teamA, setTeamA] = useState(null);
  const [teamB, setTeamB] = useState(null);
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [result, setResult] = useState(null);
  const [resultNoInj, setResultNoInj] = useState(null);
  const [running, setRunning] = useState(false);
  const [simCount] = useState(5000);

  const filteredA = searchA.length > 1
    ? teams.filter(t => t.team.toLowerCase().includes(searchA.toLowerCase())).slice(0, 8)
    : [];
  const filteredB = searchB.length > 1
    ? teams.filter(t => t.team.toLowerCase().includes(searchB.toLowerCase())).slice(0, 8)
    : [];

  const analyze = useCallback(() => {
    if (!teamA || !teamB) return;
    setRunning(true);

    setTimeout(() => {
      const res = analyzeMatchup(teamA, teamB, simCount);
      setResult(res);

      // Scenario without injuries
      const cleanA = { ...teamA, injuries: [] };
      const cleanB = { ...teamB, injuries: [] };
      const noInj = analyzeMatchup(cleanA, cleanB, simCount);
      setResultNoInj(noInj);

      setRunning(false);
    }, 50);
  }, [teamA, teamB, simCount]);

  const hasInjuries = (teamA?.injuries?.length > 0) || (teamB?.injuries?.length > 0);

  return (
    <div className="matchup-explorer">
      <h2>Matchup Lab</h2>
      <p className="matchup-sub">
        Simulate any head-to-head matchup. Uses composite Elo (5/8 barthag + 3/8 efficiency),
        fat-tailed score distribution, binary injury rolls — {simCount.toLocaleString()} sims.
      </p>

      <div className="team-pickers">
        <TeamPicker
          label="Team A"
          selected={teamA}
          search={searchA}
          onSearch={setSearchA}
          filtered={filteredA}
          onSelect={t => { setTeamA(t); setSearchA(''); setResult(null); }}
          color="var(--accent-a)"
        />
        <div className="vs-badge">VS</div>
        <TeamPicker
          label="Team B"
          selected={teamB}
          search={searchB}
          onSearch={setSearchB}
          filtered={filteredB}
          onSelect={t => { setTeamB(t); setSearchB(''); setResult(null); }}
          color="var(--accent-b)"
        />
      </div>

      <div className="matchup-actions">
        <button
          className={`btn-primary ${running ? 'loading' : ''}`}
          onClick={analyze}
          disabled={!teamA || !teamB || running}
        >
          {running ? '⟳ Simulating...' : '▶ Analyze Matchup'}
        </button>
      </div>

      {result && teamA && teamB && (
        <div className="matchup-results">
          <div className="matchup-headline">
            <div className="headline-team" style={{ '--tc': 'var(--accent-a)' }}>
              <span className="ht-name">{teamA.team}</span>
              <span className="ht-prob" style={{ color: 'var(--accent-a)' }}>
                {(result.winProbA * 100).toFixed(1)}%
              </span>
              <span className="ht-score">proj. {result.avgScoreA}</span>
            </div>
            <div className="headline-divider">—</div>
            <div className="headline-team" style={{ '--tc': 'var(--accent-b)' }}>
              <span className="ht-name">{teamB.team}</span>
              <span className="ht-prob" style={{ color: 'var(--accent-b)' }}>
                {(result.winProbB * 100).toFixed(1)}%
              </span>
              <span className="ht-score">proj. {result.avgScoreB}</span>
            </div>
          </div>

          {/* Score distribution chart */}
          <div className="chart-section">
            <h4>Score Margin Distribution ({simCount.toLocaleString()} sims)</h4>
            <p className="chart-sub">Positive = {teamA.team} wins · Negative = {teamB.team} wins</p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={result.distribution} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-a)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--accent-a)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-b)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--accent-b)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="margin"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={v => v > 0 ? `+${v}` : v}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  formatter={(val, name) => [`${(val * 100).toFixed(1)}%`, 'Frequency']}
                  labelFormatter={v => `Margin: ${v > 0 ? '+' : ''}${v} (${v > 0 ? teamA.team : teamB.team})`}
                />
                <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="4 2" />
                <Area
                  type="monotone"
                  dataKey={d => d.margin >= 0 ? d.pct : null}
                  stroke="var(--accent-a)"
                  fill="url(#colorA)"
                  strokeWidth={2}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey={d => d.margin < 0 ? d.pct : null}
                  stroke="var(--accent-b)"
                  fill="url(#colorB)"
                  strokeWidth={2}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Stats comparison */}
          <div className="stats-comparison">
            <StatRow label="Composite Elo" a={Math.round(result.eloA)} b={Math.round(result.eloB)} higherIsBetter />
            <StatRow label="AdjO (off. eff.)" a={teamA.adjO?.toFixed(1)} b={teamB.adjO?.toFixed(1)} higherIsBetter />
            <StatRow label="AdjD (def. eff.)" a={teamA.adjD?.toFixed(1)} b={teamB.adjD?.toFixed(1)} lowerIsBetter />
            <StatRow label="Net Rating" a={(teamA.adjO - teamA.adjD).toFixed(1)} b={(teamB.adjO - teamB.adjD).toFixed(1)} higherIsBetter />
            <StatRow label="Tempo (poss/g)" a={teamA.adjT?.toFixed(1)} b={teamB.adjT?.toFixed(1)} neutral />
            <StatRow label="Barthag" a={(teamA.barthag * 100).toFixed(1) + '%'} b={(teamB.barthag * 100).toFixed(1) + '%'} higherIsBetter rawA={teamA.barthag} rawB={teamB.barthag} />
          </div>

          {/* Injury scenario comparison */}
          {hasInjuries && resultNoInj && (
            <div className="scenario-compare">
              <h4>⚕ Injury Impact</h4>
              <p className="scenario-sub">How injuries shift win probability:</p>
              <div className="scenario-grid">
                <div className="scenario-card">
                  <div className="sc-label">With Current Injuries</div>
                  <div className="sc-probs">
                    <span style={{ color: 'var(--accent-a)' }}>{teamA.team}: {(result.winProbA * 100).toFixed(1)}%</span>
                    <span style={{ color: 'var(--accent-b)' }}>{teamB.team}: {(result.winProbB * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="scenario-arrow">↔</div>
                <div className="scenario-card">
                  <div className="sc-label">Both Teams Healthy</div>
                  <div className="sc-probs">
                    <span style={{ color: 'var(--accent-a)' }}>{teamA.team}: {(resultNoInj.winProbA * 100).toFixed(1)}%</span>
                    <span style={{ color: 'var(--accent-b)' }}>{teamB.team}: {(resultNoInj.winProbB * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <p className="scenario-delta">
                Injury swing: {teamA.team}
                {' '}{result.winProbA > resultNoInj.winProbA ? '+' : ''}
                {((result.winProbA - resultNoInj.winProbA) * 100).toFixed(1)}pp
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamPicker({ label, selected, search, onSearch, filtered, onSelect, color }) {
  return (
    <div className="team-picker">
      <label className="picker-label" style={{ color }}>{label}</label>
      {selected ? (
        <div className="picker-selected">
          <div className="ps-name">{selected.team}</div>
          <div className="ps-stats">
            AdjO {selected.adjO?.toFixed(1)} · AdjD {selected.adjD?.toFixed(1)} · Tempo {selected.adjT?.toFixed(0)}
          </div>
          {selected.injuries?.length > 0 && (
            <div className="ps-injuries">🩹 {selected.injuries.length} injury flag(s)</div>
          )}
          <button className="picker-clear" onClick={() => onSelect(null)}>Change ✕</button>
        </div>
      ) : (
        <div className="picker-search">
          <input
            className="search-input"
            placeholder="Search team..."
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
          {filtered.map(t => (
            <button key={t.team} className="search-result" onClick={() => onSelect(t)}>
              <span className="sr-name">{t.team}</span>
              <span className="sr-stats">{t.conf} · O:{t.adjO?.toFixed(1)} D:{t.adjD?.toFixed(1)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, a, b, higherIsBetter, lowerIsBetter, neutral, rawA, rawB }) {
  const numA = rawA !== undefined ? rawA : parseFloat(a);
  const numB = rawB !== undefined ? rawB : parseFloat(b);
  let aWins = false, bWins = false;
  if (!neutral && !isNaN(numA) && !isNaN(numB)) {
    if (higherIsBetter) { aWins = numA > numB; bWins = numB > numA; }
    if (lowerIsBetter) { aWins = numA < numB; bWins = numB < numA; }
  }
  return (
    <div className="stat-row">
      <span className={`stat-val ${aWins ? 'stat-win' : ''}`}>{a}</span>
      <span className="stat-label">{label}</span>
      <span className={`stat-val ${bWins ? 'stat-win' : ''}`}>{b}</span>
    </div>
  );
}
