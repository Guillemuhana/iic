import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Field } from '../../components/ui';
import { PageHead } from './AdminLayout';
import { ESTADOS_ESTUDIO, ordenarEstudios } from '../../../shared/estudios.js';

const blank = { codigo: '', estado: 'activo', activo: true };
export default function Estudios() {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('estudios').select('*');
      if (error) throw error;
      setRows(ordenarEstudios(data || []));
      setError('');
    } catch { setError('No se pudo cargar el catálogo. Verificá la conexión y la migración 007.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function save(e) {
    e.preventDefault();
    const codigo = draft.codigo.trim();
    if (!codigo) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const patch = { codigo, estado: draft.estado, activo: draft.activo };
      const result = draft.id
        ? await supabase.from('estudios').update(patch).eq('id', draft.id).select().single()
        : await supabase.from('estudios').insert(patch).select().single();
      if (result.error) throw result.error;
      setDraft(blank);
      setMessage('Estudio guardado. Los comprobantes anteriores conservan su código.');
      await load();
    } catch (err) { setError(err.code === '23505' ? 'Ya existe un estudio con ese código.' : 'No se pudo guardar el estudio.'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-4xl space-y-6">
    <PageHead title="Estudios clínicos" />
    <p className="text-sm text-slate">Pendientes de confirmar con Susana: J3R-MC-YDAO, C64G1002, J2O-MC-EKBG y BI 1378 0041. Podés corregirlos aquí.</p>
    {error && <p role="alert" className="text-lesion">{error} <button type="button" onClick={load}>Reintentar carga</button></p>}
    {message && <p role="status">{message}</p>}
    <Card className="p-6"><form onSubmit={save} className="space-y-4">
      <h2 className="font-bold">{draft.id ? 'Editar estudio' : 'Agregar estudio'}</h2>
      <Field label="Código o nombre"><input className="field" required value={draft.codigo} onChange={e => setDraft({ ...draft, codigo: e.target.value })} /></Field>
      <Field label="Estado"><select className="field" value={draft.estado} onChange={e => setDraft({ ...draft, estado: e.target.value })}>{Object.entries(ESTADOS_ESTUDIO).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <label className="flex gap-2"><input type="checkbox" checked={draft.activo} onChange={e => setDraft({ ...draft, activo: e.target.checked })} />Habilitado para nuevos comprobantes</label>
      <p className="text-sm text-slate">Para desactivar, quitá la marca y guardá. No se eliminan estudios ni comprobantes.</p>
      <div className="flex gap-3"><Button type="submit" loading={busy} disabled={loading}>Guardar</Button>{draft.id && <Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(blank)}>Cancelar</Button>}</div>
    </form></Card>
    <Field label="Buscar estudio"><input className="field" value={search} onChange={e => setSearch(e.target.value)} /></Field>
    {loading ? <p role="status">Cargando estudios...</p> : <Card className="overflow-x-auto p-4"><table className="w-full text-left text-sm"><thead><tr><th>Código</th><th>Estado</th><th>Habilitado</th><th>Acción</th></tr></thead><tbody>
      {rows.filter(r => r.codigo.toLowerCase().includes(search.toLowerCase())).map(row => <tr key={row.id} className="border-t border-mist"><td className="py-3">{row.codigo}</td><td>{ESTADOS_ESTUDIO[row.estado]}</td><td>{row.activo ? 'Sí' : 'No'}</td><td><Button size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft({ ...row }); setMessage(''); }}>Editar</Button></td></tr>)}
      {!rows.length && <tr><td colSpan="4">No hay estudios cargados.</td></tr>}
    </tbody></table></Card>}
  </div>;
}
