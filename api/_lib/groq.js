// Two independent visual readings: structured document + financial verification.

import { HttpError } from './supabase.js';
import { verifyAmount, verifyVisualReadings } from '../../shared/amount-verification.js';
import { prepareAmountImage } from './amount-image.js';
import { parseAmount } from '../../shared/ticket-rules.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const VISION_MODEL = () => process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

const EXTRACT_PROMPT = (estudios = []) => `Analizá directamente la imagen. Orientá mentalmente el documento y extraé los datos en JSON. Transcribí texto impreso y manuscrito en texto_leido, sin transcribir firmas. Si un dígito es ambiguo, escribí [?] y dejá el importe en null. El signo $ no es un dígito 4.
${estudios.length ? `\nESTUDIOS ACTIVOS DEL INSTITUTO (el código manuscrito casi seguro es uno de estos): ${estudios.join(', ')}\n` : ''}
Devolvé SOLO un objeto JSON con estas claves (null si no aparece; nunca inventes):
{
  "texto_leido": "transcripción literal del texto visible, impreso y manuscrito; [FIRMA] en lugar de firmas",
  "tipo_documento": "recibo_viatico | comprobante_gasto | comprobante_transferencia | otro  (el documento principal de la foto)",
  "rotacion": 0 | 90 | 180 | 270,   // grados en sentido horario para que el texto quede derecho
  "importe_bbox": [x1,y1,x2,y2], // rectángulo de TODA la línea "Recibí la suma de", con etiqueta, cifras y =; para transferencia incluye etiqueta y monto. Coordenadas 0–1000 de la imagen ORIGINAL SIN GIRAR. null si no se ubica.
  "recibo": {                        // solo si aparece el recibo de reintegro de viáticos
    "estudio": "código escrito en 'correspondiente al estudio', ej I8F-MC-GPLL",
    "visita": "lo escrito después de 'reintegro de viáticos', ej V19",
    "paciente_iniciales": "iniciales escritas en Aclaración, ej FA",
    "paciente_numero": "número de paciente escrito junto a las iniciales en Aclaración, ej 1023",
    "fecha": "dd/mm/aaaa del campo Fecha",
    "monto_detalle": "solo lo escrito en 'Recibí la suma de', preservando separadores y el signo = si aparece",
    "total": número final recibido (si hay una cuenta, el resultado después del '='),
    "adjunta_comprobantes": true | false | null,   // opción SI/NO encerrada
    "recibe_viatico": true | false | null,
    "desayuno": true | false | null
  },
  "gastos": [ { "comercio": "ej YPF", "descripcion": "ej Infinia Diesel 57 lts", "fecha": "dd/mm/aaaa", "medio_pago": "Efectivo|Débito|Crédito|Transferencia|Otro", "importe": número } ],
  "transferencia": { "monto": número, "fecha": "dd/mm/aaaa", "hora": "hh:mm", "nro_operacion": "texto", "motivo": "texto", "plataforma": "ej Mercado Pago" },
  "datos_personales": [
    { "tipo": "firma | nombre | direccion | documento | cuit | cuenta | telefono | email | otro",
      "texto": "texto exacto tal como aparece (null para firma)",
      "bbox": [x1, y1, x2, y2] }
  ],
  "confianza": { "general": 0-1, "total": 0-1, "estudio": 0-1, "visita": 0-1, "paciente": 0-1 },
  "observaciones": "algo dudoso, tachado o ilegible; si no hay, null"
}

Reglas:
- Una misma foto puede tener el recibo y además un ticket de gasto asomando: completá "recibo" y "gastos".
- Importes argentinos: punto = miles, coma = decimales. "$ 12.345" => 12345. "12345,00" => 12345. Devolvé números JSON.
- Leé el importe directamente en la imagen, nunca lo deduzcas del contexto. El símbolo $ no representa el dígito 4. Si los dígitos manuscritos son ambiguos, total=null.
- El total del recibo se lee únicamente en "Recibí la suma de"; un ticket adjunto con TOTAL es un gasto, nunca reemplaza ni se suma al total del recibo. Si hay =, conservá el importe de la derecha, sin sumar ambos lados.
- Códigos de estudio manuscritos: cuidado con I/1, 8/B, 0/O, G/6, L/1. Si hay estudios activos, usá el que coincida.
- Si en Aclaración escribieron el nombre completo, devolvé SOLO las iniciales.
- "datos_personales" son datos del PACIENTE o de terceros que hay que tapar en la foto por privacidad:
  la firma del paciente; nombre y apellido; dirección o domicilio; DNI; CUIT/CUIL; CBU, CVU, alias o n.º de cuenta; teléfono; email.
  NO incluyas los datos del Instituto de Investigaciones Clínicas (su nombre, CUIT, CVU) ni importes, fechas, estudio, visita, iniciales o n.º de paciente.
  En un comprobante de transferencia, el destinatario es el paciente: tapá su nombre, banco/cuenta CBU/CVU/alias y CUIT/CUIL.
- "bbox" en coordenadas de la imagen TAL COMO LA RECIBÍS (sin girarla), normalizadas de 0 a 1000: x1,y1 esquina superior izquierda, x2,y2 inferior derecha. Abarcá el dato completo con margen.`;

export function rateLimitDelay(header, remaining) {
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const delay = Math.ceil(seconds * 1000) + 250;
  return delay <= 20000 && remaining > delay + 3000 ? delay : null;
}

async function callGroq(body, { retries = 1, deadline = Date.now() + 45000 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(500, 'Falta GROQ_API_KEY en las variables de entorno.');
  let lastErr;
  let rateRetried = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const remaining = deadline - Date.now();
      if (remaining < 1000) throw new HttpError(504, 'La lectura tardó demasiado. Repetí con una foto más cercana y clara.');
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(Math.min(15000, remaining)),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 429) {
        const header = r.headers?.get('retry-after');
        const delay = rateLimitDelay(header, deadline - Date.now());
        if (!rateRetried && delay !== null) {
          rateRetried = true;
          await new Promise(ok => setTimeout(ok, delay));
          attempt--;
          continue;
        }
        const seconds = Math.ceil(Number(header));
        throw new HttpError(429, `Se alcanzó el límite de lecturas de Groq. ${Number.isFinite(seconds) && seconds > 0 ? `Esperá ${seconds} segundos` : 'Esperá un minuto'} y volvé a intentar. El importe no se confirmó.`);
      }
      if (r.status >= 500) {
        lastErr = new HttpError(502, `Groq respondió ${r.status}. Probá de nuevo en unos segundos.`);
        await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
        continue;
      }
      const json = await r.json();
      if (!r.ok) throw new HttpError(502, `Groq: ${json?.error?.message || r.statusText}`);
      return json.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status !== 502) throw err;
      await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Quita bloques <think> y fences de código que algunos modelos agregan. */
export function cleanModelText(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export function parseJsonLoose(text) {
  // quita comentarios // que el modelo a veces copia del esquema
  const clean = cleanModelText(text).replace(/,?\s*\/\/[^\n"]*$/gm, (m) => (m.startsWith(',') ? ',' : ''));
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start > -1 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error('El modelo no devolvió un JSON válido.');
  }
}

/**
 * @param {string} dataUrl imagen en data URL (image/jpeg base64)
 */
export async function readTicket(dataUrl, { estudios = [], originalImage = dataUrl } = {}) {
  const model = VISION_MODEL();
  const deadline = Date.now() + 52000;
  // Preserve ink colour and faint strokes; contrast is a supporting view, not a replacement.
  const images = [{ type: 'image_url', image_url: { url: originalImage } }];

  let data;
  let lastError;
  for (let i = 0; i < 2 && !data; i++) {
    try {
      const out = await callGroq({
        model,
        temperature: 0,
        max_completion_tokens: 2048,
        // 2º intento sin JSON mode: algunos modelos fallan la validación estricta y el parser tolerante lo resuelve.
        ...(i === 0 ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: 'Respondés únicamente con JSON válido, sin texto adicional.' },
          { role: 'user', content: [{ type: 'text', text: EXTRACT_PROMPT(estudios) }, ...images] },
        ],
      }, { deadline });
      data = parseJsonLoose(out);
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && err.status === 429) throw err;
    }
  }
  if (!data) throw new HttpError(502, lastError?.message || 'No se pudo interpretar el ticket.');
  const ocr = cleanModelText(data.texto_leido || '');
  if (ocr.length < 8) throw new HttpError(422, 'No se detectó texto suficiente. Repetí la foto más cerca del papel.');
  let amountReview = null;
  if (data.recibo || data.transferencia) {
    try {
      let amountImage = { url: originalImage, focused: false };
      try { amountImage = await prepareAmountImage(originalImage, data.importe_bbox, data.rotacion); } catch { /* Invalid crop: use original. */ }
      const amountPrompt = `Leé exclusivamente el campo de importe en esta imagen. Está ampliado; mirá cada dígito sin inventar. El símbolo $ no es 4. Si hay =, el total es la cifra de la derecha, sin sumar ambos lados. Un ticket de gasto no es un recibo de viáticos. Devolvé los importes como TEXTO, conservando punto de miles y coma decimal: no los conviertas a números JSON. Si no se ve la etiqueta o los dígitos son ambiguos, monto_texto=null y confianza menor a 0.5. Respondé JSON: {"campo":"recibo|transferencia|otro", "monto_texto":"cifra final literal sin símbolo $ o null", "literal":"solo la expresión completa del importe sin datos personales", "confianza": número entre 0 y 1}.`;
      const checkImage = async (url) => {
      const output = await callGroq({ model, temperature: 0, max_completion_tokens: 768,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: amountPrompt },
          { type: 'image_url', image_url: { url } },
        ] }],
      }, { retries: 0, deadline });
      return parseJsonLoose(output);
      };
      const check = await checkImage(amountImage.url);
      const candidate = check.monto_texto ?? check.monto;
      const expectedField = data.recibo ? 'recibo' : 'transferencia';
      amountReview = verifyAmount(data.recibo?.total ?? data.transferencia?.monto, candidate,
        data.recibo?.monto_detalle, check.confianza);
      amountReview.status = candidate == null ? 'unreadable' : 'checked';
      if (check.campo && check.campo !== expectedField) amountReview.confirmed = false;
      if (check.literal && !verifyAmount(candidate, candidate, check.literal, check.confianza).confirmed) amountReview.confirmed = false;
      if (!amountReview.confirmed && amountImage.focused && candidate != null && check.campo === expectedField) {
        const contrast = await prepareAmountImage(originalImage, data.importe_bbox, data.rotacion, true);
        const other = await checkImage(contrast.url);
        const agreement = verifyVisualReadings(check, other, expectedField);
        if (agreement.confirmed && other.campo === expectedField && typeof check.literal === 'string' && check.literal.length < 160) {
          // Two focused views must agree, including the literal amount expression.
          amountReview = { ...agreement, extracted: amountReview.extracted, checked: parseAmount(candidate), corrected: true, status: 'focused',
            message: 'El importe se releyó en dos imágenes ampliadas. Comparalo con la foto antes de guardar.' };
          if (data.recibo) { data.recibo.total = agreement.checked; data.recibo.monto_detalle = check.literal; }
          else data.transferencia.monto = agreement.checked;
        }
      }
    } catch (err) {
      amountReview = verifyAmount(data.recibo?.total ?? data.transferencia?.monto, null, data.recibo?.monto_detalle);
      amountReview.status = 'unavailable';
      amountReview.unavailableReason = err instanceof HttpError ? err.message : 'No se pudo interpretar la comprobación del importe.';
    }
    if (!amountReview.confirmed) {
      data.confianza = { ...data.confianza, total: 0.4 };
    }
  }
  return { data, ocr, model, amountReview };
}

/** Independent readings of a user-selected money line, without previous guesses. */
export async function rereadAmount(image, field) {
  const deadline = Date.now() + 42000;
  const model = VISION_MODEL();
  const color = await prepareAmountImage(image, null, 0);
  const contrast = await prepareAmountImage(image, null, 0, true);
  const prompt = `Transcribí únicamente el importe de este recorte. Incluye la etiqueta del campo. El signo $ no es un 4. Si hay =, conservá la expresión completa y tomá solo el resultado a la derecha. Nunca sumes importes ni uses el TOTAL de un ticket adjunto como importe de un recibo. Devolvé JSON: {"campo":"recibo|transferencia|otro", "monto_texto":"importe literal con separadores argentinos o null", "literal":"expresión completa del importe, sin nombres ni firmas", "confianza":0.0}. Si no se reconoce la etiqueta o cualquier dígito es dudoso, monto_texto=null. Leé cada dígito visualmente, sin completar por contexto.`;
  const read = async (url) => parseJsonLoose(await callGroq({ model, temperature: 0, max_completion_tokens: 512,
    response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url } }] }],
  }, { retries: 0, deadline }));
  // Sequential calls respect limited free-tier request quotas.
  const first = await read(color.url);
  const second = await read(contrast.url);
  const review = verifyVisualReadings(first, second, field);
  // Real handwriting benchmark: the same model repeated the same wrong digit twice.
  // Agreement is evidence for review, not grounds to overwrite a financial total.
  return { amount: null, suggestedAmount: review.confirmed ? review.checked : null,
    amountReview: { ...review, confirmed: false, readingsAgree: review.confirmed, status: 'selected_region',
    message: review.confirmed ? 'Las lecturas del recorte coinciden, pero pueden repetir el mismo error. Compará las cifras con la foto e ingresá el importe correcto.' : 'El recorte sigue siendo ambiguo. Ingresá el importe que ves en el recibo o repetí la foto.' }, model };
}
