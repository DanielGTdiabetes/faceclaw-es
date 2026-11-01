const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

function sessionHarness() {
  let cb;
  const events = [];
  const load = loader({ Date, Math, Map, Set, JSON }, {
    '../prompts': {},
    './bridge-client': { assistantBridge: { sendUtterance(_text, _ctx, callbacks) { cb = callbacks; return { cancel() {} }; } } },
    './audio-priority': { assistantAudioPriority: { setActive() {} } },
    './direct-backend': { DirectAssistantBackend: class {} }, './tool-registry': { toolRegistry: {} },
  });
  const { AssistantSession } = load('app/assistant/session.ts');
  const session = new AssistantSession({ kind: 'external', bridge: { host: 'test', port: 1, token: 'test' } });
  session.sendUtterance('hello', {}, {
    onTextDelta: (_d, full) => events.push(['text', full]),
    onToolActivity: name => events.push(['tool', name]),
    onTurnDone: () => events.push(['done']), onError: e => events.push(['error', e]),
  });
  return { session, events, cb };
}

test('assistant buffers provisional text outside the visible transcript and publishes final once', () => {
  const h = sessionHarness();
  h.cb.onTextDelta('private reasoning', 'private reasoning');
  h.cb.onToolActivity('skills/glasses');
  assert.equal(h.session.transcript.at(-1).text, '');
  assert.deepEqual(h.events, []);
  assert.ok(!h.session.status.includes('glasses'));
  h.cb.onTextDelta('Final response', 'Final response');
  h.cb.onTurnDone({ stopReason: 'end_turn' });
  assert.deepEqual(h.events, [['text', 'Final response'], ['done']]);
  assert.equal(h.session.transcript.at(-1).text, 'Final response');
});

test('assistant failure preserves the error and never publishes provisional text', () => {
  const h = sessionHarness();
  h.cb.onTextDelta('private', 'private');
  h.cb.onError('Reconnect your account');
  assert.deepEqual(h.events, [['error', 'Reconnect your account']]);
  assert.equal(h.session.transcript.at(-1).text, '');
  h.cb.onTextDelta('late', 'late');
  assert.equal(h.session.transcript.at(-1).text, '');
});

function channelHarness() {
  const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
  let now = 100;
  const frames = [], results = [], progress = [], timers = new Set();
  const channel = new ConversationChannel({ now: () => now,
    send(f) { frames.push(f); return true; },
    after(cb, ms) { const t = { cb, at: now + ms }; timers.add(t); return () => timers.delete(t); } });
  const ref = { sessionId: 's1', streamId: 1, associationVersion: 0, episodeId: 1, revision: 1 };
  const context = { ref, modality: 'identidad-opcional', turns: [
    { v: 1, sessionId: 's1', streamId: 1, associationVersion: 0, engine: 'soniox', timing: 'valido', closedBy: 'endpoint',
      seq: 1, speaker: null, relation: 'desconocido', text: 'Ey Even, qué hora es', startMs: 0, endMs: 1000 },
  ] };
  channel.negotiate(['conv/1', 'conv/2', 'conv/progress/1']);
  channel.setEnabled(true);
  assert.equal(channel.request(context, 'assist', 5000, r => results.push(r), p => progress.push(p)), true);
  const frame = frames[0];
  return { channel, frames, results, progress, timers,
    send(f) { channel.handle({ chan: 'conv', requestId: frame.requestId, ref: frame.ref, ...f }); },
    expireWithoutTimer() { now += 5001; },
    expire() { now += 5001; for (const t of [...timers]) if (t.at <= now) t.cb(); } };
}

test('conversation status is correlated, contains no tool label and final clears it', () => {
  const h = channelHarness();
  h.send({ type: 'status', status: 'working', requestId: 'stale' });
  assert.deepEqual(h.progress, []);
  h.send({ type: 'status', status: 'working', label: 'skills/private' });
  h.send({ type: 'status', status: 'working' });
  assert.deepEqual(h.progress, [true]);
  h.send({ type: 'result', mode: 'assist', kind: 'mensaje', text: 'Resultado' });
  assert.deepEqual(h.progress, [true, false]);
  assert.equal(h.results[0].text, 'Resultado');
  assert.equal(h.timers.size, 0);
});

test('actionable error is visible without exposing raw server details', () => {
  const h = channelHarness();
  h.send({ type: 'status', status: 'working' });
  h.send({ type: 'error', message: 'secret/raw stack', attention: true });
  assert.match(h.results[0].text, /comprueba su resultado/);
  assert.ok(!h.results[0].text.includes('secret'));
  assert.deepEqual(h.progress, [true, false]);
});

test('ambient failure remains silent', () => {
  const h = channelHarness();
  h.send({ type: 'error', message: 'private' });
  assert.equal(h.results[0], null);
  assert.deepEqual(h.progress, []);
});

test('explicit timeout stops indicator and warns about uncertain effects', () => {
  const h = channelHarness();
  h.send({ type: 'status', status: 'working' });
  h.expire();
  assert.match(h.results[0].text, /tiempo de espera/);
  assert.equal(h.frames.at(-1).type, 'cancel');
  assert.deepEqual(h.progress, [true, false]);
});

test('delayed timeout callback cannot turn an expired explicit result into silent cancellation', () => {
  const h = channelHarness();
  h.send({ type: 'status', status: 'working' }); h.expireWithoutTimer();
  h.send({ type: 'result', mode: 'assist', kind: 'mensaje', text: 'too late' });
  assert.match(h.results[0].text, /tiempo de espera/);
  assert.deepEqual(h.progress, [true, false]);
});

for (const action of ['cancel', 'reset']) test(`conversation ${action} clears indicator and discards a late response`, () => {
  const h = channelHarness();
  h.send({ type: 'status', status: 'working' });
  h.channel[action]();
  h.send({ type: 'result', mode: 'assist', kind: 'mensaje', text: 'late' });
  assert.deepEqual(h.progress, [true, false]);
  assert.deepEqual(h.results, [null]);
  assert.equal(h.timers.size, 0);
});

test('assistant dots animate locally and stop on removal and on error', () => {
  const timers = new Map(), paints = [];
  let next = 0;
  const load = loader({ setTimeout(cb) { timers.set(++next, cb); return next; }, clearTimeout(id) { timers.delete(id); } }, {
    './input-dialog': { createInputDialogMenu: () => ({ select() {}, setItems() {} }), paintInputDialog: (_image, o) => paints.push(o) },
    '../gestures': { GESTURE_DOUBLE_CLICK: 'double' },
  });
  const { AssistantLayer } = load('app/ui/shell/assistant.ts');
  const l = new AssistantLayer({ requestRender() {} }, {});
  l.startTurn(); l.onToolActivity('glasses'); l.paint({}, () => ({}));
  assert.equal(paints.at(-1).status, '.'); assert.equal(timers.size, 1);
  const [id, cb] = timers.entries().next().value; timers.delete(id); cb();
  l.paint({}, () => ({})); assert.equal(paints.at(-1).status, '..');
  l.onError('Permiso necesario'); assert.equal(timers.size, 0);
  l.paint({}, () => ({})); assert.equal(paints.at(-1).status, 'Permiso necesario');
  l.startTurn(); l.paint({}, () => ({})); assert.equal(timers.size, 1);
  l.onRemoved(); assert.equal(timers.size, 0);
});
