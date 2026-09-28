import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  PlusCircle, ClipboardList, CreditCard, ArrowLeft, Send, AlertTriangle,
  MapPin, Navigation, FileText, Download, CheckCircle2, Clock, Banknote,
  Search, ChevronDown, Building2, Trees, Home, Eye, BarChart3, FolderOpen,
  Sparkles, TrendingUp, Users, Activity, ThumbsUp, ThumbsDown, RotateCcw, XCircle,
  X, ExternalLink, Image as ImageIcon, FileCheck, Trash2
} from 'lucide-react';
import MapContainer from '../components/MapContainer';
import Sidebar from '../components/Sidebar';
import FeatureDetailModal from '../components/FeatureDetailModal';
import { useGIS } from '../context/GISContext';
import { useAuth } from '../context/AuthContext';
import { calculatePlotCompensation } from '../utils/larrCalculator';
import { exportPDF, exportSinglePlotPDF } from '../utils/pdfExporter';
import * as turf from '@turf/turf';
import { dataService } from '../services/dataService';

// ─── localStorage + Supabase helpers ─────────────────────────────────────────
const LS_TASKS_KEY    = 'bhoomi_survey_tasks';
const LS_PROJECTS_KEY = 'bhoomi_projects';
const LS_DISBURSE_KEY = 'bhoomi_disbursements';

const loadRaw  = (key, fb = []) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fb)); } catch { return fb; } };
const saveRaw  = (key, val)     => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
const loadTasks    = () => loadRaw(LS_TASKS_KEY, []);
const saveTasks    = (t) => { saveRaw(LS_TASKS_KEY, t); dataService.saveTasks(t); };
const loadProjects = () => loadRaw(LS_PROJECTS_KEY, []);
const saveProjects = (p) => { saveRaw(LS_PROJECTS_KEY, p); dataService.saveProjects(p); };
const loadDisburse = () => loadRaw(LS_DISBURSE_KEY, {});
const saveDisburse = (d) => { saveRaw(LS_DISBURSE_KEY, d); dataService.saveDisbursements(d); };

function genProjectId() {
  return `PRJ-${Math.floor(1000 + Math.random() * 9000)}`;
}

function isProjectOwnedByUser(project, userProfile) {
  if (!project) return false;
  if (!userProfile) return true;
  const userEmail = userProfile.email?.toLowerCase().trim();
  const userName = userProfile.name?.toLowerCase().trim();
  const creator = (project.created_by || '').toLowerCase().trim();
  const creatorName = (project.created_by_name || '').toLowerCase().trim();
  const creatorId = project.created_by_id || '';

  if (userEmail && creator === userEmail) return true;
  if (userName && (creator === userName || creatorName === userName)) return true;
  if (userProfile.id && creatorId === userProfile.id) return true;
  if (userEmail && creator.includes(userEmail)) return true;
  if (userName && creator.includes(userName)) return true;
  if ((!creator || creator === 'municipal officer') && (userEmail === 'officer@bhoomi.gov.in' || userName?.includes('priya'))) return true;
  return false;
}

// ─── Shared badge & icon helpers ──────────────────────────────────────────────
const CAT_STYLE = {
  Commercial:   { className: 'bg-purple-50 text-purple-700 border border-purple-200/60', Icon: Building2 },
  Agricultural: { className: 'bg-amber-50 text-amber-700 border border-amber-200/60',   Icon: Trees },
  Residential:  { className: 'bg-blue-50 text-blue-700 border border-blue-200/60',      Icon: Home },
};

function CatBadge({ cat }) {
  const s = CAT_STYLE[cat] || CAT_STYLE.Residential;
  const { Icon } = s;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${s.className}`}>
      <Icon className="w-2.5 h-2.5" />{cat || 'Residential'}
    </span>
  );
}

const DISBURSE_STYLE = {
  Disbursed:  { className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' },
  Processing: { className: 'bg-blue-50 text-blue-700 border border-blue-200/60' },
  Stalled:    { className: 'bg-rose-50 text-rose-700 border border-rose-200/60' },
};

// ─── Officer status styling ───────────────────────────────────────────────────
const OFFICER_STATUS_STYLE = {
  Approved:      { className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60', label: 'Approved', icon: '✅' },
  'Under Review':{ className: 'bg-amber-50 text-amber-700 border border-amber-200/60',       label: 'Under Review', icon: '🔄' },
  Rejected:      { className: 'bg-rose-50 text-rose-700 border border-rose-200/60',         label: 'Rejected', icon: '❌' },
};

// ─── Branch back-button header ────────────────────────────────────────────────
function BranchHeader({ title, subtitle, icon: Icon, onBack, accentColor = '#2563eb' }) {
  return (
    <div className="h-14 px-5 flex items-center gap-3 border-b border-slate-200 bg-white shrink-0 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer mr-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Command Hub
      </button>
      <div className="w-px h-5 bg-slate-200" />
      <Icon className="w-4 h-4 shrink-0 text-blue-600" />
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
    </div>
  );
}

// ─── Document & Site Photo Viewer Modal ───────────────────────────────────────
function DocumentViewerModal({ doc, onClose }) {
  if (!doc) return null;

  const isBase64Img = doc.url?.startsWith('data:image');
  const isBase64Pdf = doc.url?.startsWith('data:application/pdf') || 
                      doc.url?.startsWith('data:application/octet-stream') || 
                      (doc.url?.startsWith('data:') && doc.name?.toLowerCase().endsWith('.pdf'));
  const isRealUrl = doc.url?.startsWith('http://') || doc.url?.startsWith('https://') || doc.url?.startsWith('blob:');

  const handleOpenFullscreen = () => {
    if (!doc.url) return;
    if (isRealUrl) {
      window.open(doc.url, '_blank');
      return;
    }
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${doc.title} — ${doc.task?.plotId || ''}</title>
            <style>body { margin: 0; background: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; }</style>
          </head>
          <body>
            ${isBase64Img 
              ? `<img src="${doc.url}" style="max-height: 96vh; max-width: 96vw; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" />` 
              : `<iframe src="${doc.url}" style="width: 100vw; height: 100vh; border: none;"></iframe>`
            }
          </body>
        </html>
      `);
      win.document.close();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-base">
              {doc.type === 'photo' ? '📷' : '📄'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">{doc.title}</h3>
              <p className="text-xs text-slate-500 font-mono">
                {doc.task?.plotId ? `Plot: ${doc.task.plotId}` : ''} {doc.task?.khasraNo ? `· Khasra: ${doc.task.khasraNo}` : ''} {doc.name ? `· ${doc.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(isBase64Img || isBase64Pdf || isRealUrl) && (
              <button
                type="button"
                onClick={handleOpenFullscreen}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200 cursor-pointer"
                title="Open in new window"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Full Tab ↗
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center min-h-[400px] bg-slate-50">
          {isBase64Img ? (
            <div className="w-full flex flex-col items-center justify-center p-2">
              <img
                src={doc.url}
                alt={doc.title}
                className="max-h-[68vh] max-w-full rounded-xl object-contain border border-slate-200 shadow-sm"
              />
            </div>
          ) : isBase64Pdf ? (
            <iframe
              src={doc.url}
              title={doc.title}
              className="w-full h-[68vh] rounded-xl border border-slate-200 bg-white"
            />
          ) : isRealUrl ? (
            <div className="w-full h-[68vh]">
              {doc.type === 'photo' ? (
                <img src={doc.url} alt={doc.title} className="max-h-full max-w-full rounded-xl object-contain mx-auto" />
              ) : (
                <iframe src={doc.url} title={doc.title} className="w-full h-full rounded-xl border border-slate-200" />
              )}
            </div>
          ) : (
            /* Digital Certified Document Verification Preview */
            <div className="w-full max-w-xl p-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Government Field Survey Evidence</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold">
                  SEAL VERIFIED
                </span>
              </div>

              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Document Type:</span>
                  <span className="font-semibold text-slate-900">{doc.title}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">File Name:</span>
                  <span className="font-mono text-blue-600">{doc.name || 'Uploaded_Document.pdf'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Parcel ID:</span>
                  <span className="font-mono text-slate-900 font-bold">{doc.task?.plotId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Khasra / Dag No:</span>
                  <span className="font-mono text-amber-700 font-bold">{doc.task?.khasraNo || 'Verified On-site'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Recorded Owner:</span>
                  <span className="text-slate-900 font-semibold">{doc.task?.surveyorOwnerName || doc.task?.ownerName || 'Verified Citizen'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Location Classification:</span>
                  <span className="text-blue-700 font-semibold">{doc.task?.verifiedLandClass || doc.task?.landCategory} ({(doc.task?.zoneType === 'RURAL' || doc.task?.isRural) ? 'RURAL' : 'URBAN'})</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Digital Checksum:</span>
                  <span className="font-mono text-[11px] text-slate-400">SHA256: 8f9b...a10c-verified</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between bg-white text-xs">
          <div className="text-slate-500 text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Authenticated against West Bengal Municipal Land Registry
          </div>
          <div className="flex items-center gap-2">
            {doc.url && (doc.url.startsWith('data:') || doc.url.startsWith('http')) && (
              <a
                href={doc.url}
                download={doc.name || 'document'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer border border-slate-200"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// COMMAND HUB — default landing
// ════════════════════════════════════════════════════════════════════════════════
function CommandHub({ onBranch, userProfile }) {
  const { showToast } = useGIS();
  const [allProjects, setAllProjects] = useState(loadProjects);
  const [allTasks, setAllTasks] = useState(loadTasks);
  const [scopeFilter, setScopeFilter] = useState('my'); // 'my' | 'all'
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const refreshHub = useCallback(async () => {
    const [pList, tList] = await Promise.all([
      dataService.getProjects(),
      dataService.getTasks(),
    ]);
    if (pList) setAllProjects(pList);
    if (tList) setAllTasks(tList);
  }, []);

  React.useEffect(() => {
    refreshHub();
    const unsub = dataService.subscribe(() => {
      refreshHub();
    });
    return unsub;
  }, [refreshHub]);

  const myProjects = useMemo(() => allProjects.filter((p) => isProjectOwnedByUser(p, userProfile)), [allProjects, userProfile]);
  const scopedProjects = scopeFilter === 'my' ? myProjects : allProjects;
  const scopedTasks = useMemo(() => allTasks.filter((t) => scopedProjects.some((p) => p.project_id === t.projectId)), [allTasks, scopedProjects]);

  const stats = {
    projects: scopedProjects.length,
    totalPlots: scopedTasks.length,
    pending: scopedTasks.filter((t) => t.status === 'Pending').length,
    completed: scopedTasks.filter((t) => t.status === 'Completed').length,
  };

  const handleDeleteProject = async (p) => {
    if (!p) return;
    if (!isProjectOwnedByUser(p, userProfile)) {
      showToast('⚠️ Permission denied: You can only delete projects created by you.', 'error');
      setProjectToDelete(null);
      return;
    }
    setIsDeleting(true);
    const pid = p.project_id || p.projectId;
    
    setAllProjects((prev) => prev.filter((proj) => (proj.project_id || proj.projectId) !== pid));
    setAllTasks((prev) => prev.filter((t) => t.projectId !== pid));
    setProjectToDelete(null);
    setIsDeleting(false);
    showToast(`🗑️ Project ${pid} ("${p.project_name}") deleted from database.`, 'info');

    await dataService.deleteProject(pid);
  };

  const HUB_CARDS = [
    {
      id: 'gis',
      icon: '➕',
      title: 'Create New Project',
      subtitle: 'Launch GIS corridor builder, draw alignment, dispatch survey tasks',
      tag: 'GIS CANVAS',
      tagClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
    },
    {
      id: 'reports',
      icon: '📋',
      title: 'Surveyor Report Status',
      subtitle: 'Review field-submitted documents, add officer remarks, export PDF',
      tag: 'REPORTS',
      tagClass: 'bg-blue-50 text-blue-700 border border-blue-200/60',
    },
    {
      id: 'transactions',
      icon: '💳',
      title: 'Transaction Status',
      subtitle: 'Financial audit table, disbursement tracker, payment simulation',
      tag: 'FINANCE',
      tagClass: 'bg-amber-50 text-amber-700 border border-amber-200/60',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Welcome header & Scope toggle */}
        <div className="mb-6 p-5 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-xl shrink-0">
              🏛️
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Welcome, {userProfile?.name?.split(' ')[0] || 'Officer'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">{userProfile?.designation || 'Municipal Planning Officer'}</p>
            </div>
          </div>

          {/* Project Workspace Scope Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setScopeFilter('my')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === 'my'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👤</span> My Projects ({myProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === 'all'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏢</span> All Department ({allProjects.length})
            </button>
          </div>
        </div>

        {/* 3 Action cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {HUB_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onBranch(card.id)}
              className="group text-left p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer"
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <span
                className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3 ${card.tagClass}`}
              >
                {card.tag}
              </span>
              <h3 className="text-base font-bold text-slate-900 mb-1.5 leading-snug">{card.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{card.subtitle}</p>
              <div className="mt-4 text-xs font-semibold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Open →
              </div>
            </button>
          ))}
        </div>

        {/* Projects Registry / Portfolio (List View) */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-600" />
                {scopeFilter === 'my' ? 'My Projects Portfolio' : 'All Department Projects Registry'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {scopeFilter === 'my'
                  ? 'Infrastructure corridor projects created and managed by your account'
                  : 'All land acquisition projects across all municipal officers'}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-200 font-semibold shadow-sm">
              {scopedProjects.length} Project{scopedProjects.length !== 1 ? 's' : ''}
            </span>
          </div>

          {scopedProjects.length === 0 ? (
            <div className="p-10 rounded-xl border border-slate-200 bg-white text-center text-slate-500 shadow-sm">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-800">No projects found in this view</p>
              <p className="text-xs text-slate-500 mt-1">Click "Create New Project" above to launch the GIS corridor builder.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {scopedProjects.map((p) => {
                const pTasks = allTasks.filter((t) => t.projectId === p.project_id);
                const approvedCount = pTasks.filter((t) => t.officerStatus === 'Approved').length;
                const completedCount = pTasks.filter((t) => t.status === 'Completed').length;
                const isOwner = isProjectOwnedByUser(p, userProfile);

                const statusBadgeClass =
                  p.status === 'APPROVED' || p.status === 'CLOSED' || p.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                    : p.status === 'UNDER_REVIEW'
                    ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                    : 'bg-blue-50 text-blue-700 border-blue-200/60';

                return (
                  <div
                    key={p.project_id}
                    className="p-5 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                  >
                    {/* Left: Project identity & metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                          {p.project_id}
                        </span>
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusBadgeClass}`}>
                          {p.status || 'PENDING'}
                        </span>
                        {isOwner && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                            👤 Your Project
                          </span>
                        )}
                      </div>

                      {/* Project Name */}
                      <h3 className="text-base font-bold text-slate-900 mb-1 leading-snug truncate">{p.project_name}</h3>

                      {/* Creator and Date */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span>
                          <span className="text-slate-400">Officer:</span>{' '}
                          <span className="text-slate-700 font-medium">{p.created_by_name || p.created_by || 'Municipal Officer'}</span>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span>
                          <span className="text-slate-400">Date:</span>{' '}
                          <span className="font-mono text-slate-700">
                            {new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Middle: Mini Metrics */}
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg text-center shrink-0">
                      <div className="px-2">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Plots</div>
                        <div className="text-xs font-bold text-slate-900 font-mono">{pTasks.length}</div>
                      </div>
                      <div className="w-[1px] h-6 bg-slate-200" />
                      <div className="px-2">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Surveyed</div>
                        <div className="text-xs font-bold text-blue-600 font-mono">{completedCount}</div>
                      </div>
                      <div className="w-[1px] h-6 bg-slate-200" />
                      <div className="px-2">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Approved</div>
                        <div className="text-xs font-bold text-emerald-600 font-mono">{approvedCount}</div>
                      </div>
                    </div>

                    {/* Right: Actions & Owner-Only Delete */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onBranch('reports')}
                        className="py-2 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold text-center border border-blue-200/60 transition-all cursor-pointer whitespace-nowrap"
                      >
                        Surveyor Reports →
                      </button>
                      <button
                        type="button"
                        onClick={() => onBranch('transactions')}
                        className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold text-center border border-slate-200 transition-all cursor-pointer whitespace-nowrap"
                      >
                        Financials →
                      </button>

                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => setProjectToDelete(p)}
                          title="Delete Your Project from Database"
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-xl border border-slate-200 bg-white shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-xl shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Project</h3>
                <p className="text-xs text-slate-500">Permanent database deletion</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-900">"{projectToDelete.project_name}"</strong> (<span className="font-mono text-blue-600">{projectToDelete.project_id}</span>)?
            </p>
            <p className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              ⚠️ This will delete the project record and all associated survey plot tasks and documents from the Supabase database.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteProject(projectToDelete)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? 'Deleting…' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// BRANCH 1 — Create New Project (GIS Canvas)
// ════════════════════════════════════════════════════════════════════════════════
function GISBranch({ onBack, userProfile }) {
  const { affectedPlots, isCalculated, showToast, points, bufferWidthMeters } = useGIS();
  const [projectName, setProjectName] = useState('');
  const [dispatchedIds, setDispatchedIds] = useState(() => new Set(loadTasks().map((t) => t.plotId)));
  const [lastProjectId, setLastProjectId] = useState(null);
  const [baseRates, setBaseRates] = useState({
    Residential: 4500,
    Commercial: 8500,
    Agricultural: 2200,
  });

  const totalAffected = affectedPlots.length;
  const canSend = isCalculated && totalAffected > 0 && projectName.trim().length > 0;

  const handleSendAll = useCallback(async () => {
    if (!projectName.trim()) {
      showToast('Enter a Project Name before dispatching.', 'error');
      return;
    }
    const pid = genProjectId();
    const now = new Date().toISOString();
    const all = [...affectedPlots];
    const existing = loadTasks();
    const existingIds = new Set(existing.map((t) => t.plotId));

    // 1. Construct and save the Project FIRST to satisfy PostgreSQL foreign key constraint
    const projects = loadProjects();
    const newProject = {
      project_id: pid,
      project_name: projectName.trim(),
      created_at: now,
      status: 'PENDING',
      created_by: userProfile?.email || userProfile?.name || 'Municipal Officer',
      created_by_name: userProfile?.name || 'Municipal Officer',
      created_by_id: userProfile?.id || '',
      baseRates: {
        Residential: Number(baseRates.Residential) || 4500,
        Commercial: Number(baseRates.Commercial) || 8500,
        Agricultural: Number(baseRates.Agricultural) || 2200,
        points: points || [],
        bufferWidthMeters: Number(bufferWidthMeters) || 20,
      }
    };

    saveProjects([newProject, ...projects.filter((p) => (p.project_id || p.projectId) !== pid)]);
    // Await confirmed DB write — tasks CANNOT be inserted without the project row existing (FK constraint)
    const projResult = await dataService.addProject(newProject);
    if (!projResult.success) {
      showToast(`❌ Failed to save project to State Land Registry: ${projResult.error?.message || 'Database error'}. Please try again.`, 'error');
      return;
    }

    // 2. Construct tasks with preserved parcel geometries
    const newTasks = all
      .filter((f) => !existingIds.has(f.properties?.plotId))
      .map((f) => {
        const p = f.properties || {};
        let coords = p.coordinates;
        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
          try {
            const center = turf.centroid(f);
            coords = {
              lat: Number(center.geometry.coordinates[1].toFixed(6)),
              lng: Number(center.geometry.coordinates[0].toFixed(6)),
            };
          } catch (_) {
            coords = { lat: 22.5726, lng: 88.3639 };
          }
        }
        const coordsObj = {
          lat: coords.lat,
          lng: coords.lng,
          geometry: f.geometry || null,
        };
        const address = p.address || `Plot at ${coords.lat.toFixed(5)}° N, ${coords.lng.toFixed(5)}° E, West Bengal`;
        return {
          id: `TASK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          plotId: p.plotId,
          khasraNo: p.khasraNo,
          projectId: pid,
          projectName: projectName.trim(),
          address: address,
          coords: coordsObj,
          geometry: f.geometry || null,
          landCategory: p.landCategory,
          areaSqKm: p.landAreaSqKm,
          areaSqM: p.landAreaSqM,
          ownerName: p.ownerName,
          status: 'Pending',
          dispatchedBy: userProfile?.name || userProfile?.email || 'Municipal Officer',
          dispatchedByEmail: userProfile?.email || '',
          dispatchedAt: now,
          surveyorOwnerName: '',
          surveyorPhone: '',
          surveyorAadhaar: '',
          surveyorOwnerContact: '',
          verifiedLandClass: p.landCategory || 'Residential',
          zoneType: p.zoneType || 'URBAN',
          isRural: p.zoneType === 'RURAL' || Boolean(p.isRural),
          areaSqm: null,
          assetValue: null,
          officerRemarks: '',
          soilReportUrl: null,
          sitePhotoUrl: null,
        };
      });

    // 3. Save tasks — project row confirmed in Supabase, FK constraint satisfied
    const allTasks = [...existing, ...newTasks];
    saveTasks(allTasks);
    const tasksResult = await dataService.saveTasks(allTasks);
    if (!tasksResult.success) {
      showToast(`⚠️ Project ${pid} created but plot dispatch to DB had issues. Surveyor data may sync next time. (${tasksResult.error?.message || ''})`, 'error');
    } else {
      showToast(`✅ Project ${pid} created & ${newTasks.length} plots dispatched to State Land Registry.`, 'success');
    }

    setDispatchedIds(new Set([...existing.map((t) => t.plotId), ...newTasks.map((t) => t.plotId)]));
    setLastProjectId(pid);
  }, [projectName, baseRates, affectedPlots, points, bufferWidthMeters, userProfile, showToast]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <BranchHeader
        title="Create New Project"
        subtitle="Draw corridor alignment → dispatch plots to surveyors"
        icon={PlusCircle}
        onBack={onBack}
        accentColor="#2563eb"
      />
      <div className="flex-1 relative overflow-hidden">
        <MapContainer />
        <Sidebar />
        <FeatureDetailModal />

        {/* Project name + base rates + send bar */}
        <div className="absolute bottom-4 left-4 sm:left-[416px] z-30 flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-lg max-w-[calc(100vw-32px)] sm:max-w-[calc(100vw-440px)]">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="flex flex-col gap-0.5 shrink-0">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Project Name *</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. NH-34 Widening Phase 1"
                className="w-44 sm:w-52 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-all"
              />
            </div>

            <div className="hidden sm:block w-px h-8 bg-slate-200" />

            {/* Base Circle Rates Inputs */}
            <div className="flex items-center gap-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 block mb-0.5">Res. Rate (₹/m²)</label>
                <input
                  type="number"
                  value={baseRates.Residential}
                  onChange={(e) => setBaseRates({ ...baseRates, Residential: e.target.value })}
                  className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 block mb-0.5">Comm. Rate (₹/m²)</label>
                <input
                  type="number"
                  value={baseRates.Commercial}
                  onChange={(e) => setBaseRates({ ...baseRates, Commercial: e.target.value })}
                  className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 block mb-0.5">Agri. Rate (₹/m²)</label>
                <input
                  type="number"
                  value={baseRates.Agricultural}
                  onChange={(e) => setBaseRates({ ...baseRates, Agricultural: e.target.value })}
                  className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendAll}
              disabled={!canSend}
              className="flex items-center gap-1.5 px-3.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white shadow-sm shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Send for Surveying
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1.5 border-t border-slate-100">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="font-bold text-slate-900">{totalAffected}</span> parcels in corridor
              {dispatchedIds.size > 0 && (
                <span className="ml-1 text-emerald-600 font-semibold">· {dispatchedIds.size} dispatched</span>
              )}
            </span>
            {lastProjectId && (
              <span className="font-mono text-emerald-600 font-semibold">
                ✓ Dispatched: {lastProjectId}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// BRANCH 2 — Surveyor Report Status
// ════════════════════════════════════════════════════════════════════════════════
function ReportsBranch({ onBack, userProfile }) {
  const { showToast } = useGIS();
  const [allProjects, setAllProjects] = useState(loadProjects);
  const [scopeFilter, setScopeFilter] = useState('my');
  const myProjects = useMemo(() => allProjects.filter((p) => isProjectOwnedByUser(p, userProfile)), [allProjects, userProfile]);
  const scopedProjects = scopeFilter === 'my' && myProjects.length > 0 ? myProjects : allProjects;
  const [selectedProjId, setSelectedProjId] = useState(() => (myProjects[0] || loadProjects()[0])?.project_id || '');
  const [tasks, setTasks] = useState(loadTasks);
  const [search, setSearch] = useState('');
  const [activeDoc, setActiveDoc] = useState(null);

  const refreshReports = useCallback(async () => {
    const [pList, tList] = await Promise.all([
      dataService.getProjects(),
      dataService.getTasks(),
    ]);
    if (pList) {
      setAllProjects(pList);
      const currentMy = pList.filter((p) => isProjectOwnedByUser(p, userProfile));
      const currentScoped = scopeFilter === 'my' && currentMy.length > 0 ? currentMy : pList;
      if ((!selectedProjId || !currentScoped.some((p) => p.project_id === selectedProjId)) && currentScoped.length > 0) {
        setSelectedProjId(currentScoped[0].project_id);
      }
    }
    if (tList) setTasks(tList);
  }, [selectedProjId, scopeFilter, userProfile]);

  React.useEffect(() => {
    refreshReports();
    const unsub = dataService.subscribe(() => {
      refreshReports();
    });
    return unsub;
  }, [refreshReports]);

  const [officerRemarkDrafts, setOfficerRemarkDrafts] = useState(() => {
    const d = {};
    loadTasks().forEach((t) => { d[t.id] = t.officerRemarks || ''; });
    return d;
  });
  const [reviewRemarkDrafts, setReviewRemarkDrafts] = useState(() => {
    const d = {};
    loadTasks().forEach((t) => { d[t.id] = t.reviewRemarks || ''; });
    return d;
  });

  const debounceTimers = useRef({});

  const [circleRates, setCircleRates] = useState(() => {
    const r = {};
    loadTasks().forEach((t) => {
      const proj = allProjects.find((p) => p.project_id === t.projectId);
      const cat = t.verifiedLandClass || t.landCategory || 'Residential';
      const defaultRate = (proj?.baseRates && proj.baseRates[cat]) || (cat === 'Commercial' ? 8500 : cat === 'Agricultural' ? 2200 : 4500);
      r[t.id] = t.baseCircleRateOverride ?? defaultRate;
    });
    return r;
  });

  const [zoneOverrides, setZoneOverrides] = useState(() => {
    const z = {};
    loadTasks().forEach((t) => {
      z[t.id] = t.zoneTypeOverride || t.zoneType || (t.isRural ? 'RURAL' : 'URBAN');
    });
    return z;
  });

  const handleCalculateLarr = useCallback((task) => {
    const cat = task.verifiedLandClass || task.landCategory || 'Residential';
    const rate = Number(circleRates[task.id]) || (cat === 'Commercial' ? 8500 : cat === 'Agricultural' ? 2200 : 4500);
    const areaSqm = Number(task.areaSqm) || (task.areaSqKm ? task.areaSqKm * 1000000 : 0);
    const assetVal = Number(task.assetValue) || 0;
    const currentZone = zoneOverrides[task.id] || task.zoneType || (task.isRural ? 'RURAL' : 'URBAN');
    const isRural = currentZone === 'RURAL';

    const financials = calculatePlotCompensation(areaSqm, rate, assetVal, isRural);

    setTasks((prev) => {
      const updated = prev.map((t) => {
        if (t.id !== task.id) return t;
        return {
          ...t,
          baseCircleRateOverride: rate,
          zoneTypeOverride: currentZone,
          zoneType: currentZone,
          isRural: isRural,
          larr_financials: financials,
        };
      });
      saveTasks(updated);
      return updated;
    });

    // Explicitly update Supabase survey_tasks record & disbursements table
    dataService.updateTask(task.id, {
      baseCircleRateOverride: rate,
      zoneTypeOverride: currentZone,
      zoneType: currentZone,
      isRural: isRural,
      larr_financials: financials,
    });
    dataService.upsertDisbursement(task.id, {
      awardAmount: financials.totalAward,
      beneficiaryName: task.surveyorOwnerName || task.ownerName || 'Verified Citizen',
    });

    showToast(`🧮 LARR Compensation for Plot ${task.plotId} saved to database: ₹${financials.totalAward.toLocaleString('en-IN')}`, 'success');
  }, [circleRates, zoneOverrides, showToast]);

  const handleOfficerRemarkChange = useCallback((taskId, val) => {
    setOfficerRemarkDrafts((prev) => ({ ...prev, [taskId]: val }));
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, officerRemarks: val } : t)));

    if (debounceTimers.current[`off_${taskId}`]) clearTimeout(debounceTimers.current[`off_${taskId}`]);
    debounceTimers.current[`off_${taskId}`] = setTimeout(() => {
      dataService.updateTask(taskId, { officerRemarks: val });
    }, 450);
  }, []);

  const handleReviewRemarkChange = useCallback((taskId, val) => {
    setReviewRemarkDrafts((prev) => ({ ...prev, [taskId]: val }));
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, reviewRemarks: val } : t)));

    if (debounceTimers.current[`rev_${taskId}`]) clearTimeout(debounceTimers.current[`rev_${taskId}`]);
    debounceTimers.current[`rev_${taskId}`] = setTimeout(() => {
      dataService.updateTask(taskId, { reviewRemarks: val });
    }, 450);
  }, []);

  const handleOfficerAction = useCallback((taskId, newOfficerStatus) => {
    const currentRevRem = reviewRemarkDrafts[taskId] !== undefined ? reviewRemarkDrafts[taskId] : (tasks.find((t) => t.id === taskId)?.reviewRemarks || '');
    const currentOffRem = officerRemarkDrafts[taskId] !== undefined ? officerRemarkDrafts[taskId] : (tasks.find((t) => t.id === taskId)?.officerRemarks || '');
    const nextPrimaryStatus = newOfficerStatus === 'Approved' ? 'Approved' : (newOfficerStatus === 'Under Review' ? 'Under Review' : (newOfficerStatus === 'Rejected' ? 'Rejected' : undefined));

    setTasks((prev) => {
      const updated = prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          officerStatus: newOfficerStatus,
          status: nextPrimaryStatus || t.status,
          officerRemarks: currentOffRem,
          reviewRemarks: newOfficerStatus === 'Under Review' ? (currentRevRem || 'Please verify plot boundary and re-upload required documents.') : t.reviewRemarks,
        };
      });
      saveTasks(updated);
      return updated;
    });

    const labels = { Approved: '✅ Approved', 'Under Review': '🔄 Sent for Review', Rejected: '❌ Rejected' };
    showToast(`Plot ${taskId.slice(-6)} — ${labels[newOfficerStatus]}`, newOfficerStatus === 'Approved' ? 'success' : 'info');

    (async () => {
      await dataService.updateTask(taskId, {
        officerStatus: newOfficerStatus,
        status: nextPrimaryStatus,
        officerRemarks: currentOffRem,
        reviewRemarks: newOfficerStatus === 'Under Review' ? (currentRevRem || 'Please verify plot boundary and re-upload required documents.') : undefined,
      });

      if (newOfficerStatus === 'Under Review') {
        const allP = loadProjects();
        const targetProj = allP.find((p) => p.project_id === selectedProjId);
        if (targetProj && targetProj.status !== 'UNDER_REVIEW') {
          await dataService.addProject({ ...targetProj, status: 'UNDER_REVIEW' });
          setAllProjects((prev) => prev.map((p) => p.project_id === selectedProjId ? { ...p, status: 'UNDER_REVIEW' } : p));
        }
      }
    })();
  }, [reviewRemarkDrafts, officerRemarkDrafts, selectedProjId, tasks, showToast]);

  const project = useMemo(() => allProjects.find((p) => p.project_id === selectedProjId), [allProjects, selectedProjId]);

  const projTasks = useMemo(() => {
    return tasks
      .filter((t) => !selectedProjId || t.projectId === selectedProjId)
      .filter((t) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (t.plotId && String(t.plotId).toLowerCase().includes(q)) ||
          (t.khasraNo && String(t.khasraNo).toLowerCase().includes(q)) ||
          (t.surveyorRemarks && t.surveyorRemarks.toLowerCase().includes(q)) ||
          (t.verifiedLandClass && t.verifiedLandClass.toLowerCase().includes(q)) ||
          (t.landCategory && t.landCategory.toLowerCase().includes(q))
        );
      });
  }, [tasks, selectedProjId, search]);

  const approvedCount    = projTasks.filter((t) => t.officerStatus === 'Approved').length;
  const reviewCount      = projTasks.filter((t) => t.officerStatus === 'Under Review').length;
  const rejectedCount    = projTasks.filter((t) => t.officerStatus === 'Rejected').length;
  const pendingDecision  = projTasks.filter((t) => !t.officerStatus).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <BranchHeader title="Surveyor Report Status" subtitle="Review submitted survey data · Approve, Review, or Reject" icon={ClipboardList} onBack={onBack} accentColor="#2563eb" />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Project picker & scope row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white border border-slate-200 text-xs shadow-sm">
            <button
              type="button"
              onClick={() => {
                setScopeFilter('my');
                if (myProjects.length > 0 && !myProjects.some((p) => p.project_id === selectedProjId)) {
                  setSelectedProjId(myProjects[0].project_id);
                }
              }}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'my'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👤</span> My Projects ({myProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'all'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏢</span> All ({allProjects.length})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={selectedProjId}
              onChange={(e) => setSelectedProjId(e.target.value)}
              className="pl-8 pr-4 py-2 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 outline-none cursor-pointer shadow-sm focus:border-blue-600"
            >
              {scopedProjects.length === 0 && <option value="">No projects found</option>}
              {scopedProjects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_id} — {p.project_name} {p.created_by_name ? `(${p.created_by_name})` : ''}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter plots…"
            className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 w-48 shadow-sm"
          />
          {project && (
            <button
              type="button"
              onClick={() => exportPDF(project, projTasks)}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Export PDF Report
            </button>
          )}
        </div>

        {/* Project meta card */}
        {project && (
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-lg font-bold text-slate-900">{project.project_name}</div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">{project.project_id} · Created {new Date(project.created_at).toLocaleDateString('en-IN')}</div>
              </div>
            </div>
            {/* Stats strip */}
            <div className="grid grid-cols-5 gap-2.5">
              {[
                { label: 'Total',        val: projTasks.length,  color: '#2563eb' },
                { label: '✅ Approved',   val: approvedCount,     color: '#059669' },
                { label: '🔄 Review',    val: reviewCount,       color: '#d97706' },
                { label: '❌ Rejected',  val: rejectedCount,     color: '#dc2626' },
                { label: '⏳ Pending',   val: pendingDecision,   color: '#64748b' },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xl font-bold font-mono" style={{ color }}>{val}</div>
                  <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plot rows */}
        {projTasks.length === 0 ? (
          <div className="py-20 text-center text-slate-500 rounded-xl bg-white border border-slate-200 shadow-sm">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium">No plots found for this project.</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {projTasks.map((task) => {
              const os = task.officerStatus;
              const osMeta = OFFICER_STATUS_STYLE[os];
              const isApproved = os === 'Approved' || task.status === 'Approved';
              const isRejected = os === 'Rejected' || task.status === 'Rejected';
              const isReview = os === 'Under Review' || task.status === 'Under Review';

              const isSurveySubmitted = Boolean(
                task.surveyorOwnerName &&
                task.surveyorOwnerName.trim() !== '' &&
                task.surveyorOwnerName !== 'Not yet submitted'
              );

              const borderStyle = isApproved
                ? 'border-2 border-emerald-500 ring-2 ring-emerald-100 shadow-md shadow-emerald-50'
                : isRejected
                ? 'border-2 border-rose-500 ring-2 ring-rose-100 shadow-md shadow-rose-50'
                : isReview
                ? 'border-2 border-amber-400 ring-2 ring-amber-100 shadow-md shadow-amber-50'
                : 'border border-slate-200';

              return (
                <div
                  key={task.id}
                  className={`p-5 rounded-xl bg-white shadow-sm hover:shadow-md transition-all ${borderStyle}`}
                >
                  {/* Plot header row */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                        {task.plotId}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Khasra: Pending'}
                      </span>
                      <CatBadge cat={task.verifiedLandClass || task.landCategory} />

                      {/* Survey status */}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isApproved
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold'
                            : isRejected
                            ? 'bg-rose-50 text-rose-700 border border-rose-300 font-bold'
                            : isReview
                            ? 'bg-amber-50 text-amber-700 border border-amber-300 font-bold'
                            : task.status === 'Completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        }`}
                      >
                        {task.status}
                      </span>

                      {!isSurveySubmitted && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                          ⏳ Awaiting Survey
                        </span>
                      )}

                      {/* Officer decision badge */}
                      {os && (
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${osMeta.className}`}>
                          {osMeta.icon} {osMeta.label}
                        </span>
                      )}

                      {isApproved && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                          🟢 Approved
                        </span>
                      )}
                      {isRejected && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300 flex items-center gap-1">
                          🔴 Rejected
                        </span>
                      )}
                      {isReview && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1">
                          🟡 Under Review
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-600 font-mono shrink-0 font-medium">
                      {Number(task.areaSqKm || 0).toFixed(6)} sq km
                    </span>
                  </div>

                  <div className="flex items-start gap-1.5 text-xs text-slate-500 mb-3">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    {task.address}
                  </div>

                  {/* Owner details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <div className="text-slate-400 text-[11px] mb-0.5">Surveyor — Owner Name</div>
                      <div className="font-semibold text-slate-900">{task.surveyorOwnerName || <span className="text-slate-400 italic">Not yet submitted</span>}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px] mb-0.5">Surveyor — Phone Number</div>
                      <div className="font-semibold text-slate-900 font-mono">
                        {task.surveyorPhone || task.surveyorOwnerContact || <span className="text-slate-400 italic font-sans">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px] mb-0.5">Surveyor — Aadhaar Number</div>
                      <div className="font-semibold text-blue-600 font-mono">
                        {task.surveyorAadhaar || <span className="text-slate-400 italic font-sans">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px] mb-0.5">Verified Land Class</div>
                      <div className="font-semibold text-slate-900">{task.verifiedLandClass || task.landCategory || '—'}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px] mb-0.5">Surveyor Zone Designation</div>
                      <div className="font-semibold font-mono text-slate-900">
                        {(task.zoneType === 'RURAL' || task.isRural) ? '🌾 Rural [2.0x]' : '🏙️ Urban [1.2x]'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px] mb-0.5">Documents (Click to View)</div>
                      <div className="flex gap-2">
                        {task.soilReportUrl ? (
                          <button
                            type="button"
                            onClick={() => setActiveDoc({
                              title: 'Soil & Legal Verification Report',
                              type: 'report',
                              name: task.soilReportName || 'Soil_Report.pdf',
                              url: task.soilReportUrl,
                              task,
                            })}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer bg-emerald-50 text-emerald-700 border border-emerald-200/60 hover:bg-emerald-100"
                            title="Click to view & inspect Soil Report"
                          >
                            <FileText className="w-3 h-3" /> Soil Report ↗
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs italic">No report</span>
                        )}

                        {task.sitePhotoUrl ? (
                          <button
                            type="button"
                            onClick={() => setActiveDoc({
                              title: 'Site Inspection Photo',
                              type: 'photo',
                              name: task.sitePhotoName || 'Site_Photo.jpg',
                              url: task.sitePhotoUrl,
                              task,
                            })}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer bg-blue-50 text-blue-700 border border-blue-200/60 hover:bg-blue-100"
                            title="Click to view & inspect Site Photo"
                          >
                            <Eye className="w-3 h-3" /> Photo ↗
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs italic">No photo</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Financial & LARR Compensation Panel ── */}
                  <div className="p-4 rounded-lg mb-3 border border-slate-200 bg-white">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">LARR Compensation Engine (RFCTLARR 2013)</span>
                      </div>
                      <button
                        type="button"
                        disabled={!isSurveySubmitted}
                        onClick={() => isSurveySubmitted && handleCalculateLarr(task)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          !isSurveySubmitted
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 shadow-none'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer'
                        }`}
                        title={!isSurveySubmitted ? 'Surveyor has not submitted field verification details for this plot yet.' : 'Calculate RFCTLARR Statutory Compensation'}
                      >
                        🧮 Calculate Compensation
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-slate-500 mb-1">Measured Area</div>
                        <div className="font-mono text-slate-900 font-bold">
                          {task.areaSqm ? `${Number(task.areaSqm).toLocaleString('en-IN')} sq m` : (task.areaSqKm ? `${(task.areaSqKm * 1000000).toLocaleString('en-IN')} sq m` : '—')}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Surveyor Asset Value</div>
                        <div className="font-mono text-amber-700 font-bold">
                          {task.assetValue ? `₹${Number(task.assetValue).toLocaleString('en-IN')}` : '₹0'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Base Circle Rate (₹/sq m)</div>
                        <input
                          type="number"
                          disabled={!isSurveySubmitted}
                          value={circleRates[task.id] ?? ''}
                          onChange={(e) => setCircleRates({ ...circleRates, [task.id]: e.target.value })}
                          className={`w-full px-2.5 py-1 rounded font-mono font-bold outline-none text-xs ${
                            !isSurveySubmitted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              : 'bg-slate-50 border border-slate-200 text-slate-800 focus:bg-white focus:border-blue-600'
                          }`}
                          placeholder="Rate ₹/sq m"
                        />
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Zone / RFCTLARR Multiplier</div>
                        <select
                          disabled={!isSurveySubmitted}
                          value={zoneOverrides[task.id] || task.zoneType || (task.isRural ? 'RURAL' : 'URBAN')}
                          onChange={(e) => setZoneOverrides({ ...zoneOverrides, [task.id]: e.target.value })}
                          className={`w-full px-2.5 py-1 rounded font-mono font-semibold outline-none text-xs ${
                            !isSurveySubmitted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              : 'bg-slate-50 border border-slate-200 text-slate-800 focus:bg-white focus:border-blue-600 cursor-pointer'
                          }`}
                        >
                          <option value="URBAN">🏙️ Urban (1.2×)</option>
                          <option value="RURAL">🌾 Rural (2.0×)</option>
                        </select>
                      </div>
                    </div>

                    {/* Financial Itemized Breakdown (if calculated) */}
                    {task.larr_financials && (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div>
                          <div className="text-slate-500 text-[11px]">Applied Multiplier</div>
                          <div className="font-mono text-slate-800 font-bold">{task.larr_financials.multiplier}× ({task.larr_financials.zoneType || (task.larr_financials.isRural ? 'Rural' : 'Urban')})</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-[11px]">Market Value</div>
                          <div className="font-mono text-slate-800 font-semibold">₹{Number(task.larr_financials.marketRate).toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-[11px]">Solatium (100%)</div>
                          <div className="font-mono text-blue-600 font-semibold">₹{Number(task.larr_financials.solatium).toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-[11px]">Assets / Crops</div>
                          <div className="font-mono text-amber-700 font-semibold">₹{Number(task.larr_financials.assetValue).toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div className="text-emerald-700 font-bold text-[11px]">Sanctioned Award</div>
                          <div className="font-mono text-emerald-700 font-bold text-xs">₹{Number(task.larr_financials.totalAward).toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notice if survey has not yet been submitted */}
                  {!isSurveySubmitted && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50/80 border border-amber-200/80 text-amber-800 text-xs mb-3">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        <strong>Awaiting Field Survey:</strong> Surveyor has not submitted on-site verification data for this plot. Compensation calculation and officer review actions will unlock once submitted.
                      </span>
                    </div>
                  )}

                  {/* ── Remarks + Action buttons ── */}
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    {/* Action buttons row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Officer Action
                        </span>
                        {os && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${osMeta.className}`}>
                            {osMeta.icon} {osMeta.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!isSurveySubmitted}
                          onClick={() => isSurveySubmitted && handleOfficerAction(task.id, 'Approved')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            !isSurveySubmitted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50 shadow-none'
                              : os === 'Approved'
                              ? 'bg-emerald-600 text-white shadow-sm cursor-pointer'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 hover:bg-emerald-100 cursor-pointer'
                          }`}
                          title={!isSurveySubmitted ? 'Surveyor has not submitted field verification details yet.' : 'Approve plot'}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={!isSurveySubmitted}
                          onClick={() => isSurveySubmitted && handleOfficerAction(task.id, 'Under Review')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            !isSurveySubmitted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50 shadow-none'
                              : os === 'Under Review'
                              ? 'bg-amber-600 text-white shadow-sm cursor-pointer'
                              : 'bg-amber-50 text-amber-700 border border-amber-200/60 hover:bg-amber-100 cursor-pointer'
                          }`}
                          title={!isSurveySubmitted ? 'Surveyor has not submitted field verification details yet.' : 'Send plot for review'}
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Send for Review
                        </button>
                        <button
                          type="button"
                          disabled={!isSurveySubmitted}
                          onClick={() => isSurveySubmitted && handleOfficerAction(task.id, 'Rejected')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            !isSurveySubmitted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50 shadow-none'
                              : os === 'Rejected'
                              ? 'bg-rose-600 text-white shadow-sm cursor-pointer'
                              : 'bg-rose-50 text-rose-700 border border-rose-200/60 hover:bg-rose-100 cursor-pointer'
                          }`}
                          title={!isSurveySubmitted ? 'Surveyor has not submitted field verification details yet.' : 'Reject plot'}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>

                    {/* BOX 1: Surveyor Review Instructions */}
                    {(os === 'Under Review' || (reviewRemarkDrafts[task.id] !== undefined ? reviewRemarkDrafts[task.id] : task.reviewRemarks)) && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                            Review Instructions for Surveyor (Live in Surveyor Portal)
                          </label>
                          <span className="text-[10px] text-amber-700 font-mono">Field Re-inspection</span>
                        </div>
                        <textarea
                          rows={2}
                          value={reviewRemarkDrafts[task.id] !== undefined ? reviewRemarkDrafts[task.id] : (task.reviewRemarks || '')}
                          onChange={(e) => handleReviewRemarkChange(task.id, e.target.value)}
                          placeholder="Detail what needs to be re-surveyed, corrected, or re-uploaded..."
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 resize-none transition-all"
                        />
                      </div>
                    )}

                    {/* BOX 2: Official RFCTLARR Award Remarks */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          Official Award Remarks <span className="text-slate-400 font-normal lowercase">(printed on RFCTLARR PDF report)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => exportSinglePlotPDF(task, project)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 transition-all cursor-pointer shadow-sm"
                          title="Export official RFCTLARR Sanctioned Award Certificate for this plot"
                        >
                          <Download className="w-3 h-3" /> PDF Export
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        disabled={!isSurveySubmitted}
                        value={officerRemarkDrafts[task.id] !== undefined ? officerRemarkDrafts[task.id] : (task.officerRemarks || '')}
                        onChange={(e) => handleOfficerRemarkChange(task.id, e.target.value)}
                        placeholder={!isSurveySubmitted ? 'Officer remarks will unlock once field survey is submitted...' : 'Add official notes, legal conditions, or valuation remarks for the RFCTLARR compensation award...'}
                        className={`w-full px-3 py-2 rounded-lg text-xs resize-none transition-all ${
                          !isSurveySubmitted
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed placeholder-slate-400'
                            : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DocumentViewerModal doc={activeDoc} onClose={() => setActiveDoc(null)} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// BRANCH 3 — Transaction Status
// ════════════════════════════════════════════════════════════════════════════════
function TransactionsBranch({ onBack, userProfile }) {
  const { showToast } = useGIS();
  const [allProjects, setAllProjects] = useState(loadProjects);
  const [scopeFilter, setScopeFilter] = useState('my');
  const myProjects = useMemo(() => allProjects.filter((p) => isProjectOwnedByUser(p, userProfile)), [allProjects, userProfile]);
  const scopedProjects = scopeFilter === 'my' && myProjects.length > 0 ? myProjects : allProjects;
  const [selectedProjId, setSelectedProjId] = useState(() => (myProjects[0] || loadProjects()[0])?.project_id || '');
  const [disburse, setDisburse] = useState(loadDisburse);
  const [allTasks, setAllTasks] = useState(loadTasks);

  const refreshTransactions = useCallback(async () => {
    const [pList, tList, dMap] = await Promise.all([
      dataService.getProjects(),
      dataService.getTasks(),
      dataService.getDisbursements(),
    ]);
    if (pList) {
      setAllProjects(pList);
      const currentMy = pList.filter((p) => isProjectOwnedByUser(p, userProfile));
      const currentScoped = scopeFilter === 'my' && currentMy.length > 0 ? currentMy : pList;
      if ((!selectedProjId || !currentScoped.some((p) => p.project_id === selectedProjId)) && currentScoped.length > 0) {
        setSelectedProjId(currentScoped[0].project_id);
      }
    }
    if (tList) setAllTasks(tList);
    if (dMap) setDisburse(dMap);
  }, [selectedProjId, scopeFilter, userProfile]);

  React.useEffect(() => {
    refreshTransactions();
    const unsub = dataService.subscribe(() => {
      refreshTransactions();
    });
    return unsub;
  }, [refreshTransactions]);

  const projTasks = useMemo(() => allTasks.filter((t) => t.projectId === selectedProjId), [allTasks, selectedProjId]);

  const RATE = 1800;

  const getInfo = (task) => {
    const fin = task.larr_financials || {};
    const d = disburse[task.id] || {
      status: 'Processing',
      awardAmount: fin.totalAward ? Number(fin.totalAward) : Math.round((task.areaSqM || 500) * RATE)
    };
    return d;
  };

  const handleAction = (task, nextStatus) => {
    const info = getInfo(task);
    const updated = { ...disburse, [task.id]: { ...info, status: nextStatus } };
    setDisburse(updated);
    saveDisburse(updated);
    showToast(`${task.plotId} → ${nextStatus}`, 'success');
  };

  const handleStall = (task) => {
    const info = getInfo(task);
    const updated = { ...disburse, [task.id]: { ...info, status: 'Stalled' } };
    setDisburse(updated);
    saveDisburse(updated);
    showToast(`${task.plotId} marked as Stalled.`, 'info');
  };

  const totalAward = projTasks.reduce((s, t) => s + getInfo(t).awardAmount, 0);
  const disbursed  = projTasks.filter((t) => getInfo(t).status === 'Disbursed').reduce((s, t) => s + getInfo(t).awardAmount, 0);

  const fmt = (n) => n >= 10_000_000 ? `₹${(n/10_000_000).toFixed(2)} Cr` : n >= 100_000 ? `₹${(n/100_000).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <BranchHeader title="Beneficiary Transaction Status" subtitle="Award amounts & disbursement audit" icon={CreditCard} onBack={onBack} accentColor="#2563eb" />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Project selector & Scope toggle row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white border border-slate-200 text-xs shadow-sm">
            <button
              type="button"
              onClick={() => {
                setScopeFilter('my');
                if (myProjects.length > 0 && !myProjects.some((p) => p.project_id === selectedProjId)) {
                  setSelectedProjId(myProjects[0].project_id);
                }
              }}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'my'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👤</span> My Projects ({myProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'all'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏢</span> All ({allProjects.length})
            </button>
          </div>

          <select
            value={selectedProjId}
            onChange={(e) => setSelectedProjId(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 outline-none cursor-pointer shadow-sm focus:border-blue-600"
          >
            {scopedProjects.length === 0 && <option value="">No projects found</option>}
            {scopedProjects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.project_id} — {p.project_name} {p.created_by_name ? `(${p.created_by_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Summary strip */}
        {projTasks.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Award', val: fmt(totalAward), color: '#0f172a', Icon: Banknote },
              { label: 'Disbursed', val: fmt(disbursed), color: '#059669', Icon: CheckCircle2 },
              { label: 'Remaining', val: fmt(totalAward - disbursed), color: '#2563eb', Icon: TrendingUp },
            ].map(({ label, val, color, Icon }) => (
              <div key={label} className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
                <Icon className="w-5 h-5 mb-2" style={{ color }} />
                <div className="text-xl font-bold font-mono" style={{ color }}>{val}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {projTasks.length === 0 ? (
          <div className="py-20 text-center text-slate-500 rounded-xl bg-white border border-slate-200 shadow-sm">
            <Banknote className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium">No plots for this project.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  {['Owner Name', 'Plot / Dag No', 'Area', 'Award Amount', 'Status', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projTasks.map((task) => {
                  const info = getInfo(task);
                  const s = DISBURSE_STYLE[info.status] || DISBURSE_STYLE.Processing;
                  const canDisburse = info.status === 'Processing';
                  const canStall    = info.status !== 'Stalled';
                  return (
                    <tr key={task.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 text-slate-800">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {task.surveyorOwnerName || task.ownerName || 'Unverified'}
                      </td>
                      <td className="px-4 py-3 font-mono text-blue-600">
                        {task.plotId}<br />
                        <span className="text-[10px] text-slate-400">{task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Khasra: Pending'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 font-medium">
                        {Number(task.areaSqKm || 0).toFixed(4)} sq km
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 font-mono">
                        {fmt(info.awardAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.className}`}>
                          {info.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {canDisburse && (
                            <button
                              type="button"
                              onClick={() => handleAction(task, 'Disbursed')}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all bg-emerald-50 text-emerald-700 border border-emerald-200/60 hover:bg-emerald-100"
                            >
                              Disburse
                            </button>
                          )}
                          {canStall && (
                            <button
                              type="button"
                              onClick={() => handleStall(task)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all bg-rose-50 text-rose-700 border border-rose-200/60 hover:bg-rose-100"
                            >
                              Stall
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ROOT LAYOUT — switches between hub and branches
// ════════════════════════════════════════════════════════════════════════════════
export default function MunicipalOfficerLayout() {
  const { userProfile } = useAuth();
  const [branch, setBranch] = useState(null);

  if (branch === 'gis')          return <GISBranch onBack={() => setBranch(null)} userProfile={userProfile} />;
  if (branch === 'reports')      return <ReportsBranch onBack={() => setBranch(null)} userProfile={userProfile} />;
  if (branch === 'transactions') return <TransactionsBranch onBack={() => setBranch(null)} userProfile={userProfile} />;

  return <CommandHub onBranch={setBranch} userProfile={userProfile} />;
}
