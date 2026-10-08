import { findReceiptAmountRegion } from '../../shared/receipt-region.js';
import { loadBitmap } from './image';

// Recognition runs in a local worker. Only language/core assets are downloaded.
// A failed download or slow device falls back to the existing Groq reader.
export async function locateReceipt(blob) {
  const { createWorker } = await import('tesseract.js');
  const bitmap = await loadBitmap(blob);
  let worker, expired = false;
  const initialization = createWorker('eng', 1, { errorHandler: () => {} });
  initialization.then(value => { if (expired) value.terminate().catch(() => {}); }).catch(() => {});
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    expired = true; worker?.terminate().catch(() => {}); reject(new Error('Local OCR timeout'));
  }, 20000); });
  try {
    return await Promise.race([timeout, (async () => {
      worker = await initialization;
      for (const rotation of [0, 90, 270, 180]) {
        if (expired) return null;
        const canvas = document.createElement('canvas');
        const swap = rotation % 180 !== 0;
        canvas.width = swap ? bitmap.height : bitmap.width;
        canvas.height = swap ? bitmap.width : bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        const result = await worker.recognize(canvas, { tessedit_pageseg_mode: '3' }, { blocks: true });
        const bbox = findReceiptAmountRegion(result.data, canvas.width, canvas.height);
        if (bbox) return { canvas, bbox, rotation };
      }
      return null;
    })()]);
  } catch { return null; }
  finally { expired = true; clearTimeout(timer); if (worker) await worker.terminate().catch(() => {}); bitmap.close?.(); }
}
