import React, { useEffect, useCallback, useMemo } from 'react';
import {
  MapContainer as LeafletMap,
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
import { Layers } from 'lucide-react';
import { useGIS } from '../context/GISContext';
import { useAuth, ROLES } from '../context/AuthContext';

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

// Styling constants
const STYLE = {
  landPlot: {
    unaffected: { fillColor: '#10b981', fillOpacity: 0.18, color: '#059669', weight: 1.2 },
    affected: { fillColor: '#FF4136', fillOpacity: 0.50, color: '#cc1a10', weight: 1.5 },
    selected: { fillColor: '#f97316', fillOpacity: 0.70, color: '#ea580c', weight: 3 },
  },
  building: {
    unaffected: { fillColor: '#6b7280', fillOpacity: 0.22, color: '#4b5563', weight: 1 },
    affected: { fillColor: '#FFD700', fillOpacity: 0.80, color: '#F9A602', weight: 2.0 },
    selected: { fillColor: '#fb923c', fillOpacity: 0.92, color: '#f97316', weight: 2.5 },
  },
  buffer: { fillColor: '#3b82f6', fillOpacity: 0.35, color: '#1d4ed8', weight: 2.5 },
};

// Create custom vertex marker icon (P1, P2, P3...)
const createVertexIcon = (index, total) => {
  const isStart = index === 0;
  const isEnd = index === total - 1 && total > 1;
  const bg = isStart ? '#059669' : isEnd ? '#2563eb' : '#0d9488';

  return L.divIcon({
    className: 'custom-leaflet-vertex-marker',
    html: `<div style="
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: ${bg};
      color: #ffffff;
      font-weight: 800;
      font-size: 12px;
      font-family: monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      cursor: pointer;
    ">P${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

// Map click listener to add vertices sequentially
function MapClickHandler({ onMapClick, enabled }) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick(e.latlng);
    }
  });
  return null;
}

// Map camera controller: reads mapFocusTarget from GIS context for flyTo,
// and resets to Kolkata center on resetCount change.
function MapCameraController({ resetTrigger }) {
  const map = useMap();
  const { mapFocusTarget, selectedFeature } = useGIS();

  // Fly to explicit lat/lng point when sidebar card is clicked
  useEffect(() => {
    if (!mapFocusTarget) return;
    map.flyTo([mapFocusTarget.lat, mapFocusTarget.lng], mapFocusTarget.zoom || 17, { duration: 1.1 });
  }, [mapFocusTarget, map]);

  // Fallback: fly to feature bbox when selected from map (no mapFocusTarget set)
  useEffect(() => {
    if (mapFocusTarget) return; // lat/lng focus takes priority
    const f = selectedFeature?.feature;
    if (!f) return;
    try {
      const bbox = turf.bbox(f);
      map.flyToBounds(
        [[bbox[1], bbox[0]], [bbox[3], bbox[2]]],
        { padding: [90, 90], maxZoom: 19, duration: 1.1 }
      );
    } catch (_) {}
  }, [selectedFeature, mapFocusTarget, map]);

  useEffect(() => {
    if (resetTrigger > 0) {
      map.flyTo([22.5726, 88.3639], 14, { duration: 0.9 });
    }
  }, [resetTrigger, map]);

  return null;
}

export default function MapContainer() {
  const { userRole } = useAuth();
  const clickEnabled = userRole !== ROLES.BENEFICIARY;
  const {
    points,
    addPoint,
    removePoint,
    landPlotFC,
    buildingFC,
    affectedPlots,
    affectedBuildings,
    affectedPlotIds,
    affectedBuildingIds,
    bridgeBuffer,
    bufferVersion,
    bufferWidthMeters,
    selectedFeature,
    setSelectedFeature,
    inspectFeature,
    landVersion,
    buildingVersion,
    resetCount
  } = useGIS();

  // Multi-point centerline polyline
  const polylineCoords = useMemo(() => {
    return points.map((p) => [p.lat, p.lng]);
  }, [points]);

  // Style handlers
  const getLandStyle = useCallback(
    (feature) => {
      const pid = feature.properties?.plotId;
      if (selectedFeature?.feature?.properties?.plotId === pid) return STYLE.landPlot.selected;
      if (affectedPlotIds.has(pid)) return STYLE.landPlot.affected;
      return STYLE.landPlot.unaffected;
    },
    [affectedPlotIds, selectedFeature]
  );

  const getBuildingStyle = useCallback(
    (feature) => {
      const pid = feature.properties?.plotId;
      if (selectedFeature?.feature?.properties?.plotId === pid) return STYLE.building.selected;
      if (affectedBuildingIds.has(pid)) return STYLE.building.affected;
      return STYLE.building.unaffected;
    },
    [affectedBuildingIds, selectedFeature]
  );

  // Interaction handlers
  const bindLandFeature = useCallback(
    (feature, layer) => {
      layer.on({
        click: () => setSelectedFeature({ feature, kind: 'plot' }),
        dblclick: () => inspectFeature(feature, 'plot')
      });
      const p = feature.properties || {};
      const affected = affectedPlotIds.has(p.plotId);
      const sqKm = ((p.landAreaSqM || 0) / 1000000).toFixed(6);

      // Resolve surveyor-verified owner name from localStorage if available
      let displayOwner = p.ownerName || '';
      try {
        const tasks = JSON.parse(localStorage.getItem('bhoomi_survey_tasks') || '[]');
        const task = tasks.find((t) => t.plotId === p.plotId);
        if (task?.surveyorOwnerName) {
          displayOwner = `${task.surveyorOwnerName} (Verified)`;
        }
      } catch (_) {}

      layer.bindTooltip(
        `<div style="font-size:11px;line-height:1.5;font-family:sans-serif;padding:3px 5px;max-width:240px;">
          <strong style="color:${affected ? '#FF4136' : '#10b981'}">${p.plotId}</strong>
          &nbsp;<span style="color:#94a3b8">${p.khasraNo || ''}</span><br/>
          <span style="color:#cbd5e1">${displayOwner}</span><br/>
          ${p.address ? `<span style="color:#64748b;font-size:10px">📍 ${p.address}</span><br/>` : ''}
          <span style="color:#34d399;font-weight:700">${sqKm} sq km</span>
          <span style="color:#94a3b8">(${(p.landAreaSqM || 0).toLocaleString()} m² · ${p.landCategory})</span>
          ${affected ? '<br/><span style="color:#FF4136;font-weight:700">⬛ AFFECTED LAND PARCEL</span>' : ''}
        </div>`,
        { sticky: true, opacity: 0.95 }
      );
    },
    [affectedPlotIds, setSelectedFeature, inspectFeature]
  );

  const bindBuildingFeature = useCallback(
    (feature, layer) => {
      layer.on({
        click: () => setSelectedFeature({ feature, kind: 'building' }),
        dblclick: () => inspectFeature(feature, 'building')
      });
      const p = feature.properties || {};
      const affected = affectedBuildingIds.has(p.plotId);
      const sqKm = ((p.landAreaSqM || 0) / 1000000).toFixed(6);

      let displayOwner = p.ownerName || '';
      try {
        const tasks = JSON.parse(localStorage.getItem('bhoomi_survey_tasks') || '[]');
        const task = tasks.find((t) => t.plotId === p.plotId);
        if (task?.surveyorOwnerName) {
          displayOwner = `${task.surveyorOwnerName} (Verified)`;
        }
      } catch (_) {}

      layer.bindTooltip(
        `<div style="font-size:11px;line-height:1.5;font-family:sans-serif;padding:3px 5px;max-width:240px;">
          <strong style="color:${affected ? '#FFD700' : '#9ca3af'}">[Building] ${p.plotId}</strong>
          &nbsp;<span style="color:#94a3b8">${p.khasraNo || ''}</span><br/>
          <span style="color:#cbd5e1">${displayOwner}</span><br/>
          ${p.address ? `<span style="color:#64748b;font-size:10px">📍 ${p.address}</span><br/>` : ''}
          <span style="color:#FFD700;font-weight:700">${sqKm} sq km</span>
          <span style="color:#94a3b8">(${(p.landAreaSqM || 0).toLocaleString()} m² · ${p.buildingType || 'structure'})</span>
          ${affected ? '<br/><span style="color:#FFD700;font-weight:700">🏠 AFFECTED STRUCTURE</span>' : ''}
        </div>`,
        { sticky: true, opacity: 0.95 }
      );
    },
    [affectedBuildingIds, setSelectedFeature, inspectFeature]
  );

  return (
    <div className="flex-1 relative w-full h-full">
      <LeafletMap
        center={[22.5726, 88.3639]}
        zoom={14}
        scrollWheelZoom
        className="h-full w-full"
      >
        <LayersControl position="topright">
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

        {/* Map click listener — disabled for Beneficiary read-only view */}
        <MapClickHandler onMapClick={addPoint} enabled={clickEnabled} />

        {/* LAYER 1 — Land Plots (green unaffected, RED affected) */}
        {landPlotFC.features.length > 0 && (
          <GeoJSON
            key={`land-${landVersion}-${affectedPlots.length}-${selectedFeature?.kind}-${selectedFeature?.feature?.properties?.plotId}`}
            data={landPlotFC}
            style={getLandStyle}
            onEachFeature={bindLandFeature}
          />
        )}

        {/* LAYER 2 — Multi-Point Centerline Polyline */}
        {polylineCoords.length >= 2 && (
          <Polyline
            positions={polylineCoords}
            pathOptions={{ color: '#60a5fa', weight: 3, dashArray: '8 6', opacity: 0.9 }}
          />
        )}

        {/* LAYER 3 — Corridor Buffer Polygon (Blue semi-transparent overlay) */}
        {bridgeBuffer && (
          <GeoJSON
            key={`buffer-${bufferVersion}`}
            data={bridgeBuffer}
            style={() => STYLE.buffer}
            onEachFeature={(_, layer) => {
              layer.bindPopup(
                `<div style="font-size:12px;font-family:sans-serif">
                  <strong style="color:#60a5fa">Infrastructure Corridor Alignment</strong>
                  <div style="color:#94a3b8;margin-top:4px">Width: ${bufferWidthMeters} m</div>
                  <div style="color:#34d399;font-weight:600;margin-top:2px">
                    ${affectedPlots.length} plots · ${affectedBuildings.length} buildings hit
                  </div>
                </div>`
              );
            }}
          />
        )}

        {/* LAYER 4 — Building Footprints (grey unaffected, YELLOW affected) — Top z-index */}
        {buildingFC.features.length > 0 && (
          <GeoJSON
            key={`bldg-${buildingVersion}-${affectedBuildings.length}-${selectedFeature?.kind}-${selectedFeature?.feature?.properties?.plotId}`}
            data={buildingFC}
            style={getBuildingStyle}
            onEachFeature={bindBuildingFeature}
          />
        )}

        {/* Sequential Vertex Markers (P1, P2, ... Pn) */}
        {points.map((pt, idx) => (
          <Marker
            key={`pt-${pt.lat}-${pt.lng}-${idx}`}
            position={[pt.lat, pt.lng]}
            icon={createVertexIcon(idx, points.length)}
          >
            <Popup>
              <div style={{ fontSize: 11, fontFamily: 'sans-serif' }}>
                <strong style={{ color: idx === 0 ? '#059669' : '#2563eb' }}>
                  Vertex P{idx + 1}
                </strong>
                <div style={{ fontFamily: 'monospace', color: '#94a3b8', marginTop: 2 }}>
                  {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                </div>
                <button
                  type="button"
                  onClick={() => removePoint(idx)}
                  style={{
                    marginTop: 6,
                    padding: '2px 8px',
                    fontSize: 10,
                    borderRadius: 4,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Delete Vertex
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapCameraController resetTrigger={resetCount} />
      </LeafletMap>

      {/* Layer Legend (bottom-right) */}
      <div className="absolute bottom-8 right-6 z-20 rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-md p-3.5 shadow-xl shadow-black/40 text-xs">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <Layers className="w-3 h-3" /> Layer Legend
        </div>
        <div className="space-y-1.5">
          {[
            { color: '#10b981', label: 'Land Plot (Unaffected)' },
            { color: '#FF4136', label: 'Land Plot (Affected — Red)' },
            { color: '#6b7280', label: 'Building Footprint (Unaffected)' },
            { color: '#FFD700', label: 'Building Footprint (Affected — Yellow)' },
            { color: '#3b82f6', opacity: 0.5, label: 'Corridor Buffer' }
          ].map(({ color, opacity = 1, label }) => (
            <div key={label} className="flex items-center gap-2 text-slate-300">
              <span className="w-4 h-3.5 rounded-sm shrink-0" style={{ background: color, opacity }} />
              {label}
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> P1 Start
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-teal-500 inline-block" /> Pn Vertices
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
