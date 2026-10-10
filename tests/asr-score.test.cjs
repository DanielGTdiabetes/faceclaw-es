const test = require('node:test');
const assert = require('node:assert/strict');
const { words, editCounts, score } = require('../scripts/asr-score.cjs');

test('word normalisation keeps accents and drops punctuation', () => {
  assert.deepEqual(words('¡Hola! ¿Qué tal, Pep? L\'àvia—ve.'), ['hola', 'qué', 'tal', 'pep', "l'àvia", 've']);
  assert.deepEqual(words('  '), []);
});

test('edit counts separate substitutions, deletions and insertions', () => {
  assert.deepEqual(editCounts(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e']),
    { substitutions: 1, deletions: 0, insertions: 1, referenceWords: 4 });
  assert.deepEqual(editCounts(['a', 'b'], []), { substitutions: 0, deletions: 2, insertions: 0, referenceWords: 2 });
});

test('report per configuration: WER, coverage, accuracy and wearer precision/recall', () => {
  const references = [{ id: 'c1', segments: [
    { startMs: 0, endMs: 4000, speaker: 'portador', text: 'mañana vamos a la playa' },
    { startMs: 4000, endMs: 8000, speaker: 'ana', text: 'vale yo llevo la comida' }] }];
  const hypotheses = [
    { id: 'c1', config: 'ref-6-3', segments: [{ startMs: 0, endMs: 8000, speaker: null, text: 'mañana vamos a la playa vale llevo la comida' }] },
    { id: 'c1', config: 'pause-2-12', segments: [
      { startMs: 0, endMs: 4200, speaker: 'portador', relation: 'portador', text: 'mañana vamos a la playa' },
      { startMs: 4200, endMs: 8000, speaker: 'voz-1', relation: 'otro', text: 'vale yo llevo la comida' }] },
  ];
  const report = score(references, hypotheses);
  assert.equal(report['ref-6-3'].wer, 0.1);
  assert.equal(report['ref-6-3'].attributionCoverage, 0);
  assert.equal(report['ref-6-3'].attributionAccuracy, null);
  assert.equal(report['pause-2-12'].wer, 0);
  assert.equal(report['pause-2-12'].attributionCoverage, 1);
  assert.equal(report['pause-2-12'].attributionAccuracy, 0.975);
  assert.equal(report['pause-2-12'].wearerPrecision, 0.9524);
  assert.equal(report['pause-2-12'].wearerRecall, 1);
});

test('unknown or duplicate hypotheses are rejected', () => {
  const references = [{ id: 'c1', segments: [{ startMs: 0, endMs: 1000, speaker: 'portador', text: 'hola' }] }];
  assert.throws(() => score(references, [{ id: 'c2', segments: [] }]));
  const row = { id: 'c1', segments: [{ startMs: 0, endMs: 1000, speaker: null, text: 'hola' }] };
  assert.throws(() => score(references, [row, row]));
});
