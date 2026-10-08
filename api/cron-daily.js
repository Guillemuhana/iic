import { handler, HttpError, getSetting } from './_lib/supabase.js';
import { sendDailyReports } from './_lib/report.js';

export const config = { maxDuration: 60 };

// Lo llama Vercel Cron (ver vercel.json) todos los días a las 23:00 UTC = 20:00 Córdoba.
// Manda a la contadora un email por cada día de carga con recibos pendientes.
export default handler(['GET'], async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'No autorizado');
  const cfg = (await getSetting('envio_automatico')) || { activo: true };
  if (cfg.activo === false) return { skipped: true, reason: 'Envío automático desactivado' };
  return sendDailyReports();
});
