import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, MapPin, Navigation, CheckCircle2, Clock, AlertCircle,
  FileText, ChevronRight, Send, ExternalLink, Shield
} from 'lucide-react';
import MapContainer from '../components/MapContainer';
import { useGIS } from '../context/GISContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services/dataService';

// Acquisition status steps
const ACQN_STEPS = [
  { key: 'initiated',     label: 'Initiated',       desc: 'Acquisition process begun under LARR Act' },
  { key: 'notice_issued', label: 'Notice Issued',    desc: 'Section 11 notification served to owner' },
  { key: 'award_declared',label: 'Award Declared',   desc: 'Compensation award by Land Acquisition Officer' },
  { key: 'disbursed',     label: 'Disbursed',        desc: 'Payment credited to registered account' },
];

// Mock status from localStorage or default to step 1
const LS_ACQ_KEY = 'bhoomi_acq_status';
function getAcqStatus(plotId) {
  try {
    const map = JSON.parse(localStorage.getItem(LS_ACQ_KEY) || '{}');
    return map[plotId] || 'initiated';
  } catch { return 'initiated'; }
}
function setAcqStatus(plotId, status) {
  try {
    const map = JSON.parse(localStorage.getItem(LS_ACQ_KEY) || '{}');
    map[plotId] = status;
    localStorage.setItem(LS_ACQ_KEY, JSON.stringify(map));
  } catch {}
}

// Payment tracker stepper
function PaymentStepper({ plotId }) {
  const currentKey = getAcqStatus(plotId);
  const currentIdx = ACQN_STEPS.findIndex((s) => s.key === currentKey);

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5 text-emerald-400" /> Acquisition Status Tracker
      </p>
      <div className="relative">
        {/* Progress bar track */}
        <div
          className="absolute top-3.5 left-3.5 right-3.5 h-0.5"
          style={{ background: 'rgba(100,116,139,.2)' }}
        />
        <div
          className="absolute top-3.5 left-3.5 h-0.5 transition-all duration-700"
          style={{
            width: `${Math.max(0, (currentIdx / (ACQN_STEPS.length - 1)) * 100)}%`,
            background: 'linear-gradient(90deg, #10b981, #38bdf8)',
          }}
        />
        <div className="relative flex justify-between">
          {ACQN_STEPS.map((step, idx) => {
            const done = idx <= currentIdx;
            return (
              <div key={step.key} className="flex flex-col items-center w-1/4">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all text-xs font-bold"
                  style={{
                    background: done ? '#10b981' : 'rgba(15,23,42,0.95)',
                    borderColor: done ? '#10b981' : 'rgba(100,116,139,.35)',
                    color: done ? '#fff' : '#64748b',
                    boxShadow: done ? '0 0 12px rgba(16,185,129,.4)' : 'none',
                  }}
                >
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{idx + 1}</span>}
                </div>
                <span
                  className="text-[9px] font-semibold mt-1.5 text-center leading-tight"
                  style={{ color: done ? '#34d399' : '#475569' }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-3 text-center">
        {ACQN_STEPS[currentIdx]?.desc}
      </p>
    </div>
  );
}

// Grievance form
function GrievanceForm({ onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    contact: '',
    type: 'Compensation Dispute',
    description: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const TYPES = ['Compensation Dispute', 'Boundary Error', 'Ownership Mismatch', 'Payment Delay', 'Other'];

  const handleSubmit = (e) => {
    e.preventDefault();
    const grievance = {
      ...form,
      id: `GRV-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      status: 'Open',
    };
    try {
      const prev = JSON.parse(localStorage.getItem('bhoomi_grievances') || '[]');
      localStorage.setItem('bhoomi_grievances', JSON.stringify([...prev, grievance]));
    } catch {}
    setSubmitted(true);
    onSubmit?.();
  };

  if (submitted) {
    return (
      <div className="p-4 rounded-xl border text-center" style={{ background: 'rgba(5,46,22,.4)', border: '1px solid rgba(16,185,129,.3)' }}>
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm font-bold text-emerald-300">Grievance Submitted</p>
        <p className="text-xs text-slate-400 mt-1">Your application has been recorded. Reference ID saved locally.</p>
      </div>
    );
  }

  const inp = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1 block">Full Name</label>
          <input className={inp} placeholder="Your legal name" required
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1 block">Contact No.</label>
          <input className={inp} placeholder="+91 XXXXXXXXXX" required
            value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1 block">Grievance Type</label>
        <select
          className={inp}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {TYPES.map((t) => <option key={t} value={t} style={{ background: '#1e293b' }}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1 block">Description</label>
        <textarea
          className={`${inp} resize-none h-20`}
          placeholder="Describe your grievance in detail…"
          required
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #ea580c, #d97706)',
          color: '#fff',
          boxShadow: '0 0 16px rgba(234,88,12,.3)',
        }}
      >
        <Send className="w-4 h-4" />
        Submit Grievance
      </button>
    </form>
  );
}

export default function BeneficiaryLayout() {
  const { allFeatures, focusOnFeature, showToast } = useGIS();
  const { userProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [showGrievance, setShowGrievance] = useState(false);
  const [allTasks, setAllTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bhoomi_survey_tasks') || '[]'); } catch { return []; }
  });

  const refreshTasks = useCallback(async () => {
    const tList = await dataService.getTasks();
    if (tList) setAllTasks(tList);
  }, []);

  React.useEffect(() => {
    refreshTasks();
    const unsub = dataService.subscribe(() => {
      refreshTasks();
    });
    return unsub;
  }, [refreshTasks]);

  // Find plots linked to logged-in beneficiary phone/aadhaar
  const linkedTasks = useMemo(() => {
    if (!userProfile?.phone && !userProfile?.aadhaar) return [];
    const p = (userProfile.phone || '').trim();
    const a = (userProfile.aadhaar || '').trim();

    return allTasks.filter((t) => {
      const sp = (t.surveyorPhone || t.surveyorOwnerContact || '').trim();
      const sa = (t.surveyorAadhaar || '').trim();
      return (p && sp && sp.includes(p)) || (a && sa && sa.includes(a));
    });
  }, [allTasks, userProfile]);

  // Handle tile click to toggle/select plot details accordion
  const handleTileClick = (t) => {
    if (selectedPlot?.properties?.plotId === t.plotId) {
      // Toggle off if clicking the already active tile
      setSelectedPlot(null);
      return;
    }
    const feat = allFeatures.find((f) => f.properties?.plotId === t.plotId);
    if (feat) {
      setSelectedPlot(feat);
    } else {
      setSelectedPlot({
        type: 'Feature',
        properties: {
          plotId: t.plotId,
          khasraNo: t.khasraNo,
          address: t.address,
          ownerName: t.surveyorOwnerName || t.ownerName,
          landAreaSqKm: t.areaSqKm,
          coordinates: t.coords,
          landCategory: t.verifiedLandClass || t.landCategory,
        },
      });
    }
  };

  // Derive the full survey task record for the selected plot
  const activeTaskDetails = useMemo(() => {
    if (!selectedPlot) return null;
    const plotId = selectedPlot?.properties?.plotId;
    return allTasks.find((t) => t.plotId === plotId) || null;
  }, [selectedPlot, allTasks]);

  const p = selectedPlot?.properties || {};
  const lat = p.coordinates?.lat;
  const lng = p.coordinates?.lng;
  const areaSqKm = p.landAreaSqKm !== undefined ? Number(p.landAreaSqKm).toFixed(6) : ((p.landAreaSqM || 0) / 1e6).toFixed(6);

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(234,88,12,0.08) 0%, transparent 70%), #030712'
      }}
    >
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 p-6 rounded-3xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-2xl">
              🏡
            </div>
            <div>
              <h2 className="font-bold text-lg text-white">Citizen Landowner Portal</h2>
              <p className="text-xs text-slate-400">
                {userProfile?.name || 'Registered Land Owner'} · {userProfile?.designation || 'Beneficiary'}
              </p>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-wider">
            Verified Owner Dashboard
          </div>
        </div>

        {/* Linked Plots selector tiles for verified Phone/Aadhaar */}
        {linkedTasks.length > 0 ? (
          <div className="mb-6 p-5 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Your Surveyed Land Parcels ({linkedTasks.length})</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                Click a parcel tile below to view detailed acquisition report
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {linkedTasks.map((t) => {
                const isSelected = selectedPlot?.properties?.plotId === t.plotId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTileClick(t)}
                    className="text-left p-4 rounded-2xl transition-all duration-200 cursor-pointer border shadow-md flex flex-col justify-between group hover:scale-[1.02]"
                    style={{
                      background: isSelected ? 'rgba(16,185,129,0.18)' : 'rgba(15,23,42,0.85)',
                      borderColor: isSelected ? '#10b981' : 'rgba(100,116,139,0.28)',
                      boxShadow: isSelected ? '0 0 24px rgba(16,185,129,0.25)' : 'none',
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm text-white font-mono">{t.plotId}</span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                          style={{
                            background: isSelected ? 'rgba(16,185,129,.25)' : 'rgba(56,189,248,.12)',
                            color: isSelected ? '#34d399' : '#38bdf8',
                            borderColor: isSelected ? 'rgba(16,185,129,.4)' : 'rgba(56,189,248,.25)',
                          }}
                        >
                          {isSelected ? 'OPEN ✓' : 'VIEW DETAILS →'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mb-1">{t.khasraNo || 'Dag Record'}</div>
                      <div className="text-xs text-slate-300 truncate">{t.address}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mb-6 p-6 rounded-3xl border border-amber-500/25 bg-amber-950/20 text-center">
            <p className="text-sm font-bold text-amber-300">No Surveyed Parcels Found</p>
            <p className="text-xs text-slate-400 mt-1">
              No ground survey records were found matching your Phone ({userProfile?.phone}) or Aadhaar ({userProfile?.aadhaar}).
            </p>
          </div>
        )}

        {/* Plot details accordion card (Reveals only after clicking a tile above) */}
        {selectedPlot ? (
          <div
            className="rounded-3xl border overflow-hidden shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4"
            style={{ border: '1px solid rgba(251,146,60,.35)', background: 'rgba(15,23,42,0.95)' }}
          >
            {/* Title strip */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ background: 'rgba(251,146,60,.08)', borderBottom: '1px solid rgba(251,146,60,.18)' }}
            >
              <div>
                <div className="text-xl font-black text-white font-mono">{p.plotId}</div>
                <div className="text-xs text-orange-300 font-medium mt-0.5">{p.khasraNo} · {activeTaskDetails?.verifiedLandClass || p.landCategory || 'Residential'}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlot(null)}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Close Report ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Owner */}
              <div className="flex items-center justify-between text-sm py-1 border-b border-slate-800/60">
                <span className="text-slate-400 font-medium">Verified Owner Name</span>
                <span className="font-bold text-emerald-300 text-right">
                  {activeTaskDetails?.surveyorOwnerName || p.ownerName || 'Survey Pending'}
                </span>
              </div>

              {/* Surveyor Verified Contact Details */}
              {(activeTaskDetails?.surveyorPhone || activeTaskDetails?.surveyorAadhaar) && (
                <div className="p-4 rounded-2xl border border-sky-500/25 bg-sky-950/20 text-xs space-y-2">
                  <div className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                    🔍 Surveyor Verified Identity Credentials
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    {activeTaskDetails?.surveyorPhone && (
                      <div className="flex items-center justify-between text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-400">Mobile Phone:</span>
                        <span className="font-mono font-bold text-slate-100">{activeTaskDetails.surveyorPhone}</span>
                      </div>
                    )}
                    {activeTaskDetails?.surveyorAadhaar && (
                      <div className="flex items-center justify-between text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-400">Aadhaar No:</span>
                        <span className="font-mono font-bold text-slate-100">{activeTaskDetails.surveyorAadhaar}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Address */}
              <div className="flex items-start gap-2 text-sm py-1 border-b border-slate-800/60">
                <MapPin className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <span className="text-slate-200 font-medium leading-relaxed">{p.address || `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`}</span>
              </div>

              {/* Area */}
              <div className="flex items-center justify-between text-sm py-1 border-b border-slate-800/60">
                <span className="text-slate-400 font-medium">Plot Footprint Area</span>
                <span className="font-bold text-emerald-400 font-mono text-base">{areaSqKm} sq km</span>
              </div>

              {/* GPS */}
              {lat && lng && (
                <div className="flex items-center justify-between text-sm py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-sky-400" /> GPS Location
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${lat},${lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:text-sky-300 flex items-center gap-1 text-xs font-mono font-semibold"
                  >
                    {lat.toFixed(5)}° N, {lng.toFixed(5)}° E <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                </div>
              )}

              {/* Acquisition stepper */}
              <PaymentStepper plotId={p.plotId} />

              {/* Grievance section toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowGrievance((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all cursor-pointer text-xs font-bold"
                  style={{
                    background: showGrievance ? 'rgba(234,88,12,.12)' : 'rgba(30,41,59,0.7)',
                    border: `1px solid ${showGrievance ? 'rgba(234,88,12,.4)' : 'rgba(100,116,139,.3)'}`,
                    color: showGrievance ? '#fdba74' : '#cbd5e1',
                  }}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-400" />
                    File a Grievance regarding this Plot
                  </span>
                  <ChevronRight
                    className="w-4 h-4 transition-transform"
                    style={{ transform: showGrievance ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  />
                </button>

                {showGrievance && (
                  <div className="mt-4">
                    <GrievanceForm onSubmit={() => showToast('Grievance filed successfully.', 'success')} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Guidance prompt when no tile is clicked yet */
          <div
            className="rounded-3xl border p-10 text-center"
            style={{ border: '1px border-dashed rgba(100,116,139,.25)', background: 'rgba(15,23,42,0.4)' }}
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 text-lg">
              👇
            </div>
            <p className="text-sm font-bold text-slate-300">Select a Parcel Tile Above</p>
            <p className="text-xs text-slate-500 mt-1">Click any parcel tile above to expand its detailed acquisition report & status timeline.</p>
          </div>
        )}
      </div>
    </div>
  );
}
