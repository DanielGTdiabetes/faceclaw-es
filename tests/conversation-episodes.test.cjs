const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationEpisodeTracker } = require('../.test-build/app/conversation-detection/conversation-episodes.js');

const policy = { candidateMs: 15_000, silenceMs: 30_000, maxTurns: 12, maxChars: 6000 };
function harness(config = policy) {
  let now = 1000, seq = 0;
  const tracker = new ConversationEpisodeTracker(() => now, config);
  tracker.start('s1', 1);
  const association = (patch = {}) => ({ v: 1, sessionId: 's1', streamId: 1, version: 1, kind: 'manual',
    speaker: '1', knownOthers: ['2'], ...patch });
  tracker.association(association());
  const turn = (speaker = '1', text = 'Tema de mañana', patch = {}) => ({ v: 1, sessionId: 's1', streamId: 1,
    seq: ++seq, engine: 'soniox', speaker, relation: speaker === '1' ? 'portador' : 'otro', associationVersion: 1,
    text, timing: 'valido', startMs: seq * 1000, endMs: seq * 1000 + 500, closedBy: 'endpoint', ...patch });
  return { tracker, turn, association, advance: ms => { now += ms; },
    candidate() { tracker.accept(turn()); tracker.accept(turn('2')); return tracker.assessmentContext(); } };
}

test('endpoints, elapsed time and two voices alone never confirm a topic', () => {
  const h = harness();
  assert.equal(h.tracker.accept(h.turn()), true);
  assert.equal(h.tracker.assessmentContext(), null);
  assert.equal(h.tracker.accept(h.turn('2')), true);
  h.advance(5000);
  assert.equal(h.tracker.snapshot().state, 'candidata');
  assert.equal(h.tracker.snapshot().eligible, true);
  assert.equal(h.tracker.confirmedContext(), null);
});

test('greeting and courtesy assessment clears all context silently', () => {
  const h = harness();
  h.tracker.accept(h.turn('1', 'Buenos días'));
  h.tracker.accept(h.turn('2', 'Hola, buenos días'));
  const request = h.tracker.assessmentContext();
  assert.equal(h.tracker.assess(request.ref, 'cortesia'), true);
  assert.deepEqual([h.tracker.snapshot().state, h.tracker.snapshot().chars, h.tracker.snapshot().lastEnd],
    ['esperando', 0, 'cortesia']);
  assert.equal(h.tracker.acceptsOutput(request.ref), false);
  assert.equal(h.tracker.confirmedContext(), null);
});

test('a current topic verdict confirms context; uncertainty does not', () => {
  for (const verdict of ['tema', 'incierto']) {
    const h = harness(); const request = h.candidate();
    assert.equal(h.tracker.assess(request.ref, verdict), true);
    assert.equal(h.tracker.snapshot().state, verdict === 'tema' ? 'activa' : 'esperando');
    assert.equal(!!h.tracker.confirmedContext(), verdict === 'tema');
    assert.equal(h.tracker.assess(request.ref, 'tema'), false);
  }
});

test('new text in the same episode keeps a late tema but not a late dismissal', () => {
  const tema = harness(); const request = tema.candidate();
  tema.tracker.accept(tema.turn('1', 'Otro tema'));
  assert.equal(tema.tracker.assess(request.ref, 'tema'), true);
  assert.equal(tema.tracker.confirmedContext().turns.length, 3, 'the newer turn is part of the context');
  const dismissed = harness(); const stale = dismissed.candidate();
  dismissed.tracker.accept(dismissed.turn('1', 'Otro tema'));
  assert.equal(dismissed.tracker.assess(stale.ref, 'cortesia'), false);
  assert.equal(dismissed.tracker.snapshot().state, 'candidata', 'unassessed newer turns keep the episode open');
});

test('identity correction, interruption, OFF and a newer stream reject late verdicts', () => {
  for (const change of ['identity', 'gap', 'off', 'stream']) {
    const h = harness(); const request = h.candidate();
    if (change === 'identity') h.tracker.association(h.association({ version: 2, speaker: '2' }));
    if (change === 'gap') h.tracker.interrupt();
    if (change === 'off') h.tracker.stop();
    if (change === 'stream') h.tracker.start('s2', 2);
    assert.equal(h.tracker.assess(request.ref, 'tema'), false, change);
    assert.equal(h.tracker.confirmedContext(), null, change);
  }
});

test('candidacy expires by monotonic clock even without a timer or snapshot polling', () => {
  const h = harness(); const request = h.candidate();
  h.advance(policy.candidateMs);
  assert.equal(h.tracker.assess(request.ref, 'tema'), false);
  assert.equal(h.tracker.snapshot().lastEnd, 'caducidad');
  assert.equal(h.tracker.snapshot().chars, 0);
});

test('silence closes a confirmed episode; late output cannot revive it', () => {
  const h = harness(); const request = h.candidate(); h.tracker.assess(request.ref, 'tema');
  assert.equal(h.tracker.acceptsOutput(request.ref), true);
  h.advance(policy.silenceMs);
  assert.equal(h.tracker.acceptsOutput(request.ref), false);
  assert.equal(h.tracker.snapshot().lastEnd, 'silencio');
  assert.equal(h.tracker.confirmedContext(), null);
});

test('invalid timing, wrong relations and unassociated sessions cannot become candidates', () => {
  const h = harness();
  for (const patch of [{ timing: 'parcial' }, { timing: 'invalido' },
    { relation: 'portador', speaker: '2' }, { relation: 'otro', speaker: '1' }, { text: '   ' }]) {
    assert.equal(h.tracker.accept(h.turn('1', 'Test', patch)), false);
  }
  h.tracker.association(h.association({ version: 2, speaker: null, kind: 'borrado' }));
  assert.equal(h.tracker.accept(h.turn('1', 'Test', { associationVersion: 2 })), false);
  assert.equal(h.tracker.snapshot().turns, 0);
  assert.equal(h.tracker.assessmentContext(), null);
});

test('unknown labels remain in the context without proving an interlocutor or filtering any audio source', () => {
  const h = harness();
  assert.equal(h.tracker.accept(h.turn('3', 'Another voice', { relation: 'desconocido' })), true);
  h.tracker.accept(h.turn('1'));
  assert.equal(h.tracker.assessmentContext(), null);
  h.tracker.accept(h.turn('2'));
  const request = h.tracker.assessmentContext();
  assert.equal(request.turns[0].relation, 'desconocido');
  assert.equal(request.turns[0].text, 'Another voice');
  assert.equal(h.tracker.assess(request.ref, 'tema'), true);
});

test('old events, duplicated turns and stale association versions never alter current context', () => {
  const h = harness(); const request = h.candidate();
  const before = h.tracker.snapshot().chars;
  assert.equal(h.tracker.association(h.association({ sessionId: 'old', kind: 'fin-sesion' })), false);
  assert.equal(h.tracker.accept(h.turn('1', 'Old', { seq: 1 })), false);
  assert.equal(h.tracker.accept(h.turn('1', 'Old', { associationVersion: 0 })), false);
  assert.equal(h.tracker.accept(h.turn('1', 'Old', { streamId: 9 })), false);
  assert.equal(h.tracker.snapshot().chars, before);
  assert.equal(h.tracker.assess(request.ref, 'tema'), true);
});

test('capture cuts and session endings cannot join text across a boundary', () => {
  for (const closedBy of ['frontera', 'fin-sesion']) {
    const h = harness(); const request = h.candidate();
    assert.equal(h.tracker.accept(h.turn('1', 'Final', { closedBy })), false);
    assert.equal(h.tracker.assess(request.ref, 'tema'), false);
    assert.equal(h.tracker.snapshot().chars, 0);
    if (closedBy === 'fin-sesion') {
      assert.equal(h.tracker.snapshot().state, 'off');
      assert.equal(h.tracker.accept(h.turn()), false);
    }
  }
});

test('RAM bounds keep whole turns and recompute eligibility from retained context', () => {
  const h = harness({ ...policy, maxTurns: 2, maxChars: 20 });
  h.tracker.accept(h.turn('1', 'one'));
  h.tracker.accept(h.turn('2', 'two'));
  const request = h.tracker.assessmentContext();
  h.tracker.accept(h.turn('2', 'three'));
  assert.equal(h.tracker.snapshot().eligible, false);
  assert.equal(h.tracker.assess(request.ref, 'tema'), false);
  assert.equal(h.tracker.accept(h.turn('1', 'x'.repeat(21))), false);
  assert.equal(h.tracker.snapshot().turns, 2);
  assert.equal(h.tracker.snapshot().chars, 8);
});

test('snapshots exclude text and returned text objects cannot mutate retained context', () => {
  const h = harness();
  h.tracker.accept(h.turn('1', 'private example'));
  h.tracker.accept(h.turn('2', 'other example'));
  assert.ok(!JSON.stringify(h.tracker.snapshot()).includes('example'));
  const request = h.tracker.assessmentContext();
  request.turns[0].text = 'modified';
  request.ref.revision = -1;
  const fresh = h.tracker.assessmentContext();
  assert.equal(fresh.turns[0].text, 'private example');
  h.tracker.assess(fresh.ref, 'tema');
  const outputRef = h.tracker.confirmedContext().ref;
  h.tracker.accept(h.turn('1', 'new example'));
  assert.equal(h.tracker.acceptsOutput(outputRef), true, 'a newer revision of the same episode still accepts it');
  h.tracker.interrupt();
  assert.equal(h.tracker.acceptsOutput(outputRef), false);
  h.tracker.stop();
  assert.equal(h.tracker.snapshot().chars, 0);
});

test('configured limits are validated and caller mutation cannot extend retention', () => {
  assert.throws(() => harness({ ...policy, candidateMs: NaN }));
  assert.throws(() => harness({ ...policy, maxTurns: 1 }));
  const mutable = { ...policy }; const h = harness(mutable); const request = h.candidate();
  mutable.candidateMs = 1_000_000;
  h.advance(policy.candidateMs);
  assert.equal(h.tracker.assess(request.ref, 'tema'), false);
});
