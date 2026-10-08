import { mergeDocument } from './ticket-rules.js';

// A reimbursement is one receipt and one transfer, saved together, never summed.
export function mergeReceiptPairDocument(ticket, doc) {
  const merged = mergeDocument(ticket, doc);
  // Keep an unreadable receipt blank even when the transfer has a clear amount.
  merged.total = doc.recibo ? doc.recibo.total : ticket.total;
  return merged;
}

export function receiptPairStatus(photos = []) {
  const receipt = photos.filter(p => p.tipo === 'recibo_viatico' && p.doc?.recibo);
  const transfer = photos.filter(p => p.tipo === 'comprobante_transferencia' && p.doc?.transferencia);
  return {
    receipt: receipt.length === 1,
    transfer: transfer.length === 1,
    complete: photos.length === 2 && receipt.length === 1 && transfer.length === 1,
    next: receipt.length ? 'comprobante_transferencia' : 'recibo_viatico',
  };
}

export function checkReceiptPair(ticket, photos) {
  const pair = receiptPairStatus(photos);
  if (!pair.complete) return 'Escaneá el recibo de viáticos y la transferencia del mismo paciente antes de guardar.';
  const transfer = ticket.pago?.monto;
  if (transfer == null || !Number.isFinite(Number(transfer)) || Number(transfer) <= 0) {
    return 'Completá el importe de la transferencia comparándolo con su foto.';
  }
  if (ticket.total != null && Number.isFinite(Number(ticket.total)) && Math.abs(Number(ticket.total) - Number(transfer)) > .009) {
    return 'El recibo y la transferencia tienen importes diferentes. Compará las dos fotos y corregí la lectura antes de guardar.';
  }
  return null;
}
