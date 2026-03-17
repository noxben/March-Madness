// api/torvik.js — Vercel serverless function
// Proxies barttorvik.com data server-side, so the browser never hits CORS
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const response = await fetch('https://barttorvik.com/2026_team_results.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; bracket-sim/1.0)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Torvik returned ${response.status}`);
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // cache 1hr
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
