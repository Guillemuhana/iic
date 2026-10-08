import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { verifyAmount } from '../shared/amount-verification.js';
import { weeklyWindow, nextWeeklySend } from '../shared/report-schedule.js';
import { normalizeDocument, checkTicket, emptyTicket } from '../shared/ticket-rules.js';
import { buildWorkbook, buildEmailHtml } from '../api/_lib/report.js';
import { readTicket } from '../api/_lib/groq.js';
import sharp from 'sharp';
import { prepareAmountImage } from '../api/_lib/amount-image.js';

test('Focused amount crop rotates correctly and ignores invalid or oversized rectangles', async () => {
  const input = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const url = 'data:image/jpeg;base64,' + input.toString('base64');
  const crop = await prepareAmountImage(url, [100, 200, 800, 500], 90);
  const metadata = await sharp(Buffer.from(crop.url.split(',')[1], 'base64')).metadata();
  assert.equal(crop.focused, true);
  assert.ok(metadata.height > metadata.width);
  assert.equal((await prepareAmountImage(url, [0, 0, 1000, 1000])).focused, false);
  assert.equal((await prepareAmountImage(url, [800, 500, 100, 200])).focused, false);
});

test('Conflicting full-page total is corrected only when two focused readings and literals agree', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-only';
  try {
    const input = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const image = 'data:image/jpeg;base64,' + input.toString('base64');
    let calls = 0;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(calls++ === 0
      ? { texto_leido: 'Recibo con monto manuscrito', importe_bbox: [100, 200, 800, 500], recibo: { total: 452057, monto_detalle: '$452.057' } }
      : { campo: 'recibo', monto_texto: '163.934', literal: '$152.034 = $163.934', confianza: .95 }) } }] }) });
    const result = await readTicket(image);
    assert.equal(calls, 3);
    assert.equal(result.amountReview.corrected, true);
    assert.equal(result.amountReview.extracted, 452057);
    assert.equal(result.data.recibo.total, 163934);
    calls = 0;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(calls++ === 0
      ? { texto_leido: 'Recibo con monto manuscrito', importe_bbox: [100, 200, 800, 500], recibo: { total: 452057 } }
      : { campo: 'recibo', monto_texto: calls === 2 ? '163.934' : '163.984', literal: '$163.934', confianza: .95 }) } }] }) });
    const disagreement = await readTicket(image);
    assert.equal(disagreement.amountReview.confirmed, false);
    assert.notEqual(disagreement.amountReview.corrected, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
  }
});

test('Independent readings agree or request review without inheriting an OCR guess', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-only';
  try {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      const text = JSON.stringify(body.messages);
      const response = calls++ === 0
        ? { texto_leido: 'Recibo de viáticos, importe legible', recibo: { total: 163934, monto_detalle: '$152.034 = $163.934' } }
        : { monto: 163934, confianza: .95 };
      if (calls === 2) assert.ok(!text.includes('163934'), 'Verifier must not receive the first reading');
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(response) } }] }) };
    };
    const result = await readTicket('data:image/jpeg;base64,test');
    assert.equal(calls, 2);
    assert.equal(result.amountReview.confirmed, true);
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(calls++ % 2 === 0
      ? { texto_leido: 'Recibo con importe dudoso', recibo: { total: 452057, monto_detalle: '$452.057' } }
      : { monto: 163934, confianza: .95 }) } }] }) });
    const mismatch = await readTicket('data:image/jpeg;base64,test');
    assert.equal(mismatch.amountReview.confirmed, false);
    assert.equal(mismatch.amountReview.checked, 163934);
    assert.equal(mismatch.data.confianza.total, .4);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
  }
});

test('Importes: disagreement, thousand separators and unreadable verification require review', () => {
  assert.equal(verifyAmount(163934, '163.934', '$152.034 = $163.934', .95).confirmed, true);
  assert.equal(verifyAmount(163934, 16334, '$163.934', .99).confirmed, false);
  assert.equal(verifyAmount(163934, 163934, '$163.394', .99).confirmed, false);
  assert.equal(verifyAmount(163934, null, '$163.934', .99).confirmed, false);
  assert.equal(verifyAmount(163934, 163934, '$163.934', .5).confirmed, false);
  assert.equal(normalizeDocument({ recibo: { monto_detalle: '$152.034 + $11.900', total: null } }).recibo.total, null);
  assert.ok(checkTicket({ ...emptyTicket(), total: Infinity }).some((w) => w.level === 'error'));
  assert.ok(checkTicket({ ...emptyTicket(), total: -1 }).some((w) => w.level === 'error'));
});

test('Weekly cutoff is Friday noon Argentina, including month/year transitions', () => {
  const window = weeklyWindow(new Date('2026-10-09T15:00:00Z'));
  assert.equal(window.start, '2026-10-02T15:00:00.000Z');
  assert.equal(window.end, '2026-10-09T15:00:00.000Z');
  assert.equal(weeklyWindow(new Date('2026-10-09T14:59:59Z')).end, window.start);
  assert.equal(weeklyWindow(new Date('2027-01-01T15:00:00Z')).start, '2026-12-25T15:00:00.000Z');
  assert.match(nextWeeklySend(new Date('2026-10-08T13:00:00Z')), /viernes,? 9 de octubre a las 12:00/);
});

test('Accounting workbook includes every photo, numeric totals and study summary', async () => {
  const paths = Array.from({ length: 6 }, (_, i) => `photo-${i}`);
  const tickets = [{ total: 12345.67, estudio: 'PROTOCOLO-01', image_paths: paths, created_at: '2026-10-08T15:00:00Z' }];
  const buffer = await buildWorkbook({ tickets, signed: Object.fromEntries(paths.map((p) => [p, `https://example.com/${p}`])), instituto: {}, periodFrom: '2026-10-02', periodTo: '2026-10-09', total: 12345.67 });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  assert.equal(wb.getWorksheet('Fotos y comprobantes').rowCount, 7);
  assert.equal(wb.getWorksheet('Reintegros').getCell('N5').value, 12345.67);
  assert.equal(wb.getWorksheet('Reintegros').getCell('N6').value.result, 12345.67);
  assert.ok(wb.getWorksheet('Resumen').getColumn(1).values.includes('PROTOCOLO-01'));
  const html = buildEmailHtml({ tickets, total: 12345.67, periodo: '02/10 al 09/10', nombreInst: '<IIC>', contadora: {}, weekly: true });
  assert.ok(html.includes('&lt;IIC&gt;'));
  assert.ok(html.includes('Cierre semanal'));
});
