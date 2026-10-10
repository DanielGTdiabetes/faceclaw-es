const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const { ConversationHermesRuntime } = require('../.test-build/app/conversation-detection/conversation-hermes.js');

function harness(policy = { candidateMs: 15000, silenceMs: 30000, maxTurns: 12, maxChars: 6000 }, gateOptions) {
  let now = 1000, seq = 0, ref = null;
  const state = { enabled: false, state: 'desactivado', transcription: { engine: 'soniox' } };
  const observers = new Set(), turns = new Set(), associations = new Set(), timers = new Set();
  const frames = [], outputs = [];
  const source = { snapshot: () => state, wearerActionRef: () => ref,
    subscribe(cb) { observers.add(cb); cb(state); return () => observers.delete(cb); },
    subscribeTurns(cb) { turns.add(cb); return () => turns.delete(cb); },
    subscribeAssociation(cb) { associations.add(cb); return () => associations.delete(cb); } };
  const timer = (cb, ms, repeat) => { const t = { cb, at: now + ms, repeat }; timers.add(t); return () => timers.delete(t); };
  const channel = new ConversationChannel({ now: () => now, send: frame => { frames.push(frame); return true; },
    after: (cb, ms) => timer(cb, ms, false) });
  const runtime = new ConversationHermesRuntime(source, channel, { now: () => now,
    dailyContextEnabled: () => !!gateOptions?.memory,
    every: (cb, ms) => timer(cb, ms, true), wallClock: () => now, onOutput: text => outputs.push(text), changed() {} },
    policy);
  const notify = () => { for (const cb of [...observers]) cb(state); };
  function association(patch = {}, live = true) {
    const event = { v: 1, sessionId: 's1', streamId: 1, version: 1, kind: 'manual', speaker: '1', knownOthers: ['2'], ...patch };
    if (live) ref = { sessionId: event.sessionId, streamId: event.streamId, version: event.version, attemptSeq: 1 };
    for (const cb of associations) cb(event);
  }
  function turn(speaker, text = 'Conversación sobre trenes', patch = {}) {
    const t = { v: 1, sessionId: ref?.sessionId ?? 's1', streamId: ref?.streamId ?? 1, seq: ++seq, engine: 'soniox', speaker,
      relation: speaker === '1' ? 'portador' : 'otro', associationVersion: ref?.version ?? 1, text, timing: 'valido',
      startMs: seq * 1000, endMs: seq * 1000 + 500, closedBy: 'endpoint', ...patch };
    for (const cb of turns) cb(t);
  }
  function advance(ms, runTimers = true) {
    now += ms;
    if (runTimers) for (const t of [...timers]) if (now >= t.at && timers.has(t)) {
      if (t.repeat) t.at = now + 500; else timers.delete(t);
      t.cb();
    }
  }
  function reply(mode, patch = {}, sent = frames.findLast(f => f.type === mode)) {
    channel.handle({ chan: 'conv', type: 'result', mode, requestId: sent.requestId, ref: sent.ref,
      verdict: 'tema', kind: 'mensaje', text: 'Una aportación útil', ...patch });
  }
  return { runtime, channel, frames, outputs, timers, source, state, ref: () => ref, association, turn, advance, reply,
    begin(budget, receipts = false) { channel.negotiate(['conv/1', ...(receipts ? ['conv/memory-ack/1'] : [])]); runtime.begin(budget); state.enabled = true; state.state = 'escuchando'; notify(); association(); },
    update(patch) { Object.assign(state, patch); notify(); },
    candidate() { turn('1'); turn('2'); advance(2000); },
    deliver() { this.begin(); this.candidate(); this.reply('assess'); this.reply('assist'); },
    /** Advance in 500 ms runtime ticks. */
    ticks(ms) { for (let t = 0; t < ms; t += 500) advance(500); },
    sent: () => frames.filter(f => f.type === 'assess' || f.type === 'assist') };
}

test('metrics follow listening, concurrent transcription and native sent without retaining speech', () => {
  const h = harness(); h.begin(undefined, true);
  h.state.metrics = { chunks: 40 };
  h.state.transcription.soniox = { sentMs: 2000, finalTokens: 4 };
  h.candidate();
  h.turn('1', 'PRIVATE_MARKER'); h.advance(1000, false);
  h.state.metrics.chunks += 20;
  h.state.transcription.soniox.sentMs += 1000;
  h.state.transcription.soniox.finalTokens += 3;
  h.reply('assess', { timing: { primaryMs: 6000, fallbackMs: 500, attempts: 2, apiCalls: 2, fallbackReason: 'timeout' } });
  h.advance(500, false); h.reply('assist', { deliveryId: 'd' });
  h.advance(250, false);
  const presented = h.runtime.capturePresentation(); presented(); presented();
  h.update({ state: 'suspendido' }); h.advance(5000); h.runtime.stop();
  const metrics = h.runtime.diagnostics().metrics;
  assert.equal(metrics.listeningMs, 3750);
  assert.equal(metrics.busyMs, 1500);
  assert.equal(metrics.turnsDuringInference, 1);
  assert.equal(metrics.chunksDuringInference, 20);
  assert.equal(metrics.sentAudioMsDuringInference, 1000);
  assert.equal(metrics.finalTokensDuringInference, 3);
  assert.equal(metrics.assessRoundTrip.meanMs, 1000);
  assert.equal(metrics.assistRoundTrip.meanMs, 500);
  assert.equal(metrics.resultToNativeSent.meanMs, 250);
  assert.equal(metrics.turnToNativeSent.meanMs, 1750);
  assert.equal(metrics.nativeSent, 1);
  assert.equal(metrics.fallbacks, 1);
  assert.equal(metrics.providerAttempts, 2);
  assert.equal(metrics.requestsPerListeningMinute, 32);
  assert.equal(JSON.stringify(metrics).includes('PRIVATE_MARKER'), false);
  h.begin(); assert.equal(h.runtime.diagnostics().metrics.nativeSent, 0);
  h.runtime.dispose();
});

test('canceled evaluations preserve their continuity measurements and ignore late results', () => {
  const h = harness(); h.begin(); h.state.metrics = { chunks: 40 }; h.candidate();
  h.state.metrics.chunks += 20; h.advance(1000, false); h.runtime.stop();
  const before = h.runtime.diagnostics(); h.reply('assess');
  assert.equal(before.metrics.chunksDuringInference, 20);
  assert.equal(before.metrics.busyMs, 1000);
  assert.deepEqual(h.runtime.diagnostics(), before);
  assert.equal(h.outputs.filter(Boolean).length, 0);
  h.runtime.dispose();
});

test('explicit ON and capability are required; constructor/restore cannot start evaluation or capture', () => {
  const h = harness(); h.association(); h.turn('1'); h.turn('2'); h.advance(3000);
  assert.equal(h.frames.length, 0); assert.equal(h.runtime.begin(), false); assert.equal(h.state.enabled, false);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('runtime acknowledges only the captured current output; replacement, pause and OFF invalidate it', () => {
  for (const reason of ['current', 'replacement', 'pause', 'off', 'dismiss']) {
    const h = harness(); h.begin(undefined, true); h.candidate(); h.reply('assess');
    h.reply('assist', { deliveryId: 'first' });
    const confirm = h.runtime.capturePresentation(); assert.equal(typeof confirm, 'function');
    assert.equal(h.frames.filter(f => f.type === 'presented').length, 0);
    if (reason === 'replacement') {
      h.turn('1', 'Otro detalle'); h.advance(5000); h.reply('assist', { text: 'Otra idea', deliveryId: 'second' });
    }
    if (reason === 'pause') h.update({ state: 'suspendido' });
    if (reason === 'off') h.runtime.stop();
    if (reason === 'dismiss') h.runtime.dismissOutput();
    confirm(); confirm();
    assert.equal(h.frames.filter(f => f.type === 'presented').length, reason === 'current' ? 1 : 0, reason);
    h.runtime.dispose();
  }
});

test('an explicit diagnostic budget can allow more than eight requests and remains bounded', () => {
  const h = harness(); h.begin(12);
  for (let i = 0; i < 20; i++) {
    h.turn('1'); h.turn('2'); h.advance(5000);
    const last = h.sent().at(-1);
    if (last && h.runtime.snapshot().busy) h.reply(last.type, { verdict: 'incierto' });
  }
  assert.equal(h.runtime.snapshot().requests, 12); assert.equal(h.sent().length, 12);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('a topic can begin without any greeting, followed by one validated assistance output', () => {
  const h = harness(); h.begin(); h.candidate();
  assert.equal(h.sent()[0].type, 'assess'); assert.equal(h.outputs.filter(Boolean).length, 0);
  h.reply('assess'); assert.equal(h.sent()[1].type, 'assist');
  h.reply('assist'); assert.deepEqual(h.outputs.filter(Boolean), ['Una aportación útil']);
  h.advance(5000); assert.equal(h.sent().length, 2);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('deterministic replay filtering covers active assist without canceling useful work or changing cadence', () => {
  const h = harness(); h.begin(); h.candidate(); h.reply('assess');
  h.turn('1', 'PRIVATE_DETAIL', { startMs: 10_000, endMs: 11_000 });
  h.turn('1', 'private_detail', { startMs: 10_000, endMs: 11_000 });
  assert.equal(h.runtime.snapshot().busy, true, 'in-flight assist is not canceled');
  h.reply('assist', { kind: 'nada', text: undefined });
  h.advance(5000);
  assert.equal(h.sent().length, 3, 'the real new detail still reaches Hermes');
  h.reply('assist', { kind: 'nada', text: undefined });
  h.turn('1', 'PRIVATE_DETAIL', { startMs: 10_000, endMs: 11_000 });
  h.turn('1', '...'); h.advance(5000);
  assert.equal(h.sent().length, 3, 'replay and punctuation cannot trigger another assist');
  h.turn('1', 'PRIVATE_DETAIL', { startMs: 12_000, endMs: 13_000 }); h.advance(2000);
  assert.equal(h.sent().length, 4, 'actual repeated speech remains eligible, including for memory');
  h.runtime.stop();
  assert.deepEqual(h.runtime.diagnostics().prefilter, { empty: 1, duplicate: 2 });
  assert.equal(JSON.stringify(h.runtime.diagnostics()).includes('PRIVATE_DETAIL'), false);
  h.runtime.begin(); assert.deepEqual(h.runtime.diagnostics().prefilter, { empty: 0, duplicate: 0 }, 'reset before any new association');
  h.runtime.dispose();
});

test('punctuation-only input does not create an assess request', () => {
  const h = harness(); h.begin(); h.turn('1', '...'); h.turn('2', '¿?'); h.advance(5000);
  assert.equal(h.sent().length, 0);
  assert.deepEqual(h.runtime.diagnostics().prefilter, { empty: 2, duplicate: 0 });
  h.runtime.dispose();
});

test('speech during a pending evaluation does not cancel it; the late answer is still delivered', () => {
  const h = harness(); h.begin(); h.candidate();
  const assess = h.sent()[0];
  assert.equal(assess.timeoutMs, 15000);
  h.turn('1', 'Y además otra cosa'); h.advance(3000);
  assert.equal(h.runtime.snapshot().busy, true, 'the assessment is still in flight');
  h.reply('assess', {}, assess);
  const assist = h.sent().at(-1); assert.equal(assist.type, 'assist');
  h.turn('2', 'Seguimos hablando'); h.advance(3000);
  h.reply('assist', {}, assist);
  assert.deepEqual(h.outputs.filter(Boolean), ['Una aportación útil']);
  h.runtime.dispose();
});

test('courtesy, uncertainty, nada and technical failures never deliver visible messages', () => {
  for (const verdict of ['cortesia', 'incierto']) {
    const h = harness(); h.begin(); h.candidate(); h.reply('assess', { verdict });
    h.advance(6000); assert.equal(h.sent().length, 1); assert.deepEqual(h.outputs.filter(Boolean), []); h.runtime.dispose();
  }
  for (const patch of [{ kind: 'nada' }, { type: 'error' }]) {
    const h = harness(); h.begin(); h.candidate(); h.reply('assess'); h.reply('assist', patch);
    assert.deepEqual(h.outputs.filter(Boolean), []); h.runtime.dispose();
  }
});

test('identity correction, OFF, suspension and capture boundary reject pending outputs', () => {
  for (const change of ['identity', 'off', 'suspend', 'boundary']) {
    const h = harness(); h.begin(); h.candidate(); h.reply('assess'); const sent = h.sent().at(-1);
    if (change === 'identity') h.association({ version: 2 });
    if (change === 'off') h.update({ enabled: false, state: 'desactivado' });
    if (change === 'suspend') h.update({ state: 'suspendido' });
    if (change === 'boundary') h.turn('1', 'cut', { closedBy: 'frontera' });
    h.reply('assist', {}, sent); assert.deepEqual(h.outputs.filter(Boolean), [], change); h.runtime.dispose();
  }
});

test('normal chat suspends evaluation and resumes with new context', () => {
  const h = harness(); h.begin(); h.candidate(); h.channel.setChatActive(true);
  h.update({ state: 'suspendido' }); h.advance(1000);
  assert.equal(h.runtime.snapshot().enabled, true);
  h.channel.setChatActive(false); h.update({ state: 'escuchando' }); h.turn('1'); h.turn('2'); h.advance(5000);
  assert.equal(h.sent().length, 2); assert.equal(h.runtime.snapshot().enabled, true);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('ten socket losses never stop the armed session; each reconnect sends only new context', () => {
  const h = harness(); h.begin(null); h.candidate();
  assert.equal(h.sent().length, 1);
  for (let i = 0; i < 10; i++) {
    const before = h.sent().length;
    h.channel.reset(); h.advance(500);
    assert.equal(h.runtime.snapshot().enabled, true, `loss ${i}`);
    assert.equal(h.runtime.snapshot().link, 'sin-red');
    assert.match(h.runtime.filterStatus(), /transcripción continúa/);
    assert.equal(h.state.enabled, true);
    // Heard while offline: dropped, never replayed.
    h.turn('1', `OFFLINE_${i}`); h.turn('2', `OFFLINE_${i}b`); h.advance(6000);
    assert.equal(h.sent().length, before);
    h.channel.negotiate(['conv/1']); h.advance(500);
    assert.equal(h.runtime.snapshot().link, 'listo');
    assert.equal(h.channel.isEnabled(), true);
    h.association(); h.turn('1', `Nuevo tema ${i}`); h.turn('2', `Respuesta ${i}`); h.advance(6000);
    assert.equal(h.sent().length, before + 1, `resume ${i}`);
  }
  assert.equal(h.sent().some((f) => JSON.stringify(f).includes('OFFLINE_')), false);
  const counters = h.runtime.diagnostics().counters;
  assert.equal(counters.linkLosses, 10); assert.equal(counters.linkResumes, 10);
  assert.equal(counters.turnsOffline, 20); assert.ok(counters.offlineMs >= 10 * 6000);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('a reply from before the loss never reaches the lenses after reconnecting', () => {
  const h = harness(); h.begin(); h.candidate();
  const stale = h.sent()[0];
  h.channel.reset(); h.advance(500); h.channel.negotiate(['conv/1']); h.advance(500);
  h.reply('assess', {}, stale);
  h.association(); h.turn('1'); h.turn('2'); h.advance(6000);
  const fresh = h.sent().at(-1);
  assert.notEqual(fresh.requestId, stale.requestId);
  h.reply('assist', {}, stale);
  assert.deepEqual(h.outputs.filter(Boolean), []);
  h.runtime.dispose();
});

test('OFF during an outage never revives Hermes on reconnect', () => {
  const h = harness(); h.begin(); h.candidate();
  h.channel.reset(); h.advance(500);
  h.runtime.stop(); h.update({ enabled: false, state: 'desactivado' });
  h.channel.negotiate(['conv/1']); h.advance(5000);
  assert.equal(h.runtime.snapshot().enabled, false); assert.equal(h.channel.isEnabled(), false);
  assert.equal(h.runtime.snapshot().stopCause, 'off');
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('a revoked destination (server, token or auth change) keeps capture but never re-arms Hermes', () => {
  const h = harness(); h.begin(); h.candidate();
  h.channel.revoke(); h.advance(500);
  assert.equal(h.runtime.snapshot().enabled, true); assert.equal(h.runtime.snapshot().link, 'revocado');
  h.channel.negotiate(['conv/1']); h.advance(5000);
  assert.equal(h.channel.isEnabled(), false); assert.equal(h.runtime.snapshot().link, 'revocado');
  assert.equal(h.state.enabled, true);
  // A plain loss that turns into a revoke while offline also stays down.
  const g = harness(); g.begin(); g.channel.reset(); g.advance(500); g.channel.revoke(); g.advance(500);
  g.channel.negotiate(['conv/1']); g.advance(500);
  assert.equal(g.runtime.snapshot().link, 'revocado'); assert.equal(g.channel.isEnabled(), false);
  h.runtime.dispose(); g.runtime.dispose();
});

test('optional identity resumes only on a bridge that still announces conv/2', () => {
  const h = harness();
  h.channel.negotiate(['conv/1', 'conv/2']); h.runtime.begin(null, 'identidad-opcional');
  h.state.enabled = true; h.state.state = 'escuchando'; h.update({});
  h.channel.reset(); h.advance(500);
  h.channel.negotiate(['conv/1']); h.advance(500);
  assert.equal(h.channel.isEnabled(), false); assert.equal(h.runtime.snapshot().link, 'sin-red');
  h.channel.reset(); h.channel.negotiate(['conv/1', 'conv/2']); h.advance(500);
  assert.equal(h.channel.isEnabled(), true); assert.equal(h.runtime.snapshot().link, 'listo');
  h.runtime.dispose();
});

test('local fallback and errors shut down the channel without disabling normal capture independently', () => {
  for (const patch of [{ transcription: { engine: 'local' } }, { state: 'error' }]) {
    const h = harness(); h.begin(); h.candidate(); h.update(patch);
    assert.equal(h.runtime.snapshot().enabled, false); assert.equal(h.channel.isEnabled(), false);
    assert.equal(h.state.enabled, true); assert.equal(h.timers.size, 0); h.runtime.dispose();
  }
});

test('old association events and old end events cannot replace or stop the live stream', () => {
  const h = harness(); h.begin(); h.association({ version: 2 });
  h.association({ sessionId: 'old', streamId: 1, version: 1 }, false);
  h.association({ version: 1, kind: 'fin-sesion' }, false);
  h.candidate(); assert.equal(h.sent()[0].ref.sessionId, 's1'); assert.equal(h.sent()[0].ref.associationVersion, 2);
  h.runtime.dispose();
});

test('candidate expiry, silence and the eight-request session budget are enforced without retries', () => {
  const expired = harness(); expired.begin(); expired.turn('1'); expired.turn('2'); expired.advance(15000);
  assert.equal(expired.sent().length, 0); expired.runtime.dispose();
  const silent = harness(); silent.begin(); silent.candidate(); silent.reply('assess'); silent.reply('assist');
  silent.advance(30000); assert.equal(silent.runtime.snapshot().episode.state, 'esperando');
  assert.equal(silent.outputs.at(-1), null); silent.runtime.dispose();
  const h = harness(); h.begin();
  for (let i = 0; i < 15; i++) {
    h.turn('1'); h.turn('2'); h.advance(5000);
    const last = h.sent().at(-1);
    if (last && h.runtime.snapshot().busy) h.reply(last.type, { verdict: 'incierto' });
  }
  assert.equal(h.runtime.snapshot().requests, 8); assert.equal(h.sent().length, 8); h.runtime.dispose();
});

// ---------------------------------------------------------------- delivered message lifetime (S2.6.4)

const TEXT = 'Una aportación útil';

test('a turn after delivery cancels pending work but keeps the message for the 12 s minimum', () => {
  const h = harness(); h.deliver();
  assert.equal(h.outputs.at(-1), TEXT);
  h.advance(1000); h.turn('2'); h.turn('1');
  assert.equal(h.outputs.at(-1), TEXT, 'people keep talking: the message stays');
  h.ticks(10500);
  assert.equal(h.outputs.at(-1), TEXT, 'still readable at 11.5 s');
  assert.equal(h.outputs.slice(h.outputs.indexOf(TEXT)).filter(o => o === null).length, 0);
  h.ticks(500);
  assert.equal(h.outputs.at(-1), null, 'retired once the minimum has elapsed after the conversation moved on');
  h.runtime.dispose();
});

test('a newer Hermes message replaces the shown one without clearing first', () => {
  const h = harness(); h.deliver();
  h.turn('1'); h.turn('2'); h.advance(5000);
  assert.equal(h.sent().at(-1).type, 'assist');
  h.reply('assist', { text: 'Otra aportación' });
  assert.deepEqual(h.outputs.slice(h.outputs.indexOf(TEXT)), [TEXT, 'Otra aportación']);
  assert.deepEqual(h.runtime.history().map(e => e.text), ['Otra aportación', TEXT], 'newest first');
  h.runtime.dispose();
});

test('a tap retires the message at once; OFF retires it and clears the RAM history', () => {
  const tap = harness(); tap.deliver();
  tap.runtime.dismissOutput();
  assert.equal(tap.outputs.at(-1), null);
  assert.equal(tap.runtime.history().length, 1, 'the phone list keeps it while ON');
  tap.runtime.dispose();
  const off = harness(); off.deliver();
  assert.equal(off.runtime.history().length, 1);
  off.update({ enabled: false, state: 'desactivado' });
  assert.equal(off.outputs.at(-1), null);
  assert.deepEqual(off.runtime.history(), []);
  off.runtime.dispose();
});

test('without any other retirement the message is withdrawn at 30 s', () => {
  const h = harness({ candidateMs: 15000, silenceMs: 120000, maxTurns: 12, maxChars: 6000 }); h.deliver();
  h.ticks(29500);
  assert.equal(h.outputs.at(-1), TEXT);
  h.ticks(500);
  assert.equal(h.outputs.at(-1), null);
  h.runtime.dispose();
});

test('identity changes still retire a delivered message immediately', () => {
  const h = harness(); h.deliver();
  h.association({ version: 2, kind: 'borrado' });
  assert.equal(h.outputs.at(-1), null);
  h.runtime.dispose();
});

test('phone history: last five of this session with time, only while ON', () => {
  const { hermesHistoryText } = require('../.test-build/app/conversation-detection/conversation-ui.js');
  const h = harness(); h.deliver();
  for (let i = 0; i < 6; i++) {
    h.turn('1'); h.turn('2'); h.advance(5000); h.reply('assist', { text: `Mensaje ${i}` });
  }
  const history = h.runtime.history();
  assert.equal(history.length, 5);
  assert.deepEqual(history.map(e => e.text), ['Mensaje 5', 'Mensaje 4', 'Mensaje 3', 'Mensaje 2', 'Mensaje 1']);
  const shown = hermesHistoryText(true, history).split('\n');
  assert.equal(shown.length, 6);
  assert.match(shown[1], /^\d\d:\d\d · Mensaje 5$/);
  assert.equal(hermesHistoryText(false, history), '');
  h.update({ enabled: false, state: 'desactivado' });
  assert.equal(hermesHistoryText(true, h.runtime.history()), '');
  h.runtime.dispose();
});
