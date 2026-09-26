import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';

// Role constants
export const ROLES = {
  MUNICIPAL_OFFICER: 'MUNICIPAL_OFFICER',
  SURVEYOR: 'SURVEYOR',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  BENEFICIARY: 'BENEFICIARY',
};

export const ROLE_META = {
  MUNICIPAL_OFFICER: {
    label: 'Municipal Officer',
    sublabel: 'Planner & Admin',
    icon: '🗺️',
    color: '#047857',   // emerald-700
    bg: '#ecfdf5',      // emerald-50
    border: '#a7f3d0',  // emerald-200
  },
  SURVEYOR: {
    label: 'Field Surveyor',
    sublabel: 'Ground Inspector',
    icon: '🔍',
    color: '#0369a1',   // sky-700
    bg: '#f0f9ff',      // sky-50
    border: '#bae6fd',  // sky-200
  },
  FINANCE_OFFICER: {
    label: 'Finance Officer',
    sublabel: 'Treasury & Disbursements',
    icon: '💰',
    color: '#b45309',   // amber-700
    bg: '#fffbeb',      // amber-50
    border: '#fde68a',  // amber-200
  },
  BENEFICIARY: {
    label: 'Land Owner',
    sublabel: 'Beneficiary Portal',
    icon: '🏡',
    color: '#4338ca',   // indigo-700
    bg: '#eef2ff',      // indigo-50
    border: '#c7d2fe',  // indigo-200
  },
};

// Demo presets (for quick-login)
export const DEMO_PRESETS = [
  {
    role: ROLES.MUNICIPAL_OFFICER,
    name: 'Priya Chakraborty',
    designation: 'Municipal Planning Officer, KMC',
    token: 'demo-officer-abc123',
    email: 'officer@bhoomi.gov.in',
  },
  {
    role: ROLES.SURVEYOR,
    name: 'Rajesh Mondal',
    designation: 'Senior Field Surveyor, BNDA',
    token: 'demo-surveyor-def456',
    email: 'surveyor@bhoomi.gov.in',
  },
  {
    role: ROLES.FINANCE_OFFICER,
    name: 'Amitava Roy',
    designation: 'Chief Accounts & Treasury Officer',
    token: 'demo-finance-xyz789',
    email: 'finance@bhoomi.gov.in',
  },
  {
    role: ROLES.BENEFICIARY,
    name: 'Tapan Biswas',
    designation: 'Registered Land Owner, Bidhannagar',
    token: 'demo-beneficiary-ghi789',
    email: 'tapan.biswas@citizen.gov.in',
  },
];

const LS_ROLE_KEY = 'bhoomi_role';
const LS_TOKEN_KEY = 'bhoomi_token';
const LS_USER_KEY  = 'bhoomi_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Restore from localStorage on first load
  const [userRole, setUserRole] = useState(() => {
    try { return localStorage.getItem(LS_ROLE_KEY) || null; } catch { return null; }
  });
  const [authToken, setAuthToken] = useState(() => {
    try { return localStorage.getItem(LS_TOKEN_KEY) || null; } catch { return null; }
  });
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  // isGateOpen: true when no role is selected OR when "Switch Persona" is triggered
  const [isGateOpen, setIsGateOpen] = useState(() => {
    try { return !localStorage.getItem(LS_ROLE_KEY); } catch { return true; }
  });

  // Check live Supabase Auth session on mount
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const metadata = session.user.user_metadata || {};
        const role = metadata.role || localStorage.getItem(LS_ROLE_KEY) || ROLES.MUNICIPAL_OFFICER;
        setUserRole(role);
        setAuthToken(session.access_token);
        setUserProfile({
          id: session.user.id,
          email: session.user.email,
          name: metadata.name || session.user.email?.split('@')[0] || 'Officer',
          designation: metadata.designation || (role === ROLES.SURVEYOR ? 'Field Surveyor' : 'Municipal Officer'),
        });
        setIsGateOpen(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const metadata = session.user.user_metadata || {};
        const role = metadata.role || localStorage.getItem(LS_ROLE_KEY) || ROLES.MUNICIPAL_OFFICER;
        setUserRole(role);
        setAuthToken(session.access_token);
        setUserProfile({
          id: session.user.id,
          email: session.user.email,
          name: metadata.name || session.user.email?.split('@')[0] || 'Officer',
          designation: metadata.designation || (role === ROLES.SURVEYOR ? 'Field Surveyor' : role === ROLES.FINANCE_OFFICER ? 'Finance & Accounts Officer' : 'Municipal Officer'),
        });
        setIsGateOpen(false);
      } else if (event === 'SIGNED_OUT') {
        setUserRole(null);
        setAuthToken(null);
        setUserProfile(null);
        setIsGateOpen(true);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const login = useCallback((role, token = 'demo-token', profile = null) => {
    setUserRole(role);
    setAuthToken(token);
    setUserProfile(profile);
    setIsGateOpen(false);
    try {
      localStorage.setItem(LS_ROLE_KEY, role);
      localStorage.setItem(LS_TOKEN_KEY, token);
      if (profile) localStorage.setItem(LS_USER_KEY, JSON.stringify(profile));
    } catch { /* storage blocked */ }
  }, []);

  // Supabase Email + Password Login
  const loginWithSupabase = useCallback(async (email, password, desiredRole = ROLES.MUNICIPAL_OFFICER) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = data.user;
      const metadata = user.user_metadata || {};
      const role = metadata.role || desiredRole;
      const profile = {
        id: user.id,
        email: user.email,
        name: metadata.name || email.split('@')[0],
        designation: metadata.designation || (role === ROLES.SURVEYOR ? 'Field Surveyor' : role === ROLES.FINANCE_OFFICER ? 'Finance & Accounts Officer' : 'Municipal Officer'),
      };
      login(role, data.session?.access_token || 'supabase-token', profile);
      return profile;
    } else {
      // Fallback
      login(desiredRole, 'demo-token', { name: email.split('@')[0], email, designation: 'Officer' });
    }
  }, [login]);

  // Supabase Email + Password Sign Up
  const signUpWithSupabase = useCallback(async (email, password, name, role, designation) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role, designation }
        }
      });
      if (error) throw error;
      const user = data.user;
      if (user) {
        const profile = {
          id: user.id,
          email: user.email,
          name,
          designation,
        };
        login(role, data.session?.access_token || 'supabase-token', profile);
        return profile;
      }
    } else {
      login(role, 'demo-token', { name, email, designation });
    }
  }, [login]);

  const logout = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try { await supabase.auth.signOut(); } catch {}
    }
    setUserRole(null);
    setAuthToken(null);
    setUserProfile(null);
    setIsGateOpen(true);
    try {
      localStorage.removeItem(LS_ROLE_KEY);
      localStorage.removeItem(LS_TOKEN_KEY);
      localStorage.removeItem(LS_USER_KEY);
    } catch { /* storage blocked */ }
  }, []);

  const switchPersona = useCallback(() => {
    setIsGateOpen(true);
  }, []);

  const isGovt = userRole === ROLES.MUNICIPAL_OFFICER || userRole === ROLES.SURVEYOR;

  const value = {
    userRole,
    authToken,
    userProfile,
    isGateOpen,
    isGovt,
    isSupabaseConfigured,
    login,
    loginWithSupabase,
    signUpWithSupabase,
    logout,
    switchPersona,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
