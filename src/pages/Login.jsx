import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck, Activity, Microscope, LockKeyhole } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Logo, IS_DEMO } from '../components/ui';
import { DEMO_LOGINS } from '../demo/mock';
import { ScanLine, LayoutDashboard } from 'lucide-react';
import { supabaseConfigured } from '../lib/supabase';

export default function Login() {
  const { signIn, profile, profileError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (profile) return <Navigate to={profile.role === 'admin' ? '/panel' : '/caja'} replace />;

  const demoLogin = async (role) => {
    setError(null);
    setBusy(true);
    try { await signIn(DEMO_LOGINS[role], 'demo'); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { await signIn(email, password); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-shell grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="login-institute relative hidden overflow-hidden px-12 py-12 lg:flex lg:flex-col xl:px-20">
        <div className="login-orbit login-orbit-one" aria-hidden="true" />
        <div className="login-orbit login-orbit-two" aria-hidden="true" />
        <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-petrol-3">
          <Activity className="size-4" /> Investigación clínica
        </div>
        <div className="login-reveal relative flex flex-1 flex-col justify-center py-14">
          <Logo full className="w-full max-w-[620px]" />
          <div className="my-10 h-1 w-14 rounded-full bg-saline" />
          <h2 className="max-w-lg text-[36px] font-semibold leading-[1.2] tracking-tight text-petrol xl:text-[44px]">
            Ciencia, cuidado y compromiso.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-slate">
            Un espacio de trabajo para acompañar la investigación clínica y la gestión del instituto.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <span className="login-pillar"><Microscope className="size-4" /> Investigación</span>
            <span className="login-pillar"><ShieldCheck className="size-4" /> Confidencialidad</span>
          </div>
        </div>
        <p className="relative text-xs tracking-wide text-slate">Instituto de Investigaciones Clínicas · Córdoba</p>
      </section>

      <section className="relative flex flex-col justify-center px-5 py-10 sm:px-12 lg:px-10 xl:px-16">
        <div className="login-card login-reveal mx-auto w-full max-w-[460px] rounded-3xl border border-white bg-white/95 p-7 sm:p-10">
          <div className="mb-9 lg:hidden"><Logo full className="w-full max-w-xs" /></div>
          <div className="mb-6 grid size-12 place-items-center rounded-2xl border border-mist bg-fog text-petrol-3"><LockKeyhole className="size-5" /></div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-petrol-3">Portal del instituto</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-petrol">Bienvenido</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">Ingresá con tu cuenta institucional para acceder al sistema de reintegros de viáticos.</p>

          {IS_DEMO && (
            <div className="mt-6 rounded-2xl border border-mist bg-fog p-4">
              <p className="text-[13px] text-slate">Demo con datos de ejemplo. Elegí cómo entrar:</p>
              <div className="mt-3 grid gap-2">
                <Button icon={ScanLine} onClick={() => demoLogin('administracion')} disabled={busy}>Entrar como Administración</Button>
                <Button variant="outline" icon={LayoutDashboard} onClick={() => demoLogin('admin')} disabled={busy}>Entrar como Dr. Pautasso</Button>
              </div>
            </div>
          )}

          {!IS_DEMO && !supabaseConfigured && (
            <p className="mt-6 rounded-xl bg-iodine-soft px-4 py-3 text-sm text-iodine">
              El acceso está pendiente de habilitación. Contactá al administrador del instituto.
            </p>
          )}

          <form onSubmit={submit} className={IS_DEMO ? 'hidden' : 'mt-8 space-y-5'}>
            <Field label="Email">
              <input className="field h-12" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña">
              <div className="relative">
                <input className="field h-12 pr-12" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate hover:bg-fog" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
            </Field>
            {(error || profileError) && <p className="rounded-xl bg-lesion-soft px-4 py-3 text-sm text-lesion" role="alert">{error || profileError}</p>}
            <Button type="submit" size="lg" icon={LogIn} loading={busy} className="login-submit w-full">Ingresar</Button>
          </form>
          <p className="mt-8 text-[13px] text-slate">¿Olvidaste la contraseña? Pedile al administrador que te asigne una nueva.</p>
        </div>
      </section>
    </div>
  );
}
