import { handler, requireUser, supabaseAdmin, HttpError } from './_lib/supabase.js';

// Gestión de usuarios (solo admin)
// GET                         -> lista
// POST  { email, password, full_name, role }          -> crea
// PATCH { id, full_name?, role?, active?, password? } -> edita
export default handler(['GET', 'POST', 'PATCH'], async (req) => {
  const me = await requireUser(req, ['admin']);
  const sb = supabaseAdmin();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const roles = ['admin', 'administracion'];

  if (req.method === 'GET') {
    const { data, error } = await sb.from('profiles').select('*').order('created_at');
    if (error) throw new HttpError(500, error.message);
    return { users: data };
  }

  if (req.method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const full_name = String(body.full_name || '').trim();
    const role = roles.includes(body.role) ? body.role : 'administracion';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Email inválido.');
    if (String(body.password || '').length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    if (error) throw new HttpError(400, error.message.includes('already') ? 'Ya existe un usuario con ese email.' : error.message);
    // el trigger crea el perfil; lo aseguramos por si el trigger no estaba
    await sb.from('profiles').upsert({ id: data.user.id, email, full_name: full_name || email.split('@')[0], role });
    return { user: { id: data.user.id, email, full_name, role, active: true } };
  }

  // PATCH
  const id = body.id;
  if (!id) throw new HttpError(400, 'Falta el id del usuario.');
  if (id === me.id && (body.active === false || (body.role && body.role !== 'admin'))) {
    throw new HttpError(400, 'No podés quitarte el rol de admin ni desactivar tu propio usuario.');
  }
  const patch = {};
  if (typeof body.full_name === 'string') patch.full_name = body.full_name.trim();
  if (roles.includes(body.role)) patch.role = body.role;
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (Object.keys(patch).length) {
    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    if (error) throw new HttpError(500, error.message);
  }
  if (body.password) {
    if (String(body.password).length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
    const { error } = await sb.auth.admin.updateUserById(id, { password: body.password });
    if (error) throw new HttpError(400, error.message);
  }
  if (typeof body.active === 'boolean') {
    // bloquea / desbloquea el login
    await sb.auth.admin.updateUserById(id, { ban_duration: body.active ? 'none' : '876000h' });
  }
  return { ok: true };
});
