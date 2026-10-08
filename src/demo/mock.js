// =====================================================================
//  MODO DEMO: backend simulado en el navegador (Supabase + /api).
//  Solo se incluye cuando se compila con VITE_DEMO=1.
//  Datos inventados. No se conecta a ningún servicio.
// =====================================================================
import { normalizeDocument } from '../../shared/ticket-rules.js';

export const DEMO_URL = 'https://demo.iic.local';

const TZ = 'America/Argentina/Cordoba';
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16));

/* ----------------------------- usuarios ----------------------------- */
const USERS = [
  { id: 'a0000000-0000-4000-8000-000000000001', email: 'pautasso@iic-demo.com', full_name: 'Dr. Pautasso', role: 'admin' },
  { id: 'a0000000-0000-4000-8000-000000000002', email: 'administracion@iic-demo.com', full_name: 'Lucía Moyano', role: 'administracion' },
  { id: 'a0000000-0000-4000-8000-000000000003', email: 'recepcion@iic-demo.com', full_name: 'Ana Ferreyra', role: 'administracion' },
];
export const DEMO_LOGINS = { admin: USERS[0].email, administracion: USERS[1].email };

/* ------------------------------ datos ------------------------------- */
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function seed() {
  const r = rng(20261008);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const estudios = ['I8F-MC-GPLL', 'J1P-MC-KFAE', 'H9X-MC-GBHD', 'B7R-ON-TLMA'];
  const letras = 'ABCDEFGHJLMNPRSTV';
  const pacientes = [];
  estudios.forEach((e, ei) => {
    const n = [9, 7, 6, 4][ei];
    for (let i = 0; i < n; i++) {
      pacientes.push({ estudio: e, iniciales: pick(letras) + pick(letras), numero: String(1001 + ei * 100 + i), visita: 3 + Math.floor(r() * 14) });
    }
  });
  const comercios = [['YPF', 'Combustible'], ['Shell', 'Combustible'], ['Axion', 'Combustible'], ['Caminos de las Sierras', 'Peaje'], ['Taxi', 'Viaje'], ['Bus TAC', 'Pasaje'], ['Remis', 'Viaje']];
  const tickets = [];
  const today = todayISO();
  for (let d = 34; d >= 0; d--) {
    const dia = addDays(today, -d);
    const dow = new Date(dia + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const count = d === 0 ? 3 : 2 + Math.floor(r() * 5);
    for (let k = 0; k < count; k++) {
      const p = pick(pacientes);
      p.visita += 1;
      const nG = r() < 0.75 ? 1 + Math.floor(r() * 2) : 0;
      const gastos = Array.from({ length: nG }, () => {
        const [comercio, desc] = pick(comercios);
        return { comercio, descripcion: desc, fecha: dia, medio_pago: pick(['Efectivo', 'Débito', 'Efectivo']), importe: Math.round((desc === 'Combustible' ? 40000 + r() * 110000 : 2500 + r() * 18000) / 10) * 10 };
      });
      const viatico = r() < 0.85;
      const desayuno = r() < 0.6;
      const base = gastos.reduce((a, g) => a + g.importe, 0);
      const total = base + (viatico ? 9000 : 0) + (desayuno ? 2900 : 0);
      const nowHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
      const maxHour = d === 0 ? Math.max(8, Math.min(16, nowHour - 1)) : 16;
      const hour = 8 + Math.floor(Math.pow(r(), 1.4) * (maxHour - 7));
      const created = new Date(`${dia}T${String(hour).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:00-03:00`).toISOString();
      const anulado = r() < 0.03;
      const enviado = d >= 1; // lo de días anteriores ya salió en el envío de las 20 h
      tickets.push({
        id: uuid(), created_at: created, updated_at: created, created_by: pick([USERS[1].id, USERS[2].id, USERS[1].id]),
        fecha_comprobante: dia, tipo_comprobante: 'Recibo de viáticos', concepto: 'Reintegro de viáticos',
        estudio: p.estudio, visita: `V${p.visita}`, paciente_iniciales: p.iniciales, paciente_numero: p.numero,
        monto_detalle: gastos.length ? `$${base.toLocaleString('es-AR')} = $${total.toLocaleString('es-AR')}` : `$${total.toLocaleString('es-AR')}`,
        adjunta_comprobantes: gastos.length > 0, recibe_viatico: viatico, desayuno,
        comprobantes_adjuntos: gastos, total, medio_pago: r() < 0.8 ? 'Transferencia' : 'Efectivo',
        nro_operacion: null, pago: null, image_paths: [], image_path: null, datos_ocultos: 0,
        raw_text: null, extraction: null, confidence: 0.85 + r() * 0.14, model: 'demo',
        status: anulado ? 'anulado' : enviado ? 'enviado' : 'cargado',
        anulado_motivo: anulado ? 'Cargado dos veces' : null,
        sent_at: enviado && !anulado ? new Date(new Date(created).getTime() + 10 * 3600e3).toISOString() : null,
        report_id: null, notas: null,
      });
    }
  }
  const reports = [];
  for (let d = 30; d >= 1; d--) {
    const dia = addDays(today, -d);
    const items = tickets.filter((t) => t.fecha_comprobante === dia && t.status === 'enviado');
    if (!items.length) continue;
    reports.push({
      id: uuid(), created_at: new Date(`${dia}T20:00:00-03:00`).toISOString(), sent_by: null, trigger_kind: 'automatico',
      recipients: ['contadora@estudio-ejemplo.com'], period_from: dia, period_to: dia,
      ticket_count: items.length, total_amount: items.reduce((a, t) => a + t.total, 0), status: 'enviado', error: null,
    });
  }
  reports.reverse();
  return {
    profiles: USERS.map((u) => ({ ...u, active: true, created_at: new Date(Date.now() - 40 * 86400e3).toISOString() })),
    tickets,
    email_reports: reports,
    settings: [
      { key: 'instituto', value: { nombre: 'Instituto de Investigaciones Clínicas de Córdoba', responsable: 'Dr. Pautasso', cuit: '30710851111' } },
      { key: 'contadora', value: { nombre: 'Cra. Laura Gómez', email: 'contadora@estudio-ejemplo.com', cc: [] } },
      { key: 'envio_automatico', value: { activo: true, hora: '20:00' } },
      { key: 'estudios', value: { lista: estudios } },
    ],
  };
}

let db = null;      // se crea al instalar la demo
let session = null;

/* ------------------------- respuestas IA demo ------------------------ */
const SCANS = {
  recibo: {
    tipo_documento: 'recibo_viatico', rotacion: 270,
    recibo: { estudio: 'IBF-MC-GPLL', visita: 'v19', paciente_iniciales: 'FA', paciente_numero: null, fecha: '06/10/2026',
      monto_detalle: '$152.034 = $163.934', total: 163934, adjunta_comprobantes: true, recibe_viatico: true, desayuno: true },
    gastos: [{ comercio: 'YPF', descripcion: 'Infinia Diesel 57 lts', fecha: null, medio_pago: 'Efectivo', importe: '146034,00' }],
    datos_personales: [{ tipo: 'firma', texto: null, bbox: [364, 155, 478, 249] }],
    confianza: { general: 0.86, total: 0.9, estudio: 0.68, visita: 0.95, paciente: 0.62 },
    observaciones: 'No se ve el número de paciente junto a las iniciales.',
    ocr: 'Recibí la suma de $152.034 = $163.934 pesos\nEn concepto de reintegro de viáticos V19 correspondiente al estudio IBF-MC-GPLL\nAdjunto comprobantes [SI] Recibe Viático [SI] Desayuno [SI]\n[FIRMA]  Aclaración: FA  Fecha: 06/10/2026\n---\nINFINIA DIESEL 57,0000 u x 2562,0000  146034,00\nTOTAL 146034,00  Efectivo',
  },
  transferencia: {
    tipo_documento: 'comprobante_transferencia', rotacion: 0,
    transferencia: { monto: '$ 163.934', fecha: '6/octubre/2026', hora: '12:10', nro_operacion: '100200300400', motivo: 'Varios', plataforma: 'Mercado Pago' },
    datos_personales: [
      { tipo: 'nombre', texto: 'Juan Pérez', bbox: [224, 455, 474, 485] },
      { tipo: 'cuenta', texto: null, bbox: [228, 482, 462, 498] },
      { tipo: 'cuenta', texto: '0000000000000012345678', bbox: [234, 494, 620, 517] },
      { tipo: 'cuit', texto: '20-30000000-1', bbox: [234, 515, 548, 537] },
    ],
    confianza: { general: 0.96, total: 0.98 },
    observaciones: null,
    ocr: 'Comprobante de transferencia\n6/octubre/2026 a las 12:10\n$ 163.934\nMotivo: Varios\nInstituto De Investigaciones Clinica Cord\nCVU: [CUENTA OCULTA]\nCUIT/CUIL: 30-71085111-1\n[DATO OCULTO]\nCBU: [CUENTA OCULTA]\nCUIT/CUIL: [CUIT OCULTO]\nN.° de operación de Mercado Pago 100200300400',
  },
};

/* --------------------------- utilidades HTTP -------------------------- */
const json = (data, status = 200, headers = {}) =>
  new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

function withProfiles(table, rows, select = '') {
  if (!select.includes('profiles:')) return rows;
  const key = table === 'email_reports' ? 'sent_by' : 'created_by';
  return rows.map((r) => {
    const p = db.profiles.find((x) => x.id === r[key]);
    return { ...r, profiles: p ? { full_name: p.full_name, email: p.email } : null };
  });
}

function parseCond(col, raw) {
  const i = raw.indexOf('.');
  const op = raw.slice(0, i);
  const val = raw.slice(i + 1);
  return (row) => {
    const v = row[col];
    switch (op) {
      case 'eq': return String(v) === val;
      case 'neq': return String(v) !== val;
      case 'gte': return v != null && String(v) >= val;
      case 'lte': return v != null && String(v) <= val;
      case 'gt': return v != null && String(v) > val;
      case 'lt': return v != null && String(v) < val;
      case 'is': return val === 'null' ? v == null : String(v) === val;
      case 'in': {
        const list = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
        return list.includes(String(v));
      }
      case 'ilike': case 'like': {
        const needle = val.replace(/[%*]/g, '').toLowerCase();
        return v != null && String(v).toLowerCase().includes(needle);
      }
      default: return true;
    }
  };
}

function applyFilters(rows, params) {
  const conds = [];
  for (const [k, v] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or') {
      const parts = v.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/);
      const ors = parts.map((p) => { const j = p.indexOf('.'); return parseCond(p.slice(0, j), p.slice(j + 1)); });
      conds.push((row) => ors.some((f) => f(row)));
    } else {
      conds.push(parseCond(k, v));
    }
  }
  return rows.filter((r) => conds.every((f) => f(r)));
}

function applyOrder(rows, order) {
  if (!order) return rows;
  const specs = order.split(',').map((s) => { const [col, dir, nulls] = s.split('.'); return { col, desc: dir === 'desc', nullsFirst: nulls === 'nullsfirst' }; });
  return [...rows].sort((a, b) => {
    for (const s of specs) {
      const x = a[s.col], y = b[s.col];
      if (x == null && y == null) continue;
      if (x == null) return s.nullsFirst ? -1 : 1;
      if (y == null) return s.nullsFirst ? 1 : -1;
      if (x < y) return s.desc ? 1 : -1;
      if (x > y) return s.desc ? -1 : 1;
    }
    return 0;
  });
}

function canSee(table) {
  const me = db.profiles.find((p) => p.id === session?.user?.id);
  if (!me) return false;
  if (table === 'profiles') return true;
  return me.active;
}

/* --------------------------- estadísticas --------------------------- */
function stats(from, to) {
  const base = db.tickets.filter((t) => t.status !== 'anulado' && t.fecha_comprobante >= from && t.fecha_comprobante <= to);
  const sum = (a) => a.reduce((s, t) => s + Number(t.total), 0);
  const group = (fn, extra) => {
    const m = new Map();
    base.forEach((t) => { const k = fn(t); if (k == null) return; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    return [...m.entries()].map(([nombre, list]) => ({ nombre, total: sum(list), cantidad: list.length, ...(extra ? extra(list) : {}) }));
  };
  const byTotal = (a) => a.sort((x, y) => y.total - x.total);
  const pacKey = (t) => `${t.estudio || ''}|${t.paciente_numero || t.paciente_iniciales || t.id}`;
  const hora = (t) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(t.created_at)));
  return {
    total: sum(base), cantidad: base.length, promedio: base.length ? Math.round((sum(base) / base.length) * 100) / 100 : 0,
    pendientes: base.filter((t) => t.status === 'cargado').length,
    pendientes_total: sum(base.filter((t) => t.status === 'cargado')),
    pacientes: new Set(base.map(pacKey)).size,
    con_viatico: base.filter((t) => t.recibe_viatico).length,
    con_desayuno: base.filter((t) => t.desayuno).length,
    con_comprobantes: base.filter((t) => t.adjunta_comprobantes).length,
    gastos_adjuntos: base.reduce((s, t) => s + (t.comprobantes_adjuntos || []).reduce((a, g) => a + (Number(g.importe) || 0), 0), 0),
    por_dia: group((t) => t.fecha_comprobante).map((x) => ({ dia: x.nombre, total: x.total, cantidad: x.cantidad })).sort((a, b) => (a.dia < b.dia ? -1 : 1)),
    por_estudio: byTotal(group((t) => t.estudio || 'Sin estudio', (l) => ({ pacientes: new Set(l.map(pacKey)).size }))),
    por_visita: group((t) => t.visita || 'Sin visita').sort((a, b) => b.cantidad - a.cantidad).slice(0, 12),
    por_paciente: byTotal(group((t) => (t.paciente_iniciales || t.paciente_numero ? `${t.estudio}|${t.paciente_iniciales || ''} ${t.paciente_numero || ''}`.trim() : null),
      (l) => ({ estudio: l[0].estudio || '—', ultima_visita: [...l].sort((a, b) => (a.fecha_comprobante < b.fecha_comprobante ? 1 : -1))[0].visita })))
      .map((x) => ({ ...x, nombre: x.nombre.split('|')[1] })).slice(0, 15),
    por_medio_pago: byTotal(group((t) => t.medio_pago || 'Sin dato')),
    por_operador: group((t) => db.profiles.find((p) => p.id === t.created_by)?.full_name || '—').sort((a, b) => b.cantidad - a.cantidad),
    por_hora: group(hora).map((x) => ({ hora: x.nombre, cantidad: x.cantidad })),
  };
}

/* ------------------------------ handlers ----------------------------- */
async function handleRest(url, init) {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  const path = url.pathname.replace('/rest/v1/', '');
  const body = init.body ? JSON.parse(init.body) : null;

  if (path === 'rpc/ticket_stats') return json(stats(body.p_from, body.p_to));

  const table = path;
  if (!db[table]) return json({ message: `Tabla ${table} no existe en la demo` }, 404);
  if (!canSee(table)) return json([]);
  const wantsObject = (headers.get('Accept') || '').includes('vnd.pgrst.object');
  const select = url.searchParams.get('select') || '';
  const pk = table === 'settings' ? 'key' : 'id';

  if (method === 'GET' || method === 'HEAD') {
    let rows = applyFilters(db[table], url.searchParams);
    rows = applyOrder(rows, url.searchParams.get('order'));
    const total = rows.length;
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : rows.length;
    rows = withProfiles(table, rows.slice(offset, offset + limit), select);
    const range = { 'content-range': `${offset}-${offset + rows.length - 1}/${total}` };
    if (wantsObject) return rows.length === 1 ? json(rows[0], 200, range) : json({ code: 'PGRST116', message: 'No rows' }, 406);
    return json(rows, 200, range);
  }

  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const upsert = (headers.get('Prefer') || '').includes('merge-duplicates');
    const out = [];
    for (const item of list) {
      if (upsert) {
        const i = db[table].findIndex((r) => r[pk] === item[pk]);
        if (i > -1) { db[table][i] = { ...db[table][i], ...item }; out.push(db[table][i]); continue; }
      }
      const row = table === 'tickets'
        ? { id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: session.user.id, status: 'cargado', paciente_nombre: null, paciente_dni: null, ...item }
        : { id: uuid(), created_at: new Date().toISOString(), ...item };
      if (table === 'tickets') {
        row.paciente_nombre = null; row.paciente_dni = null;
        row.estudio = row.estudio ? String(row.estudio).toUpperCase().replace(/\s/g, '') : null;
        row.visita = row.visita ? String(row.visita).toUpperCase().trim() : null;
      }
      db[table].unshift(row);
      out.push(row);
    }
    const rows = withProfiles(table, out, select);
    return json(wantsObject ? rows[0] : rows, 201);
  }

  if (method === 'PATCH') {
    const rows = applyFilters(db[table], url.searchParams);
    rows.forEach((r) => Object.assign(r, body, { updated_at: new Date().toISOString() }));
    return json(wantsObject ? rows[0] : rows);
  }

  if (method === 'DELETE') {
    const rows = applyFilters(db[table], url.searchParams);
    db[table] = db[table].filter((r) => !rows.includes(r));
    return json(rows);
  }
  return json({ message: 'Método no soportado' }, 405);
}

function makeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'demo.' + btoa(user.id), token_type: 'bearer', expires_in: 3600 * 24, expires_at: now + 3600 * 24, refresh_token: 'demo-refresh',
    user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: user.full_name } },
  };
}

async function handleAuth(url, init) {
  const p = url.pathname.replace('/auth/v1/', '');
  if (p === 'token') {
    const body = JSON.parse(init.body || '{}');
    if (url.searchParams.get('grant_type') === 'refresh_token' && session) return json(session);
    const u = db.profiles.find((x) => x.email === String(body.email || '').toLowerCase());
    if (!u || !u.active) return json({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
    session = makeSession(u);
    return json(session);
  }
  if (p === 'user') return session ? json(session.user) : json({ msg: 'no session' }, 401);
  if (p === 'logout') { session = null; return new Response(null, { status: 204 }); }
  return json({});
}

async function handleApi(url, init) {
  const name = url.pathname.replace('/api/', '');
  const body = init.body ? JSON.parse(init.body) : {};
  const me = db.profiles.find((p) => p.id === session?.user?.id);
  if (!me) return json({ error: 'Sesión no encontrada. Volvé a iniciar sesión.' }, 401);

  if (name === 'scan-ticket') {
    await wait(3400);
    const kind = window.__demoNext || 'recibo';
    const s = SCANS[kind];
    const estudios = db.settings.find((x) => x.key === 'estudios')?.value?.lista || [];
    const doc = normalizeDocument(s, { estudios });
    const r = doc.recibo;
    const dup = r && db.tickets.find((t) => t.status !== 'anulado' && t.estudio === r.estudio && t.paciente_numero && t.paciente_numero === r.paciente_numero && t.visita === r.visita);
    return json({
      doc: { ...doc, datos_personales: doc.datos_personales.map(({ tipo, box }) => ({ tipo, box })) },
      duplicate: dup ? { id: dup.id, created_at: dup.created_at, total: dup.total } : null,
      confidence: s.confianza.general,
      fieldConfidence: {
        total: s.confianza.total, estudio: Math.min(s.confianza.estudio ?? 0.9, 0.7), visita: s.confianza.visita ?? 0.9,
        paciente_iniciales: s.confianza.paciente ?? 0.9, paciente_numero: s.confianza.paciente ?? 0.9,
      },
      observaciones: s.observaciones, raw_text: s.ocr, model: 'demo', ms: 3400,
    });
  }

  if (name === 'send-report') {
    await wait(1400);
    const contadora = db.settings.find((x) => x.key === 'contadora')?.value || {};
    if (!contadora.email) return json({ error: 'Configurá el email de la contadora en Configuración antes de enviar.' }, 400);
    let items = db.tickets.filter((t) => t.status !== 'anulado');
    if (body.ticketIds?.length) items = items.filter((t) => body.ticketIds.includes(t.id));
    else if (body.mode !== 'rango' && !body.from) items = items.filter((t) => t.status === 'cargado');
    if (body.from) items = items.filter((t) => t.fecha_comprobante >= body.from);
    if (body.to) items = items.filter((t) => t.fecha_comprobante <= body.to);
    if (me.role !== 'admin') return json({ error: 'El envío es automático a las 20 h.' }, 403);
    if (!items.length) return json({ sent: false, reason: 'No hay recibos para enviar en ese criterio.', count: 0 });
    const total = items.reduce((a, t) => a + Number(t.total), 0);
    const dates = items.map((t) => t.fecha_comprobante).sort();
    const rep = { id: uuid(), created_at: new Date().toISOString(), sent_by: me.id, trigger_kind: body.kind || 'reenvio', recipients: [contadora.email, ...(contadora.cc || [])],
      period_from: body.from || dates[0], period_to: body.to || dates[dates.length - 1], ticket_count: items.length, total_amount: total, status: 'enviado', error: null };
    db.email_reports.unshift(rep);
    items.forEach((t) => { if (t.status === 'cargado') Object.assign(t, { status: 'enviado', sent_at: rep.created_at, report_id: rep.id }); });
    return json({ sent: true, count: items.length, total, reportId: rep.id, recipients: rep.recipients });
  }

  if (name === 'users') {
    if (me.role !== 'admin') return json({ error: 'No tenés permisos para esta acción.' }, 403);
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'GET') return json({ users: db.profiles });
    if (method === 'POST') {
      if (db.profiles.some((p) => p.email === body.email?.toLowerCase())) return json({ error: 'Ya existe un usuario con ese email.' }, 400);
      const u = { id: uuid(), email: body.email.toLowerCase(), full_name: body.full_name, role: body.role, active: true, created_at: new Date().toISOString() };
      db.profiles.push(u);
      return json({ user: u });
    }
    const u = db.profiles.find((p) => p.id === body.id);
    if (u) ['full_name', 'role', 'active'].forEach((k) => { if (body[k] !== undefined) u[k] = body[k]; });
    return json({ ok: true });
  }
  return json({ error: 'No disponible en la demo' }, 404);
}

/* ------------------------------ instalación -------------------------- */
export function installDemo() {
  db = seed();
  window.__demoImages = window.__demoImages || {};
  window.__demoNext = null;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    const url = new URL(href, window.location.href);
    const req = typeof input === 'string' ? init : { method: input.method, headers: input.headers, body: init.body, ...init };
    try {
      if (url.origin === DEMO_URL) {
        await wait(120);
        if (url.pathname.startsWith('/rest/v1/')) return handleRest(url, req);
        if (url.pathname.startsWith('/auth/v1/')) return handleAuth(url, req);
        return json({});
      }
      if (url.pathname.startsWith('/api/') && url.origin === window.location.origin) return handleApi(url, req);
    } catch (e) {
      return json({ message: e.message, error: e.message }, 500);
    }
    return realFetch(input, init);
  };
}

/** Almacenamiento de sesión en memoria (el visor puede bloquear localStorage). */
export const memoryStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
})();
