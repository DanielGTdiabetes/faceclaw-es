// The actual controller render method, with synthetic display completions. No BLE or capture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(outcome, preview = false) {
  const file = ts.createSourceFile('controller.ts', fs.readFileSync('app/g2/dashboard-controller.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const cls = file.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'DashboardController');
  const method = cls.members.filter(n => ['renderShell', 'traceScreen'].includes(n.name?.getText(file)))
    .map(n => n.getText(file)).join('\n');
  let receipts = 0, notices = 0, paints = 0, captured = 0, submissions = 0;
  let frameOpen = true;
  const traces = [], frameLogs = [];
  const context = { exports: {}, Date, shell: { describeInputTarget: () => '', paintScene: () => { paints++; return []; } },
    android: { util: { Log: { i: (tag, value) => traces.push({ tag, ...JSON.parse(value) }) } } },
    frameTimings: { startFrame: () => 1, annotateFrame() {}, finishFrame() {},
      logFrame(_id, line) { if (frameOpen) frameLogs.push(line); },
      span: (_id, _name, cb) => cb(), spanAsync: (_id, _name, cb) => cb(), runWithFrame: (_id, cb) => cb() },
    beginRenderPass() {}, endRenderPass: () => false, FRAME_TRANSMIT_BACKPRESSURE_TIMEOUT_MS: 1000,
    captureHermesPresentation: () => { captured++; return () => receipts++; },
    captureNotificationPresentation: () => () => notices++,
  };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${method} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const instance = new context.exports.Harness();
  const display = { submitShellScene: async () => { submissions++; },
    waitForFrameFinished: async () => { frameOpen = false; if (outcome instanceof Error) throw outcome; return outcome; } };
  Object.assign(instance, { display, phase: 'connected', nextShellRenderWantsFreshData: false,
    isPreviewDisplayActive: () => preview, schedulePreviewUpdate() {}, requestShellRender() {} });
  return { instance, traces, frameLogs, counts: () => ({ receipts, notices, paints, captured, submissions }) };
}

test('presentation completion diagnostics survive a closed native frame and record an unsuccessful wake barrier', async () => {
  const h = harness('sent');
  h.instance.evenHubResumePromise = Promise.resolve(false);
  await h.instance.renderShell();
  assert.ok(h.traces.some(e => e.event === 'hermes-frame' && e.frameId === 1 && e.outcome === 'sent' && e.captured));
  assert.ok(h.traces.some(e => e.event === 'hermes-wake' && e.frameId === 1 && !e.ready));
  assert.equal(h.counts().receipts, 0);
  assert.equal(h.frameLogs.some(line => line.includes('waits for the wake barrier')), false,
    'the native frame has already closed, so completion evidence must use logcat');
});

test('the controller acknowledges only a completed native sent frame, never timeout/discard/preview', async () => {
  for (const outcome of ['sent', null, 'discarded: superseded', 'discarded: no change from displayed image', 'composited']) {
    const h = harness(outcome); await h.instance.renderShell();
    assert.equal(h.counts().receipts, outcome === 'sent' ? 1 : 0, String(outcome));
    assert.equal(h.counts().notices, outcome === 'sent' ? 1 : 0, String(outcome));
    assert.equal(h.counts().captured, 1);
  }
  const preview = harness('sent', true); await preview.instance.renderShell();
  assert.equal(preview.counts().receipts, 0);
  assert.equal(preview.counts().notices, 0);
  const failure = harness(Error('Synthetic transport failure'));
  await assert.rejects(failure.instance.renderShell()); assert.equal(failure.counts().receipts, 0); assert.equal(failure.counts().notices, 0);
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
