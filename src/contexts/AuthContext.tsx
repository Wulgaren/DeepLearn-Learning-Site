/* eslint-disable react-refresh/only-export-components -- context + provider + hook in one file */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

import type { User, Session } from '@supabase/supabase-js';

type AuthState = { user: User | null; session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        setState({ user: session.user, session, loading: false });
        return;
      }
      try {
        const res = await fetch('/api/session', { credentials: 'include' });
        if (res.ok) {
          const { access_token, refresh_token } = (await res.json()) as { access_token?: string; refresh_token?: string };
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            const { data: { session: newSession } } = await supabase.auth.getSession();
            if (!cancelled && newSession) {
              setState({ user: newSession.user, session: newSession, loading: false });
              return;
            }
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setState({ user: null, session: null, loading: false });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setState({ user: session?.user ?? null, session, loading: false });
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
