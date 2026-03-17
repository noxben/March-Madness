const TORVIK_URL = 'https://barttorvik.com/2026_team_results.json';

function getSources() {
  return [
    '/api/torvik',
    `https://corsproxy.io/?${encodeURIComponent(TORVIK_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(TORVIK_URL)}`,
    TORVIK_URL,
  ];
}

// Torvik row format — positional array:
// [team, conf, g, rec, adjoe, adjde, barthag, efg%, efgd%, tor, tord, orb, drb, ftrd, ftr, 2p%, 2pd%, 3pd%, 3p%, adj_t, wab, ...]
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
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const raw = await res.json();

      // Unwrap proxy wrappers
      let data = raw;
      if (raw && raw.contents) {
        data = JSON.parse(raw.contents);
      }

      if (!Array.isArray(data)) continue;

      // Filter to valid rows only — must be an array with a string at [0]
      const teams = data
        .filter(row => Array.isArray(row) && typeof row[0] === 'string' && row[0].length > 0)
        .map(row => normalizeTeam(row))
        .filter(Boolean);

      if (teams.length > 50) return teams;
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
  try {
    const team = String(row[COL.team] || '').trim();
    if (!team) return null;

    const adjO = parseFloat(row[COL.adjO]) || 100;
    const adjD = parseFloat(row[COL.adjD]) || 100;
    const barthag = parseFloat(row[COL.barthag]) || 0.5;
    const adjT = parseFloat(row[COL.adjT]) || 68;

    return {
      team,
      conf: String(row[COL.conf] || '').trim(),
      games: parseInt(row[COL.g]) || 0,
      record: String(row[COL.rec] || '').trim(),
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
  } catch (e) {
    return null;
  }
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
