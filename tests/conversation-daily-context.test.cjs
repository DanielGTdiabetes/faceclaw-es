const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');

const context = { ref: { sessionId: 's', streamId: 1, associationVersion: 0, episodeId: 1, revision: 1 },
  modality: 'identidad-opcional',
  turns: [{ v: 1, sessionId: 's', streamId: 1, associationVersion: 0, engine: 'soniox', timing: 'valido',
    seq: 1, speaker: null, relation: 'desconocido', text: 'Máquina X descartada.', startMs: 0, endMs: 1000, closedBy: 'endpoint' }] };
function harness(extra = []) {
  const frames = [], timers = new Set();
  const channel = new ConversationChannel({ now: () => 1000, send: f => { frames.push(f); return true; },
    after: cb => { timers.add(cb); return () => timers.delete(cb); } });
  channel.negotiate(['conv/1', 'conv/2', ...extra]);
  return { channel, frames, timers };
}
test('daily context needs capability and separate OFF-only opt-in', () => {
  let h = harness();
  assert.equal(h.channel.setDailyContextEnabled(true), false);
  h.channel.setEnabled(true); h.channel.request(context, 'assess', 5000, () => {});
  assert.equal('dailyContext' in h.frames[0], false);
  h = harness(['conv/daily-context/1']);
  h.channel.setEnabled(true); h.channel.request(context, 'assist', 5000, () => {});
  assert.equal('dailyContext' in h.frames[0], false);
  assert.equal(h.channel.setDailyContextEnabled(true), false);
  h.channel.setEnabled(false);
  assert.equal(h.channel.setDailyContextEnabled(true), true);
  h.channel.setEnabled(true); h.channel.request(context, 'assess', 5000, () => {});
  assert.equal(h.frames.at(-1).dailyContext, true);
});
test('reset/reconnect revokes daily consent and never replays a request', () => {
  const h = harness(['conv/daily-context/1']);
  h.channel.setDailyContextEnabled(true); h.channel.setEnabled(true);
  h.channel.request(context, 'assist', 5000, () => {});
  h.channel.reset(); h.channel.negotiate(['conv/1', 'conv/2', 'conv/daily-context/1']);
  h.channel.setEnabled(true); h.channel.request(context, 'assist', 5000, () => {});
  assert.equal('dailyContext' in h.frames.at(-1), false);
});
test('Forget requires OFF, is correlated and blocks ON until acknowledgement', () => {
  const h = harness(['conv/daily-context/1']), results = [];
  h.channel.setEnabled(true);
  assert.equal(h.channel.forgetDailyContext(ok => results.push(ok)), false);
  h.channel.setEnabled(false);
  assert.equal(h.channel.forgetDailyContext(ok => results.push(ok)), true);
  assert.equal(h.channel.forgetDailyContext(() => {}), false);
  assert.equal(h.channel.setEnabled(true), false);
  h.channel.handle({ chan: 'conv', type: 'daily-context-cleared', requestId: 'wrong', ok: true });
  assert.deepEqual(results, []);
  h.channel.handle({ chan: 'conv', type: 'daily-context-cleared', requestId: h.frames.at(-1).requestId, ok: true });
  assert.deepEqual(results, [true]); assert.equal(h.timers.size, 0);
  assert.equal(h.channel.setEnabled(true), true);
});
test('Forget timeout/disconnect cannot claim deletion and cleans timers', () => {
  for (const disconnect of [false, true]) {
    const h = harness(['conv/daily-context/1']), results = [];
    h.channel.forgetDailyContext(ok => results.push(ok));
    const frame = h.frames.at(-1);
    if (disconnect) h.channel.reset(); else for (const cb of [...h.timers]) cb();
    h.channel.handle({ chan: 'conv', type: 'daily-context-cleared', requestId: frame.requestId, ok: true });
    assert.deepEqual(results, [false]); assert.equal(h.timers.size, 0);
  }
});
test('RAM selection never starts audio and is frozen while ON', () => {
  let enabled = false, starts = 0;
  controls.bindConversationSession({ detector: { snapshot: () => ({ enabled }) }, setEnabled: () => starts++ });
  controls.setConversationDailyContextSelected(false);
  controls.setConversationDailyContextSelected(true);
  assert.equal(controls.conversationDailyContextSelected(), true);
  enabled = true; controls.setConversationDailyContextSelected(false);
  assert.equal(controls.conversationDailyContextSelected(), true);
  enabled = false; controls.setConversationDailyContextSelected(false);
  assert.equal(starts, 0);
});
