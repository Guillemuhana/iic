import { createClient } from '@supabase/supabase-js';

let admin;

/** Cliente con service role. SOLO en el servidor (funciones de /api). */
export function supabaseAdmin() {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Valida el JWT del usuario (header Authorization: Bearer ...) y devuelve su perfil.
 * @param {string[]} roles roles permitidos
 */
export async function requireUser(req, roles = ['admin', 'administracion']) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Sesión no encontrada. Volvé a iniciar sesión.');
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'La sesión venció. Volvé a iniciar sesión.');
  const { data: profile, error: pErr } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
  if (pErr || !profile) throw new HttpError(403, 'Tu usuario no tiene perfil asignado.');
  if (!profile.active) throw new HttpError(403, 'Tu usuario está desactivado.');
  if (!roles.includes(profile.role)) throw new HttpError(403, 'No tenés permisos para esta acción.');
  return profile;
}

/** Envuelve un handler con manejo de errores y método permitido. */
export function handler(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: 'Método no permitido' });
    }
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.status(200).json(result ?? { ok: true });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      if (!res.headersSent) res.status(status).json({ error: err.message || 'Error inesperado' });
    }
  };
}

export async function getSetting(key) {
  const { data } = await supabaseAdmin().from('settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}
