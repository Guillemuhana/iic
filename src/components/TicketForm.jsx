import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, cx } from './ui';
import { MEDIOS_PAGO, parseAmount, checkTicket } from '../../shared/ticket-rules.js';
import { supabase } from '../lib/supabase';
import MoneyInput from './MoneyInput';
import { codigoEstudio, ordenarEstudios } from '../../shared/estudios.js';

function useEstudios() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.from('estudios').select('*').eq('activo', true);
        if (error) throw error;
        if (mounted) { setList(ordenarEstudios(data || [])); setError(''); }
      } catch {
        if (mounted) setError('No se pudo cargar el catálogo de estudios. Volvé a intentar.');
      } finally { if (mounted) setLoading(false); }
    };
    load();
    window.addEventListener('focus', load);
    return () => { mounted = false; window.removeEventListener('focus', load); };
  }, []);
  return { list, error, loading };
}

/** Datos editables del recibo de viáticos, con marcas de revisión por campo. */
export default function TicketForm({ value, onChange, fieldConfidence = {}, compact }) {
  const t = value;
  const { list: estudios, error: estudiosError, loading: estudiosLoading } = useEstudios();
  const selected = estudios.find(e => codigoEstudio(e.codigo) === codigoEstudio(t.estudio));
  const warnings = checkTicket(t);
  const flagFor = (field) => {
    const w = warnings.find((x) => x.field === field);
    if (w) return { level: w.level, message: w.message };
    const c = fieldConfidence[field];
    if (c !== undefined && c < 0.75) return { level: 'warn', short: 'Lectura dudosa', message: 'Comparalo con la foto.' };
    return null;
  };
  const set = (k) => (e) => onChange({ ...t, [k]: e?.target ? e.target.value : e });
  const ctx = { t, set, flagFor };

  const gastos = t.comprobantes_adjuntos || [];
  const setGasto = (i, k, v) => onChange({ ...t, comprobantes_adjuntos: gastos.map((g, j) => (j === i ? { ...g, [k]: v } : g)) });
  const sumGastos = gastos.reduce((a, g) => a + (Number(g.importe) || 0), 0);
  const grid = compact ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="space-y-7">
      <Section title="Estudio y paciente">
        <div className={grid}>
          <Field label="Estudio" flag={flagFor('estudio')}>
            <select className="field" aria-label="Estudio" value={selected?.codigo ?? t.estudio ?? ''}
              disabled={estudiosLoading} onChange={set('estudio')}>
              <option value="">{estudiosLoading ? 'Cargando estudios...' : 'Seleccioná un estudio'}</option>
              {t.estudio && !selected && <option value={t.estudio} disabled={!t.id}>{t.estudio}</option>}
              {estudios.map(e => <option key={e.id} value={e.codigo}>{e.codigo}</option>)}
            </select>
            {estudiosError && <p role="alert" className="text-sm text-lesion">{estudiosError}</p>}
            {!estudiosLoading && !estudiosError && !estudios.length && <p className="text-sm text-slate">No hay estudios habilitados. Consultá al administrador.</p>}
            {t.estudio && !selected && <p className="text-sm text-slate">{t.id ? 'Valor histórico conservado.' : 'El código leído no está habilitado. Seleccioná un estudio del catálogo.'}</p>}
          </Field>
          <F {...ctx} k="visita" label="Visita" placeholder="Ej. V19" mono upper />
          <F {...ctx} k="paciente_iniciales" label="Iniciales del paciente" placeholder="Ej. FA" mono upper />
        </div>
        <p className="mt-2 text-[12px] text-slate">Por privacidad no se registra el nombre del paciente: solo sus iniciales.</p>
      </Section>

      <Section title="Importe recibido">
        <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
          <MoneyInput label="Total recibido" value={t.total} onChange={v => onChange({ ...t, total: v })} flag={flagFor('total')} />
          <F {...ctx} k="fecha_comprobante" label="Fecha" type="date" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <F {...ctx} k="monto_detalle" label="Escrito en “Recibí la suma de”" placeholder="Ej. $152.034 = $163.934" />
          <Field label="Medio de pago">
            <select className="field" value={t.medio_pago ?? ''} onChange={set('medio_pago')}>
              <option value="">Sin dato</option>
              {(t.medio_pago && !MEDIOS_PAGO.includes(t.medio_pago) ? [t.medio_pago, ...MEDIOS_PAGO] : MEDIOS_PAGO).map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          {(t.medio_pago === 'Transferencia' || t.nro_operacion) && (
            <F {...ctx} k="nro_operacion" label="N.º de operación" mono />
          )}
        </div>
        {t.pago?.monto != null && (
          <p className="mt-3 text-[13px] text-slate">
            Transferencia leída: <b className="text-ink">${Number(t.pago.monto).toLocaleString('es-AR')}</b>
            {t.pago.fecha ? ` el ${t.pago.fecha.split('-').reverse().join('/')}` : ''}{t.pago.hora ? ` ${t.pago.hora}` : ''}{t.pago.plataforma ? ` · ${t.pago.plataforma}` : ''}
          </p>
        )}
      </Section>

      <Section title="Casillas del recibo">
        <div className="grid gap-3 sm:grid-cols-3">
          <YesNo label="Adjunta comprobantes" value={t.adjunta_comprobantes} onChange={(v) => onChange({ ...t, adjunta_comprobantes: v })} />
          <YesNo label="Recibe viático" value={t.recibe_viatico} onChange={(v) => onChange({ ...t, recibe_viatico: v })} />
          <YesNo label="Desayuno" value={t.desayuno} onChange={(v) => onChange({ ...t, desayuno: v })} />
        </div>
      </Section>

      <Section title="Comprobantes adjuntos" aside={
        <button type="button" onClick={() => onChange({ ...t, comprobantes_adjuntos: [...gastos, { comercio: '', descripcion: '', fecha: null, medio_pago: null, importe: null }] })}
          className="inline-flex items-center gap-1 text-sm font-semibold text-petrol-3 hover:text-petrol">
          <Plus className="size-4" /> Agregar
        </button>
      }>
        {flagFor('comprobantes_adjuntos') && <p className="mb-3 rounded-lg bg-iodine-soft px-3 py-2 text-[13px] text-iodine">{flagFor('comprobantes_adjuntos').message}</p>}
        {gastos.length === 0 ? (
          <p className="text-sm text-slate">Sin gastos leídos. Si hay tickets adjuntos en la foto del recibo, revisá y completá su detalle.</p>
        ) : (
          <div className="space-y-2">
            {gastos.map((g, i) => (
              <div key={i} className="grid grid-cols-[1fr_7.5rem_2rem] items-center gap-2 sm:grid-cols-[1fr_1fr_8rem_2rem]">
                <input className="field" placeholder="Comercio (ej. YPF)" value={g.comercio ?? ''} onChange={(e) => setGasto(i, 'comercio', e.target.value)} />
                <input className="field hidden sm:block" placeholder="Detalle" value={g.descripcion ?? ''} onChange={(e) => setGasto(i, 'descripcion', e.target.value)} />
                <input key={`${i}-${g.importe}`} className="field text-right tabular-nums" inputMode="decimal" placeholder="$"
                  defaultValue={g.importe != null ? Number(g.importe).toLocaleString('es-AR') : ''}
                  onBlur={(e) => setGasto(i, 'importe', parseAmount(e.target.value))} aria-label="Importe" />
                <button type="button" onClick={() => onChange({ ...t, comprobantes_adjuntos: gastos.filter((_, j) => j !== i) })}
                  className="grid size-8 place-items-center rounded-lg text-slate hover:bg-lesion-soft hover:text-lesion" aria-label="Quitar">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <p className="pt-1 text-right text-[13px] text-slate">Suma de comprobantes: <b className="text-ink tabular-nums">${sumGastos.toLocaleString('es-AR')}</b></p>
          </div>
        )}
      </Section>

      <Section title="Notas internas">
        <textarea className="field min-h-20" placeholder="Opcional." value={t.notas ?? ''} onChange={set('notas')} />
      </Section>
    </div>
  );
}

function F({ t, set, flagFor, k, label, type = 'text', inputMode, placeholder, className, flagKey, mono, upper }) {
  const flag = flagFor(flagKey || k);
  return (
    <Field label={label} flag={flag} className={className}>
      <input className={cx('field', mono && 'font-mono', upper && 'uppercase')} type={type} inputMode={inputMode} placeholder={placeholder} data-flag={flag?.level}
        value={t[k] ?? ''} onChange={upper ? (e) => set(k)(e.target.value.toUpperCase()) : set(k)} />
    </Field>
  );
}

function YesNo({ label, value, onChange }) {
  return (
    <div className="rounded-xl border border-mist bg-white p-3">
      <p className="mb-2 text-[13px] font-medium text-slate">{label}</p>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={label}>
        {[[true, 'Sí'], [false, 'No']].map(([v, l]) => (
          <button key={l} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(value === v ? null : v)}
            className={cx('h-9 rounded-lg text-sm font-bold', value === v ? 'bg-petrol text-white' : 'bg-fog text-slate hover:text-ink')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, aside, children }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-mist pb-2">
        <h3 className="text-[15px] font-bold text-petrol">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
