// «Hermes en conversación» en lentes: capa real → LayerStack real → encodeShellScene real →
// decodificación del cable y composición por software. Sin móvil, gafas ni proveedor. La
// composición reproduce el orden de ShellScene.calls (copia de pantalla, imagen de capa,
// presentaciones), así que verifica el contrato de bytes y opacidad, no la óptica real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const graphics = require('../.test-build/app/graphics/image.js');
const plane = require('../.test-build/app/graphics/plane.js');
const shellScene = require('../.test-build/app/graphics/shell-scene.js');
const displayList = require('../.test-build/app/graphics/display-list.js');
const wire = require('../.test-build/app/graphics/presentation-wire.js');
const textwrap = require('../.test-build/app/graphics/textwrap.js');
const metrics = require('../.test-build/app/ui/metrics.js');

const W = graphics.G2_LENS_WIDTH, H = graphics.G2_LENS_HEIGHT;
const LIMIT = 65536;
const BAND_TOP = 96, BAND_HEIGHT = 288, INSET_X = 32;

/** Block font: every character inks a solid 8×14 cell, so long text fills the band with ink. */
const font = {
  lineHeight: 18, ascent: 14, descent: 4,
  measureText: (text) => [...text].length * 10,
  getGlyph: () => ({ dwidthX: 10 }),
  drawText: (image, x, y, text, value) => { [...text].forEach((_c, i) => image.fillRect(x + i * 10, y, 8, 14, value)); },
};

/** Transpile app modules on demand; `mocks` is keyed by app-relative path without extension. */
function makeLoader(mocks) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(source, {
      exports: module.exports, module, console, Uint8Array, Math, Error, Map, Set, WeakMap,
      require(name) {
        if (!name.startsWith('.')) throw new Error(`Unmocked package ${name}`);
        const resolved = path.resolve(path.dirname(file), name);
        const key = path.relative(path.join(ROOT, 'app'), resolved).split(path.sep).join('/');
        if (key in mocks) return mocks[key];
        return load(`${resolved}.ts`);
      },
    }, { filename: file });
    return module.exports;
  }
  return (relative) => load(path.join(ROOT, relative));
}

const load = makeLoader({
  'graphics/image': graphics,
  'graphics/plane': plane,
  'graphics/display-list': displayList,
  'graphics/textwrap': textwrap,
  'graphics/ui-fonts': { getDefaultSmallFont: () => font, getDefaultMediumFont: () => font },
  'ui/metrics': metrics,
  'ui/gestures': { directionalFallback: (e) => e, isDirectionalInput: () => false },
  'native/frame-timings': { spanCurrent: (_name, fn) => fn() },
  'ui/shell/geometry': { minWindowTop: () => BAND_TOP },
});
const { HermesContributionLayer, hermesTextStrips, hermesResourceBytes } = load('app/ui/shell/conversation-hermes-layer.ts');
const { LayerStack, noopLayerActions } = load('app/ui/layers.ts');

const LONG = Array.from({ length: 80 }, (_, i) => `frase ${i} con bastante texto para llenar la banda`).join(' ');

/** Shell-like stack: transparent chrome base with a sidebar mark, Hermes pushed on top. */
function stackWith(text) {
  const base = { paint: () => { const image = new graphics.GrayImage(W, H, 0); image.fillRect(0, 0, 40, H, 180); return image; }, handleInput() {} };
  const stack = new LayerStack(base, { ...noopLayerActions });
  let current = text;
  const removed = [];
  const layer = new HermesContributionLayer(() => current, { dismiss() {}, removed: () => removed.push(true) });
  stack.push(layer);
  return { stack, layer, setText: (value) => { current = value; }, removed };
}

/** Parse the shell-scene wire bytes with the real presentation/display-list decoders. */
function decodeScene(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const word = () => { const v = view.getUint16(p, true); p += 2; return v; };
  const sword = () => { const v = view.getInt16(p, true); p += 2; return v; };
  const count = word(), layers = [];
  for (let i = 0; i < count; i++) {
    const key = word(), x = sword(), y = sword(), width = word(), height = word(), dim = word(), selections = word(), depth = sword();
    assert.ok(width >= 1 && width <= 640 && height >= 1 && height <= 480);
    assert.ok(5 + Math.ceil(width / 2) * height <= LIMIT, `layer ${key} raster within one resource`);
    const pixels = bytes.slice(p, p + width * height); p += width * height;
    const presentations = [];
    for (let s = 0; s < selections; s++) {
      const { selection, end } = wire.readPresentation(bytes, p);
      presentations.push({ selection, raw: bytes.subarray(p, end) }); p = end;
    }
    layers.push({ key, x, y, width, height, dim, depth, pixels, presentations });
  }
  const screenDepth = sword();
  assert.equal(p, bytes.length, 'no trailing bytes');
  return { layers, screenDepth };
}

/** Software composite in ShellScene.calls order over a "screen copy" of window content. */
function composite(scene, screen) {
  const output = screen.slice();
  for (const layer of scene.layers) {
    assert.equal(layer.dim, 256, 'no dim LUT expected in these scenes');
    for (let row = 0; row < layer.height; row++) for (let col = 0; col < layer.width; col++) {
      const v = layer.pixels[row * layer.width + col];
      if (v) output[(layer.y + row) * W + layer.x + col] = v;
    }
    for (const { raw } of layer.presentations) {
      const { placed } = displayList.readDisplayList(raw, 0);
      displayList.paintDisplayList(output, output.slice(), W, H, placed);
    }
  }
  return output;
}

/** Window content at a level the text never uses (5×16): any of it left after the composite is a leak. */
function windowScreen() { return new Uint8Array(W * H).fill(80); }

test('reproduction: a full-surface opaque raster cannot be encoded as one shell surface', () => {
  const image = new graphics.GrayImage(W, H, 0);
  image.fillRect(0, 0, W, H, 1);
  assert.equal(hermesResourceBytes(W, H), 153605);
  assert.throws(() => shellScene.encodeShellScene([{ image, x: 0, y: 0, shellKey: 7 }]), /exceeds 64 KiB \(640×480\)/);
});

test('real layer + LayerStack + encoder: a band full of text encodes within every resource limit', () => {
  const { stack } = stackWith(LONG);
  const planes = stack.paintUndimmed();
  assert.equal(planes.length, 1, 'Hermes never asks for the layers below: one plane');
  const bytes = shellScene.encodeShellScene(planes, 0);
  const scene = decodeScene(bytes);
  assert.equal(scene.layers.length, 1);
  const [layer] = scene.layers;
  assert.deepEqual([layer.width, layer.height], [1, 1], 'the raster is only the anchor pixel');
  assert.equal(layer.presentations.length, 1);
  const { placed } = displayList.readDisplayList(layer.presentations[0].raw, 0);
  const [cover, ...images] = placed.displayList.calls;
  assert.equal(cover.op, displayList.DrawOp.CLEAR);
  assert.equal(cover.color, 0);
  assert.equal(cover.clip, undefined, 'unclipped: covers the whole frame in both lenses');
  assert.ok(images.length >= 2, 'a full band needs more than one strip');
  for (const call of images) {
    assert.equal(call.op, displayList.DrawOp.IMAGE);
    assert.equal(call.transparent, true);
    const resource = placed.displayList.resources[call.resource];
    assert.ok(hermesResourceBytes(resource.width, resource.height) <= LIMIT, 'each strip fits one resource');
    assert.ok(call.x >= INSET_X && call.x + resource.width <= W - INSET_X, 'strip stays inside the side insets');
    assert.ok(call.y >= BAND_TOP && call.y + resource.height <= BAND_TOP + BAND_HEIGHT, 'strip stays inside the band');
  }
  const ink = images.reduce((sum, call) => sum + placed.displayList.resources[call.resource].height, 0);
  assert.ok(ink > 200, 'the text actually reaches most of the band');
});

test('composite: only the contribution is visible, nothing of the windows or chrome below', () => {
  const { stack } = stackWith(LONG);
  const scene = decodeScene(shellScene.encodeShellScene(stack.paintUndimmed(), 0));
  const output = composite(scene, windowScreen());
  let outside = 0, inside = 0, leaked = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = output[y * W + x];
    const inBand = x >= INSET_X && x < W - INSET_X && y >= BAND_TOP && y < BAND_TOP + BAND_HEIGHT;
    if (!inBand && v !== 0) outside++;
    if (inBand && v !== 0) inside++;
    if (v === 80) leaked++;
  }
  assert.equal(outside, 0, 'black outside the text band');
  assert.equal(leaked, 0, 'window content (80) never shows through');
  assert.ok(inside > 10000, 'the text is drawn');
  // Same frame through the phone-mirror path (stack.paint + flatten).
  const mirror = plane.flattenPlanes(stack.paint(), { width: W, height: H });
  assert.ok(mirror.pixels.some((v) => v !== 0));
});

test('empty text (listening suspended) still covers everything and draws no strip', () => {
  const { stack } = stackWith('');
  const scene = decodeScene(shellScene.encodeShellScene(stack.paintUndimmed(), 0));
  assert.equal(scene.layers.length, 1, 'the plane survives the encoder (anchor pixel)');
  const { placed } = displayList.readDisplayList(scene.layers[0].presentations[0].raw, 0);
  assert.equal(placed.displayList.calls.length, 1);
  assert.equal(placed.displayList.calls[0].op, displayList.DrawOp.CLEAR);
  assert.ok(composite(scene, windowScreen()).every((v) => v === 0));
});

test('scrolling repaints within limits and a short message keeps a single strip', async () => {
  const h = stackWith(LONG);
  for (let i = 0; i < 5; i++) await h.stack.handleInput({ type: 'scroll-down' });
  assert.doesNotThrow(() => shellScene.encodeShellScene(h.stack.paintUndimmed(), 0));
  h.setText('Mañana a las diez.');
  const scene = decodeScene(shellScene.encodeShellScene(h.stack.paintUndimmed(), 0));
  const { placed } = displayList.readDisplayList(scene.layers[0].presentations[0].raw, 0);
  assert.equal(placed.displayList.calls.length, 2, 'clear + one strip');
});

test('retired layer passes through to the planes below and stays encodable', () => {
  const h = stackWith(LONG);
  h.layer.retire();
  const planes = h.stack.paintUndimmed();
  const scene = decodeScene(shellScene.encodeShellScene(planes, 0));
  for (const layer of scene.layers) assert.equal(layer.presentations.length, 0, 'no cover once retired');
});

test('strip splitter respects the limit at any width and keeps all ink', () => {
  const image = new graphics.GrayImage(576, 288, 0);
  image.fillRect(0, 0, 576, 288, 200);
  const strips = hermesTextStrips(image);
  assert.ok(strips.length >= 2);
  let rows = 0;
  for (const strip of strips) {
    assert.ok(hermesResourceBytes(strip.image.width, strip.image.height) <= LIMIT);
    assert.equal(strip.image.pixels.length, strip.image.width * strip.image.height);
    rows += strip.image.height;
  }
  assert.equal(rows, 288, 'every row is carried exactly once');
  const sparse = new graphics.GrayImage(576, 288, 0);
  sparse.setPixel(100, 150, 9);
  // Arrays from the vm realm: compare their contents, not their prototypes.
  assert.equal(JSON.stringify(hermesTextStrips(sparse).map((s) => [s.x, s.y, s.image.width, s.image.height])), '[[100,150,1,1]]');
  assert.equal(hermesTextStrips(new graphics.GrayImage(576, 288, 0)).length, 0);
});
