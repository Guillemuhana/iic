import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { savedReimbursementError } from './save-validation.js';

const money = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
const date = value => String(value || '').split('-').reverse().join('/');
const ink = [18, 58, 90];
const BASIS = { comprobante: 'Fecha del comprobante', carga: 'Fecha de carga (Argentina)' };
const common = { margin: { left: 16, right: 16, bottom: 20 }, styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: ink, textColor: 255 }, alternateRowStyles: { fillColor: [242, 247, 250] } };
const totalFoot = { footStyles: { fillColor: [230, 240, 247], textColor: ink }, showFoot: 'lastPage' };

function period(from, to) {
  return from === to ? date(from) : `${date(from)} al ${date(to)}`;
}

// Logo, franja con título y período, y la fecha de emisión.
function header(doc, { title, from, to, basis, logo, name, generatedAt }) {
  doc.setProperties({ title: `IIC - ${title} ${from} a ${to}`, author: name || 'Instituto de Investigaciones Clínicas de Córdoba' });
  if (logo) doc.addImage(logo, 'PNG', 16, 12, 83, 27, undefined, 'FAST');
  doc.setFillColor(...ink); doc.rect(0, 44, 210, 29, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(title, 16, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${BASIS[basis] || BASIS.comprobante}: ${period(from, to)}`, 16, 65);
  doc.setFontSize(9); doc.setTextColor(91, 110, 117);
  doc.text(`Emitido: ${generatedAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba' })} (Argentina)`, 16, 95);
}

function footer(doc) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setDrawColor(220, 230, 237); doc.line(16, 279, 194, 279);
    doc.setFontSize(8); doc.setTextColor(91, 110, 117);
    doc.text('IIC Córdoba · Documento administrativo confidencial', 16, 285);
    doc.text(`${page} / ${pages}`, 194, 285, { align: 'right' });
    doc.text('Pacientes identificados solo por iniciales y número. Importes en pesos argentinos.', 16, 290);
  }
}

function headline(doc, left, total) {
  doc.setTextColor(...ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(left, 16, 85);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(`Total: ${money(total)}`, 194, 85, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(91, 110, 117);
}

export function buildReportPdf({ tickets, from, to, logo, name, basis = 'comprobante', generatedAt = new Date() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const eligible = tickets.filter(t => t.status !== 'anulado' && !savedReimbursementError(t));
  const excluded = tickets.filter(t => t.status !== 'anulado').length - eligible.length;
  const rows = [...eligible].sort((a, b) => (a.estudio || '').localeCompare(b.estudio || '')
    || (a.fecha_comprobante || '').localeCompare(b.fecha_comprobante || '') || a.id.localeCompare(b.id));
  const groups = new Map();
  let cents = 0;
  for (const t of rows) {
    const amount = Math.round(Number(t.total) * 100);
    cents += amount;
    const key = t.estudio || 'Sin estudio';
    const group = groups.get(key) || { count: 0, cents: 0 };
    group.count++; group.cents += amount; groups.set(key, group);
  }
  header(doc, { title: 'Reporte de reintegros de viáticos', from, to, basis, logo, name, generatedAt });
  headline(doc, `${rows.length} recibos validados`, cents / 100);
  doc.text(`${excluded} recibos excluidos por requerir revisión. No se incluyen anulados.`, 16, 101);
  autoTable(doc, { ...common, ...totalFoot, startY: 110, head: [['Resumen por estudio', 'Recibos', 'Total reintegrado']],
    body: [...groups].map(([key, g]) => [key, g.count, money(g.cents / 100)]),
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
    foot: [['TOTAL', rows.length, money(cents / 100)]] });
  autoTable(doc, { ...common, startY: doc.lastAutoTable.finalY + 12,
    head: [['Fecha recibo', 'Estudio / visita', 'Paciente', 'Operación', 'Importe']],
    body: rows.map(t => [date(t.fecha_comprobante), [t.estudio, t.visita].filter(Boolean).join(' / '),
      [t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' · '), t.nro_operacion || '—', money(Number(t.total))]),
    columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 45 }, 2: { cellWidth: 30 }, 3: { cellWidth: 42 }, 4: { halign: 'right', cellWidth: 36 } } });
  footer(doc);
  return doc;
}

// Estadísticas del panel (mismo objeto que devuelve /api/ticket-stats), por fecha de carga.
export function buildStatsPdf({ stats, from, to, logo, name, generatedAt = new Date() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const n = v => new Intl.NumberFormat('es-AR').format(Number(v) || 0);
  const pct = v => (stats.cantidad ? `${Math.round((v / stats.cantidad) * 100)}%` : '0%');
  header(doc, { title: 'Estadísticas de reintegros', from, to, basis: 'carga', logo, name, generatedAt });
  headline(doc, `${n(stats.cantidad)} recibos · ${n(stats.pacientes)} pacientes`, stats.total);
  doc.text('No se incluyen anulados.', 16, 101);
  autoTable(doc, { ...common, startY: 110, head: [['Resumen', '']], columnStyles: { 1: { halign: 'right' } },
    body: [
      ['Total reintegrado', money(stats.total)],
      ['Recibos', n(stats.cantidad)],
      ['Pacientes', n(stats.pacientes)],
      ['Promedio por recibo', money(stats.promedio)],
      ['Sin enviar a la contadora', `${n(stats.pendientes)} · ${money(stats.pendientes_total)}`],
      ...(stats.revision ? [['Requieren revisión (no se envían)', `${n(stats.revision)} · ${money(stats.revision_total)}`]] : []),
      ['Con viático', `${n(stats.con_viatico)} (${pct(stats.con_viatico)})`],
      ['Con desayuno', `${n(stats.con_desayuno)} (${pct(stats.con_desayuno)})`],
      ['Con comprobantes adjuntos', `${n(stats.con_comprobantes)} (${pct(stats.con_comprobantes)})`],
    ] });
  const table = (title, rows, cols, map) => {
    if (!rows?.length) return;
    autoTable(doc, { ...common, startY: doc.lastAutoTable.finalY + 10, head: [[title, ...cols]],
      body: rows.map(map), columnStyles: Object.fromEntries(cols.map((_, i) => [i + 1, { halign: 'right' }])) });
  };
  table('Por estudio', stats.por_estudio, ['Pacientes', 'Recibos', 'Total'], r => [r.nombre, n(r.pacientes), n(r.cantidad), money(r.total)]);
  table('Por día de carga', [...(stats.por_dia || [])].sort((a, b) => String(a.dia).localeCompare(String(b.dia))), ['Recibos', 'Total'], r => [date(r.dia), n(r.cantidad), money(r.total)]);
  table('Por visita', stats.por_visita, ['Recibos', 'Total'], r => [r.nombre, n(r.cantidad), money(r.total)]);
  table('Por operador', stats.por_operador, ['Recibos', 'Total'], r => [r.nombre, n(r.cantidad), money(r.total)]);
  footer(doc);
  return doc;
}
