const test = require('node:test');
const assert = require('node:assert/strict');
const { profileGuide, PROFILE_PHRASES } = require('../.test-build/app/conversation-detection/profile-guide.js');

function snapshot(patch = {}, participation = {}) {
  return { enabled: true, state: 'escuchando', reason: '', participationMode: 'enrollment', enrollmentOutcome: 'none',
    vad: { state: 'sin actividad' }, participation: { status: 'listo', busy: false, enrollmentSegments: 0, enrollmentMs: 0, ...participation }, ...patch };
}
test('a downloaded model is explicitly different from a saved profile', () => {
  const off = snapshot({ enabled: false, participationMode: 'off' });
  assert.match(profileGuide(off, 'sin perfil', 'ready').state, /sin crear/);
  assert.match(profileGuide(off, 'guardado', 'ready').state, /guardado/);
  assert.match(profileGuide(off, 'error', 'ready').state, /no se pudo consultar/);
  assert.equal(profileGuide(off, 'error', 'ready').progress, 0);
});
test('loading and suspended capture never tell the user to speak', () => {
  assert.match(profileGuide(snapshot({}, { status: 'cargando' }), 'sin perfil', 'ready').state, /preparando/);
  const guide = profileGuide(snapshot({ state: 'suspendido', reason: 'Gafas desconectadas' }), 'sin perfil', 'ready');
  assert.match(guide.state, /esperando las gafas/); assert.match(guide.hint, /Gafas desconectadas/);
});
test('accepted samples advance through both languages, while retries keep the same phrase', () => {
  assert.equal(PROFILE_PHRASES.filter(p => p.language === 'Castellano').length, 2);
  assert.equal(PROFILE_PHRASES.filter(p => p.language === 'Valencià').length, 2);
  for (let n = 0; n < 4; n++) {
    const guide = profileGuide(snapshot({}, { enrollmentSegments: n, enrollmentMs: n * 4000 }), 'sin perfil', 'ready');
    assert.match(guide.state, /habla ahora/);
    assert.ok(guide.phrase.includes(PROFILE_PHRASES[n].text));
    const retry = profileGuide(snapshot({}, { enrollmentSegments: n, enrollmentFeedback: 'muestra inconsistente' }), 'sin perfil', 'ready');
    assert.equal(retry.phrase, guide.phrase); assert.match(retry.hint, /Repite/);
  }
});
test('processing and saving ask for silence, and insufficient duration does not claim completion', () => {
  assert.match(profileGuide(snapshot({}, { busy: true }), 'sin perfil', 'ready').state, /procesando/);
  assert.match(profileGuide(snapshot({}, { status: 'guardando' }), 'sin perfil', 'ready').state, /guardando/);
  const short = profileGuide(snapshot({}, { enrollmentSegments: 4, enrollmentMs: 6000 }), 'sin perfil', 'ready');
  assert.equal(short.progress, 60); assert.match(short.phrase, /Una muestra más/);
});
test('OFF with an incomplete enrollment explains its terminal outcome instead of disappearing', () => {
  for (const ending of ['expired', 'canceled', 'error']) {
    const guide = profileGuide(snapshot({ enabled: false, participationMode: 'off', enrollmentOutcome: ending }), 'sin perfil', 'ready');
    assert.match(guide.state, /no guardado/); assert.equal(guide.phrase, '');
  }
});
