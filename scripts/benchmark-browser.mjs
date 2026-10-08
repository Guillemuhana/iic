// Requires a temporary `npm install --no-save --package-lock=false playwright`.
// Tests the published upload/read/review flow. Never clicks Save or writes Storage.
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
  await page.addInitScript(value => localStorage.setItem('iic-tickets-auth', JSON.stringify(value)), session);
  const writes = [];
  await page.route('**/storage/v1/**', route => {
    if (route.request().method() !== 'GET') { writes.push('Storage'); return route.abort(); }
    return route.continue();
  });
  await page.route('**/rest/v1/tickets**', route => {
    if (route.request().method() !== 'GET') { writes.push('tickets'); return route.abort(); }
    return route.continue();
  });
  await page.goto(`${process.env.IIC_SCAN_URL || 'https://iic-q945.vercel.app'}/caja/escanear`);
  await page.locator('input[type=file]').setInputFiles(file);
  const pending = page.waitForResponse(response => response.url().endsWith('/api/scan-ticket') && response.request().method() === 'POST', { timeout: 90000 });
  await page.getByRole('button', { name: 'Escanear esta foto', exact: true }).click();
  const response = await pending;
  const result = await response.json();
  if (!response.ok()) throw new Error(result.error || `HTTP ${response.status()}`);
  const sent = response.request().postDataJSON();
  const amount = result.doc?.recibo?.total ?? null;
  console.log(JSON.stringify({ expected: Number(expectedText), actual: amount, correct: amount === Number(expectedText), clientRegion: sent.amountRegion, review: result.amountReview, preventedWrites: writes }, null, 2));
} finally {
  await browser?.close();
  await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } });
}
