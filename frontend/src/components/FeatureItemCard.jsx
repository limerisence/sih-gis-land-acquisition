import React from 'react';
import { Building2, Home, Trees, Eye, MapPin, ExternalLink, Navigation, Clock } from 'lucide-react';
import * as turf from '@turf/turf';
import { isLandPlot, useGIS } from '../context/GISContext';

export default function FeatureItemCard({ feature }) {
  const {
    selectedFeature,
    focusOnFeature,
    inspectFeature,
    affectedPlotIds,
    affectedBuildingIds
  } = useGIS();

  const p = feature.properties || {};
  const isPlot = isLandPlot(feature);
  const isAffected = isPlot
    ? affectedPlotIds.has(p.plotId)
    : affectedBuildingIds.has(p.plotId);
  const isSelected = selectedFeature?.feature?.properties?.plotId === p.plotId;

  // Area in sq km and sq meters
  const areaSqM = p.landAreaSqM || 0;
  const areaSqKm = p.landAreaSqKm !== undefined
    ? Number(p.landAreaSqKm).toFixed(6)
    : (areaSqM / 1_000_000).toFixed(6);

  // Derive coordinates (centroid)
  let lat = p.coordinates?.lat;
  let lng = p.coordinates?.lng;
  if (!lat || !lng) {
    try {
      const c = turf.centroid(feature);
      lng = Number(c.geometry.coordinates[0].toFixed(5));
      lat = Number(c.geometry.coordinates[1].toFixed(5));
    } catch (_) {
      lat = 22.5726;
      lng = 88.3639;
    }
  }

  // Address
  const address = p.address || p.name || `Location: ${lat}° N, ${lng}° E, West Bengal`;

  const CategoryIcon = ({ cat }) => {
    if (cat === 'Commercial') return <Building2 className="w-3 h-3 shrink-0" />;
    if (cat === 'Agricultural') return <Trees className="w-3 h-3 shrink-0" />;
    if (cat === 'Residential') return <Home className="w-3 h-3 shrink-0" />;
    return <Clock className="w-3 h-3 shrink-0 text-amber-600" />;
  };

  const getBadgeStyle = (cat) => {
    if (cat === 'Commercial') return 'bg-purple-50 text-purple-700 border-purple-200/60';
    if (cat === 'Agricultural') return 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
    if (cat === 'Residential') return 'bg-blue-50 text-blue-700 border-blue-200/60';
    return 'bg-amber-50 text-amber-700 border-amber-200/60';
  };

  return (
    <div
      onClick={() => focusOnFeature(feature, isPlot ? 'plot' : 'building', 17)}
      className={`p-3.5 rounded-xl cursor-pointer transition-all border group relative ${
        isSelected
          ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-100 shadow-sm'
          : isAffected
          ? 'border-rose-200/80 bg-rose-50/20 hover:border-rose-300 hover:shadow-xs'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
      }`}
    >
      {/* Top row: Plot ID, Khasra, Category, HIT */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`font-bold text-xs font-mono ${isAffected ? 'text-rose-600' : 'text-slate-900'}`}>
              {p.plotId}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {p.khasraNo ? `Khasra ${p.khasraNo}` : 'Record Pending'}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border flex items-center gap-1 ${getBadgeStyle(p.landCategory)}`}>
              <CategoryIcon cat={p.landCategory} />
              {p.landCategory || 'Pending Survey'}
            </span>
            {!isPlot && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-amber-50 text-amber-800 border border-amber-200/60">
                Bldg
              </span>
            )}
          </div>
          <div className="text-xs font-medium text-slate-700 truncate">
            {p.ownerName || 'Owner Record Pending Survey'}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isAffected && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
              HIT
            </span>
          )}
          <button
            type="button"
            title="Inspect Details"
            onClick={(e) => {
              e.stopPropagation();
              inspectFeature(feature, isPlot ? 'plot' : 'building');
            }}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Address Row for Surveyor Field Visit */}
      <div className="mt-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
        <span className="leading-snug text-slate-600">{address}</span>
      </div>

      {/* GPS Coordinates & Field Nav */}
      <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 px-0.5">
        <span className="flex items-center gap-1">
          <Navigation className="w-3 h-3 text-slate-400" />
          {lat?.toFixed(5)}, {lng?.toFixed(5)}
        </span>
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-0.5 hover:underline font-sans text-xs font-medium"
        >
          Survey Map <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      {/* Area in sq km & sq meters */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">Plot Footprint:</span>
        <div className="text-right">
          <span className="font-bold text-slate-900 font-mono">
            {areaSqKm} sq km
          </span>
          <span className="text-[11px] text-slate-500 ml-1">
            ({areaSqM.toLocaleString()} m²)
          </span>
        </div>
      </div>
    </div>
  );
}
