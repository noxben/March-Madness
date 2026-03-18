import React, { useState, useCallback, useRef } from 'react';
import { runMonteCarlo, compositeElo } from '../utils/simulator';
import BracketDiagram from './BracketDiagram';

const ROUND_LABELS = ['R64', 'R32', 'S16', 'E8', 'F4', 'Final', 'Champ'];
const ROUND_COLORS = ['#4e6280', '#4f9eff', '#7c3aed', '#dc2626', '#d97706', '#f59e0b', '#16a34a'];

export default function BracketView({ teams, simResults, onSimComplete, onUpdateTeams }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [simCount, setSimCount] = useState(10000);
  const [sortBy, setSortBy] = useState('champ');
  const [filterRegion, setFilterRegion] = useState('All');
  const [viewMode, setViewMode] = useState('table'); // table | bracket
  const workerRef = useRef(null);

  const runSim = useCallback(() => {
    setRunning(true);
    setProgress(0);

    // Run in chunks to keep UI responsive (no Worker needed)
    const N = simCount;
    const chunkSize = 500;
    let completed = 0;

    const teamStats = {};
    // Order matters for F4 matchups: East(0) vs West(2), South(1) vs Midwest(3)
    const regions = { East: [], South: [], West: [], Midwest: [] };

    for (const entry of teams) {
      if (!entry.team || !entry.region) continue;
      if (regions[entry.region] !== undefined) {
        regions[entry.region].push({
          ...entry.team,
          seed: entry.seed,
          region: entry.region,
        });
      }
      teamStats[entry.team.team] = {
        team: entry.team,
        seed: entry.seed,
        region: entry.region,
        rounds: [0, 0, 0, 0, 0, 0, 0],
      };
    }

    // NCAA bracket seed order: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
    // This must be preserved so teams stay in their correct quadrant through each round
    const BRACKET_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

    // Given a list of remaining teams (any round), pair them using bracket position
    // In R64: slot 0 (seed 1) vs slot 15 (seed 16), slot 1 (seed 8) vs slot 14 (seed 9), etc.
    // In later rounds: winners of each half-bracket play each other
    function makeBracketPairs(teams) {
      // teams are already in bracket slot order; pair top half vs bottom half recursively
      const pairs = [];
      for (let i = 0; i < teams.length / 2; i++) {
        pairs.push([teams[i], teams[teams.length - 1 - i]]);
      }
      return pairs;
    }

    // Inline simulation to avoid Worker complexity
    function simOnce() {
      let f4 = [];

      for (const [, arr] of Object.entries(regions)) {
        if (arr.length === 0) continue;

        // Sort into correct NCAA bracket slot order for this region
        const slotMap = {};
        for (const t of arr) slotMap[t.seed] = t;
        // Build ordered array by bracket position
        let remaining = BRACKET_ORDER
          .map(seed => slotMap[seed])
          .filter(Boolean)
          .map(t => ({ ...t }));

        let round = 1; // R64
        while (remaining.length > 1) {
          const next = [];
          // Pair: slot i vs slot (n-1-i) — preserves bracket quadrant integrity
          for (let i = 0; i < Math.floor(remaining.length / 2); i++) {
            const a = remaining[i];
            const b = remaining[remaining.length - 1 - i];
            next.push(simGame(a, b, round));
          }
          remaining = next;
          round++;
          // round 2 = R32 (idx 1), round 3 = S16 (idx 2), round 4 = E8 (idx 3), round 5 = F4 (idx 4)
          const roundIdx = Math.min(round - 1, 4);
          for (const t of remaining) {
            if (teamStats[t.team]) teamStats[t.team].rounds[roundIdx]++;
          }
        }
        if (remaining[0]) f4.push(remaining[0]);
      }

      // Final Four: [East winner, West winner] and [South winner, Midwest winner]
      // Standard bracket: East vs West, South vs Midwest in F4
      if (f4.length === 4) {
        const eastWest = simGame(f4[0], f4[2], 5);   // East(0) vs West(2)
        const southMid = simGame(f4[1], f4[3], 5);   // South(1) vs Midwest(3)
        if (teamStats[eastWest.team]) teamStats[eastWest.team].rounds[5]++;
        if (teamStats[southMid.team]) teamStats[southMid.team].rounds[5]++;
        const champ = simGame(eastWest, southMid, 6);
        if (teamStats[champ.team]) teamStats[champ.team].rounds[6]++;
      } else if (f4.length >= 2) {
        // Fallback if some regions have no teams
        const w1 = simGame(f4[0], f4[1], 5);
        if (teamStats[w1.team]) teamStats[w1.team].rounds[5]++;
        if (f4.length >= 4) {
          const w2 = simGame(f4[2], f4[3], 5);
          if (teamStats[w2.team]) teamStats[w2.team].rounds[5]++;
          const champ = simGame(w1, w2, 6);
          if (teamStats[champ.team]) teamStats[champ.team].rounds[6]++;
        }
      }
    }

    // Historical seed upset rates (NCAA tournament since 1985)
    // Used to apply a small correction to the model's raw win probability
    // Format: [lowerSeed, higherSeed] -> historical upset rate for lower seed
    const SEED_CORRECTIONS = {
      '1v16': 0.01,  // 1-seeds win ~99% — model usually correct
      '2v15': 0.06,
      '3v14': 0.15,
      '4v13': 0.21,
      '5v12': 0.35,  // famous 12-over-5 rate; model often understimates
      '6v11': 0.37,
      '7v10': 0.40,
      '8v9':  0.49,  // nearly a coin flip historically
      '1v8':  0.07,
      '1v9':  0.08,
      '2v7':  0.28,
      '2v10': 0.30,
      '1v4':  0.20,
      '1v5':  0.25,
    };

    function getSeedCorrection(seedA, seedB) {
      // Returns a small additive correction to teamA's win probability
      // blends model probability 80% with historical rate 20%
      const lo = Math.min(seedA, seedB);
      const hi = Math.max(seedA, seedB);
      const key = lo + 'v' + hi;
      if (!SEED_CORRECTIONS[key]) return 0;
      const histRate = seedA < seedB
        ? (1 - SEED_CORRECTIONS[key])   // favored team historical win rate
        : SEED_CORRECTIONS[key];         // upset rate
      return histRate; // used as blend target below
    }

    // Historical seed correction — R64/R32 only
    // 12-over-5 upsets ~35% historically vs ~28% pure model; correct for known biases
    const SEED_CORR = {
      '1_16': -30, '2_15': -12, '3_14': -10, '4_13': -8,
      '5_12':  22, '6_11':  18, '7_10':  10, '8_9':    0,
    };
    function seedCorr(a, b, round) {
      if (round > 2 || !a.seed || !b.seed) return [0, 0];
      const hi = Math.min(a.seed, b.seed);
      const lo = Math.max(a.seed, b.seed);
      const c = SEED_CORR[hi + '_' + lo] || 0;
      // positive c favors lower seed
      return b.seed === lo ? [0, c] : [0, -c];
    }

    function simGame(a, b, round) {
      const injA = injPenalty(a);
      const injB = injPenalty(b);
      const [corrA, corrB] = seedCorr(a, b, round);
      const eloA = compositeElo(a) - injA * 28.5 + corrA;
      const eloB = compositeElo(b) - injB * 28.5 + corrB;

      // 60/40 pace weighting toward slower team — slowdown teams impose their pace
      const slowT = Math.min(a.adjT || 68, b.adjT || 68);
      const fastT = Math.max(a.adjT || 68, b.adjT || 68);
      const blendedT = slowT * 0.6 + fastT * 0.4;
      const pace = blendedT / 68.5;

      const netA = (a.adjO - a.adjD) * pace;
      const netB = (b.adjO - b.adjD) * pace;
      const projMargin = (netA - netB) / 2;
      const eloDiff = Math.abs(eloA - eloB);
      const sd = (10 + (eloDiff / 400) * 3) * Math.sqrt(pace);
      const noise = tRand() * sd;
      const rawMargin = projMargin + noise;

      // Raw model win probability for team A
      const rawWinProbA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));

      // Seed correction: blend model 80% with historical upset rates 20%
      const seedA = a.seed || 8;
      const seedB = b.seed || 8;
      const histTarget = getSeedCorrection(seedA, seedB);
      // Only apply correction in R64 and R32 where seeding is most predictive
      const correctionWeight = round <= 2 ? 0.20 : round === 3 ? 0.10 : 0;
      const adjustedProbA = histTarget > 0
        ? rawWinProbA * (1 - correctionWeight) + histTarget * correctionWeight
        : rawWinProbA;

      // Use adjusted probability to determine winner
      const teamAWins = Math.random() < adjustedProbA;
      return teamAWins ? { ...a } : { ...b };
    }

    function injPenalty(team) {
      if (!team.injuries?.length) return 0;
      let pen = 0;
      for (const inj of team.injuries) {
        if (Math.random() >= inj.playProbability) pen += (inj.impact / 10) * 8.5;
      }
      return pen;
    }

    function tRand() {
      let u, v, s;
      do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; }
      while (s >= 1 || s === 0);
      const n = u * Math.sqrt(-2 * Math.log(s) / s);
      let c = 0;
      for (let i = 0; i < 10; i++) {
        let a, b, x;
        do { a = Math.random() * 2 - 1; b = Math.random() * 2 - 1; x = a * a + b * b; }
        while (x >= 1 || x === 0);
        c += (a * Math.sqrt(-2 * Math.log(x) / x)) ** 2;
      }
      return n / Math.sqrt(c / 10);
    }

    // Initialize round 0 (everyone starts)
    for (const name of Object.keys(teamStats)) {
      teamStats[name].rounds[0] = N;
    }

    function runChunk() {
      const end = Math.min(completed + chunkSize, N);
      for (let i = completed; i < end; i++) simOnce();
      completed = end;
      setProgress(completed / N);

      if (completed < N) {
        setTimeout(runChunk, 0);
      } else {
        // Build results
        const results = {};
        for (const [name, data] of Object.entries(teamStats)) {
          results[name] = {
            ...data,
            roundPct: data.rounds.map((c, i) => {
              if (i === 0) return 100;
              return Math.round((c / N) * 1000) / 10;
            }),
          };
        }
        onSimComplete(results);
        setRunning(false);
        setProgress(1);
      }
    }

    setTimeout(runChunk, 50);
  }, [teams, simCount, onSimComplete]);

  const regions = ['All', 'South', 'East', 'West', 'Midwest'];
  const sortOptions = [
    { value: 'champ', label: 'Champ %' },
    { value: 'final', label: 'Final %' },
    { value: 'f4', label: 'Final Four %' },
    { value: 'seed', label: 'Seed' },
    { value: 'elo', label: 'Composite Elo' },
  ];

  const sortedTeams = simResults
    ? Object.values(simResults)
        .filter(r => filterRegion === 'All' || r.region === filterRegion)
        .sort((a, b) => {
          if (sortBy === 'champ') return b.roundPct[6] - a.roundPct[6];
          if (sortBy === 'final') return b.roundPct[5] - a.roundPct[5];
          if (sortBy === 'f4') return b.roundPct[4] - a.roundPct[4];
          if (sortBy === 'seed') return a.seed - b.seed;
          if (sortBy === 'elo') return compositeElo(b.team) - compositeElo(a.team);
          return 0;
        })
    : [];

  return (
    <div className="bracket-view">
      <InjuryRefresh teams={teams} onUpdate={onUpdateTeams} />
      <div className="sim-controls">
        <div className="sim-left">
          <h2>Bracket Simulator</h2>
          <p className="sim-sub">
            {simResults
              ? `${simCount.toLocaleString()} simulations complete · ${teams.length} teams`
              : `Ready to run ${simCount.toLocaleString()} Monte Carlo simulations`}
          </p>
        </div>
        <div className="sim-right">
          <div className="sim-count-control">
            <label>Simulations</label>
            <select value={simCount} onChange={e => setSimCount(parseInt(e.target.value))}>
              <option value={1000}>1,000 (fast)</option>
              <option value={5000}>5,000</option>
              <option value={10000}>10,000</option>
              <option value={25000}>25,000 (slow)</option>
            </select>
          </div>
          <InjuryRefresh teams={teams} onUpdateTeams={onUpdateTeams} />
          <button
            className={`btn-primary ${running ? 'loading' : ''}`}
            onClick={runSim}
            disabled={running}
          >
            {running ? `Running ${Math.round(progress * 100)}%...` : simResults ? '↺ Re-run' : '▶ Run Sims'}
          </button>
        </div>
      </div>

      {running && (
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {simResults && (
        <>
          <div className="bracket-view-tabs">
            <button className={`bracket-tab ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
              📊 Probability Table
            </button>
            <button className={`bracket-tab ${viewMode === 'bracket' ? 'active' : ''}`} onClick={() => setViewMode('bracket')}>
              🏀 Bracket View
            </button>
          </div>

          {viewMode === 'bracket' && (
            <BracketDiagram teams={teams} simResults={simResults} />
          )}

          {viewMode === 'table' && <>
          <div className="results-controls">
            <div className="filter-group">
              {regions.map(r => (
                <button
                  key={r}
                  className={`filter-btn ${filterRegion === r ? 'active' : ''}`}
                  onClick={() => setFilterRegion(r)}
                >{r}</button>
              ))}
            </div>
            <div className="sort-group">
              <label>Sort by</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                {sortOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Seed</th>
                  <th>Team</th>
                  <th>Region</th>
                  <th>Elo</th>
                  <th>AdjO</th>
                  <th>AdjD</th>
                  {ROUND_LABELS.slice(1).map((l, i) => (
                    <th key={l} style={{ color: ROUND_COLORS[i + 1] }}>{l}</th>
                  ))}
                  <th>Injuries</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map(({ team, seed, region, roundPct }) => {
                  const elo = Math.round(compositeElo(team));
                  const injCount = team.injuries?.length || 0;
                  return (
                    <tr key={team.team} className={seed <= 4 ? 'top-seed' : ''}>
                      <td className="seed-cell">
                        <span className={`seed-badge seed-${seed}`}>#{seed}</span>
                      </td>
                      <td className="team-name-cell">{team.team}</td>
                      <td className="region-cell">{region}</td>
                      <td className="elo-cell">{elo}</td>
                      <td>{team.adjO?.toFixed(1)}</td>
                      <td>{team.adjD?.toFixed(1)}</td>
                      {roundPct.slice(1).map((pct, i) => (
                        <td key={i} className="pct-cell">
                          <div className="pct-bar-wrap">
                            <div
                              className="pct-bar"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                background: ROUND_COLORS[i + 1],
                                opacity: 0.7 + pct / 300,
                              }}
                            />
                            <span className="pct-text">
                              {pct >= 1 ? `${pct.toFixed(1)}%` : pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                            </span>
                          </div>
                        </td>
                      ))}
                      <td className="inj-cell">
                        {injCount > 0 ? <span className="inj-badge">🩹 {injCount}</span> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          </>}

          <UpsetWatch simResults={simResults} teams={teams} />
        </>
      )}
    </div>
  );
}

// Show the most likely upsets
function UpsetWatch({ simResults, teams }) {
  const upsets = [];

  // Find cases where lower seeds have meaningful win probabilities in R1
  const bracket = Object.values(simResults);
  for (const entry of bracket) {
    const { seed, roundPct, team, region } = entry;
    if (seed >= 9 && seed <= 15 && roundPct[1] > 25) {
      // Find their R1 opponent
      const mirrorSeed = 17 - seed;
      const opponent = bracket.find(e => e.seed === mirrorSeed && e.region === region);
      if (opponent) {
        upsets.push({
          upset: team.team,
          seed,
          over: opponent.team.team,
          opponentSeed: mirrorSeed,
          winPct: roundPct[1],
          region,
        });
      }
    }
  }

  upsets.sort((a, b) => b.winPct - a.winPct);
  const top5 = upsets.slice(0, 6);

  if (top5.length === 0) return null;

  return (
    <div className="upset-watch">
      <h3>⚡ Upset Watch — First Round</h3>
      <div className="upset-grid">
        {top5.map((u, i) => (
          <div key={i} className="upset-card">
            <div className="upset-teams">
              <span className="upset-lower">#{u.seed} {u.upset}</span>
              <span className="upset-vs">over</span>
              <span className="upset-higher">#{u.opponentSeed} {u.over}</span>
            </div>
            <div className="upset-pct">{u.winPct.toFixed(1)}%</div>
            <div className="upset-region">{u.region}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
