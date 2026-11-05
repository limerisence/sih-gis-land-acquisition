// Vercel Serverless Function: /api/overpass
// Proxies OSM cadastre/land-use vector polygons using a server-side User-Agent
// to avoid browser 406/CORS blocks. Races several Overpass mirrors in parallel.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const MIRROR_TIMEOUT_MS = 8000;       // per-mirror abort timer
const OVERPASS_QUERY_TIMEOUT_S = 20;  // server-side Overpass timeout
const MAX_BBOX_DEGREES = 1;           // reject huge areas to protect mirrors

const USER_AGENT =
  'BhoomiSetuGIS/2.0 (Municipal Land Acquisition Platform; mailto:admin@bhoomi-setu.gov.in)';

// Safely parse a coordinate. Accepts 0, rejects empty/blank/NaN/arrays.
function toCoord(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ---- Read params from query string or body ----
  const queryParams = req.query || {};
  let bodyParams = {};
  if (typeof req.body === 'object' && req.body !== null) {
    bodyParams = req.body;
  } else if (typeof req.body === 'string') {
    try { bodyParams = JSON.parse(req.body); } catch (_) {}
  }

  const south = toCoord(queryParams.south ?? bodyParams.south);
  const west  = toCoord(queryParams.west  ?? bodyParams.west);
  const north = toCoord(queryParams.north ?? bodyParams.north);
  const east  = toCoord(queryParams.east  ?? bodyParams.east);

  if ([south, west, north, east].some(v => v === null)) {
    return res.status(400).json({
      error: 'Missing or invalid bounding box: south, west, north, east must be numbers.'
    });
  }
  if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) {
    return res.status(400).json({ error: 'Bounding box is out of range or inverted.' });
  }
  if (north - south > MAX_BBOX_DEGREES || east - west > MAX_BBOX_DEGREES) {
    return res.status(400).json({
      error: `Bounding box too large (max ${MAX_BBOX_DEGREES} degree per side).`
    });
  }

  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_S}];
(
  way["landuse"](${bbox});
  way["leisure"](${bbox});
  way["boundary"="cadastral"](${bbox});
  way["place"](${bbox});
  way["amenity"](${bbox});
  relation["landuse"](${bbox});
);
out geom 500;`;

  // One controller per mirror so the losers can be cancelled once someone wins.
  const controllers = MIRRORS.map(() => new AbortController());
  let finished = false; // true once a winner exists (silences abort noise in logs)

  const fetchFromMirror = async (mirror, controller) => {
    const timeoutId = setTimeout(() => controller.abort(), MIRROR_TIMEOUT_MS);
    try {
      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data && Array.isArray(data.elements) && data.elements.length > 0) {
        return { data, mirror };
      }
      throw new Error('Empty elements');
    } catch (err) {
      if (!finished) console.warn(`[Overpass Proxy] ${mirror} failed: ${err.message}`);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    const { data, mirror } = await Promise.any(
      MIRRORS.map((m, i) => fetchFromMirror(m, controllers[i]))
    );

    finished = true;
    controllers.forEach(c => c.abort()); // cancel remaining in-flight requests

    console.log(`[Overpass Proxy] Success from ${mirror} with ${data.elements.length} elements.`);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (_allFailed) {
    return res.status(503).json({
      error: 'All Overpass mirrors timed out or unavailable. Using cadastral grid fallback.',
      overpassUnavailable: true
    });
  }
}
