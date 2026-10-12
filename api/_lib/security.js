import { timingSafeEqual, createHash } from 'node:crypto';

/** Compara secretos en tiempo constante (evita ataques de temporización). */
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? '')).digest();
  const hb = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(ha, hb);
}

/** true si el request trae `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.authorization || '', `Bearer ${secret}`);
}

// Límite de pedidos por usuario y acción. Vive en la memoria de cada instancia
// de la función: frena abusos (y gasto en Groq) desde una sesión robada o un
// script, aunque no es un límite global exacto entre instancias.
const buckets = new Map();

/** Lanza 429 si `key` superó `max` pedidos en `windowMs`. */
export function rateLimit(key, max, windowMs, HttpError) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    const err = new HttpError(429, 'Demasiados pedidos seguidos. Esperá un minuto y volvé a intentar.');
    err.retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
    throw err;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  }
}

/** Contraseña: mínimo 10 caracteres, con letras y números, hasta 72 (límite de bcrypt). */
export function passwordError(password) {
  const p = String(password || '');
  if (p.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (p.length > 72) return 'La contraseña no puede superar los 72 caracteres.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'La contraseña debe combinar letras y números.';
  return null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
