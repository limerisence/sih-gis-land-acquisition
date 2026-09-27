import React from 'react';
import { AlertTriangle, Route, Ruler, Layers } from 'lucide-react';
import { useGIS } from '../context/GISContext';

export default function ImpactSummaryCard() {
  const {
    summary,
    affectedPlots,
    bufferWidthMeters
  } = useGIS();

  if (!summary) return null;

  const lengthKm = summary.totalLengthKm ?? 0;
  const lengthMeters = summary.totalLengthMeters ?? Math.round(lengthKm * 1000);
  const totalSqM = summary.totalAreaSqM || 0;
  const areaHa = (totalSqM / 10000).toFixed(2);
  const areaAcres = (totalSqM / 4046.856).toFixed(2);
  const areaSqKm = ((totalSqM) / 1_000_000).toFixed(4);

  return (
    <div className="p-4 border-b border-slate-100 bg-white shrink-0 space-y-2.5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Cadastral Impact Dossier
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
          {affectedPlots.length} Parcels Intersected
        </span>
      </div>

      {/* Alignment Distance & Buffer Banner */}
      <div className="p-2.5 rounded-xl border border-blue-100 bg-blue-50/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <Route className="w-4 h-4 text-blue-600 shrink-0" />
          <div>
            <div className="font-semibold text-slate-900">Corridor Alignment</div>
            <div className="text-[11px] text-slate-500">
              {lengthKm > 0 ? `${lengthKm} km (${lengthMeters.toLocaleString()} m)` : 'Calculated Corridor'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            Buffer: {bufferWidthMeters}m
          </span>
        </div>
      </div>

      {/* Cadastral Parcels & Surface Overview */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl border border-rose-200/60 bg-rose-50/40 text-xs">
          <div className="text-[10px] uppercase tracking-wider font-bold mb-0.5 text-rose-700 flex items-center gap-1">
            <Layers className="w-3 h-3 text-rose-600" /> Affected Parcels
          </div>
          <div className="text-xl font-bold text-slate-900">{affectedPlots.length}</div>
          <div className="text-[11px] text-slate-500">continuous cadastre</div>
        </div>

        <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
          <div className="text-[10px] uppercase tracking-wider font-bold mb-0.5 text-slate-600 flex items-center gap-1">
            <Ruler className="w-3 h-3 text-slate-500" /> Total Acres
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono">{areaAcres}</div>
          <div className="text-[11px] text-slate-500">{areaHa} Hectares</div>
        </div>
      </div>

      {/* Metric Area Breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block flex items-center gap-1">
            <Ruler className="w-3 h-3 text-slate-500" /> Surface (sq km)
          </span>
          <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
            {areaSqKm} sq km
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Corridor envelope</span>
        </div>

        <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block flex items-center gap-1">
            <Ruler className="w-3 h-3 text-slate-500" /> Surface (m²)
          </span>
          <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
            {totalSqM.toLocaleString()} m²
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Cadastral area</span>
        </div>
      </div>
    </div>
  );
}
