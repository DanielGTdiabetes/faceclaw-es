const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const ui = require('../.test-build/app/conversation-detection/conversation-ui.js');
const guide = require('../.test-build/app/conversation-detection/profile-guide.js');
const realControls = require('../.test-build/app/conversation-detection/session-controls.js');

function harness() {
  let snapshot = { enabled: false, state: 'desactivado', stopReason: 'none', reason: '', remainingMs: 0 };
  let textModel = 'ready', downloads = 0;
  let selectedText = true;
  let gatekeeperMode = 'off';
  let usesHermes = true, gateReady = true;
  const listeningStarts = [], gateDownloads = [];
  const starts = [], alerts = [], timers = new Map(), delays = [];
  const wearerCalls = [];
  let actionChoice = null, actionLists = [];
  const detector = { snapshot: () => snapshot, ownProfileState: () => 'guardado', transcriptText: () => '',
    wearerActionRef: () => snapshot.enabled ? { sessionId: 's9', streamId: 1, attemptSeq: 0, version: 0 } : null,
    identifyWearer: () => { wearerCalls.push('identify'); return true; },
    finishWearerIdentification: () => true, cancelWearerIdentification: () => true,
    assignWearer: (ref) => { wearerCalls.push(ref); return true; },
    observedSpeakers: () => snapshot.enabled ? [{ sessionId: 's9', streamId: 1, speaker: '2', preview: '' }] : [],
    lastSessionSummary: () => snapshot.enabled ? null : { engineFinal: 'soniox', identity: { lastOutcome: 'cancelado-off' } },
    diagnostics: () => '{}' };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/phone-ui/main-view-model.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports,
    setTimeout(fn, ms) { assert.ok(ms === 500 || ms === 2000, String(ms)); delays.push(ms); const id = {}; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === './remote-controls-view-model') return { RemoteControlsViewModel: class {} };
      if (name === '@nativescript/core') return { Dialogs: { alert: data => alerts.push(data),
        action: data => { actionLists.push(data.actions); return Promise.resolve(actionChoice); } } };
      if (name === '../g2/dashboard-controller') return { dashboardController: { conversationDetector: detector,
        setConversationCaptureEnabled: (...args) => starts.push(args), shellRenderDiagnostics: () => ({ total: 0, resourceLimit: 0 }),
        toggleManualConversation() { return this.setManualConversationEnabled(!snapshot.enabled); },
        setManualConversationEnabled(enabled) { if (enabled === snapshot.enabled) return ''; if (enabled) listeningStarts.push({ gatekeeperMode, usesHermes }); snapshot = { ...snapshot, enabled, state: enabled ? 'escuchando' : 'desactivado' }; return ''; },
        conversationHermes: { snapshot: () => ({ enabled: snapshot.enabled, listening: snapshot.enabled, requests: 0, modality: 'identidad-opcional' }), history: () => [], diagnostics: () => ({ filters: { remaining: 120 } }) } } };
      if (name === '../ui/shell/conversation-hermes-ui') return { hermesPresentationDiagnostics: () => ({ presented: 0, woke: 0, replaced: 0, refused: 0, retired: 0, released: 0 }) };
      if (name === '../native/asr-model') return { asrModelState: () => ({ status: textModel }), conversationTextModelStatus: () => textModel, preciseTextModelLabel: () => 'Modelo preciso (small): descargar 375 MB', startAsrModelDownload: () => downloads++ };
      if (name === '../native/conversation-model-options') return { conversationModelLabel: () => 'Whisper small', conversationModelOption: id => id };
      if (name === '../apps/microphones/mic-models') return { micModelState: () => ({ status: 'ready' }), startMicModelDownload: () => downloads++ };
      if (name === '../conversation-detection/conversation-ui') return ui;
      if (name === '../assistant/bridge-client') return { assistantBridge: { conversation: { supportsDailyContext: () => false, isSupported: () => true, supportsOptionalIdentity: () => true } } };
      if (name === '../conversation-detection/session-controls') return {
        conversationFiltersEnabled: () => gatekeeperMode === 'active',
        selectConversationListeningMode: mode => {
          if(snapshot.enabled) return false;
          gatekeeperMode = mode === 'gatekeeper' ? 'active' : 'off'; usesHermes = mode !== 'text'; return true;
        },
        setConversationUsesHermes: value => { if (!snapshot.enabled) usesHermes = value; },
        conversationDailyContextSelected: () => false,
        conversationLocalSpeakers: () => true, setConversationLocalSpeakers: () => {},
        conversationSingleVoiceFilter: () => false, setConversationSingleVoiceFilter: () => {},
        conversationTextSelected: () => selectedText,
        setConversationTextSelected: value => { if (!snapshot.enabled) selectedText = value; },
        // C1 RAM selectors (defaults): automatic language, diagnostics off.
        conversationTextLanguage: () => 'auto', setConversationTextLanguage: () => {},
        conversationDiagnosticsSelected: () => false, setConversationDiagnosticsSelected: () => {},
        // Local engine here: these cases cover Whisper readiness; Soniox has its own test file.
        conversationTextEngine: () => 'local', setConversationTextEngine: () => {},
        conversationLocalModel: () => 'whisper-small-es', conversationUsesHermes: () => usesHermes,
        conversationModel: () => 'whisper-small-es',
        wearerActions: realControls.wearerActions, wearerChoices: realControls.wearerChoices,
      };
      if (name === '../conversation-detection/profile-guide') return guide;
      return {};
    },
  });
  const view = Object.create(exports.MainViewModel.prototype);
  view.conversationWithText = true; view.localCloseTimer = null;
  view.notifyPropertyChange = () => {};
  view.hermesShown = { button: '', status: '', history: '' };
  return { view, starts, alerts, timers, delays, listeningStarts, gateDownloads, downloads: () => downloads, wearerCalls, actionLists, choose(v) { actionChoice = v; },
    snapshot(patch) { snapshot = { ...snapshot, ...patch }; },
    textModel(value) { textModel = value; },
    gatekeeperMode(value) { gatekeeperMode = value; },
    gateReady(value) { gateReady = value; },
    poll() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
  };
}

test('filter status reports readiness and active rules without starting capture or downloads', () => {
  const h=harness(); assert.match(h.view.conversationGatekeeperStatus,/preparados/);
  h.snapshot({ enabled:true, state:'escuchando' });
  assert.match(h.view.conversationGatekeeperStatus,/desactivados/);
  h.gatekeeperMode('active'); assert.match(h.view.conversationGatekeeperStatus,/activos/);
  assert.equal(h.starts.length,0); assert.equal(h.downloads(),0);
});

test('the three listening buttons start exactly their named mode and never toggle an existing session', () => {
  const h = harness(); h.view.onConversationPanelTap(); h.view.onConversationSettingsTap();
  assert.equal(h.listeningStarts.length, 0);
  assert.equal(h.view.conversationPanelVisibility, 'visible');
  assert.equal(h.view.remotePanelVisibility, 'collapse', 'the Conversation entry disappears inside its panel');
  h.view.onConversationGatekeeperStartTap(); h.view.onConversationGatekeeperStartTap();
  h.view.onConversationDirectStartTap(); h.view.onConversationTextStartTap();
  assert.deepEqual(h.listeningStarts, [{ gatekeeperMode: 'active', usesHermes: true }]);
  assert.equal(h.view.conversationStopVisibility, 'visible');
  h.view.onConversationStopTap(); h.view.onConversationStopTap();
  assert.match(h.view.conversationGatekeeperStatus, /preparados/);
  h.view.onConversationDirectStartTap(); h.view.onConversationStopTap(); h.view.onConversationTextStartTap();
  assert.deepEqual(h.listeningStarts, [{ gatekeeperMode: 'active', usesHermes: true },
    { gatekeeperMode: 'off', usesHermes: true }, { gatekeeperMode: 'off', usesHermes: false }]);
  assert.equal(h.view.closeConversationPanel(), true); assert.equal(h.view.closeConversationPanel(), false);
  assert.equal(h.view.remotePanelVisibility, 'visible');
  assert.equal(h.view.conversationEntryLabel, 'Conversación · escuchando');
  assert.equal(h.view.conversationStopVisibility, 'visible'); // Navigation never stops capture.
});

test('mechanical filtering starts immediately without a downloaded Gatekeeper model', () => {
  const h=harness(); h.gateReady(false); h.view.onConversationGatekeeperStartTap();
  assert.equal(h.gateDownloads.length,0); assert.equal(h.listeningStarts.length,1);
});

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

test('the phone follows a draining worker after OFF until it finishes, slowing down after 30 seconds', () => {
  const h = harness(); h.snapshot({ participation: { worker: true } });
  h.view.refreshConversationUi(); assert.equal(h.timers.size, 1);
  h.poll(); assert.equal(h.timers.size, 1);
  h.snapshot({ participation: { worker: false } }); h.poll();
  assert.equal(h.timers.size, 0); assert.match(h.view.conversationDetectorButton, /Iniciar/);
  h.snapshot({ transcription: { worker: true, busy: true } }); h.view.refreshConversationUi();
  for (let i = 0; i < 80; i++) h.poll();
  // A JNI decode can outlast 30 s: the controls must not freeze, polling continues every 2 s.
  assert.equal(h.timers.size, 1); assert.equal(h.delays.at(-1), 2000);
  assert.equal(h.view.localTranscriptionCanStart, false);
  assert.match(h.view.conversationStartNotice, /Terminando reconocimiento/);
  h.view.onConversationTextStartTap(); assert.equal(h.listeningStarts.length, 0, 'no start while closing');
  h.snapshot({ transcription: { worker: false, busy: false } }); h.poll();
  assert.equal(h.timers.size, 0); assert.equal(h.view.localTranscriptionCanStart, true);
  assert.equal(h.view.conversationStartNotice, '');
  assert.equal(h.starts.length, 0); assert.equal(h.listeningStarts.length, 0, 'never auto-starts');
});

test('a refused start and an error stay visible in the OFF screen and restart works from the same view', () => {
  const h = harness();
  h.snapshot({ state: 'error', stopReason: 'error', reason: 'La sesión BLE no está lista. Captura OFF; puedes reintentar.' });
  assert.equal(h.view.conversationStartNoticeVisibility, 'visible');
  assert.match(h.view.conversationStartNotice, /BLE no está lista/);
  h.view.onConversationTextStartTap();
  assert.equal(h.view.conversationStopVisibility, 'visible'); assert.equal(h.view.conversationStartNotice, '');
  h.view.onConversationStopTap(); h.view.onConversationDirectStartTap();
  assert.deepEqual(h.listeningStarts, [{ gatekeeperMode: 'off', usesHermes: false }, { gatekeeperMode: 'off', usesHermes: true }]);
  for (let i = 0; i < 20; i++) { h.view.onConversationStopTap(); h.view.onConversationGatekeeperStartTap(); }
  assert.equal(h.listeningStarts.length, 22); assert.equal(h.view.conversationStopVisibility, 'visible');
});

test('S2 phone: wearer button only while ON with Soniox; actions run once; metrics after OFF include the summary', async () => {
  const h = harness();
  assert.equal(h.view.conversationWearerVisibility, 'collapse');
  assert.equal(h.view.conversationWearerLabel, '');
  h.snapshot({ enabled: true, state: 'escuchando', transcription: { enabled: true, engine: 'soniox',
    identity: { state: 'identificado', speaker: '2', source: 'manual', version: 1, knownOthers: 0, lastOutcome: 'ninguno', speakersSeen: 1 } } });
  assert.equal(h.view.conversationWearerVisibility, 'visible');
  assert.match(h.view.conversationWearerLabel, /«Yo» = voz 2 \(elegida\)/);
  h.choose('Identificar mi voz (frase)');
  await h.view.onConversationWearerTap();
  assert.deepEqual([...h.actionLists[0]], ['Identificar mi voz (frase)', 'Yo soy la voz 2', 'No soy ninguna']);
  assert.deepEqual(h.wearerCalls, ['identify']);
  h.choose('No soy ninguna');
  await h.view.onConversationWearerTap();
  assert.deepEqual({ ...h.wearerCalls[1] }, { sessionId: 's9', streamId: 1, speaker: null });
  h.snapshot({ enabled: false, transcription: undefined });
  h.view.onConversationDetectorMetricsTap();
  assert.match(h.alerts.at(-1).message, /Última sesión Soniox \(sin texto\)/);
  assert.match(h.alerts.at(-1).message, /cancelado-off/);
  assert.match(h.alerts.at(-1).message, /Lentes Hermes \(recuentos, sin texto\): \{"presented":0[^\n]*"shellRenderFailures":\{"total":0,"resourceLimit":0\}\}/);
});

test('phrase is directly accessible on the phone without opening a voice list, and OFF/local cannot start it', () => {
  const h = harness();
  h.view.onConversationWearerPhraseTap();
  assert.deepEqual(h.wearerCalls, []);
  h.snapshot({ enabled: true, transcription: { engine: 'soniox', identity: { state: 'sin-identificar' } } });
  assert.equal(h.view.conversationWearerVisibility, 'visible');
  assert.equal(h.view.conversationWearerPhraseButton, 'Identificar mi voz (frase)');
  h.view.onConversationWearerPhraseTap();
  assert.deepEqual(h.wearerCalls, ['identify']);
  assert.equal(h.actionLists.length, 0);
  h.snapshot({ transcription: { engine: 'soniox', identity: { state: 'escuchando-frase' } } });
  assert.equal(h.view.conversationWearerPhraseButton, 'Listo, ya la he dicho');
  h.snapshot({ transcription: { engine: 'local', identity: { state: 'no-disponible' } } });
  h.view.onConversationWearerPhraseTap();
  assert.equal(h.view.conversationWearerVisibility, 'collapse');
  assert.deepEqual(h.wearerCalls, ['identify']);
});
