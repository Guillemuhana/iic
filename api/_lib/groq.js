// Lectura del ticket con Groq (modelo de visión) en dos pasadas:
//  1) Transcripción literal de todo el texto visible (OCR).
//  2) Extracción estructurada a JSON usando la imagen + la transcripción.
// Hacerlo en dos pasos reduce mucho los errores en números y montos.

import { HttpError } from './supabase.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const VISION_MODEL = () => process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

const OCR_PROMPT = `Sos un sistema de OCR de alta precisión. La foto es de un documento de un instituto de investigación clínica de Córdoba (Argentina):
puede ser el recibo de reintegro de viáticos (formulario con "Recibí la suma de", "En concepto de reintegro de viáticos", "correspondiente al estudio"),
un ticket de gasto (combustible, peaje, taxi, comida) o un comprobante de transferencia (Mercado Pago, banco).
La foto puede estar girada: leela en la orientación correcta.
Transcribí TODO el texto visible, impreso y manuscrito, línea por línea.
Reglas:
- Copiá números y códigos EXACTAMENTE (importes, códigos de estudio como "I8F-MC-GPLL", visitas como "V19", fechas, n.º de operación).
- En las casillas SI / NO indicá cuál está encerrada o marcada, ej: "Recibe viático: [SI]".
- No transcribas firmas: escribí [FIRMA].
- Si un carácter es ilegible escribí [?].
Respondé solo con la transcripción en texto plano.`;

const EXTRACT_PROMPT = (ocr, estudios = []) => `Analizá la imagen y la transcripción OCR. Extraé los datos en JSON.

TRANSCRIPCIÓN OCR:
"""
${ocr}
"""
${estudios.length ? `\nESTUDIOS ACTIVOS DEL INSTITUTO (el código manuscrito casi seguro es uno de estos): ${estudios.join(', ')}\n` : ''}
Devolvé SOLO un objeto JSON con estas claves (null si no aparece; nunca inventes):
{
  "tipo_documento": "recibo_viatico | comprobante_gasto | comprobante_transferencia | otro  (el documento principal de la foto)",
  "rotacion": 0 | 90 | 180 | 270,   // grados en sentido horario para que el texto quede derecho
  "recibo": {                        // solo si aparece el recibo de reintegro de viáticos
    "estudio": "código escrito en 'correspondiente al estudio', ej I8F-MC-GPLL",
    "visita": "lo escrito después de 'reintegro de viáticos', ej V19",
    "paciente_iniciales": "iniciales escritas en Aclaración, ej FA",
    "paciente_numero": "número de paciente escrito junto a las iniciales en Aclaración, ej 1023",
    "fecha": "dd/mm/aaaa del campo Fecha",
    "monto_detalle": "lo escrito en 'Recibí la suma de' tal cual, ej '$152.034 = $163.934'",
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
- Importes argentinos: punto = miles, coma = decimales. "$ 163.934" => 163934. "146034,00" => 146034. Devolvé números JSON.
- Códigos de estudio manuscritos: cuidado con I/1, 8/B, 0/O, G/6, L/1. Si hay estudios activos, usá el que coincida.
- Si en Aclaración escribieron el nombre completo, devolvé SOLO las iniciales.
- "datos_personales" son datos del PACIENTE o de terceros que hay que tapar en la foto por privacidad:
  la firma del paciente; nombre y apellido; dirección o domicilio; DNI; CUIT/CUIL; CBU, CVU, alias o n.º de cuenta; teléfono; email.
  NO incluyas los datos del Instituto de Investigaciones Clínicas (su nombre, CUIT, CVU) ni importes, fechas, estudio, visita, iniciales o n.º de paciente.
  En un comprobante de transferencia, el destinatario es el paciente: tapá su nombre, banco/cuenta CBU/CVU/alias y CUIT/CUIL.
- "bbox" en coordenadas de la imagen TAL COMO LA RECIBÍS (sin girarla), normalizadas de 0 a 1000: x1,y1 esquina superior izquierda, x2,y2 inferior derecha. Abarcá el dato completo con margen.`;

async function callGroq(body, { retries = 2 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(500, 'Falta GROQ_API_KEY en las variables de entorno.');
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 429 || r.status >= 500) {
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
export async function readTicket(dataUrl, { estudios = [] } = {}) {
  const model = VISION_MODEL();
  const image = { type: 'image_url', image_url: { url: dataUrl } };

  const ocrRaw = await callGroq({
    model,
    temperature: 0,
    max_completion_tokens: 2048,
    messages: [{ role: 'user', content: [{ type: 'text', text: OCR_PROMPT }, image] }],
  });
  const ocr = cleanModelText(ocrRaw);
  if (!ocr || ocr.length < 8) {
    throw new HttpError(422, 'No se detectó texto en la foto. Acercá el teléfono al documento, con buena luz, y volvé a sacarla.');
  }

  let data;
  let lastError;
  for (let i = 0; i < 2 && !data; i++) {
    try {
      const out = await callGroq({
        model,
        temperature: 0,
        max_completion_tokens: 3072,
        // 2º intento sin JSON mode: algunos modelos fallan la validación estricta y el parser tolerante lo resuelve.
        ...(i === 0 ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: 'Respondés únicamente con JSON válido, sin texto adicional.' },
          { role: 'user', content: [{ type: 'text', text: EXTRACT_PROMPT(ocr, estudios) }, image] },
        ],
      });
      data = parseJsonLoose(out);
    } catch (err) {
      lastError = err;
    }
  }
  if (!data) throw new HttpError(502, lastError?.message || 'No se pudo interpretar el ticket.');
  return { data, ocr, model };
}
