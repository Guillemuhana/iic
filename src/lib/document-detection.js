// Runs locally on small camera frames; no live images leave the device.
export function detectDocument({ data, width, height }) {
  const count = width * height;
  const gray = new Uint8Array(count);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    gray[i] = Math.round(data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114);
    histogram[gray[i]]++;
  }
  // Otsu separates a light sheet from its darker surroundings.
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let weight = 0, partial = 0, variance = 0, threshold = 0;
  for (let i = 0; i < 255; i++) {
    weight += histogram[i]; partial += i * histogram[i];
    if (!weight || weight === count) continue;
    const delta = partial / weight - (sum - partial) / (count - weight);
    const score = weight * (count - weight) * delta * delta;
    if (score > variance) { variance = score; threshold = i; }
  }
  threshold = Math.max(90, threshold);
  const seen = new Uint8Array(count), queue = new Int32Array(count);
  let best = null;
  for (let start = 0; start < count; start++) {
    if (seen[start] || gray[start] <= threshold) continue;
    let head = 0, tail = 1, x0 = width, y0 = height, x1 = 0, y1 = 0, light = 0;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); light += gray[p];
      for (const next of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (next >= 0 && !seen[next] && gray[next] > threshold) { seen[next] = 1; queue[tail++] = next; }
      }
    }
    const boxArea = (x1 - x0 + 1) * (y1 - y0 + 1);
    const area = boxArea / count, fill = tail / boxArea;
    // Never capture a clipped sheet, a tiny bright object or the entire background.
    if (area < .22 || area > .88 || fill < .78 || x0 < 3 || y0 < 3 || x1 > width - 4 || y1 > height - 4) continue;
    const aspect = (x1 - x0 + 1) / (y1 - y0 + 1);
    if (aspect < .22 || aspect > 4.5) continue;
    let surround = 0, samples = 0, edges = 0, energy = 0;
    for (let y = y0 + 2; y < y1 - 2; y++) for (let x = x0 + 2; x < x1 - 2; x++) {
      const p = y * width + x;
      const laplace = gray[p - 1] + gray[p + 1] + gray[p - width] + gray[p + width] - 4 * gray[p];
      if (gray[p] < threshold) { energy += laplace * laplace; edges++; }
    }
    for (let x = x0; x <= x1; x++) { surround += gray[(y0 - 2) * width + x] + gray[(y1 + 2) * width + x]; samples += 2; }
    for (let y = y0; y <= y1; y++) { surround += gray[y * width + x0 - 2] + gray[y * width + x1 + 2]; samples += 2; }
    if (light / tail - surround / samples < 25 || edges < boxArea * .004) continue;
    const candidate = { x: x0 / width, y: y0 / height, width: (x1 - x0 + 1) / width, height: (y1 - y0 + 1) / height, sharp: energy / edges > 180, area };
    if (!best || area > best.area) best = candidate;
  }
  return best;
}

export function sameDocument(a, b) {
  return Boolean(a && b && ['x', 'y', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) < .015));
}

export function documentCrop(box, width, height) {
  const x = Math.max(0, Math.floor((box.x - .025) * width));
  const y = Math.max(0, Math.floor((box.y - .025) * height));
  return { x, y, width: Math.min(width - x, Math.ceil((box.width + .05) * width)), height: Math.min(height - y, Math.ceil((box.height + .05) * height)) };
}
