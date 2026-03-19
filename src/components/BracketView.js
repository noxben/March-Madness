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
  const [overrides, setOverrides] = useState({}); // teamName -> elo adjustment (-100 to +100)
  const [showOverrides, setShowOverrides] = useState(false);
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
        // Apply manual override: adjust as extra Elo points stored on team
        const overrideElo = overrides[entry.team.team] || 0;
        regions[entry.region].push({
          ...entry.team,
          seed: entry.seed,
          region: entry.region,
          _overrideElo: overrideElo,
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

    // Simulate one full bracket
    // Rounds: 0=R64(all start), 1=R32, 2=S16, 3=E8, 4=F4, 5=Final, 6=Champ
    // Each index counts how many times a team REACHED that round across all sims
    function simOnce() {
      const f4 = []; // one winner per region

      for (const [, arr] of Object.entries(regions)) {
        if (arr.length === 0) continue;

        // Build teams in correct NCAA bracket slot order
        const slotMap = {};
        for (const t of arr) slotMap[t.seed] = t;
        let r64 = BRACKET_ORDER.map(seed => slotMap[seed]).filter(Boolean).map(t => ({ ...t }));

        // --- R64 (round 1): 16 -> 8 ---
        // BRACKET_ORDER = [1,16, 8,9, 5,12, 4,13, 6,11, 3,14, 7,10, 2,15]
        // Consecutive pairs: [0]v[1]=1v16, [2]v[3]=8v9, [4]v[5]=5v12, etc.
        // Winners reach R32 (index 1)
        const r32 = [];
        for (let i = 0; i < 16; i += 2) {
          const winner = simGame(r64[i], r64[i + 1], 1);
          r32.push(winner);
          if (teamStats[winner.team]) teamStats[winner.team].rounds[1]++;
        }
        // r32 now has 8 winners in bracket order: [1/16w, 8/9w, 5/12w, 4/13w, 6/11w, 3/14w, 7/10w, 2/15w]

        // --- R32 (round 2): 8 -> 4 ---
        // Consecutive pairs again: [0]v[1], [2]v[3], [4]v[5], [6]v[7]
        // Winners reach S16 (index 2)
        const s16 = [];
        for (let i = 0; i < 8; i += 2) {
          const winner = simGame(r32[i], r32[i + 1], 2);
          s16.push(winner);
          if (teamStats[winner.team]) teamStats[winner.team].rounds[2]++;
        }
        // s16 has 4 winners: [top-left-q, top-right-q, bottom-left-q, bottom-right-q]

        // --- S16 (round 3): 4 -> 2 ---
        // Consecutive pairs: [0]v[1], [2]v[3]
        // Winners reach E8 (index 3)
        const e8 = [];
        for (let i = 0; i < 4; i += 2) {
          const winner = simGame(s16[i], s16[i + 1], 3);
          e8.push(winner);
          if (teamStats[winner.team]) teamStats[winner.team].rounds[3]++;
        }

        // --- E8 (round 4): 2 -> 1 regional champion ---
        // Winner reaches F4 (index 4)
        const regionalChamp = simGame(e8[0], e8[1], 4);
        if (teamStats[regionalChamp.team]) teamStats[regionalChamp.team].rounds[4]++;
        f4.push(regionalChamp);
      }

      // --- Final Four (round 5): East vs West, South vs Midwest ---
      // f4 order: East[0], South[1], West[2], Midwest[3]
      if (f4.length === 4) {
        const finalist1 = simGame(f4[0], f4[2], 5); // East vs West
        const finalist2 = simGame(f4[1], f4[3], 5); // South vs Midwest
        if (teamStats[finalist1.team]) teamStats[finalist1.team].rounds[5]++;
        if (teamStats[finalist2.team]) teamStats[finalist2.team].rounds[5]++;

        // --- Championship (round 6) ---
        const champ = simGame(finalist1, finalist2, 6);
        if (teamStats[champ.team]) teamStats[champ.team].rounds[6]++;
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

    // ── Experience / Veteran bonus ────────────────────────────────────────
    // Teams with proven veteran cores outperform efficiency ratings in March.
    // Silver's expert-rating component captures this implicitly; we hardcode
    // the most clear-cut cases. Each unit = ~1 Elo point.
    // Positive = bonus, Negative = penalty (young/inexperienced roster)
    const EXPERIENCE_ADJ = {
      'Connecticut':   +12,  // Dan Hurley system, experienced returners, 2x champs
      'Duke':          +10,  // Scheyer system + Cameron Boozer — proven program
      'Gonzaga':       +10,  // Mark Few, deep tournament pedigree every year
      'Michigan St':   +10,  // Tom Izzo — statistically outperforms Elo every March
      'Houston':        +8,  // Kelvin Sampson — Elite Eight culture built in
      'Florida':        +8,  // Defending champs, returning veterans
      'Arizona':        +6,  // Tommy Lloyd system, experienced
      'Michigan':       +6,  // Dusty May — first big run but veteran roster
      'Virginia':       +4,  // Tony Bennett system advantage (but slow = limited upside)
      'Iowa St':        -8,  // Sloppy play observed, T.J. Otzelberger no Final Four
      'Santa Clara':    -6,  // WCC, limited big-game experience
      'Akron':          -4,  // MAC — first big tournament test for most players
      'Northern Iowa':  -4,  // MVC — same
      'Howard':         -4,  // MEAC — historic moment but outmatched
      'Prairie View A&M': -4,
      'Siena':          -4,
      'LIU':            -4,
      'Furman':         -4,
      'Kennesaw St':    -4,
      'Wright St':      -4,
      'Tennessee St':   -4,
    };

    // ── Shooting-style variance multiplier ──────────────────────────────────
    // 3-point-heavy offenses have wider outcome distributions — they can go
    // ice cold or red hot. We proxy this from expected PPG:
    // teams projecting 85+ pts/game get a variance boost (wider SD).
    // This makes them more "boom or bust" — correctly models how upsets happen.
    function shootingVariance(team) {
      const expPPG = (team.adjO || 100) * (team.adjT || 68) / 100;
      if (expPPG >= 90) return 1.18;   // very high scoring = 18% wider outcomes
      if (expPPG >= 87) return 1.12;
      if (expPPG >= 84) return 1.06;
      if (expPPG <= 72) return 0.90;   // low scoring grind = tighter outcomes
      if (expPPG <= 76) return 0.94;
      return 1.0;
    }

    function expAdj(team) {
      return EXPERIENCE_ADJ[team.team] || 0;
    }

    function simGame(a, b, round) {
      const injA = injPenalty(a);
      const injB = injPenalty(b);
      const [corrA, corrB] = seedCorr(a, b, round);
      const eloA = compositeElo(a) - injA * 28.5 + corrA + expAdj(a) + (a._overrideElo || 0);
      const eloB = compositeElo(b) - injB * 28.5 + corrB + expAdj(b) + (b._overrideElo || 0);

      // 60/40 pace weighting toward slower team — slowdown teams impose their pace
      const slowT = Math.min(a.adjT || 68, b.adjT || 68);
      const fastT = Math.max(a.adjT || 68, b.adjT || 68);
      const blendedT = slowT * 0.6 + fastT * 0.4;
      const pace = blendedT / 68.5;

      const netA = (a.adjO - a.adjD) * pace;
      const netB = (b.adjO - b.adjD) * pace;
      const projMargin = (netA - netB) / 2;
      const eloDiff = Math.abs(eloA - eloB);

      // Shooting-style variance: average the two teams' variance multipliers
      const varMult = (shootingVariance(a) + shootingVariance(b)) / 2;
      const sd = (10 + (eloDiff / 400) * 3) * Math.sqrt(pace) * varMult;
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
  }, [teams, simCount, onSimComplete, overrides]);

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
          <button
            className={`btn-secondary ${showOverrides ? 'active' : ''}`}
            onClick={() => setShowOverrides(s => !s)}
            style={{ fontSize: '0.8rem' }}
          >
            ⚙ Eye-Test Overrides
          </button>
          <button
            className={`btn-primary ${running ? 'loading' : ''}`}
            onClick={runSim}
            disabled={running}
          >
            {running ? `Running ${Math.round(progress * 100)}%...` : simResults ? '↺ Re-run' : '▶ Run Sims'}
          </button>
        </div>
      </div>

      {showOverrides && (
        <ManualOverrides teams={teams} overrides={overrides} onUpdate={setOverrides} />
      )}

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

// ── Manual Eye-Test Overrides Panel ──────────────────────────────────────────
// Lets you nudge any team's effective Elo before running sims.
// Positive = you think the model underrates them.
// Negative = you think the model overrates them (e.g. Iowa St sloppy play).
// Scale: +50 Elo ≈ +1.5 pts projected margin, +100 ≈ +3 pts.
function ManualOverrides({ teams, overrides, onUpdate }) {
  const bracketTeams = teams
    .filter(t => t.team)
    .map(t => ({ name: t.team.team, seed: t.seed, region: t.region }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const setOverride = (name, val) => {
    onUpdate(prev => ({ ...prev, [name]: val }));
  };

  const activeOverrides = Object.entries(overrides).filter(([, v]) => v !== 0);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>⚙ Eye-Test Overrides</h3>
        {activeOverrides.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--yellow)' }}>
            {activeOverrides.length} active adjustment{activeOverrides.length > 1 ? 's' : ''}
          </span>
        )}
        {activeOverrides.length > 0 && (
          <button
            onClick={() => onUpdate({})}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}
          >Reset all</button>
        )}
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        Nudge any team's effective rating based on what you've seen. +50 ≈ +1.5 pts stronger, -50 ≈ +1.5 pts weaker.
        Re-run sims after adjusting.
      </p>

      {/* Active overrides summary */}
      {activeOverrides.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {activeOverrides.map(([name, val]) => (
            <div key={name} style={{
              background: val > 0 ? 'rgba(52,208,122,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${val > 0 ? 'var(--green)' : 'var(--red)'}`,
              borderRadius: 6, padding: '3px 10px',
              fontSize: '0.78rem', fontWeight: 600,
              color: val > 0 ? 'var(--green)' : 'var(--red)',
            }}>
              {name}: {val > 0 ? '+' : ''}{val}
            </div>
          ))}
        </div>
      )}

      {/* Team grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 6, maxHeight: 320, overflowY: 'auto',
      }}>
        {bracketTeams.map(({ name, seed, region }) => {
          const val = overrides[name] || 0;
          const REGION_COLOR_MAP = {
            East: 'var(--region-east)', West: 'var(--region-west)',
            South: 'var(--region-south)', Midwest: 'var(--region-midwest)',
          };
          return (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${REGION_COLOR_MAP[region] || 'var(--accent)'}`,
              borderRadius: 6, padding: '5px 10px',
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text-dim)', minWidth: 20 }}>
                #{seed}
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1, color: 'var(--text)' }}>
                {name}
              </span>
              <input
                type="range" min="-150" max="150" step="10"
                value={val}
                onChange={e => setOverride(name, parseInt(e.target.value))}
                style={{ width: 80, accentColor: val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--accent)' }}
              />
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 700, minWidth: 32, textAlign: 'right',
                color: val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--text-dim)',
              }}>
                {val > 0 ? '+' : ''}{val}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
