export function rotatePhotoBox(box, degrees) {
  const turn = ((degrees % 360) + 360) % 360;
  if (turn === 90) return { ...box, x: 1 - box.y - box.h, y: box.x, w: box.h, h: box.w };
  if (turn === 180) return { ...box, x: 1 - box.x - box.w, y: 1 - box.y - box.h };
  if (turn === 270) return { ...box, x: box.y, y: 1 - box.x - box.w, w: box.h, h: box.w };
  return { ...box };
}
