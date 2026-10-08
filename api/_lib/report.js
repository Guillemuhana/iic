import ExcelJS from 'exceljs';
import { weeklyWindow } from '../../shared/report-schedule.js';
import nodemailer from 'nodemailer';
import { supabaseAdmin, getSetting, HttpError } from './supabase.js';
import { savedReimbursementError } from '../../shared/save-validation.js';

const TZ = 'America/Argentina/Cordoba';

const money = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(Number(n) || 0);

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export function todayCordoba() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/**
 * Arma y envía el reporte a la contadora.
 * @param {object} opts
 * @param {'pendientes'|'rango'} opts.mode pendientes = todos los no enviados; rango = todos los del período (reenvío)
 * @param {string} [opts.from] aaaa-mm-dd
 * @param {string} [opts.to]   aaaa-mm-dd
 * @param {string} [opts.sentBy] id del usuario
 * @param {string} [opts.kind] manual | cierre | automatico
 * @param {string[]} [opts.ticketIds] envío de tickets puntuales
 */
export async function sendAccountantReport({ mode = 'pendientes', from, to, sentBy = null, kind = 'manual', ticketIds, day, weekly } = {}) {
  const sb = supabaseAdmin();
  const contadora = { ...((await getSetting('contadora')) || {}) };
  contadora.email = process.env.ACCOUNTANT_EMAIL || contadora.email || 'estudiocaballerosalva@gmail.com';
  const instituto = (await getSetting('instituto')) || {};
  const recipients = [contadora.email, ...(contadora.cc || [])].map((e) => String(e || '').trim()).filter(Boolean);
  if (!recipients.length) throw new HttpError(400, 'Configurá el email de la contadora en Configuración antes de enviar.');

  let q = sb
    .from('tickets')
    .select('*, profiles:created_by(full_name, email)')
    .neq('status', 'anulado')
    .order('fecha_comprobante', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (weekly) q = q.lt('created_at', weekly.end).or(`created_at.gte.${weekly.start},status.eq.cargado`);
  else if (ticketIds?.length) q = q.in('id', ticketIds);
  else if (mode === 'pendientes') q = q.eq('status', 'cargado');
  if (from) q = q.gte('fecha_comprobante', from);
  if (to) q = q.lte('fecha_comprobante', to);

  // Fetch every row: Supabase defaults to 1000 per request.
  const candidates = [];
  q = q.order('id', { ascending: true });
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new HttpError(500, error.message);
    candidates.push(...data);
    if (data.length < 1000) break;
  }
  const tickets = candidates.filter(t => !savedReimbursementError(t));
  const excluded = candidates.length - tickets.length;
  tickets.sort((a, b) => (a.estudio || '').localeCompare(b.estudio || '', 'es')
    || (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
  if (!tickets.length) return { sent: false, reason: excluded ? `${excluded} reintegro(s) requieren revisión y no se enviaron.` : 'No hay tickets para enviar en ese criterio.', count: 0, excluded };

  const total = tickets.reduce((a, t) => a + Math.round(Number(t.total || 0) * 100), 0) / 100;
  const dates = tickets.map((t) => t.fecha_comprobante).filter(Boolean).sort();
  // Weekly periods use the loading cutoff, not the receipt date.
  const periodFrom = weekly?.from || day || from || dates[0] || todayCordoba();
  const periodTo = weekly?.to || day || to || dates[dates.length - 1] || todayCordoba();

  // Links firmados a las fotos (válidos 30 días)
  const paths = [...new Set(tickets.flatMap(pathsOf))];
  const signed = {};
  if (paths.length) {
    const { data: urls, error: linksError } = await sb.storage.from('tickets').createSignedUrls(paths, 60 * 60 * 24 * 30);
    if (linksError || urls?.some((u) => !u.signedUrl)) throw new HttpError(500, 'No se pudieron generar todos los enlaces a las fotos.');
    (urls || []).forEach((u) => { if (u.signedUrl) signed[u.path] = u.signedUrl; });
  }

  const buffer = await buildWorkbook({ tickets, signed, instituto, periodFrom, periodTo, total });
  const csv = buildCsv(tickets);

  const nombreInst = instituto.nombre || 'Instituto de Investigaciones Clínicas de Córdoba';
  const periodo = periodFrom === periodTo ? fmtDate(periodFrom) : `${fmtDate(periodFrom)} al ${fmtDate(periodTo)}`;
  const subject = weekly ? `${nombreInst} — Reporte semanal de reintegros ${periodo} (${tickets.length})` : day
    ? `${nombreInst} — Reintegros de viáticos del ${periodo} (${tickets.length})`
    : `${nombreInst} — Reintegros de viáticos ${periodo} (${tickets.length})`;
  const html = buildEmailHtml({ tickets, total, periodo, nombreInst, contadora, weekly });

  // Registro del envío
  const { data: report, error: rErr } = await sb
    .from('email_reports')
    .insert({
      sent_by: sentBy, trigger_kind: kind, recipients, period_from: periodFrom, period_to: periodTo,
      ticket_count: tickets.length, total_amount: total, status: 'enviando',
    })
    .select()
    .single();
  if (rErr) throw new HttpError(500, rErr.message);

  try {
    await mailer().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: contadora.email,
      cc: (contadora.cc || []).filter(Boolean),
      replyTo: process.env.MAIL_REPLY_TO || undefined,
      subject,
      html,
      attachments: [
        { filename: `reintegros_${periodFrom}_${periodTo}.xlsx`, content: buffer },
        { filename: `reintegros_${periodFrom}_${periodTo}.csv`, content: csv, contentType: 'text/csv; charset=utf-8' },
      ],
    });
  } catch (err) {
    await sb.from('email_reports').update({ status: 'error', error: String(err.message || err) }).eq('id', report.id);
    throw new HttpError(502, `No se pudo enviar el email: ${err.message}`);
  }

  const now = new Date().toISOString();
  const { error: reportError } = await sb.from('email_reports').update({ status: 'enviado' }).eq('id', report.id);
  if (reportError) throw new HttpError(500, 'El email se envió pero no se pudo registrar: ' + reportError.message);
  const ids = tickets.filter((t) => t.status === 'cargado').map((t) => t.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await sb.from('tickets').update({ status: 'enviado', sent_at: now, report_id: report.id }).in('id', ids.slice(i, i + 500));
    if (error) throw new HttpError(500, 'El email se envió pero no se pudo actualizar el estado de los recibos: ' + error.message);
  }

  return { sent: true, count: tickets.length, total, reportId: report.id, recipients, excluded };
}

function mailer() {
  const host = process.env.SMTP_HOST;
  if (!host || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Faltan las variables SMTP_HOST, SMTP_USER y SMTP_PASS.');
  }
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const yn = (v) => (v === true ? 'SÍ' : v === false ? 'NO' : '');
const sumGastos = (t) => (t.comprobantes_adjuntos || []).reduce((a, g) => a + (Number(g.importe) || 0), 0);
const gastosText = (t) => (t.comprobantes_adjuntos || []).map((g) => `${g.comercio || g.descripcion || 'Comprobante'}: $${Number(g.importe || 0).toLocaleString('es-AR')}`).join(' | ');
const pathsOf = (t) => (t.image_paths?.length ? t.image_paths : t.image_path ? [t.image_path] : []);

const COLUMNS = [
  { header: 'Fecha', key: 'fecha', width: 12 },
  { header: 'Estudio', key: 'estudio', width: 16 },
  { header: 'Visita', key: 'visita', width: 9 },
  { header: 'Iniciales', key: 'iniciales', width: 10 },
  { header: 'N.º paciente', key: 'numero', width: 13 },
  { header: 'Adjunta comprob.', key: 'adjunta', width: 11 },
  { header: 'Recibe viático', key: 'viatico', width: 11 },
  { header: 'Desayuno', key: 'desayuno', width: 10 },
  { header: 'Comprobantes adjuntos', key: 'gastos', width: 38 },
  { header: 'Suma comprobantes', key: 'suma', width: 15 },
  { header: 'Escrito en el recibo', key: 'detalle', width: 22 },
  { header: 'Medio de pago', key: 'medio', width: 14 },
  { header: 'N.º operación', key: 'operacion', width: 16 },
  { header: 'Total recibido', key: 'total', width: 15 },
  { header: 'Cargado por', key: 'operador', width: 18 },
  { header: 'Foto 1', key: 'foto1', width: 9 },
  { header: 'Foto 2', key: 'foto2', width: 9 },
  { header: 'Foto 3', key: 'foto3', width: 9 },
  { header: 'Foto 4', key: 'foto4', width: 9 },
  { header: 'Fecha y hora de carga (Argentina)', key: 'cargado', width: 24 },
];
const LAST_COL = 'T';
const TOTAL_COL = 'N';

function row(t, signed) {
  const fotos = pathsOf(t).map((p) => signed[p]).filter(Boolean);
  const link = (i) => (fotos[i] ? { text: 'Ver', hyperlink: fotos[i] } : '');
  return {
    fecha: t.fecha_comprobante ? new Date(t.fecha_comprobante + 'T12:00:00Z') : null,
    estudio: t.estudio || '',
    visita: t.visita || '',
    iniciales: t.paciente_iniciales || '',
    numero: t.paciente_numero || '',
    adjunta: yn(t.adjunta_comprobantes),
    viatico: yn(t.recibe_viatico),
    desayuno: yn(t.desayuno),
    gastos: gastosText(t),
    suma: (t.comprobantes_adjuntos || []).length ? sumGastos(t) : null,
    detalle: t.monto_detalle || '',
    medio: t.medio_pago || '',
    operacion: t.nro_operacion || '',
    total: Number(t.total || 0),
    operador: t.profiles?.full_name || t.profiles?.email || '',
    foto1: link(0), foto2: link(1), foto3: link(2), foto4: link(3),
    cargado: t.created_at ? new Intl.DateTimeFormat('es-AR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(t.created_at)) : '',
  };
}

export async function buildWorkbook({ tickets, signed, instituto, periodFrom, periodTo, total }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = instituto.nombre || 'IIC';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reintegros', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.mergeCells(`A1:${LAST_COL}1`);
  ws.getCell('A1').value = instituto.nombre || 'Instituto de Investigaciones Clínicas de Córdoba';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF123A5A' } };
  ws.mergeCells(`A2:${LAST_COL}2`);
  ws.getCell('A2').value = `Reintegros de viáticos del ${fmtDate(periodFrom)} al ${fmtDate(periodTo)} — ${tickets.length} recibos — Total ${money(total)}`;
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF4A5D66' } };

  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  const header = ws.getRow(4);
  COLUMNS.forEach((c, i) => { header.getCell(i + 1).value = c.header; });
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A5A' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  tickets.forEach((t) => {
    const r = ws.addRow(row(t, signed));
    r.getCell('fecha').numFmt = 'dd/mm/yyyy';
    ['suma', 'total'].forEach((k) => { r.getCell(k).numFmt = '"$"#,##0.00'; });
    r.getCell('gastos').alignment = { wrapText: true, vertical: 'top' };
    ['foto1', 'foto2', 'foto3', 'foto4'].forEach((k) => { if (r.getCell(k).value) r.getCell(k).font = { color: { argb: 'FF1F5FBF' }, underline: true }; });
  });

  const last = ws.rowCount;
  const tot = ws.addRow({ operacion: 'TOTAL', total: { formula: `SUM(${TOTAL_COL}5:${TOTAL_COL}${last})`, result: total } });
  tot.font = { bold: true };
  tot.getCell('total').numFmt = '"$"#,##0.00';
  ws.autoFilter = { from: 'A4', to: `${LAST_COL}${last}` };
  ws.addRow([]);
  ws.addRow(['Las fotos se guardan con la firma y los datos personales del paciente tapados.']).font = { italic: true, color: { argb: 'FF5B6E75' } };

  // Resumen por medio de pago y obra social
  const rs = wb.addWorksheet('Resumen');
  rs.columns = [{ width: 28 }, { width: 14 }, { width: 18 }];
  rs.addRow(['TOTAL DEL REPORTE', tickets.length, total]).font = { bold: true, size: 12 };
  rs.getCell('C1').numFmt = '"$"#,##0.00';
  rs.addRow([]);
  const block = (title, groups) => {
    const h = rs.addRow([title, 'Cantidad', 'Total']);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A5A' } };
    Object.entries(groups).sort((a, b) => b[1].total - a[1].total).forEach(([k, v]) => {
      const r = rs.addRow([k, v.count, v.total]);
      r.getCell(3).numFmt = '"$"#,##0.00';
    });
    rs.addRow([]);
  };
  const group = (fn) => tickets.reduce((acc, t) => {
    const k = fn(t);
    acc[k] = acc[k] || { count: 0, total: 0 };
    acc[k].count += 1; acc[k].total += Number(t.total || 0);
    return acc;
  }, {});
  block('Estudio', group((t) => t.estudio || 'Sin estudio'));
  block('Paciente (estudio · iniciales n.º)', group((t) => `${t.estudio || '—'} · ${[t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' ') || 'Sin dato'}`));
  block('Medio de pago', group((t) => t.medio_pago || 'Sin dato'));

  const fotos = wb.addWorksheet('Fotos y comprobantes');
  fotos.columns = [{ header: 'Estudio', key: 'estudio', width: 22 }, { header: 'Paciente', key: 'paciente', width: 20 }, { header: 'Visita', key: 'visita', width: 12 }, { header: 'Foto', key: 'foto', width: 12 }, { header: 'Enlace (30 días)', key: 'link', width: 28 }];
  fotos.views = [{ state: 'frozen', ySplit: 1 }];
  fotos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fotos.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A5A' } };
  for (const t of tickets) pathsOf(t).forEach((path, index) => {
    const r = fotos.addRow({ estudio: t.estudio || '', paciente: [t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' '), visita: t.visita || '', foto: index + 1, link: signed[path] ? { text: 'Abrir foto tapada', hyperlink: signed[path] } : 'Sin enlace' });
    r.getCell('link').font = { color: { argb: 'FF0065B3' }, underline: true };
  });
  // Alternating rows and print layout keep the detailed ledger readable.
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: '1:4' };
  for (let i = 5; i <= last; i++) {
    if (i % 2) ws.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FA' } };
    ws.getRow(i).alignment = { vertical: 'middle', wrapText: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(tickets) {
  const esc = (v) => {
    const str = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const num = (n) => (n === null || n === undefined ? '' : Number(n).toFixed(2).replace('.', ','));
  const lines = [
    ['Fecha', 'Estudio', 'Visita', 'Iniciales', 'N paciente', 'Adjunta comprobantes', 'Recibe viatico', 'Desayuno', 'Comprobantes adjuntos', 'Suma comprobantes', 'Escrito en el recibo', 'Medio de pago', 'N operacion', 'Total recibido'].join(';'),
    ...tickets.map((t) => [
      fmtDate(t.fecha_comprobante), t.estudio, t.visita, t.paciente_iniciales, t.paciente_numero,
      yn(t.adjunta_comprobantes), yn(t.recibe_viatico), yn(t.desayuno), gastosText(t),
      (t.comprobantes_adjuntos || []).length ? num(sumGastos(t)) : '', t.monto_detalle, t.medio_pago, t.nro_operacion, num(t.total),
    ].map(esc).join(';')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function buildEmailHtml({ tickets, total, periodo, nombreInst, contadora, weekly }) {
  const byEstudio = tickets.reduce((acc, t) => {
    const k = t.estudio || 'Sin estudio';
    acc[k] = acc[k] || { n: 0, total: 0 };
    acc[k].n += 1; acc[k].total += Number(t.total || 0);
    return acc;
  }, {});
  const rowsEstudio = Object.entries(byEstudio)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => `<tr>
      <td style="padding:7px 0;border-top:1px solid #E3EAED;font-family:Menlo,Consolas,monospace;font-size:13px;color:#17262C">${escapeHtml(k)}</td>
      <td style="padding:7px 0;border-top:1px solid #E3EAED;text-align:center;font-size:13px;color:#5B6E75">${v.n}</td>
      <td style="padding:7px 0;border-top:1px solid #E3EAED;text-align:right;font-size:13px;color:#17262C;white-space:nowrap">${money(v.total)}</td></tr>`)
    .join('');
  const preview = tickets.slice(0, 30).map((t) => `
    <tr>
      <td style="padding:8px 6px 8px 0;border-top:1px solid #E3EAED;font-family:Menlo,Consolas,monospace;font-size:12.5px;color:#17262C">${escapeHtml(t.estudio || '—')}</td>
      <td style="padding:8px 6px;border-top:1px solid #E3EAED;font-family:Menlo,Consolas,monospace;font-size:12.5px;color:#17262C">${escapeHtml(t.visita || '—')}</td>
      <td style="padding:8px 6px;border-top:1px solid #E3EAED;font-family:Menlo,Consolas,monospace;font-size:12.5px;color:#5B6E75">${escapeHtml([t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' ') || '—')}</td>
      <td style="padding:8px 0 8px 6px;border-top:1px solid #E3EAED;text-align:right;font-size:13px;color:#17262C;white-space:nowrap">${money(t.total)}</td>
    </tr>`).join('');
  const host = process.env.PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  const logo = host ? `<img src="${host}/logo01.png" alt="" width="240" style="display:block;max-width:100%;background:#fff;border-radius:8px;padding:10px;margin:0 0 16px">` : '';
  const saludo = contadora.nombre ? `Hola ${escapeHtml(contadora.nombre)},` : 'Hola,';
  return `<!doctype html><html><body style="margin:0;background:#EEF3F4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3F4;padding:28px 12px"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="background:#123A5A;padding:26px 30px 24px;color:#ffffff">
      ${logo}
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff">${escapeHtml(nombreInst)}</div>
      <div style="height:1px;background:rgba(255,255,255,.18);margin:14px 0"></div>
      <div style="font-size:13px;color:rgba(255,255,255,.7)">Reporte de reintegros de viáticos</div>
      <div style="font-size:22px;font-weight:bold;margin-top:2px">${periodo}</div>
    </td></tr>
    <tr><td style="padding:26px 30px 8px;color:#17262C;font-size:14px;line-height:1.6">
      <p style="margin:0 0 12px">${saludo}</p>
      <p style="margin:0 0 20px">Te enviamos el detalle organizado por estudio para revisar y conciliar los reintegros registrados. Adjuntamos la planilla Excel, con el link a las fotos de cada recibo, sus tickets y la transferencia (con la firma y los datos personales del paciente tapados), y la versión CSV.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#F6F8F8;border-radius:10px">
        <tr>
          <td style="padding:16px 18px"><div style="font-size:12px;color:#5B6E75">Recibos</div><div style="font-size:26px;font-weight:bold;color:#123A5A">${tickets.length}</div></td>
          <td style="padding:16px 18px;text-align:right"><div style="font-size:12px;color:#5B6E75">Total reintegrado</div><div style="font-size:26px;font-weight:bold;color:#123A5A">${money(total)}</div></td>
        </tr>
      </table>
      <div style="margin:22px 0 4px;font-size:12px;font-weight:bold;color:#5B6E75;letter-spacing:.5px">POR ESTUDIO</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rowsEstudio}</table>
      <div style="margin:22px 0 4px;font-size:12px;font-weight:bold;color:#5B6E75;letter-spacing:.5px">DETALLE</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr style="font-size:12px;color:#62666D;text-align:left"><th>Estudio</th><th>Visita</th><th>Paciente</th><th style="text-align:right">Importe</th></tr>${preview}</table>
      ${tickets.length > 30 ? `<p style="color:#5B6E75;font-size:12px;margin:10px 0 0">Y ${tickets.length - 30} recibos más en la planilla adjunta.</p>` : ''}
    </td></tr>
    <tr><td style="padding:22px 30px;color:#7A8C94;font-size:11.5px;line-height:1.5">${weekly ? 'Cierre semanal: desde el viernes anterior a las 12:00 hasta este viernes a las 12:00 (Argentina). Incluye pendientes anteriores si los hay.' : 'Reporte solicitado por administración.'} Los enlaces a las fotos vencen a los 30 días. Sistema de comprobantes del ${escapeHtml(nombreInst)}. Por privacidad, el paciente figura solo con iniciales y número.</td></tr>
  </table></td></tr></table></body></html>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** One consolidated weekly report, including overdue unsent receipts. */
export async function sendWeeklyReport(now = new Date()) {
  const weekly = weeklyWindow(now);
  const sb = supabaseAdmin();
  const { data: previous, error } = await sb.from('email_reports').select('id')
    .eq('trigger_kind', 'automatico').eq('period_from', weekly.from).eq('period_to', weekly.to)
    .eq('status', 'enviado').limit(1);
  if (error) throw new HttpError(500, error.message);
  if (previous.length) return { sent: false, reason: 'El reporte semanal ya fue enviado.', reportId: previous[0].id };
  return sendAccountantReport({ mode: 'rango', weekly, kind: 'automatico' });
}
