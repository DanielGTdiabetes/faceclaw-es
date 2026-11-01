#!/usr/bin/env node
// Offline evaluation of independently obtained predictions. No capture, network or credentials.
const fs = require('node:fs');
const path = require('node:path');
const ACTIONS = ['ignore', 'wait', 'assist'];
const DEFAULT_DATASET = path.join(__dirname, '../tests/fixtures/gatekeeper/pilot.jsonl');

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/u)
    .filter(line => line.trim()).map((line, index) => {
      try { return JSON.parse(line); } catch { throw new Error(`Invalid JSONL at row ${index + 1}`); }
    });
}

function indexRows(rows, allowedIds) {
  const result = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id || result.has(row.id)
      || allowedIds && !allowedIds.has(row.id)) throw new Error('Invalid, duplicate or unknown id');
    result.set(row.id, row);
  }
  return result;
}

const RELATIONS = ['portador', 'otro', 'desconocido'];
/** Optional attribution, as the app sends it: portador/otro need a speaker; one speaker keeps one relation. */
function validSpeakers(row) {
  const voices = [...row.recent.map(turn => [turn.speaker ?? null, turn.relation ?? 'desconocido']),
    [row.fragmentSpeaker ?? null, row.fragmentRelation ?? 'desconocido']];
  const relations = new Map();
  for (const [speaker, relation] of voices) {
    if (speaker !== null && (typeof speaker !== 'string' || !/^[\w-]{1,32}$/u.test(speaker))) return false;
    if (!RELATIONS.includes(relation) || relation !== 'desconocido' && speaker === null) return false;
    if (speaker !== null && relations.has(speaker) && relations.get(speaker) !== relation) return false;
    if (speaker !== null) relations.set(speaker, relation);
  }
  const wearers = new Set(voices.filter(([, relation]) => relation === 'portador').map(([speaker]) => speaker));
  return wearers.size <= 1;
}

function validateDataset(rows) {
  if (!rows.length) throw new Error('Dataset is empty');
  indexRows(rows);
  for (const row of rows) {
    if (row.source !== 'synthetic' || row.review !== 'pending' && row.review !== 'human'
      || typeof row.episodeId !== 'string' || !row.episodeId || !Number.isFinite(row.atMs) || row.atMs < 0
      || !['assess', 'assist'].includes(row.mode) || typeof row.fragment !== 'string' || !row.fragment.trim()
      || !Array.isArray(row.recent) || row.recent.length > 12
      || row.recent.some(turn => !turn || typeof turn.text !== 'string' || !turn.text.trim()
        || !Number.isFinite(turn.atMs) || turn.atMs < 0 || turn.atMs > row.atMs)
      || row.recent.reduce((n, turn) => n + turn.text.length, row.fragment.length) > 6000
      || !validSpeakers(row)
      || !row.expected || !ACTIONS.includes(row.expected.action)
      || typeof row.expected.memoryRelevant !== 'boolean') throw new Error('Invalid dataset case');
    for (let i = 1; i < row.recent.length; i++) {
      if (row.recent[i].atMs < row.recent[i - 1].atMs) throw new Error('Context is not chronological');
    }
  }
  const lastAt = new Map();
  for (const row of rows) {
    if (lastAt.has(row.episodeId) && row.atMs < lastAt.get(row.episodeId)) throw new Error('Episode is not chronological');
    lastAt.set(row.episodeId, row.atMs);
  }
  return rows;
}

const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const quantile = (sorted, q) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] : null;

function evaluate(dataset, predictions, references = []) {
  validateDataset(dataset);
  const ids = new Set(dataset.map(row => row.id));
  const predicted = indexRows(predictions, ids), reference = indexRows(references, ids);
  if (predicted.size !== ids.size) throw new Error('Every candidate needs exactly one prediction');
  for (const row of predictions) {
    if (!ACTIONS.includes(row.action) || !Number.isFinite(row.latencyMs) || row.latencyMs < 0
      || row.finalAction !== undefined && (row.action !== 'wait' || !['ignore', 'assist'].includes(row.finalAction))
      || row.bypass !== undefined && typeof row.bypass !== 'boolean'
      || row.bypass === true && row.action !== 'assist') throw new Error('Invalid prediction');
  }
  for (const row of references) {
    const mode = dataset.find(candidate => candidate.id === row.id).mode;
    if (row.source !== 'measured' || row.mode !== mode
      || row.useful !== null && typeof row.useful !== 'boolean'
      || row.memoryUpdated !== null && typeof row.memoryUpdated !== 'boolean'
      || mode === 'assess' && (!['tema', 'cortesia', 'incierto'].includes(row.verdict) || row.kind !== undefined || row.useful !== null)
      || mode === 'assist' && (!['nada', 'mensaje'].includes(row.kind) || row.kind === 'nada' && row.useful === true)) {
      throw new Error('Invalid measured reference');
    }
  }
  const confusion = Object.fromEntries(ACTIONS.map(action => [action,
    Object.fromEntries(ACTIONS.map(prediction => [prediction, 0]))]));
  const perMode = { assess: { candidates: 0, wouldAvoid: 0 }, assist: { candidates: 0, wouldAvoid: 0 } };
  let bypasses = 0, waits = 0, unresolvedWaits = 0, required = 0, retained = 0;
  let useful = 0, usefulPassed = 0, usefulBlocked = 0, usefulPending = 0, avoidedNada = 0;
  let memoryUpdatesBlocked = 0, memoryRelevantBlocked = 0, avoidedWithoutReference = 0;
  for (const row of dataset) {
    const prediction = predicted.get(row.id), actual = reference.get(row.id);
    const final = prediction.finalAction ?? prediction.action;
    confusion[row.expected.action][prediction.action]++;
    perMode[row.mode].candidates++;
    if (prediction.bypass) bypasses++;
    if (prediction.action === 'wait') waits++;
    if (final === 'wait') unresolvedWaits++;
    if (row.expected.action === 'assist') { required++; if (final === 'assist') retained++; }
    if (final === 'ignore') {
      perMode[row.mode].wouldAvoid++;
      if (row.expected.memoryRelevant) memoryRelevantBlocked++;
      if (!actual) avoidedWithoutReference++;
      if (actual?.kind === 'nada') avoidedNada++;
      if (actual?.memoryUpdated === true) memoryUpdatesBlocked++;
    }
    if (actual?.useful === true) {
      useful++;
      if (final === 'assist') usefulPassed++;
      if (final === 'ignore') usefulBlocked++;
      if (final === 'wait') usefulPending++;
    }
  }
  const latency = predictions.map(row => row.latencyMs).sort((a, b) => a - b);
  return { candidates: dataset.length, humanReviewed: dataset.filter(row => row.review === 'human').length,
    measuredReferences: references.length, perMode, confusion,
    annotationAssistRecall: ratio(retained, required), usefulRecall: ratio(usefulPassed, useful),
    usefulReferenceCount: useful, usefulBlocked, usefulPending, avoidedNada,
    memoryUpdatesBlocked, memoryRelevantBlocked, avoidedWithoutReference,
    waits, unresolvedWaits, bypasses, latencyMs: { p50: quantile(latency, 0.5), p95: quantile(latency, 0.95) },
    // Resource data and quota savings require physical measurements, not offline predictions.
    cpu: null, ram: null, temperature: null, whisperInterference: null, quotaSavings: null };
}

/** Same rule as conversation-prefilter isSingleForeignVoice: 3+ turns, one labelled non-wearer voice. */
function singleForeignVoice(row) {
  const turns = [...row.recent.map(turn => [turn.speaker ?? null, turn.relation ?? 'desconocido']),
    [row.fragmentSpeaker ?? null, row.fragmentRelation ?? 'desconocido']];
  const speaker = turns[0][0];
  return turns.length >= 3 && speaker !== null && turns.every(([s, r]) => s === speaker && r !== 'portador');
}

function main(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!['--dataset', '--predictions', '--reference', '--baseline-pass', '--single-voice-rule'].includes(arg) || values[arg] !== undefined) {
      throw new Error('Use --dataset FILE [--predictions FILE | --baseline-pass | --single-voice-rule] [--reference FILE]');
    }
    if (arg === '--baseline-pass' || arg === '--single-voice-rule') values[arg] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing file argument');
      values[arg] = args[++i];
    }
  }
  const sources = ['--baseline-pass', '--predictions', '--single-voice-rule'].filter(key => values[key]);
  if (sources.length > 1) throw new Error('Choose one prediction source');
  if (values['--reference'] && !sources.length) throw new Error('Reference needs predictions');
  const dataset = validateDataset(readJsonl(values['--dataset'] ?? DEFAULT_DATASET));
  if (!sources.length) {
    return { status: 'dataset-validated-only', candidates: dataset.length,
      episodes: new Set(dataset.map(row => row.episodeId)).size,
      humanReviewed: dataset.filter(row => row.review === 'human').length, modelsRun: 0 };
  }
  const predictions = values['--baseline-pass'] ? dataset.map(row => ({ id: row.id, action: 'assist', latencyMs: 0 }))
    : values['--single-voice-rule']
      ? dataset.map(row => ({ id: row.id, action: singleForeignVoice(row) ? 'ignore' : 'assist', latencyMs: 0 }))
      : readJsonl(values['--predictions']);
  return { status: values['--baseline-pass'] ? 'pass-through-control-not-hermes'
    : values['--single-voice-rule'] ? 'deterministic-single-voice-rule' : 'offline-predictions',
    ...evaluate(dataset, predictions, values['--reference'] ? readJsonl(values['--reference']) : []) };
}

module.exports = { readJsonl, validateDataset, evaluate, main, singleForeignVoice, DEFAULT_DATASET };
if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
