// Diagnostic only: explicitly supplied image goes to Groq, never to Storage.
// GROQ_API_KEY=... node scripts/benchmark-groq.mjs <photo> <expected> <rotation> <x,y,w,h> [none|high]
import sharp from 'sharp';
import { readTicket, rereadAmount } from '../api/_lib/groq.js';
import { findReceiptAmountRegion } from '../shared/receipt-region.js';
import { tmpdir } from 'node:os';
const [file, expected, rotation = '0', region, effort = 'none'] = process.argv.slice(2);
if (!file || !expected || !region || !process.env.GROQ_API_KEY) throw new Error('Provide a photo, expected amount, rotation, region and GROQ_API_KEY.');
const rotated = await sharp(file).rotate(Number(rotation)).toBuffer();
if (region === 'full' || region === 'located' || region.startsWith('reread:')) {
  const [left, top, width, height] = region.replace('reread:', '').split(',').map(Number);
  let bytes = ['full', 'located'].includes(region) ? rotated : await sharp(rotated).extract({ left, top, width, height }).jpeg({ quality: 98 }).toBuffer();
  let amountRegion;
  if (region === 'located') {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { cachePath: tmpdir() });
    try {
      for (const angle of [0, 90, 270, 180]) {
        const candidate = await sharp(rotated).rotate(angle).toBuffer();
        const { width, height } = await sharp(candidate).metadata();
        const recognition = await worker.recognize(candidate, { tessedit_pageseg_mode: '3' }, { blocks: true });
        amountRegion = findReceiptAmountRegion(recognition.data, width, height);
        if (amountRegion) { bytes = candidate; break; }
      }
    } finally { await worker.terminate(); }
  }
  const url = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  const result = ['full', 'located'].includes(region) ? await readTicket(url, { amountRegion }) : await rereadAmount(url, 'recibo');
  console.log(JSON.stringify({ expected: Number(expected), actual: result.amountReview?.confirmed ? result.data?.recibo?.total : null, suggested: result.suggestedAmount, review: result.amountReview, rotation: result.data?.rotacion, regionLocated: amountRegion }, null, 2));
  process.exit(0);
}
const [left, top, width, height] = region.split(',').map(Number);
const crop = await sharp(rotated).extract({ left, top, width, height }).resize({ width: 1800, height: 600, fit: 'inside' }).extend({ top: 30, bottom: 30, left: 30, right: 30, background: '#ffffff' }).jpeg({ quality: 98 }).toBuffer();
const start = Date.now();
const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45000),
  body: JSON.stringify({ model: 'qwen/qwen3.8-27b', reasoning_effort: effort, reasoning_format: 'hidden', temperature: 0,
    max_completion_tokens: effort === 'none' ? 768 : 4096, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: `Leé esta línea de un recibo. Primero identificá el campo y transcribí cada dígito manuscrito por separado, de izquierda a derecha, sin completar por contexto. Conservá puntos, comas y el signo =. El $ no es un 4. Si hay =, el importe final está a la derecha. En caracteres manuscritos, distinguí curvas abiertas de círculos cerrados; no agregues un trazo que no esté visible. Devolvé JSON: {"campo":"recibo|transferencia|otro", "literal":"expresión del importe sin datos personales", "digitos_finales":["cada dígito de la cifra final en orden; ? si es ambiguo"], "monto_texto":"importe final o null si un dígito es ambiguo", "ambiguo":true|false}. No transcribas nombres ni firmas.` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${crop.toString('base64')}` } }] }],
  }),
});
const result = await r.json();
if (!r.ok) throw new Error(`Groq HTTP ${r.status}; retry-after=${r.headers.get('retry-after') || 'unknown'}`);
let reading;
try { reading = JSON.parse(result.choices[0].message.content); } catch { throw new Error('Invalid JSON response.'); }
console.log(JSON.stringify({ expected: Number(expected), effort, reading, ms: Date.now() - start, tokens: result.usage?.total_tokens }, null, 2));
