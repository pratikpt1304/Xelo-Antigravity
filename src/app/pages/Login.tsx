import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Banner, Elzeo, Loading } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { isAllowedDomain, parseAllowedDomains } from '../../lib/logic/credits';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { homeForRole } from '../../lib/types';

export function Login() {
  const { profile, restored, authError } = useSession();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  if (!restored) {
    return (
      <main className="xe-auth-shell">
        <Loading label="Checking session…" />
      </main>
    );
  }

  if (profile) {
    const state = location.state as { from?: { pathname?: string; search?: string } } | null;
    const fromPath = state?.from?.pathname;
    const target =
      fromPath && fromPath !== '/login'
        ? `${fromPath}${state?.from?.search ?? ''}`
        : homeForRole(profile.role);
    return <Navigate to={target} replace />;
  }

  const allowedDomains = parseAllowedDomains(import.meta.env.VITE_ALLOWED_DOMAINS);
  const redirectTo = `${window.location.origin}/app/login`;

  const validateEmail = (): string | null => {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setError('Please enter your institutional email address.');
      return null;
    }
    if (!isAllowedDomain(clean, allowedDomains)) {
      setError(errorMessage('wrong_domain'));
      return null;
    }
    return clean;
  };

  const handleOAuth = async (provider: 'google' | 'azure') => {
    setError(null);
    setSentMsg(null);
    const clean = validateEmail();
    if (!clean) return;
    setBusy(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: { login_hint: clean },
        },
      });
      if (oauthErr) setError(errorMessage(oauthErr.message));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSentMsg(null);
    const clean = validateEmail();
    if (!clean) return;
    setBusy(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: clean,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
      if (otpErr) {
        if (otpErr.message.toLowerCase().includes('signups not allowed')) {
          setError(errorMessage('not_onboarded'));
        } else {
          setError(errorMessage(otpErr.message));
        }
      } else {
        setSentMsg(`Sign-in link sent to ${clean}. Check your institutional inbox.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const activeError = error ?? (authError ? errorMessage(authError) : null);

  return (
    <div className="xe-login-wrap">
      <section className="xe-login-left xe-dark" aria-label="About XeIO">
        <div style={{ fontWeight: 600, fontSize: 44, letterSpacing: '-1px', lineHeight: 1 }}>
          Xe<span className="xe-wordmark-io">IO</span>
        </div>
        <h1 style={{ margin: '48px 0 0', fontSize: 36, fontWeight: 600, lineHeight: 1.15, maxWidth: 440 }}>
          The AI faculty assistant that plans, runs and reports every lab.
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: '#CFCDC5', maxWidth: 440 }}>
          One sign-in for faculty, students, HODs, deans, the CoE and the VC. Each role sees only
          its own scope.
        </p>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#A8A69E' }}>
            Designed and maintained by
          </div>
          <Elzeo dark />
          <div style={{ fontSize: 12, color: '#A8A69E' }}>
            Elzeo Future Technologies Pvt Ltd, India
          </div>
        </div>
      </section>

      <main className="xe-login-right">
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Sign in</h2>
          <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
            Use your institutional account. Only emails created by the super admin, or invited by
            your faculty with a class code, can sign in.
          </p>
        </div>

        <form onSubmit={handleEmailLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="xe-field" htmlFor="login-email">
            <span>Institutional email</span>
            <input
              id="login-email"
              type="email"
              className="xe-input"
              style={{ height: 46, fontSize: 15 }}
              placeholder="name@sanjivani.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <button
            type="button"
            className="xe-btn xe-btn--primary"
            style={{ height: 44 }}
            disabled={busy}
            onClick={() => void handleOAuth('google')}
          >
            Continue with Google
          </button>

          <button
            type="button"
            className="xe-btn"
            style={{ height: 44 }}
            disabled={busy}
            onClick={() => void handleOAuth('azure')}
          >
            Continue with Microsoft
          </button>

          <button type="submit" className="xe-btn" style={{ height: 44 }} disabled={busy}>
            Email me a sign-in link
          </button>
        </form>

        {sentMsg ? <Banner tone="ok">{sentMsg}</Banner> : null}
        {activeError ? <Banner tone="err">{activeError}</Banner> : null}
      </main>
    </div>
  );
}
