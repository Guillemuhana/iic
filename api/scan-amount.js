import { handler, requireUser, HttpError } from './_lib/supabase.js';
import { rereadAmount } from './_lib/groq.js';

export const config = { maxDuration: 60 };

export default handler(['POST'], async (req) => {
  await requireUser(req);
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  if (!['recibo', 'transferencia'].includes(body.field)) throw new HttpError(400, 'Seleccioná un recibo o una transferencia.');
  if (typeof body.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(body.image)) throw new HttpError(400, 'Mandá una imagen válida del campo de importe.');
  if (body.image.length > 4_200_000) throw new HttpError(413, 'El recorte es demasiado pesado.');
  // The image is used for inference only; no document or photo is saved here.
  return rereadAmount(body.image, body.field);
});
