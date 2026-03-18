import React, { useState } from 'react';

// Standard NCAA bracket seed matchup order (top to bottom in each region)
const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

const REGION_COLOR = {
  East:    'var(--region-east)',
  West:    'var(--region-west)',
  South:   'var(--region-south)',
  Midwest: 'var(--region-midwest)',
};

export default function BracketDiagram({ teams, simResults }) {
  const [highlight, setHighlight] = useState(null);

  if (!simResults) {
    return (
      <div className="bracket-diagram">
        <div className="empty-state"><p>Run simulations first to see the bracket diagram.</p></div>
      </div>
    );
  }

  const getPct = (teamName, roundIdx) => {
    const r = simResults[teamName];
    if (!r) return null;
    return r.roundPct[roundIdx];
  };

  const fmtPct = (p) => {
    if (p === null || p === undefined) return '';
    if (p === 0) return '—';
    if (p < 1) return '<1%';
    return p.toFixed(1) + '%';
  };

  // Get teams for a region in bracket seed order
  // teams prop: array of { team: torvikObj, seed, region }
  const getRegionSlots = (region) => {
    const regionEntries = teams.filter(t => t.region === region && t.team);
    return SEED_ORDER
      .map(seed => {
        const entry = regionEntries.find(t => t.seed === seed);
        if (!entry) return null;
        return {
          teamName: entry.team.team,
          seed: entry.seed,
          region: entry.region,
        };
      })
      .filter(Boolean);
  };

  const regions = ['East', 'West', 'South', 'Midwest'];

  const champList = Object.values(simResults)
    .filter(r => r.roundPct[6] >= 0.5)
    .sort((a, b) => b.roundPct[6] - a.roundPct[6])
    .slice(0, 12);

  return (
    <div className="bracket-diagram">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Highlight:</span>
        {['All', ...regions].map(r => (
          <button
            key={r}
            className={'filter-btn' + ((!highlight && r === 'All') || highlight === r ? ' active' : '')}
            style={r !== 'All' ? { color: REGION_COLOR[r], borderColor: REGION_COLOR[r] } : {}}
            onClick={() => setHighlight(r === 'All' ? null : r)}
          >{r}</button>
        ))}
      </div>

      {regions.map(region => (
        <RegionBlock
          key={region}
          region={region}
          slots={getRegionSlots(region)}
          getPct={getPct}
          fmtPct={fmtPct}
          dimmed={!!(highlight && highlight !== region)}
        />
      ))}

      <ChampCard champList={champList} fmtPct={fmtPct} />
    </div>
  );
}

function RegionBlock({ region, slots, getPct, fmtPct, dimmed }) {
  if (!slots || slots.length === 0) return null;
  const color = REGION_COLOR[region];
  const seed1Name = slots.find(s => s.seed === 1)?.teamName || '?';

  const rounds = [
    { label: 'R64', idx: 0, showAll: true },
    { label: 'R32', idx: 1, topN: 8 },
    { label: 'S16', idx: 2, topN: 6 },
    { label: 'E8',  idx: 3, topN: 4 },
    { label: 'F4',  idx: 4, topN: 3 },
  ];

  return (
    <div style={{
      opacity: dimmed ? 0.28 : 1,
      transition: 'opacity 0.2s',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid ' + color,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', color,
          background: 'rgba(255,255,255,0.05)',
          padding: '2px 10px', borderRadius: 4,
        }}>{region}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
          #1 {seed1Name} · {slots.length} teams
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, minWidth: 860 }}>
          {rounds.map(({ label, idx, showAll, topN }) => {
            let displaySlots;
            if (showAll) {
              // R64: show all 16 in bracket order
              displaySlots = slots;
            } else {
              // Later rounds: pick top N by probability, then re-sort into bracket order
              displaySlots = slots
                .map(s => ({ ...s, p: getPct(s.teamName, idx) || 0 }))
                .sort((a, b) => b.p - a.p)
                .slice(0, topN)
                .sort((a, b) => SEED_ORDER.indexOf(a.seed) - SEED_ORDER.indexOf(b.seed));
            }

            const flex = idx === 0 ? 2.4 : idx === 1 ? 1.6 : idx === 2 ? 1.4 : idx === 3 ? 1.3 : 1.1;

            return (
              <div key={label} style={{ flex, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{
                  fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1,
                  textTransform: 'uppercase', color: 'var(--text-dim)',
                  marginBottom: 4, paddingLeft: 2,
                }}>{label}</div>
                {displaySlots.map((slot, i) => (
                  <TeamRow
                    key={slot.teamName + i}
                    slot={slot}
                    roundIdx={idx}
                    getPct={getPct}
                    fmtPct={fmtPct}
                    color={color}
                    compact={idx > 0}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamRow({ slot, roundIdx, getPct, fmtPct, color, compact }) {
  const p = getPct(slot.teamName, roundIdx);
  const pColor = p === null ? 'var(--text-dim)'
    : p >= 40 ? 'var(--green)'
    : p >= 20 ? 'var(--accent)'
    : p >= 8  ? 'var(--text-muted)'
    : 'var(--text-dim)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderLeft: '2px solid ' + color,
      borderRadius: 5,
      padding: compact ? '3px 6px' : '5px 7px',
      minHeight: compact ? 25 : 29,
      opacity: p === 0 ? 0.28 : 1,
    }}>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: '0.58rem',
        color: 'var(--text-dim)', minWidth: 18, textAlign: 'right',
      }}>{'#' + slot.seed}</span>
      <span style={{
        fontSize: compact ? '0.69rem' : '0.74rem', fontWeight: 600,
        color: 'var(--text)', flex: 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{slot.teamName}</span>
      {p !== null && (
        <span style={{
          fontFamily: 'var(--mono)', fontSize: '0.63rem',
          fontWeight: 700, color: pColor, whiteSpace: 'nowrap',
        }}>{fmtPct(p)}</span>
      )}
    </div>
  );
}

function ChampCard({ champList, fmtPct }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>🏆 Championship Odds</h3>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>teams with &gt;0.5% chance</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 7 }}>
        {champList.map(({ team, seed, region, roundPct }, i) => (
          <div key={team.team} style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid ' + (REGION_COLOR[region] || 'var(--accent)'),
            borderRadius: 8, padding: '9px 12px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--mono)',
              color: i === 0 ? 'var(--yellow)' : 'var(--text-dim)', minWidth: 20,
            }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{team.team}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {'#' + seed + ' · ' + region}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--mono)',
                color: i === 0 ? 'var(--yellow)' : 'var(--accent)',
              }}>{fmtPct(roundPct[6])}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                {'F4: ' + fmtPct(roundPct[4])}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
