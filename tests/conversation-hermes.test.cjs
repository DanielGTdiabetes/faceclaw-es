const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const { ConversationHermesRuntime } = require('../.test-build/app/conversation-detection/conversation-hermes.js');

function harness(policy = { candidateMs: 15000, silenceMs: 30000, maxTurns: 12, maxChars: 6000 }) {
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
    begin(budget) { channel.negotiate(['conv/1']); runtime.begin(budget); state.enabled = true; state.state = 'escuchando'; notify(); association(); },
    update(patch) { Object.assign(state, patch); notify(); },
    candidate() { turn('1'); turn('2'); advance(2000); },
    deliver() { this.begin(); this.candidate(); this.reply('assess'); this.reply('assist'); },
    /** Advance in 500 ms runtime ticks. */
    ticks(ms) { for (let t = 0; t < ms; t += 500) advance(500); },
    sent: () => frames.filter(f => f.type === 'assess' || f.type === 'assist') };
}

test('explicit ON and capability are required; constructor/restore cannot start evaluation or capture', () => {
  const h = harness(); h.association(); h.turn('1'); h.turn('2'); h.advance(3000);
  assert.equal(h.frames.length, 0); assert.equal(h.runtime.begin(), false); assert.equal(h.state.enabled, false);
  h.runtime.dispose(); assert.equal(h.timers.size, 0);
});

test('a long manual session continues after eight requests with its own bounded budget', () => {
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

test('normal chat suspends evaluation and resumes with new context; disconnect cannot auto-enable', () => {
  const h = harness(); h.begin(); h.candidate(); h.channel.setChatActive(true);
  h.update({ state: 'suspendido' }); h.advance(1000);
  assert.equal(h.runtime.snapshot().enabled, true);
  h.channel.setChatActive(false); h.update({ state: 'escuchando' }); h.turn('1'); h.turn('2'); h.advance(5000);
  assert.equal(h.sent().length, 2); assert.equal(h.runtime.snapshot().enabled, true);
  h.channel.reset(); h.advance(500); assert.equal(h.runtime.snapshot().enabled, false);
  h.channel.negotiate(['conv/1']); h.turn('1'); h.turn('2'); h.advance(5000);
  assert.equal(h.sent().length, 2); h.runtime.dispose(); assert.equal(h.timers.size, 0);
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
