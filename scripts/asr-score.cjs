#!/usr/bin/env node
// Offline scoring of local ASR output against human references: WER and speaker attribution.
// No audio, capture, network or models: both inputs are JSONL files produced elsewhere.
//
// Reference row:  {"id":"clip-01","segments":[{"startMs":0,"endMs":3200,"speaker":"portador","text":"..."}]}
// Hypothesis row: {"id":"clip-01","config":"pause-2-12","segments":[{"startMs":0,"endMs":3400,
//                  "speaker":"portador","relation":"portador","text":"..."}]}
// Reference speakers: "portador" for the wearer, any other stable name for other people.
// Hypothesis speakers: null (unattributed), "portador" or a session voice such as "voz-1".
const fs = require('node:fs');

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/u)
    .filter(line => line.trim()).map((line, index) => {
      try { return JSON.parse(line); } catch { throw new Error(`Invalid JSONL at row ${index + 1} of ${file}`); }
    });
}

/** Lower case, punctuation removed, accents kept: an accent error is a real word error. */
function words(text) {
  return String(text).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/u).map(word => word.replace(/^['-]+|['-]+$/gu, '')).filter(Boolean);
}

/** Word-level Levenshtein: substitutions, deletions and insertions. */
function editCounts(reference, hypothesis) {
  const rows = reference.length + 1, cols = hypothesis.length + 1;
  const cost = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1,
        cost[i - 1][j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1));
    }
  }
  let i = reference.length, j = hypothesis.length, substitutions = 0, deletions = 0, insertions = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)) {
      if (reference[i - 1] !== hypothesis[j - 1]) substitutions++;
      i--; j--;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) { deletions++; i--; }
    else { insertions++; j--; }
  }
  return { substitutions, deletions, insertions, referenceWords: reference.length };
}

function overlap(a, b) { return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)); }

function validSegments(segments, hypothesis) {
  return Array.isArray(segments) && segments.every(s => s && typeof s.text === 'string'
    && Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.startMs >= 0 && s.endMs > s.startMs
    && (hypothesis ? s.speaker === null || s.speaker === undefined || typeof s.speaker === 'string' : typeof s.speaker === 'string'));
}

/**
 * Attribution by time overlap. Each attributed hypothesis label maps to the reference speaker it overlaps
 * most over the clip (the wearer label must map to the wearer to count). Unattributed time is reported
 * apart: abstaining is not an error but lowers coverage.
 */
function attribution(reference, hypothesis) {
  const byLabel = new Map();
  let attributedMs = 0, unattributedMs = 0;
  for (const hyp of hypothesis) {
    const duration = hyp.endMs - hyp.startMs;
    if (!hyp.speaker) { unattributedMs += duration; continue; }
    attributedMs += duration;
    const votes = byLabel.get(hyp.speaker) ?? new Map();
    for (const ref of reference) votes.set(ref.speaker, (votes.get(ref.speaker) ?? 0) + overlap(hyp, ref));
    byLabel.set(hyp.speaker, votes);
  }
  const mapping = new Map([...byLabel].map(([label, votes]) => {
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    return [label, label === 'portador' ? 'portador' : best?.[1] ? best[0] : null];
  }));
  let correctMs = 0, wearerHypMs = 0, wearerHypCorrectMs = 0;
  for (const hyp of hypothesis) {
    if (!hyp.speaker) continue;
    const target = mapping.get(hyp.speaker);
    for (const ref of reference) if (ref.speaker === target) correctMs += overlap(hyp, ref);
    if (hyp.speaker === 'portador') {
      wearerHypMs += hyp.endMs - hyp.startMs;
      for (const ref of reference) if (ref.speaker === 'portador') wearerHypCorrectMs += overlap(hyp, ref);
    }
  }
  const wearerRefMs = reference.filter(r => r.speaker === 'portador').reduce((n, r) => n + r.endMs - r.startMs, 0);
  let wearerFoundMs = 0;
  for (const ref of reference.filter(r => r.speaker === 'portador')) {
    for (const hyp of hypothesis.filter(h => h.speaker === 'portador')) wearerFoundMs += overlap(hyp, ref);
  }
  return { attributedMs, unattributedMs, correctMs, wearerHypMs, wearerHypCorrectMs, wearerRefMs, wearerFoundMs };
}

const ratio = (a, b) => (b ? Math.round((a / b) * 10000) / 10000 : null);

function score(references, hypotheses) {
  const refs = new Map();
  for (const row of references) {
    if (!row || typeof row.id !== 'string' || refs.has(row.id) || !validSegments(row.segments, false)) throw new Error('Invalid reference row');
    refs.set(row.id, row);
  }
  const configs = new Map();
  const seen = new Set();
  for (const row of hypotheses) {
    if (!row || !refs.has(row.id) || !validSegments(row.segments, true)) throw new Error(`Invalid or unknown hypothesis row ${row?.id}`);
    const config = typeof row.config === 'string' && row.config ? row.config : 'default';
    if (seen.has(`${config}/${row.id}`)) throw new Error(`Duplicate hypothesis ${config}/${row.id}`);
    seen.add(`${config}/${row.id}`);
    const ref = refs.get(row.id);
    const edits = editCounts(words(ref.segments.map(s => s.text).join(' ')), words(row.segments.map(s => s.text).join(' ')));
    const attr = attribution(ref.segments, row.segments);
    const total = configs.get(config) ?? { clips: 0, substitutions: 0, deletions: 0, insertions: 0, referenceWords: 0,
      attributedMs: 0, unattributedMs: 0, correctMs: 0, wearerHypMs: 0, wearerHypCorrectMs: 0, wearerRefMs: 0, wearerFoundMs: 0 };
    total.clips++;
    for (const [key, value] of Object.entries({ ...edits, ...attr })) total[key] += value;
    configs.set(config, total);
  }
  const report = {};
  for (const [config, t] of configs) {
    report[config] = { clips: t.clips, missingClips: refs.size - t.clips, referenceWords: t.referenceWords,
      wer: ratio(t.substitutions + t.deletions + t.insertions, t.referenceWords),
      substitutions: t.substitutions, deletions: t.deletions, insertions: t.insertions,
      attributionCoverage: ratio(t.attributedMs, t.attributedMs + t.unattributedMs),
      attributionAccuracy: ratio(t.correctMs, t.attributedMs),
      wearerPrecision: ratio(t.wearerHypCorrectMs, t.wearerHypMs),
      wearerRecall: ratio(t.wearerFoundMs, t.wearerRefMs) };
  }
  return report;
}

function main(args) {
  if (args.length !== 4 || args[0] !== '--reference' || args[2] !== '--hypotheses') {
    throw new Error('Use --reference REF.jsonl --hypotheses HYP.jsonl');
  }
  return score(readJsonl(args[1]), readJsonl(args[3]));
}

module.exports = { words, editCounts, attribution, score, main };
if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
