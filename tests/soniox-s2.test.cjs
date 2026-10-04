const test = require('node:test');
const assert = require('node:assert/strict');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');
const ui = require('../.test-build/app/conversation-detection/conversation-ui.js');

const PHRASE = ['Soy', ' yo', ' quien', ' lle', 'va', ' las', ' ga', 'fas'];
const timed = (speaker, parts, start, step = 150, length = 140) => parts.map((text, i) =>
  ({ text, is_final: true, speaker, start_ms: start + i * step, end_ms: start + i * step + length }));

const { stack } = require('./soniox-s2-stack.cjs');

test('S2 end to end: interlocutor first, phrase accepted from the final tokens, «Yo» rendered and turns related', async () => {
  const h = stack(); await h.on();
  const turns = [];
  h.detector.subscribeTurns((turn) => turns.push(turn));
  assert.equal(h.identity().state, 'sin-identificar');
  h.audio(1000);
  h.msg(timed('1', ['¿Qué', ' tal?'], 100, 300, 280), { final_audio_proc_ms: 900 });
  assert.equal(h.detector.identifyWearer(), true);
  assert.match(ui.wearerLine(h.detector.snapshot()), /Di: «Soy yo quien lleva las gafas»/);
  h.audio(5000);
  assert.equal(h.identity().state, 'esperando-resultado');
  h.audio(400); // progress can only cover audio actually sent
  h.msg([...timed('2', PHRASE, 1500), { text: '<end>', is_final: true }], { final_audio_proc_ms: 6300 });
  const identity = h.identity();
  assert.deepEqual([identity.state, identity.speaker, identity.source, identity.knownOthers], ['identificado', '2', 'frase', 1]);
  assert.match(h.detector.transcriptText(), /^1: ¿Qué tal\?\nYo: Soy yo quien lleva las gafas$/);
  assert.match(ui.wearerLine(h.detector.snapshot()), /Portador: «Yo» = voz 2 \(frase\)/);
  // Both turns closed (speaker change, <end>) before the message progress produced the association:
  // relation is fixed at closing and never rewritten; the association event lets a consumer recompute.
  assert.deepEqual(turns.map((t) => [t.seq, t.speaker, t.relation, t.associationVersion, t.closedBy]),
    [[1, '1', 'desconocido', 0, 'cambio-hablante'], [2, '2', 'desconocido', 0, 'endpoint']]);
  h.audio(300);
  h.msg([...timed('2', [' vale'], 6450), { text: '<end>', is_final: true }], { final_audio_proc_ms: 6700 });
  assert.deepEqual([turns.at(-1).relation, turns.at(-1).associationVersion], ['portador', 1]);
  h.audio(300);
  h.msg([...timed('3', ['nuevo'], 6800), { text: '<end>', is_final: true }], { final_audio_proc_ms: 7000 });
  assert.equal(turns.at(-1).relation, 'desconocido');
  assert.match(h.detector.transcriptText(), /\n3\?: nuevo$/);
  assert.match(h.detector.transcriptText(), /Yo: Soy yo quien lleva las gafas vale/);
  h.detector.setEnabled(false);
});

test('precision 3: all tokens of a message are consumed before its progress closes the window', async () => {
  const h = stack(); await h.on();
  h.audio(500); h.detector.identifyWearer(); h.audio(5400);
  h.msg([...timed('2', PHRASE, 600), ...timed('1', PHRASE, 3000)], { final_audio_proc_ms: 5800 });
  assert.equal(h.identity().state, 'sin-identificar');
  assert.equal(h.identity().lastOutcome, 'frase-ambigua');
  h.detector.setEnabled(false);
});

test('precision 2: OFF during an attempt records cancelado-off, not an audio interruption; summary keeps endedBy', async () => {
  const h = stack(); await h.on();
  h.audio(500); h.detector.identifyWearer(); h.audio(1000);
  h.detector.setEnabled(false);
  const summary = h.detector.lastSessionSummary();
  assert.equal(summary.identity.lastOutcome, 'cancelado-off');
  assert.equal(summary.identity.state, 'escuchando-frase');
  assert.equal(summary.endedBy, 'manual');
  assert.equal(summary.sentAudioMs, 1500);
  assert.equal(h.leases[0].stopped, true); // native capture still stops as before
  assert.ok(h.sockets[0].texts.includes(JSON.stringify({ type: 'finalize' })));
  assert.equal(h.detector.transcriptText(), '');
});

test('precision 2: a real gap or yield keeps the session and reports audio-interrumpido', async () => {
  const h = stack(); await h.on();
  h.audio(500); h.detector.identifyWearer(); h.audio(500);
  h.wait(400); h.detector.refresh(); // > 250 ms without PCM: transport gap
  assert.equal(h.identity().lastOutcome, 'audio-interrumpido');
  assert.equal(h.detector.snapshot().enabled, true);
  h.detector.identifyWearer();
  h.leases[0].revoked(); // yield to PTT/Hey Even
  assert.equal(h.identity().lastOutcome, 'audio-interrumpido');
  h.detector.setEnabled(false);
  assert.equal(h.detector.lastSessionSummary().identity.lastOutcome, 'audio-interrumpido');
});

test('expiry and terminal error propagate endedBy after the coordinator cleanup', async () => {
  // Attempt still inside its 8 s listening limit when the 120 s session expires: cancelled by OFF.
  const h = stack(); await h.on();
  h.audio(118_000); h.detector.identifyWearer(); h.audio(3000);
  assert.equal(h.detector.snapshot().stopReason, 'expired');
  assert.equal(h.detector.lastSessionSummary().endedBy, 'expired');
  assert.equal(h.detector.lastSessionSummary().identity.lastOutcome, 'cancelado-off');
  // F1: an attempt whose 8 s limit passed long before expiry ended at that limit (by the clock, even if
  // its timer had not run): with 500 ms of audio it is `audio-insuficiente`, not cancelled by OFF.
  const late = stack(); await late.on();
  late.audio(500); late.detector.identifyWearer();
  late.wait(120_000); late.detector.refresh();
  assert.equal(late.detector.lastSessionSummary().endedBy, 'expired');
  assert.equal(late.detector.lastSessionSummary().identity.lastOutcome, 'audio-insuficiente');
  const e = stack(); await e.on(); e.audio(200);
  e.leases[0].failed();
  assert.equal(e.detector.lastSessionSummary().endedBy, 'error');
});

test('precision 1: fallback to Whisper keeps text continuity, drops identity and turns, and is not a terminal error', async () => {
  const h = stack(); await h.on();
  h.audio(1000);
  h.msg([...timed('2', ['Hola'], 100), { text: '<end>', is_final: true }], { final_audio_proc_ms: 900 });
  h.detector.assignWearer({ ...h.detector.observedSpeakers()[0], speaker: '2' });
  h.detector.identifyWearer();
  h.sockets[0].listener.onFailure('reset by peer');
  const snapshot = h.detector.snapshot();
  assert.equal(snapshot.enabled, true);
  assert.notEqual(snapshot.state, 'error');
  assert.deepEqual([snapshot.transcription.identity.state, snapshot.transcription.identity.lastOutcome, snapshot.transcription.turnsAvailable],
    ['no-disponible', 'motor-local', false]);
  assert.equal(h.soniox.turns().length, 0);
  h.local.setText('sigue local');
  assert.equal(h.detector.transcriptText(), 'Texto anterior · Soniox:\n2: Hola\nLocal · sin identificación:\nsigue local');
  assert.equal(ui.wearerLine(snapshot), 'Portador: identificación solo con Soniox');
  assert.deepEqual(controls.wearerActions(h.detector), []);
  assert.equal(h.detector.identifyWearer(), false);
  h.detector.setEnabled(false);
  const summary = h.detector.lastSessionSummary();
  assert.deepEqual([summary.engineFinal, summary.lastErrorCategory, summary.fallbacks, summary.identity.lastOutcome],
    ['local (sin red)', 'red', 1, 'motor-local']);
  assert.equal(h.detector.transcriptText(), '');
});

test('invalid timing and progress are counted, never used to identify, and the text still shows', async () => {
  const h = stack(); await h.on();
  h.audio(500); h.detector.identifyWearer(); h.audio(5400);
  const bad = timed('2', PHRASE, 600).map((t, i) => i === 2 ? { ...t, start_ms: Number.NaN } : i === 4 ? { ...t, end_ms: 99999 } : t);
  h.msg(bad, { final_audio_proc_ms: 5900 });
  assert.equal(h.identity().lastOutcome, 'tiempos-invalidos');
  assert.match(h.detector.transcriptText(), /2: Soy yo quien lleva las gafas/);
  h.msg([], { final_audio_proc_ms: 5000 }); // decreasing
  h.msg([], { final_audio_proc_ms: 99999 }); // beyond audio sent
  h.detector.setEnabled(false);
  const summary = h.detector.lastSessionSummary();
  assert.deepEqual([summary.invalidTimingTokens, summary.invalidProgress], [2, 2]);
});

test('stale menus and late socket messages after OFF/ON have no effect; session ids are new', async () => {
  const h = stack(); await h.on();
  h.audio(500);
  h.msg(timed('1', ['hola'], 100));
  const staleChoices = controls.wearerChoices(h.detector);
  assert.deepEqual(staleChoices.map((c) => c.label), ['Soy la voz 1 · «hola»', 'No soy ninguna']);
  const firstSession = h.detector.observedSpeakers()[0].sessionId;
  h.detector.setEnabled(false);
  await h.on(); h.audio(500);
  h.msg(timed('1', ['otra'], 100));
  assert.notEqual(h.detector.observedSpeakers()[0].sessionId, firstSession);
  assert.equal(staleChoices[0].run(), false);
  assert.equal(staleChoices[1].run(), false);
  h.msg(timed('1', PHRASE, 100), { final_audio_proc_ms: 400 }, h.sockets[0]);
  assert.equal(h.identity().state, 'sin-identificar');
  assert.equal(h.identity().version, 0);
  assert.equal(h.detector.lastSessionSummary(), null); // replaced by the new session
  h.detector.setEnabled(false);
});

test('coordinator gating: identification only while listening with Soniox open; never starts capture', async () => {
  const off = stack();
  assert.equal(off.detector.identifyWearer(), false);
  assert.deepEqual(controls.wearerActions(off.detector), []);
  assert.equal(off.sockets.length, 0);
  const loading = stack();
  loading.detector.setEnabled(true, true, 'off', { language: 'es' }); // socket not open yet
  assert.equal(loading.detector.identifyWearer(), false);
  loading.detector.setEnabled(false);
  const local = stack({ engine: 'local' }); await local.on(); local.audio(100);
  assert.equal(local.detector.identifyWearer(), false);
  assert.equal(local.identity().state, 'no-disponible');
  local.detector.setEnabled(false);
  const suspended = stack(); await suspended.on(); suspended.audio(100);
  suspended.env({ available: false, reason: 'gafas fuera' });
  assert.equal(suspended.detector.snapshot().state, 'suspendido');
  assert.equal(suspended.detector.identifyWearer(), false);
  suspended.detector.setEnabled(false);
});

test('shared controls follow the attempt state; error categories are stable; summaries and events carry no text', async () => {
  const h = stack(); await h.on();
  const events = [];
  h.detector.subscribeAssociation((event) => events.push(event));
  h.audio(500);
  assert.deepEqual(controls.wearerActions(h.detector).map((a) => a.label), ['Identificar mi voz (frase)']);
  controls.wearerActions(h.detector)[0].run();
  assert.deepEqual(controls.wearerActions(h.detector).map((a) => a.label), ['Listo, ya la he dicho', 'Cancelar identificación']);
  h.audio(2500); controls.wearerActions(h.detector)[0].run();
  assert.deepEqual(controls.wearerActions(h.detector).map((a) => a.label), ['Cancelar identificación']);
  assert.equal(ui.wearerLine(h.detector.snapshot()), 'Portador: comprobando la frase…');
  h.audio(6000); // audio keeps flowing but Soniox never confirms the window
  assert.match(ui.wearerLine(h.detector.snapshot()), /sin identificar · último intento: Soniox no confirmó a tiempo/);
  h.msg(timed('2', PHRASE, 600));
  h.msg([], { error_code: 503, error_type: 'service_unavailable', error_message: 'Soy yo quien lleva las gafas (request 123)' });
  h.detector.setEnabled(false);
  const summary = h.detector.lastSessionSummary();
  assert.equal(summary.lastErrorCategory, 'servidor:service_unavailable');
  const blob = JSON.stringify([summary, events, h.detector.snapshot()]);
  assert.ok(!/gafas|quien|request 123|sk-test/.test(blob), blob);
  assert.deepEqual(events.map((e) => e.kind), ['estado-inicial', 'fin-sesion']);
  const other = stack(); await other.on();
  other.msg([], { error_code: 500, error_type: 'weird', error_message: 'x' });
  other.detector.setEnabled(false);
  assert.equal(other.detector.lastSessionSummary().lastErrorCategory, 'servidor-otro');
});

test('summary timings come from the monotonic clock and include the network wait', async () => {
  const h = stack(); await h.on();
  h.audio(100); // first send at +50 ms
  h.wait(700);
  h.msg([{ text: 'ho', is_final: false, speaker: '1' }]);
  h.wait(300);
  h.msg(timed('1', ['hola'], 0), { final_audio_proc_ms: 100, total_audio_proc_ms: 100 });
  h.detector.setEnabled(false);
  const s = h.detector.lastSessionSummary();
  assert.deepEqual([s.firstTokenAfterMs, s.firstFinalAfterMs, s.finalAudioProcMs, s.backlogAtStopMs, s.speakersSeen],
    [750, 1050, 100, 0, 1]);
});
