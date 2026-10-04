const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const controls = require('../.test-build/app/conversation-detection/session-controls.js');
const ui = require('../.test-build/app/conversation-detection/conversation-ui.js');

function harness() {
  let snapshot = { enabled: false, state: 'desactivado', reason: '', epoch: 0,
    stopReason: 'none', remainingMs: 0, participationMode: 'off' };
  let voiceModel = 'ready', textModel = 'ready', profile = 'guardado', transcript = '';
  let listener = null, reads = 0, renders = 0, yields = 0, closed = 0, options;
  const starts = [], timers = new Map();
  const session = { detector: {
    snapshot: () => snapshot, ownProfileState: () => profile,
    transcriptText: () => { reads++; return transcript; },
    subscribe(fn) { listener = fn; fn(snapshot); return () => { listener = null; }; },
  }, voiceModel: () => voiceModel, textModel: () => textModel,
    setEnabled(...args) { starts.push(args); snapshot = { ...snapshot, enabled: args[0] }; },
  };
  controls.bindConversationSession(session); controls.setConversationTextSelected(true);
  const font = { lineHeight: 21, measureText: text => [...text].length * 10, getGlyph: () => ({ dwidthX: 10 }) };
  class Image { constructor(width, height) { this.width = width; this.height = height; this.text = []; }
    drawText(font, x, y, text) { assert.ok(y >= 0 && y + font.lineHeight <= this.height, `${text} outside viewport`);
      assert.ok(x + font.measureText(text) <= this.width, `${text} too wide`); this.text.push(text); }
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/apps/local-conversation/local-conversation-app.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, setTimeout(fn, ms) { assert.equal(ms, 500); const id = {}; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }, require(name) {
      if (name === '../../graphics/image') return { GrayImage: Image };
      if (name === '../../graphics/ui-fonts') return { getDefaultSmallFont: () => font, getDefaultMediumFont: () => font };
      if (name === '../../graphics/textwrap') return require('../.test-build/app/graphics/textwrap.js');
      if (name === '../../ui/metrics') return { lineStep: f => f.lineHeight + 2 };
      if (name === '../../conversation-detection/conversation-ui') return ui;
      if (name === '../../conversation-detection/session-controls') return controls;
      if (name === '../../ui/shell/shell') return { shell: { isWindowVisible: () => true, yieldFocusToSidebar: () => yields++ } };
      if (name === '../../ui/shell/in-process-window') return { createInProcessWindow: value => {
        options = value; return { requestRender() { renders++; } }; } };
      return {};
    },
  });
  exports.createLocalConversationWindow({ onClosed: () => closed++ });
  const ctx = { stack: { getBaseSize: () => ({ width: 480, height: 264 }) } };
  return { session, starts, timers, options,
    patch(patch) { snapshot = { ...snapshot, ...patch }; listener?.(snapshot); },
    model(v, t) { voiceModel = v; textModel = t; }, profile(v) { profile = v; }, text(v) { transcript = v; },
    paint: () => options.baseLayer.paint(ctx).text.join('\n'),
    input: type => options.baseLayer.handleInput({ type }),
    poll() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); },
    counts: () => ({ reads, renders, yields, closed, subscribed: listener !== null }),
  };
}

test('launch and paint stay OFF; one explicit start uses the saved profile and shared optional text', () => {
  const h = harness(); h.paint(); assert.deepEqual(h.starts, []);
  h.model('ready', 'missing'); h.input('click'); assert.deepEqual(h.starts, []);
  h.options.menuItems()[1].onSelect({ stack: { pop() {} } });
  assert.equal(controls.conversationTextSelected(), false);
  h.input('click'); assert.deepEqual(h.starts, [[true, false, 'conversation']]);
  controls.setConversationTextSelected(true); assert.equal(controls.conversationTextSelected(), false);
  h.input('click'); assert.deepEqual(h.starts.at(-1), [false]); h.options.onClosed();
});

test('unavailable profile and draining engines never fall back or restart capture', () => {
  const h = harness(); h.profile('error'); h.input('click'); assert.equal(h.starts.length, 0);
  h.profile('guardado'); h.patch({ participation: { worker: true } }); h.input('click');
  assert.equal(h.starts.length, 0); assert.equal(h.timers.size, 1);
  h.patch({ participation: { worker: false } }); assert.equal(h.timers.size, 0);
  h.input('click'); assert.deepEqual(h.starts, [[true, true, 'conversation']]); h.options.onClosed();
});

test('lenses show only current listening text; suspension, error, expiry and OFF hide stale text', () => {
  const h = harness(); h.text('un texto provisional');
  h.patch({ enabled: true, state: 'escuchando', participationMode: 'conversation', remainingMs: 1501,
    transcription: { enabled: true }, participation: { voice: 'compatible', participation: 'conversación candidata' } });
  assert.match(h.paint(), /un texto provisional/); assert.match(h.paint(), /2 s restantes/);
  for (const patch of [{ state: 'suspendido', reason: 'Audio cedido al asistente', epoch: 1 },
    { enabled: false, state: 'error', reason: 'fallo del motor', epoch: 2 },
    { enabled: false, state: 'desactivado', stopReason: 'expired', reason: 'OFF · Tiempo agotado', epoch: 3 }]) {
    h.patch(patch); const before = h.counts().reads;
    const painted = h.paint(); assert.doesNotMatch(painted, /un texto provisional/);
    assert.equal(h.counts().reads, before);
  }
  assert.match(h.paint(), /Tiempo agotado/); h.options.onClosed();
});

test('scroll reaches earlier wrapped text without retaining it after an epoch change', () => {
  const h = harness(); h.text('primera '.repeat(45) + 'última línea');
  h.patch({ enabled: true, state: 'escuchando', remainingMs: 45000, transcription: { enabled: true } });
  assert.match(h.paint(), /última línea/);
  h.input('scroll-up'); assert.doesNotMatch(h.paint(), /última línea/);
  h.patch({ epoch: 1 }); assert.match(h.paint(), /última línea/); h.options.onClosed();
});

test('double click stops before yielding; close stops and releases subscriptions and bounded OFF polling', () => {
  const h = harness(); h.patch({ enabled: true }); h.input('double-click');
  assert.deepEqual(h.starts, [[false]]); assert.equal(h.counts().yields, 1);
  h.patch({ enabled: false, transcription: { worker: true } });
  for (let i = 0; i < 60; i++) h.poll(); assert.equal(h.timers.size, 0);
  h.patch({ transcription: { worker: true } }); h.options.onClosed();
  assert.equal(h.timers.size, 0); assert.equal(h.counts().subscribed, false); assert.equal(h.counts().closed, 1);
  const renders = h.counts().renders; controls.setConversationTextSelected(false);
  assert.equal(h.counts().renders, renders);
});

test('a stop menu retained across expiry cannot accidentally start another session', () => {
  const h = harness(); h.patch({ enabled: true });
  const stop = h.options.menuItems()[0]; h.patch({ enabled: false, stopReason: 'expired' });
  stop.onSelect({ stack: { pop() {} } });
  assert.deepEqual(h.starts, [[false]]); h.options.onClosed();
});
