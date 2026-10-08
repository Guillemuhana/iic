// Printed labels locate the field. Handwritten OCR values are deliberately ignored.
export function findReceiptAmountRegion(data, width, height) {
  const lines = (data?.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => paragraph.lines || []));
  for (const line of lines) {
    const text = String(line.text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!/recib[i1l]?\s+la\s+suma\s+de/.test(text) || Number(line.confidence) < 35) continue;
    const b = line.bbox;
    if (!b || ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) || b.y1 <= b.y0) continue;
    const pad = Math.max(height * .035, (b.y1 - b.y0) * .6);
    const left = Math.max(0, b.x0 - width * .025), right = width * .985;
    const top = Math.max(0, b.y0 - pad), bottom = Math.min(height, b.y1 + pad * .4);
    if (right <= left || (bottom - top) / height > .3) continue;
    return [left / width, top / height, right / width, bottom / height].map(n => Math.round(n * 1000));
  }
  return null;
}
