// api/overpass.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const queryParams = req.query || {};
  let bodyParams = {};
  if (typeof req.body === 'object' && req.body !== null) {
    bodyParams = req.body;
  } else if (typeof req.body === 'string') {
    try { bodyParams = JSON.parse(req.body); } catch (_) {}
  }

  const south = queryParams.south || bodyParams.south;
  const west  = queryParams.west  || bodyParams.west;
  const north = queryParams.north || bodyParams.north;
  const east  = queryParams.east  || bodyParams.east;

  if (!south || !west || !north || !east) {
    return res.status(400).json({ error: 'Missing required bounding box coordinates.' });
  }

  // Optimize query: use [timeout:8] and limit elements to keep payload light
  const query = `[out:json][timeout:8];
(
  way["landuse"](${south},${west},${north},${east});
  way["leisure"](${south},${west},${north},${east});
  way["boundary"="cadastral"](${south},${west},${north},${east});
  way["building"](${south},${west},${north},${east});
);
out geom 400;`;

  // Top 3 fastest global mirrors
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  const fetchMirror = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500); // 6.5s timeout (well under Vercel's 10s limit)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'BhoomiSetuGIS/2.0 (Municipal Land Acquisition Platform; admin@bhoomi-setu.gov.in)'
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      if (data && Array.isArray(data.elements) && data.elements.length > 0) {
        return data;
      }
      throw new Error('Empty elements');
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  try {
    // Race mirrors in parallel — first to respond wins!
    const data = await Promise.any(mirrors.map((m) => fetchMirror(m)));
    return res.status(200).json(data);
  } catch (err) {
    return res.status(503).json({
      error: 'All Overpass mirrors timed out. Falling back to internal cadastral grid.',
      overpassUnavailable: true
    });
  }
}
