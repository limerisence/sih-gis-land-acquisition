import React from 'react';
import { Sliders, RotateCcw, Wifi, WifiOff } from 'lucide-react';
import { useGIS } from '../context/GISContext';
import CoordinateInputPanel from './CoordinateInputPanel';
import ImpactSummaryCard from './ImpactSummaryCard';
import FeatureList from './FeatureList';

export default function Sidebar() {
  const {
    resetAll,
    dataSource,
    allFeatures
  } = useGIS();

  return (
    <aside
      aria-label="Corridor & Acquisition Engine"
      className="absolute top-4 left-4 z-20 w-88 sm:w-96 max-h-[calc(100vh-4.5rem)] flex flex-col rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-2xl shadow-black/60 overflow-hidden"
    >
      {/* Panel Header - Sticky Top */}
      <div className="p-3.5 px-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <h2 className="font-bold text-sm text-white">Corridor & Acquisition Engine</h2>
        </div>
        <button
          type="button"
          onClick={resetAll}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      {/* Live Data source indicator */}
      {dataSource && (
        <div
          className={`px-4 py-1.5 border-b flex items-center gap-2 text-xs font-medium shrink-0 ${
            dataSource === 'overpass'
              ? 'bg-emerald-950/40 border-emerald-900/40 text-emerald-300'
              : 'bg-amber-950/40 border-amber-900/40 text-amber-300'
          }`}
        >
          {dataSource === 'overpass' ? (
            <Wifi className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          )}
          <span className="truncate">
            {dataSource === 'overpass'
              ? `Live Overpass API — ${allFeatures.length} OSM features in area`
              : 'Overpass unavailable — local cadastral fallback active'}
          </span>
        </div>
      )}

      {/* Smoothly Scrollable Main Body for all sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-800/80">
        {/* Alignment inputs & vertex coordinates */}
        <CoordinateInputPanel />

        {/* Impact Summary Analytics (without cost estimation) */}
        <ImpactSummaryCard />

        {/* Highlighted Affected Plots & Buildings List with address, GPS & sq km */}
        <FeatureList />
      </div>
    </aside>
  );
}
