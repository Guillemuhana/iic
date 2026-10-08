import { checkTicket } from './ticket-rules.js';
import { checkReceiptPair } from './receipt-pair.js';

export function isTestDocument(text) {
  const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /datos\s+ficticios|prueba\s+de\s+app/.test(normalized)
    || (/simulacion/.test(normalized) && /sin\s+validez/.test(normalized));
}

export function validateReimbursement(ticket, photos) {
  const error = checkTicket(ticket).find(w => w.level === 'error');
  if (error) return error.message;
  const pairError = checkReceiptPair(ticket, photos);
  if (pairError) return pairError;
  if (!ticket.nro_operacion?.trim()) return 'Falta el número de operación de la transferencia.';
  if (isTestDocument(ticket.raw_text) || photos.some(p => isTestDocument(p.raw_text))) return 'Es un documento de prueba o simulación. No se puede registrar como reintegro real.';
  for (const photo of photos) {
    if (!photo.privacyConfirmed) return 'Revisá cada foto: debe estar derecha, con firma y datos personales tapados e importe visible.';
    if (!(photo.boxes?.length || photo.redactionCount)) return 'Tapá la firma y los datos personales del paciente antes de guardar cada foto.';
    const amount = photo.tipo === 'recibo_viatico' ? ticket.total : ticket.pago?.monto;
    const candidates = [photo.amountReview?.extracted, photo.amountReview?.checked].filter(n => n != null && Number.isFinite(Number(n)) && Number(n) > 0);
    if (Number(amount) < 1000 && candidates.some(n => Number(n) >= 1000 && Number(n) / Number(amount) >= 100)) {
      return 'El importe ingresado es mucho menor que el leído. Revisá los miles: escribí los pesos completos, por ejemplo 152034, y los centavos por separado.';
    }
  }
  return null;
}

export function savedReimbursementError(ticket) {
  const photos = (Array.isArray(ticket.extraction?.fotos) ? ticket.extraction.fotos : []).map(p => ({ tipo: p.tipo, doc: p.leido, privacyConfirmed: p.privacidad_revisada === true, redactionCount: p.tapas, amountReview: p.verificacion_importe }));
  if (!Array.isArray(ticket.image_paths) || ticket.image_paths.length !== 2 || new Set(ticket.image_paths).size !== 2) return 'Faltan las dos fotos del reintegro.';
  return validateReimbursement(ticket, photos);
}
