import { handler, requireUser, limitUser, supabaseAdmin, HttpError } from './_lib/supabase.js';
import { codigoEstudio } from '../shared/estudios.js';
import { savedReimbursementError } from '../shared/save-validation.js';

const FIELDS = ['tipo_comprobante', 'concepto', 'estudio', 'visita', 'paciente_iniciales', 'paciente_numero', 'fecha_comprobante', 'monto_detalle', 'total', 'adjunta_comprobantes', 'recibe_viatico', 'desayuno', 'medio_pago', 'nro_operacion', 'pago', 'comprobantes_adjuntos', 'notas', 'image_path', 'image_paths', 'datos_ocultos', 'raw_text', 'extraction', 'confidence', 'model'];

export default handler(['POST'], async req => {
  const user = await requireUser(req);
  limitUser(user, 'save', 20);
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const ticket = Object.fromEntries(FIELDS.filter(k => k in body).map(k => [k, body[k]]));
  const error = savedReimbursementError(ticket);
  if (error) throw new HttpError(422, error);
  if (!ticket.image_paths.every(path => typeof path === 'string' && /^\d{4}\/\d{2}\/[\w-]+\/[\w-]+\.jpg$/.test(path) && path.split('/')[2] === user.id)) {
    throw new HttpError(403, 'Las fotos no pertenecen a esta sesión. Volvé a escanear los documentos.');
  }
  const catalogo = await supabaseAdmin().from('estudios').select('codigo').eq('activo', true);
  if (catalogo.error) throw new HttpError(503, 'No se pudo consultar el catálogo de estudios.');
  if (!catalogo.data.some(e => codigoEstudio(e.codigo) === codigoEstudio(ticket.estudio))) {
    throw new HttpError(422, 'Seleccioná un estudio habilitado del catálogo.');
  }
  ticket.created_by = user.id;
  ticket.status = 'cargado';
  ticket.image_path = ticket.image_paths[0];
  const { data, error: dbError } = await supabaseAdmin().from('tickets').insert(ticket).select().single();
  if (dbError) throw new HttpError(dbError.code === '23505' ? 409 : 500, dbError.code === '23505' ? 'Este comprobante ya fue cargado.' : 'No se pudo guardar el reintegro. Volvé a intentar.');
  return data;
});
