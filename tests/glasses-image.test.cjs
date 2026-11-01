const test = require('node:test');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const {
  decodeBase64, fitGrayImage, prepareGlassesImage, quantizeForLens, imageSeconds, imageCaption,
  IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT, IMAGE_MAX_HEIGHT_WITH_CAPTION, IMAGE_MAX_BASE64_CHARS,
} = require('../.test-build/app/assistant/glasses-image.js');
const { GrayImage } = require('../.test-build/app/graphics/image.js');

function pngBase64(width, height, pixel) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      rgba.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return Buffer.from(UPNG.encode([rgba.buffer], width, height, 0)).toString('base64');
}

test('decodeBase64 matches Buffer for standard and URL-safe input', () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 62, 63]);
  assert.deepEqual(Buffer.from(decodeBase64(bytes.toString('base64'))), bytes);
  assert.deepEqual(Buffer.from(decodeBase64(bytes.toString('base64url'))), bytes);
  assert.equal(decodeBase64('ab$d'), null);
  assert.equal(decodeBase64('a'), null);
});

test('a fitted PNG keeps its size, snaps to 16 levels and never uses the color key 0', () => {
  const b64 = pngBase64(40, 20, (x) => (x < 20 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const result = prepareGlassesImage(b64, false, UPNG);
  assert.equal(result.ok, true);
  assert.equal(result.image.width, 40);
  assert.equal(result.image.height, 20);
  assert.equal(result.image.pixels[0], 1);
  assert.equal(result.image.pixels[39], 255);
  assert.ok([...result.image.pixels].every((v) => v === 1 || v % 17 === 0));
});

test('transparent pixels read as black (see-through on the lenses)', () => {
  const b64 = pngBase64(4, 4, () => [255, 255, 255, 0]);
  const result = prepareGlassesImage(b64, false, UPNG);
  assert.ok([...result.image.pixels].every((v) => v === 1));
});

test('an oversized PNG is scaled down to the box, keeping its aspect', () => {
  const big = prepareGlassesImage(pngBase64(1056, 216, () => [255, 255, 255, 255]), false, UPNG);
  assert.equal(big.image.width, IMAGE_MAX_WIDTH);
  assert.equal(big.image.height, 108);
  const tall = prepareGlassesImage(pngBase64(100, 400, () => [128, 128, 128, 255]), true, UPNG);
  assert.equal(tall.image.height, IMAGE_MAX_HEIGHT_WITH_CAPTION);
  assert.equal(tall.image.width, 49);
  assert.ok(tall.image.height <= IMAGE_MAX_HEIGHT);
});

test('fitGrayImage averages areas and never upscales', () => {
  const source = new GrayImage(4, 2, 0);
  source.pixels.set([0, 255, 0, 255, 0, 255, 0, 255]);
  const half = fitGrayImage(source, 2, 1);
  assert.deepEqual([...half.pixels], [128, 128]);
  assert.equal(fitGrayImage(source, 100, 100), source);
  assert.deepEqual([...quantizeForLens(half).pixels], [136, 136]);
});

test('bad input is rejected with a reason, not thrown', () => {
  assert.equal(prepareGlassesImage(undefined, false, UPNG).ok, false);
  assert.match(prepareGlassesImage(Buffer.from('GIF89a....').toString('base64'), false, UPNG).error, /not a PNG/);
  assert.match(prepareGlassesImage('A'.repeat(IMAGE_MAX_BASE64_CHARS + 4), false, UPNG).error, /too large/);
  const truncated = pngBase64(10, 10, () => [9, 9, 9, 255]).slice(0, 40);
  assert.equal(prepareGlassesImage(truncated, false, UPNG).ok, false);
  const dataUrl = 'data:image/png;base64,' + pngBase64(2, 2, () => [255, 255, 255, 255]);
  assert.equal(prepareGlassesImage(dataUrl, false, UPNG).ok, true);
});

test('seconds and caption arguments are clamped', () => {
  assert.equal(imageSeconds(undefined), 15);
  assert.equal(imageSeconds(1), 3);
  assert.equal(imageSeconds(500), 60);
  assert.equal(imageSeconds('7'), 15);
  assert.equal(imageCaption('  Glucosa\n  hoy '), 'Glucosa hoy');
  assert.equal(imageCaption(42), '');
  assert.equal(imageCaption('x'.repeat(300)).length, 120);
});
