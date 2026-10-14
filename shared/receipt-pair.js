import { mergeDocument } from './ticket-rules.js';

// A reimbursement is one receipt, an optional transfer and any number of extra
// pages of the same patient, saved together. Amounts are never summed.
export const MAX_PAGES = 15;

export function mergeReceiptPairDocument(ticket, doc) {
  const merged = mergeDocument(ticket, doc);
  // Keep an unreadable receipt blank even when the transfer has a clear amount.
  merged.total = doc.recibo ? doc.recibo.total : ticket.total;
  return merged;
}

/** Only the first receipt and the first transfer fill the data; any other page is an extra page. */
export function photoRole(photos, doc) {
  if (doc.tipo === 'recibo_viatico' && doc.recibo && !photos.some(p => p.tipo === 'recibo_viatico')) return 'recibo_viatico';
  if (doc.tipo === 'comprobante_transferencia' && doc.transferencia && !photos.some(p => p.tipo === 'comprobante_transferencia')) return 'comprobante_transferencia';
  return 'otro';
}

export function receiptPairStatus(photos = []) {
  const receipt = photos.filter(p => p.tipo === 'recibo_viatico' && p.doc?.recibo);
  const transfer = photos.filter(p => p.tipo === 'comprobante_transferencia' && p.doc?.transferencia);
  return {
    receipt: receipt.length === 1,
    transfer: transfer.length === 1,
    extra: photos.length - receipt.length - transfer.length,
    full: photos.length >= MAX_PAGES,
    complete: receipt.length === 1 && transfer.length <= 1 && photos.length <= MAX_PAGES,
  };
}

export function checkReceiptPair(ticket, photos) {
  const pair = receiptPairStatus(photos);
  if (photos.length > MAX_PAGES) return `Se pueden guardar hasta ${MAX_PAGES} hojas por paciente.`;
  if (!pair.complete) return 'Escaneá el recibo de viáticos del paciente antes de guardar.';
  if (!pair.transfer) return null;
  const transfer = ticket.pago?.monto;
  if (transfer == null || !Number.isFinite(Number(transfer)) || Number(transfer) <= 0) {
    return 'Completá el importe de la transferencia comparándolo con su foto.';
  }
  if (ticket.total != null && Number.isFinite(Number(ticket.total)) && Math.abs(Number(ticket.total) - Number(transfer)) > .009) {
    return 'El recibo y la transferencia tienen importes diferentes. Compará las dos fotos y corregí la lectura antes de guardar.';
  }
  return null;
}
