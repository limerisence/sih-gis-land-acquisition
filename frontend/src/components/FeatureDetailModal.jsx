import React from 'react';
import { X, Building2, Trees, MapPin, Navigation, ExternalLink, Ruler } from 'lucide-react';
import * as turf from '@turf/turf';
import { useGIS, isLandPlot } from '../context/GISContext';

export default function FeatureDetailModal() {
  const {
    isModalOpen,
    setIsModalOpen,
    selectedFeature,
    affectedPlotIds,
    affectedBuildingIds
  } = useGIS();

  if (!isModalOpen || !selectedFeature?.feature) return null;

  const f = selectedFeature.feature;
  const p = f.properties || {};
  const isPlot = isLandPlot(f);
  const isAffected = isPlot
    ? affectedPlotIds.has(p.plotId)
    : affectedBuildingIds.has(p.plotId);

  const areaSqM = p.landAreaSqM || 0;
  const areaSqKm = p.landAreaSqKm !== undefined
    ? Number(p.landAreaSqKm).toFixed(6)
    : (areaSqM / 1_000_000).toFixed(6);
  const areaHa = (areaSqM / 10000).toFixed(4);
  const accentColor = isPlot ? '#FF4136' : '#FFD700';

  // Centroid coordinates
  let lat = p.coordinates?.lat;
  let lng = p.coordinates?.lng;
  if (!lat || !lng) {
    try {
      const c = turf.centroid(f);
      lng = Number(c.geometry.coordinates[0].toFixed(5));
      lat = Number(c.geometry.coordinates[1].toFixed(5));
    } catch (_) {
      lat = 22.5726;
      lng = 88.3639;
    }
  }

  const address = p.address || p.name || `Khasra ${p.khasraNo || 'N/A'}, Kolkata, West Bengal`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold"
              style={{ background: accentColor + '20', color: accentColor }}
            >
              {isPlot ? <Trees className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-mono">{p.plotId}</h3>
                {isAffected ? (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    style={{ background: accentColor + '25', color: accentColor, border: `1px solid ${accentColor}50` }}
                  >
                    Affected by Corridor
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Clear (Unaffected)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Khasra / Dag: {p.khasraNo || 'N/A'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Surveyor Field Location Card */}
          <div className="p-3.5 rounded-xl border border-slate-700 bg-slate-950/80 space-y-2">
            <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Surveyor Field Location
            </div>
            <div className="text-sm font-semibold text-white leading-snug">{address}</div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-mono flex items-center gap-1">
                <Navigation className="w-3 h-3 text-sky-400" />
                Lat: {lat?.toFixed(6)}, Lng: {lng?.toFixed(6)}
              </span>
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30 font-medium flex items-center gap-1 transition-colors"
              >
                Open in Google Maps <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Area Footprint Box */}
          <div className="p-3.5 rounded-xl border border-emerald-900/40 bg-emerald-950/20 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Ruler className="w-3 h-3" /> Affected Surface Area
              </div>
              <div className="text-xl font-black text-emerald-300 mt-0.5 font-mono">
                {areaSqKm} sq km
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {areaSqM.toLocaleString()} m² · {areaHa} Hectares
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-semibold px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Ground Metric
              </span>
            </div>
          </div>

          {/* Details Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden divide-y divide-slate-800/80">
            <div className="p-2.5 flex justify-between">
              <span className="text-slate-400">Feature Type</span>
              <span className="font-semibold text-slate-200">
                {isPlot ? 'Land Parcel' : `Building Footprint (${p.buildingType || 'structure'})`}
              </span>
            </div>
            <div className="p-2.5 flex justify-between">
              <span className="text-slate-400">Registered Title / Owner</span>
              <span className="font-semibold text-slate-200 text-right">{p.ownerName || 'Unknown Title'}</span>
            </div>
            <div className="p-2.5 flex justify-between">
              <span className="text-slate-400">Land Classification</span>
              <span className="font-semibold text-slate-200">{p.landCategory || 'Residential'}</span>
            </div>
            <div className="p-2.5 flex justify-between">
              <span className="text-slate-400">OSM Feature Identifier</span>
              <span className="font-mono text-slate-300 flex items-center gap-1">
                {p.osmId || 'N/A'}
              </span>
            </div>
            {p.landuseType && (
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-400">OSM Landuse Tag</span>
                <span className="font-mono text-slate-300">{p.landuseType}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
