import { handler, HttpError, getSetting } from './_lib/supabase.js';
import { sendWeeklyReport } from './_lib/report.js';

export const config = { maxDuration: 60 };

// Vercel Cron: Fridays at 15:00 UTC = 12:00 Argentina.
// One consolidated weekly report, with overdue unsent receipts.
export default handler(['GET'], async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'No autorizado');
  const cfg = (await getSetting('envio_automatico')) || { activo: true };
  if (cfg.activo === false) return { skipped: true, reason: 'Envío automático desactivado' };
  return sendWeeklyReport();
});
