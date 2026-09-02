import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import osmtogeojson from 'osmtogeojson';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Load local fallback cadastral plots GeoJSON data
const plotsFilePath = path.join(__dirname, 'data', 'plots.json');
const plotsData = JSON.parse(fs.readFileSync(plotsFilePath, 'utf-8'));

// West Bengal Realistic Land Title Registry Pool for dynamic metadata enrichment
const WB_OWNERS = [
  'Sujay Ghosh',
  'Aniket Das',
  'KMDA (Kolkata Metropolitan Development Authority)',
  'WBHIDCO Infrastructure Division',
  'Panchayat Samiti Board',
  'Debabrata Mukherjee',
  'Subhasish Dutta',
  'Sunita Banerjee',
  'Aloke Kumar Ghosh',
  'Tapan Kumar Bhattacharya',
  'Rupa Mallick',
  'Swapan Halder & Sons',
  'Anjali Sengupta',
  'Bishwanath Das',
  'M/s Bengal Logistics & Warehousing',
  'West Bengal Land Reforms Trust',
  'Tarun Kanti Sen',
  'M/s Hooghly Riverfront Development Corp',
  'Pranab Mukherjee & Brothers',
  'Bhowmick Enterprise Pvt Ltd',
  'Kalyani Agricultural Syndicate',
  'Smt. Aparna Sen'
];

// Simple deterministic hash for stable properties on the same OSM feature
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// 2. METADATA ENRICHMENT ON THE FLY
function enrichOsmFeatures(features) {
  return features.map((feature, index) => {
    const rawTags = feature.properties?.tags || {};
    const featureId = String(feature.id || `WB-${index + 1}`);
    const hash = hashString(featureId + (rawTags.name || ''));

    // Category determination from OSM tags
    let category = 'Residential';
    const building = (rawTags.building || '').toLowerCase();
    const landuse = (rawTags.landuse || '').toLowerCase();

    if (
      building === 'commercial' ||
      building === 'retail' ||
      building === 'warehouse' ||
      building === 'office' ||
      building === 'supermarket' ||
      landuse === 'commercial' ||
      landuse === 'retail' ||
      landuse === 'industrial' ||
      rawTags.shop ||
      rawTags.amenity === 'bank' ||
      rawTags.amenity === 'hospital'
    ) {
      category = 'Commercial';
    } else if (
      landuse === 'farmland' ||
      landuse === 'forest' ||
      landuse === 'meadow' ||
      landuse === 'grass' ||
      landuse === 'orchard' ||
      landuse === 'allotments' ||
      landuse === 'farmyard'
    ) {
      category = 'Agricultural';
    }

    // Rate per sqM (West Bengal typical circle rate bands)
    let rate = 6500;
    if (category === 'Commercial') {
      rate = 12000 + (hash % 6000);
    } else if (category === 'Agricultural') {
      rate = 3500 + (hash % 1500);
    } else {
      rate = 5500 + (hash % 3000);
    }

    // Dynamically compute exact land area in sq. meters using @turf/area
    let areaSqM = 0;
    try {
      areaSqM = Math.round(turf.area(feature));
    } catch (e) {
      areaSqM = 850 + (hash % 2000);
    }
    if (areaSqM <= 0) areaSqM = 650 + (hash % 1500);

    const ownerName =
      rawTags.operator ||
      rawTags.name ||
      WB_OWNERS[hash % WB_OWNERS.length];

    const khasraNo = `Dag ${101 + (hash % 600)}/${1 + (hash % 15)}`;
    const plotId = `WB-PL-${featureId.replace(/\D/g, '').slice(-5) || (100 + index)}`;

    return {
      type: 'Feature',
      id: plotId,
      geometry: feature.geometry,
      properties: {
        plotId,
        ownerName,
        khasraNo,
        landAreaSqM: areaSqM,
        landCategory: category,
        ratePerSqM: rate,
        osmId: featureId,
        name: rawTags.name || undefined,
        buildingType: rawTags.building || undefined,
        landuseType: rawTags.landuse || undefined
      }
    };
  });
}

// 1. DYNAMIC OVERPASS API CLIENT
async function fetchOverpassFeatures(south, west, north, east) {
  const query = `[out:json][timeout:15];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["landuse"](${south},${west},${north},${east});
  relation["landuse"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;

  // Try endpoints with optimal protocol
  const attempts = [
    {
      name: 'overpass.kumi.systems (POST)',
      url: 'https://overpass.kumi.systems/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BhoomiAcquireGIS/1.0 (West Bengal Municipal Land Acquisition)'
      },
      body: 'data=' + encodeURIComponent(query)
    },
    {
      name: 'overpass-api.de (GET)',
      url: `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      method: 'GET',
      headers: {
        'User-Agent': 'BhoomiAcquireGIS/1.0 (West Bengal Municipal Land Acquisition)'
      }
    }
  ];

  for (const req of attempts) {
    try {
      console.log(`[Overpass API] Querying ${req.name} for bbox [S:${south}, W:${west}, N:${north}, E:${east}]...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const fetchOptions = {
        method: req.method,
        headers: req.headers,
        signal: controller.signal
      };
      if (req.body) fetchOptions.body = req.body;

      const response = await fetch(req.url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Overpass API] ${req.name} returned HTTP ${response.status}`);
        continue;
      }

      const osmJson = await response.json();
      if (!osmJson.elements || osmJson.elements.length === 0) {
        console.warn(`[Overpass API] 0 elements from ${req.name}`);
        continue;
      }

      const geojson = osmtogeojson(osmJson);
      const polygons = (geojson.features || []).filter(
        (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
      );

      if (polygons.length > 0) {
        console.log(`[Overpass API] Successfully received and converted ${polygons.length} polygon features.`);
        return polygons;
      }
    } catch (err) {
      console.warn(`[Overpass API] Error querying ${req.name}:`, err.message);
    }
  }

  return null; // Fallback signal
}

// Configure CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000'
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json());

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'West Bengal Live GIS Overpass & Land Acquisition Backend',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Geospatial Data API: GET /api/plots
app.get('/api/plots', (req, res) => {
  try {
    res.json(plotsData);
  } catch (error) {
    console.error('Error fetching plots data:', error);
    res.status(500).json({ error: 'Failed to retrieve cadastral plots data' });
  }
});

// 3. SPATIAL INTERSECTION API ENDPOINT (WITH DYNAMIC OVERPASS FETCH & BUFFER)
app.post('/api/land/intersect', async (req, res) => {
  try {
    const { points, widthInMeters } = req.body;

    // Validation
    if (!points || !Array.isArray(points) || points.length < 2) {
      return res.status(400).json({
        error: 'Invalid input. "points" must be an array with at least two [lat, lng] coordinates.'
      });
    }

    const width = parseFloat(widthInMeters);
    if (isNaN(width) || width <= 0) {
      return res.status(400).json({
        error: 'Invalid input. "widthInMeters" must be a positive number.'
      });
    }

    const [pointA, pointB] = points;
    if (!pointA || !pointB || pointA.length < 2 || pointB.length < 2) {
      return res.status(400).json({
        error: 'Both Point A and Point B must contain valid [latitude, longitude].'
      });
    }

    // Convert [lat, lng] to Turf.js [lng, lat]
    const coordA = [pointA[1], pointA[0]];
    const coordB = [pointB[1], pointB[0]];

    // Construct LineString between Point A and Point B
    const line = turf.lineString([coordA, coordB]);

    // 1. Calculate a bounding box with ~400m padding around the corridor
    const padded = turf.buffer(line, 0.4, { units: 'kilometers' });
    const bbox = turf.bbox(padded); // [minLng, minLat, maxLng, maxLat]
    const south = bbox[1].toFixed(5);
    const west = bbox[0].toFixed(5);
    const north = bbox[3].toFixed(5);
    const east = bbox[2].toFixed(5);

    console.log(`[Corridor Analysis] Point A: [${pointA}], Point B: [${pointB}], Width: ${width}m`);
    console.log(`[Bounding Box] S: ${south}, W: ${west}, N: ${north}, E: ${east}`);

    // Fetch live OpenStreetMap features for this area of West Bengal
    let rawOsmPolygons = await fetchOverpassFeatures(south, west, north, east);
    let plotsToIntersect = [];
    let dataSource = 'overpass';

    if (rawOsmPolygons && rawOsmPolygons.length > 0) {
      // 2. Metadata enrichment on the fly
      plotsToIntersect = enrichOsmFeatures(rawOsmPolygons);
      console.log(`[Enriched Plots] Generated ${plotsToIntersect.length} dynamic cadastral plots from OSM.`);
    } else {
      // Fallback to local cadastral dataset
      console.log('[Overpass API] Falling back to local cadastral dataset (plots.json).');
      plotsToIntersect = plotsData.features;
      dataSource = 'fallback';
    }

    // 3. Create bridge buffer polygon using turf.buffer(line, radius, { units: 'meters' })
    const radius = width / 2; // e.g. 10m radius for a 20m bridge
    const bridgeBuffer = turf.buffer(line, radius, { units: 'meters' });

    // Perform booleanIntersects check against all live-fetched OSM plots
    const affectedPlots = [];
    plotsToIntersect.forEach((plot) => {
      try {
        const isIntersecting = turf.booleanIntersects(plot, bridgeBuffer);
        if (isIntersecting) {
          affectedPlots.push(plot);
        }
      } catch (err) {
        // ignore degenerate geometry
      }
    });

    // Compute summary metrics
    const totalPlots = affectedPlots.length;
    const totalAreaSqM = affectedPlots.reduce(
      (acc, p) => acc + (p.properties.landAreaSqM || 0),
      0
    );
    const totalEstimatedCost = affectedPlots.reduce(
      (acc, p) => acc + (p.properties.landAreaSqM || 0) * (p.properties.ratePerSqM || 0),
      0
    );

    const summary = {
      totalPlots,
      totalAreaSqM,
      totalEstimatedCost
    };

    console.log(
      `[Spatial Intersect] (${dataSource}) Processed corridor with width ${width}m: ${totalPlots} affected plot(s) out of ${plotsToIntersect.length} in area, total area: ${totalAreaSqM}m², total cost: ₹${totalEstimatedCost.toLocaleString('en-IN')}`
    );

    res.json({
      bridgeBuffer,
      affectedPlots,
      summary,
      allPlotsInArea: plotsToIntersect,
      source: dataSource,
      bbox: { south, west, north, east }
    });
  } catch (error) {
    console.error('Error processing spatial intersection:', error);
    res.status(500).json({ error: 'Failed to process spatial intersection analysis', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Municipal GIS Backend] Server running on http://localhost:${PORT}`);
});
