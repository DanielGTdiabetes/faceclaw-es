const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');
const { LocalConversationTurns, isAnonymousLocalTurn } = require('../.test-build/app/conversation-detection/local-conversation-turns.js');
const { ConversationEpisodeTracker } = require('../.test-build/app/conversation-detection/conversation-episodes.js');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const { ConversationHermesRuntime } = require('../.test-build/app/conversation-detection/conversation-hermes.js');
const POLICY = { candidateMs: 15000, silenceMs: 30000, maxTurns: 12, maxChars: 6000 };

function moduleUnderTest(path, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, global: { isAndroid: true }, console, ...globals,
    require(name) { if (!(name in mocks)) throw new Error(`Missing mock ${name}`); return mocks[name]; } });
  return exports;
}

test('model, mode and language choices stay OFF, share one selection and freeze during ON', () => {
  let enabled = false, captures = 0;
  controls.bindConversationSession({ detector: { snapshot: () => ({ enabled }) }, setEnabled: () => captures++ });
  assert.equal(controls.conversationTextLanguage(), 'auto');
  for (const model of controls.CONVERSATION_MODELS) {
    controls.setConversationModel(model); assert.equal(controls.conversationModel(), model);
  }
  controls.setConversationUsesHermes(false); enabled = true;
  controls.setConversationModel('soniox'); controls.setConversationUsesHermes(true); controls.setConversationTextLanguage('es');
  assert.equal(controls.conversationModel(), 'whisper-medium-es');
  assert.equal(controls.conversationUsesHermes(), false); assert.equal(controls.conversationTextLanguage(), 'auto');
  assert.equal(captures, 0);
  enabled = false; controls.setConversationModel('soniox'); controls.setConversationUsesHermes(true);
});

test('base, small and medium pass the exact model and deadline to native decoding; no automatic substitution', () => {
  const starts = []; let present = true, callback;
  const native = { setListener(value) { callback = value; }, start(...args) { starts.push(args); return true; }, stop() {}, resetStream() {} };
  const { LocalTranscription } = moduleUnderTest('app/native/local-transcription.ts', {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({}) } } },
    './asr-model': { isAsrModelReady: () => present },
    './system-transcription': { isSystemTranscriptionReady: () => false },
    '../conversation-detection/session-controls': controls,
    '../conversation-detection/local-conversation-turns': { LocalConversationTurns },
  }, { com: { faceclaw: { app: { FaceclawLocalTranscriber: function () { return native; },
    FaceclawLocalTranscriptListener: function (value) { return value; } } } } });
  const engine = new LocalTranscription(), turns = [];
  engine.subscribeTurns(t => turns.push(t));
  for (const model of controls.CONVERSATION_MODELS.filter(id => id !== 'soniox' && id !== 'android-system')) {
    controls.setConversationModel(model);
    assert.equal(engine.start('auto', false, 1200000), true);
    assert.deepEqual(starts.at(-1), ['auto', model, 1200000]);
    callback.onSegment('Texto sintético', 'es', 0, 6000);
    assert.equal(turns.at(-1).engine, model); assert.equal(turns.at(-1).speaker, null);
    engine.stop(); callback.onSegment('Resultado tardío', 'es', 3000, 9000);
    assert.equal(engine.text(), '');
  }
  present = false; controls.setConversationModel('whisper-base-es');
  assert.equal(engine.start(), false); assert.equal(starts.length, 3);
});

test('medium download is pinned, verifies all files and pause invalidates late download callbacks', () => {
  const downloads = [], files = new Set();
  const asr = moduleUnderTest('app/native/asr-model.ts', {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({ getFilesDir: () => ({ getAbsolutePath: () => '/models' }) }) } } },
  }, { java: { io: { File: function (path) { return { exists: () => files.has(path), length: () => 1 }; } } },
    com: { faceclaw: { app: {
      FaceclawModelDownloaderListener: function (listener) { return listener; },
      FaceclawModelDownloader: function (url, path, hash, size, listener) {
        const download = { url, path, hash, size, listener, start() {}, cancel() {} }; downloads.push(download); return download;
      },
    } } } });
  const model = asr.ASR_MODELS['whisper-medium-es'];
  assert.equal(model.totalBytes, model.files.reduce((sum, file) => sum + file.sizeBytes, 0));
  assert.match(model.baseUrl, /8c31d28503847560985df21f90e14f0c736e075e/);
  const kotlin = fs.readFileSync('App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawLocalTranscriber.kt', 'utf8');
  model.files.forEach(file => { assert.ok(kotlin.includes(file.sha256)); assert.match(file.sha256, /^[a-f0-9]{64}$/); });
  asr.startAsrModelDownload('whisper-medium-es'); assert.equal(downloads.length, 1);
  asr.cancelAsrModelDownload('whisper-medium-es'); downloads[0].listener.onDone();
  assert.equal(downloads.length, 1, 'late completion cannot resume a paused download');
  asr.startAsrModelDownload('whisper-medium-es');
  for (let index = 1; index <= 3; index++) {
    const download = downloads[index]; files.add(download.path); download.listener.onDone();
  }
  assert.equal(asr.asrModelState('whisper-medium-es').status, 'ready');
  assert.equal(downloads.length, 4);
});

test('Pixel selects its public native adapter without Whisper downloads and freezes Spanish for that choice only', () => {
  const starts = [], turns = [];
  const native = { setListener(value) { this.callback = value; }, start(...args) { starts.push(args); return true; }, stop() {} };
  const { LocalTranscription } = moduleUnderTest('app/native/local-transcription.ts', {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({}) } } },
    './asr-model': { isAsrModelReady: () => { throw new Error('Pixel does not require Whisper weights'); } },
    './system-transcription': { isSystemTranscriptionReady: () => true },
    '../conversation-detection/session-controls': controls,
    '../conversation-detection/local-conversation-turns': { LocalConversationTurns },
  }, { com: { faceclaw: { app: { FaceclawSystemTranscriber: function () { return native; },
    FaceclawLocalTranscriptListener: function (value) { return value; } } } } });
  controls.setConversationTextLanguage('auto'); controls.setConversationModel('android-system');
  assert.equal(controls.conversationSessionOptions().language, 'es');
  const engine = new LocalTranscription(); engine.subscribeTurns(t => turns.push(t));
  assert.equal(engine.start('auto', false, 1200000), true);
  assert.deepEqual(starts[0], ['es', 'android-system', 1200000]);
  native.callback.onSegment('Texto sintético', 'es', 0, 6000);
  assert.equal(turns[0].engine, 'android-system'); assert.equal(turns[0].speaker, null);
  engine.stop(); controls.setConversationModel('soniox'); assert.equal(controls.conversationSessionOptions().language, 'auto');
});

test('local windows remain anonymous and cannot enter required-identity episodes or invent timing', () => {
  const local = new LocalConversationTurns(); local.start('whisper-small-es');
  assert.equal(local.accept('Hablan varias personas', 0, 6000), true);
  const turn = local.list()[0]; assert.equal(isAnonymousLocalTurn(turn), true);
  assert.equal(local.accept('Repetición tardía', 3000, 6000), false);
  assert.equal(local.accept('Sin intervalo', 9000, 6000), false);
  const required = new ConversationEpisodeTracker(() => 1000, POLICY);
  required.start(turn.sessionId, turn.streamId); assert.equal(required.accept(turn), false);
  const optional = new ConversationEpisodeTracker(() => 1000, POLICY);
  optional.start(turn.sessionId, turn.streamId, 'identidad-opcional'); assert.equal(optional.accept(turn), true);
  assert.equal(optional.accept({ ...turn, seq: 2, relation: 'portador', speaker: '1' }), false);
  local.reset(); assert.equal(local.accept('Tras una interrupción', 6000, 12000), true);
  assert.notEqual(local.list()[0].streamId, turn.streamId);
  local.stop(); assert.equal(local.accept('Después de OFF', 9000, 15000), false); assert.deepEqual(local.list(), []);
});

test('local text reaches Hermes over conv/2, produces an answer, and OFF rejects late replies', () => {
  let now = 1000, enabled = true;
  const local = new LocalConversationTurns(), frames = [], outputs = [], timers = new Set();
  const timer = (fn, ms, repeat = false) => { const t = { fn, at: now + ms, ms, repeat }; timers.add(t); return () => timers.delete(t); };
  const source = { snapshot: () => ({ enabled, state: enabled ? 'escuchando' : 'desactivado', transcription: { engine: 'local' } }),
    subscribe: () => () => {}, subscribeTurns: fn => local.subscribe(fn), subscribeAssociation: () => () => {}, wearerActionRef: () => null };
  const channel = new ConversationChannel({ now: () => now, after: timer, send: frame => { frames.push(frame); return true; } });
  channel.negotiate(['conv/1', 'conv/2']);
  const runtime = new ConversationHermesRuntime(source, channel, { now: () => now, every: (fn, ms) => timer(fn, ms, true),
    changed() {}, onOutput: text => outputs.push(text) }, POLICY);
  assert.equal(runtime.begin(null, 'identidad-opcional'), true);
  local.start('whisper-medium-es'); local.accept('Tenemos que escoger la fecha de la reunión', 0, 6000);
  now += 2500; for (const t of [...timers]) if (t.at <= now) { if (t.repeat) t.at = now + t.ms; else timers.delete(t); t.fn(); }
  const assessment = frames.find(f => f.type === 'assess'); assert.ok(assessment);
  assert.equal(assessment.modality, 'identidad-opcional'); assert.equal(assessment.turns[0].speaker, null);
  channel.handle({ ...assessment, type: 'result', mode: 'assess', verdict: 'tema' });
  const assistance = frames.find(f => f.type === 'assist'); assert.ok(assistance);
  channel.handle({ ...assistance, type: 'result', mode: 'assist', kind: 'mensaje', text: 'Conviene confirmar quién puede asistir.' });
  assert.ok(outputs.includes('Conviene confirmar quién puede asistir.'));
  enabled = false; runtime.stop(); local.stop();
  channel.handle({ ...assistance, type: 'result', mode: 'assist', kind: 'mensaje', text: 'Respuesta tardía' });
  assert.equal(outputs.at(-1), null); assert.equal(timers.size, 0); runtime.dispose();
});

test('phone makes selecting and downloading separate actions, keeps auto language and refuses stale menus during ON', async () => {
  let enabled = false, selectedChoice = '', downloads = 0, captures = 0;
  const detector = { snapshot: () => ({ enabled, languageMode: 'auto' }) };
  controls.bindConversationSession({ detector, setEnabled: () => captures++ });
  controls.setConversationModel('soniox'); controls.setConversationTextLanguage('auto');
  const mocks = new Proxy({
    './remote-controls-view-model': { RemoteControlsViewModel: class {} },
    '@nativescript/core': { Dialogs: { action: async () => selectedChoice } },
    '../g2/dashboard-controller': { dashboardController: { conversationDetector: detector, toggleManualConversation: () => { captures++; return ''; } } },
    '../conversation-detection/session-controls': controls,
    '../native/asr-model': { asrModelState: () => ({ status: 'absent', totalBytes: 946072270 }), startAsrModelDownload: () => downloads++ },
    '../native/conversation-model-options': { conversationModelOption: model => model },
  }, { has: () => true, get: (target, name) => target[name] ?? {} });
  const { MainViewModel } = moduleUnderTest('app/phone-ui/main-view-model.ts', mocks);
  const view = Object.create(MainViewModel.prototype);
  view.refreshConversationUi = () => {}; view.refreshHermesUi = () => {};
  selectedChoice = 'whisper-medium-es'; await view.onConversationEngineTap();
  assert.equal(controls.conversationModel(), 'whisper-medium-es');
  assert.equal(downloads, 0); assert.equal(captures, 0);
  assert.equal(view.conversationDownloadButton, 'Descargar 947 MB');
  assert.equal(view.conversationDownloadVisibility, 'visible');
  assert.equal(view.conversationLanguageButton, 'Idioma: Automático');
  view.onConversationDownloadTap(); assert.equal(downloads, 1); assert.equal(captures, 0);
  selectedChoice = 'Soniox'; enabled = true; await view.onConversationEngineTap(); view.onConversationDownloadTap();
  assert.equal(controls.conversationModel(), 'whisper-medium-es'); assert.equal(downloads, 1);
  enabled = false; controls.setConversationModel('soniox');
  assert.equal(view.conversationDownloadVisibility, 'collapse');
});
