import { useEffect, useState } from 'react';
import { instituteClock } from '../../../shared/institute-clock.js';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { BarChart3, Receipt, Send, Users, Settings, Camera, LogOut, CalendarDays } from 'lucide-react';
import { Logo, InstituteMark, cx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { to: '/panel', end: true, label: 'Estadísticas', icon: BarChart3 },
  { to: '/panel/turnos', label: 'Turnos', icon: CalendarDays },
  { to: '/panel/comprobantes', label: 'Recibos', icon: Receipt },
  { to: '/panel/envios', label: 'Envíos a contadora', icon: Send },
  { to: '/panel/usuarios', label: 'Usuarios', icon: Users },
  { to: '/panel/configuracion', label: 'Configuración', icon: Settings },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const clock = instituteClock(now);
  return (
    <div className="admin-shell min-h-full lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="admin-sidebar petrol-hero hidden text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-5 pb-7 pt-7"><Logo light full className="admin-sidebar-logo !w-full" /></div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx('admin-nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[14.5px] font-medium transition-colors',
                isActive ? 'bg-white text-petrol' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
              <Icon className="size-[18px]" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 p-4">
          <Link to="/caja/escanear" className="admin-scan-button flex items-center justify-center gap-2 rounded-xl bg-saline px-3 py-2.5 text-sm font-bold text-white hover:bg-saline-dark">
            <Camera className="size-4" /> Escanear recibo
          </Link>
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <div className="grid size-9 place-items-center rounded-full bg-white/15 text-sm font-bold">
              {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
              <p className="truncate text-[12px] text-white/55">Administrador</p>
            </div>
            <button onClick={signOut} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar sesión"><LogOut className="size-4" /></button>
          </div>
        </div>
      </aside>

      {/* Navegación móvil */}
      <header className="petrol-hero safe-top sticky top-0 z-30 text-white lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pb-3">
          <InstituteMark light small section="Panel de administración" />
          <div className="flex gap-1">
            <Link to="/caja" className="grid size-10 place-items-center rounded-xl bg-white/10" aria-label="Escanear"><Camera className="size-5" /></Link>
            <button onClick={signOut} className="grid size-10 place-items-center rounded-xl bg-white/10" aria-label="Cerrar sesión"><LogOut className="size-5" /></button>
          </div>
        </div>
        <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-3">
          {NAV.map(({ to, end, label }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx('shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold', isActive ? 'bg-white text-petrol' : 'text-white/75')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <time dateTime={now.toISOString()} className="block px-4 pb-3 text-xs capitalize text-white/75">{clock.date} · {clock.time} h (Argentina)</time>
      </header>

      <div className="min-w-0">
        <div className="admin-topbar hidden items-center justify-between border-b border-mist bg-white/80 px-10 py-3.5 backdrop-blur lg:flex">
          <p className="text-sm font-semibold text-petrol">Panel de administración <span className="font-normal text-slate">· Reintegros de viáticos</span></p>
          <time dateTime={now.toISOString()} className="admin-date flex items-center gap-3 text-[13px] text-slate"><span className="capitalize">{clock.date}</span><span className="border-l border-mist pl-3 font-bold tabular-nums text-petrol">{clock.time} <span className="font-normal text-slate">h · Argentina</span></span></time>
        </div>
        <main className="admin-main min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <Outlet context={{ clock }} />
        </main>
      </div>
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
