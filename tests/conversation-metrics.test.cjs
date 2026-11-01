const test = require('node:test');
const assert = require('node:assert/strict');
const { LatencyMetric, LATENCY_BUCKETS_MS } = require('../.test-build/app/conversation-detection/conversation-metrics.js');

test('latency summaries keep fixed-size buckets and truthful upper percentiles', () => {
  const metric = new LatencyMetric();
  for (const invalid of [-1, NaN, Infinity]) metric.add(invalid);
  assert.equal(metric.snapshot().count, 0);
  for (const ms of [0, 500, 1000, 3500, 7000, 40000]) metric.add(ms);
  const snapshot = metric.snapshot();
  assert.equal(snapshot.count, 6);
  assert.equal(snapshot.p50UpperMs, 1000);
  assert.equal(snapshot.p95UpperMs, 40000);
  assert.equal(snapshot.buckets.length, LATENCY_BUCKETS_MS.length + 1);
  snapshot.buckets.fill(99);
  assert.equal(metric.snapshot().buckets.reduce((a, b) => a + b, 0), 6);
  for (let i = 0; i < 10000; i++) metric.add(500);
  assert.equal(metric.snapshot().buckets.length, LATENCY_BUCKETS_MS.length + 1);
});
