import { useEffect, useState } from 'react';
import { instituteClock } from '../../../shared/institute-clock.js';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Receipt, Send, Settings, LogOut, CalendarDays, Menu, X } from 'lucide-react';
import { Logo, cx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const NAV_GROUPS = [
  { label: 'Resumen', items: [{ to: '/panel', end: true, label: 'Estadísticas', icon: BarChart3 }] },
  { label: 'Gestión', items: [
    { to: '/panel/comprobantes', label: 'Recibos', icon: Receipt },
    { to: '/panel/envios', label: 'Envíos a contadora', icon: Send },
    { to: '/panel/turnos', label: 'Turnos', icon: CalendarDays },
  ] },
  { label: 'Administración', items: [
    { to: '/panel/configuracion', label: 'Configuración', icon: Settings },
  ] },
];


export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const expanded = menuOpen || hovered || focused;
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const clock = instituteClock(now);
  return (
    <div className="admin-shell admin-rail-shell min-h-full">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-mist bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <button onClick={() => setMenuOpen(value => !value)} className="admin-touch-menu grid size-11 shrink-0 place-items-center rounded-xl bg-fog text-petrol hover:bg-mist" aria-label={menuOpen ? 'Contraer menú' : 'Expandir menú'} aria-expanded={expanded} aria-controls="admin-rail"><Menu className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-petrol">Panel de administración</p>
          <p className="truncate text-xs text-slate">{NAV_GROUPS.flatMap(g => g.items).find(i => i.to === location.pathname)?.label || 'Instituto de Investigaciones Clínicas'}</p>
        </div>
        <p className="hidden text-sm text-slate sm:block">{profile?.full_name || profile?.email}</p>
      </header>
      {menuOpen && <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" aria-label="Contraer menú" onClick={() => setMenuOpen(false)} />}
        <aside id="admin-rail" aria-label="Menú de administración" data-expanded={expanded}
          onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}
          onFocusCapture={e => { if (e.target.matches(':focus-visible')) setFocused(true); }} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
          onKeyDown={e => { if (e.key === 'Escape') { setMenuOpen(false); setHovered(false); setFocused(false); e.target.blur(); } }}
          className="admin-sidebar admin-rail petrol-hero flex flex-col text-white">
          <div className="admin-brand rail-brand relative mb-5 shrink-0 bg-white">
            <Logo className="rail-mark !w-10" />
            <Logo full className="rail-full-logo admin-sidebar-logo !w-full" />
            <button onClick={() => { setMenuOpen(false); setHovered(false); setFocused(false); }} className="rail-close grid size-8 place-items-center rounded-lg bg-fog text-petrol" aria-label="Contraer menú"><X className="size-4" /></button>
          </div>
          <nav aria-label="Menú principal" className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pb-4">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <p className="rail-group mb-2 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-white/45">{group.label}</p>
                <div className="space-y-1">{group.items.map(({ to, end, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end={end} title={label} aria-label={label} onClick={() => setMenuOpen(false)} className={({ isActive }) => cx('admin-nav-link rail-link flex items-center gap-3 rounded-xl px-3 py-3 text-[14.5px] font-medium transition-colors', isActive ? 'bg-white text-petrol' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
                    <Icon className="size-[18px] shrink-0" /> <span className="rail-label">{label}</span>
                  </NavLink>
                ))}</div>
              </div>
            ))}
          </nav>
          <div className="rail-footer space-y-3 p-4">
            <div className="rail-user flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold">{(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}</div>
              <div className="rail-label min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-semibold">{profile?.full_name || profile?.email}</p><p className="text-xs text-white/55">Administrador</p></div>
              <button onClick={signOut} className="rail-label rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Cerrar sesión"><LogOut className="size-4" /></button>
            </div>
            <time dateTime={now.toISOString()} className="rail-label block px-1 text-xs text-white/60"><span className="block capitalize">{clock.date}</span><span className="mt-1 block font-semibold tabular-nums text-white/85">{clock.time} h · Argentina</span></time>
          </div>
        </aside>
      <main className="admin-main min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9"><Outlet context={{ clock }} /></main>
    </div>
  );
}

export function PageHead({ title, text, actions }) {
  return (
    <div className="admin-page-head mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-petrol [text-wrap:balance] sm:text-[30px]">{title}</h1>
        {text && <p className="mt-1 max-w-2xl text-[15px] text-slate">{text}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
