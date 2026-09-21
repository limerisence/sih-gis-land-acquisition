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
import { exportPDF } from '../utils/pdfExporter';
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

export function isProjectOwnedByUser(project, userProfile) {
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
  // If legacy demo default project and user is default officer persona
  if ((!creator || creator === 'municipal officer') && (userEmail === 'officer@bhoomi.gov.in' || userName?.includes('priya'))) return true;
  return false;
}

// ─── Shared badge & icon helpers ──────────────────────────────────────────────
const CAT_STYLE = {
  Commercial:   { bg: 'rgba(168,85,247,.18)',  color: '#c084fc', Icon: Building2 },
  Agricultural: { bg: 'rgba(245,158,11,.18)',  color: '#fbbf24', Icon: Trees },
  Residential:  { bg: 'rgba(59,130,246,.18)',  color: '#93c5fd', Icon: Home },
};
function CatBadge({ cat }) {
  const s = CAT_STYLE[cat] || CAT_STYLE.Residential;
  const { Icon } = s;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: s.bg, color: s.color }}>
      <Icon className="w-2.5 h-2.5" />{cat || 'Residential'}
    </span>
  );
}

const DISBURSE_STYLE = {
  Disbursed:  { color: '#34d399', bg: 'rgba(52,211,153,.15)',  border: 'rgba(52,211,153,.3)' },
  Processing: { color: '#38bdf8', bg: 'rgba(56,189,248,.15)', border: 'rgba(56,189,248,.3)' },
  Stalled:    { color: '#f87171', bg: 'rgba(248,113,113,.15)', border: 'rgba(248,113,113,.3)' },
};

// ─── Officer status styling ───────────────────────────────────────────────────
const OFFICER_STATUS_STYLE = {
  Approved:      { color: '#34d399', bg: 'rgba(52,211,153,.18)',  border: 'rgba(52,211,153,.4)',  pdfBg: '#dcfce7', pdfColor: '#166534' },
  'Under Review':{ color: '#fb923c', bg: 'rgba(251,146,60,.18)',  border: 'rgba(251,146,60,.4)',  pdfBg: '#fff7ed', pdfColor: '#9a3412' },
  Rejected:      { color: '#f87171', bg: 'rgba(248,113,113,.18)', border: 'rgba(248,113,113,.4)', pdfBg: '#fef2f2', pdfColor: '#991b1b' },
};

// ─── Branch back-button header ────────────────────────────────────────────────
function BranchHeader({ title, subtitle, icon: Icon, onBack, accentColor = '#10b981' }) {
  return (
    <div
      className="h-12 px-4 flex items-center gap-3 border-b border-slate-800 shrink-0"
      style={{ background: 'rgba(9,13,27,0.98)' }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer mr-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Command Hub
      </button>
      <div className="w-px h-5 bg-slate-700" />
      <Icon className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
      <div>
        <div className="text-sm font-bold text-white">{title}</div>
        {subtitle && <div className="text-[10px] text-slate-400">{subtitle}</div>}
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
            <style>body { margin: 0; background: #0b0f19; display: flex; justify-content: center; align-items: center; height: 100vh; }</style>
          </head>
          <body>
            ${isBase64Img 
              ? `<img src="${doc.url}" style="max-height: 96vh; max-width: 96vw; object-contain; border-radius: 8px; box-shadow: 0 0 40px rgba(0,0,0,0.8);" />` 
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(2,8,23,0.88) 0%, rgba(0,0,0,0.95) 100%)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-2xl border border-slate-700 overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        style={{ background: 'rgba(15,23,42,0.98)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
              style={{ background: doc.type === 'photo' ? 'rgba(56,189,248,.15)' : 'rgba(52,211,153,.15)' }}
            >
              {doc.type === 'photo' ? '📷' : '📄'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-snug">{doc.title}</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {doc.task?.plotId ? `Plot: ${doc.task.plotId}` : ''} {doc.task?.khasraNo ? `· Khasra: ${doc.task.khasraNo}` : ''} {doc.name ? `· ${doc.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(isBase64Img || isBase64Pdf || isRealUrl) && (
              <button
                type="button"
                onClick={handleOpenFullscreen}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg text-sky-400 bg-sky-950/60 hover:bg-sky-900 transition-colors border border-sky-500/30 cursor-pointer"
                title="Open in new window"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Full Tab ↗
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center min-h-[400px] bg-slate-950/60">
          {isBase64Img ? (
            <div className="w-full flex flex-col items-center justify-center p-2">
              <img
                src={doc.url}
                alt={doc.title}
                className="max-h-[68vh] max-w-full rounded-xl object-contain border border-slate-800 shadow-2xl"
              />
            </div>
          ) : isBase64Pdf ? (
            <iframe
              src={doc.url}
              title={doc.title}
              className="w-full h-[68vh] rounded-xl border border-slate-800 bg-slate-900"
            />
          ) : isRealUrl ? (
            <div className="w-full h-[68vh]">
              {doc.type === 'photo' ? (
                <img src={doc.url} alt={doc.title} className="max-h-full max-w-full rounded-xl object-contain mx-auto" />
              ) : (
                <iframe src={doc.url} title={doc.title} className="w-full h-full rounded-xl border border-slate-800" />
              )}
            </div>
          ) : (
            /* Digital Certified Document Verification Preview */
            <div className="w-full max-w-xl p-6 rounded-2xl border border-emerald-500/20 bg-slate-900/80 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Government Field Survey Evidence</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                  SEAL VERIFIED
                </span>
              </div>

              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Document Type:</span>
                  <span className="font-semibold text-white">{doc.title}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">File Name:</span>
                  <span className="font-mono text-sky-300">{doc.name || 'Uploaded_Document.pdf'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Parcel ID:</span>
                  <span className="font-mono text-white font-bold">{doc.task?.plotId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Khasra / Dag No:</span>
                  <span className="font-mono text-amber-300 font-bold">{doc.task?.khasraNo || 'Verified On-site'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Recorded Owner:</span>
                  <span className="text-white font-semibold">{doc.task?.surveyorOwnerName || doc.task?.ownerName || 'Verified Citizen'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Location Classification:</span>
                  <span className="text-sky-300 font-semibold">{doc.task?.verifiedLandClass || doc.task?.landCategory} ({(doc.task?.zoneType === 'RURAL' || doc.task?.isRural) ? 'RURAL' : 'URBAN'})</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Digital Checksum:</span>
                  <span className="font-mono text-[10px] text-slate-500">SHA256: 8f9b...a10c-verified</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900/90 text-xs">
          <div className="text-slate-400 text-[11px] flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Authenticated against West Bengal Municipal Land Registry
          </div>
          <div className="flex items-center gap-2">
            {doc.url && (doc.url.startsWith('data:') || doc.url.startsWith('http')) && (
              <a
                href={doc.url}
                download={doc.name || 'document'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
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
    
    // 0ms Optimistic in-memory update
    setAllProjects((prev) => prev.filter((proj) => (proj.project_id || proj.projectId) !== pid));
    setAllTasks((prev) => prev.filter((t) => t.projectId !== pid));
    setProjectToDelete(null);
    setIsDeleting(false);
    showToast(`🗑️ Project ${pid} ("${p.project_name}") deleted from database.`, 'info');

    // Background cloud deletion
    await dataService.deleteProject(pid);
  };

  const HUB_CARDS = [
    {
      id: 'gis',
      icon: '➕',
      title: 'Create New Project',
      subtitle: 'Launch GIS corridor builder, draw alignment, dispatch survey tasks',
      accent: '#10b981',
      bg: 'linear-gradient(135deg, rgba(16,185,129,.1) 0%, rgba(13,148,136,.06) 100%)',
      border: 'rgba(16,185,129,.28)',
      glow: 'rgba(16,185,129,.12)',
      tag: 'GIS CANVAS',
      tagColor: '#34d399',
      tagBg: 'rgba(16,185,129,.15)',
    },
    {
      id: 'reports',
      icon: '📋',
      title: 'Surveyor Report Status',
      subtitle: 'Review field-submitted documents, add officer remarks, export PDF',
      accent: '#38bdf8',
      bg: 'linear-gradient(135deg, rgba(56,189,248,.1) 0%, rgba(99,102,241,.06) 100%)',
      border: 'rgba(56,189,248,.28)',
      glow: 'rgba(56,189,248,.12)',
      tag: 'REPORTS',
      tagColor: '#7dd3fc',
      tagBg: 'rgba(56,189,248,.15)',
    },
    {
      id: 'transactions',
      icon: '💳',
      title: 'Transaction Status',
      subtitle: 'Financial audit table, disbursement tracker, payment simulation',
      accent: '#fb923c',
      bg: 'linear-gradient(135deg, rgba(251,146,60,.1) 0%, rgba(234,179,8,.06) 100%)',
      border: 'rgba(251,146,60,.28)',
      glow: 'rgba(251,146,60,.12)',
      tag: 'FINANCE',
      tagColor: '#fdba74',
      tagBg: 'rgba(251,146,60,.15)',
    },
  ];

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse at 30% 0%, rgba(16,185,129,.05) 0%, transparent 60%), #030712' }}
    >
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Welcome header & Scope toggle */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.25)' }}
            >
              🗺️
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">
                Welcome, {userProfile?.name?.split(' ')[0] || 'Officer'}
              </h1>
              <p className="text-sm text-slate-400">{userProfile?.designation || 'Municipal Planning Officer'}</p>
            </div>
          </div>

          {/* Project Workspace Scope Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setScopeFilter('my')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === 'my'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>👤</span> My Projects ({myProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === 'all'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏢</span> All Department ({allProjects.length})
            </button>
          </div>
        </div>

        {/* Quick stats strip - Only My Projects */}
        <div className="mb-8 max-w-xs">
          <div
            className="p-4 rounded-2xl border flex items-center gap-4 shadow-sm"
            style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(16,185,129,.25)' }}
          >
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-400">{stats.projects}</div>
              <div className="text-xs text-slate-400 font-medium">
                {scopeFilter === 'my' ? 'My Projects' : 'Total Projects'}
              </div>
            </div>
          </div>
        </div>

        {/* 3 Action cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {HUB_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onBranch(card.id)}
              className="group text-left p-6 rounded-2xl border transition-all duration-200 cursor-pointer"
              style={{
                background: card.bg,
                border: `1px solid ${card.border}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 32px ${card.glow}`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="text-4xl mb-4">{card.icon}</div>
              <span
                className="inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded mb-3"
                style={{ background: card.tagBg, color: card.tagColor }}
              >
                {card.tag}
              </span>
              <h3 className="text-base font-bold text-white mb-2 leading-snug">{card.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{card.subtitle}</p>
              <div
                className="mt-4 text-xs font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform"
                style={{ color: card.accent }}
              >
                Open →
              </div>
            </button>
          ))}
        </div>

        {/* Projects Registry / Portfolio (List View) */}
        <div className="border-t border-slate-800/80 pt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                {scopeFilter === 'my' ? 'My Projects Portfolio' : 'All Department Projects Registry'}
              </h2>
              <p className="text-xs text-slate-400">
                {scopeFilter === 'my'
                  ? 'Infrastructure corridor projects created and managed by your account'
                  : 'All land acquisition projects across all municipal officers'}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-300 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800 font-semibold">
              {scopedProjects.length} Project{scopedProjects.length !== 1 ? 's' : ''}
            </span>
          </div>

          {scopedProjects.length === 0 ? (
            <div className="p-10 rounded-2xl border border-slate-800/80 bg-slate-900/40 text-center text-slate-400">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-60" />
              <p className="text-sm font-semibold text-slate-200">No projects found in this view</p>
              <p className="text-xs text-slate-500 mt-1">Click "Create New Project" above to launch the GIS corridor builder.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {scopedProjects.map((p) => {
                const pTasks = allTasks.filter((t) => t.projectId === p.project_id);
                const approvedCount = pTasks.filter((t) => t.officerStatus === 'Approved').length;
                const completedCount = pTasks.filter((t) => t.status === 'Completed').length;
                const statusColor = p.status === 'APPROVED' ? '#34d399' : p.status === 'UNDER_REVIEW' ? '#fb923c' : '#fbbf24';
                const isOwner = isProjectOwnedByUser(p, userProfile);

                return (
                  <div
                    key={p.project_id}
                    className="p-4 sm:p-5 rounded-2xl border bg-slate-900/70 border-slate-800/80 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg"
                  >
                    {/* Left: Project identity & metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-500/30">
                          {p.project_id}
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            background: `${statusColor}18`,
                            color: statusColor,
                            border: `1px solid ${statusColor}40`,
                          }}
                        >
                          {p.status || 'PENDING'}
                        </span>
                        {isOwner && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                            👤 Your Project
                          </span>
                        )}
                      </div>

                      {/* Project Name */}
                      <h3 className="text-base font-bold text-white mb-1 leading-snug truncate">{p.project_name}</h3>

                      {/* Creator and Date */}
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span>
                          <span className="text-slate-500">Officer:</span>{' '}
                          <span className="text-slate-300 font-medium">{p.created_by_name || p.created_by || 'Municipal Officer'}</span>
                        </span>
                        <span className="text-slate-600">·</span>
                        <span>
                          <span className="text-slate-500">Date:</span>{' '}
                          <span className="font-mono text-slate-300">
                            {new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Middle: Mini Metrics */}
                    <div className="flex items-center gap-2 sm:gap-3 bg-slate-950/80 border border-slate-800/80 px-3.5 py-2 rounded-xl text-center shrink-0">
                      <div className="px-2">
                        <div className="text-[9px] text-slate-500 uppercase font-bold">Plots</div>
                        <div className="text-xs font-bold text-sky-400 font-mono">{pTasks.length}</div>
                      </div>
                      <div className="w-[1px] h-6 bg-slate-800" />
                      <div className="px-2">
                        <div className="text-[9px] text-slate-500 uppercase font-bold">Surveyed</div>
                        <div className="text-xs font-bold text-amber-400 font-mono">{completedCount}</div>
                      </div>
                      <div className="w-[1px] h-6 bg-slate-800" />
                      <div className="px-2">
                        <div className="text-[9px] text-slate-500 uppercase font-bold">Approved</div>
                        <div className="text-xs font-bold text-emerald-400 font-mono">{approvedCount}</div>
                      </div>
                    </div>

                    {/* Right: Actions & Owner-Only Delete */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onBranch('reports')}
                        className="py-2 px-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold text-center border border-sky-500/30 transition-all cursor-pointer whitespace-nowrap"
                      >
                        Surveyor Reports →
                      </button>
                      <button
                        type="button"
                        onClick={() => onBranch('transactions')}
                        className="py-2 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-xs font-semibold text-center border border-orange-500/30 transition-all cursor-pointer whitespace-nowrap"
                      >
                        Financials →
                      </button>

                      {/* Delete Button ONLY visible for the project owner */}
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => setProjectToDelete(p)}
                          title="Delete Your Project from Database"
                          className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all cursor-pointer shrink-0"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-2xl border border-red-500/30 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-xl">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Project</h3>
                <p className="text-xs text-slate-400">Permanent database deletion</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-white">"{projectToDelete.project_name}"</strong> (<span className="font-mono text-sky-300">{projectToDelete.project_id}</span>)?
            </p>
            <p className="text-[11px] text-red-300/80 bg-red-950/40 p-2.5 rounded-xl border border-red-500/20">
              ⚠️ This will delete the project record and all associated survey plot tasks and documents from the Supabase database.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteProject(projectToDelete)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors cursor-pointer flex items-center gap-1.5"
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
  const { affectedPlots, affectedBuildings, isCalculated, showToast } = useGIS();
  const [projectName, setProjectName] = useState('');
  const [dispatchedIds, setDispatchedIds] = useState(() => new Set(loadTasks().map((t) => t.plotId)));
  const [lastProjectId, setLastProjectId] = useState(null);
  const [baseRates, setBaseRates] = useState({
    Residential: 4500,
    Commercial: 8500,
    Agricultural: 2200,
  });

  const totalAffected = affectedPlots.length + affectedBuildings.length;
  const canSend = isCalculated && totalAffected > 0 && projectName.trim().length > 0;

  const handleSendAll = useCallback(() => {
    if (!projectName.trim()) {
      showToast('Enter a Project Name before dispatching.', 'error');
      return;
    }
    const pid = genProjectId();
    const now = new Date().toISOString();
    const all = [...affectedPlots, ...affectedBuildings];
    const existing = loadTasks();
    const existingIds = new Set(existing.map((t) => t.plotId));

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
        const address = p.address || `Plot at ${coords.lat.toFixed(5)}° N, ${coords.lng.toFixed(5)}° E, West Bengal`;
        return {
          id: `TASK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          plotId: p.plotId,
          khasraNo: p.khasraNo,
          projectId: pid,
          projectName: projectName.trim(),
          address: address,
          coords: coords,
          landCategory: p.landCategory,
          areaSqKm: p.landAreaSqKm,
          areaSqM: p.landAreaSqM,
          ownerName: p.ownerName,
          status: 'Pending',
          dispatchedBy: userProfile?.name || userProfile?.email || 'Municipal Officer',
          dispatchedByEmail: userProfile?.email || '',
          dispatchedAt: now,
          // Fields filled by surveyor later
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

    saveTasks([...existing, ...newTasks]);
    // Create project record with default base rates
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
      }
    };
    saveProjects([...projects, newProject]);

    setDispatchedIds(new Set([...existing.map((t) => t.plotId), ...newTasks.map((t) => t.plotId)]));
    setLastProjectId(pid);
    showToast(`✅ Project ${pid} created — ${newTasks.length} plots dispatched.`, 'success');
  }, [projectName, baseRates, affectedPlots, affectedBuildings, userProfile, showToast]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <BranchHeader
        title="Create New Project"
        subtitle="Draw corridor alignment → dispatch plots to surveyors"
        icon={PlusCircle}
        onBack={onBack}
        accentColor="#10b981"
      />
      <div className="flex-1 relative overflow-hidden">
        <MapContainer />
        <Sidebar />
        <FeatureDetailModal />

        {/* Project name + base rates + send bar */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-2 p-4 rounded-2xl border shadow-2xl"
          style={{ background: 'rgba(9,13,27,0.97)', border: '1px solid rgba(16,185,129,.25)', backdropFilter: 'blur(12px)', minWidth: 680 }}
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-0.5 shrink-0">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Project Name *</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. NH-34 Widening Phase 1"
                className="w-56 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div className="w-px h-10 bg-slate-700" />

            {/* Base Circle Rates Inputs */}
            <div className="flex items-center gap-2 flex-1">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-sky-400 block mb-0.5">Res. Rate (₹/m²)</label>
                <input
                  type="number"
                  value={baseRates.Residential}
                  onChange={(e) => setBaseRates({ ...baseRates, Residential: e.target.value })}
                  className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-purple-400 block mb-0.5">Comm. Rate (₹/m²)</label>
                <input
                  type="number"
                  value={baseRates.Commercial}
                  onChange={(e) => setBaseRates({ ...baseRates, Commercial: e.target.value })}
                  className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-amber-400 block mb-0.5">Agri. Rate (₹/m²)</label>
                <input
                  type="number"
                  value={baseRates.Agricultural}
                  onChange={(e) => setBaseRates({ ...baseRates, Agricultural: e.target.value })}
                  className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendAll}
              disabled={!canSend}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 shrink-0"
              style={{ background: 'linear-gradient(135deg,#059669,#0d9488)', color: '#fff', boxShadow: canSend ? '0 0 16px rgba(16,185,129,.4)' : 'none' }}
            >
              <Send className="w-3.5 h-3.5" />
              Send for Surveying
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="font-bold text-white">{totalAffected}</span> parcels in corridor
              {dispatchedIds.size > 0 && (
                <span className="ml-1 text-emerald-400 font-semibold">· {dispatchedIds.size} dispatched</span>
              )}
            </span>
            {lastProjectId && (
              <span className="font-mono text-emerald-400">
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
  const [scopeFilter, setScopeFilter] = useState('my'); // 'my' | 'all'
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
  // Separated local draft states for remarks
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

  // Debounce ref for background persistence without UI blocking
  const debounceTimers = useRef({});

  // Per-plot circle rate overrides draft state keyed by task.id
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

  // Per-plot zone overrides draft state keyed by task.id ('URBAN' | 'RURAL')
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

    const allT = loadTasks();
    const updated = allT.map((t) => {
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
    setTasks(updated);
    showToast(`🧮 LARR Compensation Calculated for Plot ${task.plotId}: ₹${financials.totalAward.toLocaleString('en-IN')} (${financials.multiplier}× Multiplier)`, 'success');
  }, [circleRates, zoneOverrides, showToast]);

  // Handle Official Report Remarks (Printed on PDF) with 0ms UI responsiveness + debounced cloud sync
  const handleOfficerRemarkChange = useCallback((taskId, val) => {
    setOfficerRemarkDrafts((prev) => ({ ...prev, [taskId]: val }));
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, officerRemarks: val } : t)));

    if (debounceTimers.current[`off_${taskId}`]) clearTimeout(debounceTimers.current[`off_${taskId}`]);
    debounceTimers.current[`off_${taskId}`] = setTimeout(() => {
      dataService.updateTask(taskId, { officerRemarks: val });
    }, 450);
  }, []);

  // Handle Review Instructions for Field Surveyor with 0ms UI responsiveness + debounced cloud sync
  const handleReviewRemarkChange = useCallback((taskId, val) => {
    setReviewRemarkDrafts((prev) => ({ ...prev, [taskId]: val }));
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, reviewRemarks: val } : t)));

    if (debounceTimers.current[`rev_${taskId}`]) clearTimeout(debounceTimers.current[`rev_${taskId}`]);
    debounceTimers.current[`rev_${taskId}`] = setTimeout(() => {
      dataService.updateTask(taskId, { reviewRemarks: val });
    }, 450);
  }, []);

  // Instantaneous 0ms Officer decision action handler (Optimistic UI + Background Cloud Sync)
  const handleOfficerAction = useCallback((taskId, newOfficerStatus) => {
    const currentRevRem = reviewRemarkDrafts[taskId] !== undefined ? reviewRemarkDrafts[taskId] : (tasks.find((t) => t.id === taskId)?.reviewRemarks || '');
    const currentOffRem = officerRemarkDrafts[taskId] !== undefined ? officerRemarkDrafts[taskId] : (tasks.find((t) => t.id === taskId)?.officerRemarks || '');

    // 1. Instant 0ms Optimistic UI update (ring border & status badge reflect immediately!)
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          officerStatus: newOfficerStatus,
          officerRemarks: currentOffRem,
          reviewRemarks: newOfficerStatus === 'Under Review' ? (currentRevRem || 'Please verify plot boundary and re-upload required documents.') : t.reviewRemarks,
        };
      })
    );

    const labels = { Approved: '✅ Approved', 'Under Review': '🔄 Sent for Review', Rejected: '❌ Rejected' };
    showToast(`Plot ${taskId.slice(-6)} — ${labels[newOfficerStatus]}`, newOfficerStatus === 'Approved' ? 'success' : 'info');

    // 2. Non-blocking Background Async Cloud Sync
    (async () => {
      await dataService.updateTask(taskId, {
        officerStatus: newOfficerStatus,
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

  // Stats
  const approvedCount    = projTasks.filter((t) => t.officerStatus === 'Approved').length;
  const reviewCount      = projTasks.filter((t) => t.officerStatus === 'Under Review').length;
  const rejectedCount    = projTasks.filter((t) => t.officerStatus === 'Rejected').length;
  const pendingDecision  = projTasks.filter((t) => !t.officerStatus).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <BranchHeader title="Surveyor Report Status" subtitle="Review submitted survey data · Approve, Review, or Reject" icon={ClipboardList} onBack={onBack} accentColor="#38bdf8" />

      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ background: '#060a14' }}>
        {/* Project picker & scope row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope Toggle */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setScopeFilter('my');
                if (myProjects.length > 0 && !myProjects.some((p) => p.project_id === selectedProjId)) {
                  setSelectedProjId(myProjects[0].project_id);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'my'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>👤</span> My Projects ({myProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'all'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏢</span> All ({allProjects.length})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <select
              value={selectedProjId}
              onChange={(e) => setSelectedProjId(e.target.value)}
              className="pl-8 pr-4 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white outline-none cursor-pointer"
            >
              {scopedProjects.length === 0 && <option value="">No projects found</option>}
              {scopedProjects.map((p) => (
                <option key={p.project_id} value={p.project_id} style={{ background: '#1e293b' }}>
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
            className="px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 w-48"
          />
          {project && (
            <button
              type="button"
              onClick={() => exportPDF(project, projTasks)}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)', color: '#fff', boxShadow: '0 0 12px rgba(99,102,241,.3)' }}
            >
              <Download className="w-3.5 h-3.5" /> Export PDF Report
            </button>
          )}
        </div>

        {/* Project meta card */}
        {project && (
          <div
            className="p-4 rounded-2xl border"
            style={{ background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)' }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-lg font-black text-white">{project.project_name}</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">{project.project_id} · Created {new Date(project.created_at).toLocaleDateString('en-IN')}</div>
              </div>
            </div>
            {/* Stats strip */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Total',        val: projTasks.length,  color: '#38bdf8' },
                { label: '✅ Approved',   val: approvedCount,     color: '#34d399' },
                { label: '🔄 Review',    val: reviewCount,       color: '#fb923c' },
                { label: '❌ Rejected',  val: rejectedCount,     color: '#f87171' },
                { label: '⏳ Pending',   val: pendingDecision,   color: '#94a3b8' },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center p-2 rounded-xl" style={{ background: 'rgba(15,23,42,0.6)' }}>
                  <div className="text-xl font-black" style={{ color }}>{val}</div>
                  <div className="text-[9px] text-slate-500 font-semibold mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plot rows */}
        {projTasks.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No plots found for this project.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projTasks.map((task) => {
              const os = task.officerStatus;
              const osStyle = OFFICER_STATUS_STYLE[os];
              return (
                <div
                  key={task.id}
                  className="p-4 rounded-2xl border transition-all"
                  style={{
                    background: os ? `rgba(15,23,42,0.9)` : 'rgba(15,23,42,0.8)',
                    border: os ? `1px solid ${osStyle.border}` : '1px solid rgba(100,116,139,.18)',
                    boxShadow: os ? `0 0 16px ${osStyle.bg}` : 'none',
                  }}
                >
                  {/* Plot header row */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs font-mono text-sky-300">{task.plotId}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Khasra: Pending'}
                      </span>
                      <CatBadge cat={task.verifiedLandClass || task.landCategory} />
                      {/* Survey status */}
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          background: task.status === 'Completed' ? 'rgba(52,211,153,.15)' : 'rgba(251,191,36,.15)',
                          color: task.status === 'Completed' ? '#34d399' : '#fbbf24',
                        }}
                      >
                        {task.status}
                      </span>
                      {/* Officer decision badge */}
                      {os && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ background: osStyle.bg, color: osStyle.color, border: `1px solid ${osStyle.border}` }}
                        >
                          {os === 'Approved' ? '✅' : os === 'Under Review' ? '🔄' : '❌'} {os}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-emerald-400 font-mono shrink-0">
                      {Number(task.areaSqKm || 0).toFixed(6)} sq km
                    </span>
                  </div>

                  <div className="flex items-start gap-1.5 text-[11px] text-slate-300 mb-3">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                    {task.address}
                  </div>

                  {/* Owner details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3 text-[11px]">
                    <div>
                      <div className="text-slate-500 mb-1">Surveyor — Owner Name</div>
                      <div className="font-semibold text-white">{task.surveyorOwnerName || <span className="text-slate-600 italic">Not yet submitted</span>}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-1">Surveyor — Phone Number</div>
                      <div className="font-semibold text-emerald-300 font-mono">
                        {task.surveyorPhone || task.surveyorOwnerContact || <span className="text-slate-600 italic font-sans">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-1">Surveyor — Aadhaar Number</div>
                      <div className="font-semibold text-sky-300 font-mono">
                        {task.surveyorAadhaar || <span className="text-slate-600 italic font-sans">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-1">Verified Land Class</div>
                      <div className="font-semibold text-white">{task.verifiedLandClass || task.landCategory || '—'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-1">Surveyor Zone Designation</div>
                      <div className="font-semibold font-mono text-sky-300">
                        {(task.zoneType === 'RURAL' || task.isRural) ? '🌾 Rural [2.0x]' : '🏙️ Urban [1.2x]'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-1">Documents (Click to View)</div>
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
                            className="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm"
                            style={{
                              background: 'rgba(52,211,153,.15)',
                              color: '#34d399',
                              border: '1px solid rgba(52,211,153,.4)',
                            }}
                            title="Click to view & inspect Soil Report"
                          >
                            <FileText className="w-3 h-3" /> Soil Report ↗
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[10px] py-1 italic">No report</span>
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
                            className="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm"
                            style={{
                              background: 'rgba(56,189,248,.15)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56,189,248,.4)',
                            }}
                            title="Click to view & inspect Site Photo"
                          >
                            <Eye className="w-3 h-3" /> Photo ↗
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[10px] py-1 italic">No photo</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Financial & LARR Compensation Panel ── */}
                  <div
                    className="p-3.5 rounded-xl mb-3 border"
                    style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(56,189,248,.25)' }}
                  >
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">LARR Compensation Engine (RFCTLARR 2013)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCalculateLarr(task)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', boxShadow: '0 0 12px rgba(16,185,129,.3)' }}
                      >
                        🧮 Calculate Compensation
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                      <div>
                        <div className="text-slate-400 mb-1">Measured Area</div>
                        <div className="font-mono text-emerald-400 font-bold">
                          {task.areaSqm ? `${Number(task.areaSqm).toLocaleString('en-IN')} sq m` : (task.areaSqKm ? `${(task.areaSqKm * 1000000).toLocaleString('en-IN')} sq m` : '—')}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Surveyor Asset Value</div>
                        <div className="font-mono text-amber-400 font-bold">
                          {task.assetValue ? `₹${Number(task.assetValue).toLocaleString('en-IN')}` : '₹0'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Base Circle Rate (₹/sq m)</div>
                        <input
                          type="number"
                          value={circleRates[task.id] ?? ''}
                          onChange={(e) => setCircleRates({ ...circleRates, [task.id]: e.target.value })}
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-sky-300 font-bold outline-none focus:border-sky-500 text-xs"
                          placeholder="Rate ₹/sq m"
                        />
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Zone / RFCTLARR Multiplier</div>
                        <select
                          value={zoneOverrides[task.id] || task.zoneType || (task.isRural ? 'RURAL' : 'URBAN')}
                          onChange={(e) => setZoneOverrides({ ...zoneOverrides, [task.id]: e.target.value })}
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-emerald-300 font-bold outline-none focus:border-emerald-500 text-xs cursor-pointer"
                        >
                          <option value="URBAN" style={{ background: '#0f172a' }}>🏙️ Urban (1.2×)</option>
                          <option value="RURAL" style={{ background: '#0f172a' }}>🌾 Rural (2.0×)</option>
                        </select>
                      </div>
                    </div>

                    {/* Financial Itemized Breakdown (if calculated) */}
                    {task.larr_financials && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        <div>
                          <div className="text-slate-500">Applied Multiplier</div>
                          <div className="font-mono text-sky-300 font-bold">{task.larr_financials.multiplier}× ({task.larr_financials.zoneType || (task.larr_financials.isRural ? 'Rural' : 'Urban')})</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Market Value</div>
                          <div className="font-mono text-slate-200 font-semibold">₹{Number(task.larr_financials.marketRate).toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Solatium (100%)</div>
                          <div className="font-mono text-slate-200 font-semibold">₹{Number(task.larr_financials.solatium).toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Assets / Crops</div>
                          <div className="font-mono text-slate-200 font-semibold">₹{Number(task.larr_financials.assetValue).toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div className="text-emerald-400 font-bold">Sanctioned Award</div>
                          <div className="font-mono text-emerald-400 font-black text-xs">₹{Number(task.larr_financials.totalAward).toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Remarks + Action buttons ── */}
                  <div className="pt-3 border-t border-slate-800/60 space-y-3">
                    {/* Action buttons row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Officer Action
                        </span>
                        {os && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 animate-pulse"
                            style={{ background: osStyle.bg, color: osStyle.color, border: `1px solid ${osStyle.border}` }}
                          >
                            {os === 'Approved' ? '✅ Approved' : os === 'Under Review' ? '🔄 Needs Surveyor Review' : '❌ Rejected'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* APPROVE */}
                        <button
                          type="button"
                          onClick={() => handleOfficerAction(task.id, 'Approved')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm"
                          style={{
                            background: os === 'Approved' ? 'rgba(52,211,153,.3)' : 'rgba(52,211,153,.12)',
                            color: '#34d399',
                            border: `1px solid ${os === 'Approved' ? 'rgba(52,211,153,.6)' : 'rgba(52,211,153,.3)'}`,
                            boxShadow: os === 'Approved' ? '0 0 12px rgba(52,211,153,.25)' : 'none',
                          }}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" /> Approve
                        </button>
                        {/* SEND FOR REVIEW */}
                        <button
                          type="button"
                          onClick={() => handleOfficerAction(task.id, 'Under Review')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm"
                          style={{
                            background: os === 'Under Review' ? 'rgba(251,146,60,.3)' : 'rgba(251,146,60,.12)',
                            color: '#fb923c',
                            border: `1px solid ${os === 'Under Review' ? 'rgba(251,146,60,.6)' : 'rgba(251,146,60,.3)'}`,
                            boxShadow: os === 'Under Review' ? '0 0 12px rgba(251,146,60,.25)' : 'none',
                          }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Send for Review
                        </button>
                        {/* REJECT */}
                        <button
                          type="button"
                          onClick={() => handleOfficerAction(task.id, 'Rejected')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm"
                          style={{
                            background: os === 'Rejected' ? 'rgba(248,113,113,.3)' : 'rgba(248,113,113,.12)',
                            color: '#f87171',
                            border: `1px solid ${os === 'Rejected' ? 'rgba(248,113,113,.6)' : 'rgba(248,113,113,.3)'}`,
                            boxShadow: os === 'Rejected' ? '0 0 12px rgba(248,113,113,.25)' : 'none',
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>

                    {/* BOX 1: Surveyor Review Instructions (Expands when Under Review or has instructions) */}
                    {(os === 'Under Review' || (reviewRemarkDrafts[task.id] !== undefined ? reviewRemarkDrafts[task.id] : task.reviewRemarks)) && (
                      <div className="p-2.5 rounded-xl bg-orange-950/25 border border-orange-500/40 shadow-inner space-y-1.5 animate-fadeIn">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-orange-400 flex items-center gap-1.5">
                            <RotateCcw className="w-3 h-3 text-orange-400 animate-spin-slow" />
                            Review Instructions for Surveyor (Live in Surveyor Portal)
                          </label>
                          <span className="text-[10px] text-orange-300/70 font-mono">Field Re-inspection</span>
                        </div>
                        <textarea
                          rows={2}
                          value={reviewRemarkDrafts[task.id] !== undefined ? reviewRemarkDrafts[task.id] : (task.reviewRemarks || '')}
                          onChange={(e) => handleReviewRemarkChange(task.id, e.target.value)}
                          placeholder="Detail what needs to be re-surveyed, corrected, or re-uploaded (e.g. recheck northern boundary demarcation, re-upload legible 7/12 extract)..."
                          className="w-full px-3 py-2 bg-slate-900/90 border border-orange-500/30 rounded-lg text-xs text-orange-100 placeholder-orange-400/40 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 resize-none transition-all"
                        />
                      </div>
                    )}

                    {/* BOX 2: Official RFCTLARR Award Remarks (Printed on PDF) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          Official Award Remarks <span className="text-slate-500 font-normal lowercase">(printed on RFCTLARR PDF report)</span>
                        </label>
                        <span className="text-[9px] text-slate-500 font-mono">PDF Export</span>
                      </div>
                      <textarea
                        rows={2}
                        value={officerRemarkDrafts[task.id] !== undefined ? officerRemarkDrafts[task.id] : (task.officerRemarks || '')}
                        onChange={(e) => handleOfficerRemarkChange(task.id, e.target.value)}
                        placeholder="Add official notes, legal conditions, or valuation remarks for the RFCTLARR compensation award..."
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 resize-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Evidence & Document Viewer Modal */}
      <DocumentViewerModal doc={activeDoc} onClose={() => setActiveDoc(null)} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// BRANCH 3 — Transaction Status
// ════════════════════════════════════════════════════════════════════════════════
const DISBURSE_FLOW = ['Processing', 'Disbursed'];

function TransactionsBranch({ onBack, userProfile }) {
  const { showToast } = useGIS();
  const [allProjects, setAllProjects] = useState(loadProjects);
  const [scopeFilter, setScopeFilter] = useState('my'); // 'my' | 'all'
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

  // Derive award amounts deterministically (mock: area × 1800 ₹/sq m)
  const RATE = 1800;

  const getInfo = (task) => {
    const d = disburse[task.id] || { status: 'Processing', awardAmount: Math.round((task.areaSqM || 500) * RATE) };
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
    <div className="flex-1 flex flex-col overflow-hidden">
      <BranchHeader title="Beneficiary Transaction Status" subtitle="Award amounts & disbursement audit" icon={CreditCard} onBack={onBack} accentColor="#fb923c" />

      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ background: '#060a14' }}>
        {/* Project selector & Scope toggle row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope Toggle */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setScopeFilter('my');
                if (myProjects.length > 0 && !myProjects.some((p) => p.project_id === selectedProjId)) {
                  setSelectedProjId(myProjects[0].project_id);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'my'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>👤</span> My Projects ({myProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                scopeFilter === 'all'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏢</span> All ({allProjects.length})
            </button>
          </div>

          <select
            value={selectedProjId}
            onChange={(e) => setSelectedProjId(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white outline-none cursor-pointer"
          >
            {scopedProjects.length === 0 && <option value="">No projects found</option>}
            {scopedProjects.map((p) => (
              <option key={p.project_id} value={p.project_id} style={{ background: '#1e293b' }}>
                {p.project_id} — {p.project_name} {p.created_by_name ? `(${p.created_by_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Summary strip */}
        {projTasks.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Award', val: fmt(totalAward), color: '#fb923c', Icon: Banknote },
              { label: 'Disbursed', val: fmt(disbursed), color: '#34d399', Icon: CheckCircle2 },
              { label: 'Remaining', val: fmt(totalAward - disbursed), color: '#38bdf8', Icon: TrendingUp },
            ].map(({ label, val, color, Icon }) => (
              <div key={label} className="p-4 rounded-2xl border" style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid rgba(100,116,139,.18)` }}>
                <Icon className="w-4 h-4 mb-2" style={{ color }} />
                <div className="text-lg font-black" style={{ color }}>{val}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {projTasks.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <Banknote className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No plots for this project.</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={{ border: '1px solid rgba(100,116,139,.2)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'rgba(15,23,42,0.95)' }}>
                  {['Owner Name', 'Plot / Dag No', 'Area', 'Award Amount', 'Status', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projTasks.map((task, idx) => {
                  const info = getInfo(task);
                  const s = DISBURSE_STYLE[info.status] || DISBURSE_STYLE.Processing;
                  const canDisburse = info.status === 'Processing';
                  const canStall    = info.status !== 'Stalled';
                  return (
                    <tr key={task.id} style={{ background: idx % 2 === 0 ? 'rgba(15,23,42,0.6)' : 'rgba(9,13,27,0.6)' }}>
                      <td className="px-4 py-3 font-medium text-white border-b border-slate-800/40">
                        {task.surveyorOwnerName || task.ownerName || 'Unverified'}
                      </td>
                      <td className="px-4 py-3 font-mono text-sky-300 border-b border-slate-800/40">
                        {task.plotId}<br />
                        <span className="text-[9px] text-slate-500">{task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Khasra: Pending'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-400 border-b border-slate-800/40">
                        {Number(task.areaSqKm || 0).toFixed(4)} sq km
                      </td>
                      <td className="px-4 py-3 font-bold text-amber-300 border-b border-slate-800/40">
                        {fmt(info.awardAmount)}
                      </td>
                      <td className="px-4 py-3 border-b border-slate-800/40">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold border" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                          {info.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-800/40">
                        <div className="flex gap-2">
                          {canDisburse && (
                            <button
                              type="button"
                              onClick={() => handleAction(task, 'Disbursed')}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:scale-105"
                              style={{ background: 'rgba(52,211,153,.18)', color: '#34d399', border: '1px solid rgba(52,211,153,.3)' }}
                            >
                              Disburse
                            </button>
                          )}
                          {canStall && (
                            <button
                              type="button"
                              onClick={() => handleStall(task)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:scale-105"
                              style={{ background: 'rgba(248,113,113,.12)', color: '#f87171', border: '1px solid rgba(248,113,113,.25)' }}
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
  const [branch, setBranch] = useState(null); // null = hub, 'gis' | 'reports' | 'transactions'

  if (branch === 'gis')          return <GISBranch onBack={() => setBranch(null)} userProfile={userProfile} />;
  if (branch === 'reports')      return <ReportsBranch onBack={() => setBranch(null)} userProfile={userProfile} />;
  if (branch === 'transactions') return <TransactionsBranch onBack={() => setBranch(null)} userProfile={userProfile} />;

  return <CommandHub onBranch={setBranch} userProfile={userProfile} />;
}
