const test = require('node:test');
const assert = require('node:assert/strict');
const { stack } = require('./soniox-s2-stack.cjs');

for (const rejection of ['false', 'throw']) {
  test(`audio send ${rejection}: one fallback, rejected chunk delivered locally, counters and redacted state retained`, async () => {
    const h = stack(); await h.on(); h.audio(66_000);
    h.msg([{ text: 'Hola', is_final: true, speaker: '1', start_ms: 100, end_ms: 400 }],
      { final_audio_proc_ms: 35_520 });
    const socket = h.sockets[0];
    socket.diagnostics = () => ({ state: 'failed', queuedBytes: 1600, failure: 'network', closeCode: null });
    socket.sendBinary = () => { if (rejection === 'throw') throw new Error('native send'); return false; };
    h.audio(50);
    assert.equal(h.soniox.snapshot().engine, 'local (sin red)');
    assert.equal(h.local.events.filter(e => e === 'pcm').length, 1);
    assert.equal(h.soniox.snapshot().soniox.sentMs, 66_000);
    socket.listener.onFailure('late');
    h.detector.setEnabled(false);
    const summary = h.detector.lastSessionSummary();
    assert.equal(summary.errors, 1);
    assert.equal(summary.fallbacks, 1);
    assert.equal(summary.backlogAtStopMs, 30_480);
    assert.equal(summary.lastErrorCategory, 'envio-audio');
    assert.deepEqual(summary.transportFailure, { state: 'failed', queuedBytes: 1600, failure: 'network', closeCode: null });
    assert.equal(summary.identity.attempts, 0);
    assert.equal(summary.identity.manualAssignments, 0);
    assert.equal(h.soniox.text(), '');
  });
}

test('unidentified Soniox labels never become Yo through fallback or the next session', async () => {
  const h = stack(); await h.on(); h.audio(1000);
  h.msg([{ text: 'Hola', is_final: true, speaker: '1', start_ms: 100, end_ms: 400 }]);
  assert.equal(h.soniox.text(), '1: Hola');
  h.sockets[0].listener.onFailure('disconnected');
  h.local.setText('seguimos');
  assert.equal(h.soniox.text(), 'Texto anterior · Soniox:\n1: Hola\nLocal · sin identificación:\nseguimos');
  h.detector.setEnabled(false);
  assert.deepEqual(h.detector.lastSessionSummary().identity,
    { state: 'sin-identificar', source: null, lastOutcome: 'motor-local', attempts: 0, manualAssignments: 0 });
  await h.on(); h.audio(1000);
  h.msg([{ text: 'Nueva', is_final: true, speaker: '1', start_ms: 100, end_ms: 400 }]);
  assert.equal(h.soniox.text(), '1: Nueva');
  h.detector.setEnabled(false);
});

test('manual association is retired at fallback but its provenance remains in the summary', async () => {
  const h = stack(); await h.on(); h.audio(1000);
  h.msg([{ text: 'Hola', is_final: true, speaker: '2', start_ms: 100, end_ms: 400 }]);
  h.detector.assignWearer(h.detector.observedSpeakers()[0]);
  assert.equal(h.soniox.text(), 'Yo: Hola');
  h.sockets[0].listener.onFailure('disconnected');
  h.local.setText('seguimos');
  assert.ok(!h.soniox.text().includes('Yo:'));
  assert.equal(h.soniox.snapshot().identity.state, 'no-disponible');
  h.detector.setEnabled(false);
  const summary = h.detector.lastSessionSummary();
  assert.equal(summary.identity.source, 'manual');
  assert.equal(summary.identity.manualAssignments, 1);
  assert.equal(summary.identity.attempts, 0);
});

for (const command of ['finalize', 'keepalive']) {
  test(`rejected ${command} falls back once instead of silently leaving a dead Soniox stream`, async () => {
    const h = stack(); await h.on(); h.audio(500);
    if (command === 'keepalive') h.env({ available: false, reason: 'suspended' });
    h.sockets[0].sendText = () => false;
    if (command === 'finalize') h.soniox.resetStream(); else h.wait(8000);
    assert.equal(h.soniox.snapshot().engine, 'local (sin red)');
    h.detector.setEnabled(false);
    assert.equal(h.detector.lastSessionSummary().lastErrorCategory, 'envio-control');
    assert.equal(h.detector.lastSessionSummary().errors, 1);
  });
}

test('OFF does not start local fallback if the closing socket rejects control frames', async () => {
  const h = stack(); await h.on(); h.audio(500);
  h.sockets[0].sendText = () => false;
  h.detector.setEnabled(false);
  assert.deepEqual(h.local.events, []);
  assert.equal(h.detector.lastSessionSummary().fallbacks, 0);
  assert.equal(h.detector.lastSessionSummary().engineFinal, 'soniox');
});

test('unavailable diagnostics cannot prevent cleanup of an audio-send exception', async () => {
  const h = stack(); await h.on();
  h.sockets[0].sendBinary = () => { throw new Error('send'); };
  h.sockets[0].diagnostics = () => { throw new Error('diagnostics'); };
  h.audio(50); h.detector.setEnabled(false);
  assert.equal(h.detector.lastSessionSummary().lastErrorCategory, 'envio-audio');
  assert.equal(h.detector.lastSessionSummary().transportFailure, undefined);
  assert.equal(h.sockets[0].closed, true);
});
