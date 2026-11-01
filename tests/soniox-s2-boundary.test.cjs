// S2.2 regressions for the pending F3 case (notes/revision-codex-s2.1-2026-10-04.md): a capture boundary
// must also partition the words already received, including final times the engine accepts up to
// sentMs + 100 ms, and no close (endpoint, speaker change, limit, pause) may emit a turn that a later cut
// could cross. Real coordinator + real Soniox engine over a fake socket where noted; no device or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationTurns } = require('../.test-build/app/conversation-detection/conversation-turns.js');
const { stack } = require('./soniox-s2-stack.cjs');

const tok = (speaker, text, start, end) => ({ text, speaker, is_final: true, start_ms: start, end_ms: end });
const rows = (turns) => turns.map((t) => [t.text, t.startMs, t.endMs, t.closedBy]);

/** No emitted turn may hold times on both sides of a boundary unless it is a single crossing word. */
function assertNoCrossing(turns, boundaries, alone = []) {
  for (const turn of turns) {
    if (turn.startMs === null) continue;
    for (const b of boundaries) {
      if (turn.startMs < b && turn.endMs > b) assert.ok(alone.includes(turn.text), `${turn.text} crosses ${b}`);
    }
  }
}

async function live() {
  const h = stack(); await h.on(); h.audio(1000);
  const turns = [];
  h.detector.subscribeTurns((t) => turns.push(t));
  return { h, turns };
}

/** Pure turn builder with audio reports, as the engine drives it. */
function pure() {
  let relation = 'desconocido', version = 0;
  const turns = new ConversationTurns({ relation: () => relation, associationVersion: () => version });
  const out = [];
  turns.subscribe((t) => out.push(t));
  turns.start('s1', 1);
  const fin = (speaker, text, startMs, endMs) => turns.accept({ text, speaker, startMs, endMs, valid: true });
  return { turns, out, fin, set(r, v) { relation = r; version = v; } };
}

test('S2.2 Codex case: tokens already open on both sides of a new cut become two turns with real times', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' después', 1010, 1090)]); // no endpoint; both accepted as valid
  h.soniox.resetStream(); // boundary 1000 recorded after the tokens were buffered
  // «antes» can never be crossed again; «después» ends beyond the audio sent and waits.
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera']]);
  h.audio(100); // audio sent passes 1090: no later cut can fall inside it
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera'], ['después', 1010, 1090, 'frontera']]);
  assertNoCrossing(turns, [1000]);
  h.detector.setEnabled(false);
  assert.equal(h.detector.lastSessionSummary().invalidTimingTokens, 0);
  assert.equal(h.detector.lastSessionSummary().turns, 2);
});

test('S2.2 Codex case: a word crossing the new cut stands alone with its real times', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' cruza', 900, 1050)]);
  h.soniox.resetStream();
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera'], ['cruza', 900, 1050, 'frontera']]);
  assertNoCrossing(turns, [1000], ['cruza']);
  h.detector.setEnabled(false);
  assert.equal(h.detector.lastSessionSummary().invalidTimingTokens, 0);
});

test('S2.2 OFF right after the cut emits the held turn as is, still separated', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' después', 1010, 1090)]);
  h.soniox.resetStream();
  h.detector.setEnabled(false); // no boundary can follow the session end
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera'], ['después', 1010, 1090, 'frontera']]);
});

test('S2.2 an endpoint before the cut cannot emit a turn whose last word ends beyond the audio sent', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' después', 1010, 1090), { text: '<end>', is_final: true }]);
  assert.deepEqual(turns, [], 'held: a cut at the current audio position would fall inside it');
  h.soniox.resetStream();
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera']]);
  h.audio(100);
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera'], ['después', 1010, 1090, 'endpoint']]);
  assertNoCrossing(turns, [1000]);
  h.detector.setEnabled(false);
  // Control: with no cut the same endpoint still yields one turn as soon as the audio sent covers it.
  const plain = await live();
  plain.h.msg([tok('2', 'antes', 500, 690), tok('2', ' después', 1010, 1090), { text: '<end>', is_final: true }]);
  plain.h.audio(100);
  assert.deepEqual(rows(plain.turns), [['antes después', 500, 1090, 'endpoint']]);
  plain.h.detector.setEnabled(false);
});

test('S2.2 a speaker change before the cut keeps closing order and is partitioned by the cut', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' después', 1010, 1090), tok('1', ' hola', 1090, 1100)]);
  assert.deepEqual(turns, []);
  h.soniox.resetStream();
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera']]);
  h.audio(100);
  assert.deepEqual(turns.map((t) => [t.speaker, t.text, t.closedBy]),
    [['2', 'antes', 'frontera'], ['2', 'después', 'cambio-hablante'], ['1', 'hola', 'frontera']]);
  assert.deepEqual(turns.map((t) => t.seq), [1, 2, 3]);
  assertNoCrossing(turns, [1000]);
  h.detector.setEnabled(false);
});

test('S2.2 the length limit before the cut goes through the same rule and never cuts a word', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'x'.repeat(596), 400, 690), tok('2', ' tras', 1010, 1090), tok('2', ' fin', 1090, 1100)]);
  assert.deepEqual(turns, [], 'limit reached: closed at the next word, held because «tras» ends beyond 1000');
  h.soniox.resetStream();
  assert.deepEqual(turns.map((t) => [t.text.slice(0, 3), t.closedBy]), [['xxx', 'frontera']]);
  h.audio(100);
  assert.deepEqual(turns.map((t) => [t.text.slice(0, 4), t.startMs, t.endMs, t.closedBy]),
    [['xxxx', 400, 690, 'frontera'], ['tras', 1010, 1090, 'limite'], ['fin', 1090, 1100, 'frontera']]);
  assertNoCrossing(turns, [1000]);
  h.detector.setEnabled(false);
});

test('S2.2 a pause close is always final: its evidence implies the words end well before the audio sent', async () => {
  const { h, turns } = await live();
  h.audio(1000); // 2000 ms sent
  h.msg([tok('1', 'uno', 100, 190)], { final_audio_proc_ms: 1700 });
  assert.deepEqual(rows(turns), [['uno', 100, 190, 'pausa']]);
  // The latest word that a pause can close ends at progress − 1500 <= sent + 100 − 1500.
  h.msg([tok('1', 'dos', 1960, 2090)], { final_audio_proc_ms: 2100 });
  assert.equal(turns.length, 1, 'no pause evidence for a word at the live edge');
  h.detector.setEnabled(false);
  assert.deepEqual(rows(turns).at(-1), ['dos', 1960, 2090, 'fin-sesion']);
});

test('S2.2 sub-word tokens: the cut never splits a word, the crossing word stays whole and alone', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' des', 960, 1000), tok('2', 'pués', 1000, 1090)]);
  h.soniox.resetStream();
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera'], ['después', 960, 1090, 'frontera']]);
  assertNoCrossing(turns, [1000], ['después']);
  h.detector.setEnabled(false);
  // After a recorded cut: a later sub-word piece moves its word across it; the words before close there.
  const p = pure();
  p.turns.boundary(1000);
  p.fin('2', 'antes', 700, 790); p.fin('2', ' cru', 950, 990); p.fin('2', 'za', 990, 1050);
  assert.deepEqual(rows(p.out), [['antes', 700, 790, 'frontera']]);
  p.fin('2', ' luego', 1200, 1290); p.turns.marker('end');
  assert.deepEqual(rows(p.out), [['antes', 700, 790, 'frontera'], ['cruza', 950, 1050, 'frontera'], ['luego', 1200, 1290, 'endpoint']]);
});

test('S2.2 a held turn is partitioned again by a later cut; emitted turns are never rewritten', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' después', 1010, 1090)]);
  h.soniox.resetStream(); // cut at 1000
  h.audio(50); // 1050: «después» still ends beyond the audio sent
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera']]);
  h.soniox.resetStream(); // cut at 1050, inside «después»
  assert.deepEqual(rows(turns), [['antes', 500, 690, 'frontera'], ['después', 1010, 1090, 'frontera']]);
  assertNoCrossing(turns, [1000, 1050], ['después']);
  h.soniox.resetStream(); // repeated position: nothing new
  h.msg([tok('2', 'luego', 1100, 1140)]); h.audio(100);
  h.detector.setEnabled(false);
  assert.deepEqual(turns.map((t) => [t.text, t.seq]), [['antes', 1], ['después', 2], ['luego', 3]]);
});

test('S2.2 exact limits: ending at the audio sent is final; ending one millisecond later waits', () => {
  const p = pure();
  p.turns.audio(1000);
  p.fin('1', 'justo', 900, 1000); p.turns.marker('end');
  assert.deepEqual(rows(p.out), [['justo', 900, 1000, 'endpoint']]);
  p.fin('1', 'pasa', 950, 1001); p.turns.marker('end');
  assert.equal(p.out.length, 1);
  p.turns.boundary(1000); // 950–1001 has the cut strictly inside: it stands alone, final at once
  assert.deepEqual(rows(p.out).at(-1), ['pasa', 950, 1001, 'endpoint']);
  p.fin('1', 'en', 1000, 1050); p.turns.marker('end'); // starts exactly at the cut: after it, held to 1050
  assert.equal(p.out.length, 2);
  p.turns.audio(1050);
  assert.deepEqual(rows(p.out).at(-1), ['en', 1000, 1050, 'endpoint']);
});

test('S2.2 invalid timing received before the cut keeps its placement and is never joined across it', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), { text: ' eh', speaker: '2', is_final: true, start_ms: 'x', end_ms: 600 },
    tok('2', ' después', 1010, 1090)]);
  h.soniox.resetStream();
  h.audio(100);
  assert.deepEqual(turns.map((t) => [t.text, t.timing, t.startMs, t.endMs]),
    [['antes eh', 'parcial', 500, 690], ['después', 'valido', 1010, 1090]]);
  assertNoCrossing(turns, [1000]);
  h.detector.setEnabled(false);
  assert.equal(h.detector.lastSessionSummary().invalidTimingTokens, 1);
});

test('S2.2 a late <fin> neither releases nor merges a held turn; turns keep relation and version at closing', async () => {
  const { h, turns } = await live();
  h.msg([tok('2', 'antes', 500, 690), tok('2', ' después', 1010, 1090)]);
  h.soniox.resetStream();
  h.msg([{ text: '<fin>', is_final: true }]);
  assert.deepEqual(turns.map((t) => t.text), ['antes']);
  h.detector.setEnabled(false);
  assert.deepEqual(turns.map((t) => t.text), ['antes', 'después']);
  // Relation and version are captured when the turn closes, not when a held turn is released.
  const p = pure();
  p.turns.audio(1000);
  p.set('otro', 1);
  p.fin('2', 'tarde', 990, 1080); p.turns.marker('end');
  p.set('portador', 2);
  p.turns.audio(1100);
  assert.deepEqual(p.out.map((t) => [t.text, t.relation, t.associationVersion]), [['tarde', 'otro', 1]]);
  // Fallback/OFF clear drops what is held without emitting it.
  p.fin('2', 'nunca', 1050, 1150); p.turns.marker('end');
  p.turns.clear();
  assert.equal(p.out.length, 1);
});
