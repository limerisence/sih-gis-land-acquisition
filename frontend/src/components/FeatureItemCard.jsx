import React from 'react';
import { Home, Trees, Eye, MapPin, ExternalLink, Navigation, Clock, Building2 } from 'lucide-react';
import * as turf from '@turf/turf';
import { useGIS } from '../context/GISContext';

export default function FeatureItemCard({ feature }) {
  const {
    selectedFeature,
    focusOnFeature,
    inspectFeature,
    affectedPlotIds
  } = useGIS();

  const p = feature.properties || {};
  const isAffected = affectedPlotIds.has(p.plotId);
  const isSelected = selectedFeature?.feature?.properties?.plotId === p.plotId;

  // Real-time centroid coordinates via turf.centroid
  let lat = p.coordinates?.lat;
  let lng = p.coordinates?.lng;
  try {
    const c = turf.centroid(feature);
    if (c?.geometry?.coordinates) {
      lng = Number(c.geometry.coordinates[0].toFixed(5));
      lat = Number(c.geometry.coordinates[1].toFixed(5));
    }
  } catch (_) {
    lat = lat || 22.5726;
    lng = lng || 88.3639;
  }

  // Intersected area vs total parcel area
  const intersectedSqM = p.intersectedAreaSqM || p.landAreaSqM || 0;
  const intersectedAcres = p.intersectedAcres || Number((intersectedSqM / 4046.856).toFixed(3));
  const totalSqM = p.landAreaSqM || intersectedSqM;
  const totalSqKm = ((totalSqM) / 1_000_000).toFixed(4);

  // Address
  const address = p.address || p.name || `Cadastral Plot at ${lat}° N, ${lng}° E, West Bengal`;

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

  // Check plot status
  let isApproved = p.status === 'Approved' || p.officerStatus === 'Approved';
  let isRejected = p.status === 'Rejected' || p.officerStatus === 'Rejected';
  let isReview = p.status === 'Under Review' || p.officerStatus === 'Under Review';
  try {
    const tasks = JSON.parse(localStorage.getItem('bhoomi_survey_tasks') || '[]');
    const task = tasks.find((t) => t.plotId === p.plotId || t.id === p.plotId);
    const st = task?.officerStatus || task?.status;
    if (st === 'Approved') { isApproved = true; isRejected = false; isReview = false; }
    else if (st === 'Rejected') { isApproved = false; isRejected = true; isReview = false; }
    else if (st === 'Under Review') { isApproved = false; isRejected = false; isReview = true; }
  } catch (_) {}

  const cardBorder = isApproved
    ? 'border-2 border-emerald-500 bg-emerald-50/20 ring-2 ring-emerald-100 shadow-sm'
    : isRejected
    ? 'border-2 border-rose-500 bg-rose-50/25 ring-2 ring-rose-100 shadow-sm'
    : isReview
    ? 'border-2 border-amber-400 bg-amber-50/25 ring-2 ring-amber-100 shadow-sm'
    : isSelected
    ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-100 shadow-sm'
    : isAffected
    ? 'border-rose-200/80 bg-rose-50/20 hover:border-rose-300 hover:shadow-xs'
    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs';

  return (
    <div
      onClick={() => focusOnFeature(feature, 'plot', 17)}
      className={`p-3.5 rounded-xl cursor-pointer transition-all border group relative ${cardBorder}`}
    >
      {/* Top row: Plot ID, Khasra/Dag No, Category, HIT */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`font-bold text-xs font-mono ${isApproved ? 'text-emerald-700' : isRejected ? 'text-rose-700' : isReview ? 'text-amber-700' : isAffected ? 'text-rose-600' : 'text-slate-900'}`}>
              {p.plotId}
            </span>
            <span className="text-[11px] text-slate-600 font-mono font-semibold">
              / {p.khasraNo || 'Dag Pending'}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border flex items-center gap-1 ${getBadgeStyle(p.landCategory)}`}>
              <CategoryIcon cat={p.landCategory} />
              {p.landCategory || 'Pending Survey'}
            </span>
            {isApproved && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                APPROVED
              </span>
            )}
            {isRejected && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-rose-100 text-rose-800 border border-rose-300">
                REJECTED
              </span>
            )}
            {isReview && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800 border border-amber-300">
                UNDER REVIEW
              </span>
            )}
            {p.isSyntheticCadastre && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                Cadastral Grid
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
              inspectFeature(feature, 'plot');
            }}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Address Row with real reverse geocoded street/zone info */}
      <div className="mt-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
        <span className="leading-snug text-slate-600 line-clamp-2">{address}</span>
      </div>

      {/* Real-time Centroid Coordinates & Survey Map link */}
      <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 px-0.5">
        <span className="flex items-center gap-1">
          <Navigation className="w-3 h-3 text-slate-400" />
          {lat}° N, {lng}° E
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

      {/* Intersected Area in Sq Meters & Acres */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
        <div>
          <span className="text-[10px] uppercase font-bold text-rose-600 block">
            Intersected Area
          </span>
          <span className="font-bold text-slate-900 font-mono">
            {intersectedSqM.toLocaleString()} m²
          </span>
          <span className="text-[11px] text-slate-500 font-medium ml-1">
            ({intersectedAcres} Ac)
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block">
            Total Parcel
          </span>
          <span className="text-xs text-slate-600 font-mono">
            {totalSqKm} sq km
          </span>
        </div>
      </div>
    </div>
  );
}
