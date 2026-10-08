import { savedReimbursementError } from './save-validation.js';
export function loadingDay(value) {
 const d = new Date(value);
 return Number.isFinite(d.getTime()) ? new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10) : null;
}
export function loadingBounds(from, to) {
 if (![from, to].every(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(new Date(v + 'T00:00:00Z').getTime()) && new Date(v + 'T00:00:00Z').toISOString().slice(0,10) === v) || from > to) throw new Error('Invalid date range');
 return { start: new Date(from + 'T00:00:00-03:00').toISOString(), end: new Date(new Date(to + 'T00:00:00-03:00').getTime() + 86400000).toISOString() };
}
export function buildTicketStats(tickets, from, to) {
 const rows = tickets.filter(t => t.status !== 'anulado' && loadingDay(t.created_at) >= from && loadingDay(t.created_at) <= to);
 const cents = t => Math.round((Number(t.total) || 0) * 100);
 const sum = list => list.reduce((a,t) => a + cents(t), 0) / 100;
 const eligible = rows.filter(t => !savedReimbursementError(t));
 const pending = eligible.filter(t => t.status === 'cargado');
 const patientKey = t => [t.estudio, t.paciente_iniciales, t.paciente_numero || t.id].join('|');
 const group = key => {
  const m = new Map();
  for (const t of rows) {const k = key(t);m.set(k, [...(m.get(k) || []),t]);}
  return [...m].map(([nombre,list]) => ({nombre,total:sum(list),cantidad:list.length,pacientes:new Set(list.map(patientKey)).size,estudio:list[0].estudio,ultima_visita:list.sort((a,b)=>b.created_at.localeCompare(a.created_at))[0].visita})).sort((a,b)=>b.total-a.total);
 };
 const days = group(t => loadingDay(t.created_at)).map(x => ({...x,dia:x.nombre}));
 const hours = group(t => new Date(new Date(t.created_at).getTime()-3*3600000).getUTCHours()).map(x => ({...x,hora:x.nombre}));
 return {total:sum(rows),cantidad:rows.length,promedio:rows.length ? sum(rows)/rows.length : 0,pacientes:new Set(rows.map(patientKey)).size,pendientes:pending.length,pendientes_total:sum(pending),revision:rows.length-eligible.length,revision_total:sum(rows.filter(t=>savedReimbursementError(t))),confirmado_total:sum(eligible),con_viatico:rows.filter(t=>t.recibe_viatico).length,con_desayuno:rows.filter(t=>t.desayuno).length,con_comprobantes:rows.filter(t=>t.adjunta_comprobantes).length,gastos_adjuntos:sum(rows.flatMap(t=>(t.comprobantes_adjuntos||[]).map(g=>({total:g.importe})))),por_dia:days,por_hora:hours,por_estudio:group(t=>t.estudio||'Sin estudio'),por_visita:group(t=>t.visita||'Sin visita').slice(0,12),por_paciente:group(t=>[t.estudio,t.paciente_iniciales,t.paciente_numero||''].join('|')).map(x=>({...x,nombre:x.nombre.split('|').slice(1).join(' ').trim()})).slice(0,15),por_operador:group(t=>t.profiles?.full_name||t.profiles?.email||'Administracion')};
}
