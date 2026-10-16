const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

function environment() {
  const timers = new Map();
  let timerId = 0;
  const load = loader({
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    console: { log() {}, warn() {} },
    com: { faceclaw: { app: {
      FaceclawWebSocketListener: function(callbacks) { return callbacks; },
      FaceclawWebSocket: class { constructor(url) { this.url = url; } sendText() { return true; } sendBinary() { return true; } close() {} },
    } } },
  }, { './cloud-stt': { CLOUD_STT_SAMPLE_RATE: 16000, encodeBase64: () => '', toJavaBytes: bytes => bytes } });
  return { load, timers, fire(delay) {
    const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `no timer of ${delay} ms`);
    timers.delete(entry[0]);
    entry[1].fn();
  } };
}

/** FallbackSttClient over a scripted remote; `local` resolves when the test says so. */
function harness() {
  const env = environment();
  const { FallbackSttClient, MAX_FALLBACK_BYTES } = env.load('app/native/fallback-stt.ts');
  const remotes = [];
  const events = [], statuses = [], errors = [], localCalls = [];
  const client = new FallbackSttClient(options => {
    const remote = { options, pcm: [], started: false, finished: false, stopped: false,
      start() { this.started = true; }, acceptPcm(pcm) { this.pcm.push(pcm); },
      finish() { this.finished = true; }, stop() { this.stopped = true; } };
    remotes.push(remote);
    return remote;
  }, {
    apiKey: 'k', onTranscript: event => events.push(event),
    onStatus: status => statuses.push(status), onError: error => errors.push(error),
  }, pcm => new Promise((resolve, reject) => localCalls.push({ pcm, resolve, reject })));
  client.start();
  return { client, env, remote: () => remotes.at(-1), remotes, events, statuses, errors, localCalls, MAX_FALLBACK_BYTES };
}

const pcm = (value, bytes = 320) => new Uint8Array(bytes).fill(value);
const flush = () => new Promise(resolve => setImmediate(resolve));
const finals = events => events.filter(event => event.isFinal).map(event => event.text);

test('fallback: a healthy remote delivers its own final once and the phone model is never used', () => {
  const h = harness();
  h.remote().options.onReady();
  h.client.acceptPcm(pcm(1));
  h.remote().options.onTranscript({ text: 'Pon un', isFinal: false });
  h.client.finish();
  assert.equal(h.remote().finished, true);
  h.remote().options.onTranscript({ text: 'Pon un temporizador.', isFinal: true });
  assert.deepEqual(h.events.map(event => [event.text, event.isFinal]), [['Pon un', false], ['Pon un temporizador.', true]]);
  assert.equal(h.env.timers.size, 0, 'connect and final deadlines are cleared');
  assert.equal(h.localCalls.length, 0);
  h.remote().options.onTranscript({ text: 'duplicate', isFinal: true });
  assert.deepEqual(finals(h.events), ['Pon un temporizador.']);
});

test('fallback: no session within the connect deadline transcribes the whole utterance on the phone', async () => {
  const h = harness();
  h.client.acceptPcm(pcm(1));
  h.env.fire(2000);
  assert.equal(h.remote().stopped, true);
  assert.match(h.statuses.at(-1), /EVO-X2 unavailable \(no answer within 2000 ms\); using on-device voice\./);
  h.client.acceptPcm(pcm(2)); // Audio after the failure is still kept, no longer sent.
  assert.equal(h.remote().pcm.length, 1);
  h.client.finish();
  assert.equal(h.localCalls.length, 1);
  assert.deepEqual([...h.localCalls[0].pcm], [...pcm(1), ...pcm(2)]);
  h.localCalls[0].resolve(' ¿Qué tiempo hace? ');
  await flush();
  assert.deepEqual(finals(h.events), ['¿Qué tiempo hace?']);
});

test('fallback: a drop mid-utterance waits for release, then decodes locally; late remote events are ignored', async () => {
  const h = harness();
  const remote = h.remote();
  remote.options.onReady();
  h.client.acceptPcm(pcm(1));
  remote.options.onDisconnected('EVO-X2 connection closed.');
  assert.equal(h.localCalls.length, 0, 'still capturing: nothing to decode yet');
  remote.options.onTranscript({ text: 'stale', isFinal: true });
  h.client.acceptPcm(pcm(2));
  h.client.finish();
  h.localCalls[0].resolve('Hola');
  await flush();
  assert.deepEqual(finals(h.events), ['Hola']);
});

test('fallback: a missing final after release falls back, and the remote final racing in later is dropped', async () => {
  const h = harness();
  const remote = h.remote();
  remote.options.onReady();
  h.client.acceptPcm(pcm(1));
  h.client.finish();
  h.env.fire(3000);
  assert.match(h.statuses.join('\n'), /no final within 3000 ms/);
  remote.options.onTranscript({ text: 'remote late', isFinal: true });
  h.localCalls[0].resolve('local');
  await flush();
  assert.deepEqual(finals(h.events), ['local']);
});

test('fallback: stop while the phone decodes discards its late result', async () => {
  const h = harness();
  h.client.acceptPcm(pcm(1));
  h.env.fire(2000);
  h.client.finish();
  h.client.stop(); // A new capture replaced this one.
  h.localCalls[0].resolve('too late');
  await flush();
  assert.deepEqual(h.events, []);
});

test('fallback: no phone model reports one error and no final; a 401 says the key was rejected', async () => {
  const h = harness();
  h.remote().options.onError("Expected HTTP 101 response but was '401 Unauthorized'");
  assert.equal(h.statuses.at(-1), 'EVO-X2 rejected the key; using on-device voice.');
  h.client.acceptPcm(pcm(1));
  h.client.finish();
  h.localCalls[0].reject(new Error('no on-device Whisper model downloaded'));
  await flush();
  assert.deepEqual(h.errors, ['EVO-X2 unavailable and on-device voice failed: no on-device Whisper model downloaded']);
  assert.deepEqual(finals(h.events), []);
});

test('fallback: the RAM buffer keeps at most thirty seconds and a server-side final releases it', () => {
  const h = harness();
  h.remote().options.onReady();
  h.client.acceptPcm(new Uint8Array(h.MAX_FALLBACK_BYTES - 100));
  h.client.acceptPcm(pcm(7, 300));
  assert.equal(h.client.bytes, h.MAX_FALLBACK_BYTES);
  h.remote().options.onTranscript({ text: 'Primera parte.', isFinal: true }); // before release
  assert.equal(h.client.bytes, 0);
  assert.deepEqual(finals(h.events), ['Primera parte.']);
});

test('fallback: only the self-hosted provider in push-to-talk gets it; continuous capture and other providers reconnect', () => {
  const env = environment();
  const { createCloudSttClient } = env.load('app/native/cloud-stt-provider.ts');
  const options = { onTranscript() {}, onStatus() {}, onError() {} };
  const local = async () => '';
  const even = { provider: 'even', elevenLabsApiKey: '', openAiApiKey: '', sonioxApiKey: 's',
    evenAsrKey: 'k', evenAsrUrl: 'ws://100.93.23.103:18770/v1/audio/transcriptions/realtime' };
  assert.equal(createCloudSttClient(even, options, () => false, local).constructor.name, 'FallbackSttClient');
  assert.equal(createCloudSttClient(even, options, () => true, local).constructor.name, 'ReconnectingSttClient');
  assert.equal(createCloudSttClient(even, options, () => false).constructor.name, 'ReconnectingSttClient');
  assert.equal(createCloudSttClient({ ...even, provider: 'soniox' }, options, () => false, local).constructor.name, 'ReconnectingSttClient');
});
