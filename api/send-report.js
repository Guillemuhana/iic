import { handler, requireUser, HttpError } from './_lib/supabase.js';
import { sendAccountantReport } from './_lib/report.js';

export const config = { maxDuration: 60 };

// El envío normal es AUTOMÁTICO (api/cron-daily.js, todos los días a las 20 h).
// Este endpoint queda solo para el administrador, para reenviar un período
// a la contadora (por ejemplo, si perdió un email).
// POST { from: 'aaaa-mm-dd', to: 'aaaa-mm-dd' }
export default handler(['POST'], async (req) => {
  const user = await requireUser(req, ['admin']);
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRe.test(body.from || '') || !isoRe.test(body.to || '')) throw new HttpError(400, 'Indicá el período a reenviar.');
  if (body.from > body.to) throw new HttpError(400, 'La fecha "desde" es posterior a "hasta".');
  return sendAccountantReport({ mode: 'rango', from: body.from, to: body.to, sentBy: user.id, kind: 'reenvio' });
});
