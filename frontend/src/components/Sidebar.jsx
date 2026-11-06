import React from 'react';
import { Sliders, RotateCcw, Wifi, RefreshCw, Layers } from 'lucide-react';
import { useGIS } from '../context/GISContext';
import CoordinateInputPanel from './CoordinateInputPanel';
import ImpactSummaryCard from './ImpactSummaryCard';
import FeatureList from './FeatureList';

export default function Sidebar() {
  const {
    resetAll,
    dataSource,
    allFeatures,
    runAnalysis,
    isLoading
  } = useGIS();

  return (
    <aside
      aria-label="Corridor & Acquisition Engine"
      className="absolute top-4 left-4 z-20 w-88 sm:w-96 max-h-[calc(100vh-5.5rem)] flex flex-col rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md overflow-hidden text-slate-800"
    >
      {/* Panel Header */}
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

      {/* Live Data Source / Cadastral Grid Status Banner */}
      {dataSource && (
        <div
          className={`px-4 py-2 border-b flex items-center justify-between text-xs font-medium shrink-0 ${
            dataSource === 'overpass'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2 truncate min-w-0">
            {dataSource === 'overpass' ? (
              <Wifi className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            ) : (
              <Layers className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            )}
            <div className="truncate">
              {dataSource === 'overpass' ? (
                <span>
                  <strong className="font-semibold">Live Overpass API</strong> — {allFeatures.length} OSM features
                </span>
              ) : (
                <span>
                  <strong className="font-semibold">Cadastral Grid Active</strong>
                  <span className="text-[11px] text-amber-700 ml-1 font-normal hidden sm:inline">(Continuous 50m parcels)</span>
                </span>
              )}
            </div>
          </div>

          {/* 1-Click Retry Button */}
          {dataSource !== 'overpass' && (
            <button
              type="button"
              onClick={() => runAnalysis()}
              disabled={isLoading}
              title="Retry fetching live OpenStreetMap features"
              className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 font-semibold text-[11px] flex items-center gap-1 shrink-0 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Retrying…' : 'Retry OSM'}</span>
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 bg-white">
        <CoordinateInputPanel />
        <ImpactSummaryCard />
        <FeatureList />
      </div>
    </aside>
  );
}
