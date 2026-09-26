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

  const address = p.address || p.name || `Khasra ${p.khasraNo || 'N/A'}, West Bengal`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 px-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200">
              {isPlot ? <Trees className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 font-mono">{p.plotId}</h3>
                {isAffected ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/60">
                    Affected by Corridor
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    Clear (Unaffected)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono">Khasra / Dag: {p.khasraNo || 'Record Pending'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Surveyor Field Location Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="text-[10px] uppercase font-bold text-blue-600 tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" /> Surveyor Field Location
            </div>
            <div className="text-sm font-semibold text-slate-800 leading-snug">{address}</div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-mono flex items-center gap-1">
                <Navigation className="w-3 h-3 text-slate-400" />
                Lat: {lat?.toFixed(6)}, Lng: {lng?.toFixed(6)}
              </span>
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-white text-blue-600 hover:bg-slate-50 border border-slate-200 font-medium flex items-center gap-1 transition-colors"
              >
                Open in Maps <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Area Footprint Box */}
          <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/50 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-blue-700 tracking-wider flex items-center gap-1.5">
                <Ruler className="w-3 h-3 text-blue-600" /> Affected Surface Area
              </div>
              <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
                {areaSqKm} sq km
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {areaSqM.toLocaleString()} m² · {areaHa} Hectares
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-semibold px-2 py-1 rounded bg-white text-slate-600 border border-slate-200">
                Ground Metric
              </span>
            </div>
          </div>

          {/* Details Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            <div className="p-3 flex justify-between">
              <span className="text-slate-500">Feature Type</span>
              <span className="font-semibold text-slate-800">
                {isPlot ? 'Land Parcel' : `Building Footprint (${p.buildingType || 'structure'})`}
              </span>
            </div>
            <div className="p-3 flex justify-between">
              <span className="text-slate-500">Registered Title / Owner</span>
              <span className="font-semibold text-slate-800 text-right">{p.ownerName || 'Record Pending Survey'}</span>
            </div>
            <div className="p-3 flex justify-between">
              <span className="text-slate-500">Land Classification</span>
              <span className="font-semibold text-slate-800">{p.landCategory || 'Pending Survey'}</span>
            </div>
            <div className="p-3 flex justify-between">
              <span className="text-slate-500">OSM Feature Identifier</span>
              <span className="font-mono text-slate-700 flex items-center gap-1">
                {p.osmId || 'N/A'}
              </span>
            </div>
            {p.landuseType && (
              <div className="p-3 flex justify-between">
                <span className="text-slate-500">OSM Landuse Tag</span>
                <span className="font-mono text-slate-700">{p.landuseType}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-5 border-t border-slate-200 bg-slate-50/50 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
