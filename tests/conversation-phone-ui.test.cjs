const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const ui = require('../.test-build/app/conversation-detection/conversation-ui.js');
const guide = require('../.test-build/app/conversation-detection/profile-guide.js');

function harness() {
  let snapshot = { enabled: false, state: 'desactivado', stopReason: 'none', reason: '', remainingMs: 0 };
  let textModel = 'ready', downloads = 0;
  let selectedText = true;
  const starts = [], alerts = [], timers = new Map();
  const detector = { snapshot: () => snapshot, ownProfileState: () => 'guardado', transcriptText: () => '' };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/phone-ui/main-view-model.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports,
    setTimeout(fn, ms) { assert.equal(ms, 500); const id = {}; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === './remote-controls-view-model') return { RemoteControlsViewModel: class {} };
      if (name === '@nativescript/core') return { Dialogs: { alert: data => alerts.push(data) } };
      if (name === '../g2/dashboard-controller') return { dashboardController: { conversationDetector: detector,
        setConversationCaptureEnabled: (...args) => starts.push(args) } };
      if (name === '../native/asr-model') return { asrModelState: () => ({ status: textModel }), startAsrModelDownload: () => downloads++ };
      if (name === '../apps/microphones/mic-models') return { micModelState: () => ({ status: 'ready' }), startMicModelDownload: () => downloads++ };
      if (name === '../conversation-detection/conversation-ui') return ui;
      if (name === '../conversation-detection/session-controls') return {
        conversationTextSelected: () => selectedText,
        setConversationTextSelected: value => { if (!snapshot.enabled) selectedText = value; },
      };
      if (name === '../conversation-detection/profile-guide') return guide;
      return {};
    },
  });
  const view = Object.create(exports.MainViewModel.prototype);
  view.conversationWithText = true; view.localCloseTimer = null;
  view.notifyPropertyChange = () => {};
  return { view, starts, alerts, timers, downloads: () => downloads,
    snapshot(patch) { snapshot = { ...snapshot, ...patch }; },
    textModel(value) { textModel = value; },
    poll() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
  };
}

test('the phone start uses the existing profile with optional ASR and never downloads weights', () => {
  const h = harness(); h.textModel('missing');
  h.view.onConversationDetectorTap();
  assert.equal(h.starts.length, 0); assert.equal(h.alerts.length, 1); assert.equal(h.downloads(), 0);
  h.view.onConversationTextTap(); h.view.onConversationDetectorTap();
  assert.deepEqual(h.starts, [[true, false, 'conversation']]);
  assert.equal(h.downloads(), 0);
  assert.equal(h.view.voiceProfileButton, 'Mi perfil · guardado');
});

test('ON exposes stop and cannot change the selected ASR mode', () => {
  const h = harness(); h.snapshot({ enabled: true, state: 'suspendido' });
  h.view.onConversationTextTap();
  assert.equal(h.view.conversationWithText, true);
  h.view.onConversationDetectorTap();
  assert.deepEqual(h.starts, [[false]]);
});

test('the phone reports the running text engine when another control started a different mode', () => {
  const h = harness(); h.view.onConversationTextTap();
  h.snapshot({ enabled: true, transcription: { enabled: true } });
  assert.match(h.view.conversationTextButton, /ON · sesión en curso/);
  h.snapshot({ transcription: { enabled: false } });
  assert.match(h.view.conversationTextButton, /OFF · sesión en curso/);
});

test('the phone refreshes a draining worker after OFF and polling ends on completion or at 30 seconds', () => {
  const h = harness(); h.snapshot({ participation: { worker: true } });
  h.view.refreshConversationUi(); assert.equal(h.timers.size, 1);
  h.poll(); assert.equal(h.timers.size, 1);
  h.snapshot({ participation: { worker: false } }); h.poll();
  assert.equal(h.timers.size, 0); assert.match(h.view.conversationDetectorButton, /Iniciar/);
  h.snapshot({ participation: { worker: true } }); h.view.refreshConversationUi();
  for (let i = 0; i < 60; i++) h.poll();
  assert.equal(h.timers.size, 0);
  assert.equal(h.starts.length, 0);
});
