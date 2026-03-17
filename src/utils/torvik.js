const TORVIK_URL = 'https://barttorvik.com/2026_team_results.json';

// Sources tried in order — first success wins
function getSources() {
  return [
    { url: '/api/torvik', type: 'proxy' },
    { url: `https://corsproxy.io/?${encodeURIComponent(TORVIK_URL)}`, type: 'cors' },
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(TORVIK_URL)}`, type: 'cors' },
    { url: `https://thingproxy.freeboard.io/fetch/${TORVIK_URL}`, type: 'cors' },
  ];
}

const COL = {
  team: 0, conf: 1, g: 2, rec: 3,
  adjO: 4, adjD: 5, barthag: 6,
  adjT: 19, wab: 20,
};

export async function fetchTorvik() {
  const sources = getSources();
  const errors = [];

  for (const source of sources) {
    try {
      const res = await fetch(source.url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        errors.push(`${source.url}: HTTP ${res.status}`);
        continue;
      }

      const raw = await res.json();

      // If our own proxy returned an error object, skip it
      if (raw && raw.error && !Array.isArray(raw)) {
        errors.push(`${source.url}: ${raw.error}`);
        continue;
      }

      // Unwrap allorigins {contents: '...'} wrapper
      let data = raw;
      if (raw && typeof raw.contents === 'string') {
        data = JSON.parse(raw.contents);
      }

      if (!Array.isArray(data)) {
        errors.push(`${source.url}: not an array`);
        continue;
      }

      const teams = data
        .filter(row => Array.isArray(row) && typeof row[0] === 'string' && row[0].length > 0)
        .map(row => normalizeTeam(row))
        .filter(Boolean);

      if (teams.length > 50) {
        console.log(`Torvik loaded from ${source.url}: ${teams.length} teams`);
        return teams;
      }

      errors.push(`${source.url}: only ${teams.length} teams parsed`);
    } catch (e) {
      errors.push(`${source.url}: ${e.message}`);
      continue;
    }
  }

  throw new Error(
    `Unable to load Torvik data from any source.\n${errors.join('\n')}`
  );
}

function normalizeTeam(row) {
  try {
    const team = String(row[COL.team] || '').trim();
    if (!team) return null;

    const adjO = parseFloat(row[COL.adjO]) || 100;
    const adjD = parseFloat(row[COL.adjD]) || 100;
    const barthag = Math.min(Math.max(parseFloat(row[COL.barthag]) || 0.5, 0.01), 0.99);
    const adjT = parseFloat(row[COL.adjT]) || 68;

    return {
      team,
      conf: String(row[COL.conf] || '').trim(),
      games: parseInt(row[COL.g]) || 0,
      record: String(row[COL.rec] || '').trim(),
      adjO, adjD,
      netRating: adjO - adjD,
      barthag, adjT,
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
  const pppg = (team.adjO / 100) * team.adjT;
  const ppag = (team.adjD / 100) * team.adjT;
  return { pppg: Math.round(pppg * 10) / 10, ppag: Math.round(ppag * 10) / 10 };
}

export const REGIONS = ['South', 'East', 'West', 'Midwest'];
export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
export const SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15]
];
