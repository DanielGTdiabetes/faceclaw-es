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
const { gatekeeperPrompt } = require('../.test-build/app/conversation-detection/gatekeeper.js');
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
  const native = { setListener(value) { callback = value; }, stop() {}, resetStream() {},
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
  assert.equal(h.frames.filter(f => f.type === 'assess').length, 0);
  assert.equal(h.runtime.diagnostics().singleVoice.skipped, 1);
  h.local.accept('¿Mañana llueve aquí?', 9000, 11000, 'portador', 'portador');
  h.advance(5500);
  const assess = h.frames.find(f => f.type === 'assess');
  assert.ok(assess);
  assert.deepEqual(assess.turns.map(t => [t.speaker, t.relation]),
    [['voz-1', 'otro'], ['voz-1', 'otro'], ['voz-1', 'otro'], ['portador', 'portador']]);
  h.runtime.dispose();

  const off = localRuntime(false);
  off.local.accept('Buenas noches, empieza el informativo.', 0, 3000, 'voz-1', 'otro');
  off.local.accept('Hoy lloverá en el litoral.', 3000, 6000, 'voz-1', 'otro');
  off.local.accept('Y bajarán las temperaturas.', 6000, 9000, 'voz-1', 'otro');
  off.advance(2500);
  assert.equal(off.frames.filter(f => f.type === 'assess').length, 1);
  assert.deepEqual(off.runtime.diagnostics().singleVoice, { enabled: false, skipped: 0 });
  off.runtime.dispose();
});

test('the Gatekeeper prompt shows who speaks without inventing labels', () => {
  const turns = [{ seq: 1, speaker: 'voz-1', relation: 'otro', text: '¿Sabes a qué hora cierra?' },
    { seq: 2, speaker: null, relation: 'desconocido', text: 'Ni idea.' }];
  const prompt = gatekeeperPrompt({ mode: 'assess', final: false, memoryEnabled: false, sentThroughSeq: 0, lastTextAt: 0,
    context: { modality: 'identidad-opcional', turns, ref: {} } }, 'chatml');
  assert.ok(prompt.includes('"speaker":"voz-1","relation":"otro"'));
  assert.ok(prompt.includes('"speaker":null,"relation":"desconocido"'));
  assert.ok(prompt.includes('relation portador es quien lleva las gafas'));
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
