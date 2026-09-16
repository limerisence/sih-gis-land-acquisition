import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { cadastralPlots as fallbackPlots } from '../data/cadastralPlots';
import * as turf from '@turf/turf';
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://sih-gis-land-acquisition.onrender.com';

// Helpers
export const isBuilding = (f) => Boolean(f?.properties?.buildingType);
export const isLandPlot = (f) => !isBuilding(f);

export const formatINR = (n) => {
  if (!n) return '₹0';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const GISContext = createContext(null);

export function GISProvider({ children }) {
  // All features in view (split into buildings / land plots)
  const [allFeatures, setAllFeatures] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [dataSource, setDataSource] = useState(null);

  // Multi-point corridor inputs: array of { lat: number, lng: number }
  const [points, setPointsState] = useState([]);
  const [bufferWidthMeters, setBufferWidthMeters] = useState(20);

  // Results
  const [bridgeBuffer, setBridgeBuffer] = useState(null);
  const [bufferVersion, setBufferVersion] = useState(0);
  const [affectedPlots, setAffectedPlots] = useState([]);
  const [affectedBuildings, setAffectedBuildings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isCalculated, setIsCalculated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');

  // UI state
  const [selectedFeature, setSelectedFeature] = useState(null); // { feature, kind: 'plot' | 'building' }
  const [mapFocusTarget, setMapFocusTarget] = useState(null); // { lat, lng, plotId, zoom, timestamp }
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [resetCount, setResetCount] = useState(0);

  // GeoJSON layer versioning
  const [landVersion, setLandVersion] = useState(0);
  const [buildingVersion, setBuildingVersion] = useState(0);

  const showToast = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // Verify backend status on mount without pre-populating plots
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/plots`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.features) {
          setBackendOnline(true);
          showToast('Connected to West Bengal GIS Engine. Click map to place P1.', 'success');
        }
      })
      .catch(() => {
        setBackendOnline(false);
      });
  }, [showToast]);

  // Point management
  const addPoint = useCallback((latlng) => {
    const newPt = {
      lat: Number(Number(latlng.lat).toFixed(6)),
      lng: Number(Number(latlng.lng).toFixed(6))
    };
    setPointsState((prev) => {
      const updated = [...prev, newPt];
      showToast(`Point P${updated.length} placed: [${newPt.lat}, ${newPt.lng}]`, 'info');
      return updated;
    });
  }, [showToast]);

  const removePoint = useCallback((index) => {
    setPointsState((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      showToast(`Removed point P${index + 1}.`, 'info');
      return updated;
    });
    setBridgeBuffer(null);
    setBufferVersion((v) => v + 1);
    setAffectedPlots([]);
    setAffectedBuildings([]);
    setSummary(null);
    setIsCalculated(false);
  }, [showToast]);

  const removeLastPoint = useCallback(() => {
    setPointsState((prev) => {
      if (prev.length === 0) return prev;
      const updated = prev.slice(0, -1);
      showToast(updated.length > 0 ? `Removed last point (P${prev.length}).` : 'All points removed.', 'info');
      return updated;
    });
    setBridgeBuffer(null);
    setBufferVersion((v) => v + 1);
    setAffectedPlots([]);
    setAffectedBuildings([]);
    setSummary(null);
    setIsCalculated(false);
  }, [showToast]);

  const clearPoints = useCallback(() => {
    setPointsState([]);
    setBridgeBuffer(null);
    setBufferVersion((v) => v + 1);
    setAffectedPlots([]);
    setAffectedBuildings([]);
    setSummary(null);
    setIsCalculated(false);
    setSelectedFeature(null);
    showToast('Corridor alignment cleared. Click map to start a new route.', 'info');
  }, [showToast]);

  const setPoints = useCallback((pts) => {
    const valid = pts
      .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng))
      .map((p) => ({
        lat: Number(Number(p.lat).toFixed(6)),
        lng: Number(Number(p.lng).toFixed(6))
      }));
    setPointsState(valid);
    setBridgeBuffer(null);
    setBufferVersion((v) => v + 1);
    setAffectedPlots([]);
    setAffectedBuildings([]);
    setSummary(null);
    setIsCalculated(false);
    showToast(`Loaded ${valid.length} corridor coordinate vertices.`, 'success');
  }, [showToast]);

  // Main analysis caller
  const runAnalysis = useCallback(async (customPoints = null, customWidth = null) => {
    const pts = customPoints || points;
    const width = customWidth || parseFloat(bufferWidthMeters);

    if (!pts || pts.length < 2) {
      showToast('Place at least 2 alignment points (P1 & P2) on the map or input panel.', 'error');
      return;
    }
    if (isNaN(width) || width <= 0) {
      showToast('Enter a valid corridor width in meters (e.g. 20).', 'error');
      return;
    }

    setIsLoading(true);
    setLoadingStage('Querying live OpenStreetMap (Overpass API)…');
    try {
      const resp = await fetch(`${BACKEND_URL}/api/land/intersect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: pts.map((p) => [p.lat, p.lng]),
          widthInMeters: width
        })
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `Server HTTP ${resp.status}`);
      }

      setLoadingStage('Computing multi-segment Turf.js intersections…');
      const result = await resp.json();

      if (result.allPlotsInArea?.length > 0) {
        setAllFeatures(result.allPlotsInArea);
        setLandVersion((v) => v + 1);
        setBuildingVersion((v) => v + 1);
      }

      const affected = result.affectedPlots || [];
      const plots = affected.filter(isLandPlot);
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
      const lenKm = result.totalLengthKm || (result.summary?.totalLengthKm ?? 0);
      showToast(
        `${src}: ${plots.length} land plots · ${buildings.length} buildings hit along ${lenKm} km alignment`,
        plots.length + buildings.length > 0 ? 'success' : 'info'
      );
    } catch (err) {
      showToast(`Analysis Error: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingStage('');
    }
  }, [points, bufferWidthMeters, showToast]);

  // Sample 3-point curved alignment in Central Kolkata
  const loadSampleRoute = useCallback(() => {
    const samplePts = [
      { lat: 22.5685, lng: 88.3595 },
      { lat: 22.5718, lng: 88.3655 },
      { lat: 22.5752, lng: 88.3725 }
    ];
    setPointsState(samplePts);
    setBufferWidthMeters(25);
    runAnalysis(samplePts, 25);
  }, [runAnalysis]);

  // Full reset
  const resetAll = useCallback(() => {
    setPointsState([]);
    setBridgeBuffer(null);
    setBufferVersion((v) => v + 1);
    setAffectedPlots([]);
    setAffectedBuildings([]);
    setSummary(null);
    setIsCalculated(false);
    setSelectedFeature(null);
    setIsModalOpen(false);
    setDataSource(null);
    setAllFeatures([]);
    setLandVersion((v) => v + 1);
    setBuildingVersion((v) => v + 1);
    setResetCount((v) => v + 1);
    showToast('Map & corridor alignment reset to initial state.', 'info');
  }, [showToast]);

  const inspectFeature = useCallback((feature, kind) => {
    setSelectedFeature({ feature, kind });
    setIsModalOpen(true);
  }, []);

  // Focus map camera on a feature: selects it AND triggers MapCameraController flyTo
  const focusOnFeature = useCallback((feature, kind, zoom = 17) => {
    setSelectedFeature({ feature, kind });
    let lat = feature?.properties?.coordinates?.lat;
    let lng = feature?.properties?.coordinates?.lng;
    // Fallback: compute centroid via turf if backend coordinates missing
    if (lat == null || lng == null) {
      try {
        const c = turf.centroid(feature);
        lng = c.geometry.coordinates[0];
        lat = c.geometry.coordinates[1];
      } catch (_) {}
    }
    if (lat != null && lng != null) {
      setMapFocusTarget({
        lat: Number(lat),
        lng: Number(lng),
        plotId: feature?.properties?.plotId,
        zoom,
        timestamp: Date.now(),
      });
    }
  }, []);

  // Derived collections
  const landPlotFeatures = useMemo(() => allFeatures.filter(isLandPlot), [allFeatures]);
  const buildingFeatures = useMemo(() => allFeatures.filter(isBuilding), [allFeatures]);

  const landPlotFC = useMemo(() => ({ type: 'FeatureCollection', features: landPlotFeatures }), [landPlotFeatures]);
  const buildingFC = useMemo(() => ({ type: 'FeatureCollection', features: buildingFeatures }), [buildingFeatures]);

  const affectedPlotIds = useMemo(() => new Set(affectedPlots.map((f) => f.properties.plotId)), [affectedPlots]);
  const affectedBuildingIds = useMemo(() => new Set(affectedBuildings.map((f) => f.properties.plotId)), [affectedBuildings]);

  const value = {
    // Data
    allFeatures,
    landPlotFC,
    buildingFC,
    affectedPlots,
    affectedBuildings,
    affectedPlotIds,
    affectedBuildingIds,
    bridgeBuffer,
    bufferVersion,
    summary,
    backendOnline,
    dataSource,
    landVersion,
    buildingVersion,
    resetCount,

    // Inputs
    points,
    bufferWidthMeters,
    setBufferWidthMeters,

    // Status
    isCalculated,
    isLoading,
    loadingStage,
    notification,

    // Selections & Modals
    selectedFeature,
    setSelectedFeature,
    mapFocusTarget,
    setMapFocusTarget,
    isModalOpen,
    setIsModalOpen,
    inspectFeature,
    focusOnFeature,

    // Actions
    addPoint,
    removePoint,
    removeLastPoint,
    clearPoints,
    setPoints,
    runAnalysis,
    loadSampleRoute,
    resetAll,
    showToast,
    formatINR
  };

  return <GISContext.Provider value={value}>{children}</GISContext.Provider>;
}

export function useGIS() {
  const context = useContext(GISContext);
  if (!context) {
    throw new Error('useGIS must be used within a GISProvider');
  }
  return context;
}
