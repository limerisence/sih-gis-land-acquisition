// Vercel Serverless Function: /api/overpass
// Proxies OSM cadastre/land-use polygons with a server-side User-Agent.
// Staggered (hedged) mirror requests + cache, so the shared public
// Overpass servers are not flooded and rate-limited (HTTP 429).

// Only DISTINCT backends. z./lz4.overpass-api.de are the same servers
// that overpass-api.de already routes to, so they are not listed again.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.osm.jp/api/interpreter'
];

const TOTAL_BUDGET_MS = Number(process.env.OVERPASS_BUDGET_MS) || 25000; // whole request, incl. retry
const STAGGER_MS = 3000;           // start next mirror if previous has not answered yet
const RETRY_DELAY_MS = 2000;       // pause before the second round when every mirror failed fast
const MIN_ROUND_MS = 4000;         // do not start a round with less time than this left
const QUERY_TIMEOUT_S = 15;        // Overpass server-side timeout
const QUERY_MAXSIZE = 67108864;    // 64 MiB: smaller requests are accepted more easily when busy
const MAX_BBOX_DEGREES = 1;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 50;

const USER_AGENT =
  'BhoomiSetuGIS/2.0 (Municipal Land Acquisition Platform; mailto:admin@bhoomi-setu.gov.in)';

// Lets Vercel run this function long enough for slow public Overpass servers.
// (If your plan rejects it, remove this line and set maxDuration in vercel.json.)
export const config = { maxDuration: 30 };

// Warm-instance cache (survives between requests while the function stays warm).
const cache = new Map();

function toCoord(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const hostOf = (url) => { try { return new URL(url).host; } catch (_) { return url; } };

async function queryMirror(mirror, controller, query) {
  const response = await fetch(mirror, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    },
    body: 'data=' + encodeURIComponent(query),
    signal: controller.signal
  });

  if (response.status === 429) throw new Error('HTTP 429 (rate limited)');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error('Non-JSON response (server busy?)');
  }

  if (data && typeof data.remark === 'string' && /runtime error|timed out|out of memory/i.test(data.remark)) {
    throw new Error('Overpass: ' + data.remark.slice(0, 120));
  }
  if (!data || !Array.isArray(data.elements) || data.elements.length === 0) {
    throw new Error('Empty elements');
  }
  return data;
}

// Starts mirror #1 immediately. Starts the next one when the previous
// fails, or after STAGGER_MS without an answer. First success wins.
function raceMirrors(query, budgetMs) {
  return new Promise((resolve, reject) => {
    const controllers = MIRRORS.map(() => new AbortController());
    const errors = [];
    const pending = new Set();
    let next = 0;
    let active = 0;
    let done = false;
    let staggerTimer = null;

    const deadline = setTimeout(() => {
      if (done) return;
      pending.forEach(m => errors.push({ mirror: hostOf(m), error: 'No response before deadline' }));
      finish(() => reject(Object.assign(new Error('deadline'), { errors })));
    }, budgetMs);

    function finish(fn) {
      done = true;
      clearTimeout(staggerTimer);
      clearTimeout(deadline);
      controllers.forEach(c => c.abort()); // cancel everything still in flight
      fn();
    }

    function launch() {
      if (done || next >= MIRRORS.length) return;
      clearTimeout(staggerTimer);
      const i = next++;
      const mirror = MIRRORS[i];
      active++;
      pending.add(mirror);

      queryMirror(mirror, controllers[i], query)
        .then(data => {
          if (done) return;
          finish(() => resolve({ data, mirror }));
        })
        .catch(err => {
          if (done) return;
          active--;
          pending.delete(mirror);
          errors.push({ mirror: hostOf(mirror), error: err.message });
          if (next < MIRRORS.length) launch();
          else if (active === 0) finish(() => reject(Object.assign(new Error('all failed'), { errors })));
        });

      if (next < MIRRORS.length) staggerTimer = setTimeout(launch, STAGGER_MS);
    }

    launch();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Overpass-Mirror, X-Cache');

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

  const key = [south, west, north, east].map(v => v.toFixed(4)).join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(hit.data);
  }

  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:${QUERY_TIMEOUT_S}][maxsize:${QUERY_MAXSIZE}];
(
  way["landuse"](${bbox});
  way["leisure"](${bbox});
  way["boundary"="cadastral"](${bbox});
  way["place"](${bbox});
  way["amenity"](${bbox});
  relation["landuse"](${bbox});
);
out geom qt 500;`;

  const startedAt = Date.now();
  const allDetails = [];

  for (let round = 1; round <= 2; round++) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < MIN_ROUND_MS) break;

    try {
      const { data, mirror } = await raceMirrors(query, remaining);

      cache.set(key, { time: Date.now(), data });
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);

      console.log(`[Overpass Proxy] Success from ${hostOf(mirror)} (round ${round}) with ${data.elements.length} elements.`);
      res.setHeader('X-Overpass-Mirror', hostOf(mirror));
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(data);
    } catch (err) {
      (err.errors || [{ mirror: 'n/a', error: err.message }])
        .forEach(e => allDetails.push({ round, ...e }));
      const left = TOTAL_BUDGET_MS - (Date.now() - startedAt) - RETRY_DELAY_MS;
      if (round === 1 && left >= MIN_ROUND_MS) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      else break;
    }
  }

  console.warn('[Overpass Proxy] All mirrors failed:', JSON.stringify(allDetails));

  // Serve an expired copy rather than fail, if we have one.
  if (hit) {
    res.setHeader('X-Cache', 'STALE');
    return res.status(200).json(hit.data);
  }

  return res.status(503).json({
    error: 'All Overpass mirrors timed out or unavailable. Using cadastral grid fallback.',
    overpassUnavailable: true,
    elapsedMs: Date.now() - startedAt,
    details: allDetails
  });
}
