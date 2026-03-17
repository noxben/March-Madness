// api/torvik.js — Vercel serverless proxy for barttorvik.com
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  // Try multiple Torvik endpoints in case one is down
  const urls = [
    'https://barttorvik.com/2026_team_results.json',
    'https://barttorvik.com/trank.php?year=2026&json=1',
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://barttorvik.com/',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        continue; // try next URL
      }

      const text = await response.text();

      // Return raw text as JSON-parsed — let client handle format
      try {
        const data = JSON.parse(text);
        return res.status(200).json(data);
      } catch (parseErr) {
        return res.status(500).json({
          error: 'JSON parse failed',
          sample: text.slice(0, 200),
        });
      }
    } catch (err) {
      // Continue to next URL
      continue;
    }
  }

  // All URLs failed — return helpful debug info
  return res.status(500).json({
    error: 'All Torvik endpoints failed',
    message: 'barttorvik.com may be blocking server-side requests',
    suggestion: 'The app will fall back to corsproxy.io from the browser',
  });
}
