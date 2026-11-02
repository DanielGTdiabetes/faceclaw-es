const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function accessHarness(state, android = true) {
  let watches = 0;
  const context = {};
  const service = { getListenerState: () => state, watchListenerBinding(c) { assert.equal(c, context); watches++; } };
  const sandbox = { exports: {}, global: { isAndroid: android },
    com: { faceclaw: { app: { FaceclawMediaNotificationListenerService: service } } },
    require: () => ({ Utils: { android: { getApplicationContext: () => context } } }) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/native/notification-access.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, sandbox);
  return { api: sandbox.exports, watches: () => watches };
}
test('granted but unbound listener never asks for a missing permission', () => {
  for (const state of ['connecting', 'stuck']) {
    const h = accessHarness(state);
    assert.equal(h.api.notificationListenerState(), state);
    assert.doesNotMatch(h.api.notificationEmptyMessage(), /Grant permission/);
  }
  assert.match(accessHarness('no-access').api.notificationEmptyMessage(), /Grant permission/);
  assert.match(accessHarness('connected').api.notificationEmptyMessage(), /No current/);
});
test('binding watcher starts the native watchdog only on Android', () => {
  const h = accessHarness('connecting'); h.api.watchNotificationListenerBinding();
  assert.equal(h.watches(), 1);
  const ios = accessHarness('connected', false); ios.api.watchNotificationListenerBinding();
  assert.equal(ios.watches(), 0);
});
