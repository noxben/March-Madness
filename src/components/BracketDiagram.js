import React, { useState } from 'react';

// Standard bracket seed matchup order for display (top to bottom)
const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

const REGION_COLORS = {
  South: 'south', East: 'east', West: 'west', Midwest: 'midwest',
};

// Round labels
const ROUND_NAMES = ['R64', 'R32', 'S16', 'E8', 'F4', 'Final', 'Champ'];
const ROUND_IDX = { R64: 0, R32: 1, S16: 2, E8: 3, F4: 4, Final: 5, Champ: 6 };

export default function BracketDiagram({ teams, simResults }) {
  const [highlightRegion, setHighlightRegion] = useState(null);

  if (!simResults) {
    return (
      <div className="bracket-diagram">
        <div className="empty-state">
          <p>Run simulations first to see the bracket diagram.</p>
        </div>
      </div>
    );
  }

  // Build lookup: teamName -> simResult
  const resultFor = (name) => simResults[name] || null;

  // Get teams for a region sorted by seed order
  const regionTeams = (region) => {
    const rt = teams.filter(t => t.region === region && t.team);
    return SEED_ORDER.map(seed => rt.find(t => t.seed === seed)).filter(Boolean);
  };

  // For a given round index, get the win% to reach that round
  const pct = (teamName, roundIdx) => {
    const r = resultFor(teamName);
    if (!r) return null;
    return r.roundPct[roundIdx];
  };

  const pctClass = (p) => {
    if (p === null || p === undefined) return '';
    if (p >= 25) return 'hot';
    if (p < 5) return 'cold';
    return '';
  };

  const fmtPct = (p) => {
    if (p === null || p === undefined) return '';
    if (p < 1) return p > 0 ? '<1%' : '—';
    return `${p.toFixed(1)}%`;
  };

  // Pair teams into R64 matchups (1v16, 8v9, etc.)
  const makePairs = (regionTeamList) => {
    const pairs = [];
    for (let i = 0; i < regionTeamList.length / 2; i++) {
      pairs.push([regionTeamList[i], regionTeamList[regionTeamList.length - 1 - i]]);
    }
    return pairs;
  };

  // Build round columns for a region: rounds 0-3 (R64 through Elite 8)
  // Returns array of round arrays, each containing groups of teams
  const buildRegionRounds = (region) => {
    const rt = regionTeams(region);
    const pairs = makePairs(rt); // 8 R64 matchups

    // R64: 16 teams in 8 matchups
    const r64 = pairs;

    // R32: 8 teams (winners of each pair, grouped by quarter)
    const r32 = [
      [r64[0][0], r64[0][1], r64[1][0], r64[1][1]],
      [r64[2][0], r64[2][1], r64[3][0], r64[3][1]],
      [r64[4][0], r64[4][1], r64[5][0], r64[5][1]],
      [r64[6][0], r64[6][1], r64[7][0], r64[7][1]],
    ];

    // S16: 4 teams
    const s16 = [
      [r64[0][0], r64[1][0], r64[2][0], r64[3][0]],
      [r64[4][0], r64[5][0], r64[6][0], r64[7][0]],
    ];

    // E8: 2 teams
    const e8 = [rt[0], rt[1]]; // just representatives

    return { r64, r32, s16, e8, allTeams: rt };
  };

  // Top 4 teams by champ% for each region (for Final Four)
  const finalFourTeams = (region) => {
    const rt = regionTeams(region);
    return rt
      .map(t => ({ ...t, champPct: pct(t.team.team, 4) || 0 }))
      .sort((a, b) => b.champPct - a.champPct)
      .slice(0, 4);
  };

  const TeamBox = ({ teamSlot, roundIdx, showRegionColor = false }) => {
    if (!teamSlot || !teamSlot.team) return <div className="bd-team" style={{ opacity: 0.2 }}><span className="bd-name">TBD</span></div>;
    const name = teamSlot.team.team;
    const seed = teamSlot.seed;
    const p = pct(name, roundIdx);
    const region = teamSlot.region;
    const colorClass = showRegionColor ? (REGION_COLORS[region] || '') : '';
    const isHighlighted = !highlightRegion || highlightRegion === region;

    return (
      <div
        className={`bd-team ${colorClass} ${isHighlighted ? '' : 'eliminated'}`}
        title={`${name} — ${ROUND_NAMES[roundIdx]}: ${fmtPct(p)}`}
      >
        <span className="bd-seed">#{seed}</span>
        <span className="bd-name">{name}</span>
        {p !== null && <span className={`bd-pct ${pctClass(p)}`}>{fmtPct(p)}</span>}
      </div>
    );
  };

  // Build the left side: South (bottom-left) and East (top-left)
  // Build the right side: West (top-right) and Midwest (bottom-right)

  const renderRegionColumn = (region, roundIdx, teams4or8) => (
    <div className="bd-col">
      {teams4or8.map((t, i) => (
        <TeamBox key={i} teamSlot={t} roundIdx={roundIdx} showRegionColor={roundIdx <= 1} />
      ))}
    </div>
  );

  // Simplified visual: show R64, R32, S16, E8 for each region side, then F4/Final/Champ in center
  const regions = ['East', 'South', 'West', 'Midwest'];

  // For each region, collect teams sorted by seed order
  const allRegionTeams = {};
  regions.forEach(r => { allRegionTeams[r] = regionTeams(r); });

  // Best 2 teams per region by F4 probability
  const f4Teams = regions.map(region => {
    const rt = allRegionTeams[region];
    return rt
      .map(t => ({ slot: t, f4pct: pct(t.team?.team, 4) || 0 }))
      .sort((a, b) => b.f4pct - a.f4pct)
      .slice(0, 1)[0]?.slot;
  });

  // Championship odds — top 8
  const champContenders = Object.values(simResults)
    .filter(r => r.roundPct[6] > 0.5)
    .sort((a, b) => b.roundPct[6] - a.roundPct[6])
    .slice(0, 8);

  return (
    <div className="bracket-diagram">
      {/* Region filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Highlight:</span>
        {['All', ...regions].map(r => (
          <button
            key={r}
            className={`filter-btn ${(highlightRegion === r || (r === 'All' && !highlightRegion)) ? 'active' : ''}`}
            style={r !== 'All' ? { borderColor: `var(--region-${r.toLowerCase()})`, color: `var(--region-${r.toLowerCase()})` } : {}}
            onClick={() => setHighlightRegion(r === 'All' ? null : r)}
          >{r}</button>
        ))}
      </div>

      {/* One region per row — clean readable layout */}
      {regions.map(region => (
        <RegionBracket
          key={region}
          region={region}
          teams={allRegionTeams[region]}
          simResults={simResults}
          pct={pct}
          fmtPct={fmtPct}
          pctClass={pctClass}
          highlighted={!highlightRegion || highlightRegion === region}
        />
      ))}

      {/* Championship odds card */}
      <ChampionshipOdds simResults={simResults} fmtPct={fmtPct} />
    </div>
  );
}

function RegionBracket({ region, teams, simResults, pct, fmtPct, pctClass, highlighted }) {
  if (!teams || teams.length === 0) return null;

  const colorVar = `var(--region-${region.toLowerCase()})`;
  const SEED_ORDER_DISPLAY = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
  const ordered = SEED_ORDER_DISPLAY.map(seed => teams.find(t => t.seed === seed)).filter(Boolean);

  // Group into R64 matchups
  const matchups = [];
  for (let i = 0; i < 8; i++) {
    matchups.push([ordered[i], ordered[15 - i]]);
  }

  const rounds = [
    { label: 'R64', idx: 0, groups: matchups },
    { label: 'R32', idx: 1, groups: [matchups.slice(0,2), matchups.slice(2,4), matchups.slice(4,6), matchups.slice(6,8)].map(g => g.flat()) },
    { label: 'S16', idx: 2, groups: [matchups.slice(0,4).flat(), matchups.slice(4,8).flat()] },
    { label: 'E8',  idx: 3, groups: [ordered] },
    { label: 'F4',  idx: 4, groups: [ordered] },
  ];

  return (
    <div style={{ opacity: highlighted ? 1 : 0.35, transition: 'opacity 0.2s' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
        paddingBottom: 8, borderBottom: `1px solid var(--border)`
      }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', color: colorVar,
          background: `color-mix(in srgb, ${colorVar} 12%, transparent)`,
          padding: '3px 10px', borderRadius: 4,
        }}>{region}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
          {teams.length} teams · #1 seed: {teams.find(t => t.seed === 1)?.team?.team || '?'}
        </span>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6, minWidth: 900 }}>

          {/* R64 */}
          <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, paddingLeft: 2 }}>R64</div>
            {ordered.map((slot, i) => (
              <TeamRow key={i} slot={slot} roundIdx={0} pct={pct} fmtPct={fmtPct} pctClass={pctClass} region={region} />
            ))}
          </div>

          {/* R32 */}
          <RoundCol label="R32" roundIdx={1} matchupGroups={matchups} ordered={ordered} groupSize={2} pct={pct} fmtPct={fmtPct} pctClass={pctClass} region={region} />

          {/* S16 */}
          <RoundCol label="S16" roundIdx={2} matchupGroups={matchups} ordered={ordered} groupSize={4} pct={pct} fmtPct={fmtPct} pctClass={pctClass} region={region} />

          {/* E8 */}
          <RoundCol label="E8" roundIdx={3} matchupGroups={matchups} ordered={ordered} groupSize={8} pct={pct} fmtPct={fmtPct} pctClass={pctClass} region={region} />

          {/* F4 */}
          <RoundCol label="F4" roundIdx={4} matchupGroups={matchups} ordered={ordered} groupSize={16} pct={pct} fmtPct={fmtPct} pctClass={pctClass} region={region} />
        </div>
      </div>
    </div>
  );
}

function RoundCol({ label, roundIdx, ordered, groupSize, pct, fmtPct, pctClass, region }) {
  // Show top N teams by win% to reach this round, preserving bracket order
  const flex = label === 'F4' ? 1.1 : label === 'E8' ? 1.2 : label === 'S16' ? 1.3 : 1.4;
  const topN = 16 / groupSize; // how many survive to this round in expectation
  const sorted = [...ordered]
    .map(s => ({ slot: s, p: pct(s.team?.team, roundIdx) || 0 }))
    .sort((a, b) => b.p - a.p)
    .slice(0, Math.max(topN * 2, 4)); // show top contenders

  return (
    <div style={{ flex, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, paddingLeft: 2 }}>{label}</div>
      {sorted.map((item, i) => (
        <TeamRow key={i} slot={item.slot} roundIdx={roundIdx} pct={pct} fmtPct={fmtPct} pctClass={pctClass} region={region} compact />
      ))}
    </div>
  );
}

function TeamRow({ slot, roundIdx, pct, fmtPct, pctClass, region, compact = false }) {
  if (!slot || !slot.team) return null;
  const name = slot.team.team;
  const p = pct(name, roundIdx);
  const colorVar = `var(--region-${region.toLowerCase()})`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'var(--surface-2)', borderRadius: 5,
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${colorVar}`,
      padding: compact ? '3px 6px' : '4px 7px',
      minHeight: compact ? 26 : 30,
      opacity: p === 0 ? 0.35 : 1,
      transition: 'opacity 0.15s',
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-dim)', minWidth: 16, textAlign: 'right' }}>#{slot.seed}</span>
      <span style={{ fontSize: compact ? '0.7rem' : '0.74rem', fontWeight: 600, color: 'var(--text)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      {p !== null && (
        <span style={{
          fontFamily: 'var(--mono)', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap',
          color: p >= 25 ? 'var(--green)' : p >= 10 ? 'var(--accent)' : p >= 5 ? 'var(--text-muted)' : 'var(--text-dim)',
        }}>{fmtPct(p)}</span>
      )}
    </div>
  );
}

function ChampionshipOdds({ simResults, fmtPct }) {
  const top = Object.values(simResults)
    .filter(r => r.roundPct[6] >= 0.5)
    .sort((a, b) => b.roundPct[6] - a.roundPct[6])
    .slice(0, 12);

  const REGION_COLOR = { South: 'var(--region-south)', East: 'var(--region-east)', West: 'var(--region-west)', Midwest: 'var(--region-midwest)' };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700 }}>🏆 Championship Odds</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>teams with &gt;0.5% chance</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
        {top.map(({ team, seed, region, roundPct }, i) => (
          <div key={team.team} style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${REGION_COLOR[region] || 'var(--accent)'}`,
            borderRadius: 8, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-dim)', fontFamily: 'var(--mono)', minWidth: 22 }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.team}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                #{seed} · {region}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: i === 0 ? 'var(--yellow)' : 'var(--accent)', fontFamily: 'var(--mono)' }}>
                {fmtPct(roundPct[6])}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                F4: {fmtPct(roundPct[4])}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
