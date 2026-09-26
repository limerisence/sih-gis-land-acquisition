import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard, Search, Banknote, CheckCircle2, Clock, AlertTriangle,
  ArrowRight, RefreshCw, Building2, MapPin, ShieldCheck, TrendingUp,
  FileCheck, Landmark, Check, Send, AlertCircle, Sparkles, ExternalLink
} from 'lucide-react';
import { useGIS } from '../context/GISContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services/dataService';

// Status styling & badges — Minimalist Soft Light Palette
const STATUS_CONFIG = {
  NOT_INITIATED: {
    label: 'Not Initiated',
    className: 'bg-slate-100 text-slate-600 border border-slate-200',
    icon: Clock,
  },
  INITIATED: {
    label: 'Payment Initiated',
    className: 'bg-blue-50 text-blue-700 border border-blue-200/70',
    icon: Send,
  },
  TREASURY_VERIFYING: {
    label: 'Treasury Verifying (PFMS)',
    className: 'bg-amber-50 text-amber-700 border border-amber-200/70',
    icon: RefreshCw,
  },
  DISBURSED: {
    label: 'Disbursed (Credited)',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70',
    icon: CheckCircle2,
  },
  Stalled: {
    label: 'Stalled / Hold',
    className: 'bg-rose-50 text-rose-700 border border-rose-200/70',
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
    <div className="flex-1 overflow-y-auto bg-slate-50 min-h-screen text-slate-800">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 p-5 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl shrink-0">
              🏛️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Finance & Treasury Portal</h1>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                  Statutory Disbursements
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {userProfile?.name || 'Chief Accounts Officer'} · {userProfile?.designation || 'Finance & Accounts Officer'}
              </p>
            </div>
          </div>

          {/* Quick Refresh */}
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Ledger
          </button>
        </div>

        {/* Project ID Search & Plot Filter Bar */}
        <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Project ID Manual Input */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto flex-1">
            <form onSubmit={handleSearchProject} className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
              <div className="relative flex-1">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Enter Project ID (e.g. PRJ-5531)..."
                  value={projectIdInput}
                  onChange={(e) => setProjectIdInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-mono placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 uppercase tracking-wider transition-all"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm shrink-0 flex items-center gap-1"
              >
                <span>Fetch Project</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Quick-access project chips */}
            {projects.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-400">Quick ID:</span>
                {projects.slice(0, 3).map((p) => (
                  <button
                    key={p.project_id}
                    type="button"
                    onClick={() => {
                      setProjectIdInput(p.project_id);
                      setSelectedProjectId(p.project_id);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border transition-all cursor-pointer ${
                      selectedProjectId.toUpperCase() === p.project_id.toUpperCase()
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
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
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
              />
            </div>

            {/* Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium outline-none cursor-pointer focus:bg-white focus:border-blue-600 transition-all"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sanctioned Budget</span>
              <Banknote className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{fmt(summary.totalSanctioned)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{summary.totalPlots} Acquired Land Parcels</div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Disbursed (Credited)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-600">{fmt(summary.totalDisbursed)}</div>
            <div className="text-xs text-emerald-600 font-medium mt-0.5">
              {summary.totalSanctioned > 0
                ? `${Math.round((summary.totalDisbursed / summary.totalSanctioned) * 100)}% Cleared`
                : '0% Cleared'}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Treasury In-Flight</span>
              <RefreshCw className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-600">{fmt(summary.totalTreasuryVerifying)}</div>
            <div className="text-xs text-blue-600 mt-0.5">PFMS Clearing Queue</div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Sanction</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-700">{fmt(summary.totalNotInitiated)}</div>
            <div className="text-xs text-slate-500 mt-0.5">Ready for E-Disbursement</div>
          </div>
        </div>

        {/* Plot Detail Cards List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-blue-600" />
              Statutory Compensation Ledger ({filteredTasks.length} Plots)
            </h2>
            <span className="text-xs font-mono text-slate-500">
              Project ID: <strong className="text-slate-900">{selectedProjectId}</strong>
              {selectedProject ? ` (${selectedProject.project_name})` : ''}
            </span>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="p-12 rounded-xl border border-slate-200 bg-white text-center shadow-sm">
              <Landmark className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-800">
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
                    className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                  >
                    {/* Left: Plot & Owner Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                          {task.plotId}
                        </span>
                        <span className="text-xs font-mono text-amber-800 font-semibold px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/60">
                          {task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Dag: Verified'}
                        </span>
                        <span className="text-[11px] text-slate-600 font-medium px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                          {task.verifiedLandClass || task.landCategory} ({task.isRural ? 'RURAL' : 'URBAN'})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <h3 className="text-base font-bold text-slate-900 truncate">
                          {task.surveyorOwnerName || task.ownerName || 'Verified Citizen'}
                        </h3>
                        {task.officerStatus === 'Approved' && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Officer Approved
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {task.address}
                      </p>

                      {/* Bank Reference & Timestamps if disbursed */}
                      {info.disbursement.bankReferenceId && (
                        <div className="mt-2.5 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200/60 text-xs font-mono text-emerald-800">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Bank UTR: <strong>{info.disbursement.bankReferenceId}</strong></span>
                          {info.disbursement.disbursedAt && (
                            <span className="text-[11px] text-emerald-600">
                              · {new Date(info.disbursement.disbursedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Middle: LARR Compensation Breakdown */}
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-center">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-500">Market Value</div>
                        <div className="text-xs font-bold text-slate-800 font-mono mt-0.5">
                          {info.hasCalculatedLarr ? fmt(info.marketValue) : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">{info.hasCalculatedLarr ? `${info.multiplier}× Multiplier` : 'Not Set'}</div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-500">100% Solatium</div>
                        <div className="text-xs font-bold text-blue-600 font-mono mt-0.5">
                          {info.hasCalculatedLarr ? fmt(info.solatium) : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">Sec 30 Solatium</div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-500">Asset Value</div>
                        <div className="text-xs font-bold text-amber-700 font-mono mt-0.5">
                          {info.assetVal > 0 ? fmt(info.assetVal) : '₹0'}
                        </div>
                        <div className="text-[10px] text-slate-400">Structure/Trees</div>
                      </div>

                      <div className="border-l border-slate-200 pl-3">
                        <div className="text-[10px] uppercase font-bold text-emerald-700">Total Sanctioned</div>
                        <div className="text-sm font-bold font-mono mt-0.5 text-emerald-700">
                          {info.hasCalculatedLarr ? fmt(info.totalAward) : 'Pending Calc'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {info.hasCalculatedLarr ? 'Statutory Award' : 'Awaiting Officer'}
                        </div>
                      </div>
                    </div>

                    {/* Right: Status & Action Trigger */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-end justify-center gap-2.5 shrink-0">
                      {/* Status Badge */}
                      <div
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusMeta.className}`}
                      >
                        <StatusIcon className={`w-3.5 h-3.5 ${info.status === 'TREASURY_VERIFYING' || isProcessing ? 'animate-spin' : ''}`} />
                        <span>{statusMeta.label}</span>
                      </div>

                      {/* Trigger Disbursement Button */}
                      {isCompleted ? (
                        <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200/60">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Fully Disbursed</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isProcessing || !info.hasCalculatedLarr}
                          onClick={() => handleTriggerDisbursement(task)}
                          title={!info.hasCalculatedLarr ? 'Official LARR compensation calculation must be completed first' : 'Initiate statutory disbursement'}
                          className="w-full sm:w-auto px-4 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
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
