const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { AudioCaptureArbiter } = require('../.test-build/app/native/audio-capture-arbiter.js');
const { ConversationCaptureCoordinator } = require('../.test-build/app/conversation-detection/coordinator.js');
const { assistantAudioPriority } = require('../.test-build/app/assistant/audio-priority.js');

function harness({ prepare, transcription, participation } = {}) {
  let now = 1000, starts = 0, stops = 0, timer = null;
  let environment = { available: true, reason: '', session: {} };
  const leases = [];
  const detector = new ConversationCaptureCoordinator({
    environment: () => environment,
    prepare: prepare || (() => Promise.resolve(true)),
    acquire(pcm, revoked, failed) {
      starts++;
      const lease = { pcm, revoked, failed, stop() { stops++; }, diagnostics: () => '{"packets":1}' };
      leases.push(lease);
      return lease;
    },
    now: () => now,
    every(cb) { timer = cb; return () => { timer = null; }; },
    transcription,
    participation,
  });
  return { detector, leases,
    async on(transcribe = false, mode = 'off') { detector.setEnabled(true, transcribe, mode); await Promise.resolve(); },
    tick(ms = 500) { now += ms; timer?.(); },
    env(patch) { environment = { ...environment, ...patch }; detector.refresh(); },
    counts: () => ({ starts, stops, timer: !!timer }),
  };
}

function transcriptPort(ready = true) {
  const events = [];
  let enabled = false;
  return { events, start() { events.push('start'); enabled = ready; return ready; },
    stop() { events.push('stop'); enabled = false; }, resetStream() { events.push('reset'); },
    acceptNative(_pcm, vad) { events.push(`pcm:${vad}`); }, text() { return enabled ? 'texto efímero' : ''; },
    snapshot() { return { enabled, status: enabled ? 'listo' : 'inactivo', worker: false, busy: false,
      inputBufferedBytes: 0, accepted: 0, abstentions: 0, dropped: 0 }; },
  };
}

function participationPort() {
  const events = [];
  const state = { status: 'listo', worker: false, profileSaved: false };
  let profile = true;
  return { events, state,
    start(enrollment) { events.push(enrollment ? 'enroll' : 'compare'); return true; },
    stop() { events.push('stop'); }, resetStream() { events.push('reset'); },
    acceptNative(_pcm, vad) { events.push(`pcm:${vad}`); }, snapshot: () => ({ ...state }),
    hasProfile: () => profile, deleteProfile() { events.push('delete'); profile = false; return true; },
  };
}

test('profile comparison is optional and enrollment never starts ASR', async () => {
  const participation = participationPort(), transcription = transcriptPort();
  const h = harness({ participation, transcription });
  await h.on(true);
  assert.equal(participation.events.includes('compare'), false);
  assert.equal(participation.events.includes('enroll'), false);
  h.detector.setEnabled(false); transcription.events.length = 0;
  await h.on(true, 'enrollment');
  assert.equal(participation.events.includes('enroll'), true);
  assert.equal(transcription.events.includes('start'), false);
  h.detector.setEnabled(false);
});

test('comparison without text needs no ASR engine and reports its actual mode', async () => {
  const h = harness({ participation: participationPort() });
  await h.on(false, 'conversation'); h.leases[0].pcm(new Uint8Array(1600));
  assert.equal(h.detector.snapshot().state, 'escuchando');
  assert.equal(h.detector.snapshot().transcription, undefined);
  assert.match(h.detector.snapshot().reason, /sin transcripción/);
  h.detector.setEnabled(false);
});

test('voice model loads before capture and a missing compatible profile fails closed', async () => {
  const participation = participationPort(); participation.state.status = 'cargando';
  const h = harness({ participation }); await h.on(false, 'conversation');
  assert.equal(h.counts().starts, 0);
  participation.state.status = 'sin perfil compatible'; h.tick();
  assert.equal(h.detector.snapshot().state, 'error');
  assert.deepEqual(h.counts(), { starts: 0, stops: 0, timer: false });
});

test('completed enrollment stops audio, timer and text automatically', async () => {
  const participation = participationPort(); const h = harness({ participation });
  await h.on(false, 'enrollment'); h.leases[0].pcm(new Uint8Array(1600));
  participation.state.profileSaved = true; h.tick();
  assert.equal(h.detector.snapshot().enabled, false);
  assert.equal(h.detector.snapshot().participationMode, 'off');
  assert.deepEqual(h.counts(), { starts: 1, stops: 1, timer: false });
  assert.match(h.detector.snapshot().reason, /perfil se ha guardado/);
  assert.equal(h.detector.snapshot().enrollmentOutcome, 'saved');
});

test('enrollment retains distinct canceled, expired and error outcomes after OFF', async () => {
  for (const ending of ['canceled', 'expired', 'error']) {
    const participation = participationPort(); const h = harness({ participation });
    await h.on(false, 'enrollment');
    if (ending === 'canceled') h.detector.setEnabled(false);
    if (ending === 'expired') h.tick(120000);
    if (ending === 'error') { participation.state.status = 'error'; h.tick(); h.detector.setEnabled(false); }
    assert.equal(h.detector.snapshot().enrollmentOutcome, ending);
    assert.equal(h.detector.snapshot().enabled, false);
    assert.equal(h.counts().timer, false);
  }
});

test('integrated mode resets both engines at audio gaps and assistant preemption', async () => {
  const participation = participationPort(), transcription = transcriptPort();
  const h = harness({ participation, transcription }); await h.on(true, 'conversation');
  h.leases[0].pcm(new Uint8Array(1600)); h.detector.acceptNativePcm({});
  assert.equal(participation.events.filter(e => e.startsWith('pcm:')).length, 1);
  const resets = participation.events.filter(e => e === 'reset').length;
  h.tick(251); h.leases[0].pcm(new Uint8Array(1600));
  assert.ok(participation.events.filter(e => e === 'reset').length > resets);
  h.leases[0].revoked(); h.detector.acceptNativePcm({});
  assert.equal(participation.events.filter(e => e.startsWith('pcm:')).length, 1);
  h.tick(120000); assert.equal(h.detector.snapshot().enabled, false);
  assert.equal(transcription.snapshot().enabled, false);
});

test('profile deletion closes the session before removing the stored vector', async () => {
  const participation = participationPort(); const h = harness({ participation });
  await h.on(false, 'conversation');
  participation.events.length = 0;
  assert.equal(h.detector.deleteOwnProfile(), true);
  assert.equal(h.detector.hasOwnProfile(), false);
  assert.equal(h.detector.snapshot().enabled, false);
  assert.ok(participation.events.indexOf('stop') < participation.events.indexOf('delete'));
});

test('local transcription is opt-in, and diagnostics never contain its temporary text', async () => {
  const transcription = transcriptPort(); const h = harness({ transcription });
  await h.on(); h.leases[0].pcm(new Uint8Array(1600)); h.detector.acceptNativePcm({});
  assert.equal(transcription.events.includes('start'), false);
  assert.equal(transcription.events.some(event => event.startsWith('pcm:')), false);
  h.detector.setEnabled(false); await h.on(true);
  h.leases[1].pcm(new Uint8Array(1600)); h.detector.acceptNativePcm({});
  assert.equal(h.detector.transcriptText(), 'texto efímero');
  assert.equal(JSON.stringify(h.detector.snapshot()).includes('texto efímero'), false);
  assert.equal(transcription.events.filter(event => event.startsWith('pcm:')).length, 1);
  h.detector.setEnabled(false); h.detector.acceptNativePcm({});
  assert.equal(h.detector.transcriptText(), '');
  assert.equal(transcription.events.filter(event => event.startsWith('pcm:')).length, 1);
});

test('missing local model never arms capture or falls back to another provider', async () => {
  const h = harness({ transcription: transcriptPort(false) }); await h.on(true);
  assert.equal(h.detector.snapshot().state, 'error');
  assert.deepEqual(h.counts(), { starts: 0, stops: 0, timer: false });
});

test('local ASR resets with gaps and preemption, and cannot accept late/expired native arrays', async () => {
  const transcription = transcriptPort(); const h = harness({ transcription }); await h.on(true);
  h.leases[0].pcm(new Uint8Array(1600));
  const initial = transcription.events.filter(event => event === 'reset').length;
  h.tick(251); h.leases[0].pcm(new Uint8Array(1600));
  assert.ok(transcription.events.filter(event => event === 'reset').length > initial);
  h.leases[0].revoked(); h.detector.acceptNativePcm({});
  assert.equal(transcription.events.some(event => event.startsWith('pcm:')), false);
  h.env({ available: true }); await Promise.resolve();
  h.tick(120000); h.detector.acceptNativePcm({});
  assert.equal(h.detector.snapshot().enabled, false);
  assert.equal(h.detector.snapshot().transcription.enabled, false);
  assert.equal(transcription.events.some(event => event.startsWith('pcm:')), false);
});

test('OFF is the default, has no timer/audio resources and does not prepare BLE', () => {
  const h = harness({ prepare: () => assert.fail('OFF cannot prepare') });
  h.detector.refresh();
  assert.equal(h.detector.snapshot().state, 'desactivado');
  assert.deepEqual(h.counts(), { starts: 0, stops: 0, timer: false });
});

test('listening requires a valid 800-sample PCM chunk; aggregates signed LE and retains zero PCM', async () => {
  const h = harness(); await h.on();
  assert.equal(h.detector.snapshot().state, 'suspendido');
  const pcm = new Uint8Array(1600);
  for (let i = 0; i < pcm.length; i += 2) { pcm[i] = 0; pcm[i + 1] = 128; }
  h.leases[0].pcm(pcm);
  const s = h.detector.snapshot();
  assert.equal(s.state, 'escuchando');
  assert.equal(s.metrics.rms, 1);
  assert.equal(s.metrics.clippedSamples, 800);
  assert.equal(s.metrics.samples, 800);
  assert.equal(s.resources.bufferedBytes, 0);
  h.detector.setEnabled(false);
  h.leases[0].pcm(pcm); h.leases[0].failed(); h.tick(5000);
  assert.equal(h.detector.snapshot().state, 'desactivado');
  assert.deepEqual(h.counts(), { starts: 1, stops: 1, timer: false });
});

for (const invalid of [0, 1599, 1602, 6400]) {
  test(`unexpected PCM length ${invalid} fails closed without automatic retries`, async () => {
    const h = harness(); await h.on(); h.leases[0].pcm(new Uint8Array(invalid));
    h.tick(10000); h.detector.refresh();
    assert.equal(h.detector.snapshot().state, 'error');
    assert.deepEqual(h.counts(), { starts: 1, stops: 1, timer: false });
  });
}

test('missing first PCM and flow outage both release and latch the error', async () => {
  for (const flowing of [false, true]) {
    const h = harness(); await h.on();
    if (flowing) h.leases[0].pcm(new Uint8Array(1600));
    h.tick(2500);
    assert.equal(h.detector.snapshot().state, 'error');
    assert.equal(h.detector.snapshot().resources.lease, false);
    h.detector.refresh(); assert.equal(h.counts().starts, 1);
    h.detector.setEnabled(false); await h.on();
    assert.equal(h.counts().starts, 2);
  }
});

test('disconnect/unwear invalidates old delivery, reacquires only in a new available session', async () => {
  const h = harness(); await h.on();
  const old = h.leases[0]; old.pcm(new Uint8Array(1600));
  h.env({ available: false, reason: 'Desconectado' });
  old.pcm(new Uint8Array(1600)); old.failed();
  assert.equal(h.detector.snapshot().metrics.chunks, 1);
  assert.equal(h.detector.snapshot().state, 'suspendido');
  assert.equal(h.counts().stops, 1);
  h.env({ available: true, session: {} }); await Promise.resolve();
  assert.equal(h.counts().starts, 2);
  assert.equal(h.detector.snapshot().state, 'suspendido');
  h.leases[1].pcm(new Uint8Array(1600));
  assert.equal(h.detector.snapshot().state, 'escuchando');
});

test('OFF during delayed BLE prepare and old readiness after reconnect cannot resurrect capture', async () => {
  const resolves = [];
  const h = harness({ prepare: () => new Promise(resolve => resolves.push(resolve)) });
  await h.on(); h.detector.setEnabled(false); resolves[0](true); await Promise.resolve();
  assert.equal(h.counts().starts, 0);
  await h.on(); h.env({ available: false }); h.env({ available: true, session: {} });
  resolves[1](true); await Promise.resolve();
  assert.equal(h.counts().starts, 0);
  resolves[2](true); await Promise.resolve();
  assert.equal(h.counts().starts, 1);
});

test('normal owner preemption retires the tap and waits for explicit activity to finish', async () => {
  const h = harness(); await h.on();
  const old = h.leases[0];
  old.revoked(); h.env({ available: false, reason: 'Asistente' });
  old.pcm(new Uint8Array(1600));
  assert.equal(h.detector.snapshot().metrics.chunks, 0);
  assert.equal(h.detector.snapshot().metrics.preemptions, 1);
  h.tick(); assert.equal(h.counts().starts, 1);
  h.env({ available: true }); await Promise.resolve();
  assert.equal(h.counts().starts, 2);
});

test('two-minute limit leaves OFF even if all time was spent suspended', async () => {
  const h = harness(); h.env({ available: false }); await h.on(); h.tick(120000);
  assert.equal(h.detector.snapshot().state, 'desactivado');
  assert.equal(h.detector.snapshot().stopReason, 'expired');
  assert.match(h.detector.snapshot().reason, /Tiempo agotado/);
  assert.deepEqual(h.counts(), { starts: 0, stops: 0, timer: false });
});

test('failure leaves OFF automatically, erases text and permits an explicit new start', async () => {
  const transcription = transcriptPort(), participation = participationPort();
  const h = harness({ transcription, participation }); await h.on(true, 'conversation');
  h.leases[0].pcm(new Uint8Array(1600)); h.leases[0].failed();
  const failed = h.detector.snapshot();
  assert.equal(failed.enabled, false);
  assert.equal(failed.state, 'error');
  assert.equal(failed.stopReason, 'error');
  assert.equal(failed.participationMode, 'off');
  assert.equal(h.detector.transcriptText(), '');
  assert.deepEqual(h.counts(), { starts: 1, stops: 1, timer: false });
  h.detector.acceptNativePcm({});
  assert.equal(participation.events.some(e => e.startsWith('pcm:')), false);
  await h.on(true, 'conversation');
  assert.equal(h.detector.snapshot().enabled, true);
  assert.equal(h.detector.snapshot().stopReason, 'none');
  assert.equal(h.counts().starts, 2);
  h.detector.setEnabled(false);
  assert.equal(h.detector.snapshot().stopReason, 'manual');
});

test('integrated capture waits for both local engines instead of losing initial ASR input', async () => {
  const transcription = transcriptPort();
  const snapshot = transcription.snapshot;
  let loading = true;
  transcription.snapshot = () => ({ ...snapshot(), status: loading ? 'cargando' : 'listo' });
  const h = harness({ transcription, participation: participationPort() });
  await h.on(true, 'conversation');
  assert.equal(h.counts().starts, 0);
  assert.equal(h.detector.snapshot().state, 'suspendido');
  assert.match(h.detector.snapshot().reason, /Preparando texto local/);
  loading = false; h.tick(); await Promise.resolve();
  assert.equal(h.counts().starts, 1);
  assert.equal(h.detector.snapshot().remainingMs, 119500);
  h.detector.setEnabled(false);
});

function energyChunk() {
  const pcm = new Uint8Array(1600), view = new DataView(pcm.buffer);
  for (let i = 0; i < 800; i++) view.setInt16(i * 2, Math.round(1000 * Math.sin(2 * Math.PI * 300 * i / 16000)), true);
  return pcm;
}

test('VAD is cleared on preemption/OFF and late experimental PCM cannot update it', async () => {
  const h = harness(); await h.on(); const old = h.leases[0], pcm = energyChunk();
  for (let i = 0; i < 3; i++) { h.tick(50); old.pcm(pcm); }
  assert.equal(h.detector.snapshot().vad.state, 'posible voz');
  old.revoked(); h.env({ available: false });
  const stopped = h.detector.snapshot().vad;
  assert.equal(stopped.state, 'inactivo');
  assert.equal(stopped.interrupted, 1);
  old.pcm(pcm); assert.deepEqual(h.detector.snapshot().vad, stopped);
  h.detector.setEnabled(false); await h.on();
  assert.equal(h.detector.snapshot().vad.episodes, 0);
  assert.equal(h.detector.snapshot().vad.frames, 0);
});

test('VAD never joins candidates across a 251 ms delivery gap', async () => {
  const h = harness(); await h.on(); const pcm = energyChunk();
  h.leases[0].pcm(pcm); h.tick(50); h.leases[0].pcm(pcm);
  h.tick(251); h.leases[0].pcm(pcm);
  assert.equal(h.detector.snapshot().vad.episodes, 0);
  assert.equal(h.detector.snapshot().vad.state, 'candidato');
});

test('delivery outage removes stale possible voice before the existing watchdog error', async () => {
  const h = harness(); await h.on();
  for (let i = 0; i < 3; i++) { h.tick(50); h.leases[0].pcm(energyChunk()); }
  h.tick(500);
  assert.equal(h.detector.snapshot().vad.state, 'inactivo');
  assert.equal(h.detector.snapshot().vad.interrupted, 1);
  assert.equal(h.detector.snapshot().resources.lease, true);
  h.tick(2000);
  assert.equal(h.detector.snapshot().state, 'error');
  assert.equal(h.detector.snapshot().resources.lease, false);
});

test('PCM delivery and delayed prepare both honor deadline even before timer runs', async () => {
  for (const preparing of [false, true]) {
    let now = 0, receive, resolve, starts = 0, stops = 0;
    const d = new ConversationCaptureCoordinator({ environment: () => ({ available: true, reason: '', session: 1 }),
      now: () => now, every: () => () => {},
      prepare: () => preparing ? new Promise(r => { resolve = r; }) : Promise.resolve(true),
      acquire(pcm) { starts++; receive = pcm; return { stop() { stops++; }, diagnostics: () => '' }; },
    });
    d.setEnabled(true); await Promise.resolve(); now = 120000;
    if (preparing) { resolve(true); await Promise.resolve(); }
    else receive(energyChunk());
    assert.equal(d.snapshot().state, 'desactivado');
    assert.equal(d.snapshot().vad.frames, 0);
    assert.equal(starts, preparing ? 0 : 1);
    assert.equal(stops, preparing ? 0 : 1);
  }
});

test('preparation failure releases every resource and does not retry', async () => {
  for (const prepare of [() => Promise.resolve(false), () => Promise.reject(new Error('BLE'))]) {
    const h = harness({ prepare }); await h.on(); await Promise.resolve();
    h.tick(15000); h.detector.refresh();
    assert.equal(h.detector.snapshot().state, 'error');
    assert.deepEqual(h.counts(), { starts: 0, stops: 0, timer: false });
  }
});

test('arbiter revokes before normal ownership, and stale STOP cannot release a later lease', () => {
  const a = new AudioCaptureArbiter(); let revoked = 0;
  const first = a.acquireDetector(() => { revoked++; assert.equal(a.isBusy(), true); });
  a.setOwner('ptt', true);
  assert.equal(revoked, 1);
  assert.equal(a.acquireDetector(() => {}), null);
  a.setOwner('assistant', true); a.setOwner('ptt', false);
  assert.equal(a.acquireDetector(() => {}), null);
  a.setOwner('assistant', false);
  const next = a.acquireDetector(() => {});
  assert.equal(a.releaseDetector(first), false);
  assert.equal(a.acquireDetector(() => {}), null);
  assert.equal(a.releaseDetector(next), true);
});

test('assistant priority spans concurrent sessions and only contains a boolean', () => {
  const states = [], first = {}, second = {};
  const off = assistantAudioPriority.subscribe(active => states.push(active));
  assistantAudioPriority.setActive(first, true); assistantAudioPriority.setActive(second, true);
  assistantAudioPriority.setActive(first, false);
  assert.equal(assistantAudioPriority.isActive(), true);
  assistantAudioPriority.setActive(second, false); off();
  assert.deepEqual(states, [true, false]);
});

function bridgeHarness() {
  let listener, stops = 0, starts = 0;
  const controller = new Proxy({ isCapturing: () => starts > stops,
    setListener(value) { listener = value; }, stop() { stops++; }, start() { starts++; },
    experimentalAudioDiagnostics: () => JSON.stringify({ packets: 2, capturing: starts > stops }),
  }, { get: (target, key) => target[key] || (() => {}) });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/native/voice-control.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, console, global: { isAndroid: true },
    com: { faceclaw: { app: { FaceclawVoiceController: function() { return controller; },
      FaceclawVoiceControllerListener: function(value) { return value; } } } },
    require(name) {
      if (name === '@nativescript/core') return { Utils: { android: { getApplicationContext: () => ({}) } } };
      if (name === './audio-capture-arbiter') return { AudioCaptureArbiter };
      if (name === '../util/array-util') return { toUint8Array: bytes => new Uint8Array(bytes) };
      if (name === './speech-pause') return { SpeechPauseDetector: class { reset() {} accept() { return false; } } };
      return {};
    },
  });
  return { bridge: new exports.FaceclawVoiceControlBridge(), native: { isAudioCaptureActive: () => false },
    listener: () => listener, counts: () => ({ starts, stops }) };
}

test('detector OFF after another raw owner acquires never stops its stream', () => {
  const h = bridgeHarness(); let revoked = 0, delivered = 0;
  const lease = h.bridge.acquireExperimentalRaw(h.native, () => delivered++, () => revoked++, () => {});
  assert.ok(lease);
  h.listener().onPcm(new Uint8Array(1600)); // A late ordinary/STT callback cannot reach detector.
  assert.equal(delivered, 0);
  h.listener().onExperimentalPcm(new Uint8Array(1600)); assert.equal(delivered, 1);
  h.bridge.startRawCapture({ communicator: h.native, owner: 'evenhub' });
  assert.equal(revoked, 1);
  const before = h.counts().stops;
  lease.stop(); h.bridge.stopRawCapture('unrelated');
  assert.equal(h.counts().stops, before);
  h.listener().onExperimentalPcm(new Uint8Array(1600)); assert.equal(delivered, 1);
  h.bridge.stopRawCapture('evenhub'); assert.equal(h.counts().stops, before + 1);
});

test('PTT preempts detector and its late release cannot stop assistant capture', () => {
  const h = bridgeHarness(); let revoked = 0;
  const lease = h.bridge.acquireExperimentalRaw(h.native, () => {}, () => revoked++, () => {});
  h.bridge.startPushToTalk({ communicator: h.native, provider: 'onboard', saveRecording: false });
  assert.equal(revoked, 1);
  const before = h.counts().stops; lease.stop(); assert.equal(h.counts().stops, before);
  assert.equal(h.bridge.acquireExperimentalRaw(h.native, () => {}, () => {}, () => {}), null);
  h.bridge.stopPushToTalk();
  assert.equal(h.counts().stops, before + 1);
});

test('shared normal raw owners require the last release and unrelated OFF cannot stop detector', () => {
  const h = bridgeHarness();
  h.bridge.startRawCapture({ communicator: h.native, owner: 'microphones' });
  h.bridge.startRawCapture({ communicator: h.native, owner: 'evenhub' });
  h.bridge.stopRawCapture('microphones'); assert.equal(h.counts().stops, 0);
  h.bridge.stopRawCapture('evenhub'); assert.equal(h.counts().stops, 1);
  const lease = h.bridge.acquireExperimentalRaw(h.native, () => {}, () => {}, () => {});
  assert.ok(lease); h.bridge.stopRawCapture('evenhub'); assert.equal(h.counts().stops, 1);
  lease.stop(); assert.equal(h.counts().stops, 2);
});

test('stopped lease diagnostics record OFF and cannot describe the following owner', () => {
  const h = bridgeHarness();
  const lease = h.bridge.acquireExperimentalRaw(h.native, () => {}, () => {}, () => {});
  assert.equal(JSON.parse(lease.diagnostics()).capturing, true);
  lease.stop();
  assert.deepEqual(JSON.parse(lease.diagnostics()), { packets: 2, capturing: false });
  h.bridge.startRawCapture({ communicator: h.native, owner: 'evenhub' });
  lease.stop();
  assert.equal(JSON.parse(lease.diagnostics()).capturing, false);
  assert.equal(h.counts().stops, 1);
  h.bridge.stopRawCapture('evenhub');
});

test('coordinator keeps diagnostics from after STOP, with original counters', async () => {
  const h = harness(); await h.on();
  let capturing = true;
  const lease = h.leases[0];
  lease.stop = () => { capturing = false; };
  lease.diagnostics = () => JSON.stringify({ capturing, packets: 1018 });
  h.detector.setEnabled(false);
  assert.deepEqual(JSON.parse(h.detector.diagnostics()), { capturing: false, packets: 1018 });
});
