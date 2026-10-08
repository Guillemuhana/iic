import { WEEKDAYS, scheduleConfig, scheduleError, nextWeeklySend } from '../../../shared/report-schedule.js';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Field, Spinner, useToast } from '../../components/ui';
import { PageHead } from './AdminLayout';

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('*').then(({ data }) => {
      const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      setS({
        instituto: m.instituto || { nombre: '', responsable: '' },
        contadora: { nombre: '', ...(m.contadora || {}), email: m.contadora?.email || 'estudiocaballerosalva@gmail.com', ccText: (m.contadora?.cc || []).join(', ') },
        envio_automatico: scheduleConfig(m.envio_automatico),
        estudiosText: (m.estudios?.lista || []).join('\n'),
      });
    });
  }, []);

  const save = async () => {
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const cc = s.contadora.ccText.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!emailRe.test(s.contadora.email.trim())) return toast('El email de la contadora no es válido.', 'error');
    const bad = cc.find((x) => !emailRe.test(x));
    if (bad) return toast(`El email en copia "${bad}" no es válido.`, 'error');
    const invalidSchedule = scheduleError(s.envio_automatico);
    if (invalidSchedule) return toast(invalidSchedule, 'error');
    setBusy(true);
    const { ccText, ...contadora } = s.contadora;
    const rows = [
      { key: 'contadora', value: { ...contadora, email: contadora.email.trim(), cc } },
      { key: 'envio_automatico', value: s.envio_automatico },
      { key: 'estudios', value: { lista: [...new Set(s.estudiosText.split(/[\n,;]+/).map((x) => x.trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean))] } },
      { key: 'instituto', value: { ...s.instituto, cuit: String(s.instituto.cuit || '').replace(/\D/g, '') } },
    ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('settings').upsert(rows);
    setBusy(false);
    toast(error ? error.message : 'Configuración guardada.', error ? 'error' : 'ok');
  };

  if (!s) return <div className="grid place-items-center py-24"><Spinner /></div>;
  const up = (sec, k) => (e) => setS({ ...s, [sec]: { ...s[sec], [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Configuración" actions={<Button icon={Save} loading={busy} onClick={save}>Guardar cambios</Button>} />
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="font-bold">Contadora</h2>
          <p className="mt-1 text-sm text-slate">A quién le llegan los comprobantes por email.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre"><input className="field" value={s.contadora.nombre} onChange={up('contadora', 'nombre')} placeholder="Ej. Cra. Laura Gómez" /></Field>
            <Field label="Email"><input className="field" type="email" value={s.contadora.email} onChange={up('contadora', 'email')} placeholder="contadora@estudio.com" /></Field>
            <Field label="Con copia a" hint="Opcional. Separá varios emails con coma." className="sm:col-span-2">
              <input className="field" value={s.contadora.ccText} onChange={up('contadora', 'ccText')} placeholder="pautasso@instituto.com" />
            </Field>
          </div>
          <label className="mt-5 flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-4 accent-[#123A5A]" checked={s.envio_automatico.activo !== false} onChange={up('envio_automatico', 'activo')} />
            <span>
              <span className="font-medium">Activar envío semanal automático</span>
              <span className="block text-sm text-slate">Un reporte de la semana hasta el día y horario elegidos, con resumen, totales, Excel, CSV y fotos. Incluye pendientes anteriores. Destildalo solo para pausar los envíos.</span>
            </span>
          </label>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Día de envío"><select className="field" value={s.envio_automatico.dia} onChange={up('envio_automatico', 'dia')}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
            <Field label="Hora de Argentina"><select className="field" value={s.envio_automatico.hora} onChange={up('envio_automatico', 'hora')}>{Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00').map(h => <option key={h}>{h}</option>)}</select></Field>
            <Field label="Fecha de inicio" hint="Opcional. No se enviará antes de esta fecha."><input type="date" className="field" value={s.envio_automatico.fecha_inicio} onChange={up('envio_automatico', 'fecha_inicio')} /></Field>
          </div>
          <p className="mt-4 text-sm text-slate">Próximo envío con estos ajustes: {nextWeeklySend(new Date(), s.envio_automatico)}. En el plan gratuito puede ejecutarse dentro de esa hora. Guardá los cambios para aplicarlos.</p>
        </Card>
        <Card className="p-6">
          <h2 className="font-bold">Estudios activos</h2>
          <p className="mt-1 text-sm text-slate">Un código por línea. La lectura usa esta lista para corregir códigos manuscritos (ej. I/1, 8/B, 0/O) y en el formulario aparecen como sugerencia.</p>
          <textarea className="field mt-4 min-h-32 font-mono uppercase" value={s.estudiosText} placeholder={'I8F-MC-GPLL\nJ2A-MC-GZPO'}
            onChange={(e) => setS({ ...s, estudiosText: e.target.value })} />
        </Card>
        <Card className="p-6">
          <h2 className="font-bold">Instituto</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2"><input className="field" value={s.instituto.nombre} onChange={up('instituto', 'nombre')} /></Field>
            <Field label="Responsable"><input className="field" value={s.instituto.responsable} onChange={up('instituto', 'responsable')} /></Field>
            <Field label="CUIT del instituto" hint="Este CUIT no se oculta en el texto leído; los del paciente sí.">
              <input className="field font-mono" inputMode="numeric" value={s.instituto.cuit || ''} onChange={up('instituto', 'cuit')} />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
