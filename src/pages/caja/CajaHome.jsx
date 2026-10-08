import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, LogOut, LayoutDashboard, Receipt, ChevronRight, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Empty, InstituteMark, Spinner, StatusBadge, cx } from '../../components/ui';
import TicketDetail from '../../components/TicketDetail';
import logoMonoWhite from '../../assets/logo-iic-mono-blanco.png';
import { money, timeAR, todayISO, dateAR, addDays, longDayAR, nextWeeklySend } from '../../lib/format';
import { savedReimbursementError } from '../../../shared/save-validation.js';

export default function CajaHome() {
  const { profile, signOut, isAdmin } = useAuth();
  const nav = useNavigate();
  const [day, setDay] = useState(todayISO());
  const [tickets, setTickets] = useState(null);
  const [pending, setPending] = useState({ count: 0, total: 0, review: 0 });
  const [autoOn, setAutoOn] = useState(true);
  const [schedule, setSchedule] = useState({});
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const start = new Date(day + 'T00:00:00-03:00').toISOString();
    const end = new Date(addDays(day, 1) + 'T00:00:00-03:00').toISOString();
    const [{ data }, { data: pend }, { data: cfg }] = await Promise.all([
      supabase.from('tickets').select('*, profiles:created_by(full_name)').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }),
      supabase.from('tickets').select('*').eq('status', 'cargado'),
      supabase.from('settings').select('value').eq('key', 'envio_automatico').maybeSingle(),
    ]);
    setTickets(data || []);
    const eligible = (pend || []).filter(t => !savedReimbursementError(t));
    setPending({ count: eligible.length, total: eligible.reduce((a, t) => a + Number(t.total), 0), review: (pend || []).length - eligible.length });
    setAutoOn(cfg?.value?.activo !== false);
    setSchedule(cfg?.value || {});
  }, [day]);

  useEffect(() => { load(); }, [load]);

  const visibles = useMemo(() => (tickets || []).filter((t) => t.status !== 'anulado'), [tickets]);
  const totalDia = visibles.filter(t => !savedReimbursementError(t)).reduce((a, t) => a + Number(t.total), 0);
  const mios = visibles.filter((t) => t.created_by === profile?.id).length;
  const isToday = day === todayISO();
  const nextSend = nextWeeklySend(new Date(), schedule);

  return (
    <div className="min-h-full bg-paper pb-32">
      <header className="petrol-hero safe-top relative overflow-hidden px-5 pb-10 text-white">
        <img src={logoMonoWhite} alt="" aria-hidden className="pointer-events-none absolute -right-8 top-10 h-56 w-auto opacity-[.06]" />
        <div className="relative flex items-start justify-between gap-3 pt-2">
          <InstituteMark light section="Recibos de viáticos" />
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin && (
              <Link to="/panel" className="grid size-10 place-items-center rounded-xl bg-white/10 hover:bg-white/15" aria-label="Panel de administración"><LayoutDashboard className="size-5" /></Link>
            )}
            <button onClick={signOut} className="grid size-10 place-items-center rounded-xl bg-white/10 hover:bg-white/15" aria-label="Cerrar sesión"><LogOut className="size-5" /></button>
          </div>
        </div>

        <div className="relative mt-8">
          <p className="text-[14px] text-white/70">{isToday ? `${longDayAR(day)} · Hola, ${profile?.full_name?.split(' ')[0] || 'equipo'}` : longDayAR(day)}</p>
          <p className="mt-1.5 text-[38px] font-extrabold leading-none tracking-tight tabular-nums">{money(totalDia, { decimals: 0 })}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/75">
              {visibles.length} recibo{visibles.length === 1 ? '' : 's'} cargado{visibles.length === 1 ? '' : 's'}{isToday ? ' hoy' : ''}
              {mios ? ` · ${mios} por vos` : ''}
            </p>
            <input type="date" value={day} max={todayISO()} onChange={(e) => e.target.value && setDay(e.target.value)}
              className="rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white [color-scheme:dark]" aria-label="Ver otro día" />
          </div>
        </div>
      </header>

      <div className="relative -mt-5 px-4">
        <Card className="flex items-start gap-3 p-4">
          <span className={cx('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', pending.count ? 'bg-iodine-soft text-iodine' : 'bg-saline/15 text-saline-dark')}>
            {pending.count ? <Clock className="size-[18px]" /> : <CheckCircle2 className="size-[18px]" />}
          </span>
          <div className="min-w-0 text-[14px] leading-snug">
            <p className="font-semibold">Envío automático a la contadora</p>
            {pending.review > 0 && <p className="mt-1 rounded-lg bg-iodine-soft p-2 text-iodine">{pending.review} reintegro(s) necesitan revisión. Se excluyen del reporte y del total.</p>}
            {!autoOn ? (
              <p className="mt-0.5 text-slate">El envío automático está pausado. Avisale al administrador.</p>
            ) : pending.count ? (
              <p className="mt-0.5 text-slate">
                Se envían solos {nextSend}: <b className="text-ink tabular-nums">{pending.count} recibo{pending.count === 1 ? '' : 's'}</b> por <b className="text-ink tabular-nums">{money(pending.total)}</b>.
              </p>
            ) : (
              <p className="mt-0.5 text-slate">{pending.review ? 'No hay reintegros listos para enviar.' : 'Está todo enviado.'} Lo que cargues y revises sale {nextSend}.</p>
            )}
          </div>
        </Card>
      </div>

      <section className="mt-7 px-4">
        <h2 className="mb-3 px-1 text-[15px] font-bold">{isToday ? 'Cargados hoy' : `Cargados el ${dateAR(day)}`}</h2>
        {tickets === null ? (
          <div className="grid place-items-center py-12"><Spinner /></div>
        ) : tickets.length === 0 ? (
          <Card><Empty icon={Receipt} title={isToday ? 'Todavía no cargaste recibos hoy' : 'Ese día no se cargaron recibos'} text={isToday ? 'Tocá Escanear recibo y sacale foto al primero.' : undefined} /></Card>
        ) : (
          <Card className="divide-y divide-mist overflow-hidden">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => setOpen(t)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-fog/70">
                <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-fog py-1.5 text-center">
                  <span className="font-mono text-[13px] font-semibold leading-none text-petrol">{t.visita || '—'}</span>
                  <span className="mt-1 text-[10px] leading-none text-slate">{timeAR(t.created_at)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[14px] font-semibold">{[t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' · ') || 'Paciente sin dato'}</p>
                  <p className="truncate text-[12.5px] text-slate">
                    <span className="font-mono">{t.estudio || 'Sin estudio'}</span>
                    {' · '}{[t.recibe_viatico && 'Viático', t.desayuno && 'Desayuno', t.comprobantes_adjuntos?.length && `${t.comprobantes_adjuntos.length} comprob.`].filter(Boolean).join(' + ') || 'Reintegro'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cx('font-bold tabular-nums', t.status === 'anulado' && 'text-slate line-through')}>{money(t.total, { decimals: 0 })}</p>
                  <div className="mt-1">{t.status !== 'anulado' && savedReimbursementError(t) ? <span className="text-xs font-semibold text-iodine">Revisar · no se envía</span> : <StatusBadge status={t.status} short />}</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate/60" />
              </button>
            ))}
          </Card>
        )}
      </section>

      <div className="safe-bottom fixed inset-x-0 bottom-0 bg-gradient-to-t from-paper via-paper to-transparent px-4 pt-6">
        <Button size="xl" icon={Camera} className="mx-auto w-full max-w-xl shadow-[0_14px_32px_-14px_rgba(15,52,64,.75)]" onClick={() => nav('/caja/escanear')}>
          Escanear recibo
        </Button>
      </div>

      <TicketDetail ticket={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />
    </div>
  );
}
