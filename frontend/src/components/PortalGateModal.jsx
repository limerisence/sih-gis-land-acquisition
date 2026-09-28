import React, { useState } from 'react';
import { useAuth, ROLES } from '../context/AuthContext';
import { ShieldCheck, UserCheck, ArrowRight, ArrowLeft, Building2, MapPin, Landmark, AlertCircle } from 'lucide-react';

// Tier 1 portal card data
const PORTAL_CARDS = [
  {
    id: 'govt',
    icon: '🏛️',
    title: 'Government Official',
    subtitle: 'Access planning, ground survey verification & statutory treasury tools',
    badge: 'OFFICIAL PORTAL',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    btnText: 'Official Sign In →',
  },
  {
    id: 'beneficiary',
    icon: '🏡',
    title: 'Beneficiary / Landowner',
    subtitle: 'Check plot status, compensation notice & live direct benefit transfer timeline',
    badge: 'CITIZEN PORTAL',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/60',
    btnText: 'Enter Citizen Portal →',
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
    setTimeout(() => { setTier(2); setAnimating(false); }, 150);
  };

  const goToTier3 = () => {
    setAnimating(true);
    setLoginErr('');
    setTimeout(() => { setTier(3); setAnimating(false); }, 150);
  };

  const goBack = () => {
    setAnimating(true);
    setLoginErr('');
    setTimeout(() => { setTier(1); setAnimating(false); }, 150);
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
        const desig = selectedGovtRole === ROLES.SURVEYOR
          ? 'Field Surveyor'
          : selectedGovtRole === ROLES.FINANCE_OFFICER
          ? 'Finance & Accounts Officer'
          : 'Municipal Planning Officer';
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

    let ownerName = 'Verified Landowner';
    try {
      const tasks = JSON.parse(localStorage.getItem('bhoomi_survey_tasks') || '[]');
      const pD = cleanPhone.replace(/\D/g, '');
      const aD = cleanAadhaar.replace(/\D/g, '');
      const found = tasks.find((t) => {
        const spD = (t.surveyorPhone || t.surveyorOwnerContact || '').replace(/\D/g, '');
        const saD = (t.surveyorAadhaar || '').replace(/\D/g, '');
        return (pD && spD && (pD.slice(-10) === spD.slice(-10) || spD.includes(pD))) ||
               (aD && saD && (saD === aD || saD.includes(aD) || aD.includes(saD)));
      });
      if (found?.surveyorOwnerName) {
        ownerName = found.surveyorOwnerName;
      }
    } catch {}

    login(ROLES.BENEFICIARY, `ben-${cleanPhone}-${cleanAadhaar}`, {
      name: ownerName,
      phone: cleanPhone,
      aadhaar: cleanAadhaar,
      designation: 'Land Owner (Beneficiary)',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl flex flex-col items-center gap-6">

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-sm">
              🏛️
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bhoomi Setu</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 mt-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secure Unified Portal Access
          </div>
        </div>

        {/* Card Panel */}
        <div
          className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-lg"
          style={{
            opacity: animating ? 0 : 1,
            transform: animating ? 'translateY(6px)' : 'translateY(0)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
          }}
        >
          {/* Tier 1 — Main Selector */}
          {tier === 1 && (
            <div className="p-6 sm:p-8">
              <p className="text-center text-sm text-slate-500 mb-6 font-medium">
                Select your designated access role to proceed
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PORTAL_CARDS.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => card.id === 'govt' ? goToTier2() : goToTier3()}
                    className="text-left p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-500 hover:shadow-md transition-all duration-150 cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border mb-3 ${card.badgeClass}`}>
                        {card.badge}
                      </div>
                      <div className="text-3xl mb-2">{card.icon}</div>
                      <h3 className="text-base font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed mb-4">
                        {card.subtitle}
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-blue-600 flex items-center gap-1 pt-2 border-t border-slate-100">
                      <span>{card.btnText}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tier 2 — Govt Cloud Auth */}
          {tier === 2 && (
            <div className="p-6 sm:p-8">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors mb-5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Portal Selection
              </button>

              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  <h3 className="text-base font-bold text-slate-900">Government Official Sign In</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">Authenticate using your registered department officer credentials</p>
              </div>

              {loginErr && (
                <div className="mb-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{loginErr}</span>
                </div>
              )}

              <form onSubmit={handleSupabaseGovtAuth} className="space-y-4 max-w-md mx-auto">
                {isSignUp && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Official Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Priya Chakraborty"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="officer@bhoomi.gov.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Designated Government Role
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedGovtRole(ROLES.MUNICIPAL_OFFICER)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        selectedGovtRole === ROLES.MUNICIPAL_OFFICER
                          ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-lg mb-1">🗺️</div>
                      <div className="text-xs font-bold leading-tight">Municipal Officer</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGovtRole(ROLES.SURVEYOR)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        selectedGovtRole === ROLES.SURVEYOR
                          ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-lg mb-1">🔍</div>
                      <div className="text-xs font-bold leading-tight">Field Surveyor</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGovtRole(ROLES.FINANCE_OFFICER)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        selectedGovtRole === ROLES.FINANCE_OFFICER
                          ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-lg mb-1">💰</div>
                      <div className="text-xs font-bold leading-tight">Finance Officer</div>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 mt-2 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {authLoading ? 'Authenticating…' : isSignUp ? 'Register Officer Account →' : 'Sign In as Official →'}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setLoginErr(''); }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                  >
                    {isSignUp ? 'Already have an official account? Sign In' : 'Need a new officer account? Register'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tier 3 — Beneficiary / Landowner Login Form */}
          {tier === 3 && (
            <div className="p-6 sm:p-8 max-w-md mx-auto">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors mb-5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Portal Selection
              </button>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🏡</span>
                <h3 className="text-base font-bold text-slate-900">Landowner Access Portal</h3>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Enter your Mobile Number & Aadhaar Number recorded during the official survey.
              </p>

              {loginErr && (
                <div className="mb-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{loginErr}</span>
                </div>
              )}

              <form onSubmit={handleBeneficiaryAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Enter 10-digit Phone Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Aadhaar Identification Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter 12-digit Aadhaar Number"
                    value={aadhaar}
                    onChange={(e) => setAadhaar(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 mt-2 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  Verify Credentials & Check Compensation Status →
                </button>
              </form>

              {/* Quick-test verified profiles */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Verified Landowner Profiles
                  </span>
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                    Quick Fill
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPhone('9831098765');
                      setAadhaar('7123 4567 8901');
                      setLoginErr('');
                    }}
                    className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/70 hover:bg-blue-50/30 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-800 group-hover:text-blue-700">
                        Subhash Chandra Mukhopadhyay
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        📱 9831098765 · 🆔 7123 4567 8901
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                      Fill →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPhone('9830123456');
                      setAadhaar('5482 9103 4721');
                      setLoginErr('');
                    }}
                    className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/70 hover:bg-blue-50/30 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-800 group-hover:text-blue-700">
                        Ramesh Chandra Bannerjee
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        📱 9830123456 · 🆔 5482 9103 4721
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                      Fill →
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-400 text-center">
          Smart India Hackathon 2026 · West Bengal Municipal Authority
        </p>
      </div>
    </div>
  );
}
