import { savedReimbursementError } from '../../../shared/save-validation.js';
import { useCallback, useEffect, useState } from 'react';
import { MailCheck, MailX, History, Clock, PauseCircle, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { Button, Card, Empty, Spinner, Badge, Field, useToast, cx } from '../../components/ui';
import { PageHead } from './AdminLayout';
import { money, dateAR, dateTimeAR, todayISO, startOfMonth, nextWeeklySend } from '../../lib/format';

const KIND = { automatico: 'Automático semanal', reenvio: 'Reenvío', manual: 'Manual', cierre: 'Cierre de caja' };

export default function Reports() {
  const toast = useToast();
  const [reports, setReports] = useState(null);
  const [pending, setPending] = useState({ count: 0, total: 0 });
  const [contadora, setContadora] = useState(null);
  const [autoOn, setAutoOn] = useState(true);
  const [schedule, setSchedule] = useState({});
  const [busy, setBusy] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [range, setRange] = useState({ from: startOfMonth(todayISO()), to: todayISO() });

  const load = useCallback(async () => {
    const [r, p, s] = await Promise.all([
      supabase.from('email_reports').select('*, profiles:sent_by(full_name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('tickets').select('*').eq('status', 'cargado'),
      supabase.from('settings').select('key, value').in('key', ['contadora', 'envio_automatico']),
    ]);
    setReports(r.data || []);
    const eligible = (p.data || []).filter(t => !savedReimbursementError(t));
    setPending({ count: eligible.length, total: eligible.reduce((a, t) => a + Number(t.total), 0) });
    const m = Object.fromEntries((s.data || []).map((x) => [x.key, x.value]));
    setContadora({ ...(m.contadora || {}), email: m.contadora?.email || 'estudiocaballerosalva@gmail.com' });
    setAutoOn(m.envio_automatico?.activo !== false);
    setSchedule(m.envio_automatico || {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const resend = async () => {
    setBusy(true);
    try {
      const r = await api('send-report', { body: range });
      toast(r.sent ? `Reenviado a ${r.recipients.join(', ')}: ${r.count} recibos por ${money(r.total)}.` : r.reason, r.sent ? 'ok' : 'info');
      load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const nextSend = nextWeeklySend(new Date(), schedule);
  const lastError = reports?.find((r) => r.trigger_kind === 'automatico')?.status === 'error';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead title="Envíos a la contadora"
        text="La secretaría solo escanea. Según el horario configurado, el sistema le manda a la contadora un reporte de lo cargado durante la semana, la planilla Excel y las fotos con los datos tapados." />

      <p className="mb-4 text-sm"><Link to="/panel/configuracion" className="font-semibold text-petrol-3 underline">Cambiar destinatario, día y hora de envío</Link></p>
      <Card className="overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[1.3fr_1fr]">
          <div className="p-6 sm:p-7">
            <div className="flex items-center gap-2">
              {autoOn ? <Clock className="size-5 text-saline-dark" /> : <PauseCircle className="size-5 text-iodine" />}
              <h2 className="font-bold">{autoOn ? 'Próximo envío automático' : 'Envío automático pausado'}</h2>
            </div>
            <p className="mt-3 text-[30px] font-extrabold leading-none tracking-tight text-petrol">{autoOn ? nextSend : 'Pausado'}</p>
            <p className="mt-3 text-[14.5px] text-slate">
              {!autoOn ? (
                <>Mientras esté pausado no se envía nada. Activalo en <Link to="/panel/configuracion" className="font-semibold text-petrol-3 underline">Configuración</Link>.</>
              ) : pending.count ? (
                <>Va a incluir <b className="text-ink">{pending.count} recibo{pending.count === 1 ? '' : 's'}</b> por <b className="text-ink tabular-nums">{money(pending.total)}</b>. Los pendientes anteriores se incluyen en el mismo reporte.</>
              ) : (
                <>Por ahora no hay recibos pendientes. Si no hay recibos en el período ni pendientes anteriores, no se envía email.</>
              )}
            </p>
            {lastError && <p className="mt-3 rounded-lg bg-lesion-soft px-3 py-2 text-[13px] text-lesion">El último envío automático falló. Se reintenta solo en el próximo envío; revisá el detalle en el historial.</p>}
          </div>
          <dl className="grid content-start gap-4 border-t border-mist bg-fog/60 p-6 text-[14px] sm:p-7 md:border-l md:border-t-0">
            <div>
              <dt className="text-[12.5px] text-slate">Se envía a</dt>
              <dd className="mt-0.5 font-semibold">{contadora?.email || <Link to="/panel/configuracion" className="text-lesion underline">Falta configurar el email</Link>}</dd>
              {contadora?.nombre && <dd className="text-slate">{contadora.nombre}</dd>}
              {contadora?.cc?.length > 0 && <dd className="text-[13px] text-slate">Copia a {contadora.cc.join(', ')}</dd>}
            </div>
            <div>
              <dt className="text-[12.5px] text-slate">Qué recibe</dt>
              <dd className="mt-0.5">Email con resumen por estudio, planilla Excel, CSV y link a las fotos.</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Historial de envíos</h2>
        <button onClick={() => setShowResend(!showResend)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-petrol-3 hover:text-petrol">
          <History className="size-4" /> Reenviar un período <ChevronDown className={cx('size-4 transition-transform', showResend && 'rotate-180')} />
        </button>
      </div>

      {showResend && (
        <Card className="mb-4 p-5">
          <p className="text-sm text-slate">Solo si la contadora necesita que le vuelvan a llegar recibos ya enviados (por ejemplo, para el cierre del mes).</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Desde"><input type="date" className="field" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
            <Field label="Hasta"><input type="date" className="field" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
            <Button variant="outline" icon={History} disabled={!contadora?.email} loading={busy} onClick={resend}>Reenviar</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {reports === null ? <div className="grid place-items-center py-16"><Spinner /></div>
          : reports.length === 0 ? <Empty icon={MailCheck} title="Todavía no hubo envíos" text={`El primero sale ${nextSend.toLowerCase()}, si hay recibos cargados.`} />
          : (
            <ul className="divide-y divide-mist">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-4">
                  {r.status === 'error' ? <MailX className="size-5 shrink-0 text-lesion" /> : <MailCheck className="size-5 shrink-0 text-saline-dark" />}
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold">{r.period_from === r.period_to ? `Recibos del ${dateAR(r.period_from)}` : `Recibos del ${dateAR(r.period_from)} al ${dateAR(r.period_to)}`}</p>
                    <p className="text-[13px] text-slate">{dateTimeAR(r.created_at)} · {KIND[r.trigger_kind] || r.trigger_kind}{r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ''}</p>
                    {r.error && <p className="mt-1 text-[13px] text-lesion">{r.error}</p>}
                  </div>
                  <span className="tabular-nums text-slate">{r.ticket_count} recibos</span>
                  <span className="w-32 text-right font-bold tabular-nums">{money(r.total_amount)}</span>
                  <Badge tone={r.status === 'error' ? 'error' : r.status === 'enviado' ? 'ok' : 'warn'}>{r.status === 'enviado' ? 'Enviado' : r.status === 'error' ? 'Falló' : 'En curso'}</Badge>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}
