// The actual controller render method, with synthetic display completions. No BLE or capture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(outcome, preview = false) {
  const file = ts.createSourceFile('controller.ts', fs.readFileSync('app/g2/dashboard-controller.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const cls = file.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'DashboardController');
  const method = cls.members.find(n => n.name?.getText(file) === 'renderShell').getText(file);
  let receipts = 0, paints = 0, captured = 0, submissions = 0;
  const context = { exports: {}, Date, shell: { describeInputTarget: () => '', paintScene: () => { paints++; return []; } },
    frameTimings: { startFrame: () => 1, annotateFrame() {}, finishFrame() {}, logFrame() {},
      span: (_id, _name, cb) => cb(), spanAsync: (_id, _name, cb) => cb(), runWithFrame: (_id, cb) => cb() },
    beginRenderPass() {}, endRenderPass: () => false, FRAME_TRANSMIT_BACKPRESSURE_TIMEOUT_MS: 1000,
    captureHermesPresentation: () => { captured++; return () => receipts++; },
  };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${method} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const instance = new context.exports.Harness();
  const display = { submitShellScene: async () => { submissions++; },
    waitForFrameFinished: async () => { if (outcome instanceof Error) throw outcome; return outcome; } };
  Object.assign(instance, { display, phase: 'connected', nextShellRenderWantsFreshData: false,
    isPreviewDisplayActive: () => preview, schedulePreviewUpdate() {}, requestShellRender() {} });
  return { instance, counts: () => ({ receipts, paints, captured, submissions }) };
}

test('the controller acknowledges only a completed native sent frame, never timeout/discard/preview', async () => {
  for (const outcome of ['sent', null, 'discarded: superseded', 'discarded: no change from displayed image', 'composited']) {
    const h = harness(outcome); await h.instance.renderShell();
    assert.equal(h.counts().receipts, outcome === 'sent' ? 1 : 0, String(outcome));
    assert.equal(h.counts().captured, 1);
  }
  const preview = harness('sent', true); await preview.instance.renderShell();
  assert.equal(preview.counts().receipts, 0);
  const failure = harness(Error('Synthetic transport failure'));
  await assert.rejects(failure.instance.renderShell()); assert.equal(failure.counts().receipts, 0);
});

test('no display/charging or a render encoder failure cannot acknowledge an output', async () => {
  for (const phase of ['no-display', 'charging']) {
    const h = harness('sent');
    if (phase === 'charging') h.instance.phase = 'charging'; else h.instance.display = null;
    await h.instance.renderShell(); assert.equal(h.counts().receipts, 0); assert.equal(h.counts().paints, 0);
  }
  const h = harness('sent'); h.instance.display.submitShellScene = async () => { throw Error('Synthetic encoder failure'); };
  await assert.rejects(h.instance.renderShell()); assert.equal(h.counts().receipts, 0);
});

test('switching the display target during transmission cannot acknowledge a stale presentation', async () => {
  const h = harness('sent'); h.instance.display.waitForFrameFinished = async () => { h.instance.display = null; return 'sent'; };
  await h.instance.renderShell(); assert.equal(h.counts().receipts, 0);
});
