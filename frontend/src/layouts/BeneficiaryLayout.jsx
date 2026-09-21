import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, MapPin, Navigation, CheckCircle2, Clock, AlertCircle,
  FileText, ChevronRight, Send, ExternalLink, Shield, Banknote,
  Sparkles, Check, RefreshCw, Landmark, ShieldCheck, ArrowDown
} from 'lucide-react';
import MapContainer from '../components/MapContainer';
import { useGIS } from '../context/GISContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services/dataService';
import { calculatePlotCompensation } from '../utils/larrCalculator';

// ─── Zomato-Style Live Payout Stepper ─────────────────────────────────────────
function LivePayoutStepper({ task, disbursement }) {
  const status = disbursement?.status || 'NOT_INITIATED';

  // Determine stage flags
  const isStep1Done = true; // LARR Award Sanctioned
  const isStep2Done = status === 'INITIATED' || status === 'TREASURY_VERIFYING' || status === 'DISBURSED';
  const isStep3Done = status === 'TREASURY_VERIFYING' || status === 'DISBURSED';
  const isStep4Done = status === 'DISBURSED';
  const isStep3Active = status === 'TREASURY_VERIFYING';
  const isStep2Active = status === 'INITIATED';

  const steps = [
    {
      id: 1,
      title: 'LARR Statutory Award Sanctioned',
      desc: 'Compensation calculated & officially sanctioned under RFCTLARR Act 2013.',
      done: isStep1Done,
      active: false,
      timestamp: task.dispatchedAt ? new Date(task.dispatchedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null,
      badge: 'Certified',
      badgeColor: '#34d399',
    },
    {
      id: 2,
      title: 'Payment Initiated by Finance Officer',
      desc: 'Treasury voucher generated and digitally signed by Chief Accounts Officer.',
      done: isStep2Done,
      active: isStep2Active,
      timestamp: disbursement?.initiatedAt ? new Date(disbursement.initiatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null,
      badge: isStep2Done ? 'Initiated' : 'Awaiting Sanction',
      badgeColor: isStep2Done ? '#38bdf8' : '#64748b',
    },
    {
      id: 3,
      title: 'RBI & State Treasury Verification (PFMS)',
      desc: isStep3Active
        ? 'Public Financial Management System clearing gateway in progress...'
        : isStep3Done
        ? 'RBI gateway cleared. Funds authorized for Direct Benefit Transfer.'
        : 'Pending treasury queue clearance.',
      done: isStep3Done,
      active: isStep3Active,
      timestamp: isStep3Active ? 'In Progress' : isStep3Done ? 'Cleared' : null,
      badge: isStep3Done ? (isStep3Active ? 'Verifying...' : 'Cleared') : 'Queue Pending',
      badgeColor: isStep3Active ? '#fbbf24' : isStep3Done ? '#34d399' : '#64748b',
    },
    {
      id: 4,
      title: 'Amount Credited to Bank Account',
      desc: isStep4Done
        ? 'Direct Benefit Transfer (DBT) successfully credited to registered Aadhaar-linked account.'
        : 'Bank settlement will execute immediately upon treasury verification.',
      done: isStep4Done,
      active: false,
      timestamp: disbursement?.disbursedAt ? new Date(disbursement.disbursedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null,
      badge: isStep4Done ? 'Credited' : 'Pending',
      badgeColor: isStep4Done ? '#10b981' : '#64748b',
    },
  ];

  return (
    <div className="mt-4 pt-5 border-t border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
            <Landmark className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Live Statutory Payout Tracker</h4>
            <p className="text-[10px] text-slate-400">Real-time State Treasury & DBT settlement timeline</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border"
          style={{
            background: isStep4Done ? 'rgba(16,185,129,.15)' : isStep3Active ? 'rgba(251,191,36,.15)' : isStep2Done ? 'rgba(56,189,248,.15)' : 'rgba(100,116,139,.15)',
            color: isStep4Done ? '#34d399' : isStep3Active ? '#fbbf24' : isStep2Done ? '#38bdf8' : '#94a3b8',
            borderColor: isStep4Done ? 'rgba(16,185,129,.3)' : isStep3Active ? 'rgba(251,191,36,.3)' : isStep2Done ? 'rgba(56,189,248,.3)' : 'rgba(100,116,139,.3)',
          }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isStep4Done ? 'bg-emerald-400' : 'bg-sky-400 animate-ping'}`} />
          <span>{isStep4Done ? 'PAYOUT COMPLETE' : isStep3Active ? 'PFMS IN-FLIGHT' : isStep2Done ? 'PROCESSING' : 'SANCTION READY'}</span>
        </div>
      </div>

      {/* Vertical Stepper Container */}
      <div className="relative pl-6 space-y-6">
        {/* Continuous Background Vertical Line */}
        <div
          className="absolute left-[11px] top-3 bottom-4 w-0.5"
          style={{ background: 'rgba(100,116,139,.2)' }}
        />

        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const nextStep = steps[idx + 1];
          const lineDone = step.done && (nextStep?.done || nextStep?.active);

          return (
            <div key={step.id} className="relative group">
              {/* Connector Line to Next Step */}
              {!isLast && (
                <div
                  className="absolute left-[-13px] top-6 h-full w-0.5 transition-all duration-700"
                  style={{
                    background: lineDone
                      ? 'linear-gradient(180deg, #10b981 0%, #38bdf8 100%)'
                      : step.done
                      ? 'linear-gradient(180deg, #10b981 0%, rgba(100,116,139,.2) 100%)'
                      : 'transparent',
                  }}
                />
              )}

              {/* Step Circle Indicator */}
              <div
                className="absolute left-[-23px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all shadow-md"
                style={{
                  background: step.done
                    ? '#10b981'
                    : step.active
                    ? '#0284c7'
                    : 'rgba(15,23,42,0.95)',
                  borderColor: step.done
                    ? '#10b981'
                    : step.active
                    ? '#38bdf8'
                    : 'rgba(100,116,139,0.4)',
                  color: step.done || step.active ? '#ffffff' : '#64748b',
                  boxShadow: step.done
                    ? '0 0 16px rgba(16,185,129,0.4)'
                    : step.active
                    ? '0 0 16px rgba(56,189,248,0.5)'
                    : 'none',
                }}
              >
                {step.done ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : step.active ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <span className="text-[10px] font-bold">{step.id}</span>
                )}
              </div>

              {/* Step Content */}
              <div
                className="p-3.5 rounded-2xl border transition-all"
                style={{
                  background: step.done
                    ? 'rgba(16,185,129,0.06)'
                    : step.active
                    ? 'rgba(56,189,248,0.08)'
                    : 'rgba(15,23,42,0.6)',
                  borderColor: step.done
                    ? 'rgba(16,185,129,0.25)'
                    : step.active
                    ? 'rgba(56,189,248,0.35)'
                    : 'rgba(100,116,139,0.18)',
                }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                  <span
                    className="text-xs font-bold"
                    style={{ color: step.done ? '#ffffff' : step.active ? '#38bdf8' : '#94a3b8' }}
                  >
                    {step.title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {step.timestamp && (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                        {step.timestamp}
                      </span>
                    )}
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        background: `${step.badgeColor}18`,
                        color: step.badgeColor,
                        border: `1px solid ${step.badgeColor}35`,
                      }}
                    >
                      {step.badge}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disbursed Bank Credit Details Card */}
      {isStep4Done && (
        <div className="mt-5 p-4 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-900/80 shadow-2xl flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Statutory Award Direct Settlement Confirmed</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                  DBT COMPLETED
                </span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                Bank UTR / Transaction Ref: <strong className="text-emerald-400">{disbursement?.bankReferenceId || 'TRX-IND-892104'}</strong>
              </div>
            </div>
          </div>
          {disbursement?.disbursedAt && (
            <div className="text-[10px] text-slate-400 font-mono">
              Settled: {new Date(disbursement.disbursedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Grievance Form Component ────────────────────────────────────────────────
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
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [showGrievance, setShowGrievance] = useState(false);
  const [allTasks, setAllTasks] = useState([]);
  const [allDisbursements, setAllDisbursements] = useState({});

  // Sync tasks and disbursements
  const refreshData = useCallback(async () => {
    const [tList, dMap] = await Promise.all([
      dataService.getTasks(),
      dataService.getDisbursements(),
    ]);
    if (tList) setAllTasks(tList);
    if (dMap) setAllDisbursements(dMap);
  }, []);

  useEffect(() => {
    refreshData();
    const unsub = dataService.subscribe(() => {
      refreshData();
    });
    return unsub;
  }, [refreshData]);

  // Find plots linked to logged-in beneficiary phone/aadhaar or fallback to all
  const linkedTasks = useMemo(() => {
    if (!userProfile?.phone && !userProfile?.aadhaar) return allTasks;
    const p = (userProfile.phone || '').trim();
    const a = (userProfile.aadhaar || '').trim();

    const matched = allTasks.filter((t) => {
      const sp = (t.surveyorPhone || t.surveyorOwnerContact || '').trim();
      const sa = (t.surveyorAadhaar || '').trim();
      return (p && sp && sp.includes(p)) || (a && sa && sa.includes(a));
    });

    return matched.length > 0 ? matched : allTasks;
  }, [allTasks, userProfile]);

  // Handle tile click to toggle/select plot details accordion
  const handleTileClick = (t) => {
    if (selectedPlot?.properties?.plotId === t.plotId) {
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

  // Current disbursement record for the selected plot
  const activeDisbursement = useMemo(() => {
    if (!activeTaskDetails?.id) return null;
    return allDisbursements[activeTaskDetails.id] || null;
  }, [activeTaskDetails, allDisbursements]);

  // LARR Financial Calculations for the active plot
  const larrFinancials = useMemo(() => {
    if (!activeTaskDetails) return null;
    const larr = activeTaskDetails.larr_financials || {};
    const fallbackLarr = activeTaskDetails.assetValue
      ? calculatePlotCompensation(
          activeTaskDetails.areaSqm || (activeTaskDetails.areaSqKm ? activeTaskDetails.areaSqKm * 1000000 : 500),
          activeTaskDetails.baseCircleRateOverride || 4500,
          activeTaskDetails.assetValue || 0,
          activeTaskDetails.isRural
        )
      : null;

    const totalAward =
      larr.total_sanctioned_award ||
      larr.totalAward ||
      fallbackLarr?.totalAward ||
      Math.round((activeTaskDetails.areaSqM || 500) * 1800);

    const marketValue =
      larr.calculated_market_value ||
      larr.marketValue ||
      fallbackLarr?.marketValue ||
      Math.round(totalAward * 0.45);

    const solatium =
      larr.solatium_award ||
      larr.solatium ||
      fallbackLarr?.solatium ||
      Math.round(totalAward * 0.5);

    const assetVal =
      larr.asset_value ||
      larr.assetValue ||
      fallbackLarr?.assetValue ||
      activeTaskDetails.assetValue ||
      0;

    return {
      totalAward,
      marketValue,
      solatium,
      assetVal,
      multiplier: larr.multiplier || fallbackLarr?.multiplier || (activeTaskDetails.isRural ? 1.5 : 1.0),
    };
  }, [activeTaskDetails]);

  const p = selectedPlot?.properties || {};
  const lat = p.coordinates?.lat;
  const lng = p.coordinates?.lng;
  const areaSqKm = p.landAreaSqKm !== undefined ? Number(p.landAreaSqKm).toFixed(6) : ((p.landAreaSqM || 0) / 1e6).toFixed(6);

  const fmt = (n) =>
    n >= 10_000_000
      ? `₹${(n / 10_000_000).toFixed(2)} Cr`
      : n >= 100_000
      ? `₹${(n / 100_000).toFixed(2)} L`
      : `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(234,88,12,0.08) 0%, transparent 70%), #030712',
      }}
    >
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 p-6 rounded-3xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-2xl shadow-inner">
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

        {/* Linked Plots selector tiles */}
        {linkedTasks.length > 0 ? (
          <div className="mb-6 p-5 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Your Surveyed Land Parcels ({linkedTasks.length})</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                Click a parcel tile below to view detailed acquisition report & live payout tracker
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {linkedTasks.map((t) => {
                const isSelected = selectedPlot?.properties?.plotId === t.plotId;
                const disb = allDisbursements[t.id];
                const isDisbursed = disb?.status === 'DISBURSED';

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
                            background: isDisbursed ? 'rgba(16,185,129,.25)' : isSelected ? 'rgba(16,185,129,.25)' : 'rgba(56,189,248,.12)',
                            color: isDisbursed ? '#34d399' : isSelected ? '#34d399' : '#38bdf8',
                            borderColor: isDisbursed ? 'rgba(16,185,129,.4)' : isSelected ? 'rgba(16,185,129,.4)' : 'rgba(56,189,248,.25)',
                          }}
                        >
                          {isDisbursed ? 'CREDITED ✓' : isSelected ? 'OPEN' : 'VIEW →'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mb-1">{t.khasraNo ? `Khasra: ${t.khasraNo}` : 'Dag Record'}</div>
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
              No ground survey records were found matching your account.
            </p>
          </div>
        )}

        {/* Plot details accordion card (Reveals after clicking a tile) */}
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
                <div className="text-xs text-orange-300 font-medium mt-0.5">
                  {p.khasraNo ? `Khasra: ${p.khasraNo}` : 'Dag: Verified'} · {activeTaskDetails?.verifiedLandClass || p.landCategory || 'Residential'}
                </div>
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
                  {activeTaskDetails?.surveyorOwnerName || p.ownerName || 'Verified Citizen'}
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

              {/* LARR 2013 Statutory Compensation Financial Breakdown Card */}
              {larrFinancials && (
                <div className="p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-slate-900/90 to-slate-900/90 shadow-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                        Statutory LARR 2013 Compensation Award
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-bold">
                      SEC 26-30 CERTIFIED
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-1">
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Market Value</div>
                      <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
                        {fmt(larrFinancials.marketValue)}
                      </div>
                      <div className="text-[9px] text-slate-500">{larrFinancials.multiplier}× Multiplier</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-sky-400">100% Solatium</div>
                      <div className="text-sm font-bold text-sky-300 font-mono mt-0.5">
                        {fmt(larrFinancials.solatium)}
                      </div>
                      <div className="text-[9px] text-slate-500">Sec 30 Solatium</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-amber-400">Asset Valuation</div>
                      <div className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                        {fmt(larrFinancials.assetVal)}
                      </div>
                      <div className="text-[9px] text-slate-500">Assets/Crops</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                      <div className="text-[10px] uppercase font-black text-emerald-400">Total Sanctioned</div>
                      <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                        {fmt(larrFinancials.totalAward)}
                      </div>
                      <div className="text-[9px] text-emerald-400/80 font-bold">Total Award</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Zomato-Style Live Vertical Payout Stepper */}
              {activeTaskDetails && (
                <LivePayoutStepper
                  task={activeTaskDetails}
                  disbursement={activeDisbursement}
                />
              )}

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
            <p className="text-xs text-slate-500 mt-1">Click any parcel tile above to expand its detailed acquisition report & live payout timeline.</p>
          </div>
        )}
      </div>
    </div>
  );
}
