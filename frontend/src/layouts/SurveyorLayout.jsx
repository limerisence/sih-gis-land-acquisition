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
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';

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
  Pending:       { label: 'Pending',     className: 'bg-amber-50 text-amber-700 border border-amber-200/60' },
  'In Progress': { label: 'In Progress', className: 'bg-blue-50 text-blue-700 border border-blue-200/60' },
  Completed:     { label: 'Completed',   className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' },
};

const PROJECT_STATUS_STYLE = {
  PENDING:       { label: 'IN PROGRESS',  className: 'bg-amber-50 text-amber-700 border border-amber-200/60' },
  IN_PROGRESS:   { label: 'IN PROGRESS',  className: 'bg-amber-50 text-amber-700 border border-amber-200/60' },
  CLOSED:        { label: 'CLOSED',       className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' },
  COMPLETED:     { label: 'CLOSED',       className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' },
  UNDER_REVIEW:  { label: 'UNDER REVIEW', className: 'bg-rose-50 text-rose-700 border border-rose-200/60' },
  RESUBMITTED:   { label: 'RESUBMITTED',  className: 'bg-blue-50 text-blue-700 border border-blue-200/60' },
};

// File → High-Fidelity DataURL or Supabase Storage upload
async function uploadSurveyDocument(file, taskId, docType = 'report') {
  if (!file) return null;

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
      className="group text-left p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer w-full"
    >
      {/* Status badge */}
      <div
        className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-3 ${st.className}`}
      >
        {st.label}
      </div>

      <h3 className="text-sm font-bold text-slate-900 mb-1 leading-snug">{project.project_name}</h3>
      <div className="text-[11px] font-mono text-blue-600 mb-3">{project.project_id}</div>

      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-500">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          {taskCount} plot{taskCount !== 1 ? 's' : ''} assigned
        </span>
        <span className="text-slate-400 text-[11px]">{new Date(project.created_at).toLocaleDateString('en-IN')}</span>
      </div>

      <div className="mt-3 text-xs font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
        View Plots →
      </div>
    </button>
  );
}

// ─── Individual plot form card ────────────────────────────────────────────────
function PlotFormCard({ task, localData, onChange, onFocus }) {
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
  const inp = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-all';

  return (
    <div
      className={`p-5 rounded-xl border bg-white shadow-sm transition-all ${
        task.officerStatus === 'Under Review' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'
      }`}
    >
      {/* Officer feedback callout */}
      {(task.officerStatus === 'Under Review' || task.reviewRemarks || task.officerRemarks) && (
        <div
          className={`mb-4 p-3.5 rounded-lg border text-xs ${
            task.officerStatus === 'Under Review'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold mb-1">
            <MessageSquare className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              {task.officerStatus === 'Under Review'
                ? '⚠️ Municipal Officer Feedback — Action Required (Re-Survey)'
                : '📝 Municipal Officer Instructions / Remarks'}
            </span>
          </div>
          <p className="leading-relaxed font-medium pl-5 text-slate-700">
            {task.reviewRemarks || task.officerRemarks || 'Please review parcel boundaries, verify Khasra number, and re-upload required documents.'}
          </p>
        </div>
      )}

      {/* Plot header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
            {task.plotId}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {localData.khasraNo || task.khasraNo ? `Khasra: ${localData.khasraNo || task.khasraNo}` : '📋 Khasra: Unverified'}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ss.className}`}>
            {task.status}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {onFocus && (
            <button
              type="button"
              onClick={onFocus}
              className="flex items-center gap-1 text-slate-600 hover:text-blue-600 text-xs font-semibold transition-colors cursor-pointer"
              title="Locate plot on map"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600" /> Locate
            </button>
          )}
          {task.coords?.lat && (
            <a
              href={`https://www.google.com/maps?q=${task.coords.lat},${task.coords.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold transition-colors shrink-0"
            >
              <Navigation className="w-3.5 h-3.5" /> Navigate <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {task.address && (
        <div className="flex items-start gap-1.5 text-xs text-slate-500 mb-3">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />{task.address}
        </div>
      )}

      {/* Form fields — 2 col grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            <User className="w-3 h-3 text-slate-400" /> Owner Name (On-site)
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
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            <Phone className="w-3 h-3 text-emerald-600" /> Phone Number
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
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            <Tag className="w-3 h-3 text-blue-600" /> Aadhaar Number
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
          <label className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1">
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
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            <Tag className="w-3 h-3 text-slate-400" /> Verified Land Classification
          </label>
          <div className="relative">
            <select
              value={localData.verifiedLandClass || task.landCategory || 'Residential'}
              onChange={(e) => onChange('verifiedLandClass', e.target.value)}
              className={`${inp} pr-6 appearance-none cursor-pointer`}
            >
              {LAND_CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">
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
              className={`${inp} pr-6 appearance-none cursor-pointer font-medium text-slate-800`}
            >
              <option value="URBAN">🏙️ Urban (1.2x Multiplier)</option>
              <option value="RURAL">🌾 Rural (2.0x Multiplier)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
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
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            🏠 Assets / Structure Value (₹)
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
      <div className="grid grid-cols-2 gap-3 mt-3">
        {/* Soil / Legal Report */}
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            <FileText className="w-3 h-3 text-slate-400" /> Legal / Soil Report (PDF)
          </label>
          <input ref={soilInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleSoilUpload} />
          <button
            type="button"
            onClick={() => soilInputRef.current?.click()}
            disabled={uploadingSoil}
            className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer disabled:opacity-60 ${
              localData.soilReportUrl
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-dashed border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {uploadingSoil ? (
              <><Clock className="w-3.5 h-3.5 animate-spin text-blue-600" /> Uploading PDF…</>
            ) : localData.soilReportUrl ? (
              <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {localData.soilReportName || 'Report Uploaded'}</>
            ) : (
              <><Upload className="w-3.5 h-3.5 text-slate-400" /> Upload Report</>
            )}
          </button>
        </div>

        {/* Site Photos */}
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
            <Camera className="w-3 h-3 text-slate-400" /> Site Inspection Photo
          </label>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer disabled:opacity-60 ${
              localData.sitePhotoUrl
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-dashed border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {uploadingPhoto ? (
              <><Clock className="w-3.5 h-3.5 animate-spin text-blue-600" /> Uploading Photo…</>
            ) : localData.sitePhotoUrl ? (
              <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {localData.sitePhotoName || 'Photo Uploaded'}</>
            ) : (
              <><Upload className="w-3.5 h-3.5 text-slate-400" /> Upload Photo</>
            )}
          </button>
          {localData.sitePhotoUrl?.startsWith('data:image') && (
            <img
              src={localData.sitePhotoUrl}
              alt="Site preview"
              className="mt-2 w-full h-16 object-cover rounded-lg border border-slate-200"
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
  const { loadProjectIntoMap } = useGIS();
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

  const activeProjects    = projects.filter((p) => ['PENDING', 'IN_PROGRESS'].includes(p.status));
  const reviewProjects    = projects.filter((p) => p.status === 'UNDER_REVIEW');
  const completedProjects = projects.filter((p) => ['CLOSED', 'COMPLETED', 'RESUBMITTED'].includes(p.status));

  const TABS = [
    { key: 'active',    label: 'Active Projects',    count: activeProjects.length },
    { key: 'review',    label: 'Under Review',        count: reviewProjects.length },
    { key: 'completed', label: 'Completed Projects',  count: completedProjects.length },
  ];

  const shownProjects =
    activeTab === 'active' ? activeProjects :
    activeTab === 'review' ? reviewProjects :
    completedProjects;

  React.useEffect(() => {
    if (shownProjects.length > 0) {
      const activeP = shownProjects[0];
      const pTasks = allTasks.filter((t) => t.projectId === activeP.project_id);
      loadProjectIntoMap(activeP, pTasks);
    }
  }, [shownProjects, allTasks, loadProjectIntoMap]);

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* Project grid panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-6 p-5 rounded-xl border border-slate-200 bg-white shadow-sm flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-xl shrink-0">
                🧭
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">My Survey Projects</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {userProfile?.name || 'Field Surveyor'} · {userProfile?.designation || 'Ground Inspector'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">{projects.length}</div>
              <div className="text-xs text-slate-500">Projects Assigned</div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-2 mb-6 p-1.5 rounded-xl border border-slate-200 bg-white shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Under Review info callout */}
          {activeTab === 'review' && (
            <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-amber-800 mb-1">
                <RotateCcw className="w-4 h-4" /> Projects Returned for Re-Survey
              </div>
              <p className="text-slate-600">
                These projects were reviewed by the Municipal Officer and sent back with specific remarks. Open a project to view feedback and re-upload required documents.
              </p>
            </div>
          )}

          {shownProjects.length === 0 ? (
            <div className="py-20 text-center rounded-xl border border-dashed border-slate-200 bg-white shadow-sm">
              <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-700">
                {activeTab === 'active' ? 'No active projects' :
                 activeTab === 'review' ? 'No projects under review' :
                 'No completed projects yet'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
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

      {/* Map preview */}
      <div className="w-[420px] shrink-0 border-l border-slate-200 relative bg-white">
        <MapContainer />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-xs font-semibold bg-white/95 border border-slate-200 text-slate-700 shadow-sm backdrop-blur-sm">
          🗺️ Corridor Map View
        </div>
      </div>
    </div>
  );
}

// ─── Review Inspection: plots sent back by officer ────────────────────────────
function ReviewInspection({ project, onBack }) {
  const { showToast, loadProjectIntoMap, focusOnFeature } = useGIS();
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

  const reviewTasks = allTasks.filter(
    (t) => t.projectId === project.project_id && (t.officerStatus === 'Under Review' || Boolean(t.reviewRemarks))
  );

  React.useEffect(() => {
    if (project && reviewTasks.length > 0) {
      loadProjectIntoMap(project, reviewTasks);
    }
  }, [project, reviewTasks, loadProjectIntoMap]);

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
        landCategory: fd.verifiedLandClass || t.verifiedLandClass || t.landCategory,
        officerStatus: null,
        reviewRemarks: null,
        resubmittedAt: new Date().toISOString(),
        status: 'Completed',
      };
    });
    await dataService.saveTasks(updated);

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
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="h-14 px-5 flex items-center gap-3 border-b border-slate-200 bg-white shrink-0 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All Projects
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <RotateCcw className="w-4 h-4 text-amber-600" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{project.project_name}</div>
          <div className="text-[11px] font-mono text-amber-700">{project.project_id} · Under Review — Re-Survey Required</div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60">
          {reviewTasks.length} plot{reviewTasks.length !== 1 ? 's' : ''} flagged
        </span>
      </div>

      {/* Plots form */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {resubmitted ? (
            <div className="py-16 text-center rounded-xl border border-slate-200 bg-white shadow-sm">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-900">Re-Survey Submitted for Officer Review</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Updated documents and data have been dispatched. The Municipal Officer will review and approve or send further remarks.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer shadow-sm"
              >
                ← Back to Projects
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {reviewTasks.map((task) => (
                <PlotFormCard
                  key={task.id}
                  task={task}
                  localData={formData[task.id] || {}}
                  onChange={(field, value) => handleChange(task.id, field, value)}
                  onFocus={() => {
                    if (task.coords?.lat && task.coords?.lng) {
                      focusOnFeature({
                        type: 'Feature',
                        geometry: task.geometry || task.coords?.geometry || {
                          type: 'Point',
                          coordinates: [Number(task.coords.lng), Number(task.coords.lat)],
                        },
                      });
                    }
                  }}
                />
              ))}

              <button
                type="button"
                disabled={submitting}
                onClick={handleResubmit}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-60"
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
        <div className="w-[420px] shrink-0 border-l border-slate-200 relative bg-white">
          <MapContainer />
        </div>
      </div>
    </div>
  );
}

// ─── Step 2 + 3: Plot Inspection & Batch Finalization ─────────────────────────

function PlotInspection({ project, onBack }) {
  const { showToast, focusOnFeature, allFeatures, loadProjectIntoMap } = useGIS();
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

  React.useEffect(() => {
    if (project && projTasks.length > 0) {
      loadProjectIntoMap(project, projTasks);
    }
  }, [project, projTasks, loadProjectIntoMap]);

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

  const handleFinalSubmit = useCallback(async () => {
    setSubmitting(true);
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
        landCategory: fd.verifiedLandClass || t.verifiedLandClass || t.landCategory,
        status: 'Completed',
      };
    });
    await dataService.saveTasks(updated);

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
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Branch header */}
      <div className="h-14 px-5 flex items-center gap-3 border-b border-slate-200 bg-white shrink-0 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All Projects
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <FolderOpen className="w-4 h-4 text-blue-600" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{project.project_name}</div>
          <div className="text-[11px] font-mono text-blue-600">{project.project_id}</div>
        </div>
        <div className="text-xs text-slate-500 shrink-0">
          <span className="text-slate-900 font-bold">{completedCount}</span> / {projTasks.length} forms filled
        </div>
      </div>

      {/* Plot form list */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {submitted && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-center mb-4 shadow-sm">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-emerald-800">Project Closed & Submitted</p>
              <p className="text-xs text-slate-600 mt-0.5">All plot data has been saved. Municipal Officer can now review the reports.</p>
            </div>
          )}

          {projTasks.length === 0 && (
            <div className="py-20 text-center text-slate-500">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium">No plots found in this project.</p>
            </div>
          )}

          {projTasks.map((task) => (
            <PlotFormCard
              key={task.id}
              task={task}
              localData={formData[task.id] || {}}
              onChange={(field, value) => handleChange(task.id, field, value)}
              onFocus={() => {
                if (task.coords?.lat && task.coords?.lng) {
                  focusOnFeature({
                    type: 'Feature',
                    geometry: task.geometry || task.coords?.geometry || {
                      type: 'Point',
                      coordinates: [Number(task.coords.lng), Number(task.coords.lat)],
                    },
                  });
                }
              }}
            />
          ))}

          {/* Batch Submit */}
          {projTasks.length > 0 && !submitted && (
            <div className="mt-5 p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Batch Submit & Close Project</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {completedCount} of {projTasks.length} plot forms completed.
                    {completedCount < projTasks.length && (
                      <span className="text-amber-600 ml-1 font-medium">Incomplete forms will be saved as-is.</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900">
                    {Math.round((completedCount / Math.max(projTasks.length, 1)) * 100)}%
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Complete</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-100 mb-4 overflow-hidden border border-slate-200">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-blue-600"
                  style={{
                    width: `${Math.round((completedCount / Math.max(projTasks.length, 1)) * 100)}%`,
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all cursor-pointer disabled:opacity-60 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
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

        {/* Map */}
        <div className="w-[420px] shrink-0 border-l border-slate-200 relative bg-white">
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
