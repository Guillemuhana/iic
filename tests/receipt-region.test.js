import test from 'node:test';
import assert from 'node:assert/strict';
import { findReceiptAmountRegion } from '../shared/receipt-region.js';
import { validateDigitReading } from '../api/_lib/groq.js';

const data = line => ({ blocks: [{ paragraphs: [{ lines: [line] }] }] });
test('Printed receipt label locates the whole money line, including handwriting above baseline', () => {
  const region = findReceiptAmountRegion(data({ text: 'Recibí la suma de ... pesos', confidence: 80, bbox: { x0: 100, y0: 320, x1: 800, y1: 350 } }), 1000, 900);
  assert.ok(region[0] < 100);
  assert.ok(region[1] < 320 / 900 * 1000);
  assert.ok(region[2] > 800);
  assert.ok(region[3] > 350 / 900 * 1000);
});
test('Tickets with TOTAL, weak OCR or invalid geometry never anchor the receipt amount', () => {
  const line = { text: 'TOTAL $146034', confidence: 90, bbox: { x0: 50, y0: 100, x1: 500, y1: 150 } };
  assert.equal(findReceiptAmountRegion(data(line), 1000, 900), null);
  assert.equal(findReceiptAmountRegion(data({ ...line, text: 'Recibi la suma de', confidence: 10 }), 1000, 900), null);
  assert.equal(findReceiptAmountRegion(data({ ...line, text: 'Recibi la suma de', bbox: {} }), 1000, 900), null);
});
test('Digit transcription must match the amount text exactly and reject ambiguous digits', () => {
  const reading = { digitos_finales: ['1', '6', '3', '9', '3', '4'], monto_texto: '163.934', ambiguo: false, confianza: .95 };
  assert.equal(validateDigitReading(reading).monto_texto, '163.934');
  assert.equal(validateDigitReading({ ...reading, monto_texto: '163.984' }).monto_texto, null);
  assert.equal(validateDigitReading({ ...reading, digitos_finales: ['1', '6', '3', '9', '?', '4'] }).monto_texto, null);
  assert.equal(validateDigitReading({ ...reading, ambiguo: true }).monto_texto, null);
  assert.equal(validateDigitReading({ monto_texto: '163.934', confianza: .99 }).monto_texto, null);
});
