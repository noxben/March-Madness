import React, { useState } from 'react';

const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

const REGION_COLOR = {
  East:    'var(--region-east)',
  West:    'var(--region-west)',
  South:   'var(--region-south)',
  Midwest: 'var(--region-midwest)',
};

export default function BracketDiagram({ teams, simResults }) {
  const [highlight, setHighlight] = useState(null);
  const [showMatchups, setShowMatchups] = useState(true);

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
    if (p === 0) return '0%';
    if (p < 1) return '<1%';
    return p.toFixed(1) + '%';
  };

  // Head-to-head win probability: P(A wins R64) / (P(A wins R64) + P(B wins R64))
  // Since both start at 100% in R64, use their R32 advance rates as proxy for R64 win prob
  // More precisely: use ratio of (roundPct[1]) since that's who won R64
  const getMatchupOdds = (slotA, slotB) => {
    if (!slotA || !slotB) return null;
    const pA = getPct(slotA.teamName, 1) || 0;
    const pB = getPct(slotB.teamName, 1) || 0;
    const total = pA + pB;
    if (total === 0) return { pA: 50, pB: 50 };
    return { pA: Math.round(pA / total * 100), pB: Math.round(pB / total * 100) };
  };

  const getRegionSlots = (region) => {
    const regionEntries = teams.filter(t => t.region === region && t.team);
    return SEED_ORDER
      .map(seed => {
        const entry = regionEntries.find(t => t.seed === seed);
        if (!entry) return null;
        return { teamName: entry.team.team, seed: entry.seed, region: entry.region };
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
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Highlight:</span>
        {['All', ...regions].map(r => (
          <button
            key={r}
            className={'filter-btn' + ((!highlight && r === 'All') || highlight === r ? ' active' : '')}
            style={r !== 'All' ? { color: REGION_COLOR[r], borderColor: REGION_COLOR[r] } : {}}
            onClick={() => setHighlight(r === 'All' ? null : r)}
          >{r}</button>
        ))}
        <button
          className={'filter-btn' + (showMatchups ? ' active' : '')}
          style={{ marginLeft: 8 }}
          onClick={() => setShowMatchups(m => !m)}
        >
          {showMatchups ? '🎯 Matchup Odds On' : '🎯 Matchup Odds Off'}
        </button>
      </div>

      {regions.map(region => (
        <RegionBlock
          key={region}
          region={region}
          slots={getRegionSlots(region)}
          getPct={getPct}
          fmtPct={fmtPct}
          getMatchupOdds={getMatchupOdds}
          showMatchups={showMatchups}
          dimmed={!!(highlight && highlight !== region)}
        />
      ))}

      <MatchupOdds regions={regions} getRegionSlots={getRegionSlots} simResults={simResults} fmtPct={fmtPct} />
      <ChampCard champList={champList} fmtPct={fmtPct} />
    </div>
  );
}

function RegionBlock({ region, slots, getPct, fmtPct, getMatchupOdds, showMatchups, dimmed }) {
  if (!slots || slots.length === 0) return null;
  const color = REGION_COLOR[region];
  const seed1Name = slots.find(s => s.seed === 1)?.teamName || '?';

  // Build R64 matchup pairs in bracket order
  // slots are already in SEED_ORDER: [1,16,8,9,5,12,4,13,6,11,3,14,7,10,2,15]
  // pairs: slot[0] vs slot[15], slot[1] vs slot[14], etc.
  const r64Pairs = [];
  for (let i = 0; i < 8; i++) {
    r64Pairs.push([slots[i], slots[15 - i]]);
  }

  // Exact counts per round — 8 teams reach R32, 4 reach S16, 2 reach E8, 1 reaches F4
  // topN is exact, not approximate — shows exactly the right number of teams
  const rounds = [
    { label: 'R32', idx: 1, topN: 8 },
    { label: 'S16', idx: 2, topN: 4 },
    { label: 'E8',  idx: 3, topN: 2 },
    { label: 'F4',  idx: 4, topN: 1 },
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
      {/* Header */}
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
        <div style={{ display: 'flex', gap: 10, minWidth: 900 }}>

          {/* R64 matchups column — shows head-to-head odds */}
          <div style={{ flex: 2.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 2, paddingLeft: 2 }}>
              R64 {showMatchups ? '· win odds' : ''}
            </div>
            {r64Pairs.map(([topSlot, botSlot], i) => (
              <MatchupPair
                key={i}
                topSlot={topSlot}
                botSlot={botSlot}
                color={color}
                getPct={getPct}
                fmtPct={fmtPct}
                odds={showMatchups ? getMatchupOdds(topSlot, botSlot) : null}
              />
            ))}
          </div>

          {/* Later rounds */}
          {rounds.map(({ label, idx, topN }) => {
            const displaySlots = slots
              .map(s => ({ ...s, p: getPct(s.teamName, idx) || 0 }))
              .sort((a, b) => b.p - a.p)
              .slice(0, topN)
              .sort((a, b) => SEED_ORDER.indexOf(a.seed) - SEED_ORDER.indexOf(b.seed));

            const flex = idx === 1 ? 1.6 : idx === 2 ? 1.4 : idx === 3 ? 1.2 : 1.1;

            return (
              <div key={label} style={{ flex, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 2, paddingLeft: 2 }}>
                  {label}
                </div>
                {displaySlots.map((slot, i) => (
                  <TeamRow
                    key={slot.teamName + i}
                    slot={slot}
                    roundIdx={idx}
                    getPct={getPct}
                    fmtPct={fmtPct}
                    color={color}
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

// R64 matchup pair — shows both teams with head-to-head odds
function MatchupPair({ topSlot, botSlot, color, getPct, fmtPct, odds }) {
  const topP = getPct(topSlot?.teamName, 1) || 0;
  const botP = getPct(botSlot?.teamName, 1) || 0;
  const topFav = topP >= botP;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {[topSlot, botSlot].map((slot, si) => {
        if (!slot) return null;
        const isTop = si === 0;
        const isFav = isTop ? topFav : !topFav;
        const thisOdds = odds ? (isTop ? odds.pA : odds.pB) : null;
        const p = getPct(slot.teamName, 1) || 0;

        return (
          <div key={slot.teamName} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: isFav ? 'var(--surface-3)' : 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderLeft: '2px solid ' + color,
            borderRadius: si === 0 ? '5px 5px 0 0' : '0 0 5px 5px',
            padding: '4px 7px',
            minHeight: 27,
            opacity: p === 0 ? 0.25 : 1,
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.57rem', color: 'var(--text-dim)', minWidth: 18, textAlign: 'right' }}>
              #{slot.seed}
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: isFav ? 700 : 500, color: isFav ? 'var(--text)' : 'var(--text-muted)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {slot.teamName}
            </span>
            {thisOdds !== null && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '0.65rem', fontWeight: 700,
                color: thisOdds >= 70 ? 'var(--green)' : thisOdds >= 55 ? 'var(--accent)' : thisOdds >= 45 ? 'var(--yellow)' : 'var(--text-dim)',
                whiteSpace: 'nowrap', marginLeft: 2,
              }}>{thisOdds}%</span>
            )}
          </div>
        );
      })}
      {/* thin divider between pairs */}
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
    </div>
  );
}

function TeamRow({ slot, roundIdx, getPct, fmtPct, color }) {
  const raw = getPct(slot.teamName, roundIdx);
  const p = raw !== null ? Math.min(raw, 100) : null;
  const pColor = p === null ? 'var(--text-dim)'
    : p >= 40 ? 'var(--green)'
    : p >= 20 ? 'var(--accent)'
    : p >= 8  ? 'var(--text-muted)'
    : 'var(--text-dim)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderLeft: '2px solid ' + color, borderRadius: 5,
      padding: '3px 6px', minHeight: 25,
      opacity: p === 0 ? 0.25 : 1,
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.57rem', color: 'var(--text-dim)', minWidth: 18, textAlign: 'right' }}>
        #{slot.seed}
      </span>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {slot.teamName}
      </span>
      {p !== null && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.63rem', fontWeight: 700, color: pColor, whiteSpace: 'nowrap' }}>
          {fmtPct(p)}
        </span>
      )}
    </div>
  );
}

function ChampCard({ champList, fmtPct }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>🏆 Championship Odds</h3>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>teams with &gt;0.5% chance</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 7 }}>
        {champList.map(({ team, seed, region, roundPct }, i) => (
          <div key={team.team} style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderLeft: '3px solid ' + (REGION_COLOR[region] || 'var(--accent)'),
            borderRadius: 8, padding: '9px 12px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--mono)', color: i === 0 ? 'var(--yellow)' : 'var(--text-dim)', minWidth: 20 }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {team.team}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {'#' + seed + ' · ' + region}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--mono)', color: i === 0 ? 'var(--yellow)' : 'var(--accent)' }}>
                {fmtPct(roundPct[6])}
              </div>
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

// Export SEED_ORDER so MatchupPair can use it
const SEED_ORDER_REF = SEED_ORDER;
export { SEED_ORDER_REF as SEED_ORDER };


// -- R64 Matchup Odds -- shows every first-round game with win% ---------------
function MatchupOdds({ regions, getRegionSlots, simResults, fmtPct }) {
  const [open, setOpen] = React.useState(false);

  const SEED_PAIRS = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];

  const allMatchups = regions.map(region => {
    const slots = getRegionSlots(region);
    const slotBySeed = {};
    slots.forEach(s => { slotBySeed[s.seed] = s; });
    return {
      region,
      games: SEED_PAIRS.map(([hi, lo]) => {
        const a = slotBySeed[hi];
        const b = slotBySeed[lo];
        if (!a || !b) return null;
        // R32 pct = chance to advance past R64, so win% in R64 = R32% / 100
        const aR32 = simResults[a.teamName]?.roundPct[1] || 0;
        const bR32 = simResults[b.teamName]?.roundPct[1] || 0;
        const total = aR32 + bR32;
        const aWin = total > 0 ? aR32 / total * 100 : 50;
        const bWin = total > 0 ? bR32 / total * 100 : 50;
        return { a, b, aWin, bWin };
      }).filter(Boolean),
    };
  });

  const color = { East:'var(--region-east)', West:'var(--region-west)', South:'var(--region-south)', Midwest:'var(--region-midwest)' };

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width:'100%', background:'none', border:'none', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', color:'var(--text)' }}
      >
        <span style={{ fontSize:'0.9rem', fontWeight:700 }}>First Round Matchup Odds</span>
        <span style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>{open ? 'Hide' : 'Show all 32 games'}</span>
      </button>

      {open && (
        <div style={{ padding:'0 20px 20px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:16 }}>
          {allMatchups.map(({ region, games }) => (
            <div key={region}>
              <div style={{ fontSize:'0.65rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:color[region], marginBottom:8, paddingBottom:4, borderBottom:'1px solid var(--border)' }}>{region}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {games.map(({ a, b, aWin, bWin }) => {
                  const upset = b.seed <= 11 && bWin > 30;
                  return (
                    <div key={a.seed+'-'+b.seed} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', background:'var(--surface-2)', borderRadius:5, border:'1px solid var(--border)', borderLeft:'2px solid '+(upset ? 'var(--yellow)' : color[region]) }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--text)' }}>
                            <span style={{ fontFamily:'var(--mono)', fontSize:'0.6rem', color:'var(--text-dim)', marginRight:4 }}>#{a.seed}</span>
                            {a.teamName}
                          </span>
                          <span style={{ fontFamily:'var(--mono)', fontSize:'0.7rem', fontWeight:700, color: aWin >= 70 ? 'var(--green)' : aWin >= 50 ? 'var(--accent)' : 'var(--text-muted)', marginLeft:8, whiteSpace:'nowrap' }}>{aWin.toFixed(0)}%</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:2 }}>
                          <span style={{ fontSize:'0.73rem', fontWeight:600, color: upset ? 'var(--yellow)' : 'var(--text-muted)' }}>
                            <span style={{ fontFamily:'var(--mono)', fontSize:'0.6rem', color:'var(--text-dim)', marginRight:4 }}>#{b.seed}</span>
                            {b.teamName}
                            {upset && <span style={{ marginLeft:4, fontSize:'0.6rem' }}>UPSET WATCH</span>}
                          </span>
                          <span style={{ fontFamily:'var(--mono)', fontSize:'0.7rem', fontWeight:700, color: bWin >= 70 ? 'var(--green)' : bWin >= 30 ? 'var(--yellow)' : 'var(--text-dim)', marginLeft:8, whiteSpace:'nowrap' }}>{bWin.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
