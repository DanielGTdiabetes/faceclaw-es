const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalEnergyVad } = require('../.test-build/app/conversation-detection/local-vad.js');

function wave(amplitude = 1000, dc = 0) {
  const pcm = new Uint8Array(1600);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < 800; i++) view.setInt16(i * 2, Math.round(dc + amplitude * Math.sin(2 * Math.PI * 300 * i / 16000)), true);
  return pcm;
}
const quiet = new Uint8Array(1600);
function feed(vad, pcm, chunks) { for (let i = 0; i < chunks; i++) vad.accept(pcm); }

test('silence remains inactive acoustically and a bounded floor never collapses to zero', () => {
  const vad = new LocalEnergyVad();
  assert.equal(vad.snapshot().state, 'inactivo');
  feed(vad, quiet, 2400);
  assert.equal(vad.snapshot().episodes, 0);
  assert.equal(vad.snapshot().positiveMs, 0);
  assert.equal(vad.snapshot().state, 'sin actividad');
  assert.ok(vad.snapshot().noiseFloor >= 0.001);
});

test('signed PCM energy is DC independent; constant offsets and saturated DC are silent', () => {
  for (const dc of [-32768, -12000, 12000, 32767]) {
    const vad = new LocalEnergyVad();
    feed(vad, wave(0, dc), 10);
    assert.equal(vad.snapshot().frameRms, 0);
    assert.equal(vad.snapshot().episodes, 0);
  }
  const plain = new LocalEnergyVad(), offset = new LocalEnergyVad();
  plain.accept(wave()); offset.accept(wave(1000, 12000));
  assert.ok(Math.abs(plain.snapshot().frameRms - offset.snapshot().frameRms) < 1e-10);
});

test('150 ms of sustained energy opens one provisional episode, not every chunk', () => {
  const vad = new LocalEnergyVad();
  feed(vad, wave(), 2);
  assert.equal(vad.snapshot().state, 'candidato');
  assert.equal(vad.snapshot().episodes, 0);
  vad.accept(wave());
  assert.equal(vad.snapshot().state, 'posible voz');
  feed(vad, wave(), 37);
  assert.equal(vad.snapshot().episodes, 1);
  assert.equal(vad.snapshot().positiveMs, 2000);
});

test('a click, a short burst and disjoint candidates never satisfy onset', () => {
  const click = new Uint8Array(1600); new DataView(click.buffer).setInt16(0, 12000, true);
  const vad = new LocalEnergyVad();
  vad.accept(click); vad.accept(quiet);
  for (let i = 0; i < 10; i++) { feed(vad, wave(), 2); vad.accept(quiet); }
  assert.equal(vad.snapshot().episodes, 0);
});

test('release requires 600 ms quiet; a shorter pause resumes the same episode', () => {
  const vad = new LocalEnergyVad();
  feed(vad, wave(), 3); feed(vad, quiet, 11);
  assert.equal(vad.snapshot().state, 'pausa');
  assert.equal(vad.snapshot().completed, 0);
  vad.accept(wave());
  assert.equal(vad.snapshot().episodes, 1);
  feed(vad, quiet, 12);
  assert.equal(vad.snapshot().state, 'sin actividad');
  assert.equal(vad.snapshot().completed, 1);
  feed(vad, wave(), 3);
  assert.equal(vad.snapshot().episodes, 2);
});

test('hysteresis retains weak energy only inside an already opened episode', () => {
  const vad = new LocalEnergyVad();
  const weak = wave(150);
  feed(vad, weak, 3);
  assert.equal(vad.snapshot().episodes, 0);
  feed(vad, wave(), 3); vad.accept(weak);
  assert.equal(vad.snapshot().state, 'posible voz');
});

test('background follows quiet frames but never learns sustained positive energy', () => {
  const vad = new LocalEnergyVad();
  feed(vad, wave(85), 400);
  const floor = vad.snapshot().noiseFloor;
  assert.ok(floor > 0.0015 && floor < 0.002);
  assert.equal(vad.snapshot().episodes, 0);
  feed(vad, wave(), 100);
  assert.equal(vad.snapshot().noiseFloor, floor);
});

test('heavily clipped alternating samples abstain rather than claiming voice', () => {
  const pcm = new Uint8Array(1600), view = new DataView(pcm.buffer);
  for (let i = 0; i < 800; i++) view.setInt16(i * 2, i % 2 ? 32767 : -32768, true);
  const vad = new LocalEnergyVad(); feed(vad, pcm, 10);
  assert.equal(vad.snapshot().positiveMs, 0);
  assert.equal(vad.snapshot().episodes, 0);
});

test('stream reset interrupts active episodes and discards onset and background state', () => {
  const vad = new LocalEnergyVad();
  feed(vad, wave(), 2); vad.resetStream(); vad.accept(wave());
  assert.equal(vad.snapshot().episodes, 0);
  feed(vad, wave(), 2); vad.resetStream(); vad.resetStream();
  assert.equal(vad.snapshot().interrupted, 1);
  assert.equal(vad.snapshot().completed, 0);
  assert.equal(vad.snapshot().state, 'inactivo');
  assert.equal(vad.snapshot().noiseFloor, 0.0015);
  feed(vad, wave(), 3);
  assert.equal(vad.snapshot().episodes, 2);
});

test('no input buffer or history survives accept; snapshots are detached scalars', () => {
  const vad = new LocalEnergyVad(), pcm = wave();
  vad.accept(pcm);
  const saved = vad.snapshot(); pcm.fill(0);
  assert.deepEqual(vad.snapshot(), saved);
  saved.episodes = 99;
  assert.equal(vad.snapshot().episodes, 0);
  // C1's optional observer is an object reference, not retained PCM; without instrumentation it is null.
  assert.equal(vad.observer, null);
  for (const [key, value] of Object.entries(vad)) {
    if (key !== 'observer') assert.ok(typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string');
  }
});

test('invalid framing is rejected without updating VAD', () => {
  const vad = new LocalEnergyVad(), before = vad.snapshot();
  for (const length of [0, 1599, 1602]) assert.throws(() => vad.accept(new Uint8Array(length)), /800 samples/);
  assert.deepEqual(vad.snapshot(), before);
});
