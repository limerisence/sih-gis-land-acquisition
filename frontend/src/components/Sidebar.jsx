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
      className="absolute top-4 left-4 z-20 w-88 sm:w-96 max-h-[calc(100vh-5.5rem)] flex flex-col rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md overflow-hidden text-slate-800"
    >
      {/* Panel Header - Sticky Top */}
      <div className="p-3.5 px-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-sm text-slate-900">Corridor & Alignment</h2>
        </div>
        <button
          type="button"
          onClick={resetAll}
          className="p-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      {/* Live Data source indicator */}
      {dataSource && (
        <div
          className={`px-4 py-1.5 border-b flex items-center gap-2 text-xs font-medium shrink-0 ${
            dataSource === 'overpass'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {dataSource === 'overpass' ? (
            <Wifi className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 shrink-0 text-rose-600" />
          )}
          <span className="truncate">
            {dataSource === 'overpass'
              ? `Live Overpass API — ${allFeatures.length} OSM features in area`
              : 'Overpass unavailable — retry to fetch real plot data'}
          </span>
        </div>
      )}

      {/* Smoothly Scrollable Main Body for all sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 bg-white">
        {/* Alignment inputs & vertex coordinates */}
        <CoordinateInputPanel />

        {/* Impact Summary Analytics */}
        <ImpactSummaryCard />

        {/* Highlighted Affected Plots & Buildings List */}
        <FeatureList />
      </div>
    </aside>
  );
}
