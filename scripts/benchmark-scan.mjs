// Explicitly sends the chosen photo to the configured app/Groq, never saves a ticket.
// IIC_SCAN_PASSWORD=... node scripts/benchmark-scan.mjs <photo> <expected total> [rotation]
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { findReceiptAmountRegion } from '../shared/receipt-region.js';
const [file, expectedText, rotation = '0', regionText] = process.argv.slice(2);
if (!file || !expectedText || !process.env.IIC_SCAN_PASSWORD) throw new Error('Provide photo, expected total and IIC_SCAN_PASSWORD.');
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(line => /^\w+=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; }));
const auth = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.IIC_SCAN_EMAIL || 'administracion@iic.local', password: process.env.IIC_SCAN_PASSWORD }) });
const session = await auth.json();
if (!auth.ok || !session.access_token) throw new Error('Benchmark login failed.');
try {
  let bytes = await sharp(await readFile(file)).rotate(Number(rotation)).resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer();
  let amountRegion;
  const selected = Boolean(regionText && regionText !== 'locate');
  if (regionText === 'locate') {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { cachePath: tmpdir() });
    try {
      for (const angle of [0, 90, 270, 180]) {
        const candidate = await sharp(bytes).rotate(angle).toBuffer();
        const { width, height } = await sharp(candidate).metadata();
        const recognition = await worker.recognize(candidate, { tessedit_pageseg_mode: '3' }, { blocks: true });
        amountRegion = findReceiptAmountRegion(recognition.data, width, height);
        if (amountRegion) { bytes = candidate; break; }
      }
    } finally { await worker.terminate(); }
  }
  if (selected) {
    const [left, top, width, height] = regionText.split(',').map(Number);
    bytes = await sharp(bytes).extract({ left, top, width, height }).jpeg({ quality: 95 }).toBuffer();
  }
  const enhanced = await sharp(bytes).grayscale().normalise().jpeg({ quality: 92 }).toBuffer();
  const start = Date.now();
  const response = await fetch(`${process.env.IIC_SCAN_URL || 'https://iic-q945.vercel.app'}/api/${selected ? 'scan-amount' : 'scan-ticket'}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(selected ? { image: `data:image/jpeg;base64,${bytes.toString('base64')}`, field: 'recibo' } : { image: `data:image/jpeg;base64,${enhanced.toString('base64')}`, originalImage: `data:image/jpeg;base64,${bytes.toString('base64')}`, amountRegion }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  const amount = result.amount ?? result.doc?.recibo?.total ?? result.doc?.transferencia?.monto ?? null;
  console.log(JSON.stringify({ expected: Number(expectedText), actual: amount, correct: amount === Number(expectedText), outcome: amount === null ? 'review_required' : amount === Number(expectedText) ? 'correct' : 'incorrect', review: result.amountReview, ms: Date.now() - start, model: result.model }, null, 2));
} finally {
  await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } });
}
