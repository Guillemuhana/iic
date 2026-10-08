import { handler, requireUser, supabaseAdmin, HttpError } from './_lib/supabase.js';
import { loadingBounds, buildTicketStats } from '../shared/ticket-stats.js';
export default handler(['POST'], async req => {
 await requireUser(req, ['admin']);
 const { from, to } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
 let bounds;try { bounds = loadingBounds(from, to); } catch { throw new HttpError(400, 'Invalid date range'); }
 const rows = [];
 for (let offset = 0; ; offset += 1000) {
  const {data,error} = await supabaseAdmin().from('tickets').select('*, profiles:created_by(full_name,email)').gte('created_at',bounds.start).lt('created_at',bounds.end).neq('status','anulado').order('created_at').order('id').range(offset,offset+999);
  if(error) throw new HttpError(500,error.message);
  rows.push(...data);if(data.length<1000)break;
 }
 return buildTicketStats(rows, from, to);
});
