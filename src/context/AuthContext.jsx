import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  const loadProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error || !data) {
      setProfile(null);
      setProfileError('Tu usuario no tiene un perfil asignado. Pedile al administrador que lo active.');
    } else if (!data.active) {
      setProfile(null);
      setProfileError('Tu usuario está desactivado. Consultá con el administrador.');
      await supabase.auth.signOut();
    } else {
      setProfile(data);
      setProfileError(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // diferido para no bloquear el callback de auth
        setTimeout(() => loadProfile(s?.user), 0);
      }
      if (event === 'SIGNED_OUT') setProfile(null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = async (email, password) => {
    setProfileError(null);
    const login = email.trim().toLowerCase();
    const authEmail = login === 'administracion' ? 'administracion@iic.local' : login;
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    if (error) {
      const msg = /invalid/i.test(error.message) ? 'Usuario o contraseña incorrectos.'
        : /banned|disabled/i.test(error.message) ? 'Tu usuario está desactivado.'
        : error.message;
      throw new Error(msg);
    }
    await loadProfile(data.user);
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const value = { session, user: session?.user ?? null, profile, loading, profileError, signIn, signOut, isAdmin: profile?.role === 'admin' };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
