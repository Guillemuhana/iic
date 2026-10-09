import { handler, HttpError, supabaseAdmin } from './_lib/supabase.js';
import { savedReimbursementError } from '../shared/save-validation.js';

export const config = { maxDuration: 60 };

// 11:00 UTC = 08:00 Argentina. Only validates stored data; never changes receipts.
export default handler(['GET'], async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'No autorizado');
  const sb = supabaseAdmin();
  const startedAt = new Date().toISOString();
  let checked = 0, errors = 0, pendingErrors = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await sb.from('tickets').select('*')
      .neq('status', 'anulado').lte('created_at', startedAt)
      .order('created_at').order('id').range(offset, offset + 499);
    if (error) throw new HttpError(500, error.message);
    for (const ticket of data) {
      checked++;
      if (savedReimbursementError(ticket)) {
        errors++;
        if (ticket.status === 'cargado') pendingErrors++;
      }
    }
    if (data.length < 500) break;
  }
  const result = { checked_at: new Date().toISOString(), checked, errors, pending_errors: pendingErrors };
  const { error } = await sb.from('settings').upsert({ key: 'revision_diaria', value: result }, { onConflict: 'key' });
  if (error) throw new HttpError(500, error.message);
  return result;
});
