import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDocument, sameDocument, documentCrop } from '../src/lib/document-detection.js';

function frame({ clipped = false, blank = false, background = 40, paper = 225 } = {}) {
  const width = 180, height = 240, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x >= (clipped ? 0 : 25) && x < 155 && y >= 30 && y < 210;
    let value = inside ? paper : background;
    if (inside && !blank && y > 55 && y < 190 && y % 15 < 2 && x > 45 && x < 135 && x % 12 < 8) value = 30;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  return { data, width, height };
}

test('detects an entire paper with text and adds a safe crop margin', () => {
  const box = detectDocument(frame());
  assert.ok(box?.sharp);
  assert.ok(Math.abs(box.x - 25 / 180) < .01);
  const crop = documentCrop(box, 1800, 2400);
  assert.ok(crop.x < 250 && crop.y < 300);
  assert.ok(crop.x + crop.width > 1550);
});

test('does not automatically capture clipped paper, blank surfaces or low contrast', () => {
  assert.equal(detectDocument(frame({ clipped: true })), null);
  assert.equal(detectDocument(frame({ blank: true })), null);
  assert.equal(detectDocument(frame({ background: 220, paper: 225 })), null);
});

test('stability rejects movement and crop stays inside the camera image', () => {
  const box = { x: .1, y: .1, width: .7, height: .7 };
  assert.equal(sameDocument(box, { ...box, x: .108 }), true);
  assert.equal(sameDocument(box, { ...box, x: .13 }), false);
  assert.equal(sameDocument(null, box), false);
  assert.deepEqual(documentCrop({ x: 0, y: 0, width: 1, height: 1 }, 100, 200), { x: 0, y: 0, width: 100, height: 200 });
});
