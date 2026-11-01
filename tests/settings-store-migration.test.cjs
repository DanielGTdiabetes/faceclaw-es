const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function store(initial) {
  const values = { ...initial }, writes = [];
  const java = { getString: (key, fallback) => values[key] ?? fallback,
    getBoolean: (key, fallback) => values[key] ?? fallback,
    setString: (key, value) => writes.push([key, value]) };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/native/settings-store.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, com: { faceclaw: { app: { FaceclawSettings: { getInstance: () => java } } } },
    require: () => ({ Utils: {} }) });
  return { ...exports, writes, values };
}

test('0.8.2 reads legacy animation OFF without rewriting or dropping existing preferences', () => {
  for (const [oldKey, newKey] of [['display.menuAnimation', 'display.menuAnimationSpeed'], ['display.screenFade', 'display.screenFadeSpeed']]) {
    const s = store({ [oldKey]: false });
    assert.equal(s.getStringSetting(newKey, 'normal'), 'disabled');
    assert.deepEqual(s.values, { [oldKey]: false });
    assert.equal(s.writes.length, 0);
  }
});

test('explicit speed takes precedence and legacy ON keeps normal speed', () => {
  assert.equal(store({ 'display.menuAnimation': false, 'display.menuAnimationSpeed': 'fast' }).getStringSetting('display.menuAnimationSpeed', 'normal'), 'fast');
  assert.equal(store({ 'display.screenFade': true }).getStringSetting('display.screenFadeSpeed', 'normal'), 'normal');
  assert.equal(store({}).getStringSetting('display.menuAnimationSpeed', 'normal'), 'normal');
  assert.equal(store({ 'display.screenFade': false }).getStringSetting('assistant.bridgeHost', 'fallback'), 'fallback');
});
