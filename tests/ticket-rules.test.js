import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCuit, parseAmount, parseDate, normalizeDocument, mergeDocument, emptyTicket, checkTicket,
  matchEstudio, normalizeVisita, normalizeIniciales, maskPersonalText, toBox,
} from '../shared/ticket-rules.js';
import { cleanModelText, parseJsonLoose } from '../api/_lib/groq.js';

test('CUIT', () => {
  assert.equal(isValidCuit('30-71085111-1'), true); // instituto
  assert.equal(isValidCuit('20-12345678-6'), true);
  assert.equal(isValidCuit('30712345672'), false);
});

test('Importes argentinos', () => {
  assert.equal(parseAmount('$ 163.934'), 163934);
  assert.equal(parseAmount('146034,00'), 146034);
  assert.equal(parseAmount('$152.034'), 152034);
  assert.equal(parseAmount('12.345,67'), 12345.67);
  assert.equal(parseAmount('12,345.67'), 12345.67);
  assert.equal(parseAmount(''), null);
});

test('Fechas, incluida la de Mercado Pago', () => {
  assert.equal(parseDate('06/10/2026'), '2026-10-06');
  assert.equal(parseDate('06 / 10 / 2026'), '2026-10-06');
  assert.equal(parseDate('6/octubre/2026'), '2026-10-06');
  assert.equal(parseDate('6 de octubre de 2026'), '2026-10-06');
  assert.equal(parseDate('31/02/2026'), null);
});

test('Estudio manuscrito se ajusta a la lista de estudios activos', () => {
  const known = ['I8F-MC-GPLL', 'J2A-MC-GZPO'];
  assert.deepEqual(matchEstudio('IBF-MC-GPLL', known).value, 'I8F-MC-GPLL');
  assert.deepEqual(matchEstudio('18F - MC - GPLL', known).value, 'I8F-MC-GPLL');
  assert.equal(matchEstudio('XYZ-99', known).matched, false);
  assert.equal(matchEstudio('i8f-mc-gpll').value, 'I8F-MC-GPLL');
});

test('Visita e iniciales', () => {
  assert.equal(normalizeVisita('v19'), 'V19');
  assert.equal(normalizeVisita('Visita 19'), 'V19');
  assert.equal(normalizeVisita('V-19'), 'V19');
  assert.equal(normalizeVisita('19'), 'V19');
  assert.equal(normalizeIniciales('F.A.'), 'FA');
  assert.equal(normalizeIniciales('Fernando Arroyo'), 'FA');
});

test('Recibo + ticket asomando + transferencia se combinan', () => {
  const recibo = normalizeDocument({
    tipo_documento: 'recibo_viatico', rotacion: 90,
    recibo: { estudio: 'IBF-MC-GPLL', visita: 'V19', paciente_iniciales: 'FA', paciente_numero: '1023', fecha: '06/10/2026',
      monto_detalle: '$152.034 = $163.934', total: 163934, adjunta_comprobantes: 'SI', recibe_viatico: true, desayuno: 'SI' },
    gastos: [{ comercio: 'YPF', descripcion: 'Infinia Diesel', medio_pago: 'Efectivo', importe: '146034,00' }],
    datos_personales: [{ tipo: 'firma', texto: null, bbox: [120, 300, 330, 470] }],
  }, { estudios: ['I8F-MC-GPLL'] });
  assert.equal(recibo.rotacion, 90);
  assert.equal(recibo.recibo.estudio, 'I8F-MC-GPLL');
  assert.equal(recibo.recibo.estudio_ajustado, true);
  assert.equal(recibo.datos_personales[0].box.x < 0.12, true);

  const transf = normalizeDocument({
    tipo_documento: 'comprobante_transferencia',
    transferencia: { monto: '$ 163.934', fecha: '6/octubre/2026', hora: '12:10', nro_operacion: '182687103836', plataforma: 'Mercado Pago' },
    datos_personales: [{ tipo: 'nombre', texto: 'Fernando Arroyo', bbox: [200, 460, 520, 480] }, { tipo: 'cuenta', texto: '3840200500000032018835', bbox: [230, 500, 610, 515] }],
  });

  let t = mergeDocument(emptyTicket(), recibo);
  t = mergeDocument(t, transf);
  assert.equal(t.estudio, 'I8F-MC-GPLL');
  assert.equal(t.visita, 'V19');
  assert.equal(t.paciente_numero, '1023');
  assert.equal(t.total, 163934);
  assert.equal(t.desayuno, true);
  assert.equal(t.medio_pago, 'Transferencia');
  assert.equal(t.nro_operacion, '182687103836');
  assert.equal(t.comprobantes_adjuntos[0].importe, 146034);
  assert.deepEqual(checkTicket(t), []);
});

test('Avisos del recibo', () => {
  const w = checkTicket({ ...emptyTicket(), total: 1000, pago: { monto: 900 }, adjunta_comprobantes: true, fecha_comprobante: '2026-10-06' });
  assert.ok(w.find((x) => x.field === 'paciente_numero'));
  assert.ok(w.find((x) => x.field === 'total' && /transferencia/.test(x.message)));
  assert.ok(w.find((x) => x.field === 'comprobantes_adjuntos'));
  assert.ok(checkTicket(emptyTicket()).find((x) => x.level === 'error'));
});

test('Oculta datos personales en el texto, conserva los del instituto', () => {
  const ocr = `Instituto De Investigaciones Clinica Cord
CVU: 0000003100099540907944
CUIT/CUIL: 30-71085111-1
Fernando Arroyo
Uala Bank S.A.U
CBU: 3840200500000032018835
CUIT/CUIL: 20-17699081-4
N.° de operación 182687103836`;
  const out = maskPersonalText(ocr, ['Fernando Arroyo'], ['30710851111']);
  assert.ok(!out.includes('Fernando'));
  assert.ok(!out.includes('3840200500000032018835'));
  assert.ok(!out.includes('20-17699081-4'));
  assert.ok(out.includes('30-71085111-1'));
  assert.ok(out.includes('182687103836'));
});

test('Coordenadas de tapado', () => {
  const b = toBox([100, 200, 300, 260]);
  assert.ok(b.x < 0.1 && b.w > 0.2);
  assert.equal(toBox([1, 2]), null);
  assert.ok(toBox([0.1, 0.2, 0.3, 0.26]).w > 0.2);
});

test('Limpieza de respuesta del modelo', () => {
  assert.equal(cleanModelText('<think>x</think>\n```json\n{"a":1}\n```'), '{"a":1}');
  assert.deepEqual(parseJsonLoose('{"rotacion": 90, // grados\n"a": 1}'), { rotacion: 90, a: 1 });
});
