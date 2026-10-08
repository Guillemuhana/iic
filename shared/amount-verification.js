import { parseAmount } from './ticket-rules.js';

// Keep both independent readings: a disagreement always requires a human review.
export function verifyAmount(extracted, checked, detail, confidence = 0) {
  const first = parseAmount(extracted);
  const second = parseAmount(checked);
  const literal = String(detail || '').trim();
  const matches = literal.match(/\d[\d.,]*/g) || [];
  const literalAmount = matches.length === 1 || (literal.includes('=') && matches.length > 1)
    ? parseAmount(matches.at(-1)) : null;
  const same = (a, b) => a !== null && b !== null && Math.abs(a - b) < 0.005;
  const confirmed = same(first, second) && Number(confidence) >= 0.85 && (literalAmount === null || same(first, literalAmount));
  return { extracted: first, checked: second, literal: literalAmount, confirmed,
    message: confirmed ? 'Dos lecturas coinciden. Confirmá el monto con la foto antes de guardar.'
      : 'El importe necesita revisión: las lecturas no coinciden o no son suficientemente claras. Comparalo con la foto y corregilo.' };
}

export function verifyVisualReadings(first, second, field) {
  const a = verifyAmount(first?.monto_texto, second?.monto_texto, first?.literal, Math.min(Number(first?.confianza) || 0, Number(second?.confianza) || 0));
  const b = verifyAmount(first?.monto_texto, second?.monto_texto, second?.literal, Math.min(Number(first?.confianza) || 0, Number(second?.confianza) || 0));
  const complete = first?.campo === field && second?.campo === field && a.literal !== null && b.literal !== null;
  return { ...a, confirmed: complete && a.confirmed && b.confirmed };
}
