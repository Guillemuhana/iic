import { api } from '../../lib/api';
import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import { Card, Spinner, cx, IS_DEMO } from '../../components/ui';
import PeriodPicker, { presetRange } from '../../components/PeriodPicker';
import { PageHead } from './AdminLayout';
import { money, moneyShort, num, dayShort, addDays, dateAR } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';

const PETROL = '#123A5A';
const SALINE = '#0065B3';
const SHADES = ['#123A5A', '#0065B3', '#3385C2', '#66A3D1', '#99C2E0', '#CCE0EF'];

function fillDays(rows, from, to) {
  const map = new Map(rows.map((r) => [r.dia, r]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = map.get(d);
    out.push({ dia: d, total: r ? Number(r.total) : 0, cantidad: r ? r.cantidad : 0 });
    if (out.length > 400) break;
  }
  return out;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { clock } = useOutletContext();
  const [period, setPeriod] = useState({ preset: 'mes', ...presetRange('mes') });
  const [stats, setStats] = useState(null);
  const [prev, setPrev] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setStats(null);
    const days = Math.round((new Date(period.to) - new Date(period.from)) / 86400000) + 1;
    const prevTo = addDays(period.from, -1);
    const prevFrom = addDays(prevTo, -(days - 1));
    Promise.all([
      IS_DEMO ? import('../../lib/supabase').then(({supabase}) => supabase.rpc('ticket_stats', {p_from:period.from,p_to:period.to})).then(r=>r.data) : api('ticket-stats', { body: { from: period.from, to: period.to } }),
      IS_DEMO ? import('../../lib/supabase').then(({supabase}) => supabase.rpc('ticket_stats', {p_from:prevFrom,p_to:prevTo})).then(r=>r.data) : api('ticket-stats', { body: { from: prevFrom, to: prevTo } }),
    ]).then(([a, b]) => {
      if (!alive) return;

      setError(null);
      setStats(a);
      setPrev(b);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [period.from, period.to]);

  const series = useMemo(() => (stats ? fillDays(stats.por_dia || [], period.from, period.to) : []), [stats, period]);
  const hours = useMemo(() => {
    const m = new Map((stats?.por_hora || []).map((h) => [h.hora, h.cantidad]));
    return Array.from({ length: 24 }, (_, i) => i).map((h) => ({ hora: `${h}h`, cantidad: m.get(h) || 0 }));
  }, [stats]);

  const nombre = profile?.full_name || 'Doctor';
  const rango = period.from === period.to ? `el ${dateAR(period.from)}` : `del ${dateAR(period.from)} al ${dateAR(period.to)}`;

  return (
    <div className="admin-dashboard mx-auto max-w-7xl">
      <PageHead title={`${clock.greeting}, ${nombre.split(' ').slice(0, 2).join(' ')}`} text="Reintegros de viáticos pagados a pacientes de los estudios, por fecha de carga en Argentina. La fecha del recibo se conserva por separado." actions={<PeriodPicker value={period} onChange={setPeriod} />} />

      {error && <Card className="mb-6 border-lesion/30 bg-lesion-soft p-4 text-sm text-lesion">No se pudieron cargar las estadísticas: {error}</Card>}

      {stats?.revision > 0 && <Card className="mb-6 border-iodine/30 bg-iodine-soft p-4 text-sm">{stats.revision} recibo(s) necesitan revisión: {money(stats.revision_total)} registrados. Se ven en este panel, pero se excluyen del envío a la contadora. Total confirmado: {money(stats.confirmado_total)}. <Link className="underline font-semibold" to="/panel/comprobantes">Revisar recibos</Link></Card>}
      {!stats ? (
        <div className="grid place-items-center py-24">{!error && <Spinner className="size-7" />}</div>
      ) : (
        <>
          {/* Encabezado: el total del período como frase, con su tendencia */}
          <Card className="admin-total-card overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
              <div className="p-6 sm:p-8">
                <p className="text-[15px] text-slate">Reintegros cargados {rango}</p>
                <p className="mt-1 text-[44px] font-extrabold leading-none tracking-tight text-petrol tabular-nums sm:text-[56px]">{money(stats.total)}</p>
                <Trend now={stats.total} before={prev?.total} />
              </div>
              <dl className="grid grid-cols-3 border-t border-mist lg:w-[440px] lg:grid-cols-1 lg:border-l lg:border-t-0">
                <Stat label="Recibos · pacientes" value={`${num(stats.cantidad)} · ${num(stats.pacientes)}`} />
                <Stat label="Promedio por recibo" value={money(stats.promedio, { decimals: 0 })} />
                <Stat label="Sin enviar a contadora" value={`${num(stats.pendientes)} · ${moneyShort(stats.pendientes_total)}`}
                  link={stats.pendientes ? '/panel/envios' : null} />
              </dl>
            </div>
            <div className="h-64 border-t border-mist px-2 pb-2 pt-5 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: 8, right: 16, top: 4 }}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={SALINE} stopOpacity={0.35} />
                      <stop offset="1" stopColor={SALINE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#E7EEF0" />
                  <XAxis dataKey="dia" tickFormatter={dayShort} tick={{ fontSize: 12, fill: '#62666D' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={moneyShort} tick={{ fontSize: 12, fill: '#62666D' }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<DayTip />} />
                  <Area type="monotone" dataKey="total" stroke={PETROL} strokeWidth={2.2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Breakdown title="Por estudio" rows={stats.por_estudio} total={stats.total} mono
              extra={(r) => `${r.pacientes} paciente${r.pacientes === 1 ? '' : 's'} · ${r.cantidad} recibo${r.cantidad === 1 ? '' : 's'}`} />
            <Card className="p-6">
              <h2 className="font-bold">Qué incluyen los reintegros</h2>
              <dl className="mt-4 grid grid-cols-3 gap-3">
                {[['Con viático', stats.con_viatico], ['Con desayuno', stats.con_desayuno], ['Con comprobantes', stats.con_comprobantes]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-fog p-3">
                    <dt className="text-[12.5px] text-slate">{l}</dt>
                    <dd className="mt-1 text-xl font-bold tabular-nums">{num(v)}</dd>
                    <dd className="text-[12px] text-slate">{stats.cantidad ? Math.round((v / stats.cantidad) * 100) : 0}% de los recibos</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[13px] text-slate">Gastos respaldados con tickets adjuntos: <b className="text-ink tabular-nums">{money(stats.gastos_adjuntos, { decimals: 0 })}</b></p>
              <h3 className="mt-6 text-[14px] font-bold">Visitas con más reintegros</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(stats.por_visita || []).map((v) => (
                  <span key={v.nombre} className="rounded-lg border border-mist px-2.5 py-1 font-mono text-[13px]">
                    <b>{v.nombre}</b> <span className="text-slate">· {v.cantidad}</span>
                  </span>
                ))}
                {!stats.por_visita?.length && <span className="text-sm text-slate">Sin datos.</span>}
              </div>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
            <Card className="p-6">
              <h2 className="font-bold">Pacientes con más reintegros</h2>
              <table className="mt-4 w-full text-[14px]">
                <thead><tr className="text-left text-[12.5px] text-slate"><th className="pb-2 font-medium">Paciente</th><th className="pb-2 font-medium">Estudio</th><th className="pb-2 font-medium">Última visita</th><th className="pb-2 text-right font-medium">Recibos</th><th className="pb-2 text-right font-medium">Total</th></tr></thead>
                <tbody className="divide-y divide-mist">
                  {(stats.por_paciente || []).map((r) => (
                    <tr key={r.estudio + r.nombre}>
                      <td className="py-2.5 pr-3 font-mono font-semibold">{r.nombre}</td>
                      <td className="py-2.5 pr-3 font-mono text-[13px] text-slate">{r.estudio}</td>
                      <td className="py-2.5 pr-3 font-mono text-[13px]">{r.ultima_visita || '—'}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate">{r.cantidad}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{money(r.total, { decimals: 0 })}</td>
                    </tr>
                  ))}
                  {!stats.por_paciente?.length && <tr><td colSpan={5} className="py-6 text-center text-slate">Sin datos en el período.</td></tr>}
                </tbody>
              </table>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-2"><Clock className="size-4 text-slate" /><h2 className="font-bold">Horario de mayor movimiento</h2></div>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hours} margin={{ left: -24, right: 4 }}>
                    <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#62666D' }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#62666D' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#EDF2F7' }} formatter={(v) => [`${v} recibos`, '']} labelStyle={{ fontWeight: 600 }} />
                    <Bar dataKey="cantidad" radius={[5, 5, 0, 0]}>
                      {hours.map((h, i) => <Cell key={i} fill={h.cantidad === Math.max(...hours.map((x) => x.cantidad)) && h.cantidad > 0 ? SALINE : '#0065B3'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <h3 className="mt-6 text-[14px] font-bold">Carga por persona</h3>
              <ul className="mt-2 divide-y divide-mist text-[14px]">
                {(stats.por_operador || []).map((o) => (
                  <li key={o.nombre} className="flex justify-between py-2"><span>{o.nombre}</span><span className="tabular-nums text-slate">{o.cantidad} · {money(o.total, { decimals: 0 })}</span></li>
                ))}
                {!stats.por_operador?.length && <li className="py-3 text-slate">Sin datos.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Trend({ now, before }) {
  if (before === undefined || before === null) return null;
  const n = Number(now), b = Number(before);
  if (!b) return <p className="mt-3 text-sm text-slate">Sin datos del período anterior para comparar.</p>;
  const pct = ((n - b) / b) * 100;
  const Icon = Math.abs(pct) < 1 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <p className={cx('mt-3 inline-flex items-center gap-1.5 text-sm font-semibold', pct > 1 ? 'text-saline-dark' : pct < -1 ? 'text-lesion' : 'text-slate')}>
      <Icon className="size-4" />
      {Math.abs(pct).toLocaleString('es-AR', { maximumFractionDigits: 1 })}% {pct >= 0 ? 'más' : 'menos'} que el período anterior ({money(b, { decimals: 0 })})
    </p>
  );
}

function Stat({ label, value, link }) {
  const inner = (
    <>
      <dt className="text-[12.5px] text-slate">{label}</dt>
      <dd className="mt-1 text-[17px] font-bold tabular-nums sm:text-xl">{value}</dd>
    </>
  );
  const cls = 'block border-r border-mist px-4 py-4 last:border-r-0 sm:px-6 lg:border-b lg:border-r-0 lg:py-5 lg:last:border-b-0';
  return link ? <Link to={link} className={cx(cls, 'hover:bg-fog')}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function Breakdown({ title, rows = [], total, mono, extra }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.total)));
  return (
    <Card className="p-6">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-4 space-y-3.5">
        {rows.slice(0, 8).map((r, i) => {
          const share = total ? (Number(r.total) / Number(total)) * 100 : 0;
          return (
            <li key={r.nombre}>
              <div className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className={cx('truncate font-medium', mono && 'font-mono')}>{r.nombre}</span>
                <span className="shrink-0 tabular-nums"><b>{money(r.total, { decimals: 0 })}</b> <span className="text-slate">· {share.toLocaleString('es-AR', { maximumFractionDigits: 0 })}%</span></span>
              </div>
              {extra && <p className="text-[12px] text-slate">{extra(r)}</p>}
              <div className="mt-1.5 h-2 rounded-full bg-fog">
                <div className="h-2 rounded-full" style={{ width: `${(Number(r.total) / max) * 100}%`, background: SHADES[Math.min(i, SHADES.length - 1)] }} />
              </div>
            </li>
          );
        })}
        {!rows.length && <li className="py-6 text-center text-sm text-slate">Sin datos en el período.</li>}
      </ul>
    </Card>
  );
}

function DayTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-mist bg-white px-3 py-2 text-[13px] shadow-lg">
      <p className="font-semibold">{dateAR(p.dia)}</p>
      <p className="tabular-nums">{money(p.total)} · {p.cantidad} recibos</p>
    </div>
  );
}
