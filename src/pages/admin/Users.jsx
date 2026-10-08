import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { UserPlus, KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Card, Spinner, Badge, Modal, Field, useToast } from '../../components/ui';
import { PageHead } from './AdminLayout';
import { useAuth } from '../../context/AuthContext';
import { dateAR } from '../../lib/format';

const ROLES = { admin: 'Administrador (panel completo)', administracion: 'Administración (escanear tickets)' };

export default function Users() {
  const toast = useToast();
  const { profile } = useAuth();
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(null);
  const [pwd, setPwd] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api('users', { method: 'GET' }); setUsers(r.users); }
    catch (e) { toast(e.message, 'error'); setUsers([]); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api('users', { body: form });
      toast(`Usuario creado. Ya puede entrar con ${form.email}.`);
      setForm(null); load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const patch = async (body, msg) => {
    try { await api('users', { method: 'PATCH', body }); toast(msg); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const genPass = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join('');
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/panel/configuracion" className="mb-4 inline-flex text-sm font-semibold text-petrol-3 hover:underline">← Volver a Configuración</Link>
      <PageHead title="Usuarios" text="Quiénes pueden entrar al sistema y qué pueden hacer."
        actions={<Button icon={UserPlus} onClick={() => setForm({ full_name: '', email: '', password: genPass(), role: 'administracion' })}>Nuevo usuario</Button>} />

      <Card className="overflow-hidden">
        {users === null ? <div className="grid place-items-center py-16"><Spinner /></div> : (
          <ul className="divide-y divide-mist">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="grid size-10 place-items-center rounded-full bg-fog font-bold text-petrol">{(u.full_name || u.email).slice(0, 1).toUpperCase()}</div>
                <div className="min-w-48 flex-1">
                  <p className="font-semibold">{u.full_name || '—'} {u.id === profile.id && <span className="text-sm font-normal text-slate">(vos)</span>}</p>
                  <p className="text-[13px] text-slate">{u.email} · alta {dateAR(u.created_at?.slice(0, 10))}</p>
                </div>
                <select className="field !w-auto !py-2 text-[13px]" value={u.role} disabled={u.id === profile.id}
                  onChange={(e) => patch({ id: u.id, role: e.target.value }, 'Rol actualizado.')} aria-label="Rol">
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {u.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="error">Desactivado</Badge>}
                <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setPwd({ id: u.id, name: u.full_name || u.email, password: genPass() })}>Clave</Button>
                {u.id !== profile.id && (
                  <Button variant="outline" size="sm" onClick={() => patch({ id: u.id, active: !u.active }, u.active ? 'Usuario desactivado.' : 'Usuario activado.')}>
                    {u.active ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="Nuevo usuario"
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button icon={UserPlus} loading={busy} onClick={create}>Crear usuario</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Nombre y apellido"><input className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoFocus /></Field>
            <Field label="Email"><input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Contraseña inicial" hint="Copiala y pasásela a la persona. Mínimo 8 caracteres.">
              <input className="field font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Rol">
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!pwd} onClose={() => setPwd(null)} title="Cambiar contraseña"
        footer={<><Button variant="ghost" onClick={() => setPwd(null)}>Cancelar</Button>
          <Button onClick={async () => { await patch({ id: pwd.id, password: pwd.password }, 'Contraseña actualizada.'); setPwd(null); }}>Guardar contraseña</Button></>}>
        {pwd && (
          <Field label={`Nueva contraseña para ${pwd.name}`} hint="Copiala antes de guardar.">
            <input className="field font-mono" value={pwd.password} onChange={(e) => setPwd({ ...pwd, password: e.target.value })} />
          </Field>
        )}
      </Modal>
    </div>
  );
}
