const test = require('node:test');
const assert = require('node:assert/strict');
const { WearerIdentity, evaluateWindow, phraseOccurrences, unionLength, WEARER_PHRASE } =
  require('../.test-build/app/conversation-detection/wearer-identity.js');
const { ConversationTurns, TURN_LIMITS } = require('../.test-build/app/conversation-detection/conversation-turns.js');

// Final tokens with explicit times. `parts` are raw Soniox token texts (sub-words keep no leading space).
function run(speaker, parts, start, step = 150, length = 140) {
  return parts.map((text, i) => ({ text, speaker, startMs: start + i * step, endMs: start + i * step + length, valid: true }));
}
const PHRASE = ['Soy', ' yo', ' quien', ' lle', 'va', ' las', ' ga', 'fas'];
const ev = (tokens) => tokens.map((token) => token === 'cut' ? { kind: 'cut' } : { kind: 'token', token });

function identity() {
  let now = 0;
  const timers = new Set();
  const host = { now: () => now, every(cb) { timers.add(cb); return () => timers.delete(cb); } };
  const id = new WearerIdentity(host);
  const events = [];
  id.subscribe((event) => events.push(event));
  return { id, events, timers, advance(ms) { now += ms; for (const cb of [...timers]) cb(); },
    feed(tokens) { for (const t of tokens) t === 'cut' ? id.observeMarker() : id.observeFinal(t); } };
}

// Opens the session, sends `ms` of audio, opens an attempt and closes it after 5 s of audio.
function windowed(h, startAudio = 1000) {
  h.id.start('s1', 1); h.id.audio(startAudio);
  assert.equal(h.id.identify(), true);
  return startAudio;
}

test('R1 valid phrase split into sub-words is accepted for its label only', () => {
  const tokens = run('2', PHRASE, 1200);
  const result = evaluateWindow(ev(tokens), 1000, 6000);
  assert.deepEqual(result, { outcome: 'aceptado', speaker: '2' });
  assert.equal(WEARER_PHRASE, 'Soy yo quien lleva las gafas');
});

test('R1 Codex counterexample and partial/unordered phrases are rejected', () => {
  const cases = {
    codex: run('1', ['Soy', ' yo', ' quien', ' paga', ' la', ' cena'], 1200, 250, 240),
    three: run('1', ['soy', ' yo', ' quien'], 1200, 400, 380),
    unordered: run('1', ['las', ' gafas', ' lleva', ' quien', ' soy', ' yo'], 1200, 250, 240),
    incomplete: run('1', ['soy', ' yo', ' quien', ' lleva', ' las', ' gafa'], 1200, 250, 240),
  };
  for (const [name, tokens] of Object.entries(cases)) {
    assert.deepEqual(evaluateWindow(ev(tokens), 1000, 6000), { outcome: 'frase-no-reconocida' }, name);
  }
});

test('R1 fragments joined across another voice, a marker, a gap or two labels never form the phrase', () => {
  const otherVoice = [...run('2', ['soy', ' yo', ' quien'], 1200), ...run('1', [' sí'], 1700), ...run('2', [' lleva', ' las', ' gafas'], 1900)];
  const marker = [...run('2', ['soy', ' yo', ' quien'], 1200), 'cut', ...run('2', [' lleva', ' las', ' gafas'], 1700)];
  const gap = [...run('2', ['soy', ' yo', ' quien'], 1200), ...run('2', [' lleva', ' las', ' gafas'], 2900)];
  const twoLabels = [...run('2', ['soy', ' yo', ' quien'], 1200), ...run('3', [' lleva', ' las', ' gafas'], 1700)];
  const nullSpeaker = [...run('2', ['soy', ' yo', ' quien'], 1200), { text: ' eh', speaker: null, startMs: 1650, endMs: 1660, valid: true },
    ...run('2', [' lleva', ' las', ' gafas'], 1700)];
  for (const [name, tokens] of Object.entries({ otherVoice, marker, gap, twoLabels, nullSpeaker })) {
    assert.deepEqual(evaluateWindow(ev(tokens), 1000, 6000), { outcome: 'frase-no-reconocida' }, name);
  }
});

test('R1 closed variants with surrounding words are accepted; the phrase in two labels is ambiguous', () => {
  const variant = run('2', ['Vale,', ' soy', ' yo', ' el', ' que', ' lleva', ' las', ' gafas.'], 1200);
  assert.deepEqual(evaluateWindow(ev(variant), 1000, 6000), { outcome: 'aceptado', speaker: '2' });
  const accents = run('2', ['SÓY', ' yo', ' quién', ' lleva', ' las', ' gafas'], 1200, 200, 190);
  assert.deepEqual(evaluateWindow(ev(accents), 1000, 6000), { outcome: 'aceptado', speaker: '2' });
  const both = [...run('2', PHRASE, 1200), ...run('1', PHRASE, 3000)];
  assert.deepEqual(evaluateWindow(ev(both), 1000, 6000), { outcome: 'frase-ambigua' });
});

test('R1 interlocutor first without overlap does not prevent acceptance', () => {
  const tokens = [...run('1', ['¿Qué', ' tal?'], 1000, 300, 280), ...run('2', PHRASE, 1800)];
  assert.deepEqual(evaluateWindow(ev(tokens), 1000, 6000), { outcome: 'aceptado', speaker: '2' });
});

test('R4 overlap, invalid timing, window limits and implausible length have explicit outcomes', () => {
  const phrase = run('2', PHRASE, 1200);
  const overlapping = [...phrase, ...run('1', ['ajá'], 1300, 0, 600)];
  assert.deepEqual(evaluateWindow(ev(overlapping), 1000, 6000), { outcome: 'voces-solapadas' });
  const nearby = [...phrase, ...run('1', ['ajá'], 1300, 0, 250)];
  assert.deepEqual(evaluateWindow(ev(nearby), 1000, 6000), { outcome: 'aceptado', speaker: '2' });
  const invalid = phrase.map((t, i) => i === 3 ? { ...t, startMs: null, endMs: null, valid: false } : t);
  assert.deepEqual(evaluateWindow(ev(invalid), 1000, 6000), { outcome: 'tiempos-invalidos' });
  // Ends exactly at windowEnd + 300 → accepted; one ms later → outside.
  const last = run('2', PHRASE, 4000).map((t, i, all) => i === all.length - 1 ? { ...t, endMs: 6300 } : t);
  assert.deepEqual(evaluateWindow(ev(last), 1000, 6000), { outcome: 'aceptado', speaker: '2' });
  const late = last.map((t, i, all) => i === all.length - 1 ? { ...t, endMs: 6301 } : t);
  assert.deepEqual(evaluateWindow(ev(late), 1000, 6000), { outcome: 'frase-fuera-de-ventana' });
  // Starting before the window: the run is cut there, so the phrase is incomplete.
  assert.deepEqual(evaluateWindow(ev(run('2', PHRASE, 900)), 1000, 6000), { outcome: 'frase-no-reconocida' });
  const short = run('2', PHRASE, 1200, 60, 50);
  assert.deepEqual(evaluateWindow(ev(short), 1000, 6000), { outcome: 'tiempos-implausibles' });
});

test('R4 durations and overlaps use the union of intervals without double counting', () => {
  assert.equal(unionLength([[0, 100], [50, 150], [140, 160]]), 160);
  assert.equal(unionLength([[0, 100], [200, 300]], 50, 250), 100);
  // Overlapping tokens of the phrase still count their union once.
  const doubled = [...run('2', PHRASE, 1200, 60, 400)];
  assert.equal(unionLength(doubled.map((t) => [t.startMs, t.endMs])), 7 * 60 + 400);
  assert.equal(phraseOccurrences(ev(doubled), 1000).length, 1);
});

test('R2 manual choice during the window cancels the attempt and late phrase tokens cannot replace it', () => {
  const h = identity(); windowed(h);
  h.feed(run('1', ['hola'], 1000));
  assert.equal(h.id.assign({ sessionId: 's1', streamId: 1, speaker: '1' }), true);
  assert.equal(h.timers.size, 0);
  h.feed(run('2', PHRASE, 1200)); h.id.audio(6500); h.id.progress(6500); h.advance(10000);
  assert.deepEqual([h.id.snapshot().state, h.id.snapshot().speaker, h.id.snapshot().source, h.id.snapshot().lastOutcome],
    ['identificado', '1', 'manual', 'cancelado-manual']);
});

test('R2 clearing while waiting for the result keeps the session unidentified after late progress', () => {
  const h = identity(); windowed(h);
  h.feed(run('2', PHRASE, 1200)); h.id.audio(6000);
  assert.equal(h.id.state(), 'esperando-resultado');
  assert.equal(h.id.assign({ sessionId: 's1', streamId: 1, speaker: null }), true);
  h.id.progress(7000);
  assert.equal(h.id.state(), 'sin-identificar');
  assert.equal(h.events.at(-1).kind, 'borrado');
});

test('R2 stale menus, unseen labels and old timers have no effect', () => {
  const h = identity(); windowed(h);
  h.feed(run('2', ['hola'], 1100));
  assert.equal(h.id.assign({ sessionId: 's0', streamId: 1, speaker: '2' }), false);
  assert.equal(h.id.assign({ sessionId: 's1', streamId: 2, speaker: '2' }), false);
  assert.equal(h.id.assign({ sessionId: 's1', streamId: 1, speaker: '9' }), false);
  // Attempt 1 cancelled, attempt 2 opened: the old 8 s wall timer must not close attempt 2.
  assert.equal(h.id.cancel(), true);
  h.advance(5000); h.id.audio(2000);
  assert.equal(h.id.identify(), true);
  h.advance(3500);
  assert.equal(h.id.state(), 'escuchando-frase');
  // A new session rejects the previous session's menu reference.
  h.id.end('cancelado-off'); h.id.clear(); h.id.start('s2', 1); h.feed(run('2', ['hola'], 0));
  assert.equal(h.id.assign({ sessionId: 's1', streamId: 1, speaker: '2' }), false);
});

test('R2 a phrase that started in a previous attempt cannot complete in the next one', () => {
  const h = identity(); windowed(h);
  h.id.audio(3000); assert.equal(h.id.finish(), true);
  h.feed(run('2', ['soy', ' yo', ' quien'], 3000, 100, 90));
  h.id.progress(3400);
  assert.equal(h.id.snapshot().lastOutcome, 'frase-no-reconocida');
  assert.equal(h.id.identify(), true);
  h.feed(run('2', [' lleva', ' las', ' gafas'], 3400, 100, 90)); h.id.audio(8400); h.id.progress(8800);
  assert.equal(h.id.state(), 'sin-identificar');
  assert.equal(h.id.snapshot().lastOutcome, 'frase-no-reconocida');
});

test('R3 single relation policy: known others, later labels unknown, null speaker unknown', () => {
  const h = identity(); windowed(h);
  h.feed(run('1', ['hola'], 1000, 100, 90));
  h.feed(run('2', PHRASE, 1500)); h.id.audio(6000); h.id.progress(6300);
  assert.equal(h.id.relation('2'), 'portador');
  assert.equal(h.id.relation('1'), 'otro');
  h.feed(run('3', ['buenas'], 7000));
  assert.equal(h.id.relation('3'), 'desconocido');
  assert.equal(h.id.relation(null), 'desconocido');
  assert.deepEqual(h.events.at(-1).knownOthers, ['1']);
  assert.equal(h.id.assign({ sessionId: 's1', streamId: 1, speaker: '2' }), true);
  assert.equal(h.id.relation('3'), 'otro');
  assert.equal(h.id.assign({ sessionId: 's1', streamId: 1, speaker: null }), true);
  assert.equal(h.id.relation('2'), 'desconocido');
});

test('R4 monotonic window limit, insufficient audio and stalled progress end the attempt once', () => {
  const h = identity(); windowed(h);
  h.id.audio(1500); h.advance(8000);
  assert.equal(h.id.snapshot().lastOutcome, 'audio-insuficiente');
  assert.equal(h.timers.size, 0);
  assert.equal(h.id.identify(), true);
  h.id.audio(7000); // 5 s of audio closes the window
  assert.equal(h.id.state(), 'esperando-resultado');
  h.id.progress(7100); // below windowEnd + 300
  h.advance(5999); assert.equal(h.id.state(), 'esperando-resultado');
  h.advance(1); assert.equal(h.id.snapshot().lastOutcome, 'sin-resultado');
  assert.equal(h.id.state(), 'sin-identificar');
});

test('interrupt, local fallback and OFF capture distinct outcomes and keep a summary without text', () => {
  const h = identity(); windowed(h);
  h.id.interrupt();
  assert.equal(h.id.snapshot().lastOutcome, 'audio-interrumpido');
  assert.equal(h.id.identify(), true);
  h.id.end('cancelado-off');
  assert.equal(h.id.state(), 'no-disponible');
  assert.deepEqual(h.id.summary(), { state: 'escuchando-frase', source: null, lastOutcome: 'cancelado-off', attempts: 2, manualAssignments: 0 });
  assert.deepEqual(h.events.at(-1), { v: 1, sessionId: null, streamId: null, version: 0, kind: 'fin-sesion', speaker: null, knownOthers: [] });
  const local = identity(); windowed(local); local.id.end('motor-local');
  assert.equal(local.id.summary().lastOutcome, 'motor-local');
  assert.ok(!JSON.stringify(h.id.summary()).match(/gafas|quien/));
});

test('association events: initial state on subscribe, ordered changes and effective unsubscribe', () => {
  const h = identity();
  const seen = [];
  const off = h.id.subscribe((event) => seen.push(event.kind));
  assert.deepEqual(seen, ['estado-inicial']);
  h.id.start('s1', 1); h.feed(run('2', ['hola'], 0));
  h.id.assign({ sessionId: 's1', streamId: 1, speaker: '2' });
  off();
  h.id.assign({ sessionId: 's1', streamId: 1, speaker: null });
  assert.deepEqual(seen, ['estado-inicial', 'estado-inicial', 'manual']);
  assert.ok(h.events.every((event) => !('text' in event)));
});

function turnsHarness() {
  let relation = 'desconocido', version = 0;
  const turns = new ConversationTurns({ relation: () => relation, associationVersion: () => version });
  const emitted = [];
  const off = turns.subscribe((turn) => emitted.push(turn));
  turns.start('s1', 1);
  return { turns, emitted, off, set(r, v) { relation = r; version = v; } };
}
const tok = (speaker, text, startMs, endMs = startMs + 100, valid = true) =>
  ({ text, speaker, startMs: valid ? startMs : null, endMs: valid ? endMs : null, valid });

test('turns close on speaker change, <end>, <fin>, boundary, pause evidence, limit and session end', () => {
  const h = turnsHarness();
  h.turns.accept(tok('1', 'Hola', 0)); h.turns.accept(tok('2', 'Qué', 200));
  h.turns.marker('end');
  h.turns.accept(tok('2', 'Sigo', 400)); h.turns.marker('fin');
  h.turns.accept(tok('1', 'Uno', 600)); h.turns.boundary();
  h.turns.accept(tok('1', 'Dos', 800)); h.turns.accept(tok('1', ' tres', 2500));
  h.turns.progress(4200);
  h.turns.accept(tok('1', 'x'.repeat(TURN_LIMITS.maxChars), 5000));
  h.turns.accept(tok(null, 'eh', 6000)); h.turns.finish();
  assert.deepEqual(h.emitted.map((t) => [t.seq, t.speaker, t.text.slice(0, 5), t.closedBy]), [
    [1, '1', 'Hola', 'cambio-hablante'], [2, '2', 'Qué', 'endpoint'], [3, '2', 'Sigo', 'finalize'],
    [4, '1', 'Uno', 'frontera'], [5, '1', 'Dos', 'pausa'], [6, '1', 'tres', 'pausa'],
    [7, '1', 'xxxxx', 'limite'], [8, null, 'eh', 'fin-sesion']]);
  assert.equal(h.emitted[7].relation, 'desconocido');
});

test('a late socket never closes a turn by pause; only audio or progress evidence does', () => {
  const h = turnsHarness();
  h.turns.accept(tok('1', 'Hola', 0, 200));
  h.turns.progress(1000); // processed up to 1 s: pause of 800 ms only
  h.turns.accept(tok('1', ' qué', 1400, 1500)); // contiguous audio after a long wall delay
  assert.equal(h.emitted.length, 0);
  h.turns.progress(3000);
  assert.deepEqual(h.emitted.map((t) => [t.text, t.closedBy, t.startMs, t.endMs]), [['Hola qué', 'pausa', 0, 1500]]);
});

test('turns carry relation and version at closing, timing quality, a 40 ring, unsubscribe and clear', () => {
  const h = turnsHarness();
  h.set('portador', 3);
  h.turns.accept(tok('2', 'Mixto', 0)); h.turns.accept(tok('2', ' sin', 0, 0, false)); h.turns.marker('end');
  h.turns.accept(tok('2', 'Malo', 0, 0, false)); h.turns.marker('end');
  assert.deepEqual(h.emitted.map((t) => [t.relation, t.associationVersion, t.timing]),
    [['portador', 3, 'parcial'], ['portador', 3, 'invalido']]);
  assert.equal(h.emitted[1].startMs, null);
  for (let i = 0; i < 45; i++) { h.turns.accept(tok(String(i % 2), `t${i}`, 1000 + i * 10)); }
  h.turns.marker('end');
  assert.equal(h.turns.list().length, 40);
  assert.equal(h.turns.list().at(-1).seq, h.turns.count());
  h.off();
  const before = h.emitted.length;
  h.turns.accept(tok('1', 'otra', 9000)); h.turns.marker('end');
  assert.equal(h.emitted.length, before);
  h.turns.clear();
  assert.equal(h.turns.list().length, 0);
  h.turns.accept(tok('1', 'tras borrar', 9500)); h.turns.marker('end');
  assert.equal(h.turns.list().length, 0);
});
