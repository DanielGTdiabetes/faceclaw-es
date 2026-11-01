const test = require('node:test');
const assert = require('node:assert/strict');
const { readJsonl, validateDataset, evaluate, main, DEFAULT_DATASET } = require('../scripts/gatekeeper-replay.cjs');

function cases() {
  return [
    { id: 'a', source: 'synthetic', review: 'pending', episodeId: 'e', atMs: 1000,
      mode: 'assess', recent: [], fragment: 'Hola', expected: { action: 'ignore', memoryRelevant: false } },
    { id: 'b', source: 'synthetic', review: 'pending', episodeId: 'e', atMs: 4000,
      mode: 'assist', recent: [{ atMs: 1000, text: 'Cuesta veinte euros' }], fragment: '¿La mitad?',
      expected: { action: 'assist', memoryRelevant: false } },
    { id: 'c', source: 'synthetic', review: 'pending', episodeId: 'e', atMs: 7000,
      mode: 'assist', recent: [], fragment: 'Cambiamos la reunión al jueves', expected: { action: 'assist', memoryRelevant: true } },
  ];
}
const pass = () => cases().map(row => ({ id: row.id, action: 'assist', latencyMs: 0 }));
const references = () => [
  { id: 'a', source: 'measured', mode: 'assess', verdict: 'cortesia', useful: null, memoryUpdated: false },
  { id: 'b', source: 'measured', mode: 'assist', kind: 'mensaje', useful: true, memoryUpdated: false },
  { id: 'c', source: 'measured', mode: 'assist', kind: 'nada', useful: false, memoryUpdated: true },
];

test('pilot validates temporal context but is explicitly unreviewed and contains no measured outcomes', () => {
  const rows = validateDataset(readJsonl(DEFAULT_DATASET));
  assert.equal(rows.length, 48);
  assert.equal(rows.every(row => row.review === 'pending' && row.source === 'synthetic'), true);
  assert.ok(rows.some(row => row.expected.action === 'wait'));
  assert.ok(rows.some(row => row.expected.memoryRelevant));
  assert.equal(rows.some(row => row.hermes || row.reference), false);
  assert.deepEqual(main([]), { status: 'dataset-validated-only', candidates: 48, episodes: 23, humanReviewed: 0, modelsRun: 0 });
});

test('pass-through control is explicitly not a measured Hermes baseline', () => {
  const report = main(['--baseline-pass']);
  assert.equal(report.status, 'pass-through-control-not-hermes');
  assert.equal(report.annotationAssistRecall, 1);
  assert.equal(report.usefulRecall, null);
  assert.equal(report.measuredReferences, 0);
  assert.equal(report.quotaSavings, null);
});

test('report separates assess and assist savings, useful false negatives and silent memory updates', () => {
  const predictions = ['a', 'b', 'c'].map((id, index) => ({ id, action: 'ignore', latencyMs: (index + 1) * 100 }));
  const report = evaluate(cases(), predictions, references());
  assert.deepEqual(report.perMode, { assess: { candidates: 1, wouldAvoid: 1 }, assist: { candidates: 2, wouldAvoid: 2 } });
  assert.equal(report.avoidedNada, 1);
  assert.equal(report.usefulBlocked, 1);
  assert.equal(report.usefulRecall, 0);
  assert.equal(report.memoryUpdatesBlocked, 1);
  assert.equal(report.memoryRelevantBlocked, 1);
  assert.deepEqual(report.latencyMs, { p50: 200, p95: 300 });
});

test('absent outcomes and absent useful interventions never produce fabricated useful recall', () => {
  const predictions = pass().map(row => ({ ...row, action: 'ignore' }));
  const report = evaluate(cases(), predictions);
  assert.equal(report.usefulRecall, null);
  assert.equal(report.avoidedWithoutReference, 3);
  assert.equal(report.avoidedNada, 0);
  const silent = references().filter(row => row.kind === 'nada');
  assert.equal(evaluate(cases(), predictions, silent).usefulRecall, null);
});

test('WAIT without a final decision is deferred, not counted as a saved request', () => {
  const predictions = pass(); predictions[1] = { id: 'b', action: 'wait', latencyMs: 1500 };
  const report = evaluate(cases(), predictions, references());
  assert.equal(report.unresolvedWaits, 1);
  assert.equal(report.perMode.assist.wouldAvoid, 0);
  assert.equal(report.usefulBlocked, 0);
  assert.equal(report.usefulPending, 1);
  assert.equal(report.usefulRecall, 0, 'pending intervention has not yet been retained');
  predictions[1].finalAction = 'assist';
  const resolved = evaluate(cases(), predictions, references());
  assert.equal(resolved.unresolvedWaits, 0);
  assert.equal(resolved.usefulRecall, 1);
  assert.equal(resolved.latencyMs.p95, 1500, 'reported latency must include the wait');
});

test('technical failure bypass retains the request and counts as bypass, never as savings', () => {
  const predictions = pass(); predictions[1].bypass = true;
  const report = evaluate(cases(), predictions, references());
  assert.equal(report.bypasses, 1); assert.equal(report.usefulRecall, 1);
  assert.equal(report.perMode.assist.wouldAvoid, 0);
  predictions[1].action = 'ignore';
  assert.throws(() => evaluate(cases(), predictions), /prediction/);
});

test('missing, duplicate and unknown predictions cannot inflate metrics', () => {
  assert.throws(() => evaluate(cases(), pass().slice(0, 2)), /Every candidate/);
  assert.throws(() => evaluate(cases(), [...pass(), pass()[0]]), /id/);
  assert.throws(() => evaluate(cases(), [...pass(), { id: 'unknown' }]), /id/);
});

test('invalid actions, timing, references and ordering fail before evaluation', () => {
  for (const patch of [{ action: 'instruction' }, { latencyMs: -1 }, { latencyMs: Infinity }, { finalAction: 'ignore' }]) {
    const predictions = pass(); predictions[1] = { ...predictions[1], ...patch };
    assert.throws(() => evaluate(cases(), predictions), /prediction/);
  }
  const unmeasured = references(); unmeasured[0].source = 'synthetic';
  assert.throws(() => evaluate(cases(), pass(), unmeasured), /reference/);
  const invalidNada = references(); invalidNada[2].useful = true;
  assert.throws(() => evaluate(cases(), pass(), invalidNada), /reference/);
  const wrongMode = references(); wrongMode[1].mode = 'assess';
  assert.throws(() => evaluate(cases(), pass(), wrongMode), /reference/);
  const future = cases(); future[1].recent[0].atMs = 5000;
  assert.throws(() => validateDataset(future), /dataset/);
  const unordered = cases(); unordered[1].atMs = 500;
  unordered[1].recent = [];
  assert.throws(() => validateDataset(unordered), /chronological/);
});

test('CLI rejects contradictory options and does not silently run a provider', () => {
  assert.throws(() => main(['--endpoint', 'https://example.com']), /Use/);
  assert.throws(() => main(['--predictions']), /Missing/);
  assert.throws(() => main(['--baseline-pass', '--predictions', 'somewhere']), /Choose/);
});
