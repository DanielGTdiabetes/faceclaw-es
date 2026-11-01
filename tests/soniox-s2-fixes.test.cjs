// Regressions for the five defects reproduced by Codex on S2 (notes/revision-codex-implementacion-s2-2026-10-04.md).
// Each case requires the corrected behaviour; the original probes asserted the defect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WearerIdentity, evaluateWindow, normalizeForPhrase, IDENTITY_LIMITS } =
  require('../.test-build/app/conversation-detection/wearer-identity.js');
const { ConversationTurns } = require('../.test-build/app/conversation-detection/conversation-turns.js');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');
const { stack } = require('./soniox-s2-stack.cjs');

const PHRASE = ['Soy', ' yo', ' quien', ' lleva', ' las', ' gafas'];
/** Raw Soniox final tokens (snake_case), 200 ms apart, 190 ms long. */
const raw = (speaker, parts, start, step = 200, length = 190) =>
  parts.map((text, i) => ({ text, speaker, is_final: true, start_ms: start + i * step, end_ms: start + i * step + length }));
/** Validated FinalToken objects as the engine passes them to identity/turns. */
const fin = (speaker, parts, start, step = 200, length = 190) =>
  raw(speaker, parts, start, step, length).map((t) => ({ text: t.text, speaker, startMs: t.start_ms, endMs: t.end_ms, valid: true }));
const bad = (speaker, text) => ({ text, speaker, startMs: null, endMs: null, valid: false });

/** WearerIdentity on a clock whose periodic callbacks only run when `fire()` is called. */
function lazyIdentity() {
  let now = 0;
  const timers = new Set();
  const id = new WearerIdentity({ now: () => now, every(cb) { timers.add(cb); return () => timers.delete(cb); } });
  const events = [];
  id.subscribe((e) => events.push(e.kind));
  return { id, events, timers, set now(v) { now = v; }, get now() { return now; },
    fire() { for (const cb of [...timers]) cb(); },
    feed(tokens) { for (const t of tokens) id.observeFinal(t); } };
}

// ---------------------------------------------------------------- F1: deadline independent of the timer

test('F1 a result delivered after the 6 s deadline is sin-resultado even if the timer never ran (Codex probe)', () => {
  const h = lazyIdentity();
  h.id.start('deadline', 1); h.id.audio(1000); assert.equal(h.id.identify(), true);
  h.feed(fin('2', PHRASE, 1200));
  h.id.audio(6000); // 5 s of audio closes the window at now=0; the deadline is now+6000
  assert.equal(h.id.state(), 'esperando-resultado');
  h.now = 6001; // the socket callback wins over the delayed periodic callback
  h.id.progress(6300);
  const snapshot = h.id.snapshot();
  assert.deepEqual([snapshot.state, snapshot.lastOutcome, snapshot.speaker, snapshot.version],
    ['sin-identificar', 'sin-resultado', undefined, 0]);
  assert.ok(!h.events.includes('frase'), 'no association event');
  assert.equal(h.timers.size, 0, 'the expired attempt released its timer');
});

test('F1 tokens arriving after the deadline are not collected and late progress cannot associate', () => {
  const h = lazyIdentity();
  h.id.start('s', 1); h.id.audio(1000); h.id.identify(); h.id.audio(6000);
  h.now = 6000; // exactly at the deadline
  h.feed(fin('2', PHRASE, 1200));
  assert.equal(h.id.snapshot().lastOutcome, 'sin-resultado');
  h.id.progress(6400);
  assert.equal(h.id.relation('2'), 'desconocido');
  assert.equal(h.id.associationVersion(), 0);
});

test('F1 real progress just before the deadline is still accepted', () => {
  const h = lazyIdentity();
  h.id.start('s', 1); h.id.audio(1000); h.id.identify();
  h.feed(fin('2', PHRASE, 1200)); h.id.audio(6000);
  h.now = 5999;
  h.id.progress(6300);
  assert.deepEqual([h.id.state(), h.id.snapshot().speaker, h.id.snapshot().lastOutcome], ['identificado', '2', 'aceptado']);
});

test('F1 the 8 s listening limit applies by the clock: late audio does not extend the window', () => {
  const h = lazyIdentity();
  h.id.start('s', 1); h.id.audio(1000); h.id.identify();
  h.id.audio(3500); // 2.5 s of audio, then PCM stalls
  h.now = 9000; // past openedAt + 8 s, no timer has run
  h.id.audio(4500); // late PCM: the window had closed at 3500
  assert.equal(h.id.state(), 'esperando-resultado');
  // A phrase that only fits if the window had grown to 4500 is outside the 3500 + 300 limit.
  h.feed(fin('2', PHRASE, 3000)); // ends at 4190
  h.id.progress(4500);
  assert.equal(h.id.snapshot().lastOutcome, 'frase-fuera-de-ventana');
});

test('F1 «Listo» after the 8 s limit has no effect and the result wait starts at the limit', () => {
  const h = lazyIdentity();
  h.id.start('s', 1); h.id.audio(1000); h.id.identify(); h.id.audio(4000);
  const ref = h.id.actionRef();
  h.now = 8500;
  assert.equal(h.id.finish(ref), false, 'window already closed by the 8 s limit');
  assert.equal(h.id.state(), 'esperando-resultado');
  h.now = 8000 + IDENTITY_LIMITS.resultWallMs; // 6 s after the 8 s limit, not after the late check
  h.feed(fin('2', PHRASE, 1200)); h.id.progress(4300);
  assert.equal(h.id.snapshot().lastOutcome, 'sin-resultado');
  assert.equal(h.id.relation('2'), 'desconocido');
});

test('F1 snapshot and OFF see the expiry without the timer; windows stay disjoint afterwards', () => {
  const h = lazyIdentity();
  h.id.start('s', 1); h.id.audio(1000); h.id.identify(); h.id.audio(6000);
  h.now = 7000;
  assert.equal(h.id.snapshot().lastOutcome, 'sin-resultado');
  assert.equal(h.id.identify(), true);
  // Tokens of the old window (start < 6000 + 300) cannot complete the new attempt.
  h.feed(fin('2', PHRASE, 5000)); h.id.audio(11_400); h.id.progress(11_700);
  assert.equal(h.id.snapshot().lastOutcome, 'frase-no-reconocida');
  const off = lazyIdentity();
  off.id.start('s', 1); off.id.audio(1000); off.id.identify(); off.id.audio(6000);
  off.now = 6000;
  off.id.end('cancelado-off');
  assert.equal(off.id.summary().lastOutcome, 'sin-resultado');
});

test('F1 integrated: a socket message after the deadline, before any timer, leaves the wearer unidentified', async () => {
  const h = stack(); await h.on();
  const turns = [];
  h.detector.subscribeTurns((t) => turns.push(t));
  h.audio(1000); h.detector.identifyWearer(); h.audio(5000);
  assert.equal(h.identity().state, 'esperando-resultado');
  h.audio(400);
  h.skip(6000); // past the deadline; no periodic callback has run
  h.msg([...raw('2', PHRASE, 1500), { text: '<end>', is_final: true }], { final_audio_proc_ms: 6300 });
  const identity = h.identity();
  assert.deepEqual([identity.state, identity.lastOutcome, identity.speaker], ['sin-identificar', 'sin-resultado', undefined]);
  assert.match(h.detector.transcriptText(), /^2: Soy yo quien lleva las gafas$/); // text still shown, no «Yo»
  assert.equal(turns.at(-1).relation, 'desconocido');
  h.detector.setEnabled(false);
});

// ---------------------------------------------------------------- F2: stale phrase actions

const labels = (h) => controls.wearerActions(h.detector).map((a) => a.label);
const action = (h, label) => controls.wearerActions(h.detector).find((a) => a.label === label);

test('F2 «Listo» kept from attempt A does not close attempt B of the same session (Codex probe)', async () => {
  const h = stack(); await h.on();
  h.audio(1000); h.detector.identifyWearer();
  const staleFinish = action(h, 'Listo, ya la he dicho');
  h.detector.cancelWearerIdentification(); h.audio(400); h.detector.identifyWearer(); h.audio(2500);
  assert.equal(staleFinish.run(), false);
  assert.equal(h.identity().state, 'escuchando-frase');
  // The menu built now for B does act on B.
  assert.equal(action(h, 'Listo, ya la he dicho').run(), true);
  assert.equal(h.identity().state, 'esperando-resultado');
  h.detector.setEnabled(false);
});

test('F2 «Cancelar» kept from attempt A (listening or waiting) does not cancel attempt B', async () => {
  const h = stack(); await h.on();
  h.audio(1000); h.detector.identifyWearer();
  const cancelListening = action(h, 'Cancelar identificación');
  h.audio(2500); h.detector.finishWearerIdentification();
  const cancelWaiting = action(h, 'Cancelar identificación');
  h.audio(6500); // A expires without a result
  assert.equal(h.identity().lastOutcome, 'sin-resultado');
  h.detector.identifyWearer(); h.audio(500);
  assert.equal(cancelListening.run(), false);
  assert.equal(cancelWaiting.run(), false);
  assert.deepEqual([h.identity().state, h.identity().lastOutcome], ['escuchando-frase', 'sin-resultado']);
  h.detector.setEnabled(false);
});

test('F2 «Cancelar» offered while listening still cancels the same attempt after its window closed', async () => {
  const h = stack(); await h.on();
  h.audio(1000); h.detector.identifyWearer();
  const cancel = action(h, 'Cancelar identificación');
  h.audio(5000); // the same attempt is now waiting for its result
  assert.equal(h.identity().state, 'esperando-resultado');
  assert.equal(cancel.run(), true);
  assert.equal(h.identity().lastOutcome, 'cancelado-manual');
  h.detector.setEnabled(false);
});

test('F2 «Identificar» kept across another attempt or an association change starts nothing', async () => {
  const h = stack(); await h.on();
  h.audio(1000);
  h.msg(raw('2', ['hola'], 100));
  const staleIdentify = action(h, 'Identificar mi voz (frase)');
  h.detector.identifyWearer(); h.detector.cancelWearerIdentification(); // attempt elsewhere (lenses)
  assert.equal(staleIdentify.run(), false);
  assert.equal(h.identity().state, 'sin-identificar');
  const beforeAssign = action(h, 'Identificar mi voz (frase)');
  assert.equal(h.detector.assignWearer({ ...h.detector.observedSpeakers()[0], speaker: '2' }), true);
  assert.equal(beforeAssign.run(), false);
  assert.equal(h.identity().state, 'identificado');
  assert.equal(h.detector.lastSessionSummary(), null);
  assert.deepEqual(labels(h), ['Identificar mi voz (frase)']);
  assert.equal(action(h, 'Identificar mi voz (frase)').run(), true); // a fresh menu works
  h.detector.setEnabled(false);
  assert.equal(h.detector.lastSessionSummary().identity.attempts, 2);
});

test('F2 phrase actions kept across OFF/ON return false and leave the new session untouched (Codex probe)', async () => {
  const h = stack(); await h.on();
  h.audio(1000);
  const staleIdentify = action(h, 'Identificar mi voz (frase)');
  h.detector.identifyWearer();
  const staleFinish = action(h, 'Listo, ya la he dicho');
  const staleCancel = action(h, 'Cancelar identificación');
  h.detector.setEnabled(false);
  await h.on(); h.audio(1000);
  assert.equal(staleIdentify.run(), false);
  assert.equal(h.identity().state, 'sin-identificar');
  h.detector.identifyWearer(); // the new session's first attempt has the same attempt number as before
  assert.equal(staleFinish.run(), false);
  assert.equal(staleCancel.run(), false);
  assert.deepEqual([h.identity().state, h.identity().lastOutcome], ['escuchando-frase', 'ninguno']);
  h.detector.setEnabled(false);
});

test('F2 a valid manual choice of the current session still cancels any pending attempt; stale ones do not', async () => {
  const h = stack(); await h.on();
  h.audio(1000);
  h.msg(raw('1', ['hola'], 100));
  const choices = controls.wearerChoices(h.detector); // built before attempt B exists
  h.detector.identifyWearer(); h.detector.cancelWearerIdentification();
  h.detector.identifyWearer(); h.audio(500);
  assert.equal(choices[0].run(), true);
  assert.deepEqual([h.identity().state, h.identity().speaker, h.identity().source, h.identity().lastOutcome],
    ['identificado', '1', 'manual', 'cancelado-manual']);
  h.detector.setEnabled(false);
  await h.on(); h.audio(500); h.msg(raw('1', ['otra'], 100)); h.detector.identifyWearer();
  assert.equal(choices[0].run(), false);
  assert.equal(choices[1].run(), false);
  assert.equal(h.identity().state, 'escuchando-frase');
  h.detector.setEnabled(false);
});

test('F2 direct engine calls validate the reference fields one by one', () => {
  const h = lazyIdentity();
  h.id.start('s1', 1); h.id.audio(1000);
  const idle = h.id.actionRef();
  assert.deepEqual(idle, { sessionId: 's1', streamId: 1, attemptSeq: 0, version: 0 });
  assert.equal(h.id.identify({ ...idle, sessionId: 's0' }), false);
  assert.equal(h.id.identify({ ...idle, streamId: 2 }), false);
  assert.equal(h.id.identify({ ...idle, version: 1 }), false);
  assert.equal(h.id.identify({ ...idle, attemptSeq: 1 }), false);
  assert.equal(h.id.identify(idle), true);
  const live = h.id.actionRef();
  assert.equal(live.attemptSeq, 1);
  assert.equal(h.id.finish({ ...live, attemptSeq: 2 }), false);
  assert.equal(h.id.cancel({ ...live, sessionId: 's0' }), false);
  assert.equal(h.id.state(), 'escuchando-frase');
  assert.equal(h.id.cancel(live), true);
  assert.equal(h.id.cancel(live), false, 'idempotent: nothing left to cancel');
});

// ---------------------------------------------------------------- F3: capture boundaries and late finals

function turnLog() {
  const turns = new ConversationTurns({ relation: () => 'desconocido', associationVersion: () => 0 });
  const out = [];
  turns.subscribe((t) => out.push(t));
  turns.start('s1', 1);
  return { turns, out, feed(tokens) { for (const t of tokens) turns.accept(t); },
    rows: () => out.map((t) => [t.text, t.startMs, t.endMs, t.closedBy]) };
}
/** No emitted turn may hold valid times on both sides of a boundary unless it is a single crossing token. */
function assertNoCrossing(out, boundaries, crossingTexts = []) {
  for (const turn of out) {
    if (turn.startMs === null) continue;
    for (const b of boundaries) {
      if (turn.startMs < b && turn.endMs > b) assert.ok(crossingTexts.includes(turn.text), `${turn.text} crosses ${b}`);
    }
  }
}

test('F3 late finals on both sides of a reset never form one intervention (Codex probe)', async () => {
  const gap = stack(); await gap.on(); gap.audio(1000);
  gap.soniox.resetStream(); // boundary at streamMs=1000, before the old finals arrive
  gap.audio(500);
  const turns = [];
  gap.detector.subscribeTurns((t) => turns.push(t));
  gap.msg([...raw('2', ['antes'], 500), ...raw('2', [' después'], 1100), { text: '<end>', is_final: true }]);
  assert.deepEqual(turns.map((t) => [t.text, t.startMs, t.endMs, t.closedBy]),
    [['antes', 500, 690, 'frontera'], ['después', 1100, 1290, 'endpoint']]);
  gap.detector.setEnabled(false);
});

test('F3 a turn already open at the reset is closed there; its late continuation is a separate turn', () => {
  const h = turnLog();
  h.feed(fin('1', ['Uno'], 600, 100, 90));
  h.turns.boundary(1000);
  h.feed([...fin('1', [' dos'], 800, 100, 90), ...fin('1', [' tres'], 1100, 100, 90)]);
  h.turns.marker('end');
  assert.deepEqual(h.rows(), [['Uno', 600, 690, 'frontera'], ['dos', 800, 890, 'frontera'], ['tres', 1100, 1190, 'endpoint']]);
  assertNoCrossing(h.out, [1000]);
});

test('F3 several boundaries split late finals by their own times, in any arrival order', () => {
  const h = turnLog();
  h.turns.boundary(1000); h.turns.boundary(2000);
  h.turns.boundary(2000); // repeated position: recorded once
  h.feed([...fin('2', ['a'], 500), ...fin('2', [' b'], 1500), ...fin('2', [' c'], 2500), ...fin('2', [' d'], 2700)]);
  h.turns.marker('fin');
  assert.deepEqual(h.rows(), [['a', 500, 690, 'frontera'], ['b', 1500, 1690, 'frontera'], ['c d', 2500, 2890, 'finalize']]);
  assertNoCrossing(h.out, [1000, 2000]);
});

test('F3 a delayed <fin> does not merge tokens from both sides', async () => {
  const h = stack(); await h.on(); h.audio(1000);
  h.soniox.resetStream(); h.audio(500);
  const turns = [];
  h.detector.subscribeTurns((t) => turns.push(t));
  h.msg(raw('2', ['antes'], 500));
  h.msg(raw('2', [' después'], 1100)); // post-boundary audio finalized before the <fin> of the finalize
  h.msg([{ text: '<fin>', is_final: true }]);
  assert.deepEqual(turns.map((t) => [t.text, t.closedBy]), [['antes', 'frontera'], ['después', 'finalize']]);
  assertNoCrossing(turns, [1000]);
  h.detector.setEnabled(false);
});

test('F3 a token with the boundary inside stands alone with its own times; words are never split', () => {
  const h = turnLog();
  h.turns.boundary(1000);
  h.feed([...fin('2', ['antes'], 700, 100, 90), { text: ' cruza', speaker: '2', startMs: 900, endMs: 1100, valid: true },
    ...fin('2', [' después'], 1200, 100, 90)]);
  h.turns.marker('end');
  assert.deepEqual(h.rows(), [['antes', 700, 790, 'frontera'], ['cruza', 900, 1100, 'frontera'], ['después', 1200, 1290, 'endpoint']]);
  assertNoCrossing(h.out, [1000], ['cruza']);
  // Ending exactly at the boundary belongs before it; starting exactly at it belongs after it.
  const edge = turnLog();
  edge.turns.boundary(1000);
  edge.feed([{ text: 'fin', speaker: '1', startMs: 900, endMs: 1000, valid: true }, { text: ' ini', speaker: '1', startMs: 1000, endMs: 1100, valid: true }]);
  edge.turns.marker('end');
  assert.deepEqual(edge.rows(), [['fin', 900, 1000, 'frontera'], ['ini', 1000, 1100, 'endpoint']]);
});

test('F3 invalid times are never joined across an unsettled boundary; settled progress places them', () => {
  const h = turnLog();
  h.turns.boundary(1000);
  h.feed([...fin('2', ['antes'], 500), bad('2', ' eh'), ...fin('2', [' después'], 1100)]);
  h.turns.marker('end');
  assert.deepEqual(h.out.map((t) => [t.text, t.timing, t.closedBy]),
    [['antes', 'valido', 'frontera'], ['eh', 'invalido', 'frontera'], ['después', 'valido', 'endpoint']]);
  // Once final progress reaches the last boundary, no earlier audio can still arrive: the invalid
  // token belongs to the latest segment and joins its open turn.
  h.turns.progress(1000);
  h.feed([...fin('2', ['luego'], 1300), bad('2', ' sí')]);
  h.turns.marker('end');
  assert.deepEqual(h.out.at(-1).text, 'luego sí');
  assert.equal(h.out.at(-1).timing, 'parcial');
  assertNoCrossing(h.out, [1000]);
});

test('F3 integrated: invalid timing and an OFF-time reset never create or cross a boundary', async () => {
  const h = stack(); await h.on(); h.audio(1000);
  const turns = [];
  h.detector.subscribeTurns((t) => turns.push(t));
  h.soniox.resetStream(); h.audio(500);
  h.msg([...raw('2', ['antes'], 500), { text: ' x', speaker: '2', is_final: true, start_ms: 'bad', end_ms: 600 },
    ...raw('2', [' después'], 1100), { text: '<end>', is_final: true }], { final_audio_proc_ms: 1400 });
  assert.deepEqual(turns.map((t) => [t.text, t.timing]), [['antes', 'valido'], ['x', 'invalido'], ['después', 'valido']]);
  assertNoCrossing(turns, [1000]);
  // Without any reset nothing changes: one speaker, contiguous tokens, one turn.
  const plain = stack(); await plain.on(); plain.audio(1000);
  const plainTurns = [];
  plain.detector.subscribeTurns((t) => plainTurns.push(t));
  plain.msg([...raw('1', ['uno', ' dos'], 100), { text: '<end>', is_final: true }]);
  assert.deepEqual(plainTurns.map((t) => [t.text, t.closedBy]), [['uno dos', 'endpoint']]);
  plain.detector.setEnabled(false);
  h.detector.setEnabled(false);
});

// ---------------------------------------------------------------- F4: last turn relation at OFF

/** Turns and association events in one ordered log. */
function journal(h) {
  const log = [];
  h.detector.subscribeTurns((t) => log.push(`turn:${t.text}:${t.relation}:${t.associationVersion}:${t.closedBy}`));
  h.detector.subscribeAssociation((e) => log.push(`assoc:${e.kind}:${e.version}`));
  return log;
}

test('F4 a wearer turn still open at OFF closes as portador with its association version (Codex probe)', async () => {
  const off = stack(); await off.on(); off.audio(1000);
  off.msg(raw('2', ['Hola'], 100)); // no endpoint yet
  const ref = off.detector.observedSpeakers()[0];
  assert.equal(off.detector.assignWearer({ sessionId: ref.sessionId, streamId: ref.streamId, speaker: '2' }), true);
  const log = journal(off);
  off.detector.setEnabled(false);
  assert.deepEqual(log, ['assoc:estado-inicial:1', 'turn:Hola:portador:1:fin-sesion', 'assoc:fin-sesion:1']);
  assert.equal(off.detector.lastSessionSummary().identity.state, 'identificado');
});

test('F4 OFF with a pending attempt: turn keeps its relation and the attempt is summarised as cancelado-off', async () => {
  const h = stack(); await h.on(); h.audio(1000);
  h.msg(raw('2', ['Hola'], 100));
  h.msg(raw('1', ['qué', ' tal'], 300)); // other label, still open at OFF
  h.detector.assignWearer({ ...h.detector.observedSpeakers()[0], speaker: '2' }); // «1» becomes a known other
  h.detector.identifyWearer(); h.audio(500);
  const log = journal(h);
  h.detector.setEnabled(false);
  assert.deepEqual(log, ['assoc:estado-inicial:1', 'turn:qué tal:otro:1:fin-sesion', 'assoc:fin-sesion:1']);
  const summary = h.detector.lastSessionSummary();
  assert.deepEqual([summary.identity.state, summary.identity.lastOutcome, summary.identity.source, summary.endedBy],
    ['escuchando-frase', 'cancelado-off', 'manual', 'manual']);
});

test('F4 expiry closes the last wearer turn as portador before the association ends', async () => {
  const h = stack(); await h.on(); h.audio(1000);
  h.msg(raw('2', ['Hola'], 100));
  h.detector.assignWearer({ ...h.detector.observedSpeakers()[0], speaker: '2' });
  h.msg(raw('2', [' sigo'], 400));
  const log = journal(h);
  h.audio(120_000);
  assert.equal(h.detector.snapshot().stopReason, 'expired');
  assert.deepEqual(log, ['assoc:estado-inicial:1', 'turn:Hola sigo:portador:1:fin-sesion', 'assoc:fin-sesion:1']);
});

test('F4 a phrase turn closed before its own confirmation stays desconocido (accepted design, unchanged)', async () => {
  const h = stack(); await h.on(); h.audio(1000);
  h.detector.identifyWearer(); h.audio(5400); // progress can only cover audio actually sent
  const log = journal(h);
  // The same message's progress first closes the phrase turn by pause, then confirms the identity.
  h.msg(raw('2', PHRASE, 1500), { final_audio_proc_ms: 6300 });
  assert.equal(h.identity().speaker, '2');
  h.detector.setEnabled(false);
  assert.deepEqual(log, ['assoc:estado-inicial:0', 'turn:Soy yo quien lleva las gafas:desconocido:0:pausa', 'assoc:frase:1',
    'assoc:fin-sesion:1']);
});

// ---------------------------------------------------------------- F5: accent folding without ICU

/** Runs `fn` with String.prototype.normalize replaced, then restores it. */
function withNormalize(replacement, fn) {
  const saved = Object.getOwnPropertyDescriptor(String.prototype, 'normalize');
  try {
    if (replacement === undefined) delete String.prototype.normalize;
    else Object.defineProperty(String.prototype, 'normalize', { value: replacement, configurable: true, writable: true });
    return fn();
  } finally { Object.defineProperty(String.prototype, 'normalize', saved); }
}
const evidence = (tokens) => tokens.map((token) => ({ kind: 'token', token }));
const variants = {
  composed: ['SÓY', ' yo', ' quién', ' lleva', ' las', ' gafas'],
  decomposed: ['SO\u0301Y', ' yo', ' quie\u0301n', ' lleva', ' las', ' gafas'],
  upper: ['SOY', ' YO', ' QUIEN', ' LLEVA', ' LAS', ' GAFAS'],
  punctuation: ['¡Soy', ' yo,', ' quien', ' lleva', ' las', ' gafas!'],
  subwords: ['So', 'y', ' yo', ' qui', 'én', ' lle', 'va', ' las', ' ga', 'fas.'],
  tildeLetters: ['Bueno,', ' soy', ' yo', ' la', ' que', ' lleva', ' las', ' gafas', ' aquí'],
};

for (const [name, mode] of [['no-op (V8 without i18n)', (s) => function () { return String(this); }],
  ['missing', () => undefined], ['throwing', () => function () { throw new Error('normalize called'); }]]) {
  test(`F5 the closed phrase is recognised with normalize ${name}`, () => {
    withNormalize(mode(), () => {
      for (const [variant, parts] of Object.entries(variants)) {
        const outcome = evaluateWindow(evidence(fin('2', parts, 1200, 300, 290)), 1000, 6000);
        assert.deepEqual(outcome, { outcome: 'aceptado', speaker: '2' }, variant);
      }
    });
  });
}

test('F5 folding table: accents and marks removed, ASCII lowered, everything else a separator', () => {
  withNormalize(function () { return String(this); }, () => {
    assert.equal(normalizeForPhrase('ÁÉÍÓÚÜÑÇ áéíóúüñç àèìòù'), 'aeiouunc aeiouunc aeiou');
    assert.equal(normalizeForPhrase('A\u0301 e\u0300 n\u0303'), 'a e n');
    assert.equal(normalizeForPhrase('¿Quién? ¡Sí!-vale…'), ' quien   si  vale ');
    assert.equal(normalizeForPhrase('ok 42'), 'ok 42');
    assert.equal(normalizeForPhrase('日本 😀'), ' '.repeat(4)); // astral emoji: one separator
  });
});

test('F5 still exact: no fuzzy, partial or joined-word matches', () => {
  withNormalize(function () { return String(this); }, () => {
    for (const parts of [['soi', ' yo', ' quien', ' lleva', ' las', ' gafas'], ['soy', ' yo', ' quien', ' lleva', ' las', ' gafa'],
      ['soyyo', ' quien', ' lleva', ' las', ' gafas'], ['soy', ' yo', ' quien', ' llevá', ' la', ' gafas'],
      ['soy', ' yo', ' quien', ' lleva', ' lasgafas']]) {
      assert.deepEqual(evaluateWindow(evidence(fin('2', parts, 1200, 300, 290)), 1000, 6000), { outcome: 'frase-no-reconocida' }, parts.join(''));
    }
  });
});

test('F5 source guard: phrase normalization uses neither normalize() nor Unicode property escapes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/conversation-detection/wearer-identity.ts'), 'utf8');
  assert.ok(!/\.normalize\s*\(/.test(source), 'normalize() call in wearer-identity.ts');
  assert.ok(!/\\[pP]\{/.test(source), 'Unicode property escape in wearer-identity.ts');
  assert.ok(!/\.(toLowerCase|toLocaleLowerCase|localeCompare)\s*\(|\bIntl\./.test(source), 'locale/ICU-dependent call in wearer-identity.ts');
});
