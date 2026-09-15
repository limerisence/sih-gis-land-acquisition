import React from 'react';
import { Building2, Home, Trees, Eye, MapPin, ExternalLink, Navigation } from 'lucide-react';
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

  const accentColor = isPlot ? '#FF4136' : '#FFD700';

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
    return <Home className="w-3 h-3 shrink-0" />;
  };

  return (
    <div
      onClick={() => focusOnFeature(feature, isPlot ? 'plot' : 'building', 17)}
      className="p-3 rounded-xl cursor-pointer transition-all border group relative hover:border-slate-600"
      style={
        isSelected
          ? { borderColor: '#34d399', background: 'rgba(52,211,153,.08)' }
          : isAffected
            ? { borderColor: accentColor + '55', background: accentColor + '08' }
            : { borderColor: '#1e293b', background: 'transparent' }
      }
    >
      {/* Top row: Plot ID, Khasra, Category, HIT */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span
              className="font-bold text-xs font-mono"
              style={{ color: isAffected ? accentColor : '#e2e8f0' }}
            >
              {p.plotId}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {p.khasraNo || 'N/A'}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1"
              style={{
                background:
                  p.landCategory === 'Commercial'
                    ? 'rgba(168,85,247,.18)'
                    : p.landCategory === 'Agricultural'
                      ? 'rgba(245,158,11,.18)'
                      : 'rgba(59,130,246,.18)',
                color:
                  p.landCategory === 'Commercial'
                    ? '#c084fc'
                    : p.landCategory === 'Agricultural'
                      ? '#fbbf24'
                      : '#93c5fd'
              }}
            >
              <CategoryIcon cat={p.landCategory} />
              {p.landCategory || 'Residential'}
            </span>
            {!isPlot && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'rgba(255,215,0,.15)', color: '#FFD700' }}
              >
                Bldg
              </span>
            )}
          </div>
          <div className="text-xs font-medium text-slate-300 truncate">
            {p.ownerName || 'Unknown Title'}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isAffected && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: accentColor + '22',
                color: accentColor,
                border: `1px solid ${accentColor}50`
              }}
            >
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
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Address Row for Surveyor Field Visit */}
      <div className="mt-2 p-1.5 px-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
        <span className="leading-tight text-slate-200">{address}</span>
      </div>

      {/* GPS Coordinates & Field Nav */}
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
        <span className="flex items-center gap-1">
          <Navigation className="w-2.5 h-2.5 text-sky-400" />
          {lat?.toFixed(5)}, {lng?.toFixed(5)}
        </span>
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sky-400 hover:text-sky-300 flex items-center gap-0.5 hover:underline font-sans"
        >
          Survey Map <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      {/* Area in sq km & sq meters (cost discarded) */}
      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Plot Footprint:</span>
        <div className="text-right">
          <span className="font-bold text-emerald-400 font-mono">
            {areaSqKm} sq km
          </span>
          <span className="text-[10px] text-slate-400 ml-1">
            ({areaSqM.toLocaleString()} m²)
          </span>
        </div>
      </div>
    </div>
  );
}
