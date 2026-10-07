const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

// Exercise the controller's actual input route. The display barrier remains
// blocked so a regression cannot hide behind an immediately resolving mock.
function harness({ suspended = false, ready = true, resuming = false } = {}) {
  const source = ts.createSourceFile('controller.ts', fs.readFileSync(
    process.env.FACECLAW_WAKE_SOURCE || 'app/g2/dashboard-controller.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const controller = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'DashboardController');
  const method = controller.members.find(node => node.name?.getText(source) === 'handleInputEvent').getText(source);
  const received = [], priorities = [], probes = [];
  let finishDisplay, screenOn = false, instance;
  const display = new Promise(resolve => { finishDisplay = resolve; });
  const context = { exports: {}, global: { isAndroid: true },
    rawInputEventToInputEvent: () => ({ type: 'wakeword' }), acceptInput: () => true,
    eventLabel: () => 'wakeword', wakeWordActionSetting: { get: () => 'voice-input' },
    EvenAIStatus: { EVEN_AI_WAKE_UP: 1 }, EventSourceType: {}, OsEventTypeList: {},
    voiceControlBridge: { setAudioPriority: (...args) => priorities.push(args) },
    frameTimings: { logFrame() {}, annotateFrame() {}, spanStart() {}, spanEnd() {}, finishFrame() {},
      spanAsync: (_id, _name, operation) => operation() },
    shell: { describeInputTarget: () => 'screen-off', isScreenOn: () => screenOn,
      wake() { screenOn = true; instance.evenHubResumePromise = display; return true; },
      async receiveInput(input) { received.push(input); return { shell: true, window: false }; } },
  };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${method} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  instance = new context.exports.Harness();
  Object.assign(instance, { phase: 'connected', glassesLocked: false,
    evenHubSessionSuspended: suspended, evenHubResumePromise: resuming ? display : null,
    communicator: { async awaitEvenHubSessionReady(timeout) { probes.push(timeout); return ready; } },
    glanceEventFor: () => null, ensureEvenHubSessionActive: () => display,
    requestShellRender() {}, appendLog() {} });
  const handling = instance.handleInputEvent({ kind: 'even-ai', eventType: 1, eventSource: 0, frameId: 1 });
  return { received, priorities, probes, handling, finishDisplay,
    async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); } };
}

test('retained ready session starts wakeword capture before the display frame finishes', async () => {
  const h = harness(); await h.settle();
  assert.equal(h.received.length, 1, 'warm microphone must not wait for unblank/display ACK');
  assert.deepEqual(h.probes, [0]);
  await h.handling;
  assert.deepEqual(h.priorities, [['wake-event', true], ['wake-event', false]]);
  h.finishDisplay(true);
});

for (const [label, options] of [
  ['suspended', { suspended: true }], ['unfinished layout', { ready: false }],
  ['already resuming', { resuming: true }],
]) {
  test(`${label} session still waits for the full barrier before capture`, async () => {
    const h = harness(options); await h.settle();
    assert.equal(h.received.length, 0);
    h.finishDisplay(true); await h.handling;
    assert.equal(h.received.length, 1);
    assert.deepEqual(h.priorities, [['wake-event', true], ['wake-event', false]]);
  });
}
