// Vercel Serverless Function: /api/overpass
// Proxies OSM cadastre and building vector polygons using server-side User-Agent to avoid browser 406/CORS blocks.

export default async function handler(req, res) {
  // Set CORS headers so it can be accessed from any environment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
    return res.status(400).json({ error: 'Missing required bounding box: south, west, north, east.' });
  }

  const query = `[out:json][timeout:20];
(
  way["landuse"](${south},${west},${north},${east});
  way["leisure"](${south},${west},${north},${east});
  way["boundary"="cadastral"](${south},${west},${north},${east});
  way["place"](${south},${west},${north},${east});
  way["amenity"](${south},${west},${north},${east});
  relation["landuse"](${south},${west},${north},${east});
);
out geom 500;`;

  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  for (const mirror of mirrors) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'BhoomiSetuGIS/2.0 (Municipal Land Acquisition Platform; mailto:admin@bhoomi-setu.gov.in)'
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Overpass Proxy] ${mirror} returned HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (data && Array.isArray(data.elements) && data.elements.length > 0) {
        console.log(`[Overpass Proxy] Success from ${mirror} with ${data.elements.length} elements.`);
        return res.status(200).json(data);
      }
    } catch (err) {
      console.warn(`[Overpass Proxy] Failed mirror ${mirror}:`, err.message);
    }
  }

  return res.status(503).json({
    error: 'All Overpass mirrors timed out or unavailable. Please retry shortly.',
    overpassUnavailable: true
  });
}
