import { handler, HttpError, getSetting } from './_lib/supabase.js';
import { isCronAuthorized } from './_lib/security.js';
import { scheduledNow } from '../shared/report-schedule.js';
import { sendWeeklyReport } from './_lib/report.js';

export const config = { maxDuration: 60 };

// Each daily cron checks one hour; the administrator chooses the weekly cutoff.
// One consolidated weekly report, with overdue unsent receipts.
export default handler(['GET'], async (req) => {
  if (!isCronAuthorized(req)) throw new HttpError(401, 'No autorizado');
  const cfg = (await getSetting('envio_automatico')) || { activo: true };
  if (cfg.activo === false) return { skipped: true, reason: 'Envío automático desactivado' };
  const now = new Date();
  if (!scheduledNow(now, cfg)) return { skipped: true, reason: 'Fuera del horario configurado' };
  return sendWeeklyReport(now, cfg);
});
