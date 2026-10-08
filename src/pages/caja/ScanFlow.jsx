import { lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCw, Camera as CameraIcon, ScanText, Check, AlertTriangle, Copy, Sparkles, RefreshCcw, ImagePlus, Trash2, ShieldCheck, Maximize2 } from 'lucide-react';
import Camera from '../../components/Camera';
// Solo en la compilación de demo (en producción esta rama se elimina).
const DemoCamera = import.meta.env.VITE_DEMO === '1' ? lazy(() => import('../../demo/DemoCamera')) : null;
import TicketForm from '../../components/TicketForm';
import ThermalTicket from '../../components/ThermalTicket';
import RedactionEditor from '../../components/RedactionEditor';
import DocumentCropper from '../../components/DocumentCropper';
import { Button, Card, Modal, useToast, cx } from '../../components/ui';
import { prepareTicketImage, rotateBlob, redactAndStraighten } from '../../lib/image';
import { api, uploadTicketImage } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { money, dateAR, todayISO } from '../../lib/format';
import { checkTicket, emptyTicket, mergeDocument } from '../../../shared/ticket-rules.js';

const READING_STEPS = ['Mejorando la imagen', 'Leyendo texto impreso y manuscrito', 'Verificando el importe por separado', 'Ubicando firma y datos personales'];
const DOC_LABEL = { recibo_viatico: 'Recibo de viáticos', comprobante_gasto: 'Ticket de gasto', comprobante_transferencia: 'Transferencia', otro: 'Documento' };

export default function ScanFlow() {
  const nav = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const [stage, setStage] = useState('camera'); // camera | check | reading | review | saved
  const [pending, setPending] = useState(null);  // foto recién sacada, antes de leer
  const [photos, setPhotos] = useState([]);      // fotos ya leídas
  const [current, setCurrent] = useState(0);
  const [ticket, setTicket] = useState(emptyTicket());
  const [meta, setMeta] = useState({ fieldConfidence: {}, duplicate: null, observaciones: [] });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(null);
  const [view, setView] = useState('datos');
  const [askUnredacted, setAskUnredacted] = useState(false);
  const [amountConfirmed, setAmountConfirmed] = useState(false);
  const [largePhoto, setLargePhoto] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [amountPhoto, setAmountPhoto] = useState(null);
  const [amountBusy, setAmountBusy] = useState(false);
  useEffect(() => setAmountConfirmed(false), [ticket.total, ticket.monto_detalle]);
  const timer = useRef();
  const urls = useRef(new Set());

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const track = (prepared) => { urls.current.add(prepared.previewUrl); return prepared; };

  const onCapture = async (source) => {
    setError(null);
    setPending(null);
    setStage('check');
    try {
      const prepared = track(await prepareTicketImage(source));
      setPending(prepared);
      // Let the person check orientation and framing before reading.
    } catch {
      setError('No se pudo procesar la foto. Probá de nuevo.');
    }
  };

  const rotatePending = async () => {
    const blob = await rotateBlob(pending.blob, 90);
    setPending(track(await prepareTicketImage(blob)));
  };

  const read = async (prepared = pending) => {
    setStage('reading');
    setError(null);
    setStep(0);
    clearInterval(timer.current);
    timer.current = setInterval(() => setStep((s) => Math.min(s + 1, READING_STEPS.length - 1)), 1700);
    try {
      const r = await api('scan-ticket', { body: { image: prepared.aiDataUrl, originalImage: prepared.originalDataUrl } });
      const photo = {
        id: crypto.randomUUID(),
        img: prepared,
        tipo: r.doc.tipo,
        rotation: r.doc.rotacion,
        boxes: r.doc.datos_personales.filter((d) => d.box).map((d) => ({ ...d.box, tipo: d.tipo })),
        raw_text: r.raw_text,
        confidence: r.confidence,
        amountReview: r.amountReview,
        model: r.model,
        ms: r.ms,
        doc: { tipo: r.doc.tipo, recibo: r.doc.recibo, gastos: r.doc.gastos, transferencia: r.doc.transferencia },
      };
      setPhotos((list) => { setCurrent(list.length); return [...list, photo]; });
      setTicket((t) => mergeDocument(t, r.doc));
      setMeta((m) => ({
        fieldConfidence: r.doc.recibo ? { ...m.fieldConfidence, ...r.fieldConfidence } : m.fieldConfidence,
        duplicate: m.duplicate || r.duplicate,
        observaciones: r.observaciones ? [...m.observaciones, r.observaciones] : m.observaciones,
        estudioAjustado: m.estudioAjustado || (r.doc.recibo?.estudio_ajustado ? { de: r.doc.recibo.estudio_leido, a: r.doc.recibo.estudio } : null),
      }));
      setPending(null);
      setStage('review');
      setAmountConfirmed(false);
      setView('datos');
    } catch (e) {
      setError(e.message);
      setStage('check');
    } finally {
      clearInterval(timer.current);
    }
  };

  const setBoxes = (i, boxes) => setPhotos((list) => list.map((p, j) => (j === i ? { ...p, boxes } : p)));
  const rereadSelectedAmount = async (blob) => {
    const target = amountPhoto;
    setAmountBusy(true);
    setAmountConfirmed(false);
    try {
      const prepared = track(await prepareTicketImage(blob));
      const field = target.doc.recibo ? 'recibo' : 'transferencia';
      const result = await api('scan-amount', { body: { image: prepared.originalDataUrl, field } });
      setPhotos(list => list.map(p => p.id === target.id ? { ...p, amountPreviewUrl: prepared.previewUrl, amountReview: result.amountReview, doc: { ...p.doc,
        ...(field === 'recibo' ? { recibo: { ...p.doc.recibo, total: result.amount, monto_detalle: result.amount == null ? null : String(result.amount) } }
          : { transferencia: { ...p.doc.transferencia, monto: result.amount } }),
      } } : p));
      setTicket(value => ({ ...value, total: result.amount, monto_detalle: result.amount != null ? String(result.amount) : null }));
      setMeta(value => ({ ...value, fieldConfidence: { ...value.fieldConfidence, total: result.amountReview.confirmed ? .9 : .4 } }));
      setAmountPhoto(null);
      if (result.amount === null) toast('Relectura lista. Compará las cifras con la foto e ingresá el importe correcto.');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setAmountBusy(false); }
  };
  const removePhoto = (i) => {
    setPhotos((list) => list.filter((_, j) => j !== i));
    setCurrent(0);
  };

  const trySave = () => {
    if (!amountConfirmed) { toast('Compará el monto con la foto y confirmalo antes de guardar.', 'error'); return; }
    const blocking = checkTicket(ticket).filter((w) => w.level === 'error');
    if (blocking.length) { toast(blocking[0].message, 'error'); return; }
    if (photos.some((p) => p.boxes.length === 0)) { setAskUnredacted(true); return; }
    save();
  };

  const save = async () => {
    setAskUnredacted(false);
    setSaving(true);
    const uploaded = [];
    try {
      // Solo se suben fotos ya tapadas. La original nunca sale del teléfono hacia el almacenamiento.
      for (const p of photos) {
        const redacted = await redactAndStraighten(p.img.blob, p.boxes, p.rotation);
        uploaded.push(await uploadTicketImage(redacted, profile.id));
      }
      const payload = {
        ...ticket,
        total: Number(ticket.total),
        fecha_comprobante: ticket.fecha_comprobante || todayISO(),
        image_path: uploaded[0] || null,
        image_paths: uploaded,
        datos_ocultos: photos.reduce((a, p) => a + p.boxes.length, 0),
        raw_text: photos.map((p, i) => `— Foto ${i + 1}: ${DOC_LABEL[p.tipo]} —\n${p.raw_text || ''}`).join('\n\n'),
        extraction: {
          fotos: photos.map((p) => ({ tipo: p.tipo, confidence: p.confidence, ms: p.ms, tapas: p.boxes.length, leido: p.doc })),
          fieldConfidence: meta.fieldConfidence,
          importe_revisado: true,
          verificacion_importes: photos.map((p) => p.amountReview).filter(Boolean),
          observaciones: meta.observaciones,
          estudioAjustado: meta.estudioAjustado || null,
        },
        confidence: Math.min(...photos.map((p) => p.confidence ?? 1)),
        model: photos[0]?.model,
      };
      const { data, error: dbErr } = await supabase.from('tickets').insert(payload).select().single();
      if (dbErr) throw new Error(dbErr.code === '23505' ? 'Este comprobante ya fue cargado.' : dbErr.message);
      setSaved(data);
      setStage('saved');
    } catch (e) {
      if (uploaded.length) await supabase.storage.from('tickets').remove(uploaded);
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const restartAll = () => {
    setPhotos([]); setTicket(emptyTicket()); setMeta({ fieldConfidence: {}, duplicate: null, observaciones: [] });
    setSaved(null); setError(null); setPending(null); setCurrent(0);
    setAmountConfirmed(false);
    setStage('camera');
  };

  const back = () => {
    if (stage === 'saved') return nav('/caja');
    if (photos.length && stage !== 'review') { setPending(null); setError(null); return setStage('review'); }
    if (photos.length) return restartAll();
    nav(-1);
  };

  if (stage === 'camera') {
    if (DemoCamera) return <DemoCamera onCapture={onCapture} onClose={() => (photos.length ? setStage('review') : nav(-1))} used={photos.map((p) => p.tipo)} />;
    return <Camera onCapture={onCapture} onClose={() => (photos.length ? setStage('review') : nav(-1))}
      hint={photos.length ? 'Sacale foto al ticket o a la transferencia' : 'Encuadrá el recibo completo'} />;
  }

  const photo = photos[current];
  const warnings = checkTicket(ticket);

  return (
    <div className="min-h-full bg-paper">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-mist bg-white/95 px-4 pb-3 backdrop-blur">
        <button onClick={back} className="grid size-10 place-items-center rounded-xl hover:bg-fog" aria-label="Volver">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="inst-name truncate text-[12px] text-slate">Instituto de Investigaciones Clínicas de Córdoba</p>
          <h1 className="truncate text-[17px] font-bold leading-tight">
            {stage === 'review' ? 'Revisá los datos' : stage === 'saved' ? 'Recibo guardado' : stage === 'reading' ? 'Leyendo la foto' : 'Foto'}
          </h1>
        </div>
      </header>

      {stage === 'check' && (
        <div className="mx-auto max-w-4xl px-4 py-5">
          {pending ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-mist bg-white">
                <img src={pending.previewUrl} alt="Foto" className="max-h-[70vh] w-full object-contain" />
              </div>
              {pending.quality.issues.length > 0 && !error && (
                <Card className="mt-4 border-iodine/40 bg-iodine-soft p-4">
                  <div className="flex gap-3 text-iodine">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold">Conviene repetir la foto</p>
                      <ul className="mt-1 list-disc pl-4">{pending.quality.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                    </div>
                  </div>
                </Card>
              )}
              {error && (
                <Card className="mt-4 border-lesion/30 bg-lesion-soft p-4 text-sm text-lesion">
                  <p className="font-semibold">No se pudo leer la foto</p>
                  <p className="mt-1">{error}</p>
                </Card>
              )}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button variant="outline" size="lg" icon={CameraIcon} onClick={() => setStage('camera')}>Repetir foto</Button>
                <Button variant="outline" size="lg" icon={RotateCw} onClick={rotatePending}>Girar</Button>
                <Button variant="outline" className="col-span-2" onClick={() => setCropping(true)}>Recortar y acercar el documento</Button>
                <Button size="lg" icon={error ? RefreshCcw : ScanText} className="col-span-2" onClick={() => read()}>
                  {error ? 'Reintentar lectura' : 'Escanear esta foto'}
                </Button>
              </div>
            </>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-lesion">{error}</p>
              <Button className="mt-4" onClick={() => setStage('camera')}>Volver a la cámara</Button>
            </div>
          ) : (
            <div className="py-24 text-center text-slate">Preparando la foto…</div>
          )}
        </div>
      )}

      {stage === 'reading' && pending && (
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-5">
          <div className="relative w-full overflow-hidden rounded-2xl border border-mist bg-white">
            <img src={pending.previewUrl} alt="" className="max-h-[65vh] min-h-72 w-full object-contain opacity-90" />
            <div className="absolute inset-0 bg-petrol/10" />
            <span className="scan-line absolute left-0 right-0 h-1 bg-saline shadow-[0_0_18px_4px_rgba(0,101,179,.55)]" />
          </div>
          <ol className="mt-8 w-full space-y-3">
            {READING_STEPS.map((s, i) => (
              <li key={s} className={cx('flex items-center gap-3 text-[15px] transition-colors', i <= step ? 'text-ink' : 'text-slate/50')}>
                <span className={cx('grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold',
                  i < step ? 'bg-saline text-white' : i === step ? 'bg-petrol text-white' : 'bg-fog text-slate')}>
                  {i < step ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}

      {stage === 'review' && (
        <>
          <div className="sticky top-[65px] z-10 grid grid-cols-2 gap-1 border-b border-mist bg-white p-1.5 lg:hidden">
            {[['datos', 'Datos leídos'], ['fotos', `Fotos y tapado (${photos.length})`]].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} className={cx('h-9 rounded-lg text-sm font-semibold', view === v ? 'bg-petrol text-white' : 'text-slate')}>
                {label}
              </button>
            ))}
          </div>
          <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-36 pt-5 lg:grid-cols-[1.1fr_1fr]">
            <aside className="space-y-4">
              <div className="lg:sticky lg:top-24">
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {photos.map((p, i) => (
                    <button key={p.id} onClick={() => setCurrent(i)}
                      className={cx('relative shrink-0 overflow-hidden rounded-xl border-2', i === current ? 'border-petrol' : 'border-transparent')}>
                      <img src={p.img.previewUrl} alt="" className="h-16 w-14 object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-petrol/85 px-1 text-[9px] font-semibold text-white">{DOC_LABEL[p.tipo]}</span>
                    </button>
                  ))}
                  <button onClick={() => setStage('camera')} className="grid h-16 w-14 shrink-0 place-items-center rounded-xl border-2 border-dashed border-mist text-slate hover:border-petrol-3" aria-label="Agregar foto">
                    <ImagePlus className="size-5" />
                  </button>
                </div>
                {photo && (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">{DOC_LABEL[photo.tipo]} · foto {current + 1}</p>
                      {photos.length > 1 && (
                        <button onClick={() => removePhoto(current)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-lesion">
                          <Trash2 className="size-3.5" /> Quitar foto
                        </button>
                      )}
                    </div>
                    <Button variant="outline" icon={Maximize2} className="mb-3 w-full" onClick={() => setLargePhoto(true)}>Ampliar foto para revisar el importe</Button>
                    <RedactionEditor src={photo.img.previewUrl} boxes={photo.boxes} onChange={(b) => setBoxes(current, b)} />
                    <p className="mt-3 text-[12.5px] text-slate">Se guarda solo la foto con estos datos tapados. Lo tapado no se puede recuperar.</p>
                  </>
                )}
              </div>
            </aside>

            <div className={cx('min-w-0 space-y-5 lg:block', view === 'datos' ? 'block' : 'hidden')}>
              <ReadSummary photos={photos} warnings={warnings} meta={meta} onPhotos={() => setView('fotos')} />
              {meta.duplicate && (
                <Card className="flex gap-3 border-lesion/30 bg-lesion-soft p-4 text-sm text-lesion">
                  <Copy className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Ya hay un reintegro de este paciente para esta visita</p>
                    <p>Cargado el {dateAR(meta.duplicate.created_at?.slice(0, 10))} por {money(meta.duplicate.total)}.</p>
                  </div>
                </Card>
              )}
              <Card className="p-4 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-wide text-slate">Importe a confirmar</p>
                <p className="mt-2 text-4xl font-extrabold tabular-nums text-petrol">{ticket.total != null ? money(ticket.total) : 'Sin importe legible'}</p>
                {photos.filter((p) => p.amountReview).map((p) => (
                  <div key={p.id} className={cx('mt-3 rounded-xl p-3 text-sm', p.amountReview.confirmed ? 'bg-fog text-slate' : 'bg-iodine-soft text-iodine')}>
                    <p>{p.amountReview.message}</p>
                    {p.amountPreviewUrl && <img src={p.amountPreviewUrl} alt="Línea del importe ampliada para comparar cada cifra" className="mt-3 max-h-64 w-full rounded-lg border border-mist bg-white object-contain" />}
                    <p className="mt-1">Lectura inicial: {p.amountReview.extracted != null ? money(p.amountReview.extracted) : 'ilegible'} · Segunda lectura: {p.amountReview.checked != null ? money(p.amountReview.checked) : 'sin confirmar'}</p>
                    {(p.doc.recibo || p.doc.transferencia) && <Button variant="outline" className="mt-3 w-full" icon={ScanText} onClick={() => setAmountPhoto(p)}>Seleccionar el importe y volver a leer</Button>}
                  </div>
                ))}
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-mist p-4 text-sm font-semibold">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#0065B3]" checked={amountConfirmed} onChange={(e) => setAmountConfirmed(e.target.checked)} />
                  Comparé el importe con la foto y confirmo que es correcto.
                </label>
              </Card>
              <Card className="p-4 sm:p-6">
                <TicketForm value={ticket} onChange={setTicket} fieldConfidence={meta.fieldConfidence} compact />
              </Card>
              <button onClick={() => setStage('camera')}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-mist bg-white px-4 py-4 text-left hover:border-petrol-3">
                <ImagePlus className="size-6 text-petrol-3" />
                <span>
                  <span className="block font-semibold">Agregar foto</span>
                  <span className="block text-[13px] text-slate">Tickets de gastos adjuntos o el comprobante de transferencia.</span>
                </span>
              </button>
            </div>
          </div>
          <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-mist bg-white/95 px-4 pt-3 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-slate">{[ticket.estudio, ticket.visita, [ticket.paciente_iniciales, ticket.paciente_numero].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Total a guardar'}</p>
                <p className="truncate text-xl font-extrabold tabular-nums">{ticket.total != null ? money(ticket.total) : '—'}</p>
              </div>
              <Button variant="outline" onClick={() => { setView('datos'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Revisar</Button>
              <Button size="lg" icon={Check} loading={saving} disabled={!amountConfirmed} onClick={trySave}>Guardar</Button>
            </div>
          </div>
        </>
      )}

      {stage === 'saved' && saved && (
        <div className="mx-auto max-w-sm px-5 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-saline text-white"><Check strokeWidth={3} /></span>
            <div>
              <p className="font-bold">Listo, quedó guardado</p>
              <p className="text-sm text-slate">{saved.datos_ocultos} dato{saved.datos_ocultos === 1 ? '' : 's'} personal{saved.datos_ocultos === 1 ? '' : 'es'} tapado{saved.datos_ocultos === 1 ? '' : 's'}. Se incluye en el reporte semanal del viernes a las 12:00.</p>
            </div>
          </div>
          <ThermalTicket t={saved} printing />
          <div className="mt-8 grid gap-3">
            <Button size="xl" icon={CameraIcon} onClick={restartAll}>Escanear otro recibo</Button>
            <Button variant="ghost" size="lg" onClick={() => nav('/caja')}>Volver al inicio</Button>
          </div>
        </div>
      )}

      <Modal open={cropping} wide onClose={() => setCropping(false)} title="Encuadrar el documento">
        {pending && <DocumentCropper src={pending.previewUrl} onApply={async (blob) => {
          setPending(track(await prepareTicketImage(blob)));
          setCropping(false);
        }} />}
      </Modal>
      <Modal open={largePhoto} wide onClose={() => setLargePhoto(false)} title="Foto escaneada · revisión del importe">
        {photo && <img src={photo.img.previewUrl} alt="Foto original para comparar el importe antes de guardar" className="max-h-[75vh] w-full object-contain" />}
        <p className="mt-3 text-sm text-slate">Importe a guardar: <b>{ticket.total != null ? money(ticket.total) : 'Sin importe'}</b>. La foto original solo se muestra para revisión; se guarda la versión tapada.</p>
      </Modal>
      <Modal open={Boolean(amountPhoto)} wide onClose={() => { if (!amountBusy) setAmountPhoto(null); }} title="Releer únicamente el importe">
        {amountPhoto && <DocumentCropper src={amountPhoto.img.previewUrl} amount onApply={rereadSelectedAmount} />}
        {amountBusy && <p role="status" className="mt-3 text-sm text-slate">Comparando dos lecturas del recorte…</p>}
      </Modal>
      <Modal open={askUnredacted} onClose={() => setAskUnredacted(false)} title="Hay fotos sin datos tapados"
        footer={<>
          <Button variant="ghost" onClick={() => { setAskUnredacted(false); setView('fotos'); setCurrent(Math.max(0, photos.findIndex((p) => !p.boxes.length))); }}>Revisar fotos</Button>
          <Button onClick={save} loading={saving}>Guardar igual</Button>
        </>}>
        <p className="text-[15px]">En {photos.filter((p) => !p.boxes.length).length === 1 ? 'una foto' : 'algunas fotos'} no se tapó ningún dato. Si se ve la firma, el nombre, el CUIT o la cuenta del paciente, tapalo antes de guardar.</p>
      </Modal>
    </div>
  );
}

function ReadSummary({ photos, warnings, meta, onPhotos }) {
  const pct = Math.round(Math.min(...photos.map((p) => p.confidence ?? 1)) * 100);
  const tapas = photos.reduce((a, p) => a + p.boxes.length, 0);
  const good = pct >= 85 && warnings.length === 0 && photos.every((p) => !p.amountReview || p.amountReview.confirmed);
  return (
    <div className="space-y-3">
      <div className={cx('flex items-start gap-3 rounded-2xl p-4', good ? 'bg-saline/12 text-saline-dark' : 'bg-iodine-soft text-iodine')}>
        {good ? <Sparkles className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
        <div className="text-sm">
          <p className="font-semibold">
            {good ? 'Datos extraídos. Compará el importe y las fotos antes de guardar.' : 'Revisá el importe y los campos marcados antes de guardar.'}
          </p>
          {!good && <p className="mt-0.5 opacity-90">Compará los campos marcados con la foto.</p>}
          {meta.estudioAjustado && (
            <p className="mt-1 opacity-90">Se leyó “{meta.estudioAjustado.de}” y se ajustó al estudio activo {meta.estudioAjustado.a}.</p>
          )}
          {meta.observaciones.map((o) => <p key={o} className="mt-1 opacity-90">{o}</p>)}
        </div>
      </div>
      <button onClick={onPhotos} className="flex w-full items-center gap-3 rounded-2xl bg-petrol px-4 py-3 text-left text-white lg:pointer-events-none">
        <ShieldCheck className="size-5 shrink-0 text-saline" />
        <span className="text-sm">
          <b>{tapas} dato{tapas === 1 ? '' : 's'} personal{tapas === 1 ? '' : 'es'} tapado{tapas === 1 ? '' : 's'}</b> en {photos.length} foto{photos.length === 1 ? '' : 's'} (firma, nombre, CUIT, cuenta). <span className="underline lg:no-underline">Revisar</span>
        </span>
      </button>
    </div>
  );
}
