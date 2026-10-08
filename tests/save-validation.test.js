import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReimbursement, savedReimbursementError, isTestDocument } from '../shared/save-validation.js';
import { rotatePhotoBox } from '../shared/photo-geometry.js';

const ticket = { estudio: 'I8F-MC-GPLL', visita: 'V19', paciente_iniciales: 'AM', paciente_numero: '1023', fecha_comprobante: '2026-10-06', total: 152034, pago: { monto: 152034 }, nro_operacion: '182687103836' };
const photos = [
  { tipo: 'recibo_viatico', doc: { recibo: { total: 152034 } }, privacyConfirmed: true, boxes: [{}], amountReview: { extracted: 152034 } },
  { tipo: 'comprobante_transferencia', doc: { transferencia: { monto: 152034 } }, privacyConfirmed: true, boxes: [{}], amountReview: { extracted: 152034 } },
];
const saved = { ...ticket, image_paths: ['a.jpg', 'b.jpg'], extraction: { fotos: photos.map(p => ({ tipo: p.tipo, leido: p.doc, tapas: 1, privacidad_revisada: true, verificacion_importe: p.amountReview })) } };

test('The reported 152.34 versus 152034 scale error cannot pass even when both amounts agree', () => {
  assert.equal(validateReimbursement(ticket, photos), null);
  assert.match(validateReimbursement({ ...ticket, total: 152.34, pago: { monto: 152.34 } }, photos), /miles/);
  assert.match(savedReimbursementError({ ...saved, total: 152.34, pago: { monto: 152.34 } }), /miles/);
  assert.equal(validateReimbursement({ ...ticket, total: 152034.25, pago: { monto: 152034.25 } }, photos), null);
});

test('Missing patient fields and unreviewed or unmasked pictures cannot be saved or reported', () => {
  for (const key of ['estudio', 'visita', 'paciente_iniciales', 'paciente_numero', 'fecha_comprobante', 'nro_operacion']) {
    assert.ok(validateReimbursement({ ...ticket, [key]: null }, photos));
    assert.ok(savedReimbursementError({ ...saved, [key]: null }));
  }
  assert.ok(validateReimbursement(ticket, [{ ...photos[0], privacyConfirmed: false }, photos[1]]));
  assert.ok(validateReimbursement(ticket, [{ ...photos[0], boxes: [] }, photos[1]]));
  assert.ok(savedReimbursementError({ ...saved, extraction: { fotos: [{ tipo: 'recibo_viatico', leido: photos[0].doc }] } }));
  assert.equal(savedReimbursementError(saved), null);
});

test('Explicit fictitious samples are excluded; a study called PRUEBA is not sufficient evidence', () => {
  for (const text of ['DATOS FICTICIOS · PRUEBA DE APP', 'SIMULACIÓN · SIN VALIDEZ']) {
    assert.equal(isTestDocument(text), true);
    assert.ok(validateReimbursement({ ...ticket, raw_text: text }, photos));
    assert.ok(savedReimbursementError({ ...saved, raw_text: text }));
  }
  assert.equal(isTestDocument('Estudio PRUEBA, visita V19'), false);
});

test('Rotate masking coordinates with the image and return exactly after four turns', () => {
  const box = { x: .1, y: .2, w: .3, h: .1, tipo: 'firma' };
  const turned = rotatePhotoBox(box, 90);
  assert.ok(Math.abs(turned.x - .7) < 1e-9);
  assert.equal(turned.y, .1);
  assert.equal(turned.w, .1);
  assert.equal(turned.h, .3);
  let current = box;
  for (let i = 0; i < 4; i++) current = rotatePhotoBox(current, 90);
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(current[key] - box[key]) < 1e-9);
  assert.ok(Math.abs(rotatePhotoBox(box, 180).x - .6) < 1e-9);
  assert.ok(Math.abs(rotatePhotoBox(box, 270).y - .6) < 1e-9);
});
