import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, cx } from './ui';
import { MEDIOS_PAGO, parseAmount, checkTicket } from '../../shared/ticket-rules.js';
import { supabase } from '../lib/supabase';

let estudiosCache = null;
function useEstudios() {
  const [list, setList] = useState(estudiosCache || []);
  useEffect(() => {
    if (estudiosCache) return;
    supabase.from('settings').select('value').eq('key', 'estudios').maybeSingle().then(({ data }) => {
      estudiosCache = data?.value?.lista || [];
      setList(estudiosCache);
    });
  }, []);
  return list;
}

/** Datos editables del recibo de viáticos, con marcas de revisión por campo. */
export default function TicketForm({ value, onChange, fieldConfidence = {}, compact }) {
  const t = value;
  const estudios = useEstudios();
  const warnings = checkTicket(t);
  const flagFor = (field) => {
    const w = warnings.find((x) => x.field === field);
    if (w) return { level: w.level, message: w.message };
    const c = fieldConfidence[field];
    if (c !== undefined && c < 0.75) return { level: 'warn', short: 'Lectura dudosa', message: 'Comparalo con la foto.' };
    return null;
  };
  const set = (k) => (e) => onChange({ ...t, [k]: e?.target ? e.target.value : e });
  const setAmount = (k) => (e) => onChange({ ...t, [k]: e.target.value === '' ? null : parseAmount(e.target.value) });
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
            <input className="field font-mono uppercase" list="estudios-activos" data-flag={flagFor('estudio')?.level}
              value={t.estudio ?? ''} placeholder="Ej. I8F-MC-GPLL"
              onChange={(e) => onChange({ ...t, estudio: e.target.value.toUpperCase() })} />
            <datalist id="estudios-activos">{estudios.map((e) => <option key={e} value={e} />)}</datalist>
          </Field>
          <F {...ctx} k="visita" label="Visita" placeholder="Ej. V19" mono upper />
          <F {...ctx} k="paciente_iniciales" label="Iniciales del paciente" placeholder="Ej. FA" mono upper />
          <F {...ctx} k="paciente_numero" label="N.º de paciente" placeholder="Ej. 1023" mono upper />
        </div>
        <p className="mt-2 text-[12px] text-slate">Por privacidad no se registra el nombre del paciente: solo iniciales y número.</p>
      </Section>

      <Section title="Importe recibido">
        <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
          <AmountField label="Total recibido" big value={t.total} onChange={setAmount('total')} flag={flagFor('total')} />
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
          <p className="text-sm text-slate">Sin tickets de gastos. Si los adjuntó, agregá una foto de cada uno.</p>
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

function AmountField({ label, value, onChange, flag, big }) {
  return (
    <Field label={label} flag={flag}>
      <div className="relative">
        <span className={cx('pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate', big && 'text-lg')}>$</span>
        <input
          key={value ?? 'empty'}
          className={cx('field pl-7 text-right tabular-nums', big && 'h-14 text-2xl font-bold')}
          inputMode="decimal"
          data-flag={flag?.level}
          defaultValue={value === null || value === undefined ? '' : Number(value).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          onBlur={onChange}
        />
      </div>
    </Field>
  );
}
