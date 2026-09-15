import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  FolderOpen, ArrowLeft, MapPin, Navigation, CheckCircle2,
  Upload, FileText, Camera, User, Phone, Tag, ChevronDown,
  Send, AlertCircle, Clock, Layers, ExternalLink, RefreshCw,
  MessageSquare, RotateCcw
} from 'lucide-react';
import MapContainer from '../components/MapContainer';
import { useGIS } from '../context/GISContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services/dataService';

// ─── localStorage + Supabase helpers ─────────────────────────────────────────
const LS_TASKS_KEY    = 'bhoomi_survey_tasks';
const LS_PROJECTS_KEY = 'bhoomi_projects';

const loadRaw  = (key, fb) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fb)); } catch { return fb; } };
const saveRaw  = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
const loadTasks    = () => loadRaw(LS_TASKS_KEY, []);
const saveTasks    = (t) => { saveRaw(LS_TASKS_KEY, t); dataService.saveTasks(t); };
const loadProjects = () => loadRaw(LS_PROJECTS_KEY, []);
const saveProjects = (p) => { saveRaw(LS_PROJECTS_KEY, p); dataService.saveProjects(p); };

const LAND_CLASSES = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Mixed Use'];

const STATUS_STYLE = {
  Pending:       { color: '#fbbf24', bg: 'rgba(251,191,36,.15)',  border: 'rgba(251,191,36,.3)'  },
  'In Progress': { color: '#38bdf8', bg: 'rgba(56,189,248,.15)', border: 'rgba(56,189,248,.3)'  },
  Completed:     { color: '#34d399', bg: 'rgba(52,211,153,.15)', border: 'rgba(52,211,153,.3)'  },
};

const PROJECT_STATUS_STYLE = {
  PENDING:       { label: '🟡 IN PROGRESS',  color: '#fbbf24', bg: 'rgba(251,191,36,.12)',  border: 'rgba(251,191,36,.3)'  },
  IN_PROGRESS:   { label: '🟡 IN PROGRESS',  color: '#fbbf24', bg: 'rgba(251,191,36,.12)',  border: 'rgba(251,191,36,.3)'  },
  CLOSED:        { label: '🟢 CLOSED',        color: '#34d399', bg: 'rgba(52,211,153,.12)',  border: 'rgba(52,211,153,.3)'  },
  COMPLETED:     { label: '🟢 CLOSED',        color: '#34d399', bg: 'rgba(52,211,153,.12)',  border: 'rgba(52,211,153,.3)'  },
  UNDER_REVIEW:  { label: '🟠 UNDER REVIEW',  color: '#fb923c', bg: 'rgba(251,146,60,.12)',  border: 'rgba(251,146,60,.3)'  },
  RESUBMITTED:   { label: '🔵 RESUBMITTED',   color: '#818cf8', bg: 'rgba(129,140,248,.12)', border: 'rgba(129,140,248,.3)' },
};

import { supabase, isSupabaseConfigured } from '../services/supabaseClient';

// File → High-Fidelity DataURL or Supabase Storage upload
async function uploadSurveyDocument(file, taskId, docType = 'report') {
  if (!file) return null;

  // 1. Try Supabase Storage if configured
  if (isSupabaseConfigured && supabase) {
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${docType}s/${taskId}_${Date.now()}_${cleanName}`;
      const { data, error } = await supabase.storage.from('documents').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });
      if (!error && data) {
        const { data: pub } = supabase.storage.from('documents').getPublicUrl(path);
        if (pub?.publicUrl) return pub.publicUrl;
      }
    } catch (e) {
      console.warn('[Storage] Supabase bucket upload fallback to DataURL:', e);
    }
  }

  // 2. High-fidelity base64 DataURL (supports up to 15MB without dropping files)
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ─── Project Tile ─────────────────────────────────────────────────────────────
function ProjectTile({ project, taskCount, onOpen }) {
  const st = PROJECT_STATUS_STYLE[project.status] || PROJECT_STATUS_STYLE.PENDING;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer w-full"
      style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(100,116,139,.22)' }}
      onMouseEnter={(e) => { e.currentTarget.style.border = '1px solid rgba(56,189,248,.4)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(56,189,248,.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.border = '1px solid rgba(100,116,139,.22)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Status badge */}
      <div
        className="inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-3 border"
        style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
      >
        {st.label}
      </div>

      <h3 className="text-sm font-bold text-white mb-1 leading-snug">{project.project_name}</h3>
      <div className="text-[11px] font-mono text-sky-400 mb-3">{project.project_id}</div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-slate-400">
          <MapPin className="w-3 h-3 text-emerald-400" />
          {taskCount} plot{taskCount !== 1 ? 's' : ''} assigned
        </span>
        <span className="text-slate-500 text-[10px]">{new Date(project.created_at).toLocaleDateString('en-IN')}</span>
      </div>

      <div className="mt-3 text-xs font-semibold text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
        View Plots →
      </div>
    </button>
  );
}

// ─── Individual plot form card ────────────────────────────────────────────────
function PlotFormCard({ task, localData, onChange }) {
  const soilInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const [uploadingSoil, setUploadingSoil] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleSoilUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSoil(true);
    const dataUrl = await uploadSurveyDocument(file, task.id, 'soil_report');
    onChange('soilReportUrl', dataUrl || 'uploaded:' + file.name);
    onChange('soilReportName', file.name);
    setUploadingSoil(false);
  }, [onChange, task.id]);

  const handlePhotoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const dataUrl = await uploadSurveyDocument(file, task.id, 'photo');
    onChange('sitePhotoUrl', dataUrl || 'uploaded:' + file.name);
    onChange('sitePhotoName', file.name);
    setUploadingPhoto(false);
  }, [onChange, task.id]);

  const ss = STATUS_STYLE[task.status] || STATUS_STYLE.Pending;
  const inp = 'w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500';

  return (
    <div
      className="p-4 rounded-2xl border"
      style={{
        background: 'rgba(9,13,27,0.8)',
        border: task.officerStatus === 'Under Review'
          ? '1px solid rgba(251,146,60,.4)'
          : '1px solid rgba(100,116,139,.2)',
      }}
    >
      {/* Officer feedback callout (shown when plot was sent for review or has officer remarks) */}
      {(task.officerStatus === 'Under Review' || task.reviewRemarks || task.officerRemarks) && (
        <div
          className="mb-3.5 p-3.5 rounded-xl border text-xs shadow-lg"
          style={{
            background: task.officerStatus === 'Under Review' ? 'rgba(251,146,60,.12)' : 'rgba(56,189,248,.12)',
            border: task.officerStatus === 'Under Review' ? '1px solid rgba(251,146,60,.45)' : '1px solid rgba(56,189,248,.35)',
          }}
        >
          <div
            className="flex items-center gap-1.5 font-bold mb-1"
            style={{ color: task.officerStatus === 'Under Review' ? '#fb923c' : '#38bdf8' }}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>
              {task.officerStatus === 'Under Review'
                ? '⚠️ Municipal Officer Feedback — Action Required (Re-Survey)'
                : '📝 Municipal Officer Instructions / Remarks'}
            </span>
          </div>
          <p className="text-slate-200 leading-relaxed font-medium pl-5">
            {task.reviewRemarks || task.officerRemarks || 'Please review parcel boundaries, verify Khasra number, and re-upload required documents.'}
          </p>
        </div>
      )}

      {/* Plot header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-xs font-mono text-sky-300">{task.plotId}</span>
          <span className="text-[10px] text-slate-400 font-mono">
            {localData.khasraNo || task.khasraNo ? `Khasra: ${localData.khasraNo || task.khasraNo}` : '📋 Khasra: Unverified'}
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
            style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}
          >
            {task.status}
          </span>
        </div>
        {task.coords?.lat && (
          <a
            href={`https://www.google.com/maps?q=${task.coords.lat},${task.coords.lng}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-[10px] transition-colors shrink-0"
          >
            <Navigation className="w-3 h-3" /> Navigate <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>

      {task.address && (
        <div className="flex items-start gap-1.5 text-[11px] text-slate-400 mb-3">
          <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />{task.address}
        </div>
      )}

      {/* Form fields — 2 col grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            <User className="w-2.5 h-2.5" /> Owner Name (On-site)
          </label>
          <input
            type="text"
            className={inp}
            placeholder="Full legal owner name"
            value={localData.surveyorOwnerName || ''}
            onChange={(e) => onChange('surveyorOwnerName', e.target.value)}
          />
        </div>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            <Phone className="w-2.5 h-2.5 text-emerald-400" /> Phone Number
          </label>
          <input
            type="text"
            className={inp}
            placeholder="10-digit mobile number"
            value={localData.surveyorPhone || ''}
            onChange={(e) => onChange('surveyorPhone', e.target.value)}
          />
        </div>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            <Tag className="w-2.5 h-2.5 text-sky-400" /> Aadhaar Number
          </label>
          <input
            type="text"
            className={inp}
            placeholder="12-digit Aadhaar number"
            value={localData.surveyorAadhaar || ''}
            onChange={(e) => onChange('surveyorAadhaar', e.target.value)}
          />
        </div>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-amber-300 uppercase tracking-wide mb-1">
            📋 Khasra / Dag / Survey No.
          </label>
          <input
            type="text"
            className={inp}
            placeholder="e.g. Dag 452/A or RS-108"
            value={localData.khasraNo ?? task.khasraNo ?? ''}
            onChange={(e) => onChange('khasraNo', e.target.value)}
          />
        </div>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            <Tag className="w-2.5 h-2.5" /> Verified Land Classification
          </label>
          <div className="relative">
            <select
              value={localData.verifiedLandClass || task.landCategory || 'Residential'}
              onChange={(e) => onChange('verifiedLandClass', e.target.value)}
              className={`${inp} pr-6 appearance-none cursor-pointer`}
            >
              {LAND_CLASSES.map((c) => (
                <option key={c} value={c} style={{ background: '#0f172a' }}>{c}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-sky-400 uppercase tracking-wide mb-1">
            📍 Zone Designation / Location Type
          </label>
          <div className="relative">
            <select
              value={localData.zoneType || (localData.isRural ? 'RURAL' : 'URBAN')}
              onChange={(e) => {
                const z = e.target.value;
                onChange('zoneType', z);
                onChange('isRural', z === 'RURAL');
              }}
              className={`${inp} pr-6 appearance-none cursor-pointer font-medium text-sky-300`}
            >
              <option value="URBAN" style={{ background: '#0f172a' }}>🏙️ Urban (1.2x Multiplier)</option>
              <option value="RURAL" style={{ background: '#0f172a' }}>🌾 Rural (2.0x Multiplier)</option>
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1">
            📏 On-Ground Measured Area (sq m)
          </label>
          <input
            type="number"
            className={inp}
            placeholder="e.g. 450 (sq m)"
            value={localData.areaSqm ?? ''}
            onChange={(e) => onChange('areaSqm', e.target.value)}
          />
        </div>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1">
            🏠 Assets / Structure / Crop Value (₹)
          </label>
          <input
            type="number"
            className={inp}
            placeholder="e.g. 250000"
            value={localData.assetValue ?? ''}
            onChange={(e) => onChange('assetValue', e.target.value)}
          />
        </div>
      </div>

      {/* File uploads */}
      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        {/* Soil / Legal Report */}
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            <FileText className="w-2.5 h-2.5" /> Legal / Soil Report (PDF)
          </label>
          <input ref={soilInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleSoilUpload} />
          <button
            type="button"
            onClick={() => soilInputRef.current?.click()}
            disabled={uploadingSoil}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer hover:border-sky-500 hover:text-sky-300 disabled:opacity-60"
            style={{
              background: localData.soilReportUrl ? 'rgba(52,211,153,.1)' : 'rgba(30,41,59,0.6)',
              border: localData.soilReportUrl ? '1px solid rgba(52,211,153,.35)' : '1px dashed rgba(100,116,139,.35)',
              color: localData.soilReportUrl ? '#34d399' : '#64748b',
            }}
          >
            {uploadingSoil ? (
              <><Clock className="w-3 h-3 animate-spin text-sky-400" /> Uploading PDF…</>
            ) : localData.soilReportUrl ? (
              <><CheckCircle2 className="w-3 h-3" /> {localData.soilReportName || 'Report Uploaded'}</>
            ) : (
              <><Upload className="w-3 h-3" /> Upload Report</>
            )}
          </button>
        </div>

        {/* Site Photos */}
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            <Camera className="w-2.5 h-2.5" /> Site Inspection Photo
          </label>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer hover:border-sky-500 hover:text-sky-300 disabled:opacity-60"
            style={{
              background: localData.sitePhotoUrl ? 'rgba(52,211,153,.1)' : 'rgba(30,41,59,0.6)',
              border: localData.sitePhotoUrl ? '1px solid rgba(52,211,153,.35)' : '1px dashed rgba(100,116,139,.35)',
              color: localData.sitePhotoUrl ? '#34d399' : '#64748b',
            }}
          >
            {uploadingPhoto ? (
              <><Clock className="w-3 h-3 animate-spin text-sky-400" /> Uploading Photo…</>
            ) : localData.sitePhotoUrl ? (
              <><CheckCircle2 className="w-3 h-3" /> {localData.sitePhotoName || 'Photo Uploaded'}</>
            ) : (
              <><Upload className="w-3 h-3" /> Upload Photo</>
            )}
          </button>
          {/* Preview thumbnail if it's a real base64 image */}
          {localData.sitePhotoUrl?.startsWith('data:image') && (
            <img
              src={localData.sitePhotoUrl}
              alt="Site preview"
              className="mt-1.5 w-full h-16 object-cover rounded-lg border border-slate-700"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Project Tile Grid (3-Tab) ───────────────────────────────────────
function ProjectGrid({ onSelectProject, onSelectReview }) {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('active');
  const [projects, setProjects] = useState(loadProjects);
  const [allTasks, setAllTasks] = useState(loadTasks);

  const refreshData = useCallback(async () => {
    const [pList, tList] = await Promise.all([
      dataService.getProjects(),
      dataService.getTasks(),
    ]);
    if (pList) setProjects(pList);
    if (tList) setAllTasks(tList);
  }, []);

  React.useEffect(() => {
    refreshData();
    const unsub = dataService.subscribe(() => {
      refreshData();
    });
    return unsub;
  }, [refreshData]);

  const tasksByProject = useMemo(() => {
    const map = {};
    allTasks.forEach((t) => {
      if (t.projectId) map[t.projectId] = (map[t.projectId] || 0) + 1;
    });
    return map;
  }, [allTasks]);

  // Categorise projects into tabs
  const activeProjects    = projects.filter((p) => ['PENDING', 'IN_PROGRESS'].includes(p.status));
  const reviewProjects    = projects.filter((p) => p.status === 'UNDER_REVIEW');
  const completedProjects = projects.filter((p) => ['CLOSED', 'COMPLETED', 'RESUBMITTED'].includes(p.status));

  const TABS = [
    { key: 'active',    label: 'Active Projects',    count: activeProjects.length,    color: '#fbbf24' },
    { key: 'review',    label: 'Under Review',        count: reviewProjects.length,    color: '#fb923c' },
    { key: 'completed', label: 'Completed Projects',  count: completedProjects.length, color: '#34d399' },
  ];

  const shownProjects =
    activeTab === 'active' ? activeProjects :
    activeTab === 'review' ? reviewProjects :
    completedProjects;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Project grid panel */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: 'radial-gradient(ellipse at 70% 0%, rgba(56,189,248,.04) 0%, transparent 55%), #030712' }}
      >
        <div className="max-w-5xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: 'rgba(56,189,248,.12)', border: '1px solid rgba(56,189,248,.25)' }}
                >
                  🔍
                </div>
                <div>
                  <h1 className="text-xl font-black text-white">My Survey Projects</h1>
                  <p className="text-xs text-slate-400">{userProfile?.name || 'Field Surveyor'} · {userProfile?.designation || 'Ground Inspector'}</p>
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="text-2xl font-black text-sky-400">{projects.length}</div>
              <div>Projects Assigned</div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-6 p-1 rounded-2xl border" style={{ background: 'rgba(9,13,27,0.8)', border: '1px solid rgba(100,116,139,.18)' }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                style={{
                  background: activeTab === tab.key ? 'rgba(255,255,255,.06)' : 'transparent',
                  color: activeTab === tab.key ? tab.color : '#64748b',
                  border: activeTab === tab.key ? `1px solid ${tab.color}40` : '1px solid transparent',
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                    style={{ background: `${tab.color}22`, color: tab.color }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Under Review info callout */}
          {activeTab === 'review' && (
            <div
              className="mb-5 p-4 rounded-2xl border text-xs"
              style={{ background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.3)' }}
            >
              <div className="flex items-center gap-2 font-bold text-orange-400 mb-1">
                <RotateCcw className="w-3.5 h-3.5" /> Projects Returned for Re-Survey
              </div>
              <p className="text-slate-400">These projects were reviewed by the Municipal Officer and sent back with specific remarks. Open a project to view feedback and re-upload required documents.</p>
            </div>
          )}

          {shownProjects.length === 0 ? (
            <div
              className="py-24 text-center rounded-2xl border"
              style={{ border: '1px dashed rgba(100,116,139,.2)', background: 'rgba(15,23,42,0.4)' }}
            >
              <FolderOpen className="w-14 h-14 text-slate-700 mx-auto mb-4" />
              <p className="text-base font-bold text-slate-500">
                {activeTab === 'active' ? 'No active projects' :
                 activeTab === 'review' ? 'No projects under review' :
                 'No completed projects yet'}
              </p>
              <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto">
                {activeTab === 'active'
                  ? 'A Municipal Officer must create a project and dispatch plots before they appear here.'
                  : activeTab === 'review'
                  ? 'When an officer sends a project back for re-survey, it will appear here.'
                  : 'Submitted and closed projects appear here once reviewed.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shownProjects.map((proj) => (
                <ProjectTile
                  key={proj.project_id}
                  project={proj}
                  taskCount={tasksByProject[proj.project_id] || 0}
                  onOpen={() =>
                    activeTab === 'review'
                      ? onSelectReview(proj)
                      : onSelectProject(proj)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map preview — context only */}
      <div className="w-[420px] shrink-0 border-l border-slate-800 relative">
        <MapContainer />
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
          style={{ background: 'rgba(9,13,27,0.9)', border: '1px solid rgba(56,189,248,.25)', color: '#7dd3fc', backdropFilter: 'blur(8px)' }}
        >
          🗺️ Map Preview
        </div>
      </div>
    </div>
  );
}

// ─── Review Inspection: plots sent back by officer ────────────────────────────
function ReviewInspection({ project, onBack }) {
  const { showToast } = useGIS();
  const [allTasks, setAllTasks] = useState(loadTasks);

  const refreshReview = useCallback(async () => {
    const tList = await dataService.getTasks();
    if (tList) setAllTasks(tList);
  }, []);

  React.useEffect(() => {
    refreshReview();
    const unsub = dataService.subscribe(() => {
      refreshReview();
    });
    return unsub;
  }, [refreshReview]);

  // Only show plots that the officer sent back
  const reviewTasks = allTasks.filter(
    (t) => t.projectId === project.project_id && (t.officerStatus === 'Under Review' || Boolean(t.reviewRemarks))
  );

  const [formData, setFormData] = useState(() => {
    const init = {};
    reviewTasks.forEach((t) => {
      init[t.id] = {
        surveyorOwnerName:    t.surveyorOwnerName    || '',
        surveyorPhone:        t.surveyorPhone        || '',
        surveyorAadhaar:      t.surveyorAadhaar      || '',
        surveyorOwnerContact: t.surveyorOwnerContact || '',
        khasraNo:             t.khasraNo             || '',
        verifiedLandClass:    t.verifiedLandClass    || t.landCategory || 'Residential',
        zoneType:             t.zoneType             || (t.isRural ? 'RURAL' : 'URBAN'),
        isRural:              t.zoneType === 'RURAL' || Boolean(t.isRural),
        areaSqm:              t.areaSqm              ?? '',
        assetValue:           t.assetValue           ?? '',
        soilReportUrl:        t.soilReportUrl        || null,
        soilReportName:       t.soilReportName       || null,
        sitePhotoUrl:         t.sitePhotoUrl         || null,
        sitePhotoName:        t.sitePhotoName        || null,
      };
    });
    return init;
  });

  const [submitting, setSubmitting] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);

  const handleChange = useCallback((taskId, field, value) => {
    setFormData((prev) => ({ ...prev, [taskId]: { ...prev[taskId], [field]: value } }));
  }, []);

  const handleResubmit = useCallback(async () => {
    setSubmitting(true);
    const allT = loadTasks();
    const updated = allT.map((t) => {
      if (t.projectId !== project.project_id || (t.officerStatus !== 'Under Review' && !t.reviewRemarks)) return t;
      const fd = formData[t.id] || {};
      const isR = fd.zoneType === 'RURAL' || Boolean(fd.isRural);
      return {
        ...t, ...fd,
        khasraNo: fd.khasraNo !== undefined ? fd.khasraNo.trim() : (t.khasraNo || ''),
        zoneType: isR ? 'RURAL' : 'URBAN',
        isRural: isR,
        // Sync landCategory from surveyor's verified classification so PDF/reports always use the updated value
        landCategory: fd.verifiedLandClass || t.verifiedLandClass || t.landCategory,
        officerStatus: null,     // reset so officer can re-review
        reviewRemarks: null,
        resubmittedAt: new Date().toISOString(),
        status: 'Completed',
      };
    });
    await dataService.saveTasks(updated);

    // Mark project as RESUBMITTED in Supabase + LocalStorage
    const allP = loadProjects();
    const targetProj = allP.find((p) => p.project_id === project.project_id);
    if (targetProj) {
      await dataService.addProject({ ...targetProj, status: 'RESUBMITTED' });
    }

    showToast(`✅ Project ${project.project_id} re-submitted for officer review.`, 'success');
    setSubmitting(false);
    setResubmitted(true);
  }, [formData, project, showToast]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="h-12 px-4 flex items-center gap-3 border-b shrink-0"
        style={{ background: 'rgba(9,13,27,0.98)', borderColor: 'rgba(251,146,60,.3)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All Projects
        </button>
        <div className="w-px h-5 bg-slate-700" />
        <RotateCcw className="w-4 h-4 text-orange-400" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{project.project_name}</div>
          <div className="text-[10px] font-mono text-orange-400">{project.project_id} · Under Review — Re-Survey Required</div>
        </div>
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(251,146,60,.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,.3)' }}
        >
          {reviewTasks.length} plot{reviewTasks.length !== 1 ? 's' : ''} flagged
        </span>
      </div>

      {/* Plots form */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: '#060a14' }}>
          {resubmitted ? (
            <div
              className="py-16 text-center rounded-2xl border"
              style={{ background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.3)' }}
            >
              <CheckCircle2 className="w-10 h-10 text-orange-400 mx-auto mb-3" />
              <p className="text-base font-bold text-white">Re-Survey Submitted for Officer Review</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Updated documents and data have been dispatched. The Municipal Officer will review and approve or send further remarks.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
                style={{ background: 'rgba(251,146,60,.25)', border: '1px solid rgba(251,146,60,.5)' }}
              >
                ← Back to Projects
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {reviewTasks.map((task) => (
                <PlotFormCard
                  key={task.id}
                  task={task}
                  localData={formData[task.id] || {}}
                  onChange={(field, value) => handleChange(task.id, field, value)}
                />
              ))}

              <button
                type="button"
                disabled={submitting}
                onClick={handleResubmit}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer hover:opacity-90 active:scale-98 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #ea580c, #d97706)',
                  color: '#fff',
                  boxShadow: '0 0 20px rgba(234,88,12,.3)',
                }}
              >
                {submitting ? (
                  <><Clock className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Re-Submit All Updated Details</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="w-80 shrink-0 border-l border-slate-800 relative">
          <MapContainer />
        </div>
      </div>
    </div>
  );
}

// ─── Step 2 + 3: Plot Inspection & Batch Finalization ─────────────────────────

function PlotInspection({ project, onBack }) {
  const { showToast, focusOnFeature, allFeatures } = useGIS();
  const [allTasks, setAllTasks] = useState(loadTasks);

  const refreshPlots = useCallback(async () => {
    const tList = await dataService.getTasks();
    if (tList) setAllTasks(tList);
  }, []);

  React.useEffect(() => {
    refreshPlots();
    const unsub = dataService.subscribe(() => {
      refreshPlots();
    });
    return unsub;
  }, [refreshPlots]);

  const projTasks = allTasks.filter((t) => t.projectId === project.project_id);

  // Local form state keyed by task ID
  const [formData, setFormData] = useState(() => {
    const init = {};
    projTasks.forEach((t) => {
      init[t.id] = {
        surveyorOwnerName:    t.surveyorOwnerName    || '',
        surveyorPhone:        t.surveyorPhone        || '',
        surveyorAadhaar:      t.surveyorAadhaar      || '',
        surveyorOwnerContact: t.surveyorOwnerContact || '',
        khasraNo:             t.khasraNo             || '',
        verifiedLandClass:    t.verifiedLandClass    || t.landCategory || 'Residential',
        zoneType:             t.zoneType             || (t.isRural ? 'RURAL' : 'URBAN'),
        isRural:              t.zoneType === 'RURAL' || Boolean(t.isRural),
        areaSqm:              t.areaSqm              ?? '',
        assetValue:           t.assetValue           ?? '',
        soilReportUrl:        t.soilReportUrl        || null,
        soilReportName:       t.soilReportName       || null,
        sitePhotoUrl:         t.sitePhotoUrl         || null,
        sitePhotoName:        t.sitePhotoName        || null,
      };
    });
    return init;
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(project.status === 'CLOSED' || project.status === 'COMPLETED');

  const handleChange = useCallback((taskId, field, value) => {
    setFormData((prev) => ({ ...prev, [taskId]: { ...prev[taskId], [field]: value } }));
  }, []);

  const handleNavigate = (task) => {
    const match = allFeatures.find((f) => f.properties?.plotId === task.plotId);
    if (match) focusOnFeature(match, 'plot', 17);
    else if (task.coords?.lat) window.open(`https://www.google.com/maps?q=${task.coords.lat},${task.coords.lng}`, '_blank', 'noreferrer');
  };

  const handleFinalSubmit = useCallback(async () => {
    setSubmitting(true);
    // Merge form data back into task records
    const allT = loadTasks();
    const updated = allT.map((t) => {
      if (t.projectId !== project.project_id) return t;
      const fd = formData[t.id] || {};
      const isR = fd.zoneType === 'RURAL' || Boolean(fd.isRural);
      return {
        ...t,
        ...fd,
        khasraNo: fd.khasraNo !== undefined ? fd.khasraNo.trim() : (t.khasraNo || ''),
        zoneType: isR ? 'RURAL' : 'URBAN',
        isRural: isR,
        // Sync landCategory from surveyor's verified classification so PDF/reports always use the updated value
        landCategory: fd.verifiedLandClass || t.verifiedLandClass || t.landCategory,
        status: 'Completed',
      };
    });
    await dataService.saveTasks(updated);

    // Mark project as CLOSED in Supabase + LocalStorage
    const allP = loadProjects();
    const targetP = allP.find((p) => p.project_id === project.project_id);
    if (targetP) {
      await dataService.addProject({ ...targetP, status: 'CLOSED' });
    }

    showToast(`✅ Project ${project.project_id} submitted & closed.`, 'success');
    setTimeout(() => { setSubmitting(false); setSubmitted(true); }, 600);
  }, [formData, project, showToast]);

  const completedCount = projTasks.filter((t) => {
    const fd = formData[t.id] || {};
    return fd.surveyorOwnerName && fd.verifiedLandClass;
  }).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Branch header */}
      <div
        className="h-12 px-4 flex items-center gap-3 border-b border-slate-800 shrink-0"
        style={{ background: 'rgba(9,13,27,0.98)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All Projects
        </button>
        <div className="w-px h-5 bg-slate-700" />
        <FolderOpen className="w-4 h-4 text-sky-400" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{project.project_name}</div>
          <div className="text-[10px] font-mono text-sky-400">{project.project_id}</div>
        </div>
        <div className="text-[11px] text-slate-400 shrink-0">
          <span className="text-white font-bold">{completedCount}</span> / {projTasks.length} forms filled
        </div>
      </div>

      {/* Plot form list */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: '#060a14' }}>
          {submitted && (
            <div
              className="p-4 rounded-2xl border text-center mb-4"
              style={{ background: 'rgba(5,46,22,.4)', border: '1px solid rgba(52,211,153,.3)' }}
            >
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-emerald-300">Project Closed & Submitted</p>
              <p className="text-xs text-slate-400 mt-1">All plot data has been saved. Municipal Officer can now review the reports.</p>
            </div>
          )}

          {projTasks.length === 0 && (
            <div className="py-20 text-center text-slate-500">
              <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No plots found in this project.</p>
            </div>
          )}

          {projTasks.map((task) => (
            <PlotFormCard
              key={task.id}
              task={task}
              localData={formData[task.id] || {}}
              onChange={(field, value) => handleChange(task.id, field, value)}
            />
          ))}

          {/* Batch Submit */}
          {projTasks.length > 0 && !submitted && (
            <div
              className="mt-4 p-5 rounded-2xl border"
              style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(56,189,248,.2)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-bold text-white">Batch Submit & Close Project</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {completedCount} of {projTasks.length} plot forms completed.
                    {completedCount < projTasks.length && (
                      <span className="text-amber-400 ml-1">Incomplete forms will be saved as-is.</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black" style={{ color: completedCount === projTasks.length ? '#34d399' : '#fbbf24' }}>
                    {Math.round((completedCount / Math.max(projTasks.length, 1)) * 100)}%
                  </div>
                  <div className="text-[10px] text-slate-500">Complete</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full bg-slate-800 mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round((completedCount / Math.max(projTasks.length, 1)) * 100)}%`,
                    background: completedCount === projTasks.length
                      ? 'linear-gradient(90deg,#10b981,#34d399)'
                      : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer disabled:opacity-60 hover:scale-[1.02] active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                  color: '#fff',
                  boxShadow: '0 0 20px rgba(56,189,248,.3)',
                }}
              >
                {submitting ? (
                  <><Clock className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><Send className="w-4 h-4" /> OK — Submit All Documents & Close Project</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Map — surveyors can navigate to each plot */}
        <div className="w-80 shrink-0 border-l border-slate-800 relative">
          <MapContainer />
        </div>
      </div>
    </div>
  );
}

// ─── Root Surveyor Layout ─────────────────────────────────────────────────────
export default function SurveyorLayout() {
  const [selectedProject, setSelectedProject] = useState(null);
  const [reviewProject, setReviewProject] = useState(null);

  if (reviewProject) {
    return (
      <ReviewInspection
        project={reviewProject}
        onBack={() => setReviewProject(null)}
      />
    );
  }

  if (selectedProject) {
    return (
      <PlotInspection
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    );
  }

  return (
    <ProjectGrid
      onSelectProject={setSelectedProject}
      onSelectReview={setReviewProject}
    />
  );
}
