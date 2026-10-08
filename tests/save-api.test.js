import test from 'node:test';
import assert from 'node:assert/strict';
import saveTicket from '../api/save-ticket.js';

test('Save API rejects incomplete, wrong-scale and unreviewed payloads before insert and sets ownership itself', async () => {
  const originalFetch = globalThis.fetch;
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://review.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const id = '11111111-1111-4111-8111-111111111111';
  let writes = 0, inserted;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    let data;
    if (url.includes('/auth/v1/user')) data = { id, email: 'test@example.test' };
    else if (url.includes('/rest/v1/profiles')) data = { id, role: 'administracion', active: true };
    else if (url.includes('/rest/v1/tickets') && options.method === 'POST') {
      writes++; inserted = JSON.parse(options.body); data = { ...inserted, id: crypto.randomUUID() };
    } else throw new Error('Unexpected request in isolated API test.');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const payload = {
    estudio: 'I8F-MC-GPLL', visita: 'V19', paciente_iniciales: 'AM', paciente_numero: '1023', fecha_comprobante: '2026-10-06',
    total: 152034, pago: { monto: 152034 }, nro_operacion: '182687103836', image_paths: [`2026/10/${id}/a.jpg`, `2026/10/${id}/b.jpg`],
    extraction: { fotos: [
      { tipo: 'recibo_viatico', leido: { recibo: { total: 152034 } }, tapas: 1, privacidad_revisada: true, verificacion_importe: { extracted: 152034 } },
      { tipo: 'comprobante_transferencia', leido: { transferencia: { monto: 152034 } }, tapas: 2, privacidad_revisada: true, verificacion_importe: { extracted: 152034 } },
    ] },
  };
  const call = async body => {
    const result = {};
    await saveTicket({ method: 'POST', headers: { authorization: 'Bearer test-session' }, body }, {
      headersSent: false, status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; }, setHeader() {},
    });
    return result;
  };
  try {
    assert.equal((await call({ ...payload, paciente_numero: null })).status, 422);
    assert.equal((await call({ ...payload, total: 152.34, pago: { monto: 152.34 } })).status, 422);
    assert.equal((await call({ ...payload, raw_text: 'SIMULACIÓN SIN VALIDEZ' })).status, 422);
    assert.equal((await call({ ...payload, extraction: { fotos: payload.extraction.fotos.map(p => ({ ...p, privacidad_revisada: false })) } })).status, 422);
    assert.equal((await call({ ...payload, image_paths: ['2026/10/another-user/a.jpg', '2026/10/another-user/b.jpg'] })).status, 403);
    assert.equal(writes, 0);
    assert.equal((await call({ ...payload, created_by: 'another-user', status: 'enviado', sent_at: '2026-10-08' })).status, 200);
    assert.equal(writes, 1);
    assert.equal(inserted.created_by, id);
    assert.equal(inserted.status, 'cargado');
    assert.equal(inserted.sent_at, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
