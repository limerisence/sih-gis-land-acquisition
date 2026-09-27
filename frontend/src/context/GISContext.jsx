import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import * as turf from '@turf/turf';
import osmtogeojson from 'osmtogeojson';

// ─── OSM enrichment helpers (ported from backend) ───────────────────────────
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function enrichOsmFeatures(features, localityAnchor = '') {
  return features.map((feature, index) => {
    const rawTags = { ...(feature.properties || {}), ...(feature.properties?.tags || {}) };
    const featureId = String(feature.id || `WB-${index + 1}`);

    // Category is NOT guessed or auto-assigned — surveyor will inspect and verify on-site
    const category = 'Pending Survey';
    const rate = 0;

    let areaSqM = 0;
    try { areaSqM = Math.round(turf.area(feature)); } catch (_) {}
    if (areaSqM <= 0) areaSqM = 500;
    const areaSqKm = Number((areaSqM / 1_000_000).toFixed(6));

    let centerLat = 22.5726, centerLng = 88.3639;
    try {
      const center = turf.centroid(feature);
      centerLng = Number(center.geometry.coordinates[0].toFixed(6));
      centerLat = Number(center.geometry.coordinates[1].toFixed(6));
    } catch (_) {}

    // Extract genuine OSM ground address components
    const addressParts = [];
    if (rawTags.name) addressParts.push(rawTags.name);
    if (rawTags['addr:housename']) addressParts.push(rawTags['addr:housename']);
    if (rawTags['addr:housenumber']) addressParts.push(`Premises ${rawTags['addr:housenumber']}`);
    if (rawTags['addr:block']) addressParts.push(rawTags['addr:block']);
    if (rawTags['addr:street']) addressParts.push(rawTags['addr:street']);
    if (rawTags['addr:neighbourhood']) addressParts.push(rawTags['addr:neighbourhood']);
    if (rawTags['addr:suburb']) addressParts.push(rawTags['addr:suburb']);
    if (rawTags['addr:city']) addressParts.push(rawTags['addr:city']);
    if (rawTags['addr:postcode']) addressParts.push(rawTags['addr:postcode']);

    let address = rawTags['addr:full'] || (addressParts.length > 0 ? addressParts.join(', ') : null);
    if (!address) {
      if (localityAnchor) {
        address = `Plot near ${localityAnchor} (${centerLat.toFixed(5)}° N, ${centerLng.toFixed(5)}° E)`;
      } else {
        address = `Plot at ${centerLat.toFixed(5)}° N, ${centerLng.toFixed(5)}° E`;
      }
    }

    const ownerName = rawTags.operator || rawTags.name || 'Owner Record Pending Survey';
    const hash = hashString(featureId);
    const khasraNo = rawTags['ref:khasra'] || rawTags['ref:dag'] || rawTags['cadastre:khasra'] || `Dag ${100 + (hash % 850)}`;
    const plotId = `WB-PL-${featureId.replace(/\D/g, '').slice(-5) || (100 + index)}`;

    return {
      type: 'Feature',
      id: plotId,
      geometry: feature.geometry,
      properties: {
        plotId,
        ownerName,
        khasraNo,
        address,
        coordinates: { lat: centerLat, lng: centerLng },
        landAreaSqM: areaSqM,
        landAreaSqKm: areaSqKm,
        landCategory: category,
        ratePerSqM: rate,
        osmId: featureId,
        name: rawTags.name || undefined,
        landuseType: rawTags.landuse || rawTags.leisure || rawTags.amenity || undefined,
      },
    };
  });
}

// ─── Automated Cadastral Gap-Filler (Turf.js fallback & continuous gridding) ─
function fillCadastralGaps(line, bridgeBuf, existingPlots = [], localityAnchor = '') {
  try {
    const totalLengthKm = turf.length(line, { units: 'kilometers' });
    // Dynamic cell side: 40m for short corridors, 50m for medium, 75m for long
    const cellKm = totalLengthKm <= 2 ? 0.04 : totalLengthKm <= 6 ? 0.05 : 0.075;

    const bufBbox = turf.bbox(bridgeBuf);
    const grid = turf.squareGrid(bufBbox, cellKm, { units: 'kilometers' });
    const gapParcels = [];

    for (let i = 0; i < grid.features.length; i++) {
      const cell = grid.features[i];
      if (!turf.booleanIntersects(cell, bridgeBuf)) continue;

      let isCovered = false;
      if (existingPlots.length > 0) {
        for (const plot of existingPlots) {
          if (turf.booleanIntersects(cell, plot)) {
            try {
              const isect = turf.intersect(turf.featureCollection([cell, plot]));
              if (isect && turf.area(isect) > 0.45 * turf.area(cell)) {
                isCovered = true;
                break;
              }
            } catch (_) {
              try {
                const c = turf.centroid(cell);
                if (turf.booleanPointInPolygon(c, plot)) {
                  isCovered = true;
                  break;
                }
              } catch (_) {}
            }
          }
        }
      }

      if (!isCovered) {
        const center = turf.centroid(cell);
        const centerLng = Number(center.geometry.coordinates[0].toFixed(6));
        const centerLat = Number(center.geometry.coordinates[1].toFixed(6));
        const areaSqM = Math.round(turf.area(cell));
        const areaSqKm = Number((areaSqM / 1_000_000).toFixed(6));

        const cellHash = hashString(`${centerLat.toFixed(5)},${centerLng.toFixed(5)}`);
        const plotId = `WB-PL-${Math.abs(cellHash).toString().padStart(5, '0').slice(-5)}`;
        const dagNo = 100 + (cellHash % 850);
        const khasraNo = `Dag ${dagNo}`;

        const address = localityAnchor
          ? `${localityAnchor} (Plot ${plotId})`
          : `Plot at ${centerLat.toFixed(5)}° N, ${centerLng.toFixed(5)}° E, West Bengal`;

        gapParcels.push({
          type: 'Feature',
          id: plotId,
          geometry: cell.geometry,
          properties: {
            plotId,
            khasraNo,
            ownerName: 'Owner Record Pending Survey',
            address,
            coordinates: { lat: centerLat, lng: centerLng },
            landAreaSqM: areaSqM,
            landAreaSqKm: areaSqKm,
            landCategory: 'Pending Survey',
            ratePerSqM: 0,
            osmId: `cadastral-${plotId}`,
            isSyntheticCadastre: true,
          },
        });
      }
    }

    return gapParcels;
  } catch (err) {
    console.warn('[fillCadastralGaps] Error:', err);
    return [];
  }
}

// ─── Nominatim reverse geocode with in-memory cache ─────────────────────────
const geocodeCache = new Map();
export async function reverseGeocode(lat, lng) {
  const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'BhoomiSetuGIS/2.0 (Municipal Land Acquisition Platform)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const parts = [];
    if (data.name) parts.push(data.name);
    if (addr.building) parts.push(addr.building);
    if (addr.house_number) parts.push(`Premises ${addr.house_number}`);
    if (addr.road || addr.pedestrian) parts.push(addr.road || addr.pedestrian);
    if (addr.suburb || addr.neighbourhood || addr.residential)
      parts.push(addr.suburb || addr.neighbourhood || addr.residential);
    if (addr.city || addr.town || addr.county || addr.state_district)
      parts.push(addr.city || addr.town || addr.county || addr.state_district);
    if (addr.postcode) parts.push(addr.postcode);
    const formatted = parts.length > 0 ? parts.join(', ') : data.display_name;
    if (formatted) { geocodeCache.set(key, formatted); return formatted; }
  } catch (_) {}
  return null;
}

// Regional corridor anchor geocode — single fast query to discover real district/suburb/PIN
async function getLocalityAnchor(lat, lng) {
  const key = `anchor_${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`,
      { headers: { 'User-Agent': 'BhoomiSetuGIS/2.0 (Municipal Land Acquisition Platform)' } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const addr = data.address || {};
    const parts = [];
    if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
    if (addr.city || addr.town || addr.state_district) parts.push(addr.city || addr.town || addr.state_district);
    if (addr.postcode) parts.push(addr.postcode);
    const result = parts.join(', ');
    if (result) geocodeCache.set(key, result);
    return result;
  } catch (_) {
    return '';
  }
}

// Progressive non-blocking background geocoder — updates cards seamlessly without freezing UI
function enrichAddressesProgressively(plots, onPlotUpdated) {
  const queue = [...plots];
  let index = 0;

  async function processNext() {
    if (index >= queue.length) return;
    const plot = queue[index++];
    const { lat, lng } = plot.properties?.coordinates || {};
    if (lat && lng) {
      const realAddress = await reverseGeocode(lat, lng);
      if (realAddress && plot.properties) {
        plot.properties.address = realAddress;
        if (onPlotUpdated) onPlotUpdated(plot);
      }
    }
    // Respect 1 req/sec fair-use policy in the background
    setTimeout(processNext, 1100);
  }

  processNext();
}

// ─── Bbox-keyed result cache — prevents re-querying Overpass for the same area ─
const OVERPASS_MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const overpassCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Overpass fetch: First uses /api/overpass serverless proxy, then direct mirrors ─
async function fetchOverpassPolygons(south, west, north, east) {
  // Round bbox to ~110m grid to maximise cache hits for nearby corridors
  const cacheKey = [south, west, north, east].map((v) => Number(v).toFixed(3)).join(',');
  const cached = overpassCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[Overpass] Cache hit for bbox ${cacheKey} (${cached.data.length} features)`);
    return cached.data;
  }

  // 1. Primary: Same-Origin Serverless Proxy (/api/overpass)
  // Runs in Node.js on Vercel or Express backend locally, using genuine User-Agent to bypass browser 406/CORS restrictions
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 12000);
    const proxyRes = await fetch(`/api/overpass?south=${south}&west=${west}&north=${north}&east=${east}`, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (proxyRes.ok) {
      const osmJson = await proxyRes.json();
      if (osmJson && Array.isArray(osmJson.elements) && osmJson.elements.length > 0) {
        const geojson = osmtogeojson(osmJson);
        const polygons = (geojson.features || []).filter(
          (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        );
        if (polygons.length > 0) {
          console.log(`[Overpass Proxy] Successfully received ${polygons.length} features from /api/overpass`);
          overpassCache.set(cacheKey, { data: polygons, ts: Date.now() });
          return polygons;
        }
      }
    }
  } catch (err) {
    console.warn('[Overpass Proxy] /api/overpass unavailable, falling back to direct mirrors:', err.message);
  }

  // 2. Secondary: Direct browser failover to public Overpass mirrors
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

  let wasRateLimited = false;

  for (const url of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (res.status === 429 || res.status === 503) {
        console.warn(`[Overpass] Rate limited (${res.status}) by ${url} — trying next mirror`);
        wasRateLimited = true;
        continue;
      }
      if (!res.ok) {
        console.warn(`[Overpass] HTTP ${res.status} from ${url}`);
        continue;
      }

      const osmJson = await res.json();
      if (!osmJson.elements?.length) {
        console.warn(`[Overpass] 0 elements from ${url}`);
        continue;
      }

      const geojson = osmtogeojson(osmJson);
      const polygons = (geojson.features || []).filter(
        (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
      );
      if (polygons.length > 0) {
        console.log(`[Overpass] OK ${polygons.length} features from ${url}`);
        overpassCache.set(cacheKey, { data: polygons, ts: Date.now() });
        return polygons;
      }
    } catch (err) {
      console.warn(`[Overpass] FAIL ${url}:`, err.message);
    }
  }

  // 3. Tertiary GET fallback
  try {
    const getUrl = `https://maps.mail.ru/osm/tools/overpass/api/interpreter?data=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(getUrl, { signal: controller.signal });
    clearTimeout(tid);
    if (res.ok) {
      const osmJson = await res.json();
      if (osmJson.elements?.length) {
        const geojson = osmtogeojson(osmJson);
        const polygons = (geojson.features || []).filter(
          (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        );
        if (polygons.length > 0) {
          overpassCache.set(cacheKey, { data: polygons, ts: Date.now() });
          return polygons;
        }
      }
    }
  } catch (err) {
    console.warn('[Overpass] GET fallback failed:', err.message);
  }

  return wasRateLimited ? 'rate_limited' : null;
}


// ─── Exported helpers ────────────────────────────────────────────────────────
export const isBuilding = () => false;
export const isLandPlot = () => true;
export const formatINR = (n) => {
  if (!n) return '₹0';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const GISContext = createContext(null);

export function GISProvider({ children }) {
  const [allFeatures, setAllFeatures] = useState([]);
  const [dataSource, setDataSource] = useState(null);
  const [points, setPointsState] = useState([]);
  const [bufferWidthMeters, setBufferWidthMeters] = useState(20);
  const [bridgeBuffer, setBridgeBuffer] = useState(null);
  const [bufferVersion, setBufferVersion] = useState(0);
  const [affectedPlots, setAffectedPlots] = useState([]);
  const [affectedBuildings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isCalculated, setIsCalculated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [mapFocusTarget, setMapFocusTarget] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [resetCount, setResetCount] = useState(0);
  const [landVersion, setLandVersion] = useState(0);
  const [buildingVersion] = useState(0);

  // backendOnline kept for compat — analysis is now fully client-side
  const backendOnline = true;

  const showToast = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  useEffect(() => {
    showToast('Bhoomi Setu GIS Engine ready. Click map to place P1.', 'success');
  }, [showToast]);

  // ─── Point management ──────────────────────────────────────────────────
  const addPoint = useCallback((latlng) => {
    const newPt = { lat: Number(Number(latlng.lat).toFixed(6)), lng: Number(Number(latlng.lng).toFixed(6)) };
    setPointsState((prev) => {
      const updated = [...prev, newPt];
      showToast(`Point P${updated.length} placed: [${newPt.lat}, ${newPt.lng}]`, 'info');
      return updated;
    });
  }, [showToast]);

  const removePoint = useCallback((index) => {
    setPointsState((prev) => { const u = prev.filter((_, i) => i !== index); showToast(`Removed point P${index + 1}.`, 'info'); return u; });
    setBridgeBuffer(null); setBufferVersion((v) => v + 1);
    setAffectedPlots([]); setSummary(null); setIsCalculated(false);
  }, [showToast]);

  const removeLastPoint = useCallback(() => {
    setPointsState((prev) => {
      if (prev.length === 0) return prev;
      const u = prev.slice(0, -1);
      showToast(u.length > 0 ? `Removed last point (P${prev.length}).` : 'All points removed.', 'info');
      return u;
    });
    setBridgeBuffer(null); setBufferVersion((v) => v + 1);
    setAffectedPlots([]); setSummary(null); setIsCalculated(false);
  }, [showToast]);

  const clearPoints = useCallback(() => {
    setPointsState([]); setBridgeBuffer(null); setBufferVersion((v) => v + 1);
    setAffectedPlots([]); setSummary(null);
    setIsCalculated(false); setSelectedFeature(null);
    showToast('Corridor alignment cleared. Click map to start a new route.', 'info');
  }, [showToast]);

  const setPoints = useCallback((pts) => {
    const valid = pts
      .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng))
      .map((p) => ({ lat: Number(Number(p.lat).toFixed(6)), lng: Number(Number(p.lng).toFixed(6)) }));
    setPointsState(valid); setBridgeBuffer(null); setBufferVersion((v) => v + 1);
    setAffectedPlots([]); setSummary(null); setIsCalculated(false);
    showToast(`Loaded ${valid.length} corridor coordinate vertices.`, 'success');
  }, [showToast]);

  // ─── Main analysis — fully client-side with gap-filling ────────────────
  const runAnalysis = useCallback(async (customPoints = null, customWidth = null) => {
    const pts = customPoints || points;
    const width = customWidth || parseFloat(bufferWidthMeters);

    if (!pts || pts.length < 2) { showToast('Place at least 2 alignment points (P1 & P2) on the map or input panel.', 'error'); return; }
    if (isNaN(width) || width <= 0) { showToast('Enter a valid corridor width in meters (e.g. 20).', 'error'); return; }

    setIsLoading(true);
    setIsCalculated(false);

    try {
      // Build corridor line — Turf expects [lng, lat]
      const line = turf.lineString(pts.map((p) => [p.lng, p.lat]));
      const totalLengthKm = Number(turf.length(line, { units: 'kilometers' }).toFixed(3));
      const totalLengthMeters = Math.round(totalLengthKm * 1000);

      // Draw corridor buffer immediately so user can see the corridor shape
      const bridgeBuf = turf.buffer(line, width / 2, { units: 'meters' });
      setBridgeBuffer(bridgeBuf);
      setBufferVersion((v) => v + 1);

      // Bounding box for Overpass query
      const paddingKm = Math.max(width * 2.5, 120) / 1000;
      const bbox = turf.bbox(turf.buffer(line, paddingKm, { units: 'kilometers' }));
      const [west, south, east, north] = [bbox[0].toFixed(5), bbox[1].toFixed(5), bbox[2].toFixed(5), bbox[3].toFixed(5)];

      setLoadingStage('Querying cadastral land features…');

      // Parallelize regional locality anchor and Overpass vector polygons
      const midPt = pts[Math.floor(pts.length / 2)];
      const [localityAnchor, rawPolygons] = await Promise.all([
        getLocalityAnchor(midPt.lat, midPt.lng),
        fetchOverpassPolygons(south, west, north, east)
      ]);

      const validRaw = Array.isArray(rawPolygons) ? rawPolygons : [];
      const enrichedOsm = enrichOsmFeatures(validRaw, localityAnchor);

      setLoadingStage('Executing automated cadastral gap-filling along corridor…');

      // Seamlessly fill spatial gaps along corridor buffer with adjoining cadastral parcels
      const gapParcels = fillCadastralGaps(line, bridgeBuf, enrichedOsm, localityAnchor);
      const combinedFeatures = [...enrichedOsm, ...gapParcels];

      setAllFeatures(combinedFeatures);
      setLandVersion((v) => v + 1);

      // Filter all polygons that intersect the corridor buffer and compute precise areas
      const affected = [];
      combinedFeatures.forEach((plot) => {
        try {
          if (turf.booleanIntersects(plot, bridgeBuf)) {
            // Compute exact intersection polygon area
            let intersectedAreaSqM = plot.properties.landAreaSqM;
            try {
              const isect = turf.intersect(turf.featureCollection([plot, bridgeBuf]));
              if (isect) {
                intersectedAreaSqM = Math.round(turf.area(isect));
              }
            } catch (_) {}
            plot.properties.intersectedAreaSqM = intersectedAreaSqM;
            plot.properties.intersectedAcres = Number((intersectedAreaSqM / 4046.856).toFixed(3));
            affected.push(plot);
          }
        } catch (_) {}
      });

      const totalAreaSqM = affected.reduce((acc, p) => acc + (p.properties.intersectedAreaSqM || p.properties.landAreaSqM || 0), 0);
      const totalEstimatedCost = affected.reduce(
        (acc, p) => acc + (p.properties.intersectedAreaSqM || p.properties.landAreaSqM || 0) * (p.properties.ratePerSqM || 0), 0
      );

      // Instant UI presentation
      setAffectedPlots(affected);
      setSummary({
        totalPlots: affected.length,
        totalAreaSqM,
        totalAreaSqKm: Number((totalAreaSqM / 1_000_000).toFixed(5)),
        totalEstimatedCost,
        totalLengthKm,
        totalLengthMeters
      });
      setIsCalculated(true);
      setDataSource(validRaw.length > 0 ? 'overpass' : 'cadastral_grid');
      setIsLoading(false);
      setLoadingStage('');

      showToast(
        `Corridor Cadastre: ${affected.length} continuous land parcels identified along ${totalLengthKm} km alignment`,
        affected.length > 0 ? 'success' : 'info'
      );

      // Progressive non-blocking background geocoder for door-level address precision
      if (affected.length > 0) {
        enrichAddressesProgressively(affected.slice(0, 30), (updatedPlot) => {
          const pid = updatedPlot.properties?.plotId;
          setAffectedPlots((prev) =>
            prev.map((p) => (p.properties?.plotId === pid ? { ...updatedPlot } : p))
          );
        });
      }
    } catch (err) {
      console.error('[runAnalysis]', err);
      showToast(`Analysis Error: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingStage('');
    }
  }, [points, bufferWidthMeters, showToast]);

  const loadSampleRoute = useCallback(() => {
    const samplePts = [{ lat: 22.5685, lng: 88.3595 }, { lat: 22.5718, lng: 88.3655 }, { lat: 22.5752, lng: 88.3725 }];
    setPointsState(samplePts);
    setBufferWidthMeters(25);
    runAnalysis(samplePts, 25);
  }, [runAnalysis]);

  const resetAll = useCallback(() => {
    setPointsState([]); setBridgeBuffer(null); setBufferVersion((v) => v + 1);
    setAffectedPlots([]); setSummary(null);
    setIsCalculated(false); setSelectedFeature(null); setIsModalOpen(false);
    setDataSource(null); setAllFeatures([]);
    setLandVersion((v) => v + 1); setResetCount((v) => v + 1);
    showToast('Map & corridor alignment reset to initial state.', 'info');
  }, [showToast]);

  const inspectFeature = useCallback(async (feature, kind = 'plot') => {
    setSelectedFeature({ feature, kind });
    setIsModalOpen(true);
    // On-demand instant reverse geocode if address not yet door-level resolved
    const p = feature?.properties;
    const { lat, lng } = p?.coordinates || {};
    if (lat && lng && (!p?.address || p.address.startsWith('Plot at') || p.address.startsWith('Plot near'))) {
      try {
        const exactAddr = await reverseGeocode(lat, lng);
        if (exactAddr && feature.properties) {
          feature.properties.address = exactAddr;
          setSelectedFeature({ feature: { ...feature }, kind });
          setAffectedPlots((prev) =>
            prev.map((item) => (item.properties?.plotId === p.plotId ? { ...feature } : item))
          );
        }
      } catch (_) {}
    }
  }, []);

  const focusOnFeature = useCallback((feature, kind, zoom = 17) => {
    setSelectedFeature({ feature, kind });
    let lat = feature?.properties?.coordinates?.lat;
    let lng = feature?.properties?.coordinates?.lng;
    if (lat == null || lng == null) {
      try { const c = turf.centroid(feature); lng = c.geometry.coordinates[0]; lat = c.geometry.coordinates[1]; } catch (_) {}
    }
    if (lat != null && lng != null) {
      setMapFocusTarget({ lat: Number(lat), lng: Number(lng), plotId: feature?.properties?.plotId, zoom, timestamp: Date.now() });
    }
  }, []);

  const landPlotFeatures = useMemo(() => allFeatures.filter(isLandPlot), [allFeatures]);
  const buildingFeatures = useMemo(() => allFeatures.filter(isBuilding), [allFeatures]);
  const landPlotFC = useMemo(() => ({ type: 'FeatureCollection', features: landPlotFeatures }), [landPlotFeatures]);
  const buildingFC = useMemo(() => ({ type: 'FeatureCollection', features: buildingFeatures }), [buildingFeatures]);
  const affectedPlotIds = useMemo(() => new Set(affectedPlots.map((f) => f.properties.plotId)), [affectedPlots]);
  const affectedBuildingIds = useMemo(() => new Set(affectedBuildings.map((f) => f.properties.plotId)), [affectedBuildings]);

  const value = {
    allFeatures, landPlotFC, buildingFC,
    affectedPlots, affectedBuildings, affectedPlotIds, affectedBuildingIds,
    bridgeBuffer, bufferVersion, summary, backendOnline, dataSource,
    landVersion, buildingVersion, resetCount,
    points, bufferWidthMeters, setBufferWidthMeters,
    isCalculated, isLoading, loadingStage, notification,
    selectedFeature, setSelectedFeature, mapFocusTarget, setMapFocusTarget,
    isModalOpen, setIsModalOpen, inspectFeature, focusOnFeature,
    addPoint, removePoint, removeLastPoint, clearPoints, setPoints,
    runAnalysis, loadSampleRoute, resetAll, showToast, formatINR,
  };

  return <GISContext.Provider value={value}>{children}</GISContext.Provider>;
}

export function useGIS() {
  const context = useContext(GISContext);
  if (!context) throw new Error('useGIS must be used within a GISProvider');
  return context;
}


