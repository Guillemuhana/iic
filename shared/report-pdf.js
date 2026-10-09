import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { savedReimbursementError } from './save-validation.js';

const money = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
const date = value => String(value || '').split('-').reverse().join('/');
const ink = [18, 58, 90];

export function buildReportPdf({ tickets, from, to, logo, name, generatedAt = new Date() }) {
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
  doc.setProperties({ title: `IIC - Reintegros ${from} a ${to}`, author: name || 'Instituto de Investigaciones Clínicas de Córdoba' });
  if (logo) doc.addImage(logo, 'PNG', 16, 12, 83, 27, undefined, 'FAST');
  doc.setFillColor(...ink); doc.rect(0, 44, 210, 29, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text('Reporte de reintegros de viáticos', 16, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Fecha del comprobante: ${date(from)} al ${date(to)}`, 16, 65);
  doc.setTextColor(...ink); doc.setFontSize(10);
  doc.text(`${rows.length} recibos validados`, 16, 85);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(`Total: ${money(cents / 100)}`, 194, 85, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(91, 110, 117);
  doc.text(`Emitido: ${generatedAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba' })} (Argentina)`, 16, 95);
  doc.text(`${excluded} recibos excluidos por requerir revisión. No se incluyen anulados.`, 16, 101);
  const common = { margin: { left: 16, right: 16, bottom: 20 }, styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: ink, textColor: 255 }, alternateRowStyles: { fillColor: [242, 247, 250] } };
  autoTable(doc, { ...common, startY: 110, head: [['Resumen por estudio', 'Recibos', 'Total reintegrado']],
    body: [...groups].map(([key, g]) => [key, g.count, money(g.cents / 100)]),
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
    foot: [['TOTAL', rows.length, money(cents / 100)]], footStyles: { fillColor: [230, 240, 247], textColor: ink }, showFoot: 'lastPage' });
  autoTable(doc, { ...common, startY: doc.lastAutoTable.finalY + 12,
    head: [['Fecha', 'Estudio / visita', 'Paciente', 'Operación', 'Importe']],
    body: rows.map(t => [date(t.fecha_comprobante), [t.estudio, t.visita].filter(Boolean).join(' / '),
      [t.paciente_iniciales, t.paciente_numero].filter(Boolean).join(' · '), t.nro_operacion || '—', money(Number(t.total))]),
    columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 45 }, 2: { cellWidth: 30 }, 3: { cellWidth: 42 }, 4: { halign: 'right', cellWidth: 36 } } });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setDrawColor(220, 230, 237); doc.line(16, 279, 194, 279);
    doc.setFontSize(8); doc.setTextColor(91, 110, 117);
    doc.text('IIC Córdoba · Documento administrativo confidencial', 16, 285);
    doc.text(`${page} / ${pages}`, 194, 285, { align: 'right' });
    doc.text('Pacientes identificados solo por iniciales y número. Importes en pesos argentinos.', 16, 290);
  }
  return doc;
}
