// Requires a temporary `npm install --no-save --package-lock=false playwright`.
// Reads through the real API unless IIC_SCAN_SIMULATED=1. Save requests are always simulated, never persisted.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const [file, expectedText] = process.argv.slice(2);
if (!file || !expectedText || !process.env.IIC_SCAN_PASSWORD) throw new Error('Provide photo, expected total and IIC_SCAN_PASSWORD.');
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(line => /^\w+=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; }));
const auth = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.IIC_SCAN_EMAIL || 'administracion@iic.local', password: process.env.IIC_SCAN_PASSWORD }) });
const session = await auth.json();
if (!auth.ok || !session.access_token) throw new Error('Benchmark login failed.');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.IIC_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(value => localStorage.setItem('iic-tickets-auth', JSON.stringify(value)), session);
  const simulatedScan = process.env.IIC_SCAN_SIMULATED === '1';
  if (simulatedScan) await page.route('**/api/scan-ticket', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    doc: { tipo: 'recibo_viatico', rotacion: 0, recibo: { estudio: 'PRUEBA', visita: 'V19', paciente_iniciales: 'FA', paciente_numero: '1023', total: Number(expectedText), fecha_comprobante: '2026-10-06' }, gastos: [], transferencia: null, datos_personales: [{ tipo: 'firma', box: { x: .1, y: .8, w: .1, h: .05 } }] },
    raw_text: '', confidence: .95, fieldConfidence: {}, amountReview: { confirmed: true, message: 'Lectura simulada para probar el flujo.' }, model: 'simulated', ms: 1,
  }) }));
  const writes = [];
  let failSave = true;
  let savedPayload;
  await page.route('**/storage/v1/**', route => {
    if (route.request().method() === 'POST') {
      writes.push('Storage (simulated)');
      const Key = new URL(route.request().url()).pathname.split('/object/')[1];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key }) });
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.continue();
  });
  await page.route('**/rest/v1/tickets**', route => {
    if (route.request().method() === 'POST') {
      writes.push('tickets (simulated)');
      savedPayload = route.request().postDataJSON();
      if (failSave) {
        failSave = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Prueba: guardado no disponible' }) });
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...savedPayload, id: crypto.randomUUID() }) });
    }
    if (route.request().method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto(`${process.env.IIC_SCAN_URL || 'https://iic-q945.vercel.app'}/caja/escanear`);
  const pending = page.waitForResponse(response => response.url().endsWith('/api/scan-ticket') && response.request().method() === 'POST', { timeout: 90000 });
  await page.locator('input[type=file]').setInputFiles(file);
  const response = await pending;
  const result = await response.json();
  if (!response.ok()) throw new Error(result.error || `HTTP ${response.status()}`);
  const sent = response.request().postDataJSON();
  const amount = result.doc?.recibo?.total ?? null;
  const save = page.getByRole('button', { name: 'Confirmar y guardar', exact: true });
  await page.getByAltText('Foto del recibo para corroborar los datos').waitFor();
  await save.click();
  const privacy = page.getByRole('button', { name: 'Guardar igual', exact: true });
  if (await privacy.isVisible()) await privacy.click();
  await page.getByText('Prueba: guardado no disponible', { exact: true }).waitFor();
  if (!page.url().endsWith('/caja/escanear')) throw new Error('Navigated away after a failed save.');
  await save.click();
  if (await privacy.isVisible()) await privacy.click();
  await page.waitForURL('**/caja');
  await page.getByRole('button', { name: 'Escanear recibo', exact: true }).waitFor();
  if (savedPayload.total !== amount || !savedPayload.extraction.importe_revisado) throw new Error('Saved amount differs from reviewed amount.');
  console.log(JSON.stringify({ simulatedScan, expected: Number(expectedText), actual: amount, correct: amount === Number(expectedText), clientRegion: sent.amountRegion, review: result.amountReview, failedSavePreservedReview: true, simulatedSaveReturnedHome: true, preventedWrites: writes }, null, 2));
} finally {
  await browser?.close();
  await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } });
}
