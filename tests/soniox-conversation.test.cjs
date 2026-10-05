const test = require('node:test');
const assert = require('node:assert/strict');
const { SonioxConversationTranscription, SONIOX_MODEL } = require('../.test-build/app/native/soniox-conversation.js');

function localPort() {
  const events = [];
  let text = '';
  return {
    events,
    setText(value) { text = value; },
    start(language) { events.push(`start:${language}`); return true; },
    stop() { events.push('stop'); text = ''; },
    resetStream() { events.push('reset'); },
    setPhase() {},
    acceptNative() { events.push('pcm'); },
    text: () => text,
    snapshot: () => ({ enabled: true, status: 'listo', worker: true, busy: false, inputBufferedBytes: 0, accepted: 0, abstentions: 0, dropped: 0 }),
  };
}

function harness({ key = 'sk-test', engine = 'soniox' } = {}) {
  const local = localPort();
  const sockets = [];
  let now = 0, tick = null;
  const host = {
    apiKey: () => key,
    engine: () => engine,
    now: () => now,
    every(cb) { tick = cb; return () => { tick = null; }; },
    connect(url, listener) {
      const socket = { url, listener, texts: [], binary: 0, closed: false,
        sendText(message) { this.texts.push(message); return true; },
        sendBinary() { this.binary++; return true; },
        close() { this.closed = true; } };
      sockets.push(socket);
      return socket;
    },
  };
  const engineUnderTest = new SonioxConversationTranscription(local, host);
  return { local, sockets, engine: engineUnderTest, advance(ms) { now += ms; tick?.(); }, hasTick: () => !!tick };
}

const msg = (tokens, extra = {}) => JSON.stringify({ tokens, ...extra });

test('saved-profile matches automatically associate finalized labels without a phrase or manual choice', () => {
  const h = harness(); h.engine.start('auto', true); h.sockets[0].listener.onOpen();
  const events = []; h.engine.subscribeAssociation(e => events.push(e));
  for (let seq = 1; seq <= 4; seq++) {
    const startMs = (seq - 1) * 4000, endMs = seq * 4000;
    for (let i = 0; i < 80; i++) h.engine.acceptNative({}, 'posible voz');
    const speaker = seq <= 2 ? '1' : '2';
    h.sockets[0].listener.onTextMessage(msg([{ text: ' Texto sintético', is_final: true, speaker, start_ms: startMs + 200, end_ms: startMs + 3200 }], { final_audio_proc_ms: endMs }));
    h.engine.acceptProfileMatch({ seq, startMs, endMs, voicedMs: 3000, similarity: seq <= 2 ? 0.9 : 0.3 });
  }
  const identity = h.engine.snapshot().identity;
  assert.equal(identity.source, 'perfil'); assert.equal(identity.speaker, '1'); assert.equal(identity.knownOthers, 1);
  assert.equal(h.engine.lastSessionSummary(), null);
  assert.equal(events.at(-1).kind, 'perfil'); assert.deepEqual(events.at(-1).knownOthers, ['2']);
  h.engine.resetStream(); assert.equal(h.engine.snapshot().identity.speaker, undefined);
  h.engine.acceptProfileMatch({ seq: 5, startMs: 0, endMs: 4000, voicedMs: 3000, similarity: 0.99 });
  assert.equal(h.engine.snapshot().identity.speaker, undefined);
  h.engine.stop(); h.sockets[0].listener.onTextMessage(msg([]));
  assert.equal(h.engine.snapshot().identity.speaker, undefined);
});

test('without a key or with the local engine it starts on-device Whisper and opens no socket', () => {
  for (const options of [{ key: '' }, { engine: 'local' }]) {
    const h = harness(options);
    assert.equal(h.engine.start('es'), true);
    assert.deepEqual(h.local.events, ['start:es']);
    assert.equal(h.sockets.length, 0);
    assert.equal(h.engine.snapshot().engine, 'local');
  }
});

test('Soniox config enables diarization, Spanish hints and endpoint detection; key never in snapshot', () => {
  const h = harness();
  assert.equal(h.engine.start('es'), true);
  assert.equal(h.engine.snapshot().status, 'cargando');
  h.sockets[0].listener.onOpen();
  const config = JSON.parse(h.sockets[0].texts[0]);
  assert.equal(config.model, SONIOX_MODEL);
  assert.equal(config.audio_format, 'pcm_s16le');
  assert.equal(config.sample_rate, 16000);
  assert.deepEqual(config.language_hints, ['es']);
  assert.equal(config.enable_speaker_diarization, true);
  assert.equal(config.enable_endpoint_detection, true);
  const snapshot = h.engine.snapshot();
  assert.equal(snapshot.status, 'listo');
  assert.equal(snapshot.engine, 'soniox');
  assert.ok(!JSON.stringify(snapshot).includes('sk-test'));
  h.engine.acceptNative({}, 'sin actividad');
  assert.equal(h.sockets[0].binary, 1);
  assert.equal(h.engine.snapshot().soniox.sentMs, 50);
});

test('final tokens are grouped by speaker and non-final text is shown provisionally', () => {
  const h = harness();
  h.engine.start('es'); h.sockets[0].listener.onOpen();
  const l = h.sockets[0].listener;
  l.onTextMessage(msg([{ text: 'Hola', is_final: true, speaker: '1' }, { text: ' qué tal', is_final: true, speaker: '1' },
    { text: ' Bien', is_final: false, speaker: '2' }]));
  assert.equal(h.engine.text(), '1: Hola qué tal\n2: Bien');
  l.onTextMessage(msg([{ text: 'Bien', is_final: true, speaker: '2' }, { text: ', ¿y tú?', is_final: true, speaker: '2' },
    { text: '<end>', is_final: true }]));
  assert.equal(h.engine.text(), '1: Hola qué tal\n2: Bien, ¿y tú?');
  assert.equal(h.engine.snapshot().soniox.speakers, 2);
});

test('a dropped socket or server error falls back to local Whisper and keeps the earlier text', () => {
  for (const failure of ['closed', 'error']) {
    const h = harness();
    h.engine.start('es'); h.sockets[0].listener.onOpen();
    h.sockets[0].listener.onTextMessage(msg([{ text: 'Hola', is_final: true, speaker: '1' }]));
    if (failure === 'closed') h.sockets[0].listener.onClosed();
    else h.sockets[0].listener.onTextMessage(JSON.stringify({ error_code: 503, error_message: 'busy' }));
    assert.deepEqual(h.local.events, ['start:es'], failure);
    assert.equal(h.sockets[0].closed, true);
    h.local.setText('seguimos aquí');
    assert.equal(h.engine.text(), 'Texto anterior · Soniox:\n1: Hola\nLocal · sin identificación:\nseguimos aquí');
    assert.equal(h.engine.snapshot().engine, 'local (sin red)');
    h.engine.acceptNative({}, 'posible voz');
    assert.ok(h.local.events.includes('pcm'));
    // Late callbacks from the dead socket are ignored.
    h.sockets[0].listener.onTextMessage(msg([{ text: 'tarde', is_final: true, speaker: '1' }]));
    assert.ok(!h.engine.text().includes('tarde'));
  }
});

test('connection failure before open falls back to local', () => {
  const h = harness();
  h.engine.start('auto');
  h.sockets[0].listener.onFailure('dns');
  assert.deepEqual(h.local.events, ['start:auto']);
  assert.equal(h.engine.snapshot().soniox.lastError, 'dns');
});

test('stop closes the stream gracefully, clears text and ignores late messages; keepalive only in silence', () => {
  const h = harness();
  h.engine.start('es'); h.sockets[0].listener.onOpen();
  assert.ok(h.hasTick());
  h.advance(8000);
  assert.ok(h.sockets[0].texts.includes(JSON.stringify({ type: 'keepalive' })));
  h.engine.resetStream();
  assert.ok(h.sockets[0].texts.includes(JSON.stringify({ type: 'finalize' })));
  h.sockets[0].listener.onTextMessage(msg([{ text: 'Hola', is_final: true, speaker: '1' }]));
  h.engine.stop();
  assert.equal(h.sockets[0].texts.at(-1), '');
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.engine.text(), '');
  assert.equal(h.hasTick(), false);
  h.sockets[0].listener.onTextMessage(msg([{ text: 'tarde', is_final: true, speaker: '1' }]));
  h.sockets[0].listener.onClosed();
  assert.equal(h.engine.text(), '');
  assert.deepEqual(h.local.events, []);
  assert.equal(h.engine.start('es'), true);
});
