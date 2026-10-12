import { handler, requireUser, limitUser, supabaseAdmin, HttpError } from './_lib/supabase.js';
import { passwordError, UUID_RE } from './_lib/security.js';

// Gestión de usuarios (solo admin)
// GET                         -> lista
// POST  { email, password, full_name, role }          -> crea
// PATCH { id, full_name?, role?, active?, password? } -> edita
export default handler(['GET', 'POST', 'PATCH'], async (req) => {
  const me = await requireUser(req, ['admin']);
  if (req.method !== 'GET') limitUser(me, 'users', 20);
  const sb = supabaseAdmin();
  // Las altas y cambios de usuarios quedan en la auditoría (nunca la contraseña).
  const audit = (action, detail) => sb.from('audit_log').insert({ user_id: me.id, action, detail })
    .then(({ error }) => { if (error) console.error('audit_log', error.message); });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const roles = ['admin', 'administracion'];

  if (req.method === 'GET') {
    const { data, error } = await sb.from('profiles').select('*').order('created_at');
    if (error) throw new HttpError(500, error.message);
    return { users: data };
  }

  if (req.method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const full_name = String(body.full_name || '').trim().slice(0, 120);
    const role = roles.includes(body.role) ? body.role : 'administracion';
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Email inválido.');
    const pwError = passwordError(body.password);
    if (pwError) throw new HttpError(400, pwError);
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata: { role },
    });
    if (error) throw new HttpError(400, error.message.includes('already') ? 'Ya existe un usuario con ese email.' : error.message);
    // el trigger crea el perfil; lo aseguramos por si el trigger no estaba
    const { error: profileError } = await sb.from('profiles').upsert({ id: data.user.id, email, full_name: full_name || email.split('@')[0], role, active: true });
    if (profileError) throw new HttpError(500, profileError.message);
    await audit('usuario_creado', { id: data.user.id, email, role });
    return { user: { id: data.user.id, email, full_name, role, active: true } };
  }

  // PATCH
  const id = body.id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpError(400, 'Falta el id del usuario.');
  if (id === me.id && (body.active === false || (body.role && body.role !== 'admin'))) {
    throw new HttpError(400, 'No podés quitarte el rol de admin ni desactivar tu propio usuario.');
  }
  // Validar antes de escribir: un error no debe dejar el cambio aplicado a medias.
  if (body.password) {
    const pwError = passwordError(body.password);
    if (pwError) throw new HttpError(400, pwError);
  }
  const patch = {};
  if (typeof body.full_name === 'string') patch.full_name = body.full_name.trim().slice(0, 120);
  if (roles.includes(body.role)) patch.role = body.role;
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (roles.includes(body.role)) {
    const { error } = await sb.auth.admin.updateUserById(id, { app_metadata: { role: body.role } });
    if (error) throw new HttpError(500, error.message);
  }
  if (Object.keys(patch).length) {
    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    if (error) throw new HttpError(500, error.message);
  }
  if (body.password) {
    const { error } = await sb.auth.admin.updateUserById(id, { password: body.password });
    if (error) throw new HttpError(400, error.message);
  }
  if (typeof body.active === 'boolean') {
    // bloquea / desbloquea el login
    const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: body.active ? 'none' : '876000h' });
    if (error) throw new HttpError(500, error.message);
  }
  await audit('usuario_editado', { id, ...patch, ...(body.password ? { password_cambiada: true } : {}) });
  return { ok: true };
});
