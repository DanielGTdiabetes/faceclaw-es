// Manual ON with optional identity (conv/2): recognising the wearer improves attribution but never
// gates listening or Hermes. All audio, text, profile evidence and bridge results are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const { ConversationEpisodeTracker } = require('../.test-build/app/conversation-detection/conversation-episodes.js');
const { ConversationHermesRuntime } = require('../.test-build/app/conversation-detection/conversation-hermes.js');
const { ConversationCaptureCoordinator, OPTIONAL_PROFILE_LOAD_MS } = require('../.test-build/app/conversation-detection/coordinator.js');
const { manualHermesStatus } = require('../.test-build/app/conversation-detection/conversation-ui.js');
const { SonioxConversationTranscription } = require('../.test-build/app/native/soniox-conversation.js');

const POLICY = { candidateMs: 15000, silenceMs: 30000, maxTurns: 12, maxChars: 6000 };
const OPTIONAL = 'identidad-opcional', REQUIRED = 'identidad-requerida';
const CONV2 = ['chat', 'mcp', 'conv/1', 'conv/2'];

function turnFactory(sessionId = 's1', streamId = 1) {
  let seq = 0;
  return (speaker, patch = {}) => ({ v: 1, sessionId, streamId, seq: ++seq, engine: 'soniox', speaker,
    relation: 'desconocido', associationVersion: 0, text: 'Hablamos de la reforma de la cocina', timing: 'valido',
    startMs: seq * 1000, endMs: seq * 1000 + 500, closedBy: 'endpoint', ...patch });
}

// ---------------------------------------------------------------- tracker

test('tracker: optional identity makes one anonymous voice at association version 0 assessable', () => {
  const turn = turnFactory();
  const optional = new ConversationEpisodeTracker(() => 1000, POLICY);
  optional.start('s1', 1, OPTIONAL);
  optional.association({ sessionId: 's1', streamId: 1, version: 0, kind: 'estado-inicial', speaker: null });
  assert.equal(optional.accept(turn('1')), true);
  const context = optional.assessmentContext();
  assert.equal(context.modality, OPTIONAL);
  assert.equal(context.ref.associationVersion, 0);
  assert.deepEqual(context.turns.map(t => t.relation), ['desconocido']);
  // The previous behaviour (and the default) still require wearer + other.
  const strict = new ConversationEpisodeTracker(() => 1000, POLICY);
  strict.start('s1', 1);
  strict.association({ sessionId: 's1', streamId: 1, version: 0, kind: 'estado-inicial', speaker: null });
  assert.equal(strict.accept(turnFactory()('1')), false);
  assert.equal(strict.assessmentContext(), null);
  assert.equal(strict.snapshot().modality, REQUIRED);
  assert.throws(() => strict.start('s1', 1, 'abierta'), /modality/);
});

test('tracker: relations are never invented, promoted or mixed inside one context', () => {
  const turn = turnFactory();
  const t = new ConversationEpisodeTracker(() => 1000, POLICY);
  t.start('s1', 1, OPTIONAL);
  t.association({ sessionId: 's1', streamId: 1, version: 0, kind: 'estado-inicial', speaker: null });
  assert.equal(t.accept(turn('1', { relation: 'portador' })), false, 'no wearer without association');
  assert.equal(t.accept(turn('2', { relation: 'otro' })), false, 'no verified other without association');
  assert.equal(t.accept(turn(null)), true);
  assert.equal(t.accept(turn('2')), true);
  assert.deepEqual(t.assessmentContext().turns.map(x => [x.speaker, x.relation]), [[null, 'desconocido'], ['2', 'desconocido']]);
  // Profile later recognises voice 1: the earlier context is retired, nothing is relabelled.
  t.association({ sessionId: 's1', streamId: 1, version: 1, kind: 'perfil', speaker: '1' });
  assert.equal(t.snapshot().turns, 0); assert.equal(t.snapshot().lastEnd, 'identidad');
  assert.equal(t.accept(turn('1', { relation: 'portador', associationVersion: 0 })), false, 'old version');
  assert.equal(t.accept(turn('1', { relation: 'desconocido', associationVersion: 1 })), false, 'wearer label as unknown');
  assert.equal(t.accept(turn('1', { relation: 'portador', associationVersion: 1 })), true);
  assert.equal(t.accept(turn('3', { associationVersion: 1 })), true);
  assert.equal(t.accept(turn('3', { relation: 'otro', associationVersion: 1 })), false, 'mixed relation for one label');
  assert.deepEqual(t.assessmentContext().turns.map(x => x.relation), ['portador', 'desconocido']);
});

// ---------------------------------------------------------------- channel

function channelHarness(caps = CONV2) {
  let now = 1000;
  const frames = [], results = [], timers = new Set();
  const channel = new ConversationChannel({ now: () => now, send: f => { frames.push(JSON.parse(JSON.stringify(f))); return true; },
    after(cb, ms) { const t = { cb, at: now + ms }; timers.add(t); return () => timers.delete(t); } });
  channel.negotiate(caps); channel.setEnabled(true);
  const tracker = new ConversationEpisodeTracker(() => now, POLICY);
  tracker.start('s1', 1, OPTIONAL);
  tracker.association({ sessionId: 's1', streamId: 1, version: 0, kind: 'estado-inicial', speaker: null });
  const turn = turnFactory();
  tracker.accept(turn('1'));
  const context = tracker.assessmentContext();
  return { channel, frames, results, context, turn, tracker,
    request: (ctx = context, mode = 'assess') => channel.request(ctx, mode, 5000, r => results.push(r)),
    reply: (patch = {}) => { const f = frames.at(-1); channel.handle({ chan: 'conv', type: 'result', mode: f.type,
      requestId: f.requestId, ref: f.ref, verdict: 'tema', ...patch }); },
    advance(ms) { now += ms; for (const t of [...timers]) if (now >= t.at) { timers.delete(t); t.cb(); } } };
}

test('channel: an old conv/1 bridge never receives an anonymous context', () => {
  const h = channelHarness(['chat', 'mcp', 'conv/1']);
  assert.equal(h.channel.supportsOptionalIdentity(), false);
  assert.equal(h.request(), false);
  assert.equal(h.frames.length, 0);
  assert.equal(h.channel.statistics().rechazados, 1);
  for (const caps of [['conv/2'], ['chat', 'conv/2'], 'conv/1 conv/2', undefined]) {
    h.channel.negotiate(caps); assert.equal(h.channel.supportsOptionalIdentity(), false, String(caps));
  }
});

test('channel: conv/2 sends the explicit modality with version 0 and accepts the correlated verdict', () => {
  const h = channelHarness();
  assert.equal(h.channel.supportsOptionalIdentity(), true);
  assert.equal(h.request(), true);
  const frame = h.frames[0];
  assert.equal(frame.modality, OPTIONAL);
  assert.equal(frame.ref.associationVersion, 0);
  assert.deepEqual(Object.keys(frame).sort(), ['chan', 'type', 'requestId', 'ref', 'modality', 'timeoutMs', 'turns'].sort());
  assert.deepEqual(frame.turns.map(t => t.relation), ['desconocido']);
  h.reply({ verdict: 'cortesia' });
  assert.equal(h.results[0].verdict, 'cortesia');
  assert.deepEqual(h.channel.statistics(), { sent: 1, verdicts: 1, tema: 0, cortesia: 1, incierto: 0, mensajes: 0,
    nada: 0, errores: 0, invalidos: 0, caducados: 0, cancelados: 0, rechazados: 0 });
});

test('channel: invalid modality, contradictory attribution and malformed or excessive contexts are refused', () => {
  const h = channelHarness();
  const base = h.context;
  const variants = [
    { ...base, modality: 'abierta' },
    { ...base, modality: REQUIRED }, // version 0 / unknown only under the strict contract
    { ...base, ref: { ...base.ref, associationVersion: -1 } },
    { ...base, turns: [] },
    { ...base, turns: Array.from({ length: 41 }, (_, i) => ({ ...base.turns[0], seq: i + 1 })) },
    { ...base, turns: [{ ...base.turns[0], text: 'x'.repeat(6001) }] },
    { ...base, turns: [{ ...base.turns[0], associationVersion: 1 }] },
    { ...base, turns: [{ ...base.turns[0], endMs: 10 }] },
    { ...base, turns: [{ ...base.turns[0], relation: 'portador', speaker: null }] },
    { ...base, turns: [{ ...base.turns[0] }, { ...base.turns[0], seq: 9, relation: 'portador' }] },
    { ...base, turns: [{ ...base.turns[0], relation: 'portador' }, { ...base.turns[0], seq: 9, relation: 'otro' }] },
    { ...base, turns: [{ ...base.turns[0], relation: 'portador' }, { ...base.turns[0], seq: 9, speaker: '2', relation: 'portador' }] },
  ];
  for (const [i, ctx] of variants.entries()) assert.equal(h.request(ctx), false, `variant ${i}`);
  assert.equal(h.frames.length, 0);
});

test('channel: required identity keeps the exact conv/1 frame on both bridges', () => {
  for (const caps of [['conv/1'], CONV2]) {
    const h = channelHarness(caps);
    const t = new ConversationEpisodeTracker(() => 1000, POLICY);
    t.start('s1', 1);
    t.association({ sessionId: 's1', streamId: 1, version: 1, kind: 'manual', speaker: '1' });
    const turn = turnFactory();
    t.accept(turn('1', { relation: 'portador', associationVersion: 1 }));
    t.accept(turn('2', { relation: 'otro', associationVersion: 1 }));
    assert.equal(h.request(t.assessmentContext()), true);
    assert.deepEqual(Object.keys(h.frames[0]).sort(), ['chan', 'type', 'requestId', 'ref', 'timeoutMs', 'turns'].sort());
  }
});

test('channel: late, cancelled or reconnected responses are dropped and counted without content', () => {
  const late = channelHarness(); late.request(); late.advance(5000); late.reply();
  assert.deepEqual(late.results, [null]); assert.equal(late.channel.statistics().caducados, 1);
  const reconnect = channelHarness(); reconnect.request(); reconnect.channel.negotiate(CONV2); reconnect.reply();
  assert.deepEqual(reconnect.results, [null]);
  const error = channelHarness(); error.request();
  error.channel.handle({ chan: 'conv', type: 'error', requestId: error.frames[0].requestId, ref: error.frames[0].ref });
  assert.equal(error.channel.statistics().errores, 1);
  assert.ok(!JSON.stringify(error.channel.statistics()).includes('cocina'));
});

// ---------------------------------------------------------------- runtime

function runtimeHarness(caps = CONV2) {
  let now = 1000, ref = null;
  const state = { enabled: false, state: 'desactivado', transcription: { engine: 'soniox' } };
  const observers = new Set(), turns = new Set(), associations = new Set(), timers = new Set();
  const frames = [], outputs = [];
  const source = { snapshot: () => state, wearerActionRef: () => ref,
    subscribe(cb) { observers.add(cb); cb(state); return () => observers.delete(cb); },
    subscribeTurns(cb) { turns.add(cb); return () => turns.delete(cb); },
    subscribeAssociation(cb) { associations.add(cb); return () => associations.delete(cb); } };
  const timer = (cb, ms, repeat) => { const t = { cb, at: now + ms, repeat }; timers.add(t); return () => timers.delete(t); };
  const channel = new ConversationChannel({ now: () => now, send: f => { frames.push(f); return true; }, after: (cb, ms) => timer(cb, ms, false) });
  channel.negotiate(caps);
  const runtime = new ConversationHermesRuntime(source, channel, { now: () => now,
    every: (cb, ms) => timer(cb, ms, true), onOutput: text => outputs.push(text), changed() {} }, POLICY);
  const notify = () => { for (const cb of [...observers]) cb(state); };
  const makeTurn = turnFactory();
  function association(version, speaker = null, kind = version ? 'perfil' : 'estado-inicial') {
    ref = { sessionId: 's1', streamId: 1, version, attemptSeq: 0 };
    for (const cb of associations) cb({ v: 1, sessionId: 's1', streamId: 1, version, kind, speaker, knownOthers: [] });
  }
  return { runtime, channel, frames, outputs, timers, state,
    on(modality = OPTIONAL, budget = null) {
      const armed = runtime.begin(budget, modality);
      if (armed) { state.enabled = true; state.state = 'escuchando'; notify(); association(0); }
      return armed;
    },
    association,
    say(speaker, patch = {}) { const t = makeTurn(speaker, { associationVersion: ref?.version ?? 0, ...patch }); for (const cb of turns) cb(t); },
    advance(ms) { now += ms; for (const t of [...timers]) if (now >= t.at && timers.has(t)) { if (t.repeat) t.at = now + 500; else timers.delete(t); t.cb(); } },
    update(patch) { Object.assign(state, patch); notify(); },
    reply(mode, patch = {}, sent = frames.findLast(f => f.type === mode)) {
      channel.handle({ chan: 'conv', type: 'result', mode, requestId: sent.requestId, ref: sent.ref,
        verdict: 'tema', kind: 'mensaje', text: 'La isla roba espacio; mejor una península.', ...patch });
    },
    sent: () => frames.filter(f => f.type === 'assess' || f.type === 'assist') };
}

test('runtime: optional identity is refused on an old bridge and keeps required identity there', () => {
  const old = runtimeHarness(['conv/1']);
  assert.equal(old.on(OPTIONAL), false); assert.equal(old.channel.isEnabled(), false);
  assert.equal(old.on(REQUIRED), true);
  old.say('1'); old.advance(2000); assert.equal(old.sent().length, 0, 'unknown voice cannot reach a conv/1 bridge');
  old.runtime.dispose();
  const h = runtimeHarness();
  assert.equal(h.runtime.begin(80, 'otra'), false);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('runtime: one anonymous voice → assess → topic → one final contribution, with no identity action', () => {
  const h = runtimeHarness(); assert.equal(h.on(), true);
  assert.equal(h.runtime.snapshot().modality, OPTIONAL);
  h.say('1'); h.advance(2000);
  const assess = h.sent()[0];
  assert.equal(assess.type, 'assess'); assert.equal(assess.modality, OPTIONAL); assert.equal(assess.ref.associationVersion, 0);
  assert.deepEqual(assess.turns.map(t => [t.speaker, t.relation]), [['1', 'desconocido']]);
  assert.deepEqual(h.outputs.filter(Boolean), []);
  h.reply('assess');
  assert.equal(h.sent()[1].type, 'assist', 'immediate assistance after topic');
  h.reply('assist');
  assert.deepEqual(h.outputs.filter(Boolean), ['La isla roba espacio; mejor una península.']);
  const d = h.runtime.diagnostics();
  assert.deepEqual(d.counters, { turnsAccepted: 1, turnsIgnored: 0, candidates: 1, assessments: 1, assists: 1,
    topics: 1, abstentions: 0, messages: 1, delivered: 1, failures: 0 });
  assert.ok(!JSON.stringify(d).includes('península') && !JSON.stringify(d).includes('cocina'));
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('runtime: two anonymous voices and a later profile match keep unknown relations honest', () => {
  const h = runtimeHarness(); h.on();
  h.say('1'); h.say('2'); h.advance(2000);
  assert.deepEqual(h.sent()[0].turns.map(t => t.relation), ['desconocido', 'desconocido']);
  h.reply('assess');
  const assist = h.sent()[1];
  // Profile recognises voice 1 while assistance is in flight: the old reply is invalid.
  h.association(1, '1');
  h.reply('assist', {}, assist);
  assert.deepEqual(h.outputs.filter(Boolean), []);
  h.say('1', { relation: 'portador' }); h.say('2'); h.advance(5000);
  const next = h.sent().at(-1);
  assert.equal(next.type, 'assess'); assert.equal(next.ref.associationVersion, 1);
  assert.deepEqual(next.turns.map(t => t.relation), ['portador', 'desconocido']);
  h.runtime.dispose();
});

test('runtime: courtesy, uncertainty, nada and errors stay silent and are counted as abstentions/failures', () => {
  for (const [mode, patch, counter] of [['assess', { verdict: 'cortesia' }, 'abstentions'], ['assess', { verdict: 'incierto' }, 'abstentions'],
    ['assist', { kind: 'nada' }, 'abstentions'], ['assist', { type: 'error' }, 'failures']]) {
    const h = runtimeHarness(); h.on(); h.say('1'); h.advance(2000);
    if (mode === 'assist') h.reply('assess');
    h.reply(mode, patch); h.advance(6000);
    assert.deepEqual(h.outputs.filter(Boolean), [], JSON.stringify(patch));
    assert.equal(h.runtime.diagnostics().counters[counter], 1, JSON.stringify(patch));
    h.runtime.dispose();
  }
});

test('runtime: suspension, OFF, episode close and reconnection invalidate old replies', () => {
  for (const change of ['suspend', 'off', 'close', 'reconnect']) {
    const h = runtimeHarness(); h.on(); h.say('1'); h.advance(2000); h.reply('assess');
    const assist = h.sent().at(-1);
    if (change === 'suspend') h.update({ state: 'suspendido' });
    if (change === 'off') { h.runtime.stop(); h.update({ enabled: false, state: 'desactivado' }); }
    if (change === 'close') h.advance(30000);
    if (change === 'reconnect') { h.channel.negotiate(CONV2); h.advance(500); }
    h.reply('assist', {}, assist);
    assert.deepEqual(h.outputs.filter(Boolean), [], change);
    if (change === 'reconnect') assert.equal(h.runtime.snapshot().enabled, false, 'no automatic re-arm');
    h.runtime.dispose();
  }
});

test('runtime: an explicit finite diagnostic budget preserves 5 s spacing and the 2 s quiet wait', () => {
  const h = runtimeHarness(); h.on(OPTIONAL, 80);
  h.say('1'); h.advance(1500); assert.equal(h.sent().length, 0, 'waits 2 s without new turns');
  h.advance(500); assert.equal(h.sent().length, 1);
  h.reply('assess', { verdict: 'incierto' });
  h.say('1'); h.advance(2000); assert.equal(h.sent().length, 1, 'minimum 5 s between requests');
  h.advance(3000); assert.equal(h.sent().length, 2);
  for (let i = 0; i < 200; i++) {
    const last = h.sent().at(-1);
    if (h.runtime.snapshot().busy) h.reply(last.type, { verdict: 'incierto' });
    h.say('1'); h.advance(5000);
  }
  assert.equal(h.runtime.snapshot().requests, 80); assert.equal(h.sent().length, 80);
  h.runtime.dispose();
});

test('runtime: manual listening can deliver after 80 abstentions while preserving cadence, one flight and OFF', () => {
  const h = runtimeHarness(); assert.equal(h.on(OPTIONAL, null), true);
  h.say('1'); h.advance(1500); assert.equal(h.sent().length, 0);
  h.advance(500); h.reply('assess', { verdict: 'tema' });
  h.reply('assist', { kind: 'nada' });
  for (let i = 0; i < 80; i++) {
    const count = h.sent().length;
    h.say('1'); h.advance(1500);
    assert.equal(h.sent().length, count, 'waits 2 s without a new turn');
    h.advance(3500);
    assert.equal(h.sent().length, count + 1, `evaluation ${i + 1} remains available`);
    const flight = h.sent().at(-1);
    h.say('2'); h.advance(5000);
    assert.equal(h.sent().length, count + 1, 'speech cannot start a second concurrent request');
    h.reply('assist', { kind: 'nada' }, flight);
  }
  assert.equal(h.channel.statistics().nada, 81);
  assert.equal(h.runtime.snapshot().requests, 82);
  h.say('1'); h.advance(5000);
  h.reply('assist', { kind: 'mensaje', text: 'Una aportación después de ochenta abstenciones.' });
  assert.deepEqual(h.outputs.filter(Boolean), ['Una aportación después de ochenta abstenciones.']);
  h.say('2'); h.advance(5000);
  const pending = h.sent().at(-1), beforeOff = h.sent().length;
  h.update({ enabled: false, state: 'desactivado' });
  h.reply('assist', { kind: 'mensaje', text: 'Respuesta posterior al OFF' }, pending);
  h.say('1'); h.advance(5000);
  assert.equal(h.sent().length, beforeOff);
  assert.equal(h.runtime.snapshot().enabled, false);
  assert.equal(h.outputs.at(-1), null);
  assert.deepEqual(h.runtime.history(), []);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

// ---------------------------------------------------------------- integration with real Soniox module

function sonioxStack(caps = CONV2) {
  let now = 1000, listener, enabled = false;
  const observers = new Set(), timers = new Set(), frames = [], outputs = [];
  const every = cb => { timers.add(cb); return () => timers.delete(cb); };
  const engine = new SonioxConversationTranscription({}, {
    apiKey: () => 'synthetic', engine: () => 'soniox', now: () => now, every,
    connect(_url, callbacks) { listener = callbacks; return { sendText: () => true, sendBinary: () => true, close() {} }; },
  });
  const source = { snapshot: () => ({ enabled, state: enabled ? 'escuchando' : 'desactivado', transcription: engine.snapshot() }),
    subscribe(cb) { observers.add(cb); cb(this.snapshot()); return () => observers.delete(cb); },
    wearerActionRef: () => engine.wearerActionRef(),
    subscribeTurns: cb => engine.subscribeTurns(cb), subscribeAssociation: cb => engine.subscribeAssociation(cb) };
  const channel = new ConversationChannel({ now: () => now, send: f => { frames.push(f); return true; }, after: every });
  channel.negotiate(caps);
  const runtime = new ConversationHermesRuntime(source, channel, { now: () => now, every, changed() {}, onOutput: t => outputs.push(t) }, POLICY);
  let streamMs = 0;
  return { engine, channel, runtime, frames, outputs,
    on(modality = OPTIONAL) {
      const armed = runtime.begin(null, modality);
      enabled = true; engine.start('auto', true); listener.onOpen();
      for (const cb of observers) cb(source.snapshot());
      return armed;
    },
    speech(speaker, duration, text) {
      const start = streamMs;
      for (let ms = 0; ms < duration; ms += 50) engine.acceptNative({}, 'posible voz');
      streamMs += duration;
      listener.onTextMessage(JSON.stringify({ tokens: [
        { speaker, text, is_final: true, start_ms: start + 200, end_ms: streamMs - 800 }, { text: '<end>', is_final: true },
      ], final_audio_proc_ms: streamMs }));
      return { startMs: start, endMs: streamMs, voicedMs: duration - 1000 };
    },
    tick(ms) { now += ms; for (const t of [...timers]) t(); },
    reply(type, patch) { const f = frames.findLast(x => x.type === type);
      channel.handle({ chan: 'conv', type: 'result', requestId: f.requestId, ref: f.ref, mode: type, ...patch }); },
    off() { runtime.dispose(); engine.stop(); enabled = false; } };
}

test('integration: manual ON without any profile evidence still reaches assess, topic and a final contribution', () => {
  const s = sonioxStack(); assert.equal(s.on(), true);
  s.speech('1', 3000, ' ¿Reservamos el tren de las nueve?');
  s.speech('2', 3000, ' Mejor el de las diez, hay obras.');
  s.tick(2000);
  assert.equal(s.engine.snapshot().identity.state, 'sin-identificar');
  const assess = s.frames.find(f => f.type === 'assess');
  assert.ok(assess, 'anonymous voices are assessed');
  assert.equal(assess.modality, OPTIONAL); assert.equal(assess.ref.associationVersion, 0);
  assert.deepEqual(assess.turns.map(t => t.relation), ['desconocido', 'desconocido']);
  s.reply('assess', { verdict: 'tema' });
  s.reply('assist', { kind: 'mensaje', text: 'Las obras siempre van con retraso, como los trenes.' });
  assert.deepEqual(s.outputs.filter(Boolean), ['Las obras siempre van con retraso, como los trenes.']);
  s.off();
});

test('integration: uncertain profile evidence abstains and never blocks the anonymous assessment', () => {
  const s = sonioxStack(); s.on();
  for (let seq = 1; seq <= 2; seq++) {
    const timing = s.speech(seq === 1 ? '1' : '2', 4000, ' Texto sintético sobre presupuestos');
    s.engine.acceptProfileMatch({ seq, ...timing, similarity: 0.55 });
  }
  s.tick(2000);
  assert.notEqual(s.engine.snapshot().identity.source, 'perfil');
  const assess = s.frames.find(f => f.type === 'assess');
  assert.ok(assess); assert.ok(assess.turns.every(t => t.relation === 'desconocido'));
  s.off();
});

test('integration: the same anonymous session on an old conv/1 bridge sends nothing', () => {
  const s = sonioxStack(['conv/1']);
  assert.equal(s.on(OPTIONAL), false);
  s.speech('1', 3000, ' Tema'); s.speech('2', 3000, ' Respuesta'); s.tick(2000);
  assert.equal(s.frames.length, 0);
  s.off();
});

// ---------------------------------------------------------------- coordinator: optional profile

function coordinator(participation) {
  let now = 1000, timer = null, sentMs = 0;
  const transcription = { start: () => true, stop() {}, resetStream() {}, acceptNative() { sentMs += 50; }, text: () => '',
    snapshot: () => ({ enabled: true, engine: 'soniox', status: 'listo', worker: false, busy: false, soniox: { sentMs } }) };
  const leases = [], environment = { available: true, reason: '', session: {} };
  const detector = new ConversationCaptureCoordinator({
    environment: () => environment, prepare: () => Promise.resolve(true),
    acquire(pcm) { const lease = { pcm, stop() {}, diagnostics: () => '' }; leases.push(lease); return lease; },
    now: () => now, every(cb) { timer = cb; return () => { timer = null; }; }, transcription, participation,
  });
  return { detector, leases, tick(ms = 500) { now += ms; timer?.(); } };
}
function participation(overrides = {}) {
  const state = { status: 'listo', worker: false, busy: false, profileSaved: false };
  const events = [];
  return { state, events, start() { events.push('start'); return overrides.start ?? true; }, stop() { events.push('stop'); },
    resetStream() {}, acceptNative() { events.push('pcm'); }, drainProfileMatches: () => [], snapshot: () => ({ ...state }),
    hasProfile: () => true, deleteProfile: () => false };
}

test('coordinator: profile absent, failing or slow never stops an optional-identity manual session', async () => {
  const absent = coordinator(participation());
  absent.detector.setEnabled(true, true, 'off', { manualConversation: true, optionalProfile: true });
  await Promise.resolve();
  assert.equal(absent.detector.snapshot().voiceProfile, 'sin-perfil');
  assert.equal(absent.leases.length, 1);

  const refused = participation({ start: false });
  const r = coordinator(refused);
  r.detector.setEnabled(true, true, 'conversation', { manualConversation: true, optionalProfile: true });
  await Promise.resolve();
  assert.equal(r.detector.snapshot().state !== 'error', true);
  assert.equal(r.detector.snapshot().voiceProfile, 'no-disponible');
  assert.equal(r.leases.length, 1);

  for (const status of ['error', 'modelo no disponible', 'sin perfil compatible']) {
    const p = participation(); p.state.status = status;
    const h = coordinator(p);
    h.detector.setEnabled(true, true, 'conversation', { manualConversation: true, optionalProfile: true });
    await Promise.resolve();
    assert.equal(h.detector.snapshot().enabled, true, status);
    assert.equal(h.detector.snapshot().voiceProfile, 'no-disponible', status);
    assert.ok(p.events.includes('stop'), status);
    h.leases[0].pcm(new Uint8Array(1600)); h.detector.acceptNativePcm({});
    assert.equal(p.events.includes('pcm'), false, 'released profile receives no audio');
  }

  const slow = participation(); slow.state.status = 'cargando';
  const s = coordinator(slow);
  s.detector.setEnabled(true, true, 'conversation', { manualConversation: true, optionalProfile: true });
  assert.equal(s.leases.length, 0, 'waits while the profile loads');
  s.tick(OPTIONAL_PROFILE_LOAD_MS); await Promise.resolve();
  assert.equal(s.detector.snapshot().voiceProfile, 'no-disponible');
  assert.equal(s.leases.length, 1);

  const ready = coordinator(participation());
  ready.detector.setEnabled(true, true, 'conversation', { manualConversation: true, optionalProfile: true });
  await Promise.resolve();
  assert.equal(ready.detector.snapshot().voiceProfile, 'activo');
  ready.detector.setEnabled(false);
  assert.equal(ready.detector.snapshot().voiceProfile, 'activo', 'kept for diagnostics after OFF');
});

test('coordinator: required identity keeps failing closed and the 20 min limit is unchanged', async () => {
  const p = participation(); p.state.status = 'error';
  const h = coordinator(p);
  h.detector.setEnabled(true, true, 'conversation', { manualConversation: true });
  assert.equal(h.detector.snapshot().state, 'error');
  const refused = coordinator(participation({ start: false }));
  refused.detector.setEnabled(true, true, 'conversation', { manualConversation: true });
  assert.equal(refused.detector.snapshot().state, 'error');
  const optional = coordinator(participation());
  optional.detector.setEnabled(true, true, 'off', { manualConversation: true, optionalProfile: true });
  assert.equal(optional.detector.snapshot().remainingMs, 1200000);
  optional.tick(1200000); assert.equal(optional.detector.snapshot().stopReason, 'expired');
});

// ---------------------------------------------------------------- controller decision and phone status

function manualOwner({ optional, profile, local = false, hermes = true, ready = 'ready' }) {
  const file = ts.createSourceFile('c.ts', fs.readFileSync('app/g2/dashboard-controller.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const klass = file.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'DashboardController');
  const methods = klass.members.filter(m => ['setManualConversationEnabled', 'setConversationCaptureEnabled'].includes(m.name?.getText(file)));
  const calls = [], begins = [];
  const context = { exports: {}, assistantBridge: { conversation: { isSupported: () => true, supportsOptionalIdentity: () => optional } },
    sonioxApiKeySetting: { get: () => local ? '' : 'synthetic' }, conversationTextEngine: () => local ? 'local' : 'soniox',
    conversationUsesHermes: () => hermes, conversationLocalModel: () => 'whisper-medium-es', conversationTextModelStatus: () => ready,
    conversationModel: () => 'whisper-medium-es',
    conversationSessionOptions: () => ({ language: 'auto', diagnostics: false }) };
  vm.runInNewContext(ts.transpileModule(`export class Owner { ${methods.map(m => m.getText(file)).join('\n')} }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const owner = new context.exports.Owner();
  let enabled = false;
  Object.assign(owner, { hermesSelected: false, setConversationHermesSelected(value) { this.hermesSelected = value; return true; },
    detectorEnvironment: () => ({ available: true }), ensureWearStateTracking() {},
    conversationHermes: { begin: (budget, modality) => { begins.push([budget, modality]); return true; }, stop() {}, snapshot: () => ({ enabled: begins.length > 0 }) },
    conversationDetector: { hasOwnProfile: () => profile,
      snapshot: () => ({ enabled, transcription: {}, participation: {} }),
      setEnabled(on, ...args) { enabled = on; calls.push([on, ...args]); } } });
  return { owner, calls, begins };
}

test('controller: conv/2 starts without a profile; conv/1 keeps the profile requirement', () => {
  const none = manualOwner({ optional: true, profile: false });
  assert.equal(none.owner.setManualConversationEnabled(true), '');
  assert.deepEqual(none.begins, [[null, OPTIONAL]]);
  assert.equal(none.calls[0][2], 'off');
  assert.equal(none.calls[0][3].optionalProfile, true);
  assert.equal(none.calls[0][3].manualConversation, true);
  assert.equal(none.calls[0][3].language, 'auto');
  const withProfile = manualOwner({ optional: true, profile: true });
  withProfile.owner.setManualConversationEnabled(true);
  assert.equal(withProfile.calls[0][2], 'conversation');
  assert.deepEqual(withProfile.begins, [[null, OPTIONAL]]);
  const old = manualOwner({ optional: false, profile: false });
  assert.match(old.owner.setManualConversationEnabled(true), /perfil de voz/);
  assert.equal(old.calls.length, 0);
  const oldWithProfile = manualOwner({ optional: false, profile: true });
  oldWithProfile.owner.setManualConversationEnabled(true);
  assert.deepEqual(oldWithProfile.begins, [[null, REQUIRED]]);
  assert.equal(oldWithProfile.calls[0][3].optionalProfile, false);
});

test('controller: selected local model uses optional Hermes without a key/profile; missing weights and old bridge keep OFF', () => {
  const local = manualOwner({ optional: true, profile: true, local: true });
  local.owner.setManualConversationEnabled(true);
  assert.equal(local.calls[0][2], 'off', 'no invented local speaker attribution');
  assert.equal(local.calls[0][3].textEngine, 'local');
  assert.deepEqual(local.begins, [[null, OPTIONAL]]);
  for (const args of [{ optional: false, profile: true, local: true }, { optional: true, profile: true, local: true, ready: 'absent' }]) {
    const rejected = manualOwner(args); assert.ok(rejected.owner.setManualConversationEnabled(true)); assert.equal(rejected.calls.length, 0);
  }
  const text = manualOwner({ optional: false, profile: false, local: true, hermes: false });
  text.owner.setManualConversationEnabled(true);
  assert.equal(text.calls[0][3].manualConversation, true); assert.deepEqual(text.begins, []);
});

test('phone status: recognition is optional, never claimed without a live profile association', () => {
  const off = { enabled: false, remainingMs: 0 };
  assert.match(manualHermesStatus(off, { enabled: false, listening: false, requests: 0 }, { supported: true, optionalIdentity: true }), /reconocer tu voz es opcional/);
  assert.match(manualHermesStatus(off, { enabled: false, listening: false, requests: 0 }, { supported: true, optionalIdentity: false }), /solo actúa si reconoce tu voz/);
  const run = { enabled: true, listening: true, requests: 3, modality: OPTIONAL };
  const on = (patch) => ({ enabled: true, remainingMs: 600000, voiceProfile: 'sin-perfil', transcription: { identity: { state: 'sin-identificar' } }, ...patch });
  assert.match(manualHermesStatus(on(), run, { supported: true, optionalIdentity: true }), /sin perfil · voces sin identificar/);
  assert.match(manualHermesStatus(on({ voiceProfile: 'activo' }), run, { supported: true, optionalIdentity: true }), /aún sin reconocer \(opcional\)/);
  assert.doesNotMatch(manualHermesStatus(on({ voiceProfile: 'activo' }), run, { supported: true, optionalIdentity: true }), /reconocida/);
  assert.match(manualHermesStatus(on({ transcription: { identity: { state: 'identificado', source: 'perfil' } } }), run,
    { supported: true, optionalIdentity: true }), /reconocida por tu perfil/);
});
