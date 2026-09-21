import React, { useState } from 'react';
import { useAuth, ROLES } from '../context/AuthContext';

// Tier 1 portal card data
const PORTAL_CARDS = [
  {
    id: 'govt',
    icon: '🏛️',
    title: 'Govt Level User',
    subtitle: 'Access planning, survey & administrative tools',
    gradient: 'from-emerald-600/30 via-teal-700/20 to-slate-900',
    borderHover: '#10b981',
    accentColor: '#34d399',
    badge: 'GOVERNMENT PORTAL',
    badgeColor: 'rgba(16,185,129,.2)',
    badgeText: '#34d399',
  },
  {
    id: 'beneficiary',
    icon: '🏡',
    title: 'Beneficiary / Land Owner',
    subtitle: 'Check acquisition status, payment timeline & file grievance',
    gradient: 'from-orange-600/30 via-amber-700/20 to-slate-900',
    borderHover: '#fb923c',
    accentColor: '#fdba74',
    badge: 'CITIZEN PORTAL',
    badgeColor: 'rgba(251,146,60,.2)',
    badgeText: '#fdba74',
  },
];

export default function PortalGateModal() {
  const { login, loginWithSupabase, signUpWithSupabase, isGateOpen } = useAuth();
  const [tier, setTier] = useState(1); // 1 = main, 2 = govt supabase auth, 3 = citizen
  const [animating, setAnimating] = useState(false);

  // Govt Supabase Auth state
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedGovtRole, setSelectedGovtRole] = useState(ROLES.MUNICIPAL_OFFICER);
  const [authLoading, setAuthLoading] = useState(false);

  // Citizen inputs
  const [phone, setPhone] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [loginErr, setLoginErr] = useState('');

  if (!isGateOpen) return null;

  const goToTier2 = () => {
    setAnimating(true);
    setLoginErr('');
    setTimeout(() => { setTier(2); setAnimating(false); }, 180);
  };

  const goToTier3 = () => {
    setAnimating(true);
    setLoginErr('');
    setTimeout(() => { setTier(3); setAnimating(false); }, 180);
  };

  const goBack = () => {
    setAnimating(true);
    setLoginErr('');
    setTimeout(() => { setTier(1); setAnimating(false); }, 180);
  };

  const handleSupabaseGovtAuth = async (e) => {
    e.preventDefault();
    setLoginErr('');
    setAuthLoading(true);
    try {
      if (isSignUp) {
        if (!email.trim() || !password.trim() || !fullName.trim()) {
          setLoginErr('Please fill in all registration fields.');
          setAuthLoading(false);
          return;
        }
        const desig = selectedGovtRole === ROLES.SURVEYOR ? 'Field Surveyor' : 'Municipal Planning Officer';
        await signUpWithSupabase(email.trim(), password.trim(), fullName.trim(), selectedGovtRole, desig);
      } else {
        if (!email.trim() || !password.trim()) {
          setLoginErr('Please enter both Email and Password.');
          setAuthLoading(false);
          return;
        }
        await loginWithSupabase(email.trim(), password.trim(), selectedGovtRole);
      }
    } catch (err) {
      setLoginErr(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleBeneficiaryAuth = (e) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    const cleanAadhaar = aadhaar.trim();

    if (!cleanPhone || !cleanAadhaar) {
      setLoginErr('Please enter both your Phone Number and Aadhaar Number.');
      return;
    }

    login(ROLES.BENEFICIARY, `ben-${cleanPhone}-${cleanAadhaar}`, {
      name: 'Verified Landowner',
      phone: cleanPhone,
      aadhaar: cleanAadhaar,
      designation: 'Land Owner (Beneficiary)',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(2,8,23,0.97) 0%, rgba(0,0,0,0.99) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Background decorative glow */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-[420px] h-[420px] rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-xl mx-4 flex flex-col items-center gap-6">

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-2xl p-[2px] shadow-2xl"
              style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}
            >
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-xl">
                🌏
              </div>
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-white tracking-tight">Bhoomi Setu</h1>
              <p className="text-xs text-slate-400 font-medium">West Bengal Land Acquisition Intelligence Platform · SIH 2026</p>
            </div>
          </div>
          <div
            className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
            style={{ background: 'rgba(16,185,129,.12)', color: '#34d399', border: '1px solid rgba(16,185,129,.25)' }}
          >
            Secure Portal Access
          </div>
        </div>

        {/* Card Panel */}
        <div
          className="w-full rounded-2xl border border-slate-800 overflow-hidden shadow-2xl"
          style={{
            background: 'rgba(15,23,42,0.92)',
            opacity: animating ? 0 : 1,
            transform: animating ? 'translateY(8px)' : 'translateY(0)',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}
        >
          {/* Tier 1 — Main Selector */}
          {tier === 1 && (
            <div className="p-6">
              <p className="text-center text-sm text-slate-400 mb-5 font-medium">
                Select your access role to continue
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PORTAL_CARDS.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => card.id === 'govt' ? goToTier2() : goToTier3()}
                    className="relative group text-left p-5 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden"
                    style={{
                      backgroundImage: `linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,1) 100%)`,
                      border: `1px solid rgba(100,116,139,0.25)`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.border = `1px solid ${card.borderHover}55`; e.currentTarget.style.boxShadow = `0 0 24px ${card.borderHover}22`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.border = '1px solid rgba(100,116,139,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    {/* badge */}
                    <div
                      className="inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest mb-3"
                      style={{ background: card.badgeColor, color: card.badgeText }}
                    >
                      {card.badge}
                    </div>
                    <div className="text-4xl mb-3">{card.icon}</div>
                    <h3 className="text-base font-bold text-white mb-1">{card.title}</h3>
                    <p className="text-xs text-slate-400 leading-snug">{card.subtitle}</p>
                    <div
                      className="mt-4 text-xs font-semibold flex items-center gap-1 transition-colors"
                      style={{ color: card.accentColor }}
                    >
                      {card.id === 'govt' ? 'Official Sign In →' : 'Enter Portal →'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tier 2 — Govt Supabase Cloud Auth */}
          {tier === 2 && (
            <div className="p-6">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4 cursor-pointer"
              >
                ← Back to Portal Selection
              </button>

              <div className="mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  <p className="text-sm font-semibold text-white">Government Official Access</p>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Authenticate with your registered Supabase Cloud officer account</p>
              </div>

              {loginErr && (
                <div className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-950/40 text-red-300 text-xs font-medium">
                  ⚠️ {loginErr}
                </div>
              )}

              <form onSubmit={handleSupabaseGovtAuth} className="space-y-3.5 max-w-md mx-auto">
                {isSignUp && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wide mb-1">
                      Full Officer Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Priya Chakraborty"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wide mb-1">
                    Official Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="officer@bhoomi.gov.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wide mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wide mb-1">
                    Designated Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedGovtRole(ROLES.MUNICIPAL_OFFICER)}
                      className="p-2.5 rounded-xl border text-left cursor-pointer transition-all"
                      style={{
                        background: selectedGovtRole === ROLES.MUNICIPAL_OFFICER ? 'rgba(16,185,129,.15)' : 'rgba(30,41,59,.4)',
                        borderColor: selectedGovtRole === ROLES.MUNICIPAL_OFFICER ? '#10b981' : 'rgba(100,116,139,.25)',
                      }}
                    >
                      <div className="text-sm">🗺️</div>
                      <div className="text-xs font-bold text-white mt-0.5">Municipal Officer</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGovtRole(ROLES.SURVEYOR)}
                      className="p-2.5 rounded-xl border text-left cursor-pointer transition-all"
                      style={{
                        background: selectedGovtRole === ROLES.SURVEYOR ? 'rgba(56,189,248,.15)' : 'rgba(30,41,59,.4)',
                        borderColor: selectedGovtRole === ROLES.SURVEYOR ? '#38bdf8' : 'rgba(100,116,139,.25)',
                      }}
                    >
                      <div className="text-sm">🔍</div>
                      <div className="text-xs font-bold text-white mt-0.5">Field Surveyor</div>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 mt-2 rounded-xl font-bold text-xs text-white transition-all cursor-pointer shadow-lg disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #0f766e)',
                    boxShadow: '0 0 20px rgba(2,132,199,0.3)',
                  }}
                >
                  {authLoading ? 'Authenticating…' : isSignUp ? 'Register Supabase Cloud Account →' : 'Sign In with Supabase →'}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setLoginErr(''); }}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                  >
                    {isSignUp ? 'Already have an account? Sign In' : 'Need a new officer account? Register'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tier 3 — Beneficiary / Landowner Phone + Aadhaar Login Form */}
          {tier === 3 && (
            <div className="p-6 max-w-md mx-auto">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4 cursor-pointer"
              >
                ← Back to Portal Selection
              </button>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🏡</span>
                <h3 className="text-base font-bold text-white">Landowner Access Portal</h3>
              </div>
              <p className="text-xs text-slate-400 mb-5">
                Enter the Mobile Number & Aadhaar Number recorded during official government land survey.
              </p>

              {loginErr && (
                <div className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-950/40 text-red-300 text-xs font-medium">
                  ⚠️ {loginErr}
                </div>
              )}

              <form onSubmit={handleBeneficiaryAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Registered Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Enter 10-digit Phone Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Aadhaar Identification Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter 12-digit Aadhaar Number"
                    value={aadhaar}
                    onChange={(e) => setAadhaar(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all cursor-pointer shadow-lg hover:scale-[1.01] active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #ea580c, #d97706)',
                    boxShadow: '0 0 20px rgba(234,88,12,0.3)',
                  }}
                >
                  Verify Credentials & Check Plot Notice Status →
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-[10px] text-slate-600 text-center">
          Smart India Hackathon 2026 · West Bengal Municipal Authority · Powered by Overpass OSM + Turf.js
        </p>
      </div>
    </div>
  );
}
