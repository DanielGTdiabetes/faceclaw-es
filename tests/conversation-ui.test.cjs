const test = require('node:test');
const assert = require('node:assert/strict');
const { conversationStartPlan, conversationDetail } = require('../.test-build/app/conversation-detection/conversation-ui.js');

const off = { enabled: false, state: 'desactivado', reason: '', stopReason: 'none', remainingMs: 0 };
const plan = (patch = {}, profile = 'guardado', voice = 'ready', text = 'ready', withText = true) =>
  conversationStartPlan({ ...off, ...patch }, profile, voice, text, withText);

test('the saved profile works without ASR weights when text is disabled', () => {
  const result = plan({}, 'guardado', 'ready', 'missing', false);
  assert.equal(result.canStart, true);
  assert.equal(result.mode, 'conversation');
  assert.equal(result.transcribe, false);
  assert.match(result.hint, /sin transcripción/);
  assert.equal(plan({}, 'guardado', 'ready', 'missing', true).canStart, false);
});

test('failed profile query and missing comparison weights never silently start without comparison', () => {
  for (const profile of ['error', 'no disponible']) assert.equal(plan({}, profile).canStart, false);
  for (const model of ['missing', 'downloading', 'error']) {
    const result = plan({}, 'guardado', model);
    assert.equal(result.canStart, false);
    assert.match(result.hint, /no repitas su registro/);
  }
  assert.equal(plan({}, 'sin perfil').mode, 'off');
});

test('OFF with either worker draining blocks a restart and says the profile is preserved', () => {
  for (const engine of ['participation', 'transcription']) {
    for (const field of ['worker', 'busy']) {
      const result = plan({ [engine]: { [field]: true } });
      assert.equal(result.canStart, false);
      assert.match(result.hint, /Captura OFF/);
      assert.match(result.hint, /perfil se conserva/);
    }
  }
  assert.equal(plan().canStart, true);
});

test('an active session always exposes OFF even if a model/profile query is unavailable', () => {
  const result = plan({ enabled: true, reason: 'cedido' }, 'error', 'error', 'error');
  assert.equal(result.button, 'Detener (OFF)');
});

test('candidate evidence remains provisional and waiting time counts towards the deadline', () => {
  const candidate = { ...off, enabled: true, state: 'escuchando', participationMode: 'conversation', remainingMs: 1501,
    participation: { voice: 'compatible con mi perfil', participation: 'conversación candidata' } };
  const detail = conversationDetail(candidate, '');
  assert.match(detail, /conversación candidata/);
  assert.match(detail, /indicio provisional/);
  assert.match(detail, /2 s restantes/);
  const suspended = conversationDetail({ ...candidate, state: 'suspendido', reason: 'Audio cedido al asistente' }, '');
  assert.match(suspended, /Audio cedido/);
  assert.doesNotMatch(suspended, /conversación candidata/);
  // Views with their own deadline line (lenses) omit it; the phone default keeps it.
  assert.doesNotMatch(conversationDetail(candidate, '', false), /restantes/);
  assert.match(conversationDetail({ ...candidate, state: 'suspendido', reason: 'Audio cedido al asistente' }, '', false), /^Audio cedido al asistente$/);
});

test('expired and failed sessions retain their cause after OFF', () => {
  assert.match(conversationDetail({ ...off, stopReason: 'expired', reason: 'OFF · Tiempo agotado' }, 'perfil guardado'), /Tiempo agotado/);
  assert.match(conversationDetail({ ...off, state: 'error', reason: 'perfil incompatible' }, 'perfil guardado'), /OFF · Error: perfil incompatible/);
});
