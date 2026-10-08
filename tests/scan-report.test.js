import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { verifyAmount } from '../shared/amount-verification.js';
import { weeklyWindow, nextWeeklySend } from '../shared/report-schedule.js';
import { normalizeDocument, checkTicket, emptyTicket } from '../shared/ticket-rules.js';
import { buildWorkbook, buildEmailHtml } from '../api/_lib/report.js';

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
