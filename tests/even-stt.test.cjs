const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const URL_OK = 'ws://100.93.23.103:18770/v1/audio/transcriptions/realtime';
const COMPLETED = 'conversation.item.input_audio_transcription.completed';
const DELTA = 'conversation.item.input_audio_transcription.delta';

function environment() {
  const timers = new Map();
  let timerId = 0;
  const sockets = [];
  const load = loader({
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    console: { log() {}, warn() {} },
    com: { faceclaw: { app: {
      FaceclawWebSocketListener: function(callbacks) { return callbacks; },
      FaceclawWebSocket: class {
        constructor(url, listener, header, value) {
          Object.assign(this, { url, listener, header, value, sent: [], closed: false, reject: false });
          sockets.push(this);
        }
        sendText(text) { if (this.reject) return false; this.sent.push(JSON.parse(text)); return true; }
        sendBinary(bytes) { if (this.reject) return false; this.sent.push(bytes); return true; }
        close() { this.closed = true; }
      }, } }, },
  }, {
    './cloud-stt': { CLOUD_STT_SAMPLE_RATE: 16000, encodeBase64: () => '', toJavaBytes: bytes => bytes },
  });
  return { load, timers, sockets };
}

/** EvenSttClient behind the same ReconnectingSttClient the app uses. */
function harness(continuous = false) {
  const env = environment();
  const { EvenSttClient } = env.load('app/native/even-stt.ts');
  const { ReconnectingSttClient } = env.load('app/native/reconnecting-stt.ts');
  const events = [], statuses = [], errors = [];
  const client = new ReconnectingSttClient(options => new EvenSttClient({ ...options, url: URL_OK }), {
    apiKey: 'clave', onTranscript: event => events.push(event),
    onStatus: status => statuses.push(status), onError: error => errors.push(error),
  }, () => continuous);
  client.start();
  const socket = () => env.sockets.at(-1);
  return { client, events, statuses, errors, timers: env.timers, sockets: env.sockets, socket,
    open() { socket().listener.onOpen(); socket().listener.onTextMessage(JSON.stringify({ type: 'session.created' })); },
    message(message) { socket().listener.onTextMessage(JSON.stringify(message)); },
  };
}

const pcm = (value, bytes = 320) => new Uint8Array(bytes).fill(value);
const finals = events => events.filter(event => event.isFinal).map(event => event.text);

test('even: Bearer key on the configured URL, flat 16 kHz session first, PCM forwarded unchanged and in order', () => {
  const h = harness();
  assert.equal(h.socket().url, URL_OK);
  assert.deepEqual([h.socket().header, h.socket().value], ['Authorization', 'Bearer clave']);
  h.client.acceptPcm(pcm(1)); // Queued by the reconnecting wrapper until ready.
  h.open();
  h.client.acceptPcm(pcm(2));
  h.client.finish();
  const [session, first, second, commit] = h.socket().sent;
  assert.deepEqual(session, { type: 'session.update', session: {
    sample_rate: 16000, language: 'auto', automatic_punctuation: true, verbatim: false } });
  assert.deepEqual([...first], [...pcm(1)]);
  assert.deepEqual([...second], [...pcm(2)]);
  assert.deepEqual(commit, { type: 'input_audio_buffer.commit' });
});

test('even: deltas accumulate into replace-semantics partials and the final arrives before committed without item ids', () => {
  const h = harness();
  h.open();
  h.message({ type: 'session.updated' });
  h.message({ type: DELTA, delta: 'Recuér' });
  h.message({ type: DELTA, delta: '' }); // The server sends many empty deltas.
  h.message({ type: DELTA, delta: 'dame llamar' });
  assert.deepEqual(h.events.map(event => [event.text, event.isFinal]), [['Recuér', false], ['Recuérdame llamar', false]]);
  h.client.finish();
  h.message({ type: COMPLETED, transcript: 'Recuérdame llamar a las siete' });
  h.message({ type: 'input_audio_buffer.committed' });
  assert.deepEqual(finals(h.events), ['Recuérdame llamar a las siete']);
  assert.equal(h.socket().closed, true, 'the last final of a finished capture closes the socket');
  assert.ok(h.statuses.includes('Listening (EVO-X2)...'));
});

test('even: continuous capture keeps one session, matches finals to commits in order and keeps the next segment live', () => {
  const h = harness(true);
  h.open();
  h.message({ type: DELTA, delta: '¿Cuál es mi glucosa?' });
  // Commit through the active EvenSttClient, as the wrapper's pause detector does.
  h.client.client.commitSegment();
  // Next segment's audio is already being transcribed before the first final lands.
  h.message({ type: DELTA, delta: 'Pon un' });
  assert.equal(h.events.at(-1).text, '¿Cuál es mi glucosa? Pon un');
  assert.equal(h.events.at(-1).transcribeText, '¿Cuál es mi glucosa?\nPon un');
  h.message({ type: COMPLETED, transcript: '¿Cuál es mi glucosa ahora mismo?' });
  h.message({ type: 'input_audio_buffer.committed' });
  assert.deepEqual(finals(h.events), ['¿Cuál es mi glucosa ahora mismo?']);
  assert.equal(h.events.at(-1).isFinal, false);
  assert.equal(h.events.at(-1).text, 'Pon un', 'the live segment survives the earlier final');
  assert.equal(h.events.filter(event => event.isFinal)[0].paragraphBreakAfter, true);
  h.message({ type: DELTA, delta: ' temporizador' });
  h.client.finish();
  h.message({ type: COMPLETED, transcript: 'Pon un temporizador de 15 minutos.' });
  assert.deepEqual(finals(h.events), ['¿Cuál es mi glucosa ahora mismo?', 'Pon un temporizador de 15 minutos.']);
  assert.equal(h.sockets.length, 1);
});

test('even: a final the server sends on its own closes the live segment; an empty commit yields an empty final', () => {
  const h = harness();
  h.open();
  h.message({ type: DELTA, delta: 'Hola' });
  h.message({ type: COMPLETED, transcript: 'Hola.' });
  assert.deepEqual(finals(h.events), ['Hola.']);
  h.client.finish();
  h.message({ type: COMPLETED, transcript: '' });
  h.message({ type: 'input_audio_buffer.committed' });
  assert.deepEqual(finals(h.events), ['Hola.', '']);
  assert.equal(h.socket().closed, true);
});

test('even: server error stops without retry; 401 on connect is final; a dropped socket reconnects', () => {
  const h = harness();
  h.open();
  h.message({ type: 'error', error: { message: 'session.update rejected' } });
  assert.deepEqual(h.errors, ['EVO-X2: session.update rejected']);
  assert.equal(h.timers.size, 0);

  const auth = harness();
  auth.socket().listener.onFailure("Expected HTTP 101 response but was '401 Unauthorized'");
  assert.equal(auth.timers.size, 0);
  assert.equal(auth.errors.length, 1);

  const drop = harness();
  drop.open();
  drop.socket().listener.onClosed();
  assert.equal(drop.timers.size, 1);
  assert.match(drop.statuses.at(-1), /Reconnecting/);
  drop.client.stop();
  assert.equal(drop.timers.size, 0);
});

test('even: provider selection needs both a key and a ws:// URL, otherwise stays on-device', () => {
  const env = environment();
  const { createCloudSttClient, usesCloudStt } = env.load('app/native/cloud-stt-provider.ts');
  const { evenSttUrl } = env.load('app/native/even-stt.ts');
  const statuses = [];
  const options = { onTranscript() {}, onStatus: status => statuses.push(status), onError() {} };
  const base = { provider: 'even', elevenLabsApiKey: '', openAiApiKey: '', sonioxApiKey: '', evenAsrUrl: URL_OK };
  assert.equal(usesCloudStt(base), false);
  assert.equal(createCloudSttClient(base, options, () => false), null);
  const badUrl = { ...base, evenAsrKey: 'k', evenAsrUrl: 'http://even:18770' };
  assert.equal(usesCloudStt(badUrl), false);
  assert.equal(createCloudSttClient(badUrl, options, () => false), null);
  assert.deepEqual(statuses, ['No EVO-X2 key set; using on-device voice.', 'EVO-X2 address is not a ws:// URL; using on-device voice.']);
  const ok = { ...base, evenAsrKey: ' k ', evenAsrUrl: ` ${URL_OK} ` };
  assert.equal(usesCloudStt(ok), true);
  createCloudSttClient(ok, options, () => false).start();
  assert.deepEqual(env.sockets.map(s => [s.url, s.header, s.value]), [[URL_OK, 'Authorization', 'Bearer k']]);
  assert.equal(evenSttUrl('wss://even.tail497f97.ts.net:18770/v1/audio/transcriptions/realtime') !== null, true);
  for (const bad of ['', 'ws://', 'ws://host with space/x', 'ftp://even/x']) assert.equal(evenSttUrl(bad), null, bad);
});
