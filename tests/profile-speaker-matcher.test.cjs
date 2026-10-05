const test = require('node:test');
const assert = require('node:assert/strict');
const { ProfileSpeakerMatcher } = require('../.test-build/app/conversation-detection/profile-speaker-matcher.js');

function harness() {
  const events = [];
  const matcher = new ProfileSpeakerMatcher((wearer, others) => events.push({ wearer, others }));
  let seq = 0;
  return { matcher, events, segment(start, speaker = '1', similarity = 0.9, extras = []) {
    matcher.token(speaker, start + 200, start + 3200);
    for (const t of extras) matcher.token(...t);
    matcher.accept({ seq: ++seq, startMs: start, endMs: start + 4000, voicedMs: 3000, similarity });
    matcher.finalized(start + 4000);
  } };
}

test('two disjoint finalized profile matches identify wearer; two nonmatches establish another label', () => {
  const h = harness(); h.segment(0); assert.equal(h.events.at(-1).wearer, null);
  h.segment(4000); assert.deepEqual(h.events.at(-1), { wearer: '1', others: [] });
  h.segment(8000, '2', 0.4); assert.deepEqual(h.events.at(-1), { wearer: '1', others: [] });
  h.segment(12000, '2', 0.4); assert.deepEqual(h.events.at(-1), { wearer: '1', others: ['2'] });
});

test('no association before final progress covers the full segment, irrespective of result order', () => {
  const h = harness(); h.segment(0);
  h.matcher.accept({ seq: 2, startMs: 4000, endMs: 8000, voicedMs: 3000, similarity: 0.9 });
  h.matcher.token('1', 4200, 7200); h.matcher.finalized(7999);
  assert.equal(h.events.at(-1).wearer, null);
  h.matcher.finalized(8000); assert.equal(h.events.at(-1).wearer, '1');
});

test('mixed, overlapping, unlabeled and sparsely timed audio never proves a wearer', () => {
  for (const extras of [[['2', 1000, 1500]], [[null, 1500, 1700]]]) {
    const h = harness(); h.segment(0, '1', 0.99, extras); h.segment(4000);
    assert.ok(h.events.every(e => !e.wearer));
  }
  const h = harness();
  for (let seq = 1; seq <= 2; seq++) {
    const startMs = (seq - 1) * 4000;
    h.matcher.token('1', startMs, startMs + 100);
    h.matcher.accept({ seq, startMs, endMs: startMs + 4000, voicedMs: 3000, similarity: 0.9 });
    h.matcher.finalized(startMs + 4000);
  }
  assert.ok(h.events.every(e => !e.wearer));
});

test('duplicate and overlapping segments cannot manufacture two votes; malformed evidence abstains', () => {
  const h = harness(); h.segment(0);
  for (const match of [
    { seq: 1, startMs: 0, endMs: 4000, voicedMs: 3000, similarity: 0.9 },
    { seq: 2, startMs: 1000, endMs: 4000, voicedMs: 3000, similarity: 0.9 },
    { seq: 3, startMs: 4000, endMs: 8000, voicedMs: 3000, similarity: NaN },
    { seq: 4, startMs: 4000, endMs: 8000, voicedMs: 5000, similarity: 0.9 },
  ]) h.matcher.accept(match);
  h.matcher.finalized(8000); assert.ok(h.events.every(e => !e.wearer));
});

test('uncertainty, contradictory matches and a second possible wearer retire attribution', () => {
  const h = harness(); h.segment(0); h.segment(4000);
  h.segment(8000, '1', 0.7); assert.equal(h.events.at(-1).wearer, null);
  h.segment(12000); h.segment(16000); assert.equal(h.events.at(-1).wearer, '1');
  h.segment(20000, '2'); h.segment(24000, '2'); assert.equal(h.events.at(-1).wearer, null);
});

test('gaps erase votes and reject old evidence; stale votes do not combine across a long pause', () => {
  const h = harness(); h.segment(0); h.matcher.reset(4000);
  h.matcher.accept({ seq: 2, startMs: 0, endMs: 4000, voicedMs: 3000, similarity: 0.9 });
  h.segment(4000); assert.equal(h.events.at(-1).wearer, null);
  const stale = harness(); stale.segment(0); stale.segment(96000);
  assert.equal(stale.events.at(-1).wearer, null);
});

test('a temporarily rejected association is retried after final progress without manufacturing votes', () => {
  let blocked = true;
  const accepted = [];
  const matcher = new ProfileSpeakerMatcher((wearer, others) => {
    if (blocked) return false;
    accepted.push({ wearer, others });
    return true;
  });
  for (let seq = 1; seq <= 2; seq++) {
    const startMs = (seq - 1) * 4000;
    matcher.token('1', startMs + 200, startMs + 3200);
    matcher.accept({ seq, startMs, endMs: startMs + 4000, voicedMs: 3000, similarity: 0.9 });
    matcher.finalized(startMs + 4000);
  }
  assert.equal(accepted.length, 0);
  blocked = false;
  matcher.finalized(8000);
  assert.deepEqual(accepted, [{ wearer: '1', others: [] }]);
  matcher.finalized(8000);
  assert.equal(accepted.length, 1);
});
