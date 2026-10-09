import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportPdf } from '../shared/report-pdf.js';

test('PDF includes logo, paginates all validated receipts and excludes invalid and annulled records', () => {
  const valid = {
    estudio: 'I8F-MC-GPLL', visita: 'V19', paciente_iniciales: 'AM', paciente_numero: '1023',
    fecha_comprobante: '2026-10-08', total: 152034, pago: { monto: 152034 }, nro_operacion: '182687103836',
    status: 'cargado', image_paths: ['a.jpg', 'b.jpg'], paciente_nombre: 'PRIVATE FULL NAME',
    extraction: { fotos: [
      { tipo: 'recibo_viatico', leido: { recibo: { total: 152034 } }, tapas: 1, privacidad_revisada: true },
      { tipo: 'comprobante_transferencia', leido: { transferencia: { monto: 152034 } }, tapas: 2, privacidad_revisada: true },
    ] },
  };
  const doc = buildReportPdf({ from: '2026-10-01', to: '2026-10-09',
    logo: new Uint8Array(readFileSync(new URL('../public/logo01.png', import.meta.url))),
    tickets: [
      ...Array.from({ length: 80 }, (_, i) => ({ ...valid, id: String(i), nro_operacion: `OPERATION-${i}` })),
      { ...valid, id: 'invalid', image_paths: [], nro_operacion: 'EXCLUDED-INVALID' },
      { ...valid, id: 'void', status: 'anulado', nro_operacion: 'EXCLUDED-VOID' },
    ], generatedAt: new Date('2026-10-09T15:00:00Z'),
  });
  const output = doc.output();
  assert.ok(output.startsWith('%PDF-'));
  assert.ok(doc.getNumberOfPages() > 2);
  assert.ok(output.includes('OPERATION-79'));
  assert.ok(output.includes('/Subtype /Image'));
  assert.ok(!output.includes('PRIVATE FULL NAME'));
  assert.ok(!output.includes('EXCLUDED-INVALID'));
  assert.ok(!output.includes('EXCLUDED-VOID'));
  const empty = buildReportPdf({ tickets: [], from: '2026-10-01', to: '2026-10-09' });
  assert.equal(empty.getNumberOfPages(), 1);
});
