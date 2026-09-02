import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
  LayersControl
} from 'react-leaflet';
import * as turf from '@turf/turf';
import L from 'leaflet';
import {
  Compass,
  Sliders,
  Route,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Home,
  Trees,
  Info,
  XCircle,
  Server,
  Loader2,
  Wifi,
  WifiOff,
  Layers
} from 'lucide-react';

import { cadastralPlots as fallbackPlots } from './data/cadastralPlots';

// Fix Leaflet default marker icons for Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const BACKEND_URL = 'http://localhost:5000';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** True → this OSM feature is a building footprint (has a building= tag). */
const isBuilding = (f) => Boolean(f.properties?.buildingType);

/** True → this OSM feature is a land-use / land plot (has a landuse= tag). */
const isLandPlot = (f) => !isBuilding(f);

// ─── Custom Markers ──────────────────────────────────────────────────────────

const createPointIcon = (label, bg) =>
  L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="width:36px;height:36px;border-radius:50%;background:${bg};color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(255,255,255,.35),0 4px 14px rgba(0,0,0,.5);">${label}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });

const iconPointA = createPointIcon('A', '#059669');
const iconPointB = createPointIcon('B', '#2563eb');

// ─── Map sub-components ──────────────────────────────────────────────────────

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng); } });
  return null;
}

function MapCameraController({ focusFeature, resetTrigger }) {
  const map = useMap();
  useEffect(() => {
    if (focusFeature) {
      try {
        const bbox = turf.bbox(focusFeature);
        map.flyToBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [90, 90], maxZoom: 19, duration: 1.1 });
      } catch (_) {}
    }
  }, [focusFeature, map]);
  useEffect(() => {
    if (resetTrigger > 0) map.flyTo([22.5726, 88.3639], 14, { duration: 0.9 });
  }, [resetTrigger, map]);
  return null;
}

// ─── Styling constants ───────────────────────────────────────────────────────

const STYLE = {
  landPlot: {
    unaffected: { fillColor: '#10b981', fillOpacity: 0.18, color: '#059669', weight: 1.2 },
    affected:   { fillColor: '#FF4136', fillOpacity: 0.50, color: '#cc1a10', weight: 1.5 },
    selected:   { fillColor: '#f97316', fillOpacity: 0.70, color: '#ea580c', weight: 3 },
  },
  building: {
    unaffected: { fillColor: '#6b7280', fillOpacity: 0.22, color: '#4b5563', weight: 1 },
    affected:   { fillColor: '#FFD700', fillOpacity: 0.80, color: '#F9A602', weight: 2.0 },
    selected:   { fillColor: '#fb923c', fillOpacity: 0.92, color: '#f97316', weight: 2.5 },
  },
  buffer: { fillColor: '#3b82f6', fillOpacity: 0.35, color: '#1d4ed8', weight: 2.5 },
};

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  // All features in view (split into buildings / land plots)
  const [allFeatures, setAllFeatures] = useState(fallbackPlots.features || []);
  const [backendOnline, setBackendOnline] = useState(false);
  const [dataSource, setDataSource] = useState(null);

  // Corridor inputs
  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);
  const [bufferWidthMeters, setBufferWidthMeters] = useState(20);

  // Results
  const [bridgeBuffer, setBridgeBuffer] = useState(null);
  const [bufferVersion, setBufferVersion] = useState(0);
  const [affectedPlots, setAffectedPlots] = useState([]);      // land plots affected
  const [affectedBuildings, setAffectedBuildings] = useState([]); // building footprints affected
  const [summary, setSummary] = useState(null);
  const [isCalculated, setIsCalculated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');

  // UI
  const [selectedFeature, setSelectedFeature] = useState(null); // { feature, kind: 'plot'|'building' }
  const [notification, setNotification] = useState(null);
  const [resetCount, setResetCount] = useState(0);

  // Versioning so GeoJSON layers re-mount when data changes
  const [landVersion, setLandVersion] = useState(0);
  const [buildingVersion, setBuildingVersion] = useState(0);

  // Derived: split all features into two collections
  const landPlotFeatures = useMemo(() => allFeatures.filter(isLandPlot), [allFeatures]);
  const buildingFeatures = useMemo(() => allFeatures.filter(isBuilding), [allFeatures]);

  const landPlotFC = useMemo(() => ({ type: 'FeatureCollection', features: landPlotFeatures }), [landPlotFeatures]);
  const buildingFC = useMemo(() => ({ type: 'FeatureCollection', features: buildingFeatures }), [buildingFeatures]);

  // Affected id sets
  const affectedPlotIds   = useMemo(() => new Set(affectedPlots.map((f) => f.properties.plotId)), [affectedPlots]);
  const affectedBuildingIds = useMemo(() => new Set(affectedBuildings.map((f) => f.properties.plotId)), [affectedBuildings]);

  const showToast = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification((prev) => (prev?.message === message ? null : prev)), 5000);
  }, []);

  // Fetch initial plots on mount
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/plots`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.features) {
          setAllFeatures(data.features);
          setBackendOnline(true);
          showToast('Connected — click map to place Point A.', 'success');
        }
      })
      .catch(() => {
        showToast('Backend offline — using local cadastral demo data.', 'info');
      });
  }, [showToast]);

  // Map click
  const handleMapClick = useCallback((latlng) => {
    if (!pointA) {
      setPointA(latlng);
      showToast('Point A set. Click to place Point B.', 'info');
    } else if (!pointB) {
      setPointB(latlng);
      showToast('Point B set! Adjust width then click Calculate.', 'success');
    } else {
      setPointA(latlng);
      setPointB(null);
      setBridgeBuffer(null); setBufferVersion((v) => v + 1);
      setAffectedPlots([]); setAffectedBuildings([]);
      setSummary(null); setIsCalculated(false); setSelectedFeature(null); setDataSource(null);
      showToast('Point A relocated — click to set new Point B.', 'info');
    }
  }, [pointA, pointB, showToast]);

  // ── Shared fetch + process helper ────────────────────────────────────────
  const runAnalysis = useCallback(async (pA, pB, width) => {
    setIsLoading(true);
    setLoadingStage('Querying live OpenStreetMap (Overpass API)…');
    try {
      const resp = await fetch(`${BACKEND_URL}/api/land/intersect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [[pA.lat, pA.lng], [pB.lat, pB.lng]],
          widthInMeters: width,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      setLoadingStage('Running Turf.js spatial intersection…');
      const result = await resp.json();

      // Update all features in view
      if (result.allPlotsInArea?.length > 0) {
        setAllFeatures(result.allPlotsInArea);
        setLandVersion((v) => v + 1);
        setBuildingVersion((v) => v + 1);
      }

      // Split affected features into buildings vs land plots
      const affected = result.affectedPlots || [];
      const plots     = affected.filter(isLandPlot);
      const buildings = affected.filter(isBuilding);

      setBridgeBuffer(result.bridgeBuffer);
      setBufferVersion((v) => v + 1);
      setAffectedPlots(plots);
      setAffectedBuildings(buildings);
      setSummary(result.summary || null);
      setIsCalculated(true);
      setBackendOnline(true);
      setDataSource(result.source || 'fallback');

      const src = result.source === 'overpass' ? 'Live OSM' : 'Local Data';
      showToast(
        `${src}: ${plots.length} affected plots · ${buildings.length} buildings identified`,
        plots.length + buildings.length > 0 ? 'success' : 'info'
      );
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingStage('');
    }
  }, [showToast]);

  const handleCalculate = useCallback(async () => {
    if (!pointA || !pointB) { showToast('Place both Point A and Point B first!', 'error'); return; }
    const w = parseFloat(bufferWidthMeters);
    if (isNaN(w) || w <= 0) { showToast('Enter a valid corridor width in meters.', 'error'); return; }
    await runAnalysis(pointA, pointB, w);
  }, [pointA, pointB, bufferWidthMeters, runAnalysis, showToast]);

  const handleLoadSample = useCallback(() => {
    const pA = { lat: 22.5685, lng: 88.3595 };
    const pB = { lat: 22.5728, lng: 88.3715 };
    setPointA(pA); setPointB(pB); setBufferWidthMeters(30);
    runAnalysis(pA, pB, 30);
  }, [runAnalysis]);

  const handleReset = useCallback(() => {
    setPointA(null); setPointB(null);
    setBridgeBuffer(null); setBufferVersion((v) => v + 1);
    setAffectedPlots([]); setAffectedBuildings([]);
    setSummary(null); setIsCalculated(false); setSelectedFeature(null); setDataSource(null);
    setAllFeatures(fallbackPlots.features || []);
    setLandVersion((v) => v + 1); setBuildingVersion((v) => v + 1);
    setResetCount((v) => v + 1);
    showToast('Map reset.', 'info');
  }, [showToast]);

  // ── Currency formatter ───────────────────────────────────────────────────
  const formatINR = (n) => {
    if (!n) return '₹0';
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
    if (n >= 100_000)   return `₹${(n / 100_000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
  };

  // ── GeoJSON styling callbacks ────────────────────────────────────────────
  const getLandStyle = useCallback(
    (feature) => {
      const pid = feature.properties.plotId;
      if (selectedFeature?.feature?.properties?.plotId === pid) return STYLE.landPlot.selected;
      if (affectedPlotIds.has(pid)) return STYLE.landPlot.affected;
      return STYLE.landPlot.unaffected;
    },
    [affectedPlotIds, selectedFeature]
  );

  const getBuildingStyle = useCallback(
    (feature) => {
      const pid = feature.properties.plotId;
      if (selectedFeature?.feature?.properties?.plotId === pid) return STYLE.building.selected;
      if (affectedBuildingIds.has(pid)) return STYLE.building.affected;
      return STYLE.building.unaffected;
    },
    [affectedBuildingIds, selectedFeature]
  );

  // ── GeoJSON interaction bindings ─────────────────────────────────────────
  const bindLandFeature = useCallback(
    (feature, layer) => {
      layer.on({ click: () => setSelectedFeature({ feature, kind: 'plot' }) });
      const p = feature.properties;
      const affected = affectedPlotIds.has(p.plotId);
      layer.bindTooltip(
        `<div style="font-size:11px;line-height:1.5;font-family:sans-serif;padding:2px 4px;">
          <strong style="color:${affected ? '#FF4136' : '#10b981'}">${p.plotId}</strong>
          &nbsp;<span style="color:#94a3b8">${p.khasraNo}</span><br/>
          <span style="color:#cbd5e1">${p.ownerName}</span><br/>
          <span style="color:#64748b">${(p.landAreaSqM || 0).toLocaleString()} m² · ₹${p.ratePerSqM}/m² · ${p.landCategory}</span>
          ${affected ? '<br/><span style="color:#FF4136;font-weight:700">⬛ AFFECTED LAND PLOT</span>' : ''}
        </div>`,
        { sticky: true, opacity: 0.95 }
      );
    },
    [affectedPlotIds]
  );

  const bindBuildingFeature = useCallback(
    (feature, layer) => {
      layer.on({ click: () => setSelectedFeature({ feature, kind: 'building' }) });
      const p = feature.properties;
      const affected = affectedBuildingIds.has(p.plotId);
      layer.bindTooltip(
        `<div style="font-size:11px;line-height:1.5;font-family:sans-serif;padding:2px 4px;">
          <strong style="color:${affected ? '#FFD700' : '#9ca3af'}">[Building] ${p.plotId}</strong>
          &nbsp;<span style="color:#94a3b8">${p.khasraNo}</span><br/>
          <span style="color:#cbd5e1">${p.ownerName}</span><br/>
          <span style="color:#64748b">${(p.landAreaSqM || 0).toLocaleString()} m² · ${p.buildingType || 'building'} · ${p.landCategory}</span>
          ${affected ? '<br/><span style="color:#FFD700;font-weight:700">🏠 AFFECTED BUILDING FOOTPRINT</span>' : ''}
        </div>`,
        { sticky: true, opacity: 0.95 }
      );
    },
    [affectedBuildingIds]
  );

  const centerLine = useMemo(
    () => (pointA && pointB ? [[pointA.lat, pointA.lng], [pointB.lat, pointB.lng]] : []),
    [pointA, pointB]
  );

  const sel = selectedFeature;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* ── Header ── */}
      <header className="h-14 px-5 shrink-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 backdrop-blur-md shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-500 p-[2px] shadow-lg">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Compass className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white">BhoomiAcquire GIS</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">SIH 2024</span>
            </div>
            <p className="text-[11px] text-slate-400">West Bengal Live OSM Land Acquisition Portal · Overpass API</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Layer legend chips */}
          <div className="hidden md:flex items-center gap-1.5 text-[10px] font-semibold">
            <span className="px-2 py-1 rounded-md flex items-center gap-1" style={{ background: 'rgba(255,65,54,.18)', color: '#FF4136', border: '1px solid rgba(255,65,54,.4)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#FF4136' }} /> Affected Plot
            </span>
            <span className="px-2 py-1 rounded-md flex items-center gap-1" style={{ background: 'rgba(255,215,0,.14)', color: '#FFD700', border: '1px solid rgba(255,215,0,.35)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#FFD700' }} /> Affected Building
            </span>
            <span className="px-2 py-1 rounded-md flex items-center gap-1" style={{ background: 'rgba(59,130,246,.18)', color: '#60a5fa', border: '1px solid rgba(59,130,246,.4)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#3b82f6' }} /> Buffer
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700">
            <Server className={`w-3.5 h-3.5 ${backendOnline ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-slate-300">:5000</span>
            {dataSource && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${dataSource === 'overpass' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {dataSource === 'overpass' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {dataSource === 'overpass' ? 'Live OSM' : 'Fallback'}
              </span>
            )}
          </div>

          <button
            onClick={handleLoadSample}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            style={{ background: 'rgba(16,185,129,.15)', color: '#34d399', border: '1px solid rgba(16,185,129,.35)' }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Sample Corridor
          </button>
        </div>
      </header>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        <MapContainer center={[22.5726, 88.3639]} zoom={14} scrollWheelZoom className="h-full w-full">
          <LayersControl position="bottomleft">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="CartoDB Dark">
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Esri Satellite">
              <TileLayer
                attribution='Tiles &copy; Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          <MapClickHandler onMapClick={handleMapClick} />

          {/* ── Z-INDEX LAYER ORDER ──────────────────────────────────────────
              1. Land Plot layer  (renders first → below everything)
              2. Bridge buffer    (semi-transparent on top of plots)
              3. Building layer   (renders last → always on top)
              4. Markers + polyline
          */}

          {/* LAYER 1 — Land Plots (green unaffected, RED affected) */}
          {landPlotFC.features.length > 0 && (
            <GeoJSON
              key={`land-${landVersion}-${affectedPlots.length}-${sel?.kind}-${sel?.feature?.properties?.plotId}`}
              data={landPlotFC}
              style={getLandStyle}
              onEachFeature={bindLandFeature}
            />
          )}

          {/* LAYER 2 — Centre-line dashed polyline */}
          {centerLine.length === 2 && (
            <Polyline
              positions={centerLine}
              pathOptions={{ color: '#60a5fa', weight: 2.5, dashArray: '8 5', opacity: 0.85 }}
            />
          )}

          {/* LAYER 3 — Bridge Buffer (blue, semi-transparent — sits between plots and buildings) */}
          {bridgeBuffer && (
            <GeoJSON
              key={`buffer-${bufferVersion}`}
              data={bridgeBuffer}
              style={() => STYLE.buffer}
              onEachFeature={(_, layer) => {
                layer.bindPopup(
                  `<div style="font-size:12px;font-family:sans-serif">
                    <strong style="color:#60a5fa">Proposed Infrastructure Buffer</strong>
                    <div style="color:#94a3b8;margin-top:4px">Width: ${bufferWidthMeters} m</div>
                    <div style="color:#34d399;font-weight:600;margin-top:2px">${affectedPlots.length} plots · ${affectedBuildings.length} buildings affected</div>
                  </div>`
                );
              }}
            />
          )}

          {/* LAYER 4 — Building Footprints (grey unaffected, YELLOW affected) — rendered LAST for z-index */}
          {buildingFC.features.length > 0 && (
            <GeoJSON
              key={`bldg-${buildingVersion}-${affectedBuildings.length}-${sel?.kind}-${sel?.feature?.properties?.plotId}`}
              data={buildingFC}
              style={getBuildingStyle}
              onEachFeature={bindBuildingFeature}
            />
          )}

          {/* Point Markers */}
          {pointA && (
            <Marker position={[pointA.lat, pointA.lng]} icon={iconPointA}>
              <Popup>
                <div style={{ fontSize: 11, fontFamily: 'sans-serif' }}>
                  <strong style={{ color: '#059669' }}>Point A (Start)</strong>
                  <div style={{ fontFamily: 'monospace', color: '#94a3b8', marginTop: 2 }}>{pointA.lat.toFixed(5)}, {pointA.lng.toFixed(5)}</div>
                </div>
              </Popup>
            </Marker>
          )}
          {pointB && (
            <Marker position={[pointB.lat, pointB.lng]} icon={iconPointB}>
              <Popup>
                <div style={{ fontSize: 11, fontFamily: 'sans-serif' }}>
                  <strong style={{ color: '#2563eb' }}>Point B (End)</strong>
                  <div style={{ fontFamily: 'monospace', color: '#94a3b8', marginTop: 2 }}>{pointB.lat.toFixed(5)}, {pointB.lng.toFixed(5)}</div>
                </div>
              </Popup>
            </Marker>
          )}

          <MapCameraController focusFeature={sel?.feature} resetTrigger={resetCount} />
        </MapContainer>

        {/* ── Map Legend (bottom-left) ── */}
        <div className="absolute bottom-8 left-6 z-20 rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-md p-3.5 shadow-xl shadow-black/40 text-xs">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Layer Legend
          </div>
          <div className="space-y-1.5">
            {[
              { color: '#10b981', label: 'Land Plot (Unaffected)' },
              { color: '#FF4136', label: 'Land Plot (Affected — Red)' },
              { color: '#6b7280', label: 'Building Footprint (Unaffected)' },
              { color: '#FFD700', label: 'Building Footprint (Affected — Yellow)' },
              { color: '#3b82f6', opacity: 0.5, label: 'Bridge Buffer' },
            ].map(({ color, opacity = 1, label }) => (
              <div key={label} className="flex items-center gap-2 text-slate-300">
                <span className="w-4 h-3.5 rounded-sm shrink-0" style={{ background: color, opacity }} />
                {label}
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Point A</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Point B</span>
            </div>
          </div>
        </div>

        {/* ── Right Control Panel ── */}
        <div className="absolute top-4 right-4 z-20 w-88 sm:w-96 max-h-[calc(100vh-5rem)] flex flex-col rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-2xl shadow-black/60 overflow-hidden">

          {/* Panel Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <h2 className="font-bold text-sm text-white">Corridor Analysis</h2>
            </div>
            <button onClick={handleReset} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          {/* Data source banner */}
          {dataSource && (
            <div className={`px-4 py-2 border-b flex items-center gap-2 text-xs font-medium shrink-0 ${dataSource === 'overpass' ? 'bg-emerald-950/40 border-emerald-900/40 text-emerald-300' : 'bg-amber-950/40 border-amber-900/40 text-amber-300'}`}>
              {dataSource === 'overpass' ? <Wifi className="w-3.5 h-3.5 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 shrink-0" />}
              {dataSource === 'overpass'
                ? `Live Overpass API — ${allFeatures.length} OSM features in corridor area`
                : 'Overpass unavailable — local cadastral fallback active'}
            </div>
          )}

          {/* Controls */}
          <div className="p-4 space-y-3.5 border-b border-slate-800 shrink-0">
            {/* Point badges */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'A', title: 'Start Point', pt: pointA, col: '#059669' },
                { label: 'B', title: 'End Point',   pt: pointB, col: '#2563eb' }
              ].map(({ label, title, pt, col }) => (
                <div
                  key={label}
                  className="p-2 rounded-xl border flex items-center gap-2 transition-all"
                  style={pt ? { borderColor: col + '66', background: col + '14', color: col } : { borderColor: '#1e293b', background: 'transparent', color: '#64748b' }}
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-white" style={{ background: pt ? col : '#334155' }}>{label}</div>
                  <div className="truncate">
                    <div className="font-semibold text-[11px]">{title}</div>
                    <div className="text-[10px] opacity-70 truncate">{pt ? `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}` : 'Click map'}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Width input */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1.5">
                <span>Infrastructure Width</span>
                <span className="text-emerald-400 font-mono font-bold">{bufferWidthMeters} m</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number" min="5" max="300"
                  value={bufferWidthMeters}
                  onChange={(e) => setBufferWidthMeters(Number(e.target.value))}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
                <span className="text-xs text-slate-400 self-center font-medium">Meters</span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Presets:</span>
                {[15, 20, 30, 50].map((w) => (
                  <button
                    key={w}
                    onClick={() => setBufferWidthMeters(w)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${bufferWidthMeters === w ? 'text-emerald-300 border border-emerald-500/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    style={bufferWidthMeters === w ? { background: 'rgba(16,185,129,.15)' } : {}}
                  >
                    {w}m
                  </button>
                ))}
              </div>
            </div>

            {/* Calculate button */}
            <button
              onClick={handleCalculate}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: isLoading ? '#0f766e' : 'linear-gradient(to right,#059669,#0d9488,#0891b2)', boxShadow: '0 4px 14px rgba(5,150,105,.3)' }}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span className="truncate">{loadingStage || 'Processing…'}</span></>
              ) : (
                <><Route className="w-4 h-4" /><span>Calculate Affected Plots</span></>
              )}
            </button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="p-4 border-b border-slate-800 bg-slate-950/40 shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Acquisition Impact
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: 'rgba(239,68,68,.15)', color: '#fca5a5', borderColor: 'rgba(239,68,68,.3)' }}>
                  {summary.totalPlots} Features Required
                </span>
              </div>

              {/* Dual breakdown row */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="p-2.5 rounded-xl border text-xs" style={{ background: 'rgba(255,65,54,.08)', borderColor: 'rgba(255,65,54,.2)' }}>
                  <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: '#FF4136' }}>Land Plots</div>
                  <div className="text-lg font-black text-white">{affectedPlots.length}</div>
                  <div className="text-[10px] text-slate-400">affected plots</div>
                </div>
                <div className="p-2.5 rounded-xl border text-xs" style={{ background: 'rgba(255,215,0,.08)', borderColor: 'rgba(255,215,0,.2)' }}>
                  <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: '#FFD700' }}>Buildings</div>
                  <div className="text-lg font-black text-white">{affectedBuildings.length}</div>
                  <div className="text-[10px] text-slate-400">affected footprints</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Total Area</span>
                  <div className="text-sm font-bold text-white mt-0.5">{summary.totalAreaSqM?.toLocaleString()} m²</div>
                  <span className="text-[11px] text-emerald-400">{((summary.totalAreaSqM || 0) / 10000).toFixed(2)} Ha</span>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Est. Award</span>
                  <div className="text-sm font-bold text-cyan-300 mt-0.5">{formatINR(summary.totalEstimatedCost)}</div>
                  <span className="text-[11px] text-slate-400">LARR Act 2013</span>
                </div>
              </div>
            </div>
          )}

          {/* Feature lists — tabbed */}
          <FeatureList
            isCalculated={isCalculated}
            affectedPlots={affectedPlots}
            affectedBuildings={affectedBuildings}
            allFeatures={allFeatures}
            affectedPlotIds={affectedPlotIds}
            affectedBuildingIds={affectedBuildingIds}
            selectedFeature={selectedFeature}
            setSelectedFeature={setSelectedFeature}
            formatINR={formatINR}
          />

          {/* Plot Inspector */}
          {sel && (
            <FeatureInspector sel={sel} onClose={() => setSelectedFeature(null)} formatINR={formatINR} />
          )}
        </div>

        {/* Toast */}
        {notification && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-xl shadow-2xl border flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md max-w-sm"
            style={{
              background: notification.type === 'error' ? 'rgba(136,19,55,.92)' : notification.type === 'success' ? 'rgba(5,46,22,.92)' : 'rgba(15,23,42,.92)',
              borderColor: notification.type === 'error' ? 'rgba(244,63,94,.4)' : notification.type === 'success' ? 'rgba(16,185,129,.4)' : 'rgba(100,116,139,.4)',
              color: notification.type === 'error' ? '#fda4af' : notification.type === 'success' ? '#6ee7b7' : '#cbd5e1'
            }}
          >
            {notification.type === 'error' ? <XCircle className="w-4 h-4 shrink-0" /> : notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
            {notification.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Feature List Component ──────────────────────────────────────────────────

function FeatureList({ isCalculated, affectedPlots, affectedBuildings, allFeatures, affectedPlotIds, affectedBuildingIds, selectedFeature, setSelectedFeature, formatINR }) {
  const [tab, setTab] = useState('plots'); // 'plots' | 'buildings'

  const displayList = isCalculated
    ? (tab === 'plots' ? affectedPlots : affectedBuildings)
    : allFeatures.slice(0, 30);

  const CategoryIcon = ({ cat }) => {
    if (cat === 'Commercial') return <Building2 className="w-2.5 h-2.5" />;
    if (cat === 'Agricultural') return <Trees className="w-2.5 h-2.5" />;
    return <Home className="w-2.5 h-2.5" />;
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      {/* Tabs */}
      {isCalculated && (
        <div className="flex shrink-0 border-b border-slate-800 bg-slate-950/30">
          {[
            { key: 'plots', label: `Land Plots (${affectedPlots.length})`, color: '#FF4136' },
            { key: 'buildings', label: `Buildings (${affectedBuildings.length})`, color: '#FFD700' },
          ].map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 py-2 text-xs font-semibold transition-all cursor-pointer border-b-2"
              style={{
                borderBottomColor: tab === key ? color : 'transparent',
                color: tab === key ? color : '#64748b',
                background: tab === key ? color + '10' : 'transparent'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!isCalculated && (
          <div className="text-[10px] text-slate-500 font-medium px-1 mb-1">
            Preview: first 30 of {allFeatures.length} features
          </div>
        )}

        {isCalculated && displayList.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-400 rounded-xl border border-slate-800">
            <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2 opacity-80" />
            No {tab === 'plots' ? 'land plots' : 'buildings'} intersect this corridor.
          </div>
        )}

        {displayList.map((f) => {
          const p = f.properties;
          const isPlot = isLandPlot(f);
          const isAffected = isPlot ? affectedPlotIds.has(p.plotId) : affectedBuildingIds.has(p.plotId);
          const isSelected = selectedFeature?.feature?.properties?.plotId === p.plotId;
          const cost = (p.landAreaSqM || 0) * (p.ratePerSqM || 0);

          const accentColor = isPlot ? '#FF4136' : '#FFD700';

          return (
            <div
              key={p.plotId}
              onClick={() => setSelectedFeature({ feature: f, kind: isPlot ? 'plot' : 'building' })}
              className="p-3 rounded-xl cursor-pointer transition-all border"
              style={isSelected
                ? { borderColor: '#34d399', background: 'rgba(52,211,153,.08)' }
                : isAffected
                ? { borderColor: accentColor + '50', background: accentColor + '08' }
                : { borderColor: '#1e293b', background: 'transparent' }
              }
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs" style={{ color: isAffected ? accentColor : '#cbd5e1' }}>{p.plotId}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{p.khasraNo}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1"
                      style={{
                        background: p.landCategory === 'Commercial' ? 'rgba(168,85,247,.18)' : p.landCategory === 'Agricultural' ? 'rgba(245,158,11,.18)' : 'rgba(59,130,246,.18)',
                        color: p.landCategory === 'Commercial' ? '#c084fc' : p.landCategory === 'Agricultural' ? '#fbbf24' : '#93c5fd'
                      }}>
                      <CategoryIcon cat={p.landCategory} />
                      {p.landCategory}
                    </span>
                    {!isPlot && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,215,0,.12)', color: '#FFD700' }}>
                        Bldg
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-300 mt-0.5 truncate">{p.ownerName}</div>
                </div>
                {isAffected && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: accentColor + '20', color: accentColor, border: `1px solid ${accentColor}50` }}>
                    HIT
                  </span>
                )}
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-slate-800/70 flex justify-between text-[11px] text-slate-400">
                <span>Area: <strong className="text-slate-200">{(p.landAreaSqM || 0).toLocaleString()} m²</strong></span>
                <span>Comp: <strong style={{ color: '#34d399' }}>{formatINR(cost)}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Feature Inspector ───────────────────────────────────────────────────────

function FeatureInspector({ sel, onClose, formatINR }) {
  const p = sel.feature.properties;
  const isPlot = sel.kind === 'plot';
  const accentColor = isPlot ? '#FF4136' : '#FFD700';
  const cost = (p.landAreaSqM || 0) * (p.ratePerSqM || 0);

  return (
    <div className="p-4 border-t border-slate-800 bg-slate-950 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: accentColor }}>
          {isPlot ? '⬛ Land Plot Inspector' : '🏠 Building Footprint Inspector'}
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕</button>
      </div>
      <div className="text-xs space-y-1">
        {[
          ['Plot ID / Khasra', `${p.plotId} / ${p.khasraNo}`],
          ['Feature Type', isPlot ? 'Land Plot / Parcel' : `Building Footprint (${p.buildingType || 'building'})`],
          ['Owner / Operator', p.ownerName],
          ['Category', p.landCategory],
          ['Land Use', p.landuseType || p.buildingType || '—'],
          ['Area', `${(p.landAreaSqM || 0).toLocaleString()} m²`],
          ['Circle Rate', `₹${p.ratePerSqM}/m²`],
          ['OSM ID', p.osmId || '—'],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-slate-400 shrink-0">{label}:</span>
            <span className="text-slate-200 font-medium text-right break-all">{value}</span>
          </div>
        ))}
        <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
          <span className="text-slate-300">Acquisition Award:</span>
          <span style={{ color: '#34d399' }}>{formatINR(cost)}</span>
        </div>
      </div>
    </div>
  );
}
