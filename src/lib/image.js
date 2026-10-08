// Preparación de la foto antes de mandarla a la IA.
// - Corrige la orientación (EXIF) y reduce a un tamaño óptimo (lado mayor 2000 px).
// - Genera una versión "mejorada": escala de grises + estiramiento de contraste,
//   ideal para tickets térmicos gastados.
// - Mide el nivel de nitidez para avisar si la foto salió movida.

const MAX_SIDE = 2000;

export async function loadBitmap(source) {
  if (source instanceof HTMLCanvasElement) return source;
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(source);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

function drawScaled(bitmap, maxSide = MAX_SIDE) {
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Escala de grises + auto-niveles (percentil 1–99) + leve realce. */
function enhance(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = y;
    hist[y]++;
  }
  const total = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.01) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let v = ((d[i] - lo) * 255) / range;
    // curva suave para oscurecer el texto térmico sin quemar el papel
    v = 255 * Math.pow(Math.min(1, Math.max(0, v / 255)), 1.15);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Varianza del laplaciano sobre una miniatura: < ~60 suele ser foto movida. */
export function sharpness(canvas) {
  const size = 480;
  const scale = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) g[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      const lap = g[k - w] + g[k + w] + g[k - 1] + g[k + 1] - 4 * g[k];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Brillo medio 0–255 (para avisar si está muy oscuro). */
function brightness(canvas) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  let s = 0;
  for (let i = 0; i < data.length; i += 4) s += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  return s / (data.length / 4);
}

const toBlob = (canvas, q) => new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', q));

const toDataUrl = (canvas, q) => canvas.toDataURL('image/jpeg', q);

/**
 * @returns {{ previewUrl, blob, aiDataUrl, originalDataUrl, quality: {sharpness, brightness, issues: string[]}, width, height }}
 */
export async function prepareTicketImage(source) {
  const bitmap = await loadBitmap(source);
  const base = drawScaled(bitmap);
  const enhanced = enhance(base);

  const sh = sharpness(base);
  const br = brightness(base);
  const issues = [];
  if (sh < 45) issues.push('La foto parece movida o fuera de foco.');
  if (br < 70) issues.push('La foto está oscura. Buscá más luz.');
  if (br > 235) issues.push('Hay mucho brillo o reflejo sobre el ticket.');
  if (Math.min(base.width, base.height) < 700) issues.push('La foto tiene poca resolución. Acercate más.');

  // Two independent inputs, capped below the serverless request limit.
  let aiDataUrl = toDataUrl(enhanced, 0.9);
  let originalDataUrl = toDataUrl(base, 0.88);
  for (const quality of [0.8, 0.7, 0.6]) {
    if (aiDataUrl.length + originalDataUrl.length <= 4_000_000) break;
    aiDataUrl = toDataUrl(enhanced, quality);
    originalDataUrl = toDataUrl(base, quality);
  }
  if (aiDataUrl.length + originalDataUrl.length > 4_000_000) {
    aiDataUrl = toDataUrl(drawScaled(enhanced, 1600), 0.7);
    originalDataUrl = toDataUrl(drawScaled(base, 1600), 0.7);
  }
  const blob = await toBlob(base, 0.88);
  const previewUrl = URL.createObjectURL(blob);

  return { previewUrl, blob, aiDataUrl, originalDataUrl, quality: { sharpness: sh, brightness: br, issues }, width: base.width, height: base.height };
}

/** Rota 90° una imagen ya preparada (por si el ticket quedó acostado). */
export async function rotateBlob(blob, degrees = 90) {
  const bmp = await loadBitmap(blob);
  const c = document.createElement('canvas');
  const swap = degrees % 180 !== 0;
  c.width = swap ? bmp.height : bmp.width;
  c.height = swap ? bmp.width : bmp.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  return toBlob(c, 0.92);
}

/**
 * Tapa los datos personales (rectángulos sólidos, irreversibles) y deja la foto derecha.
 * Las cajas están en coordenadas 0–1 de la imagen sin girar.
 * @param {Blob} blob foto original preparada
 * @param {{x:number,y:number,w:number,h:number,tipo?:string}[]} boxes
 * @param {number} rotation grados horarios para enderezar (0/90/180/270)
 */
export async function redactAndStraighten(blob, boxes = [], rotation = 0) {
  const bmp = await loadBitmap(blob);
  const src = document.createElement('canvas');
  src.width = bmp.width;
  src.height = bmp.height;
  const sctx = src.getContext('2d');
  sctx.drawImage(bmp, 0, 0);
  for (const b of boxes) {
    const x = Math.round(b.x * src.width);
    const y = Math.round(b.y * src.height);
    const w = Math.round(b.w * src.width);
    const h = Math.round(b.h * src.height);
    sctx.fillStyle = '#0F3440';
    sctx.fillRect(x, y, w, h);
    // rayado para que se note que es un dato tapado a propósito
    sctx.save();
    sctx.beginPath();
    sctx.rect(x, y, w, h);
    sctx.clip();
    sctx.strokeStyle = 'rgba(255,255,255,.18)';
    sctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) / 14));
    for (let i = -h; i < w; i += sctx.lineWidth * 4) {
      sctx.beginPath();
      sctx.moveTo(x + i, y + h);
      sctx.lineTo(x + i + h, y);
      sctx.stroke();
    }
    sctx.restore();
  }
  const rot = ((rotation % 360) + 360) % 360;
  if (!rot) return toBlob(src, 0.88);
  const out = document.createElement('canvas');
  const swap = rot % 180 !== 0;
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return toBlob(out, 0.88);
}
