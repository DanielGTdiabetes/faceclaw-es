const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const { ConversationEpisodeTracker } = require('../.test-build/app/conversation-detection/conversation-episodes.js');

function harness() {
  let now = 1000, accept = true, throws = false;
  const timers = new Set(), frames = [], results = [];
  const channel = new ConversationChannel({ now: () => now,
    send(frame) { if (throws) throw Error('transport'); frames.push(JSON.parse(JSON.stringify(frame))); return accept; },
    after(cb, ms) { const timer = { cb, deadline: now + ms }; timers.add(timer); return () => timers.delete(timer); } });
  const tracker = new ConversationEpisodeTracker(() => now,
    { candidateMs: 15_000, silenceMs: 30_000, maxTurns: 12, maxChars: 6000 });
  tracker.start('s1', 1);
  tracker.association({ sessionId: 's1', streamId: 1, version: 1, kind: 'manual', speaker: '1' });
  let seq = 0;
  function turn(speaker) { return { v: 1, sessionId: 's1', streamId: 1, seq: ++seq, engine: 'soniox', speaker,
    relation: speaker === '1' ? 'portador' : 'otro', associationVersion: 1, text: 'Texto sintético',
    timing: 'valido', startMs: seq * 1000, endMs: seq * 1000 + 500, closedBy: 'endpoint' }; }
  tracker.accept(turn('1')); tracker.accept(turn('2'));
  const context = tracker.assessmentContext();
  const request = (mode = 'assess', cb = r => results.push(r)) => channel.request(context, mode, 5000, cb);
  const reply = (patch = {}, frame = frames.findLast(f => f.type === 'assess' || f.type === 'assist')) =>
    channel.handle({ chan: 'conv', type: 'result', requestId: frame.requestId, ref: frame.ref,
      mode: frame.type, verdict: 'tema', ...patch });
  return { channel, tracker, frames, results, timers, context, request, reply, turn,
    ready() { channel.negotiate(['chat', 'mcp', 'conv/1']); channel.setEnabled(true); },
    advance(ms, runTimers = true) { now += ms; if (runTimers) for (const timer of [...timers]) {
      if (now >= timer.deadline) timer.cb();
    } }, reject() { accept = false; }, throwSend() { throws = true; } };
}

test('old bridge, malformed capability and capability without explicit ON send no text', () => {
  const h = harness();
  for (const caps of [undefined, {}, 'conv/1', ['chat', 'mcp']]) {
    h.channel.negotiate(caps);
    assert.equal(h.channel.setEnabled(true), false);
    assert.equal(h.request(), false);
  }
  h.channel.negotiate(['conv/1']);
  assert.equal(h.request(), false);
  assert.equal(h.frames.length, 0);
});

test('assessment sends only bounded text and attribution on conv, with no profile/audio/chat context', () => {
  const h = harness(); h.ready(); assert.equal(h.request(), true);
  assert.equal(h.frames[0].chan, 'conv'); assert.equal(h.frames[0].type, 'assess');
  assert.deepEqual(Object.keys(h.frames[0]).sort(), ['chan', 'type', 'requestId', 'ref', 'timeoutMs', 'turns'].sort());
  assert.deepEqual(Object.keys(h.frames[0].turns[0]).sort(), ['seq', 'speaker', 'relation', 'text', 'startMs', 'endMs'].sort());
  h.context.ref.revision = 99;
  h.reply(); assert.equal(h.results[0].ref.revision, 4);
  assert.equal(h.timers.size, 0);
});

test('courtesy and uncertainty are structured verdicts, never messages', () => {
  for (const verdict of ['cortesia', 'incierto']) {
    const h = harness(); h.ready(); h.request(); h.reply({ verdict });
    assert.equal(h.tracker.assess(h.results[0].ref, h.results[0].verdict), true);
    assert.equal(h.tracker.confirmedContext(), null);
  }
});

test('owner keeps a late tema but refuses a late dismissal when newer text has changed the episode', () => {
  const h = harness(); h.ready(); h.request(); h.tracker.accept(h.turn('1')); h.reply();
  assert.equal(h.tracker.assess(h.results[0].ref, 'cortesia'), false);
  assert.equal(h.tracker.assess(h.results[0].ref, 'tema'), true);
});

test('every reference coordinate and request id must match; chat/mcp frames cannot satisfy conv', () => {
  for (const patch of [{ chan: 'chat' }, { chan: 'mcp' }, { requestId: 'wrong' },
    ...['sessionId', 'streamId', 'associationVersion', 'episodeId', 'revision'].map(key => ({ key }))]) {
    const h = harness(); h.ready(); h.request();
    h.reply(patch.key ? { ref: { ...h.context.ref, [patch.key]: keyValue(patch.key) } } : patch);
    assert.equal(h.results.length, 0);
    h.reply(); assert.equal(h.results.length, 1);
  }
});
function keyValue(key) { return key === 'sessionId' ? 'old' : 999; }

test('OFF, disconnect, normal chat, replacement and timeout cancel only conv and deliver once', () => {
  for (const reason of ['off', 'reset', 'chat', 'replace', 'timeout']) {
    const h = harness(); h.ready(); h.request(); const old = h.frames[0];
    if (reason === 'off') h.channel.setEnabled(false);
    if (reason === 'reset') h.channel.reset();
    if (reason === 'chat') h.channel.setChatActive(true);
    if (reason === 'replace') h.request();
    if (reason === 'timeout') h.advance(5000);
    assert.deepEqual(h.results, [null], reason);
    h.reply({}, old); assert.deepEqual(h.results, [null], reason);
    assert.ok(h.frames.every(frame => frame.chan === 'conv'));
    if (reason !== 'reset') assert.equal(h.frames[1].type, 'cancel');
    h.channel.cancel(); h.channel.cancel();
    assert.equal(h.timers.size, 0);
  }
});

test('deadline is checked when receiving, even if the timeout callback was delayed', () => {
  const h = harness(); h.ready(); h.request(); h.advance(5000, false); h.reply();
  assert.deepEqual(h.results, [null]); assert.equal(h.timers.size, 0);
});

test('reconnection never re-enables or replays; a normal chat blocks new evaluations', () => {
  const h = harness(); h.ready(); h.request(); const old = h.frames[0];
  h.channel.reset(); h.channel.negotiate(['conv/1']);
  assert.equal(h.request(), false); h.channel.setEnabled(true);
  h.channel.setChatActive(true); assert.equal(h.request(), false);
  h.channel.setChatActive(false); h.request();
  assert.notEqual(old.requestId, h.frames.at(-1).requestId);
  h.reply({}, old); assert.deepEqual(h.results, [null]); h.reply(); assert.equal(h.results.length, 2);
});

test('bad verdicts, oversized or empty answers and errors abstain without exposing remote details', () => {
  for (const patch of [{ verdict: 'unknown' }, { type: 'error', message: 'private provider detail' }]) {
    const h = harness(); h.ready(); h.request(); h.reply(patch); assert.deepEqual(h.results, [null]);
  }
  for (const patch of [{ kind: 'mensaje', text: '' }, { kind: 'mensaje', text: 'x'.repeat(1201) },
    { kind: 'tool', text: 'action' }]) {
    const h = harness(); h.ready(); h.request('assist'); h.reply(patch); assert.deepEqual(h.results, [null]);
  }
});

test('only a final message is deliverable; nada is silent, streaming and tool events are ignored', () => {
  const h = harness(); h.ready(); h.request('assist');
  h.reply({ type: 'text-delta', text: 'thinking' }); h.reply({ type: 'tool-activity', text: 'tool' });
  assert.equal(h.results.length, 0);
  h.reply({ kind: 'mensaje', text: '  Una idea útil  ' }); assert.equal(h.results[0].text, 'Una idea útil');
  h.request('assist'); h.reply({ kind: 'nada', text: 'must not display' }); assert.equal(h.results[1].text, null);
});

test('send rejection, native exception and throwing owner never escape socket callbacks', () => {
  for (const fail of ['reject', 'throwSend']) {
    const h = harness(); h.ready(); h[fail](); assert.equal(h.request(), false);
    assert.deepEqual(h.results, [null]); assert.equal(h.timers.size, 0);
  }
  const h = harness(); h.ready(); h.request('assess', () => { throw Error('owner'); });
  assert.doesNotThrow(() => h.reply()); assert.equal(h.timers.size, 0);
});

test('reentrant cancellation that turns OFF prevents replacement from sending text', () => {
  const h = harness(); h.ready(); h.request('assess', () => h.channel.setEnabled(false));
  assert.equal(h.request(), false); assert.equal(h.frames.filter(f => f.type === 'assess').length, 1);
});

test('invalid context, timing, attribution, excessive text or deadlines never reach transport', () => {
  for (const mutate of [c => { c.ref.streamId = 0; }, c => { c.turns[1].seq = 1; },
    c => { c.turns[1].relation = 'desconocido'; }, c => { c.turns[0].endMs = -1; },
    c => { c.turns[0].text = 'x'.repeat(6001); }, c => { c.turns[0].timing = 'parcial'; },
    c => { c.turns[0].closedBy = 'frontera'; }, c => { c.turns[0].speaker = null; },
    c => { c.turns[1].speaker = c.turns[0].speaker; }]) {
    const h = harness(); h.ready(); mutate(h.context); assert.equal(h.request(), false); assert.equal(h.frames.length, 0);
  }
  for (const deadline of [0, -1, Infinity, NaN, 30_001]) {
    const h = harness(); h.ready(); assert.equal(h.channel.request(h.context, 'assess', deadline, () => {}), false);
    assert.equal(h.frames.length, 0);
  }
});
