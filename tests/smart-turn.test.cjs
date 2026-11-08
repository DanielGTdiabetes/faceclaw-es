const test = require('node:test');
const assert = require('node:assert/strict');
const { SmartTurnClient, smartTurnUrl } = require('../.test-build/app/conversation-detection/smart-turn.js');

function harness() {
  let now = 0, listener, queue = 0;
  const sent = [], events = [], ends = [], closed = [], listeners = [];
  const client = new SmartTurnClient({ now: () => now, connect(cb) { listener = cb; listeners.push(cb); return {
    sendText(text) { sent.push(JSON.parse(text)); return true; },
    sendBinary(pcm) { sent.push(pcm); return true; }, queuedBytes: () => queue,
    close(...args) { closed.push(args); },
  }; } });
  return { client, sent, events, ends, closed, connections: () => listeners.length,
    advance(ms) { now += ms; }, queue(value) { queue = value; },
    start() { client.start(speech => events.push(speech), verdict => ends.push(verdict)); listener.onTextMessage('{"type":"g2.ready","v":1}'); },
    event(value) { listener.onTextMessage(JSON.stringify(value)); }, old: () => listener,
    pcm(end = 50) { client.acceptPcm('NATIVE_PCM', end); } };
}

test('uses only the configured host and never accepts credential-bearing URLs', () => {
  assert.equal(smartTurnUrl('ws://100.93.23.103:18770/v1/audio/transcriptions/realtime'),
    'ws://100.93.23.103:18776/v1/audio/transcriptions/realtime');
  assert.equal(smartTurnUrl('wss://[::1]:2/a'), 'wss://[::1]:18776/v1/audio/transcriptions/realtime');
  for (const value of ['https://x', 'ws://user:pass@x', 'ws://x?a=b']) assert.equal(smartTurnUrl(value), null);
});

test('no PCM before ready; bounded verdict matches capture times and is invalidated by resumed speech', () => {
  const h = harness(); h.client.acceptPcm('PRIVATE_PCM', 50); assert.equal(h.sent.length, 0);
  h.start(); h.pcm(); assert.deepEqual(h.sent, [{ type: 'g2.reset', startMs: 0 }, 'NATIVE_PCM']);
  h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .8 });
  assert.equal(h.client.verdict(0, 50).probability, .8);
  assert.equal(h.client.verdict(30, 70), null);
  h.advance(50); h.pcm(100); h.event({ type: 'g2.speech', audioMs: 100 });
  assert.equal(h.client.verdict(0, 100), null);
  h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .8 });
  assert.equal(h.client.verdict(0, 100), null, 'older speech cannot end the new phrase');
});

test('gap, queue congestion, OFF and stale callbacks preserve fallback without replaying audio', () => {
  const h = harness(); h.start(); h.pcm(); const old = h.old();
  h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .8 });
  h.advance(300); assert.equal(h.client.verdict(0, 50), null);
  h.pcm(100); assert.deepEqual(h.sent[2], { type: 'g2.reset', startMs: 50 });
  h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .8 });
  assert.equal(h.client.verdict(0, 100), null);
  h.queue(16001); h.pcm(150); assert.equal(h.closed.length, 1);
  const count = h.sent.length; h.pcm(200); assert.equal(h.sent.length, count);
  h.client.stop(); old.onTextMessage('{"type":"g2.ready","v":1}'); h.pcm(250);
  assert.equal(h.sent.length, count);
});

test('malformed/future/out-of-range verdicts cannot accelerate a request', () => {
  const h = harness(); h.start(); h.pcm();
  for (const patch of [{ audioMs: 51 }, { probability: 2 }, { probability: 'PRIVATE' }, { speechMs: -1 },
    { speechMs: 51 }, { audioMs: 'PRIVATE' }, { probability: {} }]) {
    h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .8, ...patch });
    assert.equal(h.client.verdict(0, 50), null);
  }
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.ends, []);
});

test('a validated end notifies the close hook and OFF cancels it', () => {
  const h = harness(); h.start(); h.pcm();
  h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .87 });
  assert.deepEqual(h.ends, [{ audioMs: 50, speechMs: 20, probability: .87 }]);
  h.client.stop();
  h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .9 });
  assert.equal(h.ends.length, 1);
});

test('synchronous connection failure cannot resurrect a native socket', () => {
  let closed = 0, sent = 0;
  const client = new SmartTurnClient({ now: () => 0, connect(listener) {
    listener.onFailure();
    return { close() { closed++; }, sendText() { sent++; return true; }, sendBinary() { sent++; return true; } };
  } });
  client.start(() => {}); client.acceptPcm('pcm', 50);
  assert.equal(closed, 1); assert.equal(sent, 0);
});

test('closed, failed and congested streams reconnect from fresh PCM without another start', () => {
  for (const failure of ['onClosed', 'onFailure', 'queue']) {
    const h = harness(); h.start(); h.pcm(); const old = h.old();
    h.event({ type: 'g2.turn_end', audioMs: 50, speechMs: 20, probability: .8 });
    if (failure === 'queue') { h.queue(16001); h.pcm(100); h.queue(0); }
    else old[failure]();
    assert.equal(h.client.available(), false);
    assert.equal(h.client.verdict(0, 100), null);
    const count = h.sent.length;
    h.advance(999); h.pcm(150); assert.equal(h.connections(), 1);
    h.advance(1); h.pcm(200); assert.equal(h.connections(), 2);
    assert.equal(h.sent.length, count, 'no replay or PCM before the new handshake');
    old.onTextMessage('{"type":"g2.ready","v":1}'); old.onFailure(); old.onClosed();
    assert.equal(h.client.available(), false);
    h.event({ type: 'g2.ready', v: 1 }); h.pcm(250);
    assert.deepEqual(h.sent.slice(count), [{ type: 'g2.reset', startMs: 200 }, 'NATIVE_PCM']);
    h.event({ type: 'g2.turn_end', audioMs: 250, speechMs: 220, probability: .9 });
    assert.equal(h.client.verdict(200, 250).probability, .9);
    h.client.stop(); h.advance(2000); h.pcm(300);
    assert.equal(h.connections(), 2, 'OFF cancels recovery');
  }
});

test('null, thrown and synchronous connection failures retry at most once a second until OFF', () => {
  for (const failure of ['null', 'throw', 'callback']) {
    let now = 0, connections = 0;
    const client = new SmartTurnClient({ now: () => now, connect(listener) {
      connections++;
      if (failure === 'throw') throw new Error('unavailable');
      if (failure === 'callback') listener.onFailure();
      return null;
    } });
    client.start(() => {});
    for (now = 50; now < 1000; now += 50) client.acceptPcm('pcm', now);
    assert.equal(connections, 1);
    client.acceptPcm('pcm', now); assert.equal(connections, 2);
    client.stop(); now += 2000; client.acceptPcm('pcm', now);
    assert.equal(connections, 2);
    client.start(() => {}); assert.equal(connections, 3, 'explicit ON starts immediately');
  }
});

test('a connection without a ready handshake expires and cannot block subsequent recovery', () => {
  const h = harness(); h.client.start(() => {}); const old = h.old();
  h.advance(3000); h.pcm(); assert.equal(h.closed.length, 1);
  h.advance(1000); h.pcm(100); assert.equal(h.connections(), 2);
  old.onTextMessage('{"type":"g2.ready","v":1}'); assert.equal(h.client.available(), false);
  h.event({ type: 'g2.ready', v: 1 }); h.pcm(150);
  assert.deepEqual(h.sent, [{ type: 'g2.reset', startMs: 100 }, 'NATIVE_PCM']);
});
