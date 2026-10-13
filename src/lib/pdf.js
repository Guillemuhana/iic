import logoUrl from '../assets/logo01.png';

/**
 * Genera un PDF con el logo del instituto y lo descarga o lo abre listo para imprimir.
 * `build(pdf, logo)` recibe el módulo shared/report-pdf.js y devuelve el documento.
 * Llamarla directo desde el click: la ventana de impresión se abre antes de cualquier espera
 * para que el navegador no la bloquee.
 */
export async function outputPdf(build, { print = false, filename }) {
  const preview = print ? window.open('', '_blank') : null;
  if (print && !preview) throw new Error('Permití abrir ventanas para imprimir el reporte.');
  if (preview) { preview.opener = null; preview.document.title = 'Preparando reporte'; preview.document.body.textContent = 'Preparando el reporte PDF…'; }
  try {
    const [pdf, logoResponse] = await Promise.all([import('../../shared/report-pdf.js'), fetch(logoUrl)]);
    if (!logoResponse.ok) throw new Error('No se pudo cargar el logo del instituto.');
    const doc = await build(pdf, new Uint8Array(await logoResponse.arrayBuffer()));
    if (print) {
      doc.autoPrint();
      const url = URL.createObjectURL(doc.output('blob'));
      preview.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 300000);
    } else doc.save(filename);
  } catch (e) {
    preview?.close();
    throw e;
  }
}
