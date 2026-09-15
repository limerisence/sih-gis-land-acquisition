import React, { useState } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  RotateCcw,
  ClipboardPaste,
  Route,
  Loader2,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { useGIS } from '../context/GISContext';

export default function CoordinateInputPanel() {
  const {
    points,
    addPoint,
    removePoint,
    removeLastPoint,
    clearPoints,
    setPoints,
    bufferWidthMeters,
    setBufferWidthMeters,
    runAnalysis,
    isLoading,
    loadingStage,
    showToast
  } = useGIS();

  // Manual point input fields
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  // Paste coordinates drawer state
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Handle manual coordinate submit
  const handleAddManualPoint = (e) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || isNaN(lng)) {
      showToast('Enter valid decimal latitude and longitude numbers.', 'error');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showToast('Coordinates out of range. Lat must be [-90, 90], Lng [-180, 180].', 'error');
      return;
    }

    addPoint({ lat, lng });
    setManualLat('');
    setManualLng('');
  };

  // Handle bulk coordinate paste
  const handlePasteSubmit = () => {
    if (!pasteText.trim()) {
      showToast('Paste coordinates first (JSON [[lat, lng], ...] or CSV).', 'error');
      return;
    }

    try {
      let parsed = [];
      const trimmed = pasteText.trim();

      if (trimmed.startsWith('[')) {
        // Parse as JSON: [[lat1, lng1], [lat2, lng2]] or [{lat, lng}]
        const rawJson = JSON.parse(trimmed);
        if (Array.isArray(rawJson)) {
          parsed = rawJson.map((item) => {
            if (Array.isArray(item) && item.length >= 2) {
              return { lat: parseFloat(item[0]), lng: parseFloat(item[1]) };
            }
            if (typeof item === 'object' && item !== null && 'lat' in item && 'lng' in item) {
              return { lat: parseFloat(item.lat), lng: parseFloat(item.lng) };
            }
            return null;
          }).filter(Boolean);
        }
      } else {
        // Parse line by line / CSV: "22.5685, 88.3595\n22.5710, 88.3650"
        const lines = trimmed.split(/[\r\n]+/);
        parsed = lines.map((line) => {
          const parts = line.split(/[,\t\s]+/).filter(Boolean);
          if (parts.length >= 2) {
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) {
              return { lat, lng };
            }
          }
          return null;
        }).filter(Boolean);
      }

      if (parsed.length < 2) {
        showToast('Found fewer than 2 valid coordinate pairs. Provide at least 2 points.', 'error');
        return;
      }

      setPoints(parsed);
      setIsPasteOpen(false);
      setPasteText('');
    } catch (err) {
      showToast(`Failed to parse coordinates: ${err.message}`, 'error');
    }
  };

  return (
    <div className="p-4 space-y-3.5 shrink-0 border-b border-slate-800">
      {/* Panel header with point counter & quick tools */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Alignment Vertices
          </span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {points.length} {points.length === 1 ? 'Point' : 'Points'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Remove Last Point"
            disabled={points.length === 0}
            onClick={removeLastPoint}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-colors cursor-pointer text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Paste Coordinates"
            onClick={() => setIsPasteOpen((prev) => !prev)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Clear All Points"
            disabled={points.length === 0}
            onClick={clearPoints}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-colors cursor-pointer text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Paste Coordinates drawer */}
      {isPasteOpen && (
        <div className="p-3 rounded-xl border border-slate-700 bg-slate-950/80 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span>Paste Coordinate Array</span>
            <button
              type="button"
              onClick={() => setIsPasteOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            Accepts JSON (e.g. <code className="text-emerald-400">[[22.568, 88.359], [22.571, 88.365]]</code>) or comma-separated pairs.
          </p>
          <textarea
            rows={3}
            placeholder="[[22.5685, 88.3595], [22.5718, 88.3655], [22.5752, 88.3725]]"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPasteOpen(false)}
              className="px-2.5 py-1 rounded-md text-[11px] bg-slate-800 text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePasteSubmit}
              className="px-3 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              Load Points
            </button>
          </div>
        </div>
      )}

      {/* Interactive Points List */}
      {points.length === 0 ? (
        <div className="p-3 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-400 bg-slate-950/30">
          <MapPin className="w-5 h-5 text-emerald-500/60 mx-auto mb-1" />
          Click anywhere on map to add vertex <span className="text-emerald-400 font-semibold">P1</span>, or enter manual coordinates below.
        </div>
      ) : (
        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
          {points.map((pt, idx) => (
            <div
              key={`${pt.lat}-${pt.lng}-${idx}`}
              className="flex items-center justify-between p-1.5 px-2.5 rounded-lg border border-slate-800 bg-slate-900 text-xs"
            >
              <div className="flex items-center gap-2 font-mono">
                <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white bg-emerald-600">
                  P{idx + 1}
                </span>
                <span className="text-slate-300 text-[11px]">
                  {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removePoint(idx)}
                className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                title="Delete this point"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Manual Coordinate Entry Form */}
      <form onSubmit={handleAddManualPoint} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              Latitude
            </label>
            <input
              type="text"
              placeholder="e.g. 22.5685"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              Longitude
            </label>
            <input
              type="text"
              placeholder="e.g. 88.3595"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Button right below the lat and long input spaces */}
        <button
          type="submit"
          className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-950/40 active:scale-[0.98]"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Add Pin to Map</span>
        </button>
      </form>

      {/* Buffer width slider & presets */}
      <div>
        <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
          <span>Corridor Buffer Width</span>
          <span className="text-emerald-400 font-mono font-bold">{bufferWidthMeters} m</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="5"
            max="500"
            value={bufferWidthMeters}
            onChange={(e) => setBufferWidthMeters(Number(e.target.value))}
            className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <span className="text-xs text-slate-400 self-center font-medium">Meters</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Presets:</span>
          {[15, 20, 30, 50, 100].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setBufferWidthMeters(w)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                bufferWidthMeters === w
                  ? 'text-emerald-300 border border-emerald-500/50'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
              style={bufferWidthMeters === w ? { background: 'rgba(16,185,129,.15)' } : {}}
            >
              {w}m
            </button>
          ))}
        </div>
      </div>

      {/* Calculate Button */}
      <button
        type="button"
        onClick={() => runAnalysis()}
        disabled={isLoading || points.length < 2}
        className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/40"
        style={{
          background: isLoading
            ? '#0f766e'
            : 'linear-gradient(to right, #059669, #0d9488, #0891b2)'
        }}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="truncate">{loadingStage || 'Processing…'}</span>
          </>
        ) : (
          <>
            <Route className="w-4 h-4" />
            <span>
              {points.length < 2
                ? 'Place At Least 2 Points'
                : `Calculate ${points.length}-Point Corridor Impact`}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
