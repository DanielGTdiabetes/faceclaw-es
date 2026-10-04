// Shared S2 integration fixture: real coordinator + real Soniox engine over a fake socket.
// No device, network, audio or provider: everything runs in RAM on one fake monotonic clock.
const { SonioxConversationTranscription } = require('../.test-build/app/native/soniox-conversation.js');
const { ConversationCaptureCoordinator } = require('../.test-build/app/conversation-detection/coordinator.js');

function localPort() {
  const events = [];
  let text = '';
  return { events, setText(v) { text = v; },
    start(language) { events.push(`start:${language}`); return true; }, stop() { events.push('stop'); text = ''; },
    resetStream() { events.push('reset'); }, setPhase() {}, acceptNative() { events.push('pcm'); }, text: () => text,
    snapshot: () => ({ enabled: true, status: 'listo', worker: false, busy: false, inputBufferedBytes: 0, accepted: 0, abstentions: 0, dropped: 0 }) };
}

/** Real coordinator + real Soniox engine over a fake socket, one monotonic clock and interval timers. */
function stack({ engine = 'soniox', key = 'sk-test' } = {}) {
  let now = 1000;
  const timers = new Set();
  const every = (cb) => { timers.add(cb); return () => timers.delete(cb); };
  const sockets = [], leases = [];
  const local = localPort();
  const soniox = new SonioxConversationTranscription(local, { apiKey: () => key, engine: () => engine, now: () => now, every,
    connect(url, listener) {
      const socket = { listener, texts: [], binary: 0, closed: false,
        sendText(m) { this.texts.push(m); return true; }, sendBinary() { this.binary++; return true; }, close() { this.closed = true; } };
      sockets.push(socket); return socket;
    } });
  let environment = { available: true, reason: '', session: {} };
  const detector = new ConversationCaptureCoordinator({
    environment: () => environment, prepare: () => Promise.resolve(true),
    acquire(pcm, revoked, failed) { const lease = { pcm, revoked, failed, stopped: false, stop() { this.stopped = true; }, diagnostics: () => '{}' };
      leases.push(lease); return lease; },
    now: () => now, every, transcription: soniox,
  });
  const h = {
    detector, soniox, sockets, leases, local,
    get now() { return now; },
    async on() {
      detector.setEnabled(true, true, 'off', { language: 'es' });
      sockets.at(-1)?.listener.onOpen();
      detector.refresh(); await Promise.resolve(); await Promise.resolve();
    },
    /** `ms` of contiguous PCM through the real coordinator path (50 ms chunks). */
    audio(ms) {
      for (let t = 0; t < ms; t += 50) {
        now += 50; leases.at(-1).pcm(new Uint8Array(1600)); detector.acceptNativePcm({});
        for (const cb of [...timers]) cb();
      }
    },
    wait(ms) { now += ms; for (const cb of [...timers]) cb(); },
    /** Advances the monotonic clock without running any periodic callback (a delayed timer). */
    skip(ms) { now += ms; },
    msg(tokens, extra = {}, socket = sockets.at(-1)) { socket.listener.onTextMessage(JSON.stringify({ tokens, ...extra })); },
    identity: () => detector.snapshot().transcription.identity,
    env(patch) { environment = { ...environment, ...patch }; detector.refresh(); },
  };
  return h;
}

module.exports = { localPort, stack };
