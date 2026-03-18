// ============================================================
// COOPER-based March Madness Simulation Engine
// Implements Silver Bulletin COOPER methodology:
//   - Composite: 5/8 barthag-Elo + 3/8 efficiency-normalized
//   - Pace-adjusted margins: 60/40 weighted toward slower team
//   - Fat-tailed score distribution (t-dist, df=10)
//   - Binary injury rolls (not point shaving)
//   - Hot Elo updates cascading through rounds
//   - Seed-matchup historical correction factors
//   - 10,000 Monte Carlo simulations
// ============================================================

// ---------- Math helpers ----------
function tRandDF10() {
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const normal = u * Math.sqrt((-2 * Math.log(s)) / s);
  let chi2 = 0;
  for (let i = 0; i < 10; i++) {
    let a, b, c;
    do {
      a = Math.random() * 2 - 1;
      b = Math.random() * 2 - 1;
      c = a * a + b * b;
    } while (c >= 1 || c === 0);
    const n = a * Math.sqrt((-2 * Math.log(c)) / c);
    chi2 += n * n;
  }
  return normal / Math.sqrt(chi2 / 10);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ---------- Historical seed correction ----------
// Based on NCAA tournament results 1985-2025 (~40 years)
// Maps [higherSeed, lowerSeed] -> actual upset rate vs model expectation
// Positive = upset happens MORE than pure model predicts (lower seed is undervalued)
// Negative = upset happens LESS (higher seed is stronger than model thinks)
// Applied as a small additive Elo adjustment to the lower seed
const SEED_CORRECTIONS = {
  // Classic upsets: 12-over-5 (35% historically vs ~28% model), 11-over-6 (~37%)
  '5_12':  22,   // +22 Elo pts to #12 seed (they're systematically undervalued)
  '6_11':  18,   // +18 Elo pts to #11 seed
  '7_10':  10,   // slight edge to #10
  '4_13':  -8,   // #4 seeds slightly stronger than model
  '3_14':  -10,  // #3 seeds very reliable
  '2_15':  -12,  // #2 seeds dominate 15s
  '1_16':  -30,  // #1 seeds almost never lose (3/160 historically)
  '8_9':    0,   // true coin flip
};

function getSeedCorrection(seedA, seedB) {
  const hi = Math.min(seedA, seedB);
  const lo = Math.max(seedA, seedB);
  const key = hi + '_' + lo;
  const correction = SEED_CORRECTIONS[key] || 0;
  // Return positive if correction favors the lower seed (lo), negative if favors higher (hi)
  // If seedB is the lower seed, add correction to B's Elo
  if (seedB === lo) return correction;
  if (seedA === lo) return -correction;
  return 0;
}

// ---------- Normalization ----------
export function barthagToElo(barthag) {
  const p = clamp(barthag, 0.01, 0.99);
  return 1500 + 400 * Math.log10(p / (1 - p));
}

export function marginToElo(netRating) {
  return netRating * 28.5;
}

// ---------- Conference SOS Adjustment ----------
// Adjusts composite Elo based on strength of schedule implied by conference.
// Torvik opponent-adjusts for average opponent quality, but does not fully
// account for the distribution of competition — a team playing 18 SEC games
// faces a fundamentally harder gauntlet than 18 WCC games at the same avg rank.
// Values represent Elo point additions to the composite rating.
// Calibrated so the average tournament team gets ~0 net adjustment.
// Scale: 100 Elo points ≈ 3-4 point spread difference.
const CONF_SOS_ADJ = {
  // Power conferences — deep schedules, frequent top-50 opponents
  'SEC':  +28,  // 10 tourney teams in 2026, brutal top-to-bottom
  'B12':  +24,  // Arizona, Houston, Iowa St, Texas Tech, Kansas
  'B10':  +22,  // 9 tourney teams, strong middle
  'ACC':  +14,  // Duke dominant but depth below top 3 is thin
  'BE':   +12,  // UConn, Villanova — Big East still elite brand

  // Mid-major + weaker power — decent but not power-conference gauntlets
  'WCC':   +2,  // Gonzaga carries it but rest is thin
  'A10':   -2,  // Atlantic 10 — average mid-major
  'MWC':   -2,  // Mountain West — decent
  'Amer':  -4,  // American Athletic

  // True mid-majors — conference schedule not tournament-caliber
  'MAC':  -10,
  'MVC':  -10,
  'CAA':  -12,
  'Ivy':  -8,   // Smart teams, weak schedules
  'BSth': -14,
  'WAC':  -14,
  'Sum':  -14,
  'BW':   -14,
  'Horz': -14,
  'ASun': -14,
  'CUSA': -14,

  // Low-major / automatic bid conferences
  'Slnd': -20,
  'SB':   -20,
  'SC':   -20,
  'BSky': -20,
  'OVC':  -22,
  'MAAC': -20,
  'Pat':  -20,
  'NEC':  -24,
  'MEAC': -28,
  'SWAC': -28,
};

export function confSosAdj(team) {
  return CONF_SOS_ADJ[team.conf] || -5;
}

export function compositeElo(team) {
  const eloFromBarthag = barthagToElo(team.barthag);
  const eloFromEfficiency = 1500 + marginToElo(team.adjO - team.adjD);
  const base = (5 / 8) * eloFromBarthag + (3 / 8) * eloFromEfficiency;
  // Apply conference SOS adjustment — smaller weight (20%) so it nudges
  // rather than overrides the efficiency data
  // Weight 1.0: full adjustment. Moves teams ~1-4 spots, never overrides efficiency.
  return base + confSosAdj(team) * 1.0;
}

// ---------- Pace (60/40 toward slower team) ----------
// Silver: slowdown teams tend to impose their pace
// Weight: 60% slower team's tempo, 40% faster team's tempo
export function blendedPace(teamA, teamB) {
  const tA = teamA.adjT || 68;
  const tB = teamB.adjT || 68;
  const slower = Math.min(tA, tB);
  const faster = Math.max(tA, tB);
  return slower * 0.60 + faster * 0.40;
}

// ---------- Injury ----------
export function injuryPenalty(team) {
  if (!team.injuries || team.injuries.length === 0) return 0;
  let totalPenalty = 0;
  for (const injury of team.injuries) {
    const plays = Math.random() < injury.playProbability;
    if (!plays) {
      const replacementPenalty = (injury.impact / 10) * 8.5;
      totalPenalty += replacementPenalty;
    }
  }
  return totalPenalty;
}

// ---------- Win probability from Elo ----------
export function eloProbability(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// ---------- Game simulation ----------
export function simulateGame(teamA, teamB, options = {}) {
  const { round = 1, neutral = true } = options;

  let eloA = compositeElo(teamA);
  let eloB = compositeElo(teamB);

  // Injury penalties (binary roll)
  const injA = injuryPenalty(teamA);
  const injB = injuryPenalty(teamB);
  eloA -= injA * 28.5;
  eloB -= injB * 28.5;

  // Seed-matchup historical correction (only R64/R32 where seeds are known)
  if (round <= 2 && teamA.seed && teamB.seed) {
    const correction = getSeedCorrection(teamA.seed, teamB.seed);
    eloB += correction; // positive correction favors teamB (lower seed)
  }

  // Impact factor: higher rounds = stronger signal
  const impactBoost = round >= 5 ? 1.2 : round >= 3 ? 1.1 : 1.0;

  // 60/40 pace blend toward slower team
  const blendPace = blendedPace(teamA, teamB);
  const leagueAvgPace = 68.5;
  const paceScaleFactor = blendPace / leagueAvgPace;

  const netA = (teamA.adjO - teamA.adjD) * paceScaleFactor;
  const netB = (teamB.adjO - teamB.adjD) * paceScaleFactor;

  const leagueAvgPPG = 73.5;
  const projScoreA = leagueAvgPPG / 2 + (netA - netB) / 2;
  const projScoreB = leagueAvgPPG / 2 - (netA - netB) / 2;

  const eloDiff = Math.abs(eloA - eloB);
  const baseSD = 10 + (eloDiff / 400) * 3;
  const paceSD = baseSD * Math.sqrt(paceScaleFactor) * impactBoost;

  const noise = tRandDF10() * paceSD;
  const rawMargin = (projScoreA - projScoreB) + noise;

  // Silver's 6-point win bonus
  const winner6Bonus = rawMargin > 0 ? 6 : -6;
  const adjustedMargin = rawMargin + winner6Bonus;

  const actualScoreA = Math.round(projScoreA + noise / 2);
  const actualScoreB = Math.round(projScoreB - noise / 2);
  const teamAWins = rawMargin > 0;

  return {
    winner: teamAWins ? { ...teamA } : { ...teamB },
    loser:  teamAWins ? { ...teamB } : { ...teamA },
    margin: Math.abs(adjustedMargin),
    scoreA: Math.max(actualScoreA, 40),
    scoreB: Math.max(actualScoreB, 40),
    teamAWins,
    eloA,
    eloB,
    winProb: eloProbability(eloA, eloB),
  };
}

// ---------- Hot Elo update ----------
const K_FACTOR = 55;

export function hotEloUpdate(team, won, expectedWinProb, round) {
  const impact = round >= 3 ? 1.3 : 1.0;
  const actual = won ? 1 : 0;
  const currentElo = compositeElo(team);
  const delta = K_FACTOR * impact * (actual - expectedWinProb);
  const newElo = currentElo + delta;
  const newBarthag = 1 / (1 + Math.pow(10, (1500 - newElo) / 400));
  return { ...team, barthag: clamp(newBarthag, 0.01, 0.99), _hotElo: newElo };
}

// ---------- Head-to-head matchup analysis ----------
export function analyzeMatchup(teamA, teamB, N = 5000) {
  let aWins = 0;
  const margins = [];
  const scores = [];

  for (let i = 0; i < N; i++) {
    const result = simulateGame(teamA, teamB, { round: 1, neutral: true });
    if (result.teamAWins) aWins++;
    margins.push(result.teamAWins ? result.margin : -result.margin);
    scores.push({ a: result.scoreA, b: result.scoreB });
  }

  const winProbA = aWins / N;
  const avgMargin = margins.reduce((a, b) => a + b, 0) / N;
  const avgScoreA = scores.reduce((s, g) => s + g.a, 0) / N;
  const avgScoreB = scores.reduce((s, g) => s + g.b, 0) / N;

  const buckets = {};
  for (const m of margins) {
    const bucket = Math.round(m / 3) * 3;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  const distribution = Object.entries(buckets)
    .map(([margin, count]) => ({ margin: parseInt(margin), count, pct: count / N }))
    .sort((a, b) => a.margin - b.margin);

  return {
    winProbA,
    winProbB: 1 - winProbA,
    avgMargin,
    avgScoreA: Math.round(avgScoreA),
    avgScoreB: Math.round(avgScoreB),
    distribution,
    eloA: compositeElo(teamA),
    eloB: compositeElo(teamB),
  };
}

// ---------- Export seed corrections for UI display ----------
export { SEED_CORRECTIONS, getSeedCorrection };
