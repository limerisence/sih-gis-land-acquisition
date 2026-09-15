import React, { useState, useMemo } from 'react';
import { Search, CheckCircle2, Building2, Trees, MapPin } from 'lucide-react';
import { useGIS, isLandPlot } from '../context/GISContext';
import FeatureItemCard from './FeatureItemCard';

export default function FeatureList() {
  const {
    isCalculated,
    affectedPlots,
    affectedBuildings,
    allFeatures
  } = useGIS();

  const [activeTab, setActiveTab] = useState('plots'); // 'plots' | 'buildings'
  const [searchQuery, setSearchQuery] = useState('');

  // Choose list source
  const rawList = isCalculated
    ? activeTab === 'plots'
      ? affectedPlots
      : affectedBuildings
    : allFeatures.filter((f) => (activeTab === 'plots' ? isLandPlot(f) : !isLandPlot(f)));

  // Total area in sq km for current active tab
  const totalTabAreaSqM = useMemo(() => {
    return rawList.reduce((acc, f) => acc + (f.properties?.landAreaSqM || 0), 0);
  }, [rawList]);

  const totalTabAreaSqKm = (totalTabAreaSqM / 1_000_000).toFixed(4);

  // Filter by search query
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawList;
    return rawList.filter((f) => {
      const p = f.properties || {};
      const plotId = String(p.plotId || '').toLowerCase();
      const khasra = String(p.khasraNo || '').toLowerCase();
      const owner = String(p.ownerName || '').toLowerCase();
      const address = String(p.address || '').toLowerCase();
      return (
        plotId.includes(q) ||
        khasra.includes(q) ||
        owner.includes(q) ||
        address.includes(q)
      );
    });
  }, [rawList, searchQuery]);

  return (
    <div className="flex flex-col">
      {/* Sub-tabs: Land Plots vs Buildings */}
      <div className="sticky top-0 z-10 flex shrink-0 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTab('plots')}
          className="flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border-b-2 cursor-pointer"
          style={{
            borderBottomColor: activeTab === 'plots' ? '#FF4136' : 'transparent',
            color: activeTab === 'plots' ? '#FF4136' : '#94a3b8',
            background: activeTab === 'plots' ? 'rgba(255,65,54,0.08)' : 'transparent'
          }}
        >
          <Trees className="w-3.5 h-3.5" />
          <span>
            Land Plots ({isCalculated ? affectedPlots.length : allFeatures.filter(isLandPlot).length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('buildings')}
          className="flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border-b-2 cursor-pointer"
          style={{
            borderBottomColor: activeTab === 'buildings' ? '#FFD700' : 'transparent',
            color: activeTab === 'buildings' ? '#FFD700' : '#94a3b8',
            background: activeTab === 'buildings' ? 'rgba(255,215,0,0.08)' : 'transparent'
          }}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>
            Buildings ({isCalculated ? affectedBuildings.length : allFeatures.filter((f) => !isLandPlot(f)).length})
          </span>
        </button>
      </div>

      {/* Surveyor Inspection Header Bar */}
      <div className="p-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between text-[11px]">
        <span className="text-slate-400 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-emerald-400" />
          Surveyor Field Dossier:
        </span>
        <span className="font-mono text-emerald-300 font-bold">
          {totalTabAreaSqKm} sq km total
        </span>
      </div>

      {/* Search Bar */}
      <div className="p-2.5 border-b border-slate-800/80 bg-slate-900/60">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search Plot ID, Khasra, Address, Owner…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* List content */}
      <div className="p-3 space-y-2.5">
        {!isCalculated && filteredList.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-400 rounded-xl border border-slate-800/80 bg-slate-950/40">
            <MapPin className="w-7 h-7 text-emerald-400/70 mx-auto mb-2" />
            <p className="font-medium text-slate-300">No plots loaded</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Click at least 2 points on the map and click <span className="text-emerald-400 font-semibold">Run Corridor Analysis</span> to fetch live OSM features.
            </p>
          </div>
        )}

        {isCalculated && filteredList.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-400 rounded-xl border border-slate-800 bg-slate-950/40">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
            No {activeTab === 'plots' ? 'land plots' : 'buildings'} intersect this corridor.
          </div>
        )}

        {filteredList.map((f, idx) => (
          <FeatureItemCard
            key={f.properties?.plotId ? `${f.properties.plotId}-${idx}` : (f.id ? `${f.id}-${idx}` : idx)}
            feature={f}
          />
        ))}
      </div>
    </div>
  );
}
