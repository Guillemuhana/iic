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

test('Listing PDF can be labelled by loading date and statistics PDF lists every section', async () => {
  const { buildStatsPdf } = await import('../shared/report-pdf.js');
  const listing = buildReportPdf({ tickets: [], from: '2026-10-13', to: '2026-10-13', basis: 'carga' }).output();
  assert.ok(listing.includes('Fecha de carga') && listing.includes('13/10/2026'));
  const stats = {
    total: 300000, cantidad: 2, pacientes: 2, promedio: 150000, pendientes: 1, pendientes_total: 150000, revision: 0, revision_total: 0,
    con_viatico: 2, con_desayuno: 1, con_comprobantes: 0,
    por_estudio: [{ nombre: 'STUDY-XYZ', pacientes: 2, cantidad: 2, total: 300000 }],
    por_dia: [{ dia: '2026-10-13', cantidad: 1, total: 150000 }, { dia: '2026-10-12', cantidad: 1, total: 150000 }],
    por_visita: [{ nombre: 'V19', cantidad: 2, total: 300000 }],
    por_operador: [{ nombre: 'OPERATOR-NAME', cantidad: 2, total: 300000 }],
  };
  const output = buildStatsPdf({ stats, from: '2026-10-12', to: '2026-10-13' }).output();
  assert.ok(output.startsWith('%PDF-'));
  for (const text of ['de reintegros', 'STUDY-XYZ', '12/10/2026', 'V19', 'OPERATOR-NAME']) assert.ok(output.includes(text), text);
  const empty = buildStatsPdf({ stats: { ...stats, cantidad: 0, por_estudio: [], por_dia: [], por_visita: [], por_operador: [] }, from: '2026-10-13', to: '2026-10-13' });
  assert.equal(empty.getNumberOfPages(), 1);
});
