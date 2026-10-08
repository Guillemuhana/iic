import { useEffect, useState } from 'react';
import { Pencil, Ban, Save, ExternalLink, FileText } from 'lucide-react';
import { Modal, Button, StatusBadge, Field, useToast, IS_DEMO } from './ui';
import ThermalTicket from './ThermalTicket';
import TicketForm from './TicketForm';
import { supabase } from '../lib/supabase';
import { signedImageUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { dateTimeAR, money } from '../lib/format';

const EDITABLE = [
  'estudio', 'visita', 'paciente_iniciales', 'paciente_numero', 'fecha_comprobante', 'monto_detalle', 'total',
  'adjunta_comprobantes', 'recibe_viatico', 'desayuno', 'comprobantes_adjuntos', 'medio_pago', 'nro_operacion', 'notas',
];

export const ticketTitle = (t) =>
  [t.estudio, t.visita, [t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Recibo de viáticos';

export default function TicketDetail({ ticket, onClose, onChanged }) {
  const { profile, isAdmin } = useAuth();
  const toast = useToast();
  const [urls, setUrls] = useState([]);
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    setEditing(false); setVoiding(false); setMotivo(''); setShowText(false); setUrls([]); setIdx(0);
    const paths = ticket?.image_paths?.length ? ticket.image_paths : ticket?.image_path ? [ticket.image_path] : [];
    Promise.all(paths.map((p) => signedImageUrl(p))).then((u) => setUrls(u.filter(Boolean)));
    setDraft(ticket ? { ...ticket } : null);
  }, [ticket]);

  if (!ticket) return null;
  const canEdit = isAdmin || (ticket.created_by === profile?.id && ticket.status === 'cargado');

  const save = async () => {
    if (draft.total === null || draft.total === undefined || Number.isNaN(Number(draft.total))) { toast('Completá el total.', 'error'); return; }
    setBusy(true);
    const patch = Object.fromEntries(EDITABLE.map((k) => [k, draft[k] === '' ? null : draft[k]]));
    const { error } = await supabase.from('tickets').update(patch).eq('id', ticket.id);
    setBusy(false);
    if (error) return toast(error.code === '23505' ? 'Ya existe otro comprobante con ese número.' : error.message, 'error');
    toast('Cambios guardados.');
    onChanged?.();
  };

  const anular = async () => {
    if (motivo.trim().length < 3) return toast('Escribí el motivo de la anulación.', 'error');
    setBusy(true);
    const { error } = await supabase.from('tickets').update({ status: 'anulado', anulado_motivo: motivo.trim() }).eq('id', ticket.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast('Comprobante anulado.');
    onChanged?.();
  };

  const footer = editing ? (
    <>
      <Button variant="ghost" onClick={() => { setEditing(false); setDraft({ ...ticket }); }}>Descartar cambios</Button>
      <Button icon={Save} loading={busy} onClick={save}>Guardar cambios</Button>
    </>
  ) : voiding ? (
    <>
      <Button variant="ghost" onClick={() => setVoiding(false)}>Volver</Button>
      <Button variant="danger" icon={Ban} loading={busy} onClick={anular}>Anular comprobante</Button>
    </>
  ) : canEdit && ticket.status !== 'anulado' ? (
    <>
      <Button variant="ghost" icon={Ban} onClick={() => setVoiding(true)} className="text-lesion hover:bg-lesion-soft">Anular</Button>
      <Button icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>
    </>
  ) : null;

  return (
    <Modal open={!!ticket} onClose={onClose} wide title={ticketTitle(ticket)} footer={footer}>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-slate">
        <StatusBadge status={ticket.status} />
        <span>Cargado {dateTimeAR(ticket.created_at)}{ticket.profiles?.full_name ? ` por ${ticket.profiles.full_name}` : ''}</span>
        {ticket.sent_at && <span>· Enviado {dateTimeAR(ticket.sent_at)}</span>}
        {ticket.confidence != null && <span>· Lectura {Math.round(ticket.confidence * 100)}%</span>}
      </div>
      {ticket.status === 'anulado' && ticket.anulado_motivo && (
        <p className="mb-5 rounded-xl bg-lesion-soft px-4 py-3 text-sm text-lesion">Motivo de anulación: {ticket.anulado_motivo}</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          {urls.length > 1 && (
            <div className="flex gap-2">
              {urls.map((u, i) => (
                <button key={u} onClick={() => setIdx(i)} className={`overflow-hidden rounded-lg border-2 ${i === idx ? 'border-petrol' : 'border-transparent'}`}>
                  <img src={u} alt={`Foto ${i + 1}`} className="h-14 w-12 object-cover" />
                </button>
              ))}
            </div>
          )}
          {urls[idx] ? (
            <a href={urls[idx]} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-2xl border border-mist bg-fog">
              <img src={urls[idx]} alt="Foto del comprobante con datos personales tapados" className="max-h-[60vh] w-full object-contain" />
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100">
                <ExternalLink className="size-3.5" /> Abrir original
              </span>
            </a>
          ) : (
            <div className="grid h-64 place-items-center rounded-2xl border border-mist bg-fog px-8 text-center text-sm text-slate">{ticket.image_path ? 'Cargando foto…' : IS_DEMO ? 'Registro de ejemplo sin foto. Escaneá un recibo para ver cómo se guardan las fotos con los datos tapados.' : 'Sin foto'}</div>
          )}
          {ticket.datos_ocultos > 0 && <p className="text-[12.5px] text-slate">Fotos guardadas con {ticket.datos_ocultos} dato{ticket.datos_ocultos === 1 ? '' : 's'} personal{ticket.datos_ocultos === 1 ? '' : 'es'} tapado{ticket.datos_ocultos === 1 ? '' : 's'}.</p>}
          {ticket.raw_text && (
            <button onClick={() => setShowText(!showText)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-petrol-3">
              <FileText className="size-4" /> {showText ? 'Ocultar texto leído' : 'Ver texto leído (datos personales ocultos)'}
            </button>
          )}
          {showText && <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-fog p-3 font-mono text-[12px] text-ink">{ticket.raw_text}</pre>}
        </div>
        <div className="min-w-0">
          {editing ? (
            <TicketForm value={draft} onChange={setDraft} compact />
          ) : voiding ? (
            <div className="space-y-4">
              <p className="text-[15px]">Vas a anular el reintegro de <b>{money(ticket.total)}</b>. No se borra: queda registrado como anulado y no se incluye en los envíos ni en las estadísticas.</p>
              <Field label="Motivo">
                <textarea className="field min-h-24" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. cargado dos veces, error de importe" />
              </Field>
            </div>
          ) : (
            <>
              <ThermalTicket t={ticket} edge="#ffffff" className="mx-auto max-w-sm" />
              {ticket.notas && <p className="mx-auto mt-4 max-w-sm rounded-xl bg-fog px-4 py-3 text-sm">{ticket.notas}</p>}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
