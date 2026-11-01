const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Menu } = require('../.test-build/app/ui/menu-core.js');

function load(file, deps, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, console, ...globals, require: name => deps[name] ?? {} });
  return exports;
}

function dialog({ autoSend = false, deferred = true, synchronousFinal, isIOS = false, handsFree = false, captureCompletion } = {}) {
  const listeners = new Set(), timers = new Map(), sent = [], refinements = [];
  let complete, timerId = 0, starts = 0, frame, speechEnd, endpointing;
  let completion = captureCompletion ?? new Promise(resolve => { complete = resolve; });
  const { VoiceInputLayer } = load('app/ui/shell/voice-input.ts', {
    '../../native/voice-control': { voiceControlBridge: {
      onTranscript(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      onStatus() { return () => {}; },
      onSpeechEnd(cb) { speechEnd = cb; return () => { speechEnd = null; }; },
      stop() {},
    } },
    '../../native/anthropic': { refineDictation(options) { refinements.push(options); return { cancel() {} }; } },
    '../dashboard-settings': { anthropicApiKeySetting: { get: () => 'key' } },
    '../gestures': { gestureHints: () => '' },
    './input-dialog': {
      paintInputDialog(_image, options) { frame = options; },
      createInputDialogMenu: (items, selectedIndex) => new Menu({ items, selectedIndex, wrap: true, getHeight: () => 1, draw() {} }),
    },
  }, {
    global: { isIOS },
    setTimeout(cb) { const id = ++timerId; timers.set(id, cb); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const transcript = (text, isFinal = false, metadata = {}) => { for (const cb of [...listeners]) cb({ ...metadata, text, isFinal }); };
  const layer = new VoiceInputLayer({ autoSend, handsFree, onClosed() {}, dismiss: () => layer.onRemoved(),
    actions: { requestRender() {}, startVoiceCapture(value) { starts++; endpointing = value; }, stopVoiceCapture() {
      if (synchronousFinal) transcript(synchronousFinal, true);
      return deferred ? completion : undefined;
    } },
    sendTargets: [{ id: 'send', label: 'Send', onSend: text => sent.push(text) }],
  });
  layer.startCapture();
  return { layer, sent, refinements, transcript, starts: () => starts,
    endpoint: () => speechEnd?.(), endpointing: () => endpointing,
    input: type => layer.handleInput({ type }, {}),
    frame() { layer.paint({}, () => ({})); return frame; },
    timeout() { for (const [id, cb] of [...timers]) { timers.delete(id); cb(); } },
    async complete() { complete(); await completion; await Promise.resolve(); },
    nextCapture() { completion = new Promise(resolve => { complete = resolve; }); },
    timers: () => timers.size,
  };
}

for (const autoSend of [true, false]) {
  test(`iOS wakeword silence completion ${autoSend ? 'auto-sends' : 'asks for confirmation'} only after final recognition`, async () => {
    const env = dialog({ isIOS: true, handsFree: true, autoSend });
    assert.equal(env.endpointing(), true);
    env.transcript('Set a timer');
    env.endpoint(); env.timeout();
    env.input('click'); // Cannot send a partial while native recognition drains.
    assert.deepEqual(env.sent, []);
    env.transcript('Set a timer for five minutes.', true);
    await env.complete(); env.timeout();
    if (!autoSend) {
      assert.deepEqual(env.sent, []);
      env.input('click');
    }
    assert.deepEqual(env.sent, ['Set a timer for five minutes.']);
    env.endpoint(); env.timeout();
    assert.equal(env.sent.length, 1);
  });
}

for (const partial of ['', 'Set a timer']) {
  test(`auto-send waits for slow native recognition with ${partial ? 'a committed segment' : 'no partial'}`, async () => {
    const env = dialog({ autoSend: true });
    if (partial) env.transcript(partial);
    env.layer.endCapture();
    env.timeout(); // well beyond the old fallback deadline
    assert.deepEqual(env.sent, []);
    assert.equal(env.timers(), 0);
    env.transcript('Set a timer for five minutes', true);
    await env.complete(); env.timeout();
    assert.deepEqual(env.sent, ['Set a timer for five minutes']);
    assert.equal(env.timers(), 0);
  });
}

async function continuation() {
  const env = dialog();
  env.layer.endCapture();
  env.transcript('Set a timer for five minutes', true);
  await env.complete();
  env.nextCapture();
  env.input('scroll-down'); env.input('click'); // Continue
  env.input('click'); // stop follow-up
  return env;
}

test('Continue refines the complete late result instead of appending an editing instruction', async () => {
  const env = await continuation();
  env.timeout();
  assert.equal(env.refinements.length, 0);
  env.transcript('Change five to ten', true);
  await env.complete(); env.timeout();
  assert.equal(env.refinements.length, 1);
  assert.equal(env.refinements[0].original, 'Set a timer for five minutes');
  assert.equal(env.refinements[0].followup, 'Change five to ten');
});

test('Send and Continue cannot consume partial text while native recognition is pending', async () => {
  const env = dialog();
  env.transcript('Set a timer'); env.layer.endCapture();
  assert.equal(env.frame().status, 'Finalizando transcripción...');
  env.input('click'); env.input('scroll-down'); env.input('click');
  assert.deepEqual(env.sent, []);
  assert.equal(env.starts(), 1);
  env.transcript('Set a timer for five minutes', true); await env.complete();
  env.input('scroll-up'); env.input('click');
  assert.deepEqual(env.sent, ['Set a timer for five minutes']);
});

test('cancelling a pending continuation ignores its late transcript', async () => {
  const env = await continuation();
  env.input('double-click');
  env.transcript('Change five to ten', true); await env.complete(); env.timeout();
  assert.equal(env.refinements.length, 0);
  assert.equal(env.frame().text, 'Set a timer for five minutes');
});

test('closing while native recognition is pending never schedules a fallback or sends', async () => {
  const env = dialog({ autoSend: true });
  env.layer.endCapture(); env.layer.onRemoved();
  env.transcript('late', true); await env.complete(); env.timeout();
  assert.deepEqual(env.sent, []);
  assert.equal(env.timers(), 0);
});

test('failed or empty native captures return to the menu without sending', async () => {
  const env = dialog({ autoSend: true });
  env.layer.endCapture(); await env.complete(); env.timeout();
  assert.deepEqual(env.sent, []);
  assert.equal(env.frame().status, '¿Enviar, continuar o descartar?');
});

test('cloud fallback and a synchronous final still send exactly once', () => {
  for (const synchronousFinal of [undefined, 'complete']) {
    const env = dialog({ autoSend: true, deferred: false, synchronousFinal });
    env.transcript('partial'); env.layer.endCapture(); env.timeout();
    assert.deepEqual(env.sent, [synchronousFinal ?? 'partial']);
  }
});

for (const [provider, modelKind] of [['onboard-whisper', 'whisper'], ['onboard-whisper-small', 'whisper-small'], ['onboard-whisper-medium', 'whisper-medium']]) {
test(`${provider}: native completion follows the final and is capture-specific`, async () => {
  let controller;
  class Controller {
    constructor() { controller = this; }
    setListener(listener) { this.listener = listener; }
    setCommunicator() {} setUsePhoneMic() {} setSaveRecordings() {} setEndpointing() {}
    setNoiseSuppression() {} setBeamFilter() {} clearSpeakerVerification() {}
    setExperimentalRawMode() {}
    setOnboardModelKind(kind) { this.modelKind = kind; }
    start(_mode, id) { this.captureId = id; this.active = true; }
    stop() { this.active = false; }
    isCapturing() { return this.active; }
  }
  const { FaceclawVoiceControlBridge } = load('app/native/voice-control.ts', {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({}) } } },
    './speech-pause': { SpeechPauseDetector: class { reset() {} } },
    './audio-capture-arbiter': require('../.test-build/app/native/audio-capture-arbiter.js'),
    './cloud-stt-provider': { createCloudSttClient: () => null },
  }, { global: { isAndroid: true }, com: { faceclaw: { app: {
    FaceclawVoiceController: Controller,
    FaceclawVoiceControllerListener: function (listener) { return listener; },
  } } } });
  const bridge = new FaceclawVoiceControlBridge();
  const options = { provider };
  const events = [];
  bridge.onTranscript(event => events.push(event.text));
  bridge.startPushToTalk(options);
  assert.equal(controller.modelKind, modelKind);
  const stopped = bridge.stopPushToTalk().then(() => events.push('stopped'));
  controller.listener.onStopped(0); // an older raw/cloud capture's callback
  await Promise.resolve(); assert.deepEqual(events, []);
  controller.listener.onTranscript('complete', true);
  assert.deepEqual(events, ['complete']);
  controller.listener.onStopped(controller.captureId); await stopped;
  assert.deepEqual(events, ['complete', 'stopped']);
  bridge.startContinuousCapture(options); bridge.startPushToTalk(options);
  assert.equal(bridge.stopPushToTalk(), undefined);
  assert.equal(controller.active, true);
  bridge.stopContinuousCapture(); controller.listener.onStopped(controller.captureId);
});
}

test('EVO-X2: native PCM drains before commit and the bridge waits for remote/local completion', async () => {
  let controller, remoteOptions, complete;
  const calls = [];
  const result = new Promise(resolve => { complete = resolve; });
  class Controller {
    constructor() { controller = this; }
    setListener(listener) { this.listener = listener; }
    setCommunicator() {} setUsePhoneMic() {} setSaveRecordings() {} setEndpointing() {}
    setNoiseSuppression() {} setBeamFilter() {} clearSpeakerVerification() {} setExperimentalRawMode() {}
    start(mode, id) { this.captureId = id; this.active = true; assert.equal(mode, 'cloud'); }
    stop() { this.active = false; }
    isCapturing() { return this.active; }
  }
  const { FaceclawVoiceControlBridge } = load('app/native/voice-control.ts', {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({}) } } },
    './speech-pause': { SpeechPauseDetector: class { reset() {} } },
    './audio-capture-arbiter': require('../.test-build/app/native/audio-capture-arbiter.js'),
    '../util/array-util': { toUint8Array: bytes => bytes },
    './cloud-stt-provider': { createCloudSttClient(_selection, options) {
      remoteOptions = options;
      return { start() {}, stop() {}, acceptPcm(bytes) { calls.push([...bytes]); },
        finish() { calls.push('commit'); return result; } };
    } },
  }, { global: { isAndroid: true }, com: { faceclaw: { app: {
    FaceclawVoiceController: Controller, FaceclawVoiceControllerListener: function(listener) { return listener; },
  } } } });
  const bridge = new FaceclawVoiceControlBridge();
  const events = [];
  bridge.onTranscript(e => events.push(e.text));
  bridge.startPushToTalk({ provider: 'even' });
  let finished = false;
  const pending = bridge.stopPushToTalk().then(() => { finished = true; });
  await Promise.resolve(); assert.deepEqual(calls, []);
  controller.listener.onPcm(new Uint8Array([7, 8])); // PCM already posted by native worker.
  controller.listener.onStopped(controller.captureId);
  await Promise.resolve();
  assert.deepEqual(calls, [[7, 8], 'commit']); assert.equal(finished, false);
  remoteOptions.onTranscript({ text: 'full result', isFinal: true });
  complete(); await pending;
  assert.deepEqual(events, ['full result']); assert.equal(finished, true);
});

for (const outcome of ['final', 'error', 'cancel']) {
  test(`EVO-X2: auto-send waits through remote timeout and slow local decode (${outcome})`, async () => {
    const timers = new Map(); let timerId = 0, remote, finishLocal, rejectLocal;
    const { FallbackSttClient } = load('app/native/fallback-stt.ts', {}, {
      Uint8Array,
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    });
    let env;
    const client = new FallbackSttClient(options => {
      remote = options; return { start() {}, acceptPcm() {}, finish() {}, stop() {} };
    }, { apiKey: 'k', onStatus() {}, onError() {}, onTranscript: e => env.transcript(e.text, e.isFinal, e) },
    () => new Promise((resolve, reject) => { finishLocal = resolve; rejectLocal = reject; }));
    client.start(); remote.onReady(); client.acceptPcm(new Uint8Array(320));
    const completion = client.finish();
    env = dialog({ autoSend: true, handsFree: true, captureCompletion: completion });
    env.transcript('partial'); env.layer.endCapture(); env.timeout();
    assert.deepEqual(env.sent, []);
    const deadline = [...timers.values()].find(t => t.delay === 3000);
    deadline.fn(); await Promise.resolve(); env.timeout();
    assert.deepEqual(env.sent, []); assert.equal(env.frame().status, 'Finalizando transcripción...');
    if (outcome === 'cancel') { env.layer.onRemoved(); client.stop(); finishLocal('late'); }
    else if (outcome === 'error') rejectLocal(new Error('model unavailable'));
    else finishLocal('complete final with the missing ending');
    await completion.catch(() => {}); await Promise.resolve(); env.timeout();
    assert.deepEqual(env.sent, outcome === 'final' ? ['complete final with the missing ending'] : []);
    assert.equal(env.timers(), 0);
  });
}

test('authoritative local silence never resurrects a stale remote partial for auto-send', async () => {
  const env = dialog({ autoSend: true });
  env.transcript('stale remote partial');
  env.layer.endCapture();
  env.transcript('', true, { authoritative: true });
  await env.complete(); env.timeout();
  assert.deepEqual(env.sent, []);
  assert.equal(env.frame().text.includes('stale remote partial'), false);
});
