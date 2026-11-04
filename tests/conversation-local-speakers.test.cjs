const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');
const { LocalConversationTurns, isLocalWindowTurn, isAnonymousLocalTurn } = require('../.test-build/app/conversation-detection/local-conversation-turns.js');
const { ConversationEpisodeTracker } = require('../.test-build/app/conversation-detection/conversation-episodes.js');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const { ConversationHermesRuntime } = require('../.test-build/app/conversation-detection/conversation-hermes.js');
const { isSingleForeignVoice } = require('../.test-build/app/conversation-detection/conversation-prefilter.js');
const replay = require('../scripts/gatekeeper-replay.cjs');
const POLICY = { candidateMs: 15000, silenceMs: 30000, maxTurns: 12, maxChars: 6000 };

function moduleUnderTest(path, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, global: { isAndroid: true }, console, ...globals,
    require(name) { if (!(name in mocks)) throw new Error(`Missing mock ${name}`); return mocks[name]; } });
  return exports;
}

function engineHarness(speakerModel) {
  const calls = [];
  let callback;
  const native = { setListener(value) { callback = value; }, stop() {}, resetStream() { calls.push(['acoustic-reset']); },
    diagnostics: () => JSON.stringify({ status: 'listo', worker: true }),
    start(...args) { calls.push(['start', ...args]); return true; },
    startWithSpeakers(...args) { calls.push(['startWithSpeakers', ...args]); return true; } };
  const { LocalTranscription } = moduleUnderTest('app/native/local-transcription.ts', {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({}) } } },
    './asr-model': { isAsrModelReady: () => true },
    './system-transcription': { isSystemTranscriptionReady: () => false },
    '../conversation-detection/session-controls': controls,
    '../conversation-detection/local-conversation-turns': { LocalConversationTurns },
    '../apps/microphones/mic-models': { isMicModelReady: id => id === 'speaker-embedding' && speakerModel },
  }, { com: { faceclaw: { app: { FaceclawLocalTranscriber: function () { return native; },
    FaceclawLocalTranscriptListener: function (value) { return value; } } } } });
  return { engine: new LocalTranscription(), calls, callback: () => callback };
}

for (const detectedBy of ['timer', 'next-chunk']) {
test(`manual local PCM recovery retains the wire episode, ACK and heard context: ${detectedBy}`, async () => {
  const { ConversationCaptureCoordinator, PCM_GAP_GRACE_MS } = require('../.test-build/app/conversation-detection/coordinator.js');
  const { SonioxConversationTranscription } = require('../.test-build/app/native/soniox-conversation.js');
  controls.setConversationModel('whisper-small-es');
  const local = engineHarness(true), frames = [], outputs = [], timers = new Set();
  let now = 1000, pcm;
  const timer = (cb, ms) => { const t = { cb, ms, at: now + ms }; timers.add(t); return () => timers.delete(t); };
  const advance = ms => { now += ms; for (const t of [...timers]) if (t.at <= now && timers.has(t)) { t.at = now + t.ms; t.cb(); } };
  const transcription = new SonioxConversationTranscription(local.engine, { engine: () => 'local', apiKey: () => '',
    now: () => now, every: timer, connect() { throw Error('No network in this test'); } });
  const session = {};
  const detector = new ConversationCaptureCoordinator({ now: () => now, every: timer,
    environment: () => ({ available: true, reason: '', session }), prepare: async () => true,
    acquire(cb) { pcm = cb; return { stop() {}, diagnostics: () => '{}' }; }, transcription });
  const channel = new ConversationChannel({ now: () => now, after: () => () => {}, send(frame) { frames.push(frame); return true; } });
  channel.negotiate(['conv/1', 'conv/2', 'conv/memory-ack/1']);
  const runtime = new ConversationHermesRuntime(detector, channel, { now: () => now, every: timer,
    changed() {}, onOutput: text => outputs.push(text) }, POLICY);
  assert.equal(runtime.begin(null, 'identidad-opcional'), true);
  detector.setEnabled(true, true, 'off', { manualConversation: true, textEngine: 'local' });
  await Promise.resolve(); pcm(new Uint8Array(1600)); advance(50);
  local.callback().onSpeakerSegment('¿Qué planes tengo mañana?', 'es', 0, 1000, 'portador', 'portador');
  advance(700);
  const first = frames.find(f => f.type === 'assist'); assert.ok(first);
  channel.handle({ chan: 'conv', type: 'result', mode: 'assist', requestId: first.requestId, ref: first.ref,
    kind: 'mensaje', text: 'Tienes dos actividades.', deliveryId: 'first-ack' });
  runtime.capturePresentation()();
  pcm(new Uint8Array(1600)); advance(50);
  const before = runtime.snapshot(), resets = local.calls.filter(c => c[0] === 'acoustic-reset').length;
  if (detectedBy === 'timer') { advance(1000); assert.equal(detector.snapshot().recoveringPcm, true); }
  else now += 1000;
  pcm(new Uint8Array(1600)); advance(50);
  assert.equal(local.calls.filter(c => c[0] === 'acoustic-reset').length, resets + 1);
  assert.equal(runtime.snapshot().presentationEpoch, before.presentationEpoch);
  local.callback().onSpeakerSegment('¿Otro día también completo?', 'es', 1000, 2000, 'portador', 'portador');
  advance(700);
  const next = frames.filter(f => f.type === 'assist').at(-1);
  for (const key of ['sessionId', 'streamId', 'associationVersion', 'episodeId']) assert.equal(next.ref[key], first.ref[key], key);
  assert.deepEqual(next.turns.map(t => t.text), ['¿Qué planes tengo mañana?', '¿Otro día también completo?']);
  assert.equal(frames.filter(f => f.type === 'presented' && f.deliveryId === 'first-ack').length, 1);
  assert.equal(outputs.at(-1), 'Tienes dos actividades.', 'recovery does not clear the visible answer');
  advance(PCM_GAP_GRACE_MS + 1);
  assert.equal(detector.snapshot().enabled, false); assert.equal(runtime.snapshot().enabled, false);
  assert.deepEqual(local.engine.turns(), []);
  runtime.dispose(); controls.setConversationModel('soniox');
});
}

test('only the explicit acoustic-only reset keeps local turns; release and a new session erase them', () => {
  controls.setConversationModel('whisper-small-es'); const h = engineHarness(true); h.engine.start();
  h.callback().onSpeakerSegment('Contexto sintético', 'es', 0, 1000, 'portador', 'portador');
  const first = h.engine.turns()[0]; h.engine.resetStream(true);
  assert.equal(h.engine.turns().length, 1); assert.equal(h.engine.text(), 'Contexto sintético');
  h.callback().onSpeakerSegment('Seguimiento sintético', 'es', 1000, 2000, 'portador', 'portador');
  assert.equal(h.engine.turns()[1].streamId, first.streamId);
  h.engine.resetStream(); assert.deepEqual(h.engine.turns(), []); assert.equal(h.engine.text(), '');
  h.callback().onSpeakerSegment('Tras reconexión', 'es', 2000, 3000, 'portador', 'portador');
  assert.notEqual(h.engine.turns()[0].streamId, first.streamId);
  h.engine.stop(); h.engine.start();
  h.callback().onSpeakerSegment('Sesión nueva', 'es', 0, 1000, 'portador', 'portador');
  assert.notEqual(h.engine.turns()[0].sessionId, first.sessionId); h.engine.stop(); controls.setConversationModel('soniox');
});

test('manual Whisper conversations ask for speakers only with the speaker model and the RAM choice', () => {
  controls.bindConversationSession({ detector: { snapshot: () => ({ enabled: false }) }, setEnabled() {} });
  controls.setConversationModel('whisper-small-es');
  const ready = engineHarness(true);
  assert.equal(ready.engine.start('auto', true, 1200000), true);
  assert.deepEqual(ready.calls.at(-1), ['startWithSpeakers', 'auto', 'whisper-small-es', 1200000]);
  ready.engine.stop();
  assert.equal(ready.engine.start('auto', false, 120000), true);
  assert.deepEqual(ready.calls.at(-1), ['start', 'auto', 'whisper-small-es', 120000]);
  ready.engine.stop();
  controls.setConversationLocalSpeakers(false);
  assert.equal(ready.engine.start('auto', true, 1200000), true);
  assert.equal(ready.calls.at(-1)[0], 'start');
  ready.engine.stop(); controls.setConversationLocalSpeakers(true);
  const missing = engineHarness(false);
  assert.equal(missing.engine.start('es', true, 1200000), true);
  assert.deepEqual(missing.calls.at(-1), ['start', 'es', 'whisper-small-es', 1200000]);
  missing.engine.stop(); controls.setConversationModel('soniox');
});

test('labelled windows become local turns; unknown labels and relations are refused', () => {
  controls.setConversationModel('whisper-small-es');
  const h = engineHarness(true), turns = [];
  h.engine.subscribeTurns(t => turns.push(t));
  assert.equal(h.engine.start('auto', true, 1200000), true);
  h.callback().onSpeakerSegment('¿Vamos mañana?', 'es', 0, 3000, 'portador', 'portador');
  h.callback().onSpeakerSegment('Sí, a las diez.', 'es', 3000, 5000, 'voz-1', 'otro');
  h.callback().onSpeakerSegment('Vale.', 'es', 5000, 6000, '', 'desconocido');
  h.callback().onSpeakerSegment('Etiqueta inventada', 'es', 6000, 7000, 'Ana', 'otro');
  h.callback().onSpeakerSegment('Relación rara', 'es', 7000, 8000, 'voz-2', 'jefe');
  assert.deepEqual(turns.map(t => [t.speaker, t.relation]),
    [['portador', 'portador'], ['voz-1', 'otro'], [null, 'desconocido'], ['voz-2', 'desconocido']]);
  assert.ok(turns.every(isLocalWindowTurn));
  assert.equal(isAnonymousLocalTurn(turns[2]), true); assert.equal(isAnonymousLocalTurn(turns[0]), false);
  h.engine.stop(); controls.setConversationModel('soniox');
});

test('optional episodes accept attributed local turns but keep one relation per voice', () => {
  const local = new LocalConversationTurns(); local.start('whisper-small-es');
  assert.equal(local.accept('Hola, ¿qué tal?', 0, 2000, 'voz-1', 'otro'), true);
  assert.equal(local.accept('Bien, ¿y tú?', 2000, 4000, 'portador', 'portador'), true);
  assert.equal(local.accept('Sin perfil', 4000, 5000, 'portador', 'otro'), false);
  const [first, second] = local.list();
  const optional = new ConversationEpisodeTracker(() => 1000, POLICY);
  optional.start(first.sessionId, first.streamId, 'identidad-opcional');
  assert.equal(optional.accept(first), true); assert.equal(optional.accept(second), true);
  assert.equal(optional.accept({ ...first, seq: 3, startMs: 5000, endMs: 6000, relation: 'desconocido' }), false);
  const required = new ConversationEpisodeTracker(() => 1000, POLICY);
  required.start(first.sessionId, first.streamId); assert.equal(required.accept(first), false);
});

test('single foreign voice: three turns of one non-wearer voice; any wearer or unlabelled turn keeps it', () => {
  const t = (speaker, relation) => ({ speaker, relation });
  assert.equal(isSingleForeignVoice([t('voz-1', 'otro'), t('voz-1', 'otro'), t('voz-1', 'otro')]), true);
  assert.equal(isSingleForeignVoice([t('voz-1', 'desconocido'), t('voz-1', 'desconocido'), t('voz-1', 'desconocido')]), true);
  assert.equal(isSingleForeignVoice([t('voz-1', 'otro'), t('voz-1', 'otro')]), false);
  assert.equal(isSingleForeignVoice([t('voz-1', 'otro'), t('voz-1', 'otro'), t('portador', 'portador')]), false);
  assert.equal(isSingleForeignVoice([t('voz-1', 'otro'), t('voz-2', 'otro'), t('voz-1', 'otro')]), false);
  assert.equal(isSingleForeignVoice([t(null, 'desconocido'), t(null, 'desconocido'), t(null, 'desconocido')]), false);
  assert.equal(isSingleForeignVoice([t('portador', 'portador'), t('portador', 'portador'), t('portador', 'portador')]), false);
});

function localRuntime(singleVoiceFilter) {
  let now = 1000;
  const local = new LocalConversationTurns(), frames = [], timers = new Set();
  const timer = (fn, ms, repeat = false) => { const t = { fn, at: now + ms, ms, repeat }; timers.add(t); return () => timers.delete(t); };
  const source = { snapshot: () => ({ enabled: true, state: 'escuchando', transcription: { engine: 'local' } }),
    subscribe: () => () => {}, subscribeTurns: fn => local.subscribe(fn), subscribeAssociation: () => () => {}, wearerActionRef: () => null };
  const channel = new ConversationChannel({ now: () => now, after: timer, send: frame => { frames.push(frame); return true; } });
  channel.negotiate(['conv/1', 'conv/2']);
  const runtime = new ConversationHermesRuntime(source, channel, { now: () => now, every: (fn, ms) => timer(fn, ms, true),
    changed() {}, onOutput() {} }, POLICY);
  assert.equal(runtime.begin(null, 'identidad-opcional', { singleVoiceFilter }), true);
  local.start('whisper-small-es');
  const advance = ms => { now += ms; for (const t of [...timers]) if (t.at <= now && timers.has(t)) { if (t.repeat) t.at = now + t.ms; else timers.delete(t); t.fn(); } };
  return { local, frames, runtime, advance };
}

test('the opt-in single-voice filter skips a TV monologue and resumes when the wearer speaks', () => {
  const h = localRuntime(true);
  h.local.accept('Buenas noches, empieza el informativo.', 0, 3000, 'voz-1', 'otro');
  h.local.accept('Hoy lloverá en el litoral.', 3000, 6000, 'voz-1', 'otro');
  h.local.accept('Y bajarán las temperaturas.', 6000, 9000, 'voz-1', 'otro');
  h.advance(2500);
  assert.equal(h.frames.filter(f => f.type === 'assist').length, 0);
  assert.equal(h.runtime.diagnostics().singleVoice.skipped, 1);
  h.local.accept('¿Mañana llueve aquí?', 9000, 11000, 'portador', 'portador');
  h.advance(5500);
  const assist = h.frames.find(f => f.type === 'assist');
  assert.ok(assist);
  assert.deepEqual(assist.turns.map(t => [t.speaker, t.relation]),
    [['voz-1', 'otro'], ['voz-1', 'otro'], ['voz-1', 'otro'], ['portador', 'portador']]);
  h.runtime.dispose();

  const off = localRuntime(false);
  off.local.accept('Buenas noches, empieza el informativo.', 0, 3000, 'voz-1', 'otro');
  off.local.accept('Hoy lloverá en el litoral.', 3000, 6000, 'voz-1', 'otro');
  off.local.accept('Y bajarán las temperaturas.', 6000, 9000, 'voz-1', 'otro');
  off.advance(2500);
  assert.equal(off.frames.filter(f => f.type === 'assist').length, 1);
  assert.deepEqual(off.runtime.diagnostics().singleVoice, { enabled: false, skipped: 0 });
  off.runtime.dispose();
});

test('replay validates optional speakers and scores the deterministic single-voice rule', () => {
  const rows = replay.readJsonl('tests/fixtures/gatekeeper/speakers.jsonl');
  assert.equal(replay.validateDataset(rows).length, 12);
  assert.ok(rows.every(r => r.source === 'synthetic' && r.review === 'pending'));
  const bad = { ...rows[0], fragmentSpeaker: null, fragmentRelation: 'otro' };
  assert.throws(() => replay.validateDataset([bad]));
  const mixed = { ...rows[0], fragmentRelation: 'portador' };
  assert.throws(() => replay.validateDataset([mixed]));
  assert.deepEqual(rows.filter(replay.singleForeignVoice).map(r => r.id), ['spk-001', 'spk-009']);
  const report = replay.main(['--dataset', 'tests/fixtures/gatekeeper/speakers.jsonl', '--single-voice-rule']);
  assert.equal(report.status, 'deterministic-single-voice-rule');
  assert.equal(report.annotationAssistRecall, 1);
  assert.equal(report.perMode.assess.wouldAvoid, 2);
});
