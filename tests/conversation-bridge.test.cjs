const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const channelModule = require('../.test-build/app/assistant/conversation-channel.js');

function harness() {
  let now = 1000;
  const timers = new Set(), sockets = [], exports = {};
  const deps = {
    './mcp-server': { AssistantMcpServer: class { sendToolsChanged() {} handleMessage() {} } },
    './tool-registry': { toolRegistry: { onToolsChanged: () => () => {} } },
    './conversation-channel': channelModule,
  };
  const source = fs.readFileSync('app/assistant/bridge-client.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, console, global: { isAndroid: true },
    android: { os: { SystemClock: { elapsedRealtime: () => now } } },
    setTimeout: cb => { timers.add(cb); return cb; }, clearTimeout: cb => timers.delete(cb),
    require(name) { assert.ok(name in deps, name); return deps[name]; },
    com: { faceclaw: { app: {
      FaceclawWebSocketListener: class { constructor(listener) { return listener; } },
      FaceclawWebSocket: class {
        constructor(url, listener) { this.listener = listener; this.frames = []; this.accept = true; sockets.push(this); }
        sendText(text) { this.frames.push(JSON.parse(text)); return this.accept; }
        close() {}
      },
    } } },
  });
  const bridge = new exports.AssistantBridgeClient();
  bridge.configure({ host: 'test.invalid', port: 8791, token: 'synthetic-token', deviceName: 'fixture', allowProactive: () => false });
  const socket = sockets.at(-1);
  socket.listener.onOpen();
  function message(frame) { socket.listener.onTextMessage(JSON.stringify(frame)); }
  function ack(capabilities) { message({ chan: 'ctl', type: 'hello-ack', capabilities }); }
  const ref = { sessionId: 's', streamId: 1, associationVersion: 1, episodeId: 1, revision: 1 };
  const context = { ref, turns: ['portador', 'otro'].map((relation, i) => ({ v: 1, sessionId: 's', streamId: 1,
    seq: i + 1, engine: 'soniox', speaker: String(i + 1), relation, associationVersion: 1,
    text: 'Texto sintético', timing: 'valido', startMs: i * 1000, endMs: i * 1000 + 500, closedBy: 'endpoint' })) };
  const results = [], chat = [];
  const callbacks = { onTextDelta: (delta, text) => chat.push(text), onToolActivity() {}, onTurnDone() {}, onError() {} };
  return { bridge, socket, message, ack, timers, results, chat, callbacks,
    ready() { ack(['chat', 'mcp', 'conv/1']); bridge.conversation.setEnabled(true); },
    request() { return bridge.conversation.request(context, 'assess', 5000, r => results.push(r)); },
    reply() { const request = socket.frames.findLast(f => f.type === 'assess');
      message({ chan: 'conv', type: 'result', mode: 'assess', requestId: request.requestId, ref: request.ref, verdict: 'tema' }); },
  };
}

test('hello advertises client support but an old server cannot opt in or receive text', () => {
  const h = harness(); assert.ok(h.socket.frames[0].capabilities.includes('conv/1'));
  h.ack(['chat', 'mcp']); assert.equal(h.bridge.conversation.setEnabled(true), false);
  assert.equal(h.request(), false); assert.equal(h.socket.frames.filter(f => f.chan === 'conv').length, 0);
  h.bridge.stop(); assert.equal(h.timers.size, 0);
});

test('real bridge routes conv replies to their owner without chat transcript or callbacks', () => {
  const h = harness(); h.ready(); assert.equal(h.request(), true); h.reply();
  assert.equal(h.results[0].verdict, 'tema'); assert.deepEqual(h.chat, []);
  h.bridge.stop(); assert.equal(h.timers.size, 0);
});

test('a normal utterance cancels conv first; conv cannot supersede active chat', () => {
  const h = harness(); h.ready(); h.request();
  h.bridge.sendUtterance('Petición sintética', {}, h.callbacks);
  const cancelIndex = h.socket.frames.findIndex(f => f.chan === 'conv' && f.type === 'cancel');
  const chatIndex = h.socket.frames.findIndex(f => f.chan === 'chat' && f.type === 'utterance');
  assert.ok(cancelIndex >= 0 && cancelIndex < chatIndex); assert.deepEqual(h.results, [null]);
  assert.equal(h.request(), false);
  h.reply(); assert.deepEqual(h.results, [null]);
  const utterance = h.socket.frames[chatIndex];
  h.message({ chan: 'chat', type: 'text-delta', turnId: utterance.turnId, text: 'Respuesta normal' });
  h.message({ chan: 'chat', type: 'turn-done', turnId: utterance.turnId });
  assert.deepEqual(h.chat, ['Respuesta normal']); assert.equal(h.request(), true);
  h.bridge.stop(); assert.equal(h.timers.size, 0);
});

test('socket disconnect clears pending conv and old consent without replay on hello-ack', () => {
  const h = harness(); h.ready(); h.request(); h.socket.listener.onFailure('synthetic failure');
  assert.deepEqual(h.results, [null]); assert.equal(h.request(), false);
  h.ack(['chat', 'mcp', 'conv/1']); assert.equal(h.request(), false);
  h.reply(); assert.deepEqual(h.results, [null]); h.bridge.stop(); assert.equal(h.timers.size, 0);
});

test('the native sendText false result is treated as a failed conversation send', () => {
  const h = harness(); h.ready(); h.socket.accept = false;
  assert.equal(h.request(), false); assert.deepEqual(h.results, [null]); assert.equal(h.timers.size, 0);
  h.bridge.stop();
});

test('socket loss keeps the destination; stop, reconfigure and ctl errors revoke it', () => {
  const h = harness(); h.ready();
  const start = h.bridge.conversation.destination();
  h.socket.listener.onClosed(1006, '');
  assert.equal(h.bridge.conversation.isEnabled(), false);
  assert.equal(h.bridge.conversation.destination(), start, 'a plain loss may resume');
  h.message({ chan: 'ctl', type: 'error', message: 'invalid token' });
  h.bridge.stop();
  assert.ok(h.bridge.conversation.destination() > start);
  const g = harness(); g.ready(); const before = g.bridge.conversation.destination();
  g.message({ chan: 'ctl', type: 'error', message: 'invalid token' });
  assert.ok(g.bridge.conversation.destination() > before, 'auth error never resumes');
  g.bridge.stop();
});

test('callbacks from a replaced socket are ignored after reconnecting', () => {
  const h = harness(); h.ready();
  const old = h.socket;
  old.listener.onClosed(1006, '');
  for (const cb of [...h.timers]) { h.timers.delete(cb); cb(); }
  // The reconnect timer dialed a new socket; the old listener must no longer reach the client.
  old.listener.onTextMessage(JSON.stringify({ chan: 'ctl', type: 'hello-ack', capabilities: ['chat', 'mcp', 'conv/1'] }));
  assert.equal(h.bridge.conversation.isSupported(), false, 'stale hello-ack ignored');
  old.listener.onClosed(1000, 'late');
  assert.notEqual(h.bridge.state().status, 'Connection closed (1000: late)');
  h.bridge.stop();
});
