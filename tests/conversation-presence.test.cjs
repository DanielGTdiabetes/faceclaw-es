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
  const methods = ['setConversationCaptureEnabled', 'ensureWearStateTracking', 'detectorEnvironment']
    .map(name => controller.members.find(node => node.name?.getText(file) === name).getText(file));
  let presence = { connected: true, worn: null, charging: false }, queries = 0, starts = 0, stops = 0;
  const context = { exports: {}, global: { isAndroid: true },
    lockScreenEnabledSetting: { get: () => lockEnabled }, getGlassesPresence: () => presence,
    hasMicrophonePermission: () => true, voiceActivity: { isActive: () => false },
    assistantAudioPriority: { isActive: () => false }, voiceControlBridge: { experimentalAudioAvailable: () => true },
  };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${methods.join('\n')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const instance = new context.exports.Harness();
  Object.assign(instance, { phase: 'connected', customFirmwareConfirmed: true, keyboardInput: false,
    communicator: { enableWearDetectionAndRequestState: () => { queries++; return Promise.resolve(); } },
    appendLog: () => {},
  });
  instance.conversationDetector = new ConversationCaptureCoordinator({
    environment: () => instance.detectorEnvironment(), prepare: () => Promise.resolve(true),
    acquire: () => { starts++; return { stop: () => stops++, diagnostics: () => '' }; },
    now: () => 1000, every: () => () => {},
  });
  return { instance, counts: () => ({ queries, starts, stops }),
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
