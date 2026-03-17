// Torvik data is bundled statically — parsed from barttorvik.com HTML March 17 2026
// No API calls needed. To refresh: re-run the parser script in /scripts/parse_torvik.py
import TORVIK_DATA from './torvik_data';

export async function fetchTorvik() {
  // Data is local — wrap in a promise to keep the async interface consistent
  const teams = TORVIK_DATA.map(t => ({
    ...t,
    netRating: t.adjO - t.adjD,
    injuries: [],
    seed: null,
    region: null,
  }));

  if (teams.length < 100) {
    throw new Error('Static data missing — check torvik_data.js');
  }

  return teams;
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
