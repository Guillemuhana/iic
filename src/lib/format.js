const TZ = 'America/Argentina/Cordoba';

export const money = (n, opts = {}) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: opts.decimals ?? 2, maximumFractionDigits: opts.decimals ?? 2,
  }).format(Number(n) || 0);

export const moneyShort = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })} mil`;
  return money(v, { decimals: 0 });
};

export const num = (n) => new Intl.NumberFormat('es-AR').format(Number(n) || 0);

export const dateAR = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const dateTimeAR = (ts) =>
  ts ? new Intl.DateTimeFormat('es-AR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(ts)) : '—';

export const timeAR = (ts) =>
  ts ? new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts)) : '';

/** aaaa-mm-dd en hora de Córdoba */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const addDays = (iso, days) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const startOfMonth = (iso) => iso.slice(0, 8) + '01';

export const dayShort = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '');
};

export const comprobanteLabel = (t) =>
  [t.tipo_comprobante, t.punto_venta && t.numero ? `${t.punto_venta}-${t.numero}` : t.numero].filter(Boolean).join(' · ') || 'Sin número';

/** "Jueves 8 de octubre" */
export const longDayAR = (iso) => {
  const d = new Date((iso || todayISO()) + 'T12:00:00Z');
  const s = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Hora actual en Córdoba (0–23) */
export const hourCordoba = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

export const SEND_HOUR = 20;
