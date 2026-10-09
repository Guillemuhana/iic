import test from 'node:test';
import assert from 'node:assert/strict';
import review from '../api/cron-review.js';
import { readFileSync } from 'node:fs';

test('Daily review authenticates, paginates, counts errors and preserves receipts', async () => {
  const originalFetch = globalThis.fetch;
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.SUPABASE_URL = 'https://review.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  process.env.CRON_SECRET = 'review-secret';
  const requests = [];
  let saved, failRead = false;
  const valid = {
    status: 'cargado', estudio: 'I8F-MC-GPLL', visita: 'V19', paciente_iniciales: 'AM', paciente_numero: '1023',
    fecha_comprobante: '2026-10-08', total: 152034, pago: { monto: 152034 }, nro_operacion: '182687103836',
    image_paths: ['a.jpg', 'b.jpg'], extraction: { fotos: [
      { tipo: 'recibo_viatico', leido: { recibo: { total: 152034 } }, tapas: 1, privacidad_revisada: true },
      { tipo: 'comprobante_transferencia', leido: { transferencia: { monto: 152034 } }, tapas: 2, privacidad_revisada: true },
    ] },
  };
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    requests.push({ url, method: options.method });
    let data;
    if (url.pathname.endsWith('/tickets')) {
      assert.equal(options.method, 'GET');
      assert.equal(url.searchParams.get('status'), 'neq.anulado');
      assert.ok(url.searchParams.get('created_at').startsWith('lte.'));
      if (failRead) return new Response(JSON.stringify({ message: 'Unavailable' }), { status: 503 });
      data = url.searchParams.get('offset') === '0'
        ? Array.from({ length: 500 }, () => valid)
        : [{ ...valid, image_paths: [] }, { ...valid, status: 'enviado', total: 100 }];
    } else if (url.pathname.endsWith('/settings')) {
      saved = JSON.parse(options.body);
      data = null;
    } else throw new Error('Unexpected request');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const call = async authorization => {
    const result = {};
    await review({ method: 'GET', headers: { authorization } }, {
      headersSent: false, status(code) { result.status = code; return this; },
      json(body) { result.body = body; return this; }, setHeader() {},
    });
    return result;
  };
  try {
    assert.equal((await call('Bearer wrong')).status, 401);
    assert.equal(requests.length, 0);
    const result = await call('Bearer review-secret');
    assert.equal(result.status, 200);
    assert.equal(result.body.checked, 502);
    assert.equal(result.body.errors, 2);
    assert.equal(result.body.pending_errors, 1);
    assert.equal(saved.key, 'revision_diaria');
    assert.deepEqual(saved.value, result.body);
    saved = null;
    failRead = true;
    assert.equal((await call('Bearer review-secret')).status, 500);
    assert.equal(saved, null, 'A failed review must not publish a successful result');
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
    assert.equal(config.crons.find(c => c.path === '/api/cron-review').schedule, '0 11 * * *');
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) { if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k]; }
  }
});
