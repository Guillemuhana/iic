import { handler, requireUser, limitUser, HttpError, supabaseAdmin, getSetting } from './_lib/supabase.js';
import { readTicket } from './_lib/groq.js';
import { normalizeDocument, maskPersonalText } from '../shared/ticket-rules.js';
import { isTestDocument } from '../shared/save-validation.js';

export const config = { maxDuration: 60 };

// POST { image: "data:image/jpeg;base64,..." }
// Lee UNA foto (recibo, ticket de gasto o transferencia) y devuelve los datos
// y las zonas con datos personales a tapar. La imagen no se guarda acá.
export default handler(['POST'], async (req) => {
  limitUser(await requireUser(req), 'scan', 30);
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const image = body.image;
  if (!image || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    throw new HttpError(400, 'Mandá la foto como imagen JPEG, PNG o WebP.');
  }
  if (image.length > 4_200_000) throw new HttpError(413, 'La foto es demasiado pesada. Volvé a sacarla.');
  const originalImage = body.originalImage || image;
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(originalImage) || (body.originalImage && image.length + originalImage.length > 4_200_000)) {
    throw new HttpError(413, 'Las imágenes son demasiado pesadas o inválidas. Repetí la foto.');
  }

  const [catalogo, instituto] = await Promise.all([supabaseAdmin().from('estudios').select('codigo').eq('activo', true), getSetting('instituto')]);
  if (catalogo.error) throw new HttpError(503, 'No se pudo cargar el catálogo de estudios.');
  const estudios = (catalogo.data || []).map(e => e.codigo);

  const started = Date.now();
  const { data, ocr, model, amountReview } = await readTicket(image, { estudios, originalImage, amountRegion: body.amountRegion });
  if (isTestDocument(ocr)) throw new HttpError(422, 'La foto dice que es una simulación o tiene datos ficticios. No se puede cargar como un reintegro real.');
  const doc = normalizeDocument(data, { estudios });
  // Never prefill a financial total that the independent reading could not verify.
  // Both raw candidates remain in amountReview for the person to compare.
  if (amountReview && !amountReview.confirmed) {
    if (doc.recibo) doc.recibo.total = null;
    if (doc.transferencia) doc.transferencia.monto = null;
  }

  // El texto leído se guarda sin datos personales
  const raw_text = maskPersonalText(ocr, doc.datos_personales.map((d) => d.texto).filter(Boolean), [instituto?.cuit].filter(Boolean));

  const conf = data.confianza || {};
  const clamp = (n, d) => {
    const v = Number(n ?? d);
    if (!Number.isFinite(v)) return 0.8;
    return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
  };
  const confidence = clamp(conf.general, 0.8);
  const fieldConfidence = {
    total: clamp(conf.total, confidence),
    estudio: doc.recibo?.estudio_ajustado ? Math.min(clamp(conf.estudio, confidence), 0.7) : clamp(conf.estudio, confidence),
    visita: clamp(conf.visita, confidence),
    paciente_iniciales: clamp(conf.paciente, confidence),
    paciente_numero: clamp(conf.paciente, confidence),
  };

  // Posible duplicado: mismo estudio, paciente y visita
  let duplicate = null;
  const r = doc.recibo;
  // El n.º de paciente es opcional: sin él, se compara por iniciales.
  if (r?.estudio && r?.visita && (r.paciente_numero || r.paciente_iniciales)) {
    const [field, value] = r.paciente_numero ? ['paciente_numero', r.paciente_numero] : ['paciente_iniciales', r.paciente_iniciales];
    const { data: dup } = await supabaseAdmin()
      .from('tickets')
      .select('id, created_at, total, fecha_comprobante')
      .eq('estudio', r.estudio)
      .eq(field, value)
      .eq('visita', r.visita)
      .neq('status', 'anulado')
      .limit(1)
      .maybeSingle();
    if (dup) duplicate = dup;
  }

  return {
    doc: { ...doc, datos_personales: doc.datos_personales.map(({ tipo, box }) => ({ tipo, box })) },
    duplicate,
    confidence,
    fieldConfidence,
    amountReview,
    observaciones: data.observaciones || null,
    raw_text,
    model,
    ms: Date.now() - started,
  };
});
