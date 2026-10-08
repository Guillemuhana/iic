import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTicket } from '../shared/ticket-rules.js';
import { receiptPairStatus, checkReceiptPair, mergeReceiptPairDocument } from '../shared/receipt-pair.js';

const receipt = { tipo: 'recibo_viatico', doc: { recibo: { total: 163934, estudio: 'I8F-MC-GPLL', visita: 'V19', paciente_iniciales: 'FA' }, gastos: [{ comercio: 'YPF', importe: 146034 }] } };
const transfer = { tipo: 'comprobante_transferencia', doc: { transferencia: { monto: 163934, nro_operacion: '182687103836', plataforma: 'Mercado Pago' } } };

test('Requires one receipt and one transfer, not two photos of the same type', () => {
  assert.equal(receiptPairStatus([receipt]).next, 'comprobante_transferencia');
  assert.equal(receiptPairStatus([transfer]).next, 'recibo_viatico');
  assert.equal(receiptPairStatus([receipt, receipt]).complete, false);
  assert.equal(receiptPairStatus([receipt, transfer]).complete, true);
  assert.equal(receiptPairStatus([receipt, transfer, transfer]).complete, false);
  assert.ok(checkReceiptPair(emptyTicket(), [receipt]));
});

test('Both documents belong to a single reimbursement and amounts are never added', () => {
  for (const order of [[receipt, transfer], [transfer, receipt]]) {
    const ticket = order.reduce((t, p) => mergeReceiptPairDocument(t, p.doc), emptyTicket());
    assert.equal(ticket.total, 163934);
    assert.equal(ticket.pago.monto, 163934);
    assert.equal(ticket.nro_operacion, '182687103836');
    assert.equal(ticket.comprobantes_adjuntos[0].importe, 146034);
    assert.equal(checkReceiptPair(ticket, order), null);
    assert.ok(checkReceiptPair({ ...ticket, pago: { monto: 163984 } }, order));
    assert.ok(checkReceiptPair({ ...ticket, pago: { monto: null } }, order));
    assert.ok(checkReceiptPair({ ...ticket, pago: { monto: Infinity } }, order));
  }
});

test('A clear transfer never fills an unreadable handwritten receipt', () => {
  const first = mergeReceiptPairDocument(emptyTicket(), transfer.doc);
  assert.equal(first.total, null);
  const unreadable = mergeReceiptPairDocument(first, { recibo: { total: null } });
  assert.equal(unreadable.total, null);
  const reverse = mergeReceiptPairDocument(mergeReceiptPairDocument(emptyTicket(), { recibo: { total: null } }), transfer.doc);
  assert.equal(reverse.total, null);
});
