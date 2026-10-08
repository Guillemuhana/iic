// Reglas compartidas entre el frontend y la API.
// Documento principal: Recibo de reintegro de viáticos del IIC (estudios clínicos),
// con sus comprobantes adjuntos (tickets de gastos) y el comprobante de transferencia.

/** Valida un CUIT/CUIL con su dígito verificador. */
export function isValidCuit(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = mult.reduce((acc, m, i) => acc + m * Number(digits[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(digits[10]);
}

export function formatCuit(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  if (d.length !== 11) return value ?? '';
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** Importes en formato argentino ("$ 12.345,67", "163.934", "146034,00") a número. */
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : null;
  let s = String(value).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && s.length > 4 ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1) {
    const groups = s.split('.');
    if (groups.length > 2 || (groups.length === 2 && groups[1].length === 3)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

/** "06/10/2026", "6-10-26", "2026-10-06", "6/octubre/2026" → "2026-10-06" */
export function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return toIso(y, +m[2], +m[1]);
  }
  m = s.match(/^(\d{1,2})\s*(?:de\s+|\/|-|\s)\s*([a-zá]{3,})\.?\s*(?:de\s+|\/|-|\s)\s*(\d{4})/);
  if (m && MESES[m[2].slice(0, 3)]) return toIso(+m[3], MESES[m[2].slice(0, 3)], +m[1]);
  return null;
}

function toIso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const MEDIOS_PAGO = ['Transferencia', 'Efectivo', 'Mercado Pago', 'Débito', 'Crédito', 'Otro'];

export const TIPOS_DATO = {
  firma: 'Firma',
  nombre: 'Nombre',
  direccion: 'Dirección',
  documento: 'DNI',
  cuit: 'CUIT/CUIL',
  cuenta: 'CBU/CVU/alias',
  telefono: 'Teléfono',
  email: 'Email',
  otro: 'Dato personal',
};

/* ------------------------------------------------------------------ */
/* Normalizadores                                                      */
/* ------------------------------------------------------------------ */

const str = (v) => {
  if (v === null || v === undefined || typeof v === 'object') return null;
  const s = String(v).trim();
  return s && !/^(null|n\/a|-|—|no visible|desconocido|ninguno|sin dato)$/i.test(s) ? s : null;
};

const bool = (v) => {
  if (v === true || v === false) return v;
  const s = str(v);
  if (!s) return null;
  if (/^(si|sí|s|true|yes|1|x)$/i.test(s)) return true;
  if (/^(no|n|false|0)$/i.test(s)) return false;
  return null;
};

/** Código de protocolo: mayúsculas, sin espacios, guiones normalizados. "i8f - mc - gpll" → "I8F-MC-GPLL" */
export function normalizeEstudioCode(v) {
  const s = str(v);
  if (!s) return null;
  return s.toUpperCase().replace(/[–—_]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}

// Caracteres que se confunden en letra manuscrita
const LOOKALIKE = { I: '1', L: '1', O: '0', Q: '0', D: '0', B: '8', S: '5', Z: '2', G: '6', T: '7', A: '4' };
const canon = (s) => String(s).split('').map((c) => LOOKALIKE[c] || c).join('').replace(/-/g, '');

function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Ajusta el estudio leído al más parecido de la lista de estudios activos.
 * @returns {{ value: string|null, matched: boolean, original: string|null }}
 */
export function matchEstudio(value, known = []) {
  const code = normalizeEstudioCode(value);
  if (!code || !known.length) return { value: code, matched: false, original: code };
  const list = known.map(normalizeEstudioCode).filter(Boolean);
  if (list.includes(code)) return { value: code, matched: true, original: code };
  let best = null;
  let bestD = Infinity;
  for (const k of list) {
    const d = Math.min(distance(canon(code), canon(k)), distance(code.replace(/-/g, ''), k.replace(/-/g, '')));
    if (d < bestD) { bestD = d; best = k; }
  }
  const limit = Math.max(1, Math.floor(best.replace(/-/g, '').length / 4));
  return bestD <= limit ? { value: best, matched: true, original: code } : { value: code, matched: false, original: code };
}

/** "v 19", "Visita 19", "V-19", "19" → "V19". Deja textos como "Screening" en mayúscula inicial. */
export function normalizeVisita(v) {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(?:v(?:isita)?)?\s*[-.#n°º]*\s*(\d{1,3}(?:\.\d{1,2})?)$/i);
  if (m) return `V${m[1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Solo letras de las iniciales. Si escribieron un nombre completo, lo reduce a iniciales. */
export function normalizeIniciales(v) {
  const s = str(v);
  if (!s) return null;
  const clean = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ\s.-]/g, ' ').trim();
  const words = clean.split(/[\s.-]+/).filter(Boolean);
  if (words.length > 1 && words.some((w) => w.length > 2)) return words.map((w) => w[0]).join('').toUpperCase().slice(0, 4);
  return clean.replace(/[\s.-]/g, '').toUpperCase().slice(0, 4) || null;
}

export function normalizePacienteNumero(v) {
  const s = str(v);
  if (!s) return null;
  return s.toUpperCase().replace(/\s+/g, '').replace(/^(N[°º.]?|NRO\.?|#)/, '').slice(0, 20) || null;
}

/**
 * Normaliza la respuesta del modelo para UNA foto.
 * @returns {{ tipo, rotacion, recibo, gastos, transferencia, datos_personales }}
 */
export function normalizeDocument(raw = {}, { estudios = [] } = {}) {
  const tipo = ['recibo_viatico', 'comprobante_gasto', 'comprobante_transferencia'].includes(raw.tipo_documento) ? raw.tipo_documento : 'otro';
  const rot = Number(raw.rotacion);
  const rotacion = [0, 90, 180, 270].includes(rot) ? rot : 0;

  let recibo = null;
  if (raw.recibo && typeof raw.recibo === 'object') {
    const r = raw.recibo;
    const est = matchEstudio(r.estudio, estudios);
    recibo = {
      estudio: est.value,
      estudio_leido: est.original,
      estudio_ajustado: est.matched && est.original !== est.value,
      visita: normalizeVisita(r.visita),
      paciente_iniciales: normalizeIniciales(r.paciente_iniciales),
      paciente_numero: normalizePacienteNumero(r.paciente_numero),
      fecha_comprobante: parseDate(r.fecha),
      monto_detalle: str(r.monto_detalle),
      total: parseAmount(r.total),
      concepto: str(r.concepto) || 'Reintegro de viáticos',
      adjunta_comprobantes: bool(r.adjunta_comprobantes),
      recibe_viatico: bool(r.recibe_viatico),
      desayuno: bool(r.desayuno),
    };
    if (recibo.total === null && recibo.monto_detalle) {
      const amounts = recibo.monto_detalle.match(/\d[\d.,]*/g) || [];
      recibo.total = parseAmount(amounts[amounts.length - 1]);
    }
  }

  const gastos = (Array.isArray(raw.gastos) ? raw.gastos : [])
    .map((g) => ({
      comercio: str(g?.comercio),
      descripcion: str(g?.descripcion),
      fecha: parseDate(g?.fecha),
      medio_pago: str(g?.medio_pago),
      importe: parseAmount(g?.importe),
    }))
    .filter((g) => g.importe !== null || g.comercio || g.descripcion);

  let transferencia = null;
  if (raw.transferencia && typeof raw.transferencia === 'object') {
    const t = raw.transferencia;
    transferencia = {
      monto: parseAmount(t.monto),
      fecha: parseDate(t.fecha),
      hora: str(t.hora),
      nro_operacion: str(t.nro_operacion)?.replace(/\s/g, '') ?? null,
      motivo: str(t.motivo),
      plataforma: str(t.plataforma),
    };
    if (!transferencia.monto && !transferencia.nro_operacion) transferencia = null;
  }

  const datos_personales = (Array.isArray(raw.datos_personales) ? raw.datos_personales : [])
    .map((d) => ({ tipo: TIPOS_DATO[d?.tipo] ? d.tipo : 'otro', texto: str(d?.texto), box: toBox(d?.bbox) }))
    .filter((d) => d.box || d.texto);

  return { tipo, rotacion, recibo, gastos, transferencia, datos_personales };
}

/** bbox [x1,y1,x2,y2] en escala 0–1000 → {x,y,w,h} 0–1 con margen de seguridad. */
export function toBox(b, pad = 0.015) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  let [x1, y1, x2, y2] = b.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const scale = Math.max(x1, y1, x2, y2) <= 1.0001 ? 1 : 1000;
  [x1, y1, x2, y2] = [x1, y1, x2, y2].map((v) => v / scale);
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  x1 = Math.max(0, x1 - pad); y1 = Math.max(0, y1 - pad);
  x2 = Math.min(1, x2 + pad); y2 = Math.min(1, y2 + pad);
  if (x2 - x1 < 0.01 || y2 - y1 < 0.005) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function emptyTicket() {
  return {
    tipo_comprobante: 'Recibo de viáticos',
    concepto: 'Reintegro de viáticos',
    estudio: null, visita: null, paciente_iniciales: null, paciente_numero: null,
    fecha_comprobante: null, monto_detalle: null, total: null,
    adjunta_comprobantes: null, recibe_viatico: null, desayuno: null,
    medio_pago: null, nro_operacion: null, pago: null,
    comprobantes_adjuntos: [], notas: '',
  };
}

/** Incorpora lo leído en una foto al comprobante que se está armando. */
export function mergeDocument(ticket, doc) {
  const t = { ...ticket, comprobantes_adjuntos: [...(ticket.comprobantes_adjuntos || [])] };
  if (doc.recibo) {
    for (const [k, v] of Object.entries(doc.recibo)) {
      if (['estudio_leido', 'estudio_ajustado'].includes(k)) continue;
      const empty = t[k] === null || t[k] === undefined || t[k] === '';
      if (v !== null && v !== undefined && empty) t[k] = v;
    }
  }
  for (const g of doc.gastos || []) {
    const dup = t.comprobantes_adjuntos.some((x) => x.importe === g.importe && (x.comercio || '') === (g.comercio || ''));
    if (!dup) t.comprobantes_adjuntos.push(g);
  }
  if (doc.transferencia) {
    t.pago = doc.transferencia;
    t.medio_pago = t.medio_pago || 'Transferencia';
    t.nro_operacion = t.nro_operacion || doc.transferencia.nro_operacion;
    if (t.total === null || t.total === undefined) t.total = doc.transferencia.monto;
    if (!t.fecha_comprobante) t.fecha_comprobante = doc.transferencia.fecha;
  }
  if (t.adjunta_comprobantes === null && t.comprobantes_adjuntos.length) t.adjunta_comprobantes = true;
  return t;
}

/**
 * Revisa la coherencia del comprobante. Devuelve [{ field, level: 'error'|'warn', message }].
 */
export function checkTicket(t) {
  const out = [];
  const today = new Date();
  if (t.total === null || t.total === undefined || Number.isNaN(Number(t.total))) {
    out.push({ field: 'total', level: 'error', message: 'Falta el importe recibido.' });
  } else if (Number(t.total) <= 0) {
    out.push({ field: 'total', level: 'warn', message: 'El importe es cero o negativo.' });
  }
  if (!t.estudio) out.push({ field: 'estudio', level: 'warn', message: 'Falta el estudio.' });
  if (!t.visita) out.push({ field: 'visita', level: 'warn', message: 'Falta la visita (ej. V19).' });
  if (!t.paciente_iniciales) out.push({ field: 'paciente_iniciales', level: 'warn', message: 'Faltan las iniciales del paciente.' });
  if (!t.paciente_numero) out.push({ field: 'paciente_numero', level: 'warn', message: 'Falta el n.º de paciente (va junto a las iniciales).' });
  if (!t.fecha_comprobante) {
    out.push({ field: 'fecha_comprobante', level: 'warn', message: 'Falta la fecha.' });
  } else {
    const d = new Date(t.fecha_comprobante + 'T12:00:00');
    if (d.getTime() > today.getTime() + 86400000) out.push({ field: 'fecha_comprobante', level: 'warn', message: 'La fecha es futura.' });
    if (today.getTime() - d.getTime() > 400 * 86400000) out.push({ field: 'fecha_comprobante', level: 'warn', message: 'La fecha tiene más de un año.' });
  }
  if (t.pago?.monto && t.total && Math.abs(Number(t.pago.monto) - Number(t.total)) > 1) {
    out.push({ field: 'total', level: 'warn', message: `La transferencia es de $${Number(t.pago.monto).toLocaleString('es-AR')} y el recibo dice $${Number(t.total).toLocaleString('es-AR')}.` });
  }
  if (t.adjunta_comprobantes === true && !(t.comprobantes_adjuntos || []).length) {
    out.push({ field: 'comprobantes_adjuntos', level: 'warn', message: 'El recibo dice que adjunta comprobantes. Sacales foto con "Agregar foto".' });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ocultamiento de datos personales en texto                          */
/* ------------------------------------------------------------------ */

/**
 * Oculta datos personales en el texto leído (para no guardarlos en la base).
 * @param {string} text
 * @param {string[]} sensitive textos detectados por la IA (nombre, dirección, etc.)
 * @param {string[]} keepCuits CUITs que se pueden mostrar (el del instituto)
 */
export function maskPersonalText(text, sensitive = [], keepCuits = []) {
  if (!text) return text;
  let out = String(text);
  const keep = new Set(keepCuits.map((c) => String(c).replace(/\D/g, '')).filter(Boolean));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const s of [...sensitive].filter((x) => x && x.length >= 3).sort((a, b) => b.length - a.length)) {
    const pattern = escape(s.trim()).replace(/\s+/g, '\\s*');
    out = out.replace(new RegExp(pattern, 'gi'), '[DATO OCULTO]');
  }
  // CBU / CVU (22 dígitos)
  out = out.replace(/\b\d[\d\s]{20,30}\d\b/g, (m) => (m.replace(/\s/g, '').length === 22 ? '[CUENTA OCULTA]' : m));
  // CUIT / CUIL
  out = out.replace(/\b\d{2}[-\s.]?\d{7,8}[-\s.]?\d\b/g, (m) => {
    const d = m.replace(/\D/g, '');
    return d.length === 11 && !keep.has(d) ? '[CUIT OCULTO]' : m;
  });
  // DNI explícito
  out = out.replace(/(D\.?N\.?I\.?:?\s*)\d{1,2}\.?\d{3}\.?\d{3}/gi, '$1[OCULTO]');
  // Alias, email y teléfono
  out = out.replace(/(alias:?\s*)[\w.-]+/gi, '$1[OCULTO]');
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL OCULTO]');
  out = out.replace(/(tel[ée]?f?o?n?o?\.?:?\s*)[+\d][\d\s-]{6,}/gi, '$1[OCULTO]');
  return out;
}
