const TZ = 'America/Argentina/Cordoba';
export function instituteClock(now = new Date()) {
 const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(now));
 return {
  greeting: hour >= 6 && hour < 12 ? 'Buen d\u00eda' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches',
  date: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now),
  time: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now),
 };
}
