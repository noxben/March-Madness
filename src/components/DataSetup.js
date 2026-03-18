import React, { useState, useCallback } from 'react';
import { fetchTorvik, REGIONS } from '../utils/torvik';

// 2026 NCAA Tournament bracket -- verified from official bracket CSV March 2026
// Source: Copy_of_NCAA_Basketball_Tournament_Single_Bracket_TEMPLATE
// Play-in results: Howard beat TBD (South 16), Prairie View A&M in Midwest 16,
//                  Miami OH in Midwest 11, Texas beat NC State (West 11)
const DEFAULT_BRACKET = [
  // -- EAST -- #1 Duke
  { team: 'Duke',             seed:  1, region: 'East' },
  { team: 'Connecticut',      seed:  2, region: 'East' },
  { team: 'Michigan St',      seed:  3, region: 'East' },
  { team: 'Kansas',           seed:  4, region: 'East' },
  { team: "St. John's",       seed:  5, region: 'East' },
  { team: 'Louisville',       seed:  6, region: 'East' },
  { team: 'UCLA',             seed:  7, region: 'East' },
  { team: 'Ohio St',          seed:  8, region: 'East' },
  { team: 'TCU',              seed:  9, region: 'East' },
  { team: 'UCF',              seed: 10, region: 'East' },
  { team: 'South Florida',    seed: 11, region: 'East' },
  { team: 'Northern Iowa',    seed: 12, region: 'East' },
  { team: 'Cal Baptist',      seed: 13, region: 'East' },
  { team: 'North Dakota St',  seed: 14, region: 'East' },
  { team: 'Furman',           seed: 15, region: 'East' },
  { team: 'Siena',            seed: 16, region: 'East' },

  // -- WEST -- #1 Arizona
  { team: 'Arizona',          seed:  1, region: 'West' },
  { team: 'Purdue',           seed:  2, region: 'West' },
  { team: 'Gonzaga',          seed:  3, region: 'West' },
  { team: 'Arkansas',         seed:  4, region: 'West' },
  { team: 'Wisconsin',        seed:  5, region: 'West' },
  { team: 'BYU',              seed:  6, region: 'West' },
  { team: 'Miami FL',         seed:  7, region: 'West' },
  { team: 'Villanova',        seed:  8, region: 'West' },
  { team: 'Utah St',          seed:  9, region: 'West' },
  { team: 'Missouri',         seed: 10, region: 'West' },
  { team: 'Texas',            seed: 11, region: 'West' },
  { team: 'High Point',       seed: 12, region: 'West' },
  { team: 'Hawaii',           seed: 13, region: 'West' },
  { team: 'Kennesaw St',      seed: 14, region: 'West' },
  { team: 'Queens',           seed: 15, region: 'West' },
  { team: 'LIU',              seed: 16, region: 'West' },

  // -- SOUTH -- #1 Florida
  { team: 'Florida',          seed:  1, region: 'South' },
  { team: 'Houston',          seed:  2, region: 'South' },
  { team: 'Illinois',         seed:  3, region: 'South' },
  { team: 'Nebraska',         seed:  4, region: 'South' },
  { team: 'Vanderbilt',       seed:  5, region: 'South' },
  { team: 'North Carolina',   seed:  6, region: 'South' },
  { team: "Saint Mary's",     seed:  7, region: 'South' },
  { team: 'Clemson',          seed:  8, region: 'South' },
  { team: 'Iowa',             seed:  9, region: 'South' },
  { team: 'Texas A&M',        seed: 10, region: 'South' },
  { team: 'VCU',              seed: 11, region: 'South' },
  { team: 'McNeese St',       seed: 12, region: 'South' },
  { team: 'Troy',             seed: 13, region: 'South' },
  { team: 'Penn',             seed: 14, region: 'South' },
  { team: 'Idaho',            seed: 15, region: 'South' },
  { team: 'Howard',           seed: 16, region: 'South' },

  // -- MIDWEST -- #1 Michigan
  { team: 'Michigan',         seed:  1, region: 'Midwest' },
  { team: 'Iowa St',          seed:  2, region: 'Midwest' },
  { team: 'Virginia',         seed:  3, region: 'Midwest' },
  { team: 'Alabama',          seed:  4, region: 'Midwest' },
  { team: 'Texas Tech',       seed:  5, region: 'Midwest' },
  { team: 'Tennessee',        seed:  6, region: 'Midwest' },
  { team: 'Kentucky',         seed:  7, region: 'Midwest' },
  { team: 'Georgia',          seed:  8, region: 'Midwest' },
  { team: 'Saint Louis',      seed:  9, region: 'Midwest' },
  { team: 'Santa Clara',      seed: 10, region: 'Midwest' },
  { team: 'Miami OH',         seed: 11, region: 'Midwest' },
  { team: 'Akron',            seed: 12, region: 'Midwest' },
  { team: 'Hofstra',          seed: 13, region: 'Midwest' },
  { team: 'Wright St',        seed: 14, region: 'Midwest' },
  { team: 'Tennessee St',     seed: 15, region: 'Midwest' },
  { team: 'Prairie View A&M', seed: 16, region: 'Midwest' },
];

export default function DataSetup({ onReady, existingTeams }) {
  const [loadState, setLoadState] = useState('idle'); // idle | loading | loaded | error
  const [allTeams, setAllTeams] = useState([]);
  const [bracket, setBracket] = useState(existingTeams.length > 0 ? existingTeams : []);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [editingSlot, setEditingSlot] = useState(null); // {region, seed}
  const [injuryModal, setInjuryModal] = useState(null); // teamName
  const [newInjury, setNewInjury] = useState({ player: '', impact: 5, playProbability: 0.8 });

  const loadTorvik = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const teams = await fetchTorvik();
      setAllTeams(teams);
      // Auto-match bracket slots to Torvik data
      if (bracket.length === 0) {
        const matched = matchBracketToTorvik(DEFAULT_BRACKET, teams);
        setBracket(matched);
      } else {
        // Re-match existing bracket with fresh Torvik data
        const matched = bracket.map(slot => ({
          ...slot,
          team: teams.find(t => fuzzyMatch(t.team, slot.team?.team || slot.teamName))
            || slot.team
            || null,
        }));
        setBracket(matched);
      }
      setLoadState('loaded');
    } catch (e) {
      setErrorMsg(e.message);
      setLoadState('error');
    }
  }, [bracket]);

  function matchBracketToTorvik(defaultBracket, torvikTeams) {
    return defaultBracket.map(slot => ({
      seed: slot.seed,
      region: slot.region,
      teamName: slot.team,
      team: torvikTeams.find(t => fuzzyMatch(t.team, slot.team)) || null,
    }));
  }

  function fuzzyMatch(torvikName, bracketName) {
    if (!torvikName || !bracketName) return false;
    const normalize = s => s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const a = normalize(torvikName);
    const b = normalize(bracketName);
    if (a === b) return true;

    // Handle common Torvik vs bracket name divergences
    const aliases = {
      'miami fl':        ['miami fla', 'miami florida', 'miami fl'],
      'miami oh':        ['miami ohio', 'miami  oh', 'miami oh'],
      'st johns':        ["st john's", 'saint johns', "st. john's"],
      'saint marys':     ["saint mary's", "st. mary's", "saint mary s"],
      'uconn':           ['connecticut'],
      'vcu':             ['vcu rams'],
      'byu':             ['brigham young'],
      'north carolina':  ['unc', 'n carolina'],
      'nc state':        ['north carolina state', 'nc st', 'n c state', 'n c  state'],
      'lsu':             ['louisiana state'],
      'ole miss':        ['mississippi'],
      'pitt':            ['pittsburgh'],
      'umbc':            ['umbc retrievers'],
      'north dakota st': ['north dakota state', 'ndsu', 'n dakota st', 'n  dakota st'],
      'prairie view':    ['prairie view a m', 'prairie view am', 'prairie view a&m'],
      'hawaii':          ["hawai'i", 'hawai i', 'hawaii'],
      'kennesaw':        ['kennesaw st', 'kennesaw state'],
      'high point':      ['high point panthers'],
      'queens':          ['queens nc', 'queens university'],
      'liu':             ['long island', 'liu brooklyn'],
      'howard':          ['howard university', 'howard bison'],
      'saint louis':     ['saint louis university', 'slu'],
      'northern iowa':   ['n iowa', 'uni panthers'],
      'wright st':       ['wright state', 'wright st '],
      'tennessee st':    ['tennessee state', 'tenn state', 'tenn st'],
      'iowa st':         ['iowa state', 'isu cyclones'],
      'ohio st':         ['ohio state', 'osu buckeyes'],
      'michigan st':     ['michigan state', 'msu spartans'],
      'kennesaw st':     ['kennesaw state'],
      'utah st':         ['utah state'],
      'texas tech':      ['texas tech red raiders'],
      'texas a m':       ['texas a&m', 'texas am', 'tamu'],
    };

    // Check both directions
    for (const [key, vals] of Object.entries(aliases)) {
      if ((a.includes(key) || vals.some(v => a.includes(v))) &&
          (b.includes(key) || vals.some(v => b.includes(v)))) {
        return true;
      }
    }

    // Substring match (at least 5 chars to avoid false positives)
    if (a.length >= 5 && b.includes(a)) return true;
    if (b.length >= 5 && a.includes(b)) return true;

    return false;
  }

  const matchedCount = bracket.filter(s => s.team).length;
  const totalSlots = 68;

  function assignTeam(region, seed, torvikTeam) {
    setBracket(prev => prev.map(slot =>
      slot.region === region && slot.seed === seed
        ? { ...slot, team: torvikTeam, teamName: torvikTeam.team }
        : slot
    ));
    setEditingSlot(null);
    setSearch('');
  }

  function addInjury(teamName) {
    setBracket(prev => prev.map(slot =>
      slot.team?.team === teamName
        ? {
            ...slot,
            team: {
              ...slot.team,
              injuries: [
                ...(slot.team.injuries || []),
                { ...newInjury, id: Date.now() }
              ]
            }
          }
        : slot
    ));
    setNewInjury({ player: '', impact: 5, playProbability: 0.8 });
  }

  function removeInjury(teamName, injuryId) {
    setBracket(prev => prev.map(slot =>
      slot.team?.team === teamName
        ? {
            ...slot,
            team: {
              ...slot.team,
              injuries: slot.team.injuries.filter(i => i.id !== injuryId)
            }
          }
        : slot
    ));
  }

  const filteredTeams = search.length > 1
    ? allTeams.filter(t => t.team.toLowerCase().includes(search.toLowerCase())).slice(0, 12)
    : [];

  const canProceed = matchedCount >= 60;

  const injuryTeam = injuryModal ? bracket.find(s => s.team?.team === injuryModal) : null;

  return (
    <div className="data-setup">
      <div className="setup-header">
        <h2>Step 1 — Load Live Data</h2>
        <p className="setup-sub">
          Pulls T-Rank (Torvik) stats live — AdjO, AdjD, Tempo, Barthag for all ~360 D1 teams.
          Auto-matches to the 2026 bracket. Unmatched slots can be assigned manually.
        </p>
        <button
          className={`btn-primary ${loadState === 'loading' ? 'loading' : ''}`}
          onClick={loadTorvik}
          disabled={loadState === 'loading'}
        >
          {loadState === 'loading' ? '⟳ Loading Torvik...' :
           loadState === 'loaded' ? '↺ Refresh Data' :
           '⬇ Fetch Live T-Rank Data'}
        </button>
        {errorMsg && <p className="error-msg">{errorMsg}</p>}
        {loadState === 'loaded' && (
          <p className="status-ok">
            ✓ {allTeams.length} teams loaded · {matchedCount}/{totalSlots} bracket slots matched
          </p>
        )}
      </div>

      {bracket.length > 0 && (
        <>
          <div className="bracket-grid">
            {REGIONS.map(region => (
              <div key={region} className="region-col">
                <h3 className="region-label">{region}</h3>
                {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map(seed => {
                  const slot = bracket.find(s => s.region === region && s.seed === seed);
                  if (!slot) return null;
                  const isEditing = editingSlot?.region === region && editingSlot?.seed === seed;
                  const { pppg, ppag } = slot.team
                    ? derivePPPGLocal(slot.team)
                    : { pppg: '-', ppag: '-' };

                  return (
                    <div key={seed} className={`bracket-slot ${slot.team ? 'matched' : 'unmatched'}`}>
                      <span className="slot-seed">#{seed}</span>
                      {slot.team ? (
                        <div className="slot-team-info">
                          <span className="slot-team-name">{slot.team.team}</span>
                          <span className="slot-stats">
                            O:{slot.team.adjO?.toFixed(1)} D:{slot.team.adjD?.toFixed(1)} T:{slot.team.adjT?.toFixed(0)}
                          </span>
                          <div className="slot-actions">
                            <button className="slot-btn" onClick={() => { setInjuryModal(slot.team.team); }}>
                              🩹 {slot.team.injuries?.length > 0 ? `(${slot.team.injuries.length})` : ''}
                            </button>
                            <button className="slot-btn" onClick={() => setEditingSlot({ region, seed })}>✎</button>
                          </div>
                        </div>
                      ) : (
                        <button className="slot-unmatched-btn" onClick={() => setEditingSlot({ region, seed })}>
                          {slot.teamName || 'Assign team →'}
                        </button>
                      )}
                      {isEditing && (
                        <div className="search-dropdown">
                          <input
                            autoFocus
                            className="search-input"
                            placeholder="Search team..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                          />
                          {filteredTeams.map(t => (
                            <button
                              key={t.team}
                              className="search-result"
                              onClick={() => assignTeam(region, seed, t)}
                            >
                              <span className="sr-name">{t.team}</span>
                              <span className="sr-stats">{t.conf} · O:{t.adjO?.toFixed(1)} D:{t.adjD?.toFixed(1)}</span>
                            </button>
                          ))}
                          <button className="search-cancel" onClick={() => { setEditingSlot(null); setSearch(''); }}>✕ Cancel</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="setup-footer">
            <p className="footer-note">
              {matchedCount < totalSlots && <span className="warn">⚠ {totalSlots - matchedCount} unmatched slots — assign manually above</span>}
            </p>
            <button
              className="btn-primary btn-large"
              disabled={!canProceed}
              onClick={() => onReady(bracket.filter(s => s.team), allTeams)}
            >
              Run Simulations →
            </button>
          </div>
        </>
      )}

      {/* Injury Modal */}
      {injuryModal && injuryTeam && (
        <div className="modal-overlay" onClick={() => setInjuryModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Injuries — {injuryModal}</h3>
            <p className="modal-sub">Binary roll: each sim, player either plays (0 penalty) or doesn't (full replacement penalty).</p>

            {injuryTeam.team?.injuries?.length > 0 ? (
              <div className="injury-list">
                {injuryTeam.team.injuries.map(inj => (
                  <div key={inj.id} className="injury-row">
                    <span className="inj-player">{inj.player}</span>
                    <span className="inj-stat">Impact: {inj.impact}/10</span>
                    <span className="inj-stat">Play%: {Math.round(inj.playProbability * 100)}%</span>
                    <button className="inj-remove" onClick={() => removeInjury(injuryModal, inj.id)}>✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-injuries">No injuries added yet.</p>
            )}

            <div className="injury-form">
              <input
                className="form-input"
                placeholder="Player name"
                value={newInjury.player}
                onChange={e => setNewInjury(p => ({ ...p, player: e.target.value }))}
              />
              <div className="form-row">
                <label>
                  Impact (1–10)
                  <input
                    type="range" min="1" max="10" step="1"
                    value={newInjury.impact}
                    onChange={e => setNewInjury(p => ({ ...p, impact: parseInt(e.target.value) }))}
                  />
                  <span>{newInjury.impact}</span>
                </label>
                <label>
                  Play probability
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={newInjury.playProbability}
                    onChange={e => setNewInjury(p => ({ ...p, playProbability: parseFloat(e.target.value) }))}
                  />
                  <span>{Math.round(newInjury.playProbability * 100)}%</span>
                </label>
              </div>
              <button
                className="btn-secondary"
                disabled={!newInjury.player}
                onClick={() => addInjury(injuryModal)}
              >
                + Add Injury
              </button>
            </div>

            <button className="btn-primary modal-close" onClick={() => setInjuryModal(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function derivePPPGLocal(team) {
  if (!team) return { pppg: '-', ppag: '-' };
  const possPerGame = team.adjT || 68;
  const pppg = (team.adjO / 100) * possPerGame;
  const ppag = (team.adjD / 100) * possPerGame;
  return { pppg: pppg.toFixed(1), ppag: ppag.toFixed(1) };
}
