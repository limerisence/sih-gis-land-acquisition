import React from 'react';
import {
  Compass, Server, Sparkles, Wifi, WifiOff,
  CheckCircle2, XCircle, Info, UserCog, LogOut
} from 'lucide-react';
import { GISProvider, useGIS } from './context/GISContext';
import { AuthProvider, useAuth, ROLE_META, ROLES } from './context/AuthContext';
import PortalGateModal from './components/PortalGateModal';
import FeatureDetailModal from './components/FeatureDetailModal';
import MunicipalOfficerLayout from './layouts/MunicipalOfficerLayout';
import SurveyorLayout from './layouts/SurveyorLayout';
import BeneficiaryLayout from './layouts/BeneficiaryLayout';

// Role badge shown in the navbar
function RoleBadge() {
  const { userRole, userProfile, switchPersona, logout } = useAuth();
  if (!userRole) return null;
  const meta = ROLE_META[userRole];
  if (!meta) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Role pill */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
      >
        <span>{meta.icon}</span>
        <span>{userProfile?.name || meta.label}</span>
      </div>

      {/* Switch Persona */}
      <button
        type="button"
        onClick={switchPersona}
        title="Switch Role"
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
      >
        <UserCog className="w-4 h-4" />
      </button>

      {/* Logout */}
      <button
        type="button"
        onClick={logout}
        title="Logout"
        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-all cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}

function AppContent() {
  const {
    backendOnline,
    dataSource,
    loadSampleRoute,
    isLoading,
    notification
  } = useGIS();

  const { userRole, isGateOpen } = useAuth();

  // Decide which layout to render
  const renderLayout = () => {
    if (!userRole || isGateOpen) return null; // gate covers everything
    if (userRole === ROLES.MUNICIPAL_OFFICER) return <MunicipalOfficerLayout />;
    if (userRole === ROLES.SURVEYOR)          return <SurveyorLayout />;
    if (userRole === ROLES.BENEFICIARY)       return <BeneficiaryLayout />;
    return null;
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col"
      style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}
    >
      {/* ── App Header ── */}
      <header className="h-14 px-5 shrink-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 backdrop-blur-md shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-500 p-[2px] shadow-lg">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Compass className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white">BhoomiAcquire GIS</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                SIH 2024
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              West Bengal Multi-Point Land Acquisition Engine · Overpass API
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Layer legend chips — only relevant for GIS-facing roles */}
          {(userRole === ROLES.MUNICIPAL_OFFICER || userRole === ROLES.SURVEYOR) && (
            <div className="hidden md:flex items-center gap-1.5 text-[10px] font-semibold">
              <span
                className="px-2 py-1 rounded-md flex items-center gap-1"
                style={{ background: 'rgba(255,65,54,.18)', color: '#FF4136', border: '1px solid rgba(255,65,54,.4)' }}
              >
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#FF4136' }} /> Affected Plot
              </span>
              <span
                className="px-2 py-1 rounded-md flex items-center gap-1"
                style={{ background: 'rgba(255,215,0,.14)', color: '#FFD700', border: '1px solid rgba(255,215,0,.35)' }}
              >
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#FFD700' }} /> Affected Building
              </span>
              <span
                className="px-2 py-1 rounded-md flex items-center gap-1"
                style={{ background: 'rgba(59,130,246,.18)', color: '#60a5fa', border: '1px solid rgba(59,130,246,.4)' }}
              >
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#3b82f6' }} /> Buffer
              </span>
            </div>
          )}

          {/* Backend status chip */}
          {userRole && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700">
              <Server className={`w-3.5 h-3.5 ${backendOnline ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="text-slate-300">API</span>
              {dataSource && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                    dataSource === 'overpass' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {dataSource === 'overpass' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {dataSource === 'overpass' ? 'Live OSM' : 'Fallback'}
                </span>
              )}
            </div>
          )}

          {/* Sample alignment button — only for Municipal Officer */}
          {userRole === ROLES.MUNICIPAL_OFFICER && (
            <button
              type="button"
              onClick={loadSampleRoute}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              style={{
                background: 'rgba(16,185,129,.15)',
                color: '#34d399',
                border: '1px solid rgba(16,185,129,.35)'
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Sample Route
            </button>
          )}

          {/* Role badge + Switch Persona + Logout */}
          <RoleBadge />
        </div>
      </header>

      {/* ── Main Workspace — role-gated layout ── */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {renderLayout()}

        {/* Toast Notification */}
        {notification && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-xl shadow-2xl border flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md max-w-sm"
            style={{
              background:
                notification.type === 'error'
                  ? 'rgba(136,19,55,.92)'
                  : notification.type === 'success'
                  ? 'rgba(5,46,22,.92)'
                  : 'rgba(15,23,42,.92)',
              borderColor:
                notification.type === 'error'
                  ? 'rgba(244,63,94,.4)'
                  : notification.type === 'success'
                  ? 'rgba(16,185,129,.4)'
                  : 'rgba(100,116,139,.4)',
              color:
                notification.type === 'error'
                  ? '#fda4af'
                  : notification.type === 'success'
                  ? '#6ee7b7'
                  : '#cbd5e1'
            }}
          >
            {notification.type === 'error' ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <Info className="w-4 h-4 shrink-0" />
            )}
            {notification.message}
          </div>
        )}
      </div>

      {/* ── Portal Gate Modal (overlays everything, z-50) ── */}
      <PortalGateModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GISProvider>
        <AppContent />
      </GISProvider>
    </AuthProvider>
  );
}
