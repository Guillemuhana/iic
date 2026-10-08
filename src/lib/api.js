import { supabase } from './supabase';

/** Llama a una función de /api con el token del usuario logueado. */
export async function api(path, { method = 'POST', body } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Sin conexión. Revisá internet y volvé a intentar.');
  }
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

/** Sube la foto del ticket al bucket privado y devuelve el path. */
const DEMO = import.meta.env.VITE_DEMO === '1';

export async function uploadTicketImage(blob, userId) {
  if (DEMO) {
    const path = `demo/${crypto.randomUUID()}.jpg`;
    window.__demoImages[path] = URL.createObjectURL(blob);
    return path;
  }
  const now = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('tickets').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
  return path;
}

export async function signedImageUrl(path, seconds = 3600) {
  if (!path) return null;
  if (DEMO) return window.__demoImages?.[path] ?? null;
  const { data } = await supabase.storage.from('tickets').createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
