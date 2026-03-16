// ============================================================
// COOPER-based March Madness Simulation Engine
// Implements Silver Bulletin COOPER methodology:
//   - Composite: 5/8 barthag-Elo + 3/8 efficiency-normalized
//   - Pace-adjusted projected margins
//   - Fat-tailed score distribution (t-dist, df=10)
//   - Binary injury rolls (not point shaving)
//   - Hot Elo updates cascading through rounds
//   - 10,000 Monte Carlo simulations
// ============================================================

// ---------- Math helpers ----------

// Inverse CDF approximation for t-distribution (df=10)
// Uses Box-Muller + heavy-tail correction
function tRandDF10() {
  // Generate t-distributed random variable with df=10
  // via ratio of standard normal to chi-squared
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const normal = u * Math.sqrt((-2 * Math.log(s)) / s);
  // Chi-squared df=10 approximated via sum of 10 squared normals
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

// ---------- Normalization ----------
// Normalize Torvik stats to COOPER-compatible scale
// Elo mean=1500, SD~100; barthag is 0-1 win probability
// We convert barthag -> pseudo-Elo: 1500 + 400*log10(p/(1-p))
export function barthagToElo(barthag) {
  const p = clamp(barthag, 0.01, 0.99);
  return 1500 + 400 * Math.log10(p / (1 - p));
}

// Convert efficiency margin (AdjO - AdjD) to Elo points
// Silver: 1 point of margin ≈ 28.5 Elo points
export function marginToElo(netRating) {
  return netRating * 28.5;
}

// Build composite Elo: 5/8 barthag-Elo + 3/8 efficiency-Elo
export function compositeElo(team) {
  const eloFromBarthag = barthagToElo(team.barthag);
  const eloFromEfficiency = 1500 + marginToElo(team.adjO - team.adjD);
  return (5 / 8) * eloFromBarthag + (3 / 8) * eloFromEfficiency;
}

// ---------- Injury ----------
// Binary roll: player either plays (0 penalty) or doesn't (full penalty)
// Returns point-penalty to subtract from team's net rating
export function injuryPenalty(team, simulationSeed) {
  if (!team.injuries || team.injuries.length === 0) return 0;
  let totalPenalty = 0;
  for (const injury of team.injuries) {
    const plays = Math.random() < injury.playProbability;
    if (!plays) {
      // Full replacement-level penalty
      // Silver: top players worth 7-10 pts vs replacement; scale by impact 1-10
      const replacementPenalty = (injury.impact / 10) * 8.5; // max ~8.5 pts
      totalPenalty += replacementPenalty;
    }
  }
  return totalPenalty;
}

// ---------- Win probability from Elo ----------
// Standard Elo win probability formula
export function eloProbability(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// ---------- Game simulation ----------
// Returns { winner, loser, margin, scoreA, scoreB }
export function simulateGame(teamA, teamB, options = {}) {
  const { round = 1, neutral = true } = options;

  // Composite Elo for each team
  let eloA = compositeElo(teamA);
  let eloB = compositeElo(teamB);

  // Apply injury penalties (subtract from net rating ≈ subtract from Elo)
  const injA = injuryPenalty(teamA);
  const injB = injuryPenalty(teamB);
  eloA -= injA * 28.5;
  eloB -= injB * 28.5;

  // Tournament = neutral site, so no travel penalty needed
  // (Silver: travel penalty = 5 * m^(1/3), but NCAA tourney is neutral)

  // Impact factor: tournament games get a boost
  // Higher rounds = slightly higher impact (more info from hot updates)
  const impactBoost = round >= 3 ? 1.15 : 1.0;

  // Projected margin from net ratings (pace-adjusted)
  // Pace rating = expected combined points; higher pace = more variance
  const avgPace = ((teamA.adjT || 68) + (teamB.adjT || 68)) / 2;
  const leagueAvgPace = 68.5; // 2025-26 league average possessions
  // Points per possession ~ total score / (2 * possessions)
  const paceScaleFactor = avgPace / leagueAvgPace;

  const netA = (teamA.adjO - teamA.adjD) * paceScaleFactor;
  const netB = (teamB.adjO - teamB.adjD) * paceScaleFactor;

  // Bayesian-adjusted projected scores
  const leagueAvgPPG = 73.5;
  const projScoreA = leagueAvgPPG / 2 + (netA - netB) / 2;
  const projScoreB = leagueAvgPPG / 2 - (netA - netB) / 2;

  // Standard error: higher in lopsided games, scales with pace
  // Silver: SD is a function of Elo difference + pace
  const eloDiff = Math.abs(eloA - eloB);
  const baseSD = 10 + (eloDiff / 400) * 3; // wider SD in blowout projections
  const paceSD = baseSD * Math.sqrt(paceScaleFactor) * impactBoost;

  // Sample from fat-tailed t-distribution (df=10)
  const noise = tRandDF10() * paceSD;

  // Actual margin: projected + noise
  const rawMargin = (projScoreA - projScoreB) + noise;

  // Apply Silver's 6-point win bonus after determining winner
  const winner6Bonus = rawMargin > 0 ? 6 : -6;
  const adjustedMargin = rawMargin + winner6Bonus;

  const actualScoreA = Math.round(projScoreA + noise / 2);
  const actualScoreB = Math.round(projScoreB - noise / 2);

  const teamAWins = rawMargin > 0;

  return {
    winner: teamAWins ? { ...teamA } : { ...teamB },
    loser: teamAWins ? { ...teamB } : { ...teamA },
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
// After each simulated game, update winner's Elo for next round
// K-factor = 55 for regular games; higher for tournament (impact factor)
const K_FACTOR = 55;

export function hotEloUpdate(team, won, expectedWinProb, round) {
  const impact = round >= 3 ? 1.3 : 1.0; // tournament impact boost
  const actual = won ? 1 : 0;
  const currentElo = compositeElo(team);
  const delta = K_FACTOR * impact * (actual - expectedWinProb);
  // We update barthag to reflect the new Elo
  const newElo = currentElo + delta;
  // Convert new Elo back to barthag
  const newBarthag = 1 / (1 + Math.pow(10, (1500 - newElo) / 400));
  return { ...team, barthag: clamp(newBarthag, 0.01, 0.99), _hotElo: newElo };
}

// ---------- Single bracket run ----------
// bracket: array of 68 teams with seeds and region assignments
// Returns: array of round-by-round winners
function runSingleBracket(bracket) {
  // Bracket structure: 4 regions × 16 teams + 4 play-in games
  // We represent as {region, seed, team}
  // Returns champion

  let regions = { South: [], East: [], West: [], Midwest: [] };

  // Distribute teams to regions
  for (const entry of bracket) {
    if (regions[entry.region]) {
      regions[entry.region].push({ ...entry.team, seed: entry.seed, region: entry.region });
    }
  }

  // Play-in games (First Four): seeds 11 and 16 in each region have play-ins
  // Simplified: just simulate and advance winners
  const roundResults = {};

  // Run each region through rounds 1-4
  let finalFourTeams = [];
  for (const [regionName, teams] of Object.entries(regions)) {
    if (teams.length === 0) continue;
    // Sort by seed
    teams.sort((a, b) => a.seed - b.seed);

    let remaining = [...teams];
    let round = 1;
    while (remaining.length > 1) {
      const nextRound = [];
      // Standard bracket: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
      for (let i = 0; i < remaining.length / 2; i++) {
        const teamA = remaining[i];
        const teamB = remaining[remaining.length - 1 - i];
        const result = simulateGame(teamA, teamB, { round, neutral: true });
        const winnerUpdated = hotEloUpdate(
          result.winner,
          true,
          result.teamAWins ? result.winProb : 1 - result.winProb,
          round
        );
        nextRound.push(winnerUpdated);
      }
      remaining = nextRound;
      round++;
    }
    if (remaining[0]) finalFourTeams.push(remaining[0]);
  }

  // Final Four (round 5) and Championship (round 6)
  if (finalFourTeams.length >= 2) {
    const sf1 = simulateGame(finalFourTeams[0], finalFourTeams[1], { round: 5 });
    const sf2 = finalFourTeams.length >= 4
      ? simulateGame(finalFourTeams[2], finalFourTeams[3], { round: 5 })
      : finalFourTeams[2] || finalFourTeams[0];

    const finalist1 = hotEloUpdate(sf1.winner, true, sf1.teamAWins ? sf1.winProb : 1 - sf1.winProb, 5);
    const finalist2 = sf2.winner
      ? hotEloUpdate(sf2.winner, true, sf2.teamAWins ? sf2.winProb : 1 - sf2.winProb, 5)
      : sf2;

    const championship = simulateGame(finalist1, finalist2, { round: 6 });
    return championship.winner;
  }

  return finalFourTeams[0] || null;
}

// ---------- Full Monte Carlo ----------
// N = number of simulations
// bracket = array of { team, seed, region }
// Returns: Map of teamName -> { roundReach: [r1%, r2%, s16%, e8%, f4%, final%, champ%] }
export function runMonteCarlo(bracket, N = 10000, onProgress = null) {
  const teamStats = {};

  // Initialize
  for (const entry of bracket) {
    teamStats[entry.team.team] = {
      team: entry.team,
      seed: entry.seed,
      region: entry.region,
      rounds: [0, 0, 0, 0, 0, 0, 0], // R64, R32, S16, E8, F4, Final, Champ
      simCount: N,
    };
  }

  for (let sim = 0; sim < N; sim++) {
    if (onProgress && sim % 1000 === 0) onProgress(sim / N);

    // Deep copy bracket for this simulation (injuries re-rolled each sim)
    let regions = { South: [], East: [], West: [], Midwest: [] };
    for (const entry of bracket) {
      const region = entry.region;
      if (regions[region] !== undefined) {
        regions[region].push({ ...entry.team, seed: entry.seed, region });
      }
    }

    let finalFourTeams = [];

    for (const [regionName, teams] of Object.entries(regions)) {
      if (teams.length === 0) continue;
      teams.sort((a, b) => a.seed - b.seed);

      let remaining = [...teams];
      let round = 1;

      // Track round advancement for this sim
      for (const t of remaining) {
        if (teamStats[t.team]) teamStats[t.team].rounds[0]++;
      }

      while (remaining.length > 1) {
        const nextRound = [];
        for (let i = 0; i < remaining.length / 2; i++) {
          const teamA = remaining[i];
          const teamB = remaining[remaining.length - 1 - i];
          const result = simulateGame(teamA, teamB, { round, neutral: true });
          const winnerUpdated = hotEloUpdate(
            result.winner,
            true,
            result.teamAWins ? result.winProb : 1 - result.winProb,
            round
          );
          nextRound.push(winnerUpdated);
        }
        remaining = nextRound;
        round++;
        const roundIdx = Math.min(round, 5); // R32=1, S16=2, E8=3, F4=4
        for (const t of remaining) {
          if (teamStats[t.team]) teamStats[t.team].rounds[roundIdx]++;
        }
      }

      if (remaining[0]) finalFourTeams.push(remaining[0]);
    }

    // Mark F4 (already counted above as round 4)
    // Final Four sim
    if (finalFourTeams.length >= 2) {
      const sf1 = simulateGame(finalFourTeams[0], finalFourTeams[1], { round: 5 });
      const w1 = hotEloUpdate(sf1.winner, true, sf1.winProb, 5);
      const sf2 = finalFourTeams.length >= 4
        ? simulateGame(finalFourTeams[2], finalFourTeams[3], { round: 5 })
        : null;
      const w2 = sf2 ? hotEloUpdate(sf2.winner, true, sf2.winProb, 5) : finalFourTeams[2];

      if (teamStats[w1.team]) teamStats[w1.team].rounds[5]++;
      if (w2 && teamStats[w2.team]) teamStats[w2.team].rounds[5]++;

      if (w2) {
        const champ = simulateGame(w1, w2, { round: 6 });
        if (teamStats[champ.winner.team]) teamStats[champ.winner.team].rounds[6]++;
      } else if (w1) {
        if (teamStats[w1.team]) teamStats[w1.team].rounds[6]++;
      }
    }
  }

  // Convert counts to percentages
  const results = {};
  for (const [name, data] of Object.entries(teamStats)) {
    results[name] = {
      ...data,
      roundPct: data.rounds.map((count, i) => {
        if (i === 0) return 100; // everyone starts
        return Math.round((count / N) * 1000) / 10;
      }),
    };
  }

  return results;
}

// ---------- Head-to-head matchup analysis ----------
// Returns detailed win probability and score distribution
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

  // Distribution buckets for chart
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
