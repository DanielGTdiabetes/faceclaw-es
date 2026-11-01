const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');
const { speakerProbeSummary } = require('../.test-build/app/conversation-detection/speaker-probe-summary.js');
const { LocalConversationTurns } = require('../.test-build/app/conversation-detection/local-conversation-turns.js');

function moduleUnderTest(path, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, global: { isAndroid: true }, console, ...globals,
    require(name) { if (!(name in mocks)) throw new Error(`Missing mock ${name}`); return mocks[name]; } });
  return exports;
}

const stat = (n, mean) => (n ? { n, mean, min: mean, max: mean } : { n: 0 });
const variant = (name, over = {}) => ({ name, embedded: 3, unchanged: 1, short: 0, failed: 0, profile: stat(3, 0.7),
  profileDelta: stat(3, -0.08), nearest: stat(2, 0.75), nearestDelta: stat(2, 0.031), zoneChanged: 1, toWearer: 0,
  fromWearer: 1, groupChanged: 0, ...over });
const PROBE = { status: 'cerrado', windows: 4, omitted: 0, errors: 0, maxWindows: 64, window: { durationMs: stat(4, 2500) },
  current: { profile: stat(4, 0.78), nearest: stat(2, 0.72) },
  variants: [variant('recortado'), variant('nivelado', { embedded: 0, unchanged: 4, profileDelta: stat(0), nearestDelta: stat(0),
    zoneChanged: 0, fromWearer: 0 })], note: 'energia, no prueba voz limpia' };

/** `native` mimics FaceclawLocalTranscriber; `withProbe` false is an older APK without the D0 methods. */
function harness({ withProbe = true, probeJson = () => '{"status":"off"}' } = {}) {
  const calls = [];
  const native = { setListener() {}, stop() {}, resetStream() {},
    diagnostics: () => '{"status":"listo","worker":true,"busy":false,"inputBufferedBytes":0,"accepted":0,"abstentions":0,"dropped":0}',
    start(...args) { calls.push(['start', ...args]); return true; },
    startWithSpeakers(...args) { calls.push(['startWithSpeakers', ...args]); return true; } };
  if (withProbe) {
    native.setSpeakerProbe = (enabled) => { calls.push(['setSpeakerProbe', enabled]); return true; };
    native.speakerProbe = () => probeJson();
  }
  const { LocalTranscription } = moduleUnderTest('app/native/local-transcription.ts', {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({}) } } },
    './asr-model': { isAsrModelReady: () => true },
    '../conversation-detection/session-controls': controls,
    '../conversation-detection/local-conversation-turns': { LocalConversationTurns },
    '../apps/microphones/mic-models': { isMicModelReady: (id) => id === 'speaker-embedding' },
  }, { com: { faceclaw: { app: { FaceclawLocalTranscriber: function () { return native; },
    FaceclawLocalTranscriptListener: function (value) { return value; } } } } });
  return { engine: new LocalTranscription(), calls };
}

let enabled = false;
controls.bindConversationSession({ detector: { snapshot: () => ({ enabled }) }, setEnabled() {} });

test('D0 is off by default and every start sets it explicitly, so an opt-in never carries over', () => {
  controls.setConversationModel('whisper-small-es');
  assert.equal(controls.conversationSpeakerProbe(), false);
  const h = harness();
  assert.equal(h.engine.start('auto', true, 1200000), true);
  assert.deepEqual(h.calls.slice(-2), [['setSpeakerProbe', false], ['startWithSpeakers', 'auto', 'whisper-small-es', 1200000]]);
  assert.equal('speakerProbe' in h.engine.snapshot(), false);
  h.engine.stop();

  controls.setConversationSpeakerProbe(true);
  assert.equal(h.engine.start('auto', true, 1200000), true);
  assert.deepEqual(h.calls.slice(-2), [['setSpeakerProbe', true], ['startWithSpeakers', 'auto', 'whisper-small-es', 1200000]]);
  h.engine.stop();
  // Without speaker windows there is nothing to probe, even when selected.
  assert.equal(h.engine.start('auto', false, 120000), true);
  assert.deepEqual(h.calls.slice(-2), [['setSpeakerProbe', false], ['start', 'auto', 'whisper-small-es', 120000]]);
  h.engine.stop();
  controls.setConversationSpeakerProbe(false); controls.setConversationModel('soniox');
});

test('the RAM choice only changes while conversation is OFF', () => {
  enabled = true;
  controls.setConversationSpeakerProbe(true);
  assert.equal(controls.conversationSpeakerProbe(), false);
  enabled = false;
  controls.setConversationSpeakerProbe(true);
  assert.equal(controls.conversationSpeakerProbe(), true);
  controls.setConversationSpeakerProbe(false);
});

test('probe aggregates join the snapshot; bad output or an older APK never breaks it', () => {
  controls.setConversationModel('whisper-small-es');
  const probed = harness({ probeJson: () => JSON.stringify(PROBE) });
  probed.engine.start('auto', true, 1200000);
  const snapshot = probed.engine.snapshot();
  assert.equal(snapshot.status, 'listo');
  assert.equal(JSON.stringify(snapshot.speakerProbe), JSON.stringify(PROBE));   // parsed in another vm realm

  const broken = harness({ probeJson: () => '{no json' });
  broken.engine.start('auto', true, 1200000);
  assert.equal(broken.engine.snapshot().status, 'listo');
  assert.equal('speakerProbe' in broken.engine.snapshot(), false);

  const thrower = harness({ probeJson: () => { throw new Error('jni'); } });
  thrower.engine.start('auto', true, 1200000);
  assert.equal(thrower.engine.snapshot().status, 'listo');

  const old = harness({ withProbe: false });
  assert.equal(old.engine.start('auto', true, 1200000), true);
  assert.deepEqual(old.calls.at(-1), ['startWithSpeakers', 'auto', 'whisper-small-es', 1200000]);
  assert.equal('speakerProbe' in old.engine.snapshot(), false);
  for (const h of [probed, broken, thrower, old]) h.engine.stop();
  controls.setConversationModel('soniox');
});

test('the phone summary shows aggregates, skipped copies and the energy-only limit', () => {
  assert.equal(speakerProbeSummary(undefined), null);
  assert.equal(speakerProbeSummary(null), null);
  const text = speakerProbeSummary(PROBE);
  assert.match(text, /^Diagnóstico D0 \(última sesión\): 4 ventanas\.\n/);
  assert.match(text, /Sin extremos de baja energía: 3 comparadas \(1 iguales\); Δ tu voz -0\.08, Δ voz más próxima \+0\.03; cambios de decisión 1 \(a tu voz 0, desde tu voz 1\), de voz 0\./);
  assert.match(text, /Nivel igualado: sin comparar \(4 iguales\); Δ tu voz —, Δ voz más próxima —;/);
  assert.match(text, /no demuestra voz limpia ni ausencia de mezcla\.$/);
  const busy = speakerProbeSummary({ ...PROBE, status: 'activo', omitted: 5, errors: 1 });
  assert.match(busy, /^Diagnóstico D0 \(en curso\): 4 ventanas, 5 sin analizar \(límite 64\), 1 errores\./);
});

test('session voice counts follow the D0 header and never invent missing numbers', () => {
  const speakers = { status: 'activo', voices: 3, wearer: 12, other: 30, clustered: 0, unknown: 6, errors: 0 };
  const text = speakerProbeSummary(PROBE, speakers);
  assert.match(text, /^Diagnóstico D0 \(última sesión\): 4 ventanas\.\nVoces de la sesión además de la tuya: 3 \(máximo 6\)\. Ventanas con texto: tuyas 12, de otras voces 30, sin atribuir 6\.\nSin extremos/);
  const noProfile = speakerProbeSummary(PROBE, { ...speakers, wearer: 0, other: 0, clustered: 40, errors: 2 });
  assert.match(noProfile, /tuyas 0, de otras voces 0, agrupadas sin perfil 40, sin atribuir 6, errores 2\./);
  // Missing or malformed counters: the summary stays as before, without a counts line.
  for (const bad of [undefined, null, { ...speakers, voices: undefined }, { ...speakers, unknown: -1 }, { ...speakers, other: 'x' }]) {
    const plain = speakerProbeSummary(PROBE, bad);
    assert.equal(plain.includes('Voces de la sesión'), false);
    assert.equal(plain, speakerProbeSummary(PROBE));
  }
  // Counts alone never create a D0 summary.
  assert.equal(speakerProbeSummary(null, speakers), null);
});

test('the native speaker counters reach the snapshot unchanged', () => {
  controls.setConversationModel('whisper-small-es');
  const h = harness();
  h.engine.start('auto', true, 1200000);
  const native = JSON.parse('{"status":"listo","worker":true,"busy":false,"inputBufferedBytes":0,"accepted":0,"abstentions":0,"dropped":0,'
    + '"speakers":{"status":"activo","voices":2,"wearer":5,"other":7,"clustered":0,"unknown":1,"errors":0}}');
  h.engine.engine.diagnostics = () => JSON.stringify(native);
  assert.equal(JSON.stringify(h.engine.snapshot().speakers), JSON.stringify(native.speakers));
  h.engine.stop(); controls.setConversationModel('soniox');
});
