const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationChannel } = require('../.test-build/app/assistant/notification-channel.js');

function harness() {
  const sent = [];
  let confirmed, listener, cancelled = 0, allowed = true, busy = false;
  const presence = { connected: true, worn: true, charging: false, available: true };
  const host = { presence: () => presence, allowed: () => allowed, refresh() {},
    subscribe: cb => { listener = cb; return () => { listener = null; }; },
    present(text, cb) { if (busy) return null; confirmed = cb; return () => cancelled++; } };
  const channel = new NotificationChannel(frame => { sent.push(frame); return true; });
  return { channel, sent, host, presence, confirm: () => confirmed(), changed: () => listener(),
    cancelCount: () => cancelled, disable: () => { allowed = false; }, busy: () => { busy = true; },
    deliver(id = 'one') { channel.handle({ type: 'deliver', id, text: 'Aviso sintético' }); } };
}

test('new server receives state but an old server receives no presence or notifications', () => {
  const h = harness(); h.channel.connect(['chat'], h.host); h.deliver(); assert.equal(h.sent.length, 0);
  h.channel.connect(['notify/1'], h.host); assert.equal(h.sent[0].type, 'presence');
  h.channel.reset();
});

test('delivery waits for the captured BLE frame; duplicate IDs cannot paint twice', () => {
  const h = harness(); h.channel.connect(['notify/1'], h.host); h.deliver(); h.deliver();
  assert.equal(h.sent.filter(f => f.type === 'receipt').length, 0);
  h.confirm(); h.deliver();
  assert.deepEqual(h.sent.filter(f => f.type === 'receipt').map(f => f.presented), [true, true]);
  h.channel.reset();
});

test('removed, stale/unknown, charging, locked, disabled or busy glasses refuse delivery', () => {
  for (const patch of [{ worn: false }, { worn: null }, { connected: false }, { charging: true }, { available: false }]) {
    const h = harness(); h.channel.connect(['notify/1'], h.host); Object.assign(h.presence, patch); h.deliver();
    assert.equal(h.sent.at(-1).presented, false); h.channel.reset();
  }
  for (const mode of ['disable', 'busy']) {
    const h = harness(); h.channel.connect(['notify/1'], h.host); h[mode](); h.deliver();
    assert.equal(h.sent.at(-1).presented, false); h.channel.reset();
  }
});

test('removal, cancellation and disconnect invalidate an in-flight frame callback', () => {
  for (const mode of ['remove', 'cancel', 'reset']) {
    const h = harness(); h.channel.connect(['notify/1'], h.host); h.deliver();
    if (mode === 'remove') { h.presence.worn = false; h.changed(); }
    else if (mode === 'cancel') h.channel.handle({ type: 'cancel', id: 'one' });
    else h.channel.reset();
    h.confirm(); assert.equal(h.sent.some(f => f.presented === true), false);
    assert.equal(h.cancelCount(), 1); h.channel.reset();
  }
});
