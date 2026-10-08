import { money, dateAR } from '../lib/format';
import { cx } from './ui';

const yn = (v) => (v === true ? 'SÍ' : v === false ? 'NO' : '—');

/** Reconstrucción del recibo leído, en formato de tira. */
export default function ThermalTicket({ t, className, printing, edge }) {
  const line = (label, value, strong) =>
    value ? (
      <div className="flex justify-between gap-3">
        <span className="text-ink/60">{label}</span>
        <span className={cx('text-right', strong && 'font-semibold')}>{value}</span>
      </div>
    ) : null;
  const gastos = t.comprobantes_adjuntos || [];
  return (
    <div className={cx('thermal px-5 pb-7 pt-7 text-[12.5px] leading-relaxed text-ink', printing && 'printing', className)}
      style={edge ? { '--thermal-edge': edge } : undefined}>
      <div className="text-center">
        <div className="font-semibold uppercase">Reintegro de viáticos</div>
        <div className="text-ink/60">Instituto de Investigaciones Clínicas</div>
      </div>
      <div className="thermal-rule my-3" />
      {line('Estudio', t.estudio || 'Sin leer', true)}
      {line('Visita', t.visita || '—', true)}
      {line('Paciente', [t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' · ') || '—', true)}
      {line('Fecha', t.fecha_comprobante ? dateAR(t.fecha_comprobante) : null)}
      <div className="thermal-rule my-3" />
      {line('Adjunta comprob.', yn(t.adjunta_comprobantes))}
      {line('Recibe viático', yn(t.recibe_viatico))}
      {line('Desayuno', yn(t.desayuno))}
      {gastos.length > 0 && <div className="thermal-rule my-3" />}
      {gastos.map((g, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="min-w-0 truncate">{g.comercio || g.descripcion || 'Comprobante'}</span>
          <span className="shrink-0">{g.importe != null ? money(g.importe) : ''}</span>
        </div>
      ))}
      <div className="thermal-rule my-3" />
      {t.monto_detalle && <div className="mb-1 text-ink/60">“{t.monto_detalle}”</div>}
      <div className="flex items-baseline justify-between text-[17px] font-semibold">
        <span>RECIBIDO</span>
        <span>{t.total != null ? money(t.total) : '—'}</span>
      </div>
      {line('Pago', t.medio_pago)}
      {line('Operación', t.nro_operacion)}
    </div>
  );
}
