const test = require('node:test');
const assert = require('node:assert/strict');
const { SonioxConversationTranscription } = require('../.test-build/app/native/soniox-conversation.js');
const { ConversationChannel } = require('../.test-build/app/assistant/conversation-channel.js');
const { ConversationHermesRuntime } = require('../.test-build/app/conversation-detection/conversation-hermes.js');

test('manual ON → local profile → Soniox identity → Hermes contribution requires no wearer action', () => {
  let now = 1000, listener, enabled = false;
  const observers = new Set(), timers = new Set(), frames = [], outputs = [];
  const every = cb => { timers.add(cb); return () => timers.delete(cb); };
  const engine = new SonioxConversationTranscription({}, {
    apiKey: () => 'synthetic', engine: () => 'soniox', now: () => now, every,
    connect(_url, callbacks) { listener = callbacks; return { sendText: () => true, sendBinary: () => true, close() {} }; },
  });
  const source = { snapshot: () => ({ enabled, state: enabled ? 'escuchando' : 'desactivado', transcription: engine.snapshot() }),
    subscribe(cb) { observers.add(cb); cb(this.snapshot()); return () => observers.delete(cb); },
    wearerActionRef: () => engine.wearerActionRef(),
    subscribeTurns: cb => engine.subscribeTurns(cb), subscribeAssociation: cb => engine.subscribeAssociation(cb),
  };
  const channel = new ConversationChannel({ now: () => now, send: frame => { frames.push(frame); return true; }, after: every });
  channel.negotiate(['conv/1']);
  const runtime = new ConversationHermesRuntime(source, channel, { now: () => now, every, changed() {}, onOutput: text => outputs.push(text) },
    { candidateMs: 15000, silenceMs: 30000, maxTurns: 12, maxChars: 6000 });
  assert.equal(runtime.begin(80), true);
  enabled = true; engine.start('auto', true); listener.onOpen();
  for (const cb of observers) cb(source.snapshot());
  let streamMs = 0;
  function speech(speaker, duration, text) {
    const start = streamMs;
    for (let ms = 0; ms < duration; ms += 50) engine.acceptNative({}, 'posible voz');
    streamMs += duration;
    listener.onTextMessage(JSON.stringify({ tokens: [
      { speaker, text, is_final: true, start_ms: start + 200, end_ms: streamMs - 800 },
      { text: '<end>', is_final: true },
    ], final_audio_proc_ms: streamMs }));
    return { startMs: start, endMs: streamMs, voicedMs: duration - 1000 };
  }
  for (let seq = 1; seq <= 4; seq++) {
    const timing = speech(seq <= 2 ? '1' : '2', 4000, ' Texto sintético');
    engine.acceptProfileMatch({ seq, ...timing, similarity: seq <= 2 ? 0.9 : 0.3 });
  }
  assert.equal(engine.snapshot().identity.source, 'perfil');
  speech('1', 3000, ' Podemos reservar el tren mañana.');
  speech('2', 3000, ' Conviene comparar los horarios.');
  now += 2000;
  for (const timer of [...timers]) timer();
  const assessment = frames.find(f => f.type === 'assess');
  assert.ok(assessment); assert.deepEqual(assessment.turns.map(t => t.relation), ['portador', 'otro']);
  channel.handle({ chan: 'conv', type: 'result', requestId: assessment.requestId, ref: assessment.ref, mode: 'assess', verdict: 'tema' });
  const assistance = frames.find(f => f.type === 'assist'); assert.ok(assistance);
  channel.handle({ chan: 'conv', type: 'result', requestId: assistance.requestId, ref: assistance.ref, mode: 'assist', kind: 'mensaje', text: 'Una aportación sintética.' });
  assert.deepEqual(outputs.filter(Boolean), ['Una aportación sintética.']);
  runtime.dispose(); engine.stop();
});
