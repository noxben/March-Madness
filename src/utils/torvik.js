// Fetches live T-Rank data from barttorvik.com
// Falls back to CORS proxy if direct fetch is blocked
// Normalizes to COOPER-compatible schema

const TORVIK_URL = 'https://barttorvik.com/2026_team_results.json';
const PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(TORVIK_URL)}`;

// Column indices in Torvik's JSON array format:
// [team, conf, g, rec, adjoe, adjde, barthag, efg, efgd, tor, tord, orb, drb, ftrd, ftr, twopcd, twopctd, threepctd, threepct, adj_t, wab, elite_sos, seed(?)]
const COL = {
  team: 0,
  conf: 1,
  g: 2,        // games played
  rec: 3,      // record
  adjO: 4,     // adjusted offensive efficiency
  adjD: 5,     // adjusted defensive efficiency
  barthag: 6,  // win probability vs average team
  adjT: 19,    // adjusted tempo (possessions/game)
  wab: 20,     // wins above bubble
};

export async function fetchTorvik() {
  let data = null;

  // Try direct first
  try {
    const res = await fetch(TORVIK_URL);
    if (res.ok) {
      data = await res.json();
    }
  } catch (e) {
    // CORS blocked, try proxy
  }

  // Try CORS proxy
  if (!data) {
    try {
      const res = await fetch(PROXY_URL);
      if (res.ok) {
        data = await res.json();
      }
    } catch (e) {
      throw new Error('Unable to fetch Torvik data. Check your internet connection.');
    }
  }

  if (!data || !Array.isArray(data)) {
    throw new Error('Unexpected data format from Torvik API.');
  }

  return data.map(row => normalizeTeam(row)).filter(Boolean);
}

function normalizeTeam(row) {
  if (!row || !row[COL.team]) return null;

  const adjO = parseFloat(row[COL.adjO]) || 100;
  const adjD = parseFloat(row[COL.adjD]) || 100;
  const barthag = parseFloat(row[COL.barthag]) || 0.5;
  const adjT = parseFloat(row[COL.adjT]) || 68;

  return {
    team: row[COL.team],
    conf: row[COL.conf] || '',
    games: parseInt(row[COL.g]) || 0,
    record: row[COL.rec] || '',
    adjO,
    adjD,
    netRating: adjO - adjD,
    barthag,
    adjT,
    wab: parseFloat(row[COL.wab]) || 0,
    // Injury array added by user in app
    injuries: [],
    // Seed and region added by user in app
    seed: null,
    region: null,
  };
}

// Derive PPPG / PPAG from Torvik's efficiency ratings
// Efficiency = points per 100 possessions; convert to per-game
// PPPG ≈ adjO * (adjT / 100) * 2  (both teams use possessions)
export function derivePPPG(team) {
  const possPerGame = team.adjT; // tempo = possessions/game
  const pppg = (team.adjO / 100) * possPerGame;
  const ppag = (team.adjD / 100) * possPerGame;
  return { pppg: Math.round(pppg * 10) / 10, ppag: Math.round(ppag * 10) / 10 };
}

// 2026 NCAA Tournament bracket - 68 teams
// Seeds and regions to be filled by user, but we pre-populate known bracket
export const REGIONS = ['South', 'East', 'West', 'Midwest'];
export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

// Standard bracket matchups by seed (1v16, 8v9, etc.)
export const SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15]
];
