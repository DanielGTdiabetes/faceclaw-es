const test = require('node:test');
const assert = require('node:assert/strict');
const { runGatekeeperBenchmark } = require('../.test-build/app/conversation-detection/gatekeeper-benchmark.js');
const fs = require('node:fs');

test('bundled pilot equals the synthetic fixture, with no real capture or reviewed claims', () => {
  const { GATEKEEPER_PILOT } = require('../.test-build/app/conversation-detection/gatekeeper-pilot.js');
  assert.deepEqual(GATEKEEPER_PILOT, fs.readFileSync('tests/fixtures/gatekeeper/pilot.jsonl', 'utf8').trim().split('\n').map(JSON.parse));
  assert.equal(GATEKEEPER_PILOT.length, 48);
  assert.ok(GATEKEEPER_PILOT.every(r => r.source === 'synthetic' && r.review === 'pending'));
});

function harness(synchronous = false) {
  let now = 0, allowed = true, priority = false, listener = () => {}, unloads = 0, cancels = 0;
  const timers = new Set(), calls = [], reports = [], progress = [];
  const cancel = runGatekeeperBenchmark({ isLoaded: () => true, unload() { unloads++; },
    classify(input, done) { calls.push({ input, done }); if (synchronous) done('{"action":"assist","reason":"useful"}'); return () => cancels++; } },
  { now: () => now, changed() {}, priorityActive: () => priority,
    subscribePriority(cb) { listener = cb; return () => { listener = () => {}; }; },
    after(cb, ms) { const t = { cb, at: now + ms }; timers.add(t); return () => timers.delete(t); } },
  () => allowed, (n, total) => progress.push([n, total]), report => reports.push(report));
  return { cancel, calls, reports, timers, progress,
    allowed(value) { allowed = value; }, priority() { priority = true; listener(true); },
    advance(ms = 1) { now += ms; for (const t of [...timers]) if (t.at <= now && timers.has(t)) { timers.delete(t); t.cb(); } },
    unloads: () => unloads, cancels: () => cancels };
}

test('actual provider callbacks produce one measured prediction per synthetic ID', () => {
  const h = harness(true); for (let i = 0; i < 49; i++) h.advance();
  assert.equal(h.calls.length, 48); assert.equal(h.reports.length, 1); assert.equal(h.reports[0].completed, true);
  assert.equal(h.reports[0].stopReason, 'completed');
  assert.equal(h.reports[0].rows.length, 48); assert.equal(h.reports[0].failures, 0); assert.equal(h.unloads(), 1);
  assert.equal(h.timers.size, 0); assert.ok(!JSON.stringify(h.reports).includes('Conversación'));
});

test('priority cancels immediately and late callbacks cannot export a completed benchmark', () => {
  const h = harness(); h.advance(); h.priority(); h.calls[0].done('{"action":"ignore","reason":"courtesy"}');
  assert.equal(h.cancels(), 1); assert.equal(h.reports.length, 1); assert.equal(h.reports[0].completed, false);
  assert.equal(h.reports[0].stopReason, 'priority');
  assert.equal(h.reports[0].rows.length, 0); assert.equal(h.timers.size, 0);
});

test('deadline failures remain explicit bypasses, never invented ignore predictions', () => {
  const h = harness(); h.advance(); h.advance(30000);
  assert.deepEqual(h.reports, []); assert.equal(h.progress.length, 1);
  h.cancel(); assert.equal(h.reports[0].rows[0].bypass, true); assert.equal(h.reports[0].failures, 1);
  assert.equal(h.reports[0].stopReason, 'cancelled');
  assert.equal(h.reports[0].rows[0].action, 'assist');
});

test('starting real conversation stops the benchmark before another case loads', () => {
  const h = harness(true); h.advance(); h.allowed(false); h.advance();
  assert.equal(h.calls.length, 1); assert.equal(h.reports[0].completed, false); assert.equal(h.unloads(), 1);
  assert.equal(h.reports[0].stopReason, 'capture');
});

test('capture during an inference has a distinct stop reason and discards its late result', () => {
  const h = harness(); h.advance(); h.cancel('capture');
  h.calls[0].done('{"action":"assist","reason":"useful"}');
  assert.equal(h.cancels(), 1); assert.equal(h.reports[0].stopReason, 'capture');
  assert.equal(h.reports[0].rows.length, 0); assert.equal(h.reports.length, 1);
});
