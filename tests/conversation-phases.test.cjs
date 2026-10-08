// C1: acoustic diagnostics per user-marked phase, language selector and privacy of snapshots.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationCaptureCoordinator } = require('../.test-build/app/conversation-detection/coordinator.js');
const { LocalEnergyVad } = require('../.test-build/app/conversation-detection/local-vad.js');
const { PhaseDiagnostics, MAX_PHASE_MARKS, binIndex, RELATIVE_BIN_EDGES_DB } =
  require('../.test-build/app/conversation-detection/phase-diagnostics.js');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');

/** 50 ms chunk (800 samples) of a 500 Hz sine: whole periods per 10 ms frame, so frame RMS is exact. */
function sine(rms) {
  const bytes = new Uint8Array(1600);
  const amplitude = rms * Math.SQRT2 * 32768;
  for (let n = 0; n < 800; n++) {
    const value = Math.round(amplitude * Math.sin(2 * Math.PI * 500 * n / 16000));
    const unsigned = value < 0 ? value + 65536 : value;
    bytes[n * 2] = unsigned & 255; bytes[n * 2 + 1] = unsigned >> 8;
  }
  return bytes;
}
const silence = () => new Uint8Array(1600);
const byPhase = (snapshot, name) => snapshot.phases.find((phase) => phase.phase === name);

function harness(transcription) {
  let now = 1000, timer = null;
  const leases = [];
  const environment = { available: true, reason: '', session: {} }; // Same session object on every call.
  const detector = new ConversationCaptureCoordinator({
    environment: () => environment,
    prepare: () => Promise.resolve(true),
    acquire(pcm, revoked, failed) {
      const lease = { pcm, revoked, failed, stop() {}, diagnostics: () => '{}' };
      leases.push(lease); return lease;
    },
    now: () => now,
    every(cb) { timer = cb; return () => { timer = null; }; },
    transcription,
  });
  return { detector, leases,
    async on(transcribe, options) { detector.setEnabled(true, transcribe, 'off', options); await Promise.resolve(); },
    /**
     * Deliver one chunk 50 ms after the previous one in the order of voice-control.onExperimentalPcm:
     * the TS copy (VAD) first, then the native array, synchronously in one callback.
     */
    chunk(bytes) { now += 50; leases[leases.length - 1].pcm(bytes); detector.acceptNativePcm(bytes); },
    tick(ms) { now += ms; timer?.(); },
  };
}

function transcriptPort() {
  const events = [];
  let enabled = false;
  return { events,
    start(language) { events.push(`start:${language}`); enabled = true; return true; },
    stop() { events.push('stop'); enabled = false; }, resetStream() { events.push('reset'); },
    setPhase(phase) { events.push(`phase:${phase}`); },
    acceptNative(_pcm, vad) { events.push(`pcm:${vad}`); },
    text() { return enabled ? 'zanahoria privada' : ''; },
    snapshot() { return { enabled, status: enabled ? 'listo' : 'inactivo', worker: false, busy: false,
      inputBufferedBytes: 0, accepted: 0, abstentions: 0, dropped: 0 }; },
  };
}

test('N1: sustained sub-threshold signal fills relative bins below 0 dB and is never positive', () => {
  const vad = new LocalEnergyVad();
  const diagnostics = new PhaseDiagnostics(() => 0);
  vad.setObserver(diagnostics);
  for (let i = 0; i < 20; i++) vad.accept(silence()); // 1 s: the noise floor settles at its minimum.
  diagnostics.mark('otra-persona');
  for (let i = 0; i < 40; i++) vad.accept(sine(0.6 * 0.003)); // 2 s at 0.6 x the onset threshold.
  const phase = byPhase(diagnostics.snapshot(), 'otra-persona');
  assert.equal(phase.inputMs, 2000);
  assert.equal(phase.positiveMs, 0, 'a positive-only histogram would contain none of these frames');
  assert.equal(phase.episodesOpened, 0);
  assert.equal(phase.candidateOnlyMs, 0);
  assert.equal(phase.relativeBins[1] + phase.relativeBins[2], 200);
  assert.ok(phase.relativeBins[2] > 0, 'starts at about -4.4 dB');
  assert.ok(phase.relativeBins[1] > 0, 'the adaptive floor follows the sustained signal and raises the threshold');
  assert.deepEqual(phase.relativeBins.slice(4), [0, 0, 0]);
  assert.equal(phase.stateMs.sinActividad, 2000);
  assert.equal(vad.snapshot().episodes, 0);
});

test('VAD decisions are identical with and without the observer', () => {
  const plain = new LocalEnergyVad(), observed = new LocalEnergyVad();
  observed.setObserver(new PhaseDiagnostics(() => 0));
  const script = [silence(), sine(0.05), sine(0.05), sine(0.05), sine(0.05), silence(), sine(0.0018),
    ...Array(13).fill(silence()), sine(0.2), sine(0.004), silence()];
  for (const chunk of script) {
    plain.accept(chunk); observed.accept(chunk);
    assert.deepEqual(observed.snapshot(), plain.snapshot());
  }
});

test('N2: an aborted candidate counts as candidate-only time, one that opens an episode does not', () => {
  const vad = new LocalEnergyVad();
  const diagnostics = new PhaseDiagnostics(() => 0);
  vad.setObserver(diagnostics); diagnostics.mark('otra-persona');
  vad.accept(silence());
  vad.accept(sine(0.05)); vad.accept(sine(0.05)); // 100 ms above threshold.
  vad.accept(silence());
  let phase = byPhase(diagnostics.snapshot(), 'otra-persona');
  assert.equal(phase.candidateOnlyMs, 100); assert.equal(phase.candidateAborts, 1); assert.equal(phase.episodesOpened, 0);
  for (let i = 0; i < 4; i++) vad.accept(sine(0.05)); // 200 ms: opens after 150 ms.
  phase = byPhase(diagnostics.snapshot(), 'otra-persona');
  assert.equal(phase.episodesOpened, 1);
  assert.equal(phase.candidateOnlyMs, 100);
  assert.equal(phase.candidateAborts, 1);
});

test('N3 (frame level): candidate frames are attributed to the phase they arrived in, abort vs reset', () => {
  const frame = (state, event = null) => ({ rms: 0.01, onsetThreshold: 0.003, clipped: false, positive: state === 'candidato', state, event });
  for (const ending of ['abort', 'reset']) {
    const diagnostics = new PhaseDiagnostics(() => 0);
    diagnostics.mark('otra-persona');
    for (let i = 0; i < 8; i++) diagnostics.frame(frame('candidato'));
    diagnostics.mark('yo');
    for (let i = 0; i < 4; i++) diagnostics.frame(frame('candidato'));
    if (ending === 'abort') diagnostics.frame(frame('sin actividad', 'abort'));
    else diagnostics.candidateInterrupted();
    const snapshot = diagnostics.snapshot();
    const other = byPhase(snapshot, 'otra-persona'), me = byPhase(snapshot, 'yo');
    if (ending === 'abort') {
      assert.deepEqual([other.candidateOnlyMs, me.candidateOnlyMs], [80, 40]);
      assert.deepEqual([other.candidateAborts, me.candidateAborts], [0, 1]);
      assert.deepEqual([other.candidateInterruptedMs, me.candidateInterruptedMs], [0, 0]);
    } else {
      assert.deepEqual([other.candidateInterruptedMs, me.candidateInterruptedMs], [80, 40]);
      assert.deepEqual([other.candidateOnlyMs, me.candidateOnlyMs, me.candidateAborts], [0, 0, 0]);
    }
  }
});

test('N3 (integrated): marks fall between 50 ms chunks; a gap interrupts instead of aborting and counts once', async () => {
  for (const ending of ['silence', 'gap']) {
    const transcription = transcriptPort();
    const h = harness(transcription);
    await h.on(true, { diagnostics: true });
    h.chunk(silence());
    assert.equal(h.detector.markPhase('otra-persona'), true);
    h.chunk(sine(0.05)); // 50 ms of candidate in otra-persona.
    assert.equal(h.detector.markPhase('yo'), true);
    h.chunk(sine(0.05)); // 50 ms of candidate in yo (100 ms total: below the 150 ms onset).
    if (ending === 'silence') h.chunk(silence());
    else { h.tick(300); h.chunk(silence()); } // Tick notices the gap first, then the chunk sees it too.
    const snapshot = h.detector.snapshot().phases;
    const other = byPhase(snapshot, 'otra-persona'), me = byPhase(snapshot, 'yo');
    if (ending === 'silence') {
      assert.deepEqual([other.candidateOnlyMs, me.candidateOnlyMs, me.candidateAborts], [50, 50, 1]);
    } else {
      assert.deepEqual([other.candidateInterruptedMs, me.candidateInterruptedMs], [50, 50]);
      assert.deepEqual([other.candidateOnlyMs, me.candidateOnlyMs, me.candidateAborts], [0, 0, 0]);
      assert.equal(me.gapResets, 1, 'one gap is counted once');
    }
    // The mark reaches native ASR before the next chunk: order is exact at chunk granularity.
    const order = transcription.events.filter((e) => e.startsWith('phase') || e.startsWith('pcm'));
    assert.deepEqual(order.slice(0, 5), ['pcm:sin actividad', 'phase:1', 'pcm:candidato', 'phase:2', 'pcm:candidato']);
    assert.equal(byPhase(snapshot, 'sin-marcar').inputMs, 50);
    assert.equal(other.inputMs, 50); assert.equal(other.chunks, 1);
    h.detector.setEnabled(false);
  }
});

test('N4: language selector only changes while OFF, is frozen per session and texts never reach snapshots', async () => {
  const transcription = transcriptPort();
  const h = harness(transcription);
  controls.bindConversationSession({ detector: h.detector, setEnabled: () => {}, voiceModel: () => 'ready', textModel: () => 'ready' });
  assert.equal(controls.conversationTextLanguage(), 'auto');
  assert.equal(controls.conversationDiagnosticsSelected(), false);
  controls.setConversationTextLanguage('es');
  assert.deepEqual(controls.conversationSessionOptions(), { language: 'es', diagnostics: false });
  await h.on(true, controls.conversationSessionOptions());
  assert.ok(transcription.events.includes('start:es'));
  assert.equal(h.detector.snapshot().languageMode, 'es');
  controls.setConversationTextLanguage('auto'); // Ignored while ON.
  controls.setConversationDiagnosticsSelected(true); // Ignored while ON.
  assert.equal(controls.conversationTextLanguage(), 'es');
  assert.equal(controls.conversationDiagnosticsSelected(), false);
  h.chunk(sine(0.05));
  assert.ok(!JSON.stringify(h.detector.snapshot()).includes('zanahoria'));
  h.detector.setEnabled(false);
  assert.equal(h.detector.snapshot().languageMode, 'es', 'kept after OFF until the next ON');
  controls.setConversationTextLanguage('auto');
  assert.equal(controls.conversationTextLanguage(), 'auto');
  await h.on(false, controls.conversationSessionOptions());
  assert.equal(h.detector.snapshot().languageMode, undefined, 'no ASR, no language');
  assert.equal(h.detector.snapshot().phases, undefined, 'diagnostics off by default');
  assert.equal(h.detector.markPhase('yo'), false);
  h.detector.setEnabled(false);
  await h.on(true);
  assert.ok(transcription.events.includes('start:es'), 'default start uses Spanish');
  h.detector.setEnabled(false);
});

test('clipping, wall/input time, OFF freeze and the mark limit', async () => {
  const h = harness(transcriptPort());
  await h.on(false, { diagnostics: true });
  const clipped = sine(0.01);
  for (let frame = 0; frame < 5; frame++) {
    for (const sample of [0, 1]) { clipped[(frame * 160 + sample) * 2] = 0xff; clipped[(frame * 160 + sample) * 2 + 1] = 0x7f; }
  }
  h.detector.markPhase('referencia');
  h.chunk(clipped);
  let phase = byPhase(h.detector.snapshot().phases, 'referencia');
  assert.equal(phase.clippedFrames, 5);
  assert.equal(phase.relativeBins.reduce((a, b) => a + b, 0), 0);
  assert.equal(phase.inputMs, 50);
  assert.equal(phase.wallMs, 50, 'clock time, kept apart from sample time');
  for (let i = 0; i < MAX_PHASE_MARKS + 3; i++) h.detector.markPhase(i % 2 ? 'yo' : 'otra-persona');
  let snapshot = h.detector.snapshot().phases;
  assert.equal(snapshot.marks, MAX_PHASE_MARKS);
  assert.equal(snapshot.ignoredMarks, 4);
  h.detector.setEnabled(false);
  snapshot = h.detector.snapshot().phases;
  assert.equal(snapshot.finished, true);
  const wall = snapshot.phases.reduce((sum, p) => sum + p.wallMs, 0);
  h.tick(5000);
  assert.equal(h.detector.snapshot().phases.phases.reduce((sum, p) => sum + p.wallMs, 0), wall, 'frozen after OFF');
  assert.equal(h.detector.markPhase('fin'), false);
});

test('bin edges are inclusive on the lower bound', () => {
  assert.equal(binIndex(-Infinity, RELATIVE_BIN_EDGES_DB), 0);
  assert.equal(binIndex(-12, RELATIVE_BIN_EDGES_DB), 1);
  assert.equal(binIndex(-0.01, RELATIVE_BIN_EDGES_DB), 3);
  assert.equal(binIndex(0, RELATIVE_BIN_EDGES_DB), 4);
  assert.equal(binIndex(12, RELATIVE_BIN_EDGES_DB), 6);
});
