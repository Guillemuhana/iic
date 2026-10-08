import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Logo, IS_DEMO } from '../components/ui';
import { DEMO_LOGINS } from '../demo/mock';
import { ScanLine, LayoutDashboard } from 'lucide-react';
import ThermalTicket from '../components/ThermalTicket';
import { supabaseConfigured } from '../lib/supabase';
import { todayISO } from '../lib/format';

const SAMPLE = {
  estudio: 'PROTOCOLO-01', visita: 'V12', paciente_iniciales: 'AB', paciente_numero: '1001',
  fecha_comprobante: todayISO(), recibe_viatico: true, desayuno: true, adjunta_comprobantes: true,
  comprobantes_adjuntos: [{ comercio: 'Combustible', importe: 48000 }, { comercio: 'Peaje', importe: 3500 }],
  total: 58500, medio_pago: 'Transferencia',
};

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
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-petrol lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo light full className="w-52" />
        <div className="relative mx-auto w-[330px] rotate-[-4deg]">
          <ThermalTicket t={SAMPLE} edge="#123A5A" />
          <div className="absolute -inset-x-6 top-1/3 h-0.5 bg-saline shadow-[0_0_24px_6px_rgba(0,101,179,.5)]" />
        </div>
        <p className="max-w-md text-[22px] font-semibold leading-snug text-white">
          Cada reintegro de viáticos leído, protegido y registrado en segundos. Sin planillas a mano.
        </p>
      </section>

      <section className="flex flex-col justify-center bg-white px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Logo full className="w-48" /></div>
          <p className="inst-name hidden text-[17px] text-petrol lg:block">Instituto de Investigaciones Clínicas de Córdoba</p>
          <p className="hidden text-[13px] text-slate lg:block">Sistema de reintegros de viáticos</p>
          <h1 className="mt-0 text-[28px] font-extrabold tracking-tight text-petrol lg:mt-10">Ingresar</h1>
          <p className="mt-1 text-slate">Usá el email y la contraseña que te dio el instituto.</p>

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
              Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
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
            <Button type="submit" size="lg" icon={LogIn} loading={busy} className="w-full">Ingresar</Button>
          </form>
          <p className="mt-8 text-[13px] text-slate">¿Olvidaste la contraseña? Pedile al administrador que te asigne una nueva.</p>
        </div>
      </section>
    </div>
  );
}
