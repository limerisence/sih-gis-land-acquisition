import React from 'react';
import {
  Compass, Server, Wifi, WifiOff,
  CheckCircle2, XCircle, Info, UserCog, LogOut
} from 'lucide-react';
import { GISProvider, useGIS } from './context/GISContext';
import { AuthProvider, useAuth, ROLE_META, ROLES } from './context/AuthContext';
import PortalGateModal from './components/PortalGateModal';
import FeatureDetailModal from './components/FeatureDetailModal';
import MunicipalOfficerLayout from './layouts/MunicipalOfficerLayout';
import SurveyorLayout from './layouts/SurveyorLayout';
import FinanceOfficerLayout from './layouts/FinanceOfficerLayout';
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
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
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
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer"
      >
        <UserCog className="w-4 h-4" />
      </button>

      {/* Logout */}
      <button
        type="button"
        onClick={logout}
        title="Logout"
        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
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
    notification
  } = useGIS();

  const { userRole, isGateOpen } = useAuth();

  // Decide which layout to render
  const renderLayout = () => {
    if (!userRole || isGateOpen) return null; // gate covers everything
    if (userRole === ROLES.MUNICIPAL_OFFICER) return <MunicipalOfficerLayout />;
    if (userRole === ROLES.SURVEYOR)          return <SurveyorLayout />;
    if (userRole === ROLES.FINANCE_OFFICER)   return <FinanceOfficerLayout />;
    if (userRole === ROLES.BENEFICIARY)       return <BeneficiaryLayout />;
    return null;
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-slate-50 text-slate-800 flex flex-col font-sans"
    >
      {/* ── Clean White Top Navigation Header ── */}
      <header className="h-15 px-6 shrink-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shadow-xs">
            <Compass className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight">Bhoomi Setu</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Layer legend chips — only relevant for GIS-facing roles */}
          {(userRole === ROLES.MUNICIPAL_OFFICER || userRole === ROLES.SURVEYOR) && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium">
              <span className="px-2 py-0.5 rounded-md flex items-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-200/60">
                <span className="w-2 h-2 rounded-xs inline-block bg-rose-600" /> Affected Plot
              </span>
              <span className="px-2 py-0.5 rounded-md flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200/60">
                <span className="w-2 h-2 rounded-xs inline-block bg-amber-500" /> Affected Building
              </span>
              <span className="px-2 py-0.5 rounded-md flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200/60">
                <span className="w-2 h-2 rounded-xs inline-block bg-blue-600" /> Buffer
              </span>
            </div>
          )}

          {/* Backend status chip */}
          {userRole && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-600 border border-slate-200">
              <Server className={`w-3.5 h-3.5 ${backendOnline ? 'text-emerald-600' : 'text-amber-500'}`} />
              <span className="font-medium text-slate-700">API</span>
              {dataSource && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                    dataSource === 'overpass' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {dataSource === 'overpass' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {dataSource === 'overpass' ? 'Live OSM' : 'Fallback'}
                </span>
              )}
            </div>
          )}

          {/* Role badge + Switch Persona + Logout */}
          <RoleBadge />
        </div>
      </header>

      {/* ── Main Workspace — role-gated layout ── */}
      <div className="flex-1 relative overflow-hidden flex flex-col bg-slate-50">
        {renderLayout()}

        {/* Toast Notification */}
        {notification && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md max-w-sm ${
              notification.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            {notification.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>{notification.message}</span>
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
