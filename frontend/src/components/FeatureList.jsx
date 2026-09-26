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
    <div className="flex flex-col bg-white">
      {/* Sub-tabs: Land Plots vs Buildings */}
      <div className="sticky top-0 z-10 flex shrink-0 border-b border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setActiveTab('plots')}
          className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border-b-2 cursor-pointer ${
            activeTab === 'plots'
              ? 'border-blue-600 text-blue-700 bg-blue-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Trees className="w-3.5 h-3.5" />
          <span>
            Land Plots ({isCalculated ? affectedPlots.length : allFeatures.filter(isLandPlot).length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('buildings')}
          className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border-b-2 cursor-pointer ${
            activeTab === 'buildings'
              ? 'border-blue-600 text-blue-700 bg-blue-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>
            Buildings ({isCalculated ? affectedBuildings.length : allFeatures.filter((f) => !isLandPlot(f)).length})
          </span>
        </button>
      </div>

      {/* Surveyor Inspection Header Bar */}
      <div className="p-2.5 px-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500 flex items-center gap-1 font-medium">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          Surveyor Field Dossier:
        </span>
        <span className="font-mono text-slate-900 font-bold">
          {totalTabAreaSqKm} sq km
        </span>
      </div>

      {/* Search Bar */}
      <div className="p-2.5 border-b border-slate-100 bg-white">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search Plot ID, Khasra, Address, Owner…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
        </div>
      </div>

      {/* List content */}
      <div className="p-3 space-y-2.5">
        {!isCalculated && filteredList.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50/70">
            <MapPin className="w-7 h-7 text-blue-500/60 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No plots loaded</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Place at least 2 points along an alignment and click <span className="text-blue-600 font-semibold">Calculate Corridor Impact</span>.
            </p>
          </div>
        )}

        {isCalculated && filteredList.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50/70">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
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
