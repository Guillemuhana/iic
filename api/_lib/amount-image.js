import sharp from 'sharp';

export async function prepareAmountImage(dataUrl, bbox, rotation = 0, enhanced = false) {
  const bytes = Buffer.from(dataUrl.split(',')[1] || '', 'base64');
  let image = sharp(bytes, { limitInputPixels: 12000000 });
  const { width, height } = await image.metadata();
  let focused = false;
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    const [x1, y1, x2, y2] = bbox.map((n) => Math.max(0, Math.min(1000, n)) / 1000);
    if (x2 > x1 && y2 > y1 && (x2 - x1) * (y2 - y1) < .65 && Math.max(x2 - x1, y2 - y1) > .2) {
      const left = Math.max(0, Math.floor((x1 - .02) * width));
      const top = Math.max(0, Math.floor((y1 - .02) * height));
      const right = Math.min(width, Math.ceil((x2 + .02) * width));
      const bottom = Math.min(height, Math.ceil((y2 + .02) * height));
      // Materialize the crop before rotation: Sharp may otherwise reorder operations.
      const cropped = await image.extract({ left, top, width: right - left, height: bottom - top }).toBuffer();
      image = sharp(cropped, { limitInputPixels: 12000000 });
      focused = true;
    }
  }
  if ([90, 180, 270].includes(rotation)) image.rotate(rotation);
  image.resize({ width: 1600, height: focused ? 600 : 2000, fit: 'inside', withoutEnlargement: !focused });
  if (enhanced) image.grayscale().normalise();
  const output = await image.jpeg({ quality: 95 }).toBuffer();
  return { url: `data:image/jpeg;base64,${output.toString('base64')}`, focused };
}
