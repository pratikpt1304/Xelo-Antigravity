import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Institution, Profile } from './types';

interface SessionState {
  session: Session | null;
  profile: Profile | null;
  institution: Institution | null;
  restored: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [restored, setRestored] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadForSession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession?.user) {
      setProfile(null);
      setInstitution(null);
      return;
    }

    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select(
        'id, institution_id, email, full_name, role, school_id, department_id, roll_no, active, calendar_token',
      )
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (profErr || !prof) {
      setAuthError('not_onboarded');
      setProfile(null);
      setInstitution(null);
      await supabase.auth.signOut();
      return;
    }

    const typedProf = prof as Profile;
    if (!typedProf.active) {
      setAuthError('account_deactivated');
      setProfile(null);
      setInstitution(null);
      await supabase.auth.signOut();
      return;
    }

    setAuthError(null);
    setProfile(typedProf);

    if (typedProf.institution_id) {
      const { data: inst } = await supabase
        .from('institutions')
        .select(
          'id, name, email_domain, plan, plan_start, plan_end, min_attendance_pct, attainment_threshold',
        )
        .eq('id', typedProf.institution_id)
        .maybeSingle();
      setInstitution((inst as Institution | null) ?? null);
    } else {
      setInstitution(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      await loadForSession(data.session ?? null);
      if (mounted) setRestored(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadForSession(nextSession ?? null).then(() => {
        if (mounted) setRestored(true);
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadForSession]);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setInstitution(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadForSession(data.session ?? null);
  }, [loadForSession]);

  return (
    <SessionContext.Provider
      value={{ session, profile, institution, restored, authError, signOut, refresh }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return ctx;
}
