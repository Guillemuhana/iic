export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function scheduleConfig(cfg = {}) {
  return { ...cfg, activo: cfg.activo !== false, dia: Number(cfg.dia ?? 5), hora: cfg.hora || '12:00', fecha_inicio: cfg.fecha_inicio || '' };
}
export function scheduleError(cfg) {
  const c = scheduleConfig(cfg);
  if (!Number.isInteger(c.dia) || c.dia < 0 || c.dia > 6) return 'Elegí un día de la semana válido.';
  if (!/^(?:[01]\d|2[0-3]):00$/.test(c.hora)) return 'Elegí una hora en punto.';
  if (c.fecha_inicio && (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha_inicio) || !Number.isFinite(new Date(c.fecha_inicio + 'T12:00:00Z').getTime()) || new Date(c.fecha_inicio + 'T12:00:00Z').toISOString().slice(0,10) !== c.fecha_inicio)) return 'La fecha de inicio no es válida.';
  return null;
}
export function weeklyWindow(now = new Date(), cfg = {}) {
  const c = scheduleConfig(cfg);
  if (scheduleError(c)) throw new Error(scheduleError(c));
  const local = new Date(now.getTime() - 3 * 3600000);
  const cutoff = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(c.hora.slice(0, 2)) + 3));
  cutoff.setUTCDate(cutoff.getUTCDate() - (local.getUTCDay() - c.dia + 7) % 7);
  if (cutoff > now) cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const start = new Date(cutoff.getTime() - 7 * 86400000);
  const localDate = d => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0,10);
  return { start: start.toISOString(), end: cutoff.toISOString(), from: localDate(start), to: localDate(cutoff) };
}
export function scheduledNow(now = new Date(), cfg = {}) {
  const c = scheduleConfig(cfg);
  if (!c.activo || scheduleError(c)) return false;
  const w = weeklyWindow(now, c);
  return (!c.fecha_inicio || w.to >= c.fecha_inicio) && now.getTime() - new Date(w.end).getTime() < 3600000;
}
export function nextWeeklySend(now = new Date(), cfg = {}) {
  const c = scheduleConfig(cfg);
  if (scheduleError(c)) return 'Revisar configuración';
  let next = new Date(new Date(weeklyWindow(now, c).end).getTime() + 7 * 86400000);
  while (c.fecha_inicio && new Date(next.getTime() - 3 * 3600000).toISOString().slice(0,10) < c.fecha_inicio) next = new Date(next.getTime() + 7 * 86400000);
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', weekday: 'long', day: 'numeric', month: 'long' }).format(next) + ' a las ' + c.hora;
}
