import { handler, requireUser, HttpError, supabaseAdmin, getSetting } from './_lib/supabase.js';
import { readTicket } from './_lib/groq.js';
import { normalizeDocument, maskPersonalText } from '../shared/ticket-rules.js';

export const config = { maxDuration: 60 };

// POST { image: "data:image/jpeg;base64,..." }
// Lee UNA foto (recibo, ticket de gasto o transferencia) y devuelve los datos
// y las zonas con datos personales a tapar. La imagen no se guarda acá.
export default handler(['POST'], async (req) => {
  await requireUser(req);
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

  const [estudiosCfg, instituto] = await Promise.all([getSetting('estudios'), getSetting('instituto')]);
  const estudios = (estudiosCfg?.lista || []).filter(Boolean);

  const started = Date.now();
  const { data, ocr, model, amountReview } = await readTicket(image, { estudios, originalImage });
  const doc = normalizeDocument(data, { estudios });

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
  if (r?.estudio && r?.paciente_numero && r?.visita) {
    const { data: dup } = await supabaseAdmin()
      .from('tickets')
      .select('id, created_at, total, fecha_comprobante')
      .eq('estudio', r.estudio)
      .eq('paciente_numero', r.paciente_numero)
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
