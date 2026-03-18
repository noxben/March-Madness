import React, { useState } from 'react';

const STATUS_PROB = {
  'Out For Season': 0.0, 'Out': 0.0, 'Doubtful': 0.15,
  'Questionable': 0.50, 'Game Time Decision': 0.55, 'Probable': 0.80,
};

const BRACKET_TEAMS = new Set([
  'Duke','Connecticut','Michigan St','Kansas',"St. John's",'Louisville','UCLA',
  'Ohio St','TCU','UCF','South Florida','Northern Iowa','Cal Baptist',
  'North Dakota St','Furman','Siena','Arizona','Purdue','Gonzaga','Arkansas',
  'Wisconsin','BYU','Miami FL','Villanova','Utah St','Missouri','Texas',
  'High Point','Hawaii','Kennesaw St','Queens','UMBC','Florida','Houston',
  'Illinois','Nebraska','Vanderbilt','North Carolina',"Saint Mary's",'Clemson',
  'Iowa','Texas A&M','VCU','McNeese St','Troy','Penn','Idaho','Howard',
  'Michigan','Iowa St','Virginia','Alabama','Texas Tech','Tennessee','Kentucky',
  'Georgia','Saint Louis','Santa Clara','Miami OH','Akron','Hofstra',
  'Wright St','Tennessee St','Prairie View A&M',
]);

const TEAM_MAP = {
  'Connecticut':'Connecticut','Michigan State':'Michigan St','Ohio State':'Ohio St',
  'North Dakota State':'North Dakota St','Iowa State':'Iowa St','Utah State':'Utah St',
  'Wright State':'Wright St','Tennessee State':'Tennessee St','Kennesaw State':'Kennesaw St',
  'McNeese':'McNeese St','Prairie View':'Prairie View A&M','Prairie View A&M':'Prairie View A&M',
  'Pennsylvania':'Penn','Miami (OH)':'Miami OH','Miami (FL)':'Miami FL','Miami':'Miami FL',
  "Saint Mary's":"Saint Mary's","Sam Houston":null,'Houston':'Houston',
};

const KNOWN_IMPACT = {
  'Caleb Foster':7,'Patrick Ngongba':6,'L.J. Cason':6,'Caleb Wilson':7,
  'Silas Demary':6,'Jaylin Stewart':5,'Braden Huff':6,'JT Toppin':7,
  'Taison Chatman':5,'Jayden Quaintance':6,'Tyler Bilodeau':5,'Frankie Collins':6,
  'Divine Ugochukwu':6,'Ty Rodgers':5,'Karter Knox':5,'Jalen Warley':5,
};

function mapTeam(name) {
  if (TEAM_MAP.hasOwnProperty(name)) return TEAM_MAP[name];
  if (BRACKET_TEAMS.has(name)) return name;
  for (const bt of BRACKET_TEAMS) {
    if (name.toLowerCase() === bt.toLowerCase()) return bt;
    if (name.length > 5 && bt.length > 5 && name.toLowerCase().slice(0,6) === bt.toLowerCase().slice(0,6)) return bt;
  }
  return null;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/[\uFEFF"']/g,'').trim());
  const ci = {};
  ['Player','Team','Pos','Injury','Status'].forEach(col => {
    const idx = headers.findIndex(h => h.toLowerCase() === col.toLowerCase());
    if (idx >= 0) ci[col] = idx;
  });
  if (!ci.hasOwnProperty('Player')) return [];
  return lines.slice(1).map(line => {
    const c = line.split(delim).map(s => s.replace(/^["']+|["']+$/g,'').trim());
    return { player:c[ci.Player]||'', team:c[ci.Team]||'', pos:c[ci.Pos]||'', injury:c[ci.Injury]||'', status:c[ci.Status]||'' };
  }).filter(r => r.player && r.team && r.status);
}

export default function InjuryRefresh({ teams, onUpdate }) {
  const [pasted, setPasted] = useState('');
  const [parsed, setParsed] = useState(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');

  function handleParse() {
    setError(''); setApplied(false);
    if (!pasted.trim()) { setError('Paste CSV content first.'); return; }
    const rows = parseCSV(pasted);
    if (!rows.length) { setError('Could not parse — needs Player, Team, Status columns.'); return; }
    const injByTeam = {};
    for (const row of rows) {
      const mapped = mapTeam(row.team);
      if (!mapped) continue;
      if (row.injury === 'Redshirt' && !KNOWN_IMPACT[row.player]) continue;
      const prob = STATUS_PROB.hasOwnProperty(row.status) ? STATUS_PROB[row.status] : 0.55;
      if (!injByTeam[mapped]) injByTeam[mapped] = [];
      injByTeam[mapped].push({ player:row.player, pos:row.pos, injury:row.injury, status:row.status, playProbability:prob, impact:KNOWN_IMPACT[row.player]||4 });
    }
    setParsed({ injByTeam, teamCount:Object.keys(injByTeam).length, injCount:Object.values(injByTeam).reduce((s,a)=>s+a.length,0) });
  }

  function handleApply() {
    if (!parsed) return;
    const updated = teams.map(entry => {
      if (!entry.team) return entry;
      const name = entry.team.team;
      const newInj = parsed.injByTeam[name] !== undefined ? parsed.injByTeam[name] : [];
      return { ...entry, team: { ...entry.team, injuries: newInj } };
    });
    onUpdate(updated);
    setApplied(true);
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
      <div>
        <h3 style={{ fontSize:'0.92rem', fontWeight:700, marginBottom:4 }}>Refresh Injury Data</h3>
        <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.5 }}>
          Download CSV from <strong>rotowire.com/cbasketball/injury-report.php</strong> and paste below. Updates all 68 teams instantly.
        </p>
      </div>
      <textarea
        style={{ background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontFamily:'var(--mono)', fontSize:'0.72rem', padding:'10px 12px', resize:'vertical', minHeight:90, outline:'none', width:'100%' }}
        placeholder="Paste RotoWire CSV here (include header row)..."
        value={pasted}
        onChange={e => { setPasted(e.target.value); setParsed(null); setApplied(false); }}
      />
      {error && <p style={{ fontSize:'0.8rem', color:'var(--red)', background:'rgba(248,113,113,0.08)', padding:'8px 12px', borderRadius:6 }}>{error}</p>}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <button className="btn-secondary" onClick={handleParse} disabled={!pasted.trim()}>Parse CSV</button>
        {parsed && <button className="btn-primary" onClick={handleApply}>Apply ({parsed.injCount} injuries, {parsed.teamCount} teams)</button>}
        {applied && <span style={{ fontSize:'0.82rem', color:'var(--green)', fontFamily:'var(--mono)' }}>Injuries updated — re-run sims</span>}
      </div>
      {parsed && !applied && (
        <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', lineHeight:1.6 }}>
          <strong style={{ color:'var(--text)' }}>Preview: </strong>
          {Object.entries(parsed.injByTeam).map(([t,injs]) => t+' ('+injs.length+')').join(' · ')}
        </div>
      )}
    </div>
  );
}
