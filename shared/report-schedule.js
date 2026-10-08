// Weekly accounting closes Friday at noon in Argentina (UTC-3).
export function weeklyWindow(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 3600000);
  const cutoff = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 15));
  cutoff.setUTCDate(cutoff.getUTCDate() - (local.getUTCDay() + 2) % 7);
  if (cutoff > now) cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const start = new Date(cutoff.getTime() - 7 * 86400000);
  return { start: start.toISOString(), end: cutoff.toISOString(), from: start.toISOString().slice(0, 10), to: cutoff.toISOString().slice(0, 10) };
}

export function nextWeeklySend(now = new Date()) {
  const { end } = weeklyWindow(now);
  const next = new Date(new Date(end).getTime() + 7 * 86400000);
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', weekday: 'long', day: 'numeric', month: 'long' }).format(next) + ' a las 12:00';
}
