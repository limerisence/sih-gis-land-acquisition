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
    <div className="p-4 space-y-3.5 shrink-0 border-b border-slate-100 bg-white">
      {/* Panel header with point counter & quick tools */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Alignment Vertices
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {points.length} {points.length === 1 ? 'Point' : 'Points'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Remove Last Point"
            disabled={points.length === 0}
            onClick={removeLastPoint}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer text-xs border border-slate-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Paste Coordinates"
            onClick={() => setIsPasteOpen((prev) => !prev)}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer text-xs border border-slate-200"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Clear All Points"
            disabled={points.length === 0}
            onClick={clearPoints}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer text-xs border border-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Paste Coordinates drawer */}
      {isPasteOpen && (
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
            <span>Paste Coordinate Array</span>
            <button
              type="button"
              onClick={() => setIsPasteOpen(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Accepts JSON (e.g. <code className="text-blue-600 font-mono">[[22.568, 88.359], [22.571, 88.365]]</code>) or comma-separated pairs.
          </p>
          <textarea
            rows={3}
            placeholder="[[22.5685, 88.3595], [22.5718, 88.3655], [22.5752, 88.3725]]"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPasteOpen(false)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePasteSubmit}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Load Points
            </button>
          </div>
        </div>
      )}

      {/* Interactive Points List */}
      {points.length === 0 ? (
        <div className="p-3.5 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500 bg-slate-50/70">
          <MapPin className="w-5 h-5 text-blue-500/80 mx-auto mb-1.5" />
          Click anywhere on map to add vertex <span className="text-blue-600 font-semibold">P1</span>, or enter manual coordinates below.
        </div>
      ) : (
        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
          {points.map((pt, idx) => (
            <div
              key={`${pt.lat}-${pt.lng}-${idx}`}
              className="flex items-center justify-between p-2 px-2.5 rounded-lg border border-slate-200 bg-slate-50/80 text-xs"
            >
              <div className="flex items-center gap-2 font-mono">
                <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white bg-blue-600">
                  P{idx + 1}
                </span>
                <span className="text-slate-700 text-[11px]">
                  {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removePoint(idx)}
                className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 cursor-pointer"
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
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Latitude
            </label>
            <input
              type="text"
              placeholder="e.g. 22.5685"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Longitude
            </label>
            <input
              type="text"
              placeholder="e.g. 88.3595"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <MapPin className="w-3.5 h-3.5 text-slate-600" />
          <span>Add Pin to Map</span>
        </button>
      </form>

      {/* Buffer width slider & presets */}
      <div className="pt-1">
        <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
          <span>Corridor Buffer Width</span>
          <span className="text-blue-600 font-mono font-bold">{bufferWidthMeters} m</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="5"
            max="500"
            value={bufferWidthMeters}
            onChange={(e) => setBufferWidthMeters(Number(e.target.value))}
            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
          <span className="text-xs text-slate-500 self-center font-medium">Meters</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Presets:</span>
          {[15, 20, 30, 50, 100].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setBufferWidthMeters(w)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                bufferWidthMeters === w
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
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
        className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 shadow-sm"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white" />
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
