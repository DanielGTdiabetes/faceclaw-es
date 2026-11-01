// The real lens presenter (app/ui/shell/notification-delivery.ts) against a synthetic shell. No BLE.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ busy = false, refuse = false } = {}) {
  const timers = [];
  const shell = {
    overlay: busy ? { layer: 'conversation' } : null, screenOn: true, retired: [],
    hasIndependentOverlay() { return this.overlay !== null; },
    presentIndependentOverlay(layer, onYield) {
      if (refuse) return null;
      this.overlay = { layer, onYield }; return { woke: true };
    },
    isIndependentOverlayVisible(layer) { return this.screenOn && this.overlay?.layer === layer; },
    retireIndependentOverlay(layer, restoreSleep) {
      if (this.overlay?.layer === layer) this.overlay = null;
      this.retired.push({ layer, restoreSleep });
    },
    yieldOverlay() { const current = this.overlay; this.overlay = null; current.onYield(); },
  };
  class HermesContributionLayer {
    constructor(text, hooks) { this.text = text; this.hooks = hooks; this.isRetiredFlag = false; }
    retire() { this.isRetiredFlag = true; }
  }
  const modules = { './conversation-hermes-layer': { HermesContributionLayer }, './shell': { shell } };
  const context = { exports: {}, require: (name) => modules[name],
    setTimeout: (cb, ms) => { const t = { cb, ms, cleared: false }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cleared = true; } };
  const source = fs.readFileSync('app/ui/shell/notification-delivery.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const fire = () => timers.filter(t => !t.cleared).forEach(t => { t.cleared = true; t.cb(); });
  return { api: context.exports, shell, timers, fire };
}

test('a visible notification is confirmed once, only through the captured frame receipt', () => {
  const h = harness(); let confirmed = 0;
  const close = h.api.presentHermesNotification('Aviso', () => confirmed++);
  assert.equal(typeof close, 'function');
  assert.equal(h.shell.overlay.layer.text(), 'Aviso');
  const receipt = h.api.captureNotificationPresentation();
  assert.equal(confirmed, 0);
  receipt(); receipt();
  assert.equal(confirmed, 1);
  assert.equal(h.api.captureNotificationPresentation(), null, 'already confirmed');
  close();
});

test('never displaces a conversation contribution or a refused/explicit display', () => {
  assert.equal(harness({ busy: true }).api.presentHermesNotification('Aviso', () => {}), null);
  const refused = harness({ refuse: true });
  assert.equal(refused.api.presentHermesNotification('Aviso', () => {}), null);
  assert.equal(refused.api.captureNotificationPresentation(), null);
  const h = harness();
  h.api.presentHermesNotification('Uno', () => {});
  assert.equal(h.api.presentHermesNotification('Dos', () => {}), null, 'one notification at a time');
});

test('a frame captured before cancel, timeout, yield or sleep cannot confirm', () => {
  for (const mode of ['cancel', 'timeout', 'yield', 'sleep']) {
    const h = harness(); let confirmed = 0;
    const close = h.api.presentHermesNotification('Aviso', () => confirmed++);
    const receipt = h.api.captureNotificationPresentation();
    if (mode === 'cancel') close();
    else if (mode === 'timeout') { assert.equal(h.timers[0].ms, 12_000); h.fire(); }
    else if (mode === 'yield') h.shell.yieldOverlay();
    else h.shell.screenOn = false;
    receipt();
    assert.equal(confirmed, 0, mode);
    if (mode !== 'sleep') {
      assert.equal(h.shell.overlay, null, mode);
      // The slot is free again for the next notice.
      assert.equal(typeof h.api.presentHermesNotification('Otro', () => {}), 'function', mode);
    }
  }
});

test('closing restores sleep only when the notification woke the lenses', () => {
  const h = harness();
  const close = h.api.presentHermesNotification('Aviso', () => {});
  const layer = h.shell.overlay.layer;
  close(); close();
  assert.deepEqual(h.shell.retired, [{ layer, restoreSleep: true }]);
  assert.equal(layer.isRetiredFlag, true);
});
