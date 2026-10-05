const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { ConversationCaptureCoordinator } = require('../.test-build/app/conversation-detection/coordinator.js');

// Run the controller's actual presence gate and setup with the real coordinator.
function harness(lockEnabled = false) {
  const file = ts.createSourceFile('controller.ts', fs.readFileSync('app/g2/dashboard-controller.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const controller = file.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'DashboardController');
  const methods = ['setConversationCaptureEnabled', 'setManualConversationEnabled', 'ensureWearStateTracking', 'detectorEnvironment']
    .map(name => controller.members.find(node => node.name?.getText(file) === name).getText(file));
  let presence = { connected: true, worn: null, charging: false }, queries = 0, starts = 0, stops = 0, microphone = true;
  const begins = [];
  const context = { exports: {}, global: { isAndroid: true },
    lockScreenEnabledSetting: { get: () => lockEnabled }, getGlassesPresence: () => presence,
    hasMicrophonePermission: () => microphone, voiceActivity: { isActive: () => false },
    // Manual ON prerequisites outside presence: conv/2 bridge (optional identity) and a Soniox key.
    assistantBridge: { conversation: { isSupported: () => true, supportsOptionalIdentity: () => true } },
    sonioxApiKeySetting: { get: () => 'synthetic' }, setConversationTextEngine() {}, conversationTextEngine: () => 'soniox',
    assistantAudioPriority: { isActive: () => false }, voiceControlBridge: { experimentalAudioAvailable: () => true },
    // C1: default RAM session options read once at ON.
    conversationSessionOptions: () => ({ language: 'auto', diagnostics: false }),
  };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${methods.join('\n')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const instance = new context.exports.Harness();
  Object.assign(instance, { phase: 'connected', customFirmwareConfirmed: true, keyboardInput: false,
    communicator: { enableWearDetectionAndRequestState: () => { queries++; return Promise.resolve(); } },
    appendLog: () => {},
    // Hermes is not selected in these presence checks; the owner still exists on the controller.
    hermesSelected: false, setConversationHermesSelected() { this.hermesSelected = true; return true; },
    conversationHermes: { begin: (...args) => { begins.push(args); return true; }, stop() { begins.length = 0; },
      snapshot: () => ({ enabled: begins.length > 0 }) },
  });
  instance.conversationDetector = new ConversationCaptureCoordinator({
    environment: () => instance.detectorEnvironment(), prepare: () => Promise.resolve(true),
    acquire: () => { starts++; return { stop: () => stops++, diagnostics: () => '' }; },
    now: () => 1000, every: () => () => {},
    transcription: { start: () => true, stop() {}, resetStream() {}, acceptNative() {}, text: () => '',
      snapshot: () => ({ engine: 'soniox', status: 'escuchando' }) },
  });
  return { instance, begins, counts: () => ({ queries, starts, stops }),
    set(patch) { presence = { ...presence, ...patch }; },
    denyMicrophone() { microphone = false; },
    async report(worn) { presence = { ...presence, worn }; instance.conversationDetector.refresh(); await Promise.resolve(); },
  };
}

test('ON with lock screen disabled queries presence but never captures from an unknown or negative report', async () => {
  const h = harness();
  h.instance.ensureWearStateTracking();
  assert.equal(h.counts().queries, 0);
  h.instance.setConversationCaptureEnabled(true);
  assert.deepEqual(h.counts(), { queries: 1, starts: 0, stops: 0 });
  await h.report(false);
  assert.equal(h.counts().starts, 0);
  await h.report(true);
  assert.equal(h.counts().starts, 1);
  h.instance.setConversationCaptureEnabled(false);
  assert.deepEqual(h.counts(), { queries: 1, starts: 1, stops: 1 });
});

test('reconnect while ON queries the ready session and still requires a new positive report', async () => {
  const h = harness();
  h.instance.setConversationCaptureEnabled(true); await h.report(true);
  h.instance.phase = 'connecting'; await h.report(null);
  h.instance.ensureWearStateTracking();
  assert.deepEqual(h.counts(), { queries: 1, starts: 1, stops: 1 });
  h.instance.phase = 'connected';
  h.instance.ensureWearStateTracking();
  assert.deepEqual(h.counts(), { queries: 2, starts: 1, stops: 1 });
  await h.report(true);
  assert.equal(h.counts().starts, 2);
  h.instance.setConversationCaptureEnabled(false);
});

test('lock screen keeps its existing presence setup while capture is OFF', () => {
  const h = harness(true);
  h.instance.ensureWearStateTracking();
  assert.deepEqual(h.counts(), { queries: 1, starts: 0, stops: 0 });
});

test('manual ON with lock screen off and no wear report waits suspended, queries presence and captures on ON_HEAD', async () => {
  const h = harness();
  assert.equal(h.instance.setManualConversationEnabled(true), '');
  const waiting = h.instance.conversationDetector.snapshot();
  assert.equal(waiting.enabled, true);
  assert.equal(waiting.state, 'suspendido');
  assert.match(waiting.reason, /gafas puestas/);
  assert.equal(h.begins.length, 1, 'Hermes armed for the manual session');
  assert.deepEqual(h.counts(), { queries: 1, starts: 0, stops: 0 });
  await h.report(true);
  assert.equal(h.counts().starts, 1, 'a fresh ON_HEAD prepares and acquires capture');
  assert.equal(h.instance.setManualConversationEnabled(false), '');
  assert.equal(h.instance.conversationDetector.snapshot().enabled, false);
  assert.deepEqual(h.counts(), { queries: 1, starts: 1, stops: 1 });
});

test('manual ON still refuses when disconnected, charging or without microphone permission', () => {
  const cases = [
    [(h) => { h.instance.phase = 'connecting'; }, /desconectadas/],
    [(h) => { h.set({ charging: true }); }, /en carga/],
    [(h) => { h.denyMicrophone(); }, /permiso de micrófono/],
    [(h) => { h.instance.customFirmwareConfirmed = false; }, /firmware Faceclaw/],
  ];
  for (const [arrange, reason] of cases) {
    const h = harness();
    arrange(h);
    assert.match(h.instance.setManualConversationEnabled(true), reason);
    assert.equal(h.instance.conversationDetector.snapshot().enabled, false);
    assert.equal(h.begins.length, 0);
    assert.deepEqual(h.counts(), { queries: 0, starts: 0, stops: 0 });
  }
});
