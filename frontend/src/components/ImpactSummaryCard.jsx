import React from 'react';
import { AlertTriangle, Route, Ruler, Coins } from 'lucide-react';
import { useGIS } from '../context/GISContext';

export default function ImpactSummaryCard() {
  const {
    summary,
    affectedPlots,
    affectedBuildings,
    formatINR,
    bufferWidthMeters
  } = useGIS();

  if (!summary) return null;

  const lengthKm = summary.totalLengthKm ?? 0;
  const lengthMeters = summary.totalLengthMeters ?? Math.round(lengthKm * 1000);
  const areaHa = ((summary.totalAreaSqM || 0) / 10000).toFixed(2);

  return (
    <div className="p-4 border-b border-slate-800 bg-slate-950/60 shrink-0 space-y-2.5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Statutory Acquisition Impact
        </span>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
          style={{
            background: 'rgba(239,68,68,.15)',
            color: '#fca5a5',
            borderColor: 'rgba(239,68,68,.3)'
          }}
        >
          {summary.totalPlots} Total Features Hit
        </span>
      </div>

      {/* Alignment Distance & Buffer Banner */}
      <div className="p-2.5 rounded-xl border border-blue-900/40 bg-blue-950/20 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-blue-300">
          <Route className="w-4 h-4 text-blue-400 shrink-0" />
          <div>
            <div className="font-semibold text-[11px]">Corridor Alignment</div>
            <div className="text-[10px] text-slate-400">
              {lengthKm > 0 ? `${lengthKm} km (${lengthMeters.toLocaleString()} m)` : 'Calculated Corridor'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Buffer: {bufferWidthMeters}m
          </span>
        </div>
      </div>

      {/* Dual Breakdown: Land Plots vs Buildings */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className="p-2.5 rounded-xl border text-xs"
          style={{
            background: 'rgba(255,65,54,.08)',
            borderColor: 'rgba(255,65,54,.25)'
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider font-bold mb-0.5"
            style={{ color: '#FF4136' }}
          >
            Land Plots
          </div>
          <div className="text-xl font-black text-white">{affectedPlots.length}</div>
          <div className="text-[10px] text-slate-400">parcels intersected</div>
        </div>

        <div
          className="p-2.5 rounded-xl border text-xs"
          style={{
            background: 'rgba(255,215,0,.08)',
            borderColor: 'rgba(255,215,0,.25)'
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider font-bold mb-0.5"
            style={{ color: '#FFD700' }}
          >
            Buildings
          </div>
          <div className="text-xl font-black text-white">{affectedBuildings.length}</div>
          <div className="text-[10px] text-slate-400">structures intersected</div>
        </div>
      </div>

      {/* Land Area in sq km and m² (Cost estimation discarded as requested) */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block flex items-center gap-1">
            <Ruler className="w-3 h-3 text-emerald-400" /> Area (sq km)
          </span>
          <div className="text-sm font-bold text-emerald-400 mt-0.5 font-mono">
            {((summary.totalAreaSqM || 0) / 1_000_000).toFixed(4)} sq km
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Corridor surface</span>
        </div>

        <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block flex items-center gap-1">
            <Ruler className="w-3 h-3 text-sky-400" /> Metric Area
          </span>
          <div className="text-sm font-bold text-white mt-0.5">
            {(summary.totalAreaSqM || 0).toLocaleString()} m²
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">{areaHa} Ha</span>
        </div>
      </div>
    </div>
  );
}
