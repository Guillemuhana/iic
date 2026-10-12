import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Cierre de sesión automático tras 30 min sin uso (celulares compartidos, PC del consultorio).
const IDLE_MS = 30 * 60 * 1000;
const ACTIVITY_KEY = 'iic-tickets-last-activity';

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

  useEffect(() => {
    if (!session || import.meta.env.VITE_DEMO === '1') return;
    const read = () => { try { return Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now(); } catch { return Date.now(); } };
    let last = read();
    let lastWrite = 0;
    const touch = () => {
      last = Date.now();
      // Compartido entre pestañas; se escribe como mucho cada 15 s.
      if (last - lastWrite > 15000) { lastWrite = last; try { localStorage.setItem(ACTIVITY_KEY, String(last)); } catch { /* sin storage */ } }
    };
    const check = () => {
      if (Date.now() - Math.max(last, read()) < IDLE_MS) return;
      setProfileError('La sesión se cerró por inactividad. Volvé a ingresar.');
      supabase.auth.signOut().then(() => setProfile(null));
    };
    if (Date.now() - last >= IDLE_MS) check(); else touch();
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 60 * 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [session]);

  const signIn = async (email, password) => {
    setProfileError(null);
    const login = email.trim().toLowerCase();
    const authEmail = login === 'administracion' ? 'administracion@iic.local' : login;
    // Antes del login: el evento SIGNED_IN no debe ver la actividad de una sesión vieja.
    try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch { /* sin storage */ }
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
