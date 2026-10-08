import { useCallback, useEffect, useState } from 'react';
import { Search, Download, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Empty, Spinner, StatusBadge, useToast, cx, IS_DEMO } from '../../components/ui';
import PeriodPicker, { presetRange } from '../../components/PeriodPicker';
import TicketDetail from '../../components/TicketDetail';
import { PageHead } from './AdminLayout';
import { money, dateAR } from '../../lib/format';

const PAGE = 50;

export default function Tickets() {
  const toast = useToast();
  const [period, setPeriod] = useState({ preset: 'mes', ...presetRange('mes') });
  const [status, setStatus] = useState('todos');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(null);
  const [count, setCount] = useState(0);
  const [sum, setSum] = useState(0);
  const [open, setOpen] = useState(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(0); }, [period.from, period.to, status, debounced]);

  const buildQuery = useCallback((select, opts) => {
    let query = supabase.from('tickets').select(select, opts).gte('fecha_comprobante', period.from).lte('fecha_comprobante', period.to);
    if (status !== 'todos') query = query.eq('status', status);
    if (debounced) {
      const s = debounced.replace(/[%,()]/g, ' ');
      query = query.or(`estudio.ilike.%${s}%,visita.ilike.%${s}%,paciente_iniciales.ilike.%${s}%,paciente_numero.ilike.%${s}%,nro_operacion.ilike.%${s}%`);
    }
    return query;
  }, [period.from, period.to, status, debounced]);

  const load = useCallback(async () => {
    setRows(null);
    const [{ data, count: c, error }, totals] = await Promise.all([
      buildQuery('*, profiles:created_by(full_name)', { count: 'exact' })
        .order('fecha_comprobante', { ascending: false }).order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1),
      buildQuery('total').neq('status', 'anulado').limit(10000),
    ]);
    if (error) { toast(error.message, 'error'); setRows([]); return; }
    setRows(data);
    setCount(c || 0);
    setSum((totals.data || []).reduce((a, t) => a + Number(t.total), 0));
  }, [buildQuery, page, toast]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    if (IS_DEMO) return toast('En la demo no se descargan archivos. En la app real se baja un CSV que abre en Excel.', 'info');
    const { data, error } = await buildQuery('*, profiles:created_by(full_name)').order('fecha_comprobante').limit(10000);
    if (error) return toast(error.message, 'error');
    const head = ['Fecha', 'Estudio', 'Visita', 'Iniciales', 'N paciente', 'Adjunta comprobantes', 'Recibe viatico', 'Desayuno', 'Comprobantes adjuntos', 'Suma comprobantes', 'Detalle escrito', 'Medio de pago', 'N operacion', 'Total recibido', 'Estado', 'Cargado por'];
    const yn = (v) => (v === true ? 'SI' : v === false ? 'NO' : '');
    const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const n = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
    const lines = [head.join(';'), ...data.map((t) => [dateAR(t.fecha_comprobante), t.estudio, t.visita, t.paciente_iniciales, t.paciente_numero, yn(t.adjunta_comprobantes), yn(t.recibe_viatico), yn(t.desayuno),
      (t.comprobantes_adjuntos || []).map((g) => `${g.comercio || g.descripcion || 'Comprobante'} ${g.importe ?? ''}`).join(' | '),
      n((t.comprobantes_adjuntos || []).reduce((a, g) => a + (Number(g.importe) || 0), 0)), t.monto_detalle, t.medio_pago, t.nro_operacion, n(t.total), t.status, t.profiles?.full_name].map(esc).join(';'))];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reintegros_${period.from}_${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };


  return (
    <div className="mx-auto max-w-7xl">
      <PageHead title="Recibos de viáticos" text="Todos los reintegros escaneados. Tocá uno para ver las fotos, corregirlo o anularlo."
        actions={<>
          <Button variant="outline" icon={Download} onClick={exportCsv}>Exportar CSV</Button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        <select className="field !w-auto !py-2 text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="todos">Todos los estados</option>
          <option value="cargado">Por enviar (viernes 12 h)</option>
          <option value="enviado">Enviados</option>
          <option value="anulado">Anulados</option>
        </select>
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate" />
          <input className="field !py-2 pl-9 text-[14px]" placeholder="Buscar estudio, visita, iniciales, n.º de paciente u operación…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-mist px-5 py-3 text-sm">
          <span className="text-slate">{count} recibos</span>
          <span>Total sin anulados: <b className="tabular-nums">{money(sum)}</b></span>
        </div>
        {rows === null ? (
          <div className="grid place-items-center py-20"><Spinner /></div>
        ) : rows.length === 0 ? (
          <Empty icon={Receipt} title="No hay recibos con esos filtros" text="Probá con otro período o borrá la búsqueda." />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-[14px]">
              <thead className="bg-fog text-left text-[12.5px] text-slate">
                <tr>
                  <th className="py-2.5 pl-5 pr-3 font-medium">Fecha</th>
                  <th className="px-3 py-2.5 font-medium">Estudio</th>
                  <th className="px-3 py-2.5 font-medium">Visita</th>
                  <th className="px-3 py-2.5 font-medium">Paciente</th>
                  <th className="px-3 py-2.5 font-medium">Incluye</th>
                  <th className="px-3 py-2.5 font-medium">Pago</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {rows.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-fog/60" onClick={() => setOpen(t)}>
                    <td className="whitespace-nowrap py-3 pl-5 pr-3 tabular-nums">{dateAR(t.fecha_comprobante)}</td>
                    <td className="px-3 py-3 font-mono text-[13px] font-semibold">{t.estudio || '—'}</td>
                    <td className="px-3 py-3 font-mono text-[13px]">{t.visita || '—'}</td>
                    <td className="px-3 py-3 font-mono text-[13px]">{[t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-3 text-[13px] text-slate">{[t.recibe_viatico && 'Viático', t.desayuno && 'Desayuno', t.comprobantes_adjuntos?.length && `${t.comprobantes_adjuntos.length} comprob.`].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-3">{t.medio_pago || '—'}</td>
                    <td className={cx('whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums', t.status === 'anulado' && 'text-slate line-through')}>{money(t.total)}</td>
                    <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {count > PAGE && (
          <div className="flex items-center justify-end gap-2 border-t border-mist px-5 py-3 text-sm">
            <span className="text-slate">Página {page + 1} de {Math.ceil(count / PAGE)}</span>
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Anterior"><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)} aria-label="Siguiente"><ChevronRight className="size-4" /></Button>
          </div>
        )}
      </Card>

      <TicketDetail ticket={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />
    </div>
  );
}
