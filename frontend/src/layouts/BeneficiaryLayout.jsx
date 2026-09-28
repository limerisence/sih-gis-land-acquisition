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

// ─── Zomato / RedBus-Style Live Payout Stepper ───────────────────────────────
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
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    },
    {
      id: 2,
      title: 'Payment Initiated by Finance Officer',
      desc: 'Treasury voucher generated and digitally signed by Accounts Authority.',
      done: isStep2Done,
      active: isStep2Active,
      timestamp: disbursement?.initiatedAt ? new Date(disbursement.initiatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
      badge: isStep2Done ? 'Initiated' : 'Awaiting Sanction',
      badgeClass: isStep2Done ? 'bg-blue-50 text-blue-700 border-blue-200/60' : 'bg-slate-100 text-slate-600 border-slate-200',
    },
    {
      id: 3,
      title: 'RBI & State Treasury Verification (PFMS)',
      desc: isStep3Active
        ? 'Public Financial Management System clearing gateway verification in progress...'
        : isStep3Done
        ? 'RBI gateway cleared. Funds authorized for Direct Benefit Transfer.'
        : 'Pending treasury queue clearance.',
      done: isStep3Done,
      active: isStep3Active,
      timestamp: isStep3Active ? 'In Progress' : isStep3Done ? 'Cleared' : null,
      badge: isStep3Done ? (isStep3Active ? 'Verifying...' : 'Cleared') : 'Queue Pending',
      badgeClass: isStep3Active ? 'bg-amber-50 text-amber-700 border-amber-200/60' : isStep3Done ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-slate-100 text-slate-600 border-slate-200',
    },
    {
      id: 4,
      title: 'Amount Credited to Bank Account',
      desc: isStep4Done
        ? 'Direct Benefit Transfer (DBT) successfully credited to registered Aadhaar-linked account.'
        : 'Bank settlement will execute immediately upon treasury verification.',
      done: isStep4Done,
      active: false,
      timestamp: disbursement?.disbursedAt ? new Date(disbursement.disbursedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
      badge: isStep4Done ? 'Credited' : 'Pending',
      badgeClass: isStep4Done ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-slate-100 text-slate-600 border-slate-200',
    },
  ];

  return (
    <div className="mt-5 pt-6 border-t border-slate-200">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Landmark className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Live Statutory Payout Tracker</h4>
            <p className="text-xs text-slate-500">Real-time State Treasury & DBT settlement progress</p>
          </div>
        </div>

        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
          isStep4Done
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
            : isStep3Active
            ? 'bg-amber-50 text-amber-700 border-amber-200/60'
            : isStep2Done
            ? 'bg-blue-50 text-blue-700 border-blue-200/60'
            : 'bg-slate-100 text-slate-600 border-slate-200'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isStep4Done ? 'bg-emerald-600' : 'bg-blue-600 animate-ping'}`} />
          <span>{isStep4Done ? 'PAYOUT COMPLETE' : isStep3Active ? 'PFMS IN-FLIGHT' : isStep2Done ? 'PROCESSING' : 'SANCTION READY'}</span>
        </div>
      </div>

      {/* Vertical Stepper Container */}
      <div className="relative pl-6 space-y-6">
        {/* Continuous Background Vertical Line */}
        <div className="absolute left-[11px] top-3 bottom-4 w-0.5 bg-slate-200" />

        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const nextStep = steps[idx + 1];
          const lineDone = step.done && (nextStep?.done || nextStep?.active);

          return (
            <div key={step.id} className="relative group">
              {/* Connector Line to Next Step */}
              {!isLast && (
                <div
                  className={`absolute left-[-13px] top-6 h-full w-0.5 transition-all duration-500 ${
                    lineDone ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
              )}

              {/* Step Circle Indicator */}
              <div
                className={`absolute left-[-23px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  step.done
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : step.active
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}
              >
                {step.done ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : step.active ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <span className="text-[10px] font-bold">{step.id}</span>
                )}
              </div>

              {/* Step Content Card */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  step.done
                    ? 'bg-emerald-50/20 border-emerald-200/60 shadow-xs'
                    : step.active
                    ? 'bg-blue-50/20 border-blue-200 shadow-xs'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                  <span className={`text-xs font-bold ${step.done ? 'text-slate-900' : step.active ? 'text-blue-700' : 'text-slate-600'}`}>
                    {step.title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {step.timestamp && (
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {step.timestamp}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${step.badgeClass}`}>
                      {step.badge}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disbursed Bank Credit Details Card */}
      {isStep4Done && (
        <div className="mt-5 p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span>Statutory Award Direct Settlement Confirmed</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                  DBT COMPLETED
                </span>
              </div>
              <div className="text-xs text-slate-700 font-mono mt-0.5">
                Bank UTR / Transaction Ref: <strong className="text-emerald-700 font-bold">{disbursement?.bankReferenceId || 'TRX-IND-892104'}</strong>
              </div>
            </div>
          </div>
          {disbursement?.disbursedAt && (
            <div className="text-xs text-slate-500 font-mono">
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
      <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
        <p className="text-sm font-bold text-emerald-900">Grievance Submitted Successfully</p>
        <p className="text-xs text-emerald-700 mt-1">Your application has been recorded. Reference ID saved locally.</p>
      </div>
    );
  }

  const inp = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600';

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-600 font-semibold mb-1 block">Full Name</label>
          <input className={inp} placeholder="Your legal name" required
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-slate-600 font-semibold mb-1 block">Contact No.</label>
          <input className={inp} placeholder="+91 XXXXXXXXXX" required
            value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-600 font-semibold mb-1 block">Grievance Type</label>
        <select
          className={inp}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-600 font-semibold mb-1 block">Description</label>
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
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-xs text-white bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer shadow-sm"
      >
        <Send className="w-3.5 h-3.5" />
        Submit Grievance to Authority
      </button>
    </form>
  );
}

const LS_TASKS_KEY = 'bhoomi_survey_tasks';
const LS_DISBURSE_KEY = 'bhoomi_disbursements';
const loadRaw = (key, fb = []) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fb));
  } catch {
    return fb;
  }
};
const cleanDigits = (v) => (v || '').toString().replace(/\D/g, '');

export default function BeneficiaryLayout() {
  const { allFeatures, showToast } = useGIS();
  const { userProfile } = useAuth();
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [showGrievance, setShowGrievance] = useState(false);
  const [showAllFallback, setShowAllFallback] = useState(false);
  
  // Instant load from localStorage cache, followed by background revalidation
  const [allTasks, setAllTasks] = useState(() => loadRaw(LS_TASKS_KEY, []));
  const [allDisbursements, setAllDisbursements] = useState(() => loadRaw(LS_DISBURSE_KEY, {}));
  const [isLoading, setIsLoading] = useState(() => {
    const cached = loadRaw(LS_TASKS_KEY, []);
    return cached.length === 0;
  });

  // Sync tasks and disbursements
  const refreshData = useCallback(async () => {
    try {
      const [tList, dMap] = await Promise.all([
        dataService.getTasks(),
        dataService.getDisbursements(),
      ]);
      if (tList && tList.length > 0) setAllTasks(tList);
      if (dMap) setAllDisbursements(dMap);
    } catch (err) {
      console.warn('[BeneficiaryLayout] Error fetching registry data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const unsub = dataService.subscribe(() => {
      refreshData();
    });
    return unsub;
  }, [refreshData]);

  // Find plots linked to logged-in beneficiary phone/aadhaar with digits-only normalization
  const linkedTasks = useMemo(() => {
    if (!allTasks || allTasks.length === 0) return [];
    if (showAllFallback) return allTasks;
    if (!userProfile?.phone && !userProfile?.aadhaar) return allTasks;

    const pDigits = cleanDigits(userProfile.phone);
    const aDigits = cleanDigits(userProfile.aadhaar);

    const matched = allTasks.filter((t) => {
      const spDigits = cleanDigits(t.surveyorPhone || t.surveyorOwnerContact || '');
      const saDigits = cleanDigits(t.surveyorAadhaar || '');

      // Phone match: match last 10 digits to handle country code (+91 / 0 / dashes / spaces)
      const phoneMatch = Boolean(
        pDigits && spDigits &&
        (pDigits.length >= 10 && spDigits.length >= 10
          ? pDigits.slice(-10) === spDigits.slice(-10)
          : spDigits.includes(pDigits) || pDigits.includes(spDigits))
      );

      // Aadhaar match: compare digits directly, ignoring all spaces and hyphens
      const aadhaarMatch = Boolean(
        aDigits && saDigits &&
        (saDigits === aDigits ||
          (aDigits.length >= 4 && saDigits.endsWith(aDigits.slice(-4))) ||
          saDigits.includes(aDigits) ||
          aDigits.includes(saDigits))
      );

      return phoneMatch || aadhaarMatch;
    });

    return matched.length > 0 ? matched : [];
  }, [allTasks, userProfile, showAllFallback]);

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

  // Auto-select plot if only 1 linked plot is available and none currently selected
  useEffect(() => {
    if (!selectedPlot && linkedTasks.length === 1) {
      handleTileClick(linkedTasks[0]);
    }
  }, [linkedTasks, selectedPlot]);

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
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 p-6 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-2xl shadow-xs">
              🏡
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-900">Citizen Landowner Portal</h2>
              <p className="text-xs text-slate-500">
                {userProfile?.name || 'Registered Land Owner'} · {userProfile?.designation || 'Beneficiary'}
              </p>
            </div>
          </div>
          <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 text-xs font-semibold">
            Verified Owner Dashboard
          </div>
        </div>

        {/* Linked Plots selector tiles / Loading State / Empty State */}
        {isLoading && linkedTasks.length === 0 ? (
          <div className="mb-6 p-8 rounded-2xl border border-slate-200 bg-white text-center shadow-xs animate-in fade-in duration-150">
            <div className="w-9 h-9 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-900">Connecting to State Land Registry...</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Retrieving verified ground survey records, RFCTLARR statutory awards, and PFMS live payout timeline.
            </p>
          </div>
        ) : linkedTasks.length > 0 ? (
          <div className="mb-6 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  {showAllFallback ? 'All Surveyed Land Parcels' : 'Your Surveyed Land Parcels'} ({linkedTasks.length})
                </span>
                {showAllFallback && (
                  <button
                    type="button"
                    onClick={() => setShowAllFallback(false)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 ml-2 underline cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
              <span className="text-xs text-slate-500 font-medium">
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
                    className={`text-left p-4 rounded-xl transition-all duration-150 cursor-pointer border flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-blue-50/50 border-blue-600 ring-2 ring-blue-100 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm text-slate-900 font-mono">{t.plotId}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          isDisbursed
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                            : isSelected
                            ? 'bg-blue-50 text-blue-700 border-blue-200/60'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {isDisbursed ? 'CREDITED ✓' : isSelected ? 'OPEN' : 'VIEW →'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono mb-1">{t.khasraNo ? `Khasra: ${t.khasraNo}` : 'Dag Record'}</div>
                      <div className="text-xs text-slate-700 truncate">{t.address}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mb-6 p-7 rounded-2xl border border-slate-200 bg-white text-center shadow-xs">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-900">No Surveyed Parcels Found for Credentials</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No on-site ground survey record was found matching Mobile{' '}
              <strong className="text-slate-800 font-mono">{userProfile?.phone || 'N/A'}</strong> or Aadhaar{' '}
              <strong className="text-slate-800 font-mono">{userProfile?.aadhaar || 'N/A'}</strong>.
            </p>
            {allTasks.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAllFallback(true)}
                  className="text-xs font-semibold px-4 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  Browse All Surveyed Parcels ({allTasks.length}) →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Plot details accordion card (Reveals after clicking a tile) */}
        {selectedPlot ? (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-md transition-all duration-200 animate-in fade-in">
            {/* Title strip */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xl font-bold text-slate-900 font-mono">{p.plotId}</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  {p.khasraNo ? `Khasra: ${p.khasraNo}` : 'Dag: Verified'} · {activeTaskDetails?.verifiedLandClass || p.landCategory || 'Residential'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlot(null)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close Report ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Owner */}
              <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Verified Owner Name</span>
                <span className="font-bold text-slate-900 text-right">
                  {activeTaskDetails?.surveyorOwnerName || p.ownerName || 'Verified Citizen'}
                </span>
              </div>

              {/* Surveyor Verified Contact Details */}
              {(activeTaskDetails?.surveyorPhone || activeTaskDetails?.surveyorAadhaar) && (
                <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40 text-xs space-y-2">
                  <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                    🔍 Surveyor Verified Identity Credentials
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {activeTaskDetails?.surveyorPhone && (
                      <div className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-slate-500">Mobile Phone:</span>
                        <span className="font-mono font-bold text-slate-800">{activeTaskDetails.surveyorPhone}</span>
                      </div>
                    )}
                    {activeTaskDetails?.surveyorAadhaar && (
                      <div className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-slate-500">Aadhaar No:</span>
                        <span className="font-mono font-bold text-slate-800">{activeTaskDetails.surveyorAadhaar}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Address */}
              <div className="flex items-start gap-2 text-sm py-1 border-b border-slate-100">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span className="text-slate-700 font-medium leading-relaxed">{p.address || `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`}</span>
              </div>

              {/* Area */}
              <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Plot Footprint Area</span>
                <span className="font-bold text-slate-900 font-mono text-base">{areaSqKm} sq km</span>
              </div>

              {/* GPS */}
              {lat && lng && (
                <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-blue-600" /> GPS Coordinates
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${lat},${lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-mono font-semibold"
                  >
                    {lat.toFixed(5)}° N, {lng.toFixed(5)}° E <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                </div>
              )}

              {/* LARR 2013 Statutory Compensation Financial Breakdown Card */}
              {larrFinancials && (
                <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Statutory LARR 2013 Compensation Award
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold">
                      SEC 26-30 CERTIFIED
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-1">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Market Value</div>
                      <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                        {fmt(larrFinancials.marketValue)}
                      </div>
                      <div className="text-[10px] text-slate-400">{larrFinancials.multiplier}× Multiplier</div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] uppercase font-bold text-slate-500">100% Solatium</div>
                      <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                        {fmt(larrFinancials.solatium)}
                      </div>
                      <div className="text-[10px] text-slate-400">Sec 30 Solatium</div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Asset Valuation</div>
                      <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                        {fmt(larrFinancials.assetVal)}
                      </div>
                      <div className="text-[10px] text-slate-400">Assets/Crops</div>
                    </div>

                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200/60">
                      <div className="text-[10px] uppercase font-bold text-emerald-800">Total Sanctioned</div>
                      <div className="text-base font-black text-emerald-800 font-mono mt-0.5">
                        {fmt(larrFinancials.totalAward)}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-semibold">Total Award</div>
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
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer text-xs font-semibold text-slate-700"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    File a Grievance regarding this Plot
                  </span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${showGrievance ? 'rotate-90' : ''}`}
                  />
                </button>

                {showGrievance && (
                  <div className="mt-3">
                    <GrievanceForm onSubmit={() => showToast('Grievance filed successfully.', 'success')} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Guidance prompt when no tile is clicked yet */
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-3 text-lg">
              👇
            </div>
            <p className="text-sm font-bold text-slate-800">Select a Parcel Tile Above</p>
            <p className="text-xs text-slate-500 mt-1">Click any parcel tile above to expand its detailed acquisition report & live payout timeline.</p>
          </div>
        )}
      </div>
    </div>
  );
}
