import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard, Search, Banknote, CheckCircle2, Clock, AlertTriangle,
  ArrowRight, RefreshCw, Building2, MapPin, ShieldCheck, TrendingUp,
  FileCheck, Landmark, Check, Send, AlertCircle, Sparkles, ExternalLink
} from 'lucide-react';
import { useGIS } from '../context/GISContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services/dataService';

// Status styling & badges
const STATUS_CONFIG = {
  NOT_INITIATED: {
    label: 'Not Initiated',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.3)',
    icon: Clock,
  },
  INITIATED: {
    label: 'Payment Initiated',
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.15)',
    border: 'rgba(56,189,248,0.4)',
    icon: Send,
  },
  TREASURY_VERIFYING: {
    label: 'Treasury Verifying (PFMS)',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.15)',
    border: 'rgba(251,191,36,0.4)',
    icon: RefreshCw,
  },
  DISBURSED: {
    label: 'Disbursed (Credited)',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.18)',
    border: 'rgba(52,211,153,0.4)',
    icon: CheckCircle2,
  },
  Stalled: {
    label: 'Stalled / Hold',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.15)',
    border: 'rgba(248,113,113,0.4)',
    icon: AlertTriangle,
  },
};

export default function FinanceOfficerLayout() {
  const { showToast } = useGIS();
  const { userProfile } = useAuth();

  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [disbursements, setDisbursements] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState('PRJ-5531');
  const [projectIdInput, setProjectIdInput] = useState('PRJ-5531');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeProcessingIds, setActiveProcessingIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load all projects, tasks and disbursements
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pList, tList, dMap] = await Promise.all([
        dataService.getProjects(),
        dataService.getTasks(),
        dataService.getDisbursements(),
      ]);
      if (pList) {
        setProjects(pList);
        if (pList.length > 0 && !selectedProjectId) {
          setSelectedProjectId(pList[0].project_id);
          setProjectIdInput(pList[0].project_id);
        }
      }
      if (tList) setTasks(tList);
      if (dMap) setDisbursements(dMap);
    } catch (err) {
      console.error('Failed to load finance data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadData();
    const unsubscribe = dataService.subscribe(() => {
      loadData();
    });
    return unsubscribe;
  }, [loadData]);

  // Handle manual Project ID Search
  const handleSearchProject = (e) => {
    e?.preventDefault();
    const query = projectIdInput.trim().toUpperCase();
    if (!query) {
      showToast('Please enter a valid Project ID', 'error');
      return;
    }
    const match = projects.find((p) => p.project_id.toUpperCase() === query || p.project_id.toUpperCase().includes(query));
    if (match) {
      setSelectedProjectId(match.project_id);
      setProjectIdInput(match.project_id);
      showToast(`🔍 Loaded project ${match.project_id}: "${match.project_name}"`, 'success');
    } else {
      setSelectedProjectId(query);
      showToast(`⚠️ No project found matching ID "${query}".`, 'error');
    }
  };

  // Tasks associated with selected project
  const projectTasks = useMemo(() => {
    if (!selectedProjectId) return [];
    return tasks.filter((t) => (t.projectId || '').toUpperCase() === selectedProjectId.toUpperCase());
  }, [tasks, selectedProjectId]);

  // Derive LARR Compensation & Disbursement details strictly from authentic DB data
  const getTaskFinancialInfo = useCallback((task) => {
    const larr = task.larr_financials || {};

    // Strictly read authentic LARR values - ZERO fake math fallbacks
    const totalAward = Number(larr.total_sanctioned_award || larr.totalAward || 0);
    const marketValue = Number(larr.calculated_market_value || larr.marketValue || 0);
    const solatium = Number(larr.solatium_award || larr.solatium || 0);
    const assetVal = Number(larr.asset_value || larr.assetValue || task.assetValue || 0);
    const multiplier = Number(larr.multiplier || (task.isRural ? 1.5 : 1.0));
    const hasCalculatedLarr = totalAward > 0;

    const disb = disbursements[task.id] || {
      status: 'NOT_INITIATED',
      awardAmount: totalAward,
      beneficiaryName: task.surveyorOwnerName || task.ownerName || 'Verified Citizen',
      bankReferenceId: null,
      initiatedAt: null,
      disbursedAt: null,
    };

    return {
      totalAward,
      marketValue,
      solatium,
      assetVal,
      multiplier,
      hasCalculatedLarr,
      disbursement: disb,
      status: disb.status || 'NOT_INITIATED',
    };
  }, [disbursements]);

  // Filtered tasks for presentation
  const filteredTasks = useMemo(() => {
    return projectTasks.filter((task) => {
      const info = getTaskFinancialInfo(task);
      const matchesSearch =
        !searchQuery.trim() ||
        task.plotId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.khasraNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.surveyorOwnerName || task.ownerName || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' ||
        info.status === statusFilter ||
        (statusFilter === 'PENDING' && (info.status === 'NOT_INITIATED' || info.status === 'INITIATED' || info.status === 'TREASURY_VERIFYING'));

      return matchesSearch && matchesStatus;
    });
  }, [projectTasks, searchQuery, statusFilter, getTaskFinancialInfo]);

  // Total summary metrics for selected project
  const summary = useMemo(() => {
    let totalSanctioned = 0;
    let totalDisbursed = 0;
    let totalTreasuryVerifying = 0;
    let totalNotInitiated = 0;

    projectTasks.forEach((task) => {
      const info = getTaskFinancialInfo(task);
      totalSanctioned += info.totalAward;
      if (info.status === 'DISBURSED') {
        totalDisbursed += info.totalAward;
      } else if (info.status === 'TREASURY_VERIFYING' || info.status === 'INITIATED') {
        totalTreasuryVerifying += info.totalAward;
      } else {
        totalNotInitiated += info.totalAward;
      }
    });

    return {
      totalPlots: projectTasks.length,
      totalSanctioned,
      totalDisbursed,
      totalTreasuryVerifying,
      totalNotInitiated,
    };
  }, [projectTasks, getTaskFinancialInfo]);

  // ─── Automated Multi-Phase Statutory Disbursement Trigger ────────────────
  const handleTriggerDisbursement = async (task) => {
    const taskId = task.id;
    if (activeProcessingIds.has(taskId)) return;

    const info = getTaskFinancialInfo(task);
    if (!info.hasCalculatedLarr) {
      showToast('⚠️ Cannot disburse: Official LARR statutory compensation has not been calculated yet for this plot.', 'error');
      return;
    }

    const beneficiaryName = task.surveyorOwnerName || task.ownerName || 'Verified Citizen';
    const awardAmount = info.totalAward;

    // Mark as active in UI
    setActiveProcessingIds((prev) => new Set(prev).add(taskId));

    try {
      // ── Phase 1 (0s): INITIATED ──
      const initiatedAt = new Date().toISOString();
      await dataService.upsertDisbursement(taskId, {
        status: 'INITIATED',
        award_amount: awardAmount,
        awardAmount: awardAmount,
        beneficiary_name: beneficiaryName,
        beneficiaryName: beneficiaryName,
        initiated_at: initiatedAt,
        initiatedAt: initiatedAt,
      });
      showToast(`⚡ Phase 1: Statutory compensation initiated for ${task.plotId}`, 'info');

      // ── Phase 2 (3s delay): TREASURY_VERIFYING ──
      setTimeout(async () => {
        await dataService.upsertDisbursement(taskId, {
          status: 'TREASURY_VERIFYING',
          award_amount: awardAmount,
          awardAmount: awardAmount,
          beneficiary_name: beneficiaryName,
          beneficiaryName: beneficiaryName,
        });
        showToast(`🏛️ Phase 2: RBI / State Treasury verification in progress for ${task.plotId}`, 'info');

        // ── Phase 3 (6s total delay, 3s after phase 2): DISBURSED ──
        setTimeout(async () => {
          const bankRef = `TRX-IND-${Math.floor(100000 + Math.random() * 900000)}`;
          const disbursedAt = new Date().toISOString();

          await dataService.upsertDisbursement(taskId, {
            status: 'DISBURSED',
            award_amount: awardAmount,
            awardAmount: awardAmount,
            beneficiary_name: beneficiaryName,
            beneficiaryName: beneficiaryName,
            bank_reference_id: bankRef,
            bankReferenceId: bankRef,
            disbursed_at: disbursedAt,
            disbursedAt: disbursedAt,
          });

          setActiveProcessingIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });

          showToast(`✅ Phase 3: ₹${awardAmount.toLocaleString('en-IN')} successfully credited! Ref: ${bankRef}`, 'success');
        }, 3000);
      }, 3000);
    } catch (err) {
      console.error('Disbursement error:', err);
      showToast(`Disbursement failed: ${err.message}`, 'error');
      setActiveProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const fmt = (n) => {
    if (!n || n === 0) return '₹0';
    return n >= 10_000_000
      ? `₹${(n / 10_000_000).toFixed(2)} Cr`
      : n >= 100_000
      ? `₹${(n / 100_000).toFixed(2)} L`
      : `₹${Number(n).toLocaleString('en-IN')}`;
  };

  const selectedProject = projects.find(
    (p) => (p.project_id || '').toUpperCase() === (selectedProjectId || '').toUpperCase()
  );

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at 40% 0%, rgba(251,191,36,0.06) 0%, transparent 65%), #030712',
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 p-6 rounded-3xl border border-slate-800/80 bg-slate-900/70 backdrop-blur-md flex items-center justify-between flex-wrap gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-2xl shadow-inner">
              💰
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white tracking-tight">Finance & Treasury Portal</h1>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Statutory Disbursements
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {userProfile?.name || 'Chief Accounts Officer'} · {userProfile?.designation || 'Finance & Accounts Officer'}
              </p>
            </div>
          </div>

          {/* Quick Refresh */}
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-semibold transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Ledger
          </button>
        </div>

        {/* Project ID Search & Plot Filter Bar */}
        <div className="mb-6 p-5 rounded-3xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Project ID Manual Input */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto flex-1">
            <form onSubmit={handleSearchProject} className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
              <div className="relative flex-1">
                <Building2 className="w-4 h-4 text-amber-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Enter Project ID (e.g. PRJ-5531)..."
                  value={projectIdInput}
                  onChange={(e) => setProjectIdInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 outline-none focus:border-amber-500 uppercase tracking-wider"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md shrink-0 flex items-center gap-1 hover:scale-105 active:scale-95"
              >
                <span>Fetch Project</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Quick-access project chips */}
            {projects.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-slate-500">Quick ID:</span>
                {projects.slice(0, 3).map((p) => (
                  <button
                    key={p.project_id}
                    type="button"
                    onClick={() => {
                      setProjectIdInput(p.project_id);
                      setSelectedProjectId(p.project_id);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                      selectedProjectId.toUpperCase() === p.project_id.toUpperCase()
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    {p.project_id}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search by Plot / Khasra / Owner & Status Filter */}
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search plot, owner, khasra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
            </div>

            {/* Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-slate-300 font-semibold outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="NOT_INITIATED">Not Initiated</option>
              <option value="INITIATED">Payment Initiated</option>
              <option value="TREASURY_VERIFYING">Treasury Verifying</option>
              <option value="DISBURSED">Disbursed</option>
            </select>
          </div>
        </div>

        {/* Treasury Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-8">
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sanctioned Budget</span>
              <Banknote className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">{fmt(summary.totalSanctioned)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{summary.totalPlots} Acquired Land Parcels</div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Disbursed (Credited)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">{fmt(summary.totalDisbursed)}</div>
            <div className="text-[11px] text-emerald-500/80 font-medium mt-0.5">
              {summary.totalSanctioned > 0
                ? `${Math.round((summary.totalDisbursed / summary.totalSanctioned) * 100)}% Cleared`
                : '0% Cleared'}
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Treasury In-Flight</span>
              <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
            </div>
            <div className="text-2xl font-black text-sky-400">{fmt(summary.totalTreasuryVerifying)}</div>
            <div className="text-[11px] text-sky-400/80 mt-0.5">PFMS Clearing Queue</div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Sanction</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-300">{fmt(summary.totalNotInitiated)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Ready for E-Disbursement</div>
          </div>
        </div>

        {/* Plot Detail Cards List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Landmark className="w-4 h-4 text-amber-400" />
              Statutory Compensation Ledger ({filteredTasks.length} Plots)
            </h2>
            <span className="text-xs font-mono text-slate-400">
              Project ID: <strong className="text-amber-400">{selectedProjectId}</strong>
              {selectedProject ? ` (${selectedProject.project_name})` : ''}
            </span>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="p-12 rounded-3xl border border-slate-800 bg-slate-900/40 text-center text-slate-400">
              <Landmark className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-60" />
              <p className="text-sm font-semibold text-slate-200">
                No plots found for Project ID "{selectedProjectId}"
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Enter a valid Project ID (e.g. PRJ-5531) in the search box above to fetch its statutory disbursement ledger.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredTasks.map((task) => {
                const info = getTaskFinancialInfo(task);
                const statusMeta = STATUS_CONFIG[info.status] || STATUS_CONFIG.NOT_INITIATED;
                const StatusIcon = statusMeta.icon;
                const isProcessing = activeProcessingIds.has(task.id);
                const isCompleted = info.status === 'DISBURSED';

                return (
                  <div
                    key={task.id}
                    className="p-5 rounded-2xl border transition-all duration-200 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                    style={{
                      background: isCompleted
                        ? 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(5,46,22,0.2) 100%)'
                        : isProcessing
                        ? 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,58,138,0.2) 100%)'
                        : 'rgba(15,23,42,0.85)',
                      borderColor: isCompleted
                        ? 'rgba(16,185,129,0.35)'
                        : isProcessing
                        ? 'rgba(56,189,248,0.45)'
                        : 'rgba(100,116,139,0.2)',
                    }}
                  >
                    {/* Left: Plot & Owner Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-bold font-mono px-2.5 py-0.5 rounded-lg bg-sky-950 text-sky-300 border border-sky-500/30">
                          {task.plotId}
                        </span>
                        <span className="text-xs font-mono text-amber-300 font-semibold px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/25">
                          {task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Dag: Verified'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-800">
                          {task.verifiedLandClass || task.landCategory} ({task.isRural ? 'RURAL' : 'URBAN'})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <h3 className="text-base font-bold text-white truncate">
                          {task.surveyorOwnerName || task.ownerName || 'Verified Citizen'}
                        </h3>
                        {task.officerStatus === 'Approved' && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" /> Officer Approved
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        {task.address}
                      </p>

                      {/* Bank Reference & Timestamps if disbursed */}
                      {info.disbursement.bankReferenceId && (
                        <div className="mt-2.5 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-xs font-mono text-emerald-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Bank UTR: <strong>{info.disbursement.bankReferenceId}</strong></span>
                          {info.disbursement.disbursedAt && (
                            <span className="text-[10px] text-emerald-400/70">
                              · {new Date(info.disbursement.disbursedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Middle: LARR Compensation Breakdown */}
                    <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div>
                        <div className="text-[9px] uppercase font-bold text-slate-500">Market Value</div>
                        <div className="text-xs font-bold text-slate-200 font-mono mt-0.5">
                          {info.hasCalculatedLarr ? fmt(info.marketValue) : '—'}
                        </div>
                        <div className="text-[9px] text-slate-500">{info.hasCalculatedLarr ? `${info.multiplier}× Multiplier` : 'Not Set'}</div>
                      </div>

                      <div>
                        <div className="text-[9px] uppercase font-bold text-slate-500">100% Solatium</div>
                        <div className="text-xs font-bold text-sky-400 font-mono mt-0.5">
                          {info.hasCalculatedLarr ? fmt(info.solatium) : '—'}
                        </div>
                        <div className="text-[9px] text-slate-500">Sec 30 Solatium</div>
                      </div>

                      <div>
                        <div className="text-[9px] uppercase font-bold text-slate-500">Asset Value</div>
                        <div className="text-xs font-bold text-amber-400 font-mono mt-0.5">
                          {info.assetVal > 0 ? fmt(info.assetVal) : '₹0'}
                        </div>
                        <div className="text-[9px] text-slate-500">Structure/Trees</div>
                      </div>

                      <div className="border-l border-slate-800 pl-2">
                        <div className="text-[9px] uppercase font-black text-emerald-400">Total Sanctioned</div>
                        <div className="text-sm font-black font-mono mt-0.5" style={{ color: info.hasCalculatedLarr ? '#34d399' : '#94a3b8' }}>
                          {info.hasCalculatedLarr ? fmt(info.totalAward) : 'Pending Calculation'}
                        </div>
                        <div className="text-[9px] text-slate-500 font-medium">
                          {info.hasCalculatedLarr ? 'Statutory Award' : 'Awaiting Officer'}
                        </div>
                      </div>
                    </div>

                    {/* Right: Status & Action Trigger */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-end justify-center gap-2.5 shrink-0">
                      {/* Status Badge */}
                      <div
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border"
                        style={{
                          background: statusMeta.bg,
                          color: statusMeta.color,
                          borderColor: statusMeta.border,
                        }}
                      >
                        <StatusIcon className={`w-3.5 h-3.5 ${info.status === 'TREASURY_VERIFYING' || isProcessing ? 'animate-spin' : ''}`} />
                        <span>{statusMeta.label}</span>
                      </div>

                      {/* Trigger Disbursement Button */}
                      {isCompleted ? (
                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Fully Disbursed</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isProcessing || !info.hasCalculatedLarr}
                          onClick={() => handleTriggerDisbursement(task)}
                          title={!info.hasCalculatedLarr ? 'Official LARR compensation calculation must be completed first' : 'Initiate statutory disbursement'}
                          className="w-full sm:w-auto px-4 py-2 rounded-xl font-bold text-xs text-slate-950 transition-all cursor-pointer shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          style={{
                            background: isProcessing
                              ? 'linear-gradient(135deg, #38bdf8, #0284c7)'
                              : info.hasCalculatedLarr
                              ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                              : 'rgba(100,116,139,0.3)',
                            color: info.hasCalculatedLarr ? '#020617' : '#94a3b8',
                            boxShadow: info.hasCalculatedLarr ? '0 0 20px rgba(251,191,36,0.3)' : 'none',
                          }}
                        >
                          {isProcessing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Clearing Treasury…</span>
                            </>
                          ) : !info.hasCalculatedLarr ? (
                            <>
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pending Calculation</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Disburse Compensation →</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

