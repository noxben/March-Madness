// Fetches live T-Rank data from barttorvik.com
// Primary: our own Vercel serverless proxy (/api/torvik) — no CORS issues
// Fallbacks: corsproxy.io, allorigins, then direct
// Normalizes to COOPER-compatible schema

const TORVIK_URL = 'https://barttorvik.com/2026_team_results.json';

function getSources() {
  return [
    '/api/torvik',
    `https://corsproxy.io/?${encodeURIComponent(TORVIK_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(TORVIK_URL)}`,
    TORVIK_URL,
  ];
}

// Column indices in Torvik's JSON array format:
// [team, conf, g, rec, adjoe, adjde, barthag, efg, efgd, tor, tord, orb, drb, ftrd, ftr, twopcd, twopctd, threepctd, threepct, adj_t, wab, elite_sos]
const COL = {
  team: 0,
  conf: 1,
  g: 2,
  rec: 3,
  adjO: 4,
  adjD: 5,
  barthag: 6,
  adjT: 19,
  wab: 20,
};

export async function fetchTorvik() {
  const sources = getSources();
  let lastError = null;

  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 100) {
        return data.map(row => normalizeTeam(row)).filter(Boolean);
      }
      // Handle {contents: '...'} wrapper from some proxies
      if (data.contents) {
        const inner = JSON.parse(data.contents);
        if (Array.isArray(inner) && inner.length > 100) {
          return inner.map(row => normalizeTeam(row)).filter(Boolean);
        }
      }
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  throw new Error(
    'Unable to load Torvik data. Try refreshing. ' +
    `Last error: ${lastError?.message || 'unknown'}`
  );
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
    injuries: [],
    seed: null,
    region: null,
  };
}

export function derivePPPG(team) {
  const possPerGame = team.adjT;
  const pppg = (team.adjO / 100) * possPerGame;
  const ppag = (team.adjD / 100) * possPerGame;
  return { pppg: Math.round(pppg * 10) / 10, ppag: Math.round(ppag * 10) / 10 };
}

export const REGIONS = ['South', 'East', 'West', 'Midwest'];
export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

export const SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15]
];
